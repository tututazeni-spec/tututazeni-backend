import { Inject, Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Redis } from 'ioredis';
import { CACHE_REDIS } from './cache.constants';

@Injectable()
export class CacheService implements OnModuleDestroy {
  private readonly logger = new Logger(CacheService.name);

  constructor(
    @Inject(CACHE_REDIS) private readonly redis: Redis,
    private readonly config: ConfigService,
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
      if (hit) return JSON.parse(hit) as T;
    } catch (e) {
      this.logger.warn(`cache get falhou (${key}): ${e instanceof Error ? e.message : String(e)}`);
    }
    const value = await compute();
    try {
      await this.redis.set(key, JSON.stringify(value), 'EX', ttlSeconds);
    } catch (e) {
      this.logger.warn(`cache set falhou (${key}): ${e instanceof Error ? e.message : String(e)}`);
    }
    return value;
  }

  /** Verifica conectividade do Redis (health check). Rejeita se inacessível. */
  async ping(): Promise<void> {
    await this.redis.ping();
  }

  async onModuleDestroy(): Promise<void> {
    await this.redis.quit().catch(() => undefined);
  }
}
