// ─── src/leave-management/leave-management.service.ts ────────────────────────
import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { LeaveDecision, LeaveType, Prisma } from '@prisma/client';
import { AuditService } from '../common/services/audit.service';
import { assertCanAccess, isPrivileged } from '../common/authz/ownership';
import { Role } from '../auth/enums/role.enum';
import { CurrentUserData } from '../common/types/current-user';
import { calculatePagination, buildPaginatedResponse } from '../common/helpers/pagination.helper';
import { createNotificationSafe } from '../common/helpers/notification.helper';
import {
  LeaveFilterDto,
  CalendarFilterDto,
  CreateLeaveTypeDto,
  UpdateLeaveTypeDto,
  CreateLeaveManagementRequestDto,
  ApproveLeaveDto,
  BulkApproveDto,
  UpdateBalanceDto,
  AccrueBalanceDto,
  CreateLeavePolicyDto,
  BlackoutPeriodDto,
  LeaveStatus,
  ApprovalAction,
  DurationMode,
} from './leave-management.dto';
import { countWorkDays, countCalendarDays } from './leave-calendar.helper';
import { canSeeSensitive } from './leave-scope.helper';
import { LeaveSettingsService } from './leave-settings.service';
import { LeaveEffectsService } from './leave-effects.service';
import { LeaveSettings } from './leave-settings.dto';
import { VACATION_CODE } from './leave-overview.service';

// ─── Helpers ──────────────────────────────────────────────────────────────────

// Ver project-innova-leave-type-enum-mismatch: LeaveTypeConfig.code é livre
// (admin pode criar "SICK_SHORT", etc.), mas o enum fixo `LeaveType` só tem
// 10 valores. `leaveTypeCode` é agora a chave real usada em todo este
// ficheiro; `leaveType` fica best-effort — só preenchido quando o código
// coincide literalmente com um dos 10 membros do enum, para manter leitores
// antigos a funcionar sem voltar a rebentar em códigos customizados.
const LEAVE_TYPE_ENUM_VALUES = new Set<string>(Object.values(LeaveType));

function timeToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

/** `LV-2026-000123` — legível para o colaborador, único por pedido. */
export function formatRequestNumber(id: number, createdAt: Date): string {
  return `LV-${createdAt.getFullYear()}-${String(id).padStart(6, '0')}`;
}

/** O dia `mmdd` (MM-DD) cai dentro da janela [start, end], que pode atravessar o fim do ano. */
export function inMonthDayWindow(mmdd: string, start: string, end: string): boolean {
  return start <= end ? mmdd >= start && mmdd <= end : mmdd >= start || mmdd <= end;
}

function toLeaveTypeEnum(code: string): LeaveType | null {
  return LEAVE_TYPE_ENUM_VALUES.has(code) ? (code as LeaveType) : null;
}

// ─────────────────────────────────────────────────────────────────────────────

@Injectable()
export class LeaveManagementService {
  private readonly logger = new Logger(LeaveManagementService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly settings: LeaveSettingsService,
    private readonly effects: LeaveEffectsService,
  ) {}

  // ══════════════════════════════════════════════════════════════════
  // LEAVE TYPES
  // ══════════════════════════════════════════════════════════════════

  // requiresApproval/requiresDocument/allowHalfDay/affectsSalary/
  // salaryDeductionPercent/carryOverExpiryDays existem no DTO mas nunca
  // foram migrados para LeaveTypeConfig — enviá-los ao Prisma tal-qual
  // rebentava sempre ("Unknown argument"), por isso createLeaveType()/
  // updateLeaveType() nunca tinham funcionado. Só os campos reais do
  // modelo são persistidos abaixo.
  async createLeaveType(dto: CreateLeaveTypeDto) {
    const exists = await this.prisma.leaveTypeConfig.findUnique({
      where: { code: dto.code },
    });
    if (exists) throw new ConflictException(`Tipo de licença "${dto.code}" já existe`);
    const data: Prisma.LeaveTypeConfigCreateInput = {
      code: dto.code,
      name: dto.name,
      description: dto.description,
      category: dto.category,
      isPaid: dto.isPaid,
      annualLimit: dto.annualLimit,
      maxConsecutiveDays: dto.maxConsecutiveDays,
      minNoticeDays: dto.minNoticeDays,
      allowCarryOver: dto.allowCarryOver,
      carryOverLimit: dto.carryOverLimit,
      autoApprove: dto.autoApprove,
      autoApproveUnderDays: dto.autoApproveUnderDays,
      color: dto.color,
      icon: dto.icon,
      countWorkDaysOnly: dto.countWorkDaysOnly,
      active: dto.active,
    };
    return this.prisma.leaveTypeConfig.create({ data });
  }

  async getLeaveTypes(activeOnly = true) {
    return this.prisma.leaveTypeConfig.findMany({
      where: activeOnly ? { active: true } : {},
      orderBy: [{ category: 'asc' }, { name: 'asc' }],
    });
  }

  async updateLeaveType(code: string, dto: UpdateLeaveTypeDto) {
    const type = await this.prisma.leaveTypeConfig.findUnique({ where: { code } });
    if (!type) throw new NotFoundException(`Tipo "${code}" não encontrado`);
    const data: Prisma.LeaveTypeConfigUpdateInput = {
      name: dto.name,
      description: dto.description,
      category: dto.category,
      isPaid: dto.isPaid,
      annualLimit: dto.annualLimit,
      maxConsecutiveDays: dto.maxConsecutiveDays,
      minNoticeDays: dto.minNoticeDays,
      allowCarryOver: dto.allowCarryOver,
      carryOverLimit: dto.carryOverLimit,
      autoApprove: dto.autoApprove,
      autoApproveUnderDays: dto.autoApproveUnderDays,
      color: dto.color,
      icon: dto.icon,
      countWorkDaysOnly: dto.countWorkDaysOnly,
      active: dto.active,
    };
    return this.prisma.leaveTypeConfig.update({ where: { code }, data });
  }

  // ══════════════════════════════════════════════════════════════════
  // LEAVE POLICIES
  // ══════════════════════════════════════════════════════════════════

  async createPolicy(dto: CreateLeavePolicyDto) {
    return this.prisma.leavePolicy.create({
      data: {
        ...dto,
        blackoutPeriods: dto.blackoutPeriods as unknown as Prisma.InputJsonValue,
      },
    });
  }

  async getPolicies() {
    return this.prisma.leavePolicy.findMany({
      where: { active: true },
      orderBy: { name: 'asc' },
    });
  }

  async getApplicablePolicy(userId: number): Promise<Prisma.LeavePolicyGetPayload<object> | null> {
    const user = await this.prisma.read.user.findUnique({
      where: { id: userId },
      include: { department: { select: { name: true } } },
    });
    if (!user) return null;

    // Match by department or seniority — fallback to global
    return this.prisma.leavePolicy.findFirst({
      where: {
        active: true,
        OR: [{ department: user.department?.name ?? '' }, { department: null }],
      },
      orderBy: { department: 'desc' }, // More specific first
    });
  }

  // ══════════════════════════════════════════════════════════════════
  // LEAVE REQUESTS — LIST / DETAIL
  // ══════════════════════════════════════════════════════════════════

