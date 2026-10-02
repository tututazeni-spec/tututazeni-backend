// src/avatar-training/avatar-training-retention.service.ts
// Fase 8 — privacidade (docs/Avatar_Training.md §15): retenção e eliminação de
// transcrições. O texto livre das conversas (mensagens do formando, pedidos de
// ajuda e respostas do avatar) é anonimizado após AVATAR_TRAINING_RETENTION_DAYS
// (por omissão 365; 0 desactiva). As respostas avaliadas (USER_ANSWER), notas e
// evidência de competências ficam — são registo pedagógico, não transcrição.
// Tentativas em curso nunca são tocadas.
import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/services/audit.service';

export const REDACTED_CONTENT = '[removido por política de retenção]';
const DEFAULT_RETENTION_DAYS = 365;
const FREE_TEXT_TYPES = ['USER_MESSAGE', 'HELP_REQUEST', 'AVATAR_MESSAGE'] as const;
const OPEN_STATES = ['IN_PROGRESS', 'PAUSED'] as const;

@Injectable()
export class AvatarTrainingRetentionService {
  private readonly logger = new Logger(AvatarTrainingRetentionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  retentionDays(): number {
    const raw = Number(process.env.AVATAR_TRAINING_RETENTION_DAYS);
    return Number.isFinite(raw) && raw >= 0 && process.env.AVATAR_TRAINING_RETENTION_DAYS
      ? Math.floor(raw)
      : DEFAULT_RETENTION_DAYS;
  }

  /** Anonimiza transcrições antigas de tentativas fechadas. Idempotente. */
  async purgeExpiredTranscripts(userId?: number, now = new Date()) {
    const days = this.retentionDays();
    if (days === 0) return { enabled: false, retentionDays: 0, redacted: 0 };

    const cutoff = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
    const result = await this.prisma.avatarTrainingInteraction.updateMany({
      where: {
        interactionType: { in: [...FREE_TEXT_TYPES] },
        content: { not: REDACTED_CONTENT },
        createdAt: { lt: cutoff },
        attempt: { status: { notIn: [...OPEN_STATES] } },
      },
      data: { content: REDACTED_CONTENT, metadata: null },
    });

    // A rotina agendada não tem utilizador (AuditLog.userId é FK) — fica só no log.
    if (result.count > 0 && userId !== undefined) {
      await this.audit.log({
        userId,
        action: 'DELETE',
        entity: 'AvatarTrainingInteraction',
        metadata: { policy: 'RETENTION', retentionDays: days, redacted: result.count },
      });
    }
    return { enabled: true, retentionDays: days, cutoff, redacted: result.count };
  }

  @Cron('0 3 * * *')
  async scheduledPurge() {
    try {
      const r = await this.purgeExpiredTranscripts();
      if (r.redacted) this.logger.log(`Retenção: ${r.redacted} interacções anonimizadas`);
    } catch (e) {
      this.logger.warn({
        action: 'AVATAR_TRAINING_RETENTION',
        err: { message: e instanceof Error ? e.message : String(e) },
        msg: 'Falha na rotina de retenção',
      });
    }
  }
}
