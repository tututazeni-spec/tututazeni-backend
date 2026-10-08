// ─── src/leave-management/leave-reports.service.ts ───────────────────────────
// Aba Relatórios (docs/Modulo_Leave.md §9): 10 relatórios tabulares sobre
// férias, ausências, licenças, aprovações e cobertura, com exportação CSV.
// Todos respeitam o âmbito do utilizador (leaveUserFilter). Só leitura.
//
// Taxa de absentismo = (horas de ausência contabilizáveis ÷ horas de trabalho
// previstas) × 100. O numerador exclui, por omissão, os tipos com
// `countsAsAbsenteeism = false` (férias); `includeCodes` substitui essa regra.
import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CurrentUserData } from '../common/types/current-user';
import {
  AbsenceJustificationStatus,
  AbsenceOccurrenceType,
  LeaveReportFilterDto,
  LeaveReportKind,
  LeaveStatus,
} from './leave-management.dto';
import { countWorkDays } from './leave-calendar.helper';
import { VACATION_CODE } from './leave-overview.service';
import { LeavePlanningService } from './leave-planning.service';
import { leaveUserFilter } from './leave-scope.helper';
import { LeaveSettingsService } from './leave-settings.service';

const HOURS_PER_DAY = 8;
const MAX_ROWS = 1000;
const DAY_MS = 24 * 3600 * 1000;

type Cell = string | number | null;
type ColumnType = 'text' | 'number' | 'percent' | 'date';

export interface ReportColumn {
  key: string;
  label: string;
  type: ColumnType;
}
export interface ReportResult {
  kind: LeaveReportKind;
  title: string;
  description: string;
  formula?: string;
  range: { from: string; to: string };
  columns: ReportColumn[];
  rows: Array<Record<string, Cell>>;
  totals?: Record<string, Cell>;
  truncated: boolean;
}

const col = (key: string, label: string, type: ColumnType = 'text'): ReportColumn => ({
  key,
  label,
  type,
});
const dayKey = (d: Date) => d.toISOString().slice(0, 10);
const round1 = (n: number) => Math.round(n * 10) / 10;
const round2 = (n: number) => Math.round(n * 100) / 100;
const startOfDayUtc = (iso: string) => new Date(`${iso.slice(0, 10)}T00:00:00.000Z`);

const ACTION_LABELS: Record<string, string> = {
  LEAVE_APPROVED: 'Pedido aprovado',
  LEAVE_REJECT: 'Pedido recusado',
  LEAVE_APPROVE: 'Etapa aprovada',
  LEAVE_ESCALATE: 'Pedido escalado',
  LEAVE_CANCELLED: 'Pedido cancelado',
  LEAVE_CREATED: 'Pedido criado',
  LEAVE_APPROVAL_REASSIGNED: 'Aprovação reatribuída',
};

