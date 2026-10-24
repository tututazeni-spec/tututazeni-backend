import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { AUTHENTICATED_ONLY_KEY, PERMISSION_KEY } from '../decorators/authz.decorators';

/**
 * Autorização global. Cada handler tem de declarar UMA política:
 *  @Roles(...)            → papel na lista
 *  @RequirePermission(..) → permissão fina do papel (Permission.name)
 *  @AnyAuthenticated()    → qualquer utilizador autenticado (o serviço garante o âmbito)
 *  @Public()              → sem autenticação (JwtAuthGuard já saltou)
 * Sem política → 403 (deny-by-default). AUTHZ_DENY_BY_DEFAULT=false repõe o comportamento antigo
 * (fail-open) como rollback de emergência.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const targets = [context.getHandler(), context.getClass()];
    const { user } = context.switchToHttp().getRequest();

    const requiredRoles = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, targets);
    if (requiredRoles) {
      if (!requiredRoles.includes(user?.role?.name)) {
        throw new ForbiddenException('Acesso negado: permissão insuficiente');
      }
      return true;
    }

    const requiredPermissions = this.reflector.getAllAndOverride<string[]>(PERMISSION_KEY, targets);
    if (requiredPermissions) {
      const owned = new Set<string>(
        ((user?.role?.permissions ?? []) as Array<{ name: string }>).map(p => p.name),
      );
      if (!requiredPermissions.every(p => owned.has(p))) {
        throw new ForbiddenException('Acesso negado: permissão insuficiente');
      }
      return true;
    }

    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, targets)) return true;

    if (this.reflector.getAllAndOverride<boolean>(AUTHENTICATED_ONLY_KEY, targets)) {
      if (!user) throw new ForbiddenException('Acesso negado: autenticação necessária');
      return true;
    }

    if (process.env.AUTHZ_DENY_BY_DEFAULT === 'false') return true;
    throw new ForbiddenException('Acesso negado: endpoint sem política de autorização');
  }
}
