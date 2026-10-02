// src/avatar-training/avatar-training-development.service.ts
// Fase 6 — desenvolvimento: competências demonstradas, acções de PDI, tarefas
// de onboarding e recomendações. O Avatar Training nunca duplica estes módulos:
// o nível oficial vive em UserCompetency (CompetenciesService), o progresso do
// PDI em DevelopmentPlansService e o do onboarding em OnboardingService. Aqui
// só se lê, se liga a atribuição ao registo de origem e se delega a escrita.
import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { CompetencySource } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/services/audit.service';
import { CurrentUserData } from '../common/decorators';
import { assertCanAccess, isPrivileged } from '../common/authz/ownership';
import { Role } from '../auth/enums/role.enum';
import { CompetenciesService } from '../competencies/competencies.service';
import { DevelopmentPlansService } from '../development-plans/development-plans.service';
import { OnboardingService } from '../onboarding/onboarding.service';
import { AvatarTrainingIntegrationsService } from './avatar-training-integrations.service';
import { AvatarTrainingProgramsService } from './avatar-training-programs.service';
import {
  AVATAR_ADMIN_ROLES,
  AVATAR_PROGRESS_ROLES,
  DIFFICULTY_ORDER,
  learnerLevelIndex,
  levelFit,
  levelFitRank,
  LevelFit,
} from './avatar-training.helpers';

/** Abaixo desta nota a competência é sugerida para reforço (sem alterar nada formal). */
const WEAK_SCORE = 70;
/** Avaliação de desempenho/360 com nível avaliado igual ou abaixo disto conta como necessidade de desenvolvimento. */
const PERFORMANCE_WEAK_LEVEL = 2;
const OPEN_ACTION_STATES = ['TODO', 'IN_PROGRESS', 'OVERDUE', 'BLOCKED'] as const;

export interface FinishedAttemptContext {
  attemptId: number;
  userId: number;
  score: number | null;
  assignment: {
    id: number;
    developmentPlanActionId: number | null;
    onboardingTaskInstanceId: number | null;
    session: { title: string; program: { id: number; title: string; competencyIds: number[] } };
  };
}

@Injectable()
export class AvatarTrainingDevelopmentService {
  private readonly logger = new Logger(AvatarTrainingDevelopmentService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly integrations: AvatarTrainingIntegrationsService,
    private readonly programs: AvatarTrainingProgramsService,
    private readonly competencies: CompetenciesService,
    private readonly plans: DevelopmentPlansService,
    private readonly onboarding: OnboardingService,
  ) {}

  // ── Conclusão de uma tentativa aprovada ────────────────────────────────────

  /**
   * Propaga o resultado para Competências, PDI e Onboarding. Cada propagação é
   * independente e não bloqueia a conclusão: uma falha fica registada e
   * devolvida no resumo.
   */
  async onAttemptCompleted(user: CurrentUserData, ctx: FinishedAttemptContext) {
    const summary = {
      competencies: [] as { competencyId: number; levelBefore: number; levelAfter: number }[],
      pdiActionCompleted: false,
      onboardingTaskCompleted: false,
      errors: [] as string[],
    };
    const guard = async (label: string, fn: () => Promise<void>) => {
      try {
        await fn();
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        this.logger.warn({ attemptId: ctx.attemptId, label, msg: message });
        summary.errors.push(`${label}: ${message}`);
      }
    };

    await guard('competencias', async () => {
      summary.competencies = await this.recordCompetencies(ctx);
    });
    await guard('pdi', async () => {
      summary.pdiActionCompleted = await this.completePdiAction(user, ctx);
    });
    await guard('onboarding', async () => {
      summary.onboardingTaskCompleted = await this.completeOnboardingTask(user, ctx);
    });
    return summary;
  }

  /** Nível = nota 0-100 projectada na escala da competência; só sobe, e um degrau de cada vez. */
  private async recordCompetencies(ctx: FinishedAttemptContext) {
    const ids = ctx.assignment.session.program.competencyIds;
    if (!ids.length || ctx.score === null) return [];
    const comps = await this.prisma.competency.findMany({
      where: { id: { in: ids } },
      select: { id: true, scaleMin: true, scaleMax: true },
    });
    const out: { competencyId: number; levelBefore: number; levelAfter: number }[] = [];
    for (const c of comps) {
      const current = await this.prisma.userCompetency.findUnique({
        where: { userId_competencyId: { userId: ctx.userId, competencyId: c.id } },
        select: { currentLevel: true },
      });
      const before = current?.currentLevel ?? 0;
      const projected = Math.round(c.scaleMin + (ctx.score / 100) * (c.scaleMax - c.scaleMin));
      const next = Math.min(projected, c.scaleMax, Math.max(before, c.scaleMin - 1) + 1);
      const raise = next > before;
      if (raise) {
        await this.competencies.upsertUserCompetency(
          {
            userId: ctx.userId,
            competencyId: c.id,
            currentLevel: next,
            source: CompetencySource.TRAINING,
            notes: `Avatar Training: ${ctx.assignment.session.program.title} — ${ctx.assignment.session.title} (nota ${ctx.score})`,
          },
          ctx.userId,
        );
        out.push({ competencyId: c.id, levelBefore: before, levelAfter: next });
      }
      await this.prisma.avatarTrainingCompetencyResult.upsert({
        where: { attemptId_competencyId: { attemptId: ctx.attemptId, competencyId: c.id } },
        create: {
          attemptId: ctx.attemptId,
          userId: ctx.userId,
          competencyId: c.id,
          score: ctx.score,
          levelBefore: before,
          levelAfter: raise ? next : before,
          applied: raise,
          evidence: `Tentativa ${ctx.attemptId} da sessão «${ctx.assignment.session.title}»`,
        },
        update: {},
      });
    }
    return out;
  }

  private async completePdiAction(user: CurrentUserData, ctx: FinishedAttemptContext) {
    const actionId = ctx.assignment.developmentPlanActionId;
    if (!actionId) return false;
    const action = await this.prisma.developmentPlanAction.findUnique({
      where: { id: actionId },
      select: { status: true },
    });
    if (!action || action.status === 'COMPLETED' || action.status === 'CANCELLED') return false;
    await this.plans.updateAction(actionId, { status: 'COMPLETED' } as never, user);
    return true;
  }

  private async completeOnboardingTask(user: CurrentUserData, ctx: FinishedAttemptContext) {
    const taskId = ctx.assignment.onboardingTaskInstanceId;
    if (!taskId) return false;
    const task = await this.prisma.onboardingTaskInstance.findUnique({
      where: { id: taskId },
      select: { status: true },
    });
    if (!task || task.status === 'COMPLETED' || task.status === 'SKIPPED') return false;
    const res = await this.onboarding.completeTask(
      {
        taskInstanceId: taskId,
        evidenceComment: `Avatar Training: ${ctx.assignment.session.program.title}`,
      } as never,
      user.id,
    );
    // Se a tarefa exige aprovação fica pendente — a aprovação continua humana.
    return res.completed;
  }

  // ── Ligação a PDI e onboarding ─────────────────────────────────────────────

  /** Liga uma acção de PDI a uma sessão publicada, atribuindo-a ao dono do plano. */
  async assignForPdiAction(user: CurrentUserData, actionId: number, sessionId: number) {
    const action = await this.prisma.developmentPlanAction.findUnique({
      where: { id: actionId },
      include: { plan: { select: { userId: true } } },
    });
    if (!action) throw new NotFoundException('Acção de PDI não encontrada');
    if (action.status === 'COMPLETED' || action.status === 'CANCELLED') {
      throw new ConflictException('A acção de PDI já está terminada');
    }
    return this.assignAndLink(user, action.plan.userId, sessionId, {
      origin: 'PDI',
      developmentPlanActionId: actionId,
      dueDate: action.dueDate,
    });
  }

  /** Liga uma tarefa de onboarding a uma sessão publicada, atribuindo-a ao novo colaborador. */
  async assignForOnboardingTask(user: CurrentUserData, taskInstanceId: number, sessionId: number) {
    const task = await this.prisma.onboardingTaskInstance.findUnique({
      where: { id: taskInstanceId },
      include: { plan: { select: { userId: true } } },
    });
    if (!task) throw new NotFoundException('Tarefa de onboarding não encontrada');
    if (task.status === 'COMPLETED' || task.status === 'SKIPPED') {
      throw new ConflictException('A tarefa de onboarding já está resolvida');
    }
    return this.assignAndLink(user, task.plan.userId, sessionId, {
      origin: 'ONBOARDING',
      onboardingTaskInstanceId: taskInstanceId,
      dueDate: task.dueDate,
    });
  }

