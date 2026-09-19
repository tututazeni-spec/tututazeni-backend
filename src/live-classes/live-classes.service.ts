import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { Prisma, LiveClassStatus, LiveClassRecurrence } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateLiveClassDto,
  UpdateLiveClassDto,
  LiveChatMessageDto,
  PostClassResponseDto,
  LiveClassFilterDto,
  PostponeLiveClassDto,
  CancelLiveClassDto,
  CreateLiveClassSessionDto,
  UpdateLiveClassSessionDto,
} from './live-classes.dto';
import { calculatePagination, buildPaginatedResponse } from '../common/helpers/pagination.helper';

// Limite de segurança para a expansão de sessões recorrentes — evita um
// intervalo mal preenchido (ex.: recurrenceEndDate a 10 anos de distância)
// gerar milhares de linhas numa só criação.
const MAX_GENERATED_SESSIONS = 200;

const CLASS_INCLUDE = {
  course: { select: { id: true, title: true } },
  module: { select: { id: true, title: true } },
  lesson: { select: { id: true, title: true } },
  instructor: { select: { id: true, name: true, email: true } },
  coInstructor: { select: { id: true, name: true, email: true } },
  _count: { select: { attendances: true, messages: true, sessions: true } },
  postEvaluation: true,
} satisfies Prisma.LiveClassInclude;

@Injectable()
export class LiveClassesService {
  constructor(private prisma: PrismaService) {}

  async findAll(filters: LiveClassFilterDto) {
    const { page = 1, limit = 20 } = filters;
    const { skip, take } = calculatePagination(page, limit);
    const where: Prisma.LiveClassWhereInput = {};
    if (filters.courseId) where.courseId = filters.courseId;
    if (filters.instructorId) where.instructorId = filters.instructorId;
    if (filters.type) where.type = filters.type;
    if (filters.status) where.status = filters.status;
    if (filters.modality) where.modality = filters.modality;
    if (filters.departmentId) where.targetDeptIds = { has: filters.departmentId };
    if (filters.unitId) where.targetUnitIds = { has: filters.unitId };
    if (filters.dateFrom || filters.dateTo) {
      where.scheduledAt = {
        ...(filters.dateFrom ? { gte: new Date(filters.dateFrom) } : {}),
        ...(filters.dateTo ? { lte: new Date(filters.dateTo) } : {}),
      };
    }

    const [data, total] = await Promise.all([
      this.prisma.read.liveClass.findMany({
        where,
        skip,
        take,
        include: CLASS_INCLUDE,
        orderBy: { scheduledAt: 'desc' },
      }),
      this.prisma.read.liveClass.count({ where }),
    ]);
    return buildPaginatedResponse(data, total, page, limit);
  }

  async findOne(id: number) {
    const lc = await this.prisma.read.liveClass.findUnique({
      where: { id },
      include: {
        ...CLASS_INCLUDE,
        attendances: { include: { user: { select: { id: true, fullName: true } } } },
        messages: {
          include: { user: { select: { id: true, fullName: true } } },
          orderBy: { createdAt: 'asc' },
          take: 100,
        },
        postEvaluation: { include: { responses: true } },
        sessions: {
          include: {
            instructor: { select: { id: true, name: true } },
            _count: { select: { attendances: true } },
          },
          orderBy: { seq: 'asc' },
        },
      },
    });
    if (!lc) throw new NotFoundException('Aula ao vivo não encontrada');
    return lc;
  }

  private generateCode(type: string): string {
    return `${type.slice(0, 3)}-${Date.now().toString(36).toUpperCase()}`;
  }

