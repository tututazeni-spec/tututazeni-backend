// src/talent-development/talent-development.service.ts
import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma, ReviewStatus } from '@prisma/client';
import {
  PlanFilterDto,
  TalentDevelopmentCreateDevelopmentPlanDto,
  TalentDevelopmentUpdateDevelopmentPlanDto,
  TalentDevelopmentCreateGoalDto,
  TalentDevelopmentUpdateGoalDto,
  CreateActionDto,
  UpdateActionDto,
  TalentDevelopmentUpdateProgressDto,
  ApproveActionDto,
  TalentFilterDto,
  SkillGapFilterDto,
  TalentDevelopmentCreateMentoringDto,
  CreateMentoringSessionDto,
  MentoringFilterDto,
  CareerSimulationDto,
  CreateFromTemplateDto,
  TalentDevelopmentDashboardFilterDto,
  PlanStatus,
  ActionStatus,
  TalentTier,
} from './talent-development.dto';
import { assertCanAccess } from '../common/authz/ownership';
import { Role } from '../auth/enums/role.enum';
import type { CurrentUserData } from '../common/types/current-user';
import { createNotificationSafe } from '../common/helpers/notification.helper';

// ─────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────

const PRIORITY_ORDER: Record<string, number> = { HIGH: 0, MEDIUM: 1, LOW: 2 };

interface PlanStatsAction {
  status: string;
  dueDate: Date | null;
  progress: number | null;
}
interface PlanStatsGoal {
  progress: number | null;
}

function getPlanStats(actions: PlanStatsAction[], goals: PlanStatsGoal[]) {
  const total = actions.length;
  const completed = actions.filter(a => a.status === 'COMPLETED').length;
  const inProgress = actions.filter(a => a.status === 'IN_PROGRESS').length;
  const overdue = actions.filter(
    a => a.dueDate && new Date(a.dueDate) < new Date() && a.status !== 'COMPLETED',
  ).length;
  const overall =
    total > 0 ? Math.round(actions.reduce((s, a) => s + (a.progress ?? 0), 0) / total) : 0;
  const goalProg =
    goals.length > 0
      ? Math.round(goals.reduce((s, g) => s + (g.progress ?? 0), 0) / goals.length)
      : 0;

  return { total, completed, inProgress, overdue, overall, goalProgress: goalProg };
}

function computeTalentScore(
  avgCompetency: number,
  perfScore: number,
  potScore: number,
  points: number,
  hasActivePlan: boolean,
): number {
  const eng = Math.min(points / 1000, 5);
  return +(
    avgCompetency * 0.3 +
    perfScore * 0.35 +
    potScore * 0.2 +
    eng * 0.1 +
    (hasActivePlan ? 0.25 : 0)
  ).toFixed(2);
}

function getTier(score: number): TalentTier {
  if (score >= 4.0) return TalentTier.HIGH;
  if (score >= 2.5) return TalentTier.MEDIUM;
  return TalentTier.DEVELOPING;
}

// ─────────────────────────────────────────────────────────────────
// SERVICE
// ─────────────────────────────────────────────────────────────────

@Injectable()
export class TalentDevelopmentService {
  private readonly logger = new Logger(TalentDevelopmentService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ══════════════════════════════════════════════════════
  // TALENT POOL & SCORING
  // ══════════════════════════════════════════════════════

  async getTalentPool(filters: TalentFilterDto = {}) {
    const { page = 1, limit = 50, departmentId, positionId, tier } = filters;

    const where: Prisma.UserWhereInput = { active: true };
    if (departmentId) where.departmentId = departmentId;
    if (positionId) where.positionId = positionId;

    const users = await this.prisma.read.user.findMany({
      where,
      include: {
        userCompetencies: { select: { currentLevel: true, targetLevel: true, competencyId: true } },
        points: { select: { points: true } },
        position: { select: { id: true, name: true, level: true } },
        department: { select: { id: true, name: true } },
        // PerformanceReview relation on User is "performanceReviews" (ReviewedUser)
        performanceReviews: {
          where: {
            type: 'MANAGER',
            status: { in: [ReviewStatus.PUBLISHED, ReviewStatus.CALIBRATION] },
          },
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: { score: true, potentialScore: true },
        },
        developmentPlans: {
          where: { status: 'ACTIVE', isTemplate: false },
          select: { id: true, overallProgress: true, name: true },
          take: 1,
        },
        nineBoxPlacements: {
          orderBy: { updatedAt: 'desc' },
          take: 1,
          select: { performanceAxis: true, potentialAxis: true },
        },
      },
    });

    let results = users.map(u => {
      const avgComp = u.userCompetencies.length
        ? u.userCompetencies.reduce((s, c) => s + c.currentLevel, 0) / u.userCompetencies.length
        : 0;

      const lastReview = u.performanceReviews[0];
      const perfScore = lastReview?.score ?? 0;
      const potScore = lastReview?.potentialScore ?? 0;
      const pts = u.points?.points ?? 0;
      const hasActivePlan = u.developmentPlans.length > 0;
      const nineBox = u.nineBoxPlacements[0] ?? null;

      const talentScore = computeTalentScore(avgComp, perfScore, potScore, pts, hasActivePlan);

      return {
        user: {
          id: u.id,
          fullName: u.fullName,
          email: u.email,
          avatarUrl: u.avatarUrl,
          position: u.position,
          department: u.department,
        },
        scores: {
          talent: talentScore,
          competency: +avgComp.toFixed(2),
          performance: +perfScore.toFixed(2),
          potential: potScore ?? 0,
          engagement: pts,
        },
        nineBox,
        activePlan: u.developmentPlans[0] ?? null,
        tier: getTier(talentScore),
      };
    });

    if (tier) results = results.filter(r => r.tier === tier);
    results.sort((a, b) => b.scores.talent - a.scores.talent);

    const tierCounts = {
      high: results.filter(r => r.tier === TalentTier.HIGH).length,
      medium: results.filter(r => r.tier === TalentTier.MEDIUM).length,
      developing: results.filter(r => r.tier === TalentTier.DEVELOPING).length,
    };

    const skip = (page - 1) * limit;
    return {
      data: results.slice(skip, skip + limit),
      meta: {
        total: results.length,
        page,
        limit,
        totalPages: Math.ceil(results.length / limit),
        tierCounts,
      },
    };
  }

  async getHighPotentials(limit = 20, departmentId?: number) {
    const pool = await this.getTalentPool({
      limit: 5000,
      page: 1,
      departmentId,
      tier: TalentTier.HIGH,
    });
    return { data: pool.data.slice(0, limit), total: pool.meta.tierCounts.high };
  }

  async getTalentMatrix() {
    const pool = await this.getTalentPool({ limit: 5000, page: 1 });

    // Map each user to one of 9 boxes (perf Y: 1-3, potential/comp X: 1-3)
    const BOX_LABELS: Record<string, string> = {
      '3_3': 'Estrelas — Alto Potencial + Alta Performance',
      '3_2': 'Alto Desempenho — Alta Performance, Potencial Médio',
      '3_1': 'Dilema — Alta Performance, Baixo Potencial',
      '2_3': 'Alto Potencial — Potencial Alto, Performance Média',
      '2_2': 'Coração da Equipa — Médio-Médio',
      '2_1': 'Inconsistentes — Médio Performance, Baixo Potencial',
      '1_3': 'Talento Bruto — Alto Potencial, Baixa Performance',
      '1_2': 'Necessita de Orientação — Médio Potencial, Baixa Performance',
      '1_1': 'Requer Medidas Imediatas — Baixo-Baixo',
    };

    const boxes: Record<string, (typeof pool.data)[number][]> = {};
    for (const u of pool.data) {
      const py = u.scores.performance >= 4 ? 3 : u.scores.performance >= 2.5 ? 2 : 1;
      const px = u.scores.competency >= 4 ? 3 : u.scores.competency >= 2.5 ? 2 : 1;
      const key = `${py}_${px}`;
      if (!boxes[key]) boxes[key] = [];
      boxes[key].push(u);
    }

    const matrix = Object.entries(BOX_LABELS).map(([key, label]) => ({
      box: key,
      label,
      count: (boxes[key] ?? []).length,
      users: (boxes[key] ?? []).slice(0, 8),
    }));

    return { matrix, tierCounts: pool.meta.tierCounts, total: pool.meta.total };
  }

  // ══════════════════════════════════════════════════════
  // SUCCESSION
  // ══════════════════════════════════════════════════════

  async getSuccessionCandidates(positionId: number) {
    const plans = await this.prisma.read.successionPlan.findMany({
      where: { positionId },
      include: {
        candidate: {
          select: {
            id: true,
            fullName: true,
            avatarUrl: true,
            position: { select: { id: true, name: true } },
            department: { select: { id: true, name: true } },
            userCompetencies: { select: { currentLevel: true } },
            nineBoxPlacements: {
              orderBy: { updatedAt: 'desc' },
              take: 1,
              select: { performanceAxis: true, potentialAxis: true },
            },
          },
        },
        position: { select: { id: true, name: true, level: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return plans.map(p => ({
      id: p.id,
      position: p.position,
      readiness: p.readinessLevel,
      createdAt: p.createdAt,
      candidate: {
        ...p.candidate,
        avgCompetency: p.candidate.userCompetencies.length
          ? +(
              p.candidate.userCompetencies.reduce((s, c) => s + c.currentLevel, 0) /
              p.candidate.userCompetencies.length
            ).toFixed(2)
          : 0,
        nineBox: p.candidate.nineBoxPlacements[0] ?? null,
      },
    }));
  }

  async getSuccessionDashboard() {
    const [positions, plans] = await Promise.all([
      this.prisma.read.position.findMany({
        select: {
          id: true,
          name: true,
          level: true,
          _count: { select: { users: true, successionPlans: true } },
        },
      }),
      this.prisma.read.successionPlan.findMany({
        include: { candidate: { select: { id: true, fullName: true } } },
      }),
    ]);

    const plansByPosition: Record<number, typeof plans> = {};
    for (const p of plans) {
      if (!plansByPosition[p.positionId]) plansByPosition[p.positionId] = [];
      plansByPosition[p.positionId].push(p);
    }

    const data = positions.map(pos => {
      const posPlans = plansByPosition[pos.id] ?? [];
      return {
        position: { id: pos.id, name: pos.name, level: pos.level },
        incumbents: pos._count.users,
        successors: posPlans.length,
        coverage: posPlans.length > 0 ? 'COVERED' : 'AT_RISK',
        candidates: posPlans.map(p => ({ id: p.candidateId, fullName: p.candidate.fullName })),
      };
    });

    const covered = data.filter(d => d.coverage === 'COVERED').length;
    return {
      data,
      summary: {
        totalPositions: positions.length,
        covered,
        atRisk: positions.length - covered,
        coverageRate: positions.length > 0 ? +((covered / positions.length) * 100).toFixed(1) : 0,
      },
    };
  }

  // ══════════════════════════════════════════════════════
  // DEVELOPMENT PLANS — CRUD
  // ══════════════════════════════════════════════════════

  async createPlan(dto: TalentDevelopmentCreateDevelopmentPlanDto, createdById: number) {
    const user = await this.prisma.read.user.findUnique({ where: { id: dto.userId } });
    if (!user) throw new NotFoundException('Colaborador não encontrado');

    const plan = await this.prisma.developmentPlan.create({
      data: {
        name: dto.name,
        goal: dto.goal,
        userId: dto.userId,
        managerId: dto.managerId,
        priority: dto.priority ?? 'MEDIUM',
        status: 'DRAFT',
        startDate: dto.startDate ? new Date(dto.startDate) : null,
        endDate: dto.endDate ? new Date(dto.endDate) : null,
        period: dto.period,
        notes: dto.notes,
        isTemplate: dto.isTemplate ?? false,
        performanceCycleId: dto.performanceCycleId,
        overallProgress: 0,
      },
      include: {
        user: { select: { id: true, fullName: true, avatarUrl: true } },
        manager: { select: { id: true, fullName: true } },
      },
    });

    if (!dto.isTemplate) {
      await this.prisma.notificationLog
        .create({
          data: {
            userId: dto.userId,
            type: 'DEVELOPMENT_PLAN_CREATED',
            message: `Um novo plano de desenvolvimento "${dto.name}" foi criado para si`,
            metadata: JSON.stringify({}),
          },
        })
        .catch(e => {
          this.logger.warn({
            userId: dto.userId,
            action: 'DEVELOPMENT_PLAN_CREATED',
            planId: plan.id,
            err: { message: e instanceof Error ? e.message : String(e) },
            msg: 'Falha ao criar notificação de plano de desenvolvimento criado',
          });
        });
    }

    return plan;
  }

  async getPlans(filters: PlanFilterDto) {
    const { page = 1, limit = 20, userId, managerId, status, isTemplate } = filters;
    const skip = (page - 1) * limit;
    const where: Prisma.DevelopmentPlanWhereInput = {};
    if (userId !== undefined) where.userId = userId;
    if (managerId !== undefined) where.managerId = managerId;
    if (status) where.status = status;
    if (isTemplate !== undefined) where.isTemplate = isTemplate;

    const [data, total] = await Promise.all([
      this.prisma.read.developmentPlan.findMany({
        where,
        skip,
        take: limit,
        include: {
          user: {
            select: {
              id: true,
              fullName: true,
              avatarUrl: true,
              department: { select: { name: true } },
            },
          },
          manager: { select: { id: true, fullName: true } },
          actions: {
            select: { id: true, status: true, mandatory: true, progress: true, dueDate: true },
          },
          goals: { select: { id: true, progress: true, weight: true } },
          _count: { select: { actions: true, goals: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.read.developmentPlan.count({ where }),
    ]);

    const enriched = data.map(p => ({ ...p, stats: getPlanStats(p.actions, p.goals) }));
    return { data: enriched, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  async getPlan(id: number, user?: CurrentUserData) {
    const plan = await this.prisma.read.developmentPlan.findUnique({
      where: { id },
      include: {
        user: { select: { id: true, fullName: true, avatarUrl: true, email: true } },
        manager: { select: { id: true, fullName: true } },
        actions: {
          include: { evidence: { orderBy: { createdAt: 'desc' } } },
          orderBy: [{ seq: 'asc' }, { createdAt: 'asc' }],
        },
        goals: { orderBy: { createdAt: 'asc' } },
        checkpoints: { orderBy: { scheduledAt: 'asc' } },
        approvals: {
          orderBy: { createdAt: 'desc' },
          include: { approver: { select: { id: true, fullName: true } } },
        },
      },
    });

    // Ownership (A3): dono do PDI OU ADMIN/RH/LIDER; senão 404.
    // Quando chamado sem user (contexto interno de confiança), não filtra.
    if (user) assertCanAccess(plan, plan?.userId, user, [Role.ADMIN, Role.RH, Role.LIDER]);
    else if (!plan) throw new NotFoundException('Plano não encontrado');

    return { ...plan, stats: getPlanStats(plan.actions, plan.goals) };
  }

  async updatePlan(id: number, dto: TalentDevelopmentUpdateDevelopmentPlanDto) {
    await this.getPlan(id);
    const data: Prisma.DevelopmentPlanUpdateInput = {
      ...dto,
      startDate: undefined,
      endDate: undefined,
    };
    if (dto.startDate) data.startDate = new Date(dto.startDate);
    if (dto.endDate) data.endDate = new Date(dto.endDate);
    return this.prisma.developmentPlan.update({ where: { id }, data });
  }

  async activatePlan(id: number, activatedById: number) {
    const plan = await this.getPlan(id);
    if (plan.status === PlanStatus.ACTIVE) throw new BadRequestException('Plano já está activo');
    if (!plan.actions || plan.actions.length === 0)
      throw new BadRequestException('Adicione pelo menos uma acção antes de activar');

    const updated = await this.prisma.developmentPlan.update({
      where: { id },
      data: { status: 'ACTIVE', activatedAt: new Date() },
    });

    await this.prisma.notificationLog
      .create({
        data: {
          userId: plan.user.id,
          type: 'DEVELOPMENT_PLAN_ACTIVATED',
          message: `O teu plano de desenvolvimento "${plan.name}" foi activado`,
          metadata: JSON.stringify({}),
        },
      })
      .catch(e => {
        this.logger.warn({
          userId: plan.user.id,
          action: 'DEVELOPMENT_PLAN_ACTIVATED',
          planId: id,
          err: { message: e instanceof Error ? e.message : String(e) },
          msg: 'Falha ao criar notificação de plano de desenvolvimento activado',
        });
      });

    return updated;
  }

  async pausePlan(id: number, reason?: string) {
    const plan = await this.getPlan(id);
    if (plan.status !== PlanStatus.ACTIVE)
      throw new BadRequestException('Apenas planos activos podem ser pausados');

    return this.prisma.developmentPlan.update({
      where: { id },
      data: {
        status: 'PAUSED',
        notes: reason
          ? `${plan.notes ? plan.notes + '\n' : ''}[PAUSA ${new Date().toLocaleDateString('pt')}] ${reason}`
          : plan.notes,
      },
    });
  }

  async completePlan(id: number) {
    const plan = await this.getPlan(id);

    const totalXp = plan.actions.reduce((s, a) => s + (a.xpReward ?? 0), 0);

    await this.prisma.developmentPlan.update({
      where: { id },
      data: { status: 'COMPLETED', completedAt: new Date(), overallProgress: 100 },
    });

    if (totalXp > 0) {
      await this.prisma.userPoints.upsert({
        where: { userId: plan.user.id },
        create: { userId: plan.user.id, points: totalXp },
        update: { points: { increment: totalXp } },
      });
    }

    await this.prisma.notificationLog
      .create({
        data: {
          userId: plan.user.id,
          type: 'DEVELOPMENT_PLAN_COMPLETED',
          message: `🎉 Parabéns! Concluíste o plano "${plan.name}"`,
          metadata: JSON.stringify({}),
        },
      })
      .catch(e => {
        this.logger.warn({
          userId: plan.user.id,
          action: 'DEVELOPMENT_PLAN_COMPLETED',
          planId: id,
          err: { message: e instanceof Error ? e.message : String(e) },
          msg: 'Falha ao criar notificação de plano de desenvolvimento concluído',
        });
      });

    return { message: 'Plano concluído', xpEarned: totalXp };
  }

  async cancelPlan(id: number, reason: string) {
    await this.getPlan(id);
    return this.prisma.developmentPlan.update({
      where: { id },
      data: { status: 'CANCELLED', cancelReason: reason },
    });
  }

  // ─── Templates ───────────────────────────────────────

  async getTemplates() {
    return this.prisma.read.developmentPlan.findMany({
      where: { isTemplate: true },
      include: {
        actions: { orderBy: { seq: 'asc' } },
        goals: true,
        _count: { select: { actions: true, goals: true } },
      },
      orderBy: { name: 'asc' },
    });
  }

  async createFromTemplate(templateId: number, dto: CreateFromTemplateDto, createdById: number) {
    const template = await this.getPlan(templateId);
    if (!template.isTemplate) throw new BadRequestException('O plano indicado não é um template');

    const plan = await this.createPlan(
      {
        name: template.name,
        goal: template.goal,
        userId: dto.userId,
        managerId: dto.managerId,
        priority: template.priority,
        notes: template.notes ?? undefined,
        isTemplate: false,
      },
      createdById,
    );

    // Clone actions
    if (template.actions.length > 0) {
      await this.prisma.developmentPlanAction.createMany({
        data: template.actions.map(a => ({
          planId: plan.id,
          title: a.title,
          description: a.description,
          type: a.type,
          status: 'TODO',
          workloadHours: a.workloadHours,
          resources: a.resources ?? [],
          xpReward: a.xpReward ?? 20,
          seq: a.seq ?? 0,
          mandatory: a.mandatory ?? false,
          progress: 0,
          dueDate: a.dueDate ? new Date(a.dueDate) : null,
        })),
      });
    }

    // Clone goals
    if (template.goals.length > 0) {
      await this.prisma.pdiGoal.createMany({
        data: template.goals.map(g => ({
          planId: plan.id,
          title: g.title,
          description: g.description,
          successIndicator: g.successIndicator,
          weight: g.weight ?? 100,
          notes: g.notes,
          progress: 0,
          dueDate: g.dueDate ? new Date(g.dueDate) : null,
        })),
      });
    }

    return this.getPlan(plan.id);
  }

  // ══════════════════════════════════════════════════════
  // GOALS
  // ══════════════════════════════════════════════════════

  async addGoal(planId: number, dto: TalentDevelopmentCreateGoalDto) {
    const plan = await this.prisma.read.developmentPlan.findUnique({ where: { id: planId } });
    if (!plan) throw new NotFoundException('Plano não encontrado');

    return this.prisma.pdiGoal.create({
      data: {
        planId,
        title: dto.title,
        description: dto.description,
        successIndicator: dto.successIndicator,
        weight: dto.weight ?? 100,
        notes: dto.notes,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
        progress: 0,
      },
    });
  }

  async updateGoal(goalId: number, dto: TalentDevelopmentUpdateGoalDto, user: CurrentUserData) {
    const goal = await this.prisma.read.pdiGoal.findUnique({
      where: { id: goalId },
      include: { plan: { select: { userId: true } } },
    });
    if (!goal) throw new NotFoundException('Meta não encontrada');
    // A10-6: sem isto, qualquer autenticado podia alterar a meta de PDI de
    // outra pessoa via PATCH /talent/goals/:id.
    assertCanAccess(goal, goal.plan.userId, user, [Role.ADMIN, Role.RH, Role.LIDER]);

    const data: Prisma.PdiGoalUpdateInput = { ...dto, dueDate: undefined };
    if (dto.dueDate) data.dueDate = new Date(dto.dueDate);
    if (dto.progress === 100 && !goal.completedAt) data.completedAt = new Date();

    const updated = await this.prisma.pdiGoal.update({ where: { id: goalId }, data });
    await this.recalculatePlanProgress(goal.planId);
    return updated;
  }

  async deleteGoal(goalId: number) {
    const goal = await this.prisma.read.pdiGoal.findUnique({ where: { id: goalId } });
    if (!goal) throw new NotFoundException('Meta não encontrada');
    await this.prisma.pdiGoal.delete({ where: { id: goalId } });
    return { message: 'Meta removida' };
  }

  // ══════════════════════════════════════════════════════
  // ACTIONS
  // ══════════════════════════════════════════════════════

  async addAction(planId: number, dto: CreateActionDto) {
    const plan = await this.prisma.read.developmentPlan.findUnique({ where: { id: planId } });
    if (!plan) throw new NotFoundException('Plano não encontrado');

    const action = await this.prisma.developmentPlanAction.create({
      data: {
        planId,
        title: dto.title,
        description: dto.description,
        type: dto.type,
        status: 'TODO',
        courseId: dto.courseId,
        workloadHours: dto.workloadHours,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
        mandatory: dto.mandatory ?? false,
        seq: dto.seq ?? 0,
        resources: dto.resources ?? [],
        xpReward: dto.xpReward ?? 20,
        progress: 0,
      },
    });

    await this.recalculatePlanProgress(planId);

    await this.prisma.notificationLog
      .create({
        data: {
          userId: plan.userId,
          type: 'DEVELOPMENT_ACTION_ASSIGNED',
          message: `Nova acção de desenvolvimento: "${dto.title}"`,
          metadata: JSON.stringify({}),
        },
      })
      .catch(e => {
        this.logger.warn({
          userId: plan.userId,
          action: 'DEVELOPMENT_ACTION_ASSIGNED',
          planId,
          err: { message: e instanceof Error ? e.message : String(e) },
          msg: 'Falha ao criar notificação de acção de desenvolvimento atribuída',
        });
      });

    return action;
  }

  async updateAction(actionId: number, dto: UpdateActionDto) {
    const action = await this.prisma.read.developmentPlanAction.findUnique({
      where: { id: actionId },
    });
    if (!action) throw new NotFoundException('Acção não encontrada');

    const data: Prisma.DevelopmentPlanActionUpdateInput = { ...dto, dueDate: undefined };
    if (dto.dueDate) data.dueDate = new Date(dto.dueDate);
    if (dto.status === ActionStatus.COMPLETED && !action.completedAt) {
      data.completedAt = new Date();
      data.progress = 100;
    }

    const updated = await this.prisma.developmentPlanAction.update({
      where: { id: actionId },
      data,
    });
    await this.recalculatePlanProgress(action.planId);
    return updated;
  }

  async updateActionProgress(
    actionId: number,
    dto: TalentDevelopmentUpdateProgressDto,
    user: CurrentUserData,
  ) {
    const action = await this.prisma.read.developmentPlanAction.findUnique({
      where: { id: actionId },
      include: { plan: { select: { userId: true, name: true } } },
    });
    if (!action) throw new NotFoundException('Acção não encontrada');
    // A10-6: a rota diz "colaborador actualiza o seu próprio progresso" mas
    // nunca comparava o dono do plano com quem chamava — qualquer autenticado
    // podia adulterar o progresso de PDI de outra pessoa.
    assertCanAccess(action, action.plan.userId, user, [Role.ADMIN, Role.RH, Role.LIDER]);
    const userId = user.id;

    const newStatus =
      dto.progress === 100 ? 'COMPLETED' : dto.progress > 0 ? 'IN_PROGRESS' : action.status;

    await this.prisma.developmentPlanAction.update({
      where: { id: actionId },
      data: {
        progress: dto.progress,
        status: newStatus,
        completedAt: dto.progress === 100 ? new Date() : undefined,
      },
    });

    // Store evidence/note if provided
    if (dto.evidenceUrl || dto.notes) {
      // PdiEvidence.developmentPlanActionId é o FK real (não `actionId`) —
      // sem catch() nesta chamada, submeter progresso COM evidência/notas
      // (o caso de uso principal deste endpoint) rebentava sempre (500).
      await this.prisma.pdiEvidence.create({
        data: {
          developmentPlanActionId: actionId,
          submittedById: userId,
          title: dto.evidenceTitle ?? dto.notes ?? 'Actualização de progresso',
          url: dto.evidenceUrl,
          notes: dto.notes,
          evidenceType: dto.evidenceUrl ? 'LINK' : 'NOTE',
        },
      });
    }

    // Award XP on first completion
    if (dto.progress === 100 && action.status !== 'COMPLETED') {
      await this.prisma.userPoints.upsert({
        where: { userId: action.plan.userId },
        create: { userId: action.plan.userId, points: action.xpReward },
        update: { points: { increment: action.xpReward } },
      });

      await this.prisma.notificationLog
        .create({
          data: {
            userId: action.plan.userId,
            type: 'DEVELOPMENT_ACTION_COMPLETED',
            message: `✅ Acção "${action.title}" concluída! +${action.xpReward} XP`,
            metadata: JSON.stringify({}),
          },
        })
        .catch(e => {
          this.logger.warn({
            userId: action.plan.userId,
            action: 'DEVELOPMENT_ACTION_COMPLETED',
            actionId,
            err: { message: e instanceof Error ? e.message : String(e) },
            msg: 'Falha ao criar notificação de acção de desenvolvimento concluída',
          });
        });
    }

    await this.recalculatePlanProgress(action.planId);
    return { message: 'Progresso actualizado', progress: dto.progress, status: newStatus };
  }

  async approveActionEvidence(actionId: number, dto: ApproveActionDto, approverId: number) {
    const action = await this.prisma.read.developmentPlanAction.findUnique({
      where: { id: actionId },
      include: { plan: { select: { userId: true } } },
    });
    if (!action) throw new NotFoundException('Acção não encontrada');

    const newStatus = dto.approved ? 'COMPLETED' : 'IN_PROGRESS';
    await this.prisma.developmentPlanAction.update({
      where: { id: actionId },
      data: { status: newStatus, completedAt: dto.approved ? new Date() : null },
    });

    await this.prisma.notificationLog
      .create({
        data: {
          userId: action.plan.userId,
          type: dto.approved ? 'ACTION_EVIDENCE_APPROVED' : 'ACTION_EVIDENCE_REJECTED',
          message: dto.approved
            ? `✅ Evidência da acção "${action.title}" aprovada`
            : `❌ Evidência rejeitada${dto.notes ? ': ' + dto.notes : ''}`,
          metadata: JSON.stringify({}),
        },
      })
      .catch(e => {
        this.logger.warn({
          userId: action.plan.userId,
          action: dto.approved ? 'ACTION_EVIDENCE_APPROVED' : 'ACTION_EVIDENCE_REJECTED',
          actionId,
          err: { message: e instanceof Error ? e.message : String(e) },
          msg: 'Falha ao criar notificação de aprovação/rejeição de evidência',
        });
      });

    if (dto.approved) await this.recalculatePlanProgress(action.planId);
    return { message: dto.approved ? 'Aprovado' : 'Rejeitado', status: newStatus };
  }

  async deleteAction(actionId: number) {
    const action = await this.prisma.read.developmentPlanAction.findUnique({
      where: { id: actionId },
    });
    if (!action) throw new NotFoundException('Acção não encontrada');
    await this.prisma.developmentPlanAction.delete({ where: { id: actionId } });
    await this.recalculatePlanProgress(action.planId);
    return { message: 'Acção removida' };
  }

  // ══════════════════════════════════════════════════════
  // SKILL GAPS
  // ══════════════════════════════════════════════════════

  async getUserSkillGaps(userId: number) {
    const user = await this.prisma.read.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        fullName: true,
        roleId: true,
        role: { select: { id: true, name: true } },
      },
    });
    if (!user) throw new NotFoundException('Utilizador não encontrado');

    // User skills — using legacyEmployeeSkill (userId-based)
    const userSkills = await this.prisma.read.legacyEmployeeSkill.findMany({
      where: { userId },
      include: {
        skill: { include: { category: true, proficiencyLevels: { orderBy: { level: 'asc' } } } },
      },
    });
    const skillMap = new Map(userSkills.map(s => [s.skillId, s]));

    // Role skill requirements via RoleSkillMatrix
    type RoleRequirement = Prisma.RoleSkillRequirementGetPayload<{
      include: { skill: { include: { category: true } } };
    }>;
    let requirements: RoleRequirement[] = [];
    if (user.role) {
      const matrix = await this.prisma.read.roleSkillMatrix.findFirst({
        where: { roleCode: { contains: user.role.name, mode: 'insensitive' } },
        include: {
          requirements: {
            include: { skill: { include: { category: true } } },
            orderBy: [{ mandatory: 'desc' }, { weight: 'desc' }],
          },
        },
      });
      if (matrix) requirements = matrix.requirements;
    }

    const gaps = requirements
      .map(req => {
        const us = skillMap.get(req.skillId);
        const current = us?.currentLevel ?? 0;
        const gap = Math.max(0, req.requiredLevel - current);
        const priority = gap >= 2 && req.mandatory ? 'HIGH' : gap >= 1 ? 'MEDIUM' : 'LOW';
        return {
          skill: {
            id: req.skill.id,
            name: req.skill.name,
            type: req.skill.type,
            category: req.skill.category,
          },
          requiredLevel: req.requiredLevel,
          currentLevel: current,
          gap,
          gapPercent: req.requiredLevel > 0 ? +((gap / req.requiredLevel) * 100).toFixed(1) : 0,
          mandatory: req.mandatory,
          weight: req.weight,
          priority,
        };
      })
      .filter(g => g.gap > 0)
      .sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]);

    const totalSkills = userSkills.length;
    const avgLevel = totalSkills
      ? +(userSkills.reduce((s, sk) => s + sk.currentLevel, 0) / totalSkills).toFixed(2)
      : 0;
    const readiness =
      requirements.length > 0
        ? +(
            (requirements.filter(
              r => (skillMap.get(r.skillId)?.currentLevel ?? 0) >= r.requiredLevel,
            ).length /
              requirements.length) *
            100
          ).toFixed(1)
        : 100;

    return {
      user,
      gaps,
      totalGaps: gaps.length,
      criticalGaps: gaps.filter(g => g.priority === 'HIGH').length,
      avgSkillLevel: avgLevel,
      readinessScore: readiness,
      readinessLevel: readiness >= 80 ? 'READY' : readiness >= 50 ? 'DEVELOPING' : 'STARTING',
      allSkills: userSkills,
    };
  }

  async getTrainingNeeds(filters: SkillGapFilterDto = {}) {
    const where: Prisma.LegacyEmployeeSkillWhereInput = {};
    if (filters.departmentId) where.user = { departmentId: filters.departmentId };
    if (filters.skillType) where.skill = { type: filters.skillType };

    const records = await this.prisma.read.legacyEmployeeSkill.findMany({
      where,
      include: {
        skill: { include: { category: true } },
        user: {
          select: { id: true, fullName: true, department: { select: { id: true, name: true } } },
        },
      },
    });

    interface TrainingNeed {
      skill: { id: number; name: string; type: string };
      category: string | null;
      users: {
        id: number;
        fullName: string;
        department: { id: number; name: string } | null;
        currentLevel: number;
        targetLevel: number;
        gap: number;
      }[];
      totalGap: number;
      count: number;
    }
    const bySkill: Record<number, TrainingNeed> = {};
    for (const es of records) {
      const id = es.skillId;
      const gap = (es.targetLevel ?? es.skill.maxLevel) - es.currentLevel;
      if (gap <= 0) continue;

      if (!bySkill[id]) {
        bySkill[id] = {
          skill: { id: es.skill.id, name: es.skill.name, type: es.skill.type },
          category: es.skill.category?.name ?? null,
          users: [],
          totalGap: 0,
          count: 0,
        };
      }
      bySkill[id].users.push({
        id: es.user.id,
        fullName: es.user.fullName,
        department: es.user.department,
        currentLevel: es.currentLevel,
        targetLevel: es.targetLevel ?? es.skill.maxLevel,
        gap,
      });
      bySkill[id].totalGap += gap;
      bySkill[id].count++;
    }

    return Object.values(bySkill)
      .map(s => ({ ...s, avgGap: +(s.totalGap / s.count).toFixed(1) }))
      .sort((a, b) => b.avgGap - a.avgGap);
  }

  async getOrgSkillHeatmap(departmentId?: number) {
    const where: Prisma.LegacyEmployeeSkillWhereInput = {};
    if (departmentId) where.user = { departmentId };

    const data = await this.prisma.read.legacyEmployeeSkill.findMany({
      where,
      include: {
        skill: { select: { id: true, name: true, type: true } },
        user: {
          select: { id: true, fullName: true, department: { select: { id: true, name: true } } },
        },
      },
    });

    // Aggregate: skill → department → avg level
    const heatmap: Record<string, Record<string, number[]>> = {};
    for (const es of data) {
      const dept = es.user.department?.name ?? 'N/A';
      const skill = es.skill.name;
      if (!heatmap[skill]) heatmap[skill] = {};
      if (!heatmap[skill][dept]) heatmap[skill][dept] = [];
      heatmap[skill][dept].push(es.currentLevel);
    }

    return Object.entries(heatmap).map(([skill, depts]) => ({
      skill,
      departments: Object.entries(depts).map(([dept, levels]) => ({
        department: dept,
        avgLevel: +(levels.reduce((a, b) => a + b, 0) / levels.length).toFixed(2),
        count: levels.length,
      })),
    }));
  }

  // ══════════════════════════════════════════════════════
  // MENTORING
  // ══════════════════════════════════════════════════════

  async getMentorings(filters: MentoringFilterDto) {
    const { page = 1, limit = 20, mentorId, menteeId, status } = filters;
    const skip = (page - 1) * limit;
    const where: Prisma.MentoringWhereInput = {};
    if (mentorId) where.mentorId = mentorId;
    if (menteeId) where.menteeId = menteeId;
    if (status) where.status = status;

    const [data, total] = await Promise.all([
      this.prisma.read.mentoring.findMany({
        where,
        skip,
        take: limit,
        include: {
          mentor: {
            select: {
              id: true,
              fullName: true,
              avatarUrl: true,
              position: { select: { name: true } },
            },
          },
          mentee: {
            select: {
              id: true,
              fullName: true,
              avatarUrl: true,
              position: { select: { name: true } },
            },
          },
          sessions: { orderBy: { sessionDate: 'desc' }, take: 1 },
          _count: { select: { sessions: true } },
        },
        orderBy: { startedAt: 'desc' },
      }),
      this.prisma.read.mentoring.count({ where }),
    ]);

    return { data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  async createMentoring(dto: TalentDevelopmentCreateMentoringDto) {
    const existing = await this.prisma.mentoring.findFirst({
      where: { mentorId: dto.mentorId, menteeId: dto.menteeId, status: 'ACTIVE' },
    });
    if (existing) throw new ConflictException('Já existe mentoria activa entre este par');

    const [mentor, mentee] = await Promise.all([
      this.prisma.read.user.findUnique({
        where: { id: dto.mentorId },
        select: { id: true, fullName: true },
      }),
      this.prisma.read.user.findUnique({
        where: { id: dto.menteeId },
        select: { id: true, fullName: true },
      }),
    ]);
    if (!mentor) throw new NotFoundException('Mentor não encontrado');
    if (!mentee) throw new NotFoundException('Mentee não encontrado');

    const mentoring = await this.prisma.mentoring.create({
      data: {
        mentorId: dto.mentorId,
        menteeId: dto.menteeId,
        objective: dto.objective,
        durationMonths: dto.durationMonths,
        reverseMentoring: dto.reverseMentoring ?? false,
        status: 'ACTIVE',
      },
      include: {
        mentor: { select: { id: true, fullName: true } },
        mentee: { select: { id: true, fullName: true } },
      },
    });

    await Promise.all([
      createNotificationSafe(this.prisma, this.logger, {
        userId: dto.menteeId,
        type: 'MENTORING_STARTED',
        message: `Nova mentoria iniciada com ${mentor.fullName}`,
      }),
      createNotificationSafe(this.prisma, this.logger, {
        userId: dto.mentorId,
        type: 'MENTORING_ASSIGNED',
        message: `Foste designado mentor de ${mentee.fullName}`,
      }),
    ]);

    return mentoring;
  }

  async getMentoring(id: number, user?: CurrentUserData) {
    const m = await this.prisma.read.mentoring.findUnique({
      where: { id },
      include: {
        mentor: {
          select: {
            id: true,
            fullName: true,
            avatarUrl: true,
            position: { select: { name: true } },
          },
        },
        mentee: {
          select: {
            id: true,
            fullName: true,
            avatarUrl: true,
            position: { select: { name: true } },
          },
        },
        sessions: { orderBy: { sessionDate: 'desc' } },
      },
    });
    if (!m) throw new NotFoundException('Mentoria não encontrada');

    // Ownership (A3): mentor OU mentorando OU ADMIN/RH/LIDER; senão 404.
    // Recurso com dois donos possíveis — assertCanAccess só suporta um
    // ownerId de cada vez, por isso testamos mentee primeiro e só recorremos
    // à verificação de papel privilegiado uma vez (evita duplicar a checagem).
    if (user) {
      const isMentor = String(user.id) === String(m.mentorId);
      const isMentee = String(user.id) === String(m.menteeId);
      if (!isMentor && !isMentee) {
        assertCanAccess(m, m.menteeId, user, [Role.ADMIN, Role.RH, Role.LIDER]);
      }
    }

    return m;
  }

  async addMentoringSession(mentoringId: number, dto: CreateMentoringSessionDto) {
    const m = await this.prisma.read.mentoring.findUnique({
      where: { id: mentoringId },
      select: { id: true, status: true, mentorId: true, menteeId: true },
    });
    if (!m) throw new NotFoundException('Mentoria não encontrada');
    if (m.status !== 'ACTIVE') throw new BadRequestException('Mentoria não está activa');

    return this.prisma.mentoringSession.create({
      data: {
        mentoringId,
        sessionDate: new Date(dto.sessionDate),
        durationMinutes: dto.durationMinutes,
        summary: dto.summary,
        actionItems: dto.actionItems,
        rating: dto.rating,
      },
    });
  }

  async getMentorRecommendations(menteeId: number) {
    const mentee = await this.prisma.read.user.findUnique({
      where: { id: menteeId },
      select: {
        id: true,
        userCompetencies: { select: { competencyId: true, currentLevel: true, targetLevel: true } },
      },
    });
    if (!mentee) throw new NotFoundException('Utilizador não encontrado');

    const activeIds = await this.prisma.mentoring
      .findMany({ where: { menteeId, status: 'ACTIVE' }, select: { mentorId: true } })
      .then(ms => ms.map(m => m.mentorId));

    const candidates = await this.prisma.read.user.findMany({
      where: { active: true, id: { notIn: [...activeIds, menteeId] } },
      include: {
        instructorProfile: { select: { approved: true, expertiseArea: true } },
        userCompetencies: { select: { competencyId: true, currentLevel: true } },
        position: { select: { id: true, name: true, level: true } },
        department: { select: { name: true } },
        _count: { select: { mentoringAsMentor: true } },
      },
      take: 100,
    });

    const gapCompIds = mentee.userCompetencies
      .filter(c => c.targetLevel && c.targetLevel > c.currentLevel)
      .map(c => c.competencyId);

    return candidates
      .map(c => {
        const matched = c.userCompetencies.filter(
          comp => gapCompIds.includes(comp.competencyId) && comp.currentLevel >= 4,
        ).length;
        const avgComp = c.userCompetencies.length
          ? +(
              c.userCompetencies.reduce((s, x) => s + x.currentLevel, 0) / c.userCompetencies.length
            ).toFixed(2)
          : 0;
        const score = matched * 2 + avgComp * 0.5 + (c._count.mentoringAsMentor < 3 ? 1 : 0);
        return {
          user: {
            id: c.id,
            fullName: c.fullName,
            avatarUrl: c.avatarUrl,
            position: c.position,
            department: c.department,
            isInstructor: c.instructorProfile?.approved ?? false,
            expertiseArea: c.instructorProfile?.expertiseArea ?? null,
            activeMenteeCount: c._count.mentoringAsMentor,
          },
          matchScore: +score.toFixed(2),
          matchedCompetencies: matched,
          avgCompetency: avgComp,
        };
      })
      .sort((a, b) => b.matchScore - a.matchScore)
      .slice(0, 10);
  }

  async completeMentoring(id: number) {
    const m = await this.prisma.read.mentoring.findUnique({ where: { id } });
    if (!m) throw new NotFoundException('Mentoria não encontrada');
    if (m.status !== 'ACTIVE') throw new BadRequestException('Mentoria não está activa');
    return this.prisma.mentoring.update({
      where: { id },
      data: { status: 'COMPLETED', completedAt: new Date() },
    });
  }

  // ══════════════════════════════════════════════════════
  // ANALYTICS & DASHBOARDS
  // ══════════════════════════════════════════════════════

  async getDashboard(filters: TalentDevelopmentDashboardFilterDto = {}) {
    const { departmentId, managerId } = filters;
    const userWhere: Prisma.UserWhereInput = { active: true };
    if (departmentId) userWhere.departmentId = departmentId;
    if (managerId) userWhere.managerId = managerId;

    const [
      totalUsers,
      usersWithActivePlan,
      totalPlans,
      plansByStatus,
      totalActions,
      completedActions,
      overdueActions,
      activeMentorings,
      totalSkillAssessed,
      recentCompletions,
      topTrainingNeeds,
    ] = await Promise.all([
      this.prisma.read.user.count({ where: userWhere }),
      this.prisma.read.developmentPlan.count({
        where: { status: 'ACTIVE', isTemplate: false, user: userWhere },
      }),
      this.prisma.read.developmentPlan.count({ where: { isTemplate: false, user: userWhere } }),
      this.prisma.read.developmentPlan.groupBy({
        by: ['status'],
        where: { isTemplate: false, user: userWhere },
        _count: true,
      }),
      this.prisma.read.developmentPlanAction.count({
        where: { plan: { user: userWhere, isTemplate: false } },
      }),
      this.prisma.read.developmentPlanAction.count({
        where: { plan: { user: userWhere, isTemplate: false }, status: 'COMPLETED' },
      }),
      this.prisma.read.developmentPlanAction.count({
        where: {
          plan: { user: userWhere, isTemplate: false },
          status: { notIn: ['COMPLETED', 'CANCELLED'] },
          dueDate: { lt: new Date() },
        },
      }),
      this.prisma.read.mentoring.count({ where: { status: 'ACTIVE' } }),
      this.prisma.read.legacyEmployeeSkill.count({ where: { user: userWhere } }),
      this.prisma.read.developmentPlan.findMany({
        where: { status: 'COMPLETED', isTemplate: false, user: userWhere },
        orderBy: { completedAt: 'desc' },
        take: 5,
        include: { user: { select: { id: true, fullName: true, avatarUrl: true } } },
      }),
      this.getTrainingNeeds({ departmentId } as SkillGapFilterDto).then(r => r.slice(0, 5)),
    ]);

    return {
      kpis: {
        totalUsers,
        usersWithActivePlan,
        pdpCoverage: totalUsers > 0 ? +((usersWithActivePlan / totalUsers) * 100).toFixed(1) : 0,
        totalPlans,
        totalActions,
        completedActions,
        overdueActions,
        actionCompletion:
          totalActions > 0 ? +((completedActions / totalActions) * 100).toFixed(1) : 0,
        activeMentorings,
        totalSkillAssessed,
      },
      plansByStatus: plansByStatus.map(s => ({ status: s.status, count: s._count })),
      topTrainingNeeds,
      recentCompletions,
    };
  }

  async getTalentHealthScore(departmentId?: number) {
    const userWhere: Prisma.UserWhereInput = { active: true };
    if (departmentId) userWhere.departmentId = departmentId;

    const [total, withPlan, withSkills, withReview, withMentoring, hiPos] = await Promise.all([
      this.prisma.read.user.count({ where: userWhere }),
      this.prisma.read.user.count({
        where: {
          ...userWhere,
          developmentPlans: { some: { status: 'ACTIVE', isTemplate: false } },
        },
      }),
      this.prisma.read.user.count({ where: { ...userWhere, legacySkills: { some: {} } } }),
      this.prisma.read.user.count({ where: { ...userWhere, performanceReviews: { some: {} } } }),
      this.prisma.read.user.count({
        where: {
          ...userWhere,
          OR: [
            { mentoringAsMentee: { some: { status: 'ACTIVE' } } },
            { mentoringAsMentor: { some: { status: 'ACTIVE' } } },
          ],
        },
      }),
      this.getHighPotentials(9999, departmentId).then(r => r.total),
    ]);

    const m = {
      pdpCoverage: total > 0 ? +((withPlan / total) * 100).toFixed(1) : 0,
      skillsAssessment: total > 0 ? +((withSkills / total) * 100).toFixed(1) : 0,
      reviewedRate: total > 0 ? +((withReview / total) * 100).toFixed(1) : 0,
      mentoringRate: total > 0 ? +((withMentoring / total) * 100).toFixed(1) : 0,
      hiPoRatio: total > 0 ? +((hiPos / total) * 100).toFixed(1) : 0,
    };

    const healthScore = +(
      m.pdpCoverage * 0.3 +
      m.skillsAssessment * 0.25 +
      m.reviewedRate * 0.2 +
      m.mentoringRate * 0.15 +
      m.hiPoRatio * 0.1
    ).toFixed(1);

    return {
      healthScore,
      grade: healthScore >= 80 ? 'A' : healthScore >= 65 ? 'B' : healthScore >= 50 ? 'C' : 'D',
      metrics: m,
      total,
    };
  }

  async getUserEvolution(userId: number) {
    const user = await this.prisma.read.user.findUnique({
      where: { id: userId },
      select: { id: true, fullName: true, avatarUrl: true, createdAt: true },
    });
    if (!user) throw new NotFoundException('Utilizador não encontrado');

    const [plans, skills, reviews, badges, points] = await Promise.all([
      this.prisma.read.developmentPlan.findMany({
        where: { userId, isTemplate: false },
        include: { actions: { select: { status: true, progress: true } }, goals: true },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.read.legacyEmployeeSkill.findMany({
        where: { userId },
        include: { skill: { select: { id: true, name: true, type: true } } },
        orderBy: { assessedAt: 'asc' },
      }),
      this.prisma.read.performanceReview.findMany({
        where: { userId },
        orderBy: { createdAt: 'asc' },
        select: { score: true, potentialScore: true, type: true, createdAt: true },
      }),
      this.prisma.read.badgeAward.findMany({
        where: { userId },
        include: { badge: true },
        orderBy: { awardedAt: 'asc' },
      }),
      this.prisma.read.userPoints.findUnique({ where: { userId } }),
    ]);

    const allActions = plans.flatMap(p => p.actions);
    const completedPlans = plans.filter(p => p.status === 'COMPLETED').length;

    return {
      user,
      summary: {
        totalPlans: plans.length,
        completedPlans,
        totalActions: allActions.length,
        completedActions: allActions.filter(a => a.status === 'COMPLETED').length,
        actionCompletion: allActions.length
          ? +(
              (allActions.filter(a => a.status === 'COMPLETED').length / allActions.length) *
              100
            ).toFixed(1)
          : 0,
        totalSkills: skills.length,
        avgSkillLevel: skills.length
          ? +(skills.reduce((s, sk) => s + sk.currentLevel, 0) / skills.length).toFixed(2)
          : 0,
        totalBadges: badges.length,
        totalPoints: points?.points ?? 0,
        latestScore: reviews.slice(-1)[0]?.score ?? null,
      },
      timeline: {
        plans: plans.map(p => ({
          id: p.id,
          name: p.name,
          status: p.status,
          date: p.createdAt,
          overallProgress: p.overallProgress,
        })),
        reviews: reviews,
        badges: badges.map(b => ({ badge: b.badge, awardedAt: b.awardedAt })),
        skills: skills.map(s => ({
          skillName: s.skill.name,
          type: s.skill.type,
          level: s.currentLevel,
          assessedAt: s.assessedAt,
        })),
      },
    };
  }

  // ══════════════════════════════════════════════════════
  // AI RECOMMENDATIONS
  // ══════════════════════════════════════════════════════

  async getRecommendations(userId: number) {
    const [gapData, userPlans, points] = await Promise.all([
      this.getUserSkillGaps(userId),
      this.prisma.read.developmentPlan.findMany({
        where: { userId, isTemplate: false, status: { in: ['ACTIVE', 'COMPLETED'] } },
        include: { actions: { select: { type: true, courseId: true, status: true } } },
      }),
      this.prisma.read.userPoints.findUnique({ where: { userId } }),
    ]);

    const existingCourseIds = userPlans
      .flatMap(p => p.actions)
      .filter(a => a.courseId)
      .map(a => a.courseId)
      .filter(Boolean);

    // Recommend published courses not already assigned
    const courses = await this.prisma.course.findMany({
      where: {
        status: 'PUBLISHED',
        id: existingCourseIds.length > 0 ? { notIn: existingCourseIds } : undefined,
      },
      select: {
        id: true,
        title: true,
        category: true,
        workloadHours: true,
        thumbnailUrl: true,
        level: true,
        _count: { select: { enrollments: true } },
      },
      // Ordenar um findMany por contagem de relação usa { relação: { _count } },
      // não { _count: { relação } } (só válido em groupBy/aggregate) — ver
      // padrão correcto em analytics.service.ts. Rebentava sempre
      // (PrismaClientValidationError) em GET /talent/recommendations/:userId.
      orderBy: { enrollments: { _count: 'desc' } },
      take: 10,
    });

    const mentors = await this.getMentorRecommendations(userId);
    const insights = this.buildInsights(gapData, userPlans, points);
    const actions = this.buildActionRecs(gapData);

    return { courses, mentors: mentors.slice(0, 5), insights, actions };
  }

  private buildInsights(
    gapData: Awaited<ReturnType<TalentDevelopmentService['getUserSkillGaps']>>,
    plans: { status: string }[],
    points: { points: number } | null,
  ): string[] {
    const i: string[] = [];
    const active = plans.filter(p => p.status === 'ACTIVE');
    if (active.length === 0) i.push('⚠️ Não tens um PDI activo — considera criar um');
    if (gapData.criticalGaps > 2)
      i.push(`🎯 ${gapData.criticalGaps} gaps críticos de skills identificados`);
    if (gapData.readinessScore >= 80) i.push('🟢 Estás pronto para progressão de carreira');
    if ((points?.points ?? 0) > 500) i.push('🏆 Alto engagement — mantém o ritmo!');
    if (gapData.readinessScore < 40) i.push('📚 Foco em desenvolvimento técnico prioritário');
    return i;
  }

  private buildActionRecs(
    gapData: Awaited<ReturnType<TalentDevelopmentService['getUserSkillGaps']>>,
  ): string[] {
    const r: string[] = [];
    if (gapData.criticalGaps > 0) r.push('Iniciar PDI focado nas skills críticas');
    if (gapData.gaps.length > 5) r.push('Registar autoavaliação de skills actualizada');
    if (gapData.readinessScore < 50) r.push('Alinhar PDI com o teu cargo alvo');
    return r;
  }

  async simulateCareer(userId: number, dto: CareerSimulationDto) {
    const [user, targetRole, gapData] = await Promise.all([
      this.prisma.read.user.findUnique({
        where: { id: userId },
        select: { id: true, fullName: true, role: { select: { name: true } } },
      }),
      this.prisma.read.careerRole.findUnique({
        where: { id: dto.targetRoleId },
        include: { skillRequirements: { include: { skill: true } } },
      }),
      this.getUserSkillGaps(userId),
    ]);

    if (!user) throw new NotFoundException('Utilizador não encontrado');
    if (!targetRole) throw new NotFoundException('Cargo alvo não encontrado');

    const critical = gapData.criticalGaps;
    const regular = gapData.gaps.length - critical;
    const months = Math.max(6, critical * 3 + regular * 1.5);

    const steps: { phase: number; title: string; duration: string; type: string }[] = [];
    if (critical > 0)
      steps.push({
        phase: 1,
        title: 'Fechar gaps críticos',
        duration: `${Math.round(critical * 3)} meses`,
        type: 'SKILL',
      });
    if (regular > 0)
      steps.push({
        phase: 2,
        title: 'Desenvolver skills complementares',
        duration: `${Math.round(regular * 1.5)} meses`,
        type: 'SKILL',
      });
    steps.push({
      phase: steps.length + 1,
      title: 'Experiência prática no papel',
      duration: '3–6 meses',
      type: 'EXPERIENCE',
    });

    return {
      userId,
      currentRole: user.role?.name ?? 'N/A',
      targetRole: { id: targetRole.id, name: targetRole.name, level: targetRole.level },
      readinessScore: gapData.readinessScore,
      readinessLevel: gapData.readinessLevel,
      estimatedMonths: Math.round(months),
      estimatedDate: new Date(Date.now() + months * 30 * 86400000).toISOString().split('T')[0],
      criticalGaps: gapData.gaps.filter(g => g.priority === 'HIGH'),
      recommendedPath: steps,
      feasible: !dto.targetMonths || months <= dto.targetMonths,
      targetMonths: dto.targetMonths ?? null,
    };
  }

  // ══════════════════════════════════════════════════════
  // INTERNAL HELPERS
  // ══════════════════════════════════════════════════════

  private async recalculatePlanProgress(planId: number) {
    const actions = await this.prisma.read.developmentPlanAction.findMany({
      where: { planId },
      select: { progress: true, status: true },
    });
    if (!actions.length) return;

    const overall = Math.round(actions.reduce((s, a) => s + (a.progress ?? 0), 0) / actions.length);

    const allDone = actions.every(a => a.status === 'COMPLETED');
    await this.prisma.developmentPlan.update({
      where: { id: planId },
      data: {
        overallProgress: overall,
        ...(allDone ? { status: 'COMPLETED', completedAt: new Date() } : {}),
      },
    });
  }
}
