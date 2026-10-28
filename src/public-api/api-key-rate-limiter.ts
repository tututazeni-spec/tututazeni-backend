import { Inject, Injectable, Optional } from '@nestjs/common';
import type Redis from 'ioredis';
import { CACHE_REDIS } from '../cache/cache.constants';
import { decideWindow, WindowDecision, WINDOW_MS } from './api-key-limits';

// Contador por chave e por minuto. Redis quando disponível (várias réplicas partilham o
// contador); se faltar ou falhar, cai para memória do processo — melhor um limite aproximado
// por réplica do que deixar a chave sem limite.
@Injectable()
export class ApiKeyRateLimiter {
  private readonly memory = new Map<string, number>();

  constructor(@Optional() @Inject(CACHE_REDIS) private readonly redis?: Redis) {}

  async hit(
    keyId: number,
    limit: number,
    nowMs = Date.now(),
  ): Promise<WindowDecision & { first: boolean }> {
    const bucket = Math.floor(nowMs / WINDOW_MS);
    const key = `apikey-rl:${keyId}:${bucket}`;
    const count = await this.increment(key);
    return { ...decideWindow(count, limit, nowMs), first: count === 1 };
  }

  private async increment(key: string): Promise<number> {
    if (this.redis) {
      try {
        const n = await this.redis.incr(key);
        if (n === 1) await this.redis.expire(key, 70);
        return n;
      } catch {
        // cai para memória
      }
    }
    if (this.memory.size > 10_000) this.memory.clear();
    const n = (this.memory.get(key) ?? 0) + 1;
    this.memory.set(key, n);
    return n;
  }
}
