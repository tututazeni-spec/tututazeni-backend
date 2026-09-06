// src/metrics-aggregation/metrics-aggregation.service.ts
//
// MetricsAggregationService (Fase H) — serviço de leitura único e canónico para
// as métricas do domínio 10 (headcount / turnover / trainingRoi / alerts /
// managerDashboard). Substitui as ~10 implementações divergentes espalhadas por
// `dashboard`, `dashboard-rh`, `reports`, `analytics` e `roi-impact`.
//
// Regras fixas:
//  - SÓ leitura. Zero create/update/delete. Todas as queries via `this.prisma.read.*`.
//  - Fórmulas canónicas: docs/superpowers/plans/notes/fase-h-metrics-variants.md.
//    Task 2 implementa `headcount` (§1.2) + `headcountTrend` (§1.3). As restantes
//    4 métricas chegam nas Tasks 3-5 (interfaces já em metrics.types.ts).
//  - `active:false` sozinho NÃO é "saiu" (mistura SUSPENDED). O sinal de saída é
//    `exitDate` preenchido; o de entrada é `hireDate` (§0/§2.0).

import { Injectable } from '@nestjs/common';
import { EnrollmentStatus, Prisma, ReviewStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  AlertParams,
  DashboardPeriodKey,
  HeadcountBreakdownEntry,
  HeadcountParams,
  HeadcountResult,
  HeadcountTrendParams,
  HeadcountTrendPoint,
  ManagerDashboardKpis,
  ManagerDashboardParams,
  ManagerDashboardResult,
  ManagerDashboardTeamMember,
  MetricAlert,
  MetricScopeFilter,
  TrainingRoiParams,
  TrainingRoiResult,
  TurnoverParams,
  TurnoverResult,
} from './metrics.types';
import {
  evaluateRule_EVAL_360_PENDING,
  evaluateRule_INACTIVE_COLLABORATORS,
  evaluateRule_MANAGER_TEAM_RISK,
  evaluateRule_MANDATORY_RATE_LOW,
  evaluateRule_MANDATORY_TRAINING_PENDING,
  evaluateRule_PDI_ACTION_CRITICAL,
  evaluateRule_PDI_ACTIONS_OVERDUE,
  evaluateRule_PDI_PLAN_OVERDUE,
  evaluateRule_PDP_COVERAGE_LOW,
  evaluateRule_PERFORMANCE_CRITICAL,
  evaluateRule_SURVEY_PARTICIPATION_LOW,
  evaluateRule_SURVEYS_PENDING,
  evaluateRule_TEAM_PERFORMANCE_AT_RISK,
  sortAlerts,
} from './alert-rules';

const MONTH_MS = 30 * 86400000;

// Assunções financeiras — DEFAULTS reais de `src/roi-impact/roi-impact.service.ts:11-13`
// (`calculateRoiFull`, a única variante que produz ROI% / BCR / payback). Overridáveis
// por chamada via `TrainingRoiParams`.
const TRAINING_ROI_COST_PER_ENROLLMENT = 200; // USD
const TRAINING_ROI_BENEFIT_PER_COMPLETION = 500; // USD

// String constante que documenta a metodologia canónica escolhida (nota §3.2). Vai no
// payload de `trainingRoi` para a ratificação do dono do produto no PR da Task 10.
const TRAINING_ROI_METHODOLOGY =
  'Custo = inscrições × 200 USD (costPerEnrollment); Benefício = conclusões × 500 USD ' +
  '(benefitPerCompletion); ROI% = (benefício − custo) / custo × 100; BCR = benefício / custo; ' +
  'payback (meses) = custo / (benefício / 12); horas = Σ Course.workloadHours das conclusões ' +
  'na janela (fallback: conclusões × 2h); janela default = 12 meses até `to`. Base: modelo ' +
  'financeiro de roi-impact.calculateRoiFull + horas reais de analytics.getTrainingROI.';

/** where escalar comum a headcount / trend (departmentId / managerId / positionId). */
function scopeWhere(f: MetricScopeFilter): Record<string, number> {
  const where: Record<string, number> = {};
  if (f.departmentId != null) where.departmentId = f.departmentId;
  if (f.managerId != null) where.managerId = f.managerId;
  if (f.positionId != null) where.positionId = f.positionId;
  return where;
}

/**
 * where para "activos ponto-a-ponto" numa dada fronteira temporal:
 * já admitidos (`hireDate <= boundary`) e ainda não saídos nesse instante
 * (`exitDate == null || exitDate > boundary`). Mesmo padrão do `headcountTrend`.
 */
function activeAsOfWhere(scope: Record<string, number>, boundary: Date): Record<string, unknown> {
  return {
    ...scope,
    hireDate: { lte: boundary },
    OR: [{ exitDate: null }, { exitDate: { gt: boundary } }],
  };
}

/** meses (aprox. 30 dias) desde `since` até agora. Base = hireDate ?? createdAt. */
function tenureMonths(since: Date): number {
  return Math.floor((Date.now() - new Date(since).getTime()) / MONTH_MS);
}

