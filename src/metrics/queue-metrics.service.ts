import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { Interval } from '@nestjs/schedule';
import { InjectMetric } from '@willsoto/nestjs-prometheus';
import type { Queue } from 'bull';
import type { Gauge } from 'prom-client';

const STATES = ['waiting', 'active', 'delayed', 'failed'] as const;

/**
 * Exporta a profundidade das filas Bull para o Prometheus (alertas `QueueBacklog*` e
 * `QueueFailedJobs` em ops/monitoring/alert-rules.yml). As contagens vivem no Redis, por isso
 * qualquer réplica devolve os mesmos valores. Falha do Redis nunca derruba nada: o gauge
 * fica com o último valor e o `/health/ready` já reporta o Redis.
 */
@Injectable()
export class QueueMetricsService {
  private readonly logger = new Logger(QueueMetricsService.name);
  private readonly queues: [string, Queue][];

  constructor(
    @InjectQueue('audit') audit: Queue,
    @InjectQueue('email') email: Queue,
    @InjectQueue('notifications') notifications: Queue,
    @InjectQueue('webhooks') webhooks: Queue,
    @InjectMetric('bull_queue_jobs') private readonly gauge: Gauge<string>,
  ) {
    this.queues = [
      ['audit', audit],
      ['email', email],
      ['notifications', notifications],
      ['webhooks', webhooks],
    ];
  }

  @Interval(15_000)
  async refresh(): Promise<void> {
    for (const [name, queue] of this.queues) {
      try {
        const counts = await queue.getJobCounts();
        for (const state of STATES) this.gauge.set({ queue: name, state }, counts[state] ?? 0);
      } catch (err) {
        this.logger.warn(`Contagem da fila "${name}" indisponível: ${String(err)}`);
      }
    }
  }
}
