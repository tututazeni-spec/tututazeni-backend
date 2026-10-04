// ─── src/leave-management/leave-licenses.service.ts ──────────────────────────
// Aba Licenças (docs/Modulo_Leave.md §4): tabela de licenças com privacidade
// por perfil e pré-visualização do encaminhamento de aprovação. Só leitura —
// a submissão continua em LeaveManagementService.create(), para o saldo e as
// aprovações terem um único ponto de escrita.
import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CurrentUserData } from '../common/types/current-user';
import { buildPaginatedResponse } from '../common/helpers/pagination.helper';
import { isPrivileged } from '../common/authz/ownership';
import {
  ApprovalRouteDto,
  LeaveStatus,
  LicenseFilterDto,
  LicensePhase,
} from './leave-management.dto';
import { LeaveManagementService } from './leave-management.service';
import { VACATION_CODE } from './leave-overview.service';
import { canSeeSensitive, leaveUserFilter, ORG_WIDE_ROLES } from './leave-scope.helper';

export type PayRegime = 'PAID' | 'UNPAID' | 'TO_VALIDATE';

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

/** Estado do pedido + "em curso"/"concluída" derivados das datas. */
export function licensePhase(
  status: string,
  startDate: Date,
  endDate: Date,
  today: Date,
): LicensePhase {
  if (status === LeaveStatus.APPROVED) {
    if (endDate < today) return LicensePhase.COMPLETED;
    if (startDate <= today) return LicensePhase.IN_PROGRESS;
    return LicensePhase.APPROVED;
  }
  return status as LicensePhase;
}

export function payRegimeOf(type: {
  isPaid: boolean;
  requiresPayrollValidation: boolean;
}): PayRegime {
  if (!type.isPaid) return 'UNPAID';
  return type.requiresPayrollValidation ? 'TO_VALIDATE' : 'PAID';
}

