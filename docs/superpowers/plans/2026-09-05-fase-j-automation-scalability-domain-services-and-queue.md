# Fase J — `automation`/`scalability` chamam serviços de domínio + webhooks/emails para a fila Bull — Plano de Implementação

> **Para agentes de execução:** SUB-SKILL OBRIGATÓRIA: `superpowers:subagent-driven-development` (recomendado) ou `superpowers:executing-plans`. Steps usam checkbox (`- [ ]`).
>
> **Dependências:** J-a depende de a Fase G3 (PDI → `DevelopmentPlansService`) estar em `main`; idealmente também da Fase A (`CourseCompletionService`/gamificação) e F3 (badge). Se essas não estiverem feitas, J-a delega no que existir hoje (`EnrollmentsService`, `DevelopmentPlansService`) e anota o resto como follow-up.

**Goal:** (a) `automation.executeAction` deixa de escrever `Enrollment`/`DevelopmentPlan`/`UserPoints`/`BadgeAward` por Prisma directo — passa a chamar os serviços de domínio, recuperando as validações que hoje salta (matrícula duplicada, curso `PUBLISHED`, `CourseAnalytics`, notificação, fluxo de aprovação de PDI). (b) `scalability` deixa de escrever `IntegrationConfig`/`IntegrationSyncLog` — delega em `ApiIntegrationService`. (c) Webhooks com retry e emails de criação de utilizador saem do caminho síncrono do request HTTP para a fila Bull já existente.

**Architecture:**
- **J-a:** `AutomationModule` importa `EnrollmentsModule`, `DevelopmentPlansModule` e (se existirem) `CourseCompletionModule`/um `GamificationModule`. `executeAction` mapeia cada `ActionType` para o método de domínio: `ASSIGN_COURSE → EnrollmentsService.enroll(...)`, `CREATE_PDI → DevelopmentPlansService.create(...)`, `AWARD_POINTS → GamificationService.awardPoints(...)` (extrair de `CourseCompletionService.awardCompletionPoints`, ou criar mínimo), `AWARD_BADGE → BadgeService.award(...)` (o serviço de badge canónico — pós-F3; senão `prisma.badgeAward` com guard). Erros de domínio (409 matrícula duplicada, etc.) são capturados e registados na `AutomationExecution` como falha da regra, não propagados como 500.
- **J-b:** `ScalabilityModule` importa `ApiIntegrationModule`; os pontos `scalability.service.ts:248/282/317` (`integrationConfig.create/update`, `integrationSyncLog.create`) → `ApiIntegrationService.createIntegration/updateIntegration/recordSync`. Leituras (`findMany`/`count`/`groupBy` em ~297/304/990/1040) ficam (§4). Rotas de `/scalability` inalteradas.
- **J-c:** Nova `webhooks` queue (`BullModule.registerQueue({ name: 'webhooks' })`) + `WebhooksProcessor` (`@Processor('webhooks')`, `@Process('deliver')` com retry/backoff via opções do Bull job, não `setTimeout` no request). `api-integration` enfileira em vez de fazer `fetch` síncrono. Email de criação de utilizador (`users.service.ts:602`) → enfileirar num queue de email (`notifications` queue reutilizada ou nova `email` queue). Padrão idêntico ao `audit`/`notifications` já existentes (`src/queue/processors/`).

**Tech Stack:** NestJS, `@nestjs/bull` (já em uso), Prisma, Jest (unit + integração; Redis obrigatório para os testes de fila), `class-validator`.

**Spec:** `docs/arquitetura-modular-analise.md` (§2.5, §2.10, §2.11, §3–4 domínio 9/12, §13 fase J) e `docs/arquitetura-modular.md` (Fases 4, 9).

## Global Constraints

