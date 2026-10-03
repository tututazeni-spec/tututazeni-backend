// src/process-standard/process-scope.ts
// Âmbito de acesso aos processos por perfil (docs/Modulo_Processes.md §20):
//  · ADMIN / RH / AUDITOR  → âmbito total (o AUDITOR é só de leitura: as acções
//    de escrita exigem perfil de gestão, que não o inclui);
//  · GESTOR                → processos do seu departamento e dos sub-departamentos
//    directos, mais aqueles em que participa;
//  · restantes             → apenas os processos em que participam.
// Funções puras (sem providers) reutilizadas por todos os serviços do módulo.
// O departamento vem do utilizador autenticado (JwtStrategy devolve o User completo).

import { Prisma } from '@prisma/client';
import { Role } from '../auth/enums/role.enum';
import type { CurrentUserData } from '../common/types/current-user';

export const FULL_SCOPE_ROLES: string[] = [Role.ADMIN, Role.RH, Role.AUDITOR];

export interface ProcessScope {
  /** Vê todos os processos (ADMIN, RH, AUDITOR). */
  fullAccess: boolean;
  /** Departamento do GESTOR (âmbito departamental); `null` nos restantes perfis. */
  departmentId: number | null;
  /** GESTOR com âmbito departamental (mesmo que sem departamento atribuído). */
  departmental: boolean;
}

export function processScope(user: CurrentUserData): ProcessScope {
  const role = user.role?.name ?? '';
  if (FULL_SCOPE_ROLES.includes(role)) {
    return { fullAccess: true, departmentId: null, departmental: false };
  }
  const dep = (user as { departmentId?: number | null }).departmentId ?? null;
  return role === Role.GESTOR
    ? { fullAccess: false, departmentId: dep, departmental: true }
    : { fullAccess: false, departmentId: null, departmental: false };
}

/** Condições de participação directa do utilizador numa instância. */
export function participantWhere(userId: number): Prisma.ProcessInstanceWhereInput[] {
  return [
    { initiatedById: userId },
    { targetUserId: userId },
    { currentResponsibleId: userId },
    { stepProgress: { some: { OR: [{ assigneeId: userId }, { reviewerId: userId }] } } },
  ];
}

/** Filtro Prisma das instâncias visíveis no âmbito do utilizador. */
export function instanceScopeWhere(user: CurrentUserData): Prisma.ProcessInstanceWhereInput {
  const scope = processScope(user);
  if (scope.fullAccess) return {};
  const or = participantWhere(user.id);
  if (scope.departmentId != null) {
    or.push(
      { departmentId: scope.departmentId },
      { department: { parentId: scope.departmentId } },
    );
  }
  return { OR: or };
}

/**
 * O departamento da instância cai no âmbito do utilizador? `parentId` é o do
 * departamento da instância (para cobrir os sub-departamentos directos).
 */
export function inDepartmentScope(
  user: CurrentUserData,
  department: { id?: number | null; parentId?: number | null } | null | undefined,
): boolean {
  const scope = processScope(user);
  if (scope.fullAccess) return true;
  if (scope.departmentId == null || !department) return false;
  return department.id === scope.departmentId || department.parentId === scope.departmentId;
}
