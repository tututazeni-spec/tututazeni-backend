// src/process-standard/process-engine.service.ts
// Motor de execução dos fluxos (docs/Modulo_Processes.md §7, §8, §9).
//
// Depois de qualquer transição numa instância (`advance`), o motor:
//   1. activa as etapas cujas dependências ficaram satisfeitas (process-activation);
//   2. ignora (SKIPPED) as etapas cujas condições de entrada são falsas — é assim
//      que as ramificações funcionam;
//   3. executa sozinho as etapas automáticas (início/fim, ramificação, notificação,
//      acção automática, integração, temporizador);
//   4. abre os pedidos de aprovação das etapas de aprovação;
//   5. repete até estabilizar.
// Também executa as acções de sucesso/falha configuradas em cada etapa e emite
// eventos para o módulo de Automações (sem motor duplicado).
import { Injectable, Logger, Optional } from '@nestjs/common';
import { createHash } from 'crypto';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AutomationService } from '../automation/automation.service';
import { TriggerType } from '../automation/automation.dto';
import { createNotificationSafe } from '../common/helpers/notification.helper';
import { syncStepActivation, type ActivationResult } from './process-activation';
import { writeProcessAuditLog } from './process-audit';
import {
  buildConditionContext,
  conditionsPass,
  interpolateTemplate,
  parseStepActions,
  parseStepConfig,
  type ConditionContext,
  type StepAction,
} from './process-conditions';
import { addHours, effectiveDependencies, isAutomaticType } from './process-workflow';
import { loadSetting } from './process-settings.loader';
import type { WorkCalendarConfig } from './process-settings';

const MAX_PASSES = 30;
export const OPEN_APPROVAL_STATUSES = [
  'WAITING',
  'PENDING',
  'INFO_REQUESTED',
  'ESCALATED',
] as const;

const INSTANCE_INCLUDE = {
  process: { select: { id: true, code: true, title: true, ownerId: true } },
  targetUser: { select: { id: true, departmentId: true, managerId: true } },
  stepProgress: { include: { step: true } },
} satisfies Prisma.ProcessInstanceInclude;

export type EngineInstance = Prisma.ProcessInstanceGetPayload<{ include: typeof INSTANCE_INCLUDE }>;
type EngineProgress = EngineInstance['stepProgress'][number];

@Injectable()
export class ProcessEngineService {
  private readonly logger = new Logger(ProcessEngineService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly automation?: AutomationService,
  ) {}

  // ─── Eventos (para o módulo de Automações) ────────────────────────────────

  /** Emite um evento para as regras de automação; nunca lança. */
  async emit(event: TriggerType | string, payload: Record<string, unknown>, dedupeKey?: string) {
    if (!this.automation) return;
    try {
      await this.automation.triggerEvent({
        event: event as TriggerType,
        userId: typeof payload.targetUserId === 'number' ? payload.targetUserId : undefined,
        payload: { ...payload, ...(dedupeKey ? { dedupeKey } : {}) },
      });
    } catch (e: unknown) {
      this.logger.warn({
        event,
        err: { message: e instanceof Error ? e.message : String(e) },
        msg: 'Falha ao emitir evento de processo para as automações',
      });
    }
  }

  /** Payload comum dos eventos: tudo o que as regras precisam para condições e destinatários. */
  eventPayload(inst: EngineInstance, sp?: EngineProgress): Record<string, unknown> {
    return {
      instanceId: inst.id,
      instanceCode: inst.code,
      processId: inst.processId,
      processCode: inst.process.code,
      processTitle: inst.process.title,
      title: inst.title ?? inst.process.title,
      priority: inst.priority,
      sourceModule: inst.sourceModule,
      status: inst.status,
      targetUserId: inst.targetUserId,
      requesterId: inst.initiatedById,
      ownerId: inst.process.ownerId,
      responsibleId: inst.currentResponsibleId,
      managerId: inst.targetUser.managerId,
      departmentId: inst.targetUser.departmentId,
      dueAt: inst.slaDeadline?.toISOString() ?? null,
      ...(sp
        ? {
            stepId: sp.stepId,
            stepOrder: sp.stepOrder,
            stepTitle: sp.step.title,
            stepType: sp.step.type,
            stepStatus: sp.status,
            assigneeId: sp.assigneeId,
            stepDueAt: sp.slaDeadline?.toISOString() ?? null,
          }
        : {}),
    };
  }

