import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { BillingLimitsService } from './billing-limits.service';
import { moduleForPath } from './billing-route-modules';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const EXEMPT_PREFIXES = ['/auth', '/billing', '/health', '/metrics'];
const MAX_SCAN_BYTES = 25 * 1024 * 1024;

interface Req {
  method: string;
  path?: string;
  url: string;
  headers: Record<string, string | string[] | undefined>;
  body?: unknown;
}

const pathOf = (req: Req) => (req.path ?? req.url).split('?')[0];

/**
 * Direitos do plano em cada pedido: (1) módulo incluído no plano e activo nas Definições;
 * (2) quota de storage — só quando está esgotada, recusa escritas que trazem ficheiros
 * (multipart ou data-URL no corpo); consultas e escritas sem ficheiros continuam.
 * Falha aberta: um erro a ler o estado nunca derruba a aplicação.
 */
@Injectable()
export class BillingEntitlementsGuard implements CanActivate {
  constructor(private readonly limits: BillingLimitsService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    if (ctx.getType() !== 'http') return true;
    const req = ctx.switchToHttp().getRequest<Req>();
    const path = pathOf(req);
    if (EXEMPT_PREFIXES.some(p => path === p || path.startsWith(`${p}/`))) return true;

    try {
      const subject = moduleForPath(path);
      if (subject) {
        const reason = await this.limits.moduleBlockReason(subject);
        if (reason) throw new ForbiddenException(reason);
      }
      // Ordem importa: a quota (em cache) é barata; inspeccionar o corpo só se estiver esgotada.
      if (
        !SAFE_METHODS.has(req.method) &&
        (await this.limits.storageExceeded()) &&
        this.carriesFile(req)
      ) {
        const { limits } = await this.limits.current();
        throw new ForbiddenException(
          `Quota de armazenamento esgotada (${limits.maxStorageGb} GB). Liberte espaço ou mude de plano para enviar novos ficheiros.`,
        );
      }
    } catch (e) {
      if (e instanceof ForbiddenException) throw e;
      return true;
    }
    return true;
  }

  private carriesFile(req: Req): boolean {
    const type = String(req.headers['content-type'] ?? '');
    if (type.startsWith('multipart/')) return true;
    if (!req.body || typeof req.body !== 'object') return false;
    const len = Number(req.headers['content-length'] ?? 0);
    if (len > MAX_SCAN_BYTES) return true; // corpo gigante em JSON é quase de certeza um ficheiro inline
    return JSON.stringify(req.body).includes('"data:');
  }
}