- **Forma de resposta do frontend preservada** (§12). `POST /automation/rules/:id/execute` (e afins), `/scalability/*` de integração, `POST /users` — mantêm rota/verbo/forma. Mudança visível deliberada: `POST /users` responde **mais depressa** (email deixa de bloquear); a resposta não muda de forma.
- **Mudança de comportamento deliberada (J-a):** uma regra de automação que tente matricular um utilizador já matriculado, ou num curso não-`PUBLISHED`, passa a **falhar essa acção** (registada em `AutomationExecution` como erro) em vez de criar uma matrícula inválida. PDIs criados por automação passam a entrar no fluxo de aprovação (`DRAFT`/`PENDING_APPROVAL`), não `ACTIVE` directo.
- **`getDefaultTenantId`** em `automation.service.ts:228` e `api-integration.service.ts:180` — se a Fase E já correu, usar `resolveDefaultTenantId` do helper (`src/common/helpers/tenant.helper.ts`); senão, deixar como está (a Fase E trata).
- **Filas exigem Redis.** Os testes de J-c são de integração e precisam do Redis local a correr (memória "innova integration test infra"). O processador tem de ser idempotente (um job re-entregue não pode duplicar o efeito).
- **`ApiKey`/`Webhook`/`WebhookDelivery` não existem no schema** (`api-integration.service.ts` usa `safeM()`), mas **`IntegrationConfig`/`IntegrationSyncLog` existem** — J-b só toca estes últimos. J-c enfileira a entrega de webhook mas a **persistência** de `WebhookDelivery` continua a degradar via `safeM()` (não é objectivo desta fase migrar esses modelos — anotar).
- **Sem migração de dados.**
- `prettier`/`eslint`/`tsc` limpos; `format:check` do CI só `src/**`.
- Integração: lotes `automation`, `scalability`, `api-integration`, `users` distintos.

---

## File Structure

**Novos:**
- `src/gamification/gamification.module.ts` + `gamification.service.ts` (+ spec) — `awardPoints(userId, points, reason?)`, `awardBadge(userId, badgeKey)` — só se não existir já um serviço equivalente (verificar na Task 1; `CourseCompletionService.awardCompletionPoints` é candidato a mover para aqui).
- `src/queue/processors/webhooks.processor.ts` — `@Processor('webhooks')`, `@Process('deliver')`.
- `src/api-integration/webhook-queue.service.ts` (ou método em `ApiIntegrationService`) — `enqueueDelivery(payload)`.
- `test/integration/api-integration/webhook-queue.integration-spec.ts`, `test/integration/users/user-email-queue.integration-spec.ts`.

**Modificados:**
- `src/automation/automation.module.ts` — `imports: [..., EnrollmentsModule, DevelopmentPlansModule, GamificationModule]`.
- `src/automation/automation.service.ts` — `executeAction` delega; captura erros de domínio.
- `src/automation/automation.service.spec.ts` / `*.additional.spec.ts` — adaptar.
- `src/scalability/scalability.module.ts` — `imports: [..., ApiIntegrationModule]`.
- `src/scalability/scalability.service.ts` — 3 pontos de escrita delegam.
- `src/scalability/scalability.service.spec.ts` / `*.additional.spec.ts` — adaptar.
- `src/api-integration/api-integration.module.ts` — `imports: [..., BullModule.registerQueue({ name: 'webhooks' })]`.
- `src/api-integration/api-integration.service.ts` — `testIntegration`/entrega de webhook enfileira em vez de `fetch` síncrono com retry.
- `src/users/users.module.ts` — garantir acesso a um queue de email (reutilizar `notifications` ou registar `email`).
- `src/users/users.service.ts` — `:602` enfileira o email.
- `src/queue/queue.module.ts` — registar o `webhooks` (e `email` se novo) processor.
- `docs/arquitetura-modular-analise.md` — §2.5, §2.10, §2.11, §13 fase J.

---

### Task 1: Inventário — mapear cada `ActionType` e cada escrita a um serviço de domínio; verificar serviços de gamificação existentes

**Files:** Create `docs/superpowers/plans/notes/fase-j-map.md`

