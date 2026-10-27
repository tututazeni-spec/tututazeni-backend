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

  /** Cálculos em curso por chave (single-flight, só dentro deste processo). */
  private readonly inflight = new Map<string, Promise<unknown>>();

  /** Devolve o valor em cache ou calcula-o, guarda-o (TTL) e devolve-o.
   *  Flag off ou Redis em baixo → calcula sem quebrar.
   *
   *  Single-flight: pedidos concorrentes à mesma chave partilham UM cálculo (e um GET ao Redis).
   *  Sem isto, quando uma chave quente expira com o servidor sob carga, todos os pedidos em fila
   *  falham a cache e recalculam o mesmo valor em paralelo — o que atrasa o recálculo e prolonga
   *  a janela de miss (cache stampede). A chave tem de identificar o valor por completo, tal como
   *  já era preciso para o partilhar via Redis. */
  async getOrSet<T>(key: string, ttlSeconds: number, compute: () => Promise<T>): Promise<T> {
    if (!this.cacheEnabled) return compute();
    const pending = this.inflight.get(key);
    if (pending) return pending as Promise<T>;
    const run = this.readOrCompute(key, ttlSeconds, compute).finally(() => {
      this.inflight.delete(key);
    });
    this.inflight.set(key, run);
    return run;
  }

  private async readOrCompute<T>(
    key: string,
    ttlSeconds: number,
    compute: () => Promise<T>,
  ): Promise<T> {
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

  /**
   * Lê várias chaves numa só viagem (MGET). Mesma semântica fail-open de get(): flag off, Redis em
   * baixo ou valor ilegível → null nessa posição. Pressupõe Redis de nó único (num Cluster, MGET
   * entre slots diferentes falha).
   */
  async mget<T>(keys: string[]): Promise<(T | null)[]> {
    if (keys.length === 0) return [];
    if (!this.cacheEnabled) return keys.map((): null => null);
    try {
      const raw = await this.redis.mget(...keys);
      return raw.map(hit => {
        if (hit) {
          try {
            const value = JSON.parse(hit) as T;
            this.cacheCounter.inc({ result: 'hit' });
            return value;
          } catch {
            // valor corrompido: tratado como miss, só nesta posição
          }
        }
        this.cacheCounter.inc({ result: 'miss' });
        return null;
      });
    } catch (e: unknown) {
      this.logger.warn({
        op: 'mget',
        keys,
        err: { message: e instanceof Error ? e.message : String(e) },
        msg: 'cache mget falhou — a devolver null',
      });
      return keys.map((): null => null);
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
    await this.redis.quit().catch((): undefined => undefined);
  }
}
