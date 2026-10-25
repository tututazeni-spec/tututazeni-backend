// src/common/security/csrf-token.ts
// Token CSRF "double-submit" assinado. O valor é HMAC(JWT_SECRET, "csrf:" + cookie de sessão),
// por isso fica preso à sessão: o servidor recalcula-o e NÃO confia no cookie csrf_token enviado
// (um atacante que injecte cookies a partir de um subdomínio não consegue forjar um valor válido).
// O cookie csrf_token é legível por JS de propósito — o frontend copia-o para o cabeçalho
// X-CSRF-Token. Um site de terceiros não lê cookies deste domínio nem define o cabeçalho.
import { createHmac, timingSafeEqual } from 'crypto';
import type { CookieOptions } from 'express';

export const CSRF_COOKIE = 'csrf_token';
export const CSRF_TOKEN_HEADER = 'x-csrf-token';

export function deriveCsrfToken(sessionToken: string, secret: string): string {
  return createHmac('sha256', secret).update(`csrf:${sessionToken}`).digest('hex');
}

export function csrfTokensMatch(presented: unknown, expected: string): boolean {
  if (typeof presented !== 'string' || presented.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(presented), Buffer.from(expected));
}

export function buildCsrfCookieOptions(isProd: boolean): CookieOptions {
  return {
    httpOnly: false, // tem de ser lido pelo frontend (ver cabeçalho do ficheiro)
    secure: isProd,
    sameSite: 'lax',
    path: '/',
    maxAge: 7 * 24 * 60 * 60 * 1000, // igual ao cookie de sessão
  };
}

interface CookieSetter {
  cookie(name: string, value: string, options: CookieOptions): unknown;
}

/** Emite o cookie csrf_token para o access token acabado de criar. Chamar sempre que TOKEN_COOKIE é escrito. */
export function setCsrfCookie(res: CookieSetter, accessToken: string): void {
  const secret = process.env.JWT_SECRET;
  if (!secret) return;
  res.cookie(
    CSRF_COOKIE,
    deriveCsrfToken(accessToken, secret),
    buildCsrfCookieOptions(process.env.NODE_ENV === 'production'),
  );
}
