// src/talent-development/talent-development.service.ts
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

// Schema corrections applied:
// - User relation 'competencies' → 'userCompetencies'
// - User relation 'performanceReviews' → 'performance'
// - UserCompetency has 'level' only (no targetLevel/currentLevel)
// - PerformanceReview field is 'score', not 'overallScore'
// - UserPoints has 'points', not 'total'
// - prisma.successionCandidate does not exist → using SuccessionPlan (has positionId + candidateId)
// - SuccessionPlan has no readinessScore → ordering by createdAt desc

@Injectable()
export class TalentDevelopmentService {
  constructor(private prisma: PrismaService) {}

  async getTalentPool() {
    const users = await this.prisma.user.findMany({
      where: { active: true },
      include: {
        userCompetencies: { include: { competency: true } },
        points: true,
        position: true,
        department: true,
        // correct relation name is 'performance'
        performance: { orderBy: { createdAt: 'desc' }, take: 1 },
      },
    });

    return users.map(u => {
      // UserCompetency has 'level', not 'currentLevel'
      const avgCompetency = u.userCompetencies.length
        ? u.userCompetencies.reduce((s, c) => s + c.level, 0) / u.userCompetencies.length
        : 0;

      // PerformanceReview field is 'score', not 'overallScore'
      const lastReview = u.performance[0];
      const performanceScore = lastReview?.score ?? 0;

      // UserPoints field is 'points', not 'total'
      const points = u.points?.points ?? 0;

      const talentScore = +(
        avgCompetency * 0.4 +
        performanceScore * 0.4 +
        Math.min(points / 100, 5) * 0.2
      ).toFixed(2);

      return {
        user: {
          id: u.id,
          fullName: u.fullName,
          position: u.position,
          department: u.department,
        },
        avgCompetency: +avgCompetency.toFixed(1),
        performanceScore,
        engagementPoints: points,
        talentScore,
        tier: talentScore >= 4 ? 'HIGH' : talentScore >= 2.5 ? 'MEDIUM' : 'DEVELOPING',
      };
    }).sort((a, b) => b.talentScore - a.talentScore);
  }

  async getHighPotentials(limit = 20) {
    const pool = await this.getTalentPool();
    return pool.filter(u => u.tier === 'HIGH').slice(0, limit);
  }

  async getTalentMatrix() {
    const pool = await this.getTalentPool();
    const matrix = {
      stars:           [] as any[],
      highPerformers:  [] as any[],
      potentials:      [] as any[],
      developing:      [] as any[],
    };

    for (const t of pool) {
      if      (t.performanceScore >= 4 && t.avgCompetency >= 4) matrix.stars.push(t);
      else if (t.performanceScore >= 4)                         matrix.highPerformers.push(t);
      else if (t.avgCompetency >= 4)                            matrix.potentials.push(t);
      else                                                      matrix.developing.push(t);
    }

    return {
      matrix,
      totals: {
        stars:          matrix.stars.length,
        highPerformers: matrix.highPerformers.length,
        potentials:     matrix.potentials.length,
        developing:     matrix.developing.length,
      },
    };
  }

  async getSuccessionCandidates(positionId: number) {
    // successionCandidate does not exist → using SuccessionPlan
    // SuccessionPlan: { id, positionId, candidateId, readiness, createdAt }
    return this.prisma.successionPlan.findMany({
      where: { positionId },
      include: {
        candidate: {
          select: { id: true, fullName: true, position: true },
        },
        position: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getTrainingNeeds(departmentId?: number) {
    const where: any = {};
    if (departmentId) where.user = { departmentId };

    const gaps = await this.prisma.userCompetency.findMany({
      where,
      include: {
        competency: true,
        user: { select: { id: true, fullName: true, department: true } },
      },
    });

    // UserCompetency has only 'level'; gap is computed against TARGET_LEVEL = 5
    const TARGET_LEVEL = 5;
    const withGap = gaps.filter(g => TARGET_LEVEL > g.level);
    const byCompetency: Record<string, any> = {};

    for (const g of withGap) {
      const cname = g.competency.name;
      if (!byCompetency[cname]) {
        byCompetency[cname] = {
          competency: g.competency,
          users:      [],
          avgGap:     0,
          totalGap:   0,
          count:      0,
        };
      }
      byCompetency[cname].users.push(g.user);
      byCompetency[cname].totalGap += TARGET_LEVEL - g.level;
      byCompetency[cname].count++;
    }

    return Object.values(byCompetency)
      .map(c => ({ ...c, avgGap: +(c.totalGap / c.count).toFixed(1) }))
      .sort((a, b) => b.avgGap - a.avgGap);
  }
}