import { decideWindow, ipAllowed, scopeAllows } from './api-key-limits';

describe('api-key-limits', () => {
  it('scopes: admin ⊇ write ⊇ read', () => {
    expect(scopeAllows(['admin'], 'write')).toBe(true);
    expect(scopeAllows(['write'], 'read')).toBe(true);
    expect(scopeAllows(['read'], 'write')).toBe(false);
    expect(scopeAllows([], 'read')).toBe(false);
    expect(scopeAllows(['write'], 'admin')).toBe(false);
  });

  it('IPs: lista vazia aceita tudo; IPv4 mapeado em IPv6 é normalizado', () => {
    expect(ipAllowed([], '10.0.0.1')).toBe(true);
    expect(ipAllowed(['10.0.0.1'], '::ffff:10.0.0.1')).toBe(true);
    expect(ipAllowed(['10.0.0.1'], '10.0.0.2')).toBe(false);
  });

  it('janela: bloqueia acima do limite e calcula o reset', () => {
    expect(decideWindow(5, 5, 0)).toMatchObject({ allowed: true, remaining: 0, resetSeconds: 60 });
    expect(decideWindow(6, 5, 30_000)).toMatchObject({
      allowed: false,
      remaining: 0,
      resetSeconds: 30,
    });
  });
});
