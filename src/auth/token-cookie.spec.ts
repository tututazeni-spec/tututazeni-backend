// src/auth/token-cookie.spec.ts
import { TOKEN_COOKIE, buildTokenCookieOptions } from './token-cookie';
import {
  REFRESH_COOKIE,
  LEGACY_REFRESH_COOKIE_PATH,
  buildRefreshCookieOptions,
} from './token-cookie';

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

describe('refresh cookie', () => {
  it('o nome é refresh_token', () => {
    expect(REFRESH_COOKIE).toBe('refresh_token');
  });

  it('o path cobre /api/auth/refresh E /api/auth/logout (senão o logout nunca revoga o refresh token)', () => {
    const path = buildRefreshCookieOptions(true).path as string;
    // Regra RFC 6265 5.1.4: o cookie só é enviado se o path do pedido começar pelo path do cookie.
    const sent = (requestPath: string) =>
      requestPath === path || requestPath.startsWith(path.endsWith('/') ? path : `${path}/`);
    expect(sent('/api/auth/refresh')).toBe(true);
    expect(sent('/api/auth/logout')).toBe(true);
    expect(sent('/api/courses')).toBe(false);
  });

  it('LEGACY_REFRESH_COOKIE_PATH mantém o path antigo para o logout limpar cookies já emitidos', () => {
    expect(LEGACY_REFRESH_COOKIE_PATH).toBe('/api/auth/refresh');
  });

  it('exige secure/httpOnly em produção e sameSite lax; maxAge 7 dias', () => {
    const o = buildRefreshCookieOptions(true);
    expect(o.httpOnly).toBe(true);
    expect(o.secure).toBe(true);
    expect(o.sameSite).toBe('lax');
    expect(o.maxAge).toBe(7 * 24 * 60 * 60 * 1000);
  });

  it('em dev não exige secure', () => {
    expect(buildRefreshCookieOptions(false).secure).toBe(false);
  });
});
