import { SetMetadata } from '@nestjs/common';

export const AUTHENTICATED_ONLY_KEY = 'authenticatedOnly';
export const PERMISSION_KEY = 'requiredPermission';

/**
 * Opt-out EXPLÍCITO de papel: qualquer utilizador autenticado pode chamar, e o handler/serviço
 * garante o âmbito (ex.: dados do próprio utilizador). Substitui o "esquecer o @Roles".
 */
export const AnyAuthenticated = () => SetMetadata(AUTHENTICATED_ONLY_KEY, true);

/** Exige uma permissão fina (ex.: 'settings.write') presente em `user.role.permissions`. */
export const RequirePermission = (...permissions: string[]) =>
  SetMetadata(PERMISSION_KEY, permissions);
