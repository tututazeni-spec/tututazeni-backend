// ─── src/leave-management/leave-absence-calendar.service.ts ───────────────────
// Aba Calendário de Ausências (docs/Modulo_Leave.md §6): férias, licenças e
// ausências validadas, em vista diária/semanal/mensal/anual, com cobertura por
// departamento e sobreposições. Só leitura; privacidade aplicada no backend —
// quem não é o titular nem ADMIN/RH vê apenas "Férias" ou "Indisponível" e o
// período, nunca o tipo clínico/pessoal nem o motivo.
import { ForbiddenException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CurrentUserData } from '../common/types/current-user';
import { isPrivileged } from '../common/authz/ownership';
import {
  AbsenceCalendarFilterDto,
  AbsenceJustificationStatus,
  CalendarView,
  LeaveStatus,
} from './leave-management.dto';
import { getWorkWeekDays, holidaysInRange } from './leave-calendar.helper';
import { LeaveSettingsService } from './leave-settings.service';
import { VACATION_CODE } from './leave-overview.service';
import {
  canSeeSensitive,
  leaveScopeOf,
  leaveUserFilter,
  ORG_WIDE_ROLES,
  TEAM_ROLES,
} from './leave-scope.helper';

const DAY_MS = 24 * 3600 * 1000;
const MAX_LISTED = 200;
const UNAVAILABLE = { code: 'UNAVAILABLE', name: 'Indisponível', color: '#94A3B8' };

const ABSENCE_LABELS: Record<string, string> = {
  JUSTIFIED_ABSENCE: 'Falta justificada',
  UNJUSTIFIED_ABSENCE: 'Falta injustificada',
  LATE: 'Atraso',
  EARLY_DEPARTURE: 'Saída antecipada',
  PARTIAL_ABSENCE: 'Ausência parcial',
  HEALTH_ABSENCE: 'Ausência por motivo de saúde',
  AUTHORIZED_ABSENCE: 'Ausência autorizada',
  PERSONAL_ABSENCE: 'Ausência por motivo pessoal',
  NO_SHOW: 'Não comparência',
  OTHER: 'Outra ocorrência',
};

const dayKey = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * DAY_MS);
// Semana de trabalho configurável (§10) — dias fora dela contam como fim de semana.
const isWeekend = (d: Date) => !getWorkWeekDays().includes(d.getUTCDay());

function dayUtc(d: Date | string): Date {
  const iso = typeof d === 'string' ? d.slice(0, 10) : d.toISOString().slice(0, 10);
  return new Date(`${iso}T00:00:00.000Z`);
}

export function calendarRange(view: CalendarView, anchor: Date): { from: Date; to: Date } {
  const y = anchor.getUTCFullYear();
  const m = anchor.getUTCMonth();
  switch (view) {
    case CalendarView.DAY:
      return { from: anchor, to: anchor };
    case CalendarView.WEEK: {
      const monday = addDays(anchor, -((anchor.getUTCDay() + 6) % 7));
      return { from: monday, to: addDays(monday, 6) };
    }
    case CalendarView.YEAR:
      return { from: new Date(Date.UTC(y, 0, 1)), to: new Date(Date.UTC(y, 11, 31)) };
    default:
      return { from: new Date(Date.UTC(y, m, 1)), to: new Date(Date.UTC(y, m + 1, 0)) };
  }
}

export interface CalendarEntry {
  id: string;
  kind: 'LEAVE' | 'ABSENCE';
  userId: number;
  userName: string;
  departmentId: number | null;
  department: string | null;
  typeCode: string;
  typeName: string;
  color: string | null;
  startDate: string;
  endDate: string;
  partial: boolean;
  startTime: string | null;
  endTime: string | null;
}