@Injectable()
export class LeaveLicensesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly leave: LeaveManagementService,
  ) {}

  private phaseWhere(phase: LicensePhase, today: Date): Prisma.LeaveRequestWhereInput {
    switch (phase) {
      case LicensePhase.APPROVED:
        return { status: LeaveStatus.APPROVED, startDate: { gt: today } };
      case LicensePhase.IN_PROGRESS:
        return { status: LeaveStatus.APPROVED, startDate: { lte: today }, endDate: { gte: today } };
      case LicensePhase.COMPLETED:
        return { status: LeaveStatus.APPROVED, endDate: { lt: today } };
      default:
        return { status: phase as unknown as LeaveStatus };
    }
  }

  async list(filters: LicenseFilterDto, viewer: CurrentUserData) {
    const page = filters.page ?? 1;
    const limit = filters.limit ?? 20;
    const today = startOfDay(new Date());
    const canSeePayroll = isPrivileged(viewer, ORG_WIDE_ROLES);

    const and: Prisma.LeaveRequestWhereInput[] = [
      { user: leaveUserFilter(viewer, filters) },
      { leaveTypeCode: filters.leaveTypeCode ?? { not: VACATION_CODE } },
      // Rascunhos só são visíveis a quem os criou e ao titular.
      {
        OR: [
          { status: { not: LeaveStatus.DRAFT } },
          { userId: viewer.id },
          { createdById: viewer.id },
        ],
      },
    ];
    if (filters.phase) and.push(this.phaseWhere(filters.phase, today));
    if (filters.from) and.push({ endDate: { gte: new Date(filters.from) } });
    if (filters.to) and.push({ startDate: { lte: new Date(filters.to) } });
    if (filters.search) {
      and.push({
        user: {
          OR: [
            { fullName: { contains: filters.search, mode: 'insensitive' } },
            { employeeNumber: { contains: filters.search, mode: 'insensitive' } },
          ],
        },
      });
    }
    const where: Prisma.LeaveRequestWhereInput = { AND: and };

    const [rows, total, types] = await Promise.all([
      this.prisma.read.leaveRequest.findMany({
        where,
        orderBy: [{ startDate: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
        include: {
          user: {
            select: {
              id: true,
              fullName: true,
              employeeNumber: true,
              department: { select: { id: true, name: true } },
            },
          },
          approvals: {
            orderBy: { level: 'asc' },
            include: { approver: { select: { id: true, fullName: true } } },
          },
          documents: {
            select: { id: true, name: true, mimeType: true, fileUrl: true, isSensitive: true },
          },
        },
      }),
      this.prisma.read.leaveRequest.count({ where }),
      this.prisma.read.leaveTypeConfig.findMany(),
    ]);

    const typeByCode = new Map(types.map(t => [t.code, t]));
    const creatorIds = [
      ...new Set(rows.map(r => r.createdById).filter((id): id is number => !!id)),
    ];
    const creators = creatorIds.length
      ? await this.prisma.read.user.findMany({
          where: { id: { in: creatorIds } },
          select: { id: true, fullName: true },
        })
      : [];
    const creatorName = new Map(creators.map(c => [c.id, c.fullName]));

    const data = rows.map(r => {
      const type = typeByCode.get(r.leaveTypeCode);
      const sensitive = !!type?.isSensitive;
      const allowed = !sensitive || canSeeSensitive(viewer, r.userId);
      const pendingApproval = r.approvals.find(a => a.decidedAt === null);
      const lastDecided = [...r.approvals].reverse().find(a => a.decidedAt !== null);
      const approver = (pendingApproval ?? lastDecided)?.approver ?? null;
      const phase = licensePhase(r.status, r.startDate, r.endDate, today);
      const isOwnerOrOrg = viewer.id === r.userId || canSeePayroll;
      return {
        id: r.id,
        user: r.user,
        leaveTypeCode: r.leaveTypeCode,
        type: type
          ? {
              code: type.code,
              name: type.name,
              color: type.color,
              isPaid: type.isPaid,
              isSensitive: sensitive,
              requiresDocument: type.requiresDocument,
            }
          : { code: r.leaveTypeCode, name: r.leaveTypeCode, color: null },
        startDate: r.startDate,
        endDate: r.endDate,
        startTime: r.startTime,
        endTime: r.endTime,
        durationMode: r.durationMode,
        workDays: r.workDays,
        hours: r.hours,
        calendarDays: r.calendarDays,
        payRegime: type ? payRegimeOf(type) : ('TO_VALIDATE' as PayRegime),
        // O motivo e os comprovativos de tipos sensíveis ficam ocultos para
        // quem não é o titular nem ADMIN/RH — o gestor vê só que existe.
        reason: allowed ? r.reason : null,
        hasDocument: r.documents.length > 0,
        documents: allowed
          ? r.documents.map(d => ({
              id: d.id,
              name: d.name,
              mimeType: d.mimeType,
              fileUrl: d.fileUrl,
            }))
          : [],
        submittedAt: r.createdAt,
        approver,
        status: r.status,
        phase,
        registeredBy:
          r.createdById && r.createdById !== r.userId
            ? { id: r.createdById, fullName: creatorName.get(r.createdById) ?? null }
            : null,
        canCancel:
          isOwnerOrOrg &&
          [LeaveStatus.DRAFT, LeaveStatus.PENDING, LeaveStatus.APPROVED].includes(
            r.status as LeaveStatus,
          ) &&
          phase !== LicensePhase.COMPLETED,
        // Impacto salarial: apenas perfis autorizados (ADMIN/RH).
        payrollImpact: canSeePayroll
          ? type && (!type.isPaid || type.requiresPayrollValidation)
            ? 'VALIDATION_REQUIRED'
            : 'NONE'
          : undefined,
      };
    });

    return buildPaginatedResponse(data, total, page, limit);
  }

  /**
   * Para onde o pedido vai ser encaminhado — mesma regra de
   * LeaveManagementService.createApprovalFlow (gestor directo e, com 2+
   * níveis na política, o RH), calculada antes da submissão.
   */
  async approvalRoute(dto: ApprovalRouteDto, viewer: CurrentUserData) {
    const targetId = dto.userId ?? viewer.id;
    if (targetId !== viewer.id) {
      const inScope = await this.prisma.read.user.count({
        where: leaveUserFilter(viewer, { userId: targetId }),
      });
      if (!inScope) throw new NotFoundException('Recurso não encontrado');
    }
    const type = await this.prisma.read.leaveTypeConfig.findUnique({
      where: { code: dto.leaveTypeCode },
    });
    if (!type) throw new NotFoundException(`Tipo de licença "${dto.leaveTypeCode}" não encontrado`);

    const autoApprove =
      type.autoApprove &&
      dto.workDays !== undefined &&
      dto.workDays <= (type.autoApproveUnderDays ?? 1);
    if (autoApprove) return { autoApprove: true, steps: [] };

    const [target, policy] = await Promise.all([
      this.prisma.read.user.findUnique({
        where: { id: targetId },
        select: { manager: { select: { id: true, fullName: true } } },
      }),
      this.leave.getApplicablePolicy(targetId),
    ]);

    const steps: Array<{
      level: number;
      role: 'GESTOR' | 'RH';
      approver: { id: number; fullName: string };
    }> = [];
    if (target?.manager) steps.push({ level: 1, role: 'GESTOR', approver: target.manager });
    if ((policy?.approvalLevels ?? 1) >= 2) {
      const hr = await this.prisma.read.user.findFirst({
        where: { role: { code: 'RH' } },
        select: { id: true, fullName: true },
      });
      if (hr) steps.push({ level: 2, role: 'RH', approver: hr });
    }
    return { autoApprove: false, steps };
  }
}