- [ ] **Step 1:** Ler `automation.service.ts` `executeAction` (~416–560) — os 4 `case` (`ASSIGN_COURSE`, `CREATE_PDI`, `AWARD_POINTS`, `AWARD_BADGE`) e o que cada um escreve/omite.
- [ ] **Step 2:** Confirmar as assinaturas dos serviços de domínio alvo: `EnrollmentsService.enroll`/`selfEnroll`/`bulkEnroll` (`src/enrollments/enrollments.service.ts`), `DevelopmentPlansService.create` (`src/development-plans/`), e procurar um serviço de pontos/badges existente (`grep -rn "userPoints.upsert\|awardPoints\|awardBadge\|BadgeService" src/`). Decidir: reutilizar ou criar `GamificationService`.
- [ ] **Step 3:** Ler `scalability.service.ts:248/260/282/317` + `ApiIntegrationService.createIntegration/updateIntegration` + procurar/definir `recordSync` (se `api-integration` não tiver um método para `IntegrationSyncLog`, adicioná-lo — TDD na Task 4).
- [ ] **Step 4:** Ler o caminho de webhook de `api-integration.service.ts` (o `fetch` com retry — `testIntegration` ~276 e qualquer entrega real) e `users.service.ts:602` (email síncrono). Registar o payload de cada job.
- [ ] **Step 5:** Ler `src/queue/processors/audit.processor.ts` + `notifications.processor.ts` + `src/queue/queue.module.ts` — o padrão a replicar.
- [ ] **Step 6: Commit da nota.**

---

### Task 2: (se necessário) `GamificationService` — `awardPoints` / `awardBadge`

**Files:** Create `src/gamification/*` (+ spec) — **só se a Task 1 concluir que não há equivalente**.

**Interfaces:** `awardPoints(userId: number, points: number, reason?: string): Promise<void>` (upsert `UserPoints`, nunca lança); `awardBadge(userId: number, badgeId: number | string): Promise<void>` (delega no serviço de badge canónico pós-F3, ou `badgeAward.create` com guard `@@unique`).

- [ ] **Step 1: Testes (devem falhar)** — `awardPoints` faz `userPoints.upsert({ where: { userId }, create: { userId, points }, update: { points: { increment: points } } })`; `awardBadge` idempotente (badge já atribuído → no-op, não lança).
- [ ] **Step 2: FAIL → implementar.** Se `CourseCompletionService.awardCompletionPoints` existir (Fase A), **mover** a lógica para aqui e fazer o `CourseCompletionService` delegar (pequeno refactor, TDD).
- [ ] **Step 3: PASS + tsc + prettier + commit.**

---

### Task 3: J-a — `automation.executeAction` delega nos serviços de domínio

**Files:** Modify `src/automation/automation.module.ts`, `automation.service.ts`; Test os specs.

- [ ] **Step 1: Reescrever os testes dos 4 `case` (devem falhar)** — mock de `EnrollmentsService`/`DevelopmentPlansService`/`GamificationService`; cada `case` delega. Exemplos:

```ts
it('ASSIGN_COURSE delega em EnrollmentsService.enroll e NÃO escreve prisma.enrollment', async () => {
  mockEnrollments.enroll.mockResolvedValue({ id: 1 });
  await service.executeAction(ruleAssignCourse, { userId: 10, courseId: 5 }, 10);
  expect(mockEnrollments.enroll).toHaveBeenCalledWith(expect.objectContaining({ userId: 10, courseId: 5 }));
  expect(mockPrisma.enrollment.create).not.toHaveBeenCalled();
});

it('ASSIGN_COURSE — matrícula duplicada (409 do domínio) → acção registada como falha, não 500', async () => {
  mockEnrollments.enroll.mockRejectedValue(new ConflictException('já matriculado'));
  const res = await service.executeAction(ruleAssignCourse, { userId: 10, courseId: 5 }, 10);
  expect(res.success).toBe(false);
  expect(res.error).toMatch(/matriculado/);
});

it('CREATE_PDI delega em DevelopmentPlansService.create (entra em DRAFT/PENDING, não ACTIVE)', async () => {
  mockDevPlans.create.mockResolvedValue({ id: 7, status: 'DRAFT' });
  await service.executeAction(ruleCreatePdi, { userId: 10 }, 10);
  expect(mockDevPlans.create).toHaveBeenCalled();
});

it('AWARD_POINTS / AWARD_BADGE delegam em GamificationService', async () => { /* ... */ });
```

