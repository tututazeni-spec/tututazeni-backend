import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateMicroLearningDto, UpdateMicroLearningDto,
  DispatchMicroLearningDto, MicroLearningFilterDto,
} from './micro-learning.dto';

@Injectable()
export class MicroLearningService {
  constructor(private prisma: PrismaService) {}

  async findAll(filters: MicroLearningFilterDto) {
    const { page = 1, limit = 20, active } = filters;
    const skip = (page - 1) * limit;
    const where: any = {};
    if (active !== undefined) where.active = active;

    // ← corrigido: MicroLearningProgress não tem _count.dispatch nem orderBy.createdAt
    // Corrigido para consultar microLearning directamente com campos válidos
    const [data, total] = await Promise.all([
      this.prisma.microLearning.findMany({
        where, skip, take: limit,
        orderBy: { id: 'desc' },
      }),
      this.prisma.microLearning.count({ where }),
    ]);
    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async findOne(id: number) {
    // ← corrigido: _count.dispatch não existe em MicroLearningInclude
    const ml = await this.prisma.microLearning.findUnique({
      where: { id },
    });
    if (!ml) throw new NotFoundException('Micro-learning não encontrado');
    return ml;
  }

  async create(dto: CreateMicroLearningDto) {
    return this.prisma.microLearning.create({ data: dto });
  }

  async update(id: number, dto: UpdateMicroLearningDto) {
    await this.findOne(id);
    return this.prisma.microLearning.update({ where: { id }, data: dto });
  }

  async remove(id: number) {
    await this.findOne(id);
    await this.prisma.microLearning.delete({ where: { id } });
    return { message: 'Micro-learning removido' };
  }

  async dispatch(dto: DispatchMicroLearningDto) {
    await this.findOne(dto.microLearningId);
    const dispatches = await Promise.allSettled(
      dto.userIds.map(userId =>
        this.prisma.microLearningProgress.create({
          data: { microLearningId: dto.microLearningId, userId },
        }).catch(() => null),
      ),
    );
    return {
      dispatched: dispatches.filter(d => d.status === 'fulfilled').length,
      total:      dto.userIds.length,
    };
  }

  async dispatchToAll(microLearningId: number) {
    await this.findOne(microLearningId);
    const users = await this.prisma.user.findMany({
      where: { active: true }, select: { id: true },
    });
    return this.dispatch({ microLearningId, userIds: users.map(u => u.id) });
  }

  async markViewed(userId: number, dispatchId: number) {
    // ← corrigido: campo viewed não existe; usar completedAt para registar visualização
    return this.prisma.microLearningProgress.update({
      where: { id: dispatchId },
      data:  { completedAt: new Date() },
    });
  }

  async getMyFeed(userId: number) {
    return this.prisma.microLearningProgress.findMany({
      where:   { userId },
      include: { microLearning: true },
      orderBy: { microLearning: { createdAt: 'desc' } },
    });
  }

  async getDispatchStats(microLearningId: number) {
    await this.findOne(microLearningId);
    // ← corrigido: campo viewed não existe; usar completedAt !== null como indicador de visualização
    const [total, viewed] = await Promise.all([
      this.prisma.microLearningProgress.count({ where: { microLearningId } }),
      this.prisma.microLearningProgress.count({ where: { microLearningId, completedAt: { not: null } } }),
    ]);
    return {
      microLearningId,
      total,
      viewed,
      viewRate: total ? Math.round((viewed / total) * 100) : 0,
    };
  }
}