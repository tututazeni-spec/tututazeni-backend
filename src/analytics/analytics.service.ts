import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AnalyticsFilterDto } from './analytics.dto';

@Injectable()
export class AnalyticsService {
  constructor(private prisma: PrismaService) {}

  // ─── OVERVIEW GERAL ──────────────────────────────────────────────────────

  async getOrganizationOverview() {
    const [
      totalUsers, activeUsers, totalCourses, activeCourses,
      totalEnrollments, completedEnrollments, totalPoints,
      totalBadges, totalLearningPaths, activeMicroLearnings,
    ] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.course.count({ where: { status: 'ACTIVE' } }),
      this.prisma.course.count(),
      this.prisma.course.count({ where: { status: 'ACTIVE' } }),
      this.prisma.enrollment.count(),
      this.prisma.enrollment.count({ where: { status: 'CONCLUIDO' } }),
      this.prisma.userPoints.aggregate({ _sum: { points: true } }),
      this.prisma.badgeAward.count(),
      this.prisma.learningPath.count(),
      this.prisma.microLearning.count({ where: { status: 'ACTIVE' } }),
    ]);

    const completionRate = totalEnrollments > 0
      ? Math.round((completedEnrollments / totalEnrollments) * 100) : 0;

    return {
      users:       { total: totalUsers, active: activeUsers },
      courses:     { total: totalCourses, active: activeCourses },
      enrollments: { total: totalEnrollments, completed: completedEnrollments, completionRate },
      engagement:  {
        totalPoints: totalPoints._sum.points ?? 0,
        totalBadges, totalLearningPaths, activeMicroLearnings,
      },
    };
  }

  // ─── APRENDIZAGEM ─────────────────────────────────────────────────────────

  async getLearningAnalytics(filters: AnalyticsFilterDto) {
    const where: any = {};
    if (filters.departmentId) where.user = { departmentId: filters.departmentId };
    if (filters.unitId)       where.user = { ...where.user, unitId: filters.unitId };
    if (filters.courseId)     where.courseId = filters.courseId;

    const [enrollmentsByStatus, topCourses, avgScoreByDept, monthlyEnrollments] =
      await Promise.all([
        this.prisma.enrollment.groupBy({ by: ['status'], where, _count: true }),
        this.prisma.courseAnalytics.findMany({
          include: { course: { select: { id: true, title: true, category: true } } },
          orderBy: { totalCompleted: 'desc' },
          take: 10,
        }),
        this.prisma.performanceReview.groupBy({
          by:      ['createdAt'],
          _avg:    { score: true },
          orderBy: { createdAt: 'desc' },
          take:    6,
        }),
        this.prisma.$queryRaw<{ month: string; count: bigint }[]>`
          SELECT TO_CHAR("enrolledAt", 'YYYY-MM') as month, COUNT(*) as count
          FROM "Enrollment"
          WHERE "enrolledAt" >= NOW() - INTERVAL '12 months'
          GROUP BY month ORDER BY month ASC
        `,
      ]);

    return {
      enrollmentsByStatus,
      topCourses,
      performanceByPeriod: avgScoreByDept,
      monthlyEnrollments: monthlyEnrollments.map(r => ({
        month: r.month,
        count: Number(r.count),
      })),
    };
  }

  // ─── DEPARTAMENTO ─────────────────────────────────────────────────────────

  async getDepartmentAnalytics(departmentId: number) {
    const [users, completions, avgPerf, competencies] = await Promise.all([
      this.prisma.user.count({ where: { departmentId } }),
      this.prisma.enrollment.count({
        where: { status: 'CONCLUIDO', user: { departmentId } },
      }),
      this.prisma.performanceReview.aggregate({
        where: { user: { departmentId } },
        _avg:  { score: true },
      }),
      // ← corrigido: level → currentLevel, include explícito para competency
      this.prisma.userCompetency.findMany({
        where:  { user: { departmentId } },
        select: {
          currentLevel: true,
          competency:   { select: { name: true } },
        },
      }),
    ]);

    const compMap: Record<string, { name: string; count: number; avgLevel: number }> = {};
    for (const uc of competencies) {
      const key = uc.competency.name;
      if (!compMap[key]) compMap[key] = { name: key, count: 0, avgLevel: 0 };
      compMap[key].count++;
      compMap[key].avgLevel += uc.currentLevel; // ← corrigido: level → currentLevel
    }
    const topCompetencies = Object.values(compMap)
      .map(c => ({ ...c, avgLevel: c.count > 0 ? +(c.avgLevel / c.count).toFixed(2) : 0 }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    return {
      departmentId,
      totalUsers:          users,
      completedCourses:    completions,
      avgPerformanceScore: avgPerf._avg.score ?? 0,
      topCompetencies,
    };
  }

  // ─── ENGAJAMENTO ─────────────────────────────────────────────────────────

  async getEngagementMetrics(filters: AnalyticsFilterDto) {
    const userWhere: any = { active: true };
    if (filters.departmentId) userWhere.departmentId = filters.departmentId;
    if (filters.unitId)       userWhere.unitId       = filters.unitId;

    const users   = await this.prisma.user.findMany({ where: userWhere, select: { id: true } });
    const userIds = users.map(u => u.id);

    // ← corrigido: Promise.all tinha 4 promessas mas desestruturação esperava 5 (leaderboard era o 5.º)
    const [activeInLast30Days, knowledgeInteractions, aiSessions, leaderboard] =
      await Promise.all([
        this.prisma.enrollment.findMany({
          where: {
            userId:     { in: userIds },
            enrolledAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
          },
          select:   { userId: true },
          distinct: ['userId'],
        }),
        this.prisma.knowledgeInteraction.count({ where: { userId: { in: userIds } } }),
        this.prisma.aiTutorSession.count({ where: { userId: { in: userIds } } }),
        this.prisma.userPoints.findMany({
          where:   { userId: { in: userIds } },
          orderBy: { points: 'desc' },
          take:    5,
          include: { user: { select: { id: true, fullName: true } } },
        }),
      ]);

    const engagementRate = userIds.length > 0
      ? Math.round((activeInLast30Days.length / userIds.length) * 100) : 0;

    return {
      totalUsers:            userIds.length,
      activeUsersLast30Days: activeInLast30Days.length,
      engagementRate,
      knowledgeInteractions,
      aiTutorSessions: aiSessions,
      topUsers:        leaderboard,
    };
  }

  // ─── CURSOS ──────────────────────────────────────────────────────────────

  async getCoursePerformance(courseId?: number) {
    const where: any = {};
    if (courseId) where.courseId = courseId;

    const [analytics, feedbackStats, assessmentStats] = await Promise.all([
      this.prisma.courseAnalytics.findMany({
        where,
        include: { course: { select: { id: true, title: true, category: true, workloadHours: true } } },
        orderBy: { totalCompleted: 'desc' },
        take:    courseId ? 1 : 20,
      }),
      courseId
        ? this.prisma.courseFeedback.aggregate({ where: { courseId }, _avg: { rating: true }, _count: true })
        : null,
      courseId
        ? this.prisma.assessmentAttempt.aggregate({ where: { assessment: { courseId } }, _avg: { score: true }, _count: true })
        : null,
    ]);

    return { analytics, feedbackStats, assessmentStats };
  }

  // ─── SNAPSHOT EXECUTIVO ──────────────────────────────────────────────────

  async generateDashboardSnapshot(departmentId?: number) {
    const where: any = {};
    if (departmentId) where.departmentId = departmentId;

    const [totalUsers, completions, avgScore] = await Promise.all([
      this.prisma.user.count({ where }),
      this.prisma.enrollment.count({ where: { status: 'CONCLUIDO', user: where } }),
      this.prisma.performanceReview.aggregate({ where: { user: where }, _avg: { score: true } }),
    ]);

    const activePlans = await this.prisma.developmentPlan.count({
      where: { status: 'ACTIVE', user: where },
    });

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
      include: { department: true },
      orderBy: { generatedAt: 'desc' },
      take:    30,
    });
  }

  // ─── ROI DE TREINAMENTO ──────────────────────────────────────────────────

  async getTrainingROI() {
    const impacts = await this.prisma.trainingImpact.findMany({
      orderBy: { calculatedAt: 'desc' },
      take:    20,
    });

    const courseAnalytics = await this.prisma.courseAnalytics.findMany({
      include: { course: { select: { id: true, title: true, workloadHours: true } } },
    });

    const totalHoursInvested = courseAnalytics.reduce(
      (acc, ca) => acc + (ca.course.workloadHours ?? 0) * ca.totalCompleted, 0
    );

    return {
      impacts,
      totalHoursInvested,
      totalCompletions: courseAnalytics.reduce((acc, ca) => acc + ca.totalCompleted, 0),
    };
  }
}