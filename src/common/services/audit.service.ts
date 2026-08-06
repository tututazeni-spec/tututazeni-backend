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
  // `object` (não Record<string, unknown>) porque dezenas de chamadores
  // passam directamente uma instância de DTO (sem index signature) em vez
  // de um objecto literal — ambos serializam bem com JSON.stringify.
  metadata?: object;
  details?: object;
}

// Forma real do que é persistido em AuditLog — metadata é sempre uma String
// (campo String? @db.Text no schema), nunca o objecto bruto.
interface AuditWriteData {
  userId: number;
  action: string;
  entity: string;
  entityId?: number;
  metadata?: string;
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
    // AuditLog.metadata é String? no schema — nenhum chamador de log() (nem
    // via `metadata`, nem via o alias `details`) alguma vez pré-serializava
    // isto; passar o objecto bruto (antes escondido pelo `as any`) rebentava
    // sempre com erro de validação do Prisma quando o AuditProcessor (fila
    // 'audit') tentava escrever job.data directamente — silenciosamente, já
    // que os 3 retries do Bull esgotavam e a escrita de auditoria perdia-se
    // (ver comentário "não perder compliance" em enqueueOrWrite abaixo).
    const rawMetadata = input.metadata ?? input.details;
    await this.enqueueOrWrite({
      action: input.action,
      entity: input.entity ?? input.entityType ?? 'Unknown',
      entityId: input.entityId !== undefined ? Number(input.entityId) : undefined,
      userId: Number(input.userId),
      metadata: rawMetadata !== undefined ? JSON.stringify(rawMetadata) : undefined,
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
    meta: object = {},
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
  private async enqueueOrWrite(data: AuditWriteData): Promise<void> {
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
    } catch (queueErr: unknown) {
      this.logger.warn({
        userId: data.userId,
        action: data.action,
        entity: data.entity,
        entityId: data.entityId,
        err: { message: queueErr instanceof Error ? queueErr.message : String(queueErr) },
        msg: 'Falha ao enfileirar auditoria, a escrever diretamente',
      });
      await this.prisma.auditLog.create({ data }); // não perder compliance
    }
  }
}