@Injectable()
export class LeaveAbsenceCalendarService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: LeaveSettingsService,
  ) {}

  async getCalendar(filters: AbsenceCalendarFilterDto, viewer: CurrentUserData) {
    const view = filters.view ?? CalendarView.MONTH;
    const now = new Date();
    const anchor = filters.date
      ? dayUtc(filters.date)
      : new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
    const { from, to } = calendarRange(view, anchor);
    const userWhere = leaveUserFilter(viewer, filters);
    const org = isPrivileged(viewer, ORG_WIDE_ROLES);

    const leaveWhere: Prisma.LeaveRequestWhereInput = {
      user: userWhere,
      status: LeaveStatus.APPROVED,
      startDate: { lte: to },
      endDate: { gte: from },
      ...(filters.leaveTypeCode ? { leaveTypeCode: filters.leaveTypeCode } : {}),
    };
    const userSelect = {
      id: true,
      fullName: true,
      departmentId: true,
      department: { select: { name: true } },
    } as const;

    const [leaves, absences, types, headcounts, departments, policies] = await Promise.all([
      this.prisma.read.leaveRequest.findMany({
        where: leaveWhere,
        select: {
          id: true,
          userId: true,
          leaveTypeCode: true,
          startDate: true,
          endDate: true,
          startTime: true,
          endTime: true,
          durationMode: true,
          user: { select: userSelect },
        },
        orderBy: { startDate: 'asc' },
      }),
      // Só ocorrências com justificação validada contam como ausência confirmada.
      filters.leaveTypeCode
        ? Promise.resolve([])
        : this.prisma.read.absenceRecord.findMany({
            where: {
              user: userWhere,
              justificationStatus: AbsenceJustificationStatus.VALIDATED,
              date: { gte: from, lte: to },
            },
            select: {
              id: true,
              userId: true,
              date: true,
              startTime: true,
              endTime: true,
              occurrenceType: true,
              customCategory: true,
              user: { select: userSelect },
            },
            orderBy: { date: 'asc' },
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
      this.prisma.read.leavePolicy.findMany({
        where: { active: true },
        select: { department: true, maxAbsencePercent: true },
      }),
    ]);

    const typeByCode = new Map(types.map(t => [t.code, t]));
    const entries: CalendarEntry[] = [];

    for (const l of leaves) {
      const t = typeByCode.get(l.leaveTypeCode);
      const visible = org || l.userId === viewer.id || l.leaveTypeCode === VACATION_CODE;
      const shown = visible
        ? { code: l.leaveTypeCode, name: t?.name ?? l.leaveTypeCode, color: t?.color ?? null }
        : UNAVAILABLE;
      entries.push({
        id: `L-${l.id}`,
        kind: 'LEAVE',
        userId: l.userId,
        userName: l.user.fullName,
        departmentId: l.user.departmentId,
        department: l.user.department?.name ?? null,
        typeCode: shown.code,
        typeName: shown.name,
        color: shown.color,
        startDate: dayKey(l.startDate),
        endDate: dayKey(l.endDate),
        partial: l.durationMode !== 'FULL_DAY',
        startTime: l.startTime,
        endTime: l.endTime,
      });
    }
    for (const a of absences) {
      const visible = canSeeSensitive(viewer, a.userId);
      entries.push({
        id: `A-${a.id}`,
        kind: 'ABSENCE',
        userId: a.userId,
        userName: a.user.fullName,
        departmentId: a.user.departmentId,
        department: a.user.department?.name ?? null,
        typeCode: visible ? a.occurrenceType : UNAVAILABLE.code,
        typeName: visible
          ? (a.customCategory ?? ABSENCE_LABELS[a.occurrenceType])
          : UNAVAILABLE.name,
        color: visible ? null : UNAVAILABLE.color,
        startDate: dayKey(a.date),
        endDate: dayKey(a.date),
        partial: !!a.startTime,
        startTime: a.startTime,
        endTime: a.endTime,
      });
    }

    // ── Cobertura e sobreposições (só dias úteis, descontados os feriados)
    const holidays = holidaysInRange(from, to);
    const holidayKeys = new Set(holidays.map(h => h.date));
    const deptName = new Map(departments.map(d => [d.id, d.name]));
    const defaultMax =
      policies.find(p => !p.department)?.maxAbsencePercent ??
      (await this.settings.current()).defaultMaxAbsencePercent;
    const maxFor = (departmentId: number | null) => {
      const name = departmentId ? deptName.get(departmentId) : undefined;
      return (
        policies.find(p => p.department && p.department === name)?.maxAbsencePercent ?? defaultMax
      );
    };
    const headcountOf = new Map(headcounts.map(h => [h.departmentId, h._count._all]));

    const absentByDay = new Map<string, Map<number | null, Set<number>>>();
    for (const e of entries) {
      let cur = dayUtc(e.startDate) < from ? from : dayUtc(e.startDate);
      const last = dayUtc(e.endDate) > to ? to : dayUtc(e.endDate);
      for (; cur <= last; cur = addDays(cur, 1)) {
        const k = dayKey(cur);
        if (isWeekend(cur) || holidayKeys.has(k)) continue;
        const byDept = absentByDay.get(k) ?? new Map<number | null, Set<number>>();
        const set = byDept.get(e.departmentId) ?? new Set<number>();
        set.add(e.userId);
        byDept.set(e.departmentId, set);
        absentByDay.set(k, byDept);
      }
    }

    const days: Record<string, { absent: number; overlap: boolean; lowCoverage: boolean }> = {};
    const alerts: Array<{
      date: string;
      departmentId: number | null;
      department: string | null;
      absent: number;
      headcount: number;
      availabilityPercent: number;
      minAvailabilityPercent: number;
    }> = [];
    const overlaps: Array<{
      date: string;
      departmentId: number | null;
      department: string | null;
      userIds: number[];
    }> = [];

    for (const [date, byDept] of [...absentByDay.entries()].sort(([a], [b]) =>
      a.localeCompare(b),
    )) {
      let absent = 0;
      let overlap = false;
      let lowCoverage = false;
      for (const [departmentId, users] of byDept) {
        absent += users.size;
        const headcount = headcountOf.get(departmentId) ?? 0;
        const department = departmentId ? (deptName.get(departmentId) ?? null) : null;
        if (users.size >= 2) {
          overlap = true;
          if (overlaps.length < MAX_LISTED)
            overlaps.push({ date, departmentId, department, userIds: [...users] });
        }
        const maxAbsent = maxFor(departmentId);
        if (headcount > 0 && (users.size / headcount) * 100 > maxAbsent) {
          lowCoverage = true;
          if (alerts.length < MAX_LISTED)
            alerts.push({
              date,
              departmentId,
              department,
              absent: users.size,
              headcount,
              availabilityPercent: Math.round(((headcount - users.size) / headcount) * 100),
              minAvailabilityPercent: 100 - maxAbsent,
            });
        }
      }
      days[date] = { absent, overlap, lowCoverage };
    }

    return {
      view,
      range: { from: dayKey(from), to: dayKey(to) },
      scope: leaveScopeOf(viewer),
      entries,
      holidays,
      days,
      alerts,
      overlaps,
      canExport: isPrivileged(viewer, [...ORG_WIDE_ROLES, ...TEAM_ROLES]),
    };
  }

  /** CSV das entradas visíveis do período (só gestor/líder/director/RH/ADMIN). */
  async exportCsv(filters: AbsenceCalendarFilterDto, viewer: CurrentUserData) {
    if (!isPrivileged(viewer, [...ORG_WIDE_ROLES, ...TEAM_ROLES]))
      throw new ForbiddenException('Sem permissão para exportar');
    const cal = await this.getCalendar(filters, viewer);
    const cell = (v: unknown) => {
      let t = v === null || v === undefined ? '' : String(v);
      if (/^[=+\-@\t\r]/.test(t)) t = `'${t}`;
      return /[",\n;]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
    };
    const header = [
      'Colaborador',
      'Departamento',
      'Tipo',
      'Início',
      'Fim',
      'Hora início',
      'Hora fim',
    ];
    const lines = cal.entries.map(e =>
      [e.userName, e.department, e.typeName, e.startDate, e.endDate, e.startTime, e.endTime]
        .map(cell)
        .join(';'),
    );
    return {
      filename: `calendario-ausencias-${cal.range.from}_${cal.range.to}.csv`,
      mimeType: 'text/csv',
      content: [header.join(';'), ...lines].join('\n'),
      total: cal.entries.length,
    };
  }
}
