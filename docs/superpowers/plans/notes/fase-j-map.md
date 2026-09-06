# Fase J — mapa de execução (Task 1)

> Inventário real do código em `main` @ `0fd8b50` (pós-Fase H). Corrige as
> derivas de linha/assinatura do plano `2026-09-05-fase-j-*.md`.

## Decisão de âmbito (utilizador, 2026-09-06)

**Split.** Esta fase entrega **J-a** (automation → serviços de domínio) + **J-c**
(webhooks/email → fila Bull) + a delegação **segura** do `IntegrationSyncLog` em
`scalability.triggerSync`. O *merge* de `createIntegration`/`updateIntegration`
entre `scalability` e `api-integration` fica como **follow-up documentado** —
as duas implementações divergem em encriptação de credenciais
(`encryptSensitiveData`), validação de tenant (`findTenantOrFail`), validação do
enum `authType`, mapeamento das colunas legadas `endpoint`/`config`, backend de
auditoria (common `AuditService` vs `prisma.auditLog` inline) e **forma do DTO**
(`CreateIntegrationConfigDto` vs `CreateIntegrationDto`). Delegar às cegas
perderia a encriptação de credenciais (regressão de segurança).

---

## J-a — `automation.executeAction`

`src/automation/automation.service.ts` — `executeAction` é **privado** (~407–677).
Testado indirectamente via `triggerEvent()` / `rerunExecution()` e via
`jest.spyOn(service as any, 'executeAction')`. `ActionType` (`automation.dto.ts:34`)
usa valores lowercase (`assign_course`, `create_pdi`, `award_points`, `award_badge`).

| `case` | escreve hoje (linha aprox.) | guarda que salta | delega para |
|---|---|---|---|
| `ASSIGN_COURSE` | `prisma.enrollment.create` + `.catch()` swallow (~458) | matrícula duplicada, curso `PUBLISHED`, `courseAnalytics++`, notificação `COURSE_ENROLLED` | `EnrollmentsService.enroll({ userId, courseId, mandatory? })` |
| `CREATE_PDI` | `prisma.developmentPlan.create` (~485) | notificação `PDI_CREATED`; (fluxo de aprovação já era DRAFT) | `DevelopmentPlansService.create({ userId, name, goal })` |
| `AWARD_POINTS` | `prisma.userPoints.upsert` (~512) | — (lógica idêntica; centralizar) | `GamificationService.awardPoints(userId, points, 'automation')` |
| `AWARD_BADGE` | `prisma.badge.findFirst({name})` + `prisma.badgeAward.create` (~526/539) | idempotência (`@@unique([badgeId,userId])` pós-F3) | `GamificationService.awardBadge(userId, badgeCode)` (resolve name→id lá dentro) |

**Assinaturas confirmadas:**
- `EnrollmentsService.enroll(dto: EnrollmentsCreateEnrollmentDto)` — `enrollments.service.ts:206`.
  `dto`: `userId!`, `courseId!`, `deadline?`, `mandatory?`, `origin?`, `learningPathId?`, `assignedById?`.
  Lança `ConflictException` (matrícula activa existe), `NotFoundException` (curso), `BadRequestException` (não `PUBLISHED`).
  Dispara `courseAnalytics.updateMany` + `notificationLog` em fire-and-forget.
- `DevelopmentPlansService.create(dto: CreateDevelopmentPlanDto)` — `development-plans.service.ts:137`.
  Campos usados: `name`, `goal`, `userId`, `managerId?`, `priority?`, `period?`, `startDate?`, `endDate?`,
  `performanceCycleId?`, `isTemplate?`, `notes?`, `focusCompetencyIds?`. **Força `status: 'DRAFT'`** (ignora qualquer status do dto).
  Dispara notificação `PDI_CREATED`.
- **Não existe** `GamificationService` — criar (Task 2). Único candidato a mover:
  `CourseCompletionService.awardCompletionPoints(userId)` (`course-completion.service.ts:315`, privado, flat 100 pts, nunca lança).

**Comportamento novo (deliberado, no corpo do PR):** uma acção `ASSIGN_COURSE` para
um utilizador já matriculado / curso não publicado passa a **falhar essa acção**
(`{ success: false, error }`, registada em `AutomationExecution`), não a criar
matrícula inválida nem a rebentar 500. Erros de domínio (`ConflictException`,
`BadRequestException`, `NotFoundException`) são capturados por `case` e convertidos
em resultado de falha da acção.

**Módulo:** `automation.module.ts` importa hoje só `PrismaModule`. Adicionar
`EnrollmentsModule`, `DevelopmentPlansModule`, `GamificationModule` (todos exportam
o serviço; nenhum importa `automation` → sem ciclo).

**Specs a adaptar** (4): `automation.service.spec.ts`, `automation.service.additional.spec.ts`,
`automation.service.errors.spec.ts`, `automation.service.progress.spec.ts` — cada
`Test.createTestingModule({ providers: [AutomationService, { provide: PrismaService … }] })`
ganha mocks de `EnrollmentsService`/`DevelopmentPlansService`/`GamificationService`.

