# Fase G3 — Consolidar PDI / `DevelopmentPlan` (fecha o buraco de auditoria de `talent-development.activatePlan`) — Plano de Implementação

> **Para agentes de execução:** SUB-SKILL OBRIGATÓRIA: `superpowers:subagent-driven-development` (recomendado) ou `superpowers:executing-plans`. Steps usam checkbox (`- [ ]`).
>
> **Coordenação:** executar **depois** da Fase G2 (que também toca `talent-development.service.ts`), sobre `main` já com G2 mergeada.

**Goal:** Existe **um único** fluxo de PDI sobre `DevelopmentPlan`: `DevelopmentPlansService`. `talent-development.activatePlan` deixa de fazer `DRAFT → ACTIVE` directo (sem `PdiApproval`) — passa pelo mesmo fluxo `DRAFT → PENDING_APPROVAL → ACTIVE` com registo em `PdiApproval`. As escritas de `DevelopmentPlan` em `talent-development` e `leader` passam a delegar. O buraco de auditoria (§2.3 item 9: "PDIs criados via `talent-development` nunca passam por aprovação nem deixam rasto em `PdiApproval`") fica fechado.

**Architecture:** `DevelopmentPlansService` (`src/development-plans/development-plans.service.ts`, `create` ~137, `submitForApproval` ~197, `approvePlan` ~210 com `PdiApproval`, `complete`/`cancel`/`addAction`/`addGoal`/`addCheckpoint`/`recalcPlanProgress`) é o canónico e já tem o fluxo completo. `TalentDevelopmentService` (escritas de `DevelopmentPlan` em ~345 create, ~466/507/523/560/1645 updates, `activatePlan` ~469) importa `DevelopmentPlansModule` e delega. `activatePlan` deixa de existir como transição directa — o handler `POST /talent-development/plans/:id/activate` passa a chamar `submitForApproval` **ou** `approvePlan` conforme a política (ver Task 1: se o plano já está `PENDING_APPROVAL` e o chamador é aprovador → `approvePlan`; se está `DRAFT` → `submitForApproval` e informa que precisa de aprovação). `LeaderService.approvePlan` (~766) delega em `DevelopmentPlansService.approvePlan` (elimina a 4ª cópia de `approvePlan` — memória "innova ownership-check gaps" + "innova development-plans bugs" registam 3 instâncias de IDOR em `approvePlan`; esta consolidação remove a divergência de raiz). `employees` (`LegacyPdi`) **não é tocado** (modelo legado isolado — §2.3 item 9; anotar). Rotas inalteradas; adaptador de forma onde necessário. Sem ciclo: `talent-development`/`leader` → `development-plans` → Prisma.

**Tech Stack:** NestJS, Prisma, Jest (unit + integração), `class-validator`.

**Spec:** `docs/arquitetura-modular-analise.md` (§2.3 item 9, §2.7 (ownership), §3–4 domínio 8, §5 item 2 (`PdiApprovalContract`), §11 item 4, §13 fase G) e `docs/arquitetura-modular.md` (Fases 3–5, 8).

## Global Constraints

