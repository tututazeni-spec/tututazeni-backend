// src/common/services/audit.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { ConfigService } from '@nestjs/config';
import { AuditStatus, RiskLevel } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { getRequestContext } from '../logging/request-context';
import {
  AUDIT_SCHEMA_VERSION,
  AuditActorType,
  AuditSource,
  resolveAuditModule,
} from '../helpers/audit-modules';
import { writeChainedAuditLog } from '../helpers/audit-chain';

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
  // modulo_audit.md §15 — todos opcionais; o módulo deriva-se da entidade e
  // correlationId/ip/userAgent do contexto do pedido quando não vêm indicados.
  module?: string;
  status?: AuditStatus;
  severity?: RiskLevel;
  before?: object;
  after?: object;
  reason?: string;
  ip?: string;
  userAgent?: string;
  actorType?: AuditActorType;
  source?: AuditSource;
  correlationId?: string;
  /** Operação crítica: a falha de auditoria é propagada (a operação de negócio deve abortar). */
  strict?: boolean;
}

// Forma real do que é persistido em AuditLog — metadata é sempre uma String
// (campo String? @db.Text no schema), nunca o objecto bruto.
export interface AuditWriteData {
  userId: number;
  action: string;
  entity: string;
  entityId?: number;
  metadata?: string;
  eventType?: string;
  module?: string;
  actorType?: string;
  source?: string;
  correlationId?: string;
  schemaVersion?: number;
  status?: AuditStatus;
  severity?: RiskLevel;
  before?: string;
  after?: string;
  reason?: string;
  ip?: string;
  userAgent?: string;
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
    const entity = input.entity ?? input.entityType ?? 'Unknown';
    const userId = Number(input.userId);
    const data = this.buildData({
      action: input.action,
      entity,
      entityId: input.entityId !== undefined ? Number(input.entityId) : undefined,
      userId,
      metadata: rawMetadata !== undefined ? JSON.stringify(rawMetadata) : undefined,
      module: input.module,
      status: input.status,
      severity: input.severity,
      before: input.before !== undefined ? JSON.stringify(input.before) : undefined,
      after: input.after !== undefined ? JSON.stringify(input.after) : undefined,
      reason: input.reason,
      ip: input.ip,
      userAgent: input.userAgent,
      actorType: input.actorType,
      source: input.source,
      correlationId: input.correlationId,
    });
    if (input.strict) {
      // §15.9 — operações críticas: escrita síncrona e falha propagada.
      await this.writeNow(data);
      return;
    }
    await this.enqueueOrWrite(data);
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
    await this.enqueueOrWrite(
      this.buildData({
        userId,
        action,
        entity,
        metadata: JSON.stringify({ ...meta, entityId }),
      }),
    );
  }

  /** Normaliza o evento (módulo, ator, origem, correlação) — modulo_audit.md §13/§15. */
  private buildData(
    base: Pick<AuditWriteData, 'userId' | 'action' | 'entity'> &
      Partial<Omit<AuditWriteData, 'actorType' | 'source'>> & {
        actorType?: AuditActorType;
        source?: AuditSource;
      },
  ): AuditWriteData {
    const ctx = getRequestContext();
    const module = base.module ?? resolveAuditModule(base.entity);
    const inRequest = !!ctx.reqId;
    return {
      ...base,
      module,
      eventType: `${module}.${base.action}`,
      actorType: base.actorType ?? (Number.isFinite(base.userId) ? 'USER' : 'SYSTEM'),
      source: base.source ?? (inRequest ? 'API' : 'JOB'),
      correlationId: base.correlationId ?? ctx.reqId,
      schemaVersion: AUDIT_SCHEMA_VERSION,
    };
  }

  private writeNow(data: AuditWriteData) {
    return writeChainedAuditLog(this.prisma, data);
  }

  /** Enfileira o write de auditoria; cai para escrita síncrona se a fila estiver
   *  desligada (QUEUE_ENABLED=false) ou se falhar a enfileirar (Redis em baixo). */
  private async enqueueOrWrite(data: AuditWriteData): Promise<void> {
    if (!this.queueEnabled) {
      await this.writeNow(data);
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
      await this.writeNow(data); // não perder compliance
    }
  }
}
