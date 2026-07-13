# Varredura Dirigida A-3 — Alvos de Ownership

> Executada em 2026-07-13 sobre os candidatos do spec §4: `leave-management`,
> `attendance`, `career-plans`, `evaluation360`.
> Método: `git grep` de literais de papel + leitura de rotas `:id` sem `userId` no where.

---

## Módulos com buraco confirmado

### 1. `career-plans` — `GET /career-plans/:id`

**Ficheiro:** `src/career-plans/career-plans.service.ts:281`

```ts
async findOne(id: number) {
  const plan = await this.prisma.read.userCareerPlan.findUnique({ where: { id }, ... });
  if (!plan) throw new NotFoundException(...);
  return { ...plan, readiness };
}
```

**Rota:** `GET /career-plans/:id` (sem `@Roles` → todo o utilizador autenticado)
**ownerField:** `UserCareerPlan.userId`
**Risco:** colaborador B lê o plano de carreira do colaborador A.
**Fix:** após `findUnique`, inserir `assertCanAccess(plan, plan.userId, user, [Role.ADMIN, Role.RH, Role.GESTOR])`. Controller passa `user`.

---

### 2. `career-plans` — `PATCH /career-plans/goals/:goalId/progress`

**Ficheiro:** `src/career-plans/career-plans.service.ts:390`

```ts
async updateGoalProgress(goalId: number, dto: UpdateGoalProgressDto, userId: number) {
  const goal = await this.prisma.read.careerGoal.findUnique({ where: { id: goalId } });
  if (!goal) throw new NotFoundException(...);
  return this.prisma.careerGoal.update({ where: { id: goalId }, data: {...} });
}
```

**Rota:** `PATCH /career-plans/goals/:goalId/progress` (sem `@Roles`)
**ownerField:** `CareerGoal.careerPlanId → UserCareerPlan.userId` (relação indireta)
**Risco:** colaborador B atualiza o progresso de uma meta do colaborador A.
**Fix:** incluir `careerPlan: { select: { userId: true } }` no `findUnique`, depois `assertCanAccess(goal, goal.careerPlan.userId, user, [Role.ADMIN, Role.RH, Role.GESTOR])`. Controller passa o objeto `user` em vez de `user.id`.

---

### 3. `leave-management` — `GET /leave-management/:id`

**Ficheiro:** `src/leave-management/leave-management.service.ts:191`

```ts
async findOne(id: number) {
  const r = await this.prisma.read.leaveRequest.findUnique({ where: { id }, ... });
  if (!r) throw new NotFoundException(...);
  return r;
}
```

**Rota:** `GET /leave-management/:id` (sem `@Roles` → todo o utilizador autenticado)
**ownerField:** `leaveRequest.userId`
**Risco:** colaborador B lê o pedido de licença do colaborador A (inclui dados médicos/pessoais).
**Fix:** após `findUnique`, inserir `assertCanAccess(r, r.userId, user, [Role.ADMIN, Role.RH, Role.GESTOR])`. Controller passa `user`.

---

## Módulos sem buraco

### `attendance`

- `attendanceRecord.findUnique` (linha 176) — chamada interna, `userId` é propagado da sessão.
- `reviewLeave` (linha 422) — ação de gestor/RH por design; `reviewerId` não precisa de coincidir com `leave.userId`.
- `findByUser`, `clockIn`, `clockOut`, `createJustification` — todos recebem e filtram por `userId`.
- **Resultado:** sem IDOR confirmado.

### `evaluation360`

- `competency.findUnique` (linha 94) — recurso global (configuração), não pertence a nenhum utilizador.
- `evaluationCycle.findUnique` (linhas 255, 528, 653, 1185) — config de ciclo; acesso restrito a ADMIN/RH via `@Roles`.
- `evaluatorAssignment.findUnique` (linha 466) — chamada interna em loop pós-aprovação administrativa.
- `evaluationResult.findUnique` (linha 925, 1126) — resultados ligados a `cycleId`/`userId` em queries já filtradas.
- Sem comparação de papel por literal.
- **Resultado:** sem IDOR confirmado.

### `leave-management` — acções de escrita

- `cancel` (linha 425): `if (request.userId !== userId)` — **já tem** verificação de ownership (passa). Nota: usa comparação directa em vez do helper; comportamento correto, mas não usa o padrão A-3 (não tocar — o buraco é só no `findOne` de leitura).

---

## Plano de remediação (Task 7)

Para cada alvo, aplicar a receita validada nas PRs 1-2:

| Módulo | Método | Tipo de fix |
|---|---|---|
| career-plans | `findOne(id, user)` | `assertCanAccess(plan, plan.userId, user, [...])` |
| career-plans | `updateGoalProgress(goalId, dto, user)` | include careerPlan + `assertCanAccess` |
| leave-management | `findOne(id, user)` | `assertCanAccess(r, r.userId, user, [...])` |
