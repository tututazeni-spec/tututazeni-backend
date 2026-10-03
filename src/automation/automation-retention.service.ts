// src/automation/automation-retention.service.ts
// §10 — política de retenção e arquivo do histórico, e protecção de dados pessoais
// nos registos: passado `archiveAfterDays`, o payload e o utilizador-alvo de uma
// execução terminada são removidos (a linha fica para estatística); passado
// `retentionDays`, a execução é apagada. Corre diariamente e a pedido (com dry-run).
import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AutomationAuditService } from './automation-audit.service';
import { AutomationSettingsService } from './automation-settings.service';

const DAY_MS = 86_400_000;
const daysAgo = (n: number) => new Date(Date.now() - n * DAY_MS);

/** Execuções que já não vão mudar (não estão em curso, em espera nem agendadas para repetir). */
const TERMINAL: Prisma.AutomationExecutionWhereInput = {
  status: { in: ['SUCCESS', 'FAILED', 'SKIPPED', 'CANCELLED'] },
  nextRetryAt: null,
  resumeAt: null,
};

export interface RetentionResult {
  dryRun: boolean;
  archived: number;
  executionsDeleted: number;
  eventsDeleted: number;
  deadLettersDeleted: number;
  auditLogsDeleted: number;
}

@Injectable()
export class AutomationRetentionService {
  private readonly logger = new Logger(AutomationRetentionService.name);
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: AutomationSettingsService,
    private readonly audit: AutomationAuditService,
  ) {}

  @Cron('30 3 * * *')
  async nightly() {
    if (this.running) return;
    this.running = true;
    try {
      await this.run({ dryRun: false });
    } catch (e: unknown) {
      this.logger.error({
        err: { message: e instanceof Error ? e.message : String(e) },
        msg: 'Falha na rotina de retenção da automação',
      });
    } finally {
      this.running = false;
    }
  }

  async run(opts: { dryRun?: boolean; userId?: number } = {}): Promise<RetentionResult> {
    const dryRun = opts.dryRun ?? false;
    const limits = await this.settings.get();
    const archiveBefore = daysAgo(limits.archiveAfterDays);
    const deleteBefore = daysAgo(limits.retentionDays);

    const toArchive: Prisma.AutomationExecutionWhereInput = {
      ...TERMINAL,
      archivedAt: null,
      startedAt: { lt: archiveBefore, gte: deleteBefore },
    };
    const toDelete: Prisma.AutomationExecutionWhereInput = {
      ...TERMINAL,
      startedAt: { lt: deleteBefore },
    };
    const oldDeadLetters: Prisma.AutomationDeadLetterWhereInput = {
      status: { not: 'OPEN' },
      createdAt: { lt: daysAgo(limits.deadLetterRetentionDays) },
    };
    const oldAudit: Prisma.AutomationAuditLogWhereInput = {
      createdAt: { lt: daysAgo(limits.auditRetentionDays) },
    };
    const oldEvents: Prisma.AutomationEventWhereInput = { occurredAt: { lt: deleteBefore } };

    let result: RetentionResult;
    if (dryRun) {
      const [archived, executionsDeleted, eventsDeleted, deadLettersDeleted, auditLogsDeleted] =
        await Promise.all([
          this.prisma.automationExecution.count({ where: toArchive }),
          this.prisma.automationExecution.count({ where: toDelete }),
          this.prisma.automationEvent.count({ where: oldEvents }),
          this.prisma.automationDeadLetter.count({ where: oldDeadLetters }),
          this.prisma.automationAuditLog.count({ where: oldAudit }),
        ]);
      result = { dryRun, archived, executionsDeleted, eventsDeleted, deadLettersDeleted, auditLogsDeleted };
    } else {
      // Arquivo primeiro (remove dados pessoais), depois a eliminação do que expirou.
      const archived = await this.prisma.automationExecution.updateMany({
        where: toArchive,
        data: {
          payload: null,
          targetUserId: null,
          actionsLog: null,
          errorMessage: null,
          archivedAt: new Date(),
        },
      });
      const executionsDeleted = await this.prisma.automationExecution.deleteMany({
        where: toDelete,
      });
      const eventsDeleted = await this.prisma.automationEvent.deleteMany({ where: oldEvents });
      const deadLettersDeleted = await this.prisma.automationDeadLetter.deleteMany({
        where: oldDeadLetters,
      });
      const auditLogsDeleted = await this.prisma.automationAuditLog.deleteMany({ where: oldAudit });
      result = {
        dryRun,
        archived: archived.count,
        executionsDeleted: executionsDeleted.count,
        eventsDeleted: eventsDeleted.count,
        deadLettersDeleted: deadLettersDeleted.count,
        auditLogsDeleted: auditLogsDeleted.count,
      };
      await this.audit.record({
        entity: 'RETENTION',
        action: 'RETENTION_RUN',
        userId: opts.userId,
        after: result,
      });
    }
    return result;
  }
}