  async loadInstance(instanceId: number): Promise<EngineInstance | null> {
    return this.prisma.processInstance.findUnique({
      where: { id: instanceId },
      include: INSTANCE_INCLUDE,
    });
  }

  // ─── Avanço da instância ──────────────────────────────────────────────────

  async advance(instanceId: number): Promise<ActivationResult> {
    const total: ActivationResult = {
      activatedStepIds: [],
      instanceCompleted: false,
      instanceReopened: false,
    };
    for (let pass = 0; pass < MAX_PASSES; pass++) {
      const r = await syncStepActivation(this.prisma, instanceId);
      total.activatedStepIds.push(...r.activatedStepIds);
      total.instanceCompleted ||= r.instanceCompleted;
      total.instanceReopened ||= r.instanceReopened;
      if (r.instanceCompleted) {
        const inst = await this.loadInstance(instanceId);
        if (inst) {
          await this.emit(
            TriggerType.PROCESS_COMPLETED,
            this.eventPayload(inst),
            `process.completed:${instanceId}`,
          );
        }
        break;
      }
      const changed = await this.processSpecials(instanceId, r.activatedStepIds);
      if (!changed) break;
    }
    // Aprovações de etapas que deixaram de estar activas (devolução/reabertura/ramo
    // ignorado) já não fazem sentido.
    await this.prisma.processApproval.updateMany({
      where: {
        instanceId,
        status: { in: [...OPEN_APPROVAL_STATUSES] },
        step: { status: { in: ['WAITING', 'SKIPPED', 'CANCELLED'] } },
      },
      data: { status: 'CANCELLED' },
    });
    await this.syncCurrentStep(instanceId);
    // Eventos de atribuição das etapas que ficaram activas.
    if (total.activatedStepIds.length > 0) {
      const inst = await this.loadInstance(instanceId);
      if (inst) {
        for (const sp of inst.stepProgress) {
          if (total.activatedStepIds.includes(sp.stepId) && sp.assigneeId) {
            await this.emit(
              TriggerType.TASK_ASSIGNED,
              this.eventPayload(inst, sp),
              `task.assigned:${instanceId}:${sp.stepId}:${sp.assignedAt?.getTime() ?? 0}`,
            );
          }
        }
      }
    }
    return total;
  }

  /** §17 `currentStepId`: primeira etapa por concluir (por ordem); null quando não há. */
  async syncCurrentStep(instanceId: number) {
    const current = await this.prisma.stepProgress.findFirst({
      where: { instanceId, status: { in: ['PENDING', 'IN_PROGRESS', 'BLOCKED', 'ESCALATED'] } },
      orderBy: { stepOrder: 'asc' },
      select: { stepId: true },
    });
    await this.prisma.processInstance.updateMany({
      where: { id: instanceId, NOT: { currentStepId: current?.stepId ?? null } },
      data: { currentStepId: current?.stepId ?? null },
    });
  }

  private contextFor(inst: EngineInstance, progress: EngineProgress[]): ConditionContext {
    return buildConditionContext({
      priority: inst.priority,
      sourceModule: inst.sourceModule,
      status: inst.status,
      targetDepartmentId: inst.targetUser.departmentId,
      progress: progress.map(p => ({
        stepOrder: p.stepOrder,
        status: p.status,
        result: p.result,
        action: p.action,
        formData: p.formData,
      })),
    });
  }

