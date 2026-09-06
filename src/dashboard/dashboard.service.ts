// src/dashboard/dashboard.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { EnrollmentStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CacheService } from '../cache/cache.service';
import { DASHBOARD_CACHE_TTL } from '../cache/cache.constants';
import { DashboardFilterDto, OrgFilterDto, DashboardPeriod, AlertPriority } from './dashboard.dto';
import { MetricsAggregationService } from '../metrics-aggregation/metrics-aggregation.service';
import { MetricAlert, MetricAlertSeverity } from '../metrics-aggregation/metrics.types';

// ─── Helpers ─────────────────────────────────────────────────────

function periodStart(period?: DashboardPeriod): Date {
  const now = new Date();
  switch (period) {
    case DashboardPeriod.WEEK:
      return new Date(now.setDate(now.getDate() - 7));
    case DashboardPeriod.QUARTER:
      return new Date(now.setMonth(now.getMonth() - 3));
    case DashboardPeriod.YEAR:
      return new Date(now.setFullYear(now.getFullYear() - 1));
    default:
      return new Date(new Date().getFullYear(), new Date().getMonth(), 1); // Month
  }
}

function prevPeriodStart(period?: DashboardPeriod): Date {
  const now = new Date();
  switch (period) {
    case DashboardPeriod.WEEK:
      return new Date(now.setDate(now.getDate() - 14));
    case DashboardPeriod.QUARTER:
      return new Date(now.setMonth(now.getMonth() - 6));
    case DashboardPeriod.YEAR:
      return new Date(now.setFullYear(now.getFullYear() - 2));
    default:
      return new Date(new Date().getFullYear(), new Date().getMonth() - 1, 1);
  }
}

function trend(current: number, previous: number): number {
  if (previous === 0) return 0;
  return +(((current - previous) / previous) * 100).toFixed(1);
}

// ─────────────────────────────────────────────────────────────────
// SERVICE
// ─────────────────────────────────────────────────────────────────

@Injectable()
export class DashboardService {
  private readonly logger = new Logger(DashboardService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
    private readonly metrics: MetricsAggregationService,
  ) {}

  // ══════════════════════════════════════════════════════
  // COLABORADOR — personal dashboard
  // ══════════════════════════════════════════════════════