- **Forma de resposta do frontend preservada** (§12). Rotas preservadas: todas as de `/development-plans/*`, `/talent-development/plans/*` (incl. `POST .../:id/activate`, `.../pause`, `.../complete`, `.../cancel`, `.../goals`, `.../actions`, `.../from-template/:templateId`), e a rota de aprovação de `/leader`. Adaptador de forma no ponto de delegação (chaves sempre presentes, extras toleradas).
- **Mudança de comportamento deliberada (é o objectivo da fase):** activar um PDI via `talent-development` passa a exigir o mesmo fluxo de aprovação (`PdiApproval`) que `development-plans`. Um plano em `DRAFT` que antes ia directo a `ACTIVE` passa agora a `PENDING_APPROVAL` — a resposta de `POST /talent-development/plans/:id/activate` indica esse estado. Confirmar com o dono do produto no PR (é uma alteração de UX subtil: "activar" pode agora significar "submeter para aprovação").
- **Ownership:** `DevelopmentPlansService.approvePlan` já tem (ou deve ter — memória "innova ownership-check gaps": `leader.service.approvePlan` **não** tinha verificação) a verificação de que o aprovador tem autoridade sobre o colaborador. A Task 2 confirma/reforça essa verificação **no canónico** e as Tasks 3–4 removem as cópias — o ownership passa a ser garantido num só sítio.
- **`DevelopmentPlan.status`** — confirmar o enum na Task 1 (`DRAFT`/`PENDING_APPROVAL`/`ACTIVE`/`COMPLETED`/`CANCELLED`/`PAUSED`?). As transições válidas são as de `DevelopmentPlansService` (fonte única).
- **`PdiApproval`** — o modelo de rasto de aprovação; toda a aprovação passa a criar uma linha aqui (hoje `talent-development` e parte de `leader` não o fazem).
- **Sem migração de dados** — mesmo modelo/tabela; planos já `ACTIVE` sem `PdiApproval` ficam como estão (não se retroactiva). Anotar no doc que o histórico pré-consolidação tem planos activos sem rasto de aprovação.
- `employees`/`LegacyPdi` — fora do âmbito.
- Coordenação com G2 (`talent-development.service.ts`) — G3 depois de G2 em `main`.
- `prettier`/`eslint`/`tsc` limpos; `format:check` do CI só `src/**`.
- Integração: lotes `development-plans`, `talent-development`, `leader` distintos.

---

## File Structure

**Modificados:**
- `src/development-plans/development-plans.service.ts` — se `talent-development`/`leader` precisarem de um comportamento que o canónico não expõe (ex.: activar+aprovar num passo para um ADMIN), adicionar um método explícito (ex.: `approveDirectly(id, approver, reason?)`) com o mesmo registo em `PdiApproval`; caso contrário, sem alteração de lógica, só possível reforço de ownership em `approvePlan`.
- `src/development-plans/development-plans.service.spec.ts` — cobrir o novo método/ownership.
- `src/talent-development/talent-development.module.ts` — `imports: [..., DevelopmentPlansModule]`.
- `src/talent-development/talent-development.service.ts` — `create`/updates de `DevelopmentPlan` e `activatePlan` delegam; remover `activatePlan` como transição directa.
- `src/talent-development/talent-development.controller.ts` — `POST .../:id/activate` passa a chamar `submitForApproval`/`approveDirectly` conforme a Task 1.
- `src/talent-development/talent-development.service.spec.ts` / `.controller.spec.ts` — adaptar.
- `src/leader/leader.module.ts` — `imports: [..., DevelopmentPlansModule]`.
- `src/leader/leader.service.ts` — `approvePlan` delega em `DevelopmentPlansService.approvePlan`.
- `src/leader/leader.service.spec.ts` — adaptar.
- `docs/arquitetura-modular-analise.md` — §2.3 item 9, §5 item 2, §2.7, §13 fase G (G3 feita).

---

### Task 1: Nota de mapeamento — fluxo canónico de PDI, as escritas de `talent-development`/`leader`, semântica de "activate"

**Files:** Create `docs/superpowers/plans/notes/fase-g3-pdi-map.md`

- [ ] **Step 1:** Ler `DevelopmentPlansService` inteiro (foco: `create`, `submitForApproval`, `approvePlan`, `complete`, `cancel`, `addAction`, `addGoal`, `addCheckpoint`, `recalcPlanProgress`, transições de estado). Ler `enum DevelopmentPlanStatus`, `model PdiApproval`, `model DevelopmentPlan`.
- [ ] **Step 2:** Ler todas as `this.prisma.developmentPlan.create/update` de `talent-development.service.ts` (linhas ~345, ~466, ~507, ~523, ~560, ~1645) e `activatePlan` (~469) — registar o que cada uma faz e o método canónico equivalente.
- [ ] **Step 3:** Ler `leader.service.ts:766` `approvePlan` — comparar com o canónico; registar o delta (o canónico tem ownership? qual a assinatura?).
- [ ] **Step 4:** **Decidir a semântica de `POST /talent-development/plans/:id/activate`:**
  - Se o plano está `DRAFT` → `submitForApproval(id, user)` (resposta indica `PENDING_APPROVAL`).
  - Se está `PENDING_APPROVAL` e `user` é aprovador com autoridade sobre o colaborador → `approvePlan({ planId: id, ... }, user)` (ou o novo `approveDirectly`).
  - Se `user` é ADMIN/RH → permitir `approveDirectly` a partir de `DRAFT`? (decisão do dono do produto — anotar). Recomendação: **não** — mesmo ADMIN passa por `submitForApproval` + `approvePlan` em 2 passos, para o rasto ficar completo.
