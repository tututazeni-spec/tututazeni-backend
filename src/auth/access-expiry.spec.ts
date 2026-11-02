import { isAccessExpired } from './access-expiry';

describe('isAccessExpired', () => {
  const now = new Date('2026-11-02T12:00:00Z');
  it('sem prazo (null/undefined) nunca expira', () => {
    expect(isAccessExpired({ accessExpiresAt: null }, now)).toBe(false);
    expect(isAccessExpired({}, now)).toBe(false);
  });
  it('prazo no passado → expirado', () => {
    expect(isAccessExpired({ accessExpiresAt: new Date('2026-11-02T11:59:59Z') }, now)).toBe(true);
  });
  it('prazo no futuro → válido', () => {
    expect(isAccessExpired({ accessExpiresAt: new Date('2026-11-02T12:00:01Z') }, now)).toBe(false);
  });
});
