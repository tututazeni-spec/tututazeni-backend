# Fase D — Consolidar Roles/Permissions (`acl` + `roles-permissions` + `departments.RolesService`) + remover ABAC — Plano de Implementação

> **Para agentes de execução:** SUB-SKILL OBRIGATÓRIA: usar `superpowers:subagent-driven-development` (recomendado) ou `superpowers:executing-plans` para executar este plano tarefa a tarefa. Os passos usam checkbox (`- [ ]`) para acompanhamento.

**Goal:** Existe **um único serviço** de gestão de roles e permissões (`RolesPermissionsService`), consumido pelos 3 conjuntos de rotas hoje existentes (`/roles-permissions/*`, `/acl/*`, `/roles*`), eliminando as 3 implementações concorrentes sobre as mesmas tabelas `Role`/`Permission`/`RolePermission`. O motor ABAC não-usado (`AccessPolicy`/`evaluatePolicies`/`/acl/check`/`/acl/policies`) é **removido**.

**Architecture:** `RolesPermissionsService` (o mais completo dos 3 — 669 linhas, já tem templates/governança/compare/simulate) é o canónico. É estendido para absorver os métodos que só o `AclService` tinha e que **não** são ABAC (catálogo de permissões, seed de permissões built-in, leitura de audit log, matriz). `AclController` e o `RolesController` de `departments` mantêm as suas rotas mas passam a injectar `RolesPermissionsService` e a delegar — com adaptadores finos onde a forma de resposta histórica difere. `AclService` e `departments.RolesService` são eliminados. `AclModule` fica um shell que importa `RolesPermissionsModule` e regista `AclController`. Enforcement de autorização **não muda**: continua a ser o `RolesGuard` (compara `user.role.name` com `@Roles(...)`, `src/common/guards/roles.guard.ts`). Nenhum `PermissionGuard` novo (decisão do dono do produto, 2026-09-05: remover ABAC).

**Tech Stack:** NestJS, Prisma, Jest (unit + integração com Postgres real via `test/jest-integration.json`), `class-validator`.

**Spec:** `docs/arquitetura-modular-analise.md` (§2.7, §2.3 item 12, §5 item 5, §8, §13 fase D) e `docs/arquitetura-modular.md` (Fases 3–5, 8). **Decisão registada (dono do produto, 2026-09-05):** remover o ABAC (opção 1 da pergunta da Fase D) — não migrar `accessPolicy` para o schema, não criar `PermissionGuard`.

## Global Constraints

- **Nenhuma rota, verbo ou forma de resposta muda para o frontend** (`docs/arquitetura-modular.md` §12), **excepto** as 3 rotas ABAC que são removidas (ver abaixo) — a análise §2.7 confirma que o motor ABAC nunca esteve ligado a enforcement e `grep` a todo o `src/` confirma **zero** consumidores de `AclService`/`hasPermission`/`checkPermission`/`evaluatePolicies` fora do próprio `src/acl/`.
- **Rotas preservadas (todas continuam a responder com a mesma forma):**
  - `/roles-permissions/*` — servidas por `RolesPermissionsService` (canónico), sem alteração.
  - `/acl/my-permissions`, `/acl/permissions` (GET/POST), `/acl/roles` (GET/GET:id/POST/PATCH), `/acl/roles/:id/clone`, `/acl/roles/:roleId/permissions` (GET), `/acl/roles/:roleId/permissions/:permissionId` (POST/DELETE), `/acl/roles/bulk-assign`, `/acl/users/assign-role`, `/acl/matrix`, `/acl/audit`, `/acl/audit/denied`, `/acl/stats` — passam a delegar em `RolesPermissionsService` com adaptador de forma quando necessário.
  - `/roles` (GET/GET:id), `/roles` (POST), `/roles/init-defaults`, `/roles/permissions` (POST), `/roles/:id/permissions/:permissionId/assign`, `/roles/:id/permissions/:permissionId` (DELETE), `/roles/:id` (PUT/DELETE), `/roles/permissions/:permissionId` (DELETE) — passam a delegar.
- **Rotas REMOVIDAS (decisão explícita de remover ABAC):**
  - `GET /acl/policies`
  - `POST /acl/policies`
  - `POST /acl/check`
  Depois da remoção, um pedido a estas rotas devolve `404` (comportamento correcto — deixaram de existir). Confirmar que o frontend não as chama (repo separado — anotar no PR para verificação do dono).
- **Achados de schema a respeitar (já documentados no código actual, não regredir):**
  - `Permission` **não tem** `sensitive` nem `description` no schema — `createPermission` persiste só `name`/`action`/`subject`.
  - `Role` **não tem** `isSystem`/`priority`/`parentRoleId` no schema — nunca escrever esses campos; `findAll` devolve `isSystem:false`/`priority:0` explicitamente (compat). Guardas "role de sistema protegido" não existem hoje e **não** são introduzidas nesta fase.
  - `RolePermission` tem `@@unique([roleId, permissionId])` — `assign` é `upsert` idempotente; `set`/`replace` usa `deleteMany` + `createMany({ skipDuplicates: true })`.
