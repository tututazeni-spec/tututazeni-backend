import { ThrottlerStorageRedisService } from '@nest-lab/throttler-storage-redis';
import {
  buildThrottlerOptions,
  THROTTLE_LIMIT_PROD,
  THROTTLE_LIMIT_TEST,
  THROTTLE_TTL,
} from './throttler.config';

function makeConfig(env: Record<string, string | number>) {
  return {
    get: <T>(key: string, def?: T): T => (key in env ? env[key] : def) as T,
  } as any;
}

describe('buildThrottlerOptions', () => {
  it('usa ThrottlerStorageRedisService como storage', () => {
    const opts = buildThrottlerOptions(makeConfig({ NODE_ENV: 'production' }));
    expect(opts.storage).toBeInstanceOf(ThrottlerStorageRedisService);
  });

  it('usa THROTTLE_LIMIT_TEST em NODE_ENV=test', () => {
    const opts = buildThrottlerOptions(makeConfig({ NODE_ENV: 'test' }));
    expect((opts.throttlers as any[])[0].limit).toBe(THROTTLE_LIMIT_TEST);
  });

  it('usa THROTTLE_LIMIT_PROD em NODE_ENV=production', () => {
    const opts = buildThrottlerOptions(makeConfig({ NODE_ENV: 'production' }));
    expect((opts.throttlers as any[])[0].limit).toBe(THROTTLE_LIMIT_PROD);
  });

  it('usa THROTTLE_LIMIT_PROD em NODE_ENV=development', () => {
    const opts = buildThrottlerOptions(makeConfig({ NODE_ENV: 'development' }));
    expect((opts.throttlers as any[])[0].limit).toBe(THROTTLE_LIMIT_PROD);
  });

  it('usa o TTL correcto (60s)', () => {
    const opts = buildThrottlerOptions(makeConfig({ NODE_ENV: 'production' }));
    expect((opts.throttlers as any[])[0].ttl).toBe(THROTTLE_TTL);
  });

  it('passa REDIS_HOST ao cliente Redis', () => {
    const opts = buildThrottlerOptions(
      makeConfig({ NODE_ENV: 'production', REDIS_HOST: 'redis.prod.internal' }),
    );
    expect(opts.storage).toBeInstanceOf(ThrottlerStorageRedisService);
  });
});