  /** Executa o que é automático nas etapas PENDING; devolve true se algo mudou de estado. */
  private async processSpecials(instanceId: number, _activated: number[]): Promise<boolean> {
    const inst = await this.loadInstance(instanceId);
    if (!inst || inst.status !== 'IN_PROGRESS') return false;
    const progress = [...inst.stepProgress].sort((a, b) => a.stepOrder - b.stepOrder);
    let changed = false;

    for (const sp of progress) {
      if (sp.status !== 'PENDING') continue;
      const step = sp.step;
      try {
        // Ramificação: condições de entrada falsas → etapa ignorada.
        if (sp.returnCount === 0 && step.entryConditions) {
          const ctx = this.contextFor(inst, progress);
          if (!conditionsPass(step.entryConditions, ctx)) {
            await this.settle(
              inst,
              sp,
              'SKIPPED',
              'SKIPPED',
              'Ignorada: condições de entrada não satisfeitas',
            );
            changed = true;
            continue;
          }
        }
        if (step.type === 'REVIEW') {
          await this.ensureApprovals(inst, sp);
          continue;
        }
        if (!isAutomaticType(step.type)) continue; // etapas humanas / WAIT_EVENT

        if (step.type === 'TIMER') {
          changed = (await this.handleTimer(inst, sp)) || changed;
          continue;
        }
        await this.executeAutomatic(inst, sp);
        await this.settle(inst, sp, 'COMPLETED', 'AUTO');
        changed = true;
      } catch (e: unknown) {
        await this.failAutomatic(inst, sp, e);
      }
    }
    return changed;
  }

  /** Fecha uma etapa pelo motor (concluída ou ignorada) e corre as acções de sucesso. */
  private async settle(
    inst: EngineInstance,
    sp: EngineProgress,
    status: 'COMPLETED' | 'SKIPPED',
    result: string,
    note?: string,
  ) {
    const now = new Date();
    await this.prisma.stepProgress.update({
      where: { id: sp.id },
      data: {
        status,
        result,
        completedAt: now,
        startedAt: sp.startedAt ?? now,
        duration: sp.startedAt ? Math.round((now.getTime() - sp.startedAt.getTime()) / 60000) : 0,
      },
    });
    sp.status = status;
    sp.result = result;
    if (note) {
      await this.prisma.processStepComment.create({
        data: {
          instanceId: inst.id,
          stepId: sp.stepId,
          authorId: inst.initiatedById,
          kind: 'SYSTEM',
          body: note,
        },
      });
    }
    await writeProcessAuditLog(this.prisma, this.logger, {
      processId: inst.processId,
      instanceId: inst.id,
      userId: inst.initiatedById,
      action: status === 'SKIPPED' ? 'STEP_SKIPPED' : 'STEP_AUTO_COMPLETED',
      meta: { stepId: sp.stepId, type: sp.step.type, result },
    });
    if (status === 'COMPLETED') await this.runActions(inst, sp, sp.step.successActions);
  }

  private async executeAutomatic(inst: EngineInstance, sp: EngineProgress) {
    const step = sp.step;
    const cfg = parseStepConfig(step.config);
    if (cfg === 'invalid') throw new Error('Configuração da etapa inválida');
    switch (step.type) {
      case 'NOTIFICATION':
        await this.runActions(inst, sp, [
          { type: 'NOTIFY', recipients: cfg.recipients ?? [], message: cfg.message },
        ]);
        break;
      case 'AUTO_ACTION':
        await this.runActions(inst, sp, cfg.actions ?? []);
        break;
      case 'INTEGRATION': {
        // A integração com outro módulo é feita pelas regras de Automações que escutam
        // este evento — o motor limita-se a emiti-lo, com o módulo de destino no payload.
        await this.emit(
          TriggerType.PROCESS_INTEGRATION_REQUESTED,
          {
            ...this.eventPayload(inst, sp),
            integrationModule: cfg.module,
            integrationEvent: cfg.event,
          },
          `process.integration_requested:${inst.id}:${sp.stepId}:${sp.returnCount}`,
        );
        break;
      }
      default:
        break; // START / END / GATEWAY / PARALLEL: apenas passam
    }
  }

  private async handleTimer(inst: EngineInstance, sp: EngineProgress): Promise<boolean> {
    const cfg = parseStepConfig(sp.step.config);
    if (cfg === 'invalid' || !(Number(cfg.delayHours) > 0)) {
      throw new Error('Temporizador sem duração válida');
    }
    const now = new Date();
    if (sp.result !== 'TIMER_SET') {
      const calendar = await loadSetting<WorkCalendarConfig>(this.prisma, 'workCalendar');
      const due = addHours(now, Number(cfg.delayHours), sp.step.calendarMode, calendar);
      await this.prisma.stepProgress.update({
        where: { id: sp.id },
        data: { result: 'TIMER_SET', slaDeadline: due, startedAt: now },
      });
      sp.result = 'TIMER_SET';
      sp.slaDeadline = due;
      return false;
    }
    if (sp.slaDeadline && sp.slaDeadline <= now) {
      await this.settle(inst, sp, 'COMPLETED', 'ELAPSED');
      return true;
    }
    return false;
  }

  /** Falha de uma etapa automática: fica bloqueada para intervenção e corre as acções de falha. */
  private async failAutomatic(inst: EngineInstance, sp: EngineProgress, e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    this.logger.warn({
      instanceId: inst.id,
      stepId: sp.stepId,
      err: { message },
      msg: 'Falha em etapa automática',
    });
    await this.prisma.stepProgress.update({
      where: { id: sp.id },
      data: { status: 'BLOCKED', blockedReason: `Falha automática: ${message}` },
    });
    sp.status = 'BLOCKED';
    await writeProcessAuditLog(this.prisma, this.logger, {
      processId: inst.processId,
      instanceId: inst.id,
      userId: inst.initiatedById,
      action: 'STEP_AUTO_FAILED',
      meta: { stepId: sp.stepId, type: sp.step.type, error: message },
    });
    await this.runActions(inst, sp, sp.step.failureActions);
    if (sp.step.type === 'INTEGRATION') {
      await this.emit(
        TriggerType.PROCESS_INTEGRATION_FAILED,
        { ...this.eventPayload(inst, sp), error: message },
        `process.integration_failed:${inst.id}:${sp.stepId}:${sp.returnCount}`,
      );
    }
  }

  // ─── Acções de sucesso / falha ────────────────────────────────────────────

  async resolveRecipients(
    tokens: string[],
    inst: EngineInstance,
    sp?: EngineProgress,
  ): Promise<number[]> {
    const ids = new Set<number>();
    for (const t of tokens) {
      const token = String(t).trim();
      if (/^\d+$/.test(token)) ids.add(Number(token));
      else if (token === 'ASSIGNEE' && sp?.assigneeId) ids.add(sp.assigneeId);
      else if (token === 'TARGET') ids.add(inst.targetUserId);
      else if (token === 'REQUESTER') ids.add(inst.initiatedById);
      else if (token === 'MANAGER' && inst.targetUser.managerId) ids.add(inst.targetUser.managerId);
      else if (token === 'OWNER') ids.add(inst.process.ownerId);
      else if (token === 'RESPONSIBLE' && inst.currentResponsibleId) {
        ids.add(inst.currentResponsibleId);
      } else if (token.startsWith('ROLE:')) {
        const users = await this.prisma.user.findMany({
          where: { active: true, role: { code: token.slice(5) } },
          select: { id: true },
          take: 20,
        });
        for (const u of users) ids.add(u.id);
      }
    }
    return [...ids];
  }

