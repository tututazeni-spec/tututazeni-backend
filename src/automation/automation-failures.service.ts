// src/automation/automation-failures.service.ts
// §10/§12 — execuções que falharam depois de esgotadas as tentativas ficam na
// "dead letter" (investigáveis, reprocessáveis ou descartáveis) e as falhas
// persistentes de uma automação geram um alerta aos responsáveis.
import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { calculatePagination, buildPaginatedResponse } from '../common/helpers/pagination.helper';
import { createNotificationSafe } from '../common/helpers/notification.helper';
import { DeadLetterFilterDto } from './automation-governance.dto';
import { AutomationAuditService } from './automation-audit.service';
import { AutomationSettingsService } from './automation-settings.service';
import { parseRedacted, redactSensitive } from './automation-redact.util';
import { failureCode } from './automation-failure.util';
import { toCsv } from './automation-csv.util';

export interface DeadLetterInput {
  ruleId: number;
  executionId: string | null;
  attempts: number;
  error?: string;
  payload?: Record<string, unknown>;
  eventId?: string;
  correlationId?: string;
}

@Injectable()
export class AutomationFailuresService {
  private readonly logger = new Logger(AutomationFailuresService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: AutomationSettingsService,
    private readonly audit: AutomationAuditService,
  ) {}

  /** Regista (ou actualiza) a dead letter da execução. Best-effort. */
  async registerDeadLetter(input: DeadLetterInput) {
    try {
      const data = {
        attempts: input.attempts,
        errorCode: failureCode(input.error),
        errorMessage: input.error?.slice(0, 1000),
        payload: input.payload ? JSON.stringify(redactSensitive(input.payload)) : undefined,
        eventId: input.eventId,
        correlationId: input.correlationId,
      };
      const existing = input.executionId
        ? await this.prisma.automationDeadLetter.findFirst({
            where: { executionId: input.executionId, status: 'OPEN' },
            select: { id: true },
          })
        : null;
      if (existing) {
        await this.prisma.automationDeadLetter.update({ where: { id: existing.id }, data });
      } else {
        await this.prisma.automationDeadLetter.create({
          data: { ruleId: input.ruleId, executionId: input.executionId, ...data },
        });
      }
    } catch (e: unknown) {
      this.logger.warn({
        ruleId: input.ruleId,
        err: { message: e instanceof Error ? e.message : String(e) },
        msg: 'Falha ao registar a dead letter da automação',
      });
    }
  }

  /**
   * Se o número de falhas definitivas na janela atingir o limite, alerta o
   * responsável e os administradores — no máximo uma vez por janela.
   */
  async alertIfPersistent(rule: { id: number; name: string; ownerId: string | null }) {
    try {
      const limits = await this.settings.get();
      const windowMs = limits.failureAlertWindowMinutes * 60_000;
      const since = new Date(Date.now() - windowMs);
      const failures = await this.prisma.automationDeadLetter.count({
        where: { ruleId: rule.id, createdAt: { gte: since } },
      });
      if (failures < limits.failureAlertThreshold) return false;
      // Reclamação atómica do alerta: só uma réplica notifica por janela.
      const claimed = await this.prisma.automationRule.updateMany({
        where: {
          id: rule.id,
          OR: [{ lastFailureAlertAt: null }, { lastFailureAlertAt: { lt: since } }],
        },
        data: { lastFailureAlertAt: new Date() },
      });
      if (claimed.count === 0) return false;

      const admins = await this.prisma.read.user.findMany({
        where: { active: true, role: { name: 'ADMIN' } },
        select: { id: true },
        take: 20,
      });
      const recipients = new Set(admins.map(a => a.id));
      if (rule.ownerId && /^\d+$/.test(rule.ownerId)) recipients.add(Number(rule.ownerId));
      for (const userId of recipients) {
        await createNotificationSafe(this.prisma, this.logger, {
          userId,
          type: 'AUTOMATION_PERSISTENT_FAILURE',
          message: `A automação "${rule.name}" falhou ${failures} vezes nos últimos ${limits.failureAlertWindowMinutes} minutos`,
          metadata: { ruleId: rule.id, failures },
        });
      }
      await this.audit.record({
        entity: 'RULE',
        entityId: rule.id,
        ruleId: rule.id,
        action: 'AUTOMATION_PERSISTENT_FAILURE_ALERT',
        note: `${failures} falhas definitivas em ${limits.failureAlertWindowMinutes} min`,
      });
      return true;
    } catch (e: unknown) {
      this.logger.warn({
        ruleId: rule.id,
        err: { message: e instanceof Error ? e.message : String(e) },
        msg: 'Falha ao avaliar alerta de falhas persistentes',
      });
      return false;
    }
  }

