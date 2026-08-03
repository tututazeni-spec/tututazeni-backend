import { Injectable, Logger } from '@nestjs/common';
import { HealthIndicatorResult } from '@nestjs/terminus';
import { CacheService } from '../cache/cache.service';

const PING_TIMEOUT_MS = 1000;

@Injectable()
export class RedisHealthIndicator {
  private readonly logger = new Logger(RedisHealthIndicator.name);

  constructor(private readonly cache: CacheService) {}

  async check(key: string): Promise<HealthIndicatorResult> {
    const start = Date.now();
    try {
      await Promise.race([
        this.cache.ping(),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('ping timeout')), PING_TIMEOUT_MS),
        ),
      ]);
      return { [key]: { status: 'up', latencyMs: Date.now() - start } };
    } catch (e: unknown) {
      this.logger.warn({
        key,
        err: { message: e instanceof Error ? e.message : String(e) },
        msg: 'Health check Redis falhou',
      });
      return {
        [key]: { status: 'down', error: e instanceof Error ? e.message : String(e) },
      };
    }
  }
}
