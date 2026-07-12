# Remediação A-3 (Autorização ao Nível do Dado) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fechar os IDOR da auditoria A-3 — verificações de ownership inertes por compararem o papel com o literal `'EMPLOYEE'` (nunca igual ao real `'COLABORADOR'`) — com um helper de ownership reutilizável e a sua aplicação aos módulos afetados.

**Architecture:** Um módulo folha `src/common/authz/ownership.ts` (`isPrivileged`, `assertCanAccess` com 404 anti-enumeração e coerção de id, `ownershipWhere`) ancorado no enum `Role`. Os serviços com IDOR (payslips, work-declarations) passam a receber o objeto `user` e a impor ownership via helper; uma varredura dirigida aplica o mesmo padrão a módulos sensíveis confirmados. Spec: `docs/superpowers/specs/2026-07-12-a3-autorizacao-dados-design.md`.

**Tech Stack:** NestJS + Prisma (PostgreSQL), Jest (`--forceExit`), class-validator. Enum `Role` em `src/auth/enums/role.enum.ts`.

## Global Constraints

- **NUNCA correr `lint`, `format:check` ou `build` locais** — validação é do CI (check `quality` bloqueante). Correr apenas os specs Jest indicados: `npm run test -- <caminho>`.
- **Antes de cada ship**, `npx prettier --write` em TODOS os ficheiros tocados (incl. `.spec.ts`) e `npx prettier --check` para confirmar (repo usa `arrowParens: avoid`).
- **Nunca `require()` em testes** — o eslint `@typescript-eslint/no-require-imports` é **erro** e chumba o CI; usar `import * as x from 'mod'` (após `jest.mock`, que é hoisted).
- Hooks Husky: `git commit --no-verify` / `git push --no-verify` autorizados (máquina lenta).
- Rede instável: se `git push`/`gh` pendurar, usar `git -c http.version=HTTP/1.1 push --no-verify …` e repetir até ~5× (sleep 15). Preferir a shell **Bash**.
- Jest arranca lento (3-6 min): correr specs em foreground, timeout ≥10 min, não matar/re-tentar.
- Fonte de verdade do papel: `user.role?.name` (string) vs enum `Role`. **Zero literais** `'EMPLOYEE'` em código de autorização.
- Resposta a acesso não autorizado: **404 NotFoundException** (não revela existência).
- Commits: Conventional Commits pt, terminados com `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- Working dir: `C:\Users\Placido Costa\innova`. PR-1 na branch `feat/a3-ownership-helper` (já criada, tem o spec). PR-2 = branch `feat/a3-work-declarations` da main pós-PR-1. PR-3 = branch `feat/a3-varredura-dirigida` da main pós-PR-2.
- `JwtStrategy.validate` devolve o User Prisma com `role: { id, name, permissions }` em `req.user`; **não** há `roleCode`/`tenantId` populados. `CurrentUserData` (`src/common/types/current-user.ts`) descreve esse objeto.

---

# PR-1 — Helper de ownership + fix payslips (A3-1)

Branch: `feat/a3-ownership-helper` (a que tem o spec).

### Task 1: Helper de ownership

**Files:**
- Create: `src/common/authz/ownership.ts`
- Test: `src/common/authz/ownership.spec.ts`

**Interfaces:**
- Consumes: `Role` de `../../auth/enums/role.enum`.
- Produces: `isPrivileged(user, roles: Role[]): boolean`; `assertCanAccess<T>(resource: T | null | undefined, ownerId: number | string, user, privilegedRoles?: Role[]): asserts resource is T` (lança `NotFoundException`); `ownershipWhere(user, ownerField: string, privilegedRoles?: Role[]): Record<string, unknown>`. `user` é `{ id: number; role?: { name: string } | null }` (satisfeito por `CurrentUserData`).

- [ ] **Step 1: Write the failing test**

```typescript
// src/common/authz/ownership.spec.ts
import { NotFoundException } from '@nestjs/common';
import { isPrivileged, assertCanAccess, ownershipWhere } from './ownership';
import { Role } from '../../auth/enums/role.enum';

const employee = { id: 7, role: { name: 'COLABORADOR' } };
const admin = { id: 1, role: { name: 'ADMIN' } };
const noRole = { id: 9, role: null };

