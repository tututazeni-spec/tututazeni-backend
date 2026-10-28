import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  SetMetadata,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request, Response } from 'express';
import { ApiIntegrationService, ApiKeyRecord } from '../api-integration/api-integration.service';
import { ApiKeyRateLimiter } from './api-key-rate-limiter';
import { ApiScope, ipAllowed, scopeAllows } from './api-key-limits';

export const API_SCOPE_KEY = 'apiScope';
/** Scope mínimo que a chave precisa para chamar o handler. */
export const RequireApiScope = (scope: ApiScope) => SetMetadata(API_SCOPE_KEY, scope);

export type ApiKeyRequest = Request & { apiKey?: ApiKeyRecord };

// Autentica pedidos da API pública por chave (X-API-Key, ou Authorization: Bearer ik_…).
// As rotas são @Public() para o JwtAuthGuard não exigir sessão; este guard é a única porta.
@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly integrations: ApiIntegrationService,
    private readonly limiter: ApiKeyRateLimiter,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<ApiKeyRequest>();
    const res = context.switchToHttp().getResponse<Response>();

    const raw = this.extractKey(req);
    if (!raw) {
      throw new UnauthorizedException('Chave de API em falta. Envie o cabeçalho X-API-Key.');
    }

    const key = await this.integrations.authenticateApiKey(raw);
    if (!key) throw new UnauthorizedException('Chave de API inválida, revogada ou expirada.');

    if (!ipAllowed(key.allowedIps, req.ip)) {
      throw new ForbiddenException('Este endereço IP não está autorizado a usar esta chave.');
    }

    const required = this.reflector.getAllAndOverride<ApiScope>(API_SCOPE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (required && !scopeAllows(key.scopes ?? [], required)) {
      throw new ForbiddenException(`Esta chave não tem o scope "${required}" necessário.`);
    }

    const decision = await this.limiter.hit(key.id, key.rateLimit ?? 1000);
    res.setHeader('X-RateLimit-Limit', String(decision.limit));
    res.setHeader('X-RateLimit-Remaining', String(decision.remaining));
    res.setHeader('X-RateLimit-Reset', String(decision.resetSeconds));
    if (!decision.allowed) {
      res.setHeader('Retry-After', String(decision.resetSeconds));
      throw new HttpException(
        `Limite de ${decision.limit} pedidos por minuto excedido. Tente novamente em ${decision.resetSeconds}s.`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    // lastUsedAt: uma escrita por minuto e por chave, não por pedido.
    if (decision.first) this.integrations.touchApiKey(key.id);

    req.apiKey = key;
    return true;
  }

  private extractKey(req: Request): string | null {
    const header = req.headers['x-api-key'];
    if (typeof header === 'string' && header.trim()) return header.trim();
    const auth = req.headers.authorization;
    if (typeof auth === 'string' && auth.startsWith('Bearer ik_')) return auth.slice(7).trim();
    return null;
  }
}
