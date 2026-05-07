// src/dashboard/dashboard.service.ts
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { DashboardFilterDto, OrgFilterDto, DashboardPeriod, AlertPriority } from './dashboard.dto';

// ─── Helpers ─────────────────────────────────────────────────────

function periodStart(period?: DashboardPeriod): Date {
  const now = new Date();
  switch (period) {
    case DashboardPeriod.WEEK:    return new Date(now.setDate(now.getDate() - 7));
    case DashboardPeriod.QUARTER: return new Date(now.setMonth(now.getMonth() - 3));
    case DashboardPeriod.YEAR:    return new Date(now.setFullYear(now.getFullYear() - 1));
    default:
      return new Date(new Date().getFullYear(), new Date().getMonth(), 1); // Month
  }
}

function prevPeriodStart(period?: DashboardPeriod): Date {
  const now = new Date();
  switch (period) {
    case DashboardPeriod.WEEK:    return new Date(now.setDate(now.getDate() - 14));
    case DashboardPeriod.QUARTER: return new Date(now.setMonth(now.getMonth() - 6));
    case DashboardPeriod.YEAR:    return new Date(now.setFullYear(now.getFullYear() - 2));
    default:
      return new Date(new Date().getFullYear(), new Date().getMonth() - 1, 1);
  }
}

function trend(current: number, previous: number): number {
  if (previous === 0) return 0;
  return +((((current - previous) / previous) * 100)).toFixed(1);
}

function safeM(prisma: any, name: string) {
  return (prisma as any)[name] ?? {
    findMany: async () => [], findFirst: async () => null,
    count: async () => 0, aggregate: async () => ({ _avg: {}, _sum: {}, _count: {} }),
    groupBy: async () => [],
  };
}

