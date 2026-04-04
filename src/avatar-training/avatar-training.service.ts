import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AvatarTrainingService {
  constructor(private prisma: PrismaService) {}

  async getScenarios(competencyId?: number) {
    const where: any = { active: true };
    if (competencyId) where.competencyId = competencyId;
    return this.prisma.avatarScenario.findMany({
      where,
      include: { competency: { select: { id: true, name: true } } },
      orderBy: { difficulty: 'asc' },
    });
  }

  async startSession(userId: number, scenarioId: number) {
    return this.prisma.avatarSession.create({
      data: { userId, scenarioId, status: 'IN_PROGRESS', startedAt: new Date() },
      include: { scenario: { include: { competency: true } } },
    });
  }

  async completeSession(sessionId: number, score: number, feedback: string) {
    const session = await this.prisma.avatarSession.update({
      where: { id: sessionId },
      data: { status: 'COMPLETED', completedAt: new Date(), score, feedback },
      include: { scenario: true },
    });
    if (score >= 70) {
      const pts = Math.round(score / 10);
      // FIX: campo correcto é 'points', não 'total'
      await this.prisma.userPoints.upsert({
        where:  { userId: session.userId },
        create: { userId: session.userId, points: pts },
        update: { points: { increment: pts } },
      });
    }
    return session;
  }

  async getMyHistory(userId: number) {
    return this.prisma.avatarSession.findMany({
      where: { userId },
      include: { scenario: { include: { competency: true } } },
      orderBy: { startedAt: 'desc' },
      take: 20,
    });
  }

  async getLeaderboard(scenarioId: number) {
    return this.prisma.avatarSession.findMany({
      where: { scenarioId, status: 'COMPLETED' },
      include: { user: { select: { id: true, fullName: true } } },
      orderBy: { score: 'desc' },
      take: 10,
    });
  }
}