# Fase D — Matriz de paridade de rotas roles/permissions + ABAC

> Nota de trabalho da Task 1. Trava as decisões das Tasks 2–8. Confirmada por leitura
> de `src/acl/acl.{controller,service}.ts`, `src/departments/departments.{controller,service}.ts`
> (`RolesController`/`RolesService`), `src/roles-permissions/roles-permissions.{controller,service}.ts`
> e dos 3 specs de integração (`test/integration/{acl,roles-permissions,departments}/`).

## Serviço canónico

`RolesPermissionsService` (`src/roles-permissions/roles-permissions.service.ts`, 669 linhas).
Injecta hoje só `PrismaService`. **Passa a injectar também `CacheService`** (módulo `@Global()`,
sem import de módulo) — necessário para portar `getUserPermissions` (cache Redis 60s de
permissões efectivas) e `assignRoleToUser` (invalidação dessa cache) de `AclService` sem
regressão de comportamento nem de forma de resposta.

Métodos **pré-existentes** reutilizados: `findAll`, `findOne` (throws `NotFoundException`),
`create` (throws `ConflictException` em nome duplicado, auto-`code`, audit log, aceita
`permissionIds`), `update`, `remove` (throws `ConflictException` se `_count.users > 0`),
`cloneRole(id, newName)`, `assignToUser(userId, roleId)`, `bulkAssignRole(dto)`,
`addPermissionsToRole(roleId, ids[])`, `removePermissionsFromRole(roleId, ids[])`,
`setRolePermissions`, `getPermissionMatrix()` (superconjunto do de `AclService` — acrescenta
`grouped`), `getGovernanceStats()`.

Métodos **absorvidos** nesta fase (portados verbatim de `AclService`/`departments.RolesService`,
ajustando `this.prisma`):
`getAllPermissions()`, `createPermission({name,action,subject,roleId?})`, `deletePermission(id)`,
`initDefaultRoles()`, `seedDefaultPermissionsForRole(roleId,code,names[])`,
`getUserPermissions(userId)`, `getAuditLog(filters)`, `getDeniedLog(filters)`, `getStats()`,
`assignRoleToUser(dto:{userId,roleId})`, wrappers single `assignPermissionToRole(roleId,pId)` /
`revokePermissionFromRole(roleId,pId)`.

`BUILTIN_PERMISSIONS` + `ROLE_DEFAULTS` movem para `src/roles-permissions/role-defaults.ts`
(importado por `acl.service.ts` até este ser eliminado na Task 7).

`seedBuiltinPermissions` (de `AclService`) **não é portado** — zero chamadas em todo o repo
(sem rota, sem teste, sem seed). Morre com `AclService` na Task 7.

## Removido (ABAC — decisão do dono do produto 2026-09-05)

| Elemento | Ficheiro | Acção |
|---|---|---|
| `getPolicies` / `createPolicy` / `evaluatePolicies` / `checkPermission` / `hasPermission` / `logDenied` | `acl.service.ts` | eliminados (com o ficheiro, Task 7) |
| `safeM` / `DynamicModelDelegate` / `AccessPolicyRow` / `PERM_CACHE_TTL_SECONDS`/`permKey` | `acl.service.ts` | eliminados (com o ficheiro) — `permKey`/TTL migram para o topo de `roles-permissions.service.ts` junto com `getUserPermissions` |
| `CreatePolicyDto` / `CheckPermissionDto` | `acl.dto.ts` | eliminados |
| `AccessPolicyRow` export | `acl.dto.ts`/`acl.service.ts` | eliminado |
| Handlers `@Get('policies')` / `@Post('policies')` / `@Post('check')` | `acl.controller.ts` | eliminados → 404 |
| Testes `GET/POST /acl/policies`, `POST /acl/check` (`acl.integration-spec.ts` describe "Políticas (ABAC/PBAC)" + o 3º teste do describe "my-permissions e check") | integração | substituídos por asserts de 404 |
| `getPolicies`/`createPolicy`/`checkPermission` no `acl.controller.spec.ts` | unit | removidos |

## Matriz — `AclController` (`/acl/*`) → canónico

