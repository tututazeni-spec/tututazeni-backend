// ─── succession.service.ts ───────────────────────────────────────────────────
import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSuccessionPlanDto, UpdateSuccessionPlanDto, SuccessionFilterDto } from './succession.dto';
 
@Injectable()
export class SuccessionService {
  constructor(private prisma: PrismaService) {}
 
  async findAll(filters: SuccessionFilterDto) {
    const where: any = {};
    if (filters.positionId) where.positionId = filters.positionId;
    if (filters.candidateId) where.candidateId = filters.candidateId;
 
    return this.prisma.successionPlan.findMany({
      where,
      include: {
        position: true,
        candidate: {
          select: {
            id: true, fullName: true, email: true,
            userCompetencies: { include: { competency: true } },
            performanceReviews: { orderBy: { createdAt: 'desc' }, take: 1 },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }
 
  async findOne(id: number) {
    const s = await this.prisma.successionPlan.findUnique({
      where: { id },
      include: {
        position: true,
        candidate: {
          include: {
            userCompetencies: { include: { competency: true } },
            performanceReviews: { orderBy: { createdAt: 'desc' }, take: 3 },
            enrollments: { where: { status: 'CONCLUIDO' }, include: { course: true } },
          },
        },
      },
    });
    if (!s) throw new NotFoundException('Plano de sucessão não encontrado');
    return s;
  }
 
  async create(dto: CreateSuccessionPlanDto) {
    return this.prisma.successionPlan.create({
      data: dto,
      include: { position: true, candidate: { select: { id: true, fullName: true } } },
    });
  }
 
  async update(id: number, dto: UpdateSuccessionPlanDto) {
    await this.findOne(id);
    return this.prisma.successionPlan.update({ where: { id }, data: dto });
  }
 
  async remove(id: number) {
    await this.findOne(id);
    await this.prisma.successionPlan.delete({ where: { id } });
    return { message: 'Plano de sucessão removido' };
  }
 
  async getPositionSummary(positionId: number) {
    const [position, plans] = await Promise.all([
      this.prisma.position.findUnique({ where: { id: positionId } }),
      this.prisma.successionPlan.findMany({
        where: { positionId },
        include: {
          candidate: {
            select: {
              id: true, fullName: true,
              performanceReviews: { orderBy: { createdAt: 'desc' }, take: 1 },
              userCompetencies: { include: { competency: true } },
            },
          },
        },
      }),
    ]);
    if (!position) throw new NotFoundException('Posição não encontrada');
    const readinessMap = { HIGH: [], MEDIUM: [], LOW: [] } as Record<string, any[]>;
    for (const p of plans) {
      const key = p.readiness.toUpperCase();
      if (readinessMap[key]) readinessMap[key].push(p);
      else readinessMap['LOW'].push(p);
    }
    return { position, total: plans.length, byReadiness: readinessMap };
  }
 
  async getOrganizationChart() {
    const positions = await this.prisma.position.findMany({
      include: {
        users: { select: { id: true, fullName: true } },
        successionPlans: {
          include: { candidate: { select: { id: true, fullName: true } } },
        },
      },
    });
    return positions.map(p => ({
      position: { id: p.id, name: p.name, level: p.level, departmentId: (p as any).departmentId },
      incumbents: p.users,
      successors: p.successionPlans.map(sp => ({ ...sp.candidate, readiness: sp.readiness })),
    }));
  }
}
 
