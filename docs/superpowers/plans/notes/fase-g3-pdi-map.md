# Fase G3 — Nota de mapeamento: PDI / `DevelopmentPlan` → `DevelopmentPlansService`

> Task 1 do plano `docs/superpowers/plans/2026-09-05-fase-g3-pdi-development-plan-consolidation.md`.
> Data: 2026-09-06.

## Fluxo canónico (`DevelopmentPlansService`, `src/development-plans/`)

`enum PlanStatus`: `DRAFT | PENDING_APPROVAL | ACTIVE | PAUSED | COMPLETED | CANCELLED | OVERDUE`
`model DevelopmentPlan`: `userId`, `managerId Int?`, `status PlanStatus @default(DRAFT)`, relações
`actions`/`goals`/`checkpoints`/`approvals`.
`model PdiApproval`: `planId`, `approverId`, `decision ApprovalDecision`, `comment?`.

| método | assinatura | transição | notas |
|---|---|---|---|
| `create` | `create(dto: CreateDevelopmentPlanDto)` | → `DRAFT` | notifica `PDI_CREATED` |
| `update` | `update(id, dto: UpdateDevelopmentPlanDto)` | — | `findOne(id)` (sem user) |
| `findOne` | `findOne(id, user?)` | — | com `user` → `assertCanAccess(plan, plan.userId, user, [ADMIN,RH,GESTOR])` |
| `submitForApproval` | `submitForApproval(id, user: CurrentUserData)` | `DRAFT → PENDING_APPROVAL` | `findOne(id, user)` (ownership); erro se `status != DRAFT` |
| `approvePlan` | `approvePlan(dto: ApprovePlanDto {planId, decision:'approve'\|'reject', comment?}, approver)` | `PENDING_APPROVAL → ACTIVE` (approve) ou `→ DRAFT` (reject) | **ownership já presente**: `assertCanAccess(plan, plan.managerId, approver, [ADMIN,RH])`; **cria `PdiApproval`**; erro se `status != PENDING_APPROVAL`; `activatedAt` no approve; notifica `PDI_APPROVED`/`PDI_REJECTED` |
| `complete` | `complete(id)` | `ACTIVE\|PENDING_APPROVAL → COMPLETED` | **+300 XP flat** + **emite `Certificate` (type DEVELOPMENT)** + notifica `PDI_COMPLETED` |
| `cancel` | `cancel(id, reason?)` | `→ CANCELLED` | `cancelReason` |
| `remove` | `remove(id)` | delete | bloqueia se `ACTIVE` |
| **(não existe)** | `pause` | — | canónico **não tem** transição para `PAUSED` |

## `talent-development.service.ts` — 2º fluxo de PDI (linhas confirmadas)

| método (linha) | prisma call | equivalente canónico | delta |
|---|---|---|---|
| `createPlan` (`:345`) | `developmentPlan.create` (status DRAFT, `overallProgress: 0`) | `create` | valida `user` existe (404 `Colaborador não encontrado`); canónico não valida — manter a validação no wrapper OU aceitar. `overallProgress` não é escrito pelo canónico (default do schema) |
| `createFromTemplate` (`:580`) | chama `this.createPlan` internamente | — | herda a delegação de `createPlan` de graça; clona actions/goals à parte (fica) |
| `updatePlan` (`:459`) | `developmentPlan.update` (`:466`) | `update` | idêntico (conversão de datas) |
| `activatePlan` (`:473`) | `developmentPlan.update` (`:475`) `status:'ACTIVE'` **directo, sem `PdiApproval`** | **fluxo canónico** — ver DECISÃO 1 | **buraco de auditoria** (§2.3 item 9). Valida `actions.length > 0`; rejeita se já `ACTIVE`. Notifica `DEVELOPMENT_PLAN_ACTIVATED` |
| `pausePlan` (`:504`) | `developmentPlan.update` (`:507`) `status:'PAUSED'` + nota `[PAUSA data] reason` | **novo `pause(id, reason?)` no canónico** (TDD) | só de `ACTIVE` |
| `completePlan` (`:529`) | `developmentPlan.update` (`:530`) `status:'COMPLETED'`, `overallProgress:100` + **XP = soma de `action.xpReward`**, **sem certificado** | `complete` — ver DECISÃO 2 | **divergência real**: canónico dá 300 XP flat + certificado; talent-dev soma XP das acções, sem certificado |
| `cancelPlan` (`:558`) | `developmentPlan.update` (`:560`) `status:'CANCELLED'`, `cancelReason` | `cancel` | idêntico |
| `recalculatePlanProgress` (privado, `:1643`) | `developmentPlan.update` (`:1645`) `overallProgress` + pode flippar para `COMPLETED` se todas as acções `COMPLETED` | interno — **fica** (recalc de progresso; não é uma transição de lifecycle iniciada por rota) | anotar que este caminho pode pôr `COMPLETED` sem passar por `complete` (sem certificado/XP) — pré-existente, fora do âmbito de G3 |

