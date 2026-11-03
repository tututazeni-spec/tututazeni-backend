import { UnauthorizedException } from '@nestjs/common';

export const ACCESS_EXPIRED_MESSAGE = 'Acesso expirado — contacte o administrador';

/** Contas com prazo de acesso (instrutor externo): `accessExpiresAt` no passado = expirada. */
export function isAccessExpired(
  user: { accessExpiresAt?: Date | string | null },
  now: Date = new Date(),
): boolean {
  if (!user.accessExpiresAt) return false;
  return new Date(user.accessExpiresAt).getTime() < now.getTime();
}

export function assertAccessNotExpired(user: { accessExpiresAt?: Date | string | null }): void {
  if (isAccessExpired(user)) throw new UnauthorizedException(ACCESS_EXPIRED_MESSAGE);
}
