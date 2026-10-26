import { SessionRevocationService } from './session-revocation.service';

function fakeCache() {
  const store = new Map<string, unknown>();
  return {
    store,
    get: jest.fn(async (k: string) => (store.has(k) ? store.get(k) : null)),
    set: jest.fn(async (k: string, v: unknown) => void store.set(k, v)),
    del: jest.fn(async (k: string) => void store.delete(k)),
    mget: jest.fn(async (keys: string[]) => keys.map(k => (store.has(k) ? store.get(k) : null))),
  };
}

describe('SessionRevocationService', () => {
  it('um jti revogado é reportado como revogado; outro não', async () => {
    const svc = new SessionRevocationService(fakeCache() as never);
    await svc.revokeAccessToken('abc', 900);
    expect(await svc.isAccessTokenRevoked('abc')).toBe(true);
    expect(await svc.isAccessTokenRevoked('other')).toBe(false);
  });

  it('revokeAccessToken guarda com o TTL pedido (nunca infinito)', async () => {
    const cache = fakeCache();
    await new SessionRevocationService(cache as never).revokeAccessToken('abc', 900);
    expect(cache.set).toHaveBeenCalledWith(expect.stringContaining('abc'), true, 900);
  });

  it('ttl <= 0 (token já expirado) não escreve nada', async () => {
    const cache = fakeCache();
    await new SessionRevocationService(cache as never).revokeAccessToken('abc', 0);
    expect(cache.set).not.toHaveBeenCalled();
  });

  it('revokeAllUserSessions / invalidateUserCache guardam marcas por utilizador', async () => {
    const svc = new SessionRevocationService(fakeCache() as never);
    expect(await svc.revokedBefore(7)).toBeNull();
    expect(await svc.staleSince(7)).toBeNull();
    await svc.revokeAllUserSessions(7);
    await svc.invalidateUserCache(7);
    expect(await svc.revokedBefore(7)).toEqual(expect.any(Number));
    expect(await svc.staleSince(7)).toEqual(expect.any(Number));
    expect(await svc.revokedBefore(8)).toBeNull();
  });

  describe('getMarks — as 3 marcas numa só consulta', () => {
    const empty = { jtiRevoked: false, revokedBefore: null, staleSince: null };

    it('devolve tudo vazio quando nada foi marcado', async () => {
      const svc = new SessionRevocationService(fakeCache() as never);
      await expect(svc.getMarks('jti-1', 7)).resolves.toEqual(empty);
    });

    it('reflete jti revogado, revokedBefore e staleSince do utilizador certo', async () => {
      const svc = new SessionRevocationService(fakeCache() as never);
      await svc.revokeAccessToken('jti-1', 900);
      await svc.revokeAllUserSessions(7);
      await svc.invalidateUserCache(7);
      const marks = await svc.getMarks('jti-1', 7);
      expect(marks.jtiRevoked).toBe(true);
      expect(marks.revokedBefore).toEqual(expect.any(Number));
      expect(marks.staleSince).toEqual(expect.any(Number));
      await expect(svc.getMarks('outro-jti', 8)).resolves.toEqual(empty);
    });

    it('faz uma única leitura à cache (mget), não três', async () => {
      const cache = fakeCache();
      await new SessionRevocationService(cache as never).getMarks('jti-1', 7);
      expect(cache.mget).toHaveBeenCalledTimes(1);
      expect(cache.get).not.toHaveBeenCalled();
    });

    it('sem jti (token antigo) só consulta as marcas do utilizador', async () => {
      const cache = fakeCache();
      const marks = await new SessionRevocationService(cache as never).getMarks(undefined, 7);
      expect(marks.jtiRevoked).toBe(false);
      expect(cache.mget.mock.calls[0][0]).toHaveLength(2);
    });
  });
});