  /** Expande a recorrência (etapa 2) em ocorrências LiveClassSession — a
   *  própria LiveClass continua a ser a 1ª ocorrência para `ONCE`, mantendo
   *  o fluxo de sala Jitsi/chat/presença ao nível da Aula inalterado. */
  private buildSessionDates(dto: CreateLiveClassDto, scheduledAt: Date): Date[] {
    if (!dto.recurrence || dto.recurrence === LiveClassRecurrence.ONCE) return [];
    if (!dto.recurrenceEndDate) {
      throw new BadRequestException('Recorrência exige recurrenceEndDate');
    }
    const end = new Date(dto.recurrenceEndDate);
    if (Number.isNaN(end.getTime()) || end < scheduledAt) {
      throw new BadRequestException('recurrenceEndDate inválida');
    }

    const dates: Date[] = [];
    const daysOfWeek = dto.recurrenceDaysOfWeek?.length ? new Set(dto.recurrenceDaysOfWeek) : null;
    const stepDays =
      dto.recurrence === LiveClassRecurrence.DAILY && !daysOfWeek ? 1 : daysOfWeek ? 1 : 7;

    const cursor = new Date(scheduledAt);
    while (cursor <= end) {
      if (!daysOfWeek || daysOfWeek.has(cursor.getDay())) {
        dates.push(new Date(cursor));
        if (dates.length > MAX_GENERATED_SESSIONS) {
          throw new BadRequestException(
            `Demasiadas sessões geradas (> ${MAX_GENERATED_SESSIONS}) — encurta o intervalo de recorrência.`,
          );
        }
      }
      cursor.setDate(cursor.getDate() + stepDays);
    }
    return dates;
  }

  async create(dto: CreateLiveClassDto) {
    const scheduledAt = new Date(dto.scheduledAt);
    const sessionDates = this.buildSessionDates(dto, scheduledAt);

    const { recurrenceEndDate, recurrenceDaysOfWeek, recordingExpiresAt, notifySettings, ...rest } =
      dto;

    const lc = await this.prisma.liveClass.create({
      data: {
        ...rest,
        code: dto.code ?? this.generateCode(dto.type ?? 'AULA'),
        scheduledAt,
        recurrenceEndDate: recurrenceEndDate ? new Date(recurrenceEndDate) : undefined,
        recurrenceDaysOfWeek: recurrenceDaysOfWeek ?? [],
        recordingExpiresAt: recordingExpiresAt ? new Date(recordingExpiresAt) : undefined,
        notifySettings: notifySettings ?? undefined,
        sessions: sessionDates.length
          ? {
              create: sessionDates.map((sessionDate, i) => ({
                seq: i + 1,
                sessionDate,
                durationMinutes: dto.duration,
                instructorId: dto.instructorId,
                location: dto.location,
                meetingUrl: dto.zoomMeetingId,
              })),
            }
          : undefined,
      },
      include: CLASS_INCLUDE,
    });
    return lc;
  }

  async update(id: number, dto: UpdateLiveClassDto) {
    await this.findOne(id);
    const { recurrenceEndDate, recordingExpiresAt, notifySettings, ...rest } = dto;
    const data: Prisma.LiveClassUpdateInput = { ...rest };
    if (dto.scheduledAt) data.scheduledAt = new Date(dto.scheduledAt);
    if (recurrenceEndDate) data.recurrenceEndDate = new Date(recurrenceEndDate);
    if (recordingExpiresAt) data.recordingExpiresAt = new Date(recordingExpiresAt);
    if (notifySettings) data.notifySettings = notifySettings;
    return this.prisma.liveClass.update({ where: { id }, data, include: CLASS_INCLUDE });
  }

  async remove(id: number) {
    await this.findOne(id);
    await this.prisma.liveClass.delete({ where: { id } });
    return { message: 'Aula removida' };
  }

  // ─── Ações de ciclo de vida (secção 2 — "Ações") ──────────────────────────

  async start(id: number) {
    const lc = await this.findOne(id);
    if (lc.status === LiveClassStatus.CANCELADA || lc.status === LiveClassStatus.CONCLUIDA) {
      throw new ConflictException(`Não é possível iniciar uma aula com estado ${lc.status}`);
    }
    return this.prisma.liveClass.update({
      where: { id },
      data: { status: LiveClassStatus.EM_CURSO },
      include: CLASS_INCLUDE,
    });
  }