- [ ] **Step 5:** Definir se é preciso `approveDirectly(id, approver, reason?)` no canónico (para o caso "aprovar sem submissão prévia explícita", se o produto o exigir) — com registo em `PdiApproval` na mesma.
- [ ] **Step 6: Commit da nota.**

---

### Task 2: `DevelopmentPlansService` — confirmar/reforçar ownership em `approvePlan` (+ `approveDirectly` se decidido na Task 1)

**Files:** Modify `src/development-plans/development-plans.service.ts`; Test `src/development-plans/development-plans.service.spec.ts`

- [ ] **Step 1: Teste que fixa o ownership no canónico (deve falhar se estiver em falta)**

```ts
it('approvePlan — aprovador sem autoridade sobre o colaborador → ForbiddenException', async () => {
  mockPrisma.developmentPlan.findUnique.mockResolvedValue({ id: 1, userId: 50, status: 'PENDING_APPROVAL' });
  // approver que não é gestor/RH/ADMIN do user 50
  await expect(service.approvePlan({ planId: 1 } as any, { id: 999, role: { name: 'GESTOR' } } as any))
    .rejects.toThrow(ForbiddenException);
});

it('approvePlan — sucesso cria linha em PdiApproval', async () => {
  mockPrisma.developmentPlan.findUnique.mockResolvedValue({ id: 1, userId: 50, status: 'PENDING_APPROVAL', managerId: 999 });
  mockPrisma.developmentPlan.update.mockResolvedValue({ id: 1, status: 'ACTIVE' });
  await service.approvePlan({ planId: 1 } as any, { id: 999, role: { name: 'GESTOR' } } as any);
  expect(mockPrisma.pdiApproval.create).toHaveBeenCalled();
});
```

- [ ] **Step 2: FAIL (se o ownership estiver ausente/fraco).**
- [ ] **Step 3: Implementar** — adicionar/reforçar a verificação de autoridade em `approvePlan` (usar o helper de scope de equipa se existir — §8 item 3; senão a verificação directa `plan.managerId === approver.id || approver.role.name in [ADMIN, RH]`). Se a Task 1 decidiu por `approveDirectly`, implementá-lo (chama internamente a mesma verificação + `PdiApproval.create` + transição).
- [ ] **Step 4: PASS** (`npx jest src/development-plans/`).
- [ ] **Step 5: prettier + tsc + commit.**

---

### Task 3: `talent-development` — `create`/updates/`activatePlan` delegam no fluxo canónico

**Files:** Modify `src/talent-development/talent-development.module.ts`, `talent-development.service.ts`, `talent-development.controller.ts`; Test os specs.

- [ ] **Step 1: Reescrever os testes afectados (devem falhar)** — mock de `DevelopmentPlansService`; `activatePlan`/o handler de activate deixa de fazer `update({ status: 'ACTIVE' })` directo. Exemplo:

