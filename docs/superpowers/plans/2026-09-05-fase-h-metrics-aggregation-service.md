# Fase H — `MetricsAggregationService` para Dashboards/Relatórios — Plano de Implementação

> **Para agentes de execução:** SUB-SKILL OBRIGATÓRIA: `superpowers:subagent-driven-development` (recomendado) ou `superpowers:executing-plans`. Steps usam checkbox (`- [ ]`).

**Goal:** Existe **uma camada de leitura única** (`MetricsAggregationService`) com a implementação canónica de headcount, turnover, ROI de formação, alertas e "manager dashboard". `dashboard`, `dashboard-rh`, `reports`, `analytics` e `roi-impact` deixam de recalcular cada um a sua versão — passam a consumir esta camada. O utilizador deixa de ver números diferentes consoante o ecrã.

**Architecture:** Novo `src/metrics-aggregation/` (`MetricsAggregationModule`, `MetricsAggregationService`) — **só leitura**, usa `this.prisma.read.*` (réplica). Métodos canónicos: `headcount(filters)`, `headcountTrend(months)`, `turnover(filters)`, `trainingRoi(filters)`, `alerts(context)`, `managerDashboard(managerId)`. Cada um tem **uma** fórmula, escolhida na Task 1 a partir das 2–4 variantes existentes. Os 5 módulos consumidores importam `MetricsAggregationModule` e substituem os seus cálculos locais por chamadas ao serviço, mantendo os seus próprios endpoints e **adaptando a forma de resposta** (cada ecrã pode expor um subconjunto/embrulho diferente do mesmo número). **Nenhuma escrita muda** — `DashboardSnapshot` continua a ser escrito onde é hoje (a divergência de fórmula de escrita do snapshot é anotada como follow-up, fora do âmbito desta fase de leitura). Sem ciclo: os 5 módulos → `metrics-aggregation` → Prisma.

**Tech Stack:** NestJS, Prisma, Jest (unit + integração), `class-validator`.

**Spec:** `docs/arquitetura-modular-analise.md` (§2.3 item 15, §2.5, §3–4 domínio 10, §5 item 6, §13 fase H) e `docs/arquitetura-modular.md` (Fases 3–5).

## Global Constraints

- **Forma de resposta do frontend preservada** (§12). Todos os endpoints de `dashboard`/`dashboard-rh`/`reports`/`analytics`/`roi-impact` mantêm rota/verbo/forma. Só muda a **origem** dos números (de cálculo local para `MetricsAggregationService`) e, possivelmente, o **valor** (quando as variantes divergiam). Cada consumidor embrulha o resultado canónico na sua forma histórica (adaptador local).
- **Mudança de valor deliberada (é o objectivo):** onde headcount/turnover/ROI/alertas divergiam entre ecrãs, todos passam a mostrar o valor canónico. A Task 1 documenta cada variante e a escolha; o PR pede ratificação do dono do produto para os deltas de valor.
- **Só leitura.** `MetricsAggregationService` **não** tem `create`/`update`/`delete` e usa sempre `this.prisma.read.*`. Escrita de `DashboardSnapshot` **não** é tocada (follow-up anotado).
- **Fórmulas canónicas a fixar na Task 1** (candidatas — a mais completa/correcta de cada):
  - `headcount`: "colaboradores `active = true`" com filtros por `departmentId`/`unitId`/`positionId`/data. Escolher a que já respeita `active` e permite o filtro por departamento (provavelmente `dashboard-rh.getHeadcountPanel`).
  - `turnover`: `saídas no período / headcount médio do período`. Fixar a janela (12 meses? configurável) e o que conta como "saída" (`User.active` flag transitando para false? `terminationDate`? — confirmar o campo real).
  - `trainingRoi`: escolher **uma** metodologia (as 2 divergem — `roi-impact` vs. um outro; documentar ambas, escolher, anotar a fórmula exacta no código).
  - `alerts`: unir as 4 fontes num só catálogo de regras (`buildManagerAlerts` de `dashboard`, `getAlerts` de `dashboard-rh`, `getRiskAlerts` de `analytics`, + a 4ª) — `alerts(context)` devolve a lista completa; cada ecrã filtra o subconjunto que mostrava.
  - `managerDashboard`: unificar as 2 implementações de `getManagerDashboard`.
