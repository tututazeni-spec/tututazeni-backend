// src/automation/automation-tasks.service.ts
// §8 — Aprovações e tarefas: acompanhamento das acções que não podem ser
// totalmente automáticas. Uma automação pede, só uma pessoa decide.
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { calculatePagination, buildPaginatedResponse } from '../common/helpers/pagination.helper';
import { createNotificationSafe } from '../common/helpers/notification.helper';
import { CurrentUserData } from '../common/decorators';
import { AutomationService } from './automation.service';
import { DecideTaskDto, ReassignTaskDto, TaskFilterDto } from './automation.dto';
import {
  appendHistory,
  canDecide,
  nextEscalationAction,
  parseHistory,
} from './automation-tasks.util';
import { toCsv } from './automation-csv.util';
import { writeChainedAuditLog } from '../common/helpers/audit-chain';

type TaskRow = Prisma.AutomationTaskGetPayload<object>;

const PRIVILEGED = ['ADMIN', 'RH'];
const isPrivileged = (u: CurrentUserData) => PRIVILEGED.includes(u.role?.name ?? '');

@Injectable()
export class AutomationTasksService {
  private readonly logger = new Logger(AutomationTasksService.name);
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly automation: AutomationService,
  ) {}

  // ─── Leitura ──────────────────────────────────────────────────

  private buildWhere(f: TaskFilterDto, user: CurrentUserData): Prisma.AutomationTaskWhereInput {
    const and: Prisma.AutomationTaskWhereInput[] = [];
    // Quem não é ADMIN/RH só vê as tarefas em que é aprovador ou substituto.
    if (!isPrivileged(user) || f.mine) {
      and.push({ OR: [{ approverId: user.id }, { substituteId: user.id }] });
    }
    if (f.status) and.push({ status: f.status });
    if (f.kind) and.push({ kind: f.kind });
    if (f.priority) and.push({ priority: f.priority });
    if (f.ruleId) and.push({ ruleId: f.ruleId });
    if (f.module) and.push({ module: f.module });
    if (f.approverId) and.push({ approverId: f.approverId });
    if (f.overdue) and.push({ status: 'PENDING', dueAt: { lt: new Date() } });
    if (f.from || f.to) {
      and.push({
        createdAt: {
          ...(f.from ? { gte: new Date(f.from) } : {}),
          ...(f.to ? { lte: new Date(f.to) } : {}),
        },
      });
    }
    if (f.search?.trim()) {
      const q = f.search.trim();
      and.push({
        OR: [
          { title: { contains: q, mode: 'insensitive' } },
          { description: { contains: q, mode: 'insensitive' } },
          { recordId: { contains: q } },
        ],
      });
    }
    return and.length ? { AND: and } : {};
  }

  private async decorate(rows: TaskRow[]) {
    const userIds = new Set<number>();
    const ruleIds = new Set<number>();
    for (const t of rows) {
      userIds.add(t.approverId);
      if (t.substituteId) userIds.add(t.substituteId);
      if (t.escalateToId) userIds.add(t.escalateToId);
      if (t.decidedBy) userIds.add(t.decidedBy);
      if (t.ruleId) ruleIds.add(t.ruleId);
    }
    const users = userIds.size
      ? await this.prisma.read.user.findMany({
          where: { id: { in: [...userIds] } },
          select: { id: true, fullName: true },
        })
      : [];
    const rules = ruleIds.size
      ? await this.prisma.read.automationRule.findMany({
          where: { id: { in: [...ruleIds] } },
          select: { id: true, name: true },
        })
      : [];
    const name = new Map<number, string>(users.map(u => [u.id, u.fullName]));
    const ruleName = new Map<number, string>(rules.map(r => [r.id, r.name]));
    const now = Date.now();
    return rows.map(t => ({
      id: t.id,
      kind: t.kind,
      title: t.title,
      description: t.description,
      automation: t.ruleId ? { id: t.ruleId, name: ruleName.get(t.ruleId) ?? null } : null,
      executionId: t.executionId,
      module: t.module,
      record: t.recordId ? { type: t.recordType ?? 'RECORD', id: t.recordId } : null,
      approver: { id: t.approverId, name: name.get(t.approverId) ?? null },
      substitute: t.substituteId
        ? { id: t.substituteId, name: name.get(t.substituteId) ?? null }
        : null,
      escalation: t.escalateToId
        ? {
            toId: t.escalateToId,
            toName: name.get(t.escalateToId) ?? null,
            afterHours: t.escalateAfterHours,
            escalatedAt: t.escalatedAt,
          }
        : null,
      priority: t.priority,
      status: t.status,
      createdAt: t.createdAt,
      dueAt: t.dueAt,
      overdue: t.status === 'PENDING' && !!t.dueAt && t.dueAt.getTime() < now,
      decidedAt: t.decidedAt,
      decidedBy: t.decidedBy ? { id: t.decidedBy, name: name.get(t.decidedBy) ?? null } : null,
      decisionComment: t.decisionComment,
    }));
  }

  async list(f: TaskFilterDto, user: CurrentUserData) {
    const { page = 1, limit = 30 } = f;
    const { skip, take } = calculatePagination(page, limit);
    const where = this.buildWhere(f, user);
    const [rows, total] = await Promise.all([
      this.prisma.automationTask.findMany({
        where,
        skip,
        take,
        orderBy: [
          { status: 'asc' },
          { dueAt: { sort: 'asc', nulls: 'last' } },
          { createdAt: 'desc' },
        ],
      }),
      this.prisma.automationTask.count({ where }),
    ]);
    return buildPaginatedResponse(await this.decorate(rows), total, page, limit);
  }

  /** Cartões da secção: pendentes, em atraso, e cumprimento de prazos (últimos 30 dias). */
  async summary(user: CurrentUserData) {
    const base = this.buildWhere({}, user);
    const now = new Date();
    const since = new Date(now.getTime() - 30 * 24 * 3_600_000);
    const [pending, overdue, decided] = await Promise.all([
      this.prisma.automationTask.count({ where: { AND: [base, { status: 'PENDING' }] } }),
      this.prisma.automationTask.count({
        where: { AND: [base, { status: 'PENDING', dueAt: { lt: now } }] },
      }),
      this.prisma.automationTask.findMany({
        where: {
          AND: [
            base,
            {
              status: { in: ['APPROVED', 'REJECTED', 'COMPLETED', 'EXPIRED'] },
              decidedAt: { gte: since },
            },
          ],
        },
        select: { status: true, dueAt: true, decidedAt: true },
        take: 5000,
      }),
    ]);
    const withDue = decided.filter(t => t.dueAt && t.decidedAt);
    const onTime = withDue.filter(
      t => t.status !== 'EXPIRED' && (t.decidedAt as Date) <= (t.dueAt as Date),
    ).length;
    return {
      pending,
      overdue,
      decidedLast30Days: decided.length,
      deadline: {
        onTime,
        late: withDue.length - onTime,
        onTimeRate: withDue.length ? +((onTime / withDue.length) * 100).toFixed(1) : null,
      },
    };
  }

  private async load(id: string, user: CurrentUserData): Promise<TaskRow> {
    const t = await this.prisma.automationTask.findUnique({ where: { id } });
    if (!t) throw new NotFoundException('Tarefa não encontrada');
    if (!isPrivileged(user) && !canDecide(t, user.id, false) && t.createdBy !== user.id) {
      throw new ForbiddenException('Sem acesso a esta tarefa');
    }
    return t;
  }

  async detail(id: string, user: CurrentUserData) {
    const t = await this.load(id, user);
    const [item] = await this.decorate([t]);
    const execution = t.executionId
      ? await this.prisma.automationExecution.findUnique({
          where: { id: t.executionId },
          select: { id: true, status: true, startedAt: true, correlationId: true },
        })
      : null;
    return {
      ...item,
      history: parseHistory(t.historyJson),
      execution,
      canDecide: t.status === 'PENDING' && canDecide(t, user.id, isPrivileged(user)),
    };
  }

  async exportCsv(f: TaskFilterDto, user: CurrentUserData) {
    const rows = await this.prisma.automationTask.findMany({
      where: this.buildWhere(f, user),
      orderBy: { createdAt: 'desc' },
      take: 10000,
    });
    const items = await this.decorate(rows);
    return toCsv(
      [
        'ID',
        'Tipo',
        'Título',
        'Automação',
        'Módulo',
        'Registo',
        'Aprovador',
        'Prioridade',
        'Estado',
        'Criada em',
        'Prazo',
        'Decidida em',
        'Decisão por',
        'Justificação',
      ],
      items.map(i => [
        i.id,
        i.kind,
        i.title,
        i.automation?.name,
        i.module,
        i.record ? `${i.record.type}:${i.record.id}` : '',
        i.approver.name ?? i.approver.id,
        i.priority,
        i.status,
        i.createdAt,
        i.dueAt,
        i.decidedAt,
        i.decidedBy?.name ?? i.decidedBy?.id,
        i.decisionComment,
      ]),
    );
  }

  // ─── Decisão ──────────────────────────────────────────────────

  async decide(id: string, dto: DecideTaskDto, user: CurrentUserData) {
    const t = await this.load(id, user);
    if (t.status !== 'PENDING') {
      throw new BadRequestException('Esta tarefa já não está pendente');
    }
    if (!canDecide(t, user.id, isPrivileged(user))) {
      throw new ForbiddenException('Só o aprovador, o substituto ou a administração podem decidir');
    }
    if (t.kind === 'TASK' && dto.decision !== 'COMPLETE') {
      throw new BadRequestException('Uma tarefa conclui-se (COMPLETE), não se aprova nem recusa');
    }
    if (t.kind === 'APPROVAL' && dto.decision === 'COMPLETE') {
      throw new BadRequestException('Um pedido de aprovação aprova-se ou recusa-se');
    }
    const comment = dto.comment?.trim();
    if (dto.decision === 'REJECT' && !comment) {
      throw new BadRequestException('Indique a justificação ao recusar');
    }
    const status =
      dto.decision === 'APPROVE'
        ? 'APPROVED'
        : dto.decision === 'REJECT'
          ? 'REJECTED'
          : 'COMPLETED';
    const now = new Date();
    const claimed = await this.prisma.automationTask.updateMany({
      where: { id, status: 'PENDING' },
      data: {
        status,
        decidedAt: now,
        decidedBy: user.id,
        decisionComment: comment ?? null,
        historyJson: appendHistory(t.historyJson, { by: user.id, action: status, comment }, now),
      },
    });
    if (claimed.count === 0) {
      throw new BadRequestException('A tarefa foi decidida entretanto por outra pessoa');
    }
    const resume = t.executionId
      ? await this.automation.resumeAfterTask(
          t.executionId,
          status as 'APPROVED' | 'REJECTED' | 'COMPLETED',
          id,
          comment,
        )
      : null;
    await this.audit(user.id, `AUTOMATION_TASK_${status}`, t, { comment: comment ?? null });
    return { id, status, resume };
  }

  async addComment(id: string, comment: string, user: CurrentUserData) {
    const t = await this.load(id, user);
    await this.prisma.automationTask.update({
      where: { id },
      data: {
        historyJson: appendHistory(t.historyJson, { by: user.id, action: 'COMMENTED', comment }),
      },
    });
    return {
      id,
      history: parseHistory(
        appendHistory(t.historyJson, { by: user.id, action: 'COMMENTED', comment }),
      ),
    };
  }

  /** Substituição manual do aprovador (ausências). */
  async reassign(id: string, dto: ReassignTaskDto, user: CurrentUserData) {
    const t = await this.load(id, user);
    if (t.status !== 'PENDING') throw new BadRequestException('Esta tarefa já não está pendente');
    if (!isPrivileged(user) && t.approverId !== user.id) {
      throw new ForbiddenException('Só o aprovador actual ou a administração podem reatribuir');
    }
    if (dto.approverId === t.approverId) {
      throw new BadRequestException('A tarefa já está atribuída a essa pessoa');
    }
    const target = await this.prisma.read.user.findUnique({
      where: { id: dto.approverId },
      select: { id: true, fullName: true },
    });
    if (!target) throw new NotFoundException('Novo aprovador não encontrado');
    await this.prisma.automationTask.update({
      where: { id },
      data: {
        approverId: dto.approverId,
        historyJson: appendHistory(t.historyJson, {
          by: user.id,
          action: 'REASSIGNED',
          from: t.approverId,
          to: dto.approverId,
          comment: dto.comment,
        }),
      },
    });
    await createNotificationSafe(this.prisma, this.logger, {
      userId: dto.approverId,
      type: 'AUTOMATION_TASK',
      message: `Tarefa reatribuída a si: ${t.title}`,
    });
    await this.audit(user.id, 'AUTOMATION_TASK_REASSIGNED', t, { to: dto.approverId });
    return { id, approverId: dto.approverId, approverName: target.fullName };
  }

  async cancel(id: string, reason: string | undefined, user: CurrentUserData) {
    const t = await this.load(id, user);
    if (t.status !== 'PENDING') throw new BadRequestException('Esta tarefa já não está pendente');
    if (!isPrivileged(user) && t.createdBy !== user.id) {
      throw new ForbiddenException('Só quem criou a tarefa ou a administração a podem cancelar');
    }
    const now = new Date();
    const claimed = await this.prisma.automationTask.updateMany({
      where: { id, status: 'PENDING' },
      data: {
        status: 'CANCELLED',
        decidedAt: now,
        decidedBy: user.id,
        decisionComment: reason ?? null,
        historyJson: appendHistory(
          t.historyJson,
          { by: user.id, action: 'CANCELLED', comment: reason },
          now,
        ),
      },
    });
    if (claimed.count === 0) throw new BadRequestException('A tarefa mudou de estado entretanto');
    const resume = t.executionId
      ? await this.automation.resumeAfterTask(t.executionId, 'CANCELLED', id, reason)
      : null;
    await this.audit(user.id, 'AUTOMATION_TASK_CANCELLED', t, { reason: reason ?? null });
    return { id, status: 'CANCELLED', resume };
  }

  // ─── Escalonamento e expiração ────────────────────────────────

  @Cron('*/5 * * * *')
  async tick() {
    if (this.running) return;
    this.running = true;
    try {
      await this.processDue();
    } catch (e: unknown) {
      this.logger.error({
        err: { message: e instanceof Error ? e.message : String(e) },
        msg: 'Falha no ciclo de escalonamento das aprovações de automação',
      });
    } finally {
      this.running = false;
    }
  }

  /** Escala as tarefas sem decisão a tempo e expira as que passaram o prazo. */
  async processDue(now = new Date()) {
    const candidates = await this.prisma.automationTask.findMany({
      where: {
        status: 'PENDING',
        OR: [{ dueAt: { lte: now } }, { escalateToId: { not: null }, escalatedAt: null }],
      },
      orderBy: { createdAt: 'asc' },
      take: 200,
    });
    let escalated = 0;
    let expired = 0;
    for (const t of candidates) {
      const action = nextEscalationAction(t, now);
      if (action === 'ESCALATE' && t.escalateToId) {
        const extendDue = t.dueAt && t.dueAt <= now && t.escalateAfterHours;
        const claimed = await this.prisma.automationTask.updateMany({
          where: { id: t.id, status: 'PENDING', escalatedAt: null },
          data: {
            approverId: t.escalateToId,
            escalatedAt: now,
            ...(extendDue
              ? { dueAt: new Date(now.getTime() + (t.escalateAfterHours as number) * 3_600_000) }
              : {}),
            historyJson: appendHistory(
              t.historyJson,
              {
                by: null,
                action: 'ESCALATED',
                from: t.approverId,
                to: t.escalateToId,
                comment: `Sem decisão ao fim de ${t.escalateAfterHours} h`,
              },
              now,
            ),
          },
        });
        if (claimed.count) {
          escalated++;
          await createNotificationSafe(this.prisma, this.logger, {
            userId: t.escalateToId,
            type: 'AUTOMATION_TASK',
            message: `Tarefa escalada para si: ${t.title}`,
          });
        }
      } else if (action === 'EXPIRE') {
        const claimed = await this.prisma.automationTask.updateMany({
          where: { id: t.id, status: 'PENDING' },
          data: {
            status: 'EXPIRED',
            decidedAt: now,
            historyJson: appendHistory(
              t.historyJson,
              { by: null, action: 'EXPIRED', comment: 'Prazo ultrapassado sem decisão' },
              now,
            ),
          },
        });
        if (claimed.count) {
          expired++;
          if (t.executionId) {
            await this.automation.resumeAfterTask(t.executionId, 'EXPIRED', t.id);
          }
        }
      }
    }
    return { escalated, expired };
  }

  private async audit(userId: number, action: string, t: TaskRow, extra: Record<string, unknown>) {
    try {
      await writeChainedAuditLog(this.prisma, {
        userId,
        action,
        entity: 'AutomationTask',
        changes: JSON.stringify({ taskId: t.id, ruleId: t.ruleId, title: t.title, ...extra }),
      });
    } catch (e: unknown) {
      this.logger.warn({
        taskId: t.id,
        action,
        err: { message: e instanceof Error ? e.message : String(e) },
        msg: 'Falha ao registar auditoria da tarefa',
      });
    }
  }
}
