// src/executive-reports/executive-reports.metrics.service.ts
// Cálculo dos KPIs executivos (docs/Executive_Reports.md §3, §5 e §12).
// Todos os valores vêm dos registos reais dos módulos de origem; quando não há
// dados devolve `null` ("Sem dados"), nunca 0 (regra §12.3).
import { Injectable } from '@nestjs/common';
import { ContractType, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  KPI_CATALOG,
  PRIMARY_KPI_CODES,
  evaluateKpiState,
  type KpiCode,
  type KpiDefinition,
  type KpiState,
} from './executive-reports.kpi-catalog';
import type { ExecutiveFiltersDto, ExecutiveKpiStateFilter } from './dto/executive-filters.dto';

export interface DateRange {
  start: Date;
  end: Date;
}

export interface ResolvedFilters {
  period: 'month' | 'quarter' | 'year' | 'custom';
  compareWith: 'previous' | 'previous_year' | 'target';
  unitId?: number;
  departmentId?: number;
  positionId?: number;
  contractType?: ContractType;
  courseId?: number;
  kpiState?: ExecutiveKpiStateFilter;
  current: DateRange;
  comparison: DateRange | null;
}

export interface KpiResult {
  code: KpiCode;
  name: string;
  shortLabel: string;
  description: string;
  formula: string;
  unit: KpiDefinition['unit'];
  direction: KpiDefinition['direction'];
  value: number | null;
  previousValue: number | null;
  change: number | null;
  changePct: number | null;
  target: number | null;
  /** Desvio face à meta (valor − meta); null se sem meta ou sem dados. */
  deviation: number | null;
  warningThreshold: number | null;
  criticalThreshold: number | null;
  state: KpiState;
  /** Evolução mensal (últimos 6 meses até ao fim do período), para sparkline. */
  trend: { label: string; value: number | null }[] | null;
  sourceModules: string[];
  lastUpdatedAt: string;
}

const PRESENT_STATUSES = [
  'PRESENT',
  'LATE',
  'REMOTE',
  'PARTIAL',
  'HALF_DAY_AM',
  'HALF_DAY_PM',
] as const;
const EXCLUDED_FROM_EXPECTED = ['ON_LEAVE', 'HOLIDAY', 'RECORDED'] as const;

type KpiOverride = {
  target: number | null;
  warningThreshold: number | null;
  criticalThreshold: number | null;
};
const OVERRIDE_TTL_MS = 60_000;

const round1 = (n: number) => Math.round(n * 10) / 10;

@Injectable()
export class ExecutiveReportsMetricsService {
  private overrides: { at: number; map: Map<string, KpiOverride> } | null = null;

  constructor(private readonly prisma: PrismaService) {}

  // ─── Definições efectivas (catálogo + sobreposições configuráveis, §11) ───

  /** Metas/limiares configurados na BD sobrepõem os do catálogo; a fórmula nunca muda (§12.1). */
  async effectiveDefinitions(): Promise<Record<KpiCode, KpiDefinition>> {
    const now = Date.now();
    if (!this.overrides || now - this.overrides.at > OVERRIDE_TTL_MS) {
      const rows = await this.prisma.read.executiveKPIDefinition.findMany({
        where: { active: true },
      });
      this.overrides = { at: now, map: new Map(rows.map(r => [r.code, r])) };
    }
    const out = {} as Record<KpiCode, KpiDefinition>;
    for (const def of Object.values(KPI_CATALOG)) {
      const o = this.overrides.map.get(def.code);
      out[def.code] = o
        ? {
            ...def,
            target: o.target,
            warningThreshold: o.warningThreshold,
            criticalThreshold: o.criticalThreshold,
          }
        : def;
    }
    return out;
  }

  invalidateDefinitions() {
    this.overrides = null;
  }

  // ─── Períodos ─────────────────────────────────────────────────────────────

