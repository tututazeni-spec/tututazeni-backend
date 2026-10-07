// src/settings/system-settings.interceptor.ts
// Aplica, em todos os pedidos, as Definições de Sistema (§15): modo de manutenção,
// tecto de `?limit=` e limites/tipos de ficheiro nos metadados de upload.
// Corre depois dos guards (req.user já existe) e antes dos pipes (query/body ainda crus).
import {
  BadRequestException,
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { Observable } from 'rxjs';
import { Role } from '../auth/enums/role.enum';
import { SystemSettingsService } from './system-settings.service';
import { checkUploadMetadata, clampLimit, isMaintenanceExempt } from './system-settings';

@Injectable()
export class SystemSettingsInterceptor implements NestInterceptor {
  constructor(private readonly system: SystemSettingsService) {}

  async intercept(ctx: ExecutionContext, next: CallHandler): Promise<Observable<unknown>> {
    if (ctx.getType() !== 'http') return next.handle();
    const req = ctx.switchToHttp().getRequest<{
      url: string;
      method: string;
      query?: Record<string, unknown>;
      body?: unknown;
      user?: { role?: { name?: string } };
    }>();

    let settings;
    try {
      settings = await this.system.load();
    } catch {
      // Sem BD não há definições: nunca bloquear o pedido por causa disto.
      return next.handle();
    }

    if (settings.maintenance.enabled) {
      const isAdmin = req.user?.role?.name === Role.ADMIN;
      if (!isMaintenanceExempt(req.url, isAdmin)) {
        throw new ServiceUnavailableException(settings.maintenance.message);
      }
    }

    const clamped = clampLimit(req.query?.limit, settings.pagination.maxPageSize);
    if (clamped && req.query) req.query.limit = clamped;

    if (req.method !== 'GET' && req.method !== 'DELETE') {
      const problem = checkUploadMetadata(req.body, settings.uploads);
      if (problem) throw new BadRequestException(problem);
    }
    return next.handle();
  }
}