  async findAll(filters: LeaveFilterDto, viewer?: CurrentUserData) {
    const {
      page = 1,
      limit = 20,
      userId,
      leaveTypeCode,
      status,
      department,
      from,
      to,
      sortBy = 'createdAt',
      sortOrder = 'desc',
    } = filters;
    const { skip, take } = calculatePagination(page, limit);
    const where: Prisma.LeaveRequestWhereInput = {};

    if (userId) where.userId = userId;
    if (leaveTypeCode) where.leaveTypeCode = leaveTypeCode;
    if (status) where.status = status;
    if (department)
      where.user = { department: { name: { contains: department, mode: 'insensitive' } } };
    if (from || to) {
      where.startDate = {};
      if (from) where.startDate.gte = new Date(from);
      if (to) where.startDate.lte = new Date(to);
    }

    const [data, total] = await Promise.all([
      this.prisma.read.leaveRequest.findMany({
        where,
        skip,
        take,
        orderBy: { [sortBy]: sortOrder },
        include: {
          user: { select: { id: true, fullName: true, email: true } },
          approvals: {
            orderBy: { level: 'asc' },
            include: { approver: { select: { id: true, fullName: true } } },
          },
          documents: true,
        },
      }),
      this.prisma.read.leaveRequest.count({ where }),
    ]);

    return buildPaginatedResponse(await this.redactSensitive(data, viewer), total, page, limit);
  }

  /**
   * Tipos sensíveis (saúde, etc.): quem não é o titular nem ADMIN/RH não recebe
   * o motivo nem os comprovativos — o gestor decide sobre a ausência, não
   * precisa do detalhe clínico (docs/Modulo_Leave.md §4).
   */
  private async redactSensitive<
    T extends {
      userId: number;
      leaveTypeCode: string;
      reason?: string | null;
      documents?: unknown[];
      attachments?: string[];
    },
  >(rows: T[], viewer?: CurrentUserData): Promise<T[]> {
    if (!viewer || rows.length === 0) return rows;
    const sensitiveTypes =
      (await this.prisma.read.leaveTypeConfig.findMany({
        where: { isSensitive: true },
        select: { code: true },
      })) ?? [];
    const sensitive = new Set(sensitiveTypes.map(t => t.code));
    if (sensitive.size === 0) return rows;
    return rows.map(r =>
      sensitive.has(r.leaveTypeCode) && !canSeeSensitive(viewer, r.userId)
        ? { ...r, reason: null, documents: [], attachments: [] }
        : r,
    );
  }

  async findOne(id: number, user?: CurrentUserData) {
    const r = await this.prisma.read.leaveRequest.findUnique({
      where: { id },
      include: {
        user: { select: { id: true, fullName: true, email: true } },
        approvals: {
          orderBy: { level: 'asc' },
          include: { approver: { select: { id: true, fullName: true } } },
        },
        documents: true,
        impactPreview: true,
      },
    });
    // Ownership (A3): dono OU ADMIN/RH/GESTOR; senão 404.
    if (user) assertCanAccess(r, r?.userId, user, [Role.ADMIN, Role.RH, Role.GESTOR]);
    else if (!r) throw new NotFoundException('Pedido não encontrado');
    return user ? (await this.redactSensitive([r], user))[0] : r;
  }

  async getPendingApprovals(approverId: number, viewer?: CurrentUserData) {
    const rows = await this.prisma.read.leaveRequest.findMany({
      where: {
        status: LeaveStatus.PENDING,
        approvals: { some: { approverId, decidedAt: null } },
      },
      include: {
        user: { select: { id: true, fullName: true, avatarUrl: true } },
        approvals: { include: { approver: { select: { id: true, fullName: true } } } },
      },
      orderBy: { createdAt: 'asc' },
    });
    // Só os pedidos em que a etapa deste aprovador já é accionável (as etapas
    // anteriores estão decididas).
    const actionable = rows.filter(r => {
      const mine = r.approvals?.find(a => a.approverId === approverId && a.decidedAt === null);
      if (!mine) return true;
      return !r.approvals.some(a => a.level < mine.level && a.decidedAt === null);
    });
    return this.redactSensitive(actionable, viewer);
  }

  // ══════════════════════════════════════════════════════════════════
  // LEAVE REQUESTS — CREATE
  // ══════════════════════════════════════════════════════════════════

  async create(dto: CreateLeaveManagementRequestDto, createdById: number) {
    const start = new Date(dto.startDate);
    const end = new Date(dto.endDate);

    if (end < start) throw new BadRequestException('A data de fim não pode ser anterior ao início');

    const [leaveType, cfg, owner] = await Promise.all([
      this.prisma.leaveTypeConfig.findUnique({ where: { code: dto.leaveTypeCode } }),
      this.settings.current(),
      this.prisma.read.user.findUnique({
        where: { id: dto.userId },
        select: { workLocation: true },
      }),
    ]);
    if (!leaveType)
      throw new NotFoundException(`Tipo de licença "${dto.leaveTypeCode}" não encontrado`);
    const location = owner?.workLocation ?? null;

    // ── Janela horária (licenças de poucas horas): HH:mm → horas
    if ((dto.startTime && !dto.endTime) || (!dto.startTime && dto.endTime))
      throw new BadRequestException('Indique a hora de início e a hora de fim');
    let hours = dto.hours;
    let durationMode = dto.durationMode;
    if (dto.startTime && dto.endTime) {
      const span = timeToMinutes(dto.endTime) - timeToMinutes(dto.startTime);
      if (span <= 0) throw new BadRequestException('A hora de fim tem de ser posterior ao início');
      hours = +(span / 60).toFixed(2);
      durationMode = durationMode ?? DurationMode.HOURS;
    }

    // ── Documento comprovativo exigido pelo tipo (§4) ou pela categoria (§10)
    // — rascunhos ficam isentos
    const documents = dto.documents ?? [];
    const needsDocument =
      leaveType.requiresDocument ||
      (!!leaveType.category && cfg.documentRequiredCategories.includes(leaveType.category));
    if (
      needsDocument &&
      !dto.saveAsDraft &&
      documents.length === 0 &&
      !dto.attachments?.length
    )
      throw new BadRequestException(`O tipo "${leaveType.name}" exige um documento comprovativo`);

    // ── Calcular duração (regra de contagem, horas por dia e feriados da localização)
    const { workDays, calendarDays } = this.calculateDuration(
      start,
      end,
      durationMode,
      hours,
      this.countsWorkDaysOnly(leaveType, cfg),
      cfg.hoursPerDay,
      location,
    );

    // ── Validações
    if (!dto.saveAsDraft) this.assertSettingsRules(cfg, leaveType, dto, start, workDays);
    await this.runValidations(dto.userId, leaveType, start, end, workDays, durationMode, cfg);

    // ── Determinar status inicial e fluxo de aprovação
    const autoApprove = leaveType.autoApprove && workDays <= (leaveType.autoApproveUnderDays ?? 1);
    const initialStatus = dto.saveAsDraft
      ? LeaveStatus.DRAFT
      : autoApprove
        ? LeaveStatus.APPROVED
        : LeaveStatus.PENDING;

    // ── Calcular impacto em outros módulos
    const impact = await this.calculateImpact(dto.userId, start, end);

    // ── Criar pedido (+ reserva de saldo, atómica)
    // FIXED (project-innova-leave-type-enum-mismatch): leaveTypeCode é a
    // chave real; leaveType só é preenchido quando corresponde a um dos 10
    // valores fixos do enum (toLeaveTypeEnum), nunca forçado por cast.
    const request = await this.prisma.$transaction(async tx => {
      const created = await tx.leaveRequest.create({
        data: {
          userId: dto.userId,
          leaveTypeCode: dto.leaveTypeCode,
          leaveType: toLeaveTypeEnum(dto.leaveTypeCode),
          startDate: start,
          endDate: end,
          durationMode: durationMode ?? DurationMode.FULL_DAY,
          hours,
          startTime: dto.startTime,
          endTime: dto.endTime,
          createdById,
          submittedAt: dto.saveAsDraft ? null : new Date(),
          workDays,
          calendarDays,
          reason: dto.reason,
          status: initialStatus,
          substituteId: dto.substituteId,
          referenceYear: dto.referenceYear ?? cfg.referenceYear ?? start.getFullYear(),
          contactDuringLeave: dto.contactDuringLeave,
          attachments: dto.attachments ?? [],
          documents: documents.length
            ? {
                create: documents.map(d => ({
                  name: d.name,
                  fileUrl: d.fileUrl,
                  mimeType: d.mimeType,
                  uploadedById: createdById,
                  isSensitive: leaveType.isSensitive,
                })),
              }
            : undefined,
          impactPreview: impact ? { create: impact } : undefined,
        },
        include: { user: { select: { id: true, fullName: true } } },
      });
      const numbered = await tx.leaveRequest.update({
        where: { id: created.id },
        data: { requestNumber: formatRequestNumber(created.id, created.createdAt) },
        include: { user: { select: { id: true, fullName: true } } },
      });
      if (initialStatus === LeaveStatus.PENDING && leaveType.annualLimit) {
        await this.reserveBalance(tx, dto.userId, dto.leaveTypeCode, workDays, numbered.id);
      }
      return numbered;
    });

    // ── Criar nível de aprovação
    if (initialStatus === LeaveStatus.PENDING) {
      const policy = await this.getApplicablePolicy(dto.userId);
      await this.createApprovalFlow(request, policy);
    }

    // ── Se auto-aprovado, deduzir saldo
    if (initialStatus === LeaveStatus.APPROVED) {
      await this.deductBalance(dto.userId, dto.leaveTypeCode, workDays, request.id);
      await this.effects.syncAttendanceOnApproval(request);
      await this.effects.emitApproved(request);
      await this.notifyUser(
        dto.userId,
        'LEAVE_AUTO_APPROVED',
        `A sua ${leaveType.name} foi aprovada automaticamente`,
      );
    } else {
      await this.notifyUser(
        dto.userId,
        'LEAVE_SUBMITTED',
        `Pedido de ${leaveType.name} submetido com sucesso`,
      );
    }

    await this.audit.log({
      action: 'LEAVE_CREATED',
      entityType: 'LeaveRequest',
      entityId: request.id,
      userId: createdById,
      metadata: { requestNumber: request.requestNumber, status: initialStatus },
    });

    return request;
  }

