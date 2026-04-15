import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class TalentDevelopmentService {
  constructor(private prisma: PrismaService) {}

  async getTalentPool() {
    const users = await this.prisma.user.findMany({
      where:   { active: true },
      include: {
        performanceReviews: { orderBy: { createdAt: 'desc' }, take: 1 },
        // ← corrigido: include competency para ter acesso a .name; currentLevel em vez de level
        userCompetencies:   { include: { competency: true } },
        points:             true,
        position:           true,
        department:         true,
      },
    });

    return users.map(u => {
      // ← corrigido: c.level → c.currentLevel (campo real do schema)
      const avgCompetency = u.userCompetencies.length
        ? u.userCompetencies.reduce((s: number, c) => s + (c.currentLevel ?? 0), 0) / u.userCompetencies.length
        : 0;

      const lastReview      = u.performanceReviews[0];
      const performanceScore = lastReview?.score ?? 0;
      const points           = u.points?.points ?? 0;

      const talentScore = +(
        avgCompetency * 0.4 +
        performanceScore * 0.4 +
        Math.min(points / 100, 5) * 0.2
      ).toFixed(2);

      return {
        user: {
          id:         u.id,
          fullName:   u.fullName,
          position:   u.position,   // ← válido: incluído acima
          department: u.department, // ← válido: incluído acima
        },
        avgCompetency:   +avgCompetency.toFixed(1),
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
    const pool   = await this.getTalentPool();
    const matrix = {
      stars:          [] as any[],
      highPerformers: [] as any[],
      potentials:     [] as any[],
      developing:     [] as any[],
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
    return this.prisma.successionPlan.findMany({
      where:   { positionId },
      include: {
        candidate: { select: { id: true, fullName: true, position: true } },
        position:  true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getTrainingNeeds(departmentId?: number) {
    const where: any = {};
    if (departmentId) where.user = { departmentId };

    // ← corrigido: level → currentLevel; include competency e user para ter acesso aos campos
    const gaps = await this.prisma.userCompetency.findMany({
      where,
      select: {
        currentLevel: true, // ← corrigido: level → currentLevel
        competency:   true,
        user:         { select: { id: true, fullName: true, department: true } },
      },
    });

    const TARGET_LEVEL = 5;
    const withGap      = gaps.filter(g => TARGET_LEVEL > g.currentLevel); // ← corrigido
    const byCompetency: Record<string, any> = {};

    for (const g of withGap) {
      const cname = g.competency.name; // ← válido: competency incluído via select: true
      if (!byCompetency[cname]) {
        byCompetency[cname] = {
          competency: g.competency,
          users:      [],
          avgGap:     0,
          totalGap:   0,
          count:      0,
        };
      }
      byCompetency[cname].users.push(g.user);                              // ← válido
      byCompetency[cname].totalGap += TARGET_LEVEL - g.currentLevel;       // ← corrigido
      byCompetency[cname].count++;
    }

    return Object.values(byCompetency)
      .map(c => ({ ...c, avgGap: +(c.totalGap / c.count).toFixed(1) }))
      .sort((a, b) => b.avgGap - a.avgGap);
  }
}