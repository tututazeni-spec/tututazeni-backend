// src/dashboard/dashboard.service.ts
// Schema corrections:
// - EnrollmentStatus: 'IN_PROGRESS' → 'EM_ANDAMENTO', 'COMPLETED' → 'CONCLUIDO'
// - Assessment has no 'enrollments' relation → using AssessmentAttempt
// - CareerPlan belongs to Employee (not User) and has no 'userId' or 'goals'
// - Attendance belongs to Employee (not User) → no userId on Attendance
// - User has no 'staffProfile' relation
// - leaveRequest, workDeclaration, surveyResponse models don't exist
// - Enrollment has no 'completedAt' field

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class DashboardService {
  constructor(private prisma: PrismaService) {}

  async getMyDashboard(userId: number) {
    const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);

    const [
      user, enrollments, completedCourses,
      points, recentBadges, pendingAssessments,
      developmentPlan,
    ] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: userId },
        include: { position: true, department: true, points: true },
      }),
      // EnrollmentStatus: EM_ANDAMENTO (not IN_PROGRESS)
      this.prisma.enrollment.count({ where: { userId, status: 'EM_ANDAMENTO' } }),
      // EnrollmentStatus: CONCLUIDO (not COMPLETED)
      this.prisma.enrollment.count({ where: { userId, status: 'CONCLUIDO' } }),
      this.prisma.userPoints.findUnique({ where: { userId } }),
      this.prisma.badgeAward.findMany({
        where: { userId },
        include: { badge: true },
        orderBy: { awardedAt: 'desc' },
        take: 5,
      }),
      // Assessment has no 'enrollments' relation → count via AssessmentAttempt
      this.prisma.assessmentAttempt.count({
        where: { userId, passed: false },
      }),
      // CareerPlan belongs to Employee, not User → use DevelopmentPlan instead
      this.prisma.developmentPlan.findFirst({
        where: { userId, status: { in: ['ACTIVE', 'DRAFT'] } },
      }),
    ]);

    return {
      user: {
        id:         user?.id,
        fullName:   user?.fullName,
        position:   user?.position,
        department: user?.department,
      },
      learning: {
        inProgress:         enrollments,
        completed:          completedCourses,
        pendingAssessments,
      },
      gamification: {
        // UserPoints has 'points' field, not 'total' or 'level'
        totalPoints: points?.points ?? 0,
        recentBadges,
      },
      career: {
        plan: developmentPlan
          ? { id: developmentPlan.id, goal: developmentPlan.goal, status: developmentPlan.status }
          : null,
      },
    };
  }

  async getManagerDashboard(userId: number) {
    const user = await this.prisma.user.findUnique({
      where:  { id: userId },
      select: { departmentId: true },
    });
    const departmentId = user?.departmentId;

    const [teamSize, activeEnrollments, completedEnrollments] = await Promise.all([
      this.prisma.user.count({ where: { departmentId: departmentId ?? undefined, active: true } }),
      this.prisma.enrollment.count({
        where: { user: { departmentId: departmentId ?? undefined }, status: 'EM_ANDAMENTO' },
      }),
      this.prisma.enrollment.count({
        where: { user: { departmentId: departmentId ?? undefined }, status: 'CONCLUIDO' },
      }),
    ]);

    // leaveRequest and workDeclaration don't exist → count from HistoryRecord
    const [pendingLeaves, pendingDeclarations] = await Promise.all([
      this.prisma.historyRecord.count({
        where: { action: 'LEAVE_REQUEST', description: { contains: '"status":"PENDING"' } },
      }),
      this.prisma.historyRecord.count({
        where: { action: 'WORK_DECLARATION', description: { contains: '"status":"PENDING"' } },
      }),
    ]);

    return {
      team:    { size: teamSize, activeEnrollments, completedEnrollments },
      pending: { leaves: pendingLeaves, declarations: pendingDeclarations },
    };
  }

  async getOrganizationSummary() {
    const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);

    const [totalUsers, activeUsers, coursesTotal, enrollmentsThisMonth, completionsThisMonth] =
      await Promise.all([
        this.prisma.user.count(),
        this.prisma.user.count({ where: { active: true } }),
        this.prisma.course.count({ where: { active: true } }),
        this.prisma.enrollment.count({ where: { enrolledAt: { gte: monthStart } } }),
        // Enrollment has no completedAt field → count CONCLUIDO enrollments from this month by enrolledAt
        this.prisma.enrollment.count({
          where: { status: 'CONCLUIDO', enrolledAt: { gte: monthStart } },
        }),
      ]);

    return {
      users:   { total: totalUsers, active: activeUsers },
      courses: { total: coursesTotal, enrollmentsThisMonth, completionsThisMonth },
      timestamp: new Date(),
    };
  }

  async getExecutiveDashboard() {
    return this.getOrganizationSummary();
  }

  async getDepartmentDashboard(departmentId: number) {
    const [users, enrollments, completions, avgScore] = await Promise.all([
      this.prisma.user.count({ where: { departmentId, active: true } }),
      this.prisma.enrollment.count({ where: { user: { departmentId }, status: 'EM_ANDAMENTO' } }),
      this.prisma.enrollment.count({ where: { user: { departmentId }, status: 'CONCLUIDO' } }),
      this.prisma.performanceReview.aggregate({
        where: { user: { departmentId } },
        _avg: { score: true },
      }),
    ]);
    return {
      departmentId,
      users,
      enrollments,
      completions,
      avgPerformanceScore: +(avgScore._avg.score ?? 0).toFixed(2),
    };
  }

  async listSnapshots() {
    return this.prisma.dashboardSnapshot.findMany({
      orderBy: { generatedAt: 'desc' },
      take: 12,
    });
  }
}