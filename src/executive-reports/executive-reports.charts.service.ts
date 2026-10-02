// src/executive-reports/executive-reports.charts.service.ts
// Conjuntos de dados dos gráficos recomendados (docs/Executive_Reports.md §6):
// comparação entre departamentos, distribuição/composição, metas vs. resultados
// e riscos/anomalias. Reutiliza as definições únicas de KPI do metrics service —
// o gráfico nunca recalcula uma fórmula diferente da do cartão (§12.1).
import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  ExecutiveReportsMetricsService,
  type ResolvedFilters,
} from './executive-reports.metrics.service';
import { KPI_CATALOG } from './executive-reports.kpi-catalog';
import { SOURCE_MATRIX, type SourceCounterKey } from './executive-reports.sources';

const round1 = (n: number) => Math.round(n * 10) / 10;
const DEPT_LIMIT = 12;
const EXCEPTIONS_LIMIT = 10;
const DAY_MS = 86_400_000;

export type RiskLevel = 'OK' | 'WARNING' | 'CRITICAL' | 'NO_DATA';

/**
 * Critérios do mapa de calor (§6.5: "qualquer pontuação de risco deve ter
 * critérios documentados"). Rotatividade e absentismo seguem os limiares do
 * catálogo de KPIs; as contagens de pendências são normalizadas por 100
 * colaboradores para departamentos de dimensões diferentes serem comparáveis.
 */
export const RISK_CRITERIA = {
  turnover: {
    label: 'Rotatividade (%)',
    warning: KPI_CATALOG.TURNOVER.warningThreshold as number,
    critical: KPI_CATALOG.TURNOVER.criticalThreshold as number,
    rule: 'Mesma fórmula e limiares do KPI Rotatividade (alerta > 5%, crítico > 10%).',
  },
  absenteeism: {
    label: 'Absentismo (%)',
    warning: 100 - (KPI_CATALOG.ATTENDANCE.warningThreshold as number),
    critical: 100 - (KPI_CATALOG.ATTENDANCE.criticalThreshold as number),
    rule: '100 − taxa de presença; limiares simétricos aos da Assiduidade (alerta > 8%, crítico > 15%).',
  },
  overduePdi: {
    label: 'Acções de PDI atrasadas (por 100 colab.)',
    warning: 5,
    critical: 15,
    rule: 'Acções em atraso ÷ efectivo × 100. Limiares por omissão (alerta ≥ 5, crítico ≥ 15) — a validar com a Direcção.',
  },
  overdueMandatory: {
    label: 'Formações obrigatórias em atraso (por 100 colab.)',
    warning: 5,
    critical: 15,
    rule: 'Inscrições obrigatórias com prazo ultrapassado ÷ efectivo × 100. Limiares por omissão (alerta ≥ 5, crítico ≥ 15).',
  },
} as const;

/** `inclusive`: limiar "≥" (contagens por 100) em vez de ">" (limiares dos KPIs). */
function levelOf(
  value: number | null,
  warning: number,
  critical: number,
  inclusive = false,
): RiskLevel {
  if (value === null) return 'NO_DATA';
  const over = (limit: number) => (inclusive ? value >= limit : value > limit);
  if (value > 0 && over(critical)) return 'CRITICAL';
  if (value > 0 && over(warning)) return 'WARNING';
  return 'OK';
}

