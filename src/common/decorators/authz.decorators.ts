import { SetMetadata } from '@nestjs/common';

export const AUTHENTICATED_ONLY_KEY = 'authenticatedOnly';
export const PERMISSION_KEY = 'requiredPermission';
export const ALLOW_EXTERNAL_KEY = 'allowExternal';

/**
 * Opt-out EXPLÍCITO de papel: qualquer utilizador autenticado pode chamar, e o handler/serviço
 * garante o âmbito (ex.: dados do próprio utilizador). Substitui o "esquecer o @Roles".
 */
export const AnyAuthenticated = () => SetMetadata(AUTHENTICATED_ONLY_KEY, true);

/**
 * O instrutor externo (INSTRUCTOR_EXTERNO) NÃO passa em `@AnyAuthenticated()` por omissão: só
 * em handlers que o marquem com `@AllowExternal()` (dados da própria conta: /auth/me,
 * notificações próprias, perfil próprio…) ou que o listem em `@Roles(...)`. Usar SEMPRE
 * junto com `@AnyAuthenticated()` e só quando o serviço limita ao próprio utilizador.
 */
export const AllowExternal = () => SetMetadata(ALLOW_EXTERNAL_KEY, true);

/** Exige uma permissão fina (ex.: 'settings.write') presente em `user.role.permissions`. */
export const RequirePermission = (...permissions: string[]) =>
  SetMetadata(PERMISSION_KEY, permissions);