  async postpone(id: number, dto: PostponeLiveClassDto) {
    const lc = await this.findOne(id);
    const newDate = new Date(dto.scheduledAt);
    if (Number.isNaN(newDate.getTime())) throw new BadRequestException('Data inválida');
    return this.prisma.liveClass.update({
      where: { id },
      data: {
        status: LiveClassStatus.ADIADA,
        postponedFromAt: lc.scheduledAt,
        postponeReason: dto.reason,
        scheduledAt: newDate,
      },
      include: CLASS_INCLUDE,
    });
  }

  async cancel(id: number, dto: CancelLiveClassDto) {
    await this.findOne(id);
    return this.prisma.liveClass.update({
      where: { id },
      data: {
        status: LiveClassStatus.CANCELADA,
        cancelledAt: new Date(),
        cancellationReason: dto.reason,
      },
      include: CLASS_INCLUDE,
    });
  }

  async duplicate(id: number) {
    const lc = await this.findOne(id);
    return this.prisma.liveClass.create({
      data: {
        courseId: lc.courseId,
        topic: `${lc.topic} (cópia)`,
        code: this.generateCode(lc.type),
        description: lc.description,
        type: lc.type,
        status: LiveClassStatus.AGENDADA,
        moduleId: lc.moduleId,
        lessonId: lc.lessonId,
        instructorId: lc.instructorId,
        coInstructorId: lc.coInstructorId,
        scheduledAt: lc.scheduledAt,
        duration: lc.duration,
        timezone: lc.timezone,
        recurrence: LiveClassRecurrence.ONCE,
        modality: lc.modality,
        zoomMeetingId: lc.zoomMeetingId,
        location: lc.location,
        building: lc.building,
        room: lc.room,
        capacity: lc.capacity,
        enrollmentMode: lc.enrollmentMode,
        maxParticipants: lc.maxParticipants,
        waitlistEnabled: lc.waitlistEnabled,
        targetDeptIds: lc.targetDeptIds,
        targetUnitIds: lc.targetUnitIds,
        targetPositionIds: lc.targetPositionIds,
        objectives: lc.objectives,
        agenda: lc.agenda,
        topics: lc.topics,
        materialDocumentIds: lc.materialDocumentIds,
        attendanceAutoRegister: lc.attendanceAutoRegister,
        attendanceRequired: lc.attendanceRequired,
        minAttendancePercent: lc.minAttendancePercent,
        lateToleranceMinutes: lc.lateToleranceMinutes,
        recordSession: lc.recordSession,
        allowRecordingDownload: lc.allowRecordingDownload,
        evaluationRequired: lc.evaluationRequired,
        notifySettings: lc.notifySettings ?? undefined,
      },
      include: CLASS_INCLUDE,
    });
  }

  // ─── Sessões (secção 5) ────────────────────────────────────────────────────

  /** Todas as sessões de todas as aulas — tabela global da aba "Sessões". */
  async listAllSessions(filters: LiveClassFilterDto) {
    const { page = 1, limit = 20 } = filters;
    const { skip, take } = calculatePagination(page, limit);
    const where: Prisma.LiveClassSessionWhereInput = {};
    if (filters.instructorId) where.instructorId = filters.instructorId;
    if (filters.status) where.status = filters.status;
    if (filters.courseId) where.liveClass = { courseId: filters.courseId };
    if (filters.dateFrom || filters.dateTo) {
      where.sessionDate = {
        ...(filters.dateFrom ? { gte: new Date(filters.dateFrom) } : {}),
        ...(filters.dateTo ? { lte: new Date(filters.dateTo) } : {}),
      };
    }

    const [data, total] = await Promise.all([
      this.prisma.read.liveClassSession.findMany({
        where,
        skip,
        take,
        include: {
          instructor: { select: { id: true, name: true } },
          liveClass: {
            select: {
              id: true,
              topic: true,
              modality: true,
              course: { select: { id: true, title: true } },
            },
          },
          _count: { select: { attendances: true } },
        },
        orderBy: { sessionDate: 'desc' },
      }),
      this.prisma.read.liveClassSession.count({ where }),
    ]);
    return buildPaginatedResponse(data, total, page, limit);
  }

  async listSessions(liveClassId: number) {
    await this.findOne(liveClassId);
    return this.prisma.read.liveClassSession.findMany({
      where: { liveClassId },
      include: {
        instructor: { select: { id: true, name: true } },
        _count: { select: { attendances: true } },
      },
      orderBy: { seq: 'asc' },
    });
  }

  async createSession(liveClassId: number, dto: CreateLiveClassSessionDto) {
    await this.findOne(liveClassId);
    const last = await this.prisma.read.liveClassSession.findFirst({
      where: { liveClassId },
      orderBy: { seq: 'desc' },
    });
    return this.prisma.liveClassSession.create({
      data: {
        liveClassId,
        seq: (last?.seq ?? 0) + 1,
        sessionDate: new Date(dto.sessionDate),
        durationMinutes: dto.durationMinutes,
        instructorId: dto.instructorId,
        location: dto.location,
        meetingUrl: dto.meetingUrl,
        notes: dto.notes,
      },
      include: { instructor: { select: { id: true, name: true } } },
    });
  }

  async updateSession(liveClassId: number, sessionId: number, dto: UpdateLiveClassSessionDto) {
    const session = await this.prisma.read.liveClassSession.findUnique({
      where: { id: sessionId },
    });
    if (!session || session.liveClassId !== liveClassId) {
      throw new NotFoundException('Sessão não encontrada');
    }
    const { sessionDate, ...rest } = dto;
    return this.prisma.liveClassSession.update({
      where: { id: sessionId },
      data: { ...rest, ...(sessionDate ? { sessionDate: new Date(sessionDate) } : {}) },
      include: { instructor: { select: { id: true, name: true } } },
    });
  }

  async deleteSession(liveClassId: number, sessionId: number) {
    const session = await this.prisma.read.liveClassSession.findUnique({
      where: { id: sessionId },
    });
    if (!session || session.liveClassId !== liveClassId) {
      throw new NotFoundException('Sessão não encontrada');
    }
    await this.prisma.liveClassSession.delete({ where: { id: sessionId } });
    return { message: 'Sessão removida' };
  }

  // ─── Sala ao vivo (join/leave/chat) — inalterado, ao nível da Aula ────────

  async joinClass(liveClassId: number, userId: number) {
    const existing = await this.prisma.liveAttendance.findUnique({
      where: { liveClassId_userId: { liveClassId, userId } },
    });
    if (existing) {
      return this.prisma.liveAttendance.update({
        where: { liveClassId_userId: { liveClassId, userId } },
        data: { joinedAt: new Date(), leftAt: null },
      });
    }
    return this.prisma.liveAttendance.create({
      data: { liveClassId, userId, joinedAt: new Date() },
    });
  }

  async leaveClass(liveClassId: number, userId: number) {
    const existing = await this.prisma.liveAttendance.findUnique({
      where: { liveClassId_userId: { liveClassId, userId } },
    });
    if (!existing) throw new NotFoundException('Não está inscrito nesta aula');
    return this.prisma.liveAttendance.update({
      where: { liveClassId_userId: { liveClassId, userId } },
      data: { leftAt: new Date() },
    });
  }

  async sendMessage(liveClassId: number, userId: number, dto: LiveChatMessageDto) {
    return this.prisma.liveChatMessage.create({
      data: { liveClassId, userId, message: dto.message },
      include: { user: { select: { id: true, fullName: true } } },
    });
  }

  async getMessages(liveClassId: number, page = 1, limit = 50) {
    const skip = (page - 1) * limit;
    return this.prisma.read.liveChatMessage.findMany({
      where: { liveClassId },
      include: { user: { select: { id: true, fullName: true } } },
      orderBy: { createdAt: 'asc' },
      skip,
      take: limit,
    });
  }

  async createPostEvaluation(liveClassId: number) {
    const exists = await this.prisma.postClassEvaluation.findUnique({ where: { liveClassId } });
    if (exists) throw new ConflictException('Avaliação pós-aula já criada');
    return this.prisma.postClassEvaluation.create({
      data: { liveClassId },
    });
  }

  async submitPostResponse(userId: number, dto: PostClassResponseDto) {
    const evaluation = await this.prisma.read.postClassEvaluation.findUnique({
      where: { id: dto.evaluationId },
    });
    if (!evaluation) throw new NotFoundException('Avaliação não encontrada');

    const response = await this.prisma.postClassResponse.upsert({
      where: { evaluationId_userId: { evaluationId: dto.evaluationId, userId } },
      create: {
        evaluationId: dto.evaluationId,
        userId,
        rating: dto.rating,
        feedback: dto.feedback,
      },
      update: { rating: dto.rating, feedback: dto.feedback },
    });

    const avg = await this.prisma.read.postClassResponse.aggregate({
      where: { evaluationId: dto.evaluationId },
      _avg: { rating: true },
    });
    await this.prisma.postClassEvaluation.update({
      where: { id: dto.evaluationId },
      data: { averageScore: avg._avg.rating ?? 0 },
    });

    return response;
  }

  // ─── Presenças (etapa 6 — regra dos 70%) ──────────────────────────────────

  async getAttendanceReport(liveClassId: number) {
    const lc = await this.findOne(liveClassId);
    const attendances = await this.prisma.read.liveAttendance.findMany({
      where: { liveClassId },
      include: { user: { select: { id: true, fullName: true, email: true } } },
    });
    return attendances.map(a => {
      const durationMin = a.leftAt
        ? Math.round((a.leftAt.getTime() - a.joinedAt.getTime()) / 60000)
        : null;
      const attendancePercent =
        durationMin !== null && lc.duration > 0
          ? Math.min(100, Math.round((durationMin / lc.duration) * 100))
          : null;
      const lateMin = Math.round((a.joinedAt.getTime() - lc.scheduledAt.getTime()) / 60000);
      let status: 'PRESENTE' | 'PARCIAL' | 'AUSENTE' | 'ATRASADO' = 'AUSENTE';
      if (attendancePercent !== null) {
        if (attendancePercent >= lc.minAttendancePercent) {
          status = lateMin > lc.lateToleranceMinutes ? 'ATRASADO' : 'PRESENTE';
        } else if (attendancePercent > 0) {
          status = 'PARCIAL';
        }
      }
      return { ...a, durationMinutes: durationMin, attendancePercent, computedStatus: status };
    });
  }

  async getUpcoming() {
    return this.prisma.read.liveClass.findMany({
      where: { scheduledAt: { gte: new Date() }, status: { notIn: [LiveClassStatus.CANCELADA] } },
      include: {
        course: { select: { id: true, title: true } },
        instructor: { select: { id: true, name: true } },
        _count: { select: { attendances: true } },
      },
      orderBy: { scheduledAt: 'asc' },
      take: 10,
    });
  }

  // ─── Visão Geral (secção 1) ────────────────────────────────────────────────

