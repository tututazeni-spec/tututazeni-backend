import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateCompetencyDto, UpdateCompetencyDto,
  UpsertUserCompetencyDto, CompetencyFilterDto,
} from './competencies.dto';
 
@Injectable()
export class CompetenciesService {
  constructor(private prisma: PrismaService) {}
 
  async findAll(filters: CompetencyFilterDto) {
    const { page = 1, limit = 20, search } = filters;
    const skip = (page - 1) * limit;
    const where: any = {};
    if (search) where.name = { contains: search, mode: 'insensitive' };
 
    const [data, total] = await Promise.all([
      this.prisma.competency.findMany({
        where, skip, take: limit,
        include: {
          _count: { select: { userCompetencies: true, courses: true } },
        },
        orderBy: { name: 'asc' },
      }),
      this.prisma.competency.count({ where }),
    ]);
    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }
 
  async findOne(id: number) {
    const c = await this.prisma.competency.findUnique({
      where: { id },
      include: {
        courses: { include: { course: true } },
        positions: { include: { position: true } },
        _count: { select: { userCompetencies: true } },
      },
    });
    if (!c) throw new NotFoundException('Competência não encontrada');
    return c;
  }
 
  async create(dto: CreateCompetencyDto) {
    const exists = await this.prisma.competency.findUnique({ where: { name: dto.name } });
    if (exists) throw new ConflictException('Competência já existe');
    return this.prisma.competency.create({ data: dto });
  }
 
  async update(id: number, dto: UpdateCompetencyDto) {
    await this.findOne(id);
    return this.prisma.competency.update({ where: { id }, data: dto });
  }
 
  async remove(id: number) {
    await this.findOne(id);
    await this.prisma.competency.delete({ where: { id } });
    return { message: 'Competência removida' };
  }
 
  // ─── USER COMPETENCIES ────────────────────────────────────────────────────
 
  async upsertUserCompetency(dto: UpsertUserCompetencyDto) {
    return this.prisma.userCompetency.upsert({
      where: { userId_competencyId: { userId: dto.userId, competencyId: dto.competencyId } },
      create: { userId: dto.userId, competencyId: dto.competencyId, level: dto.level },
      update: { level: dto.level, evaluatedAt: new Date() },
      include: { competency: true },
    });
  }
 
  async getUserCompetencies(userId: number) {
    return this.prisma.userCompetency.findMany({
      where: { userId },
      include: { competency: true },
      orderBy: { evaluatedAt: 'desc' },
    });
  }
 
  async getCompetencyGap(userId: number, careerPositionId: number) {
    const [userComps, required] = await Promise.all([
      this.prisma.userCompetency.findMany({
        where: { userId }, include: { competency: true },
      }),
      this.prisma.positionCompetency.findMany({
        where: { positionId: careerPositionId }, include: { competency: true },
      }),
    ]);
 
    const userMap = new Map(userComps.map(uc => [uc.competencyId, uc.level]));
 
    const gaps = required.map(req => {
      const current = userMap.get(req.competencyId) ?? 0;
      return {
        competency: req.competency,
        requiredLevel: req.requiredLevel,
        currentLevel: current,
        gap: Math.max(0, req.requiredLevel - current),
        met: current >= req.requiredLevel,
      };
    });
 
    const totalGap = gaps.reduce((acc, g) => acc + g.gap, 0);
    const readinessPercent = required.length
      ? Math.round((gaps.filter(g => g.met).length / required.length) * 100)
      : 100;
 
    return { gaps, totalGap, readinessPercent };
  }
 
  async getTopCompetencies(limit = 10) {
    return this.prisma.userCompetency.groupBy({
      by: ['competencyId'],
      _count: { competencyId: true },
      _avg: { level: true },
      orderBy: { _count: { competencyId: 'desc' } },
      take: limit,
    });
  }
}
 
