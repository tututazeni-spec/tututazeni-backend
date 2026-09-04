# Limpeza de Código Morto — INNOVA (backend + frontend)

> **Para executores:** este plano é uma limpeza dirigida por auditoria. Não há
> features novas; cada tarefa é "remover X → `tsc` + build + lint + testes verdes
> → commit". A "prova" de cada tarefa é a suite existente continuar verde, não um
> teste novo. Passos com checkbox (`- [ ]`) para tracking.

**Objectivo:** remover componentes/ficheiros nunca usados, funções e DTOs nunca
chamados, imports não utilizados, estado React morto e código comentado sem
valor, nos dois repositórios.

**Arquitectura:** duas faixas. **Faixa A (risco zero)** — imports não usados e
código comentado óbvio; aplicada já, PRs pequenos. **Faixa B (precisa de juízo
por item)** — ficheiros/funções/DTOs/estado mortos; cada tarefa abaixo, uma a
uma, com verificação e PR próprios.

**Stack:** NestJS + Prisma (backend, `src/`), Next.js 15 App Router + React Query
+ Vitest (frontend, `frontend/` — repo git separado).

**Fonte:** auditoria de 2026-09-04 (ts-prune, eslint `unused-imports`, knip
parcial, detector de órfãos por grafo de imports, varrimento de `useState`).

## Global Constraints

- **CI obrigatório antes de merge para `main`** nos dois repos. Backend: check
  `quality` (`.github/workflows/quality.yml`) — branch protection dura. Frontend:
  check `build` (`Frontend Quality`). Nunca fazer merge sem o check verde.
- **Backend:** `npm run lint:check` corre `eslint --config eslint.config.staged.mjs`
  com `unused-imports/no-unused-imports: error`. Qualquer import morto reintroduzido
  parte o CI. Correr `npx prettier --write` nos ficheiros tocados antes de push.
- **Frontend:** sem prettier no CI — não correr prettier; imitar o estilo à mão.
  Gate local: `npx tsc --noEmit` + `npm run build` + `npm test` (vitest).
- **Backend `tsconfig`** tem `diagnostics: false` no ts-jest — o TypeScript não
  acusa símbolos removidos em ficheiros de teste; correr `npm run build` (tsc real)
  sempre.
- Branch + PR sempre (mesmo no frontend, onde `main` não é push-protected).
  Mensagens de commit terminam com o trailer `Co-Authored-By` / `Claude-Session`
  desta sessão.

---

## Achados da auditoria (resumo)

### Backend `src/`

