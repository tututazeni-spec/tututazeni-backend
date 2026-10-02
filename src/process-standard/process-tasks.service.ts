// src/process-standard/process-tasks.service.ts
// Aba "Tarefas e Etapas" (docs/Modulo_Processes.md §6): lista/detalhe de
// tarefas (etapas de instâncias) com dependências, checklist, comentários,
// e as acções de execução — iniciar, bloquear, esclarecer, devolver, reabrir,
// reatribuir, lembrar e escalar. A conclusão (com os requisitos obrigatórios)
// vive em ProcessStandardService.completeStep.
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { isPrivileged } from '../common/authz/ownership';
import { Role } from '../auth/enums/role.enum';
import { CurrentUserData } from '../common/decorators';
import { createNotificationSafe } from '../common/helpers/notification.helper';
import { ProcessStandardService } from './process-standard.service';
import { syncStepActivation } from './process-activation';
import { effectiveDependencies, formatTaskCode, isDoneStatus } from './process-workflow';
import {
  ChecklistDto,
  ClarificationDto,
  ReassignStepDto,
  StepCommentDto,
  TaskFilterDto,
} from './process-standard.dto';

const MANAGE_ROLES = [Role.ADMIN, Role.RH, Role.GESTOR];
const ACTIVE = ['PENDING', 'IN_PROGRESS', 'BLOCKED', 'ESCALATED'] as const;
const user3 = { select: { id: true, fullName: true } } as const;

const TASK_INCLUDE = {
  step: true,
  assignee: user3,
  reviewer: user3,
  completedBy: user3,
  instance: {
    select: {
      id: true,
      code: true,
      title: true,
      status: true,
      priority: true,
      targetUserId: true,
      initiatedById: true,
      currentResponsibleId: true,
      process: { select: { id: true, code: true, title: true, ownerId: true } },
      targetUser: user3,
    },
  },
} satisfies Prisma.StepProgressInclude;

type TaskRow = Prisma.StepProgressGetPayload<{ include: typeof TASK_INCLUDE }>;

@Injectable()
export class ProcessTasksService {
  private readonly logger = new Logger(ProcessTasksService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly processes: ProcessStandardService,
  ) {}

  // ─── Permissões ───────────────────────────────────────────────────────────

  private isManager(user: CurrentUserData) {
    return isPrivileged(user, MANAGE_ROLES);
  }

  /** Quem executa: privilegiado, responsável atribuído/nomeado ou o colaborador-alvo. */
  private canAct(user: CurrentUserData, t: TaskRow) {
    const uid = String(user.id);
    return (
      this.isManager(user) ||
      String(t.assigneeId) === uid ||
      String(t.step.responsibleId) === uid ||
      (t.assigneeId == null && String(t.instance.targetUserId) === uid)
    );
  }

  private isReviewer(user: CurrentUserData, t: TaskRow) {
    return t.reviewerId != null && String(t.reviewerId) === String(user.id);
  }

  private canView(user: CurrentUserData, t: TaskRow) {
    const uid = String(user.id);
    return (
      this.canAct(user, t) ||
      this.isReviewer(user, t) ||
      String(t.instance.initiatedById) === uid ||
      String(t.instance.targetUserId) === uid ||
      String(t.instance.currentResponsibleId) === uid
    );
  }

  private async load(instanceId: number, stepId: number): Promise<TaskRow> {
    const t = await this.prisma.stepProgress.findUnique({
      where: { instanceId_stepId: { instanceId, stepId } },
      include: TASK_INCLUDE,
    });
    if (!t) throw new NotFoundException('Tarefa não encontrada');
    return t;
  }

  private async loadFor(
    instanceId: number,
    stepId: number,
    user: CurrentUserData,
    allow: (t: TaskRow) => boolean,
  ) {
    const t = await this.load(instanceId, stepId);
    // 404 (e não 403) para não revelar a existência de tarefas alheias.
    if (!this.canView(user, t)) throw new NotFoundException('Tarefa não encontrada');
    if (!allow(t)) throw new ForbiddenException('Sem permissão para esta acção na tarefa');
    return t;
  }

