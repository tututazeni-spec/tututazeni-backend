import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateBadgeDto, AwardBadgeDto, AddPointsDto, LeaderboardFilterDto } from './gamification.dto';
 
@Injectable()
export class GamificationService {
  constructor(private prisma: PrismaService) {}
 
  // ─── BADGES ──────────────────────────────────────────────────────────────
 
  async findAllBadges() {
    return this.prisma.badge.findMany({
      include: { _count: { select: { awards: true } } },
      orderBy: { name: 'asc' },
    });
  }
 
  async createBadge(dto: CreateBadgeDto) {
    const exists = await this.prisma.badge.findUnique({ where: { name: dto.name } });
    if (exists) throw new ConflictException('Badge já existe');
    return this.prisma.badge.create({ data: dto });
  }
 
  async removeBadge(id: number) {
    return this.prisma.badge.delete({ where: { id } });
  }
 
  async awardBadge(dto: AwardBadgeDto) {
    const userPoints = await this.prisma.userPoints.findUnique({ where: { userId: dto.userId } });
    if (!userPoints) throw new NotFoundException('Utilizador sem registo de pontos');
 
    const award = await this.prisma.badgeAward.create({
      data: {
        userId:       dto.userId,
        badgeId:      dto.badgeId,
        userPointsId: userPoints.id,
      },
      include: { badge: true },
    });
 
    await this.prisma.notificationLog.create({
      data: {
        userId:  dto.userId,
        type:    'BADGE_AWARDED',
        message: `Parabéns! Recebeste o badge: ${award.badge.name}`,
        success: true,
      },
    });
 
    return award;
  }
 
  async getUserBadges(userId: number) {
    return this.prisma.badgeAward.findMany({
      where:   { userId },
      include: { badge: true },
      orderBy: { awardedAt: 'desc' },
    });
  }
 
  // ─── POINTS ──────────────────────────────────────────────────────────────
 
  async addPoints(dto: AddPointsDto) {
    const result = await this.prisma.userPoints.upsert({
      where:  { userId: dto.userId },
      create: { userId: dto.userId, points: dto.points },
      update: { points: { increment: dto.points } },
    });
 
    if (dto.reason) {
      await this.prisma.historyRecord.create({
        data: {
          userId:      dto.userId,
          action:      'POINTS_ADDED',
          entityType:  'UserPoints',
          description: `+${dto.points} pontos: ${dto.reason}`,
        },
      });
    }
 
    await this.checkMilestones(dto.userId, result.points);
    return result;
  }
 
  async getUserPoints(userId: number) {
    // ← corrigido: removido bloco `const userBadges` que estava dentro do `include` (sintaxe inválida).
    // Os badges são buscados separadamente via getUserBadges se necessário.
    return this.prisma.userPoints.findUnique({
      where:   { userId },
      include: { user: { select: { id: true, fullName: true } } },
    });
  }
 
  async getLeaderboard(filters: LeaderboardFilterDto) {
    const { limit = 20, unitId, departmentId } = filters;
    const userWhere: any = { active: true };
    if (unitId)       userWhere.unitId       = unitId;
    if (departmentId) userWhere.departmentId = departmentId;
 
    const users = await this.prisma.user.findMany({
      where:  userWhere,
      select: { id: true, fullName: true, unitId: true, departmentId: true },
    });
    const userIds = users.map(u => u.id);
 
    const points = await this.prisma.userPoints.findMany({
      where:   { userId: { in: userIds } },
      orderBy: { points: 'desc' },
      take:    limit,
    });
 
    return points.map((p, i) => ({
      rank:   i + 1,
      userId: p.userId,
      points: p.points,
      user:   users.find(u => u.id === p.userId),
    }));
  }
 
  private async checkMilestones(userId: number, totalPoints: number) {
    const milestones = [
      { points: 100,   badgeName: 'Iniciante' },
      { points: 500,   badgeName: 'Estudante Dedicado' },
      { points: 1000,  badgeName: 'Aprendiz Ativo' },
      { points: 5000,  badgeName: 'Expert em Formação' },
      { points: 10000, badgeName: 'Mestre do Conhecimento' },
    ];
 
    for (const milestone of milestones) {
      if (totalPoints >= milestone.points) {
        const badge = await this.prisma.badge.findUnique({ where: { name: milestone.badgeName } });
        if (!badge) continue;
        const alreadyAwarded = await this.prisma.badgeAward.findFirst({
          where: { userId, badgeId: badge.id },
        });
        if (!alreadyAwarded) {
          await this.awardBadge({ userId, badgeId: badge.id });
        }
      }
    }
  }
 
  async initDefaultBadges() {
    const badges = [
      { name: 'Iniciante',              description: 'Primeiros 100 pontos' },
      { name: 'Estudante Dedicado',     description: '500 pontos acumulados' },
      { name: 'Aprendiz Ativo',         description: '1000 pontos acumulados' },
      { name: 'Expert em Formação',     description: '5000 pontos acumulados' },
      { name: 'Mestre do Conhecimento', description: '10000 pontos acumulados' },
      { name: 'Primeiro Curso',         description: 'Primeiro curso concluído' },
      { name: 'Maratonista',            description: '10 cursos concluídos' },
    ];
    const created = [];
    for (const b of badges) {
      const exists = await this.prisma.badge.findUnique({ where: { name: b.name } });
      if (!exists) created.push(await this.prisma.badge.create({ data: b }));
    }
    return { created: created.length, message: `${created.length} badges criados` };
  }
}