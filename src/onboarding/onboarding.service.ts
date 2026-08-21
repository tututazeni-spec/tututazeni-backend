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
  CreateOnboardingTemplateDto,
  UpdateOnboardingTemplateDto,
  CreateTemplateTaskDto,
  UpdateTemplateTaskDto,
  CreateOnboardingPlanDto,
  CompleteTaskDto,
  SkipTaskDto,
  ApproveTaskDto,
  UploadDocumentDto,
  ValidateDocumentDto,
  SubmitOnboardingSurveyDto,
  OnboardingFilterDto,
} from './onboarding.dto';
import { assertCanAccess } from '../common/authz/ownership';
import { Role } from '../auth/enums/role.enum';
import type { CurrentUserData } from '../common/types/current-user';
import { calculatePagination, buildPaginatedResponse } from '../common/helpers/pagination.helper';

@Injectable()
export class OnboardingService {
  private readonly logger = new Logger(OnboardingService.name);

  constructor(private prisma: PrismaService) {}

  // ─── TEMPLATES ────────────────────────────────────────────────────────────

  async findAllTemplates() {
    return this.prisma.read.onboardingTemplate.findMany({
      include: {
        position: { select: { id: true, name: true } },
        department: { select: { id: true, name: true } },
        tasks: { orderBy: { seq: 'asc' } },
        _count: { select: { plans: true, tasks: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOneTemplate(id: number) {
    const t = await this.prisma.read.onboardingTemplate.findUnique({
      where: { id },
      include: {
        tasks: { orderBy: { seq: 'asc' } },
        _count: { select: { plans: true } },
      },
    });
    if (!t) throw new NotFoundException('Template não encontrado');
    return t;
  }

  async createTemplate(dto: CreateOnboardingTemplateDto) {
    return this.prisma.onboardingTemplate.create({ data: dto });
  }

  async updateTemplate(id: number, dto: UpdateOnboardingTemplateDto) {
    await this.findOneTemplate(id);
    return this.prisma.onboardingTemplate.update({ where: { id }, data: dto });
  }

  async deleteTemplate(id: number) {
    const t = await this.prisma.read.onboardingTemplate.findUnique({
      where: { id },
      include: { _count: { select: { plans: true } } },
    });
    if (!t) throw new NotFoundException('Template não encontrado');
    if (t._count.plans > 0) {
      throw new ForbiddenException('Template em uso em planos activos. Archive-o primeiro.');
    }
    await this.prisma.onboardingTemplate.delete({ where: { id } });
    return { message: 'Template eliminado' };
  }

  // ─── TEMPLATE TASKS ───────────────────────────────────────────────────────

  async addTemplateTask(dto: CreateTemplateTaskDto) {
    await this.findOneTemplate(dto.templateId);
    return this.prisma.onboardingTemplateTask.create({ data: dto });
  }

  async updateTemplateTask(taskId: number, dto: UpdateTemplateTaskDto) {
    const task = await this.prisma.read.onboardingTemplateTask.findUnique({
      where: { id: taskId },
    });
    if (!task) throw new NotFoundException('Tarefa do template não encontrada');
    return this.prisma.onboardingTemplateTask.update({ where: { id: taskId }, data: dto });
  }

  async deleteTemplateTask(taskId: number) {
    await this.prisma.onboardingTemplateTask.delete({ where: { id: taskId } });
    return { message: 'Tarefa removida' };
  }

  // ─── PLANOS ───────────────────────────────────────────────────────────────

  async findAll(filters: OnboardingFilterDto) {
    const { page = 1, limit = 20, status, departmentId, templateId } = filters;
    const { skip, take } = calculatePagination(page, limit);

    const where: Prisma.OnboardingPlanWhereInput = {};
    if (status) where.status = status;
    if (templateId) where.templateId = templateId;
    if (departmentId) where.user = { departmentId };

    const [data, total] = await Promise.all([
      this.prisma.read.onboardingPlan.findMany({
        where,
        skip,
        take,
        include: {
          user: {
            select: {
              id: true,
              fullName: true,
              email: true,
              avatarUrl: true,
              position: { select: { name: true } },
            },
          },
          template: { select: { id: true, name: true, durationDays: true } },
          buddy: { select: { id: true, fullName: true, avatarUrl: true } },
          hrResponsible: { select: { id: true, fullName: true } },
          _count: { select: { taskInstances: true, documents: true } },
        },
        orderBy: { startDate: 'desc' },
      }),
      this.prisma.read.onboardingPlan.count({ where }),
    ]);

    return buildPaginatedResponse(data, total, page, limit);
  }

  async findByUser(userId: number) {
    return this.prisma.read.onboardingPlan.findMany({
      where: { userId },
      include: {
        template: { select: { id: true, name: true, durationDays: true, welcomeVideoUrl: true } },
        buddy: {
          select: {
            id: true,
            fullName: true,
            avatarUrl: true,
            position: { select: { name: true } },
          },
        },
        manager: {
          select: {
            id: true,
            fullName: true,
            avatarUrl: true,
            position: { select: { name: true } },
          },
        },
        hrResponsible: { select: { id: true, fullName: true, avatarUrl: true } },
        taskInstances: {
          include: { templateTask: true },
          orderBy: { templateTask: { seq: 'asc' } },
        },
        documents: true,
        surveys: { orderBy: { createdAt: 'desc' } },
      },
      orderBy: { startDate: 'desc' },
    });
  }

  async findOne(id: number, user?: CurrentUserData) {
    const plan = await this.prisma.read.onboardingPlan.findUnique({
      where: { id },
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
        template: { include: { tasks: { orderBy: { seq: 'asc' } } } },
        buddy: {
          select: {
            id: true,
            fullName: true,
            avatarUrl: true,
            position: { select: { name: true } },
          },
        },
        manager: { select: { id: true, fullName: true, avatarUrl: true } },
        hrResponsible: { select: { id: true, fullName: true, avatarUrl: true } },
        taskInstances: {
          include: { templateTask: true, approvedBy: { select: { id: true, fullName: true } } },
          orderBy: { templateTask: { seq: 'asc' } },
        },
        documents: true,
        surveys: true,
      },
    });

    // Ownership (A3): dono do plano OU ADMIN/RH/GESTOR; senão 404.
    // Quando chamado sem user (contexto interno de confiança), não filtra.
    if (user) assertCanAccess(plan, plan?.userId, user, [Role.ADMIN, Role.RH, Role.GESTOR]);
    else if (!plan) throw new NotFoundException('Plano de onboarding não encontrado');

    // Calcular progresso
    const tasks = plan.taskInstances;
    const completed = tasks.filter(t => t.status === 'COMPLETED').length;
    const total = tasks.length;
    const progress = total > 0 ? Math.round((completed / total) * 100) : 0;

    // Agrupar tarefas por fase e categoria
    // FIX: `(t.templateTask as any).phase` era desnecessário — `templateTask`
    // já vem tipado do `include` acima, `phase` é uma coluna real.
    const byPhase: Record<string, (typeof tasks)[number][]> = {};
    for (const t of tasks) {
      const phase = t.templateTask.phase;
      if (!byPhase[phase]) byPhase[phase] = [];
      byPhase[phase].push(t);
    }

    return { ...plan, progress, completedTasks: completed, totalTasks: total, byPhase };
  }

  async create(dto: CreateOnboardingPlanDto) {
    // FIX: `as any` desnecessário — findOneTemplate() já devolve
    // OnboardingTemplate totalmente tipado (incl. `tasks`).
    const template = await this.findOneTemplate(dto.templateId);

    // Verificar se já existe plano activo para este utilizador
    const existing = await this.prisma.onboardingPlan.findFirst({
      where: { userId: dto.userId, status: { in: ['NOT_STARTED', 'IN_PROGRESS'] } },
    });
    if (existing) throw new ConflictException('Utilizador já tem um plano de onboarding activo');

    const startDate = dto.startDate ? new Date(dto.startDate) : new Date();

    const plan = await this.prisma.onboardingPlan.create({
      data: {
        userId: dto.userId,
        templateId: dto.templateId,
        startDate,
        expectedEndDate: new Date(startDate.getTime() + template.durationDays * 24 * 3600 * 1000),
        buddyId: dto.buddyId,
        managerId: dto.managerId ?? null,
        hrResponsibleId: dto.hrResponsibleId,
        status: 'NOT_STARTED',
        xpEarned: 0,
      },
    });

    // Criar instâncias de cada tarefa do template
    if (template.tasks.length > 0) {
      await this.prisma.onboardingTaskInstance.createMany({
        data: template.tasks.map(task => ({
          planId: plan.id,
          templateTaskId: task.id,
          status: 'PENDING',
          dueDate: task.dueDayOffset
            ? new Date(startDate.getTime() + task.dueDayOffset * 24 * 3600 * 1000)
            : null,
        })),
      });
    }

    // Notificar o colaborador
    await this.prisma.notificationLog
      .create({
        data: {
          userId: dto.userId,
          type: 'ONBOARDING_STARTED',
          message: `O seu plano de onboarding "${template.name}" foi iniciado. Bem-vindo(a)!`,
          metadata: JSON.stringify({}),
        },
      })
      .catch(e => {
        this.logger.warn({
          userId: dto.userId,
          action: 'ONBOARDING_STARTED',
          planId: plan.id,
          err: { message: e instanceof Error ? e.message : String(e) },
          msg: 'Falha ao criar notificação de início de onboarding',
        });
      });

    // Notificar buddy
    if (dto.buddyId) {
      await this.prisma.notificationLog
        .create({
          data: {
            userId: dto.buddyId,
            type: 'ONBOARDING_BUDDY_ASSIGNED',
            message: `Você foi atribuído como buddy de um novo colaborador`,
            metadata: JSON.stringify({}),
          },
        })
        .catch(e => {
          this.logger.warn({
            userId: dto.buddyId,
            action: 'ONBOARDING_BUDDY_ASSIGNED',
            planId: plan.id,
            err: { message: e instanceof Error ? e.message : String(e) },
            msg: 'Falha ao criar notificação de atribuição de buddy',
          });
        });
    }

    return this.findOne(plan.id);
  }

  async createFromTemplate(userId: number, positionId?: number, departmentId?: number) {
    // Encontrar o template mais adequado
    const template = await this.prisma.read.onboardingTemplate.findFirst({
      where: {
        active: true,
        OR: [
          { positionId },
          { departmentId },
          { positionId: null, departmentId: null }, // template genérico
        ],
      },
      orderBy: [
        { positionId: positionId ? 'asc' : 'desc' },
        { departmentId: departmentId ? 'asc' : 'desc' },
      ],
    });

    if (!template) throw new NotFoundException('Nenhum template de onboarding configurado');

    const user = await this.prisma.read.user.findUnique({
      where: { id: userId },
      select: { managerId: true },
    });

    return this.create({
      userId,
      templateId: template.id,
      managerId: user?.managerId ?? undefined,
    });
  }

  // ─── TAREFAS ──────────────────────────────────────────────────────────────

  async completeTask(dto: CompleteTaskDto, userId: number) {
    const instance = await this.prisma.read.onboardingTaskInstance.findUnique({
      where: { id: dto.taskInstanceId },
      include: { templateTask: true, plan: true },
    });
    if (!instance) throw new NotFoundException('Tarefa não encontrada');
    // FIX: todos os casts `as any` deste método eram desnecessários —
    // `instance.plan`/`instance.templateTask` já vêm totalmente tipados do
    // `include` acima (userId/planId/dependsOn/requiresApproval/xpReward
    // são campos reais).
    if (instance.plan.userId !== userId) throw new ForbiddenException('Sem permissão');
    if (instance.status === 'COMPLETED') throw new ConflictException('Tarefa já concluída');
    if (instance.status === 'BLOCKED')
      throw new BadRequestException('Tarefa bloqueada por dependências');

    // Verificar dependências
    const dependencies = instance.templateTask.dependsOn ?? [];
    if (dependencies.length > 0) {
      const blockers = await this.prisma.read.onboardingTaskInstance.findMany({
        where: {
          planId: instance.planId,
          templateTaskId: { in: dependencies },
          status: { not: 'COMPLETED' },
        },
      });
      if (blockers.length > 0) {
        throw new BadRequestException('Complete primeiro as tarefas dependentes');
      }
    }

    const needsApproval = instance.templateTask.requiresApproval;

    await this.prisma.onboardingTaskInstance.update({
      where: { id: dto.taskInstanceId },
      data: {
        status: needsApproval ? 'IN_PROGRESS' : 'COMPLETED',
        completedAt: needsApproval ? null : new Date(),
        evidenceComment: dto.evidenceComment,
        evidenceUrl: dto.evidenceUrl,
      },
    });

    if (!needsApproval) {
      // Atribuir XP
      const xp = instance.templateTask.xpReward ?? 0;
      if (xp > 0) {
        await this.prisma.onboardingPlan.update({
          where: { id: instance.planId },
          data: { xpEarned: { increment: xp } },
        });
        await this.prisma.userPoints
          .upsert({
            where: { userId },
            create: { userId, points: xp },
            update: { points: { increment: xp } },
          })
          .catch(e => {
            this.logger.warn({
              userId,
              action: 'completeTask.awardXp',
              taskInstanceId: dto.taskInstanceId,
              xp,
              err: { message: e instanceof Error ? e.message : String(e) },
              msg: 'Falha ao atribuir XP por conclusão de tarefa de onboarding',
            });
          });
      }

      // Verificar se o plano está 100% concluído
      await this.checkPlanCompletion(instance.planId);
    }

    return { completed: !needsApproval, pendingApproval: needsApproval };
  }

  async skipTask(dto: SkipTaskDto, approverId: number) {
    const instance = await this.prisma.read.onboardingTaskInstance.findUnique({
      where: { id: dto.taskInstanceId },
    });
    if (!instance) throw new NotFoundException('Tarefa não encontrada');

    return this.prisma.onboardingTaskInstance.update({
      where: { id: dto.taskInstanceId },
      data: {
        status: 'SKIPPED',
        skipReason: dto.reason,
        approvedById: approverId,
      },
    });
  }

  async approveTask(dto: ApproveTaskDto, approverId: number) {
    const instance = await this.prisma.read.onboardingTaskInstance.findUnique({
      where: { id: dto.taskInstanceId },
      include: { templateTask: true, plan: true },
    });
    if (!instance) throw new NotFoundException('Tarefa não encontrada');

    const newStatus = dto.decision === 'approve' ? 'COMPLETED' : 'PENDING';

    await this.prisma.onboardingTaskInstance.update({
      where: { id: dto.taskInstanceId },
      data: {
        status: newStatus,
        approvedById: approverId,
        approvedAt: new Date(),
        approvalNote: dto.comment,
        completedAt: dto.decision === 'approve' ? new Date() : null,
      },
    });

    if (dto.decision === 'approve') {
      // FIX: casts `as any` desnecessários — `templateTask`/`plan` já vêm
      // tipados do `include` acima.
      const xp = instance.templateTask.xpReward ?? 0;
      if (xp > 0) {
        await this.prisma.userPoints
          .upsert({
            where: { userId: instance.plan.userId },
            create: { userId: instance.plan.userId, points: xp },
            update: { points: { increment: xp } },
          })
          .catch(e => {
            this.logger.warn({
              userId: instance.plan.userId,
              action: 'approveTask.awardXp',
              taskInstanceId: dto.taskInstanceId,
              xp,
              err: { message: e instanceof Error ? e.message : String(e) },
              msg: 'Falha ao atribuir XP por aprovação de tarefa de onboarding',
            });
          });
      }
      await this.checkPlanCompletion(instance.planId);
    }

    return { decision: dto.decision, taskId: dto.taskInstanceId };
  }

  private async checkPlanCompletion(planId: number) {
    const [total, completed] = await Promise.all([
      this.prisma.read.onboardingTaskInstance.count({ where: { planId } }),
      this.prisma.read.onboardingTaskInstance.count({
        where: { planId, status: { in: ['COMPLETED', 'SKIPPED'] } },
      }),
    ]);

    if (total > 0 && completed >= total) {
      await this.prisma.onboardingPlan.update({
        where: { id: planId },
        data: { status: 'COMPLETED', completedAt: new Date() },
      });

      const plan = await this.prisma.read.onboardingPlan.findUnique({
        where: { id: planId },
        select: { userId: true, template: { select: { name: true } } },
      });

      // Badge e notificação
      await this.prisma.userPoints
        .upsert({
          where: { userId: plan.userId },
          create: { userId: plan.userId, points: 500 },
          update: { points: { increment: 500 } },
        })
        .catch(e => {
          this.logger.warn({
            userId: plan.userId,
            action: 'checkPlanCompletion.awardXp',
            planId,
            err: { message: e instanceof Error ? e.message : String(e) },
            msg: 'Falha ao atribuir XP por conclusão de onboarding',
          });
        });

      await this.prisma.notificationLog
        .create({
          data: {
            userId: plan.userId,
            type: 'ONBOARDING_COMPLETED',
            // FIX: `as any` desnecessário — `plan.template` já vem tipado do
            // `select` acima (relação obrigatória, nunca null).
            message: `🎉 Parabéns! Concluíste o onboarding "${plan.template.name}"`,
            metadata: JSON.stringify({}),
          },
        })
        .catch(e => {
          this.logger.warn({
            userId: plan.userId,
            action: 'ONBOARDING_COMPLETED',
            planId,
            err: { message: e instanceof Error ? e.message : String(e) },
            msg: 'Falha ao criar notificação de conclusão de onboarding',
          });
        });

      this.logger.log(`Onboarding ${planId} concluído — utilizador ${plan.userId}`);
    } else {
      // Actualizar para IN_PROGRESS se começou
      await this.prisma.onboardingPlan.updateMany({
        where: { id: planId, status: 'NOT_STARTED' },
        data: { status: 'IN_PROGRESS' },
      });
    }
  }

  // ─── DOCUMENTOS ───────────────────────────────────────────────────────────

  async uploadDocument(userId: number, dto: UploadDocumentDto) {
    const plan = await this.prisma.read.onboardingPlan.findFirst({
      where: { id: dto.planId, userId },
    });
    if (!plan) throw new NotFoundException('Plano não encontrado');

    return this.prisma.onboardingDocument.create({
      data: {
        planId: dto.planId,
        documentType: dto.documentType,
        fileUrl: dto.fileUrl,
        notes: dto.notes,
        status: 'PENDING',
        uploadedById: userId,
      },
    });
  }

  async validateDocument(dto: ValidateDocumentDto, validatorId: number) {
    const doc = await this.prisma.read.onboardingDocument.findUnique({
      where: { id: dto.documentId },
    });
    if (!doc) throw new NotFoundException('Documento não encontrado');

    return this.prisma.onboardingDocument.update({
      where: { id: dto.documentId },
      data: {
        status: dto.status,
        validatedById: validatorId,
        validatedAt: new Date(),
        rejectionReason: dto.rejectionReason,
      },
    });
  }

  // ─── PESQUISAS ────────────────────────────────────────────────────────────

  async submitSurvey(userId: number, dto: SubmitOnboardingSurveyDto) {
    const plan = await this.prisma.read.onboardingPlan.findFirst({
      where: { id: dto.planId, userId },
    });
    if (!plan) throw new NotFoundException('Plano não encontrado');

    const existing = await this.prisma.onboardingSurvey.findFirst({
      where: { planId: dto.planId, milestone: dto.milestone },
    });
    if (existing) throw new ConflictException(`Pesquisa do ${dto.milestone} já submetida`);

    return this.prisma.onboardingSurvey.create({
      data: {
        planId: dto.planId,
        milestone: dto.milestone,
        score: dto.score,
        enps: dto.enps,
        comment: dto.comment,
      },
    });
  }

  // ─── DASHBOARD ────────────────────────────────────────────────────────────

  async getDashboard(managerId?: number) {
    const where: Prisma.OnboardingPlanWhereInput = {};
    if (managerId) where.managerId = managerId;

    const [totalPlans, byStatus, activeWithProgress, overdueTasks, avgSurveyScore] =
      await Promise.all([
        this.prisma.read.onboardingPlan.count({ where }),
        this.prisma.read.onboardingPlan.groupBy({
          by: ['status'],
          where,
          _count: true,
        }),
        this.prisma.read.onboardingPlan.findMany({
          where: { ...where, status: { in: ['NOT_STARTED', 'IN_PROGRESS'] } },
          include: {
            user: {
              select: {
                id: true,
                fullName: true,
                avatarUrl: true,
                department: { select: { name: true } },
              },
            },
            template: { select: { name: true, durationDays: true } },
            taskInstances: { select: { status: true } },
          },
          orderBy: { startDate: 'asc' },
          take: 20,
        }),
        this.prisma.read.onboardingTaskInstance.count({
          where: {
            plan: where,
            status: { not: 'COMPLETED' },
            dueDate: { lt: new Date() },
          },
        }),
        this.prisma.read.onboardingSurvey.aggregate({ _avg: { score: true } }),
      ]);

    const activeWithMetrics = activeWithProgress.map(plan => {
      const tasks = plan.taskInstances;
      const completed = tasks.filter(t => t.status === 'COMPLETED').length;
      const total = tasks.length;
      const progress = total > 0 ? Math.round((completed / total) * 100) : 0;
      const daysIn = plan.startDate
        ? Math.floor((Date.now() - new Date(plan.startDate).getTime()) / (1000 * 60 * 60 * 24))
        : 0;
      return { ...plan, progress, completedTasks: completed, totalTasks: total, daysIn };
    });

    return {
      summary: {
        total: totalPlans,
        byStatus: Object.fromEntries(byStatus.map(s => [s.status, s._count])),
        overdueTasks,
        avgSurveyScore: Math.round((avgSurveyScore._avg.score ?? 0) * 10) / 10,
      },
      active: activeWithMetrics,
    };
  }

  async remove(id: number) {
    await this.findOne(id);
    await this.prisma.onboardingPlan.delete({ where: { id } });
    return { message: 'Plano de onboarding removido' };
  }
}
