import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateDevelopmentPlanDto, UpdateDevelopmentPlanDto, DevelopmentPlanFilterDto } from './development-plans.dto';
 
@Injectable()
export class DevelopmentPlansService {
  constructor(private prisma: PrismaService) {}
 
  async findAll(filters: DevelopmentPlanFilterDto) {
    const { page = 1, limit = 20, userId, status } = filters;
    const skip = (page - 1) * limit;
    const where: any = {};
    if (userId) where.userId = userId;
    if (status) where.status = status;
 
    const [data, total] = await Promise.all([
      this.prisma.developmentPlan.findMany({
        where, skip, take: limit,
        include: {
          user: { select: { id: true, fullName: true, email: true } },
          certificates: true,
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.developmentPlan.count({ where }),
    ]);
    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }
 
  async findOne(id: number) {
    const p = await this.prisma.developmentPlan.findUnique({
      where: { id },
      include: {
        user: { select: { id: true, fullName: true, email: true } },
        certificates: true,
      },
    });
    if (!p) throw new NotFoundException('Plano de desenvolvimento não encontrado');
    return p;
  }
 
  async create(dto: CreateDevelopmentPlanDto) {
    return this.prisma.developmentPlan.create({
      data: dto,
      include: { user: { select: { id: true, fullName: true } } },
    });
  }
 
  async update(id: number, dto: UpdateDevelopmentPlanDto) {
    await this.findOne(id);
    return this.prisma.developmentPlan.update({ where: { id }, data: dto });
  }
 
  async complete(id: number) {
    const plan = await this.findOne(id);
    const updated = await this.prisma.developmentPlan.update({
      where: { id }, data: { status: 'COMPLETED' },
    });
    // gerar certificado
    const code = `DEV-${Date.now()}-${id}`;
    await this.prisma.certificate.create({
      data: {
        type: 'DEVELOPMENT',
        developmentPlanId: id,
        validationCode: code,
        fileUrl: `/certificates/${code}.pdf`,
      },
    });
    // pontuar utilizador
    await this.prisma.userPoints.upsert({
      where: { userId: plan.userId },
      create: { userId: plan.userId, points: 200 },
      update: { points: { increment: 200 } },
    });
    return updated;
  }
 
  async cancel(id: number) {
    await this.findOne(id);
    return this.prisma.developmentPlan.update({ where: { id }, data: { status: 'CANCELLED' } });
  }
 
  async remove(id: number) {
    await this.findOne(id);
    await this.prisma.developmentPlan.delete({ where: { id } });
    return { message: 'Plano removido' };
  }
 
  async getMyPlans(userId: number) {
    return this.prisma.developmentPlan.findMany({
      where: { userId },
      include: { certificates: true },
      orderBy: { createdAt: 'desc' },
    });
  }
 
  async getStats(userId: number) {
    const [total, active, completed] = await Promise.all([
      this.prisma.developmentPlan.count({ where: { userId } }),
      this.prisma.developmentPlan.count({ where: { userId, status: 'ACTIVE' } }),
      this.prisma.developmentPlan.count({ where: { userId, status: 'COMPLETED' } }),
    ]);
    return { total, active, completed, completionRate: total ? Math.round((completed / total) * 100) : 0 };
  }
}
 