export const REPORT_CATALOG: Array<{
  kind: LeaveReportKind;
  title: string;
  description: string;
  indicators: string;
}> = [
  {
    kind: LeaveReportKind.ANNUAL_VACATION_MAP,
    title: 'Mapa anual de férias',
    description: 'Saldo de férias de cada colaborador no ano.',
    indicators: 'Dias atribuídos, gozados, reservados e disponíveis',
  },
  {
    kind: LeaveReportKind.ABSENCES_BY_DEPARTMENT,
    title: 'Ausências por departamento',
    description: 'Licenças aprovadas e ocorrências por departamento.',
    indicators: 'Número de ocorrências e duração',
  },
  {
    kind: LeaveReportKind.MONTHLY_ABSENTEEISM,
    title: 'Absentismo mensal',
    description: 'Taxa de absentismo mês a mês.',
    indicators: 'Taxa de absentismo por período',
  },
  {
    kind: LeaveReportKind.JUSTIFIED_VS_UNJUSTIFIED,
    title: 'Faltas justificadas vs. injustificadas',
    description: 'Ocorrências de ausência por estado de justificação.',
    indicators: 'Número e duração por categoria',
  },
  {
    kind: LeaveReportKind.LICENSES_BY_TYPE,
    title: 'Licenças por tipo',
    description: 'Pedidos de licença (excluindo férias) por tipo e estado.',
    indicators: 'Quantidade, duração e estado',
  },
  {
    kind: LeaveReportKind.PENDING_REQUESTS,
    title: 'Pedidos pendentes',
    description: 'Aprovações por decidir, com o tempo de espera.',
    indicators: 'Tempo de espera e responsável',
  },
  {
    kind: LeaveReportKind.VACATION_BY_EMPLOYEE,
    title: 'Férias por colaborador',
    description: 'Histórico de férias gozadas dos últimos três anos e saldo actual.',
    indicators: 'Histórico e saldo por ano',
  },
  {
    kind: LeaveReportKind.OPERATIONAL_COVERAGE,
    title: 'Cobertura operacional',
    description: 'Disponibilidade das equipas face ao mínimo definido.',
    indicators: 'Disponibilidade por equipa',
  },
  {
    kind: LeaveReportKind.PAYROLL_IMPACT,
    title: 'Impacto no processamento salarial',
    description: 'Ausências aprovadas não remuneradas ou que exigem validação do Payroll.',
    indicators: 'Registos que necessitam de validação do Payroll',
  },
  {
    kind: LeaveReportKind.REQUEST_AUDIT,
    title: 'Auditoria de pedidos',
    description: 'Criações, decisões, cancelamentos e reatribuições de pedidos.',
    indicators: 'Alterações, decisões, cancelamentos e responsáveis',
  },
];

