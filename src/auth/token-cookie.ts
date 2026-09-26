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

export const REFRESH_COOKIE = 'refresh_token';

export function buildRefreshCookieOptions(isProd: boolean): CookieOptions {
  return {
    httpOnly: true,
    secure: isProd,
    sameSite: 'lax',
    // O Path de um cookie é avaliado contra o pedido tal como o BROWSER o vê,
    // não contra a rota do Nest. O frontend nunca chama a API directamente —
    // passa sempre por /api/... (rewrite do Next em dev, borda Caddy em
    // produção, ver frontend/next.config.ts e frontend/lib/api.ts). Um Path
    // '/auth/refresh' nunca correspondia a nenhum pedido real do browser, por
    // isso este cookie nunca era reenviado e POST /auth/refresh falhava
    // sempre com "Refresh token ausente" — motivo pelo qual o frontend nunca
    // chegou a implementar refresh automático.
    path: '/api/auth/refresh',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  };
}
