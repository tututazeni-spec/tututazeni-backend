// src/auth/token-cookie.spec.ts
import { TOKEN_COOKIE, buildTokenCookieOptions } from './token-cookie';

describe('token-cookie', () => {
  it('o nome do cookie é "token" (o middleware do frontend depende disto)', () => {
    expect(TOKEN_COOKIE).toBe('token');
  });

  it('usa sameSite lax em todos os ambientes (frontend e API são same-site)', () => {
    expect(buildTokenCookieOptions(true).sameSite).toBe('lax');
    expect(buildTokenCookieOptions(false).sameSite).toBe('lax');
  });

  it('exige secure e httpOnly em produção', () => {
    const prod = buildTokenCookieOptions(true);
    expect(prod.secure).toBe(true);
    expect(prod.httpOnly).toBe(true);
    expect(prod.path).toBe('/');
    expect(prod.maxAge).toBe(7 * 24 * 60 * 60 * 1000);
  });

  it('em dev não exige secure (não há TLS local)', () => {
    expect(buildTokenCookieOptions(false).secure).toBe(false);
  });
});
