// src/common/security/upload-throttle.ts
// Rate limit específico das rotas que recebem ficheiros inline (data URL em JSON, até 8 MB).
// O limite global (100/min) é por IP; num escritório todos os colaboradores partilham o IP de
// saída, por isso nas rotas de upload o contador é POR UTILIZADOR autenticado. O ThrottlerGuard
// corre depois do JwtAuthGuard (ver app.module), logo `req.user` já existe aqui.
import { applyDecorators, ExecutionContext, Injectable, SetMetadata } from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';

export const UPLOAD_THROTTLE_KEY = 'uploadThrottle';
export const UPLOAD_THROTTLE_TTL = 60_000;
export const UPLOAD_LIMIT_DEFAULT = 20;
export const UPLOAD_LIMIT_TEST = 10_000;

/** Pedidos de upload por utilizador e por minuto (override: UPLOAD_THROTTLE_LIMIT). */
export function uploadThrottleLimit(env: NodeJS.ProcessEnv = process.env): number {
  const fromEnv = Number(env.UPLOAD_THROTTLE_LIMIT);
  if (Number.isInteger(fromEnv) && fromEnv > 0) return fromEnv;
  return env.NODE_ENV === 'test' ? UPLOAD_LIMIT_TEST : UPLOAD_LIMIT_DEFAULT;
}

/** Marca um handler como rota de upload: limite próprio, contado por utilizador. */
export function UploadThrottle() {
  return applyDecorators(
    Throttle({ default: { limit: uploadThrottleLimit(), ttl: UPLOAD_THROTTLE_TTL } }),
    SetMetadata(UPLOAD_THROTTLE_KEY, true),
  );
}

type TrackedRequest = Record<string, unknown> & { user?: { id?: number | string } };

/** ThrottlerGuard que conta por utilizador nas rotas marcadas com @UploadThrottle(). */
@Injectable()
export class AppThrottlerGuard extends ThrottlerGuard {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const perUser = this.reflector.getAllAndOverride<boolean>(UPLOAD_THROTTLE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (perUser) {
      const req = context.switchToHttp().getRequest<TrackedRequest>();
      req.__throttlePerUser = true;
    }
    return super.canActivate(context);
  }

  protected async getTracker(req: TrackedRequest): Promise<string> {
    const id = req.user?.id;
    if (req.__throttlePerUser && id !== undefined && id !== null) return `user:${String(id)}`;
    return super.getTracker(req);
  }
}