  // ══════════════════════════════════════════════════════════════════
  // LEAVE REQUESTS — APPROVE / REJECT / CANCEL
  // ══════════════════════════════════════════════════════════════════

  async processApproval(requestId: number, approverId: number, dto: ApproveLeaveDto) {
    const request = await this.findOne(requestId);

    if (request.status !== LeaveStatus.PENDING) {
      throw new BadRequestException('Apenas pedidos pendentes podem ser processados');
    }

    // Verificar se este aprovador tem uma aprovação pendente
    const approval = await this.prisma.read.leaveApproval.findFirst({
      where: { requestId, approverId, decidedAt: null },
    });
    if (!approval) throw new ForbiddenException('Não tem permissão para aprovar este pedido');

    // §7: as etapas são sequenciais — o RH só decide depois do gestor.
    const earlierPending = await this.prisma.read.leaveApproval.count({
      where: { requestId, level: { lt: approval.level }, decidedAt: null },
    });
    if (earlierPending > 0) {
      throw new BadRequestException('Aguarda a decisão da etapa anterior');
    }

    if (dto.action === ApprovalAction.REJECT && !dto.notes?.trim()) {
      throw new BadRequestException('A recusa exige uma justificação');
    }

    if (dto.action === ApprovalAction.DELEGATE) {
      if (!dto.delegateToId) throw new BadRequestException('Indique o delegado');
      return this.delegateApproval(approval, dto.delegateToId, approverId, dto.notes);
    }

    // Registar decisão
    const decisionMap: Record<ApprovalAction, LeaveDecision> = {
      [ApprovalAction.APPROVE]: LeaveDecision.APPROVE,
      [ApprovalAction.REJECT]: LeaveDecision.REJECT,
      [ApprovalAction.ESCALATE]: LeaveDecision.ESCALATE,
      [ApprovalAction.DELEGATE]: LeaveDecision.DELEGATE,
    };
    await this.prisma.leaveApproval.update({
      where: { id: approval.id },
      data: {
        decision: decisionMap[dto.action],
        notes: dto.notes,
        decidedAt: new Date(),
      },
    });

    if (dto.action === ApprovalAction.REJECT || dto.action === ApprovalAction.ESCALATE) {
      const newStatus =
        dto.action === ApprovalAction.REJECT ? LeaveStatus.REJECTED : LeaveStatus.PENDING;
      await this.prisma.leaveRequest.update({
        where: { id: requestId },
        data: { status: newStatus },
      });

      if (dto.action === ApprovalAction.REJECT) {
        await this.releaseReservation(request, 'Pedido recusado');
        // As etapas seguintes já não fazem sentido.
        await this.prisma.leaveApproval.updateMany({
          where: { requestId, decidedAt: null },
          data: { decision: LeaveDecision.CANCELLED, decidedAt: new Date() },
        });
        await this.notifyUser(
          request.userId,
          'LEAVE_REJECTED',
          `O seu pedido de licença foi rejeitado`,
        );
      } else {
        // Escalar para próximo nível
        await this.escalateApproval(requestId, approval.level);
      }
      await this.audit.log({
        action: `LEAVE_${dto.action}`,
        entityType: 'LeaveRequest',
        entityId: requestId,
        userId: approverId,
      });
      return this.findOne(requestId);
    }

    // APPROVE — verificar se todos os níveis aprovaram
    const remainingApprovals = await this.prisma.read.leaveApproval.count({
      where: { requestId, decidedAt: null },
    });

    if (remainingApprovals === 0) {
      // Todos os níveis aprovaram
      await this.finalizeApproval(request, approverId);
    }

    return this.findOne(requestId);
  }

  async bulkApprove(dto: BulkApproveDto, approverId: number) {
    const results = await Promise.allSettled(
      dto.requestIds.map(id =>
        this.processApproval(id, approverId, { action: dto.action, notes: dto.notes }),
      ),
    );
    return {
      success: results.filter(r => r.status === 'fulfilled').length,
      failed: results.filter(r => r.status === 'rejected').length,
      total: results.length,
    };
  }

