import { CacheService } from './cache.service';

const makeConfig = (enabled = 'true') =>
  ({ get: jest.fn((k: string, d?: any) => (k === 'CACHE_ENABLED' ? enabled : d)) }) as any;

describe('CacheService', () => {
  it('cache hit devolve o valor parseado sem calcular', async () => {
    const redis = {
      get: jest.fn().mockResolvedValue(JSON.stringify({ a: 1 })),
      set: jest.fn(),
    } as any;
    const svc = new CacheService(redis, makeConfig());
    const compute = jest.fn();
    const r = await svc.getOrSet('k', 90, compute);
    expect(r).toEqual({ a: 1 });
    expect(compute).not.toHaveBeenCalled();
  });

  it('cache miss calcula e faz set com EX/ttl', async () => {
    const redis = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue('OK'),
    } as any;
    const svc = new CacheService(redis, makeConfig());
    const r = await svc.getOrSet('k', 90, async () => ({ a: 2 }));
    expect(r).toEqual({ a: 2 });
    expect(redis.set).toHaveBeenCalledWith('k', JSON.stringify({ a: 2 }), 'EX', 90);
  });

  it('CACHE_ENABLED=false calcula sem tocar no redis', async () => {
    const redis = { get: jest.fn(), set: jest.fn() } as any;
    const svc = new CacheService(redis, makeConfig('false'));
    const r = await svc.getOrSet('k', 90, async () => ({ a: 3 }));
    expect(r).toEqual({ a: 3 });
    expect(redis.get).not.toHaveBeenCalled();
    expect(redis.set).not.toHaveBeenCalled();
  });

  it('Redis em baixo (get/set lançam) calcula na mesma', async () => {
    const redis = {
      get: jest.fn().mockRejectedValue(new Error('down')),
      set: jest.fn().mockRejectedValue(new Error('down')),
    } as any;
    const svc = new CacheService(redis, makeConfig());
    const r = await svc.getOrSet('k', 90, async () => ({ a: 4 }));
    expect(r).toEqual({ a: 4 });
  });
});