@Injectable()
export class ExecutiveReportsChartsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly metrics: ExecutiveReportsMetricsService,
  ) {}

  /** Departamentos com mais colaboradores activos dentro do âmbito do utilizador. */
  private async topDepartments(base: Prisma.UserWhereInput, limit = DEPT_LIMIT) {
    const grouped = await this.prisma.read.user.groupBy({
      by: ['departmentId'],
      where: { AND: [base, { active: true }, { departmentId: { not: null } }] },
      _count: { _all: true },
    });
    const top = grouped
      .filter((g): g is typeof g & { departmentId: number } => g.departmentId !== null)
      .sort((a, b) => b._count._all - a._count._all)
      .slice(0, limit);
    const names = await this.prisma.read.department.findMany({
      where: { id: { in: top.map(t => t.departmentId) } },
      select: { id: true, name: true },
    });
    const nameOf = new Map(names.map(n => [n.id, n.name]));
    return top.map(t => ({
      id: t.departmentId,
      name: nameOf.get(t.departmentId) ?? `Departamento ${t.departmentId}`,
      activeUsers: t._count._all,
    }));
  }

  private async perDepartment(f: ResolvedFilters) {
    const base = this.metrics.userScope(f);
    const depts = await this.topDepartments(base);
    const now = new Date();

    return Promise.all(
      depts.map(async d => {
        const scope: Prisma.UserWhereInput = { AND: [base, { departmentId: d.id }] };
        const [headcount, performance, training, attendance, turnover, overduePdi, overdueMand] =
          await Promise.all([
            this.metrics.computeValue('HEADCOUNT', f.current, scope),
            this.metrics.computeValue('PERFORMANCE', f.current, scope),
            this.metrics.computeValue('TRAINING_COMPLETION', f.current, scope, f.courseId),
            this.metrics.computeValue('ATTENDANCE', f.current, scope),
            this.metrics.computeValue('TURNOVER', f.current, scope),
            this.metrics.computeValue('PDI_OVERDUE', f.current, scope),
            this.prisma.read.enrollment.count({
              where: {
                user: scope,
                ...(f.courseId ? { courseId: f.courseId } : {}),
                mandatory: true,
                status: { notIn: ['COMPLETED', 'CANCELLED', 'PENDING_APPROVAL'] },
                deadline: { lt: now },
              },
            }),
          ]);
        return {
          id: d.id,
          name: d.name,
          headcount: headcount ?? 0,
          performance,
          trainingCompletion: training,
          absenteeism: attendance === null ? null : round1(100 - attendance),
          turnover,
          overduePdi: overduePdi ?? 0,
          overdueMandatory: overdueMand,
        };
      }),
    );
  }

  // ─── §6.2 + §6.3 — comparação e composição ────────────────────────────────

  async departments(f: ResolvedFilters) {
    const [rows, composition] = await Promise.all([this.perDepartment(f), this.composition(f)]);
    return {
      departments: rows,
      targets: {
        performance: KPI_CATALOG.PERFORMANCE.target,
        trainingCompletion: KPI_CATALOG.TRAINING_COMPLETION.target,
        absenteeism: 100 - (KPI_CATALOG.ATTENDANCE.target as number),
        turnover: KPI_CATALOG.TURNOVER.target,
      },
      composition,
    };
  }

  /** Colaboradores activos por departamento × tipo de vínculo (barras empilhadas). */
  private async composition(f: ResolvedFilters) {
    const base = this.metrics.userScope(f);
    const users = await this.prisma.read.user.findMany({
      where: {
        AND: [
          base,
          { active: true },
          { OR: [{ exitDate: null }, { exitDate: { gt: new Date() } }] },
        ],
      },
      select: { contractType: true, department: { select: { name: true } } },
    });

    const byDept = new Map<string, Map<string, number>>();
    const contractTotals = new Map<string, number>();
    for (const u of users) {
      const dept = u.department?.name ?? 'Sem departamento';
      const contract = u.contractType ?? 'NOT_SET';
      const row = byDept.get(dept) ?? new Map<string, number>();
      row.set(contract, (row.get(contract) ?? 0) + 1);
      byDept.set(dept, row);
      contractTotals.set(contract, (contractTotals.get(contract) ?? 0) + 1);
    }

    const categories = [...byDept.entries()]
      .map(([name, m]) => ({ name, total: [...m.values()].reduce((s, v) => s + v, 0), m }))
      .sort((a, b) => b.total - a.total)
      .slice(0, DEPT_LIMIT);

    // Série = tipos de vínculo (por ordem de dimensão), com os de menor peso
    // agrupados em "OTHER" para a legenda não ultrapassar 4 séries.
    const ranked = [...contractTotals.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => k);
    const main = ranked.slice(0, 3);
    const hasOther = ranked.length > 3;
    const series = [...main, ...(hasOther ? ['OTHER'] : [])].map(key => ({
      key,
      values: categories.map(c =>
        key === 'OTHER'
          ? [...c.m.entries()].filter(([k]) => !main.includes(k)).reduce((s, [, v]) => s + v, 0)
          : (c.m.get(key) ?? 0),
      ),
    }));

    return { categories: categories.map(c => c.name), series };
  }

  // ─── §6.4 — metas e resultados ────────────────────────────────────────────

  async goals(f: ResolvedFilters) {
    const scope = this.metrics.userScope(f);
    const kpis = await this.metrics.computeKpis(f, [
      'PERFORMANCE',
      'TRAINING_COMPLETION',
      'ATTENDANCE',
      'TURNOVER',
    ]);
    const vsTarget = kpis
      .filter(k => k.value !== null && k.target !== null)
      .map(k => ({
        code: k.code,
        label: k.shortLabel,
        actual: k.value as number,
        target: k.target as number,
        deviation: k.deviation,
        direction: k.direction,
        state: k.state,
        unit: k.unit,
      }));

    const enr = f.courseId ? { courseId: f.courseId } : {};
    const [
      actionsTotal,
      actionsDone,
      mandTotal,
      mandDone,
      onbTotal,
      onbDone,
      avatarTotal,
      avatarDone,
    ] = await Promise.all([
      this.prisma.read.developmentPlanAction.count({
        where: { plan: { user: scope }, status: { not: 'CANCELLED' } },
      }),
      this.prisma.read.developmentPlanAction.count({
        where: { plan: { user: scope }, status: 'COMPLETED' },
      }),
      this.prisma.read.enrollment.count({
        where: {
          user: scope,
          ...enr,
          mandatory: true,
          status: { notIn: ['CANCELLED', 'PENDING_APPROVAL'] },
        },
      }),
      this.prisma.read.enrollment.count({
        where: { user: scope, ...enr, mandatory: true, status: 'COMPLETED' },
      }),
      this.prisma.read.onboardingPlan.count({ where: { user: scope } }),
      this.prisma.read.onboardingPlan.count({ where: { user: scope, status: 'COMPLETED' } }),
      this.prisma.read.avatarTrainingAssignment.count({
        where: { user: scope, mandatory: true, status: { not: 'CANCELLED' } },
      }),
      this.prisma.read.avatarTrainingAssignment.count({
        where: { user: scope, mandatory: true, status: 'COMPLETED' },
      }),
    ]);

    const exec = (label: string, done: number, total: number, source: string) => ({
      label,
      done,
      total,
      pct: total > 0 ? round1((done / total) * 100) : null,
      source,
    });

    return {
      vsTarget,
      execution: [
        exec('Acções de PDI concluídas', actionsDone, actionsTotal, 'development-plans'),
        exec('Formações obrigatórias concluídas', mandDone, mandTotal, 'enrollments'),
        exec('Planos de onboarding concluídos', onbDone, onbTotal, 'onboarding'),
        exec(
          'Formações com avatar obrigatórias concluídas',
          avatarDone,
          avatarTotal,
          'avatar-training',
        ),
      ],
    };
  }

  // ─── §6.5 — riscos e anomalias ────────────────────────────────────────────

  async risks(f: ResolvedFilters) {
    const scope = this.metrics.userScope(f);
    const now = new Date();
    const rows = await this.perDepartment(f);

    const heatmap = rows.map(r => {
      const per100 = (n: number) => (r.headcount > 0 ? round1((n / r.headcount) * 100) : null);
      const pdiRate = per100(r.overduePdi);
      const mandRate = per100(r.overdueMandatory);
      return {
        id: r.id,
        name: r.name,
        headcount: r.headcount,
        cells: {
          turnover: {
            value: r.turnover,
            level: levelOf(
              r.turnover,
              RISK_CRITERIA.turnover.warning,
              RISK_CRITERIA.turnover.critical,
            ),
          },
          absenteeism: {
            value: r.absenteeism,
            level: levelOf(
              r.absenteeism,
              RISK_CRITERIA.absenteeism.warning,
              RISK_CRITERIA.absenteeism.critical,
            ),
          },
          overduePdi: {
            value: r.overduePdi,
            rate: pdiRate,
            level: levelOf(
              pdiRate,
              RISK_CRITERIA.overduePdi.warning,
              RISK_CRITERIA.overduePdi.critical,
              true,
            ),
          },
          overdueMandatory: {
            value: r.overdueMandatory,
            rate: mandRate,
            level: levelOf(
              mandRate,
              RISK_CRITERIA.overdueMandatory.warning,
              RISK_CRITERIA.overdueMandatory.critical,
              true,
            ),
          },
        },
      };
    });

    const [pdiActions, mandatory, leaves] = await Promise.all([
      this.prisma.read.developmentPlanAction.findMany({
        where: {
          plan: { user: scope },
          status: { notIn: ['COMPLETED', 'CANCELLED'] },
          dueDate: { lt: now },
        },
        orderBy: { dueDate: 'asc' },
        take: EXCEPTIONS_LIMIT,
        select: {
          id: true,
          title: true,
          dueDate: true,
          plan: {
            select: {
              user: { select: { fullName: true, department: { select: { name: true } } } },
            },
          },
        },
      }),
      this.prisma.read.enrollment.findMany({
        where: {
          user: scope,
          ...(f.courseId ? { courseId: f.courseId } : {}),
          mandatory: true,
          status: { notIn: ['COMPLETED', 'CANCELLED', 'PENDING_APPROVAL'] },
          deadline: { lt: now },
        },
        orderBy: { deadline: 'asc' },
        take: EXCEPTIONS_LIMIT,
        select: {
          id: true,
          deadline: true,
          course: { select: { title: true } },
          user: { select: { fullName: true, department: { select: { name: true } } } },
        },
      }),
      this.prisma.read.leaveRequest.findMany({
        where: {
          user: scope,
          status: 'PENDING',
          createdAt: { lt: new Date(now.getTime() - 7 * DAY_MS) },
        },
        orderBy: { createdAt: 'asc' },
        take: EXCEPTIONS_LIMIT,
        select: {
          id: true,
          createdAt: true,
          leaveTypeCode: true,
          user: { select: { fullName: true, department: { select: { name: true } } } },
        },
      }),
    ]);

    const daysSince = (d: Date) => Math.floor((now.getTime() - d.getTime()) / DAY_MS);

    return {
      criteria: RISK_CRITERIA,
      heatmap,
      exceptions: {
        overduePdiActions: pdiActions.map(a => ({
          id: a.id,
          title: a.title,
          person: a.plan.user.fullName,
          department: a.plan.user.department?.name ?? null,
          dueDate: a.dueDate,
          daysOverdue: a.dueDate ? daysSince(a.dueDate) : null,
        })),
        overdueMandatoryTraining: mandatory.map(e => ({
          id: e.id,
          title: e.course.title,
          person: e.user.fullName,
          department: e.user.department?.name ?? null,
          dueDate: e.deadline,
          daysOverdue: e.deadline ? daysSince(e.deadline) : null,
        })),
        staleLeaveApprovals: leaves.map(l => ({
          id: l.id,
          title: l.leaveTypeCode,
          person: l.user.fullName,
          department: l.user.department?.name ?? null,
          dueDate: l.createdAt,
          daysOverdue: daysSince(l.createdAt),
        })),
      },
    };
  }

  // ─── §4 — matriz de integração ────────────────────────────────────────────

  /** Estado de cada ligação + contagem de registos (dentro do âmbito do utilizador). */
  async sources(f: ResolvedFilters, canSeeRestricted: boolean) {
    const scope = this.metrics.userScope(f);
    const counters: Record<SourceCounterKey, () => Promise<number>> = {
      users: () => this.prisma.read.user.count({ where: scope }),
      departments: () => this.prisma.read.department.count(),
      attendance: () => this.prisma.read.attendanceRecord.count({ where: { user: scope } }),
      leave: () => this.prisma.read.leaveRequest.count({ where: { user: scope } }),
      courses: () => this.prisma.read.course.count(),
      enrollments: () => this.prisma.read.enrollment.count({ where: { user: scope } }),
      performance: () => this.prisma.read.performanceGoal.count({ where: { user: scope } }),
      competencies: () => this.prisma.read.userCompetency.count({ where: { user: scope } }),
      'development-plans': () =>
        this.prisma.read.developmentPlanAction.count({ where: { plan: { user: scope } } }),
      onboarding: () => this.prisma.read.onboardingPlan.count({ where: { user: scope } }),
      'avatar-training': () =>
        this.prisma.read.avatarTrainingAttempt.count({ where: { user: scope } }),
    };

    const visible = SOURCE_MATRIX.filter(s => canSeeRestricted || !s.restricted);
    const entries = await Promise.all(
      visible.map(async ({ counter, ...s }) => ({
        ...s,
        recordCount: counter ? await counters[counter]() : null,
      })),
    );

    const integrated = entries.filter(e => e.status === 'INTEGRATED');
    return {
      summary: {
        total: entries.length,
        integrated: integrated.length,
        withData: integrated.filter(e => (e.recordCount ?? 0) > 0).length,
        planned: entries.filter(e => e.status === 'PLANNED').length,
      },
      sources: entries,
      checkedAt: new Date().toISOString(),
    };
  }
}