- **`tenantId`** — os modelos centrais de dashboard (`User`/`Enrollment`/`Course`/...) não têm `tenantId` (§2.6); single-tenant (§7) — agregação global, sem filtro de tenant.
- Sem migração de dados.
- `prettier`/`eslint`/`tsc` limpos; `format:check` do CI só `src/**`.
- Integração: lotes `dashboard`, `dashboard-rh`, `reports`, `analytics`, `roi-impact` distintos (o novo `metrics-aggregation` terá o seu).

---

## File Structure

**Novos:**
- `src/metrics-aggregation/metrics-aggregation.module.ts` — exporta `MetricsAggregationService`.
- `src/metrics-aggregation/metrics-aggregation.service.ts` — os 6 métodos canónicos.
- `src/metrics-aggregation/metrics-aggregation.service.spec.ts`.
- `src/metrics-aggregation/metrics.types.ts` — DTOs de filtro + shapes de retorno canónicos (`HeadcountResult`, `TurnoverResult`, `TrainingRoiResult`, `MetricAlert`, `ManagerDashboardResult`).

**Modificados (por consumidor):**
- `src/dashboard/dashboard.module.ts` + `dashboard.service.ts` (+ spec) — `getAlerts`/`buildManagerAlerts`/`getManagerDashboard` delegam.
- `src/dashboard-rh/dashboard-rh.module.ts` + `dashboard-rh.service.ts` (+ spec) — `getHeadcountPanel`/`getHeadcountTrend`/`getTurnoverPanel`/`getAlerts` delegam.
- `src/reports/reports.module.ts` + `reports.service.ts` (+ spec) — `headcountReport`/`turnoverReport` delegam (mantendo a montagem do relatório/CSV/XLSX à volta do número canónico).
- `src/analytics/analytics.module.ts` + `analytics.service.ts` (+ spec) — `getRiskAlerts` delega.
- `src/roi-impact/roi-impact.module.ts` + `roi-impact.service.ts` (+ spec) — o cálculo de ROI de formação delega.
- `docs/arquitetura-modular-analise.md` — §2.3 item 15, §5 item 6, §13 fase H.

---

### Task 1: Nota de comparação — as 2–4 variantes de cada métrica + escolha canónica

**Files:** Create `docs/superpowers/plans/notes/fase-h-metrics-variants.md`

- [ ] **Step 1: headcount** — ler `dashboard-rh.getHeadcountPanel` (~235), `dashboard-rh.getHeadcountTrend` (~294), `reports.headcountReport` (~74), e qualquer contagem ad-hoc noutros (`grep -rn "user.count" src/dashboard src/analytics src/executive-reports`). Registar: filtros suportados, definição de "activo", janela temporal. **Escolher** a canónica + escrever a fórmula exacta.
- [ ] **Step 2: turnover** — `dashboard-rh.getTurnoverPanel` (~313), `reports.turnoverReport` (~132), `dashboard-rh.buildTurnoverInsights`/`reports.buildTurnoverInsights` (duas cópias). Registar: numerador (o que conta como saída — confirmar campo em `User`), denominador (headcount médio vs. inicial vs. final), janela. **Escolher** + fórmula exacta.
- [ ] **Step 3: trainingRoi** — localizar as 2 implementações (`roi-impact.service.ts` + a outra — `grep -rn "roi\|ROI\|retorno" src/roi-impact src/dashboard-rh src/executive-reports src/reports`). Documentar as 2 metodologias. **Escolher** + fórmula exacta (custo de formação, ganho estimado, período).
- [ ] **Step 4: alerts** — `dashboard.buildManagerAlerts` (~1021) + `dashboard.getAlerts` (~789), `dashboard-rh.getAlerts` (~976), `analytics.getRiskAlerts` (~598), + a 4ª (`grep -rn "alert\|alerta" src/executive-reports src/history`). Listar cada regra de alerta (condição + severidade + mensagem). **Unir** num catálogo; para cada ecrã, registar que subconjunto mostrava.
- [ ] **Step 5: managerDashboard** — as 2 implementações de `getManagerDashboard` (`grep -rn "getManagerDashboard\|managerDashboard" src/`). Comparar campos devolvidos. **Unificar** o shape (superconjunto).
- [ ] **Step 6:** Definir as assinaturas e os shapes de retorno canónicos em `metrics.types.ts` (para a Task 2).
- [ ] **Step 7: Commit da nota.**