- [ ] **Step 2: FAIL.**
- [ ] **Step 3: Implementar** — `automation.module.ts` `imports: [..., EnrollmentsModule, DevelopmentPlansModule, GamificationModule]`; construtor `+ enrollments, developmentPlans, gamification`. Em `executeAction`, cada `case`:
  - `ASSIGN_COURSE`: `try { await this.enrollments.enroll({ userId, courseId, mandatory: payload.mandatory }); } catch (e) { return { success: false, error: e.message }; }` — remover o `prisma.enrollment.*` + o `auditLog` local (o `EnrollmentsService` já audita/notifica).
  - `CREATE_PDI`: `this.developmentPlans.create(mappedDto)` — remover o `prisma.developmentPlan.*`.
  - `AWARD_POINTS`: `this.gamification.awardPoints(userId, payload.points, 'automation')`.
  - `AWARD_BADGE`: `this.gamification.awardBadge(userId, payload.badgeId)`.
  - O resultado de cada acção continua a ser agregado no retorno de `executeAction` e persistido em `AutomationExecution` como hoje.
- [ ] **Step 4: PASS** (`npx jest src/automation/`).
- [ ] **Step 5: `grep -n "prisma.\(enrollment\|developmentPlan\|userPoints\|badgeAward\)\." src/automation/automation.service.ts`** → zero.
- [ ] **Step 6: prettier + tsc + eslint + commit.**

---

### Task 4: J-b — `scalability` delega em `ApiIntegrationService` para `IntegrationConfig`/`IntegrationSyncLog`

**Files:** Modify `src/scalability/scalability.module.ts`, `scalability.service.ts`; possivelmente `src/api-integration/api-integration.service.ts` (novo `recordSync`); Test os specs.

- [ ] **Step 1: (se preciso) `ApiIntegrationService.recordSync(integrationId, dto)`** — TDD: cria `IntegrationSyncLog` com o shape que `scalability.service.ts:317` grava.
- [ ] **Step 2: Reescrever os testes de `scalability` para os 3 pontos de escrita (devem falhar)** — mock de `ApiIntegrationService`; `createIntegration`/`updateIntegration`/o método que grava `IntegrationSyncLog` delegam.
- [ ] **Step 3: FAIL.**
- [ ] **Step 4: Implementar** — `scalability.module.ts` `imports: [..., ApiIntegrationModule]`; construtor `+ apiIntegration`; `:248` → `this.apiIntegration.createIntegration(dto)`; `:282` → `this.apiIntegration.updateIntegration(id, dto)`; `:317` → `this.apiIntegration.recordSync(id, dto)`. Leituras (`:297/304/310/334/990/1040`) ficam (§4).
- [ ] **Step 5: PASS** (`npx jest src/scalability src/api-integration`).
- [ ] **Step 6: `grep -n "integrationConfig.\(create\|update\)\|integrationSyncLog.create" src/scalability/scalability.service.ts`** → zero.
- [ ] **Step 7: prettier + tsc + eslint + commit.**

---

### Task 5: J-c — fila `webhooks` + processador

**Files:** Create `src/queue/processors/webhooks.processor.ts`; Modify `src/api-integration/api-integration.module.ts`, `api-integration.service.ts`, `src/queue/queue.module.ts`; Test `test/integration/api-integration/webhook-queue.integration-spec.ts`

- [ ] **Step 1: Registar a fila** — `api-integration.module.ts` `imports: [..., BullModule.registerQueue({ name: 'webhooks' })]`; `queue.module.ts` regista `WebhooksProcessor` em `providers` (como `AuditProcessor`/`NotificationsProcessor`).
- [ ] **Step 2: Processador (teste de integração — deve falhar)**

```ts
it('um job "deliver" na fila webhooks faz o POST ao endpoint e regista o resultado', async () => {
  // usa um servidor HTTP local (nock/undici mock ou um express efémero) como alvo
  await webhooksQueue.add('deliver', { url: localUrl, payload: { x: 1 }, secret: 's', integrationId: 1 });
  await waitForJob();
  expect(receivedBody).toEqual({ x: 1 });
});

it('endpoint devolve 500 → job falha e o Bull agenda retry (attempts>1, backoff)', async () => { /* ... */ });

it('job re-entregue (idempotência) não duplica efeito persistido', async () => { /* ... */ });
```

- [ ] **Step 3: FAIL → implementar** `WebhooksProcessor`:

