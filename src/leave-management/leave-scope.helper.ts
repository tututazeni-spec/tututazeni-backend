// ─── src/leave-management/leave-scope.helper.ts ──────────────────────────────
// Âmbito de visibilidade partilhado pelas abas Visão Geral, Férias, Licenças,
// Ausências e Calendário (docs/Modulo_Leave.md §2-§6): colaborador → só si;
// gestor/líder/director → a sua equipa; ADMIN/RH → toda a organização.
import { Prisma } from '@prisma/client';
import { Role } from '../auth/enums/role.enum';
import { CurrentUserData } from '../common/types/current-user';
import { isPrivileged } from '../common/authz/ownership';

export const ORG_WIDE_ROLES = [Role.ADMIN, Role.RH];
export const TEAM_ROLES = [Role.GESTOR, Role.DIRECTOR, Role.LIDER];

export type LeaveScope = 'ORGANIZATION' | 'TEAM' | 'SELF';

export function leaveScopeOf(user: CurrentUserData): LeaveScope {
  if (isPrivileged(user, ORG_WIDE_ROLES)) return 'ORGANIZATION';
  if (isPrivileged(user, TEAM_ROLES)) return 'TEAM';
  return 'SELF';
}

export function leaveScopeWhere(user: CurrentUserData): Prisma.UserWhereInput {
  const scope = leaveScopeOf(user);
  if (scope === 'ORGANIZATION') return {};
  if (scope === 'TEAM') {
    return {
      OR: [
        { id: user.id },
        { managerId: user.id },
        { department: { OR: [{ headId: user.id }, { directManagerId: user.id }] } },
      ],
    };
  }
  return { id: user.id };
}

/** Âmbito do perfil + filtros opcionais de unidade/departamento/equipa. */
export function leaveUserFilter(
  user: CurrentUserData,
  f: { unitId?: number; departmentId?: number; managerId?: number; userId?: number },
): Prisma.UserWhereInput {
  const and: Prisma.UserWhereInput[] = [leaveScopeWhere(user)];
  if (f.unitId) and.push({ unitId: f.unitId });
  if (f.departmentId) and.push({ departmentId: f.departmentId });
  if (f.managerId) and.push({ managerId: f.managerId });
  if (f.userId) and.push({ id: f.userId });
  return { AND: and };
}

/** O titular ou ADMIN/RH — os únicos que vêem dados sensíveis (saúde, motivo). */
export function canSeeSensitive(user: CurrentUserData, ownerId: number): boolean {
  return user.id === ownerId || isPrivileged(user, ORG_WIDE_ROLES);
}