  resolveFilters(f: ExecutiveFiltersDto, now = new Date()): ResolvedFilters {
    const period = f.period ?? 'year';
    const compareWith = f.compareWith ?? 'previous';
    let start: Date;
    let end: Date;

    if (period === 'custom' && f.dateFrom && f.dateTo) {
      start = new Date(f.dateFrom);
      end = new Date(f.dateTo);
    } else if (period === 'month') {
      start = new Date(now.getFullYear(), now.getMonth(), 1);
      end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
    } else if (period === 'quarter') {
      const q = Math.floor(now.getMonth() / 3) * 3;
      start = new Date(now.getFullYear(), q, 1);
      end = new Date(now.getFullYear(), q + 3, 0, 23, 59, 59, 999);
    } else {
      start = new Date(now.getFullYear(), 0, 1);
      end = new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999);
    }
    if (end < start) [start, end] = [end, start];

    let comparison: DateRange | null = null;
    if (compareWith === 'previous_year') {
      comparison = { start: this.shiftYears(start, -1), end: this.shiftYears(end, -1) };
    } else if (compareWith === 'previous') {
      if (period === 'month') {
        comparison = {
          start: new Date(start.getFullYear(), start.getMonth() - 1, 1),
          end: new Date(start.getFullYear(), start.getMonth(), 0, 23, 59, 59, 999),
        };
      } else if (period === 'quarter') {
        comparison = {
          start: new Date(start.getFullYear(), start.getMonth() - 3, 1),
          end: new Date(start.getFullYear(), start.getMonth(), 0, 23, 59, 59, 999),
        };
      } else if (period === 'year') {
        comparison = { start: this.shiftYears(start, -1), end: this.shiftYears(end, -1) };
      } else {
        const len = end.getTime() - start.getTime();
        comparison = {
          start: new Date(start.getTime() - len - 1),
          end: new Date(start.getTime() - 1),
        };
      }
    }

