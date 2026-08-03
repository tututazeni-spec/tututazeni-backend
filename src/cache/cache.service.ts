import { Inject, Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectMetric } from '@willsoto/nestjs-prometheus';
import type { Redis } from 'ioredis';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { Counter } from 'prom-client';
import { CACHE_REDIS } from './cache.constants';

@Injectable()
export class CacheService implements OnModuleDestroy {
  constructor(
    @Inject(CACHE_REDIS) private readonly redis: Redis,
    private readonly config: ConfigService,
    @InjectMetric('cache_requests_total') private readonly cacheCounter: Counter<string>,
    @InjectPinoLogger(CacheService.name) private readonly logger: PinoLogger,
  ) {}

  private get cacheEnabled(): boolean {
    return this.config.get<string>('CACHE_ENABLED', 'true') !== 'false';
  }

  /** Devolve o valor em cache ou calcula-o, guarda-o (TTL) e devolve-o.
   *  Flag off ou Redis em baixo → calcula sem quebrar. */
  async getOrSet<T>(key: string, ttlSeconds: number, compute: () => Promise<T>): Promise<T> {
    if (!this.cacheEnabled) return compute();
    try {
      const hit = await this.redis.get(key);
      if (hit) {
        this.cacheCounter.inc({ result: 'hit' });
        return JSON.parse(hit) as T;
      }
    } catch (e: unknown) {
      this.logger.warn({
        op: 'get',
        key,
        err: { message: e instanceof Error ? e.message : String(e) },
        msg: 'cache get falhou — a calcular sem cache',
      });
    }
    this.cacheCounter.inc({ result: 'miss' });
    const value = await compute();
    try {
      await this.redis.set(key, JSON.stringify(value), 'EX', ttlSeconds);
    } catch (e: unknown) {
      this.logger.warn({
        op: 'set',
        key,
        ttlSeconds,
        err: { message: e instanceof Error ? e.message : String(e) },
        msg: 'cache set falhou — valor não foi cacheado',
      });
    }
    return value;
  }

  /** Lê um valor da cache. Devolve null em cache miss, flag off ou erro de Redis. */
  async get<T>(key: string): Promise<T | null> {
    if (!this.cacheEnabled) return null;
    try {
      const hit = await this.redis.get(key);
      if (hit) {
        this.cacheCounter.inc({ result: 'hit' });
        return JSON.parse(hit) as T;
      }
      this.cacheCounter.inc({ result: 'miss' });
      return null;
    } catch (e: unknown) {
      this.logger.warn({
        op: 'get',
        key,
        err: { message: e instanceof Error ? e.message : String(e) },
        msg: 'cache get falhou — a devolver null',
      });
      return null;
    }
  }

  /** Escreve um valor na cache com TTL. Flag off ou Redis em baixo → no-op silencioso. */
  async set<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
    if (!this.cacheEnabled) return;
    try {
      await this.redis.set(key, JSON.stringify(value), 'EX', ttlSeconds);
    } catch (e: unknown) {
      this.logger.warn({
        op: 'set',
        key,
        ttlSeconds,
        err: { message: e instanceof Error ? e.message : String(e) },
        msg: 'cache set falhou — valor não foi cacheado',
      });
    }
  }

  /** Remove uma chave da cache (invalidação explícita). Flag off ou Redis em baixo → no-op silencioso. */
  async del(key: string): Promise<void> {
    if (!this.cacheEnabled) return;
    try {
      await this.redis.del(key);
    } catch (e: unknown) {
      this.logger.warn({
        op: 'del',
        key,
        err: { message: e instanceof Error ? e.message : String(e) },
        msg: 'cache del falhou',
      });
    }
  }

  /** Verifica conectividade do Redis (health check). Rejeita se inacessível. */
  async ping(): Promise<void> {
    await this.redis.ping();
  }

  async onModuleDestroy(): Promise<void> {
    await this.redis.quit().catch(() => undefined);
  }
}
