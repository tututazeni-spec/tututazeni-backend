// src/audit/audit-health.service.ts
// modulo_audit.md §15.9 / §18 — falhas de gravação de auditoria têm de ser detetáveis.
// Os eventos passam pela fila Bull 'audit'; um job que esgota as tentativas fica na lista de
// «failed» (não é removido), por isso o estado da fila é o indicador fiável de eventos perdidos.
import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { ConfigService } from '@nestjs/config';
import type { Queue } from 'bull';

export interface AuditHealth {
  status: 'OK' | 'DEGRADED' | 'UNAVAILABLE';
  mode: 'QUEUE' | 'SYNC';
  waiting: number;
  active: number;
  delayed: number;
  failed: number;
  lastFailure: {
    at: string | null;
    reason: string | null;
    action: string | null;
    entity: string | null;
  } | null;
}

@Injectable()
export class AuditHealthService {
  private readonly logger = new Logger(AuditHealthService.name);

  constructor(
    @InjectQueue('audit') private readonly queue: Queue,
    private readonly config: ConfigService,
  ) {}

  async getHealth(): Promise<AuditHealth> {
    if (this.config.get<string>('QUEUE_ENABLED', 'true') === 'false') {
      // Sem fila: a escrita é síncrona e a falha propaga-se ao chamador.
      return {
        status: 'OK',
        mode: 'SYNC',
        waiting: 0,
        active: 0,
        delayed: 0,
        failed: 0,
        lastFailure: null,
      };
    }
    try {
      const counts = await this.queue.getJobCounts();
      const [last] = counts.failed > 0 ? await this.queue.getFailed(0, 0) : [];
      return {
        status: counts.failed > 0 ? 'DEGRADED' : 'OK',
        mode: 'QUEUE',
        waiting: counts.waiting,
        active: counts.active,
        delayed: counts.delayed,
        failed: counts.failed,
        lastFailure: last
          ? {
              at: last.finishedOn ? new Date(last.finishedOn).toISOString() : null,
              reason: last.failedReason ?? null,
              action: (last.data as { action?: string } | undefined)?.action ?? null,
              entity: (last.data as { entity?: string } | undefined)?.entity ?? null,
            }
          : null,
      };
    } catch (err: unknown) {
      this.logger.error(
        `Fila de auditoria indisponível: ${err instanceof Error ? err.message : String(err)}`,
      );
      return {
        status: 'UNAVAILABLE',
        mode: 'QUEUE',
        waiting: 0,
        active: 0,
        delayed: 0,
        failed: 0,
        lastFailure: null,
      };
    }
  }
}