---

### Task 2: `MetricsAggregationService` — `headcount` + `headcountTrend`

**Files:** Create `src/metrics-aggregation/*` (module, service, types, spec)

**Interfaces:**
- `headcount(filters: { departmentId?; unitId?; positionId?; asOf?: Date }): Promise<HeadcountResult>` — `{ total, byDepartment?, byPosition?, asOf }` (conforme a Task 1).
- `headcountTrend(months: number, filters?): Promise<Array<{ month: string; total: number }>>`.

- [ ] **Step 1: Testes (devem falhar)** — cobrir: total só conta `active = true`; filtro por `departmentId`; `asOf` (contagem histórica se aplicável); trend devolve N meses.
- [ ] **Step 2: FAIL → implementar** com a fórmula canónica da Task 1 Step 1/2, sempre `this.prisma.read.*`. Criar `metrics-aggregation.module.ts` + `metrics.types.ts`.
- [ ] **Step 3: PASS + tsc + prettier + commit.**

---

### Task 3: `MetricsAggregationService` — `turnover`

**Files:** Modify `src/metrics-aggregation/metrics-aggregation.service.ts` (+ spec)

**Interfaces:** `turnover(filters: { from?: Date; to?: Date; departmentId? }): Promise<TurnoverResult>` — `{ rate, leavers, avgHeadcount, window }` + `insights: string[]` (a lógica de `buildTurnoverInsights`, portada uma vez).

- [ ] **Step 1: Testes (devem falhar)** — `rate = leavers / avgHeadcount`; janela por omissão (12 meses); `insights` gerados.
- [ ] **Step 2: FAIL → implementar** (fórmula da Task 1 Step 2; portar `buildTurnoverInsights` — uma cópia só).
- [ ] **Step 3: PASS + tsc + prettier + commit.**

---

### Task 4: `MetricsAggregationService` — `trainingRoi`

**Files:** Modify `src/metrics-aggregation/metrics-aggregation.service.ts` (+ spec)

**Interfaces:** `trainingRoi(filters: { from?: Date; to?: Date; departmentId?; courseId? }): Promise<TrainingRoiResult>` — `{ investment, estimatedReturn, roiPercent, methodology: string }` (a `methodology` é uma string constante a documentar a fórmula escolhida).

- [ ] **Step 1: Testes (devem falhar)** — `roiPercent = (estimatedReturn - investment) / investment * 100`; inputs zero → guard (roi 0, não `NaN`/`Infinity`).
- [ ] **Step 2: FAIL → implementar** (metodologia escolhida na Task 1 Step 3).
- [ ] **Step 3: PASS + tsc + prettier + commit.**

---

### Task 5: `MetricsAggregationService` — `alerts` + `managerDashboard`

**Files:** Modify `src/metrics-aggregation/metrics-aggregation.service.ts` (+ spec)