## J-b (parcial) — só `IntegrationSyncLog`

`scalability.service.ts:317` (`triggerSync`) — `prisma.integrationSyncLog.create({ data: { integrationId, status: 'RUNNING' } })`.
Precisa do `syncLog.id` de volta. `api-integration.service.ts` **não** toca
`integrationSyncLog` (usa `apiIntegrationLog`, modelo distinto) → adicionar
`ApiIntegrationService.recordSync(integrationId): Promise<{ id … }>` que cria a
linha `RUNNING` e devolve-a. `scalability.module.ts` importa `ApiIntegrationModule`.
Leituras (`getIntegrationSyncLogs` ~334, `listIntegrations` include ~302, dashboards
~990/1040) ficam. `createIntegration`/`updateIntegration` de `scalability` **não se tocam**.

## J-c — filas Bull

**Padrão real** (não o do plano): o módulo dono regista a fila **e** o processador.
- `src/common/modules/audit.module.ts`: `imports: [BullModule.registerQueue({ name: 'audit' })]`, `providers: [AuditService, AuditProcessor]`.
- `src/notifications/notifications.module.ts`: idem com `'notifications'` + `NotificationsProcessor`.
- `src/queue/queue.module.ts` é **só** o `BullModule.forRootAsync` (Redis config, `@Global`). Não regista processadores.
- `audit.processor.ts`: `@Processor('audit')` + `@Process('write')` → `prisma.auditLog.create({ data: job.data })`. Minimalista.

**Webhooks** (`api-integration.service.ts`):
- `dispatchWebhook` (~715–845) — `fetch(hook.url, …)` síncrono com retry manual
  (`RETRY_DELAYS = [10,60,300,1800]`, `cap 5s` em dev) e `safeM(prisma,'webhookDelivery')`
  (modelo não existe → todos os `.create`/`.update` já são no-op). `body =
  JSON.stringify({ event, data: payload, timestamp })`. `signPayload(secret, body)` →
  `'sha256=' + hmac`. Headers: `Content-Type`, `X-Innova-Event`, `X-Innova-Delivery`,
  `X-Innova-Signature`. `maxAttempts = (hook.retryMax ?? 3) + 1`.
- `testIntegration` (~266) — `fetch(url, { method: 'HEAD', timeout 5s })`. **Fica
  síncrono** (é teste manual do utilizador, não entrega).
- Novo: `BullModule.registerQueue({ name: 'webhooks' })` em `api-integration.module.ts`;
  `WebhooksProcessor` (`@Processor('webhooks')`, `@Process('deliver')`) em
  `src/queue/processors/` + registado nos `providers` de `ApiIntegrationModule`.
  `dispatchWebhook` passa a `this.webhooksQueue.add('deliver', { url, payload, secret, webhookId }, { attempts, backoff: exponential 2000ms, removeOnComplete: true })`.
  Persistência de `WebhookDelivery` continua via `safeM()` (fora de âmbito — anotar).

**Email criação de utilizador** (`users.service.ts:602`, `createUserWithInvite`):
- `await this.mail.sendUserInvite(dto.email, dto.fullName, tempPassword)` — **bloqueia** a
  criação (comentário no código: "Enviar email ANTES de criar o user — se SMTP falhar, o user não é criado").
  Mudança deliberada: user é criado à mesma; email vai para a fila.
- `MailModule` já importado em `users.module.ts`. `MailService.sendUserInvite(email, fullName, tempPassword)`.
- Novo: `BullModule.registerQueue({ name: 'email' })` em `users.module.ts` + `EmailProcessor`
  (`@Processor('email')`, `@Process('userInvite')` → `mailService.sendUserInvite(...)`),
  registado nos `providers` de `UsersModule`. `MailModule` tem de ser importado onde
  o `EmailProcessor` vive (fica em `UsersModule`, que já o importa).
- `users.service.ts:602` → `this.emailQueue.add('userInvite', { email, fullName, tempPassword }, { attempts: 3, backoff: { type: 'exponential', delay: 5000 }, removeOnComplete: true })`.

**Testes de integração** (Redis obrigatório): `test/integration/api-integration/webhook-queue.integration-spec.ts`,
`test/integration/users/user-email-queue.integration-spec.ts`. Processadores idempotentes.

## Follow-ups registados (corpo do PR + §2.10)

1. Merge `createIntegration`/`updateIntegration` `scalability` ↔ `api-integration`
   (encriptação de credenciais + tenant + `authType` + DTO adapter).
2. `automation.runAllActiveRules` em loop sequencial → paralelizar/fila.
3. Export XLSX/PDF pesado → fila.
4. `WebhookDelivery`/`ApiKey`/`Webhook` continuam a degradar via `safeM()` (migração fora de âmbito).
5. Base64 em vez de KMS para credenciais de integração (item de segurança separado).
