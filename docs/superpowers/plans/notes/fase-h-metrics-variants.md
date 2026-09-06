# Fase H — Nota de comparação das variantes de métricas + escolha canónica

> Task 1 de `docs/superpowers/plans/2026-09-05-fase-h-metrics-aggregation-service.md`.
> Objectivo: inventariar **cada** implementação existente de `headcount`, `turnover`,
> `trainingRoi`, `alerts` e `managerDashboard` nos 5 módulos do domínio 10
> (`dashboard`, `dashboard-rh`, `reports`, `analytics`, `roi-impact`), escolher a
> fórmula canónica e escrever as assinaturas/shapes que a Task 2 vai transcrever
> para `metrics.types.ts` + `MetricsAggregationService`.
>
> **Sem alterações de código nesta task.** Só esta nota.
>
> Todas as citações `ficheiro:linha` são de leitura real feita em 2026-09-06 sobre
> `main @ 894dfb1` (branch `refactor/metrics-aggregation-service`).

---

## 0. Contexto fixado pelo controller (não deduzir)

1. Leituras passam por `this.prisma.read.*` (getter em `src/prisma/prisma.service.ts:47`
   — devolve `this` quando as réplicas estão off, senão o cliente estendido de leitura).
   A Task 2 constrói o serviço sobre `this.prisma.read`.
2. `metrics.types.ts` é **criado na Task 2**. Aqui só se escrevem as interfaces como
   *sketch* TypeScript (secção 7).
3. 4ª fonte de alertas: grep em `src/executive-reports` + `src/history` — resultado na
   secção 4.4. Nada substantivo → catálogo canónico = união das 3 fontes nomeadas.
4. Campo "leaver" no `User`: confirmado no schema — secção 2.0.
5. Single-tenant: os modelos centrais (`User`/`Enrollment`/`Course`/…) **não têm
   `tenantId`**. Agregação é global. Nenhum filtro de tenant.

### Nota transversal — `active` não é "não saiu"

`prisma/schema.prisma` model `User` (linhas 550-583):

```prisma
active        Boolean       @default(true)
accountStatus AccountStatus @default(PENDING)   // ACTIVE|INACTIVE|SUSPENDED|BLOCKED|PENDING
hrStatus      HrStatus      @default(ACTIVE)    // ACTIVE|ON_LEAVE|TERMINATED
hireDate      DateTime?
exitDate      DateTime?
createdAt     DateTime @default(now())
updatedAt     DateTime @updatedAt
```

Caminhos de escrita reais (`src/users/users.service.ts`):

| Acção | Campos escritos | Consequência |
|---|---|---|
| `remove()` (soft-delete / desligar) `:367-380` | `active:false`, `accountStatus:'INACTIVE'`, **`hrStatus:'TERMINATED'`**, **`exitDate: new Date()`**, `email` prefixado | Saída real |
| `suspend()` `:355-360` | `active:false`, `accountStatus:'SUSPENDED'` — **sem `exitDate`, sem `hrStatus`** | Suspensão temporária, **não** é saída |

**Logo:** `active:false` sozinho mistura suspensos com quem saiu de verdade.
O sinal preciso de saída é **`exitDate` preenchido** (equivalente a `hrStatus:'TERMINATED'`,
escritos em conjunto). `updatedAt` **não** serve de janela de saída — é bumped por
qualquer edição de perfil.

`hireDate` é o sinal de entrada real (nullable). `createdAt` é a criação da conta,
não a admissão — divergem quando há importação em massa ou pré-registo.

---

## 1. HEADCOUNT

### 1.1 Variantes encontradas (10 no total, 3 "completas" + 7 contagens ad-hoc)

| # | Ficheiro : método | Filtros | Definição de "activo" | Janela de "novos" | Shape devolvido |
|---|---|---|---|---|---|
| 1 | `dashboard-rh.service.ts:235` `getHeadcountPanel(departmentId?)` | `departmentId` | `user.active === true` | — (sem janela) | `{ total, active, inactive, turnoverRate, avgTenureMonths, byDepartment[], byPosition[], byTenure{<1yr,1-2yr,2-5yr,5+yr} }` |
| 2 | `dashboard-rh.service.ts:294` `getHeadcountTrend(months=6)` | — | `createdAt <= monthEnd(i) && active === true` (as-of, mas retroactivamente exclui quem está inactivo *hoje*) | `createdAt` no mês | `{ month:'YYYY-MM', count, new }[]` |
| 3 | `reports.service.ts:74` `headcountReport(filter)` | `departmentId`, `managerId`, `positionId` (via `userWhere`) | `user.active === true` | `createdAt` em `[from,to]`; `prevHires` = janela imediatamente anterior de igual duração | `{ report, period, summary:{ total, active, inactive, newHires, newHiresTrend, turnoverRate }, byDepartment[], byPosition[], generatedAt }` |
| 4 | `dashboard.service.ts:445` `getOrganizationSummary` → `kpis.headcount` | `departmentId` + `period` | `user.active === true` | `createdAt >= since(period)`; `prev` = `[prevPeriodStart, since)` | `kpis.headcount = { total, active, new, newTrend }` |
| 5 | `dashboard.service.ts:710` `getDepartmentDashboard` → `headcount` | `departmentId` (path) | `count({ departmentId, active:true })` | — | `headcount: number` |
| 6 | `dashboard.service.ts:944` `generateSnapshot` / `:817` `analytics.generateDashboardSnapshot` | `departmentId?` | `count({ active:true })` | — | grava `DashboardSnapshot.totalUsers` (2 fórmulas, ver domínio 10 §15) |
| 7 | `analytics.service.ts:47` `getOrganizationOverview` → `users` | — | `count({ active:true })` | — | `users: { total, active }` |
| 8 | `analytics.service.ts:293` `getHRDashboard` → `people` | `departmentId` + período | `count({ active:true, [dept] })` | `hired` = **`hireDate`** em `[from,to]`; `terminated` = `active:false && **exitDate** in [from,to]` | `people: { total, hired, terminated, turnoverRate }` + `headcountByDept[]` |
| 9 | `analytics.service.ts:469` `getPeopleAnalytics` → `headcount` | `departmentId` + período | `count({ active:true })` | `hired`=`hireDate` in range; `terminated`=`active:false && exitDate` in range; `onLeave`=`hrStatus:'ON_LEAVE'` | `headcount: { total, hired, terminated, onLeave, turnoverRate }` + `byDepartment[] byPosition[] diversity` |
| 10 | `analytics.service.ts:698` `getDepartmentAnalytics` → `headcount` | `departmentId` (path) | `count({ departmentId, active:true })` | — | `headcount: number` |
| + | `dashboard-rh.service.ts:65` `getFullRhDashboard` → `kpis.headcount.total` | — | `count({ active:true })`; `newHires`/`prevHires` por `createdAt` | mês corrente / mês anterior | `kpis.headcount = { total, status }` |

