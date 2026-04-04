// ─── performance.service.ts ──────────────────────────────────────────────────
import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePerformanceReviewDto, UpdatePerformanceReviewDto, PerformanceFilterDto } from './performance.dto';
 
@Injectable()
export class PerformanceService {
  constructor(private prisma: PrismaService) {}
 
  async findAll(filters: PerformanceFilterDto) {
    const { page = 1, limit = 20, userId, period } = filters;
    const skip = (page - 1) * limit;
    const where: any = {};
    if (userId) where.userId = userId;
    if (period) where.period = { contains: period, mode: 'insensitive' };
 
    const [data, total] = await Promise.all([
      this.prisma.performanceReview.findMany({
        where, skip, take: limit,
        include: { user: { select: { id: true, fullName: true, email: true } } },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.performanceReview.count({ where }),
    ]);
    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }
 
  async findOne(id: number) {
    const r = await this.prisma.performanceReview.findUnique({
      where: { id },
      include: { user: { select: { id: true, fullName: true } } },
    });
    if (!r) throw new NotFoundException('Avaliação de desempenho não encontrada');
    return r;
  }
 
  async create(dto: CreatePerformanceReviewDto) {
    return this.prisma.performanceReview.create({
      data: dto,
      include: { user: { select: { id: true, fullName: true } } },
    });
  }
 
  async update(id: number, dto: UpdatePerformanceReviewDto) {
    await this.findOne(id);
    return this.prisma.performanceReview.update({ where: { id }, data: dto });
  }
 
  async remove(id: number) {
    await this.findOne(id);
    await this.prisma.performanceReview.delete({ where: { id } });
    return { message: 'Avaliação removida' };
  }
 
  async getUserHistory(userId: number) {
    return this.prisma.performanceReview.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }
 
  async getTeamPerformance(leaderId: number) {
    const teamMembers = await this.prisma.user.findMany({
      where: { unit: { users: { some: { id: leaderId } } } },
      select: { id: true, fullName: true },
    });
    const reviews = await Promise.all(
      teamMembers.map(async (m) => {
        const latest = await this.prisma.performanceReview.findFirst({
          where: { userId: m.id }, orderBy: { createdAt: 'desc' },
        });
        const avg = await this.prisma.performanceReview.aggregate({
          where: { userId: m.id }, _avg: { score: true },
        });
        return { user: m, latestReview: latest, averageScore: avg._avg.score ?? 0 };
      }),
    );
    return reviews;
  }
 
  async getDepartmentStats(departmentId: number) {
    const users = await this.prisma.user.findMany({ where: { departmentId }, select: { id: true } });
    const userIds = users.map(u => u.id);
    const stats = await this.prisma.performanceReview.aggregate({
      where: { userId: { in: userIds } },
      _avg: { score: true }, _min: { score: true }, _max: { score: true }, _count: true,
    });
    return { departmentId, userCount: users.length, stats };
  }
 
  async getPeriods() {
    const periods = await this.prisma.performanceReview.findMany({
      select: { period: true }, distinct: ['period'], orderBy: { period: 'desc' },
    });
    return periods.map(p => p.period);
  }
}
 
