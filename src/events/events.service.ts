import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateEventDto, UpdateEventDto, FilterEventsDto } from './dto';

@Injectable()
export class EventsService {
  constructor(private prisma: PrismaService) {}

  async createEvent(dto: CreateEventDto) {
    return this.prisma.event.create({
      data: {
        title: dto.title,
        description: dto.description,
        startAt: new Date(dto.startAt),
        endAt: new Date(dto.endAt),
        location: dto.location,
        organizer: { connect: { id: dto.organizerId } },
        participants: {
          create: dto.participantIds?.map((userId) => ({ userId })) || [],
        },
      },
      include: { participants: true },
    });
  }

  async updateEvent(eventId: number, dto: UpdateEventDto) {
    return this.prisma.event.update({
      where: { id: eventId },
      data: {
        ...dto,
        startAt: dto.startAt ? new Date(dto.startAt) : undefined,
        endAt: dto.endAt ? new Date(dto.endAt) : undefined,
        participants: dto.participantIds
          ? {
              deleteMany: {},
              create: dto.participantIds.map((userId) => ({ userId })),
            }
          : undefined,
      },
      include: { participants: true },
    });
  }

  // 🔎 Listar todos com filtro
  async findAll(filter?: FilterEventsDto) {
  return this.prisma.event.findMany({
    where: {
      title: filter?.query ? { contains: filter.query } : undefined,
      startAt: filter?.startAt ? { gte: new Date(filter.startAt) } : undefined,
      endAt: filter?.endAt ? { lte: new Date(filter.endAt) } : undefined,
    },
    include: { participants: true, organizer: true },
    orderBy: { startAt: 'asc' },
  });
}

  // 📌 Buscar por ID
  async findOne(eventId: number) {
    return this.prisma.event.findUnique({
      where: { id: eventId },
      include: { participants: true, organizer: true },
    });
  }

  async deleteEvent(eventId: number) {
    return this.prisma.event.delete({
      where: { id: eventId },
    });
  }
}