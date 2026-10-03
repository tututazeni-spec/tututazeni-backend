// src/automation/automation-history.service.ts
// §7 — Histórico de Execuções: listagem filtrável, detalhe por etapa (com dados
// sensíveis ocultados), cancelamento por utilizador autorizado e exportação.
import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { calculatePagination, buildPaginatedResponse } from '../common/helpers/pagination.helper';
import { ExecutionDisplayStatus, HistoryFilterDto } from './automation.dto';
import { parseRedacted, redactSensitive } from './automation-redact.util';
import { parseHistory } from './automation-tasks.util';
import { toCsv } from './automation-csv.util';
import { moduleOfTrigger } from './automation-events.catalog';
import type { ActionResult, FlowStepLog } from './automation.service';

type ExecRow = Prisma.AutomationExecutionGetPayload<object>;

/** Estado apresentado: os estados de espera/repetição derivam dos campos de controlo. */
export function deriveDisplayStatus(
  e: Pick<ExecRow, 'status' | 'resumeAt' | 'nextRetryAt'>,
): ExecutionDisplayStatus {
  switch (e.status) {
    case 'PENDING':
      return e.resumeAt ? 'WAITING_DELAY' : 'QUEUED';
    case 'FAILED':
      return e.nextRetryAt ? 'RETRY_SCHEDULED' : 'FAILED';
    default:
      return e.status;
  }
}

function statusWhere(status: ExecutionDisplayStatus): Prisma.AutomationExecutionWhereInput {
  switch (status) {
    case 'QUEUED':
      return { status: 'PENDING', resumeAt: null };
    case 'WAITING_DELAY':
      return { status: 'PENDING', resumeAt: { not: null } };
    case 'RETRY_SCHEDULED':
      return { status: 'FAILED', nextRetryAt: { not: null } };
    case 'FAILED':
      return { status: 'FAILED', nextRetryAt: null };
    default:
      return { status: status };
  }
}

interface ParsedLog {
  steps: FlowStepLog[];
  affected: number;
  single?: unknown;
}

function parseLog(json: string | null): ParsedLog {
  if (!json) return { steps: [], affected: 0 };
  try {
    const raw = JSON.parse(json) as { steps?: FlowStepLog[]; affected?: number };
    if (Array.isArray(raw.steps)) {
      return { steps: raw.steps, affected: Number(raw.affected ?? 0) };
    }
    // Regra de acção única: o log é o próprio ActionResult.
    return { steps: [], affected: Number(raw.affected ?? 0), single: redactSensitive(raw) };
  } catch {
    return { steps: [], affected: 0 };
  }
}

const TERMINAL = ['SUCCESS', 'FAILED', 'SKIPPED', 'CANCELLED'];

@Injectable()
export class AutomationHistoryService {
  constructor(private readonly prisma: PrismaService) {}

  private buildWhere(f: HistoryFilterDto): Prisma.AutomationExecutionWhereInput {
    const and: Prisma.AutomationExecutionWhereInput[] = [];
    if (f.status) and.push(statusWhere(f.status));
    if (f.ruleId) and.push({ ruleId: f.ruleId });
    if (f.module) and.push({ rule: { module: f.module } });
    if (f.eventId) and.push({ eventId: f.eventId });
    if (f.correlationId) and.push({ correlationId: f.correlationId });
    if (f.triggeredBy) and.push({ triggeredBy: f.triggeredBy });
    if (f.from || f.to) {
      and.push({
        startedAt: {
          ...(f.from ? { gte: new Date(f.from) } : {}),
          ...(f.to ? { lte: new Date(f.to) } : {}),
        },
      });
    }
    if (f.search?.trim()) {
      const q = f.search.trim();
      and.push({
        OR: [
          { id: { contains: q } },
          { correlationId: { contains: q } },
          { rule: { name: { contains: q, mode: 'insensitive' } } },
        ],
      });
    }
    return and.length ? { AND: and } : {};
  }

  private async userNames(ids: string[]): Promise<Map<string, string>> {
    const numeric = [...new Set(ids.filter(i => /^\d+$/.test(i)).map(Number))];
    if (!numeric.length) return new Map();
    const users = await this.prisma.read.user.findMany({
      where: { id: { in: numeric } },
      select: { id: true, fullName: true },
    });
    return new Map(users.map(u => [String(u.id), u.fullName]));
  }

  private async eventTypes(ids: string[]): Promise<Map<string, { type: string; module: string }>> {
    const unique = [...new Set(ids)];
    if (!unique.length) return new Map();
    const events = await this.prisma.automationEvent.findMany({
      where: { id: { in: unique } },
      select: { id: true, type: true, module: true },
    });
    return new Map(events.map(e => [e.id, { type: e.type, module: e.module }]));
  }

  private async decorate(
    rows: Array<
      ExecRow & { rule: { id: number; name: string; module: string | null; trigger: string } }
    >,
  ) {
    const [names, events] = await Promise.all([
      this.userNames(rows.map(r => r.triggeredBy).filter((x): x is string => !!x)),
      this.eventTypes(rows.map(r => r.eventId).filter((x): x is string => !!x)),
    ]);
    return rows.map(e => {
      const log = parseLog(e.actionsLog);
      const ev = e.eventId ? events.get(e.eventId) : undefined;
      const origin = e.scheduleId
        ? { kind: 'SCHEDULE', ref: e.scheduleId }
        : e.eventId
          ? { kind: 'EVENT', ref: e.eventId, type: ev?.type ?? null, module: ev?.module ?? null }
          : e.triggeredBy && e.triggeredBy !== 'SYSTEM'
            ? { kind: 'MANUAL', ref: e.triggeredBy }
            : { kind: 'SYSTEM', ref: null };
      return {
        id: e.id,
        rule: {
          id: e.rule.id,
          name: e.rule.name,
          module: e.rule.module ?? moduleOfTrigger(e.rule.trigger),
        },
        ruleVersion: e.ruleVersion,
        origin,
        startedAt: e.startedAt,
        finishedAt: e.finishedAt,
        durationMs: e.finishedAt ? e.finishedAt.getTime() - e.startedAt.getTime() : null,
        status: e.status,
        displayStatus: deriveDisplayStatus(e),
        currentStep: e.currentStep,
        attempt: e.attempt,
        nextRetryAt: e.nextRetryAt,
        affected: log.affected,
        error: e.errorMessage
          ? { code: e.errorCode, message: e.errorMessage, step: e.errorStep }
          : null,
        triggeredBy: e.triggeredBy ?? 'SYSTEM',
        triggeredByName:
          e.triggeredBy && e.triggeredBy !== 'SYSTEM'
            ? (names.get(e.triggeredBy) ?? null)
            : 'Sistema',
        correlationId: e.correlationId,
      };
    });
  }

  async list(f: HistoryFilterDto = {}) {
    const { page = 1, limit = 30 } = f;
    const { skip, take } = calculatePagination(page, limit);
    const where = this.buildWhere(f);
    const [rows, total] = await Promise.all([
      this.prisma.automationExecution.findMany({
        where,
        skip,
        take,
        orderBy: { startedAt: 'desc' },
        include: { rule: { select: { id: true, name: true, module: true, trigger: true } } },
      }),
      this.prisma.automationExecution.count({ where }),
    ]);
    return buildPaginatedResponse(await this.decorate(rows), total, page, limit);
  }

  /** Detalhe: resultado de cada etapa, duração, acções realizadas e erros (sem dados sensíveis). */
  async detail(id: string) {
    const e = await this.prisma.automationExecution.findUnique({
      where: { id },
      include: { rule: { select: { id: true, name: true, module: true, trigger: true } } },
    });
    if (!e) throw new NotFoundException('Execução não encontrada');
    const [summary] = await this.decorate([e]);
    const log = parseLog(e.actionsLog);

    const steps = log.steps.map(s => ({
      ...s,
      result: s.result ? (redactSensitive(s.result) as ActionResult) : undefined,
    }));
    const tasks = await this.prisma.automationTask.findMany({
      where: { executionId: id },
      orderBy: { createdAt: 'asc' },
    });
    const related = e.correlationId
      ? await this.prisma.automationExecution.findMany({
          where: { correlationId: e.correlationId, id: { not: id } },
          orderBy: { startedAt: 'asc' },
          take: 50,
          select: { id: true, ruleId: true, status: true, startedAt: true },
        })
      : [];
    const affectedRecords = await this.affectedRecords(e, steps);

    return {
      ...summary,
      payload: parseRedacted(e.payload),
      steps,
      singleResult: log.single ?? null,
      actions: steps
        .filter(s => s.type === 'action')
        .map(s => ({
          ref: s.ref,
          action: s.action,
          label: s.label,
          status: s.status,
          durationMs: s.durationMs ?? null,
          affected: s.result?.affected ?? 0,
          message: s.result?.message ?? s.error ?? null,
        })),
      affectedRecords,
      tasks: tasks.map(t => ({
        id: t.id,
        kind: t.kind,
        title: t.title,
        status: t.status,
        approverId: t.approverId,
        dueAt: t.dueAt,
        decidedAt: t.decidedAt,
        history: parseHistory(t.historyJson),
      })),
      context: {
        triggeredBy: summary.triggeredBy,
        triggeredByName: summary.triggeredByName,
        targetUserId: e.targetUserId,
        scheduleId: e.scheduleId,
        eventId: e.eventId,
      },
      correlation: { id: e.correlationId, related },
      retry: {
        attempt: e.attempt,
        nextRetryAt: e.nextRetryAt,
        resumeAt: e.resumeAt,
        canRerun: e.status === 'FAILED' || e.status === 'CANCELLED',
      },
      cancellation: e.cancelledBy
        ? { by: e.cancelledBy, reason: e.cancelReason, at: e.finishedAt }
        : null,
      canCancel: !TERMINAL.includes(e.status) || (e.status === 'FAILED' && !!e.nextRetryAt),
    };
  }

  /** Referências aos registos envolvidos: o do evento + os utilizadores afectados. */
  private async affectedRecords(e: ExecRow, steps: FlowStepLog[]) {
    const out: Array<{ type: string; id: string }> = [];
    try {
      const p = e.payload ? (JSON.parse(e.payload) as Record<string, unknown>) : {};
      if (p.recordId !== undefined) {
        out.push({ type: String(p.recordType ?? 'RECORD'), id: String(p.recordId) });
      }
    } catch {
      /* payload ilegível — só o utilizador alvo */
    }
    if (e.targetUserId) out.push({ type: 'User', id: e.targetUserId });
    const total = steps.reduce((n, s) => n + (s.result?.affected ?? 0), 0);
    return { references: out, totalAffected: total };
  }

  /** Cancela uma execução ainda não terminada (e as tarefas de aprovação abertas). */
  async cancel(id: string, userId: number, reason?: string) {
    const e = await this.prisma.automationExecution.findUnique({ where: { id } });
    if (!e) throw new NotFoundException('Execução não encontrada');
    const cancellable =
      e.status === 'PENDING' ||
      e.status === 'RUNNING' ||
      e.status === 'WAITING_APPROVAL' ||
      (e.status === 'FAILED' && !!e.nextRetryAt);
    if (!cancellable) {
      throw new BadRequestException('Só é possível cancelar execuções ainda não terminadas');
    }
    const claimed = await this.prisma.automationExecution.updateMany({
      where: { id, status: e.status },
      data: {
        status: 'CANCELLED',
        finishedAt: new Date(),
        resumeAt: null,
        nextRetryAt: null,
        currentStep: null,
        cancelledBy: String(userId),
        cancelReason: reason ?? 'Cancelada manualmente',
      },
    });
    if (claimed.count === 0) {
      throw new BadRequestException('A execução mudou de estado entretanto — actualize a lista');
    }
    const now = new Date();
    const openTasks = await this.prisma.automationTask.findMany({
      where: { executionId: id, status: 'PENDING' },
    });
    for (const t of openTasks) {
      await this.prisma.automationTask.update({
        where: { id: t.id },
        data: {
          status: 'CANCELLED',
          decidedAt: now,
          decidedBy: userId,
          decisionComment: 'Execução cancelada',
          historyJson: JSON.stringify([
            ...parseHistory(t.historyJson),
            {
              at: now.toISOString(),
              by: userId,
              action: 'CANCELLED',
              comment: 'Execução cancelada',
            },
          ]),
        },
      });
    }
    await this.prisma.auditLog.create({
      data: {
        userId,
        action: 'AUTOMATION_EXECUTION_CANCELLED',
        entity: 'AutomationRule',
        entityId: e.ruleId,
        changes: JSON.stringify({ executionId: id, reason: reason ?? null }),
      },
    });
    return { id, status: 'CANCELLED', cancelledTasks: openTasks.length };
  }

  async exportCsv(f: HistoryFilterDto = {}) {
    const rows = await this.prisma.automationExecution.findMany({
      where: this.buildWhere(f),
      orderBy: { startedAt: 'desc' },
      take: 10000,
      include: { rule: { select: { id: true, name: true, module: true, trigger: true } } },
    });
    const items = await this.decorate(rows);
    return toCsv(
      [
        'ID',
        'Automação',
        'Versão',
        'Módulo',
        'Origem',
        'Início',
        'Fim',
        'Duração (ms)',
        'Estado',
        'Etapa',
        'Tentativas',
        'Registos afectados',
        'Código de erro',
        'Erro',
        'Iniciada por',
        'Correlação',
      ],
      items.map(i => [
        i.id,
        i.rule.name,
        i.ruleVersion,
        i.rule.module,
        i.origin.kind,
        i.startedAt,
        i.finishedAt,
        i.durationMs,
        i.displayStatus,
        i.currentStep,
        i.attempt,
        i.affected,
        i.error?.code,
        i.error?.message,
        i.triggeredByName ?? i.triggeredBy,
        i.correlationId,
      ]),
    );
  }
}
