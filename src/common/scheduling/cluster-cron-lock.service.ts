import { Inject, Injectable, Logger, OnApplicationBootstrap, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SchedulerRegistry } from '@nestjs/schedule';
import { InjectMetric } from '@willsoto/nestjs-prometheus';
import type { Redis } from 'ioredis';
import type { Counter, Gauge } from 'prom-client';
import { randomUUID } from 'crypto';
import { CACHE_REDIS } from '../../cache/cache.constants';

type CronCallback = (this: unknown, ...args: unknown[]) => unknown;
interface WrappableCronJob {
  _callbacks?: CronCallback[];
  __clusterLocked?: boolean;
}

/** Janela do lock: cobre o desfasamento entre réplicas no mesmo tick (ms) sem bloquear o tick seguinte (≥ 1 min). */
const LOCK_TTL_MS = 30_000;

/**
 * Com `app × N` réplicas cada `@Cron` dispararia N vezes (emails, lembretes e alertas duplicados).
 * Em vez de tocar nos ~30 serviços, embrulha-se aqui o callback de cada CronJob registado: só a
 * réplica que ganhar o `SET NX` desse tick executa. Redis indisponível → corre (comportamento
 * anterior), para um problema de cache nunca parar as tarefas agendadas.
 *
 * Declarado no AppModule (raiz): os hooks de bootstrap correm depois dos dos módulos importados,
 * ou seja, depois de o `ScheduleModule` ter montado os jobs.
 */
@Injectable()
export class ClusterCronLockService implements OnApplicationBootstrap {
  private readonly logger = new Logger(ClusterCronLockService.name);
  private readonly instanceId = randomUUID();

  constructor(
    private readonly registry: SchedulerRegistry,
    private readonly config: ConfigService,
    @Inject(CACHE_REDIS) private readonly redis: Redis,
    // Opcionais: sem métricas (testes) o lock funciona na mesma. Alimentam o alerta CronStalled.
    @Optional()
    @InjectMetric('cron_last_run_timestamp_seconds')
    private readonly lastRun?: Gauge<string>,
    @Optional() @InjectMetric('cron_runs_total') private readonly runs?: Counter<string>,
  ) {}

  onApplicationBootstrap(): void {
    if (this.config.get<string>('CLUSTER_CRON_LOCK', 'true') === 'false') return;
    let wrapped = 0;
    for (const [name, job] of this.registry.getCronJobs()) {
      if (this.wrap(name, job as unknown as WrappableCronJob)) wrapped++;
    }
    this.logger.log(`Lock distribuído activo em ${wrapped} tarefas agendadas`);
  }

  private wrap(name: string, job: WrappableCronJob): boolean {
    if (job.__clusterLocked || !Array.isArray(job._callbacks)) return false;
    const redis = this.redis;
    const id = this.instanceId;
    const logger = this.logger;
    const record = (ok: boolean) => {
      this.runs?.inc({ job: name, result: ok ? 'ok' : 'error' });
      if (ok) this.lastRun?.set({ job: name }, Date.now() / 1000);
    };
    job._callbacks = job._callbacks.map(
      callback =>
        async function lockedTick(this: unknown, ...args: unknown[]) {
          try {
            const got = await redis.set(`cron-lock:${name}`, id, 'PX', LOCK_TTL_MS, 'NX');
            if (got !== 'OK') return undefined;
          } catch (err) {
            logger.warn(`Lock de "${name}" indisponível, a executar sem lock: ${String(err)}`);
          }
          try {
            const outcome = callback.apply(this, args);
            if (!outcome || typeof (outcome as Promise<unknown>).then !== 'function') {
              record(true);
              return outcome;
            }
            return (outcome as Promise<unknown>).then(
              value => {
                record(true);
                return value;
              },
              (err: unknown) => {
                record(false);
                throw err;
              },
            );
          } catch (err) {
            record(false);
            throw err;
          }
        },
    );
    job.__clusterLocked = true;
    return true;
  }
}
