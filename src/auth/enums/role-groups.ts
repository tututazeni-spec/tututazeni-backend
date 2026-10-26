import { Role } from './role.enum';

/**
 * Grupos de papéis canónicos — fonte única para @Roles(...) e verificações de
 * serviço. Antes cada controller/serviço declarava a sua própria cópia local
 * (`const ADMIN = [...]`, `MGMT_ROLES`, `PRIVILEGED`, ...) e as cópias divergiam.
 *
 * Os controllers/serviços continuam a dar um nome de intenção local
 * (`const MANAGE_ROLES = ADMIN_RH_GESTOR_ROLES`), mas a composição vive só aqui.
 * Mudar a composição de um grupo muda todos os seus consumidores: o inventário
 * de autorização (test/authz) existe para tornar essa mudança visível.
 *
 * Tipados como `Role[]` (os helpers de serviço recebem `Role[]`); o RolesGuard
 * (string) — assim `.includes(user.role.name)` compila sem casts.
 */
type RoleGroup = Role[];

export const ADMIN_RH_ROLES: RoleGroup = [Role.ADMIN, Role.RH];
export const ADMIN_RH_DIRECTOR_ROLES: RoleGroup = [Role.ADMIN, Role.RH, Role.DIRECTOR];
export const ADMIN_DIRECTOR_ROLES: RoleGroup = [Role.ADMIN, Role.DIRECTOR];
export const ADMIN_RH_GESTOR_ROLES: RoleGroup = [Role.ADMIN, Role.RH, Role.GESTOR];
export const ADMIN_RH_LIDER_GESTOR_ROLES: RoleGroup = [
  Role.ADMIN,
  Role.RH,
  Role.LIDER,
  Role.GESTOR,
];
export const ADMIN_RH_AUDITOR_ROLES: RoleGroup = [Role.ADMIN, Role.RH, Role.AUDITOR];
export const ADMIN_RH_INSTRUCTOR_ROLES: RoleGroup = [Role.ADMIN, Role.RH, Role.INSTRUCTOR];
export const ADMIN_RH_DIRECTOR_AUDITOR_ROLES: RoleGroup = [
  Role.ADMIN,
  Role.RH,
  Role.DIRECTOR,
  Role.AUDITOR,
];
/** ADMIN, RH e quem lidera pessoas (DIRECTOR, GESTOR, LIDER). */
export const ADMIN_RH_LEADERSHIP_ROLES: RoleGroup = [
  Role.ADMIN,
  Role.RH,
  Role.DIRECTOR,
  Role.GESTOR,
  Role.LIDER,
];
export const ADMIN_RH_LEADERSHIP_INSTRUCTOR_ROLES: RoleGroup = [
  ...ADMIN_RH_LEADERSHIP_ROLES,
  Role.INSTRUCTOR,
];
export const DIRECTOR_GESTOR_LIDER_ROLES: RoleGroup = [Role.DIRECTOR, Role.GESTOR, Role.LIDER];
