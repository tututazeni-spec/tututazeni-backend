import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { Prisma, EvalType, EvalPurpose, EvalStage } from '@prisma/client';
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
  TriggerIntegrationEvaluationDto,
  OnboardingTaskFilterDto,
  OnboardingDocumentFilterDto,
  OnboardingTrainingFilterDto,
  CreateOnboardingCheckinDto,
  RegisterOnboardingCheckinDto,
  SubmitCheckinEmployeeFeedbackDto,
  OnboardingCheckinFilterDto,
  OnboardingReportFilterDto,
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
        unit: { select: { id: true, name: true } },
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

  // "Etapas" (docs/onboarding.md ponto 4) — sem modelo próprio: agrupa as
  // tarefas do template por fase e deriva duração/responsável/critérios de
  // conclusão a partir delas, em vez de duplicar configuração que já vive
  // na Estrutura do template.
  async getTemplateStages(id: number) {
    const template = await this.findOneTemplate(id);

    const byPhase = new Map<string, typeof template.tasks>();
    for (const task of template.tasks) {
      const list = byPhase.get(task.phase) ?? [];
      list.push(task);
      byPhase.set(task.phase, list);
    }

    const mostCommon = <T extends string>(values: T[]): T | null => {
      if (values.length === 0) return null;
      const counts = new Map<T, number>();
      for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
      return [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
    };

    return [...byPhase.entries()].map(([phase, tasks]) => {
      const offsets = tasks.map(t => t.dueDayOffset).filter((n): n is number => n != null);
      return {
        phase,
        tasks,
        taskCount: tasks.length,
        mandatoryCount: tasks.filter(t => t.isMandatory).length,
        minDayOffset: offsets.length > 0 ? Math.min(...offsets) : null,
        maxDayOffset: offsets.length > 0 ? Math.max(...offsets) : null,
        responsible: mostCommon(tasks.map(t => t.responsible)),
      };
    });
  }

  async createTemplate(dto: CreateOnboardingTemplateDto) {
    const { tasks, ...templateData } = dto;
    return this.prisma.onboardingTemplate.create({
      data: {
        ...templateData,
        // Estrutura (tarefas) criada atomicamente com o template quando
        // enviada no mesmo pedido — permite a ADMIN/GESTOR/RH/DIRECTOR/LIDER
        // criar o plano de integração já com Tarefas, Formação obrigatória,
        // Documentos, etc., sem depender de POST /onboarding/templates/tasks
        // (esse continua restrito a ADMIN/RH para edição posterior).
        ...(tasks && tasks.length > 0 ? { tasks: { create: tasks } } : {}),
      },
      include: { tasks: { orderBy: { seq: 'asc' } } },
    });
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
    const {
      page = 1,
      limit = 20,
      status,
      departmentId,
      templateId,
      unitId,
      positionId,
      responsibleId,
      from,
      to,
      minProgress,
      maxProgress,
    } = filters;
    const { skip, take } = calculatePagination(page, limit);

    const where: Prisma.OnboardingPlanWhereInput = {};
    if (status) where.status = status;
    if (templateId) where.templateId = templateId;
    const userWhere: Prisma.UserWhereInput = {};
    if (departmentId) userWhere.departmentId = departmentId;
    if (positionId) userWhere.positionId = positionId;
    if (unitId) userWhere.unitId = unitId;
    if (Object.keys(userWhere).length > 0) where.user = userWhere;
    if (responsibleId) {
      where.OR = [
        { managerId: responsibleId },
        { hrResponsibleId: responsibleId },
        { buddyId: responsibleId },
      ];
    }
    if (from || to) {
      where.startDate = {
        ...(from ? { gte: new Date(from) } : {}),
        ...(to ? { lte: new Date(to) } : {}),
      };
    }
    if (minProgress !== undefined || maxProgress !== undefined) {
      where.progress = {
        ...(minProgress !== undefined ? { gte: minProgress } : {}),
        ...(maxProgress !== undefined ? { lte: maxProgress } : {}),
      };
    }

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
              employeeNumber: true,
              position: { select: { name: true } },
              department: { select: { id: true, name: true } },
            },
          },
          template: { select: { id: true, name: true, durationDays: true } },
          buddy: { select: { id: true, fullName: true, avatarUrl: true } },
          manager: { select: { id: true, fullName: true, avatarUrl: true } },
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
            email: true,
            avatarUrl: true,
            position: { select: { name: true } },
          },
        },
        manager: {
          select: {
            id: true,
            fullName: true,
            email: true,
            avatarUrl: true,
            position: { select: { name: true } },
          },
        },
        hrResponsible: {
          select: { id: true, fullName: true, email: true, avatarUrl: true },
        },
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
            email: true,
            avatarUrl: true,
            position: { select: { name: true } },
          },
        },
        manager: {
          select: { id: true, fullName: true, email: true, avatarUrl: true },
        },
        hrResponsible: {
          select: { id: true, fullName: true, email: true, avatarUrl: true },
        },
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

    // Seed dos check-ins de Acompanhamento (docs/onboarding.md ponto 8) —
    // mesmos marcos dos milestones das pesquisas, responsável = gestor
    // atribuído (se houver; RH/ADMIN preenchem os que ficarem sem gestor).
    const CHECKIN_OFFSETS: Record<string, number> = {
      DAY_1: 1,
      WEEK_1: 7,
      DAY_30: 30,
      DAY_60: 60,
      DAY_90: 90,
    };
    await this.prisma.onboardingCheckin.createMany({
      data: Object.entries(CHECKIN_OFFSETS).map(([type, offset]) => ({
        planId: plan.id,
        type: type as Prisma.OnboardingCheckinCreateManyInput['type'],
        dueDate: new Date(startDate.getTime() + offset * 24 * 3600 * 1000),
        responsibleId: dto.managerId ?? null,
      })),
    });

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

    const skipped = await this.prisma.onboardingTaskInstance.update({
      where: { id: dto.taskInstanceId },
      data: {
        status: 'SKIPPED',
        skipReason: dto.reason,
        approvedById: approverId,
      },
    });

    // FIX: skip nunca recalculava progresso/conclusão do plano — uma tarefa
    // saltada conta como resolvida para efeitos de progresso, tal como
    // completeTask/approveTask já fazem.
    await this.checkPlanCompletion(instance.planId);

    return skipped;
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

    // Progresso guardado (não só computado em findOne/findAll) — necessário
    // para filtrar/ordenar por progresso em GET /onboarding (secção 2 do
    // spec, ver docs/onboarding.md).
    const progress = total > 0 ? Math.round((completed / total) * 100) : 0;
    await this.prisma.onboardingPlan.update({
      where: { id: planId },
      data: { progress },
    });

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

  // ─── TAREFAS (transversal) ──────────────────────────────────────────────────

  // "Tarefas" (docs/onboarding.md ponto 5) — vista transversal a todos os
  // onboardings (a diferença de findOne, que só vê as tarefas de um plano).
  // "Prioridade" é derivada (atrasada+obrigatória → Alta, obrigatória →
  // Média, resto → Baixa), não é um campo guardado.
  async findAllTasks(filters: OnboardingTaskFilterDto) {
    const { page = 1, limit = 20, status, phase, category, responsible, planId, overdue } = filters;
    const { skip, take } = calculatePagination(page, limit);
    const now = new Date();

    const where: Prisma.OnboardingTaskInstanceWhereInput = {};
    if (planId) where.planId = planId;
    if (overdue) {
      where.status = { not: 'COMPLETED' };
      where.dueDate = { lt: now };
    } else if (status) {
      where.status = status;
    }
    const templateTaskWhere: Prisma.OnboardingTemplateTaskWhereInput = {};
    if (phase) templateTaskWhere.phase = phase;
    if (category) templateTaskWhere.category = category;
    if (responsible) templateTaskWhere.responsible = responsible;
    if (Object.keys(templateTaskWhere).length > 0) where.templateTask = templateTaskWhere;

    const [data, total] = await Promise.all([
      this.prisma.read.onboardingTaskInstance.findMany({
        where,
        skip,
        take,
        include: {
          templateTask: true,
          plan: {
            select: {
              id: true,
              user: { select: { id: true, fullName: true, avatarUrl: true } },
            },
          },
        },
        orderBy: { dueDate: 'asc' },
      }),
      this.prisma.read.onboardingTaskInstance.count({ where }),
    ]);

    const withPriority = data.map(t => {
      const lateAndOpen = !!t.dueDate && t.dueDate < now && t.status !== 'COMPLETED';
      const priority = lateAndOpen ? 'HIGH' : t.templateTask.isMandatory ? 'MEDIUM' : 'LOW';
      return { ...t, priority };
    });

    return buildPaginatedResponse(withPriority, total, page, limit);
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

  // "Documentos" (docs/onboarding.md ponto 6) — vista transversal. O schema
  // não liga OnboardingDocument a uma OnboardingTemplateTask concreta
  // (documentType é texto livre) — por isso devolvemos dois grupos
  // distintos em vez de fingir um único estado "Pendente" preciso:
  // `submitted` (OnboardingDocument reais, qualquer estado) e
  // `pendingSubmission` (tarefas de categoria DOCUMENTS ainda não
  // concluídas — nada foi submetido para elas). Ver decisão 4 do plano.
  async findAllDocuments(filters: OnboardingDocumentFilterDto) {
    const { status, planId } = filters;

    const docWhere: Prisma.OnboardingDocumentWhereInput = {};
    if (status) docWhere.status = status;
    if (planId) docWhere.planId = planId;

    const submitted = await this.prisma.read.onboardingDocument.findMany({
      where: docWhere,
      include: {
        plan: {
          select: { id: true, user: { select: { id: true, fullName: true, avatarUrl: true } } },
        },
        uploadedBy: { select: { id: true, fullName: true } },
        validatedBy: { select: { id: true, fullName: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    let pendingSubmission: Array<{
      taskInstanceId: number;
      planId: number;
      documentType: string;
      dueDate: Date | null;
      plan: { id: number; user: { id: number; fullName: string; avatarUrl: string | null } };
    }> = [];

    // Só faz sentido listar "por submeter" quando não se filtrou por um
    // estado de documento já submetido.
    if (!status) {
      const taskWhere: Prisma.OnboardingTaskInstanceWhereInput = {
        status: { not: 'COMPLETED' },
        templateTask: { category: 'DOCUMENTS' },
      };
      if (planId) taskWhere.planId = planId;

      const openDocTasks = await this.prisma.read.onboardingTaskInstance.findMany({
        where: taskWhere,
        include: {
          templateTask: true,
          plan: {
            select: { id: true, user: { select: { id: true, fullName: true, avatarUrl: true } } },
          },
        },
      });
      pendingSubmission = openDocTasks.map(t => ({
        taskInstanceId: t.id,
        planId: t.planId,
        documentType: t.templateTask.title,
        dueDate: t.dueDate,
        plan: t.plan,
      }));
    }

    return { submitted, pendingSubmission };
  }

  // "Formação" (docs/onboarding.md ponto 7) — associa cada tarefa de
  // categoria TRAINING à inscrição real (Enrollment) do colaborador no
  // mesmo curso, sem criar uma segunda gestão de cursos.
  async findAllTraining(filters: OnboardingTrainingFilterDto) {
    const { planId } = filters;

    const taskWhere: Prisma.OnboardingTaskInstanceWhereInput = {
      templateTask: { category: 'TRAINING' },
    };
    if (planId) taskWhere.planId = planId;

    const tasks = await this.prisma.read.onboardingTaskInstance.findMany({
      where: taskWhere,
      include: {
        templateTask: { include: { course: { select: { id: true, title: true } } } },
        plan: {
          select: {
            id: true,
            userId: true,
            user: { select: { id: true, fullName: true, avatarUrl: true } },
          },
        },
      },
      orderBy: { dueDate: 'asc' },
    });

    const courseIds = [
      ...new Set(tasks.map(t => t.templateTask.courseId).filter((id): id is number => id != null)),
    ];
    const userIds = [...new Set(tasks.map(t => t.plan.userId))];

    const enrollments =
      courseIds.length > 0
        ? await this.prisma.read.enrollment.findMany({
            where: { courseId: { in: courseIds }, userId: { in: userIds } },
            select: {
              courseId: true,
              userId: true,
              status: true,
              progress: true,
              completedAt: true,
              certificate: { select: { id: true } },
            },
          })
        : [];
    const enrollmentMap = new Map(enrollments.map(e => [`${e.courseId}_${e.userId}`, e]));

    return tasks.map(t => {
      const enrollment =
        t.templateTask.courseId != null
          ? enrollmentMap.get(`${t.templateTask.courseId}_${t.plan.userId}`)
          : undefined;
      return {
        taskInstanceId: t.id,
        planId: t.planId,
        user: t.plan.user,
        title: t.templateTask.title,
        phase: t.templateTask.phase,
        course: t.templateTask.course,
        isMandatory: t.templateTask.isMandatory,
        dueDate: t.dueDate,
        taskStatus: t.status,
        enrollment: enrollment
          ? {
              status: enrollment.status,
              progress: enrollment.progress,
              completedAt: enrollment.completedAt,
              hasCertificate: !!enrollment.certificate,
            }
          : null,
      };
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

  // ─── ACOMPANHAMENTO ─────────────────────────────────────────────────────────
  // docs/onboarding.md ponto 8 — check-ins seedados em create() (ver
  // CHECKIN_OFFSETS acima); esta secção cobre os extra CUSTOM e o
  // registo/consulta.

  async createCheckin(dto: CreateOnboardingCheckinDto) {
    const plan = await this.prisma.read.onboardingPlan.findUnique({ where: { id: dto.planId } });
    if (!plan) throw new NotFoundException('Plano não encontrado');

    return this.prisma.onboardingCheckin.create({
      data: {
        planId: dto.planId,
        type: dto.type ?? 'CUSTOM',
        dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
        responsibleId: dto.responsibleId,
      },
    });
  }

  async registerCheckin(id: number, dto: RegisterOnboardingCheckinDto, user: CurrentUserData) {
    const checkin = await this.prisma.read.onboardingCheckin.findUnique({ where: { id } });
    if (!checkin) throw new NotFoundException('Check-in não encontrado');

    // Quem preenche é o responsável atribuído (normalmente o gestor), ou
    // ADMIN/RH quando ainda não há responsável definido.
    assertCanAccess(checkin, checkin.responsibleId ?? -1, user, [Role.ADMIN, Role.RH]);

    return this.prisma.onboardingCheckin.update({
      where: { id },
      data: {
        difficulties: dto.difficulties,
        positives: dto.positives,
        supportNeeds: dto.supportNeeds,
        managerFeedback: dto.managerFeedback,
        nextActions: dto.nextActions,
        status: dto.status ?? 'COMPLETED',
        completedAt: (dto.status ?? 'COMPLETED') === 'COMPLETED' ? new Date() : null,
      },
    });
  }

  async submitCheckinEmployeeFeedback(
    id: number,
    dto: SubmitCheckinEmployeeFeedbackDto,
    user: CurrentUserData,
  ) {
    const checkin = await this.prisma.read.onboardingCheckin.findUnique({
      where: { id },
      include: { plan: { select: { userId: true } } },
    });
    if (!checkin) throw new NotFoundException('Check-in não encontrado');

    // Só o próprio colaborador integrado escreve o seu feedback — nem
    // gestor nem RH podem preenchê-lo em nome dele.
    assertCanAccess(checkin, checkin.plan.userId, user, []);

    return this.prisma.onboardingCheckin.update({
      where: { id },
      data: { employeeFeedback: dto.employeeFeedback },
    });
  }

  async findAllCheckins(filters: OnboardingCheckinFilterDto) {
    const { page = 1, limit = 20, status, type, planId, overdue } = filters;
    const { skip, take } = calculatePagination(page, limit);
    const now = new Date();

    const where: Prisma.OnboardingCheckinWhereInput = {};
    if (planId) where.planId = planId;
    if (type) where.type = type;
    if (overdue) {
      where.status = 'PENDING';
      where.dueDate = { lt: now };
    } else if (status) {
      where.status = status;
    }

    const [data, total] = await Promise.all([
      this.prisma.read.onboardingCheckin.findMany({
        where,
        skip,
        take,
        include: {
          plan: {
            select: {
              id: true,
              user: { select: { id: true, fullName: true, avatarUrl: true } },
              manager: { select: { id: true, fullName: true } },
              buddy: { select: { id: true, fullName: true } },
            },
          },
          responsible: { select: { id: true, fullName: true } },
        },
        orderBy: { dueDate: 'asc' },
      }),
      this.prisma.read.onboardingCheckin.count({ where }),
    ]);

    return buildPaginatedResponse(data, total, page, limit);
  }

  // ─── AVALIAÇÃO DE INTEGRAÇÃO ────────────────────────────────────────────────
  // docs/onboarding.md ponto 9 — em vez de duplicar um sistema de avaliação,
  // despoleta um EvaluationRequest (purpose=ONBOARDING) no módulo Evaluation
  // e guarda a ligação 1:1 em OnboardingPlan.integrationEvalRequestId.

  async triggerIntegrationEvaluation(
    planId: number,
    dto: TriggerIntegrationEvaluationDto,
    user: CurrentUserData,
  ) {
    const plan = await this.prisma.read.onboardingPlan.findUnique({
      where: { id: planId },
      select: {
        id: true,
        userId: true,
        managerId: true,
        hrResponsibleId: true,
        integrationEvalRequestId: true,
      },
    });
    if (!plan) throw new NotFoundException('Plano não encontrado');

    // Só quem gere a integração (o gestor do plano, RH ou ADMIN) despoleta a
    // avaliação — nunca o próprio colaborador integrado.
    assertCanAccess(plan, plan.managerId ?? -1, user, [Role.ADMIN, Role.RH, Role.GESTOR]);

    if (plan.integrationEvalRequestId) {
      throw new ConflictException('Avaliação de integração já foi despoletada para este plano');
    }

    const evaluatorId = dto.evaluatorId ?? plan.managerId ?? plan.hrResponsibleId;
    if (!evaluatorId) {
      throw new BadRequestException(
        'Não é possível determinar o avaliador: o plano não tem gestor nem responsável de RH',
      );
    }

    const request = await this.prisma.evaluationRequest.create({
      data: {
        evaluatorId,
        evaluatedId: plan.userId,
        type: EvalType.MANAGER,
        purpose: EvalPurpose.ONBOARDING,
        stage: EvalStage.MANAGER_EVAL,
        dueDate: new Date(Date.now() + 14 * 86400000),
        name: 'Avaliação de Integração',
      },
    });

    await this.prisma.onboardingPlan.update({
      where: { id: planId },
      data: { integrationEvalRequestId: request.id },
    });

    await this.prisma.notificationLog
      .create({
        data: {
          userId: evaluatorId,
          type: 'ONBOARDING_EVALUATION_REQUESTED',
          message: 'Foi-te pedida uma Avaliação de Integração de um colaborador',
          metadata: JSON.stringify({ planId, requestId: request.id }),
        },
      })
      .catch(e => {
        this.logger.warn({
          userId: evaluatorId,
          action: 'ONBOARDING_EVALUATION_REQUESTED',
          planId,
          err: { message: e instanceof Error ? e.message : String(e) },
          msg: 'Falha ao criar notificação de avaliação de integração',
        });
      });

    return request;
  }

  // Lista as Avaliações de Integração já despoletadas — junta o
  // EvaluationRequest existente (relação já usada acima), sem criar um
  // modelo de avaliação próprio (conforme o spec pede explicitamente).
  async getIntegrationEvaluations() {
    const plans = await this.prisma.read.onboardingPlan.findMany({
      where: { integrationEvalRequestId: { not: null } },
      select: {
        id: true,
        user: { select: { id: true, fullName: true, avatarUrl: true } },
        completedAt: true,
        integrationEvalRequest: {
          select: {
            id: true,
            status: true,
            dueDate: true,
            completedAt: true,
            evaluator: { select: { id: true, fullName: true } },
          },
        },
      },
      orderBy: { completedAt: 'desc' },
    });
    return plans.map(p => ({
      planId: p.id,
      user: p.user,
      onboardingCompletedAt: p.completedAt,
      evaluation: p.integrationEvalRequest,
    }));
  }

  // ─── RELATÓRIOS ───────────────────────────────────────────────────────────
  // docs/onboarding.md ponto 10 — um endpoint agregado + export, mesmo
  // padrão de evaluation.controller.ts (reports overview + export.csv/xlsx
  // via src/common/utils/csv-export.util.ts e xlsx-export.util.ts).

  private async reportRows(filters: OnboardingReportFilterDto) {
    const { from, to, departmentId, unitId } = filters;
    const where: Prisma.OnboardingPlanWhereInput = {};
    if (from || to) {
      where.startDate = {
        ...(from ? { gte: new Date(from) } : {}),
        ...(to ? { lte: new Date(to) } : {}),
      };
    }
    const userWhere: Prisma.UserWhereInput = {};
    if (departmentId) userWhere.departmentId = departmentId;
    if (unitId) userWhere.unitId = unitId;
    if (Object.keys(userWhere).length > 0) where.user = userWhere;

    return this.prisma.read.onboardingPlan.findMany({
      where,
      select: {
        id: true,
        status: true,
        progress: true,
        startDate: true,
        completedAt: true,
        expectedEndDate: true,
        user: {
          select: {
            fullName: true,
            department: { select: { name: true } },
            unit: { select: { name: true } },
          },
        },
        template: { select: { name: true } },
        hrResponsible: { select: { fullName: true } },
        manager: { select: { fullName: true } },
        taskInstances: { select: { status: true } },
        documents: { select: { status: true } },
        surveys: { select: { score: true } },
      },
    });
  }

  async getReportsOverview(filters: OnboardingReportFilterDto) {
    const plans = await this.reportRows(filters);

    const total = plans.length;
    const completed = plans.filter(p => p.status === 'COMPLETED');
    const completionRate = total > 0 ? Math.round((completed.length / total) * 100) : 0;
    const avgDurationDays =
      completed.length > 0
        ? Math.round(
            completed.reduce((sum, p) => {
              if (!p.completedAt) return sum;
              return sum + (p.completedAt.getTime() - p.startDate.getTime()) / 86400000;
            }, 0) / completed.length,
          )
        : 0;

    const allTasks = plans.flatMap(p => p.taskInstances);
    const tasksCompleted = allTasks.filter(t => t.status === 'COMPLETED').length;
    const tasksOverdue = allTasks.filter(t => t.status !== 'COMPLETED').length;

    const allDocs = plans.flatMap(p => p.documents);
    const docsPending = allDocs.filter(d => d.status === 'PENDING').length;

    const scores = plans.flatMap(p => p.surveys.map(s => s.score));
    const avgFeedback =
      scores.length > 0
        ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10
        : 0;

    const countBy = (rows: string[]) =>
      rows.reduce<Record<string, number>>((acc, key) => {
        acc[key] = (acc[key] ?? 0) + 1;
        return acc;
      }, {});

    return {
      total,
      completionRate,
      avgDurationDays,
      tasksCompleted,
      tasksOverdue,
      documentsPending: docsPending,
      avgFeedback,
      byDepartment: countBy(plans.map(p => p.user.department?.name ?? 'Sem departamento')),
      byUnit: countBy(plans.map(p => p.user.unit?.name ?? 'Sem unidade')),
      byResponsible: countBy(
        plans.map(p => p.hrResponsible?.fullName ?? p.manager?.fullName ?? 'Sem responsável'),
      ),
    };
  }

  async getReportsRows(filters: OnboardingReportFilterDto) {
    const plans = await this.reportRows(filters);
    return plans.map(p => {
      const total = p.taskInstances.length;
      const completedTasks = p.taskInstances.filter(t => t.status === 'COMPLETED').length;
      return {
        colaborador: p.user.fullName,
        departamento: p.user.department?.name ?? '',
        unidade: p.user.unit?.name ?? '',
        planoDeIntegracao: p.template.name,
        responsavel: p.hrResponsible?.fullName ?? p.manager?.fullName ?? '',
        estado: p.status,
        progresso: p.progress,
        dataInicio: p.startDate.toISOString().slice(0, 10),
        dataConclusao: p.completedAt ? p.completedAt.toISOString().slice(0, 10) : '',
        tarefasConcluidas: `${completedTasks}/${total}`,
      };
    });
  }

  // ─── DASHBOARD ────────────────────────────────────────────────────────────

  async getDashboard(managerId?: number, departmentId?: number, unitId?: number) {
    const where: Prisma.OnboardingPlanWhereInput = {};
    if (managerId) where.managerId = managerId;
    const dashUserWhere: Prisma.UserWhereInput = {};
    if (departmentId) dashUserWhere.departmentId = departmentId;
    if (unitId) dashUserWhere.unitId = unitId;
    if (Object.keys(dashUserWhere).length > 0) where.user = dashUserWhere;

    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const [
      totalPlans,
      byStatus,
      activeWithProgress,
      overdueTasks,
      avgSurveyScore,
      pendingDocuments,
      pendingTrainings,
      newHires,
      pendingIntegrationEvals,
      upcomingStarts,
      breakdownRows,
    ] = await Promise.all([
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
          dueDate: { lt: now },
        },
      }),
      this.prisma.read.onboardingSurvey.aggregate({ _avg: { score: true } }),
      this.prisma.read.onboardingDocument.count({
        where: { status: 'PENDING', plan: where },
      }),
      this.prisma.read.onboardingTaskInstance.count({
        where: {
          plan: where,
          status: { notIn: ['COMPLETED', 'SKIPPED'] },
          templateTask: { category: 'TRAINING' },
        },
      }),
      this.prisma.read.onboardingPlan.count({
        where: { ...where, startDate: { gte: thirtyDaysAgo, lte: now } },
      }),
      this.prisma.read.onboardingPlan.count({
        where: { ...where, status: 'COMPLETED', integrationEvalRequestId: null },
      }),
      this.prisma.read.onboardingPlan.findMany({
        where: { ...where, startDate: { gt: now } },
        select: {
          id: true,
          startDate: true,
          user: { select: { id: true, fullName: true, avatarUrl: true } },
          template: { select: { name: true } },
        },
        orderBy: { startDate: 'asc' },
        take: 10,
      }),
      // Uma leitura só para os 3 breakdowns (departamento/unidade/responsável)
      // — evita 3 groupBy separados sobre campos de relação, que o Prisma
      // não suporta directamente.
      this.prisma.read.onboardingPlan.findMany({
        where,
        select: {
          user: {
            select: {
              department: { select: { name: true } },
              unit: { select: { name: true } },
            },
          },
          // "Responsável" = RH responsável; sem RH atribuído, usa o gestor.
          hrResponsible: { select: { fullName: true } },
          manager: { select: { fullName: true } },
        },
      }),
    ]);

    const countBy = (rows: string[]) =>
      rows.reduce<Record<string, number>>((acc, key) => {
        acc[key] = (acc[key] ?? 0) + 1;
        return acc;
      }, {});

    const byDepartment = countBy(
      breakdownRows.map(r => r.user.department?.name ?? 'Sem departamento'),
    );
    const byUnit = countBy(breakdownRows.map(r => r.user.unit?.name ?? 'Sem unidade'));
    const byResponsible = countBy(
      breakdownRows.map(r => r.hrResponsible?.fullName ?? r.manager?.fullName ?? 'Sem responsável'),
    );

    const completedCount = byStatus.find(s => s.status === 'COMPLETED')?._count ?? 0;
    const completionRate = totalPlans > 0 ? Math.round((completedCount / totalPlans) * 100) : 0;

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
        completionRate,
        pendingDocuments,
        pendingTrainings,
        newHires,
        pendingIntegrationEvals,
        byDepartment,
        byUnit,
        byResponsible,
      },
      active: activeWithMetrics,
      upcomingStarts,
    };
  }

  async remove(id: number) {
    await this.findOne(id);
    await this.prisma.onboardingPlan.delete({ where: { id } });
    return { message: 'Plano de onboarding removido' };
  }
}