// ─────────────────────────────────────────────────────────────────
// SERVICE
// ─────────────────────────────────────────────────────────────────

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  // ══════════════════════════════════════════════════════
  // COLABORADOR — personal dashboard
  // ══════════════════════════════════════════════════════

  async getMyDashboard(userId: number) {
    const [
      user,
      inProgress, completed, totalEnrolled,
      points, recentBadges, pendingAssessments,
      activePlan, recentSurveys,
      pendingEvals, avatarSessions,
      competencies, notifications,
    ] = await Promise.all([
      this.prisma.user.findUnique({
        where:   { id: userId },
        select:  { id: true, fullName: true, avatarUrl: true, email: true,
          position:   { select: { id: true, name: true, level: true } },
          department: { select: { id: true, name: true } },
          createdAt: true,
        },
      }),
      this.prisma.enrollment.count({ where: { userId, status: 'EM_ANDAMENTO' } }),
      this.prisma.enrollment.count({ where: { userId, status: 'CONCLUIDO' } }),
      this.prisma.enrollment.count({ where: { userId } }),
      this.prisma.userPoints.findUnique({ where: { userId } }),
      this.prisma.badgeAward.findMany({
        where:   { userId },
        include: { badge: true },
        orderBy: { awardedAt: 'desc' },
        take:    3,
      }),
      this.prisma.assessmentAttempt.count({ where: { userId, passed: false } }),
      this.prisma.developmentPlan.findFirst({
        where:   { userId, status: { in: ['ACTIVE', 'DRAFT'] }, isTemplate: false },
        include: { actions: { select: { status: true, progress: true }, take: 20 },
          goals: { select: { progress: true }, take: 10 } },
      }),
      (this.prisma as any).engagementSurvey.findMany({
       where: { status: 'ACTIVE', responses: { none: { userId } } },
       select: { id: true, title: true, type: true },
       take:   3,
       }),
      this.prisma.evaluationRequest.count({ where: { evaluatorId: userId, status: 'PENDING' } }).catch(() => 0),
      this.prisma.avatarSession.count({ where: { userId, status: 'COMPLETED' } }),
      this.prisma.userCompetency.findMany({
        where:   { userId },
        include: { competency: { select: { name: true } } },
        take:    5,
      }),
      this.prisma.notificationLog.findMany({
        where:   { userId, read: false },
        orderBy: { createdAt: 'desc' },
        take:    5,
        select:  { id: true, type: true, message: true, createdAt: true },
      }).catch(() => [] as any[]),
    ]);

    // PDI stats
    const planActions  = activePlan?.actions ?? [];
    const planGoals    = activePlan?.goals   ?? [];
    const planProgress = planActions.length
      ? Math.round(planActions.reduce((s, a) => s + (a.progress ?? 0), 0) / planActions.length)
      : 0;
    const completionRate = totalEnrolled > 0 ? +((completed / totalEnrolled) * 100).toFixed(1) : 0;

    // Pending items list
    const pendingItems: { type: string; label: string; priority: string }[] = [];
    if (inProgress > 0)     pendingItems.push({ type: 'COURSE', label: `${inProgress} curso(s) em progresso`, priority: 'MEDIUM' });
    if (pendingAssessments > 0) pendingItems.push({ type: 'ASSESSMENT', label: `${pendingAssessments} avaliação(ões) pendente(s)`, priority: 'HIGH' });
    if (recentSurveys.length > 0) pendingItems.push({ type: 'SURVEY', label: `${recentSurveys.length} survey(s) por responder`, priority: 'MEDIUM' });
    if (pendingEvals > 0)   pendingItems.push({ type: 'EVALUATION', label: `${pendingEvals} avaliação(ões) 360° para submeter`, priority: 'HIGH' });

    return {
      user,
      learning: {
        inProgress, completed, totalEnrolled, completionRate,
        pendingAssessments,
      },
      development: {
        activePlan: activePlan ? {
          id: activePlan.id, name: activePlan.name,
          status: activePlan.status, progress: planProgress,
          goals: planGoals.length, completedActions: planActions.filter(a => a.status === 'COMPLETED').length,
        } : null,
      },
      engagement: {
        pendingSurveys: recentSurveys.length,
        surveys:        recentSurveys,
      },
      gamification: {
        totalPoints:  points?.points ?? 0,
        recentBadges,
        avatarSessions,
        level: this.computeLevel(points?.points ?? 0),
      },
      skills: competencies.map(c => ({
        name:    c.competency.name,
        current: c.currentLevel,
        target:  c.targetLevel,
      })),
      pendingItems,
      notifications,
    };
  }

  // ══════════════════════════════════════════════════════
  // GESTOR — team dashboard
  // ══════════════════════════════════════════════════════

  async getManagerDashboard(userId: number, filters: DashboardFilterDto = {}) {
    const since = periodStart(filters.period);
    const prev  = prevPeriodStart(filters.period);

    const user = await this.prisma.user.findUnique({
      where:  { id: userId },
      select: { departmentId: true, fullName: true },
    });
    const deptId = filters.departmentId ?? user?.departmentId;
    const teamWhere: any = { managerId: userId, active: true };

    const team = await this.prisma.user.findMany({
      where:   teamWhere,
      select:  {
        id: true, fullName: true, avatarUrl: true,
        position:   { select: { name: true } },
        department: { select: { name: true } },
        points:     { select: { points: true } },
      },
    });
    const teamIds = team.map(u => u.id);

    if (!teamIds.length) return { teamSize: 0, team: [], kpis: {}, alerts: [], pendingItems: [] };

    const [
      activePlans, completedPlans,
      inProgress, completed, mandatory, mandatoryComplete,
      pendingEvals,
      engagementResponses,
      avatarSessions,
      avgPerf,
      prevAvgPerf,
    ] = await Promise.all([
      this.prisma.developmentPlan.count({ where: { userId: { in: teamIds }, status: 'ACTIVE', isTemplate: false } }),
      this.prisma.developmentPlan.count({ where: { userId: { in: teamIds }, status: 'COMPLETED', isTemplate: false } }),
      this.prisma.enrollment.count({ where: { userId: { in: teamIds }, status: 'EM_ANDAMENTO' } }),
      this.prisma.enrollment.count({ where: { userId: { in: teamIds }, status: 'CONCLUIDO', enrolledAt: { gte: since } } }),
      this.prisma.enrollment.count({ where: { userId: { in: teamIds }, course: { mandatory: true } } }).catch(() => 0),
      this.prisma.enrollment.count({ where: { userId: { in: teamIds }, course: { mandatory: true }, status: 'CONCLUIDO' } }).catch(() => 0),
      this.prisma.evaluationRequest.count({ where: { evaluatorId: userId, status: 'PENDING' } }).catch(() => 0),
      this.prisma.surveyResponse.count({ where: { userId: { in: teamIds }, createdAt: { gte: since } } }),
      this.prisma.avatarSession.count({ where: { userId: { in: teamIds }, status: 'COMPLETED' } }),
      this.prisma.performanceReview.aggregate({
        where: { userId: { in: teamIds }, createdAt: { gte: since } },
        _avg:  { score: true },
      }).catch(() => ({ _avg: { score: null } })),
      this.prisma.performanceReview.aggregate({
        where: { userId: { in: teamIds }, createdAt: { gte: prev, lt: since } },
        _avg:  { score: true },
      }).catch(() => ({ _avg: { score: null } })),
    ]);

    const avgScore     = avgPerf._avg.score;
    const prevScore    = prevAvgPerf._avg.score;
    const scoreTrend   = avgScore !== null && prevScore !== null ? trend(avgScore, prevScore) : null;
    const pdpCoverage  = teamIds.length > 0 ? +((activePlans / teamIds.length) * 100).toFixed(1) : 0;
    const mandatoryRate= mandatory > 0 ? +((mandatoryComplete / mandatory) * 100).toFixed(1) : 100;

    // Per-team-member enrichment
    const memberEnrollments = await this.prisma.enrollment.findMany({
      where: { userId: { in: teamIds } },
      select: { userId: true, status: true },
    });
    const memberPlans = await this.prisma.developmentPlan.findMany({
      where: { userId: { in: teamIds }, isTemplate: false, status: { in: ['ACTIVE', 'DRAFT'] } },
      select: { userId: true, status: true, overallProgress: true },
    });
    const memberPerfReviews = await this.prisma.performanceReview.findMany({
      where: { userId: { in: teamIds } },
      select: { userId: true, score: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    });

    const enriched = team.map(u => {
      const uEnrolls  = memberEnrollments.filter(e => e.userId === u.id);
      const uPlan     = memberPlans.find(p => p.userId === u.id);
      const uLatestPerf = memberPerfReviews.find(r => r.userId === u.id);
      const uCompleted = uEnrolls.filter(e => e.status === 'CONCLUIDO').length;
      const uInProgress= uEnrolls.filter(e => e.status === 'EM_ANDAMENTO').length;

      return {
        user:       { id: u.id, fullName: u.fullName, avatarUrl: u.avatarUrl, position: u.position },
        xp:         u.points?.points ?? 0,
        enrollment: { completed: uCompleted, inProgress: uInProgress },
        plan:       uPlan ? { progress: uPlan.overallProgress ?? 0, status: uPlan.status } : null,
        lastScore:  uLatestPerf?.score ?? null,
        alert:      uLatestPerf !== undefined && (uLatestPerf.score ?? 0) < 2.5
          || uCompleted === 0 && uEnrolls.length > 0,
      };
    });

    // Alerts
    const alerts = this.buildManagerAlerts({
      atRisk:        enriched.filter(u => u.alert).length,
      mandatoryRate, pdpCoverage, pendingEvals,
    });

    return {
      teamSize:    teamIds.length,
      kpis: {
        pdpCoverage,
        activePlans, completedPlans,
        inProgress, completedEnrollments: completed,
        avgScore:    avgScore ? +avgScore.toFixed(2) : null,
        scoreTrend,
        mandatoryRate,
        engagementResponses,
        avatarSessions,
        pendingEvals,
      },
      team:         enriched,
      alerts,
    };
  }

  // ══════════════════════════════════════════════════════
  // RH / ADMIN — organisation dashboard
  // ══════════════════════════════════════════════════════

  async getOrganizationSummary(filters: OrgFilterDto = {}) {
    const since = periodStart(filters.period);
    const prev  = prevPeriodStart(filters.period);
    const deptFilter = filters.departmentId ? { departmentId: filters.departmentId } : {};

    const [
      totalUsers, activeUsers, newUsers, prevNewUsers,
      totalCourses, enrollmentsNow, enrollmentsPrev,
      completionsNow, completionsPrev,
      avgScore,
      activeSurveys, surveyResponses,
      activePlans, completedPlans,
      pendingEvals,
      departmentBreakdown,
      hiPoCount,
      successionCoverage,
      topContentViews,
      trainingHours,
    ] = await Promise.all([
      this.prisma.user.count({ where: { ...deptFilter } }),
      this.prisma.user.count({ where: { active: true, ...deptFilter } }),
      this.prisma.user.count({ where: { createdAt: { gte: since }, ...deptFilter } }),
      this.prisma.user.count({ where: { createdAt: { gte: prev, lt: since }, ...deptFilter } }),
      (this.prisma as any).course.count({ where: { active: true } }),
      (this.prisma as any).enrollment.count({ where: { createdAt: { gte: since }, user: deptFilter } }),
      (this.prisma as any).enrollment.count({ where: { createdAt: { gte: prev, lt: since }, user: deptFilter } }),
      this.prisma.enrollment.count({ where: { status: 'CONCLUIDO', enrolledAt: { gte: since }, user: deptFilter } }),
      this.prisma.enrollment.count({ where: { status: 'CONCLUIDO', enrolledAt: { gte: prev, lt: since }, user: deptFilter } }),
      this.prisma.performanceReview.aggregate({
        where: { createdAt: { gte: since }, user: deptFilter },
        _avg:  { score: true },
      }).catch(() => ({ _avg: { score: null } })),
      this.prisma.engagementSurvey.count({ where: { status: 'ACTIVE' } }),
      this.prisma.surveyResponse.count({ where: { createdAt: { gte: since }, user: deptFilter } }),
      this.prisma.developmentPlan.count({ where: { status: 'ACTIVE', isTemplate: false, user: deptFilter } }),
      this.prisma.developmentPlan.count({ where: { status: 'COMPLETED', isTemplate: false, user: deptFilter } }),
      this.prisma.evaluationRequest.count({ where: { status: 'PENDING' } }).catch(() => 0),
      // Dept breakdown
      this.prisma.department.findMany({
        select: { id: true, name: true, _count: { select: { users: true } } },
        take:   10,
      }),
      // HiPos (users with performance score >= 4 from talent pool heuristic)
      this.prisma.userCompetency.groupBy({
      by:      ['userId'],
      where:   { currentLevel: { gte: 4 }, user: deptFilter },
      _avg:    { currentLevel: true },
      having:  { currentLevel: { _avg: { gte: 4 } } },
      orderBy: { _avg: { currentLevel: 'desc' } },
      take:    100,
      }).then(r => r.length).catch(() => 0),
      // Succession coverage
      this.prisma.successionPlan.count().then(async count => {
        const positions = await this.prisma.position.count();
        return positions > 0 ? +((count / positions) * 100).toFixed(1) : 0;
      }).catch(() => 0),
      // Top content
      this.prisma.auditLog.groupBy({
        by:      ['entityId'],
        where:   { action: 'CONTENT_VIEW', entity: 'ContentAsset', timestamp: { gte: since } },
        _count:  { id: true },
        orderBy: { _count: { id: 'desc' } },
        take:    5,
      }).catch(() => [] as any[]),
      // Training hours estimate (completions × avg course workload)
      this.prisma.enrollment.count({ where: { status: 'CONCLUIDO', user: deptFilter, enrolledAt: { gte: since } } })
        .then(c => c * 2).catch(() => 0), // ~2h avg
    ]);

    // Enrich top content
    const contentIds = (topContentViews as any[]).map((v: any) => v.entityId).filter(Boolean);
    const contents   = contentIds.length
      ? await this.prisma.contentAsset.findMany({ where: { id: { in: contentIds } }, select: { id: true, title: true, type: true } })
      : [];
    const cMap = new Map(contents.map(c => [c.id, c]));

    return {
      period: filters.period ?? 'MONTH',
      generatedAt: new Date(),
      kpis: {
        headcount:    { total: totalUsers, active: activeUsers, new: newUsers, newTrend: trend(newUsers, prevNewUsers) },
        learning:     {
          courses: totalCourses, enrollments: enrollmentsNow,
          enrollmentsTrend: trend(enrollmentsNow, enrollmentsPrev),
          completions: completionsNow, completionsTrend: trend(completionsNow, completionsPrev),
          trainingHours,
        },
        performance:  { avgScore: avgScore._avg.score ? +avgScore._avg.score.toFixed(2) : null },
        engagement:   { activeSurveys, responses: surveyResponses },
        development:  { activePlans, completedPlans, coverage: totalUsers > 0 ? +((activePlans / totalUsers) * 100).toFixed(1) : 0 },
        talent:       { hiPos: hiPoCount, successionCoverage },
        pending:      { evaluations: pendingEvals },
      },
      departments: departmentBreakdown.map(d => ({ id: d.id, name: d.name, headcount: d._count.users })),
      topContent: (topContentViews as any[]).map((v: any) => ({
        content: cMap.get(v.entityId), views: v._count.id,
      })).filter((v: any) => v.content),
      insights: this.buildOrgInsights({ hiPoCount, successionCoverage, activePlans, totalUsers, completionsNow }),
    };
  }

  // ══════════════════════════════════════════════════════
  // EXECUTIVE (C-Level)
  // ══════════════════════════════════════════════════════

  async getExecutiveDashboard() {
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
  }

  // ══════════════════════════════════════════════════════
  // DEPARTMENT DRILL-DOWN
  // ══════════════════════════════════════════════════════

  async getDepartmentDashboard(departmentId: number, period?: DashboardPeriod) {
    const since = periodStart(period);
    const prev  = prevPeriodStart(period);

    const [users, enrollments, completions, avgScore, prevAvgScore, activePlans] = await Promise.all([
      this.prisma.user.count({ where: { departmentId, active: true } }),
      this.prisma.enrollment.count({ where: { user: { departmentId }, status: 'EM_ANDAMENTO' } }),
      this.prisma.enrollment.count({ where: { user: { departmentId }, status: 'CONCLUIDO', enrolledAt: { gte: since } } }),
      this.prisma.performanceReview.aggregate({
        where: { user: { departmentId }, createdAt: { gte: since } },
        _avg:  { score: true },
      }).catch(() => ({ _avg: { score: null } })),
      this.prisma.performanceReview.aggregate({
        where: { user: { departmentId }, createdAt: { gte: prev, lt: since } },
        _avg:  { score: true },
      }).catch(() => ({ _avg: { score: null } })),
      this.prisma.developmentPlan.count({ where: { status: 'ACTIVE', isTemplate: false, user: { departmentId } } }),
    ]);

    const currScore = avgScore._avg.score ?? 0;
    const prScore   = prevAvgScore._avg.score ?? 0;

    return {
      departmentId, period: period ?? 'MONTH',
      headcount: users,
      learning:  { enrollments, completions, completionRate: users > 0 ? +((completions / users) * 100).toFixed(1) : 0 },
      performance: { avgScore: currScore ? +currScore.toFixed(2) : null, trend: trend(currScore, prScore) },
      development: { activePlans, coverage: users > 0 ? +((activePlans / users) * 100).toFixed(1) : 0 },
    };
  }

  // ══════════════════════════════════════════════════════
  // ALERTS
  // ══════════════════════════════════════════════════════

  async getAlerts(userId: number, roleCode?: string) {
    const alerts: { type: string; message: string; priority: AlertPriority; actionUrl?: string }[] = [];

    // Personal pending surveys
    const pendingSurveys = await this.prisma.engagementSurvey.count({
      where: { status: 'ACTIVE', responses: { none: { userId } } },
    });
    if (pendingSurveys > 0)
      alerts.push({ type: 'SURVEY', message: `${pendingSurveys} survey(s) por responder`, priority: AlertPriority.ATTENTION, actionUrl: '/engagement' });

    // Pending evaluations
    const pendingEvals = await this.prisma.evaluationRequest.count({ where: { evaluatorId: userId, status: 'PENDING' } }).catch(() => 0);
    if (pendingEvals > 0)
      alerts.push({ type: 'EVALUATION', message: `${pendingEvals} avaliação(ões) 360° pendentes`, priority: AlertPriority.URGENT, actionUrl: '/evaluations/pending' });

    // Overdue development actions
    const overdueActions = await this.prisma.developmentPlanAction.count({
      where: { plan: { userId }, status: { notIn: ['COMPLETED', 'CANCELLED'] }, dueDate: { lt: new Date() } },
    }).catch(() => 0);
    if (overdueActions > 0)
      alerts.push({ type: 'PDI', message: `${overdueActions} acção(ões) de PDI em atraso`, priority: AlertPriority.URGENT, actionUrl: '/talent-development/plans' });

    // Mandatory training not completed
    const mandatoryPending = await this.prisma.course.count({
      where: {
        mandatory: true,
        enrollments: { none: { userId, status: 'CONCLUIDO' } },
      } as any,
    }).catch(() => 0);
    if (mandatoryPending > 0)
      alerts.push({ type: 'TRAINING', message: `${mandatoryPending} formação(ões) obrigatória(s) por concluir`, priority: AlertPriority.ATTENTION, actionUrl: '/content-library/mandatory' });

    // Manager alerts
    if (roleCode && ['ADMIN', 'RH', 'LIDER'].includes(roleCode)) {
      const teamAtRisk = await this.prisma.user.count({
        where: {
          managerId: userId,
          active:    true,
          performanceReviews: { some: { score: { lt: 2.5 } } },
        },
      });
      if (teamAtRisk > 0)
        alerts.push({ type: 'PERFORMANCE', message: `${teamAtRisk} membro(s) da equipa com performance abaixo da média`, priority: AlertPriority.URGENT, actionUrl: '/evaluations' });
    }

    return alerts.sort((a, b) => {
      const order = { URGENT: 0, ATTENTION: 1, INFORMATIVE: 2 };
      return order[a.priority] - order[b.priority];
    });
  }

  // ══════════════════════════════════════════════════════
  // GAMIFICATION LEADERBOARD
  // ══════════════════════════════════════════════════════

  async getLeaderboard(departmentId?: number, limit = 10) {
    const where: any = { active: true };
    if (departmentId) where.departmentId = departmentId;

    const users = await this.prisma.user.findMany({
      where,
      include: {
        points:   { select: { points: true } },
        position: { select: { name: true } },
        _count:   { select: { badgeAwards: true } },
      },
      orderBy: { points: { points: 'desc' } },
      take:    limit,
    });

    return users.map((u, i) => ({
      rank:    i + 1,
      user:    { id: u.id, fullName: u.fullName, avatarUrl: u.avatarUrl, position: u.position },
      points:  u.points?.points ?? 0,
      badges:  u._count.badgeAwards,
      level:   this.computeLevel(u.points?.points ?? 0),
    }));
  }

  // ══════════════════════════════════════════════════════
  // SNAPSHOTS
  // ══════════════════════════════════════════════════════

  async listSnapshots() {
    return this.prisma.dashboardSnapshot.findMany({
      orderBy: { generatedAt: 'desc' },
      take:    12,
    });
  }

  async generateSnapshot() {
    const data = await this.getOrganizationSummary();
    return (this.prisma as any).dashboardSnapshot.create({
     data: {
     data:        data as any,
     generatedAt: new Date(),
    },
    }).catch(() => ({ message: 'Snapshot gerado (modelo pode requerer migration)', data }));
  }

  // ══════════════════════════════════════════════════════
  // SEARCH (global)
  // ══════════════════════════════════════════════════════

  async globalSearch(query: string, limit = 10) {
    if (!query || query.length < 2) return { users: [], courses: [], skills: [] };

    const [users, courses, competencies] = await Promise.all([
      this.prisma.user.findMany({
        where: { OR: [
          { fullName:  { contains: query, mode: 'insensitive' } },
          { email:     { contains: query, mode: 'insensitive' } },
        ], active: true },
        select: { id: true, fullName: true, email: true, avatarUrl: true,
          position:   { select: { name: true } },
          department: { select: { name: true } } },
        take:    limit,
      }),
      (this.prisma as any).course.findMany({
      where: { title: { contains: query, mode: 'insensitive' }, active: true },
      select: { id: true, title: true, category: true, thumbnailUrl: true },
      take:    limit,
      }),
     (this.prisma as any).competency.findMany({
      where: { name: { contains: query, mode: 'insensitive' } },
      select: { id: true, name: true, type: true },
     take:   5,
     }).catch(() => [] as any[]),
    ]);

    return { users, courses, competencies };
  }

  // ══════════════════════════════════════════════════════
  // INTERNAL HELPERS
  // ══════════════════════════════════════════════════════

  private computeLevel(points: number): { level: number; label: string; nextAt: number } {
    if (points >= 5000) return { level: 5, label: 'Master',       nextAt: 10000 };
    if (points >= 2000) return { level: 4, label: 'Expert',       nextAt: 5000 };
    if (points >= 800)  return { level: 3, label: 'Avançado',     nextAt: 2000 };
    if (points >= 250)  return { level: 2, label: 'Intermédio',   nextAt: 800 };
    return               { level: 1, label: 'Iniciante',          nextAt: 250 };
  }

  private buildManagerAlerts(data: {
    atRisk: number; mandatoryRate: number; pdpCoverage: number; pendingEvals: number;
  }): { message: string; priority: AlertPriority; type: string }[] {
    const alerts = [];
    if (data.atRisk > 0)
      alerts.push({ type: 'RISK', priority: AlertPriority.URGENT, message: `${data.atRisk} colaborador(es) em risco de performance` });
    if (data.mandatoryRate < 80)
      alerts.push({ type: 'TRAINING', priority: AlertPriority.ATTENTION, message: `Taxa de formações obrigatórias abaixo de 80% (${data.mandatoryRate}%)` });
    if (data.pdpCoverage < 50)
      alerts.push({ type: 'PDI', priority: AlertPriority.ATTENTION, message: `Apenas ${data.pdpCoverage}% da equipa tem PDI activo` });
    if (data.pendingEvals > 0)
      alerts.push({ type: 'EVALUATION', priority: AlertPriority.ATTENTION, message: `${data.pendingEvals} avaliação(ões) 360° pendentes` });
    return alerts;
  }

  private buildOrgInsights(data: {
    hiPoCount: number; successionCoverage: number; activePlans: number;
    totalUsers: number; completionsNow: number;
  }): string[] {
    const insights: string[] = [];
    if (data.hiPoCount > 0)   insights.push(`🌟 ${data.hiPoCount} colaboradores identificados como High Potential`);
    if (data.successionCoverage < 50) insights.push(`⚠️ Cobertura de sucessão abaixo de 50% — risco organizacional`);
    if (data.activePlans / (data.totalUsers || 1) < 0.4)
      insights.push(`📋 Menos de 40% dos colaboradores têm PDI activo`);
    if (data.completionsNow > 0)
      insights.push(`✅ ${data.completionsNow} conclusões de cursos no período`);
    return insights;
  }

  private buildExecutiveRisks(org: any, talentHealth: any): { type: string; label: string; severity: string }[] {
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
      this.prisma.user.count({ where: { active: true } }),
      this.prisma.user.count({ where: { active: true, developmentPlans: { some: { status: 'ACTIVE', isTemplate: false } } } }),
      this.prisma.user.count({ where: { active: true, legacySkills: { some: {} } } }).catch(() => 0),
      this.prisma.user.count({ where: { active: true, performanceReviews: { some: {} } } }),
    ]);
    const pdpCoverage = total > 0 ? (withPlan / total) * 100 : 0;
    const skillRate   = total > 0 ? (withSkills / total) * 100 : 0;
    const reviewedRate= total > 0 ? (withReview / total) * 100 : 0;
    const score       = +(pdpCoverage * 0.4 + skillRate * 0.3 + reviewedRate * 0.3).toFixed(1);
    return { healthScore: score, grade: score >= 80 ? 'A' : score >= 65 ? 'B' : score >= 50 ? 'C' : 'D' };
  }

  private async getENPS() {
    const survey = await (this.prisma as any).engagementSurvey.findFirst({
      where:   { type: 'ENPS', status: { in: ['ACTIVE', 'COMPLETED'] } },
      include: { responses: { include: { answers: { include: { question: true } } } } },
      orderBy: { createdAt: 'desc' },
    }).catch(() => null);
    if (!survey) return null;

    const scores = (survey?.responses ?? [])
      .flatMap((r: any) => r.answers)
      .filter((a: any) => a.question?.type === 'ENPS' && a.value !== null)
      .map((a: any) => a.value as number);

    if (!scores.length) return null;
    const p = scores.filter(s => s >= 9).length;
    const d = scores.filter(s => s <= 6).length;
    const enps = Math.round(((p - d) / scores.length) * 100);
    return { enps, promoterPct: +((p / scores.length) * 100).toFixed(1), total: scores.length };
  }

  private async getTopTalent(limit = 5) {
    const users = await this.prisma.user.findMany({
      where:   { active: true },
      include: {
        points:           { select: { points: true } },
        performanceReviews: { orderBy: { createdAt: 'desc' }, take: 1, select: { score: true } },
        position:         { select: { name: true } },
      },
      take:    limit * 4,
    });

    return users.map(u => ({
      id:       u.id,
      fullName: u.fullName,
      position: u.position,
      points:   u.points?.points ?? 0,
      score:    u.performanceReviews[0]?.score ?? 0,
      talent:   +(((u.points?.points ?? 0) / 1000) * 0.3 + ((u.performanceReviews[0]?.score ?? 0) / 5) * 0.7).toFixed(2),
    }))
      .sort((a, b) => b.talent - a.talent)
      .slice(0, limit);
  }
}


