  async runActions(inst: EngineInstance, sp: EngineProgress, raw: unknown) {
    const actions: StepAction[] | 'invalid' = Array.isArray(raw)
      ? (raw as StepAction[])
      : parseStepActions(raw);
    if (actions === 'invalid') return;
    const ctx = this.contextFor(inst, inst.stepProgress);
    for (const a of actions) {
      try {
        switch (a.type) {
          case 'NOTIFY': {
            const message = interpolateTemplate(a.message ?? '', {
              ...ctx,
              title: inst.title ?? inst.process.title,
              code: inst.code,
            });
            for (const userId of await this.resolveRecipients(a.recipients ?? [], inst, sp)) {
              await createNotificationSafe(this.prisma, this.logger, {
                userId,
                type: 'PROCESS_ACTION',
                message: `${inst.code ?? `#${inst.id}`}: ${message}`,
              });
            }
            break;
          }
          case 'SET_PRIORITY':
            await this.prisma.processInstance.update({
              where: { id: inst.id },
              data: { priority: a.priority as 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT' },
            });
            inst.priority = a.priority as typeof inst.priority;
            break;
          case 'ADD_COMMENT':
            await this.prisma.processStepComment.create({
              data: {
                instanceId: inst.id,
                stepId: sp.stepId,
                authorId: inst.initiatedById,
                kind: 'SYSTEM',
                body: interpolateTemplate(a.message ?? '', ctx),
              },
            });
            break;
          case 'EMIT_EVENT':
            await this.emit(
              a.event ?? TriggerType.MANUAL,
              this.eventPayload(inst, sp),
              `step.action:${inst.id}:${sp.stepId}:${a.event}:${sp.returnCount}`,
            );
            break;
          case 'SUSPEND_INSTANCE':
            await this.prisma.processInstance.update({
              where: { id: inst.id },
              data: { status: 'ON_HOLD', suspendedAt: new Date() },
            });
            inst.status = 'ON_HOLD';
            break;
          case 'CANCEL_INSTANCE':
            await this.cancelByEngine(inst, a.reason ?? 'Cancelado por acção da etapa');
            break;
        }
      } catch (e: unknown) {
        this.logger.warn({
          instanceId: inst.id,
          stepId: sp.stepId,
          action: a.type,
          err: { message: e instanceof Error ? e.message : String(e) },
          msg: 'Falha ao executar acção de etapa',
        });
      }
    }
  }

  async cancelByEngine(inst: EngineInstance, reason: string) {
    await this.prisma.processInstance.update({
      where: { id: inst.id },
      data: {
        status: 'CANCELLED',
        cancelledAt: new Date(),
        cancelReason: reason,
        currentResponsibleId: null,
      },
    });
    await this.prisma.stepProgress.updateMany({
      where: { instanceId: inst.id, status: { notIn: ['COMPLETED', 'SKIPPED', 'CANCELLED'] } },
      data: { status: 'CANCELLED' },
    });
    await this.prisma.processApproval.updateMany({
      where: { instanceId: inst.id, status: { in: [...OPEN_APPROVAL_STATUSES] } },
      data: { status: 'CANCELLED' },
    });
    inst.status = 'CANCELLED';
    await writeProcessAuditLog(this.prisma, this.logger, {
      processId: inst.processId,
      instanceId: inst.id,
      userId: inst.initiatedById,
      action: 'INSTANCE_CANCELLED',
      meta: { reason, by: 'ENGINE' },
    });
    await this.emit(
      TriggerType.PROCESS_CANCELLED,
      this.eventPayload(inst),
      `process.cancelled:${inst.id}`,
    );
  }

  // ─── Aprovações (§7) ──────────────────────────────────────────────────────

  private async pickUserByRole(roleName: string): Promise<number | null> {
    const users = await this.prisma.user.findMany({
      where: { active: true, role: { name: roleName } },
      select: { id: true },
      orderBy: { id: 'asc' },
      take: 1,
    });
    return users[0]?.id ?? null;
  }

  /** Dados que o aprovador vai analisar: resultado das etapas anteriores + pedido. */
  private buildSnapshot(inst: EngineInstance, sp: EngineProgress) {
    const previous = inst.stepProgress
      .filter(p => p.id !== sp.id && ['COMPLETED', 'SKIPPED'].includes(p.status))
      .sort((a, b) => a.stepOrder - b.stepOrder)
      .map(p => ({
        order: p.stepOrder,
        title: p.step.title,
        status: p.status,
        result: p.result,
        notes: p.notes,
        formData: p.formData ? safeParse(p.formData) : null,
        evidenceIds: p.evidenceIds,
      }));
    const snapshot = {
      instance: {
        code: inst.code,
        title: inst.title,
        priority: inst.priority,
        sourceModule: inst.sourceModule,
        sourceEntity: [inst.sourceEntityType, inst.sourceEntityId],
        processVersion: inst.processVersion,
      },
      steps: previous,
    };
    const json = JSON.stringify(snapshot);
    return {
      json,
      hash: createHash('sha1').update(json).digest('hex').slice(0, 12),
      documentIds: [...new Set(previous.flatMap(p => p.evidenceIds))],
    };
  }

  /** Hash da versão actual dos dados que o aprovador analisa. */
  snapshotHash(inst: EngineInstance, sp: EngineProgress): string {
    return this.buildSnapshot(inst, sp).hash;
  }

  /** Cria a ronda de pedidos de aprovação de uma etapa de aprovação que acabou de ficar activa. */
  private async ensureApprovals(inst: EngineInstance, sp: EngineProgress) {
    const open = await this.prisma.processApproval.count({
      where: {
        instanceId: inst.id,
        stepId: sp.stepId,
        status: { in: [...OPEN_APPROVAL_STATUSES] },
      },
    });
    if (open > 0) return;
    // Uma ronda já decidida e aprovada não se repete (a etapa fecha-se ao decidir).
    const step = sp.step;

    let approvers: Array<number | null> = step.approverIds.length
      ? [...step.approverIds]
      : [
          sp.reviewerId ??
            sp.assigneeId ??
            step.responsibleId ??
            (step.responsibleRole ? await this.pickUserByRole(step.responsibleRole) : null),
        ];
    approvers = [...new Set(approvers)];

    // Segregação de funções: ninguém aprova o próprio pedido — sobe ao gestor.
    const conflicted = new Set([inst.initiatedById, inst.targetUserId]);
    const resolved: Array<{ approverId: number | null; escalated: boolean }> = [];
    for (const id of approvers) {
      if (id !== null && conflicted.has(id)) {
        const u = await this.prisma.user.findUnique({ where: { id }, select: { managerId: true } });
        const manager = u?.managerId && !conflicted.has(u.managerId) ? u.managerId : null;
        resolved.push({ approverId: manager, escalated: true });
      } else {
        resolved.push({ approverId: id, escalated: false });
      }
    }

    const last = await this.prisma.processApproval.findFirst({
      where: { instanceId: inst.id, stepId: sp.stepId },
      orderBy: { round: 'desc' },
      select: { round: true },
    });
    const round = (last?.round ?? 0) + 1;
    const existing = await this.prisma.processApproval.count({ where: { instanceId: inst.id } });
    const snap = this.buildSnapshot(inst, sp);
    const deps = effectiveDependencies(inst.stepProgress.map(p => p.step));
    const nextOrders = inst.stepProgress
      .filter(p => (deps.get(p.stepOrder) ?? []).includes(sp.stepOrder))
      .map(p => p.stepOrder);
    const executorId =
      inst.stepProgress.find(p => nextOrders.includes(p.stepOrder) && p.assigneeId)?.assigneeId ??
      null;
    const sequential = step.approvalMode === 'SEQUENTIAL';
    const created: Array<{ id: number; approverId: number | null; status: string }> = [];

    for (let i = 0; i < resolved.length; i++) {
      const r = resolved[i];
      const code = `${inst.code ?? `PROC-${inst.id}`}-A${String(existing + i + 1).padStart(2, '0')}`;
      try {
        const row = await this.prisma.processApproval.create({
          data: {
            code,
            instanceId: inst.id,
            stepId: sp.stepId,
            round,
            sequence: i + 1,
            mode: step.approvalMode,
            status: sequential && i > 0 ? 'WAITING' : 'PENDING',
            requesterId: inst.initiatedById,
            approverId: r.approverId,
            approverRole: r.approverId ? null : step.responsibleRole,
            level: step.responsibleRole ?? null,
            escalationLevel: r.escalated ? 1 : 0,
            dueAt: sp.slaDeadline,
            requesterComment: inst.description ?? inst.notes,
            dataSnapshot: snap.json,
            dataVersion: snap.hash,
            documentIds: snap.documentIds,
            nextStepOrders: nextOrders,
            executorId,
          },
        });
        created.push(row);
      } catch (e: unknown) {
        if ((e as { code?: string })?.code === 'P2002') return; // outra réplica criou a ronda
        throw e;
      }
    }

    await writeProcessAuditLog(this.prisma, this.logger, {
      processId: inst.processId,
      instanceId: inst.id,
      userId: inst.initiatedById,
      action: 'APPROVAL_REQUESTED',
      meta: { stepId: sp.stepId, round, approvers: created.map(c => c.approverId) },
    });
    for (const row of created) {
      if (row.status === 'PENDING') await this.announceApproval(inst, sp, row.id, row.approverId);
    }
  }

  /** Notifica o aprovador e emite o evento `approval.requested`. */
  async announceApproval(
    inst: EngineInstance,
    sp: EngineProgress,
    approvalId: number,
    approverId: number | null,
  ) {
    if (approverId) {
      await createNotificationSafe(this.prisma, this.logger, {
        userId: approverId,
        type: 'PROCESS_APPROVAL_REQUESTED',
        message: `Pedido de aprovação em ${inst.code ?? `#${inst.id}`}: "${sp.step.title}"`,
      });
    }
    await this.emit(
      TriggerType.APPROVAL_REQUESTED,
      { ...this.eventPayload(inst, sp), approvalId, approverId },
      `approval.requested:${approvalId}`,
    );
  }

  // ─── Eventos externos e temporizadores ────────────────────────────────────

  /** Entrega um evento a uma instância: conclui as esperas por evento correspondentes. */
  async deliverEvent(instanceId: number, eventName: string, userId: number) {
    const inst = await this.loadInstance(instanceId);
    if (!inst || inst.status !== 'IN_PROGRESS') return { delivered: 0 };
    let delivered = 0;
    for (const sp of inst.stepProgress) {
      if (sp.step.type !== 'WAIT_EVENT' || sp.status !== 'PENDING') continue;
      const cfg = parseStepConfig(sp.step.config);
      if (cfg === 'invalid' || cfg.eventName?.trim() !== eventName.trim()) continue;
      await this.settle(inst, sp, 'COMPLETED', `EVENT:${eventName}`);
      await writeProcessAuditLog(this.prisma, this.logger, {
        processId: inst.processId,
        instanceId,
        userId,
        action: 'EVENT_RECEIVED',
        meta: { stepId: sp.stepId, event: eventName },
      });
      delivered++;
    }
    if (delivered > 0) await this.advance(instanceId);
    return { delivered };
  }

  /** Avança as instâncias com temporizadores vencidos (chamado pelo scheduler). */
  async completeDueTimers(limit = 200) {
    const due = await this.prisma.stepProgress.findMany({
      where: {
        status: 'PENDING',
        result: 'TIMER_SET',
        slaDeadline: { lte: new Date() },
        step: { type: 'TIMER' },
        instance: { status: 'IN_PROGRESS' },
      },
      select: { instanceId: true },
      distinct: ['instanceId'],
      take: limit,
    });
    for (const d of due) await this.advance(d.instanceId);
    return { advanced: due.length };
  }
}

function safeParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