**Interfaces:**
- `alerts(context: { userId: number; roleCode?: string; managerId?: number; departmentId?: number }): Promise<MetricAlert[]>` — `MetricAlert = { key: string; severity: 'INFO'|'WARNING'|'CRITICAL'; title: string; message: string; entity?: { type: string; id: number } }`. Devolve **todas** as regras aplicáveis ao contexto; os consumidores filtram.
- `managerDashboard(managerId: number): Promise<ManagerDashboardResult>` — shape superconjunto da Task 1 Step 5.

- [ ] **Step 1: Testes (devem falhar)** — cada regra de alerta do catálogo (Task 1 Step 4) tem um teste que a dispara e um que não; `managerDashboard` devolve todos os campos do superconjunto.
- [ ] **Step 2: FAIL → implementar** — portar cada regra das 4 fontes para uma função pura `evaluateRule_*(data)`; `alerts` compõe. `managerDashboard` compõe as leituras das 2 implementações antigas.
- [ ] **Step 3: PASS + tsc + prettier + commit.**

---

### Task 6: `dashboard-rh` consome a camada (headcount, turnover, alerts)

**Files:** Modify `src/dashboard-rh/dashboard-rh.module.ts`, `dashboard-rh.service.ts`; Test o spec.

- [ ] **Step 1: Reescrever os testes de `getHeadcountPanel`/`getHeadcountTrend`/`getTurnoverPanel`/`getAlerts` (devem falhar)** — mock de `MetricsAggregationService`; cada método delega e embrulha na forma histórica.
- [ ] **Step 2: FAIL.**
- [ ] **Step 3: Implementar** — `imports: [..., MetricsAggregationModule]`; construtor `+ metrics`; `getHeadcountPanel(deptId)` → `const r = await this.metrics.headcount({ departmentId: deptId }); return <forma histórica>(r);` (idem trend/turnover/alerts — `getAlerts()` → `this.metrics.alerts({ userId: ..., roleCode: 'RH' })` filtrado ao subconjunto que `dashboard-rh` mostrava). Remover os cálculos locais e as cópias de `buildTurnoverInsights`.
- [ ] **Step 4: PASS + `grep` de que os cálculos locais saíram + prettier + tsc + eslint + commit.**

---

### Task 7: `dashboard` consome a camada (alerts, managerDashboard)

**Files:** Modify `src/dashboard/dashboard.module.ts`, `dashboard.service.ts`; Test o spec.

- [ ] **Step 1: Reescrever os testes de `getAlerts`/`buildManagerAlerts`/`getManagerDashboard` (devem falhar)** — delegação + embrulho.
- [ ] **Step 2: FAIL.**
- [ ] **Step 3: Implementar** — `imports: [..., MetricsAggregationModule]`; `getAlerts(userId, roleCode)` → `this.metrics.alerts({ userId, roleCode })` filtrado; `getManagerDashboard(managerId)` → `this.metrics.managerDashboard(managerId)` embrulhado. Remover `buildManagerAlerts` local.
- [ ] **Step 4: PASS + prettier + tsc + eslint + commit.**

---

### Task 8: `reports`, `analytics`, `roi-impact` consomem a camada

**Files:** Modify os 3 módulos + serviços + specs.

- [ ] **Step 1: `reports`** — `headcountReport`/`turnoverReport` delegam em `metrics.headcount`/`metrics.turnover` e montam o relatório (CSV/XLSX/PDF) à volta do número canónico. Remover a 2ª cópia de `buildTurnoverInsights`. TDD.
- [ ] **Step 2: `analytics`** — `getRiskAlerts(filters)` → `this.metrics.alerts({ ...contexto })` filtrado às regras de risco. TDD.
- [ ] **Step 3: `roi-impact`** — o cálculo de ROI de formação → `this.metrics.trainingRoi(filters)` embrulhado. TDD.
- [ ] **Step 4: PASS (`npx jest src/reports src/analytics src/roi-impact`) + prettier + tsc + eslint + commit** (um commit por módulo, ou um só — à escolha do executor).

---