Observações:
- Só o `analytics` usa os campos reais **`hireDate`/`exitDate`**. Todos os outros usam
  `createdAt` para "novos" (errado quando `hireDate ≠ createdAt`).
- `byDepartment` via `department.findMany({ select:{ _count:{ select:{ users:true } } } })`
  conta **todos** os users da relação, incl. inactivos (`reports.service.ts:96`,
  `dashboard-rh.service.ts:241`). Divergente de `total`/`active`.
- `byPosition` correcto: `orderBy: { users: { _count: 'desc' } }` (não `{ _count: { users } }`
  — esse rebentava, corrigido antes, ver comentário em `reports.service.ts:102-106`).
- O campo `turnoverRate` dentro do painel de headcount (#1, #3) é na verdade
  `pct(total - active, total)` = **rácio de inactivos all-time**, não turnover. É a
  principal origem de "números diferentes por ecrã". Deve sair do payload de headcount.

### 1.2 Escolha canónica — `headcount`

**Base:** `reports.headcountReport` (`reports.service.ts:74`) — é a mais completa
(filtros dept+manager+position, janela real `[from,to]` + janela de comparação
trailing, `byDepartment` + `byPosition`) — **fundida com**:
- os campos reais **`hireDate`/`exitDate`** do `analytics` (em vez de `createdAt`);
- `byTenure` + `avgTenureMonths` do `dashboard-rh.getHeadcountPanel`.

**Fórmula exacta:**

```
where            = AND(
                     departmentId ? { departmentId } : {},
                     managerId    ? { managerId }    : {},
                     positionId   ? { positionId }   : {},
                   )
total            = user.count({ where })
active           = user.count({ where, active: true })
inactive         = total - active

// janela [from,to] — default: trailing 12 meses a contar de `to` (ou agora)
newHires         = user.count({ where, hireDate: { gte: from, lte: to } })
prevFrom         = from - (to - from)               // janela anterior de igual duração
newHiresPrev     = user.count({ where, hireDate: { gte: prevFrom, lt: from } })
newHiresTrend    = newHiresPrev > 0 ? round(((newHires - newHiresPrev) / newHiresPrev) * 100, 1) : 0

byDepartment     = department.findMany({ select:{ id,name, _count:{ select:{ users:{ where:{ active:true } } } } } })
                     → [{ id, name, count }] ordenado desc            // ⚠ scoped a active:true (corrige a divergência)
byPosition       = position.findMany({ select:{ id,name,level, _count:{ select:{ users:{ where:{ active:true } } } } },
                                       orderBy:{ users:{ _count:'desc' } }, take: 10 })
                     → [{ id, name, level, count }]

// tenure sobre utilizadores actualmente activos; base = hireDate ?? createdAt
tenureMonths(u)  = floor((now - (u.hireDate ?? u.createdAt)) / (30 * 86400000))
byTenure         = bucket(active users): '<1yr' (<12), '1-2yr' (<24), '2-5yr' (<60), '5+yr' (>=60)
avgTenureMonths  = active.length ? round(Σ tenureMonths / active.length, 1) : 0
```

**`headcount` NÃO devolve `turnoverRate`.** Turnover é `metrics.turnover()` (secção 2).
Isto elimina a métrica "rácio de inactivos" disfarçada de turnover.

`_count` com `where` aninhado precisa de Prisma ≥ 4.3 (`filtered relation counts`); se a
versão não suportar, fallback = `user.groupBy({ by:['departmentId'], where:{ active:true } })`
+ join de nomes (padrão já usado em `dashboard-rh.service.ts:106`).

### 1.3 Escolha canónica — `headcountTrend`

**Base:** `dashboard-rh.getHeadcountTrend` (`dashboard-rh.service.ts:294`), **corrigida**
para usar `hireDate`/`exitDate` (o `createdAt <= monthEnd && active` actual remove
retroactivamente quem hoje está inactivo → a série encolhe no passado).

```
para cada mês m em [months-1 .. 0]:
  mEnd   = último instante de monthEnd(m)
  mStart = monthStart(m)
  headcount = user.count({ where,
                hireDate: { lte: mEnd },
                OR: [ { exitDate: null }, { exitDate: { gt: mEnd } } ] })   // activos ponto-a-ponto
  new       = user.count({ where, hireDate: { gte: mStart, lte: mEnd } })
  left      = user.count({ where, exitDate: { gte: mStart, lte: mEnd } })  // campo novo — nenhuma variante o tinha
  label     = `${mEnd.getFullYear()}-${pad2(mEnd.getMonth()+1)}`
  push { month: label, headcount, new, left }
```

`months` default 6 (compatível com o call site actual do `dashboard-rh`); `reports`/
`analytics` podem passar 12.

---

## 2. TURNOVER

### 2.1 Variantes encontradas (7)

| # | Ficheiro : método | Numerador (o que conta como saída) | Denominador | Janela | Trend? |
|---|---|---|---|---|---|
| 1 | `dashboard-rh.service.ts:313` `getTurnoverPanel(months=12)` | `user.count({ active:false })` — **all-time**, sem janela | `user.count()` — total all-time | nenhuma (o `months` é aceite mas não afecta a taxa) | não (só `leftLast3Months` = `active:false && updatedAt >= monthStart(3)`) |
| 2 | `reports.service.ts:132` `turnoverReport(filter)` | `active:false && **updatedAt** in [from,to]` | `user.count({ [dept/mgr/pos] })` — total | `dateRange(filter)` | não (mas dá `newInPeriod`) |
| 3 | `analytics.service.ts:293` `getHRDashboard` | `active:false && **exitDate** in [from,to]` | **`totalActive`** (`active:true`, dept-filtrado) | período/datas | não |
| 4 | `analytics.service.ts:469` `getPeopleAnalytics` | `active:false && **exitDate** in [from,to]` | `totalActive` | período/datas | não |
| 5 | `roi-impact.service.ts:507` `getRetentionImpact(filter)` | `active:false && **updatedAt** in range`; `prevLeft` = igual na janela anterior | `user.count({ [dept] })` — total | `dateRange(filter)` + janela anterior | **sim** `turnoverTrend = rate - prevRate` |
| 6 | `roi-impact.service.ts:184` `calculateRoiFull` (proxy interno) | `turnoverBefore` = `active:false && createdAt < range.gte`; `turnoverAfter` = `active:false && updatedAt in range` | — (usado só para `retentionSaved`) | range | n/a |
| 7 | `executive-reports.service.ts:277` `generateAutoReport` | `active:false && **exitDate** >= monthAgo` | `totalUsers` (`active:true`) | últimos 30 dias | não |
| + | `dashboard-rh.service.ts:168` `getFullRhDashboard` → `kpis.turnover.rate` | `pct(totalInactive, total)` — inactivos all-time | total all-time | nenhuma | não |

Divergências-chave:
- **Numerador:** `updatedAt` (nºs 2, 5, 6 — **errado**, bumped por qualquer edição) vs
  `exitDate` (nºs 3, 4, 7 — **correcto**) vs `active:false` all-time (nºs 1, +).
- **Denominador:** total (incl. já-inactivos: 1, 2, 5) vs headcount activo (3, 4, 7) vs
  headcount **médio** (ninguém).
- **Janela:** nenhuma (1, +) vs `[from,to]` (2, 3, 4, 5, 7) vs trailing (6).
- `retentionRate` = `100 - turnoverRate` em todos os que o calculam (1, 2, 5).
- Custo de reposição `DEFAULTS.turnoverCost = 15000` (`roi-impact.service.ts:15`) usado
  só no `roi-impact` para `savedValue`.

### 2.2 Escolha canónica — `turnover`

**Base:** a abordagem do `analytics` (`exitDate` real + denominador de headcount activo),
**endurecida** com o denominador **médio** (padrão HR) e o **trend** do
`roi-impact.getRetentionImpact`.

> **Ruling do controller (Task 1 review, 2026-09-06):** o denominador canónico é
> `avgHeadcount = (headcountStart + headcountEnd) / 2`, tal como escrito abaixo —
> apesar de nenhuma variante existente o usar. Justificação: (1) a Task 1 Step 2 do
> plano lista explicitamente "headcount médio" como candidato a denominador — logo é
> escolha de entre as opções enumeradas pelo plano, não invenção; (2) é a fórmula
> padrão de RH (separations / average headcount); (3) o numerador (`exitDate` na
> janela) e o sub-cálculo de headcount ponto-a-ponto vêm ambos, verbatim, das
> variantes 3/4/7 do `analytics` — só a média de dois desses counts é acrescentada.
> **Fallback aceitável** (se os 2 counts ponto-a-ponto extra por chamada forem
> caros): usar `headcountEnd`. O PR da Task 10 pede ratificação do dono do produto
> para o delta de valor de turnover (como para todas as métricas).

**Fórmula exacta:**

```
where          = AND(departmentId?, managerId?, positionId?)      // igual a headcount
// janela [from,to] — default: trailing 12 meses

leavers        = user.count({ where, exitDate: { gte: from, lte: to } })
                 // exitDate preenchido == hrStatus:'TERMINATED' (escritos juntos em users.service.remove).
                 // NÃO usar `active:false` sozinho (inclui SUSPENDED); NÃO usar `updatedAt`.

headcountStart = user.count({ where, hireDate: { lte: from },
                              OR: [ { exitDate: null }, { exitDate: { gt: from } } ] })
headcountEnd   = user.count({ where, hireDate: { lte: to },
                              OR: [ { exitDate: null }, { exitDate: { gt: to } } ] })
avgHeadcount   = (headcountStart + headcountEnd) / 2

turnoverRate   = avgHeadcount > 0 ? round((leavers / avgHeadcount) * 100, 1) : 0
retentionRate  = round(100 - turnoverRate, 1)

// período anterior de igual duração
prevFrom       = from - (to - from)
leaversPrev    = user.count({ where, exitDate: { gte: prevFrom, lt: from } })
// denominador do período anterior: reutiliza headcountStart do período anterior + headcountStart actual
prevAvgHc      = (user.count({where, hireDate:{lte:prevFrom}, OR:[{exitDate:null},{exitDate:{gt:prevFrom}}]}) + headcountStart) / 2
turnoverRatePrev = prevAvgHc > 0 ? round((leaversPrev / prevAvgHc) * 100, 1) : 0
turnoverTrend  = round(turnoverRate - turnoverRatePrev, 1)

newHires       = user.count({ where, hireDate: { gte: from, lte: to } })
netHeadcountChange = newHires - leavers

avgTenureMonths = média de floor((now - (u.hireDate ?? u.createdAt))/(30*86400000)) sobre users com active:true
```

Notas:
- Se o custo de `headcountStart`/`headcountEnd` ponto-a-ponto for proibitivo,
  **fallback aceitável** = usar `headcountEnd` como denominador (não `total`
  all-time). `avgHeadcount` é a preferência declarada.
- `atRiskUsers` / `insights` textuais do `getTurnoverPanel` **não** entram no primitivo
  — são enriquecimento do `dashboard-rh` (perf reviews) e continuam lá.
- `buildTurnoverInsights` (duas cópias: `dashboard-rh.service.ts:1255` +
  `reports.service.ts:1134`, thresholds 10%/20% vs 10%/20% com textos diferentes) é
  portado **uma vez** para o `MetricsAggregationService` na Task 3 e as cópias
  removidas nas Tasks 6/8 (já previsto no plano).

---

## 3. TRAINING ROI

### 3.1 Variantes encontradas (2 metodologias + 3 reutilizações da fórmula A)

**A. `roi-impact.service.ts:79` `calculateRoiFull(filter, params)`** — a única que calcula ROI% real.

```
window     = dateRange(filter)  // default: [ (to.year-1, to.month, 1) , to ]  → ~trailing 12 meses
enrollments= enrollment.count({ enrolledAt: {gte,lte}, [user.departmentId], [courseId] })
completed  = idem + status = COMPLETED
cost       = enrollments * costPerEnrollment            // DEFAULT 200 USD, overridável via params
benefit    = completed   * benefitPerCompletion         // DEFAULT 500 USD, overridável
roi%       = cost > 0 ? ((benefit - cost) / cost) * 100 : 0          // 1 dp
bcr        = cost > 0 ? benefit / cost : 0                            // 2 dp
payback(m) = benefit > 0 ? cost / (benefit / 12) : 0
netBenefit = benefit - cost
totalHours = round(lessonProgress.count({completed:true, completedAt in window}) * 15 / 60)
confidence = confidenceLevel(completed, #dataPointsPresentes)  // HIGH >=50&&>=3 / MEDIUM >=20&&>=2 / LOW
// overlays: retentionBenefit = max(0, turnoverBefore-turnoverAfter) * 15000 ; perfLift = perfAfter-perfBefore
```

Reutilizações **da mesma fórmula** `roiFormula(benefit,cost)` (`roi-impact.service.ts:23`):
- `roi-impact.service.ts:287` `getImpactMetrics` → `L5_roi.roi = roiFormula(benefitEst, costEst)` (Kirkpatrick L1-L5).
- `roi-impact.service.ts:641` `getLearningImpact` → `financial.roi`, com `hoursEstimated = completed * 2`.
- `roi-impact.service.ts:891` `getProgramLibrary` → ROI por curso, ranking.

**B. `analytics.service.ts:794` `getTrainingROI()`** — metodologia totalmente diferente.

```
// SEM janela temporal, SEM cost/benefit/ROI%
impacts            = trainingImpact.findMany({ orderBy:{ calculatedAt:'desc' }, take: 20 })   // linhas pré-calculadas
courseAnalytics    = courseAnalytics.findMany({ include: course{ workloadHours } })
totalHoursInvested = Σ (course.workloadHours ?? 0) * ca.totalCompleted     // workload REAL por curso
totalCompletions   = Σ ca.totalCompleted
totalCertificates  = certificate.count()
return { impacts, totalHoursInvested, totalCompletions, totalCertificates }
```

Diferenças A vs B:
| | A `calculateRoiFull` | B `getTrainingROI` |
|---|---|---|
| ROI % / BCR / payback | **sim** | não |
| Custo / benefício monetário | sim (assunções config.) | não |
| Horas | `lessonCompletions * 15min` **ou** `completed * 2h` (flat) | `Σ course.workloadHours * completions` (real) |
| Janela temporal | sim (`[from,to]`) | não (all-time) |
| Fonte | contagens ao vivo de `Enrollment` | tabelas denormalizadas `TrainingImpact` + `CourseAnalytics` |
| Confiança / narrativa | sim | não |

### 3.2 Escolha canónica — `trainingRoi`

**Base: modelo financeiro do `roi-impact.calculateRoiFull`** (única que produz ROI%,
BCR, payback, assunções configuráveis e nível de confiança) — **com uma correcção
importada de B:** as **horas** vêm de `Course.workloadHours` real, não do flat `× 2h`.

**Fórmula exacta:**

```
where       = AND(
                enrolledAt: { gte: from, lte: to },
                departmentId ? { user: { departmentId } } : {},
                courseId     ? { courseId }               : {},
              )
// janela default: trailing 12 meses a contar de `to` (ou agora)

enrollments = enrollment.count({ where })
completed   = enrollment.count({ where, status: COMPLETED })
completionRate = enrollments > 0 ? round((completed / enrollments) * 100, 1) : 0

costPerEnrollment    = params.costPerEnrollment    ?? 200     // USD  (DEFAULTS em roi-impact.service.ts:11)
benefitPerCompletion = params.benefitPerCompletion ?? 500     // USD

totalCost    = enrollments * costPerEnrollment
grossBenefit = completed   * benefitPerCompletion
roiPct       = totalCost > 0 ? round(((grossBenefit - totalCost) / totalCost) * 100, 1) : 0
bcr          = totalCost > 0 ? round(grossBenefit / totalCost, 2) : 0
netBenefit   = grossBenefit - totalCost
paybackMonths= grossBenefit > 0 ? round(totalCost / (grossBenefit / 12), 1) : 0

// horas reais (import de analytics.getTrainingROI): soma do workload dos cursos concluídos na janela
trainingHours = Σ_over(enrollment.findMany({ where, status:COMPLETED, include:{ course:{ workloadHours } } }))
                  (course.workloadHours ?? 0)
                // fallback se workloadHours ausente em massa: completed * 2

confidence  = completed >= 50 ? 'HIGH' : completed >= 20 ? 'MEDIUM' : 'LOW'
```

Fora do primitivo (ficam nos módulos, compõem por cima de `metrics.trainingRoi()`):
- overlays de **retenção** (`retentionBenefit`, `savedValue`) → pertencem a `turnover()`.
- overlays de **performance** (`perfLift`, `productivityBenefit`) → domínio performance.
- **Kirkpatrick L1-L5** (`getImpactMetrics`), **What-If** (`simulateWhatIf`),
  **Program Library** ranking (`getProgramLibrary`), tabela `TrainingImpact` → continuam
  no `roi-impact` como wrappers ricos.
- `analytics.getTrainingROI` passa a devolver `{ ...metrics.trainingRoi(...), impacts: trainingImpact.findMany(...) }`.

---

## 4. ALERTS

### 4.1 `dashboard.service.ts:789` `getAlerts(userId, roleCode)` — `GET /dashboard/alerts`

Contexto: pessoal + ramo de gestor. Shape por alerta: `{ type, message, priority, actionUrl? }`.
`priority ∈ { URGENT, ATTENTION, INFORMATIVE }` (`dashboard.dto.ts`). Ordenado por prioridade.

| key | condição | priority | mensagem | actionUrl |
|---|---|---|---|---|
| `SURVEYS_PENDING` | `engagementSurvey.count({ status:'ACTIVE', responses:{ none:{ userId } } }) > 0` | ATTENTION | `${n} survey(s) por responder` | `/engagement` |
| `EVAL_360_PENDING` | `evaluationRequest.count({ evaluatorId:userId, status:'PENDING' }) > 0` | URGENT | `${n} avaliação(ões) 360° pendentes` | `/evaluations/pending` |
| `PDI_ACTIONS_OVERDUE` | `developmentPlanAction.count({ plan:{ userId }, status:{ notIn:['COMPLETED','CANCELLED'] }, dueDate:{ lt:now } }) > 0` | URGENT | `${n} acção(ões) de PDI em atraso` | `/talent-development/plans` |
| `MANDATORY_TRAINING_PENDING` | `course.count({ mandatory:true, enrollments:{ none:{ userId, status:'COMPLETED' } } }) > 0` | ATTENTION | `${n} formação(ões) obrigatória(s) por concluir` | `/content-library/mandatory` |
| `TEAM_PERFORMANCE_AT_RISK` | `roleCode ∈ {ADMIN,RH,LIDER}` **e** `user.count({ managerId:userId, active:true, performanceReviews:{ some:{ score:{ lt:2.5 } } } }) > 0` | URGENT | `${n} membro(s) da equipa com performance abaixo da média` | `/evaluations` |

### 4.2 `dashboard.service.ts:1021` `buildManagerAlerts(data)` — dentro de `getManagerDashboard`, `GET /dashboard/manager`

Input: `{ atRisk, mandatoryRate, pdpCoverage, pendingEvals }`. Shape: `{ type, priority, message }` (sem `actionUrl`, sem `count`).
`atRisk` = membros com última review `score < 2.5` **ou** (`0 conclusões` **e** `>0 inscrições`).

| key | condição | priority | mensagem |
|---|---|---|---|
| `MANAGER_TEAM_RISK` | `atRisk > 0` | URGENT | `${atRisk} colaborador(es) em risco de performance` |
| `MANDATORY_RATE_LOW` | `mandatoryRate < 80` | ATTENTION | `Taxa de formações obrigatórias abaixo de 80% (${mandatoryRate}%)` |
| `PDP_COVERAGE_LOW` | `pdpCoverage < 50` | ATTENTION | `Apenas ${pdpCoverage}% da equipa tem PDI activo` |
| `EVAL_360_PENDING` | `pendingEvals > 0` | ATTENTION | `${pendingEvals} avaliação(ões) 360° pendentes` |

### 4.3 `dashboard-rh.service.ts:976` `getAlerts()` — `GET /dashboard-rh/alerts`

Contexto: organização inteira, sem user. Shape: `{ type, severity, message, count? }`.
`severity ∈ { HIGH, MEDIUM, LOW }`. Sem ordenação (push order = tabela).

| key | condição | severity | mensagem |
|---|---|---|---|
| `PERFORMANCE_CRITICAL` | `performanceReview.count({ score:{ lt:2 }, status:'PUBLISHED' }) > 0` | HIGH | `${n} colaborador(es) com performance crítica` |
| `MANDATORY_TRAINING_PENDING` (org) | `enrollment.count({ course:{ mandatory:true }, status:{ not:'COMPLETED' } }) > 0` | HIGH | `${n} formação(ões) obrigatória(s) por concluir` |
| `PDI_ACTIONS_OVERDUE` (org) | `developmentPlanAction.count({ status:{ notIn:['COMPLETED','CANCELLED'] }, dueDate:{ lt:now } }) > 0` | MEDIUM | `${n} acção(ões) de PDI em atraso` |
| `SURVEY_PARTICIPATION_LOW` | `surveyResponse.count({ createdAt:{ gte:monthStart } }) / user.count({ active:true }) < 0.30` | MEDIUM | `Taxa de participação em surveys abaixo de 30%` |

### 4.4 `analytics.service.ts:598` `getRiskAlerts(filters)` — `GET /analytics/risks`

Contexto: dept-scoped, **registo de risco com listas de entidades**, não toasts.
Shape: `{ inactiveCollaborators[], overduePDIs[], criticalActions[], summary:{ inactiveCount, overduePDICount, criticalActionCount } }`.

| key | condição | severity (proposta) | mensagem (proposta) |
|---|---|---|---|
| `INACTIVE_COLLABORATORS` | users activos **sem** nenhuma inscrição com `enrolledAt >= now - 60d` | MEDIUM | `${n} colaborador(es) sem actividade de formação há 60+ dias` |
| `PDI_PLAN_OVERDUE` | `developmentPlan.findMany({ status:'ACTIVE', endDate:{ lt:now } })` | MEDIUM | `${n} PDI(s) além do prazo` |
| `PDI_ACTION_CRITICAL` | `developmentPlanAction.findMany({ plan:{ status:'ACTIVE' }, status:{ not:'COMPLETED' }, dueDate:{ lt: now - 14d } })` | HIGH | `${n} acção(ões) de PDI críticas (>14 dias em atraso)` |

### 4.5 4ª fonte — grep `src/executive-reports` + `src/history`

- **`executive-reports.service.ts:378-399` `generateAutoReport` → `risks[]`** — array de
  **strings** embutido no relatório gerado, sem `type`/`severity`/`actionUrl`. Regras:
  - `turnoverRate > 10` → `Taxa de Rotatividade elevada: ${r}% (target: ≤5%)`
  - `completionRate < 30` → `Taxa de conclusão de cursos crítica: ${r}%`
  - `overdueActions > 10` → `${n} acções de PDI atrasadas — risco de abandono`
  - `pdiAdoption < 30` → `Baixa adopção de PDI: ${r}% dos colaboradores`
  - + semáforos KPI (RED/YELLOW/GREEN): `Saídas > 5`, `turnover >10/>5`, `completion <30/<60`,
    `avgScore <2.5/<3.5`, `pdiAdoption <30/<60`, `overdueActions >20/>5`.
  **Veredicto:** não é um feed de alertas — é geração de texto de relatório. Regras
  úteis mas já cobertas (turnover/compliance/PDI). Registadas como *insight-derived* (§4.7).
- **`history.service.ts:857` `recentAlerts`** — `auditLog.findMany({ action:{ in:['PERMISSION_CHANGED','ADMIN_ACTION','USER_DELETED','BULK_OPERATION'] } })`, últimos 5.
  **Veredicto:** feed de auditoria de segurança, **não** é métrica. Excluído do catálogo.

→ **Nada substantivo.** Catálogo canónico = união de §4.1 + §4.2 + §4.3 + §4.4.

### 4.6 Catálogo canónico consolidado — `alerts()`

Severidade canónica = 3 níveis `HIGH | MEDIUM | LOW`. Mapa: `URGENT→HIGH`, `ATTENTION→MEDIUM`, `INFORMATIVE→LOW`.
`scope ∈ { user, team, organization }`.

| # | key | scope(s) | condição (canónica) | severity | mensagem | ecrãs de origem |
|---|---|---|---|---|---|---|
| 1 | `SURVEYS_PENDING` | user | surveys ACTIVE sem resposta do user `> 0` | MEDIUM | `${n} survey(s) por responder` | `/dashboard/alerts` |
| 2 | `EVAL_360_PENDING` | user, team | `evaluationRequest{ evaluatorId, status:PENDING } > 0` | HIGH | `${n} avaliação(ões) 360° pendentes` | `/dashboard/alerts`, `/dashboard/manager` |
| 3 | `PDI_ACTIONS_OVERDUE` | user, organization | acções PDI não concluídas e `dueDate < now` `> 0` (user: `plan.userId=me`; org: global) | user **HIGH** / org **MEDIUM** | `${n} acção(ões) de PDI em atraso` | `/dashboard/alerts`, `/dashboard-rh/alerts` |
| 4 | `MANDATORY_TRAINING_PENDING` | user, organization | user: cursos `mandatory` sem enrollment COMPLETED do user; org: `enrollment{ course.mandatory, status≠COMPLETED }` `> 0` | user **MEDIUM** / org **HIGH** | `${n} formação(ões) obrigatória(s) por concluir` | `/dashboard/alerts`, `/dashboard-rh/alerts` |
| 5 | `TEAM_PERFORMANCE_AT_RISK` | team | `roleCode ∈ {ADMIN,RH,LIDER}` e `user{ managerId, active, performanceReviews.some(score<2.5) } > 0` | HIGH | `${n} membro(s) da equipa com performance abaixo da média` | `/dashboard/alerts` (ramo gestor) |
| 6 | `MANAGER_TEAM_RISK` | team | `atRisk > 0` (última review `< 2.5` **ou** `0 conclusões` c/ inscrições activas) | HIGH | `${n} colaborador(es) em risco de performance` | `/dashboard/manager` |
| 7 | `MANDATORY_RATE_LOW` | team | `mandatoryRate < 80` | MEDIUM | `Taxa de formações obrigatórias abaixo de 80% (${r}%)` | `/dashboard/manager` |
| 8 | `PDP_COVERAGE_LOW` | team | `pdpCoverage < 50` | MEDIUM | `Apenas ${r}% da equipa tem PDI activo` | `/dashboard/manager` |
| 9 | `PERFORMANCE_CRITICAL` | organization | `performanceReview{ score<2, status:PUBLISHED } > 0` | HIGH | `${n} colaborador(es) com performance crítica` | `/dashboard-rh/alerts` |
| 10 | `SURVEY_PARTICIPATION_LOW` | organization | `respostas do mês / activos < 0.30` | MEDIUM | `Taxa de participação em surveys abaixo de 30%` | `/dashboard-rh/alerts` |
| 11 | `INACTIVE_COLLABORATORS` | organization, team | activos sem inscrição nos últimos 60 dias `> 0` | MEDIUM | `${n} colaborador(es) sem actividade de formação há 60+ dias` | `/analytics/risks` |
| 12 | `PDI_PLAN_OVERDUE` | organization, team | `developmentPlan{ status:ACTIVE, endDate < now } > 0` | MEDIUM | `${n} PDI(s) além do prazo` | `/analytics/risks` |
| 13 | `PDI_ACTION_CRITICAL` | organization, team | acções PDI (plano ACTIVE) não concluídas e `dueDate < now - 14d` `> 0` | HIGH | `${n} acção(ões) de PDI críticas (>14 dias em atraso)` | `/analytics/risks` |

**Catálogo canónico = 13 regras.**

### 4.7 Insight-derived (registadas, **fora** do catálogo canónico da Task 1)

Regras "tipo alerta" que hoje vivem em *insights* de string, não em feeds de alerta.
Candidatas a adicionar mais tarde se um consumidor pedir; não implementar já.

| key | fonte | condição | severity |
|---|---|---|---|
| `SUCCESSION_COVERAGE_LOW` | `dashboard.buildExecutiveRisks:1084` / `buildOrgInsights:1065` | `successionCoverage < 30` (exec) / `< 50` (insight) | HIGH / — |
| `TALENT_HEALTH_LOW` | `dashboard.buildExecutiveRisks:1086` | `talentHealth.healthScore < 50` | HIGH |
| `DEV_COVERAGE_LOW` | `dashboard.buildExecutiveRisks:1088` | `development.coverage < 30` | MEDIUM |
| `COURSE_COMPLETION_LOW` | `reports.getInsights:1067` / exec `:382` | `completionRate < 60` (reports) / `< 30` (exec) | HIGH |
| `COURSE_ABANDONMENT_HIGH` | `reports.getInsights:1075` | `abandonment > 25` | MEDIUM |
| `PDP_COVERAGE_LOW` (org) | `reports.getInsights:1102` | `talent.pdpCoverage < 40` | HIGH |
| `SUCCESSION_PLANS_LOW` | `reports.getInsights:1110` | `talent.succession < 5` | MEDIUM |

### 4.8 Escolha canónica — assinatura `alerts()`

```
alerts(params: {
  scope: 'user' | 'team' | 'organization';
  userId?: number;        // obrigatório p/ scope 'user' | 'team'
  roleCode?: string;      // habilita a regra TEAM_PERFORMANCE_AT_RISK (ADMIN/RH/LIDER)
  departmentId?: number;  // opcional — estreita 'organization' / 'team'
}): Promise<MetricAlert[]>
```

- `scope:'user'` → regras 1-4 (contexto do próprio).
- `scope:'team'` → regras 2, 5-8, 11-13 (managerId = userId).
- `scope:'organization'` → regras 3-4, 9-13.
- Resultado **sempre** `MetricAlert[]` unificado (secção 7), ordenado por
  `severity` (HIGH→MEDIUM→LOW) e depois `key`.
- Consumidores (`dashboard` T7, `analytics` T8) adaptam para a sua forma legada
  (`priority` string / listas de entidades) na borda.

---

## 5. MANAGER DASHBOARD

### 5.1 As 2 implementações

**`dashboard.service.ts:233` `getManagerDashboard(userId, filters: { period?, departmentId? })`** — `GET /dashboard/manager`

```
- period-aware (since = periodStart(period), prev = prevPeriodStart(period))
- teamWhere = { managerId: userId, active: true }
- early return se sem equipa: { teamSize:0, team:[], kpis:{}, alerts:[], pendingItems:[] }
Devolve:
  teamSize
  kpis: { pdpCoverage, activePlans, completedPlans, inProgress, completedEnrollments,
          avgScore, scoreTrend, mandatoryRate, engagementResponses, avatarSessions, pendingEvals }
  team[]: { user:{id,fullName,avatarUrl,position}, xp, enrollment:{completed,inProgress},
            plan:{progress,status}|null, lastScore, alert:boolean }
  alerts[]: buildManagerAlerts → { type, priority, message }
```

**`analytics.service.ts:175` `getManagerDashboard(managerId)`** — `GET /analytics/manager`

```
- SEM period, SEM departmentId
- early return se sem equipa (metrics tudo a 0, arrays vazios)
Devolve:
  team[]: { id, fullName, avatarUrl, position:{name}, department:{name} }
  metrics: { headcount, enrollments, completions, completionRate, activePDIs,
             pdiAdoptionRate, avgPerformance, overdueActions }
  competencyGaps[]: { name, totalGap, count, avgGap }   // top 5 por totalGap
  nineBox[]: { userId, fullName, avatarUrl, performanceAxis, potentialAxis, quadrant }
  alerts[]: { type, message, userId? }  → OVERDUE_ACTIONS (>0), LOW_COMPLETION (<30%)
```

Sobreposição de KPIs (nomes diferentes, mesma coisa):
`pdpCoverage` ≡ `pdiAdoptionRate` · `activePlans` ≡ `activePDIs` · `avgScore` ≡ `avgPerformance`
· `completedEnrollments` ≈ `completions` · ambos têm `completionRate`.
Só no `dashboard`: `scoreTrend`, `mandatoryRate`, `engagementResponses`, `avatarSessions`,
`pendingEvals`, `xp`/`plan` por membro. Só no `analytics`: `overdueActions`,
`competencyGaps`, `nineBox`, `department` por membro.

### 5.2 Escolha canónica — superconjunto `managerDashboard`

```
managerDashboard(params: {
  userId: number;
  period?: DashboardPeriod;   // WEEK|MONTH|QUARTER|YEAR — default MONTH
  departmentId?: number;
}): Promise<ManagerDashboardResult>
```

`ManagerDashboardResult` = **união** dos dois (secção 7). Regras de fusão:
- `team[]` = membro do `dashboard` (`user.position`, `xp`, `enrollment`, `plan`,
  `lastScore`, `atRisk`) **+** `user.department` do `analytics`.
- `kpis` = superconjunto; nomes canónicos = os do `dashboard` (`pdpCoverage`,
  `activePlans`, `avgScore`), **mais** `overdueActions` do `analytics`, **mais**
  `enrollmentsTotal` / `completions` (contagens brutas do `analytics`).
- `competencyGaps` + `nineBox` = do `analytics` (o `dashboard` não os tinha).
- `alerts` = `MetricAlert[]` canónico com `scope:'team'` (secção 4).
- early-return sem equipa: `{ teamSize: 0, team: [], kpis: <tudo 0/null>, competencyGaps: [], nineBox: [], alerts: [] }`.

---

## 6. Resumo das escolhas

| Métrica | # variantes | Canónica (base) | Correcção-chave aplicada |
|---|---|---|---|
| `headcount` | 10 + full | `reports.headcountReport` | `hireDate` (não `createdAt`); `byDept/byPos` scoped a `active`; **remove `turnoverRate` do payload** |
| `headcountTrend` | 1 | `dashboard-rh.getHeadcountTrend` | activos ponto-a-ponto via `hireDate`/`exitDate`; novo campo `left` |
| `turnover` | 7 + full | `analytics` (`exitDate`) + trend do `roi-impact` | numerador = `exitDate` in window (não `updatedAt`, não `active:false` só); denominador = **headcount médio** |
| `trainingRoi` | 2 (+3 reuse) | `roi-impact.calculateRoiFull` | horas = `Σ Course.workloadHours` (de `analytics.getTrainingROI`); overlays retenção/perf ficam fora |
| `alerts` | 4 fontes (13 regras) | união §4.1-§4.4 | severidade unificada 3-níveis; `scope` param; `history` excluído; `executive-reports.risks` = insight-derived |
| `managerDashboard` | 2 | superconjunto `dashboard` ⊕ `analytics` | nomes de KPI = `dashboard`; `+overdueActions/competencyGaps/nineBox/department` do `analytics` |

---

## 7. Step 6 — Sketches de tipos + assinaturas para `metrics.types.ts` (Task 2 transcreve)

> Não criar `.ts` nesta task. Isto é a especificação que a Task 2 copia.

```ts
// ─────────────────────────────────────────────────────────────
// Parâmetros partilhados
// ─────────────────────────────────────────────────────────────

/** Janela temporal fechada. Default de cada método: trailing 12 meses até `to`. */
export interface MetricPeriod {
  from: Date;
  to: Date;
}

/** Filtro de população, comum a headcount / turnover / trainingRoi. */
export interface MetricScopeFilter {
  departmentId?: number;
  managerId?: number;
  positionId?: number;
}

export type DashboardPeriodKey = 'WEEK' | 'MONTH' | 'QUARTER' | 'YEAR';

// ─────────────────────────────────────────────────────────────
// headcount
// ─────────────────────────────────────────────────────────────

export interface HeadcountParams extends MetricScopeFilter {
  from?: Date;   // default: to - 12 meses
  to?: Date;     // default: agora
}

export interface HeadcountBreakdownEntry {
  id: number;
  name: string;
  level?: string;      // só em byPosition — Prisma enum PositionLevel (string), ex. 'SENIOR' (corrigido de `number` na Task 2 review)
  count: number;       // scoped a active:true
}

export interface HeadcountResult {
  total: number;                 // toda a população do filtro (activos + inactivos)
  active: number;                // active === true
  inactive: number;              // total - active
  newHires: number;              // hireDate ∈ [from, to]
  newHiresPrev: number;          // janela anterior de igual duração
  newHiresTrend: number;         // % var. vs janela anterior, 1 dp
  avgTenureMonths: number;       // média sobre activos, base hireDate ?? createdAt
  byTenure: { '<1yr': number; '1-2yr': number; '2-5yr': number; '5+yr': number };
  byDepartment: HeadcountBreakdownEntry[];   // desc por count
  byPosition: HeadcountBreakdownEntry[];      // top 10 desc por count
  period: MetricPeriod;
  generatedAt: Date;
}

// ─────────────────────────────────────────────────────────────
// headcountTrend
// ─────────────────────────────────────────────────────────────

export interface HeadcountTrendParams extends MetricScopeFilter {
  months?: number;   // default 6
}

export interface HeadcountTrendPoint {
  month: string;      // 'YYYY-MM'
  headcount: number;  // activos ponto-a-ponto no fim do mês (hireDate <= fim && (exitDate == null || exitDate > fim))
  new: number;        // hireDate no mês
  left: number;       // exitDate no mês
}

// ─────────────────────────────────────────────────────────────
// turnover
// ─────────────────────────────────────────────────────────────

export interface TurnoverParams extends MetricScopeFilter {
  from?: Date;   // default: to - 12 meses
  to?: Date;     // default: agora
}

export interface TurnoverResult {
  leavers: number;              // exitDate ∈ [from, to]
  avgHeadcount: number;         // (headcountStart + headcountEnd) / 2
  turnoverRate: number;         // leavers / avgHeadcount * 100, 1 dp
  retentionRate: number;        // 100 - turnoverRate
  turnoverRatePrev: number;     // janela anterior
  turnoverTrend: number;        // turnoverRate - turnoverRatePrev, 1 dp
  newHires: number;             // hireDate ∈ [from, to]
  netHeadcountChange: number;   // newHires - leavers
  avgTenureMonths: number;      // média sobre activos
  insights: string[];          // Task 3 controller ruling (buildTurnoverInsights portado)
  period: MetricPeriod;
}

// ─────────────────────────────────────────────────────────────
// trainingRoi
// ─────────────────────────────────────────────────────────────

export interface TrainingRoiParams {
  from?: Date;                     // default: to - 12 meses
  to?: Date;                       // default: agora
  departmentId?: number;
  courseId?: number;
  costPerEnrollment?: number;      // default 200 (USD)
  benefitPerCompletion?: number;   // default 500 (USD)
}

export interface TrainingRoiResult {
  enrollments: number;
  completed: number;
  completionRate: number;         // %, 1 dp
  costPerEnrollment: number;      // eco do input / default
  benefitPerCompletion: number;
  totalCost: number;              // enrollments * costPerEnrollment
  grossBenefit: number;           // completed * benefitPerCompletion
  netBenefit: number;             // grossBenefit - totalCost
  roiPct: number;                 // (grossBenefit - totalCost) / totalCost * 100, 1 dp
  bcr: number;                    // grossBenefit / totalCost, 2 dp
  paybackMonths: number;          // totalCost / (grossBenefit / 12), 1 dp
  trainingHours: number;          // Σ Course.workloadHours das inscrições concluídas na janela
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  period: MetricPeriod;
}

// ─────────────────────────────────────────────────────────────
// alerts
// ─────────────────────────────────────────────────────────────

export type MetricAlertScope = 'user' | 'team' | 'organization';
export type MetricAlertSeverity = 'HIGH' | 'MEDIUM' | 'LOW';

export interface AlertParams {
  scope: MetricAlertScope;
  userId?: number;        // obrigatório p/ 'user' | 'team'
  roleCode?: string;      // habilita TEAM_PERFORMANCE_AT_RISK
  departmentId?: number;
}

export interface MetricAlert {
  key: string;                    // id estável da regra (secção 4.6), ex. 'MANDATORY_TRAINING_PENDING'
  type: string;                   // bucket de domínio: PERFORMANCE|COMPLIANCE|PDI|ENGAGEMENT|TRAINING|SURVEY|EVALUATION|RISK
  severity: MetricAlertSeverity;
  message: string;
  count?: number;
  actionUrl?: string;
  scope: MetricAlertScope;
}

// ─────────────────────────────────────────────────────────────
// managerDashboard
// ─────────────────────────────────────────────────────────────

export interface ManagerDashboardParams {
  userId: number;
  period?: DashboardPeriodKey;   // default 'MONTH'
  departmentId?: number;
}

export interface ManagerDashboardTeamMember {
  user: {
    id: number;
    fullName: string;
    avatarUrl: string | null;
    position: { name: string } | null;
    department?: { name: string } | null;
  };
  xp: number;
  enrollment: { completed: number; inProgress: number };
  plan: { progress: number; status: string } | null;
  lastScore: number | null;
  atRisk: boolean;
}

export interface ManagerDashboardKpis {
  pdpCoverage: number;            // ≡ pdiAdoptionRate
  activePlans: number;            // ≡ activePDIs
  completedPlans: number;
  inProgress: number;             // inscrições em progresso (agregado da equipa)
  completedEnrollments: number;   // concluídas na janela
  enrollmentsTotal: number;       // contagem bruta (de analytics)
  completions: number;            // contagem bruta (de analytics)
  completionRate: number;
  avgScore: number | null;        // ≡ avgPerformance
  scoreTrend: number | null;
  mandatoryRate: number;
  engagementResponses: number;
  avatarSessions: number;
  pendingEvals: number;
  overdueActions: number;         // de analytics
}

export interface ManagerDashboardCompetencyGap {
  name: string;
  totalGap: number;
  count: number;
  avgGap: number;
}

export interface ManagerDashboardNineBoxEntry {
  userId: number;
  fullName: string;
  avatarUrl: string | null;
  performanceAxis: string;
  potentialAxis: string;
  quadrant: string;              // `${performanceAxis}-${potentialAxis}`
}

export interface ManagerDashboardResult {
  teamSize: number;
  team: ManagerDashboardTeamMember[];
  kpis: ManagerDashboardKpis;
  competencyGaps: ManagerDashboardCompetencyGap[];   // top 5 por totalGap
  nineBox: ManagerDashboardNineBoxEntry[];
  alerts: MetricAlert[];                              // scope 'team'
}

// ─────────────────────────────────────────────────────────────
// As 6 assinaturas de método do MetricsAggregationService
// (leituras sempre via this.prisma.read.*)
// ─────────────────────────────────────────────────────────────

export interface IMetricsAggregationService {
  headcount(params: HeadcountParams): Promise<HeadcountResult>;
  headcountTrend(params: HeadcountTrendParams): Promise<HeadcountTrendPoint[]>;
  turnover(params: TurnoverParams): Promise<TurnoverResult>;
  trainingRoi(params: TrainingRoiParams): Promise<TrainingRoiResult>;
  alerts(params: AlertParams): Promise<MetricAlert[]>;
  managerDashboard(params: ManagerDashboardParams): Promise<ManagerDashboardResult>;
}
```

---

## 8. Riscos / notas para as Tasks 2-8

1. **`_count` com `where` filtrado** (`byDepartment`/`byPosition` scoped a `active`)
   precisa de Prisma ≥ 4.3. Se indisponível → fallback `groupBy` + join de nomes
   (padrão em `dashboard-rh.service.ts:106`). Confirmar versão do Prisma na Task 2.
2. **Cobertura de `hireDate`/`exitDate`**: se a BD real tiver muitos `hireDate` nulos
   (dados legados), `newHires`/tenure ficam subcontados. A fórmula usa
   `hireDate ?? createdAt` para tenure; para `newHires`/`turnover` fica `hireDate`/
   `exitDate` estritos (é o número *correcto*, mesmo que baixo). Documentar no PR da Task 3.
3. **`headcountStart`/`headcountEnd` ponto-a-ponto** = 2 counts extra por chamada de
   `turnover`. Aceitável (é leitura de réplica). Fallback declarado: `headcountEnd`.
4. **`buildTurnoverInsights`** tem 2 cópias com textos divergentes
   (`dashboard-rh.service.ts:1255` thresholds 10/20 com emojis; `reports.service.ts:1134`
   10/20 sem emojis). A Task 3 porta **uma** versão; escolher a do `dashboard-rh`
   (com emojis, mais informativa) ou parametrizar. Tasks 6/8 removem as cópias
   (o plano já prevê; `progress.md` regista `grep == 1` na Task 9).
5. **`DashboardSnapshot`** é escrito por 2 sítios com fórmulas diferentes
   (`dashboard.generateSnapshot:944` usa `getOrganizationSummary`;
   `analytics.generateDashboardSnapshot:817` faz contagens próprias forçando primary).
   Fora do âmbito das 6 métricas desta task, mas é o mesmo problema — sinalizar para
   uma task futura (não está nas Tasks 2-9).
6. **`Enrollment.mandatory`** existe *directamente* no modelo (`schema.prisma`,
   `@@index([mandatory])`) além de `course.mandatory`. O código actual filtra por
   `course: { mandatory: true }` (join). Canónico pode usar qualquer um; o `.catch()`
   defensivo à volta dessas queries é legado de quando se duvidava do campo — hoje o
   campo existe, o `.catch()` pode cair na Task 4 (opcional).
7. **`analytics` usa `completedAt`/`cancelledAt` do `Enrollment`** (`analytics.service.ts:319-322`)
   — confirmado que **existem** no schema. As janelas de conclusão do canónico usam
   `enrolledAt` (consistente com todas as outras variantes); se um consumidor quiser
   "concluído *no* período" (vs "inscrito no período e concluído"), usar `completedAt`
   — decisão do consumidor, não do primitivo.
```