| # | Categoria | Achado |
|---|---|---|
| B1 | Ficheiro/provider nunca registado | `app.controller.ts` (`AppController`, `GET /`) — **não está** no array `controllers` de `app.module.ts` (só lá está `LearningPathsController`). Scaffolding do Nest nunca ligado nem removido. + `app.controller.spec.ts`. |
| B2 | Ficheiro/provider nunca registado | `app.service.ts` (`AppService.getHello()`) — nunca injectado em lado nenhum. + `app.service.spec.ts`. |
| B3 | Módulo órfão | `learning-paths/learning-paths.module.ts` (`LearningPathsModule`) — nunca importado (nem pelo próprio spec). Controller/Service são ligados directamente em `app.module.ts:94-95,221`. Runtime não muda ao remover. |
| B4 | Função nunca chamada | `ownershipWhere()` — `common/authz/ownership.ts:30`. Exportada, **zero call sites** em produção; só `ownership.spec.ts` a exercita (2 casos). Irmãs `assertCanAccess`/`isPrivileged` usadas em ~35 ficheiros. |
| B5 | Função local nunca chamada | `buildAvatarPrompt` — `avatar-training/avatar-training.service.ts:133`; `addWorkDays` — `leave-management/leave-management.service.ts:70`. |
| B6 | DTOs exportados, 0 usos | `RefreshTokenDto` (auth — não há endpoint de refresh), `ManagerAnalyticsFilterDto`, `DateRangeDto` (reports), `UpdateQuestionDto` (assessments), `CreateAdjustmentDto` (attendance), `UpdateInternalVacancyDto` (career), `CreateEmployeeSkillDto`, `BulkSendMessageDto` (employees), `Evaluation360UpdateQuestionDto`, `UpdateOneOnOneDto` (leadership), `UpdateLeaveRequestDto`, `UpdatePlaylistDto` (micro-learning), `PerformanceUpdateCycleDto`, `PerformanceUpdateGoalDto` (performance), `CompareVersionsDto` (process-standard), `AutomationConditionDto`, `AutomationActionDto`, `IntegrationStatus` (scalability), `BehavioralScoreDto` (avatar-training). Confirmado: 1 ocorrência each = só a declaração. |
| B7 | Enums/interfaces exportados, 0 usos | `PolicyConditionType` (acl), `MessageRole` (avatar-training), `SkillLevel` (employees), `MoodLevel` (engagement), `MentoringStatus` (leadership), `ImpactCategory` (roi-impact), `ReportingType` (organization), `BalanceAccrualType` (leave-management), `TimelineView` (history), `IAuthUser` (`common/interfaces/auth-user.interface.ts` — só citado num comentário), `ContentNoteRow` (content-library.service). |
| B8 | Imports não utilizados | **Zero.** Já enforced pelo CI (`unused-imports/no-unused-imports: error`). Nada a fazer. |
| B9 | Vars/args locais não usados | 99 avisos em 39 ficheiros. (a) args deliberadamente ignorados numa assinatura partilhada (`createdById`, `updatedById`, `actorId`, `tenantId`, `requesterId`…) → prefixar `_`. (b) cálculos mortos: `completionByCategory` (analytics.service:398), `topCourses` (instructor:415), `promotionRequests`+`avgCompetencyGap` (career:1091), `pendingLeaves` (leadership:306), `teamSize` (engagement:1205), `totalAllowances`/`totalDeductions` (pdf:205), destructuring `createdAt/updatedAt/publishedAt` em courses/learning-paths/assessments, `totalWeight` (assessments:366, evaluation360:831), etc. → ver caso a caso: apagar linha **ou** ligar valor que devia ser usado (alguns são feature incompleta). |
| B10 | Código comentado | Praticamente nenhum (2 ocorrências triviais em spec/dto). Sem acção. |

### Frontend `frontend/`

| # | Categoria | Achado |
|---|---|---|
| F1 | Componente nunca renderizado | `components/DashboardShell.tsx` — nunca importado. Substituído por `app/(platform)/layout.tsx`; comentário em `app/(platform)/employees/layout.tsx:6` refere explicitamente não voltar a montar um `DashboardShell`. Depende de `Sidebar`/`Topbar` (ambos ainda usados noutro sítio). |
| F2 | Ficheiro órfão auto-documentado | `components/courses-learn/CourseAvatarReaderExample.tsx` — órfão, mas o cabeçalho marca-o como exemplo de integração de referência ("não é código morto sem valor"). **Decisão do utilizador**: manter como doc ou apagar. |
| F3 | Handlers nunca ligados | `handleLeave` — `components/events/DetailView.tsx:82`; `handleUpdateProgress` — `components/performance/MyDashboard.tsx:156`; `toast` (de `useToast()`) — `app/(platform)/settings/page.tsx:14`. |
| F4 | Imports não utilizados | **158 ocorrências em 59 ficheiros.** ~95% ícones lucide-react (`Users`, `Target`, `Star`, `Trophy`, `Map`, `BookOpen`, `TrendingUp`, `CheckCircle2`, `Award`…) — resíduo das vagas do design system. Também `CardBody` (departments/DetailView + 3× talent-development), `CSSProperties` (live-classes/utils.ts:6), `Tab` (settings/page.tsx:11), `waitFor` (scalability/ImportUsersModal.test.tsx), `Video`/`Receipt`/`Loader2`/etc. Sem plugin `unused-imports` no eslint do frontend → não são apanhados pelo CI. |
| F5 | Estado React morto | `app/(platform)/scalability/page.tsx:210-214` — `setAlerts`/`setIntegrations`/`setAutomations` nunca chamados → `alerts`/`integrations`/`automations` são `const` de facto (dados MOCK). `components/micro-learning/FeedView.tsx:27` — `setLevel` nunca chamado mas `level` é lido (query param) → filtro "nível" na UI que nada altera (feature incompleta). |
| F6 | Código comentado | Zero blocos JSX comentados. `lib/errorReporting.ts:18` — directiva `eslint-disable` inútil (sem problema reportado). Trivial. |
| F7 | Dívida (não é código morto) | 4 avisos `react-compiler/react-compiler` — componentes saltados pelo React Compiler por regras do React desactivadas: `components/payslips/SimulateView.tsx:45`, `hooks/useAutoDismiss.ts:13`, `hooks/useSearch.ts:88` e `:117`. Registar, não remover. |

---

## Ficheiros afectados (mapa)

**Faixa A (agora):**
- `frontend/` — 59 ficheiros em `app/`, `components/`, `hooks/`, `lib/` (só remoção de linhas de import) + `frontend/lib/errorReporting.ts` (remover 1 directiva).

**Faixa B (tarefas):**
- Backend: `src/app.controller.ts`, `src/app.service.ts`, `src/app.controller.spec.ts`, `src/app.service.spec.ts`, `src/learning-paths/learning-paths.module.ts`, `src/common/authz/ownership.ts` (+ `.spec`), `src/common/interfaces/auth-user.interface.ts`, ~19 `*.dto.ts`, ~10 ficheiros de serviço (vars mortas).
- Frontend: `frontend/components/DashboardShell.tsx`, `frontend/components/events/DetailView.tsx`, `frontend/components/performance/MyDashboard.tsx`, `frontend/app/(platform)/settings/page.tsx`, `frontend/app/(platform)/scalability/page.tsx`, `frontend/components/micro-learning/FeedView.tsx`.

---

## FAIXA A — risco zero (aplicar já)

### Task A1: Frontend — remover 158 imports não utilizados

**Files:** 59 ficheiros `.ts`/`.tsx` sob `frontend/app`, `frontend/components`,
`frontend/hooks`, `frontend/lib` (lista completa no output da auditoria; gerar de
novo com o comando do passo 1).

**Interfaces:** nenhuma — só remoção de identificadores de linhas de `import`.

- [ ] **Passo 1: regenerar a lista exacta**

```bash
cd frontend
npx eslint app components hooks lib providers \
  --rule '{"@typescript-eslint/no-unused-vars":["warn",{"args":"none","varsIgnorePattern":"^(React|_)"}]}' \
  --format json > /tmp/fe-unused.json
node -e "const r=require('/tmp/fe-unused.json');for(const f of r){const u=f.messages.filter(m=>m.ruleId==='@typescript-eslint/no-unused-vars'&&/is defined but never used/.test(m.message));if(u.length)console.log(f.filePath,'::',u.map(m=>m.message.match(/'(.+?)'/)[1]).join(', '))}"
```

- [ ] **Passo 2: remover cada identificador não usado**

Para cada ficheiro: apagar o identificador da lista `import { … }`. Se a lista
ficar vazia, apagar a linha inteira. **Não** tocar em imports com efeito colateral
(`import './x.css'`). Preferir edição manual ficheiro-a-ficheiro; `eslint --fix`
**não** resolve (a regra está `off` na config do projecto).

- [ ] **Passo 3: verificar**

```bash
cd frontend
npx tsc --noEmit && npm run build && npm test
```
Esperado: os três verdes. `tsc`/`build` a falhar = um identificador ainda era
usado (JSX, tipo) — repor esse.