### Task 9: Verificação completa + doc

- [ ] **Step 1:** `npx jest src/metrics-aggregation src/dashboard src/dashboard-rh src/reports src/analytics src/roi-impact` ; `npm test`.
- [ ] **Step 2:** integração dos lotes dos 5 consumidores.
- [ ] **Step 3:** `npx prettier --check "src/**/*.ts"` ; `npx eslint src/metrics-aggregation src/dashboard src/dashboard-rh src/reports src/analytics src/roi-impact --config eslint.config.staged.mjs` ; `npx tsc --noEmit`.
- [ ] **Step 4: `grep`** — `grep -rn "buildTurnoverInsights" src/` deve dar **1** hit (só em `metrics-aggregation`).
- [ ] **Step 5:** Actualizar `docs/arquitetura-modular-analise.md`:
  - §2.3 item 15: nota "headcount/turnover/ROI/alertas/managerDashboard têm agora uma fonte de leitura única (`MetricsAggregationService`); os 5 módulos de dashboard/relatórios consomem-na — H 2026-09-05. Escrita de `DashboardSnapshot` (fórmulas divergentes entre 2 módulos) fica como follow-up.".
  - §5 item 6: `— **feito** (H).`
  - §13 linha H: marcar concluída.
- [ ] **Step 6: Commit.**

---

### Task 10: PR e CI

- [ ] Branch `refactor/metrics-aggregation-service` + push.
- [ ] PR — corpo: **deltas de valor** — listar, por métrica, a fórmula canónica escolhida e que ecrãs vão passar a mostrar um número diferente (da nota da Task 1); pedir ratificação do dono do produto; **sem migração de dados, sem alteração de escrita**; `DashboardSnapshot` write divergence fica como follow-up.
- [ ] Aguardar `quality` verde → `gh pr merge --squash --auto`.

---

## Self-Review

**1. Cobertura da spec (§2.3 item 15 + §5 item 6 + §13 fase H):**
- "Extrair um `MetricsAggregationService`/camada de leitura partilhada em vez de 5 implementações de headcount/turnover/ROI/alerts" → Tasks 2–5 (constrói) + 6–8 (os 5 consomem). ✔
- "`getManagerDashboard` implementado 2×" → Task 5 (`managerDashboard` unificado). ✔
- "`DashboardSnapshot` escrito por 2 módulos com fórmulas diferentes" → **fora do âmbito** (é escrita; o roadmap diz que H é "extracção de leitura, não muda escrita"). Anotado como follow-up no doc e no PR. ✔

**2. Placeholders:** as fórmulas canónicas e o catálogo de alertas são fixados na Task 1 a partir do código real das variantes; as Tasks 2–5 dizem "conforme a Task 1". Os shapes de retorno (`HeadcountResult` etc.) são definidos na Task 1 Step 6 em `metrics.types.ts` antes de serem usados. Sem "TODO" sem critério.

**3. Consistência de tipos:** `headcount(filters) → HeadcountResult`, `headcountTrend(months, filters?)`, `turnover(filters) → TurnoverResult`, `trainingRoi(filters) → TrainingRoiResult`, `alerts(context) → MetricAlert[]`, `managerDashboard(managerId) → ManagerDashboardResult` — definidas nas Tasks 2–5, consumidas nas Tasks 6–8 com estas assinaturas. Tipos em `metrics.types.ts` (Task 1 Step 6 / Task 2). ✔

**4. Riscos anotados:** deltas de valor visíveis ao utilizador (Task 1 documenta, PR pede ratificação); `turnover` depende de um campo de "saída" em `User` a confirmar (Task 1 Step 2); `trainingRoi` — 2 metodologias, escolha explícita; escrita de `DashboardSnapshot` fora do âmbito (follow-up). Baixo risco global: nenhuma escrita muda, tudo `prisma.read.*`. Sem ciclo de módulos: os 5 → `metrics-aggregation` → Prisma.
