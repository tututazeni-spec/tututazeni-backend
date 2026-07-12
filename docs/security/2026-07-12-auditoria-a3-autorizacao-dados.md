# Auditoria A-3 — Autorização ao Nível do Dado (INNOVA)

> Faixa A-3 da auditoria de production readiness (reinterpretação INNOVA do
> "RLS Supabase" → NestJS Guards + ownership checks no Prisma). Data: 2026-07-12.
> Âmbito: endpoints sem guard, operações read/update/delete sem verificação de
> ownership, verificação de role em falta, endpoints administrativos, segredos
> alcançáveis pelo frontend. Repo: `innova` (backend NestJS).
> **Este documento só reporta e planeia — nenhuma correção foi aplicada.**

---

## 1. Resumo executivo

A base de autorização é sólida: `JwtAuthGuard` e `RolesGuard` são **globais**
(`APP_GUARD` em `src/app.module.ts:198-199`), portanto todos os endpoints são
autenticados por defeito e `@Public()` faz opt-out — e o uso de `@Public()` é
mínimo e apropriado (métricas atrás de `MetricsTokenGuard`, verificação pública
de certificado, fluxos de auth, health). `@Roles()` é usado profusamente (855
ocorrências em 64 controllers). Muitos serviços fazem ownership corretamente
(ex.: `notifications.service` usa `findFirst({ where: { id, userId } })`).

O problema é **sistémico e crítico numa dimensão específica**: várias
verificações de ownership estão *presentes mas inertes* porque comparam o papel
do utilizador contra o literal `'EMPLOYEE'`, um valor que **nunca** corresponde
ao nome real do papel na base de dados. O enum
(`src/auth/enums/role.enum.ts:19`) define `EMPLOYEE = 'COLABORADOR'` — ou seja,
`Role.EMPLOYEE` é apenas um alias cujo valor é `'COLABORADOR'`. O papel real de
um colaborador é `'COLABORADOR'`. Código que faz `if (role === 'EMPLOYEE')`
compara contra a string literal `'EMPLOYEE'`, que não existe como nome de papel
→ a condição é sempre falsa → a verificação de ownership é saltada. Em pelo
menos dois módulos que expõem **dados financeiros e PII** (recibos de
vencimento; declarações de trabalho), isto resulta em IDOR: qualquer utilizador
autenticado lê os dados de qualquer outro iterando o `id`.

## 2. Cenário de ataque (porquê importa)

**IDOR nos recibos de vencimento.** Um colaborador autenticado chama
`GET /payslips/my/5`, `/my/6`, `/my/7`… O controller
(`payslips.controller.ts:75`) delega em `svc.findOne(id, user.id, user.role?.name)`
com `user.role.name === 'COLABORADOR'`. Em `payslips.service.ts:171` a guarda é
`if (requestingRole === 'EMPLOYEE' && p.userId !== requestingUserId) throw`.
Como `'COLABORADOR' !== 'EMPLOYEE'`, a guarda não dispara e o serviço devolve o
recibo — **incluindo `nif` (número de contribuinte), `nib` (conta bancária),
salário bruto e líquido** (o `include` do `findOne` seleciona esses campos) — de
qualquer funcionário da empresa. Numa organização de 6000 pessoas isto é uma
fuga massiva de dados financeiros e pessoais.

**IDOR nas declarações de trabalho.** Pior ainda: `work-declaration.controller.ts`
passa `(user as any).role` ao serviço — o **objeto** da relação role, não o seu
`.name`. Em `work-declaration.service.ts:290,294,333` compara-se esse objeto com
`'EMPLOYEE'` (sempre falso), pelo que o scoping por `employeeId` nunca é aplicado
e o filtro `query.employeeId` é sempre honrado → um colaborador lista e filtra as
declarações de qualquer outro à vontade.

## 3. Achados

| # | Severidade | Achado | Evidência |
|---|---|---|---|
| A3-1 | 🔴 Crítico | IDOR em recibos: ownership check comparado com `'EMPLOYEE'` (nunca igual a `'COLABORADOR'`) — qualquer colaborador lê recibo (salário, NIF, NIB) de qualquer outro via `GET /payslips/my/:id` | `payslips.service.ts:171`; `payslips.controller.ts:75`; `role.enum.ts:19` |
| A3-2 | 🔴 Crítico | IDOR em declarações de trabalho: controller passa o **objeto** role (`(user as any).role`), comparado com `'EMPLOYEE'` — scoping por `employeeId` nunca aplica; leitura/listagem de qualquer colaborador | `work-declaration.controller.ts:84-88,103-107`; `work-declaration.service.ts:290,294,333` |
| A3-3 | 🟠 Alto | Padrão de comparação de papel por string literal frágil e inconsistente em toda a base: uns métodos usam `'EMPLOYEE'` hardcoded (funciona por acaso), a rota de leitura passa o nome real (`'COLABORADOR'`) — falha silenciosa. Deve existir uma fonte única (`roleCode`/`Role` enum) e um helper de ownership reutilizável | `payslips.service.ts:171,302,478` (mistura `'EMPLOYEE'` hardcoded vs nome real) |
| A3-4 | 🟡 Médio | `buildAccessWhere` do document-repository compara `role === 'ADMIN'/'RH'`; se o role passado for o objeto (como noutros módulos), admins caem no filtro restrito (fail-closed, sem fuga) — mas documentos `INTERNAL` ficam visíveis a **todos** os autenticados por design; confirmar se é intencional | `document-repository.service.ts:41-56` |
| A3-5 | 🟡 Médio | `RolesGuard` autoriza por `user.role.name` (string) e nega se `!requiredRoles.includes(user?.role?.name)`; se `user.role` for null (utilizador sem papel), `user?.role?.name` é `undefined` e qualquer `@Roles` nega — correto, mas endpoints sem `@Roles` só exigem autenticação: confirmar que nenhuma operação sensível de escrita depende só de estar autenticado | `roles.guard.ts:10-19` |
| A3-6 | 🟢 Baixo | Não há guard de **permissões** (só Jwt + Roles + Throttler globais); o modelo `permissions` existe na relação role mas a autorização fina por permissão não é imposta por guard — aceitável se `@Roles` cobre, mas registar a lacuna | `app.module.ts:198-200` |

