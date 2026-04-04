import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateCareerPlanDto, UpdateCareerPlanDto,
  AddCareerGoalDto, CareerPlanFilterDto,
} from './career-plans.dto';

@Injectable()
export class CareerPlansService {
  constructor(private prisma: PrismaService) {}

  async findAll(filters: CareerPlanFilterDto) {
    const { page = 1, limit = 20, userId, status } = filters;
    const skip = (page - 1) * limit;
    const where: any = {};
    if (userId) where.userId = userId;
    if (status) where.status = status;
    const [data, total] = await Promise.all([
      this.prisma.userCareerPlan.findMany({
        where, skip, take: limit,
        include: {
          user:   { select: { id: true, fullName: true, position: true } },
          mentor: { select: { id: true, fullName: true } },
          goals:  { orderBy: { createdAt: 'asc' } },
          _count: { select: { goals: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.userCareerPlan.count({ where }),
    ]);
    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async findOne(id: number) {
    const p = await this.prisma.userCareerPlan.findUnique({
      where: { id },
      include: {
        user:   { select: { id: true, fullName: true, position: true, department: true } },
        mentor: { select: { id: true, fullName: true } },
        goals:  { orderBy: { createdAt: 'asc' } },
      },
    });
    if (!p) throw new NotFoundException('Plano de carreira não encontrado');
    return p;
  }

  async create(dto: CreateCareerPlanDto) {
    const { targetDate, ...rest } = dto;
    return this.prisma.userCareerPlan.create({
      data: {
        ...rest,
        targetDate: targetDate ? new Date(targetDate) : undefined,
      },
      include: { user: { select: { id: true, fullName: true } } },
    });
  }

  async update(id: number, dto: UpdateCareerPlanDto) {
    await this.findOne(id);
    const { targetDate, ...rest } = dto;
    const data: any = { ...rest };
    if (targetDate) data.targetDate = new Date(targetDate);
    return this.prisma.userCareerPlan.update({ where: { id }, data });
  }

  async addGoal(dto: AddCareerGoalDto) {
    const { dueDate, ...rest } = dto;
    return this.prisma.careerGoal.create({
      data: { ...rest, dueDate: dueDate ? new Date(dueDate) : undefined },
    });
  }

  async updateGoalStatus(goalId: number, status: string, progress?: number) {
    return this.prisma.careerGoal.update({
      where: { id: goalId },
      data: {
        status: status as any,
        progress,
        completedAt: status === 'COMPLETED' ? new Date() : undefined,
      },
    });
  }

  async activate(id: number) {
    await this.findOne(id);
    // FIX: activatedAt não existe no schema — usa updatedAt implícito
    return this.prisma.userCareerPlan.update({
      where: { id },
      data: { status: 'ACTIVE' },
    });
  }

  async getProgress(id: number) {
    const plan = await this.findOne(id);
    const goals = plan.goals as any[];
    const total = goals.length;
    const completed = goals.filter(g => g.status === 'COMPLETED').length;
    const progress = total ? Math.round((completed / total) * 100) : 0;
    return { planId: id, total, completed, progress, goals };
  }

  async getMyPlan(userId: number) {
    return this.prisma.userCareerPlan.findFirst({
      where: { userId, status: { in: ['ACTIVE', 'DRAFT'] } },
      include: {
        goals:  { orderBy: { createdAt: 'asc' } },
        mentor: { select: { id: true, fullName: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }
}