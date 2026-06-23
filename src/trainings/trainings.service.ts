// src/trainings/trainings.service.ts
import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateTrainingDto,
  UpdateTrainingDto,
  TrainingFilterDto,
  CreateTrainingSessionDto,
  UpdateTrainingSessionDto,
  RegisterParticipantDto,
  TrainingsUpdateParticipantStatusDto,
  BulkAttendanceDto,
  RateTrainingDto,
  ParticipantStatus,
} from './trainings.dto';

@Injectable()
export class TrainingService {
  private readonly logger = new Logger(TrainingService.name);
  /**
   * Cliente de leitura: usa a réplica (this.prisma.db) quando disponível,
   * caindo para o primary quando .db não existe (ex.: mocks de teste).
   */
  private get prismaRead(): PrismaService {
    return (this.prisma as any).db ?? this.prisma;
  }

  constructor(private prisma: PrismaService) {}

  // ─── CATÁLOGO ─────────────────────────────────────────────────────────────

  async findAll(filters: TrainingFilterDto) {
    const {
      page = 1,
      limit = 20,
      search,
      type,
      level,
      status,
      category,
      instructorId,
      mandatory,
    } = filters;
    const skip = (page - 1) * limit;

    const where: any = {};
    if (status) where.status = status;
    else where.status = 'PUBLISHED';
    if (type) where.type = type;
    if (level) where.level = level;
    if (category) where.category = category;
    if (instructorId) where.instructorId = instructorId;
    if (mandatory !== undefined) where.mandatory = mandatory;
    if (search) {
      where.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        { shortDescription: { contains: search, mode: 'insensitive' } },
        { tags: { has: search } },
      ];
    }