  async getMyDashboard(userId: number) {
    // FIX: `.catch()` a seguir a uma promise Prisma colapsa o tipo inteiro
    // para `any` sem isto — a query extraída para variável preserva o tipo
    // real via `Awaited<typeof query>` (mesmo padrão de history.service.ts).
    const notificationsQuery = this.prisma.notificationLog.findMany({
      where: { userId, read: false },
      orderBy: { createdAt: 'desc' },
      take: 5,
      select: { id: true, type: true, message: true, createdAt: true },
    });

    const [
      user,
      inProgress,
      completed,
      totalEnrolled,
      points,
      recentBadges,
      pendingAssessments,
      activePlan,
      recentSurveys,
      pendingEvals,
      avatarSessions,
      competencies,
      notifications,
    ] = await Promise.all([
      this.prisma.read.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          fullName: true,
          avatarUrl: true,
          email: true,
          position: { select: { id: true, name: true, level: true } },
          department: { select: { id: true, name: true } },
          createdAt: true,
        },
      }),
      this.prisma.read.enrollment.count({
        where: { userId, status: EnrollmentStatus.IN_PROGRESS },
      }),
      this.prisma.read.enrollment.count({ where: { userId, status: EnrollmentStatus.COMPLETED } }),
      this.prisma.read.enrollment.count({ where: { userId } }),
      this.prisma.read.userPoints.findUnique({ where: { userId } }),
      this.prisma.read.badgeAward.findMany({
        where: { userId },
        include: { badge: true },
        orderBy: { awardedAt: 'desc' },
        take: 3,
      }),
      this.prisma.read.assessmentAttempt.count({ where: { userId, passed: false } }),
      this.prisma.read.developmentPlan.findFirst({
        where: { userId, status: { in: ['ACTIVE', 'DRAFT'] }, isTemplate: false },
        include: {
          actions: { select: { status: true, progress: true }, take: 20 },
          goals: { select: { progress: true }, take: 10 },
        },
      }),
      this.prisma.engagementSurvey.findMany({
        where: { status: 'ACTIVE', responses: { none: { userId } } },
        // `type` não existe no modelo EngagementSurvey (causava 500 em /dashboard/my)
        select: { id: true, title: true },
        take: 3,
      }),
      this.prisma.evaluationRequest
        .count({ where: { evaluatorId: userId, status: 'PENDING' } })
        .catch((e: unknown) => {
          this.logger.warn({
            userId,
            action: 'DASHBOARD_MY_PENDING_EVALS',
            err: { message: e instanceof Error ? e.message : String(e) },
            msg: 'Falha ao obter contagem de avaliações pendentes para o dashboard pessoal',
          });
          return 0;
        }),
      this.prisma.read.avatarSession.count({ where: { userId, status: 'COMPLETED' } }),
      this.prisma.read.userCompetency.findMany({
        where: { userId },
        include: { competency: { select: { name: true } } },
        take: 5,
      }),
      notificationsQuery.catch((e: unknown): Awaited<typeof notificationsQuery> => {
        this.logger.warn({
          userId,
          action: 'DASHBOARD_MY_NOTIFICATIONS',
          err: { message: e instanceof Error ? e.message : String(e) },
          msg: 'Falha ao obter notificações não lidas para o dashboard pessoal',
        });
        return [];
      }),
    ]);

    // PDI stats
    const planActions = activePlan?.actions ?? [];
    const planGoals = activePlan?.goals ?? [];
    const planProgress = planActions.length
      ? Math.round(planActions.reduce((s, a) => s + (a.progress ?? 0), 0) / planActions.length)
      : 0;
    const completionRate = totalEnrolled > 0 ? +((completed / totalEnrolled) * 100).toFixed(1) : 0;

    // Pending items list
    const pendingItems: { type: string; label: string; priority: string }[] = [];
    if (inProgress > 0)
      pendingItems.push({
        type: 'COURSE',
        label: `${inProgress} curso(s) em progresso`,
        priority: 'MEDIUM',
      });
    if (pendingAssessments > 0)
      pendingItems.push({
        type: 'ASSESSMENT',
        label: `${pendingAssessments} avaliação(ões) pendente(s)`,
        priority: 'HIGH',
      });
    if (recentSurveys.length > 0)
      pendingItems.push({
        type: 'SURVEY',
        label: `${recentSurveys.length} survey(s) por responder`,
        priority: 'MEDIUM',
      });
    if (pendingEvals > 0)
      pendingItems.push({
        type: 'EVALUATION',
        label: `${pendingEvals} avaliação(ões) 360° para submeter`,
        priority: 'HIGH',
      });

    return {
      user,
      learning: {
        inProgress,
        completed,
        totalEnrolled,
        completionRate,
        pendingAssessments,
      },
      development: {
        activePlan: activePlan
          ? {
              id: activePlan.id,
              name: activePlan.name,
              status: activePlan.status,
              progress: planProgress,
              goals: planGoals.length,
              completedActions: planActions.filter(a => a.status === 'COMPLETED').length,
            }
          : null,
      },
      engagement: {
        pendingSurveys: recentSurveys.length,
        surveys: recentSurveys,
      },
      gamification: {
        totalPoints: points?.points ?? 0,
        recentBadges,
        avatarSessions,
        level: this.computeLevel(points?.points ?? 0),
      },
      skills: competencies.map(c => ({
        name: c.competency.name,
        current: c.currentLevel,
        target: c.targetLevel,
      })),
      pendingItems,
      notifications,
    };
  }

  // ══════════════════════════════════════════════════════
  // GESTOR — team dashboard
  // ══════════════════════════════════════════════════════

  async getManagerDashboard(userId: number, filters: DashboardFilterDto = {}) {
    // Fase H: os números e o enriquecimento da equipa vêm da camada canónica
    // (`MetricsAggregationService.managerDashboard`). A forma do payload de
    // `GET /dashboard/manager` é preservada — os KPIs são projectados de volta
    // aos 11 campos históricos (o superset canónico — enrollmentsTotal,
    // completions, completionRate, overdueActions — e competencyGaps/nineBox
    // ficam para o `analytics`, Task 8) e `atRisk` volta a chamar-se `alert`
    // em cada membro.
    //
    // Degradação: a camada canónica propaga falhas de leitura; este consumidor
    // nunca pode 500 — em falha devolve a forma histórica de "equipa vazia".
    const r = await this.metrics
      .managerDashboard({
        userId,
        period: filters.period,
        departmentId: filters.departmentId,
      })
      .catch((e: unknown) => {
        this.logger.warn({
          userId,
          departmentId: filters.departmentId,
          period: filters.period,
          action: 'DASHBOARD_MANAGER_METRICS',
          err: { message: e instanceof Error ? e.message : String(e) },
          msg: 'Falha ao obter o dashboard do gestor a partir da camada canónica',
        });
        return null;
      });

    if (!r || r.teamSize === 0) {
      return { teamSize: 0, team: [], kpis: {}, alerts: [], pendingItems: [] };
    }

    return {
      teamSize: r.teamSize,
      kpis: {
        pdpCoverage: r.kpis.pdpCoverage,
        activePlans: r.kpis.activePlans,
        completedPlans: r.kpis.completedPlans,
        inProgress: r.kpis.inProgress,
        completedEnrollments: r.kpis.completedEnrollments,
        avgScore: r.kpis.avgScore,
        scoreTrend: r.kpis.scoreTrend,
        mandatoryRate: r.kpis.mandatoryRate,
        engagementResponses: r.kpis.engagementResponses,
        avatarSessions: r.kpis.avatarSessions,
        pendingEvals: r.kpis.pendingEvals,
      },
      team: r.team.map(m => ({
        user: {
          id: m.user.id,
          fullName: m.user.fullName,
          avatarUrl: m.user.avatarUrl,
          position: m.user.position,
        },
        xp: m.xp,
        enrollment: m.enrollment,
        plan: m.plan,
        lastScore: m.lastScore,
        alert: m.atRisk,
      })),
      alerts: this.adaptManagerAlerts(r.alerts),
    };
  }

  // ══════════════════════════════════════════════════════
  // RH / ADMIN — organisation dashboard
  // ══════════════════════════════════════════════════════

  async getOrganizationSummary(filters: OrgFilterDto = {}) {
    const since = periodStart(filters.period);
    const prev = prevPeriodStart(filters.period);
    const deptFilter = filters.departmentId ? { departmentId: filters.departmentId } : {};

    // FIX: `.catch()` a seguir a uma promise Prisma colapsa o tipo inteiro
    // para `any` sem isto — mesmo padrão de getMyDashboard() acima.
    const topContentQuery = this.prisma.auditLog.groupBy({
      by: ['entityId'],
      where: { action: 'CONTENT_VIEW', entity: 'ContentAsset', timestamp: { gte: since } },
      _count: { id: true },
      orderBy: { _count: { id: 'desc' } },
      take: 5,
    });

    const [
      totalUsers,
      activeUsers,
      newUsers,
      prevNewUsers,
      totalCourses,
      enrollmentsNow,
      enrollmentsPrev,
      completionsNow,
      completionsPrev,
      avgScore,
      activeSurveys,
      surveyResponses,
      activePlans,
      completedPlans,
      pendingEvals,
      departmentBreakdown,
      hiPoCount,
      successionCoverage,
      topContentViews,
      trainingHours,
    ] = await Promise.all([
      this.prisma.read.user.count({ where: { ...deptFilter } }),
      this.prisma.read.user.count({ where: { active: true, ...deptFilter } }),
      this.prisma.read.user.count({ where: { createdAt: { gte: since }, ...deptFilter } }),
      this.prisma.read.user.count({
        where: { createdAt: { gte: prev, lt: since }, ...deptFilter },
      }),
      // Course não tem campo `active` — usa `status` (causava 500 em /dashboard/organization)
      this.prisma.course.count({ where: { status: 'PUBLISHED' } }),
      this.prisma.enrollment.count({
        // Enrollment usa `enrolledAt`, não `createdAt` (causava 500 em /dashboard/organization)
        where: { enrolledAt: { gte: since }, user: deptFilter },
      }),
      this.prisma.enrollment.count({
        where: { enrolledAt: { gte: prev, lt: since }, user: deptFilter },
      }),
      this.prisma.read.enrollment.count({
        where: { status: EnrollmentStatus.COMPLETED, enrolledAt: { gte: since }, user: deptFilter },
      }),
      this.prisma.read.enrollment.count({
        where: {
          status: EnrollmentStatus.COMPLETED,
          enrolledAt: { gte: prev, lt: since },
          user: deptFilter,
        },
      }),
      this.prisma.performanceReview
        .aggregate({
          where: { createdAt: { gte: since }, user: deptFilter },
          _avg: { score: true },
        })
        .catch((e: unknown) => {
          this.logger.warn({
            departmentId: filters.departmentId,
            period: filters.period,
            action: 'DASHBOARD_ORG_AVG_PERF',
            err: { message: e instanceof Error ? e.message : String(e) },
            msg: 'Falha ao obter média de performance organizacional',
          });
          return { _avg: { score: null } };
        }),
      this.prisma.read.engagementSurvey.count({ where: { status: 'ACTIVE' } }),
      this.prisma.read.surveyResponse.count({
        where: { createdAt: { gte: since }, user: deptFilter },
      }),
      this.prisma.read.developmentPlan.count({
        where: { status: 'ACTIVE', isTemplate: false, user: deptFilter },
      }),
      this.prisma.read.developmentPlan.count({
        where: { status: 'COMPLETED', isTemplate: false, user: deptFilter },
      }),
      this.prisma.read.evaluationRequest
        .count({ where: { status: 'PENDING' } })
        .catch((e: unknown) => {
          this.logger.warn({
            departmentId: filters.departmentId,
            period: filters.period,
            action: 'DASHBOARD_ORG_PENDING_EVALS',
            err: { message: e instanceof Error ? e.message : String(e) },
            msg: 'Falha ao obter contagem de avaliações pendentes a nível organizacional',
          });
          return 0;
        }),
      // Dept breakdown
      this.prisma.read.department.findMany({
        select: { id: true, name: true, _count: { select: { users: true } } },
        take: 10,
      }),
      // HiPos (users with performance score >= 4 from talent pool heuristic)
      this.prisma.userCompetency
        .groupBy({
          by: ['userId'],
          where: { currentLevel: { gte: 4 }, user: deptFilter },
          _avg: { currentLevel: true },
          having: { currentLevel: { _avg: { gte: 4 } } },
          orderBy: { _avg: { currentLevel: 'desc' } },
          take: 100,
        })
        .then(r => r.length)
        .catch((e: unknown) => {
          this.logger.warn({
            departmentId: filters.departmentId,
            period: filters.period,
            action: 'DASHBOARD_ORG_HIPO_COUNT',
            err: { message: e instanceof Error ? e.message : String(e) },
            msg: 'Falha ao calcular contagem de colaboradores High Potential',
          });
          return 0;
        }),
      // Succession coverage
      this.prisma.successionPlan
        .count()
        .then(async count => {
          const positions = await this.prisma.read.position.count();
          return positions > 0 ? +((count / positions) * 100).toFixed(1) : 0;
        })
        .catch((e: unknown) => {
          this.logger.warn({
            departmentId: filters.departmentId,
            period: filters.period,
            action: 'DASHBOARD_ORG_SUCCESSION_COVERAGE',
            err: { message: e instanceof Error ? e.message : String(e) },
            msg: 'Falha ao calcular cobertura de sucessão organizacional',
          });
          return 0;
        }),
      // Top content
      topContentQuery.catch((e: unknown): Awaited<typeof topContentQuery> => {
        this.logger.warn({
          departmentId: filters.departmentId,
          period: filters.period,
          action: 'DASHBOARD_ORG_TOP_CONTENT',
          err: { message: e instanceof Error ? e.message : String(e) },
          msg: 'Falha ao obter conteúdos mais vistos a nível organizacional',
        });
        return [];
      }),
      // Training hours estimate (completions × avg course workload)
      this.prisma.enrollment
        .count({
          where: {
            status: EnrollmentStatus.COMPLETED,
            user: deptFilter,
            enrolledAt: { gte: since },
          },
        })
        .then(c => c * 2)
        .catch((e: unknown) => {
          this.logger.warn({
            departmentId: filters.departmentId,
            period: filters.period,
            action: 'DASHBOARD_ORG_TRAINING_HOURS',
            err: { message: e instanceof Error ? e.message : String(e) },
            msg: 'Falha ao calcular estimativa de horas de formação organizacional',
          });
          return 0;
        }), // ~2h avg
    ]);

    // Enrich top content
    const contentIds = topContentViews
      .map(v => v.entityId)
      .filter((id): id is number => id != null);
    const contents = contentIds.length
      ? await this.prisma.read.contentAsset.findMany({
          where: { id: { in: contentIds } },
          select: { id: true, title: true, type: true },
        })
      : [];
    const cMap = new Map(contents.map(c => [c.id, c]));

    return {
      period: filters.period ?? 'MONTH',
      generatedAt: new Date(),
      kpis: {
        headcount: {
          total: totalUsers,
          active: activeUsers,
          new: newUsers,
          newTrend: trend(newUsers, prevNewUsers),
        },
        learning: {
          courses: totalCourses,
          enrollments: enrollmentsNow,
          enrollmentsTrend: trend(enrollmentsNow, enrollmentsPrev),
          completions: completionsNow,
          completionsTrend: trend(completionsNow, completionsPrev),
          trainingHours,
        },
        performance: { avgScore: avgScore._avg.score ? +avgScore._avg.score.toFixed(2) : null },
        engagement: { activeSurveys, responses: surveyResponses },
        development: {
          activePlans,
          completedPlans,
          coverage: totalUsers > 0 ? +((activePlans / totalUsers) * 100).toFixed(1) : 0,
        },
        talent: { hiPos: hiPoCount, successionCoverage },
        pending: { evaluations: pendingEvals },
      },
      departments: departmentBreakdown.map(d => ({
        id: d.id,
        name: d.name,
        headcount: d._count.users,
      })),
      topContent: topContentViews
        .map(v => ({
          content: v.entityId != null ? cMap.get(v.entityId) : undefined,
          views: v._count.id,
        }))
        .filter(v => v.content),
      insights: this.buildOrgInsights({
        hiPoCount,
        successionCoverage,
        activePlans,
        totalUsers,
        completionsNow,
      }),
    };
  }

  // ══════════════════════════════════════════════════════
  // EXECUTIVE (C-Level)
  // ══════════════════════════════════════════════════════

  async getExecutiveDashboard() {
    return this.cache.getOrSet('dashboard:executive', DASHBOARD_CACHE_TTL, async () => {
      const [org, talentHealth, enps, topTalent] = await Promise.all([
        this.getOrganizationSummary({ period: DashboardPeriod.MONTH }),
        this.getTalentHealthScore(),
        this.getENPS(),
        this.getTopTalent(5),
      ]);

      const risks = this.buildExecutiveRisks(org, talentHealth);

      return {
        ...org,
        talentHealth,
        enps,
        topTalent,
        risks,
      };
    });
  }

  // ══════════════════════════════════════════════════════
  // DEPARTMENT DRILL-DOWN
  // ══════════════════════════════════════════════════════

  async getDepartmentDashboard(departmentId: number, period?: DashboardPeriod) {
    const since = periodStart(period);
    const prev = prevPeriodStart(period);

    const [users, enrollments, completions, avgScore, prevAvgScore, activePlans] =
      await Promise.all([
        this.prisma.read.user.count({ where: { departmentId, active: true } }),
        this.prisma.read.enrollment.count({
          where: { user: { departmentId }, status: EnrollmentStatus.IN_PROGRESS },
        }),
        this.prisma.read.enrollment.count({
          where: {
            user: { departmentId },
            status: EnrollmentStatus.COMPLETED,
            enrolledAt: { gte: since },
          },
        }),
        this.prisma.performanceReview
          .aggregate({
            where: { user: { departmentId }, createdAt: { gte: since } },
            _avg: { score: true },
          })
          .catch((e: unknown) => {
            this.logger.warn({
              departmentId,
              period,
              action: 'DASHBOARD_DEPT_AVG_SCORE',
              err: { message: e instanceof Error ? e.message : String(e) },
              msg: 'Falha ao obter média de performance actual do departamento',
            });
            return { _avg: { score: null } };
          }),
        this.prisma.performanceReview
          .aggregate({
            where: { user: { departmentId }, createdAt: { gte: prev, lt: since } },
            _avg: { score: true },
          })
          .catch((e: unknown) => {
            this.logger.warn({
              departmentId,
              period,
              action: 'DASHBOARD_DEPT_PREV_AVG_SCORE',
              err: { message: e instanceof Error ? e.message : String(e) },
              msg: 'Falha ao obter média de performance do período anterior do departamento',
            });
            return { _avg: { score: null } };
          }),
        this.prisma.read.developmentPlan.count({
          where: { status: 'ACTIVE', isTemplate: false, user: { departmentId } },
        }),
      ]);

    const currScore = avgScore._avg.score ?? 0;
    const prScore = prevAvgScore._avg.score ?? 0;

    return {
      departmentId,
      period: period ?? 'MONTH',
      headcount: users,
      learning: {
        enrollments,
        completions,
        completionRate: users > 0 ? +((completions / users) * 100).toFixed(1) : 0,
      },
      performance: {
        avgScore: currScore ? +currScore.toFixed(2) : null,
        trend: trend(currScore, prScore),
      },
      development: {
        activePlans,
        coverage: users > 0 ? +((activePlans / users) * 100).toFixed(1) : 0,
      },
    };
  }

  // ══════════════════════════════════════════════════════
  // ALERTS
  // ══════════════════════════════════════════════════════

  async getAlerts(userId: number, roleCode?: string) {
    // Fase H: delega no catálogo canónico de alertas (`metrics.alerts`, §4.6).
    // `GET /dashboard/alerts` mostra o subconjunto pessoal (scope 'user') mais
    // — para ADMIN/RH/LIDER — a regra de risco de equipa TEAM_PERFORMANCE_AT_RISK
    // (scope 'team'). O `type` histórico e a prioridade
    // URGENT/ATTENTION/INFORMATIVE são reconstruídos por `key`; a ordenação por
    // prioridade do ecrã antigo é preservada.
    const SEV_TO_PRIORITY: Record<MetricAlertSeverity, AlertPriority> = {
      HIGH: AlertPriority.URGENT,
      MEDIUM: AlertPriority.ATTENTION,
      LOW: AlertPriority.INFORMATIVE,
    };
    // canonical ALERT_TYPE → `type` histórico deste ecrã (§4.1)
    const HIST_TYPE: Record<string, string> = {
      SURVEYS_PENDING: 'SURVEY',
      EVAL_360_PENDING: 'EVALUATION',
      PDI_ACTIONS_OVERDUE: 'PDI',
      MANDATORY_TRAINING_PENDING: 'TRAINING', // type canónico é 'COMPLIANCE' — remap
      TEAM_PERFORMANCE_AT_RISK: 'PERFORMANCE',
    };

    const userAlerts = await this.metrics.alerts({ scope: 'user', userId }).catch((e: unknown) => {
      this.logger.warn({
        userId,
        roleCode,
        action: 'DASHBOARD_ALERTS_USER',
        err: { message: e instanceof Error ? e.message : String(e) },
        msg: 'Falha ao obter alertas pessoais a partir da camada canónica',
      });
      return [] as MetricAlert[];
    });

    const privileged = !!roleCode && ['ADMIN', 'RH', 'LIDER'].includes(roleCode);
    let teamPerf: MetricAlert[] = [];
    if (privileged) {
      const teamAlerts = await this.metrics
        .alerts({ scope: 'team', userId, roleCode })
        .catch((e: unknown) => {
          this.logger.warn({
            userId,
            roleCode,
            action: 'DASHBOARD_ALERTS_TEAM',
            err: { message: e instanceof Error ? e.message : String(e) },
            msg: 'Falha ao obter alertas de equipa a partir da camada canónica',
          });
          return [] as MetricAlert[];
        });
      teamPerf = teamAlerts.filter(a => a.key === 'TEAM_PERFORMANCE_AT_RISK');
    }

    const priorityRank = { URGENT: 0, ATTENTION: 1, INFORMATIVE: 2 } as const;

    return [...userAlerts, ...teamPerf]
      .map(a => ({
        type: HIST_TYPE[a.key] ?? a.type,
        message: a.message,
        priority: SEV_TO_PRIORITY[a.severity],
        ...(a.actionUrl ? { actionUrl: a.actionUrl } : {}),
      }))
      .sort((a, b) => priorityRank[a.priority] - priorityRank[b.priority]);
  }

  // ══════════════════════════════════════════════════════
  // GAMIFICATION LEADERBOARD
  // ══════════════════════════════════════════════════════

  async getLeaderboard(departmentId?: number, limit = 10) {
    const where: Prisma.UserWhereInput = { active: true };
    if (departmentId) where.departmentId = departmentId;

    const users = await this.prisma.read.user.findMany({
      where,
      include: {
        points: { select: { points: true } },
        position: { select: { name: true } },
        _count: { select: { badgeAwards: true } },
      },
      orderBy: { points: { points: 'desc' } },
      take: limit,
    });

    return users.map((u, i) => ({
      rank: i + 1,
      user: { id: u.id, fullName: u.fullName, avatarUrl: u.avatarUrl, position: u.position },
      points: u.points?.points ?? 0,
      badges: u._count.badgeAwards,
      level: this.computeLevel(u.points?.points ?? 0),
    }));
  }

  // ══════════════════════════════════════════════════════
  // SNAPSHOTS
  // ══════════════════════════════════════════════════════

  async listSnapshots() {
    return this.prisma.read.dashboardSnapshot.findMany({
      orderBy: { generatedAt: 'desc' },
      take: 12,
    });
  }

  async generateSnapshot() {
    const data = await this.getOrganizationSummary();
    const snapshot = await this.prisma.dashboardSnapshot.create({
      data: {
        totalUsers: data.kpis.headcount.total,
        totalCoursesCompleted: data.kpis.learning.completions,
        averageScore: data.kpis.performance.avgScore ?? 0,
        activePlans: data.kpis.development.activePlans,
      },
    });
    return { snapshot, data };
  }

  // ══════════════════════════════════════════════════════
  // SEARCH (global)
  // ══════════════════════════════════════════════════════

  async globalSearch(query: string, limit = 10) {
    if (!query || query.length < 2) return { users: [], courses: [], skills: [] };

    // FIX: mesmo padrão de getMyDashboard()/getOrganizationSummary() acima.
    const competenciesQuery = this.prisma.competency.findMany({
      where: { name: { contains: query, mode: 'insensitive' } },
      select: { id: true, name: true, type: true },
      take: 5,
    });

    const [users, courses, competencies] = await Promise.all([
      this.prisma.read.user.findMany({
        where: {
          OR: [
            { fullName: { contains: query, mode: 'insensitive' } },
            { email: { contains: query, mode: 'insensitive' } },
          ],
          active: true,
        },
        select: {
          id: true,
          fullName: true,
          email: true,
          avatarUrl: true,
          position: { select: { name: true } },
          department: { select: { name: true } },
        },
        take: limit,
      }),
      this.prisma.course.findMany({
        where: { title: { contains: query, mode: 'insensitive' }, status: 'PUBLISHED' },
        select: { id: true, title: true, category: true, thumbnailUrl: true },
        take: limit,
      }),
      competenciesQuery.catch((e: unknown): Awaited<typeof competenciesQuery> => {
        this.logger.warn({
          query,
          action: 'DASHBOARD_GLOBAL_SEARCH_COMPETENCIES',
          err: { message: e instanceof Error ? e.message : String(e) },
          msg: 'Falha ao pesquisar competências na pesquisa global',
        });
        return [];
      }),
    ]);

    return { users, courses, competencies };
  }

  // ══════════════════════════════════════════════════════
  // INTERNAL HELPERS
  // ══════════════════════════════════════════════════════

  private computeLevel(points: number): { level: number; label: string; nextAt: number } {
    if (points >= 5000) return { level: 5, label: 'Master', nextAt: 10000 };
    if (points >= 2000) return { level: 4, label: 'Expert', nextAt: 5000 };
    if (points >= 800) return { level: 3, label: 'Avançado', nextAt: 2000 };
    if (points >= 250) return { level: 2, label: 'Intermédio', nextAt: 800 };
    return { level: 1, label: 'Iniciante', nextAt: 250 };
  }

  // Fase H: subconjunto histórico de `buildManagerAlerts` (§4.2) — as 4 regras
  // de equipa que `GET /dashboard/manager` sempre mostrou, reconstruídas a
  // partir dos alertas canónicos de scope 'team'. Sem `count` nem `actionUrl`
  // (a forma antiga também não os tinha). Delta sancionado (ratificação no PR
  // da Task 10): `EVAL_360_PENDING` sai agora como URGENT — antes era ATTENTION
  // — por causa da unificação de severidade canónica (HIGH → URGENT). A ordem
  // passa a ser a canónica (severidade, depois `key`) em vez da antiga ordem
  // de `push` — cosmético para um consumidor de lista.
  private adaptManagerAlerts(
    alerts: MetricAlert[],
  ): { message: string; priority: AlertPriority; type: string }[] {
    const MAP: Record<string, { type: string; priority: AlertPriority }> = {
      MANAGER_TEAM_RISK: { type: 'RISK', priority: AlertPriority.URGENT },
      MANDATORY_RATE_LOW: { type: 'TRAINING', priority: AlertPriority.ATTENTION },
      PDP_COVERAGE_LOW: { type: 'PDI', priority: AlertPriority.ATTENTION },
      EVAL_360_PENDING: { type: 'EVALUATION', priority: AlertPriority.URGENT },
    };
    return alerts
      .filter(a => MAP[a.key] !== undefined)
      .map(a => ({ message: a.message, priority: MAP[a.key].priority, type: MAP[a.key].type }));
  }

  private buildOrgInsights(data: {
    hiPoCount: number;
    successionCoverage: number;
    activePlans: number;
    totalUsers: number;
    completionsNow: number;
  }): string[] {
    const insights: string[] = [];
    if (data.hiPoCount > 0)
      insights.push(`${data.hiPoCount} colaboradores identificados como High Potential`);
    if (data.successionCoverage < 50)
      insights.push(`Cobertura de sucessão abaixo de 50% — risco organizacional`);
    if (data.activePlans / (data.totalUsers || 1) < 0.4)
      insights.push(`Menos de 40% dos colaboradores têm PDI activo`);
    if (data.completionsNow > 0)
      insights.push(`${data.completionsNow} conclusões de cursos no período`);
    return insights;
  }

  // Superfícies mínimas usadas por buildExecutiveRisks() — getOrganizationSummary()
  // e getTalentHealthScore() devolvem objectos muito maiores, mas só estes
  // campos são lidos aqui.
  private buildExecutiveRisks(
    org: {
      kpis: { talent?: { successionCoverage?: number }; development?: { coverage?: number } };
    },
    talentHealth: { healthScore?: number } | null,
  ): { type: string; label: string; severity: string }[] {
    const risks = [];
    if ((org.kpis.talent?.successionCoverage ?? 0) < 30)
      risks.push({ type: 'SUCCESSION', label: 'Baixa cobertura de sucessão', severity: 'HIGH' });
    if ((talentHealth?.healthScore ?? 100) < 50)
      risks.push({ type: 'TALENT', label: 'Talent Health Score crítico', severity: 'HIGH' });
    if ((org.kpis.development?.coverage ?? 100) < 30)
      risks.push({ type: 'DEVELOPMENT', label: 'Baixa cobertura de PDI', severity: 'MEDIUM' });
    return risks;
  }

  private async getTalentHealthScore() {
    const [total, withPlan, withSkills, withReview] = await Promise.all([
      this.prisma.read.user.count({ where: { active: true } }),
      this.prisma.read.user.count({
        where: {
          active: true,
          developmentPlans: { some: { status: 'ACTIVE', isTemplate: false } },
        },
      }),
      this.prisma.user
        .count({ where: { active: true, legacySkills: { some: {} } } })
        .catch((e: unknown) => {
          this.logger.warn({
            action: 'DASHBOARD_TALENT_HEALTH_SKILLS',
            err: { message: e instanceof Error ? e.message : String(e) },
            msg: 'Falha ao obter contagem de colaboradores com competências para o Talent Health Score',
          });
          return 0;
        }),
      this.prisma.read.user.count({ where: { active: true, performanceReviews: { some: {} } } }),
    ]);
    const pdpCoverage = total > 0 ? (withPlan / total) * 100 : 0;
    const skillRate = total > 0 ? (withSkills / total) * 100 : 0;
    const reviewedRate = total > 0 ? (withReview / total) * 100 : 0;
    const score = +(pdpCoverage * 0.4 + skillRate * 0.3 + reviewedRate * 0.3).toFixed(1);
    return {
      healthScore: score,
      grade: score >= 80 ? 'A' : score >= 65 ? 'B' : score >= 50 ? 'C' : 'D',
    };
  }

  private async getENPS() {
    const survey = await this.prisma.engagementSurvey
      .findFirst({
        where: { type: 'ENPS', status: { in: ['ACTIVE', 'COMPLETED'] } },
        include: { responses: { include: { answers: { include: { question: true } } } } },
        orderBy: { createdAt: 'desc' },
      })
      .catch((e: unknown) => {
        this.logger.warn({
          action: 'DASHBOARD_ENPS_SURVEY',
          err: { message: e instanceof Error ? e.message : String(e) },
          msg: 'Falha ao obter inquérito ENPS mais recente',
        });
        return null;
      });
    if (!survey) return null;

    // FIX: casts `any` desnecessários — `survey.responses`/`.answers`/
    // `.question` já vêm totalmente tipados do `include` acima.
    const scores = survey.responses
      .flatMap(r => r.answers)
      .filter(a => a.question?.type === 'ENPS' && a.value !== null)
      .map(a => a.value as number);

    if (!scores.length) return null;
    const p = scores.filter(s => s >= 9).length;
    const d = scores.filter(s => s <= 6).length;
    const enps = Math.round(((p - d) / scores.length) * 100);
    return { enps, promoterPct: +((p / scores.length) * 100).toFixed(1), total: scores.length };
  }

  private async getTopTalent(limit = 5) {
    const users = await this.prisma.read.user.findMany({
      where: { active: true },
      include: {
        points: { select: { points: true } },
        performanceReviews: { orderBy: { createdAt: 'desc' }, take: 1, select: { score: true } },
        position: { select: { name: true } },
      },
      take: limit * 4,
    });

    return users
      .map(u => ({
        id: u.id,
        fullName: u.fullName,
        position: u.position,
        points: u.points?.points ?? 0,
        score: u.performanceReviews[0]?.score ?? 0,
        talent: +(
          ((u.points?.points ?? 0) / 1000) * 0.3 +
          ((u.performanceReviews[0]?.score ?? 0) / 5) * 0.7
        ).toFixed(2),
      }))
      .sort((a, b) => b.talent - a.talent)
      .slice(0, limit);
  }
}
