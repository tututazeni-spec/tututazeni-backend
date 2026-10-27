import { Inject, Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SchedulerRegistry } from '@nestjs/schedule';
import type { Redis } from 'ioredis';
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
    job._callbacks = job._callbacks.map(
      callback =>
        async function lockedTick(this: unknown, ...args: unknown[]) {
          try {
            const got = await redis.set(`cron-lock:${name}`, id, 'PX', LOCK_TTL_MS, 'NX');
            if (got !== 'OK') return undefined;
          } catch (err) {
            logger.warn(`Lock de "${name}" indisponível, a executar sem lock: ${String(err)}`);
          }
          return callback.apply(this, args);
        },
    );
    job.__clusterLocked = true;
    return true;
  }
}