describe('isPrivileged', () => {
  it('true quando o papel está na lista', () => {
    expect(isPrivileged(admin, [Role.ADMIN, Role.RH])).toBe(true);
  });
  it('false quando o papel não está na lista', () => {
    expect(isPrivileged(employee, [Role.ADMIN, Role.RH])).toBe(false);
  });
  it('false quando não há papel', () => {
    expect(isPrivileged(noRole, [Role.ADMIN])).toBe(false);
  });
});

describe('assertCanAccess', () => {
  it('lança 404 quando o recurso é null', () => {
    expect(() => assertCanAccess(null, 7, employee, [Role.ADMIN])).toThrow(NotFoundException);
  });
  it('passa quando o utilizador é o dono (id numérico)', () => {
    expect(() => assertCanAccess({ x: 1 }, 7, employee, [Role.ADMIN])).not.toThrow();
  });
  it('passa quando o dono é string equivalente ao id numérico', () => {
    expect(() => assertCanAccess({ x: 1 }, '7', employee, [Role.ADMIN])).not.toThrow();
  });
  it('passa quando não é dono mas tem papel privilegiado', () => {
    expect(() => assertCanAccess({ x: 1 }, 99, admin, [Role.ADMIN, Role.RH])).not.toThrow();
  });
  it('lança 404 quando não é dono nem privilegiado', () => {
    expect(() => assertCanAccess({ x: 1 }, 99, employee, [Role.ADMIN, Role.RH])).toThrow(
      NotFoundException,
    );
  });
});

