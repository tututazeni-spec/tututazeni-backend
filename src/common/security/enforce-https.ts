// src/common/security/enforce-https.ts
// Defesa em profundidade contra downgrade de protocolo (auditoria A-1, achado B2).
// O Caddy já redirecciona HTTP na borda; isto protege contra um proxy futuro
// mal configurado. Usa o header explícito (e não req.secure) de propósito: o
// healthcheck do Docker bate directo na :4000 sem X-Forwarded-Proto e tem de
// continuar a passar — senão o health gate do deploy parte.
import { Request, Response, NextFunction } from 'express';

export function httpsRedirectTarget(
  proto: string | undefined,
  host: string | undefined,
  url: string,
  isProd: boolean,
): string | null {
  if (!isProd || !host) return null;
  const first = proto?.split(',')[0]?.trim();
  if (first !== 'http') return null;
  return `https://${host}${url}`;
}

export function enforceHttpsMiddleware(isProd: boolean) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const target = httpsRedirectTarget(
      req.headers['x-forwarded-proto'] as string | undefined,
      req.headers.host,
      req.originalUrl,
      isProd,
    );
    if (target) {
      res.redirect(308, target);
      return;
    }
    next();
  };
}