  /**
   * Cancela um pedido. O titular cancela o seu; ADMIN/RH cancelam qualquer um
   * (fica registado quem). Pedidos aprovados obedecem à política de
   * cancelamento (§10): o colaborador pode estar impedido de cancelar, ou só
   * até N dias antes do início — ADMIN/RH não estão sujeitos a esse limite.
   */
  async cancel(
    requestId: number,
    userId: number,
    opts: { reason?: string; actor?: CurrentUserData } = {},
  ) {
    const request = await this.findOne(requestId);
    const privileged = opts.actor ? isPrivileged(opts.actor, [Role.ADMIN, Role.RH]) : false;

    if (request.userId !== userId && !privileged)
      throw new ForbiddenException('Sem permissão para cancelar este pedido');
    if (
      ![LeaveStatus.PENDING, LeaveStatus.DRAFT, LeaveStatus.APPROVED].includes(
        request.status as LeaveStatus,
      )
    ) {
      throw new BadRequestException('Este pedido não pode ser cancelado');
    }

    const wasApproved = request.status === LeaveStatus.APPROVED;
    if (wasApproved && !privileged) {
      const cfg = await this.settings.current();
      if (!cfg.employeeCanCancelApproved) {
        throw new ForbiddenException(
          'A política em vigor não permite cancelar pedidos aprovados — contacte o RH',
        );
      }
      if (cfg.cancelApprovedMinDaysBefore) {
        const daysBefore = Math.floor((request.startDate.getTime() - Date.now()) / 86_400_000);
        if (daysBefore < cfg.cancelApprovedMinDaysBefore) {
          throw new BadRequestException(
            `Só é possível cancelar licenças aprovadas com ${cfg.cancelApprovedMinDaysBefore} dia(s) de antecedência — contacte o RH`,
          );
        }
      }
    }

    await this.prisma.leaveRequest.update({
      where: { id: requestId },
      data: {
        status: LeaveStatus.CANCELLED,
        cancelledAt: new Date(),
        cancelledById: opts.actor?.id ?? userId,
        cancelReason: opts.reason?.trim() || null,
      },
    });

    if (wasApproved) {
      // Devolver saldo e desfazer efeitos nos outros módulos
      await this.returnBalance(request.userId, request.leaveTypeCode, request.workDays, requestId);
      await this.reverseModuleImpacts(request);
      await this.effects.removeAttendanceOnCancel(requestId);
    } else if (request.status === LeaveStatus.PENDING) {
      await this.releaseReservation(request, 'Pedido cancelado');
    }

    // Cancelar aprovações pendentes
    await this.prisma.leaveApproval.updateMany({
      where: { requestId, decidedAt: null },
      data: { decision: 'CANCELLED', decidedAt: new Date() },
    });

    await this.notifyUser(request.userId, 'LEAVE_CANCELLED', 'O seu pedido foi cancelado');
    await this.audit.log({
      action: 'LEAVE_CANCELLED',
      entityType: 'LeaveRequest',
      entityId: requestId,
      userId: opts.actor?.id ?? userId,
      metadata: { wasApproved, byOwner: (opts.actor?.id ?? userId) === request.userId },
    });

    return { message: 'Pedido cancelado com sucesso' };
  }

  // ══════════════════════════════════════════════════════════════════
  // BALANCE
  // ══════════════════════════════════════════════════════════════════

  async getBalance(userId: number) {
    const balances = await this.prisma.read.leaveBalance.findMany({
      where: { userId },
    });

    // Saldo futuro: incluir pedidos pendentes/aprovados futuros
    const future = await this.prisma.read.leaveRequest.findMany({
      where: {
        userId,
        status: { in: [LeaveStatus.PENDING, LeaveStatus.APPROVED] },
        startDate: { gt: new Date() },
      },
      select: { leaveTypeCode: true, workDays: true, status: true },
    });

    return balances.map(b => {
      const pendingDays = future
        .filter(f => f.leaveTypeCode === b.leaveTypeCode && f.status === LeaveStatus.PENDING)
        .reduce((a, f) => a + (f.workDays ?? 0), 0);
      const approvedFuture = future
        .filter(f => f.leaveTypeCode === b.leaveTypeCode && f.status === LeaveStatus.APPROVED)
        .reduce((a, f) => a + (f.workDays ?? 0), 0);
      return {
        ...b,
        pendingDays,
        futureBalance: b.balance - approvedFuture,
        effectiveBalance: b.balance - pendingDays - approvedFuture,
      };
    });
  }

  async updateBalance(userId: number, dto: UpdateBalanceDto, updatedById: number) {
    const leaveType = await this.prisma.leaveTypeConfig.findUnique({
      where: { code: dto.leaveTypeCode },
    });
    if (!leaveType) throw new NotFoundException(`Tipo "${dto.leaveTypeCode}" não encontrado`);

    const before = await this.prisma.leaveBalance.findUnique({
      where: { userId_leaveTypeCode: { userId, leaveTypeCode: dto.leaveTypeCode } },
      select: { balance: true },
    });
    const updated = await this.prisma.leaveBalance.upsert({
      where: { userId_leaveTypeCode: { userId, leaveTypeCode: dto.leaveTypeCode } },
      create: {
        userId,
        leaveTypeCode: dto.leaveTypeCode,
        leaveType: toLeaveTypeEnum(dto.leaveTypeCode),
        balance: dto.balance,
        used: 0,
      },
      update: { balance: dto.balance },
    });

    await this.prisma.leaveBalanceHistory.create({
      data: {
        userId,
        leaveTypeCode: dto.leaveTypeCode,
        leaveType: toLeaveTypeEnum(dto.leaveTypeCode),
        balanceBefore: before?.balance ?? 0,
        balanceAfter: dto.balance,
        change: dto.balance - (before?.balance ?? 0),
        reason: dto.reason ?? 'Actualização manual',
        kind: 'ADJUSTMENT',
        updatedById,
      },
    });

    return updated;
  }

  async accrueBalance(dto: AccrueBalanceDto, _updatedById: number) {
    const results = await Promise.allSettled(
      dto.userIds.map(userId =>
        this.prisma.leaveBalance.upsert({
          where: { userId_leaveTypeCode: { userId, leaveTypeCode: dto.leaveTypeCode } },
          create: {
            userId,
            leaveTypeCode: dto.leaveTypeCode,
            leaveType: toLeaveTypeEnum(dto.leaveTypeCode),
            balance: dto.days,
            used: 0,
          },
          update: { balance: { increment: dto.days } },
        }),
      ),
    );
    return { accrued: results.filter(r => r.status === 'fulfilled').length, total: results.length };
  }

  async initializeUserBalances(userId: number) {
    const leaveTypes = await this.prisma.leaveTypeConfig.findMany({
      where: { active: true, annualLimit: { gt: 0 } },
    });

    // FIXED (project-innova-leave-type-enum-mismatch): leaveTypeCode existe
    // agora em LeaveBalance e é a chave real; leaveType é best-effort.
    await this.prisma.leaveBalance.createMany({
      data: leaveTypes.map(lt => ({
        userId,
        leaveTypeCode: lt.code,
        leaveType: toLeaveTypeEnum(lt.code),
        balance: lt.annualLimit ?? 0,
        used: 0,
      })),
      skipDuplicates: true,
    });
  }

  /**
   * Transição de saldos de fim de ano. Respeita as configurações (§10): se a
   * transição está desactivada ninguém transita; o tecto global limita o do
   * tipo. É idempotente por (colaborador, tipo, ano) — correr duas vezes não
   * volta a transitar — e cada saldo é actualizado numa transacção.
   */
  async processCarryOver(year: number, actorId = 0) {
    const cfg = await this.settings.current();
    const results: { userId: number; code: string; carryOver: number; newBalance: number }[] = [];
    if (!cfg.carryOverEnabled) return { processed: 0, skipped: 0, results };

    const leaveTypes = await this.prisma.leaveTypeConfig.findMany({
      where: { allowCarryOver: true },
    });
    const marker = `Transição de saldo ${year}`;
    let skipped = 0;

    for (const lt of leaveTypes) {
      const balances = await this.prisma.read.leaveBalance.findMany({
        where: { leaveTypeCode: lt.code },
      });
      for (const b of balances) {
        const done = await this.prisma.leaveBalanceHistory.findFirst({
          where: { userId: b.userId, leaveTypeCode: lt.code, kind: 'CARRY_OVER', reason: marker },
          select: { id: true },
        });
        if (done) {
          skipped++;
          continue;
        }
        const caps = [lt.carryOverLimit, cfg.carryOverMaxDays].filter(
          (v): v is number => typeof v === 'number',
        );
        const cap = caps.length ? Math.min(...caps) : Infinity;
        const carryOver = Math.max(0, Math.min(b.balance - b.reserved, cap));
        const newBalance = (lt.annualLimit ?? 0) + carryOver;

        await this.prisma.$transaction(async tx => {
          await this.lockBalance(tx, b.userId, lt.code);
          // FIXED: o saldo novo ignorava o que transitava (guardava só annualLimit).
          await tx.leaveBalance.update({
            where: { userId_leaveTypeCode: { userId: b.userId, leaveTypeCode: lt.code } },
            data: { balance: newBalance, used: 0 },
          });
          await tx.leaveBalanceHistory.create({
            data: {
              userId: b.userId,
              leaveTypeCode: lt.code,
              leaveType: toLeaveTypeEnum(lt.code),
              balanceBefore: b.balance,
              balanceAfter: newBalance,
              change: newBalance - b.balance,
              reason: marker,
              kind: 'CARRY_OVER',
              updatedById: actorId,
            },
          });
        });
        results.push({ userId: b.userId, code: lt.code, carryOver, newBalance });
      }
    }

    return { processed: results.length, skipped, results };
  }

