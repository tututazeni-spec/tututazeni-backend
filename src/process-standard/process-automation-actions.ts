// src/process-standard/process-automation-actions.ts
// Acções de automação que actuam sobre processos (docs/Modulo_Processes.md §9).
// Registadas no AutomationService no arranque do módulo — assim o motor de
// automações continua único e não depende do módulo de processos.
//
// Validam permissões (o autor da regra tem de ser ADMIN/RH), evitam duplicados
// (iniciar processo por entidade de origem; repetir etapa com limite) e devolvem
// o resultado de cada tentativa, que o motor regista na execução.
import { Injectable, Logger, OnModuleInit, Optional } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  AutomationService,
  type ActionResult,
  type RegisteredActionContext,
} from '../automation/automation.service';
import { createNotificationSafe } from '../common/helpers/notification.helper';
import { writeProcessAuditLog } from './process-audit';
import { ProcessEngineService } from './process-engine.service';
import { ProcessStandardService } from './process-standard.service';

const AUTHORISED_ROLES = ['ADMIN', 'RH'];
const DEFAULT_MAX_STEP_RETRIES = 3;
const PRIORITIES = ['LOW', 'NORMAL', 'HIGH', 'URGENT'] as const;
type Priority = (typeof PRIORITIES)[number];

const num = (v: unknown): number | undefined => {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : undefined;
};

@Injectable()
export class ProcessAutomationActions implements OnModuleInit {
  private readonly logger = new Logger(ProcessAutomationActions.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly processes: ProcessStandardService,
    private readonly engine: ProcessEngineService,
    @Optional() private readonly automation?: AutomationService,
  ) {}

  onModuleInit() {
    if (!this.automation) return;
    const register = (
      name: string,
      handler: (ctx: RegisteredActionContext) => Promise<ActionResult>,
    ) =>
      this.automation?.registerActionHandler(name, async ctx => {
        const denied = await this.assertAuthor(ctx);
        return denied ?? handler(ctx);
      });
    register('process_start', c => this.startProcess(c));
    register('process_assign_responsible', c => this.assignResponsible(c));
    register('process_set_priority', c => this.setPriority(c));
    register('process_escalate_task', c => this.escalateTask(c));
    register('process_retry_step', c => this.retryStep(c));
  }

  /** O autor da regra tem de manter perfil de ADMIN/RH (regras de sistema, createdBy=0, passam). */
  private async assertAuthor(ctx: RegisteredActionContext): Promise<ActionResult | null> {
    const author = Number(ctx.rule.createdBy);
    if (!Number.isInteger(author) || author <= 0) return null;
    const u = await this.prisma.user.findUnique({
      where: { id: author },
      select: { active: true, role: { select: { name: true } } },
    });
    if (!u?.active || !AUTHORISED_ROLES.includes(u.role?.name ?? '')) {
      return { affected: 0, error: 'O autor da regra já não tem permissão para esta acção' };
    }
    return null;
  }

  private instanceIdOf(ctx: RegisteredActionContext) {
    return num(ctx.payload.instanceId);
  }

  private async startProcess(ctx: RegisteredActionContext): Promise<ActionResult> {
    const code = String(ctx.params.processCode ?? '').trim();
    if (!code) return { affected: 0, error: 'processCode em falta nos parâmetros da regra' };
    const target = ctx.userId ?? num(ctx.payload.targetUserId) ?? num(ctx.payload.userId);
    if (!target) return { affected: 0, error: 'O evento não identifica o colaborador-alvo' };
    const template = await this.prisma.processStandard.findUnique({
      where: { code },
      select: { id: true, status: true },
    });
    if (!template) return { affected: 0, error: `Modelo "${code}" não encontrado` };
    const priority = PRIORITIES.includes(ctx.params.priority as Priority)
      ? (ctx.params.priority as Priority)
      : undefined;
    try {
      // sourceEntity único por regra+colaborador: o motor recusa duplicados activos.
      const inst = await this.processes.startInstance(template.id, target, {
        targetUserId: target,
        priority,
        sourceModule: 'AUTOMATION',
        sourceEntityType: `AUTOMATION_RULE_${ctx.rule.id}`,
        sourceEntityId: String(target),
        notes: `Iniciado pela automação "${ctx.rule.name}"`,
      });
      return { affected: 1, message: `Processo ${inst.code} iniciado` };
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      // Duplicado: não é falha — é a protecção contra execuções repetidas.
      if (/Já existe um processo activo/.test(message)) return { affected: 0, message };
      return { affected: 0, error: message };
    }
  }

