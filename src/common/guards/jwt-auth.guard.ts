// src/common/guards/jwt-auth.guard.ts
import { ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { setRlsPrivileged, setRlsUser } from '../rls/rls-context';
import { setRequestAction, setRequestUserId } from '../logging/request-context';
import { CurrentUserData } from '../types/current-user';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private reflector: Reflector) {
    super();
  }

  canActivate(context: ExecutionContext) {
    // Primeiro guard global: fixa a acção cedo para que todos os logs do pedido a incluam.
    setRequestAction(`${context.getClass().name}.${context.getHandler().name}`);
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      // rota pública valida o seu próprio token/credenciais e precisa de acesso à BD sem utilizador
      setRlsPrivileged(true);
      return true; // ← ignora o guard se for rota pública
    }

    return super.canActivate(context);
  }

  handleRequest<TUser = CurrentUserData>(err: Error | null, user: CurrentUserData | false): TUser {
    if (err || !user) {
      throw err || new UnauthorizedException('Token inválido ou expirado');
    }
    setRequestUserId(user?.id);
    setRlsUser(user.id, user.roleCode ?? (user.role as { code?: string } | null)?.code);
    return user as TUser;
  }
}
