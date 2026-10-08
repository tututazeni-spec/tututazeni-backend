// ─── src/leave-management/leave-approvals.service.ts ─────────────────────────
// Aba Aprovações (docs/Modulo_Leave.md §7): fila e histórico de decisões por
// etapa (LeaveApproval), com prazo, estado de espera e histórico de
// reatribuições. A decisão em si continua em LeaveManagementService
// (processApproval), para o saldo ter um único ponto de contabilização.
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/services/audit.service';
import { CurrentUserData } from '../common/types/current-user';
import { isPrivileged } from '../common/authz/ownership';
import { buildPaginatedResponse } from '../common/helpers/pagination.helper';
import { createNotificationSafe } from '../common/helpers/notification.helper';
import { Role } from '../auth/enums/role.enum';
import {
  ApprovalListFilterDto,
  ApprovalListStatus,
  LeaveStatus,
  ReassignApprovalDto,
} from './leave-management.dto';
import { canSeeSensitive, ORG_WIDE_ROLES } from './leave-scope.helper';

const APPROVER_ROLE_CODES = [Role.ADMIN, Role.RH, Role.GESTOR];

export type ApprovalState = 'WAITING' | 'PENDING' | 'OVERDUE' | 'APPROVED' | 'REJECTED' | 'OTHER';

export function approvalStateOf(
  a: { decision: string | null; decidedAt: Date | null; dueAt: Date | null },
  blocked: boolean,
  now: Date,
): ApprovalState {
  if (a.decidedAt) {
    if (a.decision === 'APPROVE') return 'APPROVED';
    if (a.decision === 'REJECT') return 'REJECTED';
    return 'OTHER';
  }
  if (blocked) return 'WAITING';
  return a.dueAt && a.dueAt < now ? 'OVERDUE' : 'PENDING';
}