  async getDashboard() {
    const now = new Date();
    const startOfToday = new Date(now);
    startOfToday.setHours(0, 0, 0, 0);
    const endOfToday = new Date(startOfToday);
    endOfToday.setDate(endOfToday.getDate() + 1);
    const endOfWeek = new Date(startOfToday);
    endOfWeek.setDate(endOfWeek.getDate() + 7);

    const [
      scheduled,
      inProgress,
      completed,
      cancelled,
      today,
      week,
      upcoming,
      recordingsAvailable,
      byModality,
      attendanceAgg,
    ] = await Promise.all([
      this.prisma.read.liveClass.count({ where: { status: LiveClassStatus.AGENDADA } }),
      this.prisma.read.liveClass.count({ where: { status: LiveClassStatus.EM_CURSO } }),
      this.prisma.read.liveClass.count({ where: { status: LiveClassStatus.CONCLUIDA } }),
      this.prisma.read.liveClass.count({ where: { status: LiveClassStatus.CANCELADA } }),
      this.prisma.read.liveClass.count({
        where: { scheduledAt: { gte: startOfToday, lt: endOfToday } },
      }),
      this.prisma.read.liveClass.count({
        where: { scheduledAt: { gte: startOfToday, lt: endOfWeek } },
      }),
      this.prisma.read.liveClass.count({ where: { scheduledAt: { gte: now } } }),
      this.prisma.read.liveClass.count({ where: { recordingUrl: { not: null } } }),
      this.prisma.read.liveClass.groupBy({ by: ['modality'], _count: { _all: true } }),
      this.prisma.read.liveAttendance.aggregate({
        _avg: { attendancePercent: true },
        _count: { _all: true },
      }),
    ]);

    const hoursAgg = await this.prisma.read.liveClass.aggregate({
      where: { status: LiveClassStatus.CONCLUIDA },
      _sum: { duration: true },
    });

    const byInstructor = await this.prisma.read.liveClass.groupBy({
      by: ['instructorId'],
      where: { instructorId: { not: null } },
      _count: { _all: true },
    });
    const instructorIds = byInstructor
      .map(b => b.instructorId)
      .filter((id): id is number => id !== null);
    const instructors = instructorIds.length
      ? await this.prisma.read.trainingInstructorProfile.findMany({
          where: { id: { in: instructorIds } },
          select: { id: true, name: true },
        })
      : [];
    const instructorName = new Map(instructors.map(i => [i.id, i.name]));

    return {
      cards: {
        scheduled,
        inProgress,
        completed,
        cancelled,
        today,
        thisWeek: week,
        upcoming,
        recordingsAvailable,
        totalParticipants: attendanceAgg._count._all,
        averageAttendancePercent: Math.round(attendanceAgg._avg.attendancePercent ?? 0),
        hoursDelivered: Math.round(((hoursAgg._sum.duration ?? 0) / 60) * 10) / 10,
      },
      byModality: byModality.map(m => ({ modality: m.modality, count: m._count._all })),
      byInstructor: byInstructor
        .map(b => ({
          instructorId: b.instructorId,
          instructorName: instructorName.get(b.instructorId as number) ?? '—',
          count: b._count._all,
        }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10),
    };
  }

  // ─── Calendário (secção 4) ─────────────────────────────────────────────────

  async getCalendar(from: string, to: string) {
    const start = new Date(from);
    const end = new Date(to);
    const [classes, sessions] = await Promise.all([
      this.prisma.read.liveClass.findMany({
        where: { scheduledAt: { gte: start, lte: end } },
        include: {
          course: { select: { id: true, title: true } },
          instructor: { select: { id: true, name: true } },
        },
      }),
      this.prisma.read.liveClassSession.findMany({
        where: { sessionDate: { gte: start, lte: end } },
        include: {
          instructor: { select: { id: true, name: true } },
          liveClass: {
            select: {
              id: true,
              topic: true,
              modality: true,
              course: { select: { id: true, title: true } },
            },
          },
        },
      }),
    ]);

    const classEvents = classes.map(lc => ({
      id: `class-${lc.id}`,
      liveClassId: lc.id,
      sessionId: null as number | null,
      title: lc.topic,
      start: lc.scheduledAt,
      end: new Date(lc.scheduledAt.getTime() + lc.duration * 60_000),
      modality: lc.modality,
      status: lc.status,
      courseTitle: lc.course?.title ?? null,
      instructorName: lc.instructor?.name ?? null,
    }));

    const sessionEvents = sessions.map(s => ({
      id: `session-${s.id}`,
      liveClassId: s.liveClassId,
      sessionId: s.id,
      title: s.liveClass.topic,
      start: s.sessionDate,
      end: new Date(s.sessionDate.getTime() + s.durationMinutes * 60_000),
      modality: s.liveClass.modality,
      status: s.status,
      courseTitle: s.liveClass.course?.title ?? null,
      instructorName: s.instructor?.name ?? s.liveClass.topic,
    }));

    return [...classEvents, ...sessionEvents].sort((a, b) => a.start.getTime() - b.start.getTime());
  }
}
