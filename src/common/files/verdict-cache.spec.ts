import {
  CachedVerdict,
  KeyValueClient,
  MemoryVerdictCache,
  RedisVerdictCache,
  verdictKey,
} from './verdict-cache';

const verdict = (over: Partial<CachedVerdict> = {}): CachedVerdict => ({
  validators: { etag: '"abc"' },
  rejection: null,
  scanned: true,
  checkedAt: 1,
  ...over,
});

describe('verdictKey', () => {
  it('ignora a query (URLs assinados mudam a cada pedido) e a capitalização do host', () => {
    const a = verdictKey('https://Files.Test/docs/a.pdf?X-Sig=1&exp=2');
    expect(a).toBe(verdictKey('https://files.test/docs/a.pdf?X-Sig=9'));
    expect(a).toBe(verdictKey('https://files.test/docs/a.pdf'));
  });
  it('distingue caminhos e hosts; não revela o URL', () => {
    const base = verdictKey('https://files.test/a.pdf');
    expect(verdictKey('https://files.test/b.pdf')).not.toBe(base);
    expect(verdictKey('https://cdn.files.test/a.pdf')).not.toBe(base);
    expect(base).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('MemoryVerdictCache', () => {
  it('guarda e devolve; expira com o TTL', async () => {
    let now = 1_000;
    const cache = new MemoryVerdictCache(100, () => now);
    await cache.set('k', verdict(), 10);
    expect(await cache.get('k')).toEqual(verdict());
    now += 9_999;
    expect(await cache.get('k')).not.toBeNull();
    now += 2;
    expect(await cache.get('k')).toBeNull();
  });

  it('descarta o mais antigo quando enche (LRU simples) e renovar uma chave poupa-a', async () => {
    const cache = new MemoryVerdictCache(3);
    for (const k of ['a', 'b', 'c']) await cache.set(k, verdict(), 60);
    await cache.set('a', verdict({ checkedAt: 2 }), 60); // renova a
    await cache.set('d', verdict(), 60); // expulsa b
    expect(await cache.get('b')).toBeNull();
    expect(await cache.get('a')).not.toBeNull();
    expect(await cache.get('c')).not.toBeNull();
    expect(await cache.get('d')).not.toBeNull();
  });

  it('markOnce só devolve true na primeira vez, e de novo depois de expirar', async () => {
    let now = 0;
    const cache = new MemoryVerdictCache(10, () => now);
    expect(await cache.markOnce('x', 5)).toBe(true);
    expect(await cache.markOnce('x', 5)).toBe(false);
    now += 5_001;
    expect(await cache.markOnce('x', 5)).toBe(true);
  });

  it('cursor começa vazio e persiste ids inteiros e de texto (cuid/uuid)', async () => {
    const cache = new MemoryVerdictCache();
    expect(await cache.getCursor('document.fileUrl')).toBeNull();
    await cache.setCursor('document.fileUrl', 42);
    expect(await cache.getCursor('document.fileUrl')).toBe(42);
    await cache.setCursor('libraryItem.fileUrl', 'clx9k2m0a0001abcd');
    expect(await cache.getCursor('libraryItem.fileUrl')).toBe('clx9k2m0a0001abcd');
    expect(await cache.getCursor('docVersion.fileUrl')).toBeNull();
    await cache.setCursor('document.fileUrl', null);
    expect(await cache.getCursor('document.fileUrl')).toBeNull();
  });

  it('lock é exclusivo até ser libertado', async () => {
    const cache = new MemoryVerdictCache();
    const release = await cache.lock('sweep', 60);
    expect(release).not.toBeNull();
    expect(await cache.lock('sweep', 60)).toBeNull();
    await release?.();
    expect(await cache.lock('sweep', 60)).not.toBeNull();
  });

  it('veredictos, marcas e cursores não colidem entre si', async () => {
    const cache = new MemoryVerdictCache();
    await cache.set('k', verdict(), 60);
    expect(await cache.markOnce('k', 60)).toBe(true);
    await cache.setCursor('k', 7);
    expect(await cache.get('k')).not.toBeNull();
  });
});

/** Cliente Redis falso com a semântica de EX/NX. */
function fakeRedis() {
  const data = new Map<string, string>();
  const calls: unknown[][] = [];
  const client: KeyValueClient = {
    get: async key => data.get(key) ?? null,
    set: async (key, value, ...args) => {
      calls.push([key, value, ...args]);
      if (args.includes('NX') && data.has(key)) return null;
      data.set(key, value);
      return 'OK';
    },
    del: async key => {
      data.delete(key);
    },
  };
  return { client, data, calls };
}

describe('RedisVerdictCache', () => {
  it('serializa o veredicto com TTL e prefixo', async () => {
    const { client, data, calls } = fakeRedis();
    const cache = new RedisVerdictCache(client);
    await cache.set('abc', verdict({ rejection: 'mau' }), 3600);
    expect(calls[0]).toEqual(['innova:remote-file:v:abc', expect.any(String), 'EX', 3600]);
    expect(data.has('innova:remote-file:v:abc')).toBe(true);
    expect(await cache.get('abc')).toEqual(verdict({ rejection: 'mau' }));
    expect(await cache.get('inexistente')).toBeNull();
  });

  it('markOnce usa SET NX', async () => {
    const cache = new RedisVerdictCache(fakeRedis().client);
    expect(await cache.markOnce('f', 60)).toBe(true);
    expect(await cache.markOnce('f', 60)).toBe(false);
  });

  it('lock usa SET NX EX e liberta com DEL', async () => {
    const { client, data } = fakeRedis();
    const cache = new RedisVerdictCache(client);
    const release = await cache.lock('sweep', 600);
    expect(release).not.toBeNull();
    expect(data.has('innova:remote-file:l:sweep')).toBe(true);
    expect(await cache.lock('sweep', 600)).toBeNull();
    await release?.();
    expect(data.has('innova:remote-file:l:sweep')).toBe(false);
  });

  it('cursor persiste como número ou texto, sem confundir "7" com 7', async () => {
    const cache = new RedisVerdictCache(fakeRedis().client);
    expect(await cache.getCursor('t')).toBeNull();
    await cache.setCursor('t', 99);
    expect(await cache.getCursor('t')).toBe(99);
    await cache.setCursor('s', '7');
    expect(await cache.getCursor('s')).toBe('7');
    await cache.setCursor('s', null);
    expect(await cache.getCursor('s')).toBeNull();
  });

  describe('Redis em baixo: degrada para "sem cache", nunca falha', () => {
    const broken: KeyValueClient = {
      get: () => Promise.reject(new Error('ECONNREFUSED')),
      set: () => Promise.reject(new Error('ECONNREFUSED')),
      del: () => Promise.reject(new Error('ECONNREFUSED')),
    };
    const cache = new RedisVerdictCache(broken);

    it('get/set/cursor', async () => {
      expect(await cache.get('k')).toBeNull();
      await expect(cache.set('k', verdict(), 60)).resolves.toBeUndefined();
      expect(await cache.getCursor('k')).toBeNull();
      await expect(cache.setCursor('k', 1)).resolves.toBeUndefined();
    });

    it('markOnce devolve true (melhor um aviso repetido que perder um aviso)', async () => {
      expect(await cache.markOnce('k', 60)).toBe(true);
    });

    it('lock deixa correr sem trava (o trabalho é idempotente) e a libertação é inócua', async () => {
      const release = await cache.lock('sweep', 60);
      expect(release).not.toBeNull();
      await expect(release?.()).resolves.toBeUndefined();
    });

    it('JSON corrompido conta como falha de cache', async () => {
      const corrupt: KeyValueClient = { ...broken, get: async () => '{não é json' };
      expect(await new RedisVerdictCache(corrupt).get('k')).toBeNull();
    });
  });
});
