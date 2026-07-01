import { RedisHealthIndicator } from './redis.health';

describe('RedisHealthIndicator', () => {
  it('Redis up: status up', async () => {
    const cache = { ping: jest.fn().mockResolvedValue(undefined) } as any;
    const result = await new RedisHealthIndicator(cache).check('redis');
    expect(result.redis.status).toBe('up');
  });

  it('Redis down: status down (não lança)', async () => {
    const cache = { ping: jest.fn().mockRejectedValue(new Error('down')) } as any;
    const result = await new RedisHealthIndicator(cache).check('redis');
    expect(result.redis.status).toBe('down');
    expect(result.redis.error).toContain('down');
  });
});
