// src/analytics/analytics.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AnalyticsFilterDto, AnalyticsPeriod } from './analytics.dto';

@Injectable()
export class AnalyticsService {
  private readonly logger = new Logger(AnalyticsService.name);

  constructor(private prisma: PrismaService) {}

  private getDateRange(period: AnalyticsPeriod = AnalyticsPeriod.LAST_30_DAYS, fromDate?: string, toDate?: string) {
    const to  = toDate   ? new Date(toDate)   : new Date();
    let   from: Date;
    if (fromDate) {
      from = new Date(fromDate);
    } else {
      from = new Date();
      switch (period) {
        case '7d':  from.setDate(from.getDate() - 7);    break;
        case '30d': from.setDate(from.getDate() - 30);   break;
        case '90d': from.setDate(from.getDate() - 90);   break;
        case '6m':  from.setMonth(from.getMonth() - 6);  break;
        case '1y':  from.setFullYear(from.getFullYear() - 1); break;
        default:    from.setDate(from.getDate() - 30);
      }
    }
    return { from, to };
  }

  async getOrganizationOverview() {
    const [
      totalUsers, activeUsers,
      totalCourses, publishedCourses,
      totalEnrollments, completedEnrollments,
      totalPoints, totalBadges,
      totalLearningPaths, totalPDIs, activePDIs,
      avgPerformance,
    ] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.user.count({ where: { active: true } }),
      this.prisma.course.count(),
      this.prisma.course.count({ where: { status: 'PUBLISHED' } }),
      this.prisma.enrollment.count(),
      this.prisma.enrollment.count({ where: { status: 'COMPLETED' } }),
      this.prisma.userPoints.aggregate({ _sum: { points: true } }),
      this.prisma.badgeAward.count(),
      this.prisma.learningPath.count(),
      this.prisma.developmentPlan.count(),
      this.prisma.developmentPlan.count({ where: { status: 'ACTIVE' } }),
      this.prisma.performanceReview.aggregate({ _avg: { score: true } }),
    ]);

    const completionRate = totalEnrollments > 0
      ? Math.round((completedEnrollments / totalEnrollments) * 100) : 0;

    const pdiAdoptionRate = activeUsers > 0
      ? Math.round((activePDIs / activeUsers) * 100) : 0;

    return {
      users:       { total: totalUsers, active: activeUsers },
      courses:     { total: totalCourses, published: publishedCourses },
      enrollments: { total: totalEnrollments, completed: completedEnrollments, completionRate },
      pdi:         { total: totalPDIs, active: activePDIs, adoptionRate: pdiAdoptionRate },
      engagement: {
        totalXp:   totalPoints._sum.points ?? 0,
        totalBadges,
        totalLearningPaths,
      },
      performance: {
        avgScore: Math.round((avgPerformance._avg.score ?? 0) * 10) / 10,
      },
    };
  }

  async getCollaboratorDashboard(userId: number) {
    const [
      myEnrollments,
      myPDI,
      myPoints,
      myBadges,
      myStreak,
      myCompetencies,
      myAssessments,
    ] = await Promise.all([
      this.prisma.enrollment.findMany({
        where:   { userId },
        include: { course: { select: { id: true, title: true, workloadHours: true } } },
        orderBy: { enrolledAt: 'desc' },
      }),
      this.prisma.developmentPlan.findMany({
        where:   { userId, status: { in: ['ACTIVE', 'PENDING_APPROVAL'] } },
        include: { actions: { select: { status: true, dueDate: true } }, goals: { select: { progress: true } } },
      }),
      this.prisma.userPoints.findUnique({ where: { userId } }),
      this.prisma.badgeAward.count({ where: { userId } }),
      this.prisma.learningStreak.findUnique({ where: { userId } }),
      this.prisma.userCompetency.findMany({
        where:   { userId },
        include: { competency: { select: { name: true, category: true } } },
        orderBy: { currentLevel: 'desc' },
        take:    8,
      }),
      this.prisma.assessmentAttempt.findMany({
        where:   { userId, status: { in: ['PASSED', 'FAILED'] } },
        include: { assessment: { select: { title: true } } },
        orderBy: { startedAt: 'desc' },
        take:    5,
      }),
    ]);

    const completed  = myEnrollments.filter(e => e.status === 'COMPLETED').length;
    const inProgress = myEnrollments.filter(e => e.status === 'IN_PROGRESS' || e.status === 'NOT_STARTED').length;
    const totalHours = myEnrollments
      .filter(e => e.status === 'COMPLETED')
      .reduce((s, e) => s + (e.course.workloadHours ?? 0), 0);

    const pdiProgress = myPDI.map(p => {
      const actions    = p.actions as any[];
      const completed_a= actions.filter(a => a.status === 'COMPLETED').length;
      const overdue    = actions.filter(a => a.dueDate && new Date(a.dueDate) < new Date() && a.status !== 'COMPLETED').length;
      const goals      = p.goals as any[];
      const avgGoal    = goals.length > 0 ? Math.round(goals.reduce((s: number, g: any) => s + g.progress, 0) / goals.length) : 0;
      return { id: p.id, name: (p as any).name, status: p.status, actionsDone: completed_a, actionsTotal: actions.length, avgGoal, overdueActions: overdue };
    });

    return {
      learning: { completed, inProgress, totalHours, totalCourses: myEnrollments.length },
      xp:       { total: myPoints?.points ?? 0, badges: myBadges },
      streak:   { current: (myStreak as any)?.currentStreak ?? 0, longest: (myStreak as any)?.longestStreak ?? 0 },
      pdi:      pdiProgress,
      competencies: myCompetencies.map(c => ({
        name:         (c.competency as any).name,
        category:     (c.competency as any).category,
        currentLevel: c.currentLevel,
        targetLevel:  c.targetLevel,
      })),
      recentAssessments: myAssessments,
    };
  }

  async getManagerDashboard(managerId: number) {
    const team = await this.prisma.user.findMany({
      where:  { managerId, active: true },
      select: {
        id: true, fullName: true, avatarUrl: true,
        position:   { select: { name: true } },
        department: { select: { name: true } },
      },
    });
    const teamIds = team.map(u => u.id);
    if (!teamIds.length) return { team: [], metrics: {}, alerts: [] };

    const [
      enrollments, completions, activePDIs, avgPerf,
      overdueActions, competencyGaps, nineBoxData,
    ] = await Promise.all([
      this.prisma.enrollment.count({ where: { userId: { in: teamIds } } }),
      this.prisma.enrollment.count({ where: { userId: { in: teamIds }, status: 'COMPLETED' } }),
      this.prisma.developmentPlan.count({ where: { userId: { in: teamIds }, status: 'ACTIVE' } }),
      this.prisma.performanceReview.aggregate({
        where: { userId: { in: teamIds } }, _avg: { score: true },
      }),
      this.prisma.developmentPlanAction.count({
        where: {
          plan:    { userId: { in: teamIds } },
          status:  { not: 'COMPLETED' },
          dueDate: { lt: new Date() },
        },
      }),
      this.prisma.userCompetency.findMany({
        where:   { userId: { in: teamIds }, targetLevel: { not: null } },
        include: { competency: { select: { name: true } } },
      }),
      this.prisma.nineBoxPlacement.findMany({
        where:   { userId: { in: teamIds } },
        include: { user: { select: { id: true, fullName: true, avatarUrl: true } } },
      }),
    ]);

    const gapMap: Record<string, { name: string; totalGap: number; count: number }> = {};
    for (const uc of competencyGaps) {
      const gap = (uc.targetLevel ?? 0) - uc.currentLevel;
      if (gap <= 0) continue;
      const key = (uc.competency as any).name;
      if (!gapMap[key]) gapMap[key] = { name: key, totalGap: 0, count: 0 };
      gapMap[key].totalGap += gap;
      gapMap[key].count++;
    }
    const topGaps = Object.values(gapMap)
      .map(g => ({ ...g, avgGap: +(g.totalGap / g.count).toFixed(1) }))
      .sort((a, b) => b.totalGap - a.totalGap)
      .slice(0, 5);

    const nineBox = nineBoxData.map(p => ({
      userId: p.userId,
      fullName: (p.user as any).fullName,
      avatarUrl: (p.user as any).avatarUrl,
      performanceAxis: p.performanceAxis,
      potentialAxis:   p.potentialAxis,
      quadrant:        `${p.performanceAxis}-${p.potentialAxis}`,
    }));

    const alerts: Array<{ type: string; message: string; userId?: number }> = [];
    if (overdueActions > 0) alerts.push({ type: 'OVERDUE_ACTIONS', message: `${overdueActions} acções de PDI atrasadas na equipa` });
    if (completions / Math.max(enrollments, 1) < 0.3) alerts.push({ type: 'LOW_COMPLETION', message: 'Taxa de conclusão de cursos abaixo de 30%' });

    return {
      team,
      metrics: {
        headcount:       teamIds.length,
        enrollments,
        completions,
        completionRate:  enrollments > 0 ? Math.round((completions / enrollments) * 100) : 0,
        activePDIs,
        pdiAdoptionRate: teamIds.length > 0 ? Math.round((activePDIs / teamIds.length) * 100) : 0,
        avgPerformance:  Math.round((avgPerf._avg.score ?? 0) * 10) / 10,
        overdueActions,
      },
      competencyGaps: topGaps,
      nineBox,
      alerts,
    };
  }

  async getHRDashboard(filters: AnalyticsFilterDto) {
    const { from, to } = this.getDateRange(filters.period, filters.fromDate, filters.toDate);
    const userWhere: any = { active: true };
    if (filters.departmentId) userWhere.departmentId = filters.departmentId;

    const [
      totalActive, hired, terminated,
      totalEnrollments, completed, abandoned,
      activePDIs, completedPDIs, pendingApprovalPDIs,
      avgPerformance, topDepts, learningPathStats,
    ] = await Promise.all([
      this.prisma.user.count({ where: userWhere }),
      this.prisma.user.count({ where: { ...userWhere, hireDate: { gte: from, lte: to } } }),
      this.prisma.user.count({ where: { active: false, exitDate: { gte: from, lte: to } } }),
      this.prisma.enrollment.count({ where: { user: userWhere, enrolledAt: { gte: from, lte: to } } }),
      this.prisma.enrollment.count({ where: { user: userWhere, status: 'COMPLETED', completedAt: { gte: from, lte: to } } }),
      this.prisma.enrollment.count({ where: { user: userWhere, status: 'CANCELLED', cancelledAt: { gte: from, lte: to } } }),
      this.prisma.developmentPlan.count({ where: { user: userWhere, status: 'ACTIVE' } }),
      this.prisma.developmentPlan.count({ where: { user: userWhere, status: 'COMPLETED', completedAt: { gte: from, lte: to } } }),
      this.prisma.developmentPlan.count({ where: { user: userWhere, status: 'PENDING_APPROVAL' } }),
      this.prisma.performanceReview.aggregate({ where: { user: userWhere }, _avg: { score: true } }),
      this.prisma.department.findMany({
        where:   { status: 'ACTIVE' },
        include: { _count: { select: { users: true } } },
        orderBy: { users: { _count: 'desc' } },
        take:    8,
      }),
      this.prisma.learningPathEnrollment.groupBy({
        by:    ['status'],
        _count:true,
      }),
    ]);

    const turnoverRate = totalActive > 0 ? Math.round((terminated / totalActive) * 100 * 10) / 10 : 0;
    const completionRate = totalEnrollments > 0 ? Math.round((completed / totalEnrollments) * 100) : 0;
    const abandonRate    = totalEnrollments > 0 ? Math.round((abandoned / totalEnrollments) * 100) : 0;

    const monthlyData = await this.prisma.$queryRaw<{ month: string; count: bigint }[]>`
      SELECT TO_CHAR("enrolledAt", 'YYYY-MM') as month, COUNT(*) as count
      FROM "Enrollment"
      WHERE "enrolledAt" >= NOW() - INTERVAL '6 months'
      GROUP BY month ORDER BY month ASC
    `;

    return {
      people: {
        total: totalActive, hired, terminated, turnoverRate,
      },
      learning: {
        enrollments: totalEnrollments, completed, abandoned,
        completionRate, abandonRate,
      },
      pdi: {
        active: activePDIs, completed: completedPDIs,
        pendingApproval: pendingApprovalPDIs,
        adoptionRate: totalActive > 0 ? Math.round((activePDIs / totalActive) * 100) : 0,
      },
      performance: {
        avgScore: Math.round((avgPerformance._avg.score ?? 0) * 10) / 10,
      },
      headcountByDept: topDepts.map(d => ({ id: d.id, name: d.name, count: d._count.users })),
      learningPathStats: Object.fromEntries(learningPathStats.map(s => [s.status, s._count])),
      monthlyEnrollments: monthlyData.map(r => ({ month: r.month, count: Number(r.count) })),
    };
  }

  async getLearningAnalytics(filters: AnalyticsFilterDto) {
    const { from, to } = this.getDateRange(filters.period, filters.fromDate, filters.toDate);
    const enrollWhere: any = { enrolledAt: { gte: from, lte: to } };
    if (filters.departmentId) enrollWhere.user = { departmentId: filters.departmentId };
    if (filters.courseId)     enrollWhere.courseId = filters.courseId;

    const [
      byStatus, topCourses, completionByCategory,
      avgAssessmentScore, certificationCount, monthlyEnrollments,
    ] = await Promise.all([
      this.prisma.enrollment.groupBy({
        by:    ['status'],
        where: enrollWhere,
        _count:true,
      }),
      this.prisma.courseAnalytics.findMany({
        include: { course: { select: { id: true, title: true, category: true, workloadHours: true } } },
        orderBy: { totalCompleted: 'desc' },
        take:    10,
      }),
      this.prisma.enrollment.groupBy({
        by:    ['courseId'],
        where: { status: 'COMPLETED' },
        _count:true,
        orderBy: { _count: { courseId: 'desc' } },
        take:  5,
      }),
      this.prisma.assessmentAttempt.aggregate({
        where: { status: 'PASSED' }, _avg: { score: true }, _count: true,
      }),
      this.prisma.certificate.count({ where: { issuedAt: { gte: from, lte: to } } }),
      this.prisma.$queryRaw<{ month: string; count: bigint }[]>`
        SELECT TO_CHAR("enrolledAt", 'YYYY-MM') as month, COUNT(*) as count
        FROM "Enrollment"
        WHERE "enrolledAt" >= NOW() - INTERVAL '12 months'
        GROUP BY month ORDER BY month ASC
      `,
    ]);

    const completedEnrollments = await this.prisma.enrollment.findMany({
      where:   { status: 'COMPLETED' },
      include: { course: { select: { workloadHours: true } } },
    });
    const totalHours = completedEnrollments.reduce((s, e) => s + ((e.course as any)?.workloadHours ?? 0), 0);

    return {
      byStatus: Object.fromEntries(byStatus.map(s => [s.status, s._count])),
      topCourses,
      avgAssessmentScore: Math.round((avgAssessmentScore._avg.score ?? 0) * 10) / 10,
      certificationCount,
      totalHoursConsumed: totalHours,
      monthlyEnrollments: monthlyEnrollments.map(r => ({ month: r.month, count: Number(r.count) })),
    };
  }

  async getPeopleAnalytics(filters: AnalyticsFilterDto) {
    const { from, to } = this.getDateRange(filters.period, filters.fromDate, filters.toDate);

    const [
      byDepartment, byPosition, hired, terminated,
      onLeave, genderDist,
    ] = await Promise.all([
      this.prisma.department.findMany({
        where:   { status: 'ACTIVE' },
        include: { _count: { select: { users: true } } },
        orderBy: { users: { _count: 'desc' } },
      }),
      this.prisma.position.findMany({
        include: { _count: { select: { users: true } } },
        orderBy: { users: { _count: 'desc' } },
        take:    10,
      }),
      this.prisma.user.count({ where: { hireDate: { gte: from, lte: to } } }),
      this.prisma.user.count({ where: { active: false, exitDate: { gte: from, lte: to } } }),
      this.prisma.user.count({ where: { hrStatus: 'ON_LEAVE' } }),
      this.prisma.user.groupBy({
        by:     ['gender'],
        where:  { active: true },
        _count: true,
      }),
    ]);

    const totalActive = await this.prisma.user.count({ where: { active: true } });
    const turnoverRate = totalActive > 0 ? Math.round((terminated / totalActive) * 100 * 10) / 10 : 0;

    return {
      headcount:     { total: totalActive, hired, terminated, onLeave, turnoverRate },
      byDepartment:  byDepartment.map(d => ({ id: d.id, name: d.name, count: d._count.users })),
      byPosition:    byPosition.map(p => ({ id: p.id, name: p.name, count: p._count.users })),
      diversity:     { gender: Object.fromEntries(genderDist.map(g => [g.gender ?? 'N/D', g._count])) },
    };
  }

  async getCompetencyGapAnalytics(filters: AnalyticsFilterDto) {
    const userWhere: any = {};
    if (filters.departmentId) userWhere.departmentId = filters.departmentId;

    const competencies = await this.prisma.userCompetency.findMany({
      where:   { user: Object.keys(userWhere).length ? userWhere : undefined, targetLevel: { not: null } },
      include: { competency: { select: { id: true, name: true, category: true } } },
    });

    const map: Record<string, { name: string; category: string; totalCurrent: number; totalTarget: number; count: number }> = {};

    for (const uc of competencies) {
      const key = String((uc.competency as any).id);
      if (!map[key]) map[key] = {
        name:         (uc.competency as any).name,
        category:     (uc.competency as any).category,
        totalCurrent: 0, totalTarget: 0, count: 0,
      };
      map[key].totalCurrent += uc.currentLevel;
      map[key].totalTarget  += uc.targetLevel ?? 0;
      map[key].count++;
    }

    return Object.values(map).map(c => ({
      name:       c.name,
      category:   c.category,
      avgCurrent: +(c.totalCurrent / c.count).toFixed(1),
      avgTarget:  +(c.totalTarget  / c.count).toFixed(1),
      gap:        +((c.totalTarget - c.totalCurrent) / c.count).toFixed(1),
      count:      c.count,
    })).sort((a, b) => b.gap - a.gap);
  }

  async getPDIAnalytics(filters: AnalyticsFilterDto) {
    const planWhere: any = {};
    if (filters.departmentId) planWhere.user = { departmentId: filters.departmentId };

    const [byStatus, avgProgress, overdueCount, completedThisMonth] = await Promise.all([
      this.prisma.developmentPlan.groupBy({
        by:    ['status'],
        where: planWhere,
        _count:true,
      }),
      this.prisma.developmentPlan.aggregate({
        where: { ...planWhere, status: 'ACTIVE' },
        _avg:  { overallProgress: true },
      }),
      // FIX: pdiAction → developmentPlanAction
      this.prisma.developmentPlanAction.count({
        where: {
          plan:    planWhere,
          status:  { not: 'COMPLETED' },
          dueDate: { lt: new Date() },
        },
      }),
      this.prisma.developmentPlan.count({
        where: { ...planWhere, status: 'COMPLETED', completedAt: { gte: new Date(new Date().setDate(1)) } },
      }),
    ]);

    // FIX: pdiAction → developmentPlanAction; add explicit types
    const actionStats = await this.prisma.developmentPlanAction.groupBy({
      by:    ['type'],
      where: { plan: planWhere },
      _count:true,
      orderBy: { _count: { type: 'desc' } },
    });

    return {
      byStatus:    Object.fromEntries(byStatus.map(s => [s.status, s._count])),
      avgProgress: Math.round((avgProgress._avg.overallProgress ?? 0) * 10) / 10,
      overdueActions: overdueCount,
      completedThisMonth,
      // FIX: explicit type annotation
      actionsByType: actionStats.map((a: any) => ({ type: a.type, count: a._count })),
    };
  }

  async getRiskAlerts(filters: AnalyticsFilterDto) {
    const userWhere: any = { active: true };
    if (filters.departmentId) userWhere.departmentId = filters.departmentId;

    const users = await this.prisma.user.findMany({
      where:  userWhere,
      select: { id: true, fullName: true, avatarUrl: true, department: { select: { name: true } } },
    });
    const userIds = users.map(u => u.id);

    const recentEnrollments = await this.prisma.enrollment.findMany({
      where:  { userId: { in: userIds }, enrolledAt: { gte: new Date(Date.now() - 60 * 24 * 3600 * 1000) } },
      select: { userId: true },
      distinct:['userId'],
    });
    const recentIds = new Set(recentEnrollments.map(e => e.userId));
    const inactiveUsers = users.filter(u => !recentIds.has(u.id));

    const overduePDIs = await this.prisma.developmentPlan.findMany({
      where: { userId: { in: userIds }, status: 'ACTIVE', endDate: { lt: new Date() } },
      include: { user: { select: { id: true, fullName: true, avatarUrl: true } } },
      take:  20,
    });

    // FIX: pdiAction → developmentPlanAction; explicit type in map
    const criticalActions = await this.prisma.developmentPlanAction.findMany({
      where: {
        plan:    { userId: { in: userIds }, status: 'ACTIVE' },
        status:  { not: 'COMPLETED' },
        dueDate: { lt: new Date(Date.now() - 14 * 24 * 3600 * 1000) },
      },
      include: { plan: { include: { user: { select: { id: true, fullName: true } } } } },
      take:    20,
    });

    return {
      inactiveCollaborators: inactiveUsers.slice(0, 20),
      overduePDIs: overduePDIs.map(p => ({
        planId:   p.id,
        planName: (p as any).name,
        user:     (p as any).user,
        endDate:  p.endDate,
        daysOverdue: p.endDate ? Math.floor((Date.now() - new Date(p.endDate).getTime()) / (1000 * 60 * 60 * 24)) : 0,
      })),
      // FIX: explicit type
      criticalActions: criticalActions.map((a: any) => ({
        actionId:   a.id,
        actionTitle:a.title,
        user:       (a.plan as any).user,
        dueDate:    a.dueDate,
        daysOverdue:a.dueDate ? Math.floor((Date.now() - new Date(a.dueDate).getTime()) / (1000 * 60 * 60 * 24)) : 0,
      })),
      summary: {
        inactiveCount:      inactiveUsers.length,
        overduePDICount:    overduePDIs.length,
        criticalActionCount:criticalActions.length,
      },
    };
  }

  async getCoursePerformance(courseId?: number) {
    const where: any = {};
    if (courseId) where.courseId = courseId;

    const [analytics, feedbackStats, assessmentStats] = await Promise.all([
      this.prisma.courseAnalytics.findMany({
        where,
        include: { course: { select: { id: true, title: true, category: true, workloadHours: true, level: true } } },
        orderBy: { totalCompleted: 'desc' },
        take:    courseId ? 1 : 20,
      }),
      courseId ? this.prisma.courseFeedback.aggregate({
        where: { courseId }, _avg: { rating: true }, _count: true,
      }) : null,
      courseId ? this.prisma.assessmentAttempt.aggregate({
        where: { assessment: { courseId } },
        _avg:  { score: true }, _count: true,
      }) : null,
    ]);

    return { analytics, feedbackStats, assessmentStats };
  }

  async getDepartmentAnalytics(departmentId: number) {
    const [users, completions, avgPerf, competencies, activePDIs] = await Promise.all([
      this.prisma.user.count({ where: { departmentId, active: true } }),
      this.prisma.enrollment.count({ where: { status: 'COMPLETED', user: { departmentId } } }),
      this.prisma.performanceReview.aggregate({ where: { user: { departmentId } }, _avg: { score: true } }),
      this.prisma.userCompetency.findMany({
        where:   { user: { departmentId } },
        include: { competency: { select: { name: true, category: true } } },
      }),
      this.prisma.developmentPlan.count({ where: { user: { departmentId }, status: 'ACTIVE' } }),
    ]);

    const compMap: Record<string, { name: string; category: string; count: number; totalLevel: number }> = {};
    for (const uc of competencies) {
      const key = (uc.competency as any).name;
      if (!compMap[key]) compMap[key] = { name: key, category: (uc.competency as any).category, count: 0, totalLevel: 0 };
      compMap[key].count++;
      compMap[key].totalLevel += uc.currentLevel;
    }
    const topCompetencies = Object.values(compMap)
      .map(c => ({ ...c, avgLevel: +(c.totalLevel / c.count).toFixed(1) }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 6);

    return {
      departmentId,
      headcount:           users,
      completedCourses:    completions,
      avgPerformanceScore: Math.round((avgPerf._avg.score ?? 0) * 10) / 10,
      activePDIs,
      pdiAdoptionRate:     users > 0 ? Math.round((activePDIs / users) * 100) : 0,
      topCompetencies,
    };
  }

  async getEngagementMetrics(filters: AnalyticsFilterDto) {
    const userWhere: any = { active: true };
    if (filters.departmentId) userWhere.departmentId = filters.departmentId;

    const users  = await this.prisma.user.findMany({ where: userWhere, select: { id: true } });
    const userIds= users.map(u => u.id);

    const [activeIn30d, knowledgeInteractions, aiSessions, microProgress, leaderboard] = await Promise.all([
      this.prisma.enrollment.findMany({
        where:   { userId: { in: userIds }, enrolledAt: { gte: new Date(Date.now() - 30 * 24 * 3600 * 1000) } },
        select:  { userId: true },
        distinct:['userId'],
      }),
      this.prisma.knowledgeInteraction.count({ where: { userId: { in: userIds } } }),
      this.prisma.aiTutorSession.count({ where: { userId: { in: userIds } } }),
      this.prisma.microLearningProgress.count({ where: { userId: { in: userIds }, progress: { gte: 1 } } }),
      this.prisma.userPoints.findMany({
        where:   { userId: { in: userIds } },
        orderBy: { points: 'desc' },
        take:    10,
        include: { user: { select: { id: true, fullName: true, avatarUrl: true } } },
      }),
    ]);

    return {
      totalUsers:          userIds.length,
      activeUsersLast30d:  activeIn30d.length,
      engagementRate:      userIds.length > 0 ? Math.round((activeIn30d.length / userIds.length) * 100) : 0,
      knowledgeInteractions,
      aiTutorSessions:     aiSessions,
      microLearningAccess: microProgress,
      leaderboard:         leaderboard.map(u => ({
        userId:   u.userId,
        fullName: (u.user as any).fullName,
        avatarUrl:(u.user as any).avatarUrl,
        points:   u.points,
      })),
    };
  }

  async getTrainingROI() {
    const [impacts, courseAnalytics, totalCerts] = await Promise.all([
      this.prisma.trainingImpact.findMany({ orderBy: { calculatedAt: 'desc' }, take: 20 }),
      this.prisma.courseAnalytics.findMany({
        include: { course: { select: { id: true, title: true, workloadHours: true } } },
      }),
      this.prisma.certificate.count(),
    ]);

    const totalHours  = courseAnalytics.reduce((s, ca) => s + ((ca.course as any).workloadHours ?? 0) * ca.totalCompleted, 0);
    const totalCompleted = courseAnalytics.reduce((s, ca) => s + ca.totalCompleted, 0);

    return { impacts, totalHoursInvested: totalHours, totalCompletions: totalCompleted, totalCertificates: totalCerts };
  }

  async generateDashboardSnapshot(departmentId?: number) {
    const where: any = {};
    if (departmentId) where.departmentId = departmentId;

    const [totalUsers, completions, avgScore, activePlans] = await Promise.all([
      this.prisma.user.count({ where: { active: true, ...where } }),
      this.prisma.enrollment.count({ where: { status: 'COMPLETED', user: where } }),
      this.prisma.performanceReview.aggregate({ where: { user: where }, _avg: { score: true } }),
      this.prisma.developmentPlan.count({ where: { status: 'ACTIVE', user: where } }),
    ]);

    return this.prisma.dashboardSnapshot.create({
      data: {
        departmentId,
        totalUsers,
        totalCoursesCompleted: completions,
        averageScore:          avgScore._avg.score ?? 0,
        activePlans,
      },
    });
  }

  async getSnapshots(departmentId?: number) {
    return this.prisma.dashboardSnapshot.findMany({
      where:   departmentId ? { departmentId } : {},
      include: { department: { select: { id: true, name: true } } },
      orderBy: { generatedAt: 'desc' },
      take:    30,
    });
  }
}