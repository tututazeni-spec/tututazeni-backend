// src/audit/audit-scope.ts
// modulo_audit.md §16 — matriz de acesso por perfil. Só ADMIN e AUDITOR têm consulta global;
// RH e GESTOR vêem apenas os módulos (e, no caso do GESTOR, a equipa/unidade) que lhes competem.
// Qualquer outro perfil (COLABORADOR, INSTRUCTOR, serviços/integrações…) não consulta auditoria.
import { ForbiddenException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';

/** Perfis com consulta global dos registos. */
export const AUDIT_GLOBAL_ROLES: readonly string[] = ['ADMIN', 'AUDITOR'];

/** Módulos (matriz §13) consultáveis pelo RH. Exclui segurança, integrações, automações e o próprio Audit. */
export const RH_SCOPE_MODULES: readonly string[] = [
  'Payroll',
  'Departments',
  'Organization',
  'Attendance',
  'Leave',
  'Evaluation 360',
  'Performance',
  'Competencies',
  'Onboarding',
  'Development Plans / PDI',
  'Career Plans',
  'Succession',
  'Work Declaration',
  'Document Repository',
  'Courses',
  'Course Modules / Lessons',
  'Enrollments',
  'Trainings',
  'Users',
];

/** Módulos consultáveis pelo gestor, sobre eventos de utilizadores da sua unidade ou equipa. */
export const GESTOR_SCOPE_MODULES: readonly string[] = [
  'Attendance',
  'Leave',
  'Evaluation 360',
  'Performance',
  'Competencies',
  'Development Plans / PDI',
  'Career Plans',
  'Onboarding',
  'Trainings',
  'Enrollments',
  'Courses',
  'Work Declaration',
  'Events',
  'Processes',
];

/** Entidades de autenticação ficam sempre fora do âmbito de RH (módulo «Users» mistura-as). */
const AUTH_ENTITIES = ['Auth', 'Session', 'RefreshToken'];

export interface AuditViewer {
  id: number;
  role?: { name?: string | null } | null;
}

export interface TeamLookup {
  user: {
    findUnique(args: {
      where: { id: number };
      select: { departmentId: true };
    }): Promise<{ departmentId: number | null } | null>;
    findMany(args: {
      where: Prisma.UserWhereInput;
      select: { id: true };
    }): Promise<Array<{ id: number }>>;
  };
}

export function isGlobalAuditRole(role?: string | null): boolean {
  return !!role && AUDIT_GLOBAL_ROLES.includes(role);
}

/**
 * Filtro Prisma que limita o que o perfil pode consultar; `null` = consulta global.
 * Perfis fora da matriz recebem 403 (defesa em profundidade além do @Roles do controller).
 */
export async function resolveAuditScope(
  viewer: AuditViewer,
  db: TeamLookup,
): Promise<Prisma.AuditLogWhereInput | null> {
  const role = viewer.role?.name;
  if (isGlobalAuditRole(role)) return null;

  if (role === 'RH') {
    return {
      module: { in: [...RH_SCOPE_MODULES] },
      NOT: { entity: { in: AUTH_ENTITIES, mode: 'insensitive' } },
    };
  }

  if (role === 'GESTOR') {
    const me = await db.user.findUnique({
      where: { id: viewer.id },
      select: { departmentId: true },
    });
    const orgScope: Prisma.UserWhereInput[] = [{ managerId: viewer.id }];
    if (me?.departmentId != null) orgScope.push({ departmentId: me.departmentId });
    const team = await db.user.findMany({ where: { OR: orgScope }, select: { id: true } });
    const ids = [...new Set([viewer.id, ...team.map(t => t.id)])];
    return {
      module: { in: [...GESTOR_SCOPE_MODULES] },
      userId: { in: ids },
      NOT: { entity: { in: AUTH_ENTITIES, mode: 'insensitive' } },
    };
  }

  throw new ForbiddenException('Sem permissão para consultar registos de auditoria');
}

/** Combina o âmbito do perfil (se houver) com um filtro de pesquisa. */
export function withScope(
  where: Prisma.AuditLogWhereInput,
  scope?: Prisma.AuditLogWhereInput | null,
): Prisma.AuditLogWhereInput {
  return scope ? { AND: [scope, where] } : where;
}