| Rota | Handler hoje → `AclService.` | Canónico | Δ forma | Adaptador |
|---|---|---|---|---|
| `GET /acl/my-permissions` | `getUserPermissions(user.id)` | `getUserPermissions(user.id)` (portado verbatim, com cache) | nenhuma | não |
| `GET /acl/permissions` | `getAllPermissions()` | `getAllPermissions()` | nenhuma | não |
| `POST /acl/permissions` | `createPermission(dto)` | `createPermission(dto)` (dto `CreatePermissionDto` de `acl.dto.ts`, `roleId` não existe nesse DTO → nunca cria RolePermission, igual a hoje) | nenhuma | não |
| `GET /acl/roles` | `getRoles()` | `findAll()` | `findAll` acrescenta `effectivePermissions`/`usersCount`/`isSystem`/`priority` — superconjunto, não parte o FE | não (campos extra tolerados) |
| `GET /acl/roles/:id` | `getRole(id)` → `null` se ausente (200+null) | `findOne(id)` → `throws NotFoundException` (404) | 200+null → 404 | **sim**: `try { return await svc.findOne(id) } catch (e) { if (e instanceof NotFoundException) return null; throw e }` — preserva contrato histórico (candidato a alinhar em follow-up) |
| `POST /acl/roles` | `createRole(dto)` → row crua + auto-seed `ROLE_DEFAULTS` | `create(dto)` (após Task 3 faz auto-seed `ROLE_DEFAULTS`) | devolve `findOne()` (com `permissions`/`users`/`_count`) em vez de row crua; passa a lançar 409 em nome duplicado | não (campos extra + 409 tolerados; integração usa nome único) |
| `PATCH /acl/roles/:id` | `updateRole(id, dto)` | `update(id, dto)` | `update` devolve `findOne()`; ignora `priority`/`parentRoleId` (já hoje ignorados) | não |
| `POST /acl/roles/:id/clone` | `cloneRole(id, dto)` (dto `{newName}`) | `cloneRole(id, dto.newName)` | nenhuma (ambos devolvem detalhe com `permissions`) | **sim** (fino): passar `dto.newName` |
| `GET /acl/roles/:roleId/permissions` | `getRolePermissions(id)` = `getRole(id)` → `null` se ausente | `findOne(id)` | 200+null → 404 | **sim**: mesmo `try/catch → null` |
| `POST /acl/roles/:roleId/permissions/:permissionId` | `assignPermissionToRole(rId, pId)` (upsert, devolve `getRole`) | `addPermissionsToRole(rId, [pId])` (devolve `findOne`) | nenhuma relevante (integração testa `.permissions`) | **sim** (fino): `[pId]` |
| `DELETE /acl/roles/:roleId/permissions/:permissionId` (`@HttpCode(204)`) | `revokePermissionFromRole(rId, pId)` | `removePermissionsFromRole(rId, [pId])` | 204 mantém-se (decorator do handler) | **sim** (fino): `[pId]` |
| `POST /acl/roles/bulk-assign` | `bulkAssignPermissions(dto:{roleId,permissionIds})` | `addPermissionsToRole(dto.roleId, dto.permissionIds)` | nenhuma relevante (integração testa `.permissions`) | **sim** (fino): destructure |
| `POST /acl/users/assign-role` | `assignRoleToUser(dto:{userId,roleId})` → `{message,userId,roleId}` + `cache.del` | `assignRoleToUser(dto)` (portado verbatim, com cache) | nenhuma | não |
| `POST /acl/check` | `checkPermission(dto)` | — | **ROTA REMOVIDA** (ABAC) → 404 | n/a |
| `GET /acl/matrix` | `getPermissionMatrix()` | `getPermissionMatrix()` | canónico acrescenta `grouped` — superconjunto | não |
| `GET /acl/policies` | `getPolicies()` | — | **ROTA REMOVIDA** → 404 | n/a |
| `POST /acl/policies` | `createPolicy(dto, user.id)` | — | **ROTA REMOVIDA** → 404 | n/a |
| `GET /acl/audit` | `getAuditLog(filters)` | `getAuditLog(filters)` (portado verbatim) | nenhuma | não |
| `GET /acl/audit/denied` | `getDeniedLog(filters)` | `getDeniedLog(filters)` (portado verbatim) | nenhuma | não |
| `GET /acl/stats` | `getStats()` → `{totalUsers,totalRoles,totalPermissions,deniedCount,roleBreakdown,recentDenied}` | `getStats()` (portado verbatim — forma histórica exacta) | nenhuma | não |

`@Roles` de `AclController`: hoje `const ADMIN = ['ADMIN','RH'] as const` (strings soltas) +
já importa `Role` de `../auth/enums/role.enum` nalguns handlers. **Converter `ADMIN` para
`[Role.ADMIN, Role.RH]`** (mesmo conjunto efectivo). Plano refere `src/common/enums/role.enum.ts`
— não existe; o enum canónico real é `src/auth/enums/role.enum.ts`.

## Matriz — `departments.RolesController` (`/roles*`) → canónico