function round(value: number, dp: number): number {
  return +value.toFixed(dp);
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

const DAY_MS = 86400000;

/** Início do período — equivalente a `periodStart` de `src/dashboard/dashboard.service.ts:11`. */
function periodStart(period?: DashboardPeriodKey): Date {
  const now = new Date();
  switch (period) {
    case 'WEEK':
      return new Date(now.setDate(now.getDate() - 7));
    case 'QUARTER':
      return new Date(now.setMonth(now.getMonth() - 3));
    case 'YEAR':
      return new Date(now.setFullYear(now.getFullYear() - 1));
    default:
      return new Date(now.getFullYear(), now.getMonth(), 1); // MONTH (default)
  }
}

/** Início do período anterior — equivalente a `prevPeriodStart` de `dashboard.service.ts:25`. */
function prevPeriodStart(period?: DashboardPeriodKey): Date {
  const now = new Date();
  switch (period) {
    case 'WEEK':
      return new Date(now.setDate(now.getDate() - 14));
    case 'QUARTER':
      return new Date(now.setMonth(now.getMonth() - 6));
    case 'YEAR':
      return new Date(now.setFullYear(now.getFullYear() - 2));
    default:
      return new Date(now.getFullYear(), now.getMonth() - 1, 1);
  }
}

/** % de variação — equivalente a `trend` de `dashboard.service.ts:39` (previous 0 → 0). */
function pctTrend(current: number, previous: number): number {
  if (previous === 0) return 0;
  return round(((current - previous) / previous) * 100, 1);
}

function emptyManagerKpis(): ManagerDashboardKpis {
  return {
    pdpCoverage: 0,
    activePlans: 0,
    completedPlans: 0,
    inProgress: 0,
    completedEnrollments: 0,
    enrollmentsTotal: 0,
    completions: 0,
    completionRate: 0,
    avgScore: null,
    scoreTrend: null,
    mandatoryRate: 0,
    engagementResponses: 0,
    avatarSessions: 0,
    pendingEvals: 0,
    overdueActions: 0,
  };
}

@Injectable()
export class MetricsAggregationService {
  constructor(private readonly prisma: PrismaService) {}

  // ══════════════════════════════════════════════════════════════════
  // headcount — nota §1.2
  // ══════════════════════════════════════════════════════════════════

  async headcount(params: HeadcountParams): Promise<HeadcountResult> {
    const to = params.to ?? new Date();
    const from =
      params.from ??
      new Date(to.getFullYear() - 1, to.getMonth(), to.getDate(), to.getHours(), to.getMinutes());
    const durationMs = to.getTime() - from.getTime();
    const prevFrom = new Date(from.getTime() - durationMs);

    const where = scopeWhere(params);

    const [total, active, newHires, newHiresPrev] = await Promise.all([
      this.prisma.read.user.count({ where }),
      this.prisma.read.user.count({ where: { ...where, active: true } }),
      this.prisma.read.user.count({ where: { ...where, hireDate: { gte: from, lte: to } } }),
      this.prisma.read.user.count({
        where: { ...where, hireDate: { gte: prevFrom, lt: from } },
      }),
    ]);

    const [deptRows, posRows, tenureUsers] = await Promise.all([
      this.prisma.read.department.findMany({
        select: {
          id: true,
          name: true,
          _count: { select: { users: { where: { active: true } } } },
        },
      }),
      this.prisma.read.position.findMany({
        select: {
          id: true,
          name: true,
          level: true,
          _count: { select: { users: { where: { active: true } } } },
        },
        orderBy: { users: { _count: 'desc' } },
        take: 10,
      }),
      this.prisma.read.user.findMany({
        where: { ...where, active: true },
        select: { hireDate: true, createdAt: true },
      }),
    ]);

    const byDepartment: HeadcountBreakdownEntry[] = deptRows
      .map(d => ({ id: d.id, name: d.name, count: d._count.users }))
      .sort((a, b) => b.count - a.count);

    const byPosition: HeadcountBreakdownEntry[] = posRows.map(p => {
      const entry: HeadcountBreakdownEntry = { id: p.id, name: p.name, count: p._count.users };
      if (p.level != null) entry.level = p.level as string;
      return entry;
    });

    const byTenure = { '<1yr': 0, '1-2yr': 0, '2-5yr': 0, '5+yr': 0 };
    let tenureSum = 0;
    for (const u of tenureUsers) {
      const months = tenureMonths(u.hireDate ?? u.createdAt);
      tenureSum += months;
      if (months < 12) byTenure['<1yr']++;
      else if (months < 24) byTenure['1-2yr']++;
      else if (months < 60) byTenure['2-5yr']++;
      else byTenure['5+yr']++;
    }
    const avgTenureMonths = tenureUsers.length ? round(tenureSum / tenureUsers.length, 1) : 0;

    const newHiresTrend =
      newHiresPrev > 0 ? round(((newHires - newHiresPrev) / newHiresPrev) * 100, 1) : 0;

    return {
      total,
      active,
      inactive: total - active,
      newHires,
      newHiresPrev,
      newHiresTrend,
      avgTenureMonths,
      byTenure,
      byDepartment,
      byPosition,
      period: { from, to },
      generatedAt: new Date(),
    };
  }

  // ══════════════════════════════════════════════════════════════════
  // headcountTrend — nota §1.3
  // ══════════════════════════════════════════════════════════════════

  async headcountTrend(params: HeadcountTrendParams): Promise<HeadcountTrendPoint[]> {
    const months = params.months ?? 6;
    const where = scopeWhere(params);
    const now = new Date();

    const points: HeadcountTrendPoint[] = [];
    for (let i = months - 1; i >= 0; i--) {
      const mStart = new Date(now.getFullYear(), now.getMonth() - i, 1, 0, 0, 0, 0);
      const mEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 0, 23, 59, 59, 999);

      const [headcount, added, left] = await Promise.all([
        this.prisma.read.user.count({
          where: {
            ...where,
            hireDate: { lte: mEnd },
            OR: [{ exitDate: null }, { exitDate: { gt: mEnd } }],
          },
        }),
        this.prisma.read.user.count({
          where: { ...where, hireDate: { gte: mStart, lte: mEnd } },
        }),
        this.prisma.read.user.count({
          where: { ...where, exitDate: { gte: mStart, lte: mEnd } },
        }),
      ]);

      points.push({
        month: `${mEnd.getFullYear()}-${pad2(mEnd.getMonth() + 1)}`,
        headcount,
        new: added,
        left,
      });
    }
    return points;
  }

  // ══════════════════════════════════════════════════════════════════
  // turnover — nota §2.2
  // ══════════════════════════════════════════════════════════════════
  //
  // Numerador = `exitDate` na janela (== hrStatus:'TERMINATED', escritos juntos em
  // users.service.remove). NUNCA `updatedAt` (bumped por qualquer edição de perfil),
  // NUNCA `active:false` sozinho (inclui SUSPENDED). Denominador canónico =
  // `avgHeadcount = (headcountStart + headcountEnd) / 2` (ruling do controller,
  // Task 1 review 2026-09-06). Trend vs janela anterior de igual duração.
  //
  // Cobertura de dados: se a BD tiver muitos `hireDate`/`exitDate` nulos (legado),
  // `leavers`/`newHires`/tenure ficam subcontados — é o número *correcto*, ainda que
  // baixo (nota §8 risco 2). `avgTenureMonths` usa `hireDate ?? createdAt` como base.

  async turnover(params: TurnoverParams): Promise<TurnoverResult> {
    const to = params.to ?? new Date();
    const from =
      params.from ??
      new Date(to.getFullYear() - 1, to.getMonth(), to.getDate(), to.getHours(), to.getMinutes());
    const durationMs = to.getTime() - from.getTime();
    const prevFrom = new Date(from.getTime() - durationMs);

    const where = scopeWhere(params);

    const [leavers, headcountStart, headcountEnd, leaversPrev, headcountPrevStart, newHires] =
      await Promise.all([
        this.prisma.read.user.count({ where: { ...where, exitDate: { gte: from, lte: to } } }),
        this.prisma.read.user.count({ where: activeAsOfWhere(where, from) }),
        this.prisma.read.user.count({ where: activeAsOfWhere(where, to) }),
        this.prisma.read.user.count({
          where: { ...where, exitDate: { gte: prevFrom, lt: from } },
        }),
        this.prisma.read.user.count({ where: activeAsOfWhere(where, prevFrom) }),
        this.prisma.read.user.count({ where: { ...where, hireDate: { gte: from, lte: to } } }),
      ]);

    const avgHeadcount = (headcountStart + headcountEnd) / 2;
    const turnoverRate = avgHeadcount > 0 ? round((leavers / avgHeadcount) * 100, 1) : 0;
    const retentionRate = round(100 - turnoverRate, 1);

    // janela anterior: reutiliza `headcountStart` actual como fim da janela anterior
    const prevAvgHeadcount = (headcountPrevStart + headcountStart) / 2;
    const turnoverRatePrev =
      prevAvgHeadcount > 0 ? round((leaversPrev / prevAvgHeadcount) * 100, 1) : 0;
    const turnoverTrend = round(turnoverRate - turnoverRatePrev, 1);

    const tenureUsers = await this.prisma.read.user.findMany({
      where: { ...where, active: true },
      select: { hireDate: true, createdAt: true },
    });
    let tenureSum = 0;
    for (const u of tenureUsers) {
      tenureSum += tenureMonths(u.hireDate ?? u.createdAt);
    }
    const avgTenureMonths = tenureUsers.length ? round(tenureSum / tenureUsers.length, 1) : 0;

    return {
      leavers,
      avgHeadcount,
      turnoverRate,
      retentionRate,
      turnoverRatePrev,
      turnoverTrend,
      newHires,
      netHeadcountChange: newHires - leavers,
      avgTenureMonths,
      insights: this.buildTurnoverInsights(turnoverRate, leavers),
      period: { from, to },
    };
  }

  // ══════════════════════════════════════════════════════════════════
  // trainingRoi — nota §3.2
  // ══════════════════════════════════════════════════════════════════
  //
  // Base = modelo financeiro do `roi-impact.calculateRoiFull` (única variante que
  // produz ROI% / BCR / payback / confiança); correcção importada do
  // `analytics.getTrainingROI`: as horas vêm de `Course.workloadHours` real das
  // inscrições concluídas na janela — não do flat `completed × 2h`. Esse flat fica
  // apenas como fallback quando `workloadHours` está ausente em massa.
  //
  // `where` = AND(enrolledAt ∈ [from,to], departmentId ? { user: { departmentId } } : {},
  // courseId ? { courseId } : {}). Janela default = trailing 12 meses até `to`.
  //
  // Overlays (retenção, performance, Kirkpatrick, What-If, Program Library) ficam
  // FORA do primitivo — compõem por cima nos módulos (nota §3.2).

  async trainingRoi(params: TrainingRoiParams): Promise<TrainingRoiResult> {
    const to = params.to ?? new Date();
    const from =
      params.from ??
      new Date(to.getFullYear() - 1, to.getMonth(), to.getDate(), to.getHours(), to.getMinutes());

    const costPerEnrollment = params.costPerEnrollment ?? TRAINING_ROI_COST_PER_ENROLLMENT;
    const benefitPerCompletion = params.benefitPerCompletion ?? TRAINING_ROI_BENEFIT_PER_COMPLETION;

    const where: Record<string, unknown> = { enrolledAt: { gte: from, lte: to } };
    if (params.departmentId != null) where.user = { departmentId: params.departmentId };
    if (params.courseId != null) where.courseId = params.courseId;

    const completedWhere = { ...where, status: EnrollmentStatus.COMPLETED };

    const [enrollments, completed, completedRows] = await Promise.all([
      this.prisma.read.enrollment.count({ where }),
      this.prisma.read.enrollment.count({ where: completedWhere }),
      this.prisma.read.enrollment.findMany({
        where: completedWhere,
        include: { course: { select: { workloadHours: true } } },
      }),
    ]);

    const completionRate = enrollments > 0 ? round((completed / enrollments) * 100, 1) : 0;

    const totalCost = enrollments * costPerEnrollment;
    const grossBenefit = completed * benefitPerCompletion;
    const netBenefit = grossBenefit - totalCost;

    // Guardas de divisão-por-zero obrigatórias (nunca NaN/Infinity):
    // totalCost 0 → roiPct 0, bcr 0 · grossBenefit 0 → paybackMonths 0.
    const roiPct = totalCost > 0 ? round(((grossBenefit - totalCost) / totalCost) * 100, 1) : 0;
    const bcr = totalCost > 0 ? round(grossBenefit / totalCost, 2) : 0;
    const paybackMonths = grossBenefit > 0 ? round(totalCost / (grossBenefit / 12), 1) : 0;

    const summedWorkloadHours = completedRows.reduce(
      (sum, row) =>
        sum + ((row as { course?: { workloadHours: number | null } }).course?.workloadHours ?? 0),
      0,
    );
    const trainingHours = summedWorkloadHours > 0 ? summedWorkloadHours : completed * 2;

    const confidence: TrainingRoiResult['confidence'] =
      completed >= 50 ? 'HIGH' : completed >= 20 ? 'MEDIUM' : 'LOW';

    return {
      enrollments,
      completed,
      completionRate,
      costPerEnrollment,
      benefitPerCompletion,
      totalCost,
      grossBenefit,
      netBenefit,
      roiPct,
      bcr,
      paybackMonths,
      trainingHours,
      confidence,
      methodology: TRAINING_ROI_METHODOLOGY,
      period: { from, to },
    };
  }

  // ── helpers privados ──────────────────────────────────────────────

  // Portado de `src/dashboard-rh/dashboard-rh.service.ts:1255` (variante emoji,
  // thresholds 10% / 20% — nota §8 risco 4). Existe uma 2ª cópia sem emojis em
  // `src/reports/reports.service.ts:1134`. As duas originais são removidas nas
  // Tasks 6/8, que passam a ler `result.insights` (Task 9 assere
  // `grep buildTurnoverInsights == 1`). O 2º argumento é o `leavers` da janela
  // analisada; o texto da 2ª linha foi tornado neutro à janela ("no período") —
  // o original do dashboard-rh dizia "nos últimos 3 meses" porque lá recebia um
  // sub-total de 3 meses, o que não se aplica a esta janela configurável.
  private buildTurnoverInsights(rate: number, leavers: number): string[] {
    const out: string[] = [];
    if (rate > 20) out.push(`🚨 Turnover crítico: ${rate}% — investigar causas urgentemente`);
    else if (rate > 10) out.push(`⚠️ Turnover acima da média: ${rate}%`);
    else out.push(`✅ Turnover saudável: ${rate}%`);
    if (leavers > 0) out.push(`${leavers} saída(s) no período`);
    return out;
  }

  // ══════════════════════════════════════════════════════════════════
  // alerts — catálogo canónico §4.6 (13 regras), assinatura §4.8
  // ══════════════════════════════════════════════════════════════════
  //
  // União de 4 fontes: `dashboard.getAlerts` (§4.1, pessoal + ramo gestor),
  // `dashboard.buildManagerAlerts` (§4.2, /dashboard/manager), `dashboard-rh.getAlerts`
  // (§4.3, organização) e `analytics.getRiskAlerts` (§4.4, dept-scoped).
  //
  // scope→regras (§4.8):
  //   'user'         → 1-4        (contexto do próprio)
  //   'team'         → 2,5-8,11-13 (managerId = userId)
  //   'organization' → 3-4,9-13
  // Resultado sempre ordenado por severidade (HIGH→MEDIUM→LOW) e depois por `key`.
  // As 13 regras vivem em `alert-rules.ts` como funções puras; aqui só se fazem as
  // leituras (via `this.prisma.read.*`) uma vez e compõem-se as regras do scope.
  //
  // `departmentId` estreita 'organization'/'team' apenas nas regras baseadas na
  // população (11/12/13, via os `userIds`); as regras 3/4/9/10 mantêm-se globais —
  // as fontes §4.1/§4.3 não têm dimensão de departamento.

  async alerts(params: AlertParams): Promise<MetricAlert[]> {
    if (params.scope === 'user') return sortAlerts(await this.userAlerts(params));
    if (params.scope === 'team') return sortAlerts(await this.teamAlerts(params));
    return sortAlerts(await this.organizationAlerts(params));
  }

  /** scope 'user' — regras 1-4 (contexto do próprio utilizador). */
  private async userAlerts(params: AlertParams): Promise<MetricAlert[]> {
    const userId = params.userId;
    if (userId == null) return [];
    const now = new Date();

    const [pendingSurveys, pendingEvals, overdueActions, mandatoryPendingCourses] =
      await Promise.all([
        this.prisma.read.engagementSurvey.count({
          where: { status: 'ACTIVE', responses: { none: { userId } } },
        }),
        this.prisma.read.evaluationRequest.count({
          where: { evaluatorId: userId, status: 'PENDING' },
        }),
        this.prisma.read.developmentPlanAction.count({
          where: {
            plan: { userId },
            status: { notIn: ['COMPLETED', 'CANCELLED'] },
            dueDate: { lt: now },
          },
        }),
        this.prisma.read.course.count({
          where: {
            mandatory: true,
            enrollments: { none: { userId, status: EnrollmentStatus.COMPLETED } },
          },
        }),
      ]);

    return [
      evaluateRule_SURVEYS_PENDING(pendingSurveys),
      evaluateRule_EVAL_360_PENDING(pendingEvals, 'user'),
      evaluateRule_PDI_ACTIONS_OVERDUE(overdueActions, 'user'),
      evaluateRule_MANDATORY_TRAINING_PENDING(mandatoryPendingCourses, 'user'),
    ].filter((a): a is MetricAlert => a !== null);
  }

  /** scope 'organization' — regras 3-4, 9-13 (organização inteira). */
  private async organizationAlerts(params: AlertParams): Promise<MetricAlert[]> {
    const { departmentId } = params;
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const since60 = new Date(Date.now() - 60 * DAY_MS);
    const since14 = new Date(Date.now() - 14 * DAY_MS);

    const popWhere: Prisma.UserWhereInput = { active: true };
    if (departmentId != null) popWhere.departmentId = departmentId;
    const popRows = await this.prisma.read.user.findMany({ where: popWhere, select: { id: true } });
    const userIds = popRows.map(u => u.id);

    const [
      overdueActionsOrg,
      mandatoryPendingOrg,
      perfCritical,
      responsesThisMonth,
      activeUsersCount,
      recentRows,
      overduePlans,
      criticalActions,
    ] = await Promise.all([
      this.prisma.read.developmentPlanAction.count({
        where: { status: { notIn: ['COMPLETED', 'CANCELLED'] }, dueDate: { lt: now } },
      }),
      this.prisma.read.enrollment.count({
        where: { course: { mandatory: true }, status: { not: EnrollmentStatus.COMPLETED } },
      }),
      this.prisma.read.performanceReview.count({
        where: { score: { lt: 2 }, status: ReviewStatus.PUBLISHED },
      }),
      this.prisma.read.surveyResponse.count({ where: { createdAt: { gte: monthStart } } }),
      this.prisma.read.user.count({ where: { active: true } }),
      this.prisma.read.enrollment.findMany({
        where: { userId: { in: userIds }, enrolledAt: { gte: since60 } },
        select: { userId: true },
        distinct: ['userId'],
      }),
      this.prisma.read.developmentPlan.count({
        where: { userId: { in: userIds }, status: 'ACTIVE', endDate: { lt: now } },
      }),
      this.prisma.read.developmentPlanAction.count({
        where: {
          plan: { userId: { in: userIds }, status: 'ACTIVE' },
          status: { not: 'COMPLETED' },
          dueDate: { lt: since14 },
        },
      }),
    ]);

    const recentIds = new Set(recentRows.map(e => e.userId));
    const inactiveCount = userIds.filter(id => !recentIds.has(id)).length;

    return [
      evaluateRule_PDI_ACTIONS_OVERDUE(overdueActionsOrg, 'organization'),
      evaluateRule_MANDATORY_TRAINING_PENDING(mandatoryPendingOrg, 'organization'),
      evaluateRule_PERFORMANCE_CRITICAL(perfCritical),
      evaluateRule_SURVEY_PARTICIPATION_LOW(responsesThisMonth, activeUsersCount),
      evaluateRule_INACTIVE_COLLABORATORS(inactiveCount, 'organization'),
      evaluateRule_PDI_PLAN_OVERDUE(overduePlans, 'organization'),
      evaluateRule_PDI_ACTION_CRITICAL(criticalActions, 'organization'),
    ].filter((a): a is MetricAlert => a !== null);
  }

  /** scope 'team' — regras 2, 5-8, 11-13 (managerId = userId). */
  private async teamAlerts(params: AlertParams): Promise<MetricAlert[]> {
    const managerId = params.userId;
    if (managerId == null) return [];
    const { roleCode, departmentId } = params;
    const now = new Date();
    const since60 = new Date(Date.now() - 60 * DAY_MS);
    const since14 = new Date(Date.now() - 14 * DAY_MS);

    const teamWhere: Prisma.UserWhereInput = { managerId, active: true };
    if (departmentId != null) teamWhere.departmentId = departmentId;
    const teamRows = await this.prisma.read.user.findMany({
      where: teamWhere,
      select: { id: true },
    });
    const teamIds = teamRows.map(u => u.id);
    const isPrivileged = !!roleCode && ['ADMIN', 'RH', 'LIDER'].includes(roleCode);

    const [
      pendingEvals,
      teamAtRiskPerf,
      memberEnrollments,
      memberPerfReviews,
      activePlans,
      mandatoryTotal,
      mandatoryComplete,
      recentRows,
      overduePlans,
      criticalActions,
    ] = await Promise.all([
      this.prisma.read.evaluationRequest.count({
        where: { evaluatorId: managerId, status: 'PENDING' },
      }),
      isPrivileged
        ? this.prisma.read.user.count({
            where: {
              managerId,
              active: true,
              performanceReviews: { some: { score: { lt: 2.5 } } },
            },
          })
        : Promise.resolve(0),
      this.prisma.read.enrollment.findMany({
        where: { userId: { in: teamIds } },
        select: { userId: true, status: true },
      }),
      this.prisma.read.performanceReview.findMany({
        where: { userId: { in: teamIds } },
        select: { userId: true, score: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.read.developmentPlan.count({
        where: { userId: { in: teamIds }, status: 'ACTIVE', isTemplate: false },
      }),
      this.prisma.read.enrollment.count({
        where: { userId: { in: teamIds }, course: { mandatory: true } },
      }),
      this.prisma.read.enrollment.count({
        where: {
          userId: { in: teamIds },
          course: { mandatory: true },
          status: EnrollmentStatus.COMPLETED,
        },
      }),
      this.prisma.read.enrollment.findMany({
        where: { userId: { in: teamIds }, enrolledAt: { gte: since60 } },
        select: { userId: true },
        distinct: ['userId'],
      }),
      this.prisma.read.developmentPlan.count({
        where: { userId: { in: teamIds }, status: 'ACTIVE', endDate: { lt: now } },
      }),
      this.prisma.read.developmentPlanAction.count({
        where: {
          plan: { userId: { in: teamIds }, status: 'ACTIVE' },
          status: { not: 'COMPLETED' },
          dueDate: { lt: since14 },
        },
      }),
    ]);

    // atRisk por membro (§4.2): última review `< 2.5` OU (0 conclusões e >0 inscrições).
    const atRisk = teamIds.filter(id => {
      const es = memberEnrollments.filter(e => e.userId === id);
      const done = es.filter(e => e.status === EnrollmentStatus.COMPLETED).length;
      const latest = memberPerfReviews.find(r => r.userId === id);
      return (latest !== undefined && (latest.score ?? 0) < 2.5) || (done === 0 && es.length > 0);
    }).length;

    const pdpCoverage = teamIds.length > 0 ? round((activePlans / teamIds.length) * 100, 1) : 0;
    const mandatoryRate =
      mandatoryTotal > 0 ? round((mandatoryComplete / mandatoryTotal) * 100, 1) : 100;
    const recentIds = new Set(recentRows.map(e => e.userId));
    const inactiveCount = teamIds.filter(id => !recentIds.has(id)).length;

    const out: (MetricAlert | null)[] = [
      evaluateRule_EVAL_360_PENDING(pendingEvals, 'team'),
      evaluateRule_TEAM_PERFORMANCE_AT_RISK(roleCode, teamAtRiskPerf),
      evaluateRule_INACTIVE_COLLABORATORS(inactiveCount, 'team'),
      evaluateRule_PDI_PLAN_OVERDUE(overduePlans, 'team'),
      evaluateRule_PDI_ACTION_CRITICAL(criticalActions, 'team'),
    ];
    if (teamIds.length > 0) {
      out.push(
        evaluateRule_MANAGER_TEAM_RISK(atRisk),
        evaluateRule_MANDATORY_RATE_LOW(mandatoryRate),
        evaluateRule_PDP_COVERAGE_LOW(pdpCoverage),
      );
    }
    return out.filter((a): a is MetricAlert => a !== null);
  }

  // ══════════════════════════════════════════════════════════════════
  // managerDashboard — superconjunto §5.2
  // ══════════════════════════════════════════════════════════════════
  //
  // Funde `dashboard.getManagerDashboard` (`dashboard.service.ts:233`) com
  // `analytics.getManagerDashboard` (`analytics.service.ts:175`):
  //   team[]   = shape do dashboard (position, xp, enrollment, plan, lastScore,
  //              atRisk) + `user.department` do analytics
  //   kpis     = superconjunto; nomes canónicos = os do dashboard
  //              (pdpCoverage/activePlans/avgScore) + `overdueActions` e as
  //              contagens brutas `enrollmentsTotal`/`completions` do analytics
  //   competencyGaps + nineBox = lógica do analytics
  //   alerts   = MetricAlert[] canónico via `this.alerts({ scope:'team' })`
  //
  // `completedEnrollments` vs `completions` (§5.1 marcava-os `≈`): mantêm-se AMBOS
  // com definição distinta — `completedEnrollments` = concluídas com `enrolledAt`
  // na janela do período (do dashboard); `completions` = contagem bruta all-time
  // da equipa (do analytics). `completionRate` = `completions / enrollmentsTotal`.

  async managerDashboard(params: ManagerDashboardParams): Promise<ManagerDashboardResult> {
    const { userId, period, departmentId } = params;
    const since = periodStart(period);
    const prev = prevPeriodStart(period);

    const teamRaw = await this.prisma.read.user.findMany({
      where: { managerId: userId, active: true },
      select: {
        id: true,
        fullName: true,
        avatarUrl: true,
        position: { select: { name: true } },
        department: { select: { name: true } },
        points: { select: { points: true } },
      },
    });
    const teamIds = teamRaw.map(u => u.id);

    if (!teamIds.length) {
      return {
        teamSize: 0,
        team: [],
        kpis: emptyManagerKpis(),
        competencyGaps: [],
        nineBox: [],
        alerts: [],
      };
    }

    const teamUserFilter = { userId: { in: teamIds } };
    const now = new Date();

    const [
      activePlans,
      completedPlans,
      inProgress,
      completedEnrollments,
      enrollmentsTotal,
      completions,
      mandatoryTotal,
      mandatoryComplete,
      pendingEvals,
      engagementResponses,
      avatarSessions,
      overdueActions,
      avgPerf,
      prevAvgPerf,
      memberEnrollments,
      memberPlans,
      memberPerfReviews,
      competencyRows,
      nineBoxRows,
    ] = await Promise.all([
      this.prisma.read.developmentPlan.count({
        where: { ...teamUserFilter, status: 'ACTIVE', isTemplate: false },
      }),
      this.prisma.read.developmentPlan.count({
        where: { ...teamUserFilter, status: 'COMPLETED', isTemplate: false },
      }),
      this.prisma.read.enrollment.count({
        where: { ...teamUserFilter, status: EnrollmentStatus.IN_PROGRESS },
      }),
      this.prisma.read.enrollment.count({
        where: {
          ...teamUserFilter,
          status: EnrollmentStatus.COMPLETED,
          enrolledAt: { gte: since },
        },
      }),
      this.prisma.read.enrollment.count({ where: { ...teamUserFilter } }),
      this.prisma.read.enrollment.count({
        where: { ...teamUserFilter, status: EnrollmentStatus.COMPLETED },
      }),
      this.prisma.read.enrollment.count({
        where: { ...teamUserFilter, course: { mandatory: true } },
      }),
      this.prisma.read.enrollment.count({
        where: {
          ...teamUserFilter,
          course: { mandatory: true },
          status: EnrollmentStatus.COMPLETED,
        },
      }),
      this.prisma.read.evaluationRequest.count({
        where: { evaluatorId: userId, status: 'PENDING' },
      }),
      this.prisma.read.surveyResponse.count({
        where: { ...teamUserFilter, createdAt: { gte: since } },
      }),
      this.prisma.read.avatarSession.count({
        where: { ...teamUserFilter, status: 'COMPLETED' },
      }),
      this.prisma.read.developmentPlanAction.count({
        where: {
          plan: { userId: { in: teamIds } },
          status: { not: 'COMPLETED' },
          dueDate: { lt: now },
        },
      }),
      this.prisma.read.performanceReview.aggregate({
        where: { ...teamUserFilter, createdAt: { gte: since } },
        _avg: { score: true },
      }),
      this.prisma.read.performanceReview.aggregate({
        where: { ...teamUserFilter, createdAt: { gte: prev, lt: since } },
        _avg: { score: true },
      }),
      this.prisma.read.enrollment.findMany({
        where: { ...teamUserFilter },
        select: { userId: true, status: true },
      }),
      this.prisma.read.developmentPlan.findMany({
        where: { ...teamUserFilter, isTemplate: false, status: { in: ['ACTIVE', 'DRAFT'] } },
        select: { userId: true, status: true, overallProgress: true },
      }),
      this.prisma.read.performanceReview.findMany({
        where: { ...teamUserFilter },
        select: { userId: true, score: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.read.userCompetency.findMany({
        where: { ...teamUserFilter, targetLevel: { not: null } },
        include: { competency: { select: { name: true } } },
      }),
      this.prisma.read.nineBoxPlacement.findMany({
        where: { ...teamUserFilter },
        include: { user: { select: { id: true, fullName: true, avatarUrl: true } } },
      }),
    ]);

    const avgScoreRaw = avgPerf._avg.score;
    const prevScoreRaw = prevAvgPerf._avg.score;

    const kpis: ManagerDashboardKpis = {
      pdpCoverage: round((activePlans / teamIds.length) * 100, 1),
      activePlans,
      completedPlans,
      inProgress,
      completedEnrollments,
      enrollmentsTotal,
      completions,
      completionRate: enrollmentsTotal > 0 ? round((completions / enrollmentsTotal) * 100, 1) : 0,
      avgScore: avgScoreRaw != null ? round(avgScoreRaw, 2) : null,
      scoreTrend:
        avgScoreRaw != null && prevScoreRaw != null ? pctTrend(avgScoreRaw, prevScoreRaw) : null,
      mandatoryRate:
        mandatoryTotal > 0 ? round((mandatoryComplete / mandatoryTotal) * 100, 1) : 100,
      engagementResponses,
      avatarSessions,
      pendingEvals,
      overdueActions,
    };

    const team = teamRaw.map<ManagerDashboardTeamMember>(u => {
      const es = memberEnrollments.filter(e => e.userId === u.id);
      const plan = memberPlans.find(p => p.userId === u.id);
      const latest = memberPerfReviews.find(r => r.userId === u.id);
      const done = es.filter(e => e.status === EnrollmentStatus.COMPLETED).length;
      const inProg = es.filter(e => e.status === EnrollmentStatus.IN_PROGRESS).length;
      return {
        user: {
          id: u.id,
          fullName: u.fullName,
          avatarUrl: u.avatarUrl ?? null,
          position: u.position ?? null,
          department: u.department ?? null,
        },
        xp: u.points?.points ?? 0,
        enrollment: { completed: done, inProgress: inProg },
        plan: plan ? { progress: plan.overallProgress ?? 0, status: plan.status } : null,
        lastScore: latest?.score ?? null,
        atRisk:
          (latest !== undefined && (latest.score ?? 0) < 2.5) || (done === 0 && es.length > 0),
      };
    });

    // competencyGaps — lógica de `analytics.getManagerDashboard` (top 5 por totalGap).
    const gapMap: Record<string, { name: string; totalGap: number; count: number }> = {};
    for (const uc of competencyRows) {
      const gap = (uc.targetLevel ?? 0) - uc.currentLevel;
      if (gap <= 0) continue;
      const key = uc.competency.name;
      if (!gapMap[key]) gapMap[key] = { name: key, totalGap: 0, count: 0 };
      gapMap[key].totalGap += gap;
      gapMap[key].count++;
    }
    const competencyGaps = Object.values(gapMap)
      .map(g => ({ ...g, avgGap: round(g.totalGap / g.count, 1) }))
      .sort((a, b) => b.totalGap - a.totalGap)
      .slice(0, 5);

    // nineBox — `analytics.getManagerDashboard`. Fonte tem `performanceAxis`/
    // `potentialAxis` como Int; a interface (Task 2) tipa-os como string → coeridos.
    const nineBox = nineBoxRows.map(p => ({
      userId: p.userId,
      fullName: p.user.fullName,
      avatarUrl: p.user.avatarUrl ?? null,
      performanceAxis: String(p.performanceAxis),
      potentialAxis: String(p.potentialAxis),
      quadrant: `${p.performanceAxis}-${p.potentialAxis}`,
    }));

    const alerts = await this.alerts({ scope: 'team', userId, departmentId });

    return {
      teamSize: teamIds.length,
      team,
      kpis,
      competencyGaps,
      nineBox,
      alerts,
    };
  }
}