    return {
      period,
      compareWith,
      unitId: f.unitId,
      departmentId: f.departmentId,
      positionId: f.positionId,
      contractType: f.contractType,
      courseId: f.courseId,
      kpiState: f.kpiState,
      current: { start, end },
      comparison,
    };
  }

  private shiftYears(d: Date, years: number): Date {
    const r = new Date(d);
    r.setFullYear(r.getFullYear() + years);
    return r;
  }

  /** Dados futuros não existem: para valores "a data de", usa-se min(fim, agora). */
  private asOf(end: Date, now = new Date()): Date {
    return end > now ? now : end;
  }

  // ─── Âmbito (unidade/departamento) ────────────────────────────────────────

  userScope(
    f: Pick<ResolvedFilters, 'unitId' | 'departmentId' | 'positionId' | 'contractType'>,
  ): Prisma.UserWhereInput {
    const where: Prisma.UserWhereInput = {};
    if (f.departmentId) where.departmentId = f.departmentId;
    if (f.positionId) where.positionId = f.positionId;
    if (f.contractType) where.contractType = f.contractType;
    if (f.unitId) where.OR = [{ unitId: f.unitId }, { department: { unitId: f.unitId } }];
    return where;
  }

  // ─── Primitivas ───────────────────────────────────────────────────────────

  /** Efectivo à data D (regra documentada no catálogo). */
  async headcountAt(scope: Prisma.UserWhereInput, d: Date): Promise<number> {
    return this.prisma.read.user.count({
      where: {
        AND: [
          scope,
          { OR: [{ hireDate: { lte: d } }, { hireDate: null, createdAt: { lte: d } }] },
          { OR: [{ exitDate: { gt: d } }, { exitDate: null, active: true }] },
        ],
      },
    });
  }

  async exitsBetween(scope: Prisma.UserWhereInput, r: DateRange): Promise<number> {
    return this.prisma.read.user.count({
      where: { AND: [scope, { exitDate: { gte: r.start, lte: r.end } }] },
    });
  }

  async hiresBetween(scope: Prisma.UserWhereInput, r: DateRange): Promise<number> {
    return this.prisma.read.user.count({
      where: { AND: [scope, { hireDate: { gte: r.start, lte: r.end } }] },
    });
  }

  // ─── KPIs ─────────────────────────────────────────────────────────────────

  /** Calcula o valor bruto de um KPI para um intervalo. */
  async computeValue(
    code: KpiCode,
    range: DateRange,
    scope: Prisma.UserWhereInput,
    courseId?: number,
  ): Promise<number | null> {
    const end = this.asOf(range.end);
    switch (code) {
      case 'HEADCOUNT':
        return this.headcountAt(scope, end);

      case 'TURNOVER': {
        const [exits, hcStart, hcEnd] = await Promise.all([
          this.exitsBetween(scope, { start: range.start, end }),
          this.headcountAt(scope, range.start),
          this.headcountAt(scope, end),
        ]);
        const avg = (hcStart + hcEnd) / 2;
        return avg > 0 ? round1((exits / avg) * 100) : null;
      }

      case 'PERFORMANCE': {
        const goals = await this.prisma.read.performanceGoal.findMany({
          where: {
            user: scope,
            cycle: { startDate: { lte: range.end }, endDate: { gte: range.start } },
          },
          select: { progress: true },
        });
        if (goals.length === 0) return null;
        const sum = goals.reduce((s, g) => s + Math.min(g.progress, 100), 0);
        return round1(sum / goals.length);
      }

      case 'TRAINING_COMPLETION': {
        const base: Prisma.EnrollmentWhereInput = {
          user: scope,
          enrolledAt: { gte: range.start, lte: range.end },
          status: { notIn: ['CANCELLED', 'PENDING_APPROVAL'] },
          ...(courseId ? { courseId } : {}),
        };
        const [eligible, completed] = await Promise.all([
          this.prisma.read.enrollment.count({ where: base }),
          this.prisma.read.enrollment.count({ where: { ...base, status: 'COMPLETED' } }),
        ]);
        return eligible > 0 ? round1((completed / eligible) * 100) : null;
      }

      case 'ATTENDANCE': {
        const rows = await this.prisma.read.attendanceRecord.groupBy({
          by: ['status'],
          where: { user: scope, date: { gte: range.start, lte: range.end } },
          _count: { _all: true },
        });
        let present = 0;
        let expected = 0;
        for (const r of rows) {
          if ((EXCLUDED_FROM_EXPECTED as readonly string[]).includes(r.status)) continue;
          expected += r._count._all;
          if ((PRESENT_STATUSES as readonly string[]).includes(r.status)) {
            present += r._count._all;
          }
        }
        return expected > 0 ? round1((present / expected) * 100) : null;
      }

      case 'PDI_OVERDUE':
        return this.prisma.read.developmentPlanAction.count({
          where: {
            plan: { user: scope },
            status: { notIn: ['COMPLETED', 'CANCELLED'] },
            dueDate: { lt: end },
            OR: [{ completedAt: null }, { completedAt: { gt: end } }],
          },
        });
    }
  }

  /** Últimos `months` meses (mensal) até ao fim do período. */
  private monthRanges(end: Date, months: number): { label: string; range: DateRange }[] {
    const e = this.asOf(end);
    const out: { label: string; range: DateRange }[] = [];
    for (let i = months - 1; i >= 0; i--) {
      const start = new Date(e.getFullYear(), e.getMonth() - i, 1);
      const mEnd = new Date(e.getFullYear(), e.getMonth() - i + 1, 0, 23, 59, 59, 999);
      out.push({
        label: start.toLocaleDateString('pt-PT', { month: 'short' }),
        range: { start, end: mEnd },
      });
    }
    return out;
  }

  async computeKpis(
    f: ResolvedFilters,
    codes: KpiCode[] = PRIMARY_KPI_CODES,
    opts: { withTrend?: boolean } = {},
  ): Promise<KpiResult[]> {
    const scope = this.userScope(f);
    const lastUpdatedAt = new Date().toISOString();
    const months = opts.withTrend ? this.monthRanges(f.current.end, 6) : [];
    const defs = await this.effectiveDefinitions();

    return Promise.all(
      codes.map(async code => {
        const def = defs[code];
        const [value, previousValue, trend] = await Promise.all([
          this.computeValue(code, f.current, scope, f.courseId),
          f.comparison
            ? this.computeValue(code, f.comparison, scope, f.courseId)
            : Promise.resolve(null),
          opts.withTrend
            ? Promise.all(
                months.map(async m => ({
                  label: m.label,
                  value: await this.computeValue(code, m.range, scope, f.courseId),
                })),
              )
            : Promise.resolve(null),
        ]);

        const change =
          value !== null && previousValue !== null ? round1(value - previousValue) : null;
        const changePct =
          change !== null && previousValue !== null && previousValue !== 0
            ? round1((change / Math.abs(previousValue)) * 100)
            : null;

        return {
          code,
          name: def.name,
          shortLabel: def.shortLabel,
          description: def.description,
          formula: def.formula,
          unit: def.unit,
          direction: def.direction,
          value,
          previousValue,
          change,
          changePct,
          target: def.target,
          deviation: value !== null && def.target !== null ? round1(value - def.target) : null,
          warningThreshold: def.warningThreshold,
          criticalThreshold: def.criticalThreshold,
          state: evaluateKpiState(def, value),
          trend,
          sourceModules: def.sourceModules,
          lastUpdatedAt,
        };
      }),
    );
  }

  // ─── Indicadores complementares (§3.1, lista "além destes seis") ──────────

  async computeSupplementary(f: ResolvedFilters) {
    const scope = this.userScope(f);
    const enr = f.courseId ? { courseId: f.courseId } : {};
    const now = new Date();
    const end = this.asOf(f.current.end, now);
    const range = { start: f.current.start, end };
    const last12 = {
      start: new Date(end.getFullYear() - 1, end.getMonth(), end.getDate() + 1),
      end,
    };

    const [
      hires,
      exits,
      exits12,
      hcStart12,
      hcEnd,
      activeUsersForDist,
      eligibleEnrollments,
      completedEnrollments,
      participants,
      completedForHours,
      reviewsTotal,
      reviewsDone,
      competencyUsers,
      competencyLevels,
      leavePending,
      leaveInCourse,
      onboardingInProgress,
      onboardingCompleted,
      activePlans,
      overdueMandatory,
      overdueActions,
    ] = await Promise.all([
      this.hiresBetween(scope, range),
      this.exitsBetween(scope, range),
      this.exitsBetween(scope, last12),
      this.headcountAt(scope, last12.start),
      this.headcountAt(scope, end),
      this.prisma.read.user.findMany({
        where: {
          AND: [scope, { active: true }, { OR: [{ exitDate: null }, { exitDate: { gt: end } }] }],
        },
        select: {
          departmentId: true,
          unitId: true,
          contractType: true,
          positionId: true,
          department: { select: { name: true, unitId: true } },
          position: { select: { name: true } },
        },
      }),
      this.prisma.read.enrollment.count({
        where: {
          user: scope,
          ...enr,
          enrolledAt: { gte: range.start, lte: range.end },
          status: { notIn: ['CANCELLED', 'PENDING_APPROVAL'] },
        },
      }),
      this.prisma.read.enrollment.count({
        where: {
          user: scope,
          ...enr,
          enrolledAt: { gte: range.start, lte: range.end },
          status: 'COMPLETED',
        },
      }),
      this.prisma.read.enrollment.groupBy({
        by: ['userId'],
        where: {
          user: scope,
          ...enr,
          enrolledAt: { gte: range.start, lte: range.end },
          status: { notIn: ['CANCELLED', 'PENDING_APPROVAL'] },
        },
      }),
      this.prisma.read.enrollment.findMany({
        where: {
          user: scope,
          ...enr,
          status: 'COMPLETED',
          completedAt: { gte: range.start, lte: range.end },
        },
        select: { course: { select: { workloadHours: true } } },
      }),
      this.prisma.read.performanceReview.count({
        where: {
          user: scope,
          cycle: { startDate: { lte: f.current.end }, endDate: { gte: f.current.start } },
        },
      }),
      this.prisma.read.performanceReview.count({
        where: {
          user: scope,
          status: { in: ['PUBLISHED', 'FINALIZED'] },
          cycle: { startDate: { lte: f.current.end }, endDate: { gte: f.current.start } },
        },
      }),
      this.prisma.read.userCompetency.groupBy({ by: ['userId'], where: { user: scope } }),
      this.prisma.read.userCompetency.findMany({
        where: { user: scope, targetLevel: { not: null } },
        select: { currentLevel: true, targetLevel: true },
      }),
      this.prisma.read.leaveRequest.count({ where: { user: scope, status: 'PENDING' } }),
      this.prisma.read.leaveRequest.count({
        where: {
          user: scope,
          status: 'APPROVED',
          startDate: { lte: now },
          endDate: { gte: now },
        },
      }),
      this.prisma.read.onboardingPlan.count({
        where: { user: scope, status: 'IN_PROGRESS' },
      }),
      this.prisma.read.onboardingPlan.count({
        where: {
          user: scope,
          status: 'COMPLETED',
          completedAt: { gte: range.start, lte: range.end },
        },
      }),
      this.prisma.read.developmentPlan.count({
        where: { user: scope, status: { in: ['ACTIVE', 'AT_RISK'] } },
      }),
      this.prisma.read.enrollment.count({
        where: {
          user: scope,
          ...enr,
          mandatory: true,
          status: { notIn: ['COMPLETED', 'CANCELLED', 'PENDING_APPROVAL'] },
          deadline: { lt: now },
        },
      }),
      this.prisma.read.developmentPlanAction.count({
        where: {
          plan: { user: scope },
          status: { notIn: ['COMPLETED', 'CANCELLED'] },
          dueDate: { lt: now },
        },
      }),
    ]);

    // Distribuições (por departamento, cargo, vínculo)
    const tally = (keyOf: (u: (typeof activeUsersForDist)[number]) => string | null) => {
      const m = new Map<string, number>();
      for (const u of activeUsersForDist) {
        const k = keyOf(u) ?? 'Sem classificação';
        m.set(k, (m.get(k) ?? 0) + 1);
      }
      return [...m.entries()]
        .map(([label, value]) => ({ label, value }))
        .sort((a, b) => b.value - a.value);
    };

    const trainingHours = completedForHours.reduce((s, e) => s + (e.course?.workloadHours ?? 0), 0);
    const avgHc12 = (hcStart12 + hcEnd) / 2;
    const gaps = competencyLevels.filter(c => c.currentLevel < (c.targetLevel ?? 0)).length;

    return {
      workforce: {
        total: activeUsersForDist.length,
        hires,
        exits,
        netBalance: hires - exits,
        turnoverLast12Months: avgHc12 > 0 ? round1((exits12 / avgHc12) * 100) : null,
        byDepartment: tally(u => u.department?.name ?? null),
        byPosition: tally(u => u.position?.name ?? null).slice(0, 10),
        byContractType: tally(u => u.contractType),
      },
      training: {
        enrollmentsEligible: eligibleEnrollments,
        enrollmentsCompleted: completedEnrollments,
        participants: participants.length,
        hours: trainingHours,
      },
      performance: {
        reviewsTotal,
        reviewsCompleted: reviewsDone,
        completionPct: reviewsTotal > 0 ? round1((reviewsDone / reviewsTotal) * 100) : null,
      },
      competencies: {
        collaboratorsEvaluated: competencyUsers.length,
        evaluatedPct:
          activeUsersForDist.length > 0
            ? round1((competencyUsers.length / activeUsersForDist.length) * 100)
            : null,
        gapsIdentified: gaps,
      },
      leave: { pending: leavePending, inCourse: leaveInCourse },
      onboarding: { inProgress: onboardingInProgress, completed: onboardingCompleted },
      development: { activePlans, overdueActions },
      pending: {
        overdueMandatoryTraining: overdueMandatory,
        overdueActions,
        pendingLeaveApprovals: leavePending,
      },
    };
  }
}