- **`PositionsService`, `CareersService`, `UnitsService`, `DepartmentsService` (no mesmo ficheiro `departments.service.ts`) NÃO são tocados** — só `RolesService` sai desse ficheiro.
- `prisma` é `@Global()`. `AclModule` e `DepartmentsModule` passam a `imports: [..., RolesPermissionsModule]`.
- **RBAC dos decoradores de rota não muda.** `role.enum.spec.ts` fixa conjuntos `@Roles` de vários controllers (memória "innova role-array drift" / "innova departments detail RBAC") — não alterar decoradores. Nota: §2.7 lista `acl` e `roles-permissions` entre os 6 controllers com arrays de roles "hand-rolled" (strings soltas em vez de `Role.X`); **corrigir esses arrays para o enum `Role` faz parte desta fase** (é trabalho de consolidação de autorização, baixo risco, sem mudar o conjunto efectivo).
- `prettier`/`eslint`/`tsc` limpos antes de cada commit. `format:check` do CI corre só `src/**`. Lint com `--config eslint.config.staged.mjs` quando preciso.
- Integração: lotes contra `postgresql://postgres:postgres@127.0.0.1:5432/innova_test`, `--runInBand`, Redis local, `DB_POOL_MAX=5`. `acl`, `roles-permissions` e `departments` são lotes distintos.

---

## File Structure

**Modificados:**
- `src/roles-permissions/roles-permissions.service.ts` — canónico; absorve `getAllPermissions`/`createPermission`/`getAuditLog`/`getDeniedLog`/`seedBuiltinPermissions`/`getMyPermissions`/`getStats`(alias)/`initDefaultRoles` que só existiam noutros serviços; **sem** métodos ABAC.
- `src/roles-permissions/roles-permissions.dto.ts` — importar/expor os DTOs que o `AclController` e o `RolesController` de `departments` precisam (ou os controllers passam a usar os DTOs de `roles-permissions`).
- `src/roles-permissions/roles-permissions.module.ts` — sem alteração estrutural (já exporta o serviço).
- `src/acl/acl.controller.ts` — injecta `RolesPermissionsService`; métodos delegam (com adaptadores); **remover** os handlers `getPolicies`/`createPolicy`/`check`; corrigir array `@Roles` para o enum `Role`.
- `src/acl/acl.module.ts` — `imports: [RolesPermissionsModule]`, `providers: []`, mantém `controllers: [AclController]`; deixa de exportar `AclService`.
- `src/acl/acl.service.ts` — **eliminado**.
- `src/acl/acl.service.spec.ts`, `src/acl/acl.service.additional.spec.ts` — **eliminados**.
- `src/acl/acl.dto.ts` — remover `CreatePolicyDto`, `CheckPermissionDto`, `AccessPolicyRow` e o que só o ABAC usava; manter os DTOs ainda usados pelo controller.
- `src/acl/acl.controller.spec.ts` — adaptar (mock de `RolesPermissionsService`, remover testes das 3 rotas ABAC).
- `src/departments/departments.service.ts` — **remover** a classe `RolesService` inteira.
- `src/departments/departments.module.ts` — remover `RolesService` de `providers`/`exports`/imports do ficheiro; `imports: [..., RolesPermissionsModule]`.
- `src/departments/departments.controller.ts` — `RolesController` injecta `RolesPermissionsService`; métodos delegam (adaptadores); corrigir `@Roles` se hand-rolled.
- `src/departments/departments.service.spec.ts` / `*.additional.spec.ts` / `*.errors.spec.ts` — remover os `describe('RolesService', ...)`.
- `src/departments/departments.controller.spec.ts` — adaptar `RolesController`.
- `test/integration/acl/*.integration-spec.ts`, `test/integration/roles-permissions/*.integration-spec.ts`, `test/integration/departments/*.integration-spec.ts` — ajustar; adicionar prova de paridade entre os 3 namespaces + prova de 404 nas rotas ABAC removidas.
- `docs/arquitetura-modular-analise.md` — §2.7 (nota "ABAC removido"), §5 item 5, §8, §13 fase D.

---

### Task 1: Inventário de paridade — mapear cada rota `/acl/*` e `/roles*` ao método canónico + delta de forma

**Files:**
- Create: `docs/superpowers/plans/notes/fase-d-parity-matrix.md` (nota de trabalho, não vai para `src/`)

**Interfaces:** nenhuma — tarefa de análise que trava as decisões das tarefas seguintes.

- [ ] **Step 1: Construir a matriz**

Para cada rota de `AclController` e do `RolesController` de `departments`, registar numa tabela: `rota | método actual (serviço legado) | método canónico equivalente em RolesPermissionsService | delta de forma de resposta | adaptador necessário (sim/não + descrição)`.

Fontes: ler `src/acl/acl.controller.ts` + `src/acl/acl.service.ts` (métodos), `src/departments/departments.controller.ts` (`RolesController`) + a classe `RolesService` em `src/departments/departments.service.ts`, e `src/roles-permissions/roles-permissions.service.ts`.

Deltas já conhecidos (confirmar e completar):
- `GET /acl/roles` → `AclService.getRoles()` vs `RolesPermissionsService.findAll()`: **findAll é superconjunto** (adiciona `effectivePermissions`/`usersCount`/`isSystem`/`priority`) — compatível, sem adaptador (campos extra não partem o frontend).
- `GET /acl/roles/:id` → `AclService.getRole(id)` **devolve `null`** se não existir; `RolesPermissionsService.findOne(id)` **lança `NotFoundException`**. Delta: 200+`null` → 404. Adaptador: `try { return await svc.findOne(id) } catch (NotFoundException) { return null }` no handler do `AclController`, para preservar o contrato histórico. (Anotar como candidato a alinhar num follow-up.)
- `GET /roles/:id` (departments) → `RolesService.findOne` **lança `NotFoundException`** (já alinhado com o canónico) — sem adaptador.
- `POST /acl/roles` → `AclService.createRole(dto)` faz auto-seed de permissões por `ROLE_DEFAULTS[code]`; `RolesPermissionsService.create(dto)` faz auto-`code` + audit log + aceita `permissionIds`. Decidir: o handler de `/acl/roles` passa a chamar `create()` — **o auto-seed por `ROLE_DEFAULTS` migra para `RolesPermissionsService.create()`** (Task 3) para não perder comportamento.
- `GET /acl/stats` vs `RolesPermissionsService.getGovernanceStats()` — comparar campos; se divergirem, criar `getStats()` como alias/adaptador (Task 4).
- `POST /roles/init-defaults` → `RolesService.initDefaultRoles()` — migrar para `RolesPermissionsService.initDefaultRoles()` (Task 3).
- `POST /roles/permissions` / `POST /acl/permissions` → criação de permissão — ambos mapeiam a `createPermission` (Task 2).
- `DELETE /roles/permissions/:permissionId` → `RolesService.removePermission` → `prisma.permission.delete` — migrar para `RolesPermissionsService.deletePermission(id)` (Task 2).

