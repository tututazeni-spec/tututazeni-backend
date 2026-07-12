# Design — Remediação A-3: Autorização ao Nível do Dado

> Remedia os achados do relatório `docs/security/2026-07-12-auditoria-a3-autorizacao-dados.md`
> (A3-1 a A3-3, mais varredura dirigida). Aprovado em brainstorm a 2026-07-12.

## Decisões tomadas

| Decisão | Escolha | Racional |
|---|---|---|
| Âmbito | Helper de ownership + fix dos 2 IDOR críticos + varredura DIRIGIDA aos módulos sensíveis | Fecha o risco real sem o plano gigante das 202 rotas |
| Resposta a acesso não autorizado | **404 Not Found** | Não revela existência do recurso (anti-enumeração); é o padrão que `notifications.service` já usa |
| Fonte de verdade do papel | enum `Role` (`src/auth/enums/role.enum.ts`), via `user.role?.name` | Elimina literais soltos como `'EMPLOYEE'`; `RolesGuard` já usa `user.role.name` |
| Enforcement | No `where` do Prisma quando possível; helper post-fetch quando não | Fecha o IDOR na própria query |

## Contexto técnico confirmado

- `JwtStrategy.validate` devolve o User do Prisma com `role: { id, name, permissions }`
  em `req.user`. **Não** há `roleCode` nem `tenantId` populados em runtime — o
  `IAuthUser` e o `CurrentUserData` marcam-nos como legado/opcional (undefined).
  A única fonte fiável do papel é `user.role?.name` (string, ex.: `'COLABORADOR'`).
- `Role.EMPLOYEE = 'COLABORADOR'` (alias). Código que compara contra o literal
  `'EMPLOYEE'` nunca corresponde ao papel real → verificação inerte.
- O padrão `'EMPLOYEE'` aparece **apenas** em `payslips` e `work-declaration`
  (confirmado por grep). O resto do sistema usa `@Roles(Role.X)` corretamente.
- `work-declaration` usa `employeeId` como **string** (`String(user.id)`) e rotas
  com `ParseUUIDPipe`; `(user as any).tenantId` é undefined em runtime — bug
  latente de multi-tenancy, **fora do âmbito A-3** (registado como nota).

## 1. Helper de ownership (`src/common/authz/ownership.ts`)

Módulo folha, puro e testável, ancorado no enum `Role`:

```typescript
import { NotFoundException } from '@nestjs/common';
import { Role } from '../../auth/enums/role.enum';

interface AuthUserLike {
  id: number;
  role?: { name: string } | null;
}

// O papel do utilizador está entre os papéis privilegiados dados?
export function isPrivileged(user: AuthUserLike, roles: Role[]): boolean {
  const name = user.role?.name;
  return !!name && roles.map(String).includes(name);
}

// Garante que o utilizador pode aceder ao recurso: existe E (é dono OU privilegiado).
// Lança 404 (não revela existência) caso contrário. Estreita o tipo (remove null).
// ownerId aceita number OU string (work-declaration usa employeeId string) —
// compara por coerção de string para funcionar nos dois módulos.
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

// Fragmento `where` para listagens: {} para privilegiados; senão força o dono.
export function ownershipWhere(
  user: AuthUserLike,
  ownerField: string,
  privilegedRoles: Role[] = [],
): Record<string, unknown> {
  if (isPrivileged(user, privilegedRoles)) return {};
  return { [ownerField]: user.id };
}
```

Nota de tipos: os serviços tipam o utilizador recebido como `CurrentUserData`
(que satisfaz `AuthUserLike`). Onde hoje se passa só uma string de papel, muda-se
para passar o objeto `user`.

## 2. Fix A3-1 — payslips

- `payslips.controller.ts`: as rotas `/my/...` passam a entregar o objeto `user`
  completo ao serviço (já têm `@CurrentUser()`), não `user.role?.name`.
- `payslips.service.ts`:
  - `findOne(id, user?)`: após o `findUnique`, chamar
    `assertCanAccess(p, p.userId, user, [Role.ADMIN, Role.RH])`. A rota admin
    (`GET :id`, `@Roles(ADMIN,RH)`) passa `user` — o helper deixa passar por
    papel privilegiado. A rota `/my/:id` passa `user` colaborador — recusa (404)
    recibo de outro.
  - `acknowledge`/`createDispute`: substituir `findOne(id, userId, 'EMPLOYEE')`
    por `findOne(id, user)` (com o objeto), eliminando o literal `'EMPLOYEE'`.
  - A rota admin `GET :id` mantém acesso total via papel privilegiado.
