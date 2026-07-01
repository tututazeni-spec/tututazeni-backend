import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';

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
    if (expected && token === expected) return true;
    throw new UnauthorizedException();
  }
}