  private async assignAndLink(
    user: CurrentUserData,
    targetUserId: number,
    sessionId: number,
    link: {
      origin: 'PDI' | 'ONBOARDING';
      developmentPlanActionId?: number;
      onboardingTaskInstanceId?: number;
      dueDate: Date | null;
    },
  ) {
    // assign() valida permissões sobre o utilizador, público-alvo e duplicados.
    const res = await this.programs.assign(user, sessionId, {
      userIds: [targetUserId],
      dueDate: link.dueDate?.toISOString(),
    });
    const assignment = await this.prisma.avatarTrainingAssignment.findUnique({
      where: { sessionId_userId: { sessionId, userId: targetUserId } },
    });
    if (!assignment || assignment.status === 'CANCELLED') {
      throw new ConflictException(res.skipped[0]?.reason ?? 'Não foi possível atribuir a sessão');
    }
    if (assignment.status === 'COMPLETED') {
      throw new ConflictException('O utilizador já concluiu esta sessão');
    }
    const updated = await this.prisma.avatarTrainingAssignment.update({
      where: { id: assignment.id },
      data: {
        origin: link.origin,
        developmentPlanActionId: link.developmentPlanActionId ?? assignment.developmentPlanActionId,
        onboardingTaskInstanceId:
          link.onboardingTaskInstanceId ?? assignment.onboardingTaskInstanceId,
      },
    });
    await this.audit.log({
      userId: user.id,
      action: 'LINK',
      entity: 'AvatarTrainingAssignment',
      entityId: updated.id,
      metadata: {
        origin: link.origin,
        developmentPlanActionId: link.developmentPlanActionId ?? null,
        onboardingTaskInstanceId: link.onboardingTaskInstanceId ?? null,
      },
    });
    return updated;
  }

  // ── Competências demonstradas ──────────────────────────────────────────────

  async attemptCompetencies(user: CurrentUserData, attemptId: number) {
    const attempt = await this.prisma.avatarTrainingAttempt.findUnique({
      where: { id: attemptId },
      select: { id: true, userId: true },
    });
    assertCanAccess(attempt, attempt?.userId ?? -1, user, [
      ...AVATAR_ADMIN_ROLES,
      ...AVATAR_PROGRESS_ROLES,
    ]);
    if (attempt.userId !== user.id) await this.assertCanSeeUser(user, attempt.userId);
    return this.resultsWhere({ attemptId });
  }

  async userCompetencies(user: CurrentUserData, userId?: number) {
    const target = userId ?? user.id;
    if (target !== user.id) await this.assertCanSeeUser(user, target);
    return this.resultsWhere({ userId: target });
  }

  private async resultsWhere(where: { attemptId?: number; userId?: number }) {
    const rows = await this.prisma.avatarTrainingCompetencyResult.findMany({
      where,
      orderBy: { assessedAt: 'desc' },
      take: 200,
    });
    const names = await this.prisma.competency.findMany({
      where: { id: { in: [...new Set(rows.map(r => r.competencyId))] } },
      select: { id: true, name: true },
    });
    const byId = new Map(names.map(n => [n.id, n.name]));
    return {
      data: rows.map(r => ({ ...r, competencyName: byId.get(r.competencyId) ?? null })),
      note: 'Resultados demonstrados em sessões com avatar; o nível oficial está em Competências e só sobe um degrau por sessão aprovada.',
    };
  }

  private async assertCanSeeUser(user: CurrentUserData, targetUserId: number) {
    if (isPrivileged(user, [...AVATAR_ADMIN_ROLES, Role.DIRECTOR, Role.AUDITOR])) return;
    const reports = await this.integrations.directReportIds(user.id);
    if (!reports.includes(targetUserId)) throw new NotFoundException('Recurso não encontrado');
  }

  // ── Recomendações ──────────────────────────────────────────────────────────

  /**
   * Sugestões de formações publicadas a partir de sinais dos módulos de origem:
   * lacunas de competência, avaliações de desempenho/360 publicadas, acções de
   * PDI em aberto, objectivos do plano de carreira, tarefas de onboarding,
   * percursos de aprendizagem e formações (Trainings) em que está inscrito.
   * Só lê e recomenda — não atribui nem altera notas.
   */
  async recommendations(user: CurrentUserData, userId?: number) {
    const target = userId ?? user.id;
    if (target !== user.id) await this.assertCanSeeUser(user, target);

    const [
      gaps,
      weak,
      actions,
      tasks,
      finished,
      reviewGaps,
      careerGoals,
      pathEnrolments,
      trainings,
    ] = await Promise.all([
      this.prisma.userCompetency.findMany({
        where: { userId: target, targetLevel: { not: null } },
        select: { competencyId: true, currentLevel: true, targetLevel: true },
      }),
      this.prisma.avatarTrainingCompetencyResult.findMany({
        where: { userId: target, score: { lt: WEAK_SCORE } },
        select: { competencyId: true },
      }),
      this.prisma.developmentPlanAction.findMany({
        where: {
          status: { in: [...OPEN_ACTION_STATES] },
          plan: { userId: target, status: { in: ['ACTIVE', 'AT_RISK', 'OVERDUE'] } },
        },
        select: { id: true, title: true, courseId: true, competencyIds: true },
      }),
      this.prisma.onboardingTaskInstance.findMany({
        where: {
          status: { in: ['PENDING', 'IN_PROGRESS', 'BLOCKED'] },
          plan: { userId: target, status: { in: ['NOT_STARTED', 'IN_PROGRESS'] } },
        },
        select: { id: true, templateTask: { select: { title: true, courseId: true } } },
      }),
      this.prisma.avatarTrainingAttempt.findMany({
        where: { userId: target, status: { in: ['COMPLETED', 'FAILED'] }, score: { not: null } },
        orderBy: { completedAt: 'desc' },
        take: 10,
        select: { score: true },
      }),
      // Avaliação de desempenho/360: só avaliações já publicadas ao colaborador.
      this.prisma.competencyEvaluation.findMany({
        where: {
          evaluatedLevel: { lte: PERFORMANCE_WEAK_LEVEL },
          review: { userId: target, status: { in: ['PUBLISHED', 'FINALIZED'] } },
        },
        orderBy: { id: 'desc' },
        take: 50,
        select: { competencyId: true },
      }),
      // Plano de carreira activo: objectivos em aberto ligados a um curso.
      this.prisma.careerGoal.findMany({
        where: {
          courseId: { not: null },
          status: { in: ['PENDING', 'IN_PROGRESS'] },
          careerPlan: { userId: target, status: 'ACTIVE' },
        },
        select: { id: true, title: true, courseId: true },
      }),
      this.prisma.learningPathEnrollment.findMany({
        where: { userId: target, status: { in: ['NOT_STARTED', 'IN_PROGRESS'] } },
        select: {
          learningPath: {
            select: { id: true, title: true, courses: { select: { courseId: true } } },
          },
        },
      }),
      this.prisma.trainingParticipant.findMany({
        where: { userId: target, status: { in: ['REGISTERED', 'PENDING_APPROVAL'] } },
        select: { training: { select: { id: true, title: true, courseId: true } } },
      }),
    ]);

    const levelIndex = learnerLevelIndex(finished.map(a => a.score as number));

    const gapIds = new Set<number>([
      ...gaps.filter(g => g.currentLevel < (g.targetLevel ?? 0)).map(g => g.competencyId),
      ...weak.map(w => w.competencyId),
      ...reviewGaps.map(r => r.competencyId),
    ]);
    const reviewGapIds = new Set(reviewGaps.map(r => r.competencyId));
    const pathCourses = pathEnrolments.flatMap(e =>
      e.learningPath.courses.map(c => ({ courseId: c.courseId, title: e.learningPath.title })),
    );
    const trainingCourses = trainings.flatMap(t =>
      t.training?.courseId ? [{ courseId: t.training.courseId, title: t.training.title }] : [],
    );
    const actionCompIds = new Set(actions.flatMap(a => a.competencyIds));
    const courseIds = [
      ...actions.map(a => a.courseId),
      ...tasks.map(t => t.templateTask.courseId),
      ...careerGoals.map(g => g.courseId),
      ...pathCourses.map(c => c.courseId),
      ...trainingCourses.map(c => c.courseId),
    ].filter((c): c is number => c !== null);
    const competencyFilter = [...gapIds, ...actionCompIds];

    const candidates =
      competencyFilter.length || courseIds.length
        ? await this.prisma.avatarTrainingProgram.findMany({
            where: {
              status: 'PUBLISHED',
              OR: [
                ...(competencyFilter.length
                  ? [{ competencyIds: { hasSome: competencyFilter } }]
                  : []),
                ...(courseIds.length ? [{ courseId: { in: courseIds } }] : []),
              ],
            },
            select: {
              id: true,
              title: true,
              courseId: true,
              competencyIds: true,
              difficulty: true,
              targetDepartmentIds: true,
              targetRoleNames: true,
              sessions: {
                where: { status: 'PUBLISHED' },
                orderBy: { position: 'asc' },
                select: {
                  id: true,
                  title: true,
                  assignments: { where: { userId: target }, select: { status: true } },
                },
              },
            },
            take: 100,
          })
        : [];

    const result: {
      programId: number;
      title: string;
      sessions: { id: number; title: string }[];
      difficulty: string;
      levelFit: LevelFit;
      reasons: { type: string; detail: string }[];
    }[] = [];
    for (const p of candidates) {
      // Só sessões ainda não concluídas e dentro do público-alvo.
      const open = p.sessions.filter(s => !s.assignments.some(a => a.status === 'COMPLETED'));
      if (!open.length || !(await this.integrations.userMatchesAudience(target, p))) continue;
      const reasons: { type: string; detail: string }[] = [];
      for (const id of p.competencyIds.filter(c => gapIds.has(c))) {
        reasons.push({
          type: 'COMPETENCY_GAP',
          detail: `Competência ${id} abaixo do nível-alvo ou com resultado fraco`,
        });
      }
      for (const id of p.competencyIds.filter(c => reviewGapIds.has(c))) {
        reasons.push({
          type: 'PERFORMANCE_REVIEW',
          detail: `Competência ${id} com nível baixo na avaliação de desempenho/360`,
        });
      }
      for (const g of careerGoals) {
        if (g.courseId && g.courseId === p.courseId) {
          reasons.push({
            type: 'CAREER_GOAL',
            detail: `Objectivo de carreira «${g.title}» (id ${g.id})`,
          });
        }
      }
      for (const c of pathCourses) {
        if (c.courseId === p.courseId) {
          reasons.push({ type: 'LEARNING_PATH', detail: `Percurso de aprendizagem «${c.title}»` });
        }
      }
      for (const c of trainingCourses) {
        if (c.courseId === p.courseId) {
          reasons.push({ type: 'TRAINING', detail: `Formação inscrita «${c.title}»` });
        }
      }
      for (const a of actions) {
        if (
          (a.courseId && a.courseId === p.courseId) ||
          a.competencyIds.some(c => p.competencyIds.includes(c))
        ) {
          reasons.push({ type: 'PDI_ACTION', detail: `Acção de PDI «${a.title}» (id ${a.id})` });
        }
      }
      for (const t of tasks) {
        if (t.templateTask.courseId && t.templateTask.courseId === p.courseId) {
          reasons.push({
            type: 'ONBOARDING_TASK',
            detail: `Tarefa de onboarding «${t.templateTask.title}» (id ${t.id})`,
          });
        }
      }
      if (!reasons.length) continue;
      result.push({
        programId: p.id,
        title: p.title,
        sessions: open.map(s => ({ id: s.id, title: s.title })),
        difficulty: p.difficulty,
        levelFit: levelFit(p.difficulty, levelIndex),
        reasons,
      });
    }
    // Primeiro o que se adequa ao nível do formando; dentro de cada grupo, mais motivos primeiro.
    result.sort(
      (a, b) =>
        levelFitRank(a.levelFit) - levelFitRank(b.levelFit) || b.reasons.length - a.reasons.length,
    );
    return {
      userId: target,
      learnerLevel: DIFFICULTY_ORDER[levelIndex],
      data: result.slice(0, 20),
      note: 'Recomendações automáticas: sugerem formação de reforço, não alteram notas formais nem atribuem sessões.',
    };
  }
}
