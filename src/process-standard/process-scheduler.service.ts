// src/process-standard/process-scheduler.service.ts
// Tarefas periódicas do motor de processos (de 5 em 5 minutos):
//   • conclui os temporizadores vencidos e avança o fluxo;
//   • emite os eventos de prazo (tarefa próxima do prazo / em atraso / processo
//     em atraso) para as regras de Automações — deduplicados por chave;
//   • aplica a política de escalonamento das etapas e das aprovações;
//   • repete as execuções de automações falhadas (política de repetição).
// Com várias réplicas a correr o cron, cada passo é idempotente (estados e
// chaves de deduplicação), por isso uma repetição não duplica efeitos.
import { Injectable, Logger, Optional } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { StepType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AutomationService } from '../automation/automation.service';
import { TriggerType } from '../automation/automation.dto';
import { createNotificationSafe } from '../common/helpers/notification.helper';
import { writeProcessAuditLog } from './process-audit';
import { ProcessEngineService } from './process-engine.service';

const BATCH = 200;
const NEAR_DEADLINE_HOURS = 24;
const ACTIVE = ['PENDING', 'IN_PROGRESS', 'ESCALATED'] as const;
const NOT_DEADLINE_STEPS: StepType[] = [
  'TIMER',
  'WAIT_EVENT',
  'START',
  'END',
  'GATEWAY',
  'PARALLEL',
];

