import { NextFunction, Request, Response } from 'express';
import { verify } from 'jsonwebtoken';
import { toSecretKeyObject } from '../../auth/jwt-key';
import { setRequestUserId } from './request-context';

const BEARER = /^Bearer\s+(.+)$/i;

function extractToken(req: Request): string | null {
  const cookieToken = (req.cookies as Record<string, string | undefined> | undefined)?.token;
  if (cookieToken) return cookieToken;
  const match = BEARER.exec(req.headers?.authorization ?? '');
  return match ? match[1] : null;
}

/**
 * Preenche o `userId` do contexto de log o mais cedo possível, só para correlação.
 * Verifica a assinatura (um `sub` não verificado seria forjável nos logs) mas NÃO
 * autentica nada: qualquer falha é ignorada e a autorização continua a cargo do
 * JwtAuthGuard. Cobre logs emitidos antes do guard e rotas `@Public` com sessão
 * (logout, refresh), onde o guard não chega a correr.
 */
export function logIdentityMiddleware(secret: string | undefined) {
  // KeyObject criado uma só vez: com o segredo em texto o jsonwebtoken tenta
  // createPublicKey() (e falha com excepção) em CADA pedido — ver auth/jwt-key.ts.
  const key = secret ? toSecretKeyObject(secret) : null;
  return (req: Request, _res: Response, next: NextFunction): void => {
    const token = key ? extractToken(req) : null;
    if (token && key) {
      try {
        const payload = verify(token, key, { algorithms: ['HS256'] });
        if (typeof payload === 'object' && payload.sub != null) {
          setRequestUserId(payload.sub);
        }
      } catch {
        // token inválido/expirado: segue sem userId (o guard decide)
      }
    }
    next();
  };
}
