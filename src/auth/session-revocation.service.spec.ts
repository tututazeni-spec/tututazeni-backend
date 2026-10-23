import { SessionRevocationService } from './session-revocation.service';

function fakeCache() {
  const store = new Map<string, unknown>();
  return {
    store,
    get: jest.fn(async (k: string) => (store.has(k) ? store.get(k) : null)),
    set: jest.fn(async (k: string, v: unknown) => void store.set(k, v)),
    del: jest.fn(async (k: string) => void store.delete(k)),
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
});
