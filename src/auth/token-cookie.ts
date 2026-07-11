// src/auth/token-cookie.ts
// Cookie httpOnly que transporta o access token. JS no browser nunca lê este
// valor (mitiga XSS). sameSite 'lax' em todos os ambientes: em produção o
// frontend e a API são servidos no MESMO domínio atrás da borda Caddy
// (spec 2026-07-11-a1-headers-remediacao-design.md) — 'none' era necessário
// apenas no antigo layout cross-site e alargava a superfície CSRF.
import { CookieOptions } from 'express';

export const TOKEN_COOKIE = 'token';

export function buildTokenCookieOptions(isProd: boolean): CookieOptions {
  return {
    httpOnly: true,
    secure: isProd,
    sameSite: 'lax',
    path: '/',
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 dias (sessão); o JWT em si expira antes
  };
}
