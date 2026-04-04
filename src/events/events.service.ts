import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateEventDto, UpdateEventDto, UpdateParticipantStatusDto, EventFilterDto } from './events.dto';
 
@Injectable()
export class EventsService {
  constructor(private prisma: PrismaService) {}
 
  async findAll(filters: EventFilterDto) {
    const { page = 1, limit = 20, search, organizerId } = filters;
    const skip = (page - 1) * limit;
    const where: any = {};
    if (search) where.title = { contains: search, mode: 'insensitive' };
    if (organizerId) where.organizerId = organizerId;
 
    const [data, total] = await Promise.all([
      this.prisma.event.findMany({
        where, skip, take: limit,
        include: {
          organizer: { select: { id: true, fullName: true } },
          _count: { select: { participants: true } },
        },
        orderBy: { startAt: 'asc' },
      }),
      this.prisma.event.count({ where }),
    ]);
    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }
 
  async findOne(id: number) {
    const e = await this.prisma.event.findUnique({
      where: { id },
      include: {
        organizer: { select: { id: true, fullName: true } },
        participants: {
          include: { user: { select: { id: true, fullName: true, email: true } } },
        },
      },
    });
    if (!e) throw new NotFoundException('Evento não encontrado');
    return e;
  }
 
  async create(organizerId: number, dto: CreateEventDto) {
    return this.prisma.event.create({
      data: {
        ...dto,
        startAt: new Date(dto.startAt),
        endAt: new Date(dto.endAt),
        organizerId,
      },
      include: { organizer: { select: { id: true, fullName: true } } },
    });
  }
 
  async update(id: number, dto: UpdateEventDto) {
    await this.findOne(id);
    const data: any = { ...dto };
    if (dto.startAt) data.startAt = new Date(dto.startAt);
    if (dto.endAt) data.endAt = new Date(dto.endAt);
    return this.prisma.event.update({ where: { id }, data });
  }
 
  async remove(id: number) {
    await this.findOne(id);
    await this.prisma.event.delete({ where: { id } });
    return { message: 'Evento removido' };
  }
 
  async join(eventId: number, userId: number) {
    return this.prisma.eventParticipant.upsert({
      where: { eventId_userId: { eventId, userId } },
      create: { eventId, userId, status: 'PENDING' },
      update: { status: 'PENDING' },
      include: { event: { select: { id: true, title: true } } },
    });
  }
 
  async updateParticipantStatus(eventId: number, userId: number, dto: UpdateParticipantStatusDto) {
    return this.prisma.eventParticipant.update({
      where: { eventId_userId: { eventId, userId } },
      data: { status: dto.status as any },
    });
  }
 
  async leave(eventId: number, userId: number) {
    return this.prisma.eventParticipant.update({
      where: { eventId_userId: { eventId, userId } },
      data: { status: 'CANCELED' },
    });
  }
 
  async getUpcoming() {
    return this.prisma.event.findMany({
      where: { startAt: { gte: new Date() } },
      include: {
        organizer: { select: { id: true, fullName: true } },
        _count: { select: { participants: true } },
      },
      orderBy: { startAt: 'asc' },
      take: 10,
    });
  }
 
  async getMyEvents(userId: number) {
    return this.prisma.eventParticipant.findMany({
      where: { userId },
      include: { event: { include: { organizer: { select: { id: true, fullName: true } } } } },
      orderBy: { event: { startAt: 'asc' } },
    });
  }
}
 
