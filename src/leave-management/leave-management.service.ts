// ─── src/leave-management/leave-management.service.ts ────────────────────────
import {
  Injectable, NotFoundException, BadRequestException,
  ForbiddenException, ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService }  from '../common/services/audit.service';
import {
  LeaveFilterDto, CalendarFilterDto,
  CreateLeaveTypeDto, UpdateLeaveTypeDto,
  CreateLeaveManagementRequestDto, UpdateLeaveRequestDto,
  ApproveLeaveDto, BulkApproveDto,
  UpdateBalanceDto, AccrueBalanceDto,
  CreateLeavePolicyDto,
  LeaveStatus, ApprovalAction, DurationMode,
} from './leave-management.dto';

// ─── Angola public holidays (configurable via DB in the future) ──────────────
const ANGOLA_HOLIDAYS_2025: string[] = [
  '2025-01-01','2025-02-04','2025-03-08','2025-04-04',
  '2025-04-18','2025-05-01','2025-09-17','2025-11-02',
  '2025-11-11','2025-12-25',
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isHoliday(date: Date, holidays: string[]): boolean {
  return holidays.includes(date.toISOString().split('T')[0]);
}

function countWorkDays(start: Date, end: Date, holidays: string[] = ANGOLA_HOLIDAYS_2025): number {
  let days = 0;
  const cur = new Date(start);
  while (cur <= end) {
    const dow = cur.getDay();
    if (dow !== 0 && dow !== 6 && !isHoliday(cur, holidays)) days++;
    cur.setDate(cur.getDate() + 1);
  }
  return days;
}

function countCalendarDays(start: Date, end: Date): number {
  return Math.max(1, Math.round((end.getTime() - start.getTime()) / 86400000) + 1);
}

function addWorkDays(start: Date, days: number, holidays: string[] = ANGOLA_HOLIDAYS_2025): Date {
  let added = 0;
  const cur  = new Date(start);
  while (added < days) {
    cur.setDate(cur.getDate() + 1);
    if (cur.getDay() !== 0 && cur.getDay() !== 6 && !isHoliday(cur, holidays)) added++;
  }
  return cur;
}

// ─────────────────────────────────────────────────────────────────────────────

@Injectable()
export class LeaveManagementService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // ══════════════════════════════════════════════════════════════════
  // LEAVE TYPES
  // ══════════════════════════════════════════════════════════════════

  async createLeaveType(dto: CreateLeaveTypeDto) {
    const exists = await (this.prisma as any).leaveTypeConfig.findUnique({ where: { code: dto.code } });
    if (exists) throw new ConflictException(`Tipo de licença "${dto.code}" já existe`);
    return (this.prisma as any).leaveTypeConfig.create({ data: dto as any });
  }

  async getLeaveTypes(activeOnly = true) {
    return (this.prisma as any).leaveTypeConfig.findMany({
      where: activeOnly ? { active: true } : {},
      orderBy: [{ category: 'asc' }, { name: 'asc' }],
    });
  }

  async updateLeaveType(code: string, dto: UpdateLeaveTypeDto) {
    const type = await (this.prisma as any).leaveTypeConfig.findUnique({ where: { code } });
    if (!type) throw new NotFoundException(`Tipo "${code}" não encontrado`);
    return (this.prisma as any).leaveTypeConfig.update({ where: { code }, data: dto as any });
  }

  // ══════════════════════════════════════════════════════════════════
  // LEAVE POLICIES
  // ══════════════════════════════════════════════════════════════════

  async createPolicy(dto: CreateLeavePolicyDto) {
    return (this.prisma as any).leavePolicy.create({ data: { ...dto, blackoutPeriods: dto.blackoutPeriods as any } });
  }

  async getPolicies() {
    return (this.prisma as any).leavePolicy.findMany({ where: { active: true }, orderBy: { name: 'asc' } });
  }

  private async getApplicablePolicy(userId: number): Promise<any | null> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      });
    if (!user) return null;

    // Match by department or seniority — fallback to global
    return (this.prisma as any).leavePolicy.findFirst({
      where: {
        active: true,
        OR: [
          { department: (user as any).employee?.department ?? '' },
          { department: null },
        ],
      },
      orderBy: { department: 'desc' }, // More specific first
    });
  }

  // ══════════════════════════════════════════════════════════════════
  // LEAVE REQUESTS — LIST / DETAIL
  // ══════════════════════════════════════════════════════════════════

  async findAll(filters: LeaveFilterDto) {
    const { page = 1, limit = 20, userId, leaveTypeCode, status, department, from, to, sortBy = 'createdAt', sortOrder = 'desc' } = filters;
    const skip = (page - 1) * limit;
    const where: any = {};

    if (userId)        where.userId = userId;
    if (leaveTypeCode) where.leaveTypeCode = leaveTypeCode;
    if (status)        where.status = status;
    if (department)    where.user = { employee: { department: { contains: department, mode: 'insensitive' } } };
    if (from || to) {
      where.startDate = {};
      if (from) where.startDate.gte = new Date(from);
      if (to)   where.startDate.lte = new Date(to);
    }

    const [data, total] = await Promise.all([
      this.prisma.leaveRequest.findMany({
        where, skip, take: limit,
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
      this.prisma.leaveRequest.count({ where }),
    ]);

    return { data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  async findOne(id: number) {
    const r = await this.prisma.leaveRequest.findUnique({
      where: { id },
      include: {
       user: { select: { id: true, fullName: true, email: true } },
        approvals: { orderBy: { level: 'asc' }, include: { approver: { select: { id: true, fullName: true } } } },
        documents: true,
        impactPreview: true,
      },
    });
    if (!r) throw new NotFoundException('Pedido não encontrado');
    return r;
  }

  async getPendingApprovals(approverId: number) {
    return this.prisma.leaveRequest.findMany({
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
  }

  // ══════════════════════════════════════════════════════════════════
  // LEAVE REQUESTS — CREATE
  // ══════════════════════════════════════════════════════════════════

  async create(dto: CreateLeaveManagementRequestDto, createdById: number) {
    const start = new Date(dto.startDate);
    const end   = new Date(dto.endDate);

    if (end < start) throw new BadRequestException('A data de fim não pode ser anterior ao início');

    const leaveType = await (this.prisma as any).leaveTypeConfig.findUnique({ where: { code: dto.leaveTypeCode } });
    if (!leaveType) throw new NotFoundException(`Tipo de licença "${dto.leaveTypeCode}" não encontrado`);

    // ── Calcular duração
    const { workDays, calendarDays } = this.calculateDuration(start, end, dto.durationMode, dto.hours, leaveType.countWorkDaysOnly);

    // ── Validações
    await this.runValidations(dto.userId, leaveType, start, end, workDays, dto.durationMode);

    // ── Determinar status inicial e fluxo de aprovação
    const autoApprove = leaveType.autoApprove && workDays <= (leaveType.autoApproveUnderDays ?? 1);
    const initialStatus = dto.saveAsDraft
      ? LeaveStatus.DRAFT
      : autoApprove
        ? LeaveStatus.APPROVED
        : LeaveStatus.PENDING;

    // ── Calcular impacto em outros módulos
    const impact = await this.calculateImpact(dto.userId, start, end);

    // ── Criar pedido
    const request = await this.prisma.leaveRequest.create({
      data: {
        userId: dto.userId,
        leaveTypeCode: dto.leaveTypeCode,
        leaveType:     dto.leaveTypeCode as any,
        startDate: start,
        endDate: end,
        durationMode: dto.durationMode ?? DurationMode.FULL_DAY,
        hours: dto.hours,
        workDays,
        calendarDays,
        reason: dto.reason,
        status: initialStatus,
        substituteId: dto.substituteId,
        attachments: dto.attachments ?? [],
        impactPreview: impact ? { create: impact } : undefined,
      },
      include: { user: { select: { id: true, fullName: true } } },
    });

    // ── Criar nível de aprovação
    if (initialStatus === LeaveStatus.PENDING) {
      const policy = await this.getApplicablePolicy(dto.userId);
      await this.createApprovalFlow(request.id, dto.userId, policy);
    }

    // ── Se auto-aprovado, deduzir saldo
    if (initialStatus === LeaveStatus.APPROVED) {
      await this.deductBalance(dto.userId, dto.leaveTypeCode, workDays, dto.durationMode, request.id);
      await this.notifyUser(dto.userId, 'LEAVE_AUTO_APPROVED', `A sua ${leaveType.name} foi aprovada automaticamente`);
    } else {
      await this.notifyUser(dto.userId, 'LEAVE_SUBMITTED', `Pedido de ${leaveType.name} submetido com sucesso`);
    }

    await this.audit.log({ action: 'LEAVE_CREATED', entityType: 'LeaveRequest', entityId: request.id, userId: createdById, metadata: {} });

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
    const approval = await this.prisma.leaveApproval.findFirst({
      where: { requestId, approverId, decidedAt: null },
    });
    if (!approval) throw new ForbiddenException('Não tem permissão para aprovar este pedido');

    if (dto.action === ApprovalAction.DELEGATE) {
      if (!dto.delegateToId) throw new BadRequestException('Indique o delegado');
      return this.delegateApproval(approval.id, dto.delegateToId, dto.notes);
    }

    // Registar decisão
    await this.prisma.leaveApproval.update({
      where: { id: approval.id },
      data: {
        decision: dto.action,
        notes: dto.notes,
        decidedAt: new Date(),
      },
    });

    if (dto.action === ApprovalAction.REJECT || dto.action === ApprovalAction.ESCALATE) {
      const newStatus = dto.action === ApprovalAction.REJECT ? LeaveStatus.REJECTED : LeaveStatus.PENDING;
      await this.prisma.leaveRequest.update({ where: { id: requestId }, data: { status: newStatus } });

      if (dto.action === ApprovalAction.REJECT) {
        await this.notifyUser(request.userId, 'LEAVE_REJECTED', `O seu pedido de licença foi rejeitado`);
      } else {
        // Escalar para próximo nível
        await this.escalateApproval(requestId, approval.level);
      }
      await this.audit.log({ action: `LEAVE_${dto.action}`, entityType: 'LeaveRequest', entityId: requestId, userId: approverId });
      return this.findOne(requestId);
    }

    // APPROVE — verificar se todos os níveis aprovaram
    const remainingApprovals = await this.prisma.leaveApproval.count({
      where: { requestId, decidedAt: null },
    });

    if (remainingApprovals === 0) {
      // Todos os níveis aprovaram
      await this.prisma.leaveRequest.update({
        where: { id: requestId },
        data: { status: LeaveStatus.APPROVED, finalApprovedAt: new Date() },
      });

      await this.deductBalance(request.userId, (request as any).leaveTypeCode, request.workDays, (request as any).durationMode, requestId);
      await this.applyModuleImpacts(request);
      await this.notifyUser(request.userId, 'LEAVE_APPROVED', `O seu pedido foi aprovado!`);
      await this.audit.log({ action: 'LEAVE_APPROVED', entityType: 'LeaveRequest', entityId: requestId, userId: approverId });
    }

    return this.findOne(requestId);
  }

  async bulkApprove(dto: BulkApproveDto, approverId: number) {
    const results = await Promise.allSettled(
      dto.requestIds.map(id =>
        this.processApproval(id, approverId, { action: dto.action, notes: dto.notes })
      )
    );
    return {
      success: results.filter(r => r.status === 'fulfilled').length,
      failed:  results.filter(r => r.status === 'rejected').length,
      total:   results.length,
    };
  }

  async cancel(requestId: number, userId: number) {
    const request = await this.findOne(requestId);

    if (request.userId !== userId) throw new ForbiddenException('Sem permissão para cancelar este pedido');
    if (![LeaveStatus.PENDING, LeaveStatus.DRAFT, LeaveStatus.APPROVED].includes(request.status as LeaveStatus)) {
      throw new BadRequestException('Este pedido não pode ser cancelado');
    }

    const wasApproved = request.status === LeaveStatus.APPROVED;
    await this.prisma.leaveRequest.update({ where: { id: requestId }, data: { status: LeaveStatus.CANCELLED } });

    // Devolver saldo se estava aprovado
    if (wasApproved) {
      await this.returnBalance(userId, (request as any).leaveTypeCode, request.workDays, (request as any).durationMode, requestId);
      await this.reverseModuleImpacts(request);
    }

    // Cancelar aprovações pendentes
    await this.prisma.leaveApproval.updateMany({
      where: { requestId, decidedAt: null },
      data: { decision: 'CANCELLED', decidedAt: new Date() },
    });

    await this.notifyUser(userId, 'LEAVE_CANCELLED', 'O seu pedido foi cancelado');
    await this.audit.log({ action: 'LEAVE_CANCELLED', entityType: 'LeaveRequest', entityId: requestId, userId });

    return { message: 'Pedido cancelado com sucesso' };
  }

  // ══════════════════════════════════════════════════════════════════
  // BALANCE
  // ══════════════════════════════════════════════════════════════════

  async getBalance(userId: number) {
    const balances = await this.prisma.leaveBalance.findMany({
      where: { userId },
    });

    // Saldo futuro: incluir pedidos pendentes/aprovados futuros
    const future = await this.prisma.leaveRequest.findMany({
      where: {
        userId,
        status: { in: [LeaveStatus.PENDING, LeaveStatus.APPROVED] },
        startDate: { gt: new Date() },
      },
      select: { leaveTypeCode: true, workDays: true, status: true },
    });

    return balances.map(b => {
     const pendingDays    = future.filter(f => f.leaveTypeCode === (b.leaveType as string) && f.status === LeaveStatus.PENDING).reduce((a, f) => a + (f.workDays ?? 0), 0);
     const approvedFuture = future.filter(f => f.leaveTypeCode === (b.leaveType as string) && f.status === LeaveStatus.APPROVED).reduce((a, f) => a + (f.workDays ?? 0), 0);
      return {
        ...b,
        pendingDays,
        futureBalance: b.balance - approvedFuture,
        effectiveBalance: b.balance - pendingDays - approvedFuture,
      };
    });
  }

  async updateBalance(userId: number, dto: UpdateBalanceDto, updatedById: number) {
    const leaveType = await (this.prisma as any).leaveTypeConfig.findUnique({ where: { code: dto.leaveTypeCode } });
    if (!leaveType) throw new NotFoundException(`Tipo "${dto.leaveTypeCode}" não encontrado`);

    const updated = await this.prisma.leaveBalance.upsert({
      where: { userId_leaveType: { userId, leaveType: dto.leaveTypeCode as any } },
      create: { userId, leaveType: dto.leaveTypeCode as any, balance: dto.balance, used: 0 },
      update: { balance: dto.balance },
    });

    await this.prisma.leaveBalanceHistory.create({
      data: {
        userId,
        leaveType: dto.leaveTypeCode as any,
        balanceBefore: 0,
        balanceAfter: dto.balance,
        change: dto.balance,
        reason: dto.reason ?? 'Actualização manual',
        updatedById,
      },
    });

    return updated;
  }

  async accrueBalance(dto: AccrueBalanceDto, updatedById: number) {
    const results = await Promise.allSettled(
      dto.userIds.map(userId =>
        this.prisma.leaveBalance.upsert({
          where: { userId_leaveType: { userId, leaveType: dto.leaveTypeCode as any } },
          create: { userId, leaveType: dto.leaveTypeCode as any, balance: dto.days, used: 0 },
          update: { balance: { increment: dto.days } },
        })
      )
    );
    return { accrued: results.filter(r => r.status === 'fulfilled').length, total: results.length };
  }

  async initializeUserBalances(userId: number) {
    const leaveTypes = await (this.prisma as any).leaveTypeConfig.findMany({ where: { active: true, annualLimit: { gt: 0 } } });

    await this.prisma.leaveBalance.createMany({
      data: leaveTypes.map((lt: any) => ({
        userId,
        leaveTypeCode: lt.code,
        balance: lt.annualLimit ?? 0,
        used: 0,
      })),
      skipDuplicates: true,
    });
  }

  async processCarryOver(year: number) {
    const leaveTypes = await (this.prisma as any).leaveTypeConfig.findMany({ where: { allowCarryOver: true } });
    const results: any[] = [];

    for (const lt of leaveTypes) {
      const balances = await this.prisma.leaveBalance.findMany({ where: { leaveType: lt.code as any } });
      for (const b of balances) {
        const carryOver = Math.min(b.balance, lt.carryOverLimit ?? b.balance);
        const newBalance = (lt.annualLimit ?? 0) + carryOver;

        await this.prisma.leaveBalance.update({
         where: { userId_leaveType: { userId: b.userId, leaveType: lt.code as any } },
         data:  { balance: lt.annualLimit ?? 0, used: 0 },
       });

        results.push({ userId: b.userId, code: lt.code, carryOver, newBalance });
      }
    }

    return { processed: results.length, results };
  }

  async getBalanceHistory(userId: number, leaveTypeCode?: string) {
    const where: any = { userId };
    if (leaveTypeCode) where.leaveTypeCode = leaveTypeCode;
    return this.prisma.leaveBalanceHistory.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  // ══════════════════════════════════════════════════════════════════
  // CALENDAR
  // ══════════════════════════════════════════════════════════════════

  async getCalendar(filters: CalendarFilterDto) {
    const year  = filters.year  ?? new Date().getFullYear();
    const from  = filters.month
      ? new Date(year, filters.month - 1, 1)
      : new Date(year, 0, 1);
    const to    = filters.month
      ? new Date(year, filters.month, 0, 23, 59, 59)
      : new Date(year, 11, 31, 23, 59, 59);

    const where: any = {
      status: { in: [LeaveStatus.APPROVED, LeaveStatus.PENDING] },
      OR: [
        { startDate: { gte: from, lte: to } },
        { endDate: { gte: from, lte: to } },
        { startDate: { lte: from }, endDate: { gte: to } },
      ],
    };

    if (filters.department) where.user = { employee: { department: { contains: filters.department, mode: 'insensitive' } } };
    if (filters.leaveTypeCode) where.leaveTypeCode = filters.leaveTypeCode;

    const requests = await this.prisma.leaveRequest.findMany({
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
  const end   = new Date(endDate);

  // FIX: buscar departamento do user antes do Promise.all (User não tem relação employee)
  const currentUser = await this.prisma.user.findUnique({
    where:  { id: userId },
    select: { departmentId: true },
  });
  const userDeptId = currentUser?.departmentId;

  const [teamConflicts, userConflicts] = await Promise.all([
    this.prisma.leaveRequest.findMany({
      where: {
        status: { in: [LeaveStatus.APPROVED, LeaveStatus.PENDING] },
        user:   userDeptId ? { departmentId: userDeptId } : {},
        OR: [
          { startDate: { gte: start, lte: end } },
          { endDate:   { gte: start, lte: end } },
        ],
        userId: { not: userId },
      },
      include: { user: { select: { id: true, fullName: true } } },
    }),
    this.prisma.leaveRequest.findMany({
      where: {
        userId,
        status: { in: [LeaveStatus.APPROVED, LeaveStatus.PENDING] },
        OR: [
          { startDate: { gte: start, lte: end } },
          { endDate:   { gte: start, lte: end } },
        ],
      },
    }),
  ]);

  const policy      = await this.getApplicablePolicy(userId);
  const maxAbsent   = policy?.maxAbsencePercent ?? 30;

  return {
    hasUserConflict:    userConflicts.length > 0,
    userConflicts,
    teamConflicts,
    teamConflictCount:  teamConflicts.length,
    warningThreshold:   maxAbsent,
    isAtRisk:           teamConflicts.length > 0,
  };
}

  // ══════════════════════════════════════════════════════════════════
  // ANALYTICS
  // ══════════════════════════════════════════════════════════════════

  async getDashboard(department?: string) {
    const now   = new Date();
    const year  = now.getFullYear();
    const from  = new Date(year, 0, 1);
    const to    = new Date(year, 11, 31);
    const where: any = { startDate: { gte: from, lte: to } };
    if (department) where.user = { employee: { department: { contains: department, mode: 'insensitive' } } };

    const [allRequests, pending, approved, activeNow] = await Promise.all([
      this.prisma.leaveRequest.findMany({ where }),
      this.prisma.leaveRequest.count({ where: { ...where, status: LeaveStatus.PENDING } }),
      this.prisma.leaveRequest.count({ where: { ...where, status: LeaveStatus.APPROVED } }),
      this.prisma.leaveRequest.count({
        where: { status: LeaveStatus.APPROVED, startDate: { lte: now }, endDate: { gte: now } },
      }),
    ]);

    const totalWorkDays = allRequests.filter(r => r.status === LeaveStatus.APPROVED).reduce((a, r) => a + (r.workDays ?? 0), 0);
    const byType = allRequests.reduce((acc: any, r) => {
      const code = r.leaveTypeCode ?? r.leaveType as string;
      if (!code) return acc;
      if (!acc[code]) acc[code] = { code, count: 0, days: 0 };
      acc[code].count++;
      acc[code].days += r.workDays ?? 0;
      return acc;
    }, {});

    const byMonth = Array.from({ length: 12 }, (_, i) => {
      const monthRequests = allRequests.filter(r => new Date(r.startDate).getMonth() === i && r.status === LeaveStatus.APPROVED);
      return { month: i + 1, count: monthRequests.length, days: monthRequests.reduce((a, r) => a + (r.workDays ?? 0), 0) };
    });

    return {
      year,
      kpis: { pending, approved, activeNow, totalWorkDays },
      byType: Object.values(byType),
      byMonth,
    };
  }

  async getAbsenteeismReport(from: string, to: string, department?: string) {
    const where: any = {
      status: LeaveStatus.APPROVED,
      startDate: { gte: new Date(from), lte: new Date(to) },
    };
    if (department) where.user = { department: { name: { contains: department, mode: 'insensitive' } } };

    const records = await this.prisma.leaveRequest.findMany({
      where,
      include: {
      user: { select: { id: true, fullName: true } },
      },
    });

    const byUser = records.reduce((acc: any, r) => {
      const uid = r.userId;
      if (!acc[uid]) acc[uid] = { userId: uid, fullName: (r as any).user?.fullName, totalDays: 0, requests: 0 };
      acc[uid].totalDays += r.workDays ?? 0;
      acc[uid].requests++;
      return acc;
    }, {});

    const workDaysInPeriod = countWorkDays(new Date(from), new Date(to));

    return Object.values(byUser).map((u: any) => ({
      ...u,
      absenteeismRate: workDaysInPeriod > 0 ? +((u.totalDays / workDaysInPeriod) * 100).toFixed(1) : 0,
    })).sort((a: any, b: any) => b.totalDays - a.totalDays);
  }

  // ══════════════════════════════════════════════════════════════════
  // HELPER PRIVADOS
  // ══════════════════════════════════════════════════════════════════

  private calculateDuration(start: Date, end: Date, mode?: DurationMode, hours?: number, workDaysOnly = true) {
    const calendarDays = countCalendarDays(start, end);
    let workDays = workDaysOnly ? countWorkDays(start, end) : calendarDays;

    if (mode === DurationMode.HALF_AM || mode === DurationMode.HALF_PM) workDays = 0.5;
    if (mode === DurationMode.HOURS && hours) workDays = +(hours / 8).toFixed(2);

    return { workDays, calendarDays };
  }

  private async runValidations(
    userId: number,
    leaveType: any,
    start: Date,
    end: Date,
    workDays: number,
    mode?: DurationMode,
  ) {
    // 1. Antecedência mínima
    if (leaveType.minNoticeDays) {
      const noticeDays = countWorkDays(new Date(), start);
      if (noticeDays < leaveType.minNoticeDays) {
        throw new BadRequestException(`Este tipo de licença requer ${leaveType.minNoticeDays} dias de antecedência`);
      }
    }

    // 2. Máximo de dias consecutivos
    if (leaveType.maxConsecutiveDays && workDays > leaveType.maxConsecutiveDays) {
      throw new BadRequestException(`Máximo de ${leaveType.maxConsecutiveDays} dias consecutivos para este tipo`);
    }

    // 3. Saldo disponível
    if (leaveType.annualLimit) {
      const balance = await this.prisma.leaveBalance.findUnique({
       where: { userId_leaveType: { userId, leaveType: leaveType as any } },
      });
      const available = balance?.balance ?? 0;
      if (workDays > available) {
        throw new BadRequestException(`Saldo insuficiente: tem ${available} dias disponíveis, solicitou ${workDays}`);
      }
    }

    // 4. Blackout periods
    const policy = await this.getApplicablePolicy(userId);
    if (policy?.blackoutPeriods) {
      for (const bp of policy.blackoutPeriods as any[]) {
        const bpStart = new Date(bp.startDate);
        const bpEnd   = new Date(bp.endDate);
        if (start <= bpEnd && end >= bpStart) {
          if (!bp.leaveTypeCodes?.length || bp.leaveTypeCodes.includes(leaveType.code)) {
            throw new BadRequestException(`Período bloqueado: ${bp.label} (${bp.startDate} a ${bp.endDate})`);
          }
        }
      }
    }

    // 5. Conflito próprio
    const selfConflict = await this.prisma.leaveRequest.findFirst({
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
      throw new ConflictException('Já existe um pedido aprovado/pendente que sobrepõe este período');
    }
  }

  private async createApprovalFlow(requestId: number, userId: number, policy: any) {
    const levels = policy?.approvalLevels ?? 1;
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    const managerId = (user as any)?.employee?.managerId;

    const approvals: any[] = [];

    // Nível 1: gestor direto
    if (managerId) approvals.push({ requestId, approverId: managerId, level: 1 });

    // Nível 2+: RH (buscar por role)
    if (levels >= 2) {
     const hr = await this.prisma.user.findFirst({ where: { roleCode: 'RH' } as any });
      if (hr) approvals.push({ requestId, approverId: hr.id, level: 2 });
    }

    if (approvals.length === 0) {
      // Sem gestor configurado — auto-aprovar
      await this.prisma.leaveRequest.update({ where: { id: requestId }, data: { status: LeaveStatus.APPROVED } });
    } else {
      await this.prisma.leaveApproval.createMany({ data: approvals });
      // Notificar primeiro aprovador
      await this.notifyUser(approvals[0].approverId, 'LEAVE_PENDING_APPROVAL', 'Novo pedido de licença aguarda a sua aprovação');
    }
  }

  private async escalateApproval(requestId: number, currentLevel: number) {
    const nextApproval = await this.prisma.leaveApproval.findFirst({
      where: { requestId, level: { gt: currentLevel }, decidedAt: null },
    });
    if (nextApproval) {
      await this.notifyUser(nextApproval.approverId, 'LEAVE_ESCALATED', 'Pedido de licença escalado para aprovação');
    }
  }

  private async delegateApproval(approvalId: number, delegateToId: number, notes?: string) {
    return this.prisma.leaveApproval.update({
      where: { id: approvalId },
      data: { approverId: delegateToId, notes: notes ?? 'Delegado', decidedAt: null },
    });
  }

  private async deductBalance(userId: number, leaveTypeCode: string, workDays: number, mode?: DurationMode, requestId?: number) {
    const current = await this.prisma.leaveBalance.findUnique({
      where: { userId_leaveType: { userId, leaveType: leaveTypeCode as any } },
    });
    const balanceBefore = current?.balance ?? 0;
    const balanceAfter  = Math.max(0, balanceBefore - workDays);

    await this.prisma.leaveBalance.upsert({
      where: { userId_leaveType: { userId, leaveType: leaveTypeCode as any } },
      create: { userId, leaveType: leaveTypeCode as any, balance: balanceAfter, used: workDays },
      update: { balance: { decrement: workDays }, used: { increment: workDays } },
    });

    await this.prisma.leaveBalanceHistory.create({
      data: {
        userId, leaveType: leaveTypeCode as any,
        balanceBefore, balanceAfter,
        change: -workDays,
        reason: 'Licença aprovada',
        requestId,
        updatedById: userId,
      },
    });
  }

  private async returnBalance(userId: number, leaveTypeCode: string, workDays: number, mode?: DurationMode, requestId?: number) {
    const current = await this.prisma.leaveBalance.findUnique({
      where: { userId_leaveType: { userId, leaveType: leaveTypeCode as any } },
    });
    const balanceBefore = current?.balance ?? 0;
    const balanceAfter  = balanceBefore + workDays;

    await this.prisma.leaveBalance.update({
      where: { userId_leaveType: { userId, leaveType: leaveTypeCode as any } },
      data: { balance: { increment: workDays }, used: { decrement: workDays } },
    });

    await this.prisma.leaveBalanceHistory.create({
      data: {
        userId,
        leaveType:     leaveTypeCode as any,
        balanceBefore,
        balanceAfter,
        change:        workDays,
        reason:        'Cancelamento de licença',
        requestId,
        updatedById:   userId,
      },
    });
  }

  private async calculateImpact(userId: number, start: Date, end: Date) {
    // Cursos activos no período
    const activeCourses = await (this.prisma as any).enrollment?.findMany?.({
      where: { userId, completedAt: null },
      include: { course: { select: { id: true, title: true } } },
    }).catch(() => []) ?? [];

    // Eventos no período
    const events = await (this.prisma as any).eventParticipant?.findMany?.({
      where: { userId, event: { startDate: { gte: start, lte: end } } },
      include: { event: { select: { id: true, title: true, startDate: true } } },
    }).catch(() => []) ?? [];

    if (activeCourses.length === 0 && events.length === 0) return null;

    return { affectedCourses: activeCourses.length, affectedEvents: events.length, notes: `${activeCourses.length} curso(s) e ${events.length} evento(s) no período` };
  }

  private async applyModuleImpacts(request: any) {
    try {
      await (this.prisma as any).enrollment?.updateMany?.({
        where: { userId: request.userId, completedAt: null },
        data: { pausedAt: new Date() },
      });
    } catch {}
  }

  private async reverseModuleImpacts(request: any) {
    try {
      await (this.prisma as any).enrollment?.updateMany?.({
        where: { userId: request.userId, pausedAt: { not: null } },
        data: { pausedAt: null },
      });
    } catch {}
  }

  private async notifyUser(userId: number, type: string, message: string) {
    try {
      await this.prisma.notificationLog.create({
        data: { userId, type, message, success: true },
      });
    } catch {}
  }
}