- [ ] **Passo 4: re-correr o scan — esperar 0 "is defined but never used"**

- [ ] **Passo 5: commit + PR**

```bash
git checkout -b chore/remove-unused-imports
git add -A && git commit  # trailer da sessão
gh pr create --title "chore: remover imports não utilizados (158 ocorrências, 59 ficheiros)" \
  --body "Auditoria de código morto — Faixa A. Só remoção de linhas de import (ícones lucide-react residuais das vagas do design system, CardBody, CSSProperties, Tab, waitFor). tsc + build + vitest verdes."
```
Aguardar check `build` verde → squash-merge.

### Task A2: Frontend — remover directiva `eslint-disable` inútil

**Files:** Modify `frontend/lib/errorReporting.ts:18`

- [ ] **Passo 1:** apagar o comentário `// eslint-disable-next-line no-console`
  da linha 18 (o eslint reporta "Unused eslint-disable directive").
- [ ] **Passo 2:** `cd frontend && npx eslint lib/errorReporting.ts` → 0 avisos.
- [ ] **Passo 3:** juntar ao PR da Task A1 (mesma branch, mesmo commit) ou commit
  separado se A1 já mergeada.

---

## FAIXA B — precisa de juízo por item (tarefas)

### Task B1: Backend — remover scaffolding NestJS não registado (`AppController`/`AppService`)

**Files:**
- Delete: `src/app.controller.ts`, `src/app.service.ts`, `src/app.controller.spec.ts`, `src/app.service.spec.ts`
- Modify: `eslint.config.mjs` / `eslint.config.staged.mjs` — remover `src/app.controller.spec.ts` e `src/prisma.service.spec.ts` de `allowDefaultProject` **só se** deixarem de existir (confirmar antes)

**Interfaces:** nenhuma — nada importa estes símbolos fora dos próprios specs.

- [ ] **Passo 1: confirmar que continuam órfãos**

```bash
grep -rn "AppController\|AppService" src --include=*.ts | grep -v "app.controller.ts\|app.service.ts\|.spec.ts"
```
Esperado: **sem output**. Se aparecer algo, PARAR e reavaliar.

- [ ] **Passo 2: confirmar que `GET /` não é testado no e2e/regressão**

```bash
grep -rn "'/'\|\"/\"" test/ src/*.spec.ts | grep -i "get\|api está"
```
Esperado: nada relevante (o health check usa `/health/ready`).

- [ ] **Passo 3: apagar os 4 ficheiros**

- [ ] **Passo 4: ajustar `allowDefaultProject` nas duas configs eslint** se
  referiam `src/app.controller.spec.ts` (removê-lo da lista).

- [ ] **Passo 5: verificar**

```bash
npm run build && npm run lint:check && npm run test:coverage
```
Esperado: verdes. A cobertura sobe ligeiramente (menos ficheiros triviais).

- [ ] **Passo 6: commit + PR**, aguardar `quality` verde, squash-merge.

### Task B2: Backend — remover módulo órfão `LearningPathsModule`

**Files:** Delete `src/learning-paths/learning-paths.module.ts`

**Interfaces:** `LearningPathsController` e `LearningPathsService` continuam a ser
importados directamente por `src/app.module.ts:94-95` e registados em
`controllers:`/`providers:` — **não tocar nessas linhas**.

- [ ] **Passo 1: confirmar órfão**

```bash
grep -rn "learning-paths.module\|LearningPathsModule" src
```
Esperado: só a linha da própria classe.

- [ ] **Passo 2: confirmar que `app.module.ts` regista Controller+Service directamente**

```bash
grep -n "LearningPaths" src/app.module.ts
```
Esperado: import do Controller + Service, ambos nos arrays. Se `LearningPathsModule`
aparecer em `imports:`, PARAR (não é órfão).

- [ ] **Passo 3: apagar o ficheiro**