```ts
@Processor('webhooks')
export class WebhooksProcessor {
  private readonly logger = new Logger(WebhooksProcessor.name);
  @Process('deliver')
  async deliver(job: Job<{ url: string; payload: unknown; secret?: string; integrationId: number }>) {
    const { url, payload, secret } = job.data;
    const body = JSON.stringify(payload);
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (secret) headers['X-Signature'] = hmacSha256(secret, body); // reutilizar o helper de assinatura de api-integration
    const res = await fetch(url, { method: 'POST', headers, body, signal: AbortSignal.timeout(15000) });
    if (!res.ok) throw new Error(`webhook ${url} → ${res.status}`); // lançar → Bull faz retry conforme as opções do job
    // persistência de WebhookDelivery continua via safeM() em api-integration (fora do âmbito)
  }
}
```

- [ ] **Step 4: `api-integration.service.ts` enfileira** — substituir o `fetch` síncrono (com retry manual) da entrega de webhook por:

```ts
await this.webhooksQueue.add('deliver', { url, payload, secret, integrationId: id }, {
  attempts: cfg.retryMax ?? 3,
  backoff: { type: 'exponential', delay: 2000 },
  removeOnComplete: true,
});
```

  (`testIntegration` pode continuar a fazer um `HEAD` síncrono de 5s — é um teste manual explícito do utilizador, não uma entrega.)

- [ ] **Step 5: PASS** (`npx cross-env NODE_ENV=test jest --config test/jest-integration.json ... --testPathPatterns "test/integration/(api-integration)/"` — Redis a correr).
- [ ] **Step 6: prettier + tsc + eslint + commit.**

---

### Task 6: J-c — email de criação de utilizador para a fila

**Files:** Modify `src/users/users.module.ts`, `users.service.ts`; Test `test/integration/users/user-email-queue.integration-spec.ts` + o spec unitário de `users`.

- [ ] **Step 1: Teste (deve falhar)** — `POST /users` (ou `usersService.create`) enfileira um job de email e **retorna sem esperar** pelo envio; o utilizador é criado mesmo que o "envio" falhe.

```ts
it('create enfileira o email de boas-vindas e não bloqueia na falha de envio', async () => {
  mockEmailQueue.add.mockResolvedValue({});
  const u = await service.create(dto);
  expect(u).toBeDefined();
  expect(mockEmailQueue.add).toHaveBeenCalledWith('welcome', expect.objectContaining({ userId: u.id }));
});
```

- [ ] **Step 2: FAIL.**
- [ ] **Step 3: Implementar** — reutilizar a fila `notifications` (adicionar um `@Process('email')` ao `NotificationsProcessor`, ou um job `type: 'email'`) **ou** registar `BullModule.registerQueue({ name: 'email' })` + um `EmailProcessor` que chama o `MailService` existente. Em `users.service.ts:602`, substituir a chamada síncrona ao envio por `this.emailQueue.add('welcome', { userId, email, ... }, { attempts: 3, backoff: { type: 'exponential', delay: 5000 }, removeOnComplete: true })`.
- [ ] **Step 4: PASS** (`npx jest src/users/` + o spec de integração com Redis).
- [ ] **Step 5: prettier + tsc + eslint + commit.**

---

### Task 7: Verificação completa + doc

- [ ] **Step 1:** `npx jest src/automation src/scalability src/api-integration src/users src/gamification` ; `npm test`.
- [ ] **Step 2:** integração dos lotes `automation`, `scalability`, `api-integration`, `users` (Redis obrigatório).
- [ ] **Step 3:** `npx prettier --check "src/**/*.ts"` ; `npx eslint src/automation src/scalability src/api-integration src/users src/queue --config eslint.config.staged.mjs` ; `npx tsc --noEmit`.
- [ ] **Step 4: `grep` de confirmação:**

```bash
grep -rn "prisma.\(enrollment\|developmentPlan\|userPoints\|badgeAward\)\.\(create\|update\|upsert\)" src/automation/
grep -rn "integrationConfig.\(create\|update\)\|integrationSyncLog.create" src/scalability/
```

Ambos sem hits.