  async getBalanceHistory(userId: number, leaveTypeCode?: string) {
    const where: Prisma.LeaveBalanceHistoryWhereInput = { userId };
    if (leaveTypeCode) where.leaveTypeCode = leaveTypeCode;
    return this.prisma.read.leaveBalanceHistory.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  // ══════════════════════════════════════════════════════════════════
  // CALENDAR
  // ══════════════════════════════════════════════════════════════════

  async getCalendar(filters: CalendarFilterDto) {
    const year = filters.year ?? new Date().getFullYear();
    const from = filters.month ? new Date(year, filters.month - 1, 1) : new Date(year, 0, 1);
    const to = filters.month
      ? new Date(year, filters.month, 0, 23, 59, 59)
      : new Date(year, 11, 31, 23, 59, 59);

    const where: Prisma.LeaveRequestWhereInput = {
      status: { in: [LeaveStatus.APPROVED, LeaveStatus.PENDING] },
      OR: [
        { startDate: { gte: from, lte: to } },
        { endDate: { gte: from, lte: to } },
        { startDate: { lte: from }, endDate: { gte: to } },
      ],
    };

    if (filters.department)
      where.user = {
        department: { name: { contains: filters.department, mode: 'insensitive' } },
      };
    if (filters.leaveTypeCode) where.leaveTypeCode = filters.leaveTypeCode;

    const requests = await this.prisma.read.leaveRequest.findMany({
      where,
      include: {
        user: { select: { id: true, fullName: true } },
      },
      orderBy: { startDate: 'asc' },
    });

    // Agregar por mês para heatmap
    const heatmap: Record<string, number> = {};
    for (const r of requests) {
      const cur = new Date(r.startDate);
      while (cur <= r.endDate) {
        const key = cur.toISOString().split('T')[0];
        heatmap[key] = (heatmap[key] ?? 0) + 1;
        cur.setDate(cur.getDate() + 1);
      }
    }

    return { requests, heatmap };
  }

  async getConflictCheck(userId: number, startDate: string, endDate: string) {
    const start = new Date(startDate);
    const end = new Date(endDate);

    // FIX: buscar departamento do user antes do Promise.all (User não tem relação employee)
    const currentUser = await this.prisma.read.user.findUnique({
      where: { id: userId },
      select: { departmentId: true },
    });
    const userDeptId = currentUser?.departmentId;

    const [teamConflicts, userConflicts] = await Promise.all([
      this.prisma.read.leaveRequest.findMany({
        where: {
          status: { in: [LeaveStatus.APPROVED, LeaveStatus.PENDING] },
          user: userDeptId ? { departmentId: userDeptId } : {},
          OR: [{ startDate: { gte: start, lte: end } }, { endDate: { gte: start, lte: end } }],
          userId: { not: userId },
        },
        include: { user: { select: { id: true, fullName: true } } },
      }),
      this.prisma.read.leaveRequest.findMany({
        where: {
          userId,
          status: { in: [LeaveStatus.APPROVED, LeaveStatus.PENDING] },
          OR: [{ startDate: { gte: start, lte: end } }, { endDate: { gte: start, lte: end } }],
        },
      }),
    ]);

    const policy = await this.getApplicablePolicy(userId);
    const maxAbsent = policy?.maxAbsencePercent ?? 30;

    return {
      hasUserConflict: userConflicts.length > 0,
      userConflicts,
      teamConflicts,
      teamConflictCount: teamConflicts.length,
      warningThreshold: maxAbsent,
      isAtRisk: teamConflicts.length > 0,
    };
  }

  // ══════════════════════════════════════════════════════════════════
  // ANALYTICS
  // ══════════════════════════════════════════════════════════════════

  async getDashboard(department?: string) {
    const now = new Date();
    const year = now.getFullYear();
    const from = new Date(year, 0, 1);
    const to = new Date(year, 11, 31);
    const where: Prisma.LeaveRequestWhereInput = { startDate: { gte: from, lte: to } };
    if (department)
      where.user = { department: { name: { contains: department, mode: 'insensitive' } } };

    const [allRequests, pending, approved, activeNow] = await Promise.all([
      this.prisma.read.leaveRequest.findMany({ where }),
      this.prisma.read.leaveRequest.count({ where: { ...where, status: LeaveStatus.PENDING } }),
      this.prisma.read.leaveRequest.count({ where: { ...where, status: LeaveStatus.APPROVED } }),
      this.prisma.read.leaveRequest.count({
        where: { status: LeaveStatus.APPROVED, startDate: { lte: now }, endDate: { gte: now } },
      }),
    ]);

    const totalWorkDays = allRequests
      .filter(r => r.status === LeaveStatus.APPROVED)
      .reduce((a, r) => a + (r.workDays ?? 0), 0);
    const byType = allRequests.reduce<
      Record<string, { code: string; count: number; days: number }>
    >((acc, r) => {
      const code = r.leaveTypeCode ?? r.leaveType;
      if (!code) return acc;
      if (!acc[code]) acc[code] = { code, count: 0, days: 0 };
      acc[code].count++;
      acc[code].days += r.workDays ?? 0;
      return acc;
    }, {});

    const byMonth = Array.from({ length: 12 }, (_, i) => {
      const monthRequests = allRequests.filter(
        r => new Date(r.startDate).getMonth() === i && r.status === LeaveStatus.APPROVED,
      );
      return {
        month: i + 1,
        count: monthRequests.length,
        days: monthRequests.reduce((a, r) => a + (r.workDays ?? 0), 0),
      };
    });

    return {
      year,
      kpis: { pending, approved, activeNow, totalWorkDays },
      byType: Object.values(byType),
      byMonth,
    };
  }

  async getAbsenteeismReport(from: string, to: string, department?: string) {
    const where: Prisma.LeaveRequestWhereInput = {
      status: LeaveStatus.APPROVED,
      startDate: { gte: new Date(from), lte: new Date(to) },
    };
    if (department)
      where.user = { department: { name: { contains: department, mode: 'insensitive' } } };

    const records = await this.prisma.read.leaveRequest.findMany({
      where,
      include: {
        user: { select: { id: true, fullName: true } },
      },
    });

    const byUser = records.reduce<
      Record<number, { userId: number; fullName: string; totalDays: number; requests: number }>
    >((acc, r) => {
      const uid = r.userId;
      if (!acc[uid])
        acc[uid] = { userId: uid, fullName: r.user.fullName, totalDays: 0, requests: 0 };
      acc[uid].totalDays += r.workDays ?? 0;
      acc[uid].requests++;
      return acc;
    }, {});

    const workDaysInPeriod = countWorkDays(new Date(from), new Date(to));

    return Object.values(byUser)
      .map(u => ({
        ...u,
        absenteeismRate:
          workDaysInPeriod > 0 ? +((u.totalDays / workDaysInPeriod) * 100).toFixed(1) : 0,
      }))
      .sort((a, b) => b.totalDays - a.totalDays);
  }

  // ══════════════════════════════════════════════════════════════════
  // HELPER PRIVADOS
  // ══════════════════════════════════════════════════════════════════

  /** Regra de contagem: a da empresa (§10) manda; "por tipo" deixa cada tipo decidir. */
  private countsWorkDaysOnly(
    leaveType: Prisma.LeaveTypeConfigGetPayload<object>,
    cfg: LeaveSettings,
  ): boolean {
    if (cfg.dayCountRule === 'WORK_DAYS') return true;
    if (cfg.dayCountRule === 'CALENDAR_DAYS') return false;
    return leaveType.countWorkDaysOnly;
  }

  private calculateDuration(
    start: Date,
    end: Date,
    mode?: DurationMode,
    hours?: number,
    workDaysOnly = true,
    hoursPerDay = 8,
    location?: string | null,
  ) {
    const calendarDays = countCalendarDays(start, end);
    let workDays = workDaysOnly ? countWorkDays(start, end, location) : calendarDays;

    if (mode === DurationMode.HALF_AM || mode === DurationMode.HALF_PM) workDays = 0.5;
    if (mode === DurationMode.HOURS && hours) workDays = +(hours / hoursPerDay).toFixed(2);

    return { workDays, calendarDays };
  }

  /** Regras das Configurações (§10) que dependem da submissão e não do tipo. */
  private assertSettingsRules(
    cfg: LeaveSettings,
    leaveType: Prisma.LeaveTypeConfigGetPayload<object>,
    dto: CreateLeaveManagementRequestDto,
    start: Date,
    workDays: number,
  ) {
    if (cfg.maxAdvanceDays) {
      const ahead = Math.floor((start.getTime() - Date.now()) / 86_400_000);
      if (ahead > cfg.maxAdvanceDays) {
        throw new BadRequestException(
          `Só pode pedir com no máximo ${cfg.maxAdvanceDays} dias de antecedência`,
        );
      }
    }
    if (leaveType.code === VACATION_CODE && cfg.vacationWindowStart && cfg.vacationWindowEnd) {
      const mmdd = (d: Date) => d.toISOString().slice(5, 10);
      const end = new Date(dto.endDate);
      if (
        !inMonthDayWindow(mmdd(start), cfg.vacationWindowStart, cfg.vacationWindowEnd) ||
        !inMonthDayWindow(mmdd(end), cfg.vacationWindowStart, cfg.vacationWindowEnd)
      ) {
        throw new BadRequestException(
          `As férias têm de ficar dentro do período ${cfg.vacationWindowStart} a ${cfg.vacationWindowEnd}`,
        );
      }
    }
    if (
      cfg.substituteRequiredOverDays &&
      workDays > cfg.substituteRequiredOverDays &&
      !dto.substituteId
    ) {
      throw new BadRequestException(
        `Ausências com mais de ${cfg.substituteRequiredOverDays} dias úteis exigem um substituto`,
      );
    }
  }

  private async runValidations(
    userId: number,
    leaveType: Prisma.LeaveTypeConfigGetPayload<object>,
    start: Date,
    end: Date,
    workDays: number,
    _mode: DurationMode | undefined,
    cfg: LeaveSettings,
  ) {
    // 1. Antecedência mínima (a do tipo, ou a da empresa quando o tipo não define)
    const minNotice = leaveType.minNoticeDays ?? cfg.minNoticeDays;
    if (minNotice) {
      const noticeDays = countWorkDays(new Date(), start);
      if (noticeDays < minNotice) {
        throw new BadRequestException(
          `Este tipo de licença requer ${minNotice} dias de antecedência`,
        );
      }
    }

    // 2. Máximo de dias consecutivos
    if (leaveType.maxConsecutiveDays && workDays > leaveType.maxConsecutiveDays) {
      throw new BadRequestException(
        `Máximo de ${leaveType.maxConsecutiveDays} dias consecutivos para este tipo`,
      );
    }

    // 3. Saldo disponível = atribuído − já reservado por outros pedidos pendentes
    if (leaveType.annualLimit) {
      const balance = await this.prisma.leaveBalance.findUnique({
        where: { userId_leaveTypeCode: { userId, leaveTypeCode: leaveType.code } },
      });
      const available = (balance?.balance ?? 0) - (balance?.reserved ?? 0);
      if (workDays > available) {
        throw new BadRequestException(
          `Saldo insuficiente: tem ${available} dias disponíveis, solicitou ${workDays}`,
        );
      }
    }

    // 4. Blackout periods
    const policy = await this.getApplicablePolicy(userId);
    if (policy?.blackoutPeriods) {
      for (const bp of policy.blackoutPeriods as unknown as BlackoutPeriodDto[]) {
        const bpStart = new Date(bp.startDate);
        const bpEnd = new Date(bp.endDate);
        if (start <= bpEnd && end >= bpStart) {
          if (!bp.leaveTypeCodes?.length || bp.leaveTypeCodes.includes(leaveType.code)) {
            throw new BadRequestException(
              `Período bloqueado: ${bp.label} (${bp.startDate} a ${bp.endDate})`,
            );
          }
        }
      }
    }

    // 5. Conflito próprio
    const selfConflict = await this.prisma.read.leaveRequest.findFirst({
      where: {
        userId,
        status: { in: [LeaveStatus.PENDING, LeaveStatus.APPROVED] },
        OR: [
          { startDate: { gte: start, lte: end } },
          { endDate: { gte: start, lte: end } },
          { startDate: { lte: start }, endDate: { gte: end } },
        ],
      },
    });
    if (selfConflict) {
      throw new ConflictException(
        'Já existe um pedido aprovado/pendente que sobrepõe este período',
      );
    }
  }

  /**
   * Etapas de aprovação de um pedido (docs/Modulo_Leave.md §7): gestor directo
   * e, quando o tipo/política o exigem (nº de níveis ou duração acima do
   * limiar de validação RH), o RH. Partilhado entre a criação real do fluxo
   * e a pré-visualização `GET /leave/approval-route`.
   */
  async resolveApprovalSteps(
    userId: number,
    leaveTypeCode: string,
    workDays: number,
    policy?: Prisma.LeavePolicyGetPayload<object> | null,
  ) {
    const [user, type, pol] = await Promise.all([
      this.prisma.read.user.findUnique({
        where: { id: userId },
        select: { managerId: true, manager: { select: { id: true, fullName: true } } },
      }),
      this.prisma.read.leaveTypeConfig.findUnique({
        where: { code: leaveTypeCode },
        select: { approvalLevels: true },
      }),
      policy === undefined ? this.getApplicablePolicy(userId) : Promise.resolve(policy),
    ]);

    let levels = type?.approvalLevels ?? pol?.approvalLevels ?? 1;
    if (pol?.hrValidationOverDays != null && workDays > pol.hrValidationOverDays) {
      levels = Math.max(levels, 2);
    }

    const steps: Array<{
      level: number;
      stage: 'MANAGER' | 'HR';
      approver: { id: number; fullName: string };
    }> = [];
    if (user?.manager && user.manager.id !== userId) {
      steps.push({ level: 1, stage: 'MANAGER', approver: user.manager });
    }
    if (levels >= 2) {
      const hr = await this.prisma.read.user.findFirst({
        where: { role: { code: 'RH' }, id: { not: userId } },
        select: { id: true, fullName: true },
      });
      if (hr && !steps.some(s => s.approver.id === hr.id)) {
        steps.push({ level: 2, stage: 'HR', approver: hr });
      }
    }
    const cfg = await this.settings.current();
    return { steps, slaDays: pol?.decisionSlaDays ?? cfg.decisionSlaDays };
  }

  private async createApprovalFlow(
    request: {
      id: number;
      userId: number;
      leaveTypeCode: string;
      workDays: number;
      startDate: Date;
      endDate: Date;
      requestNumber?: string | null;
    },
    policy: Prisma.LeavePolicyGetPayload<object> | null,
  ) {
    const requestId = request.id;
    const { steps, slaDays } = await this.resolveApprovalSteps(
      request.userId,
      request.leaveTypeCode,
      request.workDays,
      policy,
    );

    if (steps.length === 0) {
      // Sem gestor configurado — auto-aprovar. `actorId = userId` porque não
      // existe aprovador humano que tenha tomado a decisão — quem accionou
      // este caminho foi o próprio requerente ao submeter o pedido.
      await this.finalizeApproval(request, request.userId);
    } else {
      const dueAt = new Date(Date.now() + slaDays * 24 * 3600 * 1000);
      let firstApproverId = steps[0].approver.id;
      for (const [i, step] of steps.entries()) {
        // Substituição activa (§10): a etapa vai para o substituto — nunca para
        // o próprio requerente — e a troca fica no histórico de reatribuições.
        const delegateId = await this.settings.activeDelegateOf(step.approver.id);
        const delegated = delegateId && delegateId !== request.userId ? delegateId : null;
        await this.prisma.leaveApproval.create({
          data: {
            requestId,
            approverId: delegated ?? step.approver.id,
            level: step.level,
            stage: step.stage,
            dueAt,
            reassignments: delegated
              ? {
                  create: {
                    fromApproverId: step.approver.id,
                    toApproverId: delegated,
                    byUserId: step.approver.id,
                    kind: 'DELEGATE',
                    reason: 'Substituição activa do aprovador',
                  },
                }
              : undefined,
          },
        });
        if (i === 0) firstApproverId = delegated ?? step.approver.id;
      }
      // Notificar primeiro aprovador
      await this.notifyUser(
        firstApproverId,
        'LEAVE_PENDING_APPROVAL',
        'Novo pedido de licença aguarda a sua aprovação',
      );
    }
  }

  private async escalateApproval(requestId: number, currentLevel: number) {
    const nextApproval = await this.prisma.read.leaveApproval.findFirst({
      where: { requestId, level: { gt: currentLevel }, decidedAt: null },
    });
    if (nextApproval) {
      await this.notifyUser(
        nextApproval.approverId,
        'LEAVE_ESCALATED',
        'Pedido de licença escalado para aprovação',
      );
    }
  }

  private async delegateApproval(
    approval: { id: number; approverId: number },
    delegateToId: number,
    byUserId: number,
    notes?: string,
  ) {
    const delegate = await this.prisma.read.user.findUnique({
      where: { id: delegateToId },
      select: { id: true },
    });
    if (!delegate) throw new NotFoundException('Delegado não encontrado');
    if (delegateToId === approval.approverId)
      throw new BadRequestException('O delegado tem de ser outro utilizador');
    await this.prisma.leaveApprovalReassignment.create({
      data: {
        approvalId: approval.id,
        fromApproverId: approval.approverId,
        toApproverId: delegateToId,
        byUserId,
        kind: 'DELEGATE',
        reason: notes ?? null,
      },
    });
    const updated = await this.prisma.leaveApproval.update({
      where: { id: approval.id },
      data: { approverId: delegateToId, notes: notes ?? 'Delegado', decidedAt: null },
    });
    await this.notifyUser(
      delegateToId,
      'LEAVE_PENDING_APPROVAL',
      'Foi-lhe delegada a aprovação de um pedido de licença',
    );
    return updated;
  }

  /**
   * Marca o pedido como aprovado e aplica todos os efeitos secundários de uma
   * aprovação final — dedução de saldo, impacto noutros módulos, notificação
   * e auditoria. Chamado tanto quando o último nível de aprovação decide
   * APPROVE (processApproval) como quando não existe nenhum aprovador
   * configurado e o pedido é auto-aprovado na submissão (createApprovalFlow).
   * Extraído para eliminar a divergência onde o segundo caminho fazia só o
   * update de status, sem tocar no ledger de saldo (bug real, corrigido aqui).
   */
  private async finalizeApproval(
    request: {
      id: number;
      userId: number;
      leaveTypeCode: string;
      workDays: number;
      startDate: Date;
      endDate: Date;
      requestNumber?: string | null;
    },
    actorId: number,
  ) {
    await this.prisma.leaveRequest.update({
      where: { id: request.id },
      data: { status: LeaveStatus.APPROVED, finalApprovedAt: new Date() },
    });

    await this.deductBalance(request.userId, request.leaveTypeCode, request.workDays, request.id);
    await this.applyModuleImpacts(request as Prisma.LeaveRequestGetPayload<object>);
    // Só pedidos aprovados chegam à assiduidade/automação (§12): o calendário
    // de ausências confirmadas nunca vê pedidos pendentes.
    await this.effects.syncAttendanceOnApproval(request);
    await this.effects.emitApproved(request);
    await this.notifyUser(request.userId, 'LEAVE_APPROVED', 'O seu pedido foi aprovado!');
    await this.audit.log({
      action: 'LEAVE_APPROVED',
      entityType: 'LeaveRequest',
      entityId: request.id,
      userId: actorId,
    });
  }

  // ── Saldos (§13: atribuídos / reservados / gozados) ──────────────────────

  /** Bloqueia a linha de saldo até ao fim da transacção — evita reservas duplicadas. */
  private async lockBalance(tx: Prisma.TransactionClient, userId: number, code: string) {
    await tx.$queryRaw`SELECT 1 FROM "LeaveBalance" WHERE "userId" = ${userId} AND "leaveTypeCode" = ${code} FOR UPDATE`;
  }

  /** Reserva dias para um pedido PENDING. Falha se, já com o saldo bloqueado, não houver dias. */
  private async reserveBalance(
    tx: Prisma.TransactionClient,
    userId: number,
    code: string,
    days: number,
    requestId: number,
  ) {
    await this.lockBalance(tx, userId, code);
    const row = await tx.leaveBalance.findUnique({
      where: { userId_leaveTypeCode: { userId, leaveTypeCode: code } },
    });
    const available = (row?.balance ?? 0) - (row?.reserved ?? 0);
    if (!row || days > available) {
      throw new BadRequestException(
        `Saldo insuficiente: tem ${Math.max(0, available)} dias disponíveis, solicitou ${days}`,
      );
    }
    await tx.leaveBalance.update({
      where: { userId_leaveTypeCode: { userId, leaveTypeCode: code } },
      data: { reserved: { increment: days } },
    });
    await tx.leaveBalanceHistory.create({
      data: {
        userId,
        leaveTypeCode: code,
        leaveType: toLeaveTypeEnum(code),
        balanceBefore: row.balance,
        balanceAfter: row.balance,
        change: 0,
        reason: `Reserva de ${days} dia(s) para o pedido`,
        kind: 'RESERVATION',
        requestId,
        updatedById: userId,
      },
    });
  }

  /** Liberta a reserva de um pedido PENDING que deixa de o ser (recusado/cancelado). */
  private async releaseReservation(
    request: { id: number; userId: number; leaveTypeCode: string; workDays: number },
    why: string,
  ) {
    await this.prisma.$transaction(async tx => {
      await this.lockBalance(tx, request.userId, request.leaveTypeCode);
      const row = await tx.leaveBalance.findUnique({
        where: {
          userId_leaveTypeCode: { userId: request.userId, leaveTypeCode: request.leaveTypeCode },
        },
      });
      const release = Math.min(row?.reserved ?? 0, request.workDays);
      if (!row || release <= 0) return;
      await tx.leaveBalance.update({
        where: {
          userId_leaveTypeCode: { userId: request.userId, leaveTypeCode: request.leaveTypeCode },
        },
        data: { reserved: { decrement: release } },
      });
      await tx.leaveBalanceHistory.create({
        data: {
          userId: request.userId,
          leaveTypeCode: request.leaveTypeCode,
          leaveType: toLeaveTypeEnum(request.leaveTypeCode),
          balanceBefore: row.balance,
          balanceAfter: row.balance,
          change: 0,
          reason: `${why}: libertados ${release} dia(s) reservados`,
          kind: 'RELEASE',
          requestId: request.id,
          updatedById: request.userId,
        },
      });
    });
  }

  /** Aprovação: os dias passam de reservados para gozados (e saem do saldo). */
  private async deductBalance(
    userId: number,
    leaveTypeCode: string,
    workDays: number,
    requestId?: number,
  ) {
    await this.prisma.$transaction(async tx => {
      await this.lockBalance(tx, userId, leaveTypeCode);
      const current = await tx.leaveBalance.findUnique({
        where: { userId_leaveTypeCode: { userId, leaveTypeCode } },
      });
      const balanceBefore = current?.balance ?? 0;
      const fromReserved = Math.min(current?.reserved ?? 0, workDays);
      const balanceAfter = balanceBefore - workDays;

      await tx.leaveBalance.upsert({
        where: { userId_leaveTypeCode: { userId, leaveTypeCode } },
        create: {
          userId,
          leaveTypeCode,
          leaveType: toLeaveTypeEnum(leaveTypeCode),
          balance: balanceAfter,
          used: workDays,
        },
        update: {
          balance: { decrement: workDays },
          used: { increment: workDays },
          reserved: { decrement: fromReserved },
        },
      });

      await tx.leaveBalanceHistory.create({
        data: {
          userId,
          leaveTypeCode,
          leaveType: toLeaveTypeEnum(leaveTypeCode),
          balanceBefore,
          balanceAfter,
          change: -workDays,
          reason: 'Licença aprovada',
          kind: 'USAGE',
          requestId,
          updatedById: userId,
        },
      });
    });
  }

  private async returnBalance(
    userId: number,
    leaveTypeCode: string,
    workDays: number,
    requestId?: number,
  ) {
    await this.prisma.$transaction(async tx => {
      await this.lockBalance(tx, userId, leaveTypeCode);
      const current = await tx.leaveBalance.findUnique({
        where: { userId_leaveTypeCode: { userId, leaveTypeCode } },
      });
      const balanceBefore = current?.balance ?? 0;
      const balanceAfter = balanceBefore + workDays;

      await tx.leaveBalance.upsert({
        where: { userId_leaveTypeCode: { userId, leaveTypeCode } },
        create: {
          userId,
          leaveTypeCode,
          leaveType: toLeaveTypeEnum(leaveTypeCode),
          balance: workDays,
          used: 0,
        },
        update: { balance: { increment: workDays }, used: { decrement: workDays } },
      });

      await tx.leaveBalanceHistory.create({
        data: {
          userId,
          leaveTypeCode,
          leaveType: toLeaveTypeEnum(leaveTypeCode),
          balanceBefore,
          balanceAfter,
          change: workDays,
          reason: 'Cancelamento de licença',
          kind: 'REVERSAL',
          requestId,
          updatedById: userId,
        },
      });
    });
  }

  private async calculateImpact(userId: number, start: Date, end: Date) {
    // Cursos activos no período
    type ActiveCourse = Prisma.EnrollmentGetPayload<{
      include: { course: { select: { id: true; title: true } } };
    }>;
    const activeCourses: ActiveCourse[] =
      (await this.prisma.enrollment
        ?.findMany?.({
          where: { userId, completedAt: null },
          include: { course: { select: { id: true, title: true } } },
        })
        .catch((e: unknown) => {
          this.logger.warn({
            userId,
            action: 'CALCULATE_LEAVE_IMPACT',
            err: { message: e instanceof Error ? e.message : String(e) },
            msg: 'Falha ao obter cursos activos para cálculo de impacto de licença',
          });
          return [] as ActiveCourse[];
        })) ?? [];

    // Eventos no período
    // FIX: Event.startAt (não startDate) — este where/include rebentava
    // sempre e era mascarado pelo .catch() abaixo, deixando o preview de
    // impacto de licença permanentemente sem eventos afectados.
    type AffectedEvent = Prisma.EventParticipantGetPayload<{
      include: { event: { select: { id: true; title: true; startAt: true } } };
    }>;
    const events: AffectedEvent[] =
      (await this.prisma.eventParticipant
        ?.findMany?.({
          where: { userId, event: { startAt: { gte: start, lte: end } } },
          include: { event: { select: { id: true, title: true, startAt: true } } },
        })
        .catch((e: unknown) => {
          this.logger.warn({
            userId,
            action: 'CALCULATE_LEAVE_IMPACT',
            err: { message: e instanceof Error ? e.message : String(e) },
            msg: 'Falha ao obter eventos para cálculo de impacto de licença',
          });
          return [] as AffectedEvent[];
        })) ?? [];

    if (activeCourses.length === 0 && events.length === 0) return null;

    return {
      affectedCourses: activeCourses.length,
      affectedEvents: events.length,
      notes: `${activeCourses.length} curso(s) e ${events.length} evento(s) no período`,
    };
  }

  private async applyModuleImpacts(request: Prisma.LeaveRequestGetPayload<object>) {
    try {
      await this.prisma.enrollment?.updateMany?.({
        where: { userId: request.userId, completedAt: null },
        data: { pausedAt: new Date() },
      });
    } catch (e: unknown) {
      this.logger.warn({
        userId: request.userId,
        requestId: request.id,
        action: 'APPLY_LEAVE_MODULE_IMPACTS',
        err: { message: e instanceof Error ? e.message : String(e) },
        msg: 'Falha ao pausar matrículas activas durante aprovação de licença',
      });
    }
  }

  private async reverseModuleImpacts(request: Prisma.LeaveRequestGetPayload<object>) {
    try {
      await this.prisma.enrollment?.updateMany?.({
        where: { userId: request.userId, pausedAt: { not: null } },
        data: { pausedAt: null },
      });
    } catch (e: unknown) {
      this.logger.warn({
        userId: request.userId,
        requestId: request.id,
        action: 'REVERSE_LEAVE_MODULE_IMPACTS',
        err: { message: e instanceof Error ? e.message : String(e) },
        msg: 'Falha ao reverter pausa de matrículas durante cancelamento de licença',
      });
    }
  }

  private async notifyUser(userId: number, type: string, message: string) {
    await createNotificationSafe(this.prisma, this.logger, { userId, type, message });
  }
}
