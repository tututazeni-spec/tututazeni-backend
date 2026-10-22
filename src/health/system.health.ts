import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { HealthIndicatorResult } from '@nestjs/terminus';
import type { Queue } from 'bull';
import { statfs } from 'node:fs/promises';
import { monitorEventLoopDelay } from 'node:perf_hooks';
import * as v8 from 'node:v8';

const QUEUE_TIMEOUT_MS = 1000;
const DISK_WARN_FREE_PCT = 15;
const DISK_DOWN_FREE_PCT = 5;
const HEAP_WARN_PCT = 85;
const HEAP_DOWN_PCT = 95;
const LOOP_WARN_MS = 200;
const QUEUE_FAILED_WARN = 50;

type Level = 'up' | 'degraded' | 'down';

// O terminus só conhece up/down. `degraded` é expresso em `level` e mantém
// `status: 'up'` (a app serve pedidos, mas o recurso merece atenção).
function result(level: Level, extra: Record<string, unknown> = {}) {
  return { status: level === 'down' ? ('down' as const) : ('up' as const), level, ...extra };
}

const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));

/**
 * Indicadores informativos do readiness (regra 4): fila Bull, disco, heap e
 * event loop. Nenhum controla o 503 — só o Postgres — mas todos aparecem em
 * `details` com um estado up/degraded/down e os números que o justificam.
 */
@Injectable()
export class SystemHealthIndicator {
  private readonly logger = new Logger(SystemHealthIndicator.name);
  private readonly loop = monitorEventLoopDelay({ resolution: 20 });

  constructor(
    @InjectQueue('audit') private readonly audit: Queue,
    @InjectQueue('email') private readonly email: Queue,
    @InjectQueue('notifications') private readonly notifications: Queue,
    @InjectQueue('webhooks') private readonly webhooks: Queue,
  ) {
    this.loop.enable();
  }

  async queues(key: string): Promise<HealthIndicatorResult> {
    const start = Date.now();
    const named: [string, Queue][] = [
      ['audit', this.audit],
      ['email', this.email],
      ['notifications', this.notifications],
      ['webhooks', this.webhooks],
    ];
    try {
      const entries = await Promise.race([
        Promise.all(
          named.map(async ([name, q]) => {
            const c = await q.getJobCounts();
            return [name, { waiting: c.waiting, active: c.active, failed: c.failed }] as const;
          }),
        ),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('queue timeout')), QUEUE_TIMEOUT_MS),
        ),
      ]);
      const failed = entries.reduce((n, [, c]) => n + c.failed, 0);
      const status: Level = failed >= QUEUE_FAILED_WARN ? 'degraded' : 'up';
      return {
        [key]: result(status, {
          latencyMs: Date.now() - start,
          failedTotal: failed,
          queues: Object.fromEntries(entries),
        }),
      };
    } catch (e: unknown) {
      this.logger.warn({ key, err: { message: errMsg(e) }, msg: 'Health check filas falhou' });
      return { [key]: result('down', { error: errMsg(e) }) };
    }
  }

  async disk(key: string): Promise<HealthIndicatorResult> {
    try {
      const s = await statfs(process.cwd());
      const total = s.blocks * s.bsize;
      const free = s.bavail * s.bsize;
      const freePct = total > 0 ? Math.round((free / total) * 1000) / 10 : 0;
      const status: Level =
        freePct < DISK_DOWN_FREE_PCT ? 'down' : freePct < DISK_WARN_FREE_PCT ? 'degraded' : 'up';
      return {
        [key]: result(status, { freePct, freeGb: Math.round((free / 1024 ** 3) * 10) / 10 }),
      };
    } catch (e: unknown) {
      return { [key]: result('down', { error: errMsg(e) }) };
    }
  }

  memory(key: string): HealthIndicatorResult {
    const heapUsed = process.memoryUsage().heapUsed;
    const limit = v8.getHeapStatistics().heap_size_limit;
    const heapPct = Math.round((heapUsed / limit) * 1000) / 10;
    const status: Level =
      heapPct >= HEAP_DOWN_PCT ? 'down' : heapPct >= HEAP_WARN_PCT ? 'degraded' : 'up';
    return {
      [key]: result(status, {
        heapUsedMb: Math.round(heapUsed / 1024 ** 2),
        heapLimitMb: Math.round(limit / 1024 ** 2),
        heapPct,
        rssMb: Math.round(process.memoryUsage().rss / 1024 ** 2),
      }),
    };
  }

  eventLoop(key: string): HealthIndicatorResult {
    const p99 = this.loop.percentile(99) / 1e6;
    const lagMs = Number.isFinite(p99) ? Math.round(p99 * 10) / 10 : 0;
    this.loop.reset();
    return { [key]: result(lagMs >= LOOP_WARN_MS ? 'degraded' : 'up', { lagP99Ms: lagMs }) };
  }
}