  private async assignResponsible(ctx: RegisteredActionContext): Promise<ActionResult> {
    const instanceId = this.instanceIdOf(ctx);
    if (!instanceId) return { affected: 0, error: 'O evento não identifica o processo' };
    let assigneeId = num(ctx.params.assigneeId);
    if (!assigneeId && ctx.params.roleCode) {
      const users = await this.prisma.user.findMany({
        where: { active: true, role: { code: String(ctx.params.roleCode) } },
        select: {
          id: true,
          _count: {
            select: {
              assignedStepProgress: {
                where: { status: { in: ['PENDING', 'IN_PROGRESS', 'BLOCKED', 'ESCALATED'] } },
              },
            },
          },
        },
        take: 100,
      });
      users.sort(
        (a, b) => a._count.assignedStepProgress - b._count.assignedStepProgress || a.id - b.id,
      );
      assigneeId = users[0]?.id;
    }
    if (!assigneeId) return { affected: 0, error: 'Não foi possível determinar o responsável' };

    const stepId = num(ctx.payload.stepId);
    const sp = await this.prisma.stepProgress.findFirst({
      where: {
        instanceId,
        ...(stepId ? { stepId } : { assigneeId: null }),
        status: { in: ['PENDING', 'IN_PROGRESS', 'ESCALATED'] },
        step: { type: { notIn: ['START', 'END', 'GATEWAY', 'PARALLEL', 'TIMER', 'WAIT_EVENT'] } },
        instance: { status: 'IN_PROGRESS' },
      },
      orderBy: { stepOrder: 'asc' },
      select: { id: true, stepId: true, step: { select: { title: true } } },
    });
    if (!sp) return { affected: 0, message: 'Sem tarefa activa por atribuir' };

    await this.prisma.stepProgress.update({
      where: { id: sp.id },
      data: { assigneeId, assignedAt: new Date() },
    });
    await this.prisma.processInstance.update({
      where: { id: instanceId },
      data: { currentResponsibleId: assigneeId },
    });
    await createNotificationSafe(this.prisma, this.logger, {
      userId: assigneeId,
      type: 'PROCESS_TASK_ASSIGNED',
      message: `Tarefa "${sp.step.title}" atribuída pela automação "${ctx.rule.name}"`,
    });
    await this.audit(ctx, instanceId, 'AUTOMATION_ASSIGNED', { stepId: sp.stepId, assigneeId });
    return { affected: 1 };
  }

  private async setPriority(ctx: RegisteredActionContext): Promise<ActionResult> {
    const instanceId = this.instanceIdOf(ctx);
    const priority = ctx.params.priority as Priority;
    if (!instanceId) return { affected: 0, error: 'O evento não identifica o processo' };
    if (!PRIORITIES.includes(priority)) return { affected: 0, error: 'Prioridade inválida' };
    const res = await this.prisma.processInstance.updateMany({
      where: { id: instanceId, status: { in: ['IN_PROGRESS', 'ON_HOLD'] } },
      data: { priority },
    });
    if (res.count) await this.audit(ctx, instanceId, 'AUTOMATION_PRIORITY_CHANGED', { priority });
    return { affected: res.count };
  }

  private async escalateTask(ctx: RegisteredActionContext): Promise<ActionResult> {
    const instanceId = this.instanceIdOf(ctx);
    const stepId = num(ctx.payload.stepId);
    if (!instanceId || !stepId) return { affected: 0, error: 'O evento não identifica a tarefa' };
    const res = await this.prisma.stepProgress.updateMany({
      where: {
        instanceId,
        stepId,
        status: { in: ['PENDING', 'IN_PROGRESS', 'BLOCKED'] },
        instance: { status: 'IN_PROGRESS' },
      },
      data: { status: 'ESCALATED' },
    });
    if (!res.count) return { affected: 0, message: 'A tarefa já não está activa' };
    const inst = await this.engine.loadInstance(instanceId);
    const sp = inst?.stepProgress.find(p => p.stepId === stepId);
    if (inst && sp) {
      const to = await this.engine.resolveRecipients(['MANAGER', 'OWNER', 'REQUESTER'], inst, sp);
      for (const userId of to) {
        await createNotificationSafe(this.prisma, this.logger, {
          userId,
          type: 'PROCESS_TASK_ESCALATED',
          message: `Tarefa "${sp.step.title}" (${inst.code}) escalada pela automação "${ctx.rule.name}"`,
        });
      }
    }
    await this.audit(ctx, instanceId, 'AUTOMATION_ESCALATED', { stepId });
    return { affected: 1 };
  }

  /** Repete etapas bloqueadas por falha automática, com limite de tentativas por etapa. */
  private async retryStep(ctx: RegisteredActionContext): Promise<ActionResult> {
    const instanceId = this.instanceIdOf(ctx);
    if (!instanceId) return { affected: 0, error: 'O evento não identifica o processo' };
    const stepId = num(ctx.payload.stepId);
    const blocked = await this.prisma.stepProgress.findMany({
      where: {
        instanceId,
        status: 'BLOCKED',
        ...(stepId ? { stepId } : {}),
        instance: { status: 'IN_PROGRESS' },
      },
      select: { id: true, stepId: true, returnCount: true },
    });
    if (blocked.length === 0) return { affected: 0, message: 'Sem etapas bloqueadas' };

    const max = ctx.rule.maxRetries ?? DEFAULT_MAX_STEP_RETRIES;
    const retryable = blocked.filter(b => b.returnCount < max);
    if (retryable.length === 0) {
      return {
        affected: 0,
        error: `Limite de ${max} tentativas atingido — requer intervenção manual`,
      };
    }
    await this.prisma.stepProgress.updateMany({
      where: { id: { in: retryable.map(b => b.id) } },
      data: {
        status: 'PENDING',
        blockedReason: null,
        returnCount: { increment: 1 },
        startedAt: new Date(),
      },
    });
    await this.audit(ctx, instanceId, 'AUTOMATION_STEP_RETRIED', {
      stepIds: retryable.map(b => b.stepId),
    });
    await this.engine.advance(instanceId);
    return { affected: retryable.length };
  }

  /** O registo de auditoria exige um utilizador: o autor da regra, ou o seu responsável. */
  private async audit(
    ctx: RegisteredActionContext,
    instanceId: number,
    action: string,
    meta: object,
  ) {
    const userId = [ctx.rule.createdBy, ctx.rule.ownerId]
      .map(Number)
      .find(n => Number.isInteger(n) && n > 0);
    if (!userId) return;
    await writeProcessAuditLog(this.prisma, this.logger, {
      instanceId,
      userId,
      action,
      meta: { ruleId: ctx.rule.id, ruleName: ctx.rule.name, ...meta },
    });
  }
}
