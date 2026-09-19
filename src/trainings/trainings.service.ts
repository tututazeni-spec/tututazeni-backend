// src/trainings/trainings.service.ts
import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { Prisma, TrainingAssessmentRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { assertCanAccess, isPrivileged } from '../common/authz/ownership';
import { Role } from '../auth/enums/role.enum';
import { CurrentUserData } from '../common/types/current-user';
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
  RejectParticipantDto,
  NotifyTrainingDto,
  CreateTrainingDocumentDto,
  LinkTrainingAssessmentDto,
  ParticipantStatus,
  CancelTrainingDto,
  TrainingCalendarFilterDto,
  TransferParticipantDto,
  BulkRegisterParticipantsDto,
} from './trainings.dto';
import { buildCsvString } from '../common/utils/csv-export.util';

// Papéis com acesso total de gestão a QUALQUER formação. Os restantes
// papéis autorizados a criar formações (GESTOR, INSTRUCTOR, DIRECTOR,
// LIDER — ver TrainingController) só gerem as que criaram (createdById),
// mesmo padrão de src/common/authz/ownership.ts usado noutros módulos.
const PRIVILEGED_ROLES = [Role.ADMIN, Role.RH];

@Injectable()
export class TrainingService {
  private readonly logger = new Logger(TrainingService.name);

  constructor(private prisma: PrismaService) {}

  // ─── OWNERSHIP ────────────────────────────────────────────────────────────

  private async assertCanManage(trainingId: number, user: CurrentUserData) {
    const training = await this.prisma.read.training.findUnique({
      where: { id: trainingId },
      select: { id: true, createdById: true },
    });
    if (!training) throw new NotFoundException('Treinamento não encontrado');
    assertCanAccess(training, training.createdById ?? -1, user, PRIVILEGED_ROLES);
    return training;
  }

  /** Ownership a partir de uma sessão (para gerir sessões/participantes). */
  private async assertCanManageSession(sessionId: number, user: CurrentUserData) {
    const session = await this.prisma.read.trainingSession.findUnique({
      where: { id: sessionId },
      select: { id: true, trainingId: true, training: { select: { createdById: true } } },
    });
    if (!session) throw new NotFoundException('Sessão não encontrada');
    assertCanAccess(session, session.training.createdById ?? -1, user, PRIVILEGED_ROLES);
    return session;
  }

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
      trainingPlanId,
      priority,
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
    if (trainingPlanId) where.trainingPlanId = trainingPlanId;
    if (priority) where.priority = priority;
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

