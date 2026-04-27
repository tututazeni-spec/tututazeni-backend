// src/development-plans/development-plans.service.ts
import {
  Injectable, NotFoundException, ConflictException,
  BadRequestException, ForbiddenException, Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateDevelopmentPlanDto, UpdateDevelopmentPlanDto, DevelopmentPlanFilterDto,
  CreatePlanActionDto, UpdatePlanActionDto, AddEvidenceDto,
  CreatePlanGoalDto, UpdatePlanGoalProgressDto,
  CreateCheckpointDto, CompleteCheckpointDto,
  ApprovePlanDto, PlanStatus, ActionStatus,
} from './development-plans.dto';

@Injectable()
export class DevelopmentPlansService {
  private readonly logger = new Logger(DevelopmentPlansService.name);

  constructor(private prisma: PrismaService) {}

  // ─── PLANOS ───────────────────────────────────────────────────────────────

  async findAll(filters: DevelopmentPlanFilterDto) {
    const { page = 1, limit = 20, userId, managerId, status, priority, period, overdue } = filters;
    const skip = (page - 1) * limit;

    const where: any = {};
    if (userId)    where.userId    = userId;
    if (managerId) where.managerId = managerId;
    if (status)    where.status    = status;
    if (priority)  where.priority  = priority;
    if (period)    where.period    = period;
    if (overdue)   where.endDate   = { lt: new Date() };

    const [data, total] = await Promise.all([
      this.prisma.developmentPlan.findMany({
        where, skip, take: limit,
        include: {
          user:    { select: { id: true, fullName: true, avatarUrl: true, position: { select: { name: true } } } },
          manager: { select: { id: true, fullName: true, avatarUrl: true } },
          actions: { select: { id: true, status: true } },
          goals:   { select: { id: true, progress: true } },
          _count:  { select: { actions: true, goals: true, checkpoints: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.developmentPlan.count({ where }),
    ]);

    const enriched = data.map(p => {
      const actions   = p.actions as any[];
      const goals     = p.goals   as any[];
      const completed = actions.filter(a => a.status === 'COMPLETED').length;
      const total_a   = actions.length;
      const avgGoal   = goals.length > 0
        ? Math.round(goals.reduce((s: number, g: any) => s + g.progress, 0) / goals.length)
        : 0;
      return { ...p, actionProgress: total_a > 0 ? Math.round((completed / total_a) * 100) : 0, avgGoalProgress: avgGoal };
    });

    return { data: enriched, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async findOne(id: number) {
    const plan = await this.prisma.developmentPlan.findUnique({
      where: { id },
      include: {
        user:     { select: { id: true, fullName: true, email: true, avatarUrl: true, position: { select: { name: true, level: true } }, department: { select: { name: true } } } },
        manager:  { select: { id: true, fullName: true, avatarUrl: true } },
        actions:  {
          include: { evidence: true },
          orderBy: { seq: 'asc' },
        },
        goals:       { orderBy: { createdAt: 'asc' } },
        checkpoints: { orderBy: { scheduledAt: 'asc' } },
        approvals:   { orderBy: { createdAt: 'desc' }, take: 5 },
        certificates:{ select: { id: true, validationCode: true, issuedAt: true } },
        _count:      { select: { actions: true, goals: true, checkpoints: true } },
      },
    });
    if (!plan) throw new NotFoundException('Plano de desenvolvimento não encontrado');

    const actions   = plan.actions as any[];
    const completed = actions.filter(a => a.status === 'COMPLETED').length;
    const total_a   = actions.length;
    const goals     = plan.goals   as any[];
    const avgGoal   = goals.length > 0
      ? Math.round(goals.reduce((s: number, g: any) => s + g.progress, 0) / goals.length)
      : 0;

    return {
      ...plan,
      actionProgress:  total_a > 0 ? Math.round((completed / total_a) * 100) : 0,
      avgGoalProgress: avgGoal,
    };
  }

  async create(dto: CreateDevelopmentPlanDto) {
    const { focusCompetencyIds, ...data } = dto;

    const plan = await this.prisma.developmentPlan.create({
      data: {
        name:               data.name,
        goal:               data.goal,
        userId:             data.userId,
        managerId:          data.managerId,
        priority:           data.priority      ?? 'MEDIUM',
        period:             data.period,
        startDate:          data.startDate     ? new Date(data.startDate) : null,
        endDate:            data.endDate       ? new Date(data.endDate)   : null,
        performanceCycleId: data.performanceCycleId,
        isTemplate:         data.isTemplate    ?? false,
        notes:              data.notes,
        status:             'DRAFT',
      },
      include: {
        user:    { select: { id: true, fullName: true } },
        manager: { select: { id: true, fullName: true } },
      },
    });

    // Notificar colaborador
    await this.prisma.notificationLog.create({
      data: {
        userId:   data.userId,
        type:     'PDI_CREATED',
        message:  `Um novo Plano de Desenvolvimento foi criado para si: "${data.name}"`,
        metadata: JSON.stringify({ planId: plan.id }),
      },
    }).catch(() => {});

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
        endDate:   data.endDate   ? new Date(data.endDate)   : undefined,
      },
    });
  }

  async submitForApproval(id: number) {
    const plan = await this.findOne(id) as any;
    if (plan.status !== 'DRAFT') {
      throw new BadRequestException('Apenas planos em DRAFT podem ser submetidos');
    }
    return this.prisma.developmentPlan.update({
      where: { id },
      data:  { status: 'PENDING_APPROVAL' },
    });
  }

  async approvePlan(dto: ApprovePlanDto, approverId: number) {
    const plan = await this.findOne(dto.planId) as any;
    if (plan.status !== 'PENDING_APPROVAL') {
      throw new BadRequestException('Plano não está pendente de aprovação');
    }

    const newStatus = dto.decision === 'approve' ? 'ACTIVE' : 'DRAFT';

    await this.prisma.pdiApproval.create({
      data: {
        planId:     dto.planId,
        approverId,
        decision:   dto.decision.toUpperCase(),
        comment:    dto.comment,
      },
    });

    const updated = await this.prisma.developmentPlan.update({
      where: { id: dto.planId },
      data:  { status: newStatus, activatedAt: dto.decision === 'approve' ? new Date() : undefined },
    });

    // Notificar colaborador
    await this.prisma.notificationLog.create({
      data: {
        userId:   plan.userId,
        type:     dto.decision === 'approve' ? 'PDI_APPROVED' : 'PDI_REJECTED',
        message:  dto.decision === 'approve'
          ? `✅ O seu PDI "${plan.name}" foi aprovado!`
          : `⚠️ O seu PDI "${plan.name}" foi devolvido para revisão`,
        metadata: JSON.stringify({ planId: dto.planId, comment: dto.comment }),
      },
    }).catch(() => {});

    return updated;
  }

  async complete(id: number) {
    const plan = await this.findOne(id) as any;
    if (!['ACTIVE', 'PENDING_APPROVAL'].includes(plan.status)) {
      throw new BadRequestException('Apenas planos activos podem ser concluídos');
    }

    const updated = await this.prisma.developmentPlan.update({
      where: { id },
      data:  { status: 'COMPLETED', completedAt: new Date() },
    });

    // Certificado
    const code = `PDI-${Date.now()}-${id}`;
    await this.prisma.certificate.create({
      data: {
        type:             'DEVELOPMENT',
        userId:           plan.userId,
        developmentPlanId:id,
        validationCode:   code,
        fileUrl:          `/certificates/${code}.pdf`,
      },
    }).catch(() => {});

    // XP
    await this.prisma.userPoints.upsert({
      where:  { userId: plan.userId },
      create: { userId: plan.userId, points: 300 },
      update: { points: { increment: 300 } },
    }).catch(() => {});

    // Notificar
    await this.prisma.notificationLog.create({
      data: {
        userId:   plan.userId,
        type:     'PDI_COMPLETED',
        message:  `🎉 PDI "${plan.name}" concluído! +300 XP e certificado emitido.`,
        metadata: JSON.stringify({ planId: id, code }),
      },
    }).catch(() => {});

    return updated;
  }

  async cancel(id: number, reason?: string) {
    await this.findOne(id);
    return this.prisma.developmentPlan.update({
      where: { id },
      data:  { status: 'CANCELLED', cancelReason: reason },
    });
  }

  async remove(id: number) {
    const plan = await this.findOne(id) as any;
    if (plan.status === 'ACTIVE') {
      throw new ForbiddenException('Plano activo não pode ser eliminado. Cancele-o primeiro.');
    }
    await this.prisma.developmentPlan.delete({ where: { id } });
    return { message: 'Plano eliminado' };
  }

  // ─── ACÇÕES ───────────────────────────────────────────────────────────────

  async addAction(dto: CreatePlanActionDto) {
    const plan = await this.findOne(dto.planId) as any;
    if (plan.status === 'COMPLETED' || plan.status === 'CANCELLED') {
      throw new BadRequestException('Não é possível adicionar acções a um plano concluído ou cancelado');
    }

    const { competencyIds, ...data } = dto;

    return this.prisma.developmentPlanAction.create({
      data: {
        planId:       data.planId,
        title:        data.title,
        description:  data.description,
        type:         data.type,
        status:       data.status ?? 'TODO',
        courseId:     data.courseId,
        workloadHours:data.workloadHours,
        dueDate:      data.dueDate ? new Date(data.dueDate) : null,
        resources:    data.resources ?? [],
        xpReward:     data.xpReward ?? 20,
        seq:          data.seq ?? 0,
        mandatory:    data.mandatory ?? false,
        progress:     0,
      },
    });
  }

  async updateAction(actionId: number, dto: UpdatePlanActionDto, userId: number) {
    const action = await this.prisma.developmentPlanAction.findUnique({
      where:   { id: actionId },
      include: { plan: true },
    });
    if (!action) throw new NotFoundException('Acção não encontrada');

    const wasCompleted = action.status !== 'COMPLETED' && dto.status === 'COMPLETED';

    const updated = await this.prisma.developmentPlanAction.update({
      where: { id: actionId },
      data: {
        ...dto,
        dueDate:     dto.dueDate    ? new Date(dto.dueDate) : undefined,
        completedAt: dto.status === 'COMPLETED' ? new Date() : undefined,
        progress:    dto.status === 'COMPLETED' ? 100 : dto.progress,
      },
    });

    // XP ao completar
    if (wasCompleted) {
      const xp = (action as any).xpReward ?? 20;
      await this.prisma.userPoints.upsert({
        where:  { userId },
        create: { userId, points: xp },
        update: { points: { increment: xp } },
      }).catch(() => {});

      // Verificar se o plano está todo completo
      await this.recalcPlanProgress((action as any).planId);
    }

    return updated;
  }

  async removeAction(actionId: number) {
    const action = await this.prisma.developmentPlanAction.findUnique({ where: { id: actionId } });
    if (!action) throw new NotFoundException('Acção não encontrada');
    if (action.status === 'IN_PROGRESS') {
      throw new BadRequestException('Acção em progresso não pode ser removida');
    }
    await this.prisma.developmentPlanAction.delete({ where: { id: actionId } });
    return { message: 'Acção removida' };
  }

  // ─── EVIDÊNCIAS ───────────────────────────────────────────────────────────

  async addEvidence(userId: number, dto: AddEvidenceDto) {
    const action = await this.prisma.developmentPlanAction.findUnique({ where: { id: dto.actionId } });
    if (!action) throw new NotFoundException('Acção não encontrada');

    const evidence = await this.prisma.pdiEvidence.create({
      data: {
        actionId:     dto.actionId,
        submittedById:userId,
        title:        dto.title,
        url:          dto.url,
        notes:        dto.notes,
        evidenceType: dto.evidenceType ?? 'NOTE',
      },
    });

    // Auto-avançar para IN_PROGRESS se ainda em TODO
    if (action.status === 'TODO') {
      await this.prisma.developmentPlanAction.update({
        where: { id: dto.actionId },
        data:  { status: 'IN_PROGRESS', progress: 10 },
      });
    }

    return evidence;
  }

  // ─── METAS ────────────────────────────────────────────────────────────────

  async addGoal(dto: CreatePlanGoalDto) {
    await this.findOne(dto.planId);
    return this.prisma.pdiGoal.create({ data: dto });
  }

  async updateGoalProgress(userId: number, dto: UpdatePlanGoalProgressDto) {
    const goal = await this.prisma.pdiGoal.findUnique({ where: { id: dto.goalId } });
    if (!goal) throw new NotFoundException('Meta não encontrada');

    const updated = await this.prisma.pdiGoal.update({
      where: { id: dto.goalId },
      data: {
        progress:     dto.progress,
        completedAt:  dto.progress >= 100 ? new Date() : undefined,
        notes:        dto.notes,
      },
    });

    await this.recalcPlanProgress((goal as any).planId);
    return updated;
  }

  // ─── CHECKPOINTS ──────────────────────────────────────────────────────────

  async addCheckpoint(dto: CreateCheckpointDto) {
    await this.findOne(dto.planId);
    return this.prisma.pdiCheckpoint.create({
      data: {
        planId:      dto.planId,
        title:       dto.title,
        description: dto.description,
        scheduledAt: new Date(dto.scheduledAt),
        type:        dto.type ?? 'QUICK',
        status:      'PENDING',
      },
    });
  }

  async completeCheckpoint(dto: CompleteCheckpointDto) {
    const cp = await this.prisma.pdiCheckpoint.findUnique({ where: { id: dto.checkpointId } });
    if (!cp) throw new NotFoundException('Checkpoint não encontrado');
    return this.prisma.pdiCheckpoint.update({
      where: { id: dto.checkpointId },
      data: {
        status:      'COMPLETED',
        completedAt: new Date(),
        notes:       dto.notes,
        selfScore:   dto.selfScore,
      },
    });
  }

  // ─── PROGRESSO ────────────────────────────────────────────────────────────

  private async recalcPlanProgress(planId: number) {
    const [actions, goals] = await Promise.all([
      this.prisma.developmentPlanAction.findMany({ where: { planId }, select: { status: true, mandatory: true } }),
      this.prisma.pdiGoal.findMany({ where: { planId }, select: { progress: true } }),
    ]);

    const totalActions    = actions.length;
    const completedActions= actions.filter(a => a.status === 'COMPLETED').length;
    const actionPct       = totalActions > 0 ? Math.round((completedActions / totalActions) * 100) : 0;

    const avgGoal         = goals.length > 0
      ? Math.round(goals.reduce((s: number, g: any) => s + g.progress, 0) / goals.length)
      : 0;

    const overallProgress = Math.round((actionPct + avgGoal) / 2);

    await this.prisma.developmentPlan.update({
      where: { id: planId },
      data:  { overallProgress },
    });
  }

  // ─── DASHBOARD & ANALYTICS ────────────────────────────────────────────────

  async getMyPlans(userId: number) {
    const plans = await this.prisma.developmentPlan.findMany({
      where:   { userId },
      include: {
        actions:     { select: { status: true, dueDate: true } },
        goals:       { select: { progress: true } },
        checkpoints: { where: { status: 'PENDING', scheduledAt: { gte: new Date() } }, orderBy: { scheduledAt: 'asc' }, take: 1 },
        certificates:{ select: { validationCode: true, issuedAt: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return plans.map(p => {
      const actions   = p.actions   as any[];
      const goals     = p.goals     as any[];
      const completed = actions.filter(a => a.status === 'COMPLETED').length;
      const overdue   = actions.filter(a => a.dueDate && new Date(a.dueDate) < new Date() && a.status !== 'COMPLETED').length;

      return {
        ...p,
        actionProgress:  actions.length > 0 ? Math.round((completed / actions.length) * 100) : 0,
        avgGoalProgress: goals.length > 0 ? Math.round(goals.reduce((s: number, g: any) => s + g.progress, 0) / goals.length) : 0,
        overdueActions:  overdue,
      };
    });
  }

  async getStats(userId: number) {
    const [total, active, completed, cancelled] = await Promise.all([
      this.prisma.developmentPlan.count({ where: { userId } }),
      this.prisma.developmentPlan.count({ where: { userId, status: 'ACTIVE' } }),
      this.prisma.developmentPlan.count({ where: { userId, status: 'COMPLETED' } }),
      this.prisma.developmentPlan.count({ where: { userId, status: 'CANCELLED' } }),
    ]);

    const actionStats = await this.prisma.developmentPlanAction.groupBy({
      by:    ['status'],
      where: { plan: { userId } },
      _count:true,
    });

    const totalXp = await this.prisma.userPoints.findUnique({
      where:  { userId },
      select: { points: true },
    });

    return {
      plans:    { total, active, completed, cancelled },
      actions: Object.fromEntries(actionStats.map((s: any) => [s.status, s._count])),
      completionRate: total > 0 ? Math.round((completed / total) * 100) : 0,
      totalXp:  totalXp?.points ?? 0,
    };
  }

  async getTeamDashboard(managerId: number) {
    const plans = await this.prisma.developmentPlan.findMany({
      where:   { managerId, status: { in: ['ACTIVE', 'PENDING_APPROVAL'] } },
      include: {
        user:    { select: { id: true, fullName: true, avatarUrl: true, position: { select: { name: true } } } },
        actions: { select: { status: true, dueDate: true, mandatory: true } },
        goals:   { select: { progress: true } },
      },
      orderBy: { endDate: 'asc' },
    });

    return plans.map(p => {
      const actions   = p.actions   as any[];
      const goals     = p.goals     as any[];
      const completed = actions.filter(a => a.status === 'COMPLETED').length;
      const overdue   = actions.filter(a => a.dueDate && new Date(a.dueDate) < new Date() && a.status !== 'COMPLETED').length;

      return {
        id:     p.id, name: p.name, status: p.status, user: p.user,
        endDate:p.endDate,
        progress: actions.length > 0 ? Math.round((completed / actions.length) * 100) : 0,
        avgGoal:  goals.length > 0   ? Math.round(goals.reduce((s: number, g: any) => s + g.progress, 0) / goals.length) : 0,
        overdueActions: overdue,
        pendingApproval: p.status === 'PENDING_APPROVAL',
      };
    });
  }
}
