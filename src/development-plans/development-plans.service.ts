// src/development-plans/development-plans.service.ts
import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateDevelopmentPlanDto,
  UpdateDevelopmentPlanDto,
  DevelopmentPlanFilterDto,
  CreatePlanActionDto,
  UpdatePlanActionDto,
  AddEvidenceDto,
  CreatePlanGoalDto,
  UpdatePlanGoalProgressDto,
  CreateCheckpointDto,
  CompleteCheckpointDto,
  ApprovePlanDto,
} from './development-plans.dto';
import { assertCanAccess } from '../common/authz/ownership';
import { Role } from '../auth/enums/role.enum';
import { CurrentUserData } from '../common/decorators';

@Injectable()
export class DevelopmentPlansService {
  private readonly logger = new Logger(DevelopmentPlansService.name);

  constructor(private prisma: PrismaService) {}

  // ─── PLANOS ───────────────────────────────────────────────────────────────

  async findAll(filters: DevelopmentPlanFilterDto) {
    const { page = 1, limit = 20, userId, managerId, status, priority, period, overdue } = filters;
    const skip = (page - 1) * limit;

    const where: Prisma.DevelopmentPlanWhereInput = {};
    if (userId) where.userId = userId;
    if (managerId) where.managerId = managerId;
    if (status) where.status = status;
    if (priority) where.priority = priority;
    if (period) where.period = period;
    if (overdue) where.endDate = { lt: new Date() };

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
              position: { select: { name: true } },
            },
          },
          manager: { select: { id: true, fullName: true, avatarUrl: true } },
          actions: { select: { id: true, status: true } },
          goals: { select: { id: true, progress: true } },
          _count: { select: { actions: true, goals: true, checkpoints: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.read.developmentPlan.count({ where }),
    ]);

    const enriched = data.map(p => {
      const actions = p.actions;
      const goals = p.goals;
      const completed = actions.filter(a => a.status === 'COMPLETED').length;
      const total_a = actions.length;
      const avgGoal =
        goals.length > 0 ? Math.round(goals.reduce((s, g) => s + g.progress, 0) / goals.length) : 0;
      return {
        ...p,
        actionProgress: total_a > 0 ? Math.round((completed / total_a) * 100) : 0,
        avgGoalProgress: avgGoal,
      };
    });

    return { data: enriched, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async findOne(id: number, user?: CurrentUserData) {
    const plan = await this.prisma.read.developmentPlan.findUnique({
      where: { id },
      include: {
        user: {
          select: {
            id: true,
            fullName: true,
            email: true,
            avatarUrl: true,
            position: { select: { name: true, level: true } },
            department: { select: { name: true } },
          },
        },
        manager: { select: { id: true, fullName: true, avatarUrl: true } },
        actions: {
          include: { evidence: true },
          orderBy: { seq: 'asc' },
        },
        goals: { orderBy: { createdAt: 'asc' } },
        checkpoints: { orderBy: { scheduledAt: 'asc' } },
        approvals: { orderBy: { createdAt: 'desc' }, take: 5 },
        certificates: { select: { id: true, validationCode: true, issuedAt: true } },
        _count: { select: { actions: true, goals: true, checkpoints: true } },
      },
    });
    // Ownership (A3): dono OU ADMIN/RH/GESTOR; senão 404.
    // Quando chamado sem user (contexto interno de confiança), não filtra.
    if (user) {
      assertCanAccess(plan, plan?.userId, user, [Role.ADMIN, Role.RH, Role.GESTOR]);
    } else if (!plan) {
      throw new NotFoundException('Plano de desenvolvimento não encontrado');
    }

    const actions = plan.actions;
    const completed = actions.filter(a => a.status === 'COMPLETED').length;
    const total_a = actions.length;
    const goals = plan.goals;
    const avgGoal =
      goals.length > 0 ? Math.round(goals.reduce((s, g) => s + g.progress, 0) / goals.length) : 0;

    return {
      ...plan,
      actionProgress: total_a > 0 ? Math.round((completed / total_a) * 100) : 0,
      avgGoalProgress: avgGoal,
    };
  }

  async create(dto: CreateDevelopmentPlanDto) {
    const { focusCompetencyIds, ...data } = dto;

    const plan = await this.prisma.developmentPlan.create({
      data: {
        name: data.name,
        goal: data.goal,
        userId: data.userId,
        managerId: data.managerId,
        priority: data.priority ?? 'MEDIUM',
        period: data.period,
        startDate: data.startDate ? new Date(data.startDate) : null,
        endDate: data.endDate ? new Date(data.endDate) : null,
        performanceCycleId: data.performanceCycleId,
        isTemplate: data.isTemplate ?? false,
        notes: data.notes,
        status: 'DRAFT',
      },
      include: {
        user: { select: { id: true, fullName: true } },
        manager: { select: { id: true, fullName: true } },
      },
    });

    // Notificar colaborador
    await this.prisma.notificationLog
      .create({
        data: {
          userId: data.userId,
          type: 'PDI_CREATED',
          message: `Um novo Plano de Desenvolvimento foi criado para si: "${data.name}"`,
          metadata: JSON.stringify({}),
        },
      })
      .catch(e => {
        this.logger.warn({
          userId: data.userId,
          action: 'PDI_CREATED',
          planId: plan.id,
          err: { message: e instanceof Error ? e.message : String(e) },
          msg: 'Falha ao criar notificação de PDI criado',
        });
      });

    return plan;
  }

  async update(id: number, dto: UpdateDevelopmentPlanDto) {
    await this.findOne(id);
    const { focusCompetencyIds, ...data } = dto;
    return this.prisma.developmentPlan.update({
      where: { id },
      data: {
        ...data,
        startDate: data.startDate ? new Date(data.startDate) : undefined,
        endDate: data.endDate ? new Date(data.endDate) : undefined,
      },
    });
  }

  async submitForApproval(id: number, user: CurrentUserData) {
    // Sem isto, qualquer autenticado podia submeter o PDI de outra pessoa para
    // aprovação (a rota não tinha @Roles nem verificação de dono nenhuma).
    const plan = await this.findOne(id, user);
    if (plan.status !== 'DRAFT') {
      throw new BadRequestException('Apenas planos em DRAFT podem ser submetidos');
    }
    return this.prisma.developmentPlan.update({
      where: { id },
      data: { status: 'PENDING_APPROVAL' },
    });
  }

  async approvePlan(dto: ApprovePlanDto, approver: CurrentUserData) {
    const plan = await this.findOne(dto.planId);
    // Ownership: só o gestor designado do plano (managerId) OU ADMIN/RH podem
    // aprovar — um GESTOR de outra equipa não deve poder decidir sobre um PDI
    // que não gere. `findOne` sem `user` não filtra por dono (userId), o que
    // aqui seria a relação errada de qualquer forma: quem aprova é o managerId,
    // não o dono do plano. Mesma classe de bug já encontrada em
    // leader.service.approvePlan (ver memory ownership-check-gaps).
    assertCanAccess(plan, plan.managerId, approver, [Role.ADMIN, Role.RH]);
    const approverId = approver.id;
    if (plan.status !== 'PENDING_APPROVAL') {
      throw new BadRequestException('Plano não está pendente de aprovação');
    }

    const newStatus = dto.decision === 'approve' ? 'ACTIVE' : 'DRAFT';

    await this.prisma.pdiApproval.create({
      data: {
        planId: dto.planId,
        approverId,
        decision: dto.decision === 'approve' ? 'APPROVE' : 'REJECT',
        comment: dto.comment,
      },
    });

    const updated = await this.prisma.developmentPlan.update({
      where: { id: dto.planId },
      data: { status: newStatus, activatedAt: dto.decision === 'approve' ? new Date() : undefined },
    });

    // Notificar colaborador
    await this.prisma.notificationLog
      .create({
        data: {
          userId: plan.userId,
          type: dto.decision === 'approve' ? 'PDI_APPROVED' : 'PDI_REJECTED',
          message:
            dto.decision === 'approve'
              ? `✅ O seu PDI "${plan.name}" foi aprovado!`
              : `⚠️ O seu PDI "${plan.name}" foi devolvido para revisão`,
          metadata: JSON.stringify({}),
        },
      })
      .catch(e => {
        this.logger.warn({
          userId: plan.userId,
          approverId,
          action: dto.decision === 'approve' ? 'PDI_APPROVED' : 'PDI_REJECTED',
          planId: dto.planId,
          err: { message: e instanceof Error ? e.message : String(e) },
          msg: 'Falha ao criar notificação de decisão de aprovação de PDI',
        });
      });

    return updated;
  }

  async complete(id: number) {
    const plan = await this.findOne(id);
    if (!['ACTIVE', 'PENDING_APPROVAL'].includes(plan.status)) {
      throw new BadRequestException('Apenas planos activos podem ser concluídos');
    }

    const updated = await this.prisma.developmentPlan.update({
      where: { id },
      data: { status: 'COMPLETED', completedAt: new Date(), overallProgress: 100 },
    });

    // Certificado
    const code = `PDI-${Date.now()}-${id}`;
    await this.prisma.certificate
      .create({
        data: {
          type: 'DEVELOPMENT',
          userId: plan.userId,
          developmentPlanId: id,
          validationCode: code,
          fileUrl: `/certificates/${code}.pdf`,
        },
      })
      .catch(e => {
        this.logger.warn({
          userId: plan.userId,
          planId: id,
          action: 'complete.issueCertificate',
          err: { message: e instanceof Error ? e.message : String(e) },
          msg: 'Falha ao emitir certificado de conclusão de PDI',
        });
      });

    // XP
    await this.prisma.userPoints
      .upsert({
        where: { userId: plan.userId },
        create: { userId: plan.userId, points: 300 },
        update: { points: { increment: 300 } },
      })
      .catch(e => {
        this.logger.warn({
          userId: plan.userId,
          planId: id,
          action: 'complete.awardXp',
          err: { message: e instanceof Error ? e.message : String(e) },
          msg: 'Falha ao atribuir XP por conclusão de PDI',
        });
      });

    // Notificar
    await this.prisma.notificationLog
      .create({
        data: {
          userId: plan.userId,
          type: 'PDI_COMPLETED',
          message: `🎉 PDI "${plan.name}" concluído! +300 XP e certificado emitido.`,
          metadata: JSON.stringify({}),
        },
      })
      .catch(e => {
        this.logger.warn({
          userId: plan.userId,
          planId: id,
          action: 'PDI_COMPLETED',
          err: { message: e instanceof Error ? e.message : String(e) },
          msg: 'Falha ao criar notificação de PDI concluído',
        });
      });

    return updated;
  }

  async cancel(id: number, reason?: string) {
    await this.findOne(id);
    return this.prisma.developmentPlan.update({
      where: { id },
      data: { status: 'CANCELLED', cancelReason: reason },
    });
  }

  // Transição para PAUSED — portada de talent-development.pausePlan (Fase G3),
  // para o lifecycle de PDI ter um só dono.
  async pause(id: number, reason?: string) {
    const plan = await this.findOne(id);
    if (plan.status !== 'ACTIVE') {
      throw new BadRequestException('Apenas planos activos podem ser pausados');
    }
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

  async remove(id: number) {
    const plan = await this.findOne(id);
    if (plan.status === 'ACTIVE') {
      throw new ForbiddenException('Plano activo não pode ser eliminado. Cancele-o primeiro.');
    }
    await this.prisma.developmentPlan.delete({ where: { id } });
    return { message: 'Plano eliminado' };
  }

  // ─── ACÇÕES ───────────────────────────────────────────────────────────────

  async addAction(dto: CreatePlanActionDto, user: CurrentUserData) {
    // A10-5: findOne sem `user` saltava o ownership — qualquer autenticado
    // podia adicionar acções ao PDI de outra pessoa.
    const plan = await this.findOne(dto.planId, user);
    if (plan.status === 'COMPLETED' || plan.status === 'CANCELLED') {
      throw new BadRequestException(
        'Não é possível adicionar acções a um plano concluído ou cancelado',
      );
    }

    const { competencyIds, ...data } = dto;

    return this.prisma.developmentPlanAction.create({
      data: {
        planId: data.planId,
        title: data.title,
        description: data.description,
        type: data.type,
        status: data.status ?? 'TODO',
        courseId: data.courseId,
        workloadHours: data.workloadHours,
        dueDate: data.dueDate ? new Date(data.dueDate) : null,
        resources: data.resources ?? [],
        xpReward: data.xpReward ?? 20,
        seq: data.seq ?? 0,
        mandatory: data.mandatory ?? false,
        progress: 0,
      },
    });
  }

  async updateAction(actionId: number, dto: UpdatePlanActionDto, user: CurrentUserData) {
    // Leitura que decide lógica de escrita (XP/transição): força primary.
    const action = await this.prisma.developmentPlanAction.findUnique({
      where: { id: actionId },
      include: { plan: true },
    });
    if (!action) throw new NotFoundException('Acção não encontrada');
    // A10-5: sem isto, qualquer autenticado podia editar/completar a acção de
    // PDI de outra pessoa — incluindo atribuir-se XP alheio (ver abaixo).
    assertCanAccess(action, action.plan.userId, user, [Role.ADMIN, Role.RH, Role.GESTOR]);
    const ownerId = action.plan.userId;

    const wasCompleted = action.status !== 'COMPLETED' && dto.status === 'COMPLETED';

    const updated = await this.prisma.developmentPlanAction.update({
      where: { id: actionId },
      data: {
        ...dto,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
        completedAt: dto.status === 'COMPLETED' ? new Date() : undefined,
        progress: dto.status === 'COMPLETED' ? 100 : dto.progress,
      },
    });

    // XP ao completar — vai sempre para o dono do plano (ownerId), nunca para
    // quem chamou o endpoint: um ADMIN/RH/GESTOR pode completar a acção de
    // outra pessoa em nome dela, mas o XP é da pessoa a quem o PDI pertence.
    if (wasCompleted) {
      const xp = action.xpReward ?? 20;
      await this.prisma.userPoints
        .upsert({
          where: { userId: ownerId },
          create: { userId: ownerId, points: xp },
          update: { points: { increment: xp } },
        })
        .catch(e => {
          this.logger.warn({
            userId: ownerId,
            actionId,
            xp,
            action: 'updateAction.awardXp',
            err: { message: e instanceof Error ? e.message : String(e) },
            msg: 'Falha ao atribuir XP por conclusão de acção de PDI',
          });
        });

      // Verificar se o plano está todo completo
      await this.recalcPlanProgress(action.planId);
    }

    return updated;
  }

  async removeAction(actionId: number, user: CurrentUserData) {
    const action = await this.prisma.developmentPlanAction.findUnique({
      where: { id: actionId },
      include: { plan: true },
    });
    if (!action) throw new NotFoundException('Acção não encontrada');
    assertCanAccess(action, action.plan.userId, user, [Role.ADMIN, Role.RH, Role.GESTOR]);
    if (action.status === 'IN_PROGRESS') {
      throw new BadRequestException('Acção em progresso não pode ser removida');
    }
    await this.prisma.developmentPlanAction.delete({ where: { id: actionId } });
    return { message: 'Acção removida' };
  }

  // ─── EVIDÊNCIAS ───────────────────────────────────────────────────────────

  async addEvidence(user: CurrentUserData, dto: AddEvidenceDto) {
    const action = await this.prisma.developmentPlanAction.findUnique({
      where: { id: dto.actionId },
      include: { plan: true },
    });
    if (!action) throw new NotFoundException('Acção não encontrada');
    // A10-5: sem isto, qualquer autenticado podia registar evidências na
    // acção de PDI de outra pessoa.
    assertCanAccess(action, action.plan.userId, user, [Role.ADMIN, Role.RH, Role.GESTOR]);

    const evidence = await this.prisma.pdiEvidence.create({
      data: {
        developmentPlanActionId: dto.actionId,
        submittedById: user.id,
        title: dto.title,
        url: dto.url,
        notes: dto.notes,
        evidenceType: dto.evidenceType ?? 'NOTE',
      },
    });

    // Auto-avançar para IN_PROGRESS se ainda em TODO
    if (action.status === 'TODO') {
      await this.prisma.developmentPlanAction.update({
        where: { id: dto.actionId },
        data: { status: 'IN_PROGRESS', progress: 10 },
      });
    }

    return evidence;
  }

  // ─── METAS ────────────────────────────────────────────────────────────────

  async addGoal(dto: CreatePlanGoalDto, user: CurrentUserData) {
    // A10-5: findOne sem `user` saltava o ownership.
    await this.findOne(dto.planId, user);
    return this.prisma.pdiGoal.create({ data: dto });
  }

  async updateGoalProgress(user: CurrentUserData, dto: UpdatePlanGoalProgressDto) {
    const goal = await this.prisma.pdiGoal.findUnique({
      where: { id: dto.goalId },
      include: { plan: true },
    });
    if (!goal) throw new NotFoundException('Meta não encontrada');
    // A10-5: sem isto, qualquer autenticado podia actualizar o progresso da
    // meta de PDI de outra pessoa.
    assertCanAccess(goal, goal.plan.userId, user, [Role.ADMIN, Role.RH, Role.GESTOR]);

    const updated = await this.prisma.pdiGoal.update({
      where: { id: dto.goalId },
      data: {
        progress: dto.progress,
        completedAt: dto.progress >= 100 ? new Date() : undefined,
        notes: dto.notes,
      },
    });

    await this.recalcPlanProgress(goal.planId);
    return updated;
  }

  // ─── CHECKPOINTS ──────────────────────────────────────────────────────────

  async addCheckpoint(dto: CreateCheckpointDto, user: CurrentUserData) {
    // A10-5: findOne sem `user` saltava o ownership.
    await this.findOne(dto.planId, user);
    return this.prisma.pdiCheckpoint.create({
      data: {
        planId: dto.planId,
        title: dto.title,
        description: dto.description,
        scheduledAt: new Date(dto.scheduledAt),
        type: dto.type ?? 'QUICK',
        status: 'PENDING',
      },
    });
  }

  async completeCheckpoint(dto: CompleteCheckpointDto, user: CurrentUserData) {
    const cp = await this.prisma.pdiCheckpoint.findUnique({
      where: { id: dto.checkpointId },
      include: { plan: true },
    });
    if (!cp) throw new NotFoundException('Checkpoint não encontrado');
    // A10-5: sem isto, qualquer autenticado podia marcar como concluído o
    // checkpoint de PDI de outra pessoa.
    assertCanAccess(cp, cp.plan.userId, user, [Role.ADMIN, Role.RH, Role.GESTOR]);
    return this.prisma.pdiCheckpoint.update({
      where: { id: dto.checkpointId },
      data: {
        status: 'COMPLETED',
        completedAt: new Date(),
        notes: dto.notes,
        selfScore: dto.selfScore,
      },
    });
  }

  // ─── PROGRESSO ────────────────────────────────────────────────────────────

  private async recalcPlanProgress(planId: number) {
    // Recalcula estado derivado e grava — lê do primary para não computar sobre réplica atrasada.
    const [actions, goals] = await Promise.all([
      this.prisma.developmentPlanAction.findMany({
        where: { planId },
        select: { status: true, mandatory: true },
      }),
      this.prisma.pdiGoal.findMany({ where: { planId }, select: { progress: true } }),
    ]);

    const totalActions = actions.length;
    const completedActions = actions.filter(a => a.status === 'COMPLETED').length;
    const actionPct = totalActions > 0 ? Math.round((completedActions / totalActions) * 100) : 0;

    const avgGoal =
      goals.length > 0 ? Math.round(goals.reduce((s, g) => s + g.progress, 0) / goals.length) : 0;

    const overallProgress = Math.round((actionPct + avgGoal) / 2);

    await this.prisma.developmentPlan.update({
      where: { id: planId },
      data: { overallProgress },
    });
  }

  // ─── DASHBOARD & ANALYTICS ────────────────────────────────────────────────

  async getMyPlans(userId: number) {
    const plans = await this.prisma.read.developmentPlan.findMany({
      where: { userId },
      include: {
        actions: { select: { status: true, dueDate: true } },
        goals: { select: { progress: true } },
        checkpoints: {
          where: { status: 'PENDING', scheduledAt: { gte: new Date() } },
          orderBy: { scheduledAt: 'asc' },
          take: 1,
        },
        certificates: { select: { validationCode: true, issuedAt: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return plans.map(p => {
      const actions = p.actions;
      const goals = p.goals;
      const completed = actions.filter(a => a.status === 'COMPLETED').length;
      const overdue = actions.filter(
        a => a.dueDate && new Date(a.dueDate) < new Date() && a.status !== 'COMPLETED',
      ).length;

      return {
        ...p,
        actionProgress: actions.length > 0 ? Math.round((completed / actions.length) * 100) : 0,
        avgGoalProgress:
          goals.length > 0
            ? Math.round(goals.reduce((s, g) => s + g.progress, 0) / goals.length)
            : 0,
        overdueActions: overdue,
      };
    });
  }

  async getStats(userId: number) {
    const [total, active, completed, cancelled] = await Promise.all([
      this.prisma.read.developmentPlan.count({ where: { userId } }),
      this.prisma.read.developmentPlan.count({ where: { userId, status: 'ACTIVE' } }),
      this.prisma.read.developmentPlan.count({ where: { userId, status: 'COMPLETED' } }),
      this.prisma.read.developmentPlan.count({ where: { userId, status: 'CANCELLED' } }),
    ]);

    const actionStats = await this.prisma.read.developmentPlanAction.groupBy({
      by: ['status'],
      where: { plan: { userId } },
      _count: true,
    });

    const totalXp = await this.prisma.read.userPoints.findUnique({
      where: { userId },
      select: { points: true },
    });

    return {
      plans: { total, active, completed, cancelled },
      actions: Object.fromEntries(actionStats.map(s => [s.status, s._count])),
      completionRate: total > 0 ? Math.round((completed / total) * 100) : 0,
      totalXp: totalXp?.points ?? 0,
    };
  }

  async getTeamDashboard(managerId: number) {
    const plans = await this.prisma.read.developmentPlan.findMany({
      where: { managerId, status: { in: ['ACTIVE', 'PENDING_APPROVAL'] } },
      include: {
        user: {
          select: {
            id: true,
            fullName: true,
            avatarUrl: true,
            position: { select: { name: true } },
          },
        },
        actions: { select: { status: true, dueDate: true, mandatory: true } },
        goals: { select: { progress: true } },
      },
      orderBy: { endDate: 'asc' },
    });

    return plans.map(p => {
      const actions = p.actions;
      const goals = p.goals;
      const completed = actions.filter(a => a.status === 'COMPLETED').length;
      const overdue = actions.filter(
        a => a.dueDate && new Date(a.dueDate) < new Date() && a.status !== 'COMPLETED',
      ).length;

      return {
        id: p.id,
        name: p.name,
        status: p.status,
        user: p.user,
        endDate: p.endDate,
        progress: actions.length > 0 ? Math.round((completed / actions.length) * 100) : 0,
        avgGoal:
          goals.length > 0
            ? Math.round(goals.reduce((s, g) => s + g.progress, 0) / goals.length)
            : 0,
        overdueActions: overdue,
        pendingApproval: p.status === 'PENDING_APPROVAL',
      };
    });
  }
}