  private assertLive(t: TaskRow) {
    if (t.instance.status !== 'IN_PROGRESS') {
      throw new BadRequestException(`O processo está ${t.instance.status} — não aceita esta acção`);
    }
  }

  private label(t: TaskRow) {
    return `"${t.step.title}" (${t.instance.code ?? `#${t.instance.id}`})`;
  }

  private async notify(
    userId: number | null | undefined,
    actorId: number,
    type: string,
    message: string,
  ) {
    if (!userId || userId === actorId) return;
    await createNotificationSafe(this.prisma, this.logger, { userId, type, message });
  }

  private async audit(t: TaskRow, userId: number, action: string, meta?: object) {
    await this.processes.writeAuditLog({
      instanceId: t.instanceId,
      processId: t.instance.process.id,
      userId,
      action,
      meta: { stepId: t.stepId, ...meta },
    });
  }

  // ─── Mapeamento ───────────────────────────────────────────────────────────

  private toView(
    t: TaskRow,
    siblings: Array<{
      stepOrder: number;
      status: string;
      step: { title: string; order: number; parallel: boolean; dependsOnOrders: number[] };
    }>,
    now = new Date(),
  ) {
    const deps = effectiveDependencies(siblings.map(s => s.step)).get(t.step.order) ?? [];
    const checklistItems = t.step.checklist ?? [];
    return {
      instanceId: t.instanceId,
      stepId: t.stepId,
      code: formatTaskCode(t.instance.code, t.instance.id, t.step.order),
      name: t.step.title,
      type: t.step.type,
      description: t.step.description,
      stage: t.step.order,
      process: {
        id: t.instance.process.id,
        code: t.instance.process.code,
        title: t.instance.process.title,
        instanceCode: t.instance.code,
        instanceTitle: t.instance.title ?? t.instance.process.title,
        priority: t.instance.priority,
        target: t.instance.targetUser,
      },
      assignee: t.assignee,
      reviewer: t.reviewer,
      assignedAt: t.assignedAt,
      startedAt: t.startedAt,
      dueAt: t.slaDeadline,
      status: t.status,
      isOverdue:
        !!t.slaDeadline &&
        (ACTIVE as readonly string[]).includes(t.status) &&
        t.slaDeadline.getTime() < now.getTime(),
      dependencies: siblings
        .filter(s => deps.includes(s.stepOrder))
        .map(s => ({
          order: s.stepOrder,
          title: s.step.title,
          status: s.status,
          done: isDoneStatus(s.status),
        })),
      evidenceIds: t.evidenceIds,
      requiresUpload: t.step.requiresUpload,
      result: t.result,
      notes: t.notes,
      completedAt: t.completedAt,
      completedBy: t.completedBy,
      blockedReason: t.blockedReason,
      returnCount: t.returnCount,
      returnReason: t.returnReason,
      checklist: {
        items: checklistItems,
        done: (t.checklistDone ?? []).filter(i => checklistItems.includes(i)),
      },
      permissions: { canAct: false, canReview: false, canManage: false },
    };
  }

  private async siblingsFor(instanceIds: number[]) {
    const rows = await this.prisma.read.stepProgress.findMany({
      where: { instanceId: { in: instanceIds } },
      select: {
        instanceId: true,
        stepOrder: true,
        status: true,
        step: { select: { title: true, order: true, parallel: true, dependsOnOrders: true } },
      },
    });
    const map = new Map<number, typeof rows>();
    for (const r of rows) map.set(r.instanceId, [...(map.get(r.instanceId) ?? []), r]);
    return map;
  }

  private withPermissions(
    view: ReturnType<ProcessTasksService['toView']>,
    t: TaskRow,
    user: CurrentUserData,
  ) {
    view.permissions = {
      canAct: this.canAct(user, t),
      canReview: this.isReviewer(user, t) || this.isManager(user),
      canManage: this.isManager(user),
    };
    return view;
  }