```ts
it('POST /talent-development/plans/:id/activate com plano DRAFT → submitForApproval, resposta indica PENDING_APPROVAL', async () => {
  mockDP.findOne.mockResolvedValue({ id: 1, status: 'DRAFT' });
  mockDP.submitForApproval.mockResolvedValue({ id: 1, status: 'PENDING_APPROVAL' });
  const res = await controller.activate(1, mockUser);
  expect(mockDP.submitForApproval).toHaveBeenCalledWith(1, mockUser);
  expect(res.status).toBe('PENDING_APPROVAL');
});

it('activate NÃO faz mais um update directo para ACTIVE', async () => {
  mockDP.findOne.mockResolvedValue({ id: 1, status: 'DRAFT' });
  mockDP.submitForApproval.mockResolvedValue({ id: 1, status: 'PENDING_APPROVAL' });
  await controller.activate(1, mockUser);
  expect(mockPrisma.developmentPlan.update).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: FAIL.**
- [ ] **Step 3: Implementar** — `imports: [..., DevelopmentPlansModule]`; construtor `+ private readonly developmentPlans: DevelopmentPlansService`.
  - `create` (~345) → `this.developmentPlans.create(mappedDto)`.
  - updates de estado (~466, ~507, ~523, ~560) → os métodos canónicos correspondentes (`complete`/`cancel`/`pause`? — conforme a Task 1; se `pause` não existir no canónico, adicioná-lo lá com transição válida, TDD).
  - `activatePlan` (~469) → **remover**. O handler `activate` do controller passa a: `const plan = await this.developmentPlans.findOne(id); return plan.status === 'DRAFT' ? this.developmentPlans.submitForApproval(id, user) : this.developmentPlans.approvePlan({ planId: id }, user);` (conforme a decisão da Task 1 Step 4).
  - update (~1645) — identificar o contexto e delegar no método canónico adequado.
- [ ] **Step 4: PASS** (`npx jest src/talent-development/`).
- [ ] **Step 5: `grep -n "developmentPlan\.\(create\|update\)" src/talent-development/talent-development.service.ts`** → zero em código vivo.
- [ ] **Step 6: prettier + tsc + eslint + commit.**

---

### Task 4: `LeaderService.approvePlan` delega no canónico

**Files:** Modify `src/leader/leader.module.ts`, `src/leader/leader.service.ts`; Test `src/leader/leader.service.spec.ts`

- [ ] **Step 1: Reescrever o teste de `approvePlan` (deve falhar)** — mock de `DevelopmentPlansService`; delegação; o teste de ownership (memória "innova ownership-check gaps": qualquer LIDER/DIRECTOR aprovava PDI de qualquer equipa) passa a ser garantido pelo canónico — manter um teste aqui que confirma que um líder de outra equipa recebe `ForbiddenException` (agora vindo do canónico).
- [ ] **Step 2: FAIL.**
- [ ] **Step 3: Implementar** — `imports: [..., DevelopmentPlansModule]`; construtor `+ developmentPlans`; `approvePlan(planId, approver)` → `return this.developmentPlans.approvePlan({ planId }, approver);`. Remover o corpo (`developmentPlan.update` + `pdiApproval` local em ~780–794).
- [ ] **Step 4: PASS** (`npx jest src/leader/`).
- [ ] **Step 5: prettier + tsc + eslint + commit.**

---

### Task 5: Testes de integração — fluxo de aprovação unificado

**Files:** Modify `test/integration/talent-development/*.integration-spec.ts`, `test/integration/leader/*.integration-spec.ts`, `test/integration/development-plans/*.integration-spec.ts`

- [ ] **Step 1: `talent-development` — activate agora exige aprovação**

```ts
it('POST /talent-development/plans/:id/activate (plano DRAFT) → 200/201 com status PENDING_APPROVAL, cria 0 PdiApproval ainda', async () => { /* ... */ });
it('depois, aprovador com autoridade → POST activate/aprovar → status ACTIVE + 1 linha PdiApproval', async () => { /* ... */ });
it('aprovador SEM autoridade sobre o colaborador → 403', async () => { /* ... */ });
```

- [ ] **Step 2: `leader` — o teste que fixava o gap de ownership (`leader.service.approvePlan` sem verificação) passa a devolver 403.**
- [ ] **Step 3: `development-plans` — specs existentes continuam verdes.**
- [ ] **Step 4: prettier + commit.**

---

### Task 6: Verificação completa + doc

- [ ] **Step 1:** `npx jest src/development-plans src/talent-development src/leader` ; `npm test`.
- [ ] **Step 2:** integração dos lotes `development-plans`, `talent-development`, `leader`.
- [ ] **Step 3:** `npx prettier --check "src/**/*.ts"` ; `npx eslint src/development-plans src/talent-development src/leader --config eslint.config.staged.mjs` ; `npx tsc --noEmit`.
- [ ] **Step 4:** `grep -rn "developmentPlan\.\(create\|update\)\|pdiApproval\.create" src/talent-development src/leader` → zero em código vivo (só `development-plans`).
- [ ] **Step 5:** Actualizar `docs/arquitetura-modular-analise.md`:
  - §2.3 item 9: nota "PDI tem um só fluxo (`DevelopmentPlansService`); `talent-development.activatePlan` e `leader.approvePlan` delegam; toda a aprovação regista `PdiApproval` — G3 2026-09-05. Planos activados antes desta data não têm rasto retroactivo. `employees`/`LegacyPdi` continua isolado.".
  - §5 item 2 (`PdiApprovalContract`): `— **feito** (G3): o "contrato" é a delegação em `DevelopmentPlansService.submitForApproval`/`approvePlan`.`
  - §2.7 / §8 item 3: nota de que o ownership de `approvePlan` está agora num só sítio.
  - §13 linha G: marcar G3.
- [ ] **Step 6: Commit.**

---

### Task 7: PR e CI

- [ ] Branch `fix/pdi-development-plan-consolidation` + push (sobre `main` com G2 mergeada).
- [ ] PR — corpo: **mudança de comportamento** (activar PDI via `talent-development` passa a exigir aprovação — pode alterar UX de "activar"; confirmar com o dono do produto); ownership de `approvePlan` unificado (fecha o gap do `leader`); sem migração de dados (planos activos antigos sem `PdiApproval` ficam como estão); **verificação do frontend** para o ecrã de "activar plano" de `talent-development`.
- [ ] Aguardar `quality` verde → `gh pr merge --squash --auto`.

---

## Self-Review

**1. Cobertura da spec (§2.3 item 9 + §5 item 2 + §11 item 4 + §13 fase G):**
- "`development-plans` (fluxo com `PdiApproval`) vs `talent-development.activatePlan` (directo, sem `PdiApproval`)" → Task 3 (activate passa pelo fluxo canónico). ✔
- "buraco de auditoria" → fechado: toda a aprovação cria `PdiApproval` (Tasks 2–4). ✔
- "3ª/4ª instância de IDOR em `approvePlan`" (memória) → ownership num só sítio (Task 2), cópias removidas (Tasks 3–4). ✔
- §5 item 2 `PdiApprovalContract` → a delegação é o contrato. ✔
- `employees`/`LegacyPdi` fora do âmbito (§2.3 item 9 trata-o como isolado) — anotado. ✔

**2. Placeholders:** a semântica de "activate" é decidida na Task 1 Step 4 com uma recomendação concreta e a nota de que é decisão do dono do produto (ratificada no PR). O método `pause`/`approveDirectly` só se cria se a Task 1 o exigir, com TDD. Sem "TODO" sem critério.

**3. Consistência de tipos:** `DevelopmentPlansService.create(dto)`, `.findOne(id, user?)`, `.submitForApproval(id, user)`, `.approvePlan({ planId }, approver)`, `.complete(id)`, `.cancel(id, reason?)` — assinaturas confirmadas no method list; usadas nas Tasks 3–4. `approvePlan` recebe `{ planId }` (DTO) + `approver` (CurrentUserData) — consistente entre Task 2 (teste), Task 3 (talent-dev), Task 4 (leader). ✔

**4. Riscos anotados:** mudança de UX de "activate" (PR + dono do produto); planos activos pré-consolidação sem `PdiApproval` (não retroactivo, anotado no doc); coordenação com G2 (mesmo ficheiro); ownership agora central — se o helper de scope de equipa (§8 item 3) não existir, verificação directa. Sem ciclo de módulos.
