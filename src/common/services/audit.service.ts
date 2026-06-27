// src/common/services/audit.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';

interface AuditLogInput {
  action: string;
  entity?: string;
  entityType?: string;
  entityId?: number | string;
  userId: number | string;
  metadata?: Record<string, any>;
  details?: Record<string, any>;
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue('audit') private readonly auditQueue: Queue,
    private readonly config: ConfigService,
  ) {}

  private get queueEnabled(): boolean {
    return this.config.get<string>('QUEUE_ENABLED', 'true') !== 'false';
  }

  async log(input: AuditLogInput): Promise<void> {
    await this.enqueueOrWrite({
      action: input.action,
      entity: input.entity ?? input.entityType ?? 'Unknown',
      entityId: input.entityId !== undefined ? Number(input.entityId) : undefined,
      userId: Number(input.userId),
      metadata: (input.metadata ?? input.details) as any,
    });
  }

  /**
   * Variante para módulos cujos IDs são cuid (String): como AuditLog.entityId é
   * Int?, o id real vai dentro de metadata (sempre JSON.stringify). Substitui o
   * helper de auditoria que estava duplicado em vários serviços.
   */
  async logEntity(
    userId: number,
    action: string,
    entity: string,
    entityId: string,
    meta: Record<string, any> = {},
  ): Promise<void> {
    await this.enqueueOrWrite({
      userId,
      action,
      entity,
      metadata: JSON.stringify({ ...meta, entityId }),
    });
  }

  /** Enfileira o write de auditoria; cai para escrita síncrona se a fila estiver
   *  desligada (QUEUE_ENABLED=false) ou se falhar a enfileirar (Redis em baixo). */
  private async enqueueOrWrite(data: any): Promise<void> {
    if (!this.queueEnabled) {
      await this.prisma.auditLog.create({ data });
      return;
    }
    try {
      await this.auditQueue.add('write', data, {
        removeOnComplete: true,
        attempts: 3,
        backoff: 5000,
      });
    } catch (queueErr) {
      this.logger.warn(
        `Falha ao enfileirar auditoria, a escrever diretamente: ${queueErr instanceof Error ? queueErr.message : String(queueErr)}`,
      );
      await this.prisma.auditLog.create({ data }); // não perder compliance
    }
  }
}