- [ ] **Passo 4: verificar** `npm run build && npm run test:coverage` (o
  `learning-paths.controller.spec.ts` e os `service.*.spec.ts` não importam o módulo
  — confirmado na auditoria).

- [ ] **Passo 5:** commit + PR + `quality` verde + merge. (Pode ir no mesmo PR que B1.)

### Task B3: Backend — remover `ownershipWhere()` não utilizada

**Files:**
- Modify: `src/common/authz/ownership.ts` — apagar `export function ownershipWhere(...)` (linhas 30-37)
- Modify: `src/common/authz/ownership.spec.ts` — apagar o `describe('ownershipWhere', …)` (linhas ~42-48) e o import de `ownershipWhere`

**Interfaces:** `isPrivileged` e `assertCanAccess` **ficam** (usadas em ~35 ficheiros).

- [ ] **Passo 1: reconfirmar 0 call sites em produção**

```bash
grep -rn "ownershipWhere" src --include=*.ts | grep -v ".spec.ts"
```
Esperado: só a linha da declaração.

- [ ] **Passo 2:** apagar a função e os seus testes; ajustar o import no spec.

- [ ] **Passo 3:** `npm run build && npm run test:coverage` (o `ownership.spec.ts`
  continua a testar `isPrivileged`/`assertCanAccess`).