| Rota | Handler hoje → `RolesService.` | Canónico | Δ forma | Adaptador |
|---|---|---|---|---|
| `GET /roles` (sem `@Roles` → qualquer autenticado) | `findAll()` | `findAll()` | canónico devolve objectos mais ricos (campos extra) | não |
| `GET /roles/:id` (sem `@Roles`) | `findOne(id)` → `throws NotFoundException` | `findOne(id)` → idem | nenhuma | não |
| `POST /roles` (`@Roles(ADMIN)`) | `create(dto:{name,description})` → `prisma.role.create({data:dto})` (row crua) | `create(dto)` | devolve `findOne()` (com `permissions` etc.); passa a lançar 409 nome duplicado (já lançava — `RolesService.create` também verifica) | não |
| `POST /roles/init-defaults` (`@Roles(ADMIN)`) | `initDefaultRoles()` | `initDefaultRoles()` (portado verbatim de `departments` — cria ADMIN/RH/GESTOR/COLABORADOR/AUDITOR, shape `{name,description}`, devolve `{created,roles}`) | nenhuma | não |
| `POST /roles/permissions` (`@Roles(ADMIN)`) | `addPermission(dto:{name,action,subject,roleId?})` | `createPermission(dto)` | nenhuma (ambos: cria permissão, associa se `roleId`) | não |
| `POST /roles/:id/permissions/:permissionId/assign` (`@Roles(ADMIN)`) | `assignPermissionToRole(roleId, permissionId)` (upsert, devolve o link) | `assignPermissionToRole(roleId, permissionId)` (**wrapper single novo** → `addPermissionsToRole(roleId,[pId])`) | devolve `findOne()` em vez do link cru; integração só testa status + DB | não |
| `DELETE /roles/:id/permissions/:permissionId` (sem `@HttpCode` → 200) | `revokePermissionFromRole(roleId, permissionId)` (`deleteMany`, devolve `{count}`) | `revokePermissionFromRole(roleId, permissionId)` (**wrapper single novo** → `removePermissionsFromRole(roleId,[pId])`) | devolve `findOne()` em vez de `{count}`; integração testa status 200 + DB `.toBeNull()` | não |
| `PUT /roles/:id` (`@Roles(ADMIN)`) | `update(id, dto:{name?,description?})` | `update(id, dto)` | devolve `findOne()` | não |
| `DELETE /roles/:id` (`@Roles(ADMIN)`) | `remove(id)` → `prisma.role.delete` (SEM guarda) | `remove(id)` → **tem guarda `_count.users > 0` → 409** | comportamento novo: apagar role com utilizadores passa de (delete/FK-error) para 409 explícito | não — melhoria consistente com `/roles-permissions`; **anotar no PR** |
| `DELETE /roles/permissions/:permissionId` (`@Roles(ADMIN)`) | `removePermission(id)` → `prisma.permission.delete` | `deletePermission(id)` (portado, = `prisma.permission.delete`) | nenhuma | não |

`RolesController` de `departments` não tem `@Roles` a nível de classe nem hand-rolled arrays —
usa `Role.ADMIN` do enum canónico nos handlers de escrita. **Nada a corrigir aqui.**

## Ordem de módulos (sem ciclos)

`AclModule` → `RolesPermissionsModule` → `PrismaModule` (+ `CacheModule` global).
`DepartmentsModule` → `RolesPermissionsModule`. `RolesPermissionsModule` não importa
nenhum dos dois. Sem ciclo.

## Ficheiros de teste afectados

- `src/acl/acl.controller.spec.ts` — mock passa a `RolesPermissionsService`; remover
  `getPolicies`/`createPolicy`/`check`; ajustar nomes de método delegado (`getRoles`→`findAll`,
  `getRole`→`findOne`, `createRole`→`create`, `updateRole`→`update`,
  `bulkAssignPermissions`→`addPermissionsToRole`, `getRolePermissions`→`findOne`).
- `src/acl/acl.service.spec.ts`, `src/acl/acl.service.additional.spec.ts` — **eliminados** (Task 7).
- `src/departments/departments.controller.spec.ts` — `RolesController` mock passa a
  `RolesPermissionsService`; `addPermission`→`createPermission`, `remove` mantém, `removePermission`→`deletePermission`.
- `src/departments/departments.service.errors.spec.ts` — remover `describe('RolesService — erros e invariantes')`.
- `src/departments/departments.service.spec.ts` / `.additional.spec.ts` — não têm `describe('RolesService')` (confirmado); nada a remover.
- `test/integration/acl/acl.integration-spec.ts` — remover 3 testes ABAC, adicionar 404s;
  restantes passam sem mudar asserts.
- `test/integration/roles-permissions/…` — inalterado; adicionar 1 teste de paridade
  (role criado em `/roles-permissions` visível idêntico em `/acl/roles/:id` e `/roles/:id`).
- `test/integration/departments/…` — inalterado (asserts de `/roles*` compatíveis).