### O que está bem (não alterar)

- `JwtAuthGuard` + `RolesGuard` globais; `@Public()` mínimo e correto.
- `notifications.service` (`markAsRead`/`archiveNotification`) faz ownership com
  `findFirst({ where: { id, userId } })` + `NotFoundException` — padrão de
  referência a replicar.
- `payslips` separa corretamente rotas de colaborador (`/my/...`) das de
  Admin/RH (`@Roles(ADMIN, RH)`); o defeito é só a guarda inerte, não a
  estrutura.
- `acl.service` e `evaluation360.service` usam `roleCode`/comparações coerentes.

## 4. Matriz endpoint × auth × role × ownership (amostra representativa)

| Endpoint | Auth | Role | Ownership | Estado |
|---|---|---|---|---|
| `GET /payslips/my` | ✅ Jwt | qualquer | ✅ `getMyPayslips(user.id)` scoped | OK |
| `GET /payslips/my/:id` | ✅ Jwt | qualquer | ❌ guarda inerte (`=== 'EMPLOYEE'`) | 🔴 A3-1 |
| `GET /payslips/:id` | ✅ Jwt | ADMIN/RH | n/a (admin) | OK |
| `PATCH /payslips/my/:id/acknowledge` | ✅ Jwt | qualquer | ✅ `findOne(id,uid,'EMPLOYEE')` hardcoded | OK (por acaso) |
| `GET /work-declarations` | ✅ Jwt | qualquer | ❌ scoping inerte (objeto vs string) | 🔴 A3-2 |
| `GET /work-declarations/:id` | ✅ Jwt | qualquer | ❌ ownership inerte | 🔴 A3-2 |
| `GET /notifications/my/:id …` | ✅ Jwt | qualquer | ✅ `findFirst({id,userId})` | OK |
| `POST /notifications/send-all` | ✅ Jwt | ADMIN | n/a | OK |
| `GET /documents` | ✅ Jwt | qualquer | ⚠️ filtro por sensibilidade; INTERNAL visível a todos | 🟡 A3-4 |

> A matriz completa (202 rotas `:id` em 35 controllers) deve ser preenchida na
> fase de remediação; a amostra confirma o padrão de risco e as âncoras.

## 5. Plano de remediação proposto (não aplicado)

> Cada bloco segue `brainstorming → writing-plans → TDD → code review`. Ordem =
> ordem de risco.

### 5.1 🔴 Helper de ownership + fonte única de papel (fecha A3-1, A3-2, A3-3)

- Criar um utilitário reutilizável de autorização ao nível do dado, ex.
  `assertOwnershipOrRole(resource, { ownerId, userId, userRole, allow: [Role.ADMIN, Role.RH] })`,
  que lança `ForbiddenException` se o utilizador não é dono **nem** tem um papel
  permitido. Usar sempre o enum `Role` (nunca literais soltos como `'EMPLOYEE'`).
- Substituir todas as comparações `role === 'EMPLOYEE'` pelas verificações
  corretas: usar `user.role.name` (string) contra `Role.COLABORADOR`, ou melhor,
  passar sempre o mesmo tipo (nome do papel) do controller para o serviço —
  nunca o objeto role. Corrigir `work-declaration.controller` para passar
  `user.role?.name`, não `(user as any).role`.
- Preferir enforcement no `where` do Prisma (`findFirst({ where: { id, userId } })`)
  em vez de buscar por `id` e filtrar depois — fecha o IDOR na query.

### 5.2 🟠 Varredura completa das 202 rotas `:id` (fecha A3-3 restante)

- Preencher a matriz endpoint × ownership para todos os 35 controllers com rotas
  `:id`; para cada operação read/update/delete de recurso de utilizador,
  confirmar que o serviço filtra por `userId` (ou aplica o helper 5.1).
- Testes de regressão: para cada rota corrigida, um teste "colaborador A não
  acede ao recurso de B → 403/404".

### 5.3 🟡 Decisões de design (A3-4, A3-5, A3-6)

- Confirmar se documentos `INTERNAL` visíveis a todos os autenticados é
  intencional; se não, restringir por departamento/permissão.
- Auditar operações de escrita sem `@Roles` que dependem só de autenticação.
- Avaliar um `PermissionsGuard` que imponha a relação `permissions` do papel,
  para autorização fina além dos papéis.

## 6. Critérios de aceitação

- [ ] Nenhuma comparação de papel contra literais soltos (`grep "=== '.*'"` limpo nos serviços; usa `Role` enum ou `roleCode`).
- [ ] `GET /payslips/my/:id` e `GET/LIST /work-declarations` recusam (403/404) acesso ao recurso de outro colaborador — coberto por teste.
- [ ] Controllers passam ao serviço um tipo de papel consistente (nome string), nunca o objeto da relação.
- [ ] Matriz das 202 rotas `:id` preenchida; cada recurso de utilizador filtra por `userId` no `where`.
- [ ] Decisão registada sobre visibilidade de documentos `INTERNAL` e sobre guard de permissões.