@Injectable()
export class LeaveApprovalsService {
  private readonly logger = new Logger(LeaveApprovalsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Etapas de aprovação visíveis ao utilizador: ADMIN/RH vêem todas; os
   * restantes aprovadores só as que lhes foram atribuídas.
   */
  async list(filters: ApprovalListFilterDto, viewer: CurrentUserData) {
    const page = filters.page ?? 1;
    const limit = filters.limit ?? 20;
    const now = new Date();
    const orgWide = isPrivileged(viewer, ORG_WIDE_ROLES);
    const status = filters.status ?? ApprovalListStatus.PENDING;

    const and: Prisma.LeaveApprovalWhereInput[] = [];
    if (!orgWide) and.push({ approverId: viewer.id });
    if (filters.stage) and.push({ stage: filters.stage });
    if (filters.leaveTypeCode) and.push({ request: { leaveTypeCode: filters.leaveTypeCode } });
    if (filters.search) {
      and.push({
        request: { user: { fullName: { contains: filters.search, mode: 'insensitive' } } },
      });
    }
    if (status === ApprovalListStatus.DECIDED) {
      and.push({ decidedAt: { not: null } });
    } else if (status === ApprovalListStatus.PENDING) {
      and.push({ decidedAt: null, request: { status: LeaveStatus.PENDING } });
    } else if (status === ApprovalListStatus.OVERDUE) {
      and.push({ decidedAt: null, dueAt: { lt: now }, request: { status: LeaveStatus.PENDING } });
    }
    const where: Prisma.LeaveApprovalWhereInput = and.length ? { AND: and } : {};

    const [rows, total, pendingCount, overdueCount] = await Promise.all([
      this.prisma.read.leaveApproval.findMany({
        where,
        orderBy:
          status === ApprovalListStatus.DECIDED
            ? [{ decidedAt: 'desc' }, { id: 'desc' }]
            : [{ dueAt: 'asc' }, { id: 'asc' }],
        skip: (page - 1) * limit,
        take: limit,
        include: {
          approver: { select: { id: true, fullName: true } },
          reassignments: { orderBy: { createdAt: 'asc' } },
          request: {
            select: {
              id: true,
              userId: true,
              leaveTypeCode: true,
              startDate: true,
              endDate: true,
              workDays: true,
              status: true,
              createdAt: true,
              user: {
                select: {
                  id: true,
                  fullName: true,
                  department: { select: { id: true, name: true } },
                },
              },
              approvals: { select: { id: true, level: true, decidedAt: true } },
            },
          },
        },
      }),
      this.prisma.read.leaveApproval.count({ where }),
      this.prisma.read.leaveApproval.count({
        where: {
          ...(orgWide ? {} : { approverId: viewer.id }),
          decidedAt: null,
          request: { status: LeaveStatus.PENDING },
        },
      }),
      this.prisma.read.leaveApproval.count({
        where: {
          ...(orgWide ? {} : { approverId: viewer.id }),
          decidedAt: null,
          dueAt: { lt: now },
          request: { status: LeaveStatus.PENDING },
        },
      }),
    ]);

    const types = await this.prisma.read.leaveTypeConfig.findMany({
      select: { code: true, name: true, color: true, isSensitive: true },
    });
    const typeByCode = new Map(types.map(t => [t.code, t]));

    const userIds = new Set<number>();
    rows.forEach(r =>
      r.reassignments.forEach(h =>
        [h.fromApproverId, h.toApproverId, h.byUserId].forEach(i => userIds.add(i)),
      ),
    );
    const names = userIds.size
      ? await this.prisma.read.user.findMany({
          where: { id: { in: [...userIds] } },
          select: { id: true, fullName: true },
        })
      : [];
    const nameOf = new Map(names.map(n => [n.id, n.fullName]));

    const data = rows.map(a => {
      const t = typeByCode.get(a.request.leaveTypeCode);
      const blocked = a.request.approvals.some(o => o.level < a.level && o.decidedAt === null);
      // Tipos sensíveis: quem não é o titular nem ADMIN/RH vê só "Indisponível"
      // — o gestor decide sobre a ausência, não precisa do detalhe clínico.
      const hideType = !!t?.isSensitive && !canSeeSensitive(viewer, a.request.userId);
      return {
        id: a.id,
        requestId: a.requestId,
        stage: a.stage,
        level: a.level,
        state: approvalStateOf(a, blocked, now),
        approver: a.approver,
        assignedAt: a.createdAt,
        dueAt: a.dueAt,
        decision: a.decision,
        notes: a.notes,
        decidedAt: a.decidedAt,
        canAct:
          a.decidedAt === null &&
          !blocked &&
          a.request.status === LeaveStatus.PENDING &&
          a.approverId === viewer.id,
        canReassign:
          a.decidedAt === null &&
          a.request.status === LeaveStatus.PENDING &&
          (orgWide || a.approverId === viewer.id),
        request: {
          id: a.request.id,
          status: a.request.status,
          submittedAt: a.request.createdAt,
          startDate: a.request.startDate,
          endDate: a.request.endDate,
          workDays: a.request.workDays,
          user: a.request.user,
          type: hideType
            ? { code: 'UNAVAILABLE', name: 'Indisponível', color: '#94A3B8' }
            : {
                code: a.request.leaveTypeCode,
                name: t?.name ?? a.request.leaveTypeCode,
                color: t?.color ?? null,
              },
        },
        reassignments: a.reassignments.map(h => ({
          id: h.id,
          kind: h.kind,
          from: { id: h.fromApproverId, fullName: nameOf.get(h.fromApproverId) ?? null },
          to: { id: h.toApproverId, fullName: nameOf.get(h.toApproverId) ?? null },
          by: { id: h.byUserId, fullName: nameOf.get(h.byUserId) ?? null },
          reason: h.reason,
          createdAt: h.createdAt,
        })),
      };
    });

    return {
      ...buildPaginatedResponse(data, total, page, limit),
      summary: { pending: pendingCount, overdue: overdueCount },
    };
  }

  /** ADMIN/RH (qualquer etapa) ou o aprovador actual reatribuem a etapa a outro aprovador. */
  async reassign(approvalId: number, dto: ReassignApprovalDto, viewer: CurrentUserData) {
    const approval = await this.prisma.read.leaveApproval.findUnique({
      where: { id: approvalId },
      include: { request: { select: { id: true, status: true, userId: true } } },
    });
    if (!approval) throw new NotFoundException('Aprovação não encontrada');
    const orgWide = isPrivileged(viewer, ORG_WIDE_ROLES);
    if (!orgWide && approval.approverId !== viewer.id) {
      throw new ForbiddenException('Sem permissão para reatribuir esta aprovação');
    }
    if (approval.decidedAt || approval.request.status !== LeaveStatus.PENDING) {
      throw new BadRequestException('Só é possível reatribuir etapas ainda por decidir');
    }
    if (dto.toApproverId === approval.approverId) {
      throw new BadRequestException('O novo aprovador tem de ser outro utilizador');
    }
    if (dto.toApproverId === approval.request.userId) {
      throw new BadRequestException('O requerente não pode aprovar o próprio pedido');
    }
    const target = await this.prisma.read.user.findUnique({
      where: { id: dto.toApproverId },
      select: { id: true, role: { select: { code: true } } },
    });
    if (!target) throw new NotFoundException('Utilizador não encontrado');
    if (!APPROVER_ROLE_CODES.includes(target.role?.code as Role)) {
      throw new BadRequestException('O novo aprovador não tem perfil de aprovação');
    }

    await this.prisma.leaveApprovalReassignment.create({
      data: {
        approvalId,
        fromApproverId: approval.approverId,
        toApproverId: dto.toApproverId,
        byUserId: viewer.id,
        kind: 'REASSIGN',
        reason: dto.reason?.trim() || null,
      },
    });
    const updated = await this.prisma.leaveApproval.update({
      where: { id: approvalId },
      data: { approverId: dto.toApproverId },
    });
    await createNotificationSafe(this.prisma, this.logger, {
      userId: dto.toApproverId,
      type: 'LEAVE_PENDING_APPROVAL',
      title: 'Aprovação de licença reatribuída',
      message: 'Foi-lhe reatribuída a aprovação de um pedido de licença',
    });
    await this.audit.log({
      action: 'LEAVE_APPROVAL_REASSIGNED',
      entityType: 'LeaveRequest',
      entityId: approval.requestId,
      userId: viewer.id,
      metadata: { approvalId, from: approval.approverId, to: dto.toApproverId },
    });
    return updated;
  }

  /** Utilizadores com perfil para receber uma reatribuição/delegação. */
  async candidates(search: string | undefined, viewer: CurrentUserData) {
    void viewer;
    return this.prisma.read.user.findMany({
      where: {
        role: { code: { in: APPROVER_ROLE_CODES } },
        hrStatus: { not: 'TERMINATED' },
        ...(search ? { fullName: { contains: search, mode: 'insensitive' } } : {}),
      },
      select: { id: true, fullName: true, role: { select: { code: true } } },
      orderBy: { fullName: 'asc' },
      take: 30,
    });
  }
}
