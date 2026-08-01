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

export function csrfHeaderMiddleware(tokenCookieName: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!requiresCsrfHeaderCheck(req.method, req.cookies, tokenCookieName)) {
      next();
      return;
    }
    if (req.headers[CSRF_HEADER] !== CSRF_HEADER_VALUE) {
      res.status(403).json({
        statusCode: 403,
        message: 'Pedido rejeitado: cabeçalho anti-CSRF em falta ou inválido',
      });
      return;
    }
    next();
  };
}
