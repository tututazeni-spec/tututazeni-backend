// src/roi-impact/roi-impact.service.ts
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

// NOTE: The following models do not exist in the schema:
// - assessmentResult  → using AssessmentAttempt (has 'score' field)
// - surveyResponse    → no equivalent; engagement lift removed
// Schema corrections applied:
// - EnrollmentStatus: 'COMPLETED' → 'CONCLUIDO'
// - Enrollment has no 'completedAt' or 'totalTimeMin' fields
// - PerformanceReview field is 'score', not 'overallScore'
// - UserCompetency has 'level', not 'currentLevel'
// - User has no 'hireDate' field → using 'createdAt' as proxy for new hires

@Injectable()
export class RoiImpactService {
  constructor(private prisma: PrismaService) {}

  async calculateTrainingRoi(from: string, to: string) {
    const fromDate = new Date(from);
    const toDate   = new Date(to);

    const [enrollments, completed, avgScore] = await Promise.all([
      this.prisma.enrollment.count({
        where: { enrolledAt: { gte: fromDate, lte: toDate } },
      }),
      // EnrollmentStatus enum: EM_ANDAMENTO | CONCLUIDO | CANCELADO
      this.prisma.enrollment.count({
        where: {
          status: 'CONCLUIDO',
          enrolledAt: { gte: fromDate, lte: toDate },
        },
      }),
      // AssessmentAttempt is the closest model with a 'score' field
      this.prisma.assessmentAttempt.aggregate({
        where: { createdAt: { gte: fromDate, lte: toDate } },
        _avg: { score: true },
      }),
    ]);

    const completionRate = enrollments > 0
      ? Math.round((completed / enrollments) * 100) : 0;
    const avgKnowledgeGain = avgScore._avg.score ?? 0;

    const estimatedBenefitPerCompletion = 500;
    const estimatedCostPerEnrollment    = 200;
    const totalBenefit = completed   * estimatedBenefitPerCompletion;
    const totalCost    = enrollments * estimatedCostPerEnrollment;
    const roi = totalCost > 0
      ? +(((totalBenefit - totalCost) / totalCost) * 100).toFixed(1) : 0;

    return {
      period: { from, to },
      volume: { enrollments, completed, completionRate },
      quality: {
        avgKnowledgeGain: +avgKnowledgeGain.toFixed(1),
      },
      financial: {
        estimatedBenefit: totalBenefit,
        estimatedCost:    totalCost,
        roi,
        roiLabel: roi >= 0 ? 'POSITIVE' : 'NEGATIVE',
      },
    };
  }

  async getImpactMetrics() {
    const [
      totalCompletions,
      avgPerformanceScore,
      highPotentialCount,
      newHiresThisYear,
      totalLearningMinutes,
    ] = await Promise.all([
      // EnrollmentStatus: CONCLUIDO
      this.prisma.enrollment.count({
        where: { status: 'CONCLUIDO' },
      }),

      // PerformanceReview field is 'score', not 'overallScore'
      this.prisma.performanceReview.aggregate({
        _avg: { score: true },
      }),

      // UserCompetency has 'level', not 'currentLevel'
      // Count users whose average competency level >= 4
      this.prisma.userCompetency.groupBy({
        by: ['userId'],
        having: { level: { _avg: { gte: 4 } } },
      }),

      // User has no 'hireDate' — using createdAt as proxy for new hires
      this.prisma.user.count({
        where: {
          createdAt: { gte: new Date(new Date().getFullYear(), 0, 1) },
          active: true,
        },
      }),

      // Enrollment has no totalTimeMin — estimate from completed lesson progresses
      this.prisma.lessonProgress.count({
        where: { completed: true },
      }),
    ]);

    return {
      learning: {
        completions: totalCompletions,
        // Each completed lesson estimated at ~15 min average
        totalHours: Math.round((totalLearningMinutes * 15) / 60),
      },
      performance: {
        // Correct field: 'score'
        avgScore: +(avgPerformanceScore._avg.score ?? 0).toFixed(2),
      },
      talent: {
        highPotentials: highPotentialCount.length,
      },
      growth: {
        newHiresThisYear,
      },
    };
  }
}