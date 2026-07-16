import { ConfigService } from '@nestjs/config';
import { ThrottlerStorageRedisService } from '@nest-lab/throttler-storage-redis';
import Redis from 'ioredis';

export const THROTTLE_TTL = 60_000;
export const THROTTLE_LIMIT_PROD = 100;
export const THROTTLE_LIMIT_TEST = 10_000;

export function buildThrottlerOptions(config: ConfigService) {
  const isTest = config.get<string>('NODE_ENV') === 'test';
  return {
    throttlers: [{ ttl: THROTTLE_TTL, limit: isTest ? THROTTLE_LIMIT_TEST : THROTTLE_LIMIT_PROD }],
    storage: new ThrottlerStorageRedisService(
      new Redis({
        host: config.get<string>('REDIS_HOST', '127.0.0.1'),
        port: config.get<number>('REDIS_PORT', 6379),
        password: config.get<string>('REDIS_PASSWORD') || undefined,
        maxRetriesPerRequest: 2,
      }),
    ),
  };
}
