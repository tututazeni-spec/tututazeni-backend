// src/common/security/csrf-header-guard.ts
// Segunda camada de defesa CSRF (reforço pós-auditoria de segurança 2026-08-01).
// SameSite=Lax nos cookies de sessão (token-cookie.ts) + CORS restrito por
// allowlist (allowed-origins.ts) já mitigam CSRF clássico. Este middleware
// adiciona uma barreira barata e independente: exige um cabeçalho custom em
// todo pedido de escrita que viaje com o cookie httpOnly de sessão. Um
// <form>/<img>/navegação cross-site forjada não consegue definir cabeçalhos
// arbitrários; um fetch/XHR cross-site que tente definir este cabeçalho
// dispara preflight CORS, que a allowlist já bloqueia para origens não
// autorizadas. Serve de rede de segurança adicional caso a política de
// cookies/CORS seja alterada no futuro sem se repensar CSRF.
import { Request, Response, NextFunction } from 'express';
import {
  CSRF_COOKIE,
  CSRF_TOKEN_HEADER,
  buildCsrfCookieOptions,
  csrfTokensMatch,
  deriveCsrfToken,
} from './csrf-token';

const STATE_CHANGING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export const CSRF_HEADER = 'x-requested-with';
export const CSRF_HEADER_VALUE = 'XMLHttpRequest';

export function requiresCsrfHeaderCheck(
  method: string,
  cookies: Record<string, unknown> | undefined,
  tokenCookieName: string,
): boolean {
  if (!STATE_CHANGING_METHODS.has(method.toUpperCase())) return false;
  // Só se aplica quando o pedido pode estar a "boleia" do cookie httpOnly (o
  // vector CSRF). Um pedido só com Bearer não é forjável por um browser de
  // terceiros sem o atacante já conhecer o token.
  return Boolean(cookies?.[tokenCookieName]);
}

// Logins nunca ficam presos por um cookie csrf_token desactualizado (login CSRF tem impacto baixo).
const TOKEN_CHECK_EXEMPT_PATHS = new Set(['/auth/login', '/auth/sso/ldap-login']);

export interface CsrfMiddlewareOptions {
  /** Segredo para o token double-submit (JWT_SECRET). Sem ele só vale a camada do cabeçalho X-Requested-With. */
  secret?: string;
  /**
   * false (rollout): sessões antigas, sem cookie csrf_token, continuam a passar só com X-Requested-With
   * até receberem o cookie no primeiro GET. true: o token é sempre obrigatório.
   */
  strict?: boolean;
  isProd?: boolean;
  /** Allowlist de origens (a mesma do CORS). Se definida, Origin/Referer de escritas com sessão têm de pertencer-lhe. */
  allowedOrigins?: string[];
}

function refererOrigin(referer: unknown): string | undefined {
  if (typeof referer !== 'string') return undefined;
  try {
    return new URL(referer).origin;
  } catch {
    return 'invalid';
  }
}

/**
 * Valida Origin (ou, na sua falta, Referer) contra a allowlist. Sem nenhum dos dois
 * (clientes não-browser) passa: aí contam o cabeçalho custom e o token assinado.
 * `Origin: null` (iframes sandbox, redirects cross-site) é rejeitado.
 */
export function isOriginAllowed(
  headers: Record<string, unknown>,
  allowedOrigins: string[],
): boolean {
  const origin = typeof headers.origin === 'string' ? headers.origin : undefined;
  const candidate = origin ?? refererOrigin(headers.referer);
  if (candidate === undefined) return true;
  return allowedOrigins.includes(candidate);
}

export function csrfHeaderMiddleware(tokenCookieName: string, options: CsrfMiddlewareOptions = {}) {
  const { secret, strict = false, isProd = false, allowedOrigins } = options;
  return (req: Request, res: Response, next: NextFunction): void => {
    const cookies = req.cookies as Record<string, unknown> | undefined;
    const session = cookies?.[tokenCookieName];
    const expected =
      secret && typeof session === 'string' ? deriveCsrfToken(session, secret) : undefined;

    // Auto-recuperação: pedido seguro com sessão e cookie csrf_token em falta/desactualizado
    // (sessões anteriores a esta defesa, token rodado sem passar pelo login). O frontend lê-o a seguir.
    if (!STATE_CHANGING_METHODS.has(req.method.toUpperCase())) {
      if (expected && cookies?.[CSRF_COOKIE] !== expected) {
        res.cookie(CSRF_COOKIE, expected, buildCsrfCookieOptions(isProd));
      }
      next();
      return;
    }

    if (!requiresCsrfHeaderCheck(req.method, cookies, tokenCookieName)) {
      next();
      return;
    }
    if (allowedOrigins && !isOriginAllowed(req.headers, allowedOrigins)) {
      res.status(403).json({
        statusCode: 403,
        message: 'Pedido rejeitado: origem não autorizada',
      });
      return;
    }
    if (req.headers[CSRF_HEADER] !== CSRF_HEADER_VALUE) {
      res.status(403).json({
        statusCode: 403,
        message: 'Pedido rejeitado: cabeçalho anti-CSRF em falta ou inválido',
      });
      return;
    }
    // Token assinado: obrigatório a quem já o tem (um atacante cross-site envia sempre o cookie
    // mas nunca consegue ler o valor para o pôr no cabeçalho) e a todos em modo strict.
    if (
      expected &&
      !TOKEN_CHECK_EXEMPT_PATHS.has(req.path) &&
      (strict || cookies?.[CSRF_COOKIE] !== undefined)
    ) {
      if (!csrfTokensMatch(req.headers[CSRF_TOKEN_HEADER], expected)) {
        res.status(403).json({
          statusCode: 403,
          message: 'Pedido rejeitado: token anti-CSRF em falta ou inválido',
        });
        return;
      }
    }
    next();
  };
}