function csvCell(v: unknown): string {
  let t = v === null || v === undefined ? '' : String(v);
  // Neutraliza fórmulas (CSV injection) em células de texto.
  if (/^[=+\-@\t\r]/.test(t) && Number.isNaN(Number(t))) t = `'${t}`;
  return /[",\n;]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
}

@Injectable()
export class LeaveReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly planning: LeavePlanningService,
    private readonly settings: LeaveSettingsService,
  ) {}

  catalog() {
    return REPORT_CATALOG;
  }

  async run(
    kind: LeaveReportKind,
    filters: LeaveReportFilterDto,
    viewer: CurrentUserData,
  ): Promise<ReportResult> {
    const year = filters.year ?? new Date().getFullYear();
    const from = filters.from ? startOfDayUtc(filters.from) : new Date(Date.UTC(year, 0, 1));
    const to = filters.to ? startOfDayUtc(filters.to) : new Date(Date.UTC(year, 11, 31));
    const ctx: Ctx = {
      year: filters.from ? from.getUTCFullYear() : year,
      from,
      to,
      filters,
      viewer,
      userWhere: leaveUserFilter(viewer, filters),
    };
    const meta = REPORT_CATALOG.find(r => r.kind === kind)!;
    const body = await this.build(kind, ctx);
    const truncated = body.rows.length > MAX_ROWS;
    return {
      kind,
      title: meta.title,
      description: meta.description,
      range: { from: dayKey(from), to: dayKey(to) },
      ...body,
      rows: body.rows.slice(0, MAX_ROWS),
      truncated,
    };
  }

  async exportCsv(kind: LeaveReportKind, filters: LeaveReportFilterDto, viewer: CurrentUserData) {
    const r = await this.run(kind, filters, viewer);
    const lines = [
      r.columns.map(c => csvCell(c.label)).join(';'),
      ...r.rows.map(row => r.columns.map(c => csvCell(row[c.key])).join(';')),
    ];
    if (r.totals) {
      lines.push(r.columns.map(c => csvCell(r.totals![c.key] ?? '')).join(';'));
    }
    return {
      filename: `leave-${kind.toLowerCase()}-${r.range.from}_${r.range.to}.csv`,
      mimeType: 'text/csv',
      content: lines.join('\n'),
      total: r.rows.length,
    };
  }

  // ═══════════════════════════════════════════════════════════════════
  private async build(
    kind: LeaveReportKind,
    c: Ctx,
  ): Promise<Pick<ReportResult, 'columns' | 'rows' | 'totals' | 'formula'>> {
    switch (kind) {
      case LeaveReportKind.ANNUAL_VACATION_MAP:
        return this.annualVacationMap(c);
      case LeaveReportKind.ABSENCES_BY_DEPARTMENT:
        return this.absencesByDepartment(c);
      case LeaveReportKind.MONTHLY_ABSENTEEISM:
        return this.monthlyAbsenteeism(c);
      case LeaveReportKind.JUSTIFIED_VS_UNJUSTIFIED:
        return this.justifiedVsUnjustified(c);
      case LeaveReportKind.LICENSES_BY_TYPE:
        return this.licensesByType(c);
      case LeaveReportKind.PENDING_REQUESTS:
        return this.pendingRequests(c);
      case LeaveReportKind.VACATION_BY_EMPLOYEE:
        return this.vacationByEmployee(c);
      case LeaveReportKind.OPERATIONAL_COVERAGE:
        return this.operationalCoverage(c);
      case LeaveReportKind.PAYROLL_IMPACT:
        return this.payrollImpact(c);
      default:
        return this.requestAudit(c);
    }
  }

  private activeUsers(c: Ctx): Prisma.UserWhereInput {
    return { AND: [c.userWhere, { hrStatus: { not: 'TERMINATED' } }] };
  }

  private async vacationFigures(userIds: number[], year: number) {
    const today = startOfDayUtc(dayKey(new Date()));
    const [balances, requests] = await Promise.all([
      this.prisma.read.leaveBalance.findMany({
        where: { userId: { in: userIds }, leaveTypeCode: VACATION_CODE },
      }),
      this.prisma.read.leaveRequest.findMany({
        where: {
          userId: { in: userIds },
          leaveTypeCode: VACATION_CODE,
          status: LeaveStatus.APPROVED,
          startDate: { gte: new Date(Date.UTC(year, 0, 1)), lte: new Date(Date.UTC(year, 11, 31)) },
        },
        select: { userId: true, endDate: true, workDays: true },
      }),
    ]);
    return (userId: number) => {
      const bal = balances.find(b => b.userId === userId);
      const mine = requests.filter(r => r.userId === userId);
      const sum = (rs: typeof mine) => rs.reduce((a, r) => a + (r.workDays ?? 0), 0);
      return {
        assigned: (bal?.balance ?? 0) + (bal?.used ?? 0),
        taken: sum(mine.filter(r => r.endDate < today)),
        reserved: sum(mine.filter(r => r.endDate >= today)),
        available: bal?.balance ?? 0,
      };
    };
  }

  private async annualVacationMap(c: Ctx) {
    const users = await this.prisma.read.user.findMany({
      where: this.activeUsers(c),
      orderBy: { fullName: 'asc' },
      take: MAX_ROWS + 1,
      select: { id: true, fullName: true, department: { select: { name: true } } },
    });
    const figures = await this.vacationFigures(
      users.map(u => u.id),
      c.year,
    );
    const rows = users.map(u => {
      const f = figures(u.id);
      return {
        user: u.fullName,
        department: u.department?.name ?? null,
        assigned: f.assigned,
        taken: f.taken,
        reserved: f.reserved,
        available: f.available,
      };
    });
    const sum = (k: 'assigned' | 'taken' | 'reserved' | 'available') =>
      round1(rows.reduce((a, r) => a + r[k], 0));
    return {
      columns: [
        col('user', 'Colaborador'),
        col('department', 'Departamento'),
        col('assigned', 'Atribuídos', 'number'),
        col('taken', 'Gozados', 'number'),
        col('reserved', 'Reservados', 'number'),
        col('available', 'Disponíveis', 'number'),
      ],
      rows,
      totals: {
        user: 'Total',
        assigned: sum('assigned'),
        taken: sum('taken'),
        reserved: sum('reserved'),
        available: sum('available'),
      },
    };
  }

  private async vacationByEmployee(c: Ctx) {
    const years = [c.year - 2, c.year - 1, c.year];
    const users = await this.prisma.read.user.findMany({
      where: this.activeUsers(c),
      orderBy: { fullName: 'asc' },
      take: MAX_ROWS + 1,
      select: { id: true, fullName: true, department: { select: { name: true } } },
    });
    const ids = users.map(u => u.id);
    const [requests, balances] = await Promise.all([
      this.prisma.read.leaveRequest.findMany({
        where: {
          userId: { in: ids },
          leaveTypeCode: VACATION_CODE,
          status: LeaveStatus.APPROVED,
          startDate: {
            gte: new Date(Date.UTC(years[0], 0, 1)),
            lte: new Date(Date.UTC(years[2], 11, 31)),
          },
        },
        select: { userId: true, startDate: true, workDays: true },
      }),
      this.prisma.read.leaveBalance.findMany({
        where: { userId: { in: ids }, leaveTypeCode: VACATION_CODE },
        select: { userId: true, balance: true },
      }),
    ]);
    const rows = users.map(u => {
      const row: Record<string, Cell> = {
        user: u.fullName,
        department: u.department?.name ?? null,
      };
      for (const y of years) {
        row[`y${y}`] = round1(
          requests
            .filter(r => r.userId === u.id && r.startDate.getUTCFullYear() === y)
            .reduce((a, r) => a + (r.workDays ?? 0), 0),
        );
      }
      row.balance = balances.find(b => b.userId === u.id)?.balance ?? 0;
      return row;
    });
    return {
      columns: [
        col('user', 'Colaborador'),
        col('department', 'Departamento'),
        ...years.map(y => col(`y${y}`, `Gozados ${y}`, 'number')),
        col('balance', 'Saldo actual', 'number'),
      ],
      rows,
    };
  }

  private async absencesByDepartment(c: Ctx) {
    const [leaves, absences] = await Promise.all([
      this.prisma.read.leaveRequest.findMany({
        where: {
          user: c.userWhere,
          status: LeaveStatus.APPROVED,
          leaveTypeCode: { not: VACATION_CODE },
          startDate: { lte: c.to },
          endDate: { gte: c.from },
          ...(c.filters.leaveTypeCode ? { leaveTypeCode: c.filters.leaveTypeCode } : {}),
        },
        select: { workDays: true, user: { select: { department: { select: { name: true } } } } },
      }),
      c.filters.leaveTypeCode
        ? Promise.resolve([])
        : this.prisma.read.absenceRecord.findMany({
            where: {
              user: c.userWhere,
              date: { gte: c.from, lte: c.to },
              justificationStatus: { not: AbsenceJustificationStatus.REJECTED },
            },
            select: {
              durationDays: true,
              user: { select: { department: { select: { name: true } } } },
            },
          }),
    ]);
    const byDept = new Map<string, { leaves: number; absences: number; days: number }>();
    const bucket = (name: string | undefined) => {
      const k = name ?? 'Sem departamento';
      const b = byDept.get(k) ?? { leaves: 0, absences: 0, days: 0 };
      byDept.set(k, b);
      return b;
    };
    for (const l of leaves) {
      const b = bucket(l.user.department?.name);
      b.leaves++;
      b.days += l.workDays ?? 0;
    }
    for (const a of absences) {
      const b = bucket(a.user.department?.name);
      b.absences++;
      b.days += a.durationDays ?? 0;
    }
    const rows = [...byDept.entries()]
      .map(([department, b]) => ({
        department,
        occurrences: b.leaves + b.absences,
        leaves: b.leaves,
        absences: b.absences,
        days: round1(b.days),
      }))
      .sort((a, b) => b.days - a.days);
    return {
      columns: [
        col('department', 'Departamento'),
        col('occurrences', 'Ocorrências', 'number'),
        col('leaves', 'Licenças', 'number'),
        col('absences', 'Faltas/ocorrências', 'number'),
        col('days', 'Duração (dias)', 'number'),
      ],
      rows,
      totals: {
        department: 'Total',
        occurrences: rows.reduce((a, r) => a + r.occurrences, 0),
        leaves: rows.reduce((a, r) => a + r.leaves, 0),
        absences: rows.reduce((a, r) => a + r.absences, 0),
        days: round1(rows.reduce((a, r) => a + r.days, 0)),
      },
    };
  }

  private async monthlyAbsenteeism(c: Ctx) {
    const include = c.filters.includeCodes
      ? new Set(
          c.filters.includeCodes
            .split(',')
            .map(s => s.trim())
            .filter(Boolean),
        )
      : null;
    const [leaves, absences, types, headcount] = await Promise.all([
      this.prisma.read.leaveRequest.findMany({
        where: {
          user: c.userWhere,
          status: LeaveStatus.APPROVED,
          startDate: { lte: c.to },
          endDate: { gte: c.from },
        },
        select: {
          leaveTypeCode: true,
          startDate: true,
          endDate: true,
          workDays: true,
          hours: true,
        },
      }),
      this.prisma.read.absenceRecord.findMany({
        where: { user: c.userWhere, date: { gte: c.from, lte: c.to } },
        select: { date: true, durationDays: true, durationHours: true, occurrenceType: true },
      }),
      this.prisma.read.leaveTypeConfig.findMany({
        select: { code: true, countsAsAbsenteeism: true },
      }),
      this.prisma.read.user.count({ where: this.activeUsers(c) }),
    ]);
    const counts = new Map(types.map(t => [t.code, t.countsAsAbsenteeism]));
    const leaveCounts = (code: string) =>
      include ? include.has(code) : (counts.get(code) ?? true);
    const absenceCounts = (code: string) => (include ? include.has(code) : true);

    // Meses do intervalo
    const months: Array<{ key: string; start: Date; end: Date }> = [];
    for (
      let d = new Date(Date.UTC(c.from.getUTCFullYear(), c.from.getUTCMonth(), 1));
      d <= c.to && months.length < 36;
      d = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1))
    ) {
      const start = d < c.from ? c.from : d;
      const monthEnd = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0));
      months.push({
        key: `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`,
        start,
        end: monthEnd > c.to ? c.to : monthEnd,
      });
    }

    const rows = months.map(m => {
      let hours = 0;
      for (const l of leaves) {
        if (!leaveCounts(l.leaveTypeCode)) continue;
        const s = l.startDate > m.start ? l.startDate : m.start;
        const e = l.endDate < m.end ? l.endDate : m.end;
        if (s > e) continue;
        const total = Math.max(1, countWorkDays(l.startDate, l.endDate));
        const share = countWorkDays(s, e) / total;
        hours += (l.hours ?? (l.workDays ?? 0) * HOURS_PER_DAY) * share;
      }
      for (const a of absences) {
        if (!absenceCounts(a.occurrenceType)) continue;
        if (a.date < m.start || a.date > m.end) continue;
        hours += a.durationHours ?? (a.durationDays ?? 1) * HOURS_PER_DAY;
      }
      const planned = headcount * countWorkDays(m.start, m.end) * HOURS_PER_DAY;
      return {
        month: m.key,
        absenceHours: round1(hours),
        plannedHours: planned,
        rate: planned > 0 ? round2((hours / planned) * 100) : 0,
      };
    });
    const totalAbs = rows.reduce((a, r) => a + r.absenceHours, 0);
    const totalPlanned = rows.reduce((a, r) => a + r.plannedHours, 0);
    return {
      formula:
        'Taxa de absentismo = (horas de ausência contabilizáveis ÷ horas de trabalho previstas) × 100',
      columns: [
        col('month', 'Mês'),
        col('absenceHours', 'Horas de ausência', 'number'),
        col('plannedHours', 'Horas previstas', 'number'),
        col('rate', 'Taxa de absentismo', 'percent'),
      ],
      rows,
      totals: {
        month: 'Período',
        absenceHours: round1(totalAbs),
        plannedHours: totalPlanned,
        rate: totalPlanned > 0 ? round2((totalAbs / totalPlanned) * 100) : 0,
      },
    };
  }

  private async justifiedVsUnjustified(c: Ctx) {
    const cfg = await this.settings.current();
    const absences = await this.prisma.read.absenceRecord.findMany({
      where: { user: c.userWhere, date: { gte: c.from, lte: c.to } },
      select: {
        occurrenceType: true,
        justificationStatus: true,
        durationDays: true,
        durationHours: true,
      },
    });
    const labels = {
      JUSTIFIED: 'Justificadas',
      UNJUSTIFIED: 'Injustificadas',
      PENDING: 'A aguardar justificação',
    } as const;
    const agg: Record<keyof typeof labels, { n: number; days: number; hours: number }> = {
      JUSTIFIED: { n: 0, days: 0, hours: 0 },
      UNJUSTIFIED: { n: 0, days: 0, hours: 0 },
      PENDING: { n: 0, days: 0, hours: 0 },
    };
    for (const a of absences) {
      // Categorias configuráveis (§10): decidem o que conta como justificada /
      // injustificada enquanto a justificação ainda não foi decidida.
      const cat: keyof typeof labels =
        a.justificationStatus === 'VALIDATED'
          ? 'JUSTIFIED'
          : a.justificationStatus === 'REJECTED' ||
              cfg.unjustifiedOccurrenceTypes.includes(a.occurrenceType as AbsenceOccurrenceType)
            ? 'UNJUSTIFIED'
            : cfg.justifiedOccurrenceTypes.includes(a.occurrenceType as AbsenceOccurrenceType)
              ? 'JUSTIFIED'
              : 'PENDING';
      agg[cat].n++;
      agg[cat].days += a.durationDays ?? 0;
      agg[cat].hours += a.durationHours ?? (a.durationDays ?? 1) * HOURS_PER_DAY;
    }
    const rows = (Object.keys(labels) as Array<keyof typeof labels>).map(k => ({
      category: labels[k],
      count: agg[k].n,
      days: round1(agg[k].days),
      hours: round1(agg[k].hours),
    }));
    return {
      columns: [
        col('category', 'Categoria'),
        col('count', 'Ocorrências', 'number'),
        col('days', 'Dias', 'number'),
        col('hours', 'Horas', 'number'),
      ],
      rows,
      totals: {
        category: 'Total',
        count: rows.reduce((a, r) => a + r.count, 0),
        days: round1(rows.reduce((a, r) => a + r.days, 0)),
        hours: round1(rows.reduce((a, r) => a + r.hours, 0)),
      },
    };
  }

  private async licensesByType(c: Ctx) {
    const [requests, types] = await Promise.all([
      this.prisma.read.leaveRequest.findMany({
        where: {
          user: c.userWhere,
          leaveTypeCode: c.filters.leaveTypeCode ?? { not: VACATION_CODE },
          status: { not: LeaveStatus.DRAFT },
          startDate: { lte: c.to },
          endDate: { gte: c.from },
        },
        select: { leaveTypeCode: true, status: true, workDays: true },
      }),
      this.prisma.read.leaveTypeConfig.findMany({ select: { code: true, name: true } }),
    ]);
    const name = new Map(types.map(t => [t.code, t.name]));
    const byType = new Map<
      string,
      { pending: number; approved: number; rejected: number; cancelled: number; days: number }
    >();
    for (const r of requests) {
      const b = byType.get(r.leaveTypeCode) ?? {
        pending: 0,
        approved: 0,
        rejected: 0,
        cancelled: 0,
        days: 0,
      };
      if (r.status === LeaveStatus.PENDING) b.pending++;
      else if (r.status === LeaveStatus.APPROVED) {
        b.approved++;
        b.days += r.workDays ?? 0;
      } else if (r.status === LeaveStatus.REJECTED) b.rejected++;
      else b.cancelled++;
      byType.set(r.leaveTypeCode, b);
    }
    const rows = [...byType.entries()]
      .map(([code, b]) => ({
        type: name.get(code) ?? code,
        pending: b.pending,
        approved: b.approved,
        rejected: b.rejected,
        cancelled: b.cancelled,
        total: b.pending + b.approved + b.rejected + b.cancelled,
        days: round1(b.days),
      }))
      .sort((a, b) => b.total - a.total);
    const sum = (k: 'pending' | 'approved' | 'rejected' | 'cancelled' | 'total') =>
      rows.reduce((a, r) => a + r[k], 0);
    return {
      columns: [
        col('type', 'Tipo de licença'),
        col('pending', 'Pendentes', 'number'),
        col('approved', 'Aprovadas', 'number'),
        col('rejected', 'Recusadas', 'number'),
        col('cancelled', 'Canceladas', 'number'),
        col('total', 'Total', 'number'),
        col('days', 'Dias aprovados', 'number'),
      ],
      rows,
      totals: {
        type: 'Total',
        pending: sum('pending'),
        approved: sum('approved'),
        rejected: sum('rejected'),
        cancelled: sum('cancelled'),
        total: sum('total'),
        days: round1(rows.reduce((a, r) => a + r.days, 0)),
      },
    };
  }

  private async pendingRequests(c: Ctx) {
    const now = new Date();
    const [approvals, types] = await Promise.all([
      this.prisma.read.leaveApproval.findMany({
        where: {
          decidedAt: null,
          request: {
            status: LeaveStatus.PENDING,
            user: c.userWhere,
            ...(c.filters.leaveTypeCode ? { leaveTypeCode: c.filters.leaveTypeCode } : {}),
          },
        },
        orderBy: { createdAt: 'asc' },
        take: MAX_ROWS + 1,
        select: {
          stage: true,
          dueAt: true,
          approver: { select: { fullName: true } },
          request: {
            select: {
              leaveTypeCode: true,
              createdAt: true,
              user: { select: { fullName: true } },
            },
          },
        },
      }),
      this.prisma.read.leaveTypeConfig.findMany({ select: { code: true, name: true } }),
    ]);
    const name = new Map(types.map(t => [t.code, t.name]));
    const rows = approvals
      .map(a => ({
        user: a.request.user.fullName,
        type: name.get(a.request.leaveTypeCode) ?? a.request.leaveTypeCode,
        submittedAt: dayKey(a.request.createdAt),
        waitingDays: Math.floor((now.getTime() - a.request.createdAt.getTime()) / DAY_MS),
        approver: a.approver.fullName,
        stage: a.stage === 'HR' ? 'RH' : 'Gestor',
        dueAt: a.dueAt ? dayKey(a.dueAt) : null,
        overdue: a.dueAt && a.dueAt < now ? 'Sim' : 'Não',
      }))
      .sort((a, b) => b.waitingDays - a.waitingDays);
    return {
      columns: [
        col('user', 'Colaborador'),
        col('type', 'Tipo'),
        col('submittedAt', 'Submetido em', 'date'),
        col('waitingDays', 'Dias em espera', 'number'),
        col('approver', 'Responsável'),
        col('stage', 'Etapa'),
        col('dueAt', 'Prazo', 'date'),
        col('overdue', 'Em atraso'),
      ],
      rows,
    };
  }

  private async operationalCoverage(c: Ctx) {
    const p = await this.planning.getPlanning(
      {
        from: dayKey(c.from),
        to: dayKey(c.to),
        unitId: c.filters.unitId,
        departmentId: c.filters.departmentId,
      },
      c.viewer,
    );
    const rows = p.teams.map(t => ({
      department: t.department ?? 'Sem departamento',
      headcount: t.headcount,
      minAvailability: t.minAvailabilityPercent,
      averageAvailability: t.averageAvailabilityPercent,
      worstAvailability: t.worstAvailabilityPercent,
      belowMinimumDays: t.belowMinimumDays,
      overlapDays: t.overlapDays,
    }));
    return {
      columns: [
        col('department', 'Equipa / departamento'),
        col('headcount', 'Colaboradores', 'number'),
        col('minAvailability', 'Mínimo exigido', 'percent'),
        col('averageAvailability', 'Disponibilidade média', 'percent'),
        col('worstAvailability', 'Pior dia', 'percent'),
        col('belowMinimumDays', 'Dias abaixo do mínimo', 'number'),
        col('overlapDays', 'Dias com sobreposição', 'number'),
      ],
      rows,
    };
  }

  private async payrollImpact(c: Ctx) {
    const [leaves, types] = await Promise.all([
      this.prisma.read.leaveRequest.findMany({
        where: {
          user: c.userWhere,
          status: LeaveStatus.APPROVED,
          startDate: { lte: c.to },
          endDate: { gte: c.from },
          ...(c.filters.leaveTypeCode ? { leaveTypeCode: c.filters.leaveTypeCode } : {}),
        },
        orderBy: { startDate: 'asc' },
        select: {
          leaveTypeCode: true,
          startDate: true,
          endDate: true,
          workDays: true,
          user: { select: { fullName: true, department: { select: { name: true } } } },
        },
      }),
      this.prisma.read.leaveTypeConfig.findMany({
        select: { code: true, name: true, isPaid: true, requiresPayrollValidation: true },
      }),
    ]);
    const typeBy = new Map(types.map(t => [t.code, t]));
    const rows = leaves
      .map(l => ({ l, t: typeBy.get(l.leaveTypeCode) }))
      .filter(({ t }) => t && (!t.isPaid || t.requiresPayrollValidation))
      .map(({ l, t }) => ({
        user: l.user.fullName,
        department: l.user.department?.name ?? null,
        type: t!.name,
        startDate: dayKey(l.startDate),
        endDate: dayKey(l.endDate),
        days: l.workDays ?? 0,
        regime: !t!.isPaid ? 'Não remunerada' : 'Validação do Payroll',
      }));
    return {
      columns: [
        col('user', 'Colaborador'),
        col('department', 'Departamento'),
        col('type', 'Tipo'),
        col('startDate', 'Início', 'date'),
        col('endDate', 'Fim', 'date'),
        col('days', 'Dias úteis', 'number'),
        col('regime', 'Impacto'),
      ],
      rows,
      totals: { user: 'Total', days: round1(rows.reduce((a, r) => a + r.days, 0)) },
    };
  }

  private async requestAudit(c: Ctx) {
    const logs = await this.prisma.read.auditLog.findMany({
      where: {
        entity: 'LeaveRequest',
        action: { startsWith: 'LEAVE_' },
        timestamp: { gte: c.from, lte: new Date(c.to.getTime() + DAY_MS - 1) },
      },
      orderBy: { timestamp: 'desc' },
      take: MAX_ROWS + 1,
      select: {
        action: true,
        entityId: true,
        timestamp: true,
        user: { select: { fullName: true } },
      },
    });
    const ids = [...new Set(logs.map(l => l.entityId).filter((i): i is number => !!i))];
    const requests = ids.length
      ? await this.prisma.read.leaveRequest.findMany({
          where: { id: { in: ids }, user: c.userWhere },
          select: { id: true, user: { select: { fullName: true } } },
        })
      : [];
    const owner = new Map(requests.map(r => [r.id, r.user.fullName]));
    const rows = logs
      .filter(l => l.entityId !== null && owner.has(l.entityId))
      .map(l => ({
        at: l.timestamp.toISOString().slice(0, 16).replace('T', ' '),
        action: ACTION_LABELS[l.action] ?? l.action,
        requestId: l.entityId,
        owner: owner.get(l.entityId!) ?? null,
        actor: l.user?.fullName ?? null,
      }));
    return {
      columns: [
        col('at', 'Data e hora'),
        col('action', 'Acção'),
        col('requestId', 'Pedido', 'number'),
        col('owner', 'Colaborador'),
        col('actor', 'Responsável'),
      ],
      rows,
    };
  }
}

interface Ctx {
  year: number;
  from: Date;
  to: Date;
  filters: LeaveReportFilterDto;
  viewer: CurrentUserData;
  userWhere: Prisma.UserWhereInput;
}
