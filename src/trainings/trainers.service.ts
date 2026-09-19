// src/trainings/trainers.service.ts
// docs/trainings-detalhado.md pt.7 — Formadores. Registo dedicado, distinto
// de User (formadores externos não têm necessariamente conta de
// colaborador) — ver comentário em TrainingInstructorProfile no schema.
import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateTrainingInstructorDto,
  UpdateTrainingInstructorDto,
  TrainingInstructorFilterDto,
} from './trainings.dto';

@Injectable()
export class TrainerService {
  constructor(private prisma: PrismaService) {}

  async findAll(filters: TrainingInstructorFilterDto) {
    const { page = 1, limit = 20, search, type, status } = filters;
    const skip = (page - 1) * limit;

    const where: Prisma.TrainingInstructorProfileWhereInput = {};
    if (type) where.type = type;
    if (status) where.status = status;
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { entity: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [data, total] = await Promise.all([
      this.prisma.read.trainingInstructorProfile.findMany({
        where,
        skip,
        take: limit,
        include: {
          user: { select: { id: true, fullName: true, avatarUrl: true } },
        },
        orderBy: { name: 'asc' },
      }),
      this.prisma.read.trainingInstructorProfile.count({ where }),
    ]);

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async findOne(id: number) {
    const profile = await this.prisma.read.trainingInstructorProfile.findUnique({
      where: { id },
      include: { user: { select: { id: true, fullName: true, avatarUrl: true, email: true } } },
    });
    if (!profile) throw new NotFoundException('Formador não encontrado');

    // "Formações atribuídas / Turmas atribuídas / Sessões atribuídas / Horas
    // ministradas / Avaliação média" — sempre calculados a partir das
    // Training ligadas (nunca guardados), mesmo padrão de computeTotalCost
    // em trainings.service.ts.
    const trainingWhere: Prisma.TrainingWhereInput = profile.userId
      ? { OR: [{ instructorId: profile.userId }, { externalInstructorId: id }] }
      : { externalInstructorId: id };

    const trainings = await this.prisma.read.training.findMany({
      where: trainingWhere,
      select: {
        id: true,
        title: true,
        status: true,
        startDate: true,
        endDate: true,
        workloadHours: true,
        _count: { select: { sessions: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    const trainingIds = trainings.map(t => t.id);
    const [sessionsCount, avgRating] = await Promise.all([
      trainingIds.length
        ? this.prisma.read.trainingSession.count({ where: { trainingId: { in: trainingIds } } })
        : Promise.resolve(0),
      trainingIds.length
        ? this.prisma.read.trainingRating.aggregate({
            where: { trainingId: { in: trainingIds } },
            _avg: { rating: true },
          })
        : Promise.resolve({ _avg: { rating: null } }),
    ]);

    const hoursMinistered = trainings.reduce((sum, t) => sum + (t.workloadHours ?? 0), 0);

    return {
      ...profile,
      stats: {
        trainingsAssigned: trainings.length,
        sessionsAssigned: sessionsCount,
        hoursMinistered,
        avgRating: Math.round((avgRating._avg.rating ?? 0) * 10) / 10,
      },
      trainings,
    };
  }

  async create(dto: CreateTrainingInstructorDto) {
    if (dto.userId) await this.assertUserNotLinked(dto.userId);
    const { competencyIds, ...data } = dto;
    return this.prisma.trainingInstructorProfile.create({
      data: {
        ...data,
        specialties: dto.specialties ?? [],
        trainingAreas: dto.trainingAreas ?? [],
        competencyIds: competencyIds ?? [],
        status: dto.status ?? 'ACTIVE',
      },
    });
  }

  async update(id: number, dto: UpdateTrainingInstructorDto) {
    await this.assertExists(id);
    if (dto.userId) await this.assertUserNotLinked(dto.userId, id);
    const { competencyIds, ...data } = dto;
    return this.prisma.trainingInstructorProfile.update({
      where: { id },
      data: {
        ...data,
        specialties: dto.specialties ?? undefined,
        trainingAreas: dto.trainingAreas ?? undefined,
        competencyIds: competencyIds ?? undefined,
      },
    });
  }

  async remove(id: number) {
    await this.assertExists(id);
    const inUse = await this.prisma.read.training.count({ where: { externalInstructorId: id } });
    if (inUse > 0) {
      throw new ConflictException(
        'Formador atribuído a formações — desassocie-o primeiro ou marque-o como inactivo.',
      );
    }
    await this.prisma.trainingInstructorProfile.delete({ where: { id } });
    return { message: 'Formador eliminado' };
  }

  private async assertExists(id: number) {
    const profile = await this.prisma.read.trainingInstructorProfile.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!profile) throw new NotFoundException('Formador não encontrado');
  }

  private async assertUserNotLinked(userId: number, excludeId?: number) {
    const existing = await this.prisma.read.trainingInstructorProfile.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (existing && existing.id !== excludeId) {
      throw new ConflictException('Este colaborador já tem um perfil de formador');
    }
  }
}
