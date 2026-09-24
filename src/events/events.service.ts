// src/events/events.service.ts
import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { Prisma, CertificateType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { MailService } from '../mail/mail.service';
import { SmsService } from '../sms/sms.service';
import {
  CreateEventDto,
  UpdateEventDto,
  EventFilterDto,
  UpdateParticipantStatusDto,
  CheckInDto,
  CheckOutDto,
  ManualCheckInDto,
  ManualCheckOutDto,
  EventCheckinFilterDto,
  SubmitFeedbackDto,
  ParticipantStatus,
  EventParticipantFilterDto,
  ParticipantActionDto,
  EventCalendarFilterDto,
  CreateEventSessionDto,
  UpdateEventSessionDto,
  EventSessionFilterDto,
  UpsertEventLogisticsDto,
  CreateEventSpeakerDto,
  UpdateEventSpeakerDto,
  EventSpeakerFilterDto,
  CreateEventCommunicationDto,
  EventCommunicationFilterDto,
  EventEvaluationFilterDto,
  EventReportFilterDto,
} from './events.dto';
import { calculatePagination, buildPaginatedResponse } from '../common/helpers/pagination.helper';
import { buildCsvString } from '../common/utils/csv-export.util';

@Injectable()
export class EventsService {
  private readonly logger = new Logger(EventsService.name);

  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
    private mail: MailService,
    private sms: SmsService,
  ) {}

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
      departmentId,
      unitId,
    } = filters;
    const { skip, take } = calculatePagination(page, limit);

    const where: Prisma.EventWhereInput = {};
    if (search) where.title = { contains: search, mode: 'insensitive' };
    if (organizerId) where.organizerId = organizerId;
    if (type) where.type = type;
    if (modalidade) where.modalidade = modalidade;
    if (mandatory !== undefined) where.mandatory = mandatory;
    if (status) where.status = status;
    else where.status = { in: ['PUBLISHED', 'LIVE'] };
    if (upcoming) where.startAt = { gte: new Date() };
    if (departmentId) where.departmentId = departmentId;
    if (unitId) where.unitId = unitId;

    const [data, total] = await Promise.all([
      this.prisma.read.event.findMany({
        where,
        skip,
        take,
        include: {
          organizer: { select: { id: true, fullName: true, avatarUrl: true } },
          department: { select: { id: true, name: true } },
          unit: { select: { id: true, name: true } },
          _count: { select: { participants: true } },
        },
        orderBy: { startAt: 'asc' },
      }),
      this.prisma.read.event.count({ where }),
    ]);

    // "Número de confirmados" (docs/events.md #2) — uma leitura só para todos
    // os eventos da página, em vez de N contagens separadas.
    const ids = data.map(e => e.id);
    const confirmedRows = ids.length
      ? await this.prisma.read.eventParticipant.findMany({
          where: { eventId: { in: ids }, status: { in: ['CONFIRMED', 'PRESENT'] } },
          select: { eventId: true },
        })
      : [];
    const confirmedByEvent = confirmedRows.reduce<Record<number, number>>((acc, r) => {
      acc[r.eventId] = (acc[r.eventId] ?? 0) + 1;
      return acc;
    }, {});

    const enrichedData = data.map(e => ({
      ...e,
      confirmedCount: confirmedByEvent[e.id] ?? 0,
      isFull: e.maxCapacity ? e._count.participants >= e.maxCapacity : false,
      occupancyRate:
        e.maxCapacity && e.maxCapacity > 0
          ? Math.round((e._count.participants / e.maxCapacity) * 100)
          : null,
    }));

    return buildPaginatedResponse(enrichedData, total, page, limit);
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
    const feedbacks = e.feedbacks;
    const avgNps =
      feedbacks.length > 0
        ? Math.round((feedbacks.reduce((s, f) => s + f.nps, 0) / feedbacks.length) * 10) / 10
        : null;
    const avgRating =
      feedbacks.length > 0
        ? Math.round((feedbacks.reduce((s, f) => s + (f.rating ?? 0), 0) / feedbacks.length) * 10) /
          10
        : null;

    const participantCount = e._count.participants;
    const maxCapacity = e.maxCapacity;

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
        code: dto.code,
        description: dto.description,
        objective: dto.objective,
        type: dto.type,
        category: dto.category,
        modalidade: dto.modalidade ?? 'ONLINE',
        visibility: dto.visibility ?? 'INTERNAL',
        startAt: new Date(dto.startAt),
        endAt: new Date(dto.endAt),
        timezone: dto.timezone ?? 'Africa/Luanda',
        location: dto.location,
        address: dto.address,
        room: dto.room,
        meetingUrl: dto.meetingUrl,
        meetingPassword: dto.meetingPassword,
        maxCapacity: dto.maxCapacity ?? 50,
        waitlistEnabled: dto.waitlistEnabled ?? true,
        requiresApproval: dto.requiresApproval ?? false,
        registrationStartAt: dto.registrationStartAt
          ? new Date(dto.registrationStartAt)
          : undefined,
        registrationEndAt: dto.registrationEndAt ? new Date(dto.registrationEndAt) : undefined,
        targetAudience: dto.targetAudience,
        allowGuest: dto.allowGuest ?? false,
        certificateEnabled: dto.certificateEnabled ?? false,
        evaluationEnabled: dto.evaluationEnabled ?? true,
        checkinEnabled: dto.checkinEnabled ?? true,
        notificationsEnabled: dto.notificationsEnabled ?? true,
        minAttendancePercent: dto.minAttendancePercent ?? 80,
        tags: dto.tags ?? [],
        restrictedDeptIds: dto.restrictedDeptIds ?? [],
        mandatory: dto.mandatory ?? false,
        courseId: dto.courseId,
        responsibleId: dto.responsibleId,
        departmentId: dto.departmentId,
        unitId: dto.unitId,
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
    const data: Prisma.EventUpdateInput = { ...dto };
    if (dto.startAt) data.startAt = new Date(dto.startAt);
    if (dto.endAt) data.endAt = new Date(dto.endAt);
    return this.prisma.event.update({ where: { id }, data });
  }

  async publish(id: number) {
    const e = await this.findOne(id);
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
        .catch((e: unknown) => {
          this.logger.warn({
            action: 'EVENT_CANCELLED_NOTIFY',
            entityId: id,
            participantCount: participants.length,
            err: { message: e instanceof Error ? e.message : String(e) },
            msg: 'Falha ao notificar participantes sobre cancelamento do evento',
          });
        });
    }

    return { message: 'Evento cancelado e participantes notificados' };
  }

  async remove(id: number) {
    const e = await this.findOne(id);
    if (e.status === 'PUBLISHED' || e.status === 'LIVE') {
      throw new BadRequestException('Evento publicado não pode ser eliminado. Cancele-o primeiro.');
    }
    await this.prisma.event.delete({ where: { id } });
    return { message: 'Evento eliminado' };
  }

  // ─── INSCRIÇÃO ────────────────────────────────────────────────────────────

  async join(eventId: number, userId: number) {
    const event = await this.findOne(eventId);
    if (event.status === 'CANCELLED') throw new BadRequestException('Evento cancelado');
    if (event.status === 'ENDED') throw new BadRequestException('Evento já encerrado');

    const existing = await this.prisma.eventParticipant.findUnique({
      where: { eventId_userId: { eventId, userId } },
    });
    if (existing && !['CANCELLED', 'REJECTED'].includes(existing.status)) {
      throw new ConflictException('Já inscrito neste evento');
    }

    // Verificar capacidade — PRESENT também ocupa vaga (colaborador já fez check-in);
    // sem isto, assim que alguém fazia check-in deixava de contar para a lotação.
    const participantCount = await this.prisma.read.eventParticipant.count({
      where: { eventId, status: { in: ['PENDING', 'CONFIRMED', 'PRESENT'] } },
    });

    let status: ParticipantStatus = ParticipantStatus.CONFIRMED;
    if (event.maxCapacity && participantCount >= event.maxCapacity) {
      if (!event.waitlistEnabled) throw new BadRequestException('Evento lotado');
      status = ParticipantStatus.WAITLIST;
    } else if (event.requiresApproval) {
      // Evento configurado para aprovação manual (docs/events.md #2 "Inscrições
      // → aprovação de inscrição") — fica pendente em vez de confirmado
      // automaticamente; ver aprovar()/rejeitar() na aba Participantes (#4).
      status = ParticipantStatus.PENDING;
    }
    const confirmedAt = status === ParticipantStatus.CONFIRMED ? new Date() : undefined;

    const participant = await this.prisma.eventParticipant.upsert({
      where: { eventId_userId: { eventId, userId } },
      create: { eventId, userId, status, registeredAt: new Date(), confirmedAt },
      update: { status, registeredAt: new Date(), confirmedAt: confirmedAt ?? null },
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
              : status === 'PENDING'
                ? `Inscrição no evento "${event.title}" enviada — aguarda aprovação`
                : `Inscrição confirmada no evento "${event.title}" — ${new Date(event.startAt).toLocaleDateString('pt-PT')}`,
          priority: 'MEDIUM',
          category: 'LMS',
          actionUrl: `/events/${eventId}`,
          metadata: JSON.stringify({}),
        },
      })
      .catch((e: unknown) => {
        this.logger.warn({
          userId,
          action: 'EVENT_JOIN_NOTIFY',
          entityId: eventId,
          err: { message: e instanceof Error ? e.message : String(e) },
          msg: 'Falha ao notificar utilizador sobre inscrição no evento',
        });
      });

    // XP
    await this.prisma.userPoints
      .upsert({
        where: { userId },
        create: { userId, points: 5 },
        update: { points: { increment: 5 } },
      })
      .catch((e: unknown) => {
        this.logger.warn({
          userId,
          action: 'EVENT_JOIN_POINTS',
          entityId: eventId,
          err: { message: e instanceof Error ? e.message : String(e) },
          msg: 'Falha ao atribuir pontos de gamificação por inscrição em evento',
        });
      });

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
    await this.promoteFromWaitlist(eventId);

    return { message: 'Inscrição cancelada' };
  }

  private async assertEventExists(eventId: number) {
    const exists = await this.prisma.read.event.findUnique({
      where: { id: eventId },
      select: { id: true },
    });
    if (!exists) throw new NotFoundException('Evento não encontrado');
  }

  // Promove o próximo da lista de espera quando uma vaga é libertada — usado
  // por leave() (auto-serviço) e cancelParticipant() (RH/organizador, aba
  // Participantes docs/events.md #4).
  private async promoteFromWaitlist(eventId: number) {
    const event = await this.prisma.read.event.findUnique({ where: { id: eventId } });
    if (!event?.waitlistEnabled) return;

    const nextOnWaitlist = await this.prisma.read.eventParticipant.findFirst({
      where: { eventId, status: 'WAITLIST' },
      orderBy: { registeredAt: 'asc' },
    });
    if (!nextOnWaitlist) return;

    await this.prisma.eventParticipant.update({
      where: { id: nextOnWaitlist.id },
      data: { status: 'CONFIRMED', confirmedAt: new Date() },
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
      .catch((e: unknown) => {
        this.logger.warn({
          userId: nextOnWaitlist.userId,
          action: 'EVENT_WAITLIST_PROMOTED_NOTIFY',
          entityId: eventId,
          err: { message: e instanceof Error ? e.message : String(e) },
          msg: 'Falha ao notificar utilizador promovido da lista de espera',
        });
      });
  }

  async updateParticipantStatus(eventId: number, userId: number, dto: UpdateParticipantStatusDto) {
    return this.prisma.eventParticipant.update({
      where: { eventId_userId: { eventId, userId } },
      data: {
        status: dto.status,
        note: dto.note,
        confirmedAt: dto.status === ParticipantStatus.CONFIRMED ? new Date() : undefined,
      },
    });
  }

  // ─── GESTÃO DE PARTICIPANTES (docs/events.md #4) ───────────────────────────
  // Aba "Participantes": sempre no contexto de um evento seleccionado (a
  // listagem não expõe "Evento" como coluna própria — ver comentário em
  // ParticipantsTab.tsx). Distinto do DetailView "Participantes" (leitura
  // simples) por trazer filtros, acções de aprovação/rejeição/cancelamento,
  // adicionar/importar em massa e exportação CSV.

  async listParticipants(eventId: number, filters: EventParticipantFilterDto) {
    await this.assertEventExists(eventId);

    const { page = 1, limit = 20, status, departmentId, unitId, search } = filters;
    const { skip, take } = calculatePagination(page, limit);

    const userFilter: Prisma.UserWhereInput = {};
    if (departmentId) userFilter.departmentId = departmentId;
    if (unitId) userFilter.unitId = unitId;
    if (search) userFilter.fullName = { contains: search, mode: 'insensitive' };

    const where: Prisma.EventParticipantWhereInput = { eventId };
    if (status) where.status = status;
    if (Object.keys(userFilter).length > 0) where.user = userFilter;

    const [data, total] = await Promise.all([
      this.prisma.read.eventParticipant.findMany({
        where,
        skip,
        take,
        include: {
          user: {
            select: {
              id: true,
              fullName: true,
              avatarUrl: true,
              employeeNumber: true,
              position: { select: { name: true } },
              department: { select: { id: true, name: true } },
              unit: { select: { id: true, name: true } },
            },
          },
        },
        orderBy: { registeredAt: 'desc' },
      }),
      this.prisma.read.eventParticipant.count({ where }),
    ]);

    // "Certificado" e "Avaliação" (docs/events.md #4) — uma leitura extra por
    // página para todos os participantes, em vez de N consultas por linha.
    const userIds = data.map(p => p.userId);
    const [certs, feedbacks] = await Promise.all([
      userIds.length
        ? this.prisma.read.certificate.findMany({
            where: { eventId, userId: { in: userIds } },
            select: { userId: true },
          })
        : [],
      userIds.length
        ? this.prisma.read.eventFeedback.findMany({
            where: { eventId, userId: { in: userIds } },
            select: { userId: true },
          })
        : [],
    ]);
    const certSet = new Set(certs.map(c => c.userId));
    const feedbackSet = new Set(feedbacks.map(f => f.userId));

    const enrichedData = data.map(p => ({
      ...p,
      hasCertificate: certSet.has(p.userId),
      hasEvaluation: feedbackSet.has(p.userId),
    }));

    return buildPaginatedResponse(enrichedData, total, page, limit);
  }

  // "Adicionar participante" e "Importar participantes" (docs/events.md #4)
  // são a mesma operação (RH/organizador inscreve N colaboradores de uma vez,
  // sem passar pelo fluxo de aprovação — só o auto-serviço via join() respeita
  // requiresApproval); mesmo padrão de EnrollmentsService#bulkEnroll.
  async addParticipants(eventId: number, userIds: number[]) {
    const event = await this.prisma.read.event.findUnique({
      where: { id: eventId },
      select: { maxCapacity: true, waitlistEnabled: true },
    });
    if (!event) throw new NotFoundException('Evento não encontrado');
    const added: number[] = [];
    let skipped = 0;
    const errors: Array<{ userId: number; error: string }> = [];

    for (const userId of userIds) {
      try {
        const existing = await this.prisma.read.eventParticipant.findUnique({
          where: { eventId_userId: { eventId, userId } },
        });
        if (existing && !['CANCELLED', 'REJECTED'].includes(existing.status)) {
          skipped++;
          continue;
        }

        const participantCount = await this.prisma.read.eventParticipant.count({
          where: { eventId, status: { in: ['PENDING', 'CONFIRMED', 'PRESENT'] } },
        });
        let status: ParticipantStatus = ParticipantStatus.CONFIRMED;
        if (event.maxCapacity && participantCount >= event.maxCapacity) {
          if (!event.waitlistEnabled) {
            errors.push({ userId, error: 'Evento lotado' });
            continue;
          }
          status = ParticipantStatus.WAITLIST;
        }

        await this.prisma.eventParticipant.upsert({
          where: { eventId_userId: { eventId, userId } },
          create: {
            eventId,
            userId,
            status,
            registeredAt: new Date(),
            confirmedAt: status === ParticipantStatus.CONFIRMED ? new Date() : undefined,
          },
          update: {
            status,
            registeredAt: new Date(),
            confirmedAt: status === ParticipantStatus.CONFIRMED ? new Date() : null,
          },
        });
        added.push(userId);
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : String(e);
        errors.push({ userId, error: message });
        this.logger.warn(`addParticipants erro user ${userId} evento ${eventId}: ${message}`);
      }
    }

    return {
      success: added.length,
      skipped,
      errors: errors.length,
      total: userIds.length,
      details: { added, errors },
    };
  }

  async approveParticipant(eventId: number, userId: number, dto: ParticipantActionDto) {
    const participant = await this.prisma.read.eventParticipant.findUnique({
      where: { eventId_userId: { eventId, userId } },
    });
    if (!participant) throw new NotFoundException('Inscrição não encontrada');
    if (!['PENDING', 'WAITLIST'].includes(participant.status)) {
      throw new BadRequestException(
        'Só é possível aprovar inscrições pendentes ou em lista de espera',
      );
    }

    const updated = await this.prisma.eventParticipant.update({
      where: { eventId_userId: { eventId, userId } },
      data: { status: 'CONFIRMED', confirmedAt: new Date(), note: dto.note },
    });

    await this.prisma.notificationLog
      .create({
        data: {
          userId,
          type: 'EVENT_REGISTRATION_APPROVED',
          message: `A tua inscrição no evento foi aprovada e confirmada.`,
          priority: 'MEDIUM',
          category: 'LMS',
          actionUrl: `/events/${eventId}`,
        },
      })
      .catch((e: unknown) => {
        this.logger.warn({
          userId,
          action: 'EVENT_PARTICIPANT_APPROVE_NOTIFY',
          entityId: eventId,
          err: { message: e instanceof Error ? e.message : String(e) },
          msg: 'Falha ao notificar aprovação de inscrição',
        });
      });

    return updated;
  }

  async rejectParticipant(eventId: number, userId: number, dto: ParticipantActionDto) {
    const participant = await this.prisma.read.eventParticipant.findUnique({
      where: { eventId_userId: { eventId, userId } },
    });
    if (!participant) throw new NotFoundException('Inscrição não encontrada');

    const updated = await this.prisma.eventParticipant.update({
      where: { eventId_userId: { eventId, userId } },
      data: { status: 'REJECTED', note: dto.note },
    });
    await this.promoteFromWaitlist(eventId);

    await this.prisma.notificationLog
      .create({
        data: {
          userId,
          type: 'EVENT_REGISTRATION_REJECTED',
          message: `A tua inscrição no evento não foi aprovada.${dto.note ? ` Motivo: ${dto.note}` : ''}`,
          priority: 'MEDIUM',
          category: 'LMS',
          actionUrl: `/events/${eventId}`,
        },
      })
      .catch((e: unknown) => {
        this.logger.warn({
          userId,
          action: 'EVENT_PARTICIPANT_REJECT_NOTIFY',
          entityId: eventId,
          err: { message: e instanceof Error ? e.message : String(e) },
          msg: 'Falha ao notificar rejeição de inscrição',
        });
      });

    return updated;
  }

  // Cancelamento por RH/organizador (distinto de leave(), que é o
  // auto-serviço do próprio colaborador) — mesma promoção da lista de
  // espera, com notificação diferenciada.
  async cancelParticipant(eventId: number, userId: number, dto: ParticipantActionDto) {
    const participant = await this.prisma.read.eventParticipant.findUnique({
      where: { eventId_userId: { eventId, userId } },
    });
    if (!participant) throw new NotFoundException('Inscrição não encontrada');

    const updated = await this.prisma.eventParticipant.update({
      where: { eventId_userId: { eventId, userId } },
      data: { status: 'CANCELLED', note: dto.note },
    });
    await this.promoteFromWaitlist(eventId);

    await this.prisma.notificationLog
      .create({
        data: {
          userId,
          type: 'EVENT_REGISTRATION_CANCELLED',
          message: `A tua inscrição no evento foi cancelada pela organização.`,
          priority: 'MEDIUM',
          category: 'LMS',
          actionUrl: `/events/${eventId}`,
        },
      })
      .catch((e: unknown) => {
        this.logger.warn({
          userId,
          action: 'EVENT_PARTICIPANT_ADMIN_CANCEL_NOTIFY',
          entityId: eventId,
          err: { message: e instanceof Error ? e.message : String(e) },
          msg: 'Falha ao notificar cancelamento administrativo de inscrição',
        });
      });

    return updated;
  }

  async exportParticipantsCsv(
    eventId: number,
    filters: EventParticipantFilterDto,
  ): Promise<string> {
    const { page: _page, limit: _limit, ...rest } = filters;
    const { data } = await this.listParticipants(eventId, { ...rest, page: 1, limit: 100000 });

    const rows = data.map(p => ({
      colaborador: p.user.fullName,
      numeroColaborador: p.user.employeeNumber ?? '',
      cargo: p.user.position?.name ?? '',
      departamento: p.user.department?.name ?? '',
      unidade: p.user.unit?.name ?? '',
      dataInscricao: p.registeredAt.toISOString(),
      estadoInscricao: p.status,
      dataConfirmacao: p.confirmedAt ? p.confirmedAt.toISOString() : '',
      checkIn: p.checkedInAt ? p.checkedInAt.toISOString() : '',
      checkOut: p.checkedOutAt ? p.checkedOutAt.toISOString() : '',
      certificado: p.hasCertificate ? 'Sim' : 'Não',
      avaliacao: p.hasEvaluation ? 'Sim' : 'Não',
    }));

    return buildCsvString(rows, [
      'colaborador',
      'numeroColaborador',
      'cargo',
      'departamento',
      'unidade',
      'dataInscricao',
      'estadoInscricao',
      'dataConfirmacao',
      'checkIn',
      'checkOut',
      'certificado',
      'avaliacao',
    ]);
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
      data: {
        status: 'PRESENT',
        checkedInAt: new Date(),
        checkinMethod: dto.method ?? (dto.qrCode ? 'QR_CODE' : 'MOBILE_APP'),
      },
    });

    // XP por presença
    await this.prisma.userPoints
      .upsert({
        where: { userId },
        create: { userId, points: 20 },
        update: { points: { increment: 20 } },
      })
      .catch((e: unknown) => {
        this.logger.warn({
          userId,
          action: 'EVENT_CHECKIN_POINTS',
          entityId: dto.eventId,
          err: { message: e instanceof Error ? e.message : String(e) },
          msg: 'Falha ao atribuir pontos de gamificação por check-in em evento',
        });
      });

    return updated;
  }

  async checkOut(userId: number, dto: CheckOutDto) {
    const participant = await this.prisma.read.eventParticipant.findUnique({
      where: { eventId_userId: { eventId: dto.eventId, userId } },
    });
    if (!participant) throw new BadRequestException('Não inscrito neste evento');
    if (!participant.checkedInAt) throw new BadRequestException('Check-in ainda não foi realizado');

    return this.prisma.eventParticipant.update({
      where: { eventId_userId: { eventId: dto.eventId, userId } },
      data: { checkedOutAt: new Date() },
    });
  }

  // ─── Check-in & Presença — gestão administrativa (docs/events.md #9) ──────
  // "Evento" É coluna própria no spec — listagem cross-evento (mesmo critério
  // de Programação/Comunicação/Check-in), a partir de EventParticipant.

  private computeCheckinState(p: {
    status: string;
    checkedInAt: Date | null;
    checkedOutAt: Date | null;
  }): string {
    if (p.checkedOutAt) return 'SAIDA_REGISTADA';
    if (p.checkedInAt) return 'ENTRADA_REGISTADA';
    if (p.status === 'PRESENT') return 'PRESENTE';
    if (p.status === 'ABSENT' || p.status === 'NO_SHOW') return 'AUSENTE';
    return 'PENDENTE';
  }

  private computeDurationMinutes(checkedInAt: Date | null, checkedOutAt: Date | null) {
    if (!checkedInAt || !checkedOutAt) return null;
    return Math.round((checkedOutAt.getTime() - checkedInAt.getTime()) / 60_000);
  }

  private buildCheckinsWhere(filters: EventCheckinFilterDto): Prisma.EventParticipantWhereInput {
    const { eventId, departmentId, unitId, status, method, dateFrom, dateTo, search } = filters;
    const where: Prisma.EventParticipantWhereInput = {};
    if (eventId) where.eventId = eventId;
    if (status) where.status = status;
    if (method) where.checkinMethod = method;
    if (dateFrom || dateTo) {
      where.checkedInAt = {
        ...(dateFrom ? { gte: new Date(dateFrom) } : {}),
        ...(dateTo ? { lte: new Date(dateTo) } : {}),
      };
    }
    if (departmentId || unitId || search) {
      where.user = {
        ...(departmentId ? { departmentId } : {}),
        ...(unitId ? { unitId } : {}),
        ...(search ? { fullName: { contains: search, mode: 'insensitive' } } : {}),
      };
    }
    return where;
  }

  async listCheckins(filters: EventCheckinFilterDto) {
    const { page = 1, limit = 20 } = filters;
    const { skip, take } = calculatePagination(page, limit);
    const where = this.buildCheckinsWhere(filters);

    const [data, total] = await Promise.all([
      this.prisma.read.eventParticipant.findMany({
        where,
        skip,
        take,
        include: {
          event: { select: { id: true, title: true } },
          user: {
            select: {
              id: true,
              fullName: true,
              department: { select: { id: true, name: true } },
              unit: { select: { id: true, name: true } },
            },
          },
        },
        orderBy: [{ checkedInAt: 'desc' }, { registeredAt: 'desc' }],
      }),
      this.prisma.read.eventParticipant.count({ where }),
    ]);

    const enrichedData = data.map(p => ({
      ...p,
      checkinState: this.computeCheckinState(p),
      durationMinutes: this.computeDurationMinutes(p.checkedInAt, p.checkedOutAt),
    }));

    return buildPaginatedResponse(enrichedData, total, page, limit);
  }

  async exportCheckinsCsv(filters: EventCheckinFilterDto): Promise<string> {
    const { page: _page, limit: _limit, ...rest } = filters;
    const { data } = await this.listCheckins({ ...rest, page: 1, limit: 100000 });

    const rows = data.map(p => ({
      colaborador: p.user.fullName,
      departamento: p.user.department?.name ?? '',
      unidade: p.user.unit?.name ?? '',
      evento: p.event.title,
      data: p.registeredAt.toISOString(),
      entrada: p.checkedInAt ? p.checkedInAt.toISOString() : '',
      saida: p.checkedOutAt ? p.checkedOutAt.toISOString() : '',
      duracaoMinutos: p.durationMinutes ?? '',
      metodo: p.checkinMethod ?? '',
      estado: p.checkinState,
      observacao: p.checkinNote ?? '',
    }));

    return buildCsvString(rows, [
      'colaborador',
      'departamento',
      'unidade',
      'evento',
      'data',
      'entrada',
      'saida',
      'duracaoMinutos',
      'metodo',
      'estado',
      'observacao',
    ]);
  }

  async manualCheckIn(eventId: number, userId: number, dto: ManualCheckInDto) {
    const participant = await this.prisma.read.eventParticipant.findUnique({
      where: { eventId_userId: { eventId, userId } },
    });
    if (!participant) throw new NotFoundException('Participante não encontrado neste evento');

    return this.prisma.eventParticipant.update({
      where: { eventId_userId: { eventId, userId } },
      data: {
        status: 'PRESENT',
        checkedInAt: dto.at ? new Date(dto.at) : new Date(),
        checkinMethod: dto.method ?? 'MANUAL',
        checkinNote: dto.note,
      },
    });
  }

  async manualCheckOut(eventId: number, userId: number, dto: ManualCheckOutDto) {
    const participant = await this.prisma.read.eventParticipant.findUnique({
      where: { eventId_userId: { eventId, userId } },
    });
    if (!participant) throw new NotFoundException('Participante não encontrado neste evento');
    if (!participant.checkedInAt) throw new BadRequestException('Check-in ainda não foi realizado');

    return this.prisma.eventParticipant.update({
      where: { eventId_userId: { eventId, userId } },
      data: { checkedOutAt: dto.at ? new Date(dto.at) : new Date() },
    });
  }

  // ─── Presença por sessão (docs/events.md #9, quando o evento tem Programação) ─

  async getSessionAttendance(eventId: number, sessionId: number) {
    await this.assertSessionBelongsToEvent(eventId, sessionId);

    const [participants, attendances] = await Promise.all([
      this.prisma.read.eventParticipant.findMany({
        where: { eventId, status: { in: ['CONFIRMED', 'PRESENT'] } },
        select: { userId: true, user: { select: { id: true, fullName: true } } },
        orderBy: { user: { fullName: 'asc' } },
      }),
      this.prisma.read.eventSessionAttendance.findMany({ where: { sessionId } }),
    ]);

    const byUserId = new Map(attendances.map(a => [a.userId, a]));

    return participants.map(p => {
      const attendance = byUserId.get(p.userId);
      return {
        userId: p.userId,
        user: p.user,
        checkedInAt: attendance?.checkedInAt ?? null,
        checkedOutAt: attendance?.checkedOutAt ?? null,
        method: attendance?.method ?? null,
        durationMinutes: this.computeDurationMinutes(
          attendance?.checkedInAt ?? null,
          attendance?.checkedOutAt ?? null,
        ),
      };
    });
  }

  async sessionCheckIn(eventId: number, sessionId: number, userId: number, dto: ManualCheckInDto) {
    await this.assertSessionBelongsToEvent(eventId, sessionId);
    return this.prisma.eventSessionAttendance.upsert({
      where: { sessionId_userId: { sessionId, userId } },
      create: {
        sessionId,
        userId,
        checkedInAt: dto.at ? new Date(dto.at) : new Date(),
        method: dto.method ?? 'MANUAL',
      },
      update: {
        checkedInAt: dto.at ? new Date(dto.at) : new Date(),
        method: dto.method ?? 'MANUAL',
      },
    });
  }

  async sessionCheckOut(
    eventId: number,
    sessionId: number,
    userId: number,
    dto: ManualCheckOutDto,
  ) {
    await this.assertSessionBelongsToEvent(eventId, sessionId);
    const attendance = await this.prisma.read.eventSessionAttendance.findUnique({
      where: { sessionId_userId: { sessionId, userId } },
    });
    if (!attendance?.checkedInAt)
      throw new BadRequestException('Check-in da sessão ainda não foi realizado');

    return this.prisma.eventSessionAttendance.update({
      where: { sessionId_userId: { sessionId, userId } },
      data: { checkedOutAt: dto.at ? new Date(dto.at) : new Date() },
    });
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
      .catch((e: unknown) => {
        this.logger.warn({
          userId,
          action: 'EVENT_FEEDBACK_POINTS',
          entityId: eventId,
          err: { message: e instanceof Error ? e.message : String(e) },
          msg: 'Falha ao atribuir pontos de gamificação por feedback de evento',
        });
      });

    // Emitir certificado se cumprir critérios
    await this.autoIssueCertificate(eventId, userId).catch((e: unknown) => {
      this.logger.warn({
        userId,
        action: 'EVENT_AUTO_ISSUE_CERTIFICATE',
        entityId: eventId,
        err: { message: e instanceof Error ? e.message : String(e) },
        msg: 'Falha ao emitir certificado automático após feedback de evento',
      });
    });

    return feedback;
  }

  // ─── AVALIAÇÃO (docs/events.md #10) ────────────────────────────────────────
  // Cross-evento, mesmo critério de Check-in/Comunicação ("Evento" É coluna
  // própria no spec: "Evento, participante, data, avaliação geral…"). Base é
  // EventParticipant (todos os inscritos, não só quem já avaliou) para que
  // o "estado" Avaliado/Pendente seja visível por linha — mesmo padrão de
  // computeCheckinState, `evaluation`/`status` calculados, nunca persistidos.

  private buildEvaluationsWhere(
    filters: EventEvaluationFilterDto,
  ): Prisma.EventParticipantWhereInput {
    const { eventId, departmentId, unitId, search } = filters;
    const where: Prisma.EventParticipantWhereInput = {};
    if (eventId) where.eventId = eventId;
    if (departmentId || unitId || search) {
      where.user = {
        ...(departmentId ? { departmentId } : {}),
        ...(unitId ? { unitId } : {}),
        ...(search ? { fullName: { contains: search, mode: 'insensitive' } } : {}),
      };
    }
    return where;
  }

  async listEvaluations(filters: EventEvaluationFilterDto) {
    const { page = 1, limit = 20 } = filters;
    const { skip, take } = calculatePagination(page, limit);
    const where = this.buildEvaluationsWhere(filters);

    const [data, total] = await Promise.all([
      this.prisma.read.eventParticipant.findMany({
        where,
        skip,
        take,
        include: {
          event: { select: { id: true, title: true } },
          user: {
            select: {
              id: true,
              fullName: true,
              department: { select: { id: true, name: true } },
              unit: { select: { id: true, name: true } },
            },
          },
        },
        orderBy: { registeredAt: 'desc' },
      }),
      this.prisma.read.eventParticipant.count({ where }),
    ]);

    // Uma leitura extra para todos os pares evento/participante da página,
    // em vez de N consultas por linha (mesmo padrão de listParticipants).
    const pairs = data.map(p => ({ eventId: p.eventId, userId: p.userId }));
    const feedbacks = pairs.length
      ? await this.prisma.read.eventFeedback.findMany({
          where: { OR: pairs.map(p => ({ eventId: p.eventId, userId: p.userId })) },
        })
      : [];
    const feedbackMap = new Map(feedbacks.map(f => [`${f.eventId}:${f.userId}`, f]));

    const enrichedData = data.map(p => {
      const evaluation = feedbackMap.get(`${p.eventId}:${p.userId}`) ?? null;
      return {
        ...p,
        evaluation,
        // Distinto de `status` (estado da inscrição, já em `p`) — nunca
        // persistido, mesma convenção de computeCheckinState.
        evaluationStatus: evaluation ? ('AVALIADO' as const) : ('PENDENTE' as const),
      };
    });

    return buildPaginatedResponse(enrichedData, total, page, limit);
  }

  async exportEvaluationsCsv(filters: EventEvaluationFilterDto): Promise<string> {
    const { page: _page, limit: _limit, ...rest } = filters;
    const { data } = await this.listEvaluations({ ...rest, page: 1, limit: 100000 });

    const rows = data.map(p => ({
      colaborador: p.user.fullName,
      departamento: p.user.department?.name ?? '',
      unidade: p.user.unit?.name ?? '',
      evento: p.event.title,
      data: p.evaluation?.createdAt ? p.evaluation.createdAt.toISOString() : '',
      avaliacaoGeral: p.evaluation?.rating ?? '',
      organizacao: p.evaluation?.organizationRating ?? '',
      conteudo: p.evaluation?.contentRating ?? '',
      local: p.evaluation?.locationRating ?? '',
      oradores: p.evaluation?.speakersRating ?? '',
      logistica: p.evaluation?.logisticsRating ?? '',
      comunicacao: p.evaluation?.communicationRating ?? '',
      recomendacaoNps: p.evaluation?.nps ?? '',
      participariaNovamente: p.evaluation?.wouldAttendAgain ?? '',
      comentario: p.evaluation?.comment ?? '',
      estado: p.evaluationStatus,
    }));

    return buildCsvString(rows, [
      'colaborador',
      'departamento',
      'unidade',
      'evento',
      'data',
      'avaliacaoGeral',
      'organizacao',
      'conteudo',
      'local',
      'oradores',
      'logistica',
      'comunicacao',
      'recomendacaoNps',
      'participariaNovamente',
      'comentario',
      'estado',
    ]);
  }

  // ─── CERTIFICADOS ─────────────────────────────────────────────────────────

  private async autoIssueCertificate(eventId: number, userId: number) {
    const event = await this.prisma.read.event.findUnique({ where: { id: eventId } });
    if (!event?.certificateEnabled) return;

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
        // CertificateType não tem valor EVENT (achado estrutural, ver
        // schema.prisma) — usa-se COURSE como o mais próximo disponível.
        // Enum real, não 'as any': mesmo comportamento em runtime.
        type: CertificateType.COURSE,
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
      .catch((e: unknown) => {
        this.logger.warn({
          userId,
          action: 'EVENT_CERTIFICATE_ISSUED_NOTIFY',
          entityId: eventId,
          err: { message: e instanceof Error ? e.message : String(e) },
          msg: 'Falha ao notificar utilizador sobre emissão de certificado de evento',
        });
      });
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
      const feedbacks = e.feedbacks;
      const avgNps =
        feedbacks.length > 0
          ? Math.round((feedbacks.reduce((s, f) => s + f.nps, 0) / feedbacks.length) * 10) / 10
          : null;
      const maxCap = e.maxCapacity;
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
      upcoming: participations.filter(p => new Date(p.event.startAt) >= now),
      past: participations.filter(p => new Date(p.event.startAt) < now),
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
      isFull: e.maxCapacity ? e._count.participants >= e.maxCapacity : false,
      occupancyRate: e.maxCapacity
        ? Math.round((e._count.participants / e.maxCapacity) * 100)
        : null,
    }));
  }

  // ─── STATS / DASHBOARD ──────────────────────────────────────────────────
  // Alimenta a aba "Visão Geral" (docs/events.md #1). Estende o antigo
  // getStats (total/totalParticipants/byType/byStatus mantidos por
  // compatibilidade) com os restantes indicadores do spec: breakdown por
  // unidade/departamento, inscrições pendentes, check-ins realizados,
  // avaliações pendentes, taxa de participação e a lista de próximos
  // eventos. Uma única findMany para os breakdowns por tipo/estado/
  // departamento/unidade (mesmo padrão de OnboardingService#getDashboard) —
  // evita groupBy sobre campos de relação, que o Prisma não suporta.

  async getStats() {
    const now = new Date();

    const [
      total,
      events,
      registeredParticipants,
      confirmedParticipants,
      presentParticipants,
      pendingRegistrations,
      feedbacks,
      upcomingEvents,
    ] = await Promise.all([
      this.prisma.read.event.count(),
      this.prisma.read.event.findMany({
        select: {
          type: true,
          status: true,
          startAt: true,
          department: { select: { name: true } },
          unit: { select: { name: true } },
        },
      }),
      this.prisma.read.eventParticipant.count({
        where: { status: { in: ['PENDING', 'CONFIRMED', 'WAITLIST', 'PRESENT'] } },
      }),
      this.prisma.read.eventParticipant.count({
        where: { status: { in: ['CONFIRMED', 'PRESENT'] } },
      }),
      this.prisma.read.eventParticipant.count({ where: { status: 'PRESENT' } }),
      this.prisma.read.eventParticipant.count({ where: { status: 'PENDING' } }),
      this.prisma.read.eventFeedback.findMany({ select: { id: true } }),
      this.prisma.read.event.findMany({
        where: { startAt: { gte: now }, status: 'PUBLISHED' },
        select: {
          id: true,
          title: true,
          type: true,
          status: true,
          startAt: true,
          location: true,
          modalidade: true,
          _count: { select: { participants: true } },
        },
        orderBy: { startAt: 'asc' },
        take: 8,
      }),
    ]);

    const countBy = (rows: string[]) =>
      rows.reduce<Record<string, number>>((acc, key) => {
        acc[key] = (acc[key] ?? 0) + 1;
        return acc;
      }, {});

    const byType = countBy(events.map(e => e.type));
    const byStatus = countBy(events.map(e => e.status));
    const byDepartment = countBy(events.map(e => e.department?.name ?? 'Sem departamento'));
    const byUnit = countBy(events.map(e => e.unit?.name ?? 'Sem unidade'));

    const upcomingCount = events.filter(
      e => e.status === 'PUBLISHED' && new Date(e.startAt) >= now,
    ).length;

    // Aproximação: participantes presentes em qualquer evento menos o total
    // de avaliações já submetidas — sem cruzar por evento/participante
    // individual (manter simples para um KPI de dashboard).
    const pendingEvaluations = Math.max(presentParticipants - feedbacks.length, 0);
    const participationRate =
      confirmedParticipants > 0
        ? Math.round((presentParticipants / confirmedParticipants) * 100)
        : 0;

    return {
      total,
      byType,
      byStatus,
      byDepartment,
      byUnit,
      totalParticipants: confirmedParticipants,
      registeredParticipants,
      confirmedParticipants,
      checkinsDone: presentParticipants,
      pendingRegistrations,
      pendingEvaluations,
      participationRate,
      upcomingCount,
      liveCount: byStatus.LIVE ?? 0,
      endedCount: byStatus.ENDED ?? 0,
      cancelledCount: byStatus.CANCELLED ?? 0,
      upcomingEvents,
    };
  }

  // ─── RELATÓRIOS (docs/events.md #11) ───────────────────────────────────────
  // Um `event.findMany` (select mínimo) + 3 leituras batched (participantes/
  // feedback/presença-por-sessão dos eventos filtrados) computam localmente
  // todos os breakdowns — mesmo padrão de getStats/TrainingsService#getReports,
  // sem groupBy através de relações (Prisma não suporta).

  private buildReportsWhere(filters: EventReportFilterDto): Prisma.EventWhereInput {
    const where: Prisma.EventWhereInput = {};
    if (filters.year) {
      where.startAt = {
        gte: new Date(filters.year, 0, 1),
        lt: new Date(filters.year + 1, 0, 1),
      };
    }
    if (filters.eventId) where.id = filters.eventId;
    if (filters.type) where.type = filters.type;
    if (filters.departmentId) where.departmentId = filters.departmentId;
    if (filters.unitId) where.unitId = filters.unitId;
    if (filters.responsibleId) where.responsibleId = filters.responsibleId;
    if (filters.status) where.status = filters.status;
    if (filters.location) where.location = { contains: filters.location, mode: 'insensitive' };
    return where;
  }

  async getReports(filters: EventReportFilterDto) {
    const where = this.buildReportsWhere(filters);

    const events = await this.prisma.read.event.findMany({
      where,
      select: {
        id: true,
        title: true,
        type: true,
        status: true,
        modalidade: true,
        startAt: true,
        maxCapacity: true,
        department: { select: { name: true } },
        unit: { select: { name: true } },
        logistics: { select: { budget: true, actualCost: true } },
      },
    });
    const eventIds = events.map(e => e.id);

    // `in: []` devolve sempre [] no Prisma — sem ternário condicional, evita
    // que o tipo da tupla do Promise.all fique em união com `never[]` (isso
    // faz o TS escolher a sobrecarga errada de .reduce() mais abaixo).
    const [participants, feedbacks, sessions] = await Promise.all([
      this.prisma.read.eventParticipant.findMany({
        where: { eventId: { in: eventIds } },
        select: { eventId: true, status: true, checkedInAt: true },
      }),
      this.prisma.read.eventFeedback.findMany({
        where: { eventId: { in: eventIds } },
        select: { eventId: true, rating: true, nps: true, speakersRating: true },
      }),
      this.prisma.read.eventSession.findMany({
        where: { eventId: { in: eventIds } },
        select: { id: true, attendances: { select: { checkedInAt: true } } },
      }),
    ]);

    const countBy = <T extends string>(rows: T[]) =>
      rows.reduce<Record<string, number>>((acc, key) => {
        acc[key] = (acc[key] ?? 0) + 1;
        return acc;
      }, {});

    const byPeriodMap = new Map<string, number>();
    for (const e of events) {
      const d = new Date(e.startAt);
      const period = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      byPeriodMap.set(period, (byPeriodMap.get(period) ?? 0) + 1);
    }
    const byPeriod = Array.from(byPeriodMap.entries())
      .map(([period, count]) => ({ period, count }))
      .sort((a, b) => a.period.localeCompare(b.period));

    const toSortedArray = (m: Record<string, number>, key: string) =>
      Object.entries(m)
        .map(([k, count]) => ({ [key]: k, count }))
        .sort((a, b) => b.count - a.count);

    const byUnit = toSortedArray(countBy(events.map(e => e.unit?.name ?? 'Sem unidade')), 'unit');
    const byDepartment = toSortedArray(
      countBy(events.map(e => e.department?.name ?? 'Sem departamento')),
      'department',
    );
    const byModality = toSortedArray(countBy(events.map(e => e.modalidade)), 'modalidade');

    const registered = participants.filter(p =>
      ['PENDING', 'CONFIRMED', 'WAITLIST', 'PRESENT', 'ABSENT', 'NO_SHOW'].includes(p.status),
    );
    const confirmed = participants.filter(p => ['CONFIRMED', 'PRESENT'].includes(p.status));
    const present = participants.filter(p => p.status === 'PRESENT' || p.checkedInAt);
    const absences = participants.filter(p => ['ABSENT', 'NO_SHOW'].includes(p.status));
    const totalCapacity = events.reduce((sum, e) => sum + e.maxCapacity, 0);

    const participantsByEvent = new Map<number, number>();
    for (const p of registered) {
      participantsByEvent.set(p.eventId, (participantsByEvent.get(p.eventId) ?? 0) + 1);
    }
    const topEventsByParticipants = events
      .map(e => ({
        eventId: e.id,
        title: e.title,
        participants: participantsByEvent.get(e.id) ?? 0,
      }))
      .sort((a, b) => b.participants - a.participants)
      .slice(0, 10);

    const totalBudget = events.reduce((sum, e) => sum + (e.logistics?.budget ?? 0), 0);
    const totalActualCost = events.reduce((sum, e) => sum + (e.logistics?.actualCost ?? 0), 0);
    const costsByEvent = events
      .filter(e => e.logistics?.budget != null || e.logistics?.actualCost != null)
      .map(e => ({
        eventId: e.id,
        title: e.title,
        budget: e.logistics?.budget ?? 0,
        actualCost: e.logistics?.actualCost ?? 0,
      }))
      .sort((a, b) => b.actualCost - a.actualCost)
      .slice(0, 10);

    const ratedFeedbacks = feedbacks.filter(f => f.rating != null);
    const avgRating =
      ratedFeedbacks.length > 0
        ? Math.round(
            (ratedFeedbacks.reduce((s, f) => s + (f.rating ?? 0), 0) / ratedFeedbacks.length) * 10,
          ) / 10
        : null;
    const avgNps =
      feedbacks.length > 0
        ? Math.round((feedbacks.reduce((s, f) => s + f.nps, 0) / feedbacks.length) * 10) / 10
        : null;
    const speakerFeedbacks = feedbacks.filter(f => f.speakersRating != null);
    const avgSpeakersRating =
      speakerFeedbacks.length > 0
        ? Math.round(
            (speakerFeedbacks.reduce((s, f) => s + (f.speakersRating ?? 0), 0) /
              speakerFeedbacks.length) *
              10,
          ) / 10
        : null;

    const allAttendances = sessions.flatMap(s => s.attendances);
    const sessionCheckedIn = allAttendances.filter(a => a.checkedInAt).length;

    return {
      filters,
      totals: {
        events: events.length,
        draft: events.filter(e => e.status === 'DRAFT').length,
        published: events.filter(e => e.status === 'PUBLISHED').length,
        live: events.filter(e => e.status === 'LIVE').length,
        ended: events.filter(e => e.status === 'ENDED').length,
        cancelled: events.filter(e => e.status === 'CANCELLED').length,
      },
      byPeriod,
      byUnit,
      byDepartment,
      byModality,
      topEventsByParticipants,
      registration: {
        registered: registered.length,
        capacity: totalCapacity,
        rate: totalCapacity > 0 ? Math.round((registered.length / totalCapacity) * 100) : 0,
      },
      confirmation: {
        confirmed: confirmed.length,
        registered: registered.length,
        rate: registered.length > 0 ? Math.round((confirmed.length / registered.length) * 100) : 0,
      },
      participation: {
        present: present.length,
        confirmed: confirmed.length,
        rate: confirmed.length > 0 ? Math.round((present.length / confirmed.length) * 100) : 0,
        absences: absences.length,
      },
      checkins: { total: present.length },
      sessionAttendance: {
        total: allAttendances.length,
        checkedIn: sessionCheckedIn,
        rate:
          allAttendances.length > 0
            ? Math.round((sessionCheckedIn / allAttendances.length) * 100)
            : 0,
      },
      costs: {
        budget: Math.round(totalBudget * 100) / 100,
        actualCost: Math.round(totalActualCost * 100) / 100,
        budgetExecutionRate:
          totalBudget > 0 ? Math.round((totalActualCost / totalBudget) * 100) : 0,
        byEvent: costsByEvent,
      },
      satisfaction: { avgRating, responses: ratedFeedbacks.length },
      speakers: { avgRating: avgSpeakersRating },
      nps: { avg: avgNps, responses: feedbacks.length },
    };
  }

  async exportReportsCsv(filters: EventReportFilterDto): Promise<string> {
    const report = await this.getReports(filters);
    const rows = [
      { metrica: 'Eventos (total)', valor: report.totals.events },
      { metrica: 'Eventos publicados', valor: report.totals.published },
      { metrica: 'Eventos ao vivo', valor: report.totals.live },
      { metrica: 'Eventos concluídos', valor: report.totals.ended },
      { metrica: 'Eventos cancelados', valor: report.totals.cancelled },
      { metrica: 'Inscritos', valor: report.registration.registered },
      { metrica: 'Taxa de inscrição (%)', valor: report.registration.rate },
      { metrica: 'Confirmados', valor: report.confirmation.confirmed },
      { metrica: 'Taxa de confirmação (%)', valor: report.confirmation.rate },
      { metrica: 'Presentes', valor: report.participation.present },
      { metrica: 'Taxa de participação (%)', valor: report.participation.rate },
      { metrica: 'Ausências', valor: report.participation.absences },
      { metrica: 'Check-ins realizados', valor: report.checkins.total },
      { metrica: 'Presenças por sessão (registadas)', valor: report.sessionAttendance.total },
      { metrica: 'Presenças por sessão (check-in)', valor: report.sessionAttendance.checkedIn },
      { metrica: 'Orçamento (total)', valor: report.costs.budget },
      { metrica: 'Custo real (total)', valor: report.costs.actualCost },
      { metrica: 'Execução orçamental (%)', valor: report.costs.budgetExecutionRate },
      { metrica: 'Satisfação média (1-5)', valor: report.satisfaction.avgRating ?? '' },
      { metrica: 'NPS médio', valor: report.nps.avg ?? '' },
      { metrica: 'Avaliação média dos oradores (1-5)', valor: report.speakers.avgRating ?? '' },
    ];
    return buildCsvString(rows, ['metrica', 'valor']);
  }

  // ─── CALENDÁRIO (docs/events.md #3) ────────────────────────────────────────
  // Calendário central — intervalo de datas obrigatório (mês/semana/dia
  // decididos no frontend, aqui é só o intervalo). "Responsável" cai para o
  // organizador quando o evento não tem responsável dedicado, mesma
  // convenção do resto do módulo.

  async getCalendar(filters: EventCalendarFilterDto) {
    const { from, to, type, status, departmentId, unitId, responsibleId, location } = filters;

    const where: Prisma.EventWhereInput = {
      startAt: { gte: new Date(from), lte: new Date(to) },
    };
    if (type) where.type = type;
    if (status) where.status = status;
    if (departmentId) where.departmentId = departmentId;
    if (unitId) where.unitId = unitId;
    if (location) where.location = { contains: location, mode: 'insensitive' };
    if (responsibleId) {
      where.OR = [{ responsibleId }, { responsibleId: null, organizerId: responsibleId }];
    }

    const events = await this.prisma.read.event.findMany({
      where,
      select: {
        id: true,
        title: true,
        startAt: true,
        endAt: true,
        location: true,
        type: true,
        status: true,
        modalidade: true,
        responsible: { select: { id: true, fullName: true } },
        organizer: { select: { id: true, fullName: true } },
        _count: { select: { participants: true } },
      },
      orderBy: { startAt: 'asc' },
    });

    return events.map(e => ({
      id: e.id,
      title: e.title,
      startAt: e.startAt,
      endAt: e.endAt,
      durationMinutes: Math.round((e.endAt.getTime() - e.startAt.getTime()) / 60_000),
      location: e.location,
      responsible: e.responsible ?? e.organizer,
      type: e.type,
      status: e.status,
      modalidade: e.modalidade,
      participants: e._count.participants,
    }));
  }

  // ─── PROGRAMAÇÃO (docs/events.md #5) ───────────────────────────────────────
  // Aba "Programação": ao contrário de Participantes/Locais & Logística, o
  // spec traz "Evento" como coluna própria (#5 lista "Evento, sessão/
  // actividade, título…") — por isso a listagem é top-level (todas as
  // sessões de todos os eventos, com filtro opcional por evento), mesmo
  // padrão de LiveClassesService#listAllSessions. Criação/edição/eliminação
  // continuam aninhadas em /events/:id/sessions porque uma sessão pertence
  // sempre a um evento concreto.

  async listAllSessions(filters: EventSessionFilterDto) {
    const {
      page = 1,
      limit = 20,
      eventId,
      departmentId,
      unitId,
      responsibleId,
      status,
      dateFrom,
      dateTo,
      search,
    } = filters;
    const { skip, take } = calculatePagination(page, limit);

    const where: Prisma.EventSessionWhereInput = {};
    if (eventId) where.eventId = eventId;
    if (responsibleId) where.responsibleId = responsibleId;
    if (status) where.status = status;
    if (search) where.title = { contains: search, mode: 'insensitive' };
    if (dateFrom || dateTo) {
      where.startAt = {
        ...(dateFrom ? { gte: new Date(dateFrom) } : {}),
        ...(dateTo ? { lte: new Date(dateTo) } : {}),
      };
    }
    if (departmentId || unitId) {
      where.event = {
        ...(departmentId ? { departmentId } : {}),
        ...(unitId ? { unitId } : {}),
      };
    }

    const [data, total] = await Promise.all([
      this.prisma.read.eventSession.findMany({
        where,
        skip,
        take,
        include: {
          event: { select: { id: true, title: true, departmentId: true, unitId: true } },
          responsible: { select: { id: true, fullName: true } },
        },
        orderBy: { startAt: 'asc' },
      }),
      this.prisma.read.eventSession.count({ where }),
    ]);

    const enrichedData = data.map(s => ({
      ...s,
      durationMinutes: Math.round((s.endAt.getTime() - s.startAt.getTime()) / 60_000),
    }));

    return buildPaginatedResponse(enrichedData, total, page, limit);
  }

  async createSession(eventId: number, dto: CreateEventSessionDto) {
    await this.assertEventExists(eventId);
    return this.prisma.eventSession.create({
      data: {
        eventId,
        title: dto.title,
        description: dto.description,
        startAt: new Date(dto.startAt),
        endAt: new Date(dto.endAt),
        location: dto.location,
        room: dto.room,
        responsibleId: dto.responsibleId,
        speaker: dto.speaker,
        capacity: dto.capacity,
        status: dto.status ?? 'SCHEDULED',
      },
      include: { responsible: { select: { id: true, fullName: true } } },
    });
  }

  async updateSession(eventId: number, sessionId: number, dto: UpdateEventSessionDto) {
    const session = await this.prisma.read.eventSession.findUnique({ where: { id: sessionId } });
    if (!session || session.eventId !== eventId)
      throw new NotFoundException('Sessão não encontrada');

    const { startAt, endAt, ...rest } = dto;
    return this.prisma.eventSession.update({
      where: { id: sessionId },
      data: {
        ...rest,
        ...(startAt ? { startAt: new Date(startAt) } : {}),
        ...(endAt ? { endAt: new Date(endAt) } : {}),
      },
      include: { responsible: { select: { id: true, fullName: true } } },
    });
  }

  async deleteSession(eventId: number, sessionId: number) {
    const session = await this.prisma.read.eventSession.findUnique({ where: { id: sessionId } });
    if (!session || session.eventId !== eventId)
      throw new NotFoundException('Sessão não encontrada');
    await this.prisma.eventSession.delete({ where: { id: sessionId } });
    return { message: 'Sessão removida' };
  }

  // ─── LOCAIS & LOGÍSTICA (docs/events.md #6) ────────────────────────────────
  // Um registo por evento (relação 1:1) — sem "Evento" como coluna própria no
  // spec, tal como Participantes, o contexto é sempre UM evento seleccionado.
  // GET devolve null quando ainda não há registo (frontend mostra o
  // formulário vazio); PUT faz upsert — cobre criar e editar com um único
  // botão "Guardar".

  async getLogistics(eventId: number) {
    await this.assertEventExists(eventId);
    return this.prisma.read.eventLogistics.findUnique({
      where: { eventId },
      include: { responsible: { select: { id: true, fullName: true } } },
    });
  }

  async upsertLogistics(eventId: number, dto: UpsertEventLogisticsDto) {
    await this.assertEventExists(eventId);
    const data = {
      responsibleId: dto.responsibleId,
      equipment: dto.equipment ?? [],
      resourcesNeeded: dto.resourcesNeeded,
      suppliers: dto.suppliers,
      catering: dto.catering,
      transport: dto.transport,
      accommodation: dto.accommodation,
      security: dto.security,
      decoration: dto.decoration,
      budget: dto.budget,
      actualCost: dto.actualCost,
      status: dto.status ?? 'PLANNED',
    };
    return this.prisma.eventLogistics.upsert({
      where: { eventId },
      create: { eventId, ...data },
      update: data,
      include: { responsible: { select: { id: true, fullName: true } } },
    });
  }

  // ─── ORADORES & CONVIDADOS (docs/events.md #7) ─────────────────────────────
  // Sem "Evento" como coluna própria no spec — contexto é sempre UM evento
  // seleccionado (mesmo critério de Locais & Logística/Participantes),
  // listagem 100% aninhada em /events/:id/speakers.

  async listSpeakers(eventId: number, filters: EventSpeakerFilterDto) {
    await this.assertEventExists(eventId);
    const { page = 1, limit = 20, type, status, sessionId, search } = filters;
    const { skip, take } = calculatePagination(page, limit);

    const where: Prisma.EventSpeakerWhereInput = { eventId };
    if (type) where.type = type;
    if (status) where.status = status;
    if (sessionId) where.sessionId = sessionId;
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { organization: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [data, total] = await Promise.all([
      this.prisma.read.eventSpeaker.findMany({
        where,
        skip,
        take,
        include: { session: { select: { id: true, title: true, startAt: true, endAt: true } } },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.read.eventSpeaker.count({ where }),
    ]);

    return buildPaginatedResponse(data, total, page, limit);
  }

  async createSpeaker(eventId: number, dto: CreateEventSpeakerDto) {
    await this.assertEventExists(eventId);
    if (dto.sessionId) await this.assertSessionBelongsToEvent(eventId, dto.sessionId);
    return this.prisma.eventSpeaker.create({
      data: { eventId, ...dto, status: dto.status ?? 'INVITED' },
      include: { session: { select: { id: true, title: true, startAt: true, endAt: true } } },
    });
  }

  async updateSpeaker(eventId: number, speakerId: number, dto: UpdateEventSpeakerDto) {
    const speaker = await this.prisma.read.eventSpeaker.findUnique({ where: { id: speakerId } });
    if (!speaker || speaker.eventId !== eventId)
      throw new NotFoundException('Orador/convidado não encontrado');
    if (dto.sessionId) await this.assertSessionBelongsToEvent(eventId, dto.sessionId);
    return this.prisma.eventSpeaker.update({
      where: { id: speakerId },
      data: dto,
      include: { session: { select: { id: true, title: true, startAt: true, endAt: true } } },
    });
  }

  async deleteSpeaker(eventId: number, speakerId: number) {
    const speaker = await this.prisma.read.eventSpeaker.findUnique({ where: { id: speakerId } });
    if (!speaker || speaker.eventId !== eventId)
      throw new NotFoundException('Orador/convidado não encontrado');
    await this.prisma.eventSpeaker.delete({ where: { id: speakerId } });
    return { message: 'Orador/convidado removido' };
  }

  private async assertSessionBelongsToEvent(eventId: number, sessionId: number) {
    const session = await this.prisma.read.eventSession.findUnique({ where: { id: sessionId } });
    if (!session || session.eventId !== eventId)
      throw new BadRequestException('Sessão não pertence a este evento');
  }

  // ─── COMUNICAÇÃO (docs/events.md #8) ───────────────────────────────────────
  // "Evento" É coluna própria no spec — listagem cross-evento (mesmo critério
  // de Programação). Envio real, não decorativo: INNOVA_NOTIFICATION cria um
  // NotificationLog por destinatário (NotificationsService#sendBulk — só
  // regista, sem despachar canais externos por si, ver o próprio comentário
  // do método); EMAIL/SMS/WHATSAPP despacham via MailService/SmsService, os
  // mesmos serviços já usados por NotificationsService#send e
  // AutomationService — melhor esforço, nunca bloqueiam a criação do registo
  // se SMTP/Twilio não estiverem configurados.

  async listAllCommunications(filters: EventCommunicationFilterDto) {
    const { page = 1, limit = 20, eventId, type, channel, status } = filters;
    const { skip, take } = calculatePagination(page, limit);

    const where: Prisma.EventCommunicationWhereInput = {};
    if (eventId) where.eventId = eventId;
    if (type) where.type = type;
    if (channel) where.channel = channel;
    if (status) where.status = status;

    const [data, total] = await Promise.all([
      this.prisma.read.eventCommunication.findMany({
        where,
        skip,
        take,
        include: {
          event: { select: { id: true, title: true } },
          createdBy: { select: { id: true, fullName: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.read.eventCommunication.count({ where }),
    ]);

    return buildPaginatedResponse(data, total, page, limit);
  }

  async createCommunication(
    eventId: number,
    createdById: number,
    dto: CreateEventCommunicationDto,
  ) {
    await this.assertEventExists(eventId);

    const participants = await this.prisma.read.eventParticipant.findMany({
      where: {
        eventId,
        ...(dto.participantStatuses?.length ? { status: { in: dto.participantStatuses } } : {}),
      },
      select: { userId: true, user: { select: { id: true, email: true, phone: true } } },
    });
    if (participants.length === 0) {
      throw new BadRequestException('Nenhum destinatário corresponde aos filtros indicados');
    }
    const recipientIds = participants.map(p => p.userId);

    await this.deliverCommunication(dto.channel, dto.subject, dto.message, participants);

    return this.prisma.eventCommunication.create({
      data: {
        eventId,
        type: dto.type,
        subject: dto.subject,
        message: dto.message,
        channel: dto.channel,
        recipientIds,
        recipientCount: recipientIds.length,
        status: 'SENT',
        sentAt: new Date(),
        createdById,
      },
      include: {
        event: { select: { id: true, title: true } },
        createdBy: { select: { id: true, fullName: true } },
      },
    });
  }

  private async deliverCommunication(
    channel: CreateEventCommunicationDto['channel'],
    subject: string,
    message: string,
    participants: Array<{
      userId: number;
      user: { id: number; email: string; phone: string | null };
    }>,
  ): Promise<void> {
    const onFail = (userId: number, ch: string) => (e: unknown) =>
      this.logger.warn({
        userId,
        channel: ch,
        err: { message: e instanceof Error ? e.message : String(e) },
        msg: `Falha ao entregar comunicação de evento por ${ch} — registo interno já será criado`,
      });

    if (channel === 'INNOVA_NOTIFICATION') {
      await this.notifications.sendBulk({
        userIds: participants.map(p => p.userId),
        type: 'EVENT_COMMUNICATION',
        title: subject,
        message,
        category: 'ENGAGEMENT',
      });
      return;
    }

    if (channel === 'EMAIL') {
      await Promise.all(
        participants.map(p =>
          this.mail
            .sendNotification(p.user.email, subject, message)
            .catch(onFail(p.userId, 'email')),
        ),
      );
      return;
    }

    if (channel === 'SMS') {
      await Promise.all(
        participants
          .filter(p => p.user.phone)
          .map(p => this.sms.sendSms(p.user.phone, message).catch(onFail(p.userId, 'sms'))),
      );
      return;
    }

    if (channel === 'WHATSAPP') {
      await Promise.all(
        participants
          .filter(p => p.user.phone)
          .map(p =>
            this.sms.sendWhatsApp(p.user.phone, message).catch(onFail(p.userId, 'whatsapp')),
          ),
      );
    }
  }
}