    const [data, total] = await Promise.all([
      this.prismaRead.training.findMany({
        where,
        skip,
        take: limit,
        include: {
          instructor: {
            select: {
              id: true,
              fullName: true,
              avatarUrl: true,
              position: { select: { name: true } },
            },
          },
          _count: { select: { sessions: true, participants: true, ratings: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prismaRead.training.count({ where }),
    ]);

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async findOne(id: number) {
    const t = await this.prismaRead.training.findUnique({
      where: { id },
      include: {
        instructor: {
          select: {
            id: true,
            fullName: true,
            email: true,
            avatarUrl: true,
            position: { select: { name: true } },
          },
        },
        sessions: {
          include: {
            _count: { select: { participants: true } },
          },
          orderBy: { sessionDate: 'asc' },
        },
        ratings: {
          include: { user: { select: { id: true, fullName: true, avatarUrl: true } } },
          take: 10,
          orderBy: { createdAt: 'desc' },
        },
        _count: { select: { sessions: true, participants: true, ratings: true } },
      },
    });
    if (!t) throw new NotFoundException('Treinamento não encontrado');

    // Calcular rating médio
    const avgRating = await this.prismaRead.trainingRating.aggregate({
      where: { trainingId: id },
      _avg: { rating: true },
    });

    return { ...t, avgRating: Math.round((avgRating._avg.rating ?? 0) * 10) / 10 };
  }

  async create(dto: CreateTrainingDto) {
    const { competencyIds, coInstructorIds, ...data } = dto;

    return this.prisma.training.create({
      data: {
        title: data.title,
        shortDescription: data.shortDescription,
        description: data.description,
        objectives: data.objectives,
        targetAudience: data.targetAudience,
        type: data.type,
        level: data.level,
        status: data.status ?? 'DRAFT',
        category: data.category,
        tags: data.tags ?? [],
        language: data.language ?? 'pt',
        workloadHours: data.workloadHours,
        thumbnailUrl: data.thumbnailUrl,
        prerequisites: data.prerequisites,
        instructorId: data.instructorId,
        mandatory: data.mandatory ?? false,
        passingScore: data.passingScore ?? 70,
        issueCertificate: data.issueCertificate ?? false,
        cost: data.cost,
        startDate: data.startDate ? new Date(data.startDate) : null,
        endDate: data.endDate ? new Date(data.endDate) : null,
        completionDeadlineDays: data.completionDeadlineDays,
      },
      include: { instructor: { select: { id: true, fullName: true } } },
    });
  }

  async update(id: number, dto: UpdateTrainingDto) {
    await this.findOne(id);
    const { competencyIds, coInstructorIds, ...data } = dto;

    return this.prisma.training.update({
      where: { id },
      data: {
        ...data,
        tags: data.tags ?? undefined,
        startDate: data.startDate ? new Date(data.startDate) : undefined,
        endDate: data.endDate ? new Date(data.endDate) : undefined,
      },
    });
  }

  async publish(id: number) {
    await this.findOne(id);
    return this.prisma.training.update({
      where: { id },
      data: { status: 'PUBLISHED', publishedAt: new Date() },
    });
  }

  async archive(id: number) {
    await this.findOne(id);
    return this.prisma.training.update({ where: { id }, data: { status: 'ARCHIVED' } });
  }

  async remove(id: number) {
    const t = (await this.findOne(id)) as any;
    if (t._count.participants > 0 && t.status === 'PUBLISHED') {
      throw new ForbiddenException(
        'Treinamento com participantes não pode ser eliminado. Archive-o primeiro.',
      );
    }
    await this.prisma.training.delete({ where: { id } });
    return { message: 'Treinamento eliminado' };
  }

  // ─── SESSÕES ──────────────────────────────────────────────────────────────

  async createSession(dto: CreateTrainingSessionDto) {
    await this.findOne(dto.trainingId);
    return this.prisma.trainingSession.create({
      data: {
        trainingId: dto.trainingId,
        sessionDate: new Date(dto.sessionDate),
        sessionEndDate: dto.sessionEndDate ? new Date(dto.sessionEndDate) : null,
        durationMinutes: dto.durationMinutes,
        modality: dto.modality,
        location: dto.location,
        meetingUrl: dto.meetingUrl,
        maxParticipants: dto.maxParticipants ?? 0,
        waitlistEnabled: dto.waitlistEnabled ?? true,
        notes: dto.notes,
      },
    });
  }

  async updateSession(id: number, dto: UpdateTrainingSessionDto) {
    const session = await this.prismaRead.trainingSession.findUnique({ where: { id } });
    if (!session) throw new NotFoundException('Sessão não encontrada');
    return this.prisma.trainingSession.update({ where: { id }, data: dto });
  }

  async removeSession(id: number) {
    const session = await this.prismaRead.trainingSession.findUnique({
      where: { id },
      include: { _count: { select: { participants: true } } },
    });
    if (!session) throw new NotFoundException('Sessão não encontrada');
    if ((session._count as any).participants > 0) {
      throw new BadRequestException('Sessão com participantes não pode ser eliminada');
    }
    await this.prisma.trainingSession.delete({ where: { id } });
    return { message: 'Sessão eliminada' };
  }

  // ─── INSCRIÇÕES ───────────────────────────────────────────────────────────

  async registerParticipant(dto: RegisterParticipantDto) {
    // Verificar se já está inscrito
    const existing = await this.prisma.trainingParticipant.findFirst({
      where: { sessionId: dto.sessionId, userId: dto.userId, status: { not: 'CANCELLED' } },
    });
    if (existing) throw new ConflictException('Utilizador já inscrito nesta sessão');

    const session = await this.prismaRead.trainingSession.findUnique({
      where: { id: dto.sessionId },
      include: { _count: { select: { participants: true } } },
    });
    if (!session) throw new NotFoundException('Sessão não encontrada');

    // Verificar vagas
    const hasVacancy =
      (session as any).maxParticipants === 0 ||
      (session._count as any).participants < (session as any).maxParticipants;

    const status =
      !hasVacancy && (session as any).waitlistEnabled
        ? ParticipantStatus.WAITLIST
        : !hasVacancy
          ? (() => {
              throw new BadRequestException('Sessão sem vagas disponíveis');
            })()
          : ParticipantStatus.REGISTERED;

    const participant = await this.prisma.trainingParticipant.create({
      data: { sessionId: dto.sessionId, userId: dto.userId, status },
      include: { user: { select: { id: true, fullName: true } } },
    });

    // Notificar
    await this.prisma.notificationLog
      .create({
        data: {
          userId: dto.userId,
          type: 'TRAINING_REGISTERED',
          message:
            status === 'WAITLIST'
              ? 'Ficaste na lista de espera para um treinamento'
              : 'Inscrição confirmada num treinamento',
          metadata: JSON.stringify({}),
        },
      })
      .catch(() => {});

    return participant;
  }

  async cancelParticipant(participantId: number, userId: number, reason?: string) {
    const p = await this.prismaRead.trainingParticipant.findUnique({
      where: { id: participantId },
    });
    if (!p) throw new NotFoundException('Inscrição não encontrada');
    if ((p as any).userId !== userId) throw new ForbiddenException('Sem permissão');

    await this.prisma.trainingParticipant.update({
      where: { id: participantId },
      data: { status: 'CANCELLED', cancellationReason: reason },
    });

    // Promover o primeiro da lista de espera
    const nextWaitlist = await this.prismaRead.trainingParticipant.findFirst({
      where: { sessionId: (p as any).sessionId, status: 'WAITLIST' },
      orderBy: { createdAt: 'asc' },
    });
    if (nextWaitlist) {
      await this.prisma.trainingParticipant.update({
        where: { id: nextWaitlist.id },
        data: { status: 'REGISTERED' },
      });
      await this.prisma.notificationLog
        .create({
          data: {
            userId: nextWaitlist.userId,
            type: 'TRAINING_WAITLIST_PROMOTED',
            message: '🎉 Saíste da lista de espera! Inscrição confirmada.',
            metadata: JSON.stringify({}),
          },
        })
        .catch(() => {});
    }

    return { message: 'Inscrição cancelada', waitlistPromoted: !!nextWaitlist };
  }

  async updateParticipantStatus(id: number, dto: TrainingsUpdateParticipantStatusDto) {
    const p = await this.prismaRead.trainingParticipant.findUnique({ where: { id } });
    if (!p) throw new NotFoundException('Participante não encontrado');

    const updated = await this.prisma.trainingParticipant.update({
      where: { id },
      data: {
        status: dto.status,
        finalScore: dto.finalScore,
        attendedHours: dto.attendedHours,
        cancellationReason: dto.cancellationReason,
        completedAt: dto.status === 'COMPLETED' ? new Date() : undefined,
      },
    });

    // Emitir certificado automaticamente se COMPLETED e passou
    if (dto.status === 'COMPLETED') {
      const session = await this.prismaRead.trainingSession.findUnique({
        where: { id: (p as any).sessionId },
        include: { training: true },
      });
      const training = (session as any)?.training;

      if (training?.issueCertificate) {
        const score = dto.finalScore ?? 100;
        if (score >= (training.passingScore ?? 70)) {
          await this.issueCertificate((p as any).userId, (p as any).sessionId, score);
        }
      }

      // XP
      await this.prisma.userPoints
        .upsert({
          where: { userId: (p as any).userId },
          create: { userId: (p as any).userId, points: 100 },
          update: { points: { increment: 100 } },
        })
        .catch(() => {});
    }

    return updated;
  }

  // ─── PRESENÇA EM MASSA ────────────────────────────────────────────────────

  async bulkAttendance(dto: BulkAttendanceDto, registrarId: number) {
    const session = await this.prismaRead.trainingSession.findUnique({
      where: { id: dto.sessionId },
    });
    if (!session) throw new NotFoundException('Sessão não encontrada');

    const participants = await this.prismaRead.trainingParticipant.findMany({
      where: { sessionId: dto.sessionId, status: 'REGISTERED' },
    });

    const presentSet = new Set(dto.presentUserIds);
    let attended = 0;
    let absent = 0;

    for (const p of participants) {
      const isPresent = presentSet.has((p as any).userId);
      await this.prisma.trainingParticipant.update({
        where: { id: p.id },
        data: { status: isPresent ? 'ATTENDED' : 'ABSENT' },
      });
      isPresent ? attended++ : absent++;
    }

    // Registar no log de auditoria
    await this.prisma.notificationLog
      .create({
        data: {
          userId: registrarId,
          type: 'TRAINING_ATTENDANCE_RECORDED',
          message: `Presença registada: ${attended} presentes, ${absent} ausentes`,
          metadata: JSON.stringify({}),
        },
      })
      .catch(() => {});

    return { sessionId: dto.sessionId, attended, absent, total: participants.length };
  }

  // ─── CERTIFICADO ──────────────────────────────────────────────────────────

  private async issueCertificate(userId: number, sessionId: number, score: number) {
    const code = `CERT-${Date.now()}-${userId}-${sessionId}`;
    await this.prisma.certificate
      .create({
        data: {
          userId,
          type: 'TRAINING',
          validationCode: code,
          fileUrl: `/certificates/${code}.pdf`,
        },
      })
      .catch(() => {});

    await this.prisma.notificationLog
      .create({
        data: {
          userId,
          type: 'CERTIFICATE_ISSUED',
          message: `🏆 Certificado emitido! Nota: ${score}%`,
          metadata: JSON.stringify({}),
        },
      })
      .catch(() => {});
  }

  // ─── RATING ───────────────────────────────────────────────────────────────

  async rateTraining(userId: number, dto: RateTrainingDto) {
    await this.findOne(dto.trainingId);

    return this.prisma.trainingRating.upsert({
      where: { userId_trainingId: { userId, trainingId: dto.trainingId } },
      create: { userId, trainingId: dto.trainingId, rating: dto.rating, comment: dto.comment },
      update: { rating: dto.rating, comment: dto.comment },
    });
  }

  // ─── HISTÓRICO DO UTILIZADOR ──────────────────────────────────────────────

  async getMyTrainings(userId: number) {
    return this.prismaRead.trainingParticipant.findMany({
      where: { userId },
      include: {
        session: {
          include: {
            training: {
              select: {
                id: true,
                title: true,
                type: true,
                level: true,
                thumbnailUrl: true,
                workloadHours: true,
                issueCertificate: true,
                instructor: { select: { id: true, fullName: true, avatarUrl: true } },
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  // ─── PARTICIPANTES DE UMA SESSÃO ──────────────────────────────────────────

  async getSessionParticipants(sessionId: number) {
    return this.prismaRead.trainingParticipant.findMany({
      where: { sessionId },
      include: {
        user: {
          select: {
            id: true,
            fullName: true,
            email: true,
            avatarUrl: true,
            department: { select: { name: true } },
            position: { select: { name: true } },
          },
        },
      },
      orderBy: [{ status: 'asc' }, { createdAt: 'asc' }],
    });
  }

  // ─── RELATÓRIO DE PRESENÇA ────────────────────────────────────────────────

  async getAttendanceReport(trainingId: number) {
    const training = (await this.findOne(trainingId)) as any;

    const sessions = await this.prismaRead.trainingSession.findMany({
      where: { trainingId },
      include: {
        participants: {
          include: {
            user: { select: { id: true, fullName: true, department: { select: { name: true } } } },
          },
        },
      },
      orderBy: { sessionDate: 'asc' },
    });

    const report = sessions.map(session => {
      const participants = session.participants as any[];
      const total = participants.filter(p => p.status !== 'WAITLIST').length;
      const attended = participants.filter(
        p => p.status === 'ATTENDED' || p.status === 'COMPLETED',
      ).length;
      const completed = participants.filter(p => p.status === 'COMPLETED').length;
      const waitlist = participants.filter(p => p.status === 'WAITLIST').length;

      return {
        sessionId: session.id,
        sessionDate: session.sessionDate,
        modality: session.modality,
        location: session.location,
        durationMinutes: session.durationMinutes,
        maxParticipants: session.maxParticipants,
        totalRegistered: total,
        attended,
        absent: total - attended,
        completed,
        waitlist,
        attendanceRate: total > 0 ? Math.round((attended / total) * 100) : 0,
        completionRate: total > 0 ? Math.round((completed / total) * 100) : 0,
        participants: participants,
      };
    });

    const totalAttended = report.reduce((s, r) => s + r.attended, 0);
    const totalRegistered = report.reduce((s, r) => s + r.totalRegistered, 0);

    return {
      trainingId,
      title: training.title,
      type: training.type,
      workloadHours: training.workloadHours,
      sessions: report,
      summary: {
        totalSessions: sessions.length,
        totalRegistered,
        totalAttended,
        globalAttendanceRate:
          totalRegistered > 0 ? Math.round((totalAttended / totalRegistered) * 100) : 0,
      },
    };
  }

  // ─── DASHBOARD ADMIN ──────────────────────────────────────────────────────

  async getAdminDashboard() {
    const [total, published, totalParticipants, completed, avgRating] = await Promise.all([
      this.prismaRead.training.count(),
      this.prismaRead.training.count({ where: { status: 'PUBLISHED' } }),
      this.prismaRead.trainingParticipant.count({ where: { status: { not: 'WAITLIST' } } }),
      this.prismaRead.trainingParticipant.count({ where: { status: 'COMPLETED' } }),
      this.prismaRead.trainingRating.aggregate({ _avg: { rating: true } }),
    ]);

    const topTrainings = await this.prismaRead.training.findMany({
      where: { status: 'PUBLISHED' },
      include: { _count: { select: { participants: true, ratings: true } } },
      orderBy: { participants: { _count: 'desc' } },
      take: 5,
    });

    const mandatory = await this.prismaRead.training.count({
      where: { status: 'PUBLISHED', mandatory: true },
    });

    return {
      trainings: { total, published, mandatory },
      participants: { total: totalParticipants, completed },
      completionRate: totalParticipants > 0 ? Math.round((completed / totalParticipants) * 100) : 0,
      avgRating: Math.round((avgRating._avg.rating ?? 0) * 10) / 10,
      topTrainings,
    };
  }
}