describe('ownershipWhere', () => {
  it('devolve {} para papel privilegiado', () => {
    expect(ownershipWhere(admin, 'userId', [Role.ADMIN, Role.RH])).toEqual({});
  });
  it('força o dono para papel não privilegiado', () => {
    expect(ownershipWhere(employee, 'userId', [Role.ADMIN, Role.RH])).toEqual({ userId: 7 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- src/common/authz/ownership.spec.ts`
Expected: FAIL — `Cannot find module './ownership'`

- [ ] **Step 3: Write minimal implementation**

```typescript
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

export function ownershipWhere(
  user: AuthUserLike,
  ownerField: string,
  privilegedRoles: Role[] = [],
): Record<string, unknown> {
  if (isPrivileged(user, privilegedRoles)) return {};
  return { [ownerField]: user.id };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- src/common/authz/ownership.spec.ts`
Expected: PASS (10 testes)

- [ ] **Step 5: Commit**

```bash
git add src/common/authz/ownership.ts src/common/authz/ownership.spec.ts
git commit --no-verify -m "feat(authz): helper de ownership ancorado no enum Role (404 anti-enumeracao)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

### Task 2: Fix payslips (A3-1)

**Files:**
- Modify: `src/payslips/payslips.service.ts` (`findOne`, `acknowledge`, `createDispute`)
- Modify: `src/payslips/payslips.controller.ts` (rotas `my/:id`, `:id` admin, acknowledge, dispute passam `user`)
- Test: `src/payslips/payslips.service.spec.ts` (criar se não existir; cobrir ownership)

**Interfaces:**
- Consumes: `assertCanAccess`, `isPrivileged` (Task 1); `Role`; `CurrentUserData`.
- Produces: `PayslipsService.findOne(id: number, user?: CurrentUserData)` — mesma leitura, agora com ownership 404 via helper.

- [ ] **Step 1: Write the failing test**

```typescript
// src/payslips/payslips.service.spec.ts
import { NotFoundException } from '@nestjs/common';
import { PayslipsService } from './payslips.service';

const employeeA = { id: 7, role: { name: 'COLABORADOR' } } as any;
const employeeB = { id: 8, role: { name: 'COLABORADOR' } } as any;
const rh = { id: 1, role: { name: 'RH' } } as any;

function makePrisma(payslip: any) {
  return {
    payslip: {
      findUnique: jest.fn().mockResolvedValue(payslip),
      update: jest.fn().mockResolvedValue(payslip),
    },
  } as any;
}

describe('PayslipsService.findOne ownership (A3-1)', () => {
  const payslipOfA = { id: 5, userId: 7, period: '2026-04' };

  it('o dono lê o próprio recibo', async () => {
    const svc = new PayslipsService(makePrisma(payslipOfA));
    await expect(svc.findOne(5, employeeA)).resolves.toMatchObject({ id: 5 });
  });

  it('outro colaborador recebe 404 (não revela existência)', async () => {
    const svc = new PayslipsService(makePrisma(payslipOfA));
    await expect(svc.findOne(5, employeeB)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('RH lê qualquer recibo (papel privilegiado)', async () => {
    const svc = new PayslipsService(makePrisma(payslipOfA));
    await expect(svc.findOne(5, rh)).resolves.toMatchObject({ id: 5 });
  });

  it('recibo inexistente → 404', async () => {
    const svc = new PayslipsService(makePrisma(null));
    await expect(svc.findOne(5, employeeA)).rejects.toBeInstanceOf(NotFoundException);
  });
});
```

> Nota: se o construtor real de `PayslipsService` receber mais dependências além do `PrismaService`, adaptar o `makePrisma`/instanciação ao construtor real (ler o topo de `payslips.service.ts`); o essencial é mockar `prisma.payslip.findUnique`.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- src/payslips/payslips.service.spec.ts`
Expected: FAIL — hoje `findOne` só recusa quando `requestingRole === 'EMPLOYEE'`, logo `employeeB` (COLABORADOR) obtém o recibo em vez de 404.

- [ ] **Step 3: Write minimal implementation**

Em `src/payslips/payslips.service.ts`:
- Acrescentar aos imports: `import { assertCanAccess } from '../common/authz/ownership';`, `import { Role } from '../auth/enums/role.enum';`, `import { CurrentUserData } from '../common/types/current-user';`. Remover `ForbiddenException` do import se ficar sem uso.
- Substituir a assinatura e o corpo do `findOne` (linhas ~150-176):

```typescript
  async findOne(id: number, user?: CurrentUserData) {
    const p = await (this.prisma as any).payslip.findUnique({
      where: { id },
      include: {
        user: {
          select: {
            id: true,
            fullName: true,
            email: true,
            employeeNumber: true,
            nif: true,
            nib: true,
            hireDate: true,
          },
        },
      },
    });

    // Ownership ao nível do dado (A3-1): dono OU ADMIN/RH; senão 404.
    // Quando chamado sem user (contexto interno de confiança), não filtra.
    if (user) assertCanAccess(p, p?.userId, user, [Role.ADMIN, Role.RH]);
    else if (!p) throw new NotFoundException('Recibo não encontrado');

    return p;
  }
```

- `acknowledge` (linha ~301): trocar `const p = await this.findOne(id, userId, 'EMPLOYEE');` por receber o user e passá-lo. Mudar assinatura para `acknowledge(id: number, user: CurrentUserData)` e `const p = await this.findOne(id, user);` (usar `user.id` onde antes usava `userId`).
- `createDispute` (linha ~477): mudar assinatura para `createDispute(payslipId: number, user: CurrentUserData, dto: CreateDisputeDto)`, `const p = await this.findOne(payslipId, user);`, e usar `user.id` no `data: { ..., userId: user.id }`.

- [ ] **Step 4: Atualizar o controller**

Em `src/payslips/payslips.controller.ts`:
- `myPayslip` (linha ~70): `const payslip = await this.svc.findOne(id, user);` (passar o objeto `user`, não `user.role?.name`).
- `findOne` admin (linha ~126): `const payslip = await this.svc.findOne(id, user);` (é `@Roles(ADMIN,RH)`, o helper deixa passar por papel privilegiado).
- `acknowledge` (linha ~83): `return this.svc.acknowledge(id, user);`
- `createDispute` (linha ~89): `return this.svc.createDispute(id, user, dto);`

- [ ] **Step 5: Run tests**

Run: `npm run test -- src/payslips`
Expected: PASS (o novo spec de ownership + specs existentes do módulo verdes).

- [ ] **Step 6: Confirmar ausência de literais**

Run: `git grep -n "'EMPLOYEE'" -- src/payslips`
Expected: **0 resultados**.

- [ ] **Step 7: Commit**

```bash
git add src/payslips/payslips.service.ts src/payslips/payslips.controller.ts src/payslips/payslips.service.spec.ts
git commit --no-verify -m "fix(security): ownership real nos recibos via helper; remove literal EMPLOYEE (A3-1)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

### Task 3: Ship PR-1

- [ ] **Step 1: Prettier**

Run: `npx prettier --write src/common/authz/*.ts src/payslips/payslips.service.ts src/payslips/payslips.controller.ts src/payslips/payslips.service.spec.ts` depois `npx prettier --check` os mesmos. Commit se houver mudanças (`git commit --no-verify -m "style: prettier A-3 PR-1"`).

- [ ] **Step 2: Push + PR + auto-merge**

```bash
git -c http.version=HTTP/1.1 push --no-verify -u origin feat/a3-ownership-helper
gh pr create --title "feat(security): remediacao A-3 PR-1 — helper de ownership + fix IDOR recibos (A3-1)" \
  --body "PR 1/3 da remediacao A-3 (spec docs/superpowers/specs/2026-07-12-a3-autorizacao-dados-design.md): helper src/common/authz/ownership.ts (isPrivileged, assertCanAccess 404, ownershipWhere) ancorado no enum Role, e fix do IDOR dos recibos (payslips) — a guarda comparava o papel com 'EMPLOYEE' (nunca igual a 'COLABORADOR'), expondo salario/NIF/NIB de qualquer colaborador. Fecha A3-1.

🤖 Generated with [Claude Code](https://claude.com/claude-code)"
gh pr merge --auto --squash --delete-branch
```

Confirmar `quality` verde (prettier/eslint/regressão). Se falhar, ler o log, corrigir, re-push.

---

# PR-2 — Fix work-declarations (A3-2)

Branch nova da main (pós-PR-1): `feat/a3-work-declarations`.

### Task 4: Ownership em work-declarations

**Files:**
- Modify: `src/work-declaration/work-declaration.service.ts` (`listDeclarations`, `getDeclaration`)
- Modify: `src/work-declaration/work-declaration.controller.ts` (passar `user` a esses métodos)
- Test: `src/work-declaration/work-declaration.service.spec.ts` (criar/estender; cobrir ownership)

**Interfaces:**
- Consumes: `isPrivileged`, `assertCanAccess` (Task 1); `Role`; `CurrentUserData`.
- Produces: `listDeclarations(tenantId, user, query)` e `getDeclaration(tenantId, user, declarationId)` — recebem o objeto `user` em vez de `(userId: string, role: string)`.

- [ ] **Step 1: Write the failing test**

```typescript
// src/work-declaration/work-declaration.service.spec.ts
import { NotFoundException } from '@nestjs/common';
import { WorkDeclarationService } from './work-declaration.service';

const employeeA = { id: 7, role: { name: 'COLABORADOR' } } as any;
const employeeB = { id: 8, role: { name: 'COLABORADOR' } } as any;
const rh = { id: 1, role: { name: 'RH' } } as any;

// Instanciar com um prisma mock; adaptar ao construtor real lido no service.
function makeService(declaration: any, findManyResult: any[] = []) {
  const prisma = {
    declaration: {
      findMany: jest.fn().mockResolvedValue(findManyResult),
      count: jest.fn().mockResolvedValue(findManyResult.length),
      findUnique: jest.fn().mockResolvedValue(declaration),
      findFirst: jest.fn().mockResolvedValue(declaration),
    },
  } as any;
  return new WorkDeclarationService(prisma);
}

describe('WorkDeclarationService ownership (A3-2)', () => {
  const declOfA = { id: 'd1', employeeId: '7', tenantId: 't1' };

  it('getDeclaration: outro colaborador recebe 404', async () => {
    const svc = makeService(declOfA);
    await expect(svc.getDeclaration('t1', employeeB, 'd1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('getDeclaration: o dono acede', async () => {
    const svc = makeService(declOfA);
    await expect(svc.getDeclaration('t1', employeeA, 'd1')).resolves.toMatchObject({ id: 'd1' });
  });

  it('getDeclaration: RH acede a qualquer', async () => {
    const svc = makeService(declOfA);
    await expect(svc.getDeclaration('t1', rh, 'd1')).resolves.toMatchObject({ id: 'd1' });
  });

  it('listDeclarations: colaborador força employeeId próprio no where', async () => {
    const svc = makeService(null, []);
    await svc.listDeclarations('t1', employeeA, {} as any);
    const prisma: any = (svc as any).prisma;
    const whereArg = prisma.declaration.findMany.mock.calls[0][0].where;
    expect(whereArg.employeeId).toBe('7');
  });

  it('listDeclarations: RH não é forçado ao próprio (sem employeeId no where quando não filtra)', async () => {
    const svc = makeService(null, []);
    await svc.listDeclarations('t1', rh, {} as any);
    const prisma: any = (svc as any).prisma;
    const whereArg = prisma.declaration.findMany.mock.calls[0][0].where;
    expect(whereArg.employeeId).toBeUndefined();
  });
});
```

> Nota: `findDeclarationOrThrow`/`getDeclaration` usam hoje `findUnique`/`findFirst` — o mock cobre ambos. Ler o service para confirmar qual método `getDeclaration` invoca via `findDeclarationOrThrow` e mockar esse. Se o construtor tiver mais dependências, adaptar `makeService`.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- src/work-declaration/work-declaration.service.spec.ts`
Expected: FAIL — hoje `getDeclaration` compara `role === 'EMPLOYEE'` (com o objeto role passado pelo controller, sempre falso), logo `employeeB` obtém a declaração; e `listDeclarations` não força `employeeId`.

- [ ] **Step 3: Write minimal implementation**

Em `src/work-declaration/work-declaration.service.ts`:
- Imports: `import { isPrivileged, assertCanAccess } from '../common/authz/ownership';`, `import { Role } from '../auth/enums/role.enum';`, `import { CurrentUserData } from '../common/types/current-user';`. Remover `ForbiddenException` se ficar sem uso.
- `listDeclarations` (linhas ~281-328): mudar assinatura para `(tenantId: string, user: CurrentUserData, query: DeclarationQueryDto)` e o scoping:

```typescript
  async listDeclarations(tenantId: string, user: CurrentUserData, query: DeclarationQueryDto) {
    const privileged = isPrivileged(user, [Role.ADMIN, Role.RH]);
    const where: any = { tenantId };

    // Colaborador vê apenas as suas (employeeId é string na BD).
    if (!privileged) where.employeeId = String(user.id);

    if (query.status) where.status = query.status;
    if (query.type) where.type = query.type;
    // Filtro por employeeId só é honrado para papéis privilegiados.
    if (query.employeeId && privileged) where.employeeId = query.employeeId;
    if (query.assignedToId) where.assignedToId = query.assignedToId;
    if (query.fromDate || query.toDate) {
      where.createdAt = {};
      if (query.fromDate) where.createdAt.gte = new Date(query.fromDate);
      if (query.toDate) where.createdAt.lte = new Date(query.toDate);
    }
    if (query.search) {
      where.OR = [
        { code: { contains: query.search, mode: 'insensitive' } },
        { title: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    const [data, total] = await Promise.all([
      (this.prisma as any).declaration.findMany({
        where,
        include: this.declarationListIncludes(),
        orderBy: { [query.sortBy ?? 'createdAt']: query.sortOrder ?? 'desc' },
        skip: ((query.page ?? 1) - 1) * (query.limit ?? 20),
        take: query.limit ?? 20,
      }),
      (this.prisma as any).declaration.count({ where }),
    ]);

    return {
      data,
      meta: {
        total,
        page: query.page ?? 1,
        limit: query.limit ?? 20,
        totalPages: Math.ceil(total / (query.limit ?? 20)),
      },
    };
  }
```

- `getDeclaration` (linhas ~330-338): mudar para `(tenantId: string, user: CurrentUserData, declarationId: string)` e usar o helper:

```typescript
  async getDeclaration(tenantId: string, user: CurrentUserData, declarationId: string) {
    const declaration = await this.findDeclarationOrThrow(tenantId, declarationId);
    // Ownership (A3-2): dono OU ADMIN/RH; senão 404. employeeId é string — o
    // helper coage ambos os lados.
    assertCanAccess(declaration, declaration.employeeId, user, [Role.ADMIN, Role.RH]);
    return declaration;
  }
```

- [ ] **Step 4: Atualizar o controller**

Em `src/work-declaration/work-declaration.controller.ts`, nas rotas que chamam `listDeclarations`/`getDeclaration`/`getMyDeclarations`:
- Passar o objeto `user` (o `@CurrentUser()`) em vez de `String(user.id)`, `(user as any).role` e do literal `'EMPLOYEE'`. Ex.:
  - `findAll`: `return this.workDeclarationService.listDeclarations((user as any).tenantId, user, filters);`
  - `findOne`: `return this.workDeclarationService.getDeclaration((user as any).tenantId, user, id);`
  - `getMyDeclarations`: `return this.workDeclarationService.listDeclarations((user as any).tenantId, user, {} as any);`
- Tipar o `@CurrentUser() user` como `CurrentUserData` (importar de `../common/types/current-user`) em vez de `IAuthUser`, para o `user.role?.name` estar disponível. `(user as any).tenantId` mantém-se (undefined em runtime — nota do spec; não introduzir dependência nova).

- [ ] **Step 5: Run tests**

Run: `npm run test -- src/work-declaration`
Expected: PASS (novo spec de ownership + specs existentes verdes).

- [ ] **Step 6: Confirmar ausência de literais**

Run: `git grep -n "'EMPLOYEE'" -- src/work-declaration`
Expected: **0 resultados**.

- [ ] **Step 7: Commit**

```bash
git add src/work-declaration/work-declaration.service.ts src/work-declaration/work-declaration.controller.ts src/work-declaration/work-declaration.service.spec.ts
git commit --no-verify -m "fix(security): ownership real nas declaracoes de trabalho; remove literal EMPLOYEE (A3-2)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

### Task 5: Ship PR-2

- [ ] **Step 1: Prettier + push + PR**

```bash
npx prettier --write src/work-declaration/work-declaration.service.ts src/work-declaration/work-declaration.controller.ts src/work-declaration/work-declaration.service.spec.ts
# npx prettier --check os mesmos; commit se mudou
git -c http.version=HTTP/1.1 push --no-verify -u origin feat/a3-work-declarations
gh pr create --title "feat(security): remediacao A-3 PR-2 — ownership nas declaracoes de trabalho (A3-2)" \
  --body "PR 2/3 da remediacao A-3: fix do IDOR das declaracoes de trabalho. O controller passava o OBJETO role a uma comparacao com 'EMPLOYEE' (sempre falsa), pelo que o scoping por employeeId nunca aplicava. Agora usa o helper de ownership e o enum Role; colaborador so ve as suas, ADMIN/RH veem todas. Fecha A3-2.

🤖 Generated with [Claude Code](https://claude.com/claude-code)"
gh pr merge --auto --squash --delete-branch
```

---

# PR-3 — Varredura dirigida dos módulos sensíveis

Branch nova da main (pós-PR-2): `feat/a3-varredura-dirigida`.

### Task 6: Investigar os módulos candidatos

**Files:** nenhum (investigação; produz notas para as Tasks seguintes).

Candidatos (do spec §4): `leave-management`, `declarations`, `attendance`, `career-plans`, `evaluation360`.

- [ ] **Step 1: Triagem do anti-padrão**

Para cada módulo, correr e registar:

```bash
# comparações de papel por literal (o bug-mãe)
git grep -nE "=== ?'(EMPLOYEE|COLABORADOR|MANAGER)'|!== ?'(EMPLOYEE|COLABORADOR|MANAGER)'" -- src/<modulo>
# leitura por id sem userId no where (candidato a IDOR)
git grep -nE "findUnique\(\{ ?where: ?\{ ?id" -- src/<modulo>
```

- [ ] **Step 2: Ler as rotas `:id` de recurso de utilizador**

Para cada rota `GET/PATCH/PUT/DELETE :id` que devolva/altere um recurso pertencente a um utilizador (não config global), confirmar no serviço se o `where` inclui o dono (`userId`/`employeeId`) OU se há verificação de ownership. Registar numa lista os métodos que **não** têm (o buraco).

- [ ] **Step 3: Escrever a lista de alvos**

Escrever em `docs/security/2026-07-12-a3-varredura-alvos.md` a lista dos métodos confirmados com o buraco (ficheiro:linha + descrição), e os que estão OK (para o registo). Se **nenhum** módulo tiver o buraco, documentar isso e a PR-3 fica só com este documento (fechar a varredura sem alterações de código).

- [ ] **Step 4: Commit da investigação**

```bash
git add docs/security/2026-07-12-a3-varredura-alvos.md
git commit --no-verify -m "docs(security): alvos da varredura dirigida A-3 (modulos sensiveis)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

### Task 7: Aplicar o helper aos alvos confirmados

**Files:** os serviços/controllers listados na Task 6 (dependente da investigação).
**Test:** um spec por módulo tocado.

> Só executar para os módulos que a Task 6 confirmou terem o buraco. Aplicar a
> receita já validada nas PRs 1-2 — **não** inventar variações.

**Receita concreta (aplicar por método com buraco):**
- **Leitura por id de recurso de utilizador** (`GET/PATCH/DELETE :id`): após o
  `findUnique`/`findFirst`, inserir
  `assertCanAccess(recurso, recurso.<ownerField>, user, [Role.ADMIN, Role.RH])`
  (importar de `../common/authz/ownership` e `Role` do enum). O controller passa
  o objeto `user` (`@CurrentUser()` tipado `CurrentUserData`).
- **Listagem de recursos de utilizador**: no `where`, aplicar
  `...(isPrivileged(user, [Role.ADMIN, Role.RH]) ? {} : { <ownerField>: user.id })`
  (usar `String(user.id)` se a coluna for string).

Para **cada** módulo tocado:

- [ ] **Step A: Write the failing test** (trio dono/outro/privilegiado)

```typescript
// src/<modulo>/<modulo>.service.spec.ts (nome real do serviço/método)
import { NotFoundException } from '@nestjs/common';
// import do serviço real
const owner = { id: 7, role: { name: 'COLABORADOR' } } as any;
const other = { id: 8, role: { name: 'COLABORADOR' } } as any;
const rh = { id: 1, role: { name: 'RH' } } as any;
// makeService com prisma mock adaptado ao construtor real e ao modelo Prisma do módulo
it('outro colaborador recebe 404', async () => {
  // svc.<metodoPorId>(<id>, other) → rejects NotFoundException
});
it('o dono acede', async () => { /* resolves */ });
it('RH acede', async () => { /* resolves */ });
```

- [ ] **Step B: Run to verify it fails** — `npm run test -- src/<modulo>/<spec>`; Expected: FAIL (outro colaborador obtém o recurso).
- [ ] **Step C: Aplicar a receita** no serviço + controller do módulo.
- [ ] **Step D: Run to verify it passes** — `npm run test -- src/<modulo>`; Expected: PASS.
- [ ] **Step E: Commit** — `git commit --no-verify -m "fix(security): ownership no modulo <modulo> (varredura A-3)"` (+ Co-Authored-By).

Repetir A–E por módulo confirmado.

### Task 8: Ship PR-3

- [ ] **Step 1: Prettier** em todos os ficheiros tocados (incl. specs e o doc de alvos); `--check`.
- [ ] **Step 2: Push + PR + auto-merge**

```bash
git -c http.version=HTTP/1.1 push --no-verify -u origin feat/a3-varredura-dirigida
gh pr create --title "feat(security): remediacao A-3 PR-3 — varredura dirigida de ownership" \
  --body "PR 3/3 da remediacao A-3: varredura dirigida dos modulos sensiveis (leave-management, declarations, attendance, career-plans, evaluation360). Alvos confirmados em docs/security/2026-07-12-a3-varredura-alvos.md; helper de ownership aplicado aos metodos com buraco, cada um com o trio de testes dono/outro/privilegiado.

🤖 Generated with [Claude Code](https://claude.com/claude-code)"
gh pr merge --auto --squash --delete-branch
```

---

## Nota de follow-up (fora do âmbito A-3)

`work-declaration` usa `(user as any).tenantId`, undefined em runtime (multi-tenancy
inerte). Registar como item separado para a Faixa de arquitetura — não introduzir
dependência nova nele nesta remediação.

## Self-review (coberto)

- Spec §1 helper → Task 1. §2 payslips → Task 2. §3 work-declarations → Task 4.
  §4 varredura → Tasks 6-7. Critérios de aceitação (zero literais, 404 entre
  colaboradores, controllers passam `user`, trio de testes) mapeados.
- Tipos consistentes: `isPrivileged(user, Role[])`, `assertCanAccess(resource, ownerId, user, Role[])`,
  `ownershipWhere(user, ownerField, Role[])`, `findOne(id, user?)`,
  `listDeclarations(tenantId, user, query)`, `getDeclaration(tenantId, user, id)` —
  usados com os mesmos nomes/assinaturas entre tasks.