@Injectable()
export class ProcessSchedulerService {
  private readonly logger = new Logger(ProcessSchedulerService.name);
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly engine: ProcessEngineService,
    @Optional() private readonly automation?: AutomationService,
  ) {}

  @Cron('*/5 * * * *')
  async tick() {
    if (this.running) return;
    this.running = true;
    try {
      await this.run();
    } catch (e: unknown) {
      this.logger.error({
        err: { message: e instanceof Error ? e.message : String(e) },
        msg: 'Falha no ciclo periódico dos processos',
      });
    } finally {
      this.running = false;
    }
  }

  /** Um ciclo completo (público para poder ser chamado manualmente / em testes). */
  async run(now = new Date()) {
    const timers = await this.engine.completeDueTimers();
    const events = await this.emitDeadlineEvents(now);
    const escalatedTasks = await this.escalateTasks(now);
    const escalatedApprovals = await this.escalateApprovals(now);
    const retried = this.automation ? await this.automation.retryDueExecutions() : { retried: 0 };
    return { timers, events, escalatedTasks, escalatedApprovals, retried };
  }

  /** Só consulta a BD se existir alguma regra activa a escutar o evento. */
  private async listened(triggers: string[]) {
    return (
      (await this.prisma.automationRule.count({
        where: { active: true, trigger: { in: triggers } },
      })) > 0
    );
  }

  private async emitDeadlineEvents(now: Date) {
    let emitted = 0;
    const soon = new Date(now.getTime() + NEAR_DEADLINE_HOURS * 3_600_000);

    const taskTriggers = [TriggerType.TASK_NEAR_DEADLINE, TriggerType.TASK_OVERDUE];
    if (await this.listened(taskTriggers)) {
      const tasks = await this.prisma.stepProgress.findMany({
        where: {
          status: { in: [...ACTIVE] },
          slaDeadline: { not: null, lte: soon },
          step: { type: { notIn: NOT_DEADLINE_STEPS } },
          instance: { status: 'IN_PROGRESS' },
        },
        select: { instanceId: true, stepId: true, slaDeadline: true },
        orderBy: { slaDeadline: 'asc' },
        take: BATCH,
      });
      for (const t of tasks) {
        const due = t.slaDeadline as Date;
        const overdue = due < now;
        const inst = await this.engine.loadInstance(t.instanceId);
        const sp = inst?.stepProgress.find(p => p.stepId === t.stepId);
        if (!inst || !sp) continue;
        await this.engine.emit(
          overdue ? TriggerType.TASK_OVERDUE : TriggerType.TASK_NEAR_DEADLINE,
          this.engine.eventPayload(inst, sp),
          `${overdue ? 'task.overdue' : 'task.near_deadline'}:${t.instanceId}:${t.stepId}:${due.getTime()}`,
        );
        emitted++;
      }
    }

    if (await this.listened([TriggerType.PROCESS_OVERDUE])) {
      const late = await this.prisma.processInstance.findMany({
        where: { status: 'IN_PROGRESS', slaDeadline: { lt: now } },
        select: { id: true, slaDeadline: true },
        take: BATCH,
      });
      for (const l of late) {
        const inst = await this.engine.loadInstance(l.id);
        if (!inst) continue;
        await this.engine.emit(
          TriggerType.PROCESS_OVERDUE,
          this.engine.eventPayload(inst),
          `process.overdue:${l.id}:${(l.slaDeadline as Date).getTime()}`,
        );
        emitted++;
      }
    }
    return emitted;
  }

  /** Política de escalonamento (§8): passadas X horas do prazo, a tarefa sobe de nível. */
  private async escalateTasks(now: Date) {
    const candidates = await this.prisma.stepProgress.findMany({
      where: {
        status: { in: ['PENDING', 'IN_PROGRESS'] },
        slaDeadline: { not: null, lt: now },
        step: { escalationAfterHours: { not: null }, type: { notIn: NOT_DEADLINE_STEPS } },
        instance: { status: 'IN_PROGRESS' },
      },
      select: {
        id: true,
        instanceId: true,
        stepId: true,
        slaDeadline: true,
        step: {
          select: {
            title: true,
            type: true,
            escalationAfterHours: true,
            escalationToId: true,
            escalationToRole: true,
          },
        },
      },
      take: BATCH,
    });
    let escalated = 0;
    for (const c of candidates) {
      const limit =
        (c.slaDeadline as Date).getTime() + (c.step.escalationAfterHours ?? 0) * 3_600_000;
      if (limit > now.getTime()) continue;
      // Aprovações escalam pela via própria (escalateApprovals).
      if (c.step.type === 'REVIEW') continue;
      const res = await this.prisma.stepProgress.updateMany({
        where: { id: c.id, status: { in: ['PENDING', 'IN_PROGRESS'] } },
        data: { status: 'ESCALATED' },
      });
      if (res.count === 0) continue;
      const inst = await this.engine.loadInstance(c.instanceId);
      const sp = inst?.stepProgress.find(p => p.stepId === c.stepId);
      if (!inst || !sp) continue;
      const tokens = ['MANAGER', 'OWNER', 'REQUESTER'];
      if (c.step.escalationToId) tokens.push(String(c.step.escalationToId));
      if (c.step.escalationToRole) tokens.push(`ROLE:${c.step.escalationToRole}`);
      for (const userId of await this.engine.resolveRecipients(tokens, inst, sp)) {
        await createNotificationSafe(this.prisma, this.logger, {
          userId,
          type: 'PROCESS_TASK_ESCALATED',
          message: `Tarefa "${c.step.title}" (${inst.code}) escalada automaticamente por falta de resposta`,
        });
      }
      await writeProcessAuditLog(this.prisma, this.logger, {
        processId: inst.processId,
        instanceId: inst.id,
        userId: inst.initiatedById,
        action: 'STEP_AUTO_ESCALATED',
        meta: { stepId: c.stepId },
      });
      escalated++;
    }
    return escalated;
  }

  /** Aprovações sem decisão X horas depois do prazo sobem ao gestor do aprovador. */
  private async escalateApprovals(now: Date) {
    const pending = await this.prisma.processApproval.findMany({
      where: {
        status: 'PENDING',
        dueAt: { not: null, lt: now },
        approverId: { not: null },
        instance: { status: 'IN_PROGRESS' },
        step: { step: { escalationAfterHours: { not: null } } },
      },
      include: {
        step: {
          select: {
            step: { select: { escalationAfterHours: true, escalationToId: true, title: true } },
          },
        },
        instance: {
          select: { code: true, processId: true, initiatedById: true, targetUserId: true },
        },
      },
      take: BATCH,
    });
    let escalated = 0;
    for (const a of pending) {
      const cfg = a.step.step;
      if ((a.dueAt as Date).getTime() + (cfg.escalationAfterHours ?? 0) * 3_600_000 > now.getTime())
        continue;
      let toId = cfg.escalationToId ?? null;
      if (!toId && a.approverId) {
        const u = await this.prisma.user.findUnique({
          where: { id: a.approverId },
          select: { managerId: true },
        });
        toId = u?.managerId ?? null;
      }
      // Sem nível superior (ou em conflito de segregação): fica como está.
      if (
        !toId ||
        toId === a.approverId ||
        [a.instance.initiatedById, a.instance.targetUserId].includes(toId)
      ) {
        continue;
      }
      const res = await this.prisma.processApproval.updateMany({
        where: { id: a.id, status: 'PENDING' },
        data: {
          approverId: toId,
          previousApproverId: a.approverId,
          status: 'ESCALATED',
          escalationLevel: { increment: 1 },
        },
      });
      if (res.count === 0) continue;
      await createNotificationSafe(this.prisma, this.logger, {
        userId: toId,
        type: 'PROCESS_APPROVAL_REQUESTED',
        message: `Aprovação ${a.code} escalada para si por falta de decisão no prazo ("${cfg.title}")`,
      });
      await writeProcessAuditLog(this.prisma, this.logger, {
        processId: a.instance.processId,
        instanceId: a.instanceId,
        userId: a.instance.initiatedById,
        action: 'APPROVAL_AUTO_ESCALATED',
        meta: { approvalId: a.id, stepId: a.stepId, from: a.approverId, to: toId },
      });
      escalated++;
    }
    return escalated;
  }
}