- [ ] **Passo 4:** commit + PR. **Nota de revisão:** decidir se se prefere manter
  `ownershipWhere` como superfície de API pública deliberada (padrão "filtro por
  ownership em `where`") — se sim, não fazer esta task e em vez disso adoptá-la em
  pelo menos 1 call site real. Recomendação: **remover** (YAGNI; `assertCanAccess`
  cobre o padrão real).

### Task B4: Backend — remover DTOs / enums / interfaces exportados sem uso

**Files:** Modify ~21 ficheiros (`src/**/**.dto.ts`, `src/common/interfaces/auth-user.interface.ts`,
`src/acl/acl.dto.ts`, etc. — lista B6+B7 acima).

**Interfaces:** nenhuma — confirmado 1 ocorrência (só a declaração) para cada.

- [ ] **Passo 1: reconfirmar cada símbolo, um a um** (não em bloco)

```bash
for s in RefreshTokenDto ManagerAnalyticsFilterDto DateRangeDto UpdateQuestionDto \
  CreateAdjustmentDto UpdateInternalVacancyDto CreateEmployeeSkillDto BulkSendMessageDto \
  Evaluation360UpdateQuestionDto UpdateOneOnOneDto UpdateLeaveRequestDto UpdatePlaylistDto \
  PerformanceUpdateCycleDto PerformanceUpdateGoalDto CompareVersionsDto AutomationConditionDto \
  AutomationActionDto BehavioralScoreDto PolicyConditionType MessageRole SkillLevel MoodLevel \
  MentoringStatus ImpactCategory ReportingType BalanceAccrualType TimelineView IAuthUser \
  ContentNoteRow IntegrationStatus; do
  echo -n "$s: "; grep -rl "\b$s\b" src --include=*.ts | grep -v ".spec.ts" | tr '\n' ' '; echo
done
```
Manter para remoção só os que devolvem **exactamente** o ficheiro da declaração.
Qualquer símbolo com 2+ ficheiros → **excluir desta task** (usado via decorator/
`PartialType`/re-export).

- [ ] **Passo 2:** para cada confirmado: apagar a `class`/`enum`/`interface`. Se o
  ficheiro ficar sem exports usados, ainda assim **manter o ficheiro** se tiver
  outras DTOs vivas; só apagar `auth-user.interface.ts` inteiro (é 1 símbolo só).

- [ ] **Passo 3:** procurar imports agora órfãos nos mesmos ficheiros e removê-los
  (o `unused-imports` do CI apanha, mas resolver antes).

- [ ] **Passo 4:** `npm run build && npm run lint:check && npm run test:coverage`.

- [ ] **Passo 5:** `npx prettier --write` nos ficheiros tocados.

- [ ] **Passo 6:** commit + PR. Dividir em 2 PRs se passar de ~15 ficheiros
  (um para DTOs, outro para enums/interfaces) para revisão mais fácil.

### Task B5: Backend — resolver 99 vars/args locais não usados

**Files:** 39 ficheiros (lista B9). Tratar por sub-lotes de ~8 ficheiros / PR.

**Interfaces:** nenhuma alteração de assinatura pública; args passam a `_arg`.

- [ ] **Passo 1: separar em duas pilhas a partir do output do lint**

```bash
npx eslint "src/**/*.ts" --config eslint.config.staged.mjs --format json > /tmp/be.json
node -e "const r=require('/tmp/be.json');for(const f of r)for(const m of f.messages)if(m.ruleId==='unused-imports/no-unused-vars')console.log((/is defined but never used.*args/.test(m.message)?'ARG ':'VAR '),f.filePath.split('src/')[1]+':'+m.line,m.message.match(/'(.+?)'/)[1])"
```
- **ARG** (arg de assinatura partilhada): renomear para `_<nome>` — mecânico, sem
  risco. Ex.: `createdById` → `_createdById`.
- **VAR** (valor calculado e deitado fora): **caso a caso** — abrir o ficheiro na
  linha indicada e decidir:
  - cálculo puro sem efeitos colaterais e sem sentido de negócio → apagar a
    declaração e o cálculo.
  - o valor **devia** estar a ser devolvido/usado (ex.: `promotionRequests`,
    `avgCompetencyGap` em `career.service.ts:1091` — parecem métricas que a
    resposta devia incluir) → isto é **feature incompleta / bug**, não código
    morto: abrir issue/nota e **não** apagar nesta task.

- [ ] **Passo 2:** aplicar os renomes ARG (todos) + as remoções VAR seguras.

- [ ] **Passo 3:** listar à parte os VAR "provável bug" com ficheiro:linha para
  triagem do utilizador (não apagar).

- [ ] **Passo 4:** `npm run build && npm run lint:check && npm run test:coverage`
  por sub-lote.

- [ ] **Passo 5:** commit + PR por sub-lote (`chore(cleanup): unused vars — lote N/5`).

### Task B6: Frontend — remover `DashboardShell.tsx` (componente nunca renderizado)

**Files:** Delete `frontend/components/DashboardShell.tsx`

**Interfaces:** `Sidebar` e `Topbar` **ficam** (usados por `app/(platform)/layout.tsx`
e outros).

- [ ] **Passo 1: confirmar 0 imports**

```bash
cd frontend && grep -rn "DashboardShell" --include=*.tsx --include=*.ts . | grep -v node_modules
```
Esperado: só a definição + o comentário em `app/(platform)/employees/layout.tsx`
(que é uma nota, não um import).

- [ ] **Passo 2:** apagar o ficheiro.

- [ ] **Passo 3:** `cd frontend && npx tsc --noEmit && npm run build && npm test`.

- [ ] **Passo 4:** commit + PR, check `build` verde, merge.

### Task B7: Frontend — remover handlers e estado mortos

**Files:**
- Modify `frontend/components/events/DetailView.tsx` — apagar `handleLeave` (L82) se
  nada no JSX o referencia (confirmar: `grep -n handleLeave`).
- Modify `frontend/components/performance/MyDashboard.tsx` — apagar
  `handleUpdateProgress` (L156) idem.
- Modify `frontend/app/(platform)/settings/page.tsx` — apagar `const { toast } = useToast()`
  não usado (L14) e o import de `Tab` não usado (L11) — este último pode já ter ido na Task A1.
- Modify `frontend/app/(platform)/scalability/page.tsx` — L210-214: trocar
  `const [alerts, setAlerts] = useState<Alert[]>(MOCK_ALERTS)` (e os 2 irmãos) por
  `const alerts = MOCK_ALERTS;` etc. **A menos que** se decida ligar a interacção
  que ficou por fazer na PR #411 — nesse caso é feature, não limpeza: deixar como está
  e abrir nota.
- Modify `frontend/components/micro-learning/FeedView.tsx` — L27: `setLevel` nunca
  chamado. `level` alimenta um query param. **Decisão do utilizador:** (a) ligar
  `setLevel` a um controlo de filtro na UI (feature), ou (b) remover `level` do
  estado e do query param (remove o filtro morto). Recomendação: (a) se o filtro
  "nível" era suposto existir; (b) se não.

- [ ] **Passo 1:** para cada handler, `grep -n <nome>` no ficheiro — confirmar 1 só
  ocorrência (a declaração) antes de apagar.
- [ ] **Passo 2:** aplicar remoções (a)/(b) conforme decisão.
- [ ] **Passo 3:** `cd frontend && npx tsc --noEmit && npm run build && npm test`.
- [ ] **Passo 4:** commit + PR + merge.

### Task B8: Frontend — decisão sobre `CourseAvatarReaderExample.tsx`

**Files:** Delete (ou manter) `frontend/components/courses-learn/CourseAvatarReaderExample.tsx`
(+ possivelmente `components/courses-learn/types.ts:86` que lhe faz referência num comentário).

- [ ] **Passo 1: decisão do utilizador** — o ficheiro está marcado como exemplo de
  integração de referência. Opções: (a) manter como está (documentação viva),
  (b) mover para `docs/` como snippet, (c) apagar.
- [ ] **Passo 2:** se (b)/(c): apagar o `.tsx`, limpar a referência em `types.ts:86`
  e no comentário de `app/(platform)/courses/[courseId]/learn/page.tsx:8`.
- [ ] **Passo 3:** `cd frontend && npx tsc --noEmit && npm run build`.
- [ ] **Passo 4:** commit + PR.

### Task B9: Frontend — registar (não remover) a dívida do React Compiler

**Files:** nenhuma alteração de código.

- [ ] Anotar em `project_innova_frontend_*` (memória) os 4 pontos onde o React
  Compiler salta optimização por regras do React desactivadas:
  `components/payslips/SimulateView.tsx:45`, `hooks/useAutoDismiss.ts:13`,
  `hooks/useSearch.ts:88`, `hooks/useSearch.ts:117`. Candidato a uma limpeza
  futura de `eslint-disable` de `react-hooks/*`. **Não** é código morto.

---

## Ordem de execução sugerida

1. **A1 + A2** (frontend, 1 PR) — risco zero, ganho de ruído imediato.
2. **B1 + B2** (backend, 1 PR) — scaffolding + módulo órfão, prova trivial.
3. **B6** (frontend, 1 PR) — `DashboardShell`.
4. **B3** (backend, 1 PR) — `ownershipWhere` (após confirmação da recomendação).
5. **B4** (backend, 1-2 PRs) — DTOs/enums/interfaces.
6. **B5** (backend, ~5 PRs) — vars locais, por lotes; separa os "prováveis bug".
7. **B7 + B8** (frontend) — dependem de decisões do utilizador (filtro `level`,
   estado `scalability`, ficheiro-exemplo).
8. **B9** — nota de memória.

## Self-review

- **Cobertura:** cada categoria pedida pelo utilizador tem tarefa — componentes
  nunca renderizados (B6, F2/B8), funções nunca chamadas (B1, B2, B3, B5), imports
  não usados (A1; backend = nada, já enforced), estado que nunca muda/lê (B7 F5),
  código comentado sem explicação (A2; resto = inexistente, documentado em B10/F6).
- **Sem placeholders:** cada task tem ficheiros exactos, comando de confirmação e
  gate de verificação real.
- **Consistência:** `assertCanAccess`/`isPrivileged` referidos igual em B3 e no
  resumo; `LearningPathsController`/`Service` (mantêm) vs `LearningPathsModule`
  (remove) consistente entre B2 e o mapa de ficheiros.
