// ─── src/leave-management/leave-overview.service.ts ──────────────────────────
// Visão Geral (dashboard) e aba Férias do módulo Leave
// (docs/Modulo_Leave.md §2 e §3). Só leitura — as escritas continuam em
// LeaveManagementService, para o saldo ter um único ponto de contabilização.
import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CurrentUserData } from '../common/types/current-user';
import { buildPaginatedResponse } from '../common/helpers/pagination.helper';
import { isPrivileged } from '../common/authz/ownership';
import { leaveScopeOf, leaveUserFilter, ORG_WIDE_ROLES, TEAM_ROLES } from './leave-scope.helper';
import { LeaveSettingsService } from './leave-settings.service';
import {
  DurationPreviewDto,
  LeaveStatus,
  OverviewFilterDto,
  VacationFilterDto,
  VacationPlanState,
} from './leave-management.dto';
import { countCalendarDays, countWorkDays, holidaysInRange } from './leave-calendar.helper';

export const VACATION_CODE = 'VACATION';

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

@Injectable()
export class LeaveOverviewService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: LeaveSettingsService,
  ) {}

  private userFilter(
    user: CurrentUserData,
    f: { unitId?: number; departmentId?: number },
  ): Prisma.UserWhereInput {
    return leaveUserFilter(user, f);
  }

  // ══════════════════════════════════════════════════════════════════
  // §2 — VISÃO GERAL
  // ══════════════════════════════════════════════════════════════════

  async getOverview(filters: OverviewFilterDto, user: CurrentUserData) {
    const now = new Date();
    const today = startOfDay(now);
    const from = filters.from ? new Date(filters.from) : new Date(now.getFullYear(), 0, 1);
    const to = filters.to ? new Date(filters.to) : new Date(now.getFullYear(), 11, 31);
    const userWhere = this.userFilter(user, filters);
    const typeFilter = filters.leaveTypeCode ? { leaveTypeCode: filters.leaveTypeCode } : {};

    const [requests, types, headcountByDept, departments, myVacation, pendingCount] =
      await Promise.all([
        this.prisma.read.leaveRequest.findMany({
          where: {
            user: userWhere,
            status: { not: LeaveStatus.DRAFT },
            startDate: { lte: to },
            endDate: { gte: from },
            ...typeFilter,
          },
          select: {
            leaveTypeCode: true,
            status: true,
            startDate: true,
            endDate: true,
            workDays: true,
            user: { select: { departmentId: true } },
          },
        }),
        this.prisma.read.leaveTypeConfig.findMany({
          select: { code: true, name: true, color: true },
        }),
        this.prisma.read.user.groupBy({
          by: ['departmentId'],
          where: { AND: [userWhere, { hrStatus: { not: 'TERMINATED' } }] },
          _count: { _all: true },
        }),
        this.prisma.read.department.findMany({ select: { id: true, name: true } }),
        this.prisma.read.leaveBalance.findUnique({
          where: { userId_leaveTypeCode: { userId: user.id, leaveTypeCode: VACATION_CODE } },
        }),
        this.prisma.read.leaveRequest.count({
          where: { user: userWhere, status: LeaveStatus.PENDING, ...typeFilter },
        }),
      ]);

    const typeInfo = new Map(types.map(t => [t.code, t]));
    const deptName = new Map(departments.map(d => [d.id, d.name]));
    // O filtro de estado só afecta os gráficos; o gráfico "por estado"
    // mostra sempre todos os estados.
    const scoped = filters.status ? requests.filter(r => r.status === filters.status) : requests;
    const approved = scoped.filter(r => r.status === LeaveStatus.APPROVED);

    // ── Cards
    const vacationApproved = approved.filter(r => r.leaveTypeCode === VACATION_CODE);
    const vacationTaken = vacationApproved
      .filter(r => r.endDate < today)
      .reduce((a, r) => a + (r.workDays ?? 0), 0);
    const absences = approved.filter(r => r.leaveTypeCode !== VACATION_CODE);
    const unjustified = absences.filter(r => r.leaveTypeCode === 'UNJUSTIFIED_ABSENCE').length;

    // ── Séries mensais (por mês de início do pedido)
    const months: string[] = [];
    const cursor = new Date(from.getFullYear(), from.getMonth(), 1);
    while (cursor <= to && months.length < 36) {
      months.push(`${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`);
      cursor.setMonth(cursor.getMonth() + 1);
    }
    const monthKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const sumDays = (rs: Array<{ workDays: number | null }>) =>
      rs.reduce((a, r) => a + (r.workDays ?? 0), 0);

    const absencesByMonth = months.map(m => {
      const rows = absences.filter(r => monthKey(r.startDate) === m);
      return { month: m, count: rows.length, days: sumDays(rows) };
    });

    const plannedVsTaken = months.map(m => {
      const rows = vacationApproved.filter(r => monthKey(r.startDate) === m);
      return {
        month: m,
        planned: sumDays(rows),
        taken: sumDays(rows.filter(r => r.endDate < today)),
      };
    });

    // ── Por tipo
    const typeAgg = new Map<string, { code: string; count: number; days: number }>();
    for (const r of approved) {
      const a = typeAgg.get(r.leaveTypeCode) ?? { code: r.leaveTypeCode, count: 0, days: 0 };
      a.count++;
      a.days += r.workDays ?? 0;
      typeAgg.set(r.leaveTypeCode, a);
    }
    const byType = [...typeAgg.values()].map(t => ({
      ...t,
      name: typeInfo.get(t.code)?.name ?? t.code,
      color: typeInfo.get(t.code)?.color ?? null,
    }));

    // ── Absentismo por departamento: ausências (sem férias) ÷ dias úteis previstos
    const expectedDays = countWorkDays(from, to);
    const deptDays = new Map<number | null, number>();
    for (const r of absences) {
      const k = r.user.departmentId;
      deptDays.set(k, (deptDays.get(k) ?? 0) + (r.workDays ?? 0));
    }
    const absenteeismByDepartment = headcountByDept
      .map(h => {
        const days = deptDays.get(h.departmentId) ?? 0;
        const planned = h._count._all * expectedDays;
        return {
          departmentId: h.departmentId,
          department: h.departmentId ? (deptName.get(h.departmentId) ?? '—') : 'Sem departamento',
          headcount: h._count._all,
          absenceDays: days,
          rate: planned > 0 ? +((days / planned) * 100).toFixed(2) : 0,
        };
      })
      .sort((a, b) => b.rate - a.rate);

    // ── Por estado
    const byStatus = Object.values(LeaveStatus)
      .filter(s => s !== LeaveStatus.DRAFT)
      .map(status => ({ status, count: requests.filter(r => r.status === status).length }));

    return {
      period: { from, to },
      scope: leaveScopeOf(user),
      cards: {
        vacationAvailable: myVacation?.balance ?? null,
        pendingRequests: pendingCount,
        vacationTaken,
        absences: {
          total: absences.length,
          justified: absences.length - unjustified,
          unjustified,
        },
      },
      charts: { absencesByMonth, byType, absenteeismByDepartment, plannedVsTaken, byStatus },
    };
  }

  // ══════════════════════════════════════════════════════════════════
  // §3.1 — TABELA DE FÉRIAS
  // ══════════════════════════════════════════════════════════════════

  async getVacations(filters: VacationFilterDto, user: CurrentUserData) {
    const year = filters.year ?? new Date().getFullYear();
    const page = filters.page ?? 1;
    const limit = filters.limit ?? 20;
    const today = startOfDay(new Date());
    const yearStart = new Date(year, 0, 1);
    const yearEnd = new Date(year, 11, 31, 23, 59, 59);

    const and: Prisma.UserWhereInput[] = [
      this.userFilter(user, filters),
      { hrStatus: { not: 'TERMINATED' } },
    ];
    if (filters.search) {
      and.push({
        OR: [
          { fullName: { contains: filters.search, mode: 'insensitive' } },
          { employeeNumber: { contains: filters.search, mode: 'insensitive' } },
        ],
      });
    }
    // O filtro por estado do plano depende dos pedidos do ano, por isso é
    // traduzido para uma condição sobre pedidos em vez de ser aplicado em
    // memória (senão a paginação ficava errada).
    const inYear = { leaveTypeCode: VACATION_CODE, startDate: { gte: yearStart, lte: yearEnd } };
    const open = [LeaveStatus.PENDING, LeaveStatus.DRAFT];
    if (filters.planState === VacationPlanState.NOT_STARTED) {
      and.push({ leaveRequests: { none: { ...inYear, status: { not: LeaveStatus.CANCELLED } } } });
    } else if (filters.planState === VacationPlanState.IN_PREPARATION) {
      and.push({
        leaveRequests: { some: { ...inYear, status: LeaveStatus.DRAFT } },
        NOT: { leaveRequests: { some: { ...inYear, status: LeaveStatus.PENDING } } },
      });
    } else if (filters.planState === VacationPlanState.SUBMITTED) {
      and.push({ leaveRequests: { some: { ...inYear, status: LeaveStatus.PENDING } } });
    } else if (filters.planState === VacationPlanState.APPROVED) {
      and.push({
        leaveRequests: { some: { ...inYear, status: LeaveStatus.APPROVED } },
        NOT: { leaveRequests: { some: { ...inYear, status: { in: open } } } },
      });
    }
    const where: Prisma.UserWhereInput = { AND: and };

    const [users, total, vacationType] = await Promise.all([
      this.prisma.read.user.findMany({
        where,
        orderBy: { fullName: 'asc' },
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          fullName: true,
          employeeNumber: true,
          avatarUrl: true,
          department: { select: { id: true, name: true } },
          unit: { select: { id: true, name: true } },
        },
      }),
      this.prisma.read.user.count({ where }),
      this.prisma.read.leaveTypeConfig.findUnique({ where: { code: VACATION_CODE } }),
    ]);

    const ids = users.map(u => u.id);
    const [balances, requests] = await Promise.all([
      this.prisma.read.leaveBalance.findMany({
        where: { userId: { in: ids }, leaveTypeCode: VACATION_CODE },
      }),
      this.prisma.read.leaveRequest.findMany({
        where: { userId: { in: ids }, ...inYear, status: { not: LeaveStatus.CANCELLED } },
        select: { userId: true, status: true, startDate: true, endDate: true, workDays: true },
        orderBy: { startDate: 'asc' },
      }),
    ]);

    const rows = users.map(u => {
      const bal = balances.find(b => b.userId === u.id);
      const mine = requests.filter(r => r.userId === u.id);
      const approved = mine.filter(r => r.status === LeaveStatus.APPROVED);
      const sum = (rs: typeof mine) => rs.reduce((a, r) => a + (r.workDays ?? 0), 0);
      // O saldo é debitado na aprovação (balance↓, used↑); "reservado" e
      // "gozado" são apenas a repartição dos dias aprovados consoante a
      // ausência já terminou ou não — nunca um segundo débito.
      const taken = sum(approved.filter(r => r.endDate < today));
      const reserved = sum(approved.filter(r => r.endDate >= today));
      const assigned = (bal?.balance ?? 0) + (bal?.used ?? 0);
      const annual = vacationType?.annualLimit ?? 0;
      const carriedOver =
        vacationType?.allowCarryOver && assigned > annual
          ? Math.min(assigned - annual, vacationType.carryOverLimit ?? assigned - annual)
          : 0;
      const next = approved.find(r => r.endDate >= today);
      const planState = mine.some(r => r.status === LeaveStatus.PENDING)
        ? VacationPlanState.SUBMITTED
        : mine.some(r => r.status === LeaveStatus.DRAFT)
          ? VacationPlanState.IN_PREPARATION
          : approved.length
            ? VacationPlanState.APPROVED
            : VacationPlanState.NOT_STARTED;
      return {
        userId: u.id,
        fullName: u.fullName,
        employeeNumber: u.employeeNumber,
        avatarUrl: u.avatarUrl,
        department: u.department,
        unit: u.unit,
        referenceYear: year,
        assignedDays: assigned,
        carriedOverDays: carriedOver,
        reservedDays: reserved,
        takenDays: taken,
        availableDays: bal?.balance ?? 0,
        nextPeriod: next
          ? { startDate: next.startDate, endDate: next.endDate, days: next.workDays }
          : null,
        planState,
      };
    });

    return {
      ...buildPaginatedResponse(rows, total, page, limit),
      // O saldo (LeaveBalance) é corrente, não por ano: só os pedidos, o
      // gozo e o plano respeitam `year`.
      balanceIsCurrent: true,
    };
  }

  // ══════════════════════════════════════════════════════════════════
  // §3.2 — PRÉ-VISUALIZAÇÃO DO PEDIDO (duração, saldo, sobreposições)
  // ══════════════════════════════════════════════════════════════════

  async previewDuration(dto: DurationPreviewDto, user: CurrentUserData) {
    const targetId = dto.userId ?? user.id;
    if (targetId !== user.id && !isPrivileged(user, [...ORG_WIDE_ROLES, ...TEAM_ROLES])) {
      throw new NotFoundException('Recurso não encontrado');
    }
    const start = new Date(dto.startDate);
    const end = new Date(dto.endDate);
    const type = await this.prisma.read.leaveTypeConfig.findUnique({
      where: { code: dto.leaveTypeCode },
    });
    if (!type) throw new NotFoundException(`Tipo de licença "${dto.leaveTypeCode}" não encontrado`);

    // Mesma regra de contagem da submissão (§10): regra da empresa, horas por
    // dia e feriados da localização do colaborador — o preview tem de bater
    // certo com o que o pedido vai guardar.
    const [cfg, target] = await Promise.all([
      this.settings.current(),
      this.prisma.read.user.findUnique({ where: { id: targetId }, select: { workLocation: true } }),
    ]);
    const workDaysOnly =
      cfg.dayCountRule === 'WORK_DAYS'
        ? true
        : cfg.dayCountRule === 'CALENDAR_DAYS'
          ? false
          : type.countWorkDaysOnly;
    const calendarDays = countCalendarDays(start, end);
    let workDays = workDaysOnly ? countWorkDays(start, end, target?.workLocation) : calendarDays;
    if (dto.durationMode === 'HALF_AM' || dto.durationMode === 'HALF_PM') workDays = 0.5;
    if (dto.durationMode === 'HOURS' && dto.hours) {
      workDays = +(dto.hours / cfg.hoursPerDay).toFixed(2);
    }

    const [balance, overlap] = await Promise.all([
      this.prisma.read.leaveBalance.findUnique({
        where: { userId_leaveTypeCode: { userId: targetId, leaveTypeCode: dto.leaveTypeCode } },
      }),
      this.prisma.read.leaveRequest.findFirst({
        where: {
          userId: targetId,
          status: { in: [LeaveStatus.PENDING, LeaveStatus.APPROVED] },
          startDate: { lte: end },
          endDate: { gte: start },
        },
        select: { id: true, startDate: true, endDate: true, status: true },
      }),
    ]);

    return {
      workDays,
      calendarDays,
      holidays: holidaysInRange(start, end, target?.workLocation),
      countsWorkDaysOnly: workDaysOnly,
      // Disponível = atribuído − reservado por pedidos pendentes (§13).
      availableBalance: balance ? balance.balance - balance.reserved : null,
      reservedDays: balance?.reserved ?? 0,
      exceedsBalance:
        !!type.annualLimit && workDays > (balance ? balance.balance - balance.reserved : 0),
      selfOverlap: overlap,
    };
  }
}