- [ ] **Step 2: Rever a matriz com olhos frescos**

Confirmar que **toda** rota preservada tem uma linha e um método canónico. Marcar as que precisam de adaptador. Esta nota é o guia das Tasks 5–7.

- [ ] **Step 3: Commit da nota**

```bash
git add docs/superpowers/plans/notes/fase-d-parity-matrix.md
git commit -m "docs(fase-d): matriz de paridade de rotas roles/permissions + ABAC"
```

---

### Task 2: `RolesPermissionsService` absorve o catálogo de permissões (`getAllPermissions`, `createPermission`, `deletePermission`)

**Files:**
- Modify: `src/roles-permissions/roles-permissions.service.ts`
- Modify: `src/roles-permissions/roles-permissions.dto.ts` (adicionar `CreatePermissionInput` se necessário)
- Test: `src/roles-permissions/roles-permissions.service.spec.ts`

**Interfaces:**
- Produces:
  - `getAllPermissions(): Promise<Permission[]>` — `orderBy: [{ subject: 'asc' }, { action: 'asc' }]`.
  - `createPermission(dto: { name: string; action: PermissionAction; subject: PermissionSubject; roleId?: number }): Promise<Permission>` — persiste só `name`/`action`/`subject` (schema); se `roleId` vier, cria `RolePermission` de imediato (comportamento do `departments.RolesService.addPermission`).
  - `deletePermission(permissionId: number): Promise<Permission>` — `prisma.permission.delete`.

- [ ] **Step 1: Testes (devem falhar)**

```ts
  describe('catálogo de permissões (absorvido do acl/departments)', () => {
    it('getAllPermissions ordena por subject, action', async () => {
      mockPrisma.read.permission.findMany.mockResolvedValue([]);
      await service.getAllPermissions();
      expect(mockPrisma.read.permission.findMany).toHaveBeenCalledWith({
        orderBy: [{ subject: 'asc' }, { action: 'asc' }],
      });
    });

    it('createPermission persiste só name/action/subject (schema não tem sensitive/description)', async () => {
      mockPrisma.permission.create.mockResolvedValue({ id: 1 });
      await service.createPermission({ name: 'course.read', action: 'READ', subject: 'Course', sensitive: true, description: 'x' } as any);
      expect(mockPrisma.permission.create).toHaveBeenCalledWith({
        data: { name: 'course.read', action: 'READ', subject: 'Course' },
      });
    });

    it('createPermission com roleId → cria também a RolePermission', async () => {
      mockPrisma.permission.create.mockResolvedValue({ id: 5 });
      mockPrisma.rolePermission.create.mockResolvedValue({});
      await service.createPermission({ name: 'x', action: 'READ', subject: 'Course', roleId: 3 } as any);
      expect(mockPrisma.rolePermission.create).toHaveBeenCalledWith({ data: { roleId: 3, permissionId: 5 } });
    });

    it('deletePermission chama prisma.permission.delete', async () => {
      mockPrisma.permission.delete.mockResolvedValue({ id: 9 });
      await service.deletePermission(9);
      expect(mockPrisma.permission.delete).toHaveBeenCalledWith({ where: { id: 9 } });
    });
  });
```

- [ ] **Step 2: FAIL**

```bash
npx jest src/roles-permissions/roles-permissions.service.spec.ts -t "catálogo de permissões"
```

- [ ] **Step 3: Implementar** (adicionar a `RolesPermissionsService`)

```ts
  async getAllPermissions() {
    return this.prisma.read.permission.findMany({
      orderBy: [{ subject: 'asc' }, { action: 'asc' }],
    });
  }

  async createPermission(dto: {
    name: string;
    action: PermissionAction;
    subject: PermissionSubject;
    roleId?: number;
  }) {
    const permission = await this.prisma.permission.create({
      data: { name: dto.name, action: dto.action, subject: dto.subject },
    });
    if (dto.roleId) {
      await this.prisma.rolePermission.create({
        data: { roleId: dto.roleId, permissionId: permission.id },
      });
    }
    return permission;
  }

  async deletePermission(permissionId: number) {
    return this.prisma.permission.delete({ where: { id: permissionId } });
  }
```

> Importar `PermissionAction`, `PermissionSubject` de `@prisma/client` se não estiverem já.

- [ ] **Step 4: PASS**

```bash
npx jest src/roles-permissions/roles-permissions.service.spec.ts
```

- [ ] **Step 5: prettier + tsc**

```bash
npx prettier --write src/roles-permissions/
npx tsc --noEmit
```

- [ ] **Step 6: Commit**

```bash
git add src/roles-permissions/
git commit -m "feat(roles-permissions): absorver catálogo de permissões (getAll/create/delete) do acl e departments"
```

---

### Task 3: `RolesPermissionsService` absorve `initDefaultRoles` + auto-seed de permissões por `ROLE_DEFAULTS`

**Files:**
- Modify: `src/roles-permissions/roles-permissions.service.ts`
- Test: `src/roles-permissions/roles-permissions.service.spec.ts`

**Interfaces:**
- Produces:
  - `initDefaultRoles(): Promise<{ created: number; roles: Role[] }>` — cria ADMIN/RH/GESTOR/COLABORADOR/AUDITOR se não existirem (de `departments.RolesService`).
  - `seedDefaultPermissionsForRole(roleId: number, roleCode: string, permNames: string[]): Promise<void>` — de `AclService`.
  - `create(dto)` — passa a fazer auto-seed via `ROLE_DEFAULTS[code]` **além** do que já faz.
- Consumes: `getAllPermissions` (Task 2).

- [ ] **Step 1: Testes (devem falhar)**

```ts
  describe('initDefaultRoles', () => {
    it('cria só os roles em falta', async () => {
      mockPrisma.role.findFirst
        .mockResolvedValueOnce({ id: 1 })   // ADMIN existe
        .mockResolvedValue(null);           // resto não
      mockPrisma.role.create.mockImplementation(({ data }: any) => Promise.resolve({ id: 99, ...data }));
      const res = await service.initDefaultRoles();
      expect(res.created).toBe(4);
    });
  });

  describe('create com ROLE_DEFAULTS', () => {
    it('role cujo code está em ROLE_DEFAULTS → auto-atribui as permissões default', async () => {
      mockPrisma.role.findFirst.mockResolvedValue(null);
      mockPrisma.role.create.mockResolvedValue({ id: 7, code: 'RH', name: 'RH' });
      mockPrisma.read.permission.findMany.mockResolvedValue([{ id: 1, name: 'user.read' }, { id: 2, name: 'user.write' }]);
      mockPrisma.rolePermission.createMany.mockResolvedValue({ count: 2 });
      jest.spyOn(service, 'findOne').mockResolvedValue({ id: 7, permissions: [] } as any);

      await service.create({ name: 'RH', code: 'RH' } as any);

      expect(mockPrisma.rolePermission.createMany).toHaveBeenCalled();
    });
  });
```

> Copiar a constante `ROLE_DEFAULTS` de `src/acl/acl.service.ts` para o topo de `roles-permissions.service.ts` (ou para um ficheiro partilhado `src/roles-permissions/role-defaults.ts` importado por ambos até `acl.service.ts` ser eliminado na Task 8).

- [ ] **Step 2: FAIL**

```bash
npx jest src/roles-permissions/roles-permissions.service.spec.ts -t "initDefaultRoles|ROLE_DEFAULTS"
```

- [ ] **Step 3: Implementar**

Portar `initDefaultRoles` e `seedDefaultPermissionsForRole` verbatim de `acl.service.ts`/`departments.service.ts` (ajustar `this.prisma`). Em `create()`, depois do bloco `permissionIds`, adicionar:

```ts
    const roleDefaults = ROLE_DEFAULTS[created.code ?? ''] ?? [];
    if (roleDefaults.length > 0) {
      await this.seedDefaultPermissionsForRole(created.id, created.code ?? '', roleDefaults);
    }
```

- [ ] **Step 4: PASS**

```bash
npx jest src/roles-permissions/roles-permissions.service.spec.ts
```

- [ ] **Step 5: prettier + tsc**

- [ ] **Step 6: Commit**

```bash
git add src/roles-permissions/
git commit -m "feat(roles-permissions): absorver initDefaultRoles + auto-seed ROLE_DEFAULTS no create"
```

---

### Task 4: `RolesPermissionsService` absorve `getMyPermissions`, `getAuditLog`/`getDeniedLog`, `getStats`, `getPermissionMatrix` (reconciliar)

**Files:**
- Modify: `src/roles-permissions/roles-permissions.service.ts`
- Test: `src/roles-permissions/roles-permissions.service.spec.ts`

**Interfaces:**
- Produces:
  - `getMyPermissions(userId: number)` — de `AclService.getUserPermissions` (as permissões efectivas do utilizador via role).
  - `getAuditLog(filters)` / `getDeniedLog(filters)` — leitura de `AuditLog` filtrada (de `AclService`).
  - `getStats()` — alias que devolve exactamente a forma que `GET /acl/stats` devolvia (adaptar a partir de `getGovernanceStats()` se os campos baterem; senão método próprio).
  - `getPermissionMatrix()` — já existe em ambos; confirmar que a versão de `RolesPermissionsService` é superconjunto da de `AclService`; se não, ampliar.

- [ ] **Step 1: Comparar as duas `getPermissionMatrix` e as duas "stats"** (ler `acl.service.ts:682` e `roles-permissions.service.ts:363` + `:575`). Registar o delta na nota da Task 1.

- [ ] **Step 2: Testes (devem falhar)** — um por método portado, verificando a forma de resposta esperada pelas rotas `/acl/*`:

```ts
  describe('métodos absorvidos do acl', () => {
    it('getMyPermissions devolve as permissões do role do utilizador', async () => {
      mockPrisma.read.user.findUnique.mockResolvedValue({
        id: 1, role: { rolePermissions: [{ permission: { name: 'course.read' } }] },
      });
      const res = await service.getMyPermissions(1);
      expect(res).toEqual(expect.arrayContaining(['course.read']));
    });

    it('getAuditLog filtra AuditLog por action/entity/data', async () => {
      mockPrisma.read.auditLog.findMany.mockResolvedValue([]);
      await service.getAuditLog({ action: 'ROLE_CREATED' } as any);
      expect(mockPrisma.read.auditLog.findMany).toHaveBeenCalled();
    });

    it('getStats devolve a forma histórica de GET /acl/stats', async () => {
      // preencher mocks conforme os campos reais confirmados no Step 1
      const res = await service.getStats();
      expect(res).toEqual(expect.objectContaining({ /* campos de acl.getStats() */ }));
    });
  });
```

- [ ] **Step 3: FAIL → implementar** (portar verbatim de `acl.service.ts`, ajustando `this.prisma`; `getStats` construído para igualar a forma histórica).

- [ ] **Step 4: PASS**

```bash
npx jest src/roles-permissions/roles-permissions.service.spec.ts
```

- [ ] **Step 5: prettier + tsc**

- [ ] **Step 6: Commit**

```bash
git add src/roles-permissions/
git commit -m "feat(roles-permissions): absorver getMyPermissions/getAuditLog/getDeniedLog/getStats do acl (sem ABAC)"
```

---

### Task 5: `AclController` delega em `RolesPermissionsService`; remover as 3 rotas ABAC

**Files:**
- Modify: `src/acl/acl.controller.ts`
- Modify: `src/acl/acl.module.ts`
- Modify: `src/acl/acl.dto.ts`
- Test: `src/acl/acl.controller.spec.ts`

**Interfaces:**
- Consumes: `RolesPermissionsService` (todos os métodos das Tasks 2–4 + os pré-existentes `findAll`/`findOne`/`create`/`update`/`cloneRole`/`assignToUser`/`bulkAssignRole`/`addPermissionsToRole`/`removePermissionsFromRole`/`getPermissionMatrix`).

- [ ] **Step 1: Adaptar `acl.controller.spec.ts` (deve falhar)**

Trocar o mock de `AclService` por mock de `RolesPermissionsService`. **Remover** os testes de `getPolicies`/`createPolicy`/`check`. Para cada rota preservada, testar que delega no método canónico correcto (usar a matriz da Task 1). Exemplo:

```ts
it('GET /acl/roles → RolesPermissionsService.findAll()', async () => {
  mockRP.findAll.mockResolvedValue([]);
  await controller.getRoles();
  expect(mockRP.findAll).toHaveBeenCalled();
});

it('GET /acl/roles/:id inexistente → devolve null (adaptador preserva contrato)', async () => {
  mockRP.findOne.mockRejectedValue(new NotFoundException());
  expect(await controller.getRole(999)).toBeNull();
});
```

- [ ] **Step 2: FAIL**

```bash
npx jest src/acl/acl.controller.spec.ts
```

- [ ] **Step 3: Implementar o controller**

- Construtor: `constructor(private readonly svc: RolesPermissionsService) {}` (import de `../roles-permissions/roles-permissions.service`).
- Cada handler chama o método canónico segundo a matriz. Adaptadores:
  - `getRole(id)`: `try { return await this.svc.findOne(id); } catch (e) { if (e instanceof NotFoundException) return null; throw e; }`
  - handlers de permissões de role: `addPermissionsToRole`/`removePermissionsFromRole` recebem arrays — se a rota `/acl/roles/:roleId/permissions/:permissionId` é single, chamar `this.svc.addPermissionsToRole(roleId, [permissionId])`.
- **Remover** os handlers `@Get('policies')`, `@Post('policies')`, `@Post('check')` e os respectivos imports (`CreatePolicyDto`, `CheckPermissionDto`).
- Corrigir o array `@Roles(...)` a nível de classe/handlers para usar `Role.X` do enum canónico (`src/common/enums/role.enum.ts`) — **mesmo conjunto efectivo**, só tipado.

`src/acl/acl.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { RolesPermissionsModule } from '../roles-permissions/roles-permissions.module';
import { AclController } from './acl.controller';

@Module({
  imports: [RolesPermissionsModule],
  controllers: [AclController],
})
export class AclModule {}
```

`src/acl/acl.dto.ts`: remover `CreatePolicyDto`, `CheckPermissionDto`, `AccessPolicyRow` e helpers só-ABAC; manter `CreatePermissionDto`, `CreateRoleDto`, `CloneRoleDto`, `BulkAssignPermissionsDto`, `AssignRoleToUserDto`, `AclAuditFilterDto` (os que o controller ainda usa — confirmar).

- [ ] **Step 4: PASS**

```bash
npx jest src/acl/
```

- [ ] **Step 5: prettier + tsc + eslint**

```bash
npx prettier --write src/acl/
npx tsc --noEmit
npx eslint src/acl/ --config eslint.config.staged.mjs
```

- [ ] **Step 6: Commit**

```bash
git add src/acl/
git commit -m "refactor(acl): controller delega em RolesPermissionsService; remove rotas ABAC (policies/check)"
```

---

### Task 6: `departments.RolesController` delega em `RolesPermissionsService`; eliminar `departments.RolesService`

**Files:**
- Modify: `src/departments/departments.controller.ts` (`RolesController`)
- Modify: `src/departments/departments.service.ts` (remover classe `RolesService`)
- Modify: `src/departments/departments.module.ts`
- Test: `src/departments/departments.controller.spec.ts`, `src/departments/departments.service.spec.ts` (remover `describe('RolesService')`)

**Interfaces:**
- Consumes: `RolesPermissionsService.findAll`/`findOne`/`create`/`update`/`remove`/`initDefaultRoles`/`createPermission`/`deletePermission`/`assignPermissionToRole`/`revokePermissionFromRole`.

