// ─── src/leave-management/leave-planning.service.ts ──────────────────────────
// Aba Planeamento de Equipas (docs/Modulo_Leave.md §8): disponibilidade por
// equipa (departamento), cobertura mínima, sobreposições, conflitos de pedidos
// pendentes com períodos críticos e alertas de falta de cobertura. Só leitura:
// o sistema avisa mas nunca recusa um pedido por si — essa decisão é do
// aprovador, salvo política aprovada que a automatize.
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CurrentUserData } from '../common/types/current-user';
import { isPrivileged } from '../common/authz/ownership';
import { AbsenceJustificationStatus, LeaveStatus, PlanningFilterDto } from './leave-management.dto';
import { getWorkWeekDays, holidaysInRange } from './leave-calendar.helper';
import { LeaveSettingsService } from './leave-settings.service';
import { VACATION_CODE } from './leave-overview.service';
import { leaveScopeOf, leaveUserFilter, ORG_WIDE_ROLES } from './leave-scope.helper';

const DAY_MS = 24 * 3600 * 1000;
const MAX_RANGE_DAYS = 186;
const MAX_LISTED = 100;

const dayKey = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * DAY_MS);
// Semana de trabalho configurável (§10) — dias fora dela contam como fim de semana.
const isWeekend = (d: Date) => !getWorkWeekDays().includes(d.getUTCDay());
const dayUtc = (d: Date | string) =>
  new Date(`${(typeof d === 'string' ? d : d.toISOString()).slice(0, 10)}T00:00:00.000Z`);

interface BlackoutPeriod {
  label: string;
  startDate: string;
  endDate: string;
  leaveTypeCodes?: string[];
}

export function parseBlackouts(raw: unknown): BlackoutPeriod[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (b): b is BlackoutPeriod =>
      !!b &&
      typeof b.label === 'string' &&
      typeof b.startDate === 'string' &&
      typeof b.endDate === 'string',
  );
}

