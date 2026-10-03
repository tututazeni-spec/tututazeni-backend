// src/automation/automation-permission.guard.ts
// §10 — aplica a matriz de permissões por perfil (e o âmbito por departamento)
// às rotas do módulo. Corre depois do JwtAuthGuard/RolesGuard.
import {
  CanActivate,
  ExecutionContext,
  Injectable,
  SetMetadata,
  applyDecorators,
  UseGuards,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AutomationAccessService, AutomationAction } from './automation-access.service';
import { CurrentUserData } from '../common/decorators';

const KEY = 'automation:permission';

interface PermissionMeta {
  action: AutomationAction;
  /** Nome do parâmetro de rota que contém o id da automação (âmbito por departamento). */
  ruleParam?: string;
}

@Injectable()
export class AutomationPermissionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly access: AutomationAccessService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const meta = this.reflector.get<PermissionMeta | undefined>(KEY, ctx.getHandler());
    if (!meta) return true;
    const req = ctx.switchToHttp().getRequest<{
      user?: CurrentUserData;
      params?: Record<string, string>;
    }>();
    if (!req.user) return false;
    const raw = meta.ruleParam ? req.params?.[meta.ruleParam] : undefined;
    const ruleId = raw !== undefined && /^\d+$/.test(raw) ? Number(raw) : undefined;
    await this.access.assert(req.user, meta.action, ruleId);
    return true;
  }
}

/** `@AutomationPerm('edit', 'id')` — exige a acção e, se houver `id`, que a regra esteja no âmbito. */
export const AutomationPerm = (action: AutomationAction, ruleParam?: string) =>
  applyDecorators(
    SetMetadata(KEY, { action, ruleParam } satisfies PermissionMeta),
    UseGuards(AutomationPermissionGuard),
  );
