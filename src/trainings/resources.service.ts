// src/trainings/resources.service.ts
// docs/trainings-detalhado.md pt.8 — Recursos & Logística. Um único modelo
// para salas e equipamento/material (TrainingResource.kind) — ver comentário
// no schema.
import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateTrainingResourceDto,
  UpdateTrainingResourceDto,
  TrainingResourceFilterDto,
  CreateResourceBookingDto,
} from './trainings.dto';

@Injectable()
export class TrainingResourceService {
  constructor(private prisma: PrismaService) {}

  async findAll(filters: TrainingResourceFilterDto) {
    const { page = 1, limit = 20, search, kind, status } = filters;
    const skip = (page - 1) * limit;

    const where: Prisma.TrainingResourceWhereInput = {};
    if (kind) where.kind = kind;
    if (status) where.status = status;
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { code: { contains: search, mode: 'insensitive' } },
        { location: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [data, total] = await Promise.all([
      this.prisma.read.trainingResource.findMany({
        where,
        skip,
        take: limit,
        include: {
          responsible: { select: { id: true, fullName: true } },
          _count: { select: { bookings: { where: { releasedAt: null } } } },
        },
        orderBy: { name: 'asc' },
      }),
      this.prisma.read.trainingResource.count({ where }),
    ]);

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async findOne(id: number) {
    const resource = await this.prisma.read.trainingResource.findUnique({
      where: { id },
      include: {
        responsible: { select: { id: true, fullName: true } },
        bookings: {
          where: { releasedAt: null },
          include: {
            training: { select: { id: true, title: true } },
            session: { select: { id: true, sessionDate: true } },
          },
          orderBy: { startAt: 'asc' },
        },
      },
    });
    if (!resource) throw new NotFoundException('Recurso não encontrado');
    return resource;
  }

  async create(dto: CreateTrainingResourceDto) {
    return this.prisma.trainingResource.create({
      data: {
        ...dto,
        equipment: dto.equipment ?? [],
        quantity: dto.quantity ?? 1,
        status: dto.status ?? 'AVAILABLE',
      },
    });
  }

  async update(id: number, dto: UpdateTrainingResourceDto) {
    await this.assertExists(id);
    return this.prisma.trainingResource.update({
      where: { id },
      data: { ...dto, equipment: dto.equipment ?? undefined },
    });
  }

  async remove(id: number) {
    await this.assertExists(id);
    const activeBookings = await this.prisma.read.trainingResourceBooking.count({
      where: { resourceId: id, releasedAt: null },
    });
    if (activeBookings > 0) {
      throw new ConflictException('Recurso com reservas activas não pode ser eliminado.');
    }
    await this.prisma.trainingResource.delete({ where: { id } });
    return { message: 'Recurso eliminado' };
  }

  private async assertExists(id: number) {
    const resource = await this.prisma.read.trainingResource.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!resource) throw new NotFoundException('Recurso não encontrado');
  }

  // ─── Disponibilidade / reservas ────────────────────────────────────────────

  async checkAvailability(resourceId: number, startAt: string, endAt: string) {
    const start = new Date(startAt);
    const end = new Date(endAt);
    const overlapping = await this.prisma.read.trainingResourceBooking.findMany({
      where: {
        resourceId,
        releasedAt: null,
        startAt: { lt: end },
        endAt: { gt: start },
      },
      include: {
        training: { select: { id: true, title: true } },
      },
    });
    return { available: overlapping.length === 0, conflicts: overlapping };
  }

  async reserve(dto: CreateResourceBookingDto, createdById: number) {
    const resource = await this.prisma.read.trainingResource.findUnique({
      where: { id: dto.resourceId },
      select: { id: true, status: true },
    });
    if (!resource) throw new NotFoundException('Recurso não encontrado');
    if (resource.status !== 'AVAILABLE') {
      throw new BadRequestException('Recurso indisponível (inactivo ou em manutenção)');
    }

    const { available } = await this.checkAvailability(dto.resourceId, dto.startAt, dto.endAt);
    if (!available) throw new ConflictException('Recurso já reservado nesse período');

    return this.prisma.trainingResourceBooking.create({
      data: {
        resourceId: dto.resourceId,
        trainingId: dto.trainingId,
        sessionId: dto.sessionId,
        startAt: new Date(dto.startAt),
        endAt: new Date(dto.endAt),
        createdById,
      },
      include: {
        resource: { select: { id: true, name: true, kind: true } },
        training: { select: { id: true, title: true } },
      },
    });
  }

  async release(bookingId: number) {
    const booking = await this.prisma.read.trainingResourceBooking.findUnique({
      where: { id: bookingId },
      select: { id: true, releasedAt: true },
    });
    if (!booking) throw new NotFoundException('Reserva não encontrada');
    if (booking.releasedAt) return { message: 'Reserva já libertada' };
    await this.prisma.trainingResourceBooking.update({
      where: { id: bookingId },
      data: { releasedAt: new Date() },
    });
    return { message: 'Recurso libertado' };
  }

  async listBookingsForTraining(trainingId: number) {
    return this.prisma.read.trainingResourceBooking.findMany({
      where: { trainingId, releasedAt: null },
      include: { resource: { select: { id: true, name: true, kind: true } } },
      orderBy: { startAt: 'asc' },
    });
  }
}