- [ ] **Step 5:** Actualizar `docs/arquitetura-modular-analise.md`:
  - §2.5: nota "`automation.executeAction` delega nos serviços de domínio (matrícula/PDI/pontos/badge) — recupera guardas de matrícula duplicada, curso `PUBLISHED`, `CourseAnalytics`, notificação e fluxo de aprovação de PDI. `scalability` delega em `ApiIntegrationService` para `IntegrationConfig`/`IntegrationSyncLog`. — J 2026-09-05.".
  - §2.10: nota "webhooks (retry) e email de criação de utilizador movidos para a fila Bull (`webhooks`/`email`). `automation.runAllActiveRules` e export XLSX/PDF pesado ficam como follow-up.".
  - §2.11: nota de que `WebhookDelivery`/`ApiKey`/`Webhook` continuam a degradar via `safeM()` (migração desses modelos fora do âmbito).
  - §13 linha J: marcar concluída → **roteiro A–J completo** (com F2/F3 e G1–G4 conforme o seu próprio estado).
- [ ] **Step 6: Commit.**

---

### Task 8: PR e CI

- [ ] Branch `refactor/automation-scalability-domain-and-queue` + push.
- [ ] PR — corpo:
  - **Mudança de comportamento (J-a):** acções de automação com input inválido (matrícula duplicada, curso não publicado) passam a falhar a acção em vez de criar dados inválidos; PDIs por automação entram no fluxo de aprovação. Confirmar com o dono do produto.
  - **J-c:** `POST /users` responde mais depressa (email assíncrono); entrega de webhook passa a assíncrona com retry gerido pelo Bull — a latência de entrega deixa de contar no request, mas a confirmação de entrega ao chamador também deixa de ser síncrona.
  - **Requer Redis** em todos os ambientes (já era requisito para audit/notifications).
  - Sem migração de dados.
- [ ] Aguardar `quality` verde → `gh pr merge --squash --auto`.

---

## Self-Review

**1. Cobertura da spec (§2.5 + §2.10 + §13 fase J):**
- "`automation.executeAction` escreve directamente em `Enrollment`/`DevelopmentPlan`/`UserPoints`, ignorando guardas" → Task 3 (delegação + captura de erro de domínio). ✔
- "`scalability` escreve em `IntegrationConfig`/`IntegrationSyncLog`" → Task 4. ✔
- "webhooks com retry+backoff dentro do request HTTP" + "emails síncronos sem retry a bloquear criação de utilizador" → Tasks 5–6 (fila Bull). ✔
- "exportação XLSX/PDF pesada" + "`automation.runAllActiveRules` em loop sequencial" → **fora do âmbito desta fase** (anotado no §2.10 como follow-up — são optimizações maiores e independentes). ✔
- §2.11 "Base64 em vez de KMS" para credenciais de integração → **não** tratado aqui (é um item de segurança separado, não de acoplamento/fila) — anotado. ✔

**2. Placeholders:** a Task 1 fixa o mapa `ActionType` → serviço e confirma se `GamificationService` precisa de ser criado. A Task 2 é condicional ("só se não existir equivalente"). O `WebhooksProcessor` e o enqueue têm código concreto. Sem "TODO" sem critério.

**3. Consistência de tipos:**
- `GamificationService.awardPoints(userId, points, reason?)`, `.awardBadge(userId, badgeId)` — Task 2, usados na Task 3.
- `EnrollmentsService.enroll(dto)`, `DevelopmentPlansService.create(dto)` — assinaturas a confirmar na Task 1 Step 2; usadas na Task 3.
- `ApiIntegrationService.createIntegration(dto)`, `.updateIntegration(id, dto)`, `.recordSync(integrationId, dto)` — Task 4 (o último criado se não existir); usados no `scalability`.
- Job `webhooks:deliver` payload `{ url, payload, secret?, integrationId }` — consistente entre Task 5 Step 2 (teste), Step 3 (processador), Step 4 (enqueue). ✔

**4. Riscos anotados:** dependência de G3 (PDI) em `main` (e idealmente A/F3) — fallback anotado; mudança de comportamento de automação (PR + dono do produto); confirmação de entrega de webhook deixa de ser síncrona (PR); Redis obrigatório para os testes e ambientes; idempotência do processador (job re-entregue). Sem ciclo de módulos: `automation`/`scalability` → serviços de domínio → Prisma; os serviços de domínio não importam `automation`/`scalability`.
