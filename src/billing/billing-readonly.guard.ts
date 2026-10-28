import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { BillingLimitsService } from './billing-limits.service';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
// Rotas que têm de continuar a funcionar para o cliente poder regularizar a situação.
const EXEMPT_PREFIXES = ['/auth', '/billing', '/health', '/metrics'];

/**
 * Subscrição expirada/cancelada ou teste terminado → plataforma em modo só de leitura (não
 * bloqueia consultas nem o login). Sem subscrição, não faz nada. Falha aberta: um erro a
 * ler o estado nunca derruba a aplicação.
 */
@Injectable()
export class BillingReadOnlyGuard implements CanActivate {
  constructor(private readonly limits: BillingLimitsService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    if (ctx.getType() !== 'http') return true;
    const req = ctx.switchToHttp().getRequest<{ method: string; path?: string; url: string }>();
    if (SAFE_METHODS.has(req.method)) return true;
    const path = (req.path ?? req.url).split('?')[0];
    if (EXEMPT_PREFIXES.some(p => path === p || path.startsWith(`${p}/`))) return true;
    let readOnly = false;
    try {
      readOnly = (await this.limits.current()).readOnly;
    } catch {
      return true;
    }
    if (readOnly) {
      throw new ForbiddenException(
        'A subscrição expirou: a plataforma está em modo só de leitura. Regularize a fatura em aberto para voltar a editar.',
      );
    }
    return true;
  }
}