- Resultado: nenhum literal `'EMPLOYEE'` em `payslips`; ownership imposto pelo
  helper; testes garantem 404 entre colaboradores.

## 3. Fix A3-2 — work-declarations

- `work-declaration.controller.ts`: substituir `(user as any).role` (objeto) por
  `user.role?.name` (string) nas chamadas a `listDeclarations`/`findOne`. A rota
  `getMyDeclarations` (que já passa `'EMPLOYEE'` hardcoded e por isso funciona)
  passa a usar `user.role?.name` também, para consistência.
- `work-declaration.service.ts`: substituir as comparações `role === 'EMPLOYEE'`
  (linhas 290, 294, 333) por lógica baseada em `Role.COLABORADOR` e no helper:
  - `listDeclarations`: usar `ownershipWhere(user, 'employeeId', [Role.ADMIN, Role.RH])`
    (empregando `employeeId = String(user.id)` para coerência de tipo) — um
    colaborador só lista as suas; o filtro `query.employeeId` só é honrado para
    privilegiados.
  - `findOne`: `assertCanAccess(declaration, declaration.employeeId, user, [Role.ADMIN, Role.RH])` — o helper coage ambos os lados a string, pelo que o `employeeId` string encaixa diretamente com `user.id` numérico.
- Nota registada: `tenantId` undefined em runtime — scoping de tenant inerte,
  fora do âmbito; não introduzir dependência nova nele.

## 4. Varredura dirigida + testes

Aplicar o helper aos módulos de dados pessoais/sensíveis com rotas `:id` de
recurso de utilizador que não filtrem por `userId`. Candidatos a verificar
(confirmar caso a caso no plano; só corrigir os que tiverem o buraco):
`leave-management`, `declarations`, `attendance`, `career-plans`, `evaluation360`.

Para cada rota corrigida: teste de serviço "colaborador A não acede ao recurso
de B → 404" e "dono acede → 200" e "ADMIN/RH acede → 200".

## Componentes e ficheiros

| Ficheiro | Responsabilidade | PR |
|---|---|---|
| `src/common/authz/ownership.ts` (+ spec) | helper de ownership | 1 |
| `src/payslips/payslips.{service,controller}.ts` | fix A3-1 | 1 |
| `src/work-declaration/work-declaration.{service,controller}.ts` | fix A3-2 | 2 |
| serviços/controllers dos módulos sensíveis confirmados | varredura dirigida | 3 |

## Testes (TDD por PR)

- **PR-1**: helper (isPrivileged, assertCanAccess 404 nos 3 cenários, ownershipWhere);
  payslips (colaborador não lê recibo de outro → 404; dono → 200; ADMIN → 200).
- **PR-2**: work-declarations (list scoped ao próprio; findOne de outro → 404;
  privilegiado vê todos).
- **PR-3**: por cada módulo tocado, o trio dono/outro/privilegiado.

## Ordem de entrega

1. **PR-1** — helper + payslips (A3-1).
2. **PR-2** — work-declarations (A3-2).
3. **PR-3** — varredura dirigida dos módulos sensíveis confirmados.

Cada PR: TDD → code review → ship. `npx prettier --write` em todos os ficheiros
tocados (incl. specs); nunca `require()` em testes (eslint `no-require-imports`).

## Critérios de aceitação

- [ ] Zero literais `'EMPLOYEE'` em código de autorização (`grep "'EMPLOYEE'"` limpo fora do enum/testes).
- [ ] `GET /payslips/my/:id` de outro colaborador → 404; dono → 200; ADMIN/RH → 200.
- [ ] `GET/LIST /work-declarations` scoped ao próprio colaborador; privilegiado vê todos; acesso a declaração de outro → 404.
- [ ] Controllers passam ao serviço o objeto `user` (ou `user.role?.name`), nunca o objeto role cru nem literais.
- [ ] Cada módulo tocado na varredura tem o trio de testes dono/outro/privilegiado.
- [ ] Nota do `tenantId` inerte registada para follow-up (fora do âmbito).