  // ─── Consulta e tratamento ────────────────────────────────────

  private buildWhere(f: DeadLetterFilterDto, scopeRuleIds?: number[] | null) {
    const where: Prisma.AutomationDeadLetterWhereInput = {};
    if (f.status) where.status = f.status;
    if (f.ruleId) where.ruleId = f.ruleId;
    if (scopeRuleIds) where.ruleId = f.ruleId ? (scopeRuleIds.includes(f.ruleId) ? f.ruleId : -1) : { in: scopeRuleIds };
    if (f.from || f.to) {
      where.createdAt = {
        ...(f.from ? { gte: new Date(f.from) } : {}),
        ...(f.to ? { lte: new Date(f.to) } : {}),
      };
    }
    return where;
  }

  async list(f: DeadLetterFilterDto = {}, scopeRuleIds?: number[] | null) {
    const { page = 1, limit = 30 } = f;
    const { skip, take } = calculatePagination(page, limit);
    const where = this.buildWhere(f, scopeRuleIds);
    const [rows, total] = await Promise.all([
      this.prisma.automationDeadLetter.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.automationDeadLetter.count({ where }),
    ]);
    const rules = await this.prisma.read.automationRule.findMany({
      where: { id: { in: [...new Set(rows.map(r => r.ruleId))] } },
      select: { id: true, name: true },
    });
    const name = new Map(rules.map(r => [r.id, r.name]));
    const data = rows.map(r => ({
      ...r,
      ruleName: name.get(r.ruleId) ?? null,
      payload: parseRedacted(r.payload),
    }));
    return buildPaginatedResponse(data, total, page, limit);
  }

  async summary(scopeRuleIds?: number[] | null) {
    const where: Prisma.AutomationDeadLetterWhereInput = scopeRuleIds
      ? { ruleId: { in: scopeRuleIds } }
      : {};
    const grouped = await this.prisma.automationDeadLetter.groupBy({
      by: ['status'],
      where,
      _count: { _all: true },
    });
    const count = (s: string) => grouped.find(g => g.status === s)?._count._all ?? 0;
    return { open: count('OPEN'), reprocessed: count('REPROCESSED'), discarded: count('DISCARDED') };
  }

  async exportCsv(f: DeadLetterFilterDto = {}, scopeRuleIds?: number[] | null) {
    const rows = await this.prisma.automationDeadLetter.findMany({
      where: this.buildWhere(f, scopeRuleIds),
      orderBy: { createdAt: 'desc' },
      take: 5000,
    });
    return toCsv(
      ['Data', 'Automação', 'Execução', 'Tentativas', 'Código', 'Erro', 'Estado'],
      rows.map(r => [r.createdAt, r.ruleId, r.executionId, r.attempts, r.errorCode, r.errorMessage, r.status]),
    );
  }

  private async findOpen(id: string) {
    const row = await this.prisma.automationDeadLetter.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('Registo não encontrado');
    if (row.status !== 'OPEN') throw new BadRequestException('Este registo já foi tratado');
    return row;
  }

  /** Reexecuta a execução original (delegado em `run`) e fecha o registo se correr bem. */
  async reprocess(
    id: string,
    userId: number,
    run: (executionId: string) => Promise<{ status?: string; message?: string }>,
  ) {
    const row = await this.findOpen(id);
    if (!row.executionId) throw new BadRequestException('O registo não tem execução associada');
    const result = await run(row.executionId);
    const ok = result.status === 'SUCCESS';
    if (ok) {
      await this.prisma.automationDeadLetter.update({
        where: { id },
        data: { status: 'REPROCESSED', resolvedAt: new Date(), resolvedBy: userId },
      });
    }
    await this.audit.record({
      entity: 'DEAD_LETTER',
      action: ok ? 'DEAD_LETTER_REPROCESSED' : 'DEAD_LETTER_REPROCESS_FAILED',
      entityId: id,
      ruleId: row.ruleId,
      userId,
      note: result.status ?? result.message,
    });
    return { reprocessed: ok, result };
  }

  async discard(id: string, userId: number, note?: string) {
    const row = await this.findOpen(id);
    const updated = await this.prisma.automationDeadLetter.update({
      where: { id },
      data: { status: 'DISCARDED', resolvedAt: new Date(), resolvedBy: userId, resolutionNote: note },
    });
    await this.audit.record({
      entity: 'DEAD_LETTER',
      action: 'DEAD_LETTER_DISCARDED',
      entityId: id,
      ruleId: row.ruleId,
      userId,
      note,
    });
    return updated;
  }
}