@Injectable()
export class LeavePlanningService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: LeaveSettingsService,
  ) {}

  async getPlanning(filters: PlanningFilterDto, viewer: CurrentUserData) {
    const now = new Date();
    const today = dayUtc(now);
    const from = filters.from
      ? dayUtc(filters.from)
      : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    let to = filters.to
      ? dayUtc(filters.to)
      : new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + 2, 0));
    if (to < from) to = from;
    // Limita o intervalo para o cálculo dia-a-dia não crescer sem limite.
    if (to.getTime() - from.getTime() > MAX_RANGE_DAYS * DAY_MS) {
      to = addDays(from, MAX_RANGE_DAYS);
    }
    const userWhere = leaveUserFilter(viewer, filters);
    const org = isPrivileged(viewer, ORG_WIDE_ROLES);

    const userSelect = {
      id: true,
      fullName: true,
      departmentId: true,
      department: { select: { name: true } },
    } as const;

    const [approved, pending, absences, headcounts, departments, policies, types] =
      await Promise.all([
        this.prisma.read.leaveRequest.findMany({
          where: {
            user: userWhere,
            status: LeaveStatus.APPROVED,
            startDate: { lte: to },
            endDate: { gte: from },
          },
          select: {
            id: true,
            userId: true,
            leaveTypeCode: true,
            startDate: true,
            endDate: true,
            user: { select: userSelect },
          },
        }),
        this.prisma.read.leaveRequest.findMany({
          where: {
            user: userWhere,
            status: LeaveStatus.PENDING,
            startDate: { lte: to },
            endDate: { gte: from },
          },
          select: {
            id: true,
            userId: true,
            leaveTypeCode: true,
            startDate: true,
            endDate: true,
            workDays: true,
            substituteId: true,
            createdAt: true,
            user: { select: userSelect },
          },
          orderBy: { createdAt: 'asc' },
        }),
        this.prisma.read.absenceRecord.findMany({
          where: {
            user: userWhere,
            justificationStatus: AbsenceJustificationStatus.VALIDATED,
            date: { gte: from, lte: to },
          },
          select: { userId: true, date: true, user: { select: userSelect } },
        }),
        this.prisma.read.user.groupBy({
          by: ['departmentId'],
          where: { AND: [userWhere, { hrStatus: { not: 'TERMINATED' } }] },
          _count: { _all: true },
        }),
        this.prisma.read.department.findMany({ select: { id: true, name: true } }),
        this.prisma.read.leavePolicy.findMany({
          where: { active: true },
          select: { department: true, maxAbsencePercent: true, blackoutPeriods: true },
        }),
        this.prisma.read.leaveTypeConfig.findMany({ select: { code: true, name: true } }),
      ]);

    const defaultMaxPercent = (await this.settings.current()).defaultMaxAbsencePercent;
    const typeName = new Map(types.map(t => [t.code, t.name]));
    const deptName = new Map(departments.map(d => [d.id, d.name]));
    const headcountOf = new Map(headcounts.map(h => [h.departmentId, h._count._all]));
    const holidayKeys = new Set(holidaysInRange(from, to).map(h => h.date));
    const globalPolicy = policies.find(p => !p.department);
    const policyFor = (departmentId: number | null) => {
      const name = departmentId ? deptName.get(departmentId) : undefined;
      return policies.find(p => p.department && p.department === name) ?? globalPolicy;
    };
    const maxAbsentPercent = (departmentId: number | null) =>
      policyFor(departmentId)?.maxAbsencePercent ?? defaultMaxPercent;
    const blackoutsFor = (departmentId: number | null) => [
      ...parseBlackouts(globalPolicy?.blackoutPeriods),
      ...(() => {
        const p = policyFor(departmentId);
        return p && p !== globalPolicy ? parseBlackouts(p.blackoutPeriods) : [];
      })(),
    ];

    // Dias úteis do intervalo
    const workingDays: Date[] = [];
    for (let d = from; d <= to; d = addDays(d, 1)) {
      if (!isWeekend(d) && !holidayKeys.has(dayKey(d))) workingDays.push(d);
    }

    interface DeptDay {
      approved: Set<number>;
      pending: Set<number>;
    }
    const grid = new Map<string, Map<number | null, DeptDay>>();
    const cell = (k: string, dept: number | null) => {
      const byDept = grid.get(k) ?? new Map<number | null, DeptDay>();
      const c = byDept.get(dept) ?? { approved: new Set<number>(), pending: new Set<number>() };
      byDept.set(dept, c);
      grid.set(k, byDept);
      return c;
    };
    const spread = (
      start: Date,
      end: Date,
      dept: number | null,
      userId: number,
      kind: keyof DeptDay,
    ) => {
      const s = dayUtc(start) < from ? from : dayUtc(start);
      const e = dayUtc(end) > to ? to : dayUtc(end);
      for (let d = s; d <= e; d = addDays(d, 1)) {
        const k = dayKey(d);
        if (isWeekend(d) || holidayKeys.has(k)) continue;
        cell(k, dept)[kind].add(userId);
      }
    };
    for (const l of approved)
      spread(l.startDate, l.endDate, l.user.departmentId, l.userId, 'approved');
    for (const a of absences) spread(a.date, a.date, a.user.departmentId, a.userId, 'approved');
    for (const l of pending)
      spread(l.startDate, l.endDate, l.user.departmentId, l.userId, 'pending');

    // ── Equipas (departamentos com colaboradores no âmbito)
    const deptIds = [...new Set([...headcountOf.keys()])];
    const teams = deptIds
      .map(departmentId => {
        const headcount = headcountOf.get(departmentId) ?? 0;
        const maxAbsent = maxAbsentPercent(departmentId);
        const minAvailability = 100 - maxAbsent;
        const minPeople = Math.ceil((headcount * minAvailability) / 100);
        let sumAvail = 0;
        let worst = 100;
        let belowDays = 0;
        let projectedBelowDays = 0;
        const days = workingDays.map(d => {
          const c = grid.get(dayKey(d))?.get(departmentId);
          const absent = c?.approved.size ?? 0;
          const projectedAbsent = new Set([...(c?.approved ?? []), ...(c?.pending ?? [])]).size;
          const availability = headcount
            ? Math.round(((headcount - absent) / headcount) * 100)
            : 100;
          const projected = headcount
            ? Math.round(((headcount - projectedAbsent) / headcount) * 100)
            : 100;
          sumAvail += availability;
          worst = Math.min(worst, availability);
          if (availability < minAvailability) belowDays++;
          else if (projected < minAvailability) projectedBelowDays++;
          return {
            date: dayKey(d),
            absent,
            pendingAbsent: projectedAbsent - absent,
            availabilityPercent: availability,
            projectedAvailabilityPercent: projected,
            overlap: absent >= 2,
            belowMinimum: availability < minAvailability,
            projectedBelowMinimum: projected < minAvailability,
          };
        });
        return {
          departmentId,
          department: departmentId ? (deptName.get(departmentId) ?? null) : null,
          headcount,
          minAvailabilityPercent: minAvailability,
          minPeople,
          averageAvailabilityPercent: workingDays.length
            ? Math.round(sumAvail / workingDays.length)
            : 100,
          worstAvailabilityPercent: worst,
          belowMinimumDays: belowDays,
          projectedBelowMinimumDays: projectedBelowDays,
          overlapDays: days.filter(x => x.overlap).length,
          days,
        };
      })
      .sort((a, b) => (a.department ?? '').localeCompare(b.department ?? ''));

    // ── Alertas de falta de cobertura (aprovado + projecção com pendentes)
    const alerts: Array<{
      date: string;
      departmentId: number | null;
      department: string | null;
      absent: number;
      headcount: number;
      availabilityPercent: number;
      minAvailabilityPercent: number;
      causedByPending: boolean;
    }> = [];
    for (const t of teams) {
      for (const d of t.days) {
        if (!d.belowMinimum && !d.projectedBelowMinimum) continue;
        if (alerts.length >= MAX_LISTED) break;
        alerts.push({
          date: d.date,
          departmentId: t.departmentId,
          department: t.department,
          absent: d.absent + d.pendingAbsent,
          headcount: t.headcount,
          availabilityPercent: d.projectedAvailabilityPercent,
          minAvailabilityPercent: t.minAvailabilityPercent,
          causedByPending: !d.belowMinimum,
        });
      }
    }
    alerts.sort((a, b) => a.date.localeCompare(b.date));

    // ── Pedidos pendentes e respectivos conflitos
    const substituteIds = [
      ...new Set(pending.map(p => p.substituteId).filter((i): i is number => !!i)),
    ];
    const substitutes = substituteIds.length
      ? await this.prisma.read.user.findMany({
          where: { id: { in: substituteIds } },
          select: { id: true, fullName: true },
        })
      : [];
    const substituteName = new Map(substitutes.map(s => [s.id, s.fullName]));

    const pendingRequests = pending.slice(0, MAX_LISTED).map(p => {
      const dept = p.user.departmentId;
      const headcount = headcountOf.get(dept) ?? 0;
      const minAvailability = 100 - maxAbsentPercent(dept);
      const breachDates: string[] = [];
      const overlapWith = new Set<number>();
      for (
        let d = dayUtc(p.startDate) < from ? from : dayUtc(p.startDate);
        d <= (dayUtc(p.endDate) > to ? to : dayUtc(p.endDate));
        d = addDays(d, 1)
      ) {
        const k = dayKey(d);
        if (isWeekend(d) || holidayKeys.has(k)) continue;
        const c = grid.get(k)?.get(dept);
        if (!c) continue;
        const total = new Set([...c.approved, ...c.pending]);
        if (headcount && ((headcount - total.size) / headcount) * 100 < minAvailability) {
          breachDates.push(k);
        }
        [...c.approved, ...c.pending].forEach(u => u !== p.userId && overlapWith.add(u));
      }
      const blackouts = blackoutsFor(dept).filter(
        b =>
          dayUtc(b.startDate) <= dayUtc(p.endDate) &&
          dayUtc(b.endDate) >= dayUtc(p.startDate) &&
          (!b.leaveTypeCodes?.length || b.leaveTypeCodes.includes(p.leaveTypeCode)),
      );
      const visible = org || p.userId === viewer.id || p.leaveTypeCode === VACATION_CODE;
      return {
        id: p.id,
        user: { id: p.user.id, fullName: p.user.fullName },
        departmentId: dept,
        department: p.user.department?.name ?? null,
        type: visible
          ? { code: p.leaveTypeCode, name: typeName.get(p.leaveTypeCode) ?? p.leaveTypeCode }
          : { code: 'UNAVAILABLE', name: 'Indisponível' },
        startDate: dayKey(p.startDate),
        endDate: dayKey(p.endDate),
        workDays: p.workDays,
        submittedAt: p.createdAt,
        substitute: p.substituteId
          ? { id: p.substituteId, fullName: substituteName.get(p.substituteId) ?? null }
          : null,
        overlappingPeople: overlapWith.size,
        coverageBreachDates: breachDates.slice(0, 20),
        coverageBreachDays: breachDates.length,
        criticalPeriods: blackouts.map(b => b.label),
        hasConflict: breachDates.length > 0 || blackouts.length > 0,
      };
    });

    // ── Disponíveis / ausentes por período (âmbito completo)
    const totalHeadcount = [...headcountOf.values()].reduce((a, b) => a + b, 0);
    const availabilityByDay = workingDays.map(d => {
      const byDept = grid.get(dayKey(d));
      let absent = 0;
      if (byDept) for (const c of byDept.values()) absent += c.approved.size;
      return {
        date: dayKey(d),
        absent,
        available: totalHeadcount - absent,
        availabilityPercent: totalHeadcount
          ? Math.round(((totalHeadcount - absent) / totalHeadcount) * 100)
          : 100,
      };
    });

    // ── Quem está ausente (aprovado), respeitando a privacidade
    const absentPeople = new Map<
      number,
      { userId: number; fullName: string; department: string | null; periods: string[] }
    >();
    for (const l of approved) {
      const entry = absentPeople.get(l.userId) ?? {
        userId: l.userId,
        fullName: l.user.fullName,
        department: l.user.department?.name ?? null,
        periods: [],
      };
      const label =
        org || l.userId === viewer.id || l.leaveTypeCode === VACATION_CODE
          ? (typeName.get(l.leaveTypeCode) ?? l.leaveTypeCode)
          : 'Indisponível';
      entry.periods.push(`${label}: ${dayKey(l.startDate)} → ${dayKey(l.endDate)}`);
      absentPeople.set(l.userId, entry);
    }

    const onLeaveToday = new Set(
      approved
        .filter(l => dayUtc(l.startDate) <= today && dayUtc(l.endDate) >= today)
        .map(l => l.userId),
    ).size;

    return {
      range: { from: dayKey(from), to: dayKey(to) },
      scope: leaveScopeOf(viewer),
      summary: {
        headcount: totalHeadcount,
        absentToday: onLeaveToday,
        approvedRequests: approved.length,
        pendingRequests: pending.length,
        teamsBelowMinimum: teams.filter(t => t.belowMinimumDays > 0).length,
        conflictingRequests: pendingRequests.filter(r => r.hasConflict).length,
      },
      teams,
      availabilityByDay,
      alerts,
      pendingRequests,
      absentPeople: [...absentPeople.values()].slice(0, MAX_LISTED),
      policyNote:
        'Os alertas são informativos — o sistema não recusa pedidos automaticamente por falta de cobertura.',
    };
  }
}