> Nota: `RolesPermissionsService` já tem `assignPermissionToRole`/`revokePermissionFromRole`? Confirmar — se só tiver `addPermissionsToRole(roleId, ids[])`, adicionar wrappers single: `assignPermissionToRole(roleId, permissionId) { return this.addPermissionsToRole(roleId, [permissionId]); }` e `revokePermissionFromRole(roleId, permissionId) { return this.removePermissionsFromRole(roleId, [permissionId]); }`. (Fazer isto como Step 0 desta task, com teste.)

- [ ] **Step 1: (se necessário) wrappers single-permission no serviço canónico**

Teste + implementação de `assignPermissionToRole`/`revokePermissionFromRole` single, delegando nos métodos array existentes (idempotente via `@@unique`).

- [ ] **Step 2: Adaptar `departments.controller.spec.ts` (`RolesController`) — deve falhar**

Mock de `RolesPermissionsService`; cada handler delega. `DepartmentsCreateRoleDto`/`UpdateRoleDto`/`DepartmentsCreatePermissionDto` → mapear para os DTOs de `roles-permissions` (ou manter os de `departments` se forem estruturalmente compatíveis — `create` aceita `{ name, description, code, permissionIds? }`).

- [ ] **Step 3: FAIL**

```bash
npx jest src/departments/departments.controller.spec.ts
```

- [ ] **Step 4: Implementar**

`RolesController` (em `departments.controller.ts`):
- `constructor(private readonly svc: RolesPermissionsService)`.
- `findAll` → `svc.findAll()`; `findOne` → `svc.findOne(id)`; `create` → `svc.create(dto)`; `update` → `svc.update(id, dto)`; `remove` → `svc.remove(id)`; `initDefaults` → `svc.initDefaultRoles()`; `addPermission` → `svc.createPermission(dto)`; `assignPermission` → `svc.assignPermissionToRole(roleId, permissionId)`; `revokePermission` → `svc.revokePermissionFromRole(roleId, permissionId)`; `removePermission` → `svc.deletePermission(id)`.

`src/departments/departments.service.ts`: **eliminar** a classe `RolesService` inteira (linhas ~466–561) + os imports que ficarem sem uso (`DepartmentsCreateRoleDto`, `UpdateRoleDto`, `DepartmentsCreatePermissionDto`, `flattenRolePermissions` — se só `RolesService` os usava).

`src/departments/departments.module.ts`:

```ts
import { RolesPermissionsModule } from '../roles-permissions/roles-permissions.module';
// ...
import { DepartmentsService, UnitsService, PositionsService, CareersService } from './departments.service';
import { DepartmentsController, UnitsController, RolesController, PositionsController, CareersController } from './departments.controller';

@Module({
  imports: [PrismaModule, RolesPermissionsModule],
  providers: [DepartmentsService, UnitsService, PositionsService, CareersService],
  controllers: [DepartmentsController, UnitsController, RolesController, PositionsController, CareersController],
  exports: [DepartmentsService, UnitsService, PositionsService, CareersService],
})
```

(`RolesService` sai de `providers`/`exports`/imports; `RolesController` fica, agora servido por `RolesPermissionsService` via `RolesPermissionsModule`.)

Remover `describe('RolesService', ...)` de `departments.service.spec.ts`/`.additional.spec.ts`/`.errors.spec.ts`.

- [ ] **Step 5: PASS**

```bash
npx jest src/departments/
```

- [ ] **Step 6: prettier + tsc + eslint**

```bash
npx prettier --write src/departments/
npx tsc --noEmit
npx eslint src/departments/ --config eslint.config.staged.mjs
```

- [ ] **Step 7: Commit**

```bash
git add src/departments/
git commit -m "refactor(departments): RolesController delega em RolesPermissionsService; elimina departments.RolesService"
```

---

### Task 7: Eliminar `AclService` + specs órfãs; limpar `acl.dto.ts`

**Files:**
- Delete: `src/acl/acl.service.ts`, `src/acl/acl.service.spec.ts`, `src/acl/acl.service.additional.spec.ts`
- Modify: `src/acl/acl.dto.ts` (final)

- [ ] **Step 1: Confirmar zero referências a `AclService`**

```bash
grep -rn "AclService\|acl.service" src/ --include=*.ts
```

Esperado: só (se houver) o próprio `acl.dto.ts`/`acl.module.ts` já limpos, e nada mais. Se aparecer algo, resolver antes de apagar.

- [ ] **Step 2: Apagar os ficheiros**

```bash
git rm src/acl/acl.service.ts src/acl/acl.service.spec.ts src/acl/acl.service.additional.spec.ts
```

- [ ] **Step 3: `tsc` + jest do módulo**

```bash
npx tsc --noEmit
npx jest src/acl/
```

- [ ] **Step 4: Commit**

```bash
git add src/acl/
git commit -m "chore(acl): eliminar AclService (consolidado em RolesPermissionsService) + specs órfãs"
```

---

### Task 8: Testes de integração — paridade dos 3 namespaces + 404 nas rotas ABAC removidas

**Files:**
- Modify: `test/integration/acl/*.integration-spec.ts`
- Modify: `test/integration/roles-permissions/*.integration-spec.ts`
- Modify: `test/integration/departments/*.integration-spec.ts`

- [ ] **Step 1: `acl` — rotas ABAC removidas devolvem 404**

```ts
describe('ABAC removido (Fase D)', () => {
  it('GET /acl/policies → 404', async () => {
    await request(app.getHttpServer()).get('/acl/policies').set('Authorization', `Bearer ${adminToken}`).expect(404);
  });
  it('POST /acl/check → 404', async () => {
    await request(app.getHttpServer()).post('/acl/check').set('Authorization', `Bearer ${adminToken}`).send({}).expect(404);
  });
});
```

