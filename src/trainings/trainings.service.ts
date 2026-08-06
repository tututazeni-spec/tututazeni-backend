// src/trainings/trainings.service.ts
import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
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

    const where: Prisma.TrainingWhereInput = {};
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
      this.prisma.read.training.findMany({
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
      this.prisma.read.training.count({ where }),
    ]);

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async findOne(id: number) {
    const t = await this.prisma.read.training.findUnique({
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
    const avgRating = await this.prisma.read.trainingRating.aggregate({
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
    // FIX: `as any` desnecessário — findOne() já devolve `_count`/`status`
    // totalmente tipados via o `include` da própria query.
    const t = await this.findOne(id);
    if (t._count.participants > 0 && t.status === 'PUBLISHED') {
      throw new ForbiddenException(
        'Treinamento com participantes não pode ser eliminado. Archive-o primeiro.',
      );
    }
    // TrainingRating.trainingId → Training é ON DELETE RESTRICT (só as
    // sessões/participantes cascateiam) — um treinamento ARCHIVED (que passa
    // no guard acima) pode perfeitamente já ter avaliações, e o delete()
    // rebentava com uma violação de FK em bruto (500) em vez de um 4xx limpo.
    if (t._count.ratings > 0) {
      throw new ForbiddenException('Treinamento com avaliações não pode ser eliminado.');
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
    const session = await this.prisma.read.trainingSession.findUnique({ where: { id } });
    if (!session) throw new NotFoundException('Sessão não encontrada');
    return this.prisma.trainingSession.update({ where: { id }, data: dto });
  }

  async removeSession(id: number) {
    const session = await this.prisma.read.trainingSession.findUnique({
      where: { id },
      include: { _count: { select: { participants: true } } },
    });
    if (!session) throw new NotFoundException('Sessão não encontrada');
    // FIX: `as any` desnecessário — `_count` já vem tipado do `include` acima.
    if (session._count.participants > 0) {
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

    const session = await this.prisma.read.trainingSession.findUnique({
      where: { id: dto.sessionId },
      // Contar apenas participantes activos — sem este filtro, uma vaga
      // liberta por cancelamento nunca era recuperada, esgotando
      // permanentemente a sessão para futuras inscrições.
      include: {
        _count: { select: { participants: { where: { status: { not: 'CANCELLED' } } } } },
      },
    });
    if (!session) throw new NotFoundException('Sessão não encontrada');

    // FIX: casts `as any` desnecessários — `session` já vem tipado do
    // findUnique() acima (maxParticipants/waitlistEnabled são colunas
    // directas de TrainingSession; `_count.participants` vem do `include`).
    // Verificar vagas
    const hasVacancy =
      session.maxParticipants === 0 || session._count.participants < session.maxParticipants;

    const status =
      !hasVacancy && session.waitlistEnabled
        ? ParticipantStatus.WAITLIST
        : !hasVacancy
          ? (() => {
              throw new BadRequestException('Sessão sem vagas disponíveis');
            })()
          : ParticipantStatus.REGISTERED;

    // upsert em vez de create: (sessionId, userId) é @@unique, e uma
    // inscrição cancelada anteriormente já ocupa essa combinação — um
    // create() directo rebentava sempre com violação de unicidade ao
    // tentar reinscrever-se na mesma sessão após cancelar.
    const participant = await this.prisma.trainingParticipant.upsert({
      where: { sessionId_userId: { sessionId: dto.sessionId, userId: dto.userId } },
      create: { sessionId: dto.sessionId, userId: dto.userId, status },
      update: {
        status,
        cancellationReason: null,
        completedAt: null,
        finalScore: null,
        attendedHours: null,
      },
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
      .catch(e =>
        this.logger.warn({
          userId: dto.userId,
          sessionId: dto.sessionId,
          action: 'TRAINING_REGISTERED',
          err: { message: e instanceof Error ? e.message : String(e) },
          msg: 'Falha ao notificar utilizador de inscrição em treinamento',
        }),
      );

    return participant;
  }

  async cancelParticipant(participantId: number, userId: number, reason?: string) {
    const p = await this.prisma.read.trainingParticipant.findUnique({
      where: { id: participantId },
    });
    if (!p) throw new NotFoundException('Inscrição não encontrada');
    // FIX: casts `as any` desnecessários — `p` já vem tipado do findUnique()
    // acima (userId/sessionId são colunas directas de TrainingParticipant).
    if (p.userId !== userId) throw new ForbiddenException('Sem permissão');

    await this.prisma.trainingParticipant.update({
      where: { id: participantId },
      data: { status: 'CANCELLED', cancellationReason: reason },
    });

    // Promover o primeiro da lista de espera
    const nextWaitlist = await this.prisma.read.trainingParticipant.findFirst({
      where: { sessionId: p.sessionId, status: 'WAITLIST' },
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
        .catch(e =>
          this.logger.warn({
            userId: nextWaitlist.userId,
            participantId,
            action: 'TRAINING_WAITLIST_PROMOTED',
            err: { message: e instanceof Error ? e.message : String(e) },
            msg: 'Falha ao notificar promoção de lista de espera',
          }),
        );
    }

    return { message: 'Inscrição cancelada', waitlistPromoted: !!nextWaitlist };
  }

  async updateParticipantStatus(id: number, dto: TrainingsUpdateParticipantStatusDto) {
    const p = await this.prisma.read.trainingParticipant.findUnique({ where: { id } });
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

    // FIX: casts `as any` desnecessários — `p` já vem tipado do findUnique()
    // acima, e `session`/`session.training` já vêm tipados do `include`.
    // Emitir certificado automaticamente se COMPLETED e passou
    if (dto.status === 'COMPLETED') {
      const session = await this.prisma.read.trainingSession.findUnique({
        where: { id: p.sessionId },
        include: { training: true },
      });
      const training = session?.training;

      if (training?.issueCertificate) {
        const score = dto.finalScore ?? 100;
        if (score >= (training.passingScore ?? 70)) {
          await this.issueCertificate(p.userId, p.sessionId, score);
        }
      }

      // XP
      await this.prisma.userPoints
        .upsert({
          where: { userId: p.userId },
          create: { userId: p.userId, points: 100 },
          update: { points: { increment: 100 } },
        })
        .catch(e =>
          this.logger.warn({
            userId: p.userId,
            participantId: id,
            action: 'TRAINING_COMPLETED_XP',
            err: { message: e instanceof Error ? e.message : String(e) },
            msg: 'Falha ao atribuir XP por conclusão de treinamento',
          }),
        );
    }

    return updated;
  }

  // ─── PRESENÇA EM MASSA ────────────────────────────────────────────────────

  async bulkAttendance(dto: BulkAttendanceDto, registrarId: number) {
    const session = await this.prisma.read.trainingSession.findUnique({
      where: { id: dto.sessionId },
    });
    if (!session) throw new NotFoundException('Sessão não encontrada');

    const participants = await this.prisma.read.trainingParticipant.findMany({
      where: { sessionId: dto.sessionId, status: 'REGISTERED' },
    });

    const presentSet = new Set(dto.presentUserIds);
    let attended = 0;
    let absent = 0;

    for (const p of participants) {
      const isPresent = presentSet.has(p.userId);
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
      .catch(e =>
        this.logger.warn({
          userId: registrarId,
          sessionId: dto.sessionId,
          action: 'TRAINING_ATTENDANCE_RECORDED',
          err: { message: e instanceof Error ? e.message : String(e) },
          msg: 'Falha ao registar notificação de presença em massa',
        }),
      );

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
      .catch(e =>
        this.logger.error({
          userId,
          sessionId,
          action: 'CERTIFICATE_ISSUE',
          err: { message: e instanceof Error ? e.message : String(e) },
          msg: 'Falha ao emitir certificado de treinamento',
        }),
      );

    await this.prisma.notificationLog
      .create({
        data: {
          userId,
          type: 'CERTIFICATE_ISSUED',
          message: `🏆 Certificado emitido! Nota: ${score}%`,
          metadata: JSON.stringify({}),
        },
      })
      .catch(e =>
        this.logger.warn({
          userId,
          sessionId,
          action: 'CERTIFICATE_ISSUED',
          err: { message: e instanceof Error ? e.message : String(e) },
          msg: 'Falha ao notificar emissão de certificado',
        }),
      );
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
    return this.prisma.read.trainingParticipant.findMany({
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
    return this.prisma.read.trainingParticipant.findMany({
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
    // FIX: `as any` desnecessário — findOne() já devolve title/type/
    // workloadHours totalmente tipados.
    const training = await this.findOne(trainingId);

    const sessions = await this.prisma.read.trainingSession.findMany({
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
      // FIX: `as any[]` desnecessário — `session.participants` já vem
      // tipado do `include` acima.
      const participants = session.participants;
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
      this.prisma.read.training.count(),
      this.prisma.read.training.count({ where: { status: 'PUBLISHED' } }),
      this.prisma.read.trainingParticipant.count({ where: { status: { not: 'WAITLIST' } } }),
      this.prisma.read.trainingParticipant.count({ where: { status: 'COMPLETED' } }),
      this.prisma.read.trainingRating.aggregate({ _avg: { rating: true } }),
    ]);

    const topTrainings = await this.prisma.read.training.findMany({
      where: { status: 'PUBLISHED' },
      include: { _count: { select: { participants: true, ratings: true } } },
      orderBy: { participants: { _count: 'desc' } },
      take: 5,
    });

    const mandatory = await this.prisma.read.training.count({
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