  // ─── GESTÃO (separador "Gestão") ────────────────────────────────────────────
  // Ao contrário de findAll() (catálogo público, default status=PUBLISHED),
  // aqui não há default de estado e o resultado é sempre scoped por
  // ownership: ADMIN/RH vêem tudo, os restantes papéis que podem criar
  // formações (GESTOR/INSTRUCTOR/DIRECTOR/LIDER) só vêem as suas.
  async findForManagement(filters: TrainingFilterDto, user: CurrentUserData) {
    const { page = 1, limit = 20, status, type, category, trainingPlanId, priority } = filters;
    const skip = (page - 1) * limit;

    const where: Prisma.TrainingWhereInput = {};
    if (status) where.status = status;
    if (type) where.type = type;
    if (category) where.category = category;
    if (trainingPlanId) where.trainingPlanId = trainingPlanId;
    if (priority) where.priority = priority;
    if (!isPrivileged(user, PRIVILEGED_ROLES)) where.createdById = user.id;

    const [data, total] = await Promise.all([
      this.prisma.read.training.findMany({
        where,
        skip,
        take: limit,
        include: {
          instructor: { select: { id: true, fullName: true } },
          createdBy: { select: { id: true, fullName: true } },
          _count: { select: { sessions: true, participants: true, ratings: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.read.training.count({ where }),
    ]);

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async findOne(id: number, user?: CurrentUserData) {
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
        externalInstructor: { select: { id: true, name: true, entity: true } },
        createdBy: { select: { id: true, fullName: true } },
        coInstructors: {
          include: { user: { select: { id: true, fullName: true, avatarUrl: true } } },
        },
        competencies: { include: { competency: { select: { id: true, name: true } } } },
        documents: {
          include: { uploadedBy: { select: { id: true, fullName: true } } },
          orderBy: { createdAt: 'desc' },
        },
        assessmentLinks: {
          include: { assessment: { select: { id: true, title: true, type: true, status: true } } },
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

    const totalCost = this.computeTotalCost(t);
    // canManage: calculado no servidor (em vez de reimplementado no
    // frontend) para o botão "Gerir" da UI — nunca confiar num cálculo de
    // autorização feito no cliente.
    const canManage = user
      ? String(user.id) === String(t.createdById ?? -1) || isPrivileged(user, PRIVILEGED_ROLES)
      : false;

    return {
      ...t,
      avgRating: Math.round((avgRating._avg.rating ?? 0) * 10) / 10,
      totalCost,
      canManage,
    };
  }

  private computeTotalCost(t: {
    instructorCost: number | null;
    materialCost: number | null;
    transportCost: number | null;
    foodCost: number | null;
    lodgingCost: number | null;
    otherCosts: number | null;
    cost: number | null;
  }): number {
    const parts = [
      t.instructorCost,
      t.materialCost,
      t.transportCost,
      t.foodCost,
      t.lodgingCost,
      t.otherCosts,
    ];
    const anySet = parts.some(p => p != null);
    if (!anySet) return t.cost ?? 0;
    return parts.reduce((sum: number, p) => sum + (p ?? 0), 0);
  }

  async create(dto: CreateTrainingDto, creatorId: number) {
    const { competencyIds, coInstructorIds, ...data } = dto;

    const training = await this.prisma.training.create({
      data: {
        title: data.title,
        code: data.code,
        shortDescription: data.shortDescription,
        description: data.description,
        objectives: data.objectives,
        targetAudience: data.targetAudience,
        type: data.type,
        level: data.level,
        status: data.status ?? 'DRAFT',
        category: data.category,
        thematicArea: data.thematicArea,
        tags: data.tags ?? [],
        language: data.language ?? 'pt',
        workloadHours: data.workloadHours,
        thumbnailUrl: data.thumbnailUrl,
        prerequisites: data.prerequisites,
        instructorId: data.instructorId,
        externalInstructorId: data.externalInstructorId,
        trainingEntity: data.trainingEntity,
        classDescription: data.classDescription,
        modalityDetails: data.modalityDetails,
        mandatory: data.mandatory ?? false,
        passingScore: data.passingScore ?? 70,
        issueCertificate: data.issueCertificate ?? false,
        cost: data.cost,
        startDate: data.startDate ? new Date(data.startDate) : null,
        endDate: data.endDate ? new Date(data.endDate) : null,
        completionDeadlineDays: data.completionDeadlineDays,
        schedule: data.schedule,
        roomLocation: data.roomLocation,
        capacity: data.capacity,
        plannedSessionsCount: data.plannedSessionsCount,
        requiresApproval: data.requiresApproval ?? false,
        requiredResources: data.requiredResources ?? [],
        instructorCost: data.instructorCost,
        materialCost: data.materialCost,
        transportCost: data.transportCost,
        foodCost: data.foodCost,
        lodgingCost: data.lodgingCost,
        otherCosts: data.otherCosts,
        plannedBudget: data.plannedBudget,
        priority: data.priority ?? 'MEDIUM',
        responsibleId: data.responsibleId,
        trainingPlanId: data.trainingPlanId,
        courseId: data.courseId,
        learningPathId: data.learningPathId,
        targetDeptIds: data.targetDeptIds ?? [],
        targetUnitIds: data.targetUnitIds ?? [],
        targetPositionIds: data.targetPositionIds ?? [],
        createdById: creatorId,
      },
      include: { instructor: { select: { id: true, fullName: true } } },
    });

    await this.syncCompetencies(training.id, competencyIds);
    await this.syncCoInstructors(training.id, coInstructorIds);

    return training;
  }

  async update(id: number, dto: UpdateTrainingDto, user: CurrentUserData) {
    await this.assertCanManage(id, user);
    const { competencyIds, coInstructorIds, ...data } = dto;

    const training = await this.prisma.training.update({
      where: { id },
      data: {
        ...data,
        tags: data.tags ?? undefined,
        requiredResources: data.requiredResources ?? undefined,
        targetDeptIds: data.targetDeptIds ?? undefined,
        targetUnitIds: data.targetUnitIds ?? undefined,
        targetPositionIds: data.targetPositionIds ?? undefined,
        startDate: data.startDate ? new Date(data.startDate) : undefined,
        endDate: data.endDate ? new Date(data.endDate) : undefined,
      },
    });

    if (competencyIds !== undefined) await this.syncCompetencies(id, competencyIds);
    if (coInstructorIds !== undefined) await this.syncCoInstructors(id, coInstructorIds);

    return training;
  }

  private async syncCompetencies(trainingId: number, competencyIds?: number[]) {
    if (competencyIds === undefined) return;
    await this.prisma.trainingCompetency.deleteMany({ where: { trainingId } });
    if (competencyIds.length === 0) return;
    await this.prisma.trainingCompetency.createMany({
      data: competencyIds.map(competencyId => ({ trainingId, competencyId })),
      skipDuplicates: true,
    });
  }

  private async syncCoInstructors(trainingId: number, coInstructorIds?: number[]) {
    if (coInstructorIds === undefined) return;
    await this.prisma.trainingCoInstructor.deleteMany({ where: { trainingId } });
    if (coInstructorIds.length === 0) return;
    await this.prisma.trainingCoInstructor.createMany({
      data: coInstructorIds.map(userId => ({ trainingId, userId })),
      skipDuplicates: true,
    });
  }

  async publish(id: number, user: CurrentUserData) {
    await this.assertCanManage(id, user);
    return this.prisma.training.update({
      where: { id },
      data: { status: 'PUBLISHED', publishedAt: new Date() },
    });
  }

  async archive(id: number, user: CurrentUserData) {
    await this.assertCanManage(id, user);
    return this.prisma.training.update({ where: { id }, data: { status: 'ARCHIVED' } });
  }

  // docs/trainings-detalhado.md pt.3 — acções "cancelar"/"concluir" da
  // formação (distintas de cancelParticipant/updateParticipantStatus, que
  // operam ao nível do participante).
  async cancel(id: number, dto: CancelTrainingDto, user: CurrentUserData) {
    await this.assertCanManage(id, user);
    const t = await this.prisma.read.training.findUnique({
      where: { id },
      select: { status: true },
    });
    if (!t) throw new NotFoundException('Treinamento não encontrado');
    if (t.status === 'CANCELLED' || t.status === 'COMPLETED') {
      throw new ConflictException('Formação já terminada — não pode ser cancelada');
    }
    return this.prisma.training.update({
      where: { id },
      data: { status: 'CANCELLED', cancellationReason: dto.reason },
    });
  }

  async complete(id: number, user: CurrentUserData) {
    await this.assertCanManage(id, user);
    const t = await this.prisma.read.training.findUnique({
      where: { id },
      select: { status: true },
    });
    if (!t) throw new NotFoundException('Treinamento não encontrado');
    if (t.status !== 'PUBLISHED') {
      throw new ConflictException('Só uma formação publicada pode ser concluída');
    }
    return this.prisma.training.update({ where: { id }, data: { status: 'COMPLETED' } });
  }

  async remove(id: number, user: CurrentUserData) {
    await this.assertCanManage(id, user);
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

  async createSession(dto: CreateTrainingSessionDto, user: CurrentUserData) {
    await this.assertCanManage(dto.trainingId, user);
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

  async updateSession(id: number, dto: UpdateTrainingSessionDto, user: CurrentUserData) {
    await this.assertCanManageSession(id, user);
    return this.prisma.trainingSession.update({ where: { id }, data: dto });
  }

  async removeSession(id: number, user: CurrentUserData) {
    const session = await this.assertCanManageSession(id, user);
    const withCount = await this.prisma.read.trainingSession.findUnique({
      where: { id: session.id },
      include: { _count: { select: { participants: true } } },
    });
    // FIX: `as any` desnecessário — `_count` já vem tipado do `include` acima.
    if (withCount && withCount._count.participants > 0) {
      throw new BadRequestException('Sessão com participantes não pode ser eliminada');
    }
    await this.prisma.trainingSession.delete({ where: { id } });
    return { message: 'Sessão eliminada' };
  }

  // ─── INSCRIÇÕES ───────────────────────────────────────────────────────────

  // NOTA: inscrever outra pessoa (POST /trainings/sessions/register) é
  // operacional — não scoped por ownership da formação — mesmo padrão
  // (deliberadamente amplo) de getSessionParticipants/getAttendanceReport
  // abaixo: um GESTOR pode gerir inscrições de sessões de formações que
  // não criou, tal como já podia antes de este módulo ganhar mais criadores.
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
        training: { select: { requiresApproval: true } },
      },
    });
    if (!session) throw new NotFoundException('Sessão não encontrada');

    // Formação com aprovação obrigatória: a inscrição fica PENDING_APPROVAL
    // sem reservar vaga (a vaga só é verificada quando um gestor aprova, ver
    // approveParticipant()) — não faz sentido decidir vaga/lista de espera
    // para um pedido que ainda pode ser rejeitado.
    if (session.training.requiresApproval) {
      const participant = await this.prisma.trainingParticipant.upsert({
        where: { sessionId_userId: { sessionId: dto.sessionId, userId: dto.userId } },
        create: { sessionId: dto.sessionId, userId: dto.userId, status: 'PENDING_APPROVAL' },
        update: {
          status: 'PENDING_APPROVAL',
          cancellationReason: null,
          completedAt: null,
          finalScore: null,
          attendedHours: null,
        },
        include: { user: { select: { id: true, fullName: true } } },
      });
      return participant;
    }

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

  // docs/trainings-detalhado.md pt.5/6 — "transferir de turma": move um
  // participante de uma sessão/turma para outra, reutilizando as mesmas
  // regras de vagas/lista de espera do registerParticipant() (em vez de só
  // trocar sessionId, o que ignoraria capacidade da turma de destino).
  async transferParticipant(participantId: number, dto: TransferParticipantDto) {
    const p = await this.prisma.read.trainingParticipant.findUnique({
      where: { id: participantId },
    });
    if (!p) throw new NotFoundException('Inscrição não encontrada');
    if (p.sessionId === dto.targetSessionId) {
      throw new ConflictException('O participante já está nesta turma/sessão');
    }

    const registered = await this.registerParticipant({
      sessionId: dto.targetSessionId,
      userId: p.userId,
      allowWaitlist: true,
    });

    await this.prisma.trainingParticipant.update({
      where: { id: participantId },
      data: { status: 'CANCELLED', cancellationReason: 'Transferido para outra turma/sessão' },
    });

    // Promover lista de espera da sessão de origem (mesma lógica de
    // cancelParticipant — a vaga libertada não pode ficar perdida).
    const nextWaitlist = await this.prisma.read.trainingParticipant.findFirst({
      where: { sessionId: p.sessionId, status: 'WAITLIST' },
      orderBy: { createdAt: 'asc' },
    });
    if (nextWaitlist) {
      await this.prisma.trainingParticipant.update({
        where: { id: nextWaitlist.id },
        data: { status: 'REGISTERED' },
      });
    }

    return registered;
  }

  // docs/trainings-detalhado.md pt.6 — "inscrever em massa". Reutiliza
  // registerParticipant() por utilizador em vez de um createMany, para
  // manter as mesmas regras de vaga/lista de espera/aprovação por pessoa.
  async bulkRegisterParticipants(dto: BulkRegisterParticipantsDto) {
    const results: { userId: number; status: string; error?: string }[] = [];
    for (const userId of dto.userIds) {
      try {
        const p = await this.registerParticipant({
          sessionId: dto.sessionId,
          userId,
          allowWaitlist: dto.allowWaitlist,
        });
        results.push({ userId, status: p.status });
      } catch (e) {
        results.push({
          userId,
          status: 'ERROR',
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }
    return {
      registered: results.filter(r => r.status !== 'ERROR').length,
      failed: results.filter(r => r.status === 'ERROR').length,
      results,
    };
  }

  // NOTA: sem ownership — mesmo motivo de getSessionParticipants acima.
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

  // NOTA: sem ownership — mesmo motivo de getSessionParticipants acima.
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

  // ─── APROVAÇÕES ───────────────────────────────────────────────────────────

  async approveParticipant(participantId: number, user: CurrentUserData) {
    const p = await this.prisma.read.trainingParticipant.findUnique({
      where: { id: participantId },
      include: {
        session: {
          include: {
            _count: { select: { participants: { where: { status: { not: 'CANCELLED' } } } } },
          },
        },
      },
    });
    if (!p) throw new NotFoundException('Participante não encontrado');
    await this.assertCanManageSession(p.sessionId, user);
    if (p.status !== 'PENDING_APPROVAL') {
      throw new BadRequestException('Inscrição não está pendente de aprovação');
    }

    const session = p.session;
    const hasVacancy =
      session.maxParticipants === 0 || session._count.participants < session.maxParticipants;
    const status = hasVacancy
      ? ParticipantStatus.REGISTERED
      : session.waitlistEnabled
        ? ParticipantStatus.WAITLIST
        : (() => {
            throw new BadRequestException('Sessão sem vagas disponíveis');
          })();

    const updated = await this.prisma.trainingParticipant.update({
      where: { id: participantId },
      data: { status },
      include: { user: { select: { id: true, fullName: true } } },
    });

    await this.prisma.notificationLog
      .create({
        data: {
          userId: p.userId,
          type: 'TRAINING_REGISTRATION_APPROVED',
          message:
            status === 'WAITLIST'
              ? 'Inscrição aprovada — ficaste na lista de espera'
              : 'Inscrição aprovada! Já estás inscrito no treinamento.',
          metadata: JSON.stringify({}),
        },
      })
      .catch(e =>
        this.logger.warn({
          userId: p.userId,
          participantId,
          action: 'TRAINING_REGISTRATION_APPROVED',
          err: { message: e instanceof Error ? e.message : String(e) },
          msg: 'Falha ao notificar aprovação de inscrição',
        }),
      );

    return updated;
  }

  async rejectParticipant(participantId: number, dto: RejectParticipantDto, user: CurrentUserData) {
    const p = await this.prisma.read.trainingParticipant.findUnique({
      where: { id: participantId },
    });
    if (!p) throw new NotFoundException('Participante não encontrado');
    await this.assertCanManageSession(p.sessionId, user);
    if (p.status !== 'PENDING_APPROVAL') {
      throw new BadRequestException('Inscrição não está pendente de aprovação');
    }

    const updated = await this.prisma.trainingParticipant.update({
      where: { id: participantId },
      data: { status: 'REJECTED', cancellationReason: dto.reason },
    });

    await this.prisma.notificationLog
      .create({
        data: {
          userId: p.userId,
          type: 'TRAINING_REGISTRATION_REJECTED',
          message: 'Inscrição num treinamento foi rejeitada',
          metadata: JSON.stringify({ reason: dto.reason ?? null }),
        },
      })
      .catch(e =>
        this.logger.warn({
          userId: p.userId,
          participantId,
          action: 'TRAINING_REGISTRATION_REJECTED',
          err: { message: e instanceof Error ? e.message : String(e) },
          msg: 'Falha ao notificar rejeição de inscrição',
        }),
      );

    return updated;
  }

  // ─── COMUNICAÇÃO / NOTIFICAÇÕES ───────────────────────────────────────────

  async notifyParticipants(trainingId: number, dto: NotifyTrainingDto, user: CurrentUserData) {
    await this.assertCanManage(trainingId, user);

    const participants = await this.prisma.read.trainingParticipant.findMany({
      where: {
        session: { trainingId },
        status: { notIn: ['CANCELLED', 'REJECTED'] },
      },
      select: { userId: true },
      distinct: ['userId'],
    });

    let sent = 0;
    for (const p of participants) {
      await this.prisma.notificationLog
        .create({
          data: {
            userId: p.userId,
            type: 'TRAINING_ANNOUNCEMENT',
            message: dto.message,
            metadata: JSON.stringify({ trainingId }),
          },
        })
        .then(() => sent++)
        .catch(e =>
          this.logger.warn({
            userId: p.userId,
            trainingId,
            action: 'TRAINING_ANNOUNCEMENT',
            err: { message: e instanceof Error ? e.message : String(e) },
            msg: 'Falha ao notificar participante (comunicação da formação)',
          }),
        );
    }

    return { message: 'Notificações enviadas', sent, total: participants.length };
  }

  // ─── DOCUMENTOS ADMINISTRATIVOS ────────────────────────────────────────────

  async addDocument(trainingId: number, dto: CreateTrainingDocumentDto, user: CurrentUserData) {
    await this.assertCanManage(trainingId, user);
    return this.prisma.trainingDocument.create({
      data: {
        trainingId,
        name: dto.name,
        fileUrl: dto.fileUrl,
        category: dto.category,
        uploadedById: user.id,
      },
    });
  }

  async removeDocument(documentId: number, user: CurrentUserData) {
    const doc = await this.prisma.read.trainingDocument.findUnique({ where: { id: documentId } });
    if (!doc) throw new NotFoundException('Documento não encontrado');
    await this.assertCanManage(doc.trainingId, user);
    await this.prisma.trainingDocument.delete({ where: { id: documentId } });
    return { message: 'Documento eliminado' };
  }

  // ─── AVALIAÇÃO — associar avaliações existentes ───────────────────────────

  async linkAssessment(trainingId: number, dto: LinkTrainingAssessmentDto, user: CurrentUserData) {
    await this.assertCanManage(trainingId, user);
    const assessment = await this.prisma.read.assessment.findUnique({
      where: { id: dto.assessmentId },
    });
    if (!assessment) throw new NotFoundException('Avaliação (Assessment) não encontrada');

    // upsert por [trainingId, role] — @@unique garante no máximo uma
    // avaliação associada por papel (inicial/final/satisfação/formador).
    return this.prisma.trainingAssessment.upsert({
      where: { trainingId_role: { trainingId, role: dto.role } },
      create: { trainingId, assessmentId: dto.assessmentId, role: dto.role },
      update: { assessmentId: dto.assessmentId },
      include: { assessment: { select: { id: true, title: true, type: true, status: true } } },
    });
  }

  async unlinkAssessment(trainingId: number, role: TrainingAssessmentRole, user: CurrentUserData) {
    await this.assertCanManage(trainingId, user);
    const existing = await this.prisma.read.trainingAssessment.findUnique({
      where: { trainingId_role: { trainingId, role } },
    });
    if (!existing) throw new NotFoundException('Associação não encontrada');
    await this.prisma.trainingAssessment.delete({ where: { id: existing.id } });
    return { message: 'Avaliação desassociada' };
  }

  // ─── RESULTADOS ────────────────────────────────────────────────────────────

  // NOTA: sem ownership — mesmo motivo de getSessionParticipants acima
  // (leitura agregada, não uma acção de gestão da formação).
  async getResults(trainingId: number) {
    const training = await this.prisma.read.training.findUnique({
      where: { id: trainingId },
      select: {
        id: true,
        title: true,
        cost: true,
        instructorCost: true,
        materialCost: true,
        transportCost: true,
        foodCost: true,
        lodgingCost: true,
        otherCosts: true,
        passingScore: true,
      },
    });
    if (!training) throw new NotFoundException('Treinamento não encontrado');

    const participants = await this.prisma.read.trainingParticipant.findMany({
      where: { training: { id: trainingId } },
      select: { status: true, finalScore: true },
    });

    // "Inscritos"/"Participantes": qualquer inscrição activa (exclui
    // cancelados/rejeitados/lista de espera/pendentes de aprovação).
    const active = participants.filter(p =>
      ['REGISTERED', 'ATTENDED', 'ABSENT', 'COMPLETED'].includes(p.status),
    );
    const enrolled = active.length;
    const attended = active.filter(p => p.status === 'ATTENDED' || p.status === 'COMPLETED').length;
    const completed = active.filter(p => p.status === 'COMPLETED').length;
    const scored = active.filter(p => p.finalScore != null);
    const avgScore =
      scored.length > 0
        ? Math.round((scored.reduce((s, p) => s + (p.finalScore ?? 0), 0) / scored.length) * 10) /
          10
        : null;

    const avgRating = await this.prisma.read.trainingRating.aggregate({
      where: { trainingId },
      _avg: { rating: true },
      _count: { rating: true },
    });

    // docs/trainings-detalhado.md pt.9 — "Taxa de aprovação" (nota final >=
    // nota mínima da formação) e "NPS", adaptado da escala 1-5 de
    // TrainingRating (não existe uma escala 0-10 dedicada): promotor = 5
    // estrelas, detrator = 1-3 estrelas, mesma lógica do NPS clássico
    // (%promotores - %detratores).
    const approved = scored.filter(p => (p.finalScore ?? 0) >= (training.passingScore ?? 70));
    const approvalRate =
      scored.length > 0 ? Math.round((approved.length / scored.length) * 100) : null;
    const responseRate =
      enrolled > 0 ? Math.round(((avgRating._count?.rating ?? 0) / enrolled) * 100) : 0;

    const ratings = await this.prisma.read.trainingRating.findMany({
      where: { trainingId },
      select: { rating: true },
    });
    const nps =
      ratings.length > 0
        ? Math.round(
            ((ratings.filter(r => r.rating === 5).length -
              ratings.filter(r => r.rating <= 3).length) /
              ratings.length) *
              100,
          )
        : null;

    const totalCost = this.computeTotalCost(training);

    return {
      trainingId,
      title: training.title,
      enrolled,
      participants: attended,
      completed,
      completionRate: enrolled > 0 ? Math.round((completed / enrolled) * 100) : 0,
      attendanceRate: enrolled > 0 ? Math.round((attended / enrolled) * 100) : 0,
      avgScore,
      approvalRate,
      satisfaction: Math.round((avgRating._avg.rating ?? 0) * 10) / 10,
      responseRate,
      nps,
      totalCost,
      costPerParticipant: enrolled > 0 ? Math.round((totalCost / enrolled) * 100) / 100 : totalCost,
    };
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

  // NOTA: deliberadamente sem ownership — participantes/presenças são geridos
  // por qualquer um dos papéis abaixo (ADMIN/RH/GESTOR/INSTRUCTOR/DIRECTOR/
  // LIDER), mesmo em sessões de formações que não criaram. Restringir aqui
  // partia o fluxo já existente de um GESTOR gerir presenças de formações
  // criadas por RH (ver test/integration/trainings).
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

  // docs/trainings-detalhado.md pt.6 — "exportar participantes". Agrega
  // todas as sessões da formação (não só uma), mesmo padrão de
  // getAttendanceReport/getResults abaixo.
  async exportParticipantsCsv(trainingId: number): Promise<string> {
    const training = await this.prisma.read.training.findUnique({
      where: { id: trainingId },
      select: { id: true },
    });
    if (!training) throw new NotFoundException('Treinamento não encontrado');

    const participants = await this.prisma.read.trainingParticipant.findMany({
      where: { session: { trainingId } },
      include: {
        user: {
          select: {
            fullName: true,
            email: true,
            department: { select: { name: true } },
          },
        },
        session: { select: { sessionDate: true } },
      },
      orderBy: [{ session: { sessionDate: 'asc' } }, { createdAt: 'asc' }],
    });

    const rows = participants.map(p => ({
      colaborador: p.user.fullName,
      email: p.user.email,
      departamento: p.user.department?.name ?? '',
      sessao: p.session.sessionDate.toISOString().slice(0, 16).replace('T', ' '),
      estado: p.status,
      nota: p.finalScore ?? '',
      horas: p.attendedHours ?? '',
    }));

    return buildCsvString(rows, [
      'colaborador',
      'email',
      'departamento',
      'sessao',
      'estado',
      'nota',
      'horas',
    ]);
  }

  // ─── RELATÓRIO DE PRESENÇA ────────────────────────────────────────────────

  // NOTA: sem ownership — mesmo motivo de getSessionParticipants acima.
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

  // ─── CALENDÁRIO (docs/trainings-detalhado.md pt.4) ─────────────────────────
  // Este schema não separa Formação/Turma em dois modelos (ver comentário de
  // `classDescription` na Training acima) — os "eventos" do calendário são
  // as TrainingSession (têm data concreta); uma formação já com startDate
  // mas ainda sem nenhuma sessão marcada também aparece, para não desaparecer
  // do calendário enquanto está só "planeada"/"agendada".
  async getCalendar(filters: TrainingCalendarFilterDto) {
    const from = filters.from ? new Date(filters.from) : new Date();
    const to = filters.to
      ? new Date(filters.to)
      : new Date(from.getTime() + 90 * 24 * 60 * 60 * 1000);

    const trainingFilter: Prisma.TrainingWhereInput = {};
    if (filters.instructorId) trainingFilter.instructorId = filters.instructorId;
    if (filters.status) trainingFilter.status = filters.status;
    if (filters.departmentId) trainingFilter.targetDeptIds = { has: filters.departmentId };

    const sessionWhere: Prisma.TrainingSessionWhereInput = {
      sessionDate: { gte: from, lte: to },
    };
    if (filters.trainingId) sessionWhere.trainingId = filters.trainingId;
    if (filters.modality) sessionWhere.modality = filters.modality;
    if (filters.location)
      sessionWhere.location = { contains: filters.location, mode: 'insensitive' };
    if (Object.keys(trainingFilter).length) sessionWhere.training = trainingFilter;

    const sessions = await this.prisma.read.trainingSession.findMany({
      where: sessionWhere,
      include: {
        training: {
          select: {
            id: true,
            title: true,
            type: true,
            status: true,
            roomLocation: true,
            instructor: { select: { id: true, fullName: true } },
          },
        },
        _count: { select: { participants: true } },
      },
      orderBy: { sessionDate: 'asc' },
    });

    const unscheduledWhere: Prisma.TrainingWhereInput = {
      ...trainingFilter,
      startDate: { gte: from, lte: to },
      sessions: { none: {} },
    };
    if (filters.trainingId) unscheduledWhere.id = filters.trainingId;
    if (filters.location)
      unscheduledWhere.roomLocation = { contains: filters.location, mode: 'insensitive' };

    const unscheduled = filters.modality
      ? [] // sem sessão -> sem modalidade de sessão para filtrar
      : await this.prisma.read.training.findMany({
          where: unscheduledWhere,
          select: {
            id: true,
            title: true,
            type: true,
            status: true,
            startDate: true,
            endDate: true,
            roomLocation: true,
            instructor: { select: { id: true, fullName: true } },
          },
        });

    const events = [
      ...sessions.map(s => ({
        kind: 'session' as const,
        id: s.id,
        trainingId: s.trainingId,
        title: s.training.title,
        trainingType: s.training.type,
        status: s.training.status,
        start: s.sessionDate,
        end: s.sessionEndDate,
        modality: s.modality,
        location: s.location ?? s.training.roomLocation,
        instructor: s.training.instructor,
        participants: s._count.participants,
        maxParticipants: s.maxParticipants,
      })),
      ...unscheduled.map(t => ({
        kind: 'training' as const,
        id: t.id,
        trainingId: t.id,
        title: t.title,
        trainingType: t.type,
        status: t.status,
        start: t.startDate,
        end: t.endDate,
        modality: null,
        location: t.roomLocation,
        instructor: t.instructor,
        participants: 0,
        maxParticipants: null,
      })),
    ].sort((a, b) => (a.start?.getTime() ?? 0) - (b.start?.getTime() ?? 0));

    return { from, to, events };
  }

  // ─── DASHBOARD (docs/trainings-detalhado.md pt.1 — Visão Geral) ────────────

  async getAdminDashboard() {
    const now = new Date();

    const [
      total,
      planned,
      cancelled,
      completedExplicit,
      publishedScheduled,
      publishedInProgress,
      publishedPastEnd,
      mandatory,
      registeredParticipants,
      inTrainingParticipants,
      completedParticipants,
      totalNonWaitlist,
      attendedOrCompleted,
      avgRating,
      distinctInstructors,
      publishedTrainingsForRooms,
      upcomingSessions,
      hoursAgg,
      publishedPlans,
      plansWithTrainings,
    ] = await Promise.all([
      this.prisma.read.training.count(),
      this.prisma.read.training.count({ where: { status: 'DRAFT' } }),
      this.prisma.read.training.count({ where: { status: 'CANCELLED' } }),
      this.prisma.read.training.count({ where: { status: 'COMPLETED' } }),
      this.prisma.read.training.count({
        where: { status: 'PUBLISHED', OR: [{ startDate: null }, { startDate: { gt: now } }] },
      }),
      this.prisma.read.training.count({
        where: {
          status: 'PUBLISHED',
          startDate: { lte: now },
          OR: [{ endDate: null }, { endDate: { gte: now } }],
        },
      }),
      this.prisma.read.training.count({
        where: { status: 'PUBLISHED', endDate: { lt: now } },
      }),
      this.prisma.read.training.count({ where: { status: 'PUBLISHED', mandatory: true } }),
      this.prisma.read.trainingParticipant.count({
        where: { status: { in: ['REGISTERED', 'WAITLIST', 'PENDING_APPROVAL'] } },
      }),
      this.prisma.read.trainingParticipant.count({
        where: { status: { in: ['REGISTERED', 'ATTENDED'] } },
      }),
      this.prisma.read.trainingParticipant.count({ where: { status: 'COMPLETED' } }),
      this.prisma.read.trainingParticipant.count({ where: { status: { not: 'WAITLIST' } } }),
      this.prisma.read.trainingParticipant.count({
        where: { status: { in: ['ATTENDED', 'COMPLETED'] } },
      }),
      this.prisma.read.trainingRating.aggregate({ _avg: { rating: true } }),
      this.prisma.read.training.findMany({
        where: { status: 'PUBLISHED', instructorId: { not: null } },
        select: { instructorId: true },
        distinct: ['instructorId'],
      }),
      this.prisma.read.training.findMany({
        where: { status: 'PUBLISHED', roomLocation: { not: null } },
        select: { roomLocation: true },
        distinct: ['roomLocation'],
      }),
      this.prisma.read.trainingSession.findMany({
        where: { sessionDate: { gt: now } },
        select: {
          id: true,
          sessionDate: true,
          location: true,
          training: { select: { id: true, title: true } },
        },
        orderBy: { sessionDate: 'asc' },
        take: 5,
      }),
      this.prisma.read.trainingParticipant.aggregate({
        _sum: { attendedHours: true },
        _count: { _all: true },
        where: { attendedHours: { not: null } },
      }),
      this.prisma.read.trainingPlan.count({ where: { status: 'PUBLISHED' } }),
      this.prisma.read.trainingPlan.count({
        where: { status: 'PUBLISHED', trainings: { some: {} } },
      }),
    ]);

    const completed = completedExplicit + publishedPastEnd;

    // Custo/hora e custo/participante — computados sobre as formações
    // publicadas (mesma fórmula de computeTotalCost, agregada em memória
    // porque os custos são a soma de 6 colunas opcionais, não uma coluna
    // única sobre a qual o Prisma possa agregar).
    const costRows = await this.prisma.read.training.findMany({
      where: { status: { in: ['PUBLISHED', 'COMPLETED', 'ARCHIVED'] } },
      select: {
        cost: true,
        instructorCost: true,
        materialCost: true,
        transportCost: true,
        foodCost: true,
        lodgingCost: true,
        otherCosts: true,
        workloadHours: true,
      },
    });
    const totalCost = costRows.reduce((sum, t) => sum + this.computeTotalCost(t), 0);
    const totalHours = costRows.reduce((sum, t) => sum + (t.workloadHours ?? 0), 0);

    // Taxa de aprovação — nota final do participante vs. passingScore da
    // sua formação (varia por formação, por isso não é agregável em SQL).
    const scored = await this.prisma.read.trainingParticipant.findMany({
      where: { finalScore: { not: null } },
      select: { finalScore: true, training: { select: { passingScore: true } } },
    });
    const approved = scored.filter(
      p => (p.finalScore ?? 0) >= (p.training?.passingScore ?? 70),
    ).length;

    // Execução orçamental — orçamento previsto (Training.plannedBudget +
    // TrainingPlan.plannedBudget das que não têm o próprio) vs. custo real.
    const plansWithBudget = await this.prisma.read.trainingPlan.aggregate({
      _sum: { plannedBudget: true },
    });
    const trainingsBudget = await this.prisma.read.training.aggregate({
      _sum: { plannedBudget: true },
    });
    const plannedBudgetTotal =
      (plansWithBudget._sum.plannedBudget ?? 0) + (trainingsBudget._sum.plannedBudget ?? 0);

    const topTrainings = await this.prisma.read.training.findMany({
      where: { status: 'PUBLISHED' },
      include: { _count: { select: { participants: true, ratings: true } } },
      orderBy: { participants: { _count: 'desc' } },
      take: 5,
    });

    return {
      trainings: {
        total,
        planned,
        scheduled: publishedScheduled,
        inProgress: publishedInProgress,
        completed,
        cancelled,
        mandatory,
        activeClasses: publishedInProgress,
      },
      participants: {
        registered: registeredParticipants,
        inTraining: inTrainingParticipants,
        completed: completedParticipants,
      },
      upcomingSessions: upcomingSessions.map(s => ({
        id: s.id,
        trainingId: s.training.id,
        title: s.training.title,
        date: s.sessionDate,
        location: s.location,
      })),
      activeInstructors: distinctInstructors.length,
      roomsInUse: publishedTrainingsForRooms.length,
      completionRate: totalNonWaitlist > 0 ? Math.round((completed / totalNonWaitlist) * 100) : 0,
      participationRate:
        totalNonWaitlist > 0 ? Math.round((attendedOrCompleted / totalNonWaitlist) * 100) : 0,
      avgRating: Math.round((avgRating._avg.rating ?? 0) * 10) / 10,
      hoursPerEmployee:
        hoursAgg._count._all > 0
          ? Math.round(((hoursAgg._sum.attendedHours ?? 0) / hoursAgg._count._all) * 10) / 10
          : 0,
      costPerParticipant: totalNonWaitlist > 0 ? Math.round(totalCost / totalNonWaitlist) : 0,
      costPerHour: totalHours > 0 ? Math.round(totalCost / totalHours) : 0,
      approvalRate: scored.length > 0 ? Math.round((approved / scored.length) * 100) : 0,
      budgetExecutionRate:
        plannedBudgetTotal > 0 ? Math.round((totalCost / plannedBudgetTotal) * 100) : 0,
      planExecutionRate:
        publishedPlans > 0 ? Math.round((plansWithTrainings / publishedPlans) * 100) : 0,
      topTrainings,
    };
  }
}