- [ ] **Step 2: `acl` — CRUD de role via `/acl/roles` continua a funcionar e devolve a mesma forma**

Adaptar os testes existentes de `/acl/roles*` — devem passar sem alteração de asserts de forma (findAll é superconjunto). Se algum assertava `null` para `/acl/roles/:id` inexistente, confirmar que o adaptador o preserva.

- [ ] **Step 3: paridade — criar um role por `/roles-permissions`, lê-lo por `/acl/roles/:id` e por `/roles/:id`**

```ts
it('role criado num namespace é visível e idêntico nos outros dois', async () => {
  const created = await request(app.getHttpServer())
    .post('/roles-permissions').set('Authorization', `Bearer ${adminToken}`)
    .send({ name: 'Fase D Test Role', code: 'FASE_D_TEST' }).expect(201);
  const id = created.body.id;

  const viaAcl = await request(app.getHttpServer()).get(`/acl/roles/${id}`).set('Authorization', `Bearer ${adminToken}`).expect(200);
  const viaDept = await request(app.getHttpServer()).get(`/roles/${id}`).set('Authorization', `Bearer ${adminToken}`).expect(200);

  expect(viaAcl.body.name).toBe('Fase D Test Role');
  expect(viaDept.body.name).toBe('Fase D Test Role');

  await prisma.rolePermission.deleteMany({ where: { roleId: id } });
  await prisma.role.delete({ where: { id } });
});
```

- [ ] **Step 4: prettier**

```bash
npx prettier --write test/integration/acl/ test/integration/roles-permissions/ test/integration/departments/
```

- [ ] **Step 5: Commit**

```bash
git add test/integration/
git commit -m "test(integration): paridade roles/permissions nos 3 namespaces + 404 nas rotas ABAC removidas"
```

---

### Task 9: Verificação completa + documento de arquitectura

**Files:**
- Modify: `docs/arquitetura-modular-analise.md`

- [ ] **Step 1: Unit dos 3 módulos**

```bash
npx jest src/acl src/roles-permissions src/departments
```

- [ ] **Step 2: Suite unitária completa**

```bash
npm test
```

- [ ] **Step 3: Integração — lotes `acl`, `roles-permissions`, `departments` (Redis local)**

```bash
npx cross-env NODE_ENV=test jest --config test/jest-integration.json --forceExit --runInBand --testPathPatterns "test/integration/(acl)/"
npx cross-env NODE_ENV=test jest --config test/jest-integration.json --forceExit --runInBand --testPathPatterns "test/integration/(roles-permissions)/"
npx cross-env NODE_ENV=test jest --config test/jest-integration.json --forceExit --runInBand --testPathPatterns "test/integration/(departments)/"
```

- [ ] **Step 4: prettier (`src/**`) + eslint dos módulos tocados + `tsc`**

```bash
npx prettier --check "src/**/*.ts"
npx eslint src/acl src/roles-permissions src/departments --config eslint.config.staged.mjs
npx tsc --noEmit
```

- [ ] **Step 5: `grep` de confirmação — zero ABAC, zero serviços mortos**

```bash
grep -rn "AccessPolicy\|accessPolicy\|evaluatePolicies\|AclService" src/ --include=*.ts
grep -rn "class RolesService" src/departments/
```

Esperado: primeiro comando sem hits em código vivo (só, no máximo, comentários históricos noutros ficheiros); segundo sem hits.

- [ ] **Step 6: Actualizar `docs/arquitetura-modular-analise.md`**

- §13, linha D:

```
| D | Consolidar Roles/Permissions (`acl`+`roles-permissions`+`departments.RolesService`) + decisão sobre ABAC | 1 | Médio-alto (toca autorização) | Pré-requisito de segurança antes de qualquer extracção futura |
```

→