  // ─── Consulta ─────────────────────────────────────────────────────────────

  async list(filters: TaskFilterDto, user: CurrentUserData) {
    const { page = 1, limit = 20 } = filters;
    const manager = this.isManager(user);
    const scope = filters.scope ?? (manager ? 'all' : 'mine');
    if (scope === 'all' && !manager) {
      throw new ForbiddenException('Apenas perfis de gestão podem ver todas as tarefas');
    }

    const and: Prisma.StepProgressWhereInput[] = [];
    const where: Prisma.StepProgressWhereInput = { AND: and };
    if (scope === 'mine') {
      and.push({
        OR: [
          { assigneeId: user.id },
          { reviewerId: user.id },
          { assigneeId: null, step: { responsibleId: user.id } },
          { assigneeId: null, instance: { targetUserId: user.id } },
        ],
      });
    }
    if (filters.status) where.status = filters.status;
    if (filters.instanceId) where.instanceId = filters.instanceId;
    if (filters.assigneeId) where.assigneeId = filters.assigneeId;
    if (filters.overdue) {
      where.status = { in: [...ACTIVE] };
      where.slaDeadline = { lt: new Date() };
    }
    const search = filters.search?.trim();
    if (search) {
      and.push({
        OR: [
          { step: { title: { contains: search, mode: 'insensitive' } } },
          { instance: { code: { contains: search, mode: 'insensitive' } } },
          { instance: { title: { contains: search, mode: 'insensitive' } } },
          { instance: { process: { title: { contains: search, mode: 'insensitive' } } } },
        ],
      });
    }

    const [rows, total] = await Promise.all([
      this.prisma.read.stepProgress.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        include: TASK_INCLUDE,
        orderBy: [{ slaDeadline: { sort: 'asc', nulls: 'last' } }, { id: 'desc' }],
      }),
      this.prisma.read.stepProgress.count({ where }),
    ]);

    const siblings = await this.siblingsFor([...new Set(rows.map(r => r.instanceId))]);
    const now = new Date();
    return {
      data: rows.map(r =>
        this.withPermissions(this.toView(r, siblings.get(r.instanceId) ?? [], now), r, user),
      ),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      scope,
    };
  }

  async detail(instanceId: number, stepId: number, user: CurrentUserData) {
    const t = await this.loadFor(instanceId, stepId, user, () => true);
    const siblings = await this.siblingsFor([instanceId]);
    const [comments, events] = await Promise.all([
      this.prisma.read.processStepComment.findMany({
        where: { instanceId, stepId },
        include: { author: user3 },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.read.processAuditLog.findMany({
        where: { instanceId, meta: { contains: `"stepId":${stepId}` } },
        include: { user: user3 },
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),
    ]);
    return {
      ...this.withPermissions(this.toView(t, siblings.get(instanceId) ?? []), t, user),
      comments,
      events,
    };
  }

  // ─── Acções de execução ───────────────────────────────────────────────────

  async start(instanceId: number, stepId: number, user: CurrentUserData) {
    const t = await this.loadFor(instanceId, stepId, user, x => this.canAct(user, x));
    this.assertLive(t);
    if (!['PENDING', 'ESCALATED'].includes(t.status)) {
      throw new BadRequestException(
        t.status === 'WAITING'
          ? 'Esta tarefa aguarda a conclusão das etapas de que depende'
          : `Tarefa em estado ${t.status} não pode ser iniciada`,
      );
    }
    await this.prisma.stepProgress.update({
      where: { id: t.id },
      data: {
        status: 'IN_PROGRESS',
        startedAt: new Date(),
        // Quem pega numa tarefa por atribuir fica com ela.
        ...(t.assigneeId == null ? { assigneeId: user.id, assignedAt: new Date() } : {}),
      },
    });
    await syncStepActivation(this.prisma, instanceId);
    await this.audit(t, user.id, 'STEP_STARTED');
    return this.detail(instanceId, stepId, user);
  }

  async block(instanceId: number, stepId: number, user: CurrentUserData, reason: string) {
    const t = await this.loadFor(instanceId, stepId, user, x => this.canAct(user, x));
    this.assertLive(t);
    if (!['PENDING', 'IN_PROGRESS', 'ESCALATED'].includes(t.status)) {
      throw new BadRequestException(`Tarefa em estado ${t.status} não pode ser bloqueada`);
    }
    await this.prisma.stepProgress.update({
      where: { id: t.id },
      data: { status: 'BLOCKED', blockedReason: reason.trim() },
    });
    await this.prisma.processStepComment.create({
      data: {
        instanceId,
        stepId,
        authorId: user.id,
        kind: 'SYSTEM',
        body: `Bloqueada: ${reason.trim()}`,
      },
    });
    await this.audit(t, user.id, 'STEP_BLOCKED', { reason: reason.trim() });
    await this.notify(
      t.instance.initiatedById,
      user.id,
      'PROCESS_TASK_BLOCKED',
      `A tarefa ${this.label(t)} foi bloqueada: ${reason.trim()}`,
    );
    return this.detail(instanceId, stepId, user);
  }

  async unblock(instanceId: number, stepId: number, user: CurrentUserData) {
    const t = await this.loadFor(instanceId, stepId, user, x => this.canAct(user, x));
    this.assertLive(t);
    if (t.status !== 'BLOCKED') throw new BadRequestException('A tarefa não está bloqueada');
    await this.prisma.stepProgress.update({
      where: { id: t.id },
      data: { status: 'PENDING', blockedReason: null },
    });
    await this.prisma.processStepComment.create({
      data: { instanceId, stepId, authorId: user.id, kind: 'SYSTEM', body: 'Desbloqueada' },
    });
    await this.audit(t, user.id, 'STEP_UNBLOCKED');
    return this.detail(instanceId, stepId, user);
  }

  async requestClarification(
    instanceId: number,
    stepId: number,
    user: CurrentUserData,
    dto: ClarificationDto,
  ) {
    const t = await this.loadFor(instanceId, stepId, user, () => true);
    await this.prisma.processStepComment.create({
      data: {
        instanceId,
        stepId,
        authorId: user.id,
        kind: 'CLARIFICATION',
        body: dto.message.trim(),
        mentionIds: dto.mentionIds ?? [],
      },
    });
    await this.audit(t, user.id, 'STEP_CLARIFICATION_REQUESTED');
    const recipients = new Set<number>(
      [
        t.instance.initiatedById,
        t.instance.process.ownerId,
        t.assigneeId,
        ...(dto.mentionIds ?? []),
      ].filter((v): v is number => v != null),
    );
    for (const r of recipients) {
      await this.notify(
        r,
        user.id,
        'PROCESS_TASK_CLARIFICATION',
        `Pedido de esclarecimento na tarefa ${this.label(t)}: ${dto.message.trim()}`,
      );
    }
    return this.detail(instanceId, stepId, user);
  }

  async addComment(instanceId: number, stepId: number, user: CurrentUserData, dto: StepCommentDto) {
    const t = await this.loadFor(instanceId, stepId, user, () => true);
    const mentions = [...new Set(dto.mentionIds ?? [])];
    await this.prisma.processStepComment.create({
      data: {
        instanceId,
        stepId,
        authorId: user.id,
        kind: 'COMMENT',
        body: dto.body.trim(),
        mentionIds: mentions,
      },
    });
    for (const m of mentions) {
      await this.notify(
        m,
        user.id,
        'PROCESS_TASK_MENTION',
        `Foi mencionado num comentário da tarefa ${this.label(t)}`,
      );
    }
    return this.detail(instanceId, stepId, user);
  }

  async updateChecklist(
    instanceId: number,
    stepId: number,
    user: CurrentUserData,
    dto: ChecklistDto,
  ) {
    const t = await this.loadFor(
      instanceId,
      stepId,
      user,
      x => this.canAct(user, x) || this.isReviewer(user, x),
    );
    this.assertLive(t);
    const allowed = new Set(t.step.checklist ?? []);
    const unknown = dto.done.filter(i => !allowed.has(i));
    if (unknown.length) {
      throw new BadRequestException(`Itens inexistentes na checklist: ${unknown.join('; ')}`);
    }
    await this.prisma.stepProgress.update({
      where: { id: t.id },
      data: { checklistDone: [...new Set(dto.done)] },
    });
    return this.detail(instanceId, stepId, user);
  }

  async reassign(instanceId: number, stepId: number, user: CurrentUserData, dto: ReassignStepDto) {
    const t = await this.loadFor(
      instanceId,
      stepId,
      user,
      x => this.isManager(user) || String(x.assigneeId) === String(user.id),
    );
    if (dto.assigneeId == null && dto.reviewerId == null) {
      throw new BadRequestException('Indique o novo responsável ou revisor');
    }
    if (['COMPLETED', 'CANCELLED', 'SKIPPED'].includes(t.status)) {
      throw new BadRequestException('Tarefa já encerrada — reabra-a primeiro');
    }
    const ids = [dto.assigneeId, dto.reviewerId].filter((v): v is number => v != null);
    const found = await this.prisma.user.findMany({
      where: { id: { in: ids }, active: true },
      select: { id: true },
    });
    if (found.length !== new Set(ids).size)
      throw new NotFoundException('Utilizador não encontrado');

    await this.prisma.stepProgress.update({
      where: { id: t.id },
      data: {
        ...(dto.assigneeId != null ? { assigneeId: dto.assigneeId, assignedAt: new Date() } : {}),
        ...(dto.reviewerId != null ? { reviewerId: dto.reviewerId } : {}),
      },
    });
    await syncStepActivation(this.prisma, instanceId);
    await this.audit(t, user.id, 'STEP_REASSIGNED', {
      from: t.assigneeId,
      to: dto.assigneeId,
      reviewerId: dto.reviewerId,
    });
    await this.notify(
      dto.assigneeId,
      user.id,
      'PROCESS_TASK_ASSIGNED',
      `Foi-lhe atribuída a tarefa ${this.label(t)}`,
    );
    await this.notify(
      dto.reviewerId,
      user.id,
      'PROCESS_TASK_REVIEW',
      `Foi designado revisor da tarefa ${this.label(t)}`,
    );
    return this.detail(instanceId, stepId, user);
  }

  /** Devolução para correcção: revisor (ou gestão) volta a abrir uma tarefa já feita ou em curso. */
  async returnForCorrection(
    instanceId: number,
    stepId: number,
    user: CurrentUserData,
    reason: string,
  ) {
    const t = await this.loadFor(
      instanceId,
      stepId,
      user,
      x => this.isReviewer(user, x) || this.isManager(user),
    );
    if (
      ['CANCELLED', 'SKIPPED', 'WAITING'].includes(t.status) ||
      t.instance.status === 'CANCELLED'
    ) {
      throw new BadRequestException(`Tarefa em estado ${t.status} não pode ser devolvida`);
    }
    await this.prisma.stepProgress.update({
      where: { id: t.id },
      data: {
        status: 'PENDING',
        completedAt: null,
        completedById: null,
        returnCount: { increment: 1 },
        returnReason: reason.trim(),
        startedAt: new Date(),
      },
    });
    // Reabre a instância se estava concluída e recua as etapas dependentes.
    await syncStepActivation(this.prisma, instanceId);
    await this.prisma.processStepComment.create({
      data: {
        instanceId,
        stepId,
        authorId: user.id,
        kind: 'SYSTEM',
        body: `Devolvida para correcção: ${reason.trim()}`,
      },
    });
    await this.audit(t, user.id, 'STEP_RETURNED', { reason: reason.trim() });
    await this.notify(
      t.assigneeId ?? t.completedById,
      user.id,
      'PROCESS_TASK_RETURNED',
      `A tarefa ${this.label(t)} foi devolvida para correcção: ${reason.trim()}`,
    );
    return this.detail(instanceId, stepId, user);
  }

  /** Reabertura (mediante permissão): só perfis de gestão, com justificação. */
  async reopen(instanceId: number, stepId: number, user: CurrentUserData, reason: string) {
    const t = await this.loadFor(instanceId, stepId, user, () => this.isManager(user));
    if (!['COMPLETED', 'REJECTED', 'SKIPPED'].includes(t.status)) {
      throw new BadRequestException(`Tarefa em estado ${t.status} não pode ser reaberta`);
    }
    if (t.instance.status === 'CANCELLED') {
      throw new BadRequestException('O processo está cancelado');
    }
    await this.prisma.stepProgress.update({
      where: { id: t.id },
      data: {
        status: 'PENDING',
        completedAt: null,
        completedById: null,
        returnCount: { increment: 1 },
        returnReason: reason.trim(),
        startedAt: new Date(),
      },
    });
    await syncStepActivation(this.prisma, instanceId);
    await this.prisma.processStepComment.create({
      data: {
        instanceId,
        stepId,
        authorId: user.id,
        kind: 'SYSTEM',
        body: `Reaberta: ${reason.trim()}`,
      },
    });
    await this.audit(t, user.id, 'STEP_REOPENED', { reason: reason.trim(), from: t.status });
    await this.notify(
      t.assigneeId,
      user.id,
      'PROCESS_TASK_REOPENED',
      `A tarefa ${this.label(t)} foi reaberta: ${reason.trim()}`,
    );
    return this.detail(instanceId, stepId, user);
  }

  async remind(instanceId: number, stepId: number, user: CurrentUserData) {
    const t = await this.loadFor(
      instanceId,
      stepId,
      user,
      x => this.isManager(user) || String(x.instance.initiatedById) === String(user.id),
    );
    if (!(ACTIVE as readonly string[]).includes(t.status)) {
      throw new BadRequestException('Só tarefas activas podem receber lembretes');
    }
    if (!t.assigneeId) throw new BadRequestException('A tarefa não tem responsável atribuído');
    await this.notify(
      t.assigneeId,
      -1,
      'PROCESS_TASK_REMINDER',
      `Lembrete: a tarefa ${this.label(t)}${t.slaDeadline ? ` vence em ${t.slaDeadline.toISOString().slice(0, 10)}` : ' aguarda a sua acção'}`,
    );
    await this.audit(t, user.id, 'STEP_REMINDER_SENT', { to: t.assigneeId });
    return { sent: true };
  }

  /** Escalonamento: marca a tarefa ESCALATED e avisa o gestor do responsável, o dono do modelo e o solicitante. */
  async escalate(instanceId: number, stepId: number, user: CurrentUserData, reason?: string) {
    const t = await this.loadFor(instanceId, stepId, user, x => this.canAct(user, x));
    this.assertLive(t);
    if (!['PENDING', 'IN_PROGRESS', 'BLOCKED'].includes(t.status)) {
      throw new BadRequestException(`Tarefa em estado ${t.status} não pode ser escalada`);
    }
    await this.prisma.stepProgress.update({ where: { id: t.id }, data: { status: 'ESCALATED' } });
    await this.audit(t, user.id, 'STEP_ESCALATED', { reason });
    const manager = t.assigneeId
      ? await this.prisma.user.findUnique({
          where: { id: t.assigneeId },
          select: { managerId: true },
        })
      : null;
    const recipients = new Set<number>(
      [manager?.managerId, t.instance.process.ownerId, t.instance.initiatedById].filter(
        (v): v is number => v != null,
      ),
    );
    for (const r of recipients) {
      await this.notify(
        r,
        user.id,
        'PROCESS_TASK_ESCALATED',
        `Tarefa ${this.label(t)} escalada${reason ? `: ${reason}` : ''}`,
      );
    }
    return this.detail(instanceId, stepId, user);
  }
}
