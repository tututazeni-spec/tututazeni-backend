import { CacheService } from './cache.service';

const makeCounter = () => ({ inc: jest.fn() }) as any;

const makeConfig = (enabled = 'true') =>
  ({ get: jest.fn((k: string, d?: any) => (k === 'CACHE_ENABLED' ? enabled : d)) }) as any;

describe('CacheService', () => {
  it('cache hit devolve o valor parseado sem calcular', async () => {
    const redis = {
      get: jest.fn().mockResolvedValue(JSON.stringify({ a: 1 })),
      set: jest.fn(),
    } as any;
    const counter = makeCounter();
    const svc = new CacheService(redis, makeConfig(), counter);
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
    const counter = makeCounter();
    const svc = new CacheService(redis, makeConfig(), counter);
    const r = await svc.getOrSet('k', 90, async () => ({ a: 2 }));
    expect(r).toEqual({ a: 2 });
    expect(redis.set).toHaveBeenCalledWith('k', JSON.stringify({ a: 2 }), 'EX', 90);
  });

  it('CACHE_ENABLED=false calcula sem tocar no redis', async () => {
    const redis = { get: jest.fn(), set: jest.fn() } as any;
    const counter = makeCounter();
    const svc = new CacheService(redis, makeConfig('false'), counter);
    const r = await svc.getOrSet('k', 90, async () => ({ a: 3 }));
    expect(r).toEqual({ a: 3 });
    expect(redis.get).not.toHaveBeenCalled();
    expect(redis.set).not.toHaveBeenCalled();
    expect(counter.inc).not.toHaveBeenCalled();
  });

  it('Redis em baixo (get/set lançam) calcula na mesma', async () => {
    const redis = {
      get: jest.fn().mockRejectedValue(new Error('down')),
      set: jest.fn().mockRejectedValue(new Error('down')),
    } as any;
    const counter = makeCounter();
    const svc = new CacheService(redis, makeConfig(), counter);
    const r = await svc.getOrSet('k', 90, async () => ({ a: 4 }));
    expect(r).toEqual({ a: 4 });
    expect(counter.inc).toHaveBeenCalledTimes(1);
    expect(counter.inc).toHaveBeenCalledWith({ result: 'miss' });
  });

  it('cache hit incrementa o counter com result=hit', async () => {
    const redis = {
      get: jest.fn().mockResolvedValue(JSON.stringify({ a: 1 })),
    } as any;
    const counter = makeCounter();
    const svc = new CacheService(redis, makeConfig(), counter);
    await svc.getOrSet('k', 90, jest.fn());
    expect(counter.inc).toHaveBeenCalledWith({ result: 'hit' });
  });

  it('cache miss incrementa o counter com result=miss', async () => {
    const redis = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue('OK'),
    } as any;
    const counter = makeCounter();
    const svc = new CacheService(redis, makeConfig(), counter);
    await svc.getOrSet('k', 90, async () => ({ a: 2 }));
    expect(counter.inc).toHaveBeenCalledWith({ result: 'miss' });
  });
});

function makeService(ping: jest.Mock) {
  const redis = { ping, quit: jest.fn().mockResolvedValue(undefined) } as any;
  const config = { get: jest.fn((_k: string, d?: string) => d) } as any;
  return new CacheService(redis, config, makeCounter());
}

describe('CacheService.ping', () => {
  it('resolve quando o Redis responde', async () => {
    const svc = makeService(jest.fn().mockResolvedValue('PONG'));
    await expect(svc.ping()).resolves.toBeUndefined();
  });

  it('rejeita quando o Redis está em baixo', async () => {
    const svc = makeService(jest.fn().mockRejectedValue(new Error('down')));
    await expect(svc.ping()).rejects.toThrow('down');
  });
});
