import { timingSafeEqual } from 'crypto';
import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';

/** Comparação em tempo constante (evita timing attack sobre o token estático). */
function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

/**
 * Protege o GET /metrics com um token estático (Authorization: Bearer $METRICS_TOKEN).
 * Fail-closed: sem METRICS_TOKEN definido, nega tudo.
 */
@Injectable()
export class MetricsTokenGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const expected = process.env.METRICS_TOKEN;
    const req = context.switchToHttp().getRequest();
    const header: string = req.headers?.authorization ?? '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : '';
    if (expected && safeEqual(token, expected)) return true;
    throw new UnauthorizedException();
  }
}