```
| D | ~~Consolidar Roles/Permissions + decisão ABAC~~ — **concluída**: `RolesPermissionsService` é o serviço único; `/acl/*` e `/roles*` delegam; `AclService` e `departments.RolesService` eliminados; **ABAC removido** (decisão do dono do produto 2026-09-05 — `accessPolicy`/`evaluatePolicies`/`/acl/check`/`/acl/policies` apagados). Enforcement continua no `RolesGuard` (role-name). | 1 | — | Ver `docs/superpowers/plans/2026-09-05-fase-d-roles-permissions-consolidation.md` |
```

- §2.7: acrescentar no fim: `\n\n> **Actualização (Fase D, 2026-09-05):** o motor ABAC (`AccessPolicy`/`evaluatePolicies`/`AclService`) foi **removido** por decisão do dono do produto — dava falsa sensação de segurança sem nunca estar ligado a enforcement. Roles & permissões têm agora um único serviço (`RolesPermissionsService`); enforcement é só `RolesGuard` (role-name vs `@Roles()`).`
- §5 item 5: `— **feito** (Fase D): `RoleAssignmentService` = `RolesPermissionsService`; ABAC removido em vez de aplicado.`
- §8 itens 1 e 2: marcar `~~...~~ — feito (Fase D)`. Itens 3 (helper de scope de equipa) e 4 (arrays de roles hand-rolled nos outros 4 controllers) ficam — o 4 é parcialmente feito (acl + roles-permissions corrigidos nesta fase; faltam `api-integration`, `automation`, `roi-impact`, `search`).

- [ ] **Step 7: Commit**

```bash
git add docs/arquitetura-modular-analise.md
git commit -m "docs: marcar Fase D (consolidação roles/permissions + remoção ABAC) como concluída"
```

---

### Task 10: PR e CI

- [ ] **Step 1: Branch + push**

```bash
git push -u origin <branch>:refactor/roles-permissions-consolidation
```

- [ ] **Step 2: PR**

```bash
gh pr create --base main --title "refactor(authz): serviço único de roles/permissions + remover ABAC morto (Fase D)" --body "$(cat <<'EOF'
## Resumo
Fase D do roteiro (`docs/arquitetura-modular-analise.md` §2.7 / §8 / §13). Havia 3 CRUDs concorrentes de `Role`/`Permission` sobre as mesmas tabelas (`AclService`, `RolesPermissionsService`, `departments.RolesService`) e um motor ABAC (`AccessPolicy`/`evaluatePolicies`) que nunca esteve ligado a enforcement e cujo modelo nem existe no schema.

## Mudanças
- `RolesPermissionsService` passa a ser o serviço único. `AclController` e o `RolesController` de `departments` delegam nele (rotas `/acl/*` e `/roles*` intactas, com adaptadores de forma onde o contrato histórico diferia).
- `AclService` e `departments.RolesService` **eliminados**.
- **ABAC removido** (decisão do dono do produto, 2026-09-05): apagados `AccessPolicy`/`evaluatePolicies`/`checkPermission`/`getPolicies`/`createPolicy` e as rotas `GET|POST /acl/policies` e `POST /acl/check` (passam a 404).
- Arrays `@Roles` hand-rolled de `acl` e `roles-permissions` convertidos para o enum `Role` (mesmo conjunto efectivo).
- Enforcement de autorização **não muda**: continua a ser o `RolesGuard` (role-name vs `@Roles()`).

## ⚠️ Verificação do frontend
As 3 rotas ABAC removidas (`/acl/policies`, `/acl/check`) não têm consumidores em `src/` (grep). **Confirmar no repo do frontend que nenhuma tela as chama antes de fazer merge.**

## Testes
- Unit: `RolesPermissionsService` com casos novos para tudo o que absorveu; specs de `acl`/`departments` reescritas para delegação; specs de `AclService` eliminadas.
- Integração: paridade dos 3 namespaces + 404 nas rotas ABAC.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 3: Aguardar `quality` verde.**
- [ ] **Step 4: `gh pr merge --squash --auto`.**

---

## Self-Review

**1. Cobertura da spec (§2.7 + §2.3 item 12 + §5 item 5 + §8 + §13 fase D):**
- "Consolidar `AclModule` + `RolesPermissionsModule` + `departments.RolesService` num único serviço" → Tasks 2–7 (canónico = `RolesPermissionsService`; os outros 2 eliminados; 3 namespaces preservados por delegação). ✔
- "Decidir explicitamente: ABAC aplicado ou removido" → **removido**, decisão registada; Task 5 apaga rotas/DTOs, Task 7 apaga o serviço. ✔
- §8 item 4 "6 arrays de roles hand-rolled" → 2 dos 6 (`acl`, `roles-permissions`) corrigidos nesta fase; os outros 4 anotados como remanescente no §8 do doc (Task 9 Step 6). ✔ (parcial, explícito)
- §8 item 3 "helper de scope de equipa genérico" → **fora do âmbito desta fase** (é trabalho de ownership/scope, não de consolidação de roles) — anotado, fica no §8. ✔

**2. Placeholders:** a Task 1 produz uma matriz de trabalho cujos deltas exactos (ex.: forma de `getStats`) são confirmados em runtime — os steps que dependem disso (Task 4 Step 2/3) dizem-no explicitamente e dão o critério ("igualar a forma histórica"). Não há "TODO"/"handle later". O único código deixado a preencher-por-leitura é a forma exacta do `expect` de `getStats`/`getPermissionMatrix`, que depende de campos que só existem no ficheiro a portar — aceitável e sinalizado.

**3. Consistência de tipos:**
- Serviço canónico: `findAll()`, `findOne(id)` (throws NotFound), `create(dto)`, `update(id,dto)`, `remove(id)`, `cloneRole(id,newName)`, `assignToUser(userId,roleId)`, `bulkAssignRole(dto)`, `addPermissionsToRole(roleId, ids[])`, `removePermissionsFromRole(roleId, ids[])`, `setRolePermissions(roleId, ids[])`, `getPermissionMatrix()`, `getGovernanceStats()` — **pré-existentes**. Adicionados: `getAllPermissions()`, `createPermission({name,action,subject,roleId?})`, `deletePermission(id)`, `initDefaultRoles()`, `seedDefaultPermissionsForRole(roleId,code,names[])`, `getMyPermissions(userId)`, `getAuditLog(filters)`, `getDeniedLog(filters)`, `getStats()`, `assignPermissionToRole(roleId,permissionId)` / `revokePermissionFromRole(roleId,permissionId)` (wrappers single). Usados com estas assinaturas nas Tasks 5–6. ✔
- `AclController.getRole` adaptador NotFound→null — consistente entre Task 1 (matriz), Task 5 Step 1 (teste) e Step 3 (impl). ✔
- `ROLE_DEFAULTS` — movido para `src/roles-permissions/role-defaults.ts` na Task 3, importado por `acl.service.ts` até este ser apagado na Task 7 (sem referência pendente depois). ✔

**4. Riscos anotados:** formas de resposta históricas de `/acl/*` (Task 1 matriz + adaptadores); rotas ABAC removidas → verificação do frontend (PR body + Global Constraints); `role.enum.spec.ts` (não tocar conjuntos efectivos de `@Roles`); ordem de eliminação (`AclService` só na Task 7, depois de o controller já não o injectar). Sem ciclo de módulos: `acl`/`departments` → `roles-permissions` → Prisma; `roles-permissions` não importa nenhum dos dois.
