// ============================================================
// INNOVA PLATFORM — AVALIAÇÃO — ANALYTICS E RELATÓRIOS
// Dashboards, evolução e relatórios agregados (só leitura).
// Colaborador interno do EvaluationService: recebe o mesmo prisma/logger e as
// validações partilhadas via `deps` — não é um provider Nest.
// ============================================================

import { Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { EvaluationAnalyticsFilterDto, EvaluationReportFilterDto } from './evaluation.dto';
import { percentile } from './evaluation-scoring';
import {
  EvaluationInsightsService,
  MIN_REPORT_GROUP_SIZE,
  suppressSmallGroups,
} from './evaluation-insights';
import type { PrismaService } from '../prisma/prisma.service';

export interface EvaluationAnalyticsServiceDeps {
  getPendingEvaluations: (evaluatorId: number) => Promise<unknown>;
  getMyProgress: (evaluatorId: number) => Promise<unknown>;
}

export class EvaluationAnalyticsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: Logger,
    private readonly deps: EvaluationAnalyticsServiceDeps,
  ) {}

  async getAnalyticsDashboard(filters: EvaluationAnalyticsFilterDto = {}) {
    type DashboardEval = Prisma.PerformanceEvaluationGetPayload<{
      include: {
        evaluated: {
          select: {
            id: true;
            fullName: true;
            avatarUrl: true;
            department: { select: { name: true } };
          };
        };
      };
    }>;

    const { cycleId, departmentId } = filters;
    const where: Prisma.PerformanceEvaluationWhereInput = {};
    if (cycleId) where.cycleId = cycleId;
    if (departmentId) where.evaluated = { departmentId };

    const [evals, totalRequests, completedRequests] = await Promise.all([
      this.prisma.read.performanceEvaluation.findMany({
        where,
        include: {
          evaluated: {
            select: {
              id: true,
              fullName: true,
              avatarUrl: true,
              department: { select: { name: true } },
            },
          },
        },
      }),
      this.prisma.evaluationRequest
        .count({ where: cycleId ? { cycleId } : {} })
        .catch((e: unknown) => {
          this.logger.warn({
            action: 'EVALUATION_ANALYTICS_COUNT_TOTAL_REQUESTS',
            cycleId,
            departmentId,
            err: { message: e instanceof Error ? e.message : String(e) },
            msg: 'Falha ao contar pedidos de avaliação totais para dashboard — a devolver 0',
          });
          return 0;
        }),
      this.prisma.evaluationRequest
        .count({
          where: { ...(cycleId ? { cycleId } : {}), status: 'COMPLETED' },
        })
        .catch((e: unknown) => {
          this.logger.warn({
            action: 'EVALUATION_ANALYTICS_COUNT_COMPLETED_REQUESTS',
            cycleId,
            departmentId,
            err: { message: e instanceof Error ? e.message : String(e) },
            msg: 'Falha ao contar pedidos de avaliação concluídos para dashboard — a devolver 0',
          });
          return 0;
        }),
    ]);

    if (!evals.length)
      return { hasData: false, message: 'Sem dados para o período/ciclo seleccionado' };

    const scores = evals.map(e => e.overallScore ?? 0);
    const avgScore = +(scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(2);

    // Distribution buckets
    const dist = { exceptional: 0, above: 0, expected: 0, below: 0 };
    for (const s of scores) {
      if (s >= 4) dist.exceptional++;
      else if (s >= 3) dist.above++;
      else if (s >= 2) dist.expected++;
      else dist.below++;
    }

    // By department
    const deptMap: Record<string, number[]> = {};
    for (const e of evals) {
      const dept = e.evaluated?.department?.name ?? 'N/A';
      if (!deptMap[dept]) deptMap[dept] = [];
      deptMap[dept].push(e.overallScore ?? 0);
    }
    const byDept = Object.entries(deptMap)
      .map(([dept, sc]) => ({
        department: dept,
        avgScore: +(sc.reduce((a, b) => a + b, 0) / sc.length).toFixed(2),
        count: sc.length,
      }))
      .sort((a, b) => b.avgScore - a.avgScore);

    // Top performers
    const userAvg: Record<number, { user: DashboardEval['evaluated']; scores: number[] }> = {};
    for (const e of evals) {
      const id = e.evaluatedId;
      if (!userAvg[id]) userAvg[id] = { user: e.evaluated, scores: [] };
      userAvg[id].scores.push(e.overallScore ?? 0);
    }

    const ranked = Object.values(userAvg)
      .map(u => ({
        user: u.user,
        avgScore: +(u.scores.reduce((a, b) => a + b, 0) / u.scores.length).toFixed(2),
        evals: u.scores.length,
      }))
      .sort((a, b) => b.avgScore - a.avgScore);

    const allScores = ranked.map(r => r.avgScore);

    return {
      hasData: true,
      kpis: {
        totalEvaluations: evals.length,
        avgScore,
        participationRate:
          totalRequests > 0 ? +((completedRequests / totalRequests) * 100).toFixed(1) : 0,
        totalParticipants: ranked.length,
      },
      distribution: dist,
      byDepartment: byDept,
      topPerformers: ranked
        .slice(0, 10)
        .map(r => ({ ...r, percentile: percentile(r.avgScore, allScores) })),
      bottomPerformers: ranked
        .slice(-5)
        .reverse()
        .map(r => ({ ...r, percentile: percentile(r.avgScore, allScores) })),
    };
  }

  // docs/modulo_evaluation.md ponto 1 — "Visão Geral". `privileged=true`
  // devolve os KPIs organizacionais; caso contrário reaproveita
  // getMyProgress/getPendingEvaluations (o mesmo conteúdo pessoal que já
  // alimentava o OverviewTab antes desta remodelação).
  async getOverviewDashboard(userId: number, privileged: boolean) {
    if (!privileged) {
      const [progress, pending] = await Promise.all([
        this.deps.getMyProgress(userId),
        this.deps.getPendingEvaluations(userId),
      ]);
      return { scope: 'personal' as const, progress, pending };
    }

    const now = new Date();
    const [statusCounts, activeCycles, evaluatedIds, pendingRequests, overdueCount, evalScores] =
      await Promise.all([
        this.prisma.read.evaluationRequest.groupBy({ by: ['status'], _count: { _all: true } }),
        this.prisma.read.evaluationCampaign.count({ where: { status: 'ACTIVE', deletedAt: null } }),
        this.prisma.read.performanceEvaluation.findMany({
          select: { evaluatedId: true },
          distinct: ['evaluatedId'],
        }),
        this.prisma.read.evaluationRequest.findMany({
          where: { status: { in: ['PENDING', 'IN_PROGRESS'] } },
          select: {
            id: true,
            dueDate: true,
            evaluated: { select: { id: true, fullName: true, avatarUrl: true } },
          },
          orderBy: { dueDate: 'asc' },
          take: 8,
        }),
        this.prisma.read.evaluationRequest.count({
          where: { status: { in: ['PENDING', 'IN_PROGRESS'] }, dueDate: { lt: now } },
        }),
        this.prisma.read.performanceEvaluation.findMany({ select: { overallScore: true } }),
      ]);

    const countByStatus = (status: string) =>
      statusCounts.find(s => s.status === status)?._count._all ?? 0;
    const pendingCount = countByStatus('PENDING');
    const inProgressCount = countByStatus('IN_PROGRESS');
    const completedCount = countByStatus('COMPLETED');
    const totalRequests = pendingCount + inProgressCount + completedCount;

    const scores = evalScores.map(e => e.overallScore ?? 0);
    const avgScore = scores.length
      ? +(scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(2)
      : 0;
    const dist = { exceptional: 0, above: 0, expected: 0, below: 0 };
    for (const s of scores) {
      if (s >= 4) dist.exceptional++;
      else if (s >= 3) dist.above++;
      else if (s >= 2) dist.expected++;
      else dist.below++;
    }

    const evaluatedUserIds = new Set(evaluatedIds.map(e => e.evaluatedId));
    const pendingEvaluatedIds = new Set(
      pendingRequests.map(r => r.evaluated.id).filter(id => !evaluatedUserIds.has(id)),
    );

    return {
      scope: 'organization' as const,
      kpis: {
        inProgress: inProgressCount,
        pending: pendingCount,
        completed: completedCount,
        completionRate:
          totalRequests > 0 ? +((completedCount / totalRequests) * 100).toFixed(1) : 0,
        avgScore,
        evaluatedCount: evaluatedUserIds.size,
      },
      distribution: dist,
      toEvaluateCount: pendingEvaluatedIds.size,
      activeCycles,
      upcomingDeadlines: pendingRequests.map(r => ({
        id: r.id,
        dueDate: r.dueDate,
        evaluated: r.evaluated,
      })),
      alerts: overdueCount > 0 ? [{ type: 'OVERDUE', count: overdueCount }] : [],
    };
  }

  async getTeamDashboard(managerId: number, cycleId?: number) {
    const team = await this.prisma.read.user.findMany({
      where: { managerId, active: true },
      select: {
        id: true,
        fullName: true,
        avatarUrl: true,
        position: { select: { name: true } },
        department: { select: { name: true } },
      },
    });
    if (!team.length) return { team: [] as never[], message: 'Sem equipa directa' };

    const teamIds = team.map(u => u.id);
    const where: Prisma.PerformanceEvaluationWhereInput = { evaluatedId: { in: teamIds } };
    if (cycleId) where.cycleId = cycleId;

    const evals = await this.prisma.read.performanceEvaluation.findMany({ where });

    const pending: Prisma.EvaluationRequestGetPayload<object>[] =
      await this.prisma.evaluationRequest
        .findMany({
          where: { evaluatorId: managerId, status: 'PENDING' },
        })
        .catch((e: unknown) => {
          this.logger.warn({
            action: 'EVALUATION_REQUEST_LIST_TEAM_PENDING',
            managerId,
            cycleId,
            err: { message: e instanceof Error ? e.message : String(e) },
            msg: 'Falha ao listar avaliações pendentes da equipa — a devolver lista vazia',
          });
          return [] as Prisma.EvaluationRequestGetPayload<object>[];
        });

    const enriched = team.map(u => {
      const uEvals = evals.filter(e => e.evaluatedId === u.id);
      const avg = uEvals.length
        ? +(uEvals.reduce((s, e) => s + (e.overallScore ?? 0), 0) / uEvals.length).toFixed(2)
        : null;
      const hasPending = pending.some(r => r.evaluatedId === u.id);
      return {
        user: u,
        avgScore: avg,
        evals: uEvals.length,
        hasPendingEval: hasPending,
        trend: null as number, // TODO: compare with previous cycle
      };
    });

    const withScores = enriched.filter(u => u.avgScore !== null).map(u => u.avgScore);
    const teamAvg = withScores.length
      ? +(withScores.reduce((a, b) => a + b, 0) / withScores.length).toFixed(2)
      : null;

    return {
      teamAvg,
      pendingCount: pending.length,
      team: enriched.map(u => ({
        ...u,
        percentile: u.avgScore !== null ? percentile(u.avgScore, withScores) : null,
      })),
    };
  }

  async getUserEvolution(userId: number) {
    const evals = await this.prisma.read.performanceEvaluation.findMany({
      where: { evaluatedId: userId },
      orderBy: { createdAt: 'asc' },
      select: { overallScore: true, type: true, period: true, createdAt: true },
    });

    const byPeriod: Record<string, number[]> = {};
    for (const e of evals) {
      if (!byPeriod[e.period]) byPeriod[e.period] = [];
      byPeriod[e.period].push(e.overallScore ?? 0);
    }

    const evolution = Object.entries(byPeriod).map(([period, scores]) => ({
      period,
      avgScore: +(scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(2),
      evals: scores.length,
    }));

    const last = evolution[evolution.length - 1]?.avgScore ?? 0;
    const prev = evolution[evolution.length - 2]?.avgScore ?? null;
    const trend = prev !== null ? +(last - prev).toFixed(2) : null;

    return { userId, evolution, latestScore: last, trend };
  }

  async getReportsOverview(filters: EvaluationReportFilterDto = {}) {
    const {
      cycleId,
      departmentId,
      unitId,
      positionId,
      managerId,
      period,
      type,
      recommendationStatus,
    } = filters;

    const evaluatedFilter: Prisma.UserWhereInput = {};
    if (departmentId) evaluatedFilter.departmentId = departmentId;
    if (unitId) evaluatedFilter.unitId = unitId;
    if (positionId) evaluatedFilter.positionId = positionId;
    if (managerId) evaluatedFilter.managerId = managerId;

    // Rascunhos não entram em relatórios: ainda não são avaliações concluídas.
    const where: Prisma.PerformanceEvaluationWhereInput = { isDraft: false };
    if (cycleId) where.cycleId = cycleId;
    if (type) where.type = type;
    if (period) where.period = { contains: period };
    if (Object.keys(evaluatedFilter).length) where.evaluated = evaluatedFilter;

    type ReportEval = Prisma.PerformanceEvaluationGetPayload<{
      include: {
        evaluated: {
          select: {
            id: true;
            fullName: true;
            department: { select: { id: true; name: true } };
            position: { select: { id: true; name: true } };
            unit: { select: { id: true; name: true } };
            manager: { select: { id: true; fullName: true } };
          };
        };
      };
    }>;

    const [evals, totalRequests, completedRequests, objectiveRows, performanceCount] =
      await Promise.all([
        this.prisma.read.performanceEvaluation.findMany({
          where,
          include: {
            evaluated: {
              select: {
                id: true,
                fullName: true,
                department: { select: { id: true, name: true } },
                position: { select: { id: true, name: true } },
                unit: { select: { id: true, name: true } },
                manager: { select: { id: true, fullName: true } },
              },
            },
          },
        }) as Promise<ReportEval[]>,
        this.prisma.evaluationRequest
          .count({ where: { ...(cycleId ? { cycleId } : {}), ...(type ? { type } : {}) } })
          .catch(() => 0),
        this.prisma.evaluationRequest
          .count({
            where: {
              ...(cycleId ? { cycleId } : {}),
              ...(type ? { type } : {}),
              status: 'COMPLETED',
            },
          })
          .catch(() => 0),
        this.prisma.read.evaluationRequest
          .findMany({
            where: { ...(cycleId ? { cycleId } : {}), ...(type ? { type } : {}) },
            select: { objectives: true },
          })
          .catch(() => [] as { objectives: Prisma.JsonValue }[]),
        this.prisma.read.performanceEvaluation.count({ where }),
      ]);
    const restricted = performanceCount < MIN_REPORT_GROUP_SIZE;
    const performance = await new EvaluationInsightsService(this.prisma).getPerformanceIndicators(
      where,
      { recommendationStatus, restricted },
    );

    const groupBy = (keyFn: (e: ReportEval) => { id: number; name: string } | null | undefined) => {
      const map = new Map<number, { name: string; scores: number[] }>();
      for (const e of evals) {
        const key = keyFn(e);
        if (!key) continue;
        const entry = map.get(key.id) ?? { name: key.name, scores: [] };
        entry.scores.push(e.overallScore ?? 0);
        map.set(key.id, entry);
      }
      return [...map.entries()]
        .map(([id, { name, scores }]) => ({
          id,
          name,
          count: scores.length,
          avgScore: +(scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(2),
        }))
        .sort((a, b) => b.avgScore - a.avgScore);
    };

    // Grupos com menos de MIN_REPORT_GROUP_SIZE avaliações ficam ocultos: a média
    // de 1–2 pessoas identificaria-as. Exports CSV/Excel/PDF herdam esta regra.
    const dep = suppressSmallGroups(
      groupBy(e => (e.evaluated?.department ? e.evaluated.department : null)),
    );
    const unit = suppressSmallGroups(groupBy(e => (e.evaluated?.unit ? e.evaluated.unit : null)));
    const pos = suppressSmallGroups(
      groupBy(e => (e.evaluated?.position ? e.evaluated.position : null)),
    );
    const mgr = suppressSmallGroups(
      groupBy(e =>
        e.evaluated?.manager
          ? { id: e.evaluated.manager.id, name: e.evaluated.manager.fullName }
          : null,
      ),
    );
    const byDepartment = dep.kept;
    const byUnit = unit.kept;
    const byPosition = pos.kept;
    const byManager = mgr.kept;

    // Distribuição das classificações (docs pt.11)
    const distribution = { exceptional: 0, above: 0, expected: 0, below: 0 };
    for (const s of evals.map(e => e.overallScore ?? 0)) {
      if (s >= 4) distribution.exceptional++;
      else if (s >= 3) distribution.above++;
      else if (s >= 2) distribution.expected++;
      else distribution.below++;
    }

    // Evolução do desempenho por período (docs pt.11)
    const byPeriod: Record<string, number[]> = {};
    for (const e of evals) {
      if (!byPeriod[e.period]) byPeriod[e.period] = [];
      byPeriod[e.period].push(e.overallScore ?? 0);
    }
    const evolutionAll = Object.entries(byPeriod)
      .map(([evalPeriod, scores]) => ({
        period: evalPeriod,
        avgScore: +(scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(2),
        count: scores.length,
      }))
      .sort((a, b) => a.period.localeCompare(b.period));
    const evo = suppressSmallGroups(evolutionAll);
    const evolution = evo.kept;

    // Gaps de competências (docs pt.11) — média por competência sobre o
    // conjunto filtrado; mesmo threshold (<3) usado em triggerPDIFromResults.
    const compScores: Record<number, number[]> = {};
    for (const e of evals) {
      if (!e.competencyScores) continue;
      const cs: Record<string, number> = JSON.parse(e.competencyScores);
      for (const [cid, score] of Object.entries(cs)) {
        const id = +cid;
        if (!compScores[id]) compScores[id] = [];
        compScores[id].push(score);
      }
    }
    const competencyIds = Object.keys(compScores).map(Number);
    const competencies = competencyIds.length
      ? await this.prisma.read.competency.findMany({
          where: { id: { in: competencyIds } },
          select: { id: true, name: true },
        })
      : [];
    const competencyGapsAll = competencyIds
      .map(id => {
        const scores = compScores[id];
        const avg = +(scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(2);
        return {
          competencyId: id,
          name: competencies.find(c => c.id === id)?.name ?? `#${id}`,
          avgScore: avg,
          gap: +(5 - avg).toFixed(2),
        };
      })
      .filter(c => c.avgScore < 3)
      .sort((a, b) => b.gap - a.gap);
    // Com poucas avaliações a média por competência é praticamente individual.
    const competencyGaps = restricted ? [] : competencyGapsAll;

    // Objetivos alcançados (docs pt.11) — % médio de realização das metas
    // definidas na etapa 6, através das EvaluationRequest.objectives.
    const objectives = objectiveRows.flatMap(r =>
      Array.isArray(r.objectives) ? (r.objectives as Record<string, unknown>[]) : [],
    );
    const objectivesWithPct = objectives.filter(o => typeof o.percentage === 'number') as {
      percentage: number;
    }[];
    const objectivesAchieved = {
      total: objectives.length,
      avgAchievement: objectivesWithPct.length
        ? +(
            objectivesWithPct.reduce((s, o) => s + o.percentage, 0) / objectivesWithPct.length
          ).toFixed(1)
        : null,
    };

    return {
      totalEvaluations: evals.length,
      avgScore: evals.length
        ? +(evals.reduce((s, e) => s + (e.overallScore ?? 0), 0) / evals.length).toFixed(2)
        : 0,
      completionRate:
        totalRequests > 0 ? +((completedRequests / totalRequests) * 100).toFixed(1) : 0,
      distribution,
      byDepartment,
      byUnit,
      byPosition,
      byManager,
      evolution,
      competencyGaps,
      objectivesAchieved,
      performance,
      privacy: {
        minGroupSize: MIN_REPORT_GROUP_SIZE,
        restricted,
        suppressed: {
          byDepartment: dep.suppressed,
          byUnit: unit.suppressed,
          byPosition: pos.suppressed,
          byManager: mgr.suppressed,
          evolution: evo.suppressed,
        },
      },
    };
  }
}