Rota: `POST /talent-development/plans/:id/activate` → `talent-development.controller.ts:153` (`@Roles(...MGMT_ROLES)`).

## `leader.service.ts` — 4ª cópia de `approvePlan` (`:766`)

| aspecto | `leader.approvePlan(planId, approver)` | canónico `approvePlan({planId, decision}, approver)` |
|---|---|---|
| guard | `findUnique` → 404 `PDI não encontrado` | `findOne` → `NotFoundException` |
| ownership | **presente** (já corrigido desde a memória): `existing.user?.managerId === approver.id` OU `isPrivileged([ADMIN,RH])` → senão 404 | `assertCanAccess(plan, plan.managerId, approver, [ADMIN,RH])` |
| chave de ownership | `plan.user.managerId` (gestor **do colaborador**) | `plan.managerId` (gestor **designado no plano**) — **subtil divergência** |
| status check | **nenhum** — força `ACTIVE` de qualquer estado | exige `status === 'PENDING_APPROVAL'` |
| `PdiApproval` | cria (best-effort `.catch`, `decision: 'APPROVE'`, sem comment) | cria (não best-effort) |
| notificação | `PDI_APPROVED` | `PDI_APPROVED`/`PDI_REJECTED` |
| decisão | só aprova (não há reject) | `approve` \| `reject` |

Rota: `PATCH /leader/plans/:planId/approve` → `leader.controller.ts:166` (`@Roles(...ALL_MGMT)`).

Ao delegar: `leader.approvePlan(planId, approver)` → `this.developmentPlans.approvePlan({ planId,
decision: 'approve' }, approver)`. **Mudança de comportamento**: passa a exigir `status ===
PENDING_APPROVAL` (deixa de forçar `ACTIVE` a partir de `DRAFT`); a chave de ownership passa a
`plan.managerId`. Ambas anotar no PR — são a razão de ser da consolidação (um só sítio).

## `employees` / `LegacyPdi`

Fora do âmbito (§2.3 item 9 — modelo legado isolado). Não é tocado.

## DECISÕES DE PRODUTO (dono do produto, 2026-09-06)

### DECISÃO 1 — semântica de `POST /talent-development/plans/:id/activate` → **Opção A (dois passos)**

O handler `activate` passa a:
```ts
const plan = await this.developmentPlans.findOne(id);
return plan.status === 'DRAFT'
  ? this.developmentPlans.submitForApproval(id, user)      // → PENDING_APPROVAL
  : this.developmentPlans.approvePlan({ planId: id, decision: 'approve' }, user); // PENDING_APPROVAL → ACTIVE
```
"Activar" um PDI em `DRAFT` passa a significar "submeter para aprovação" (resposta indica
`PENDING_APPROVAL`). Mesmo ADMIN/RH fazem 2 passos. `talent-development.activatePlan` é **removido**
como transição directa; a validação "≥1 acção" move-se para o handler antes de `submitForApproval`
(ou perde-se — confirmar no PR; recomendação: manter no handler). Sem `approveDirectly` no canónico.

### DECISÃO 2 — `complete` divergente → **Opção A (canónico ganha)**

`talent-development.completePlan` passa a delegar em `DevelopmentPlansService.complete(id)` →
**+300 XP flat + emite `Certificate` (type DEVELOPMENT)**. Deixa de somar `action.xpReward` e passa
a emitir certificado. `overallProgress: 100` — o canónico não o escreve; adicionar ao `complete`
canónico (campo existe no schema, escrita barata) para não regredir o ecrã de progresso.

## Plano de execução ajustado

- **Task 2** (ownership em `approvePlan`): o canónico **já tem** `assertCanAccess(plan, plan.managerId,
  approver, [ADMIN,RH])` + cria `PdiApproval` + exige `PENDING_APPROVAL`. Só falta um teste que o fixe.
  Adicionar `overallProgress: 100` ao `complete` canónico (Decisão 2).
- **Task 2b** (novo): `DevelopmentPlansService.pause(id, reason?)` — `ACTIVE → PAUSED` + nota
  `[PAUSA data] reason` (portado de `talent-development.pausePlan`), TDD.
- **Task 3** (`talent-development`): `createPlan`/`updatePlan`/`completePlan`/`cancelPlan`/`pausePlan`
  delegam; `activatePlan` **removido** (handler passa a `submitForApproval`/`approvePlan`);
  `recalculatePlanProgress` fica (interno). `createFromTemplate` herda de `createPlan`.
- **Task 4** (`leader`): `approvePlan(planId, approver)` → `developmentPlans.approvePlan({ planId,
  decision: 'approve' }, approver)`. Mudança de comportamento: exige `PENDING_APPROVAL`, ownership
  passa a `plan.managerId`.
