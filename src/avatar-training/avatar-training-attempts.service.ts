// src/avatar-training/avatar-training-attempts.service.ts
// Fase 2 — sala virtual: tentativas, interacções, pausa/retoma, submissão,
// conclusão, progresso e histórico. Texto é sempre suficiente (sem voz/vídeo).
import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/services/audit.service';
import { CurrentUserData } from '../common/decorators';
import { assertCanAccess, isPrivileged } from '../common/authz/ownership';
import { Role } from '../auth/enums/role.enum';
import { AvatarTrainingIntegrationsService } from './avatar-training-integrations.service';
import { AvatarTrainingAssessmentsService } from './avatar-training-assessments.service';
import {
  AvatarProgressFilterDto,
  RecordInteractionDto,
  ReviewAttemptDto,
  StartAttemptDto,
  SubmitAttemptDto,
} from './dto/avatar-training.dto';
import {
  AVATAR_ADMIN_ROLES,
  AVATAR_PROGRESS_ROLES,
  StoredStep,
  parseJson,
  parseSteps,
  stripAnswers,
} from './avatar-training.helpers';

const OPEN_STATES = ['IN_PROGRESS', 'PAUSED'] as const;

@Injectable()
export class AvatarTrainingAttemptsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly integrations: AvatarTrainingIntegrationsService,
    private readonly assessments: AvatarTrainingAssessmentsService,
  ) {}

  // ── Helpers ────────────────────────────────────────────────────────────────

  private withOverdue<T extends { status: string; dueDate: Date | null }>(a: T): T {
    if (
      (a.status === 'ASSIGNED' || a.status === 'IN_PROGRESS') &&
      a.dueDate &&
      a.dueDate < new Date()
    ) {
      return { ...a, status: 'OVERDUE' };
    }
    return a;
  }

  private async loadAttempt(id: number) {
    const attempt = await this.prisma.avatarTrainingAttempt.findUnique({
      where: { id },
      include: { assignment: { include: { session: { include: { program: true } } } } },
    });
    return attempt;
  }

  private async ownAttempt(user: CurrentUserData, id: number) {
    const attempt = await this.loadAttempt(id);
    assertCanAccess(attempt, attempt?.userId ?? -1, user, []);
    return attempt;
  }

  private stepsOf(attempt: {
    assignment: { session: { contentConfig: string | null } };
  }): StoredStep[] {
    return parseSteps(attempt.assignment.session.contentConfig);
  }

  private async nextSequence(tx: Prisma.TransactionClient, attemptId: number) {
    const last = await tx.avatarTrainingInteraction.aggregate({
      where: { attemptId },
      _max: { sequence: true },
    });
    return (last._max.sequence ?? 0) + 1;
  }

  private async appendInteraction(
    tx: Prisma.TransactionClient,
    attemptId: number,
    data: {
      interactionType: Prisma.AvatarTrainingInteractionCreateManyInput['interactionType'];
      content: string;
      stepKey?: string;
      metadata?: object;
    },
  ) {
    return tx.avatarTrainingInteraction.create({
      data: {
        attemptId,
        sequence: await this.nextSequence(tx, attemptId),
        interactionType: data.interactionType,
        content: data.content,
        stepKey: data.stepKey,
        metadata: data.metadata ? JSON.stringify(data.metadata) : undefined,
      },
    });
  }

  /** Chaves das etapas concluídas (avançadas ou respondidas). */
  private async doneStepKeys(attemptId: number): Promise<Set<string>> {
    const rows = await this.prisma.avatarTrainingInteraction.findMany({
      where: {
        attemptId,
        interactionType: { in: ['STEP_ADVANCE', 'USER_ANSWER'] },
        stepKey: { not: null },
      },
      select: { stepKey: true },
    });
    return new Set(rows.map(r => r.stepKey));
  }

  private async latestAnswers(attemptId: number): Promise<Map<string, string>> {
    const rows = await this.prisma.avatarTrainingInteraction.findMany({
      where: { attemptId, interactionType: 'USER_ANSWER', stepKey: { not: null } },
      orderBy: { sequence: 'asc' },
      select: { stepKey: true, content: true },
    });
    return new Map(rows.map(r => [r.stepKey, r.content]));
  }

  // ── Fluxo do formando ──────────────────────────────────────────────────────

  async myAssignments(user: CurrentUserData) {
    const rows = await this.prisma.avatarTrainingAssignment.findMany({
      where: { userId: user.id, status: { not: 'CANCELLED' }, session: { status: 'PUBLISHED' } },
      orderBy: [{ dueDate: 'asc' }, { assignedAt: 'desc' }],
      include: {
        session: {
          select: {
            id: true,
            title: true,
            experienceType: true,
            durationMinutes: true,
            program: { select: { id: true, title: true, courseId: true } },
          },
        },
        attempts: {
          orderBy: { attemptNumber: 'desc' },
          take: 1,
          select: { id: true, status: true, progress: true, score: true, passed: true },
        },
      },
    });
    return rows.map(r => this.withOverdue(r));
  }

  async start(user: CurrentUserData, sessionId: number, dto: StartAttemptDto) {
    const assignment = await this.prisma.avatarTrainingAssignment.findUnique({
      where: { sessionId_userId: { sessionId, userId: user.id } },
      include: { session: { include: { program: true, avatar: true } } },
    });
    if (!assignment || assignment.status === 'CANCELLED') {
      throw new NotFoundException('Sessão não atribuída ao utilizador');
    }
    const { session } = assignment;
    if (session.status !== 'PUBLISHED' || session.program.status !== 'PUBLISHED') {
      throw new ConflictException('A sessão não está publicada');
    }
    if (assignment.status === 'COMPLETED') throw new ConflictException('Sessão já concluída');

    // Retomar tentativa aberta em vez de criar outra.
    const open = await this.prisma.avatarTrainingAttempt.findFirst({
      where: { assignmentId: assignment.id, status: { in: [...OPEN_STATES] } },
    });
    if (open) return this.room(open.id, user);

    await this.integrations.assertPrerequisites(user.id, session.program.prerequisiteCourseIds);
    const config = await this.assessments.getConfig(sessionId);
    const used = await this.prisma.avatarTrainingAttempt.count({
      where: { assignmentId: assignment.id },
    });
    if (config.maxAttempts > 0 && used >= config.maxAttempts) {
      throw new ConflictException('Número máximo de tentativas atingido');
    }

    const attempt = await this.prisma.$transaction(async tx => {
      const created = await tx.avatarTrainingAttempt.create({
        data: {
          assignmentId: assignment.id,
          userId: user.id,
          attemptNumber: used + 1,
          textOnly: dto.textOnly ?? true,
        },
      });
      await this.appendInteraction(tx, created.id, {
        interactionType: 'AVATAR_MESSAGE',
        content:
          session.welcomeMessage ??
          `Olá! Sou o instrutor virtual${session.avatar ? ` ${session.avatar.name}` : ''}. Vamos começar: ${session.title}.`,
        metadata: { virtualInstructor: true },
      });
      await tx.avatarTrainingAssignment.update({
        where: { id: assignment.id },
        data: { status: 'IN_PROGRESS' },
      });
      return created;
    });
    await this.integrations.markEnrollmentStarted(assignment.enrollmentId);
    await this.audit.log({
      userId: user.id,
      action: 'START',
      entity: 'AvatarTrainingAttempt',
      entityId: attempt.id,
      metadata: { sessionId, attemptNumber: attempt.attemptNumber },
    });
    return this.room(attempt.id, user);
  }

  /** Estado actual da sala: etapas (sem gabarito), etapa actual e transcrição. */
  async room(attemptId: number, user: CurrentUserData) {
    const attempt = await this.ownAttempt(user, attemptId);
    const steps = stripAnswers(this.stepsOf(attempt));
    const interactions = await this.prisma.avatarTrainingInteraction.findMany({
      where: { attemptId },
      orderBy: { sequence: 'asc' },
    });
    const { assignment, ...rest } = attempt;
    return {
      attempt: rest,
      session: {
        id: assignment.session.id,
        title: assignment.session.title,
        version: assignment.session.version,
        program: { id: assignment.session.program.id, title: assignment.session.program.title },
      },
      // Transparência: o interlocutor é sempre identificado como instrutor virtual.
      notice: 'Está a interagir com um instrutor virtual (IA).',
      steps,
      currentStep: steps[attempt.currentStep] ?? null,
      interactions: interactions.map(i => ({ ...i, metadata: parseJson(i.metadata, null) })),
    };
  }

  async record(user: CurrentUserData, attemptId: number, dto: RecordInteractionDto) {
    const attempt = await this.ownAttempt(user, attemptId);
    if (attempt.status !== 'IN_PROGRESS') {
      throw new ConflictException(
        attempt.status === 'PAUSED'
          ? 'A sessão está em pausa — retome primeiro'
          : 'A tentativa já não aceita interacções',
      );
    }
    const steps = this.stepsOf(attempt);
    const step = dto.stepKey ? steps.find(s => s.key === dto.stepKey) : undefined;
    if (dto.stepKey && !step) throw new NotFoundException('Etapa não encontrada');
    if (dto.interactionType === 'USER_ANSWER' && !step) {
      throw new ConflictException('Uma resposta exige stepKey');
    }

    const result = await this.prisma.$transaction(async tx => {
      const interaction = await this.appendInteraction(tx, attemptId, {
        interactionType: dto.interactionType,
        content: dto.content,
        stepKey: dto.stepKey,
        metadata: dto.metadata,
      });
      let feedback: { correct: boolean; explanation?: string } | null = null;
      if (dto.interactionType === 'USER_ANSWER' && step) {
        feedback = this.assessments.gradeAnswer(step, dto.content);
        if (feedback) {
          await this.appendInteraction(tx, attemptId, {
            interactionType: 'FEEDBACK',
            stepKey: step.key,
            content: feedback.correct ? 'Resposta correcta.' : 'Resposta incorrecta.',
            metadata: { explanation: feedback.explanation ?? null },
          });
        }
      }
      if (dto.interactionType === 'STEP_ADVANCE' || dto.interactionType === 'USER_ANSWER') {
        const idx = step ? steps.findIndex(s => s.key === step.key) : attempt.currentStep;
        const next = Math.min(Math.max(attempt.currentStep, idx + 1), steps.length);
        await tx.avatarTrainingAttempt.update({
          where: { id: attemptId },
          data: {
            currentStep: next,
            progress: steps.length ? Math.round((next / steps.length) * 100) : 0,
          },
        });
      }
      return { interaction, feedback };
    });
    return result;
  }

  async pause(user: CurrentUserData, attemptId: number) {
    const attempt = await this.ownAttempt(user, attemptId);
    if (attempt.status !== 'IN_PROGRESS')
      throw new ConflictException('Só é possível pausar uma sessão em curso');
    return this.prisma.$transaction(async tx => {
      await this.appendInteraction(tx, attemptId, {
        interactionType: 'PAUSE',
        content: 'Sessão em pausa',
      });
      return tx.avatarTrainingAttempt.update({
        where: { id: attemptId },
        data: { status: 'PAUSED', pausedAt: new Date() },
      });
    });
  }

  async resume(user: CurrentUserData, attemptId: number) {
    const attempt = await this.ownAttempt(user, attemptId);
    if (attempt.status !== 'PAUSED') throw new ConflictException('A sessão não está em pausa');
    const extra = attempt.pausedAt
      ? Math.round((Date.now() - attempt.pausedAt.getTime()) / 1000)
      : 0;
    return this.prisma.$transaction(async tx => {
      await this.appendInteraction(tx, attemptId, {
        interactionType: 'RESUME',
        content: 'Sessão retomada',
      });
      return tx.avatarTrainingAttempt.update({
        where: { id: attemptId },
        data: { status: 'IN_PROGRESS', pausedAt: null, pausedSeconds: { increment: extra } },
      });
    });
  }

  async abandon(user: CurrentUserData, attemptId: number) {
    const attempt = await this.ownAttempt(user, attemptId);
    if (!(OPEN_STATES as readonly string[]).includes(attempt.status)) {
      throw new ConflictException('A tentativa já foi terminada');
    }
    return this.prisma.avatarTrainingAttempt.update({
      where: { id: attemptId },
      data: { status: 'ABANDONED', completedAt: new Date() },
    });
  }

  async submit(user: CurrentUserData, attemptId: number, dto: SubmitAttemptDto) {
    const attempt = await this.ownAttempt(user, attemptId);
    if (attempt.status !== 'IN_PROGRESS')
      throw new ConflictException('Só é possível submeter uma sessão em curso');
    const steps = this.stepsOf(attempt);
    for (const a of dto.answers ?? []) {
      if (!steps.some(s => s.key === a.stepKey))
        throw new NotFoundException(`Etapa ${a.stepKey} não existe`);
    }
    const knowledge = await this.prisma.$transaction(async tx => {
      for (const a of dto.answers ?? []) {
        await this.appendInteraction(tx, attemptId, {
          interactionType: 'USER_ANSWER',
          stepKey: a.stepKey,
          content: a.answer,
        });
      }
      const answers = await this.latestAnswers(attemptId);
      for (const a of dto.answers ?? []) answers.set(a.stepKey, a.answer);
      const graded = this.assessments.gradeKnowledge(steps, answers);
      await tx.avatarTrainingAttempt.update({
        where: { id: attemptId },
        data: {
          status: 'SUBMITTED',
          submittedAt: new Date(),
          score: graded.score,
        },
      });
      return graded;
    });
    await this.audit.log({
      userId: user.id,
      action: 'SUBMIT',
      entity: 'AvatarTrainingAttempt',
      entityId: attemptId,
      metadata: { knowledgeScore: knowledge.score },
    });
    return {
      attemptId,
      status: 'SUBMITTED',
      knowledgeScore: knowledge.score,
      breakdown: knowledge.breakdown,
    };
  }

  /** Revisão humana da rubrica (simulações). Não conclui a tentativa. */
  async review(user: CurrentUserData, attemptId: number, dto: ReviewAttemptDto) {
    const attempt = await this.loadAttempt(attemptId);
    if (!attempt) throw new NotFoundException('Tentativa não encontrada');
    const program = attempt.assignment.session.program;
    const allowed =
      isPrivileged(user, AVATAR_ADMIN_ROLES) ||
      user.id === program.responsibleId ||
      user.id === program.createdById;
    if (!allowed) throw new NotFoundException('Tentativa não encontrada');
    if (attempt.status !== 'SUBMITTED')
      throw new ConflictException('A tentativa tem de estar submetida');
    if (attempt.userId === user.id)
      throw new ConflictException('Não pode rever a sua própria tentativa');

    const config = await this.assessments.getConfig(attempt.assignment.sessionId);
    const rubric = this.assessments.scoreRubric(config.rubric, dto.criteria);
    await this.prisma.$transaction(async tx => {
      await this.appendInteraction(tx, attemptId, {
        interactionType: 'FEEDBACK',
        stepKey: 'REVIEW',
        content: dto.feedback ?? 'Revisão concluída',
        metadata: { reviewerId: user.id, rubric: rubric.breakdown, score: rubric.score },
      });
      await tx.avatarTrainingAttempt.update({
        where: { id: attemptId },
        data: { score: rubric.score, feedback: dto.feedback, reviewedById: user.id },
      });
    });
    await this.audit.log({
      userId: user.id,
      action: 'REVIEW',
      entity: 'AvatarTrainingAttempt',
      entityId: attemptId,
      metadata: { score: rubric.score },
    });
    return { attemptId, score: rubric.score, breakdown: rubric.breakdown };
  }

  async complete(user: CurrentUserData, attemptId: number) {
    const attempt = await this.ownAttempt(user, attemptId);
    if (attempt.status === 'COMPLETED' || attempt.status === 'FAILED') {
      throw new ConflictException('A tentativa já foi concluída');
    }
    const { assignment } = attempt;
    const steps = this.stepsOf(attempt);
    const config = await this.assessments.getConfig(assignment.sessionId);
    const hasGraded = this.assessments.gradeKnowledge(steps, new Map()).score !== null;
    const hasRubric = config.rubric.length > 0;

    // Etapas obrigatórias.
    const done = await this.doneStepKeys(attemptId);
    const pending = steps.filter(s => s.mandatory !== false && !done.has(s.key));
    if (pending.length) {
      throw new ConflictException(
        `Etapas obrigatórias por concluir: ${pending.map(s => s.title).join(', ')}`,
      );
    }
    // Submissão e revisão quando há avaliação.
    if ((hasGraded || hasRubric) && attempt.status !== 'SUBMITTED') {
      throw new ConflictException('Submeta a avaliação antes de concluir');
    }
    if (hasRubric && !attempt.reviewedById) {
      throw new ConflictException('A simulação aguarda revisão do formador');
    }
    // Avaliação formal (leitura) — a nota formal continua em Assessments.
    if (config.requireFormalAssessment) {
      const formal = await this.integrations.formalAssessmentResult(
        config.assessmentId,
        attempt.userId,
      );
      if (!formal?.passed)
        throw new ConflictException('É necessária aprovação na avaliação formal');
    }

    const scored = hasGraded || hasRubric;
    const passed = scored ? (attempt.score ?? 0) >= config.passingScore : null;
    const status = passed === false ? 'FAILED' : 'COMPLETED';
    const now = new Date();

    await this.prisma.$transaction([
      this.prisma.avatarTrainingAttempt.update({
        where: { id: attemptId },
        data: { status, passed, completedAt: now, progress: 100, currentStep: steps.length },
      }),
      // Em caso de reprovação a atribuição fica aberta para nova tentativa.
      ...(status === 'COMPLETED'
        ? [
            this.prisma.avatarTrainingAssignment.update({
              where: { id: assignment.id },
              data: { status: 'COMPLETED', completedAt: now },
            }),
          ]
        : []),
    ]);
    await this.audit.log({
      userId: user.id,
      action: 'COMPLETE',
      entity: 'AvatarTrainingAttempt',
      entityId: attemptId,
      metadata: { status, score: attempt.score, passed },
    });
    // Concluir a sessão não conclui o curso: devolve-se o estado oficial (só leitura).
    return {
      attemptId,
      status,
      score: attempt.score,
      passed,
      passingScore: scored ? config.passingScore : null,
      course: await this.integrations.courseStatus(assignment.enrollmentId),
    };
  }

  // ── Resultados, progresso e histórico ──────────────────────────────────────

  async results(user: CurrentUserData, attemptId: number) {
    const attempt = await this.loadAttempt(attemptId);
    assertCanAccess(attempt, attempt?.userId ?? -1, user, [
      ...AVATAR_ADMIN_ROLES,
      ...AVATAR_PROGRESS_ROLES,
    ]);
    if (attempt.userId !== user.id) await this.assertCanSeeUser(user, attempt.userId);

    const steps = this.stepsOf(attempt);
    const config = await this.assessments.getConfig(attempt.assignment.sessionId);
    const answers = await this.latestAnswers(attemptId);
    const knowledge = this.assessments.gradeKnowledge(steps, answers);
    const review = await this.prisma.avatarTrainingInteraction.findFirst({
      where: { attemptId, stepKey: 'REVIEW' },
      orderBy: { sequence: 'desc' },
    });
    const finished = attempt.status === 'COMPLETED' || attempt.status === 'FAILED';
    return {
      attemptId,
      status: attempt.status,
      attemptNumber: attempt.attemptNumber,
      score: attempt.score,
      passed: attempt.passed,
      passingScore: config.passingScore,
      feedback: attempt.feedback,
      startedAt: attempt.startedAt,
      completedAt: attempt.completedAt,
      pausedSeconds: attempt.pausedSeconds,
      knowledge: {
        score: knowledge.score,
        // Gabarito só é revelado depois de a tentativa terminar.
        breakdown: finished
          ? knowledge.breakdown
          : knowledge.breakdown.map(b => ({ ...b, correct: undefined })),
      },
      rubric: parseJson<{ rubric?: unknown } | null>(review?.metadata, null)?.rubric ?? null,
      explanation:
        'Nota calculada por correcção automática das perguntas e/ou rubrica revista por um formador; não constitui decisão laboral isolada.',
      formalAssessment: await this.integrations.formalAssessmentResult(
        config.assessmentId,
        attempt.userId,
      ),
      course: await this.integrations.courseStatus(attempt.assignment.enrollmentId),
    };
  }

  private async assertCanSeeUser(user: CurrentUserData, targetUserId: number) {
    if (isPrivileged(user, AVATAR_ADMIN_ROLES) || isPrivileged(user, [Role.DIRECTOR, Role.AUDITOR]))
      return;
    const reports = await this.integrations.directReportIds(user.id);
    if (!reports.includes(targetUserId)) throw new NotFoundException('Recurso não encontrado');
  }

  /** Progresso: o formando vê o seu; ADMIN/RH/DIRECTOR/AUDITOR todos; GESTOR/LIDER a equipa. */
  async progress(user: CurrentUserData, filters: AvatarProgressFilterDto) {
    const page = filters.page ?? 1;
    const limit = filters.limit ?? 20;
    const wide = isPrivileged(user, [Role.ADMIN, Role.RH, Role.DIRECTOR, Role.AUDITOR]);
    const team = !wide && isPrivileged(user, [Role.GESTOR, Role.LIDER, Role.INSTRUCTOR]);

    let userFilter: Prisma.AvatarTrainingAssignmentWhereInput;
    if (wide) {
      userFilter = {
        ...(filters.userId ? { userId: filters.userId } : {}),
        ...(filters.departmentId ? { user: { departmentId: filters.departmentId } } : {}),
      };
    } else if (team) {
      const reports = await this.integrations.directReportIds(user.id);
      const allowed = [...reports, user.id];
      if (filters.userId && !allowed.includes(filters.userId))
        throw new NotFoundException('Utilizador não encontrado');
      userFilter = { userId: filters.userId ?? { in: allowed } };
    } else {
      userFilter = { userId: user.id };
    }

    const where: Prisma.AvatarTrainingAssignmentWhereInput = {
      ...userFilter,
      ...(filters.programId ? { session: { programId: filters.programId } } : {}),
      ...(filters.status && filters.status !== 'OVERDUE' ? { status: filters.status } : {}),
      ...(filters.status === 'OVERDUE'
        ? { status: { in: ['ASSIGNED', 'IN_PROGRESS'] }, dueDate: { lt: new Date() } }
        : {}),
    };
    const [total, rows] = await Promise.all([
      this.prisma.avatarTrainingAssignment.count({ where }),
      this.prisma.avatarTrainingAssignment.findMany({
        where,
        orderBy: { assignedAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          user: { select: { id: true, fullName: true } },
          session: {
            select: { id: true, title: true, program: { select: { id: true, title: true } } },
          },
          attempts: {
            orderBy: { attemptNumber: 'asc' },
            select: {
              attemptNumber: true,
              status: true,
              score: true,
              passed: true,
              progress: true,
            },
          },
        },
      }),
    ]);
    const data = rows.map(r => {
      const scores = r.attempts.map(a => a.score).filter((s): s is number => s !== null);
      return {
        ...this.withOverdue(r),
        attemptsCount: r.attempts.length,
        bestScore: scores.length ? Math.max(...scores) : null,
        // Evolução entre primeira e última tentativa com nota comparável.
        evolution:
          scores.length > 1 ? Math.round((scores[scores.length - 1] - scores[0]) * 10) / 10 : null,
      };
    });
    return { data, total, page, limit };
  }

  /** Histórico de tentativas (próprio ou, com permissão, de outro utilizador). */
  async history(user: CurrentUserData, userId?: number) {
    const target = userId ?? user.id;
    if (target !== user.id) await this.assertCanSeeUser(user, target);
    return this.prisma.avatarTrainingAttempt.findMany({
      where: { userId: target },
      orderBy: { startedAt: 'desc' },
      take: 100,
      select: {
        id: true,
        attemptNumber: true,
        status: true,
        score: true,
        passed: true,
        progress: true,
        startedAt: true,
        completedAt: true,
        assignment: {
          select: {
            session: {
              select: { id: true, title: true, program: { select: { id: true, title: true } } },
            },
          },
        },
      },
    });
  }
}
