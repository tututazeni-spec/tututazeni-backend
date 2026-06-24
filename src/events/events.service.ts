// src/events/events.service.ts
import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateEventDto,
  UpdateEventDto,
  EventFilterDto,
  UpdateParticipantStatusDto,
  CheckInDto,
  SubmitFeedbackDto,
  ParticipantStatus,
} from './events.dto';

@Injectable()
export class EventsService {
  private readonly logger = new Logger(EventsService.name);

  constructor(private prisma: PrismaService) {}

  // ─── LISTAGEM ─────────────────────────────────────────────────────────────

  async findAll(filters: EventFilterDto) {
    const {
      page = 1,
      limit = 20,
      search,
      organizerId,
      type,
      modalidade,
      status,
      upcoming,
      mandatory,
    } = filters;
    const skip = (page - 1) * limit;

    const where: any = {};
    if (search) where.title = { contains: search, mode: 'insensitive' };
    if (organizerId) where.organizerId = organizerId;
    if (type) where.type = type;
    if (modalidade) where.modalidade = modalidade;
    if (mandatory !== undefined) where.mandatory = mandatory;
    if (status) where.status = status;
    else where.status = { in: ['PUBLISHED', 'LIVE'] };
    if (upcoming) where.startAt = { gte: new Date() };

    const [data, total] = await Promise.all([
      this.prisma.read.event.findMany({
        where,
        skip,
        take: limit,
        include: {
          organizer: { select: { id: true, fullName: true, avatarUrl: true } },
          _count: { select: { participants: true } },
        },
        orderBy: { startAt: 'asc' },
      }),
      this.prisma.read.event.count({ where }),
    ]);

    return {
      data: data.map(e => ({
        ...e,
        isFull: (e as any).maxCapacity ? e._count.participants >= (e as any).maxCapacity : false,
        occupancyRate:
          (e as any).maxCapacity && (e as any).maxCapacity > 0
            ? Math.round((e._count.participants / (e as any).maxCapacity) * 100)
            : null,
      })),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async findOne(id: number) {
    const e = await this.prisma.read.event.findUnique({
      where: { id },
      include: {
        organizer: { select: { id: true, fullName: true, avatarUrl: true } },
        participants: {
          include: { user: { select: { id: true, fullName: true, avatarUrl: true } } },
          orderBy: { registeredAt: 'asc' },
        },
        feedbacks: { select: { nps: true, rating: true, instructorRating: true }, take: 100 },
        _count: { select: { participants: true, feedbacks: true } },
      },
    });
    if (!e) throw new NotFoundException('Evento não encontrado');

    // Calcular NPS e métricas de feedback
    const feedbacks = e.feedbacks as any[];
    const avgNps =
      feedbacks.length > 0
        ? Math.round(
            (feedbacks.reduce((s: number, f: any) => s + f.nps, 0) / feedbacks.length) * 10,
          ) / 10
        : null;
    const avgRating =
      feedbacks.length > 0
        ? Math.round(
            (feedbacks.reduce((s: number, f: any) => s + (f.rating ?? 0), 0) / feedbacks.length) *
              10,
          ) / 10
        : null;

    const participantCount = e._count.participants;
    const maxCapacity = (e as any).maxCapacity;

    return {
      ...e,
      isFull: maxCapacity ? participantCount >= maxCapacity : false,
      occupancyRate:
        maxCapacity && maxCapacity > 0 ? Math.round((participantCount / maxCapacity) * 100) : null,
      avgNps,
      avgRating,
    };
  }

  // ─── CRIAÇÃO / EDIÇÃO ─────────────────────────────────────────────────────

  async create(organizerId: number, dto: CreateEventDto) {
    const event = await this.prisma.event.create({
      data: {
        title: dto.title,
        description: dto.description,
        type: dto.type,
        modalidade: dto.modalidade ?? 'ONLINE',
        startAt: new Date(dto.startAt),
        endAt: new Date(dto.endAt),
        location: dto.location,
        meetingUrl: dto.meetingUrl,
        meetingPassword: dto.meetingPassword,
        maxCapacity: dto.maxCapacity ?? 50,
        waitlistEnabled: dto.waitlistEnabled ?? true,
        certificateEnabled: dto.certificateEnabled ?? false,
        minAttendancePercent: dto.minAttendancePercent ?? 80,
        tags: dto.tags ?? [],
        mandatory: dto.mandatory ?? false,
        courseId: dto.courseId,
        bannerUrl: dto.bannerUrl,
        status: 'DRAFT',
        organizerId,
      },
      include: { organizer: { select: { id: true, fullName: true } } },
    });

    return event;
  }

  async update(id: number, dto: UpdateEventDto) {
    await this.findOne(id);
    const data: any = { ...dto };
    if (dto.startAt) data.startAt = new Date(dto.startAt);
    if (dto.endAt) data.endAt = new Date(dto.endAt);
    return this.prisma.event.update({ where: { id }, data });
  }

  async publish(id: number) {
    const e = (await this.findOne(id)) as any;
    if (!e.title || !e.startAt) throw new BadRequestException('Evento incompleto para publicação');
    return this.prisma.event.update({ where: { id }, data: { status: 'PUBLISHED' } });
  }

  async cancel(id: number) {
    await this.findOne(id);
    await this.prisma.event.update({ where: { id }, data: { status: 'CANCELLED' } });

    // Notificar participantes
    const participants = await this.prisma.read.eventParticipant.findMany({
      where: { eventId: id, status: { in: ['CONFIRMED', 'PENDING'] } },
      select: { userId: true },
    });

    if (participants.length > 0) {
      await this.prisma.notificationLog
        .createMany({
          data: participants.map(p => ({
            userId: p.userId,
            type: 'EVENT_CANCELLED',
            message: `O evento foi cancelado. A tua inscrição foi removida automaticamente.`,
            priority: 'HIGH',
            category: 'LMS',
          })),
        })
        .catch(() => {});
    }

    return { message: 'Evento cancelado e participantes notificados' };
  }

  async remove(id: number) {
    const e = (await this.findOne(id)) as any;
    if (e.status === 'PUBLISHED' || e.status === 'LIVE') {
      throw new BadRequestException('Evento publicado não pode ser eliminado. Cancele-o primeiro.');
    }
    await this.prisma.event.delete({ where: { id } });
    return { message: 'Evento eliminado' };
  }

  // ─── INSCRIÇÃO ────────────────────────────────────────────────────────────

  async join(eventId: number, userId: number) {
    const event = (await this.findOne(eventId)) as any;
    if (event.status === 'CANCELLED') throw new BadRequestException('Evento cancelado');
    if (event.status === 'ENDED') throw new BadRequestException('Evento já encerrado');

    const existing = await this.prisma.eventParticipant.findUnique({
      where: { eventId_userId: { eventId, userId } },
    });
    if (existing && existing.status !== 'CANCELLED') {
      throw new ConflictException('Já inscrito neste evento');
    }

    // Verificar capacidade
    const participantCount = await this.prisma.read.eventParticipant.count({
      where: { eventId, status: { in: ['PENDING', 'CONFIRMED'] } },
    });

    let status: ParticipantStatus = ParticipantStatus.CONFIRMED;
    if (event.maxCapacity && participantCount >= event.maxCapacity) {
      if (!event.waitlistEnabled) throw new BadRequestException('Evento lotado');
      status = ParticipantStatus.WAITLIST;
    }

    const participant = await this.prisma.eventParticipant.upsert({
      where: { eventId_userId: { eventId, userId } },
      create: { eventId, userId, status, registeredAt: new Date() },
      update: { status, registeredAt: new Date() },
      include: { event: { select: { id: true, title: true, startAt: true } } },
    });

    // Notificar
    await this.prisma.notificationLog
      .create({
        data: {
          userId,
          type: 'EVENT_REGISTERED',
          message:
            status === 'WAITLIST'
              ? `Entraste na lista de espera do evento "${event.title}"`
              : `Inscrição confirmada no evento "${event.title}" — ${new Date(event.startAt).toLocaleDateString('pt-PT')}`,
          priority: 'MEDIUM',
          category: 'LMS',
          actionUrl: `/events/${eventId}`,
          metadata: JSON.stringify({}),
        },
      })
      .catch(() => {});

    // XP
    await this.prisma.userPoints
      .upsert({
        where: { userId },
        create: { userId, points: 5 },
        update: { points: { increment: 5 } },
      })
      .catch(() => {});

    return participant;
  }

  async leave(eventId: number, userId: number) {
    const participant = await this.prisma.read.eventParticipant.findUnique({
      where: { eventId_userId: { eventId, userId } },
    });
    if (!participant) throw new NotFoundException('Inscrição não encontrada');

    await this.prisma.eventParticipant.update({
      where: { eventId_userId: { eventId, userId } },
      data: { status: 'CANCELLED' },
    });

    // Promover da lista de espera
    const event = await this.prisma.read.event.findUnique({ where: { id: eventId } });
    if ((event as any)?.waitlistEnabled) {
      const nextOnWaitlist = await this.prisma.read.eventParticipant.findFirst({
        where: { eventId, status: 'WAITLIST' },
        orderBy: { registeredAt: 'asc' },
      });
      if (nextOnWaitlist) {
        await this.prisma.eventParticipant.update({
          where: { id: nextOnWaitlist.id },
          data: { status: 'CONFIRMED' },
        });
        await this.prisma.notificationLog
          .create({
            data: {
              userId: nextOnWaitlist.userId,
              type: 'EVENT_PROMOTED',
              message: `Foste promovido da lista de espera! A tua inscrição está agora confirmada.`,
              priority: 'HIGH',
              category: 'LMS',
              actionUrl: `/events/${eventId}`,
            },
          })
          .catch(() => {});
      }
    }

    return { message: 'Inscrição cancelada' };
  }

  async updateParticipantStatus(eventId: number, userId: number, dto: UpdateParticipantStatusDto) {
    return this.prisma.eventParticipant.update({
      where: { eventId_userId: { eventId, userId } },
      data: { status: dto.status, note: dto.note },
    });
  }

  // ─── CHECK-IN ─────────────────────────────────────────────────────────────

  async checkIn(userId: number, dto: CheckInDto) {
    const event = await this.prisma.read.event.findUnique({ where: { id: dto.eventId } });
    if (!event) throw new NotFoundException('Evento não encontrado');

    const participant = await this.prisma.read.eventParticipant.findUnique({
      where: { eventId_userId: { eventId: dto.eventId, userId } },
    });
    if (!participant) throw new BadRequestException('Não inscrito neste evento');

    const updated = await this.prisma.eventParticipant.update({
      where: { eventId_userId: { eventId: dto.eventId, userId } },
      data: { status: 'PRESENT', checkedInAt: new Date() },
    });

    // XP por presença
    await this.prisma.userPoints
      .upsert({
        where: { userId },
        create: { userId, points: 20 },
        update: { points: { increment: 20 } },
      })
      .catch(() => {});

    return updated;
  }

  // ─── FEEDBACK / NPS ───────────────────────────────────────────────────────

  async submitFeedback(eventId: number, userId: number, dto: SubmitFeedbackDto) {
    const participant = await this.prisma.read.eventParticipant.findUnique({
      where: { eventId_userId: { eventId, userId } },
    });
    if (!participant) throw new BadRequestException('Não participaste neste evento');

    const feedback = await this.prisma.eventFeedback.upsert({
      where: { eventId_userId: { eventId, userId } },
      create: { eventId, userId, ...dto },
      update: { ...dto },
    });

    // XP por feedback
    await this.prisma.userPoints
      .upsert({
        where: { userId },
        create: { userId, points: 5 },
        update: { points: { increment: 5 } },
      })
      .catch(() => {});

    // Emitir certificado se cumprir critérios
    await this.autoIssueCertificate(eventId, userId).catch(() => {});

    return feedback;
  }

  // ─── CERTIFICADOS ─────────────────────────────────────────────────────────

  private async autoIssueCertificate(eventId: number, userId: number) {
    const event = await this.prisma.read.event.findUnique({ where: { id: eventId } });
    if (!(event as any)?.certificateEnabled) return;

    const participant = await this.prisma.read.eventParticipant.findUnique({
      where: { eventId_userId: { eventId, userId } },
    });
    if (participant?.status !== 'PRESENT') return;

    // Verificar se já existe
    const existing = await this.prisma.certificate.findFirst({
      where: { userId, eventId },
    });
    if (existing) return;

    const code = `EVT-${Date.now()}-${eventId}-${userId}`;
    await this.prisma.certificate.create({
      data: {
        type: 'COURSE' as any,
        userId,
        eventId,
        validationCode: code,
        fileUrl: `/certificates/${code}.pdf`,
      },
    });

    await this.prisma.notificationLog
      .create({
        data: {
          userId,
          type: 'CERTIFICATE_ISSUED',
          message: `🎓 Certificado emitido! Consulta o teu perfil para fazer o download.`,
          priority: 'MEDIUM',
          category: 'LMS',
        },
      })
      .catch(() => {});
  }

  // ─── DASHBOARD DO ORGANIZADOR ─────────────────────────────────────────────

  async getOrganizerDashboard(userId: number) {
    const [myEvents, totalParticipants, upcomingCount] = await Promise.all([
      this.prisma.read.event.findMany({
        where: { organizerId: userId, status: { in: ['PUBLISHED', 'LIVE', 'ENDED'] } },
        include: {
          _count: { select: { participants: true, feedbacks: true } },
          feedbacks: { select: { nps: true, rating: true } },
        },
        orderBy: { startAt: 'desc' },
        take: 10,
      }),
      this.prisma.read.eventParticipant.count({
        where: { event: { organizerId: userId } },
      }),
      this.prisma.read.event.count({
        where: { organizerId: userId, startAt: { gte: new Date() }, status: 'PUBLISHED' },
      }),
    ]);

    const events = myEvents.map(e => {
      const feedbacks = e.feedbacks as any[];
      const avgNps =
        feedbacks.length > 0
          ? Math.round(
              (feedbacks.reduce((s: number, f: any) => s + f.nps, 0) / feedbacks.length) * 10,
            ) / 10
          : null;
      const maxCap = (e as any).maxCapacity;
      const pCount = e._count.participants;
      return {
        id: e.id,
        title: e.title,
        type: e.type,
        status: e.status,
        startAt: e.startAt,
        participants: pCount,
        maxCapacity: maxCap,
        occupancyRate: maxCap ? Math.round((pCount / maxCap) * 100) : null,
        feedbackCount: e._count.feedbacks,
        avgNps,
      };
    });

    const totalFeedbacks = events.reduce((s, e) => s + e.feedbackCount, 0);
    const avgNpsAll =
      events.filter(e => e.avgNps).length > 0
        ? Math.round(
            (events.reduce((s, e) => s + (e.avgNps ?? 0), 0) /
              events.filter(e => e.avgNps).length) *
              10,
          ) / 10
        : null;

    return {
      metrics: {
        totalEvents: myEvents.length,
        upcomingEvents: upcomingCount,
        totalParticipants,
        totalFeedbacks,
        avgNps: avgNpsAll,
      },
      events,
    };
  }

  // ─── MEUS EVENTOS ─────────────────────────────────────────────────────────

  async getMyEvents(userId: number) {
    const participations = await this.prisma.read.eventParticipant.findMany({
      where: { userId },
      include: {
        event: {
          include: {
            organizer: { select: { id: true, fullName: true, avatarUrl: true } },
            _count: { select: { participants: true } },
          },
        },
      },
      orderBy: { event: { startAt: 'asc' } },
    });

    const now = new Date();
    return {
      upcoming: participations.filter(p => new Date((p.event as any).startAt) >= now),
      past: participations.filter(p => new Date((p.event as any).startAt) < now),
    };
  }

  async getUpcoming() {
    const data = await this.prisma.read.event.findMany({
      where: { startAt: { gte: new Date() }, status: 'PUBLISHED' },
      include: {
        organizer: { select: { id: true, fullName: true, avatarUrl: true } },
        _count: { select: { participants: true } },
      },
      orderBy: { startAt: 'asc' },
      take: 12,
    });

    return data.map(e => ({
      ...e,
      isFull: (e as any).maxCapacity ? e._count.participants >= (e as any).maxCapacity : false,
      occupancyRate: (e as any).maxCapacity
        ? Math.round((e._count.participants / (e as any).maxCapacity) * 100)
        : null,
    }));
  }

  // ─── STATS ────────────────────────────────────────────────────────────────

  async getStats() {
    const [byType, byStatus, total, totalParticipants] = await Promise.all([
      this.prisma.read.event.groupBy({
        by: ['type'],
        _count: true,
        orderBy: { _count: { type: 'desc' } },
      }),
      this.prisma.read.event.groupBy({ by: ['status'], _count: true }),
      this.prisma.read.event.count(),
      this.prisma.read.eventParticipant.count({
        where: { status: { in: ['CONFIRMED', 'PRESENT'] } },
      }),
    ]);

    return {
      total,
      totalParticipants,
      byType: Object.fromEntries(byType.map(t => [t.type, t._count])),
      byStatus: Object.fromEntries(byStatus.map(s => [s.status, s._count])),
    };
  }
}
