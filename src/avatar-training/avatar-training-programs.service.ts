// src/avatar-training/avatar-training-programs.service.ts
// Formações, sessões (construtor), fontes aprovadas, avaliação da sessão e atribuições.
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/services/audit.service';
import { CurrentUserData } from '../common/decorators';
import { isPrivileged } from '../common/authz/ownership';
import { AvatarTrainingIntegrationsService } from './avatar-training-integrations.service';
import { AvatarTrainingNotificationsService } from './avatar-training-notifications.service';
import {
  AddKnowledgeSourceDto,
  AssignAvatarSessionDto,
  AvatarProgramFilterDto,
  AvatarSessionFilterDto,
  CreateAvatarProgramDto,
  CreateAvatarSessionDto,
  SessionStepDto,
  UpdateAvatarProgramDto,
  UpdateAvatarSessionDto,
  UpsertSessionAssessmentDto,
} from './dto/avatar-training.dto';
import {
  AVATAR_ADMIN_ROLES,
  AVATAR_AUTHOR_ROLES,
  parseJson,
  parseSteps,
  serializeSteps,
  stripAnswers,
} from './avatar-training.helpers';

@Injectable()
export class AvatarTrainingProgramsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly integrations: AvatarTrainingIntegrationsService,
    private readonly notifications: AvatarTrainingNotificationsService,
  ) {}

  // ── Programas ──────────────────────────────────────────────────────────────

  private async nextCode(): Promise<string> {
    const count = await this.prisma.avatarTrainingProgram.count();
    return `AVT-${String(count + 1).padStart(4, '0')}`;
  }

  private async assertAvatarUsable(avatarId: number | undefined | null) {
    if (!avatarId) return;
    const a = await this.prisma.trainingAvatar.findUnique({
      where: { id: avatarId },
      select: { status: true },
    });
    if (!a) throw new NotFoundException('Avatar não encontrado');
    if (a.status === 'ARCHIVED' || a.status === 'INACTIVE') {
      throw new ConflictException('O avatar seleccionado não está disponível');
    }
  }

  async listPrograms(user: CurrentUserData, filters: AvatarProgramFilterDto) {
    const author = isPrivileged(user, AVATAR_AUTHOR_ROLES);
    const where: Prisma.AvatarTrainingProgramWhereInput = {
      ...(author ? (filters.status ? { status: filters.status } : {}) : { status: 'PUBLISHED' }),
      ...(filters.courseId ? { courseId: filters.courseId } : {}),
      ...(filters.category ? { category: filters.category } : {}),
      ...(filters.search
        ? { title: { contains: filters.search, mode: 'insensitive' as const } }
        : {}),
    };
    const rows = await this.prisma.avatarTrainingProgram.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      include: {
        avatar: { select: { id: true, name: true, imageUrl: true } },
        course: { select: { id: true, title: true } },
        _count: { select: { sessions: true } },
      },
    });
    if (author) return rows;
    // Formando: catálogo limitado ao seu público-alvo.
    const visible = [];
    for (const p of rows) {
      if (await this.integrations.userMatchesAudience(user.id, p)) visible.push(p);
    }
    return visible;
  }

  async getProgram(user: CurrentUserData, id: number) {
    const author = isPrivileged(user, AVATAR_AUTHOR_ROLES);
    const program = await this.prisma.avatarTrainingProgram.findUnique({
      where: { id },
      include: {
        avatar: { select: { id: true, name: true, imageUrl: true, language: true } },
        course: { select: { id: true, title: true, status: true } },
        sessions: {
          where: author ? {} : { status: 'PUBLISHED' },
          orderBy: { position: 'asc' },
          select: {
            id: true,
            title: true,
            position: true,
            experienceType: true,
            durationMinutes: true,
            mandatory: true,
            status: true,
            version: true,
          },
        },
      },
    });
    if (!program || (!author && program.status !== 'PUBLISHED')) {
      throw new NotFoundException('Formação não encontrada');
    }
    const enrollmentId = program.courseId
      ? await this.integrations.resolveEnrollment(program.courseId, user.id)
      : null;
    return { ...program, myCourseEnrollment: await this.integrations.courseStatus(enrollmentId) };
  }

  async createProgram(userId: number, dto: CreateAvatarProgramDto) {
    if (dto.courseId) await this.integrations.assertCourse(dto.courseId, dto.moduleId);
    else if (dto.moduleId) throw new BadRequestException('moduleId exige courseId');
    await this.integrations.assertCourses(dto.prerequisiteCourseIds ?? []);
    await this.assertAvatarUsable(dto.avatarId);
    if (dto.responsibleId) await this.integrations.assertUserExists(dto.responsibleId, 'Formador');

    const code = dto.code ?? (await this.nextCode());
    if (
      await this.prisma.avatarTrainingProgram.findUnique({ where: { code }, select: { id: true } })
    ) {
      throw new ConflictException(`Já existe uma formação com o código ${code}`);
    }
    const program = await this.prisma.avatarTrainingProgram.create({
      data: { ...dto, code, createdById: userId, responsibleId: dto.responsibleId ?? userId },
    });
    await this.audit.log({
      userId,
      action: 'CREATE',
      entity: 'AvatarTrainingProgram',
      entityId: program.id,
    });
    return program;
  }

  private async getEditableProgram(id: number) {
    const program = await this.prisma.avatarTrainingProgram.findUnique({ where: { id } });
    if (!program) throw new NotFoundException('Formação não encontrada');
    if (program.status === 'ARCHIVED') throw new ConflictException('Formação arquivada');
    return program;
  }

  async updateProgram(user: CurrentUserData, id: number, dto: UpdateAvatarProgramDto) {
    const program = await this.getEditableProgram(id);
    this.assertOwnerOrAdmin(user, program.createdById, program.responsibleId);
    const courseId = dto.courseId ?? program.courseId ?? undefined;
    if (dto.courseId || dto.moduleId) {
      if (!courseId) throw new BadRequestException('moduleId exige courseId');
      await this.integrations.assertCourse(courseId, dto.moduleId ?? program.moduleId ?? undefined);
    }
    if (dto.prerequisiteCourseIds) await this.integrations.assertCourses(dto.prerequisiteCourseIds);
    if (dto.avatarId) await this.assertAvatarUsable(dto.avatarId);
    if (dto.code && dto.code !== program.code) {
      throw new BadRequestException('O código da formação não pode ser alterado');
    }
    const { code: _ignored, ...data } = dto;
    // Editar uma formação em revisão devolve-a a rascunho (a aprovação deixa de ser válida).
    const row = await this.prisma.avatarTrainingProgram.update({
      where: { id },
      data: {
        ...data,
        ...(program.status === 'IN_REVIEW' ? { status: 'DRAFT', reviewSubmittedAt: null } : {}),
        ...(program.status === 'PUBLISHED' ? { version: { increment: 1 } } : {}),
      },
    });
    await this.audit.log({
      userId: user.id,
      action: 'UPDATE',
      entity: 'AvatarTrainingProgram',
      entityId: id,
      metadata: { fields: Object.keys(dto) },
    });
    return row;
  }

  private assertOwnerOrAdmin(
    user: CurrentUserData,
    createdById: number | null,
    responsibleId: number | null,
  ) {
    if (isPrivileged(user, AVATAR_ADMIN_ROLES)) return;
    if (user.id === createdById || user.id === responsibleId) return;
    throw new NotFoundException('Formação não encontrada');
  }

  async submitForReview(user: CurrentUserData, id: number) {
    const program = await this.getEditableProgram(id);
    this.assertOwnerOrAdmin(user, program.createdById, program.responsibleId);
    if (program.status !== 'DRAFT')
      throw new ConflictException('Só rascunhos podem ser submetidos');
    const sessions = await this.prisma.avatarTrainingSession.count({
      where: { programId: id, status: { not: 'ARCHIVED' } },
    });
    if (!sessions) throw new ConflictException('Adicione pelo menos uma sessão antes de submeter');
    const row = await this.prisma.avatarTrainingProgram.update({
      where: { id },
      data: { status: 'IN_REVIEW', reviewSubmittedAt: new Date() },
    });
    await this.audit.log({
      userId: user.id,
      action: 'SUBMIT',
      entity: 'AvatarTrainingProgram',
      entityId: id,
    });
    return row;
  }

  async publishProgram(user: CurrentUserData, id: number) {
    const program = await this.getEditableProgram(id);
    if (program.status !== 'IN_REVIEW') {
      throw new ConflictException('A formação tem de estar em revisão para ser publicada');
    }
    if (program.createdById === user.id && !isPrivileged(user, [...AVATAR_ADMIN_ROLES])) {
      throw new ForbiddenException('A aprovação tem de ser feita por outra pessoa');
    }
    const [row] = await this.prisma.$transaction([
      this.prisma.avatarTrainingProgram.update({
        where: { id },
        data: {
          status: 'PUBLISHED',
          approvedById: user.id,
          approvedAt: new Date(),
          publishedAt: new Date(),
        },
      }),
      this.prisma.avatarTrainingSession.updateMany({
        where: { programId: id, status: { in: ['DRAFT', 'IN_REVIEW'] } },
        data: { status: 'PUBLISHED' },
      }),
    ]);
    await this.audit.log({
      userId: user.id,
      action: 'APPROVE',
      entity: 'AvatarTrainingProgram',
      entityId: id,
    });
    return row;
  }

  async archiveProgram(user: CurrentUserData, id: number) {
    const program = await this.getEditableProgram(id);
    this.assertOwnerOrAdmin(user, program.createdById, program.responsibleId);
    const [row] = await this.prisma.$transaction([
      this.prisma.avatarTrainingProgram.update({ where: { id }, data: { status: 'ARCHIVED' } }),
      this.prisma.avatarTrainingSession.updateMany({
        where: { programId: id },
        data: { status: 'ARCHIVED' },
      }),
    ]);
    await this.audit.log({
      userId: user.id,
      action: 'DELETE',
      entity: 'AvatarTrainingProgram',
      entityId: id,
    });
    return row;
  }

  // ── Sessões ────────────────────────────────────────────────────────────────

  private presentSession<T extends { contentConfig: string | null }>(s: T, withAnswers: boolean) {
    const { contentConfig, ...rest } = s;
    const steps = parseSteps(contentConfig);
    return { ...rest, steps: withAnswers ? steps : stripAnswers(steps) };
  }

  private validateSteps(steps: SessionStepDto[]) {
    const keys = new Set<string>();
    for (const s of steps) {
      if (keys.has(s.key)) throw new BadRequestException(`Chave de etapa duplicada: ${s.key}`);
      keys.add(s.key);
      if (s.type === 'QUESTION') {
        if (!s.question)
          throw new BadRequestException(`A etapa ${s.key} exige a definição da pergunta`);
        if (s.question.kind === 'SINGLE' && (s.question.options?.length ?? 0) < 2) {
          throw new BadRequestException(`A etapa ${s.key} exige pelo menos 2 opções`);
        }
        if (
          s.question.correctAnswer &&
          s.question.kind === 'SINGLE' &&
          !s.question.options?.includes(s.question.correctAnswer)
        ) {
          throw new BadRequestException(
            `A resposta correcta da etapa ${s.key} tem de ser uma das opções`,
          );
        }
      }
    }
  }

  async listSessions(user: CurrentUserData, filters: AvatarSessionFilterDto) {
    const author = isPrivileged(user, AVATAR_AUTHOR_ROLES);
    const rows = await this.prisma.avatarTrainingSession.findMany({
      where: {
        ...(filters.programId ? { programId: filters.programId } : {}),
        ...(author ? (filters.status ? { status: filters.status } : {}) : { status: 'PUBLISHED' }),
        ...(author ? {} : { program: { status: 'PUBLISHED' } }),
      },
      orderBy: [{ programId: 'asc' }, { position: 'asc' }],
      include: {
        program: { select: { id: true, title: true, courseId: true } },
        avatar: { select: { id: true, name: true, imageUrl: true } },
      },
    });
    return rows.map(r => this.presentSession(r, false));
  }

  async getSession(user: CurrentUserData, id: number) {
    const author = isPrivileged(user, AVATAR_AUTHOR_ROLES);
    const row = await this.prisma.avatarTrainingSession.findUnique({
      where: { id },
      include: {
        program: {
          select: { id: true, title: true, courseId: true, status: true, language: true },
        },
        avatar: { select: { id: true, name: true, imageUrl: true, language: true, tone: true } },
        assessment: true,
        knowledgeSources: true,
      },
    });
    if (!row || (!author && (row.status !== 'PUBLISHED' || row.program.status !== 'PUBLISHED'))) {
      throw new NotFoundException('Sessão não encontrada');
    }
    const { assessment, ...rest } = row;
    return {
      ...this.presentSession(rest, author),
      assessment: assessment
        ? {
            ...assessment,
            rubricConfig: author ? parseJson(assessment.rubricConfig, []) : undefined,
          }
        : null,
    };
  }

  async createSession(user: CurrentUserData, dto: CreateAvatarSessionDto) {
    const program = await this.getEditableProgram(dto.programId);
    this.assertOwnerOrAdmin(user, program.createdById, program.responsibleId);
    await this.assertAvatarUsable(dto.avatarId);
    if (dto.steps) this.validateSteps(dto.steps);
    const last = await this.prisma.avatarTrainingSession.aggregate({
      where: { programId: dto.programId },
      _max: { position: true },
    });
    const { steps, ...rest } = dto;
    const row = await this.prisma.avatarTrainingSession.create({
      data: {
        ...rest,
        position: dto.position ?? (last._max.position ?? 0) + 1,
        contentConfig: serializeSteps(steps ?? []),
        // Sessão nova numa formação já publicada nasce em rascunho até nova aprovação.
        status: 'DRAFT',
      },
    });
    await this.audit.log({
      userId: user.id,
      action: 'CREATE',
      entity: 'AvatarTrainingSession',
      entityId: row.id,
    });
    return this.presentSession(row, true);
  }

  async updateSession(user: CurrentUserData, id: number, dto: UpdateAvatarSessionDto) {
    const session = await this.prisma.avatarTrainingSession.findUnique({
      where: { id },
      include: { program: true },
    });
    if (!session) throw new NotFoundException('Sessão não encontrada');
    this.assertOwnerOrAdmin(user, session.program.createdById, session.program.responsibleId);
    if (session.status === 'ARCHIVED') throw new ConflictException('Sessão arquivada');
    if (dto.programId && dto.programId !== session.programId) {
      throw new BadRequestException('Não é possível mover a sessão para outra formação');
    }
    await this.assertAvatarUsable(dto.avatarId);
    if (dto.steps) this.validateSteps(dto.steps);
    const { steps, programId: _p, ...rest } = dto;
    const row = await this.prisma.avatarTrainingSession.update({
      where: { id },
      data: {
        ...rest,
        ...(steps ? { contentConfig: serializeSteps(steps) } : {}),
        // Conteúdo/regras alteradas ficam versionadas para auditoria.
        ...(steps || dto.welcomeMessage !== undefined ? { version: { increment: 1 } } : {}),
      },
    });
    await this.audit.log({
      userId: user.id,
      action: 'UPDATE',
      entity: 'AvatarTrainingSession',
      entityId: id,
      metadata: { fields: Object.keys(dto), version: row.version },
    });
    return this.presentSession(row, true);
  }

  // ── Avaliação da sessão e fontes ───────────────────────────────────────────

  async upsertAssessment(
    user: CurrentUserData,
    sessionId: number,
    dto: UpsertSessionAssessmentDto,
  ) {
    const session = await this.prisma.avatarTrainingSession.findUnique({
      where: { id: sessionId },
      include: { program: true },
    });
    if (!session) throw new NotFoundException('Sessão não encontrada');
    this.assertOwnerOrAdmin(user, session.program.createdById, session.program.responsibleId);

    if (dto.rubric) {
      const total = dto.rubric.reduce((acc, c) => acc + c.weight, 0);
      if (dto.rubric.length && Math.abs(total - 100) > 0.01) {
        throw new BadRequestException('Os pesos da rubrica têm de somar 100%');
      }
      if (new Set(dto.rubric.map(c => c.key)).size !== dto.rubric.length) {
        throw new BadRequestException('Chaves de critério duplicadas');
      }
    }
    if (dto.assessmentId)
      await this.integrations.assertAssessment(dto.assessmentId, session.program.courseId);
    if (dto.requireFormalAssessment && !dto.assessmentId) {
      const existing = await this.prisma.avatarTrainingAssessment.findUnique({
        where: { sessionId },
        select: { assessmentId: true },
      });
      if (!existing?.assessmentId) {
        throw new BadRequestException('requireFormalAssessment exige assessmentId');
      }
    }
    const data = {
      ...(dto.assessmentId !== undefined ? { assessmentId: dto.assessmentId } : {}),
      ...(dto.rubric !== undefined ? { rubricConfig: JSON.stringify(dto.rubric) } : {}),
      ...(dto.passingScore !== undefined ? { passingScore: dto.passingScore } : {}),
      ...(dto.maxAttempts !== undefined ? { maxAttempts: dto.maxAttempts } : {}),
      ...(dto.requireFormalAssessment !== undefined
        ? { requireFormalAssessment: dto.requireFormalAssessment }
        : {}),
    };
    const row = await this.prisma.avatarTrainingAssessment.upsert({
      where: { sessionId },
      create: { sessionId, ...data },
      update: data,
    });
    await this.audit.log({
      userId: user.id,
      action: 'UPDATE',
      entity: 'AvatarTrainingAssessment',
      entityId: row.id,
      metadata: { sessionId },
    });
    return { ...row, rubricConfig: parseJson(row.rubricConfig, []) };
  }

  async addSource(user: CurrentUserData, sessionId: number, dto: AddKnowledgeSourceDto) {
    const session = await this.prisma.avatarTrainingSession.findUnique({
      where: { id: sessionId },
      include: { program: true },
    });
    if (!session) throw new NotFoundException('Sessão não encontrada');
    this.assertOwnerOrAdmin(user, session.program.createdById, session.program.responsibleId);
    const title = await this.integrations.resolveSource(dto.sourceType, dto.sourceId);
    try {
      const row = await this.prisma.avatarTrainingKnowledgeSource.create({
        data: { sessionId, sourceType: dto.sourceType, sourceId: dto.sourceId, title },
      });
      await this.audit.log({
        userId: user.id,
        action: 'CREATE',
        entity: 'AvatarTrainingKnowledgeSource',
        entityId: row.id,
        metadata: { sessionId, ...dto },
      });
      return row;
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException('Fonte já associada a esta sessão');
      }
      throw e;
    }
  }

  async removeSource(user: CurrentUserData, sessionId: number, sourceId: number) {
    const source = await this.prisma.avatarTrainingKnowledgeSource.findFirst({
      where: { id: sourceId, sessionId },
      include: { session: { include: { program: true } } },
    });
    if (!source) throw new NotFoundException('Fonte não encontrada');
    this.assertOwnerOrAdmin(
      user,
      source.session.program.createdById,
      source.session.program.responsibleId,
    );
    await this.prisma.avatarTrainingKnowledgeSource.delete({ where: { id: sourceId } });
    await this.audit.log({
      userId: user.id,
      action: 'DELETE',
      entity: 'AvatarTrainingKnowledgeSource',
      entityId: sourceId,
      metadata: { sessionId },
    });
    return { deleted: true };
  }

  // ── Atribuições ────────────────────────────────────────────────────────────

  async assign(user: CurrentUserData, sessionId: number, dto: AssignAvatarSessionDto) {
    const session = await this.prisma.avatarTrainingSession.findUnique({
      where: { id: sessionId },
      include: { program: true },
    });
    if (!session || session.status !== 'PUBLISHED' || session.program.status !== 'PUBLISHED') {
      throw new NotFoundException('Sessão publicada não encontrada');
    }
    const userIds = [...new Set(dto.userIds)];
    if (!userIds.length) throw new BadRequestException('Indique pelo menos um utilizador');
    await this.integrations.assertCanManageUsers(user, userIds);
    const users = await this.prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true },
    });
    if (users.length !== userIds.length) throw new NotFoundException('Utilizador não encontrado');

    const dueDate = dto.dueDate ? new Date(dto.dueDate) : null;
    const mandatory = dto.mandatory ?? session.mandatory;
    const created: number[] = [];
    const createdRows: { id: number; userId: number; dueDate: Date | null; mandatory: boolean }[] =
      [];
    const skipped: { userId: number; reason: string }[] = [];

    for (const userId of userIds) {
      if (!(await this.integrations.userMatchesAudience(userId, session.program))) {
        skipped.push({ userId, reason: 'Fora do público-alvo da formação' });
        continue;
      }
      const existing = await this.prisma.avatarTrainingAssignment.findUnique({
        where: { sessionId_userId: { sessionId, userId } },
      });
      if (existing && existing.status !== 'CANCELLED') {
        skipped.push({ userId, reason: 'Já atribuída' });
        continue;
      }
      const enrollmentId = await this.integrations.resolveEnrollment(
        session.program.courseId,
        userId,
        {
          autoEnroll: dto.autoEnroll,
          assignedById: user.id,
          mandatory,
          deadline: dueDate,
        },
      );
      const data = {
        enrollmentId,
        assignedById: user.id,
        mandatory,
        dueDate,
        status: 'ASSIGNED' as const,
        assignedAt: new Date(),
        completedAt: null,
      };
      const row = existing
        ? await this.prisma.avatarTrainingAssignment.update({ where: { id: existing.id }, data })
        : await this.prisma.avatarTrainingAssignment.create({
            data: { sessionId, userId, ...data },
          });
      created.push(row.id);
      createdRows.push({ id: row.id, userId, dueDate, mandatory });
    }
    await this.audit.log({
      userId: user.id,
      action: 'ASSIGN',
      entity: 'AvatarTrainingSession',
      entityId: sessionId,
      metadata: { assigned: created.length, skipped: skipped.length },
    });
    await this.notifications.assigned(createdRows, { id: session.id, title: session.title });
    return { assigned: created.length, assignmentIds: created, skipped };
  }

  async cancelAssignment(user: CurrentUserData, assignmentId: number) {
    const a = await this.prisma.avatarTrainingAssignment.findUnique({
      where: { id: assignmentId },
    });
    if (!a) throw new NotFoundException('Atribuição não encontrada');
    if (!isPrivileged(user, AVATAR_ADMIN_ROLES) && a.assignedById !== user.id) {
      throw new NotFoundException('Atribuição não encontrada');
    }
    if (a.status === 'COMPLETED') throw new ConflictException('Atribuição já concluída');
    const row = await this.prisma.avatarTrainingAssignment.update({
      where: { id: assignmentId },
      data: { status: 'CANCELLED' },
    });
    await this.audit.log({
      userId: user.id,
      action: 'DELETE',
      entity: 'AvatarTrainingAssignment',
      entityId: assignmentId,
    });
    return row;
  }
}
