// src/auth/token-cookie.ts
// Cookie httpOnly que transporta o access token. JS no browser nunca lê este
// valor (mitiga XSS). sameSite 'lax' em todos os ambientes: em produção o
// frontend e a API são servidos no MESMO domínio atrás da borda Caddy
// (spec 2026-07-11-a1-headers-remediacao-design.md) — 'none' era necessário
// apenas no antigo layout cross-site e alargava a superfície CSRF.
import { randomUUID } from 'crypto';
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

// Path usado até esta correcção; o logout continua a limpá-lo em browsers com sessão antiga.
export const LEGACY_REFRESH_COOKIE_PATH = '/api/auth/refresh';

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
    // '/api/auth' (e não '/api/auth/refresh'): o logout também tem de receber este
    // cookie para conseguir revogar o refresh token no servidor.
    path: '/api/auth',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  };
}

// Identificador do dispositivo do instrutor externo: UUID v4 gerado PELO SERVIDOR e guardado
// num cookie httpOnly (o JS do browser não o lê nem o copia por XSS). Só o hash chega à BD.
// Mesmo path do cookie de refresh: tem de acompanhar login, refresh e aceitação do convite.
export const DEVICE_COOKIE = 'innova_device';

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export function buildDeviceCookieOptions(isProd: boolean): CookieOptions {
  return {
    httpOnly: true,
    secure: isProd,
    sameSite: 'lax',
    path: '/api/auth',
    maxAge: 365 * 24 * 60 * 60 * 1000,
  };
}

/** Lê o identificador do cookie; se faltar ou for inválido gera um novo (`isNew`). */
export function resolveDeviceId(cookies: Record<string, unknown> | undefined): {
  deviceId: string;
  isNew: boolean;
} {
  const current = cookies?.[DEVICE_COOKIE];
  if (typeof current === 'string' && UUID_V4.test(current)) {
    return { deviceId: current, isNew: false };
  }
  return { deviceId: randomUUID(), isNew: true };
}
