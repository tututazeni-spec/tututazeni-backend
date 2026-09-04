// src/common/authz/ownership.ts
// Autorização ao nível do dado (auditoria A-3). Fonte de verdade do papel: o
// enum Role — nunca literais soltos como 'EMPLOYEE' (que é apenas um alias de
// 'COLABORADOR' e por isso nunca corresponde ao nome real do papel).
import { NotFoundException } from '@nestjs/common';
import { Role } from '../../auth/enums/role.enum';

interface AuthUserLike {
  id: number;
  role?: { name: string } | null;
}

export function isPrivileged(user: AuthUserLike, roles: Role[]): boolean {
  const name = user.role?.name;
  return !!name && roles.map(String).includes(name);
}

export function assertCanAccess<T>(
  resource: T | null | undefined,
  ownerId: number | string,
  user: AuthUserLike,
  privilegedRoles: Role[] = [],
): asserts resource is T {
  if (!resource) throw new NotFoundException('Recurso não encontrado');
  if (String(user.id) === String(ownerId)) return;
  if (isPrivileged(user, privilegedRoles)) return;
  throw new NotFoundException('Recurso não encontrado');
}
