# Certificados — Fatia 1: Motor Central Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Emissão de certificados controlada por regras, idempotente, com PDF real + QR, download com ownership e página pública de verificação — substituindo o PDF falso e o botão morto actuais.

**Architecture:** Novo módulo `src/certificates/` com lógica pura (código, avaliação de regras) separada do serviço de emissão (Prisma) e do renderizador de PDF (pdfkit + `qrcode`). Os escritores actuais (`course-completion`, `events`) passam a chamar o serviço de emissão. A verificação pública lê sempre o registo actual. Reutiliza `Certificate` (migração aditiva).

**Tech Stack:** NestJS, Prisma/PostgreSQL, pdfkit, qrcode, Jest (unit + `test/integration`), Next.js + TanStack Query + Vitest.

**Spec:** `docs/superpowers/specs/2026-10-19-certificados-design.md` (requisitos de detalhe: `docs/prompt_certificados_claude_code.md` §5, 7, 8, 13, 15, 16).

**Fora desta fatia (planos próprios, seguintes):** 9 templates + editor + versionamento (F2), aba partilhada Cursos/Gestão de Formações (F3), revogação/reemissão/importação/alertas/lote (F4), colaborador/gestor/exports (F5). Nesta fatia o PDF usa um layout único "corporativo clássico" atrás de uma interface de renderizador que a F2 substitui.

## Global Constraints

- Prisma: confirmar modelos/campos em `prisma/schema.prisma`; `User.fullName` (nunca `name`); `AuditLog.entity`; `Enrollment` compound key `courseId_userId`; migrações manuais (`prisma migrate diff` + ficheiro em `prisma/migrations/<timestamp>_<nome>/migration.sql`, `migrate dev` falha sem TTY); timestamp > `20261119000000`.
- `ValidationPipe` global é `whitelist` + `forbidNonWhitelisted`: todo o DTO precisa de decoradores `class-validator`.
- Autorização sempre no backend, `@Roles(...)` com `Role` de `src/auth/enums/role.enum.ts`; ownership explícito por método (`userId === user.id` ou papel ADMIN/RH).
- Código de verificação: aleatório (`crypto.randomBytes`), nunca derivado de ids/`Date.now()`.
- Auditoria via `AuditService` de `src/common/services/audit.service.ts` (`log({ action, entity, entityId, userId, metadata, ... })`).
- Emissão revalida os factos no servidor; nunca emite por abrir/aceder a um curso.
- Commits locais Conventional Commits em PT, terminados com `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`; backend `npx prettier --write` nos ficheiros alterados; nunca push/merge.
- Sem dados fictícios; botões só com comportamento real.

## Review Focus

- Dois eventos de conclusão em simultâneo para o mesmo (titular, atividade, ciclo) → exactamente 1 certificado (teste de concorrência em integração).
- Código inexistente / com espaços / maiúsculas-minúsculas / muito longo na verificação pública → 404 limpo, sem 500 nem eco do input.
- Certificado revogado ou expirado → a página pública mostra o estado e nunca "válido".
- Download do PDF por outro colaborador (IDOR) → 403; por RH/ADMIN → 200.
- Regra sem critérios activos → nunca elegível (não emite "por omissão").
- Colaborador sem nota (curso sem quiz) com regra `minScore` → não elegível, motivo `MIN_SCORE_NOT_MET`.
- Nome com acentos/emoji/muito longo no PDF → gera sem rebentar nem cortar o layout.

## File Structure

- Create `src/certificates/certificate-code.ts` — `generateVerificationCode()`, `normalizeVerificationCode()`.
- Create `src/certificates/certificate-rules.ts` — tipos `RuleCriteria`, `ActivityFacts`, `EligibilityResult`; `evaluateEligibility()`.
- Create `src/certificates/certificate-facts.service.ts` — recolhe `ActivityFacts` reais (matrícula, quiz, presença) para uma atividade.
- Create `src/certificates/certificate-issuance.service.ts` — `issue()`; idempotência, validade, snapshot, auditoria, notificação.
- Create `src/certificates/certificate-renderer.ts` — `renderCertificatePdf(snapshot, verifyUrl)` → Buffer.
- Create `src/certificates/certificates.service.ts` — `listMine`, `getPdfFor`, `verifyPublic`.
- Create `src/certificates/certificates.controller.ts` + `public-certificates.controller.ts` + `certificates.dto.ts` + `certificates.module.ts`.
- Modify `prisma/schema.prisma`, add migration; `src/app.module.ts`; `src/course-completion/course-completion.service.ts:376-410`; `src/events/events.service.ts:1214-1235`; `src/pdf/pdf.controller.ts:45-62`; `src/courses/courses.controller.ts:106-117` (delegar).
- Frontend: create `frontend/app/verify/[code]/page.tsx`, `frontend/components/certificates/VerifyResultCard.tsx`; modify `frontend/middleware.ts` (PUBLIC_PATHS), `frontend/components/courses/CertificatesView.tsx`, `frontend/components/courses/types.ts`, `frontend/lib/queryKeys.ts`.

---

### Task 1: Schema — regras e campos de emissão

**Files:** Modify `prisma/schema.prisma` (modelo `Certificate` ~2680, novo `CertificateRule`, enums); Create `prisma/migrations/20261120000000_certificate_rules_issuance/migration.sql`; Test `test/integration/certificates-schema.integration-spec.ts`.

**Interfaces:**
- Produces: enum `CertificateStatus { PENDING PENDING_APPROVAL ACTIVE EXPIRED REVOKED }`; enum `CertificateIssueMode { AUTOMATIC MANUAL APPROVAL }`; enum `CertificateActivityKind { COURSE TRAINING LEARNING_PATH EVENT }`; em `Certificate`: `status CertificateStatus @default(ACTIVE)`, `activityKind CertificateActivityKind?`, `activityId Int?`, `cycleKey String @default("1")`, `dedupKey String? @unique`, `hours Float?`, `snapshot String? @db.Text` (JSON.stringify); modelo `CertificateRule { id Int @id @default(autoincrement()), activityKind, activityId, mode CertificateIssueMode, criteria String @db.Text (JSON), templateId String?, validityDays Int?, active Boolean @default(true), createdById Int?, createdAt, updatedAt; @@unique([activityKind, activityId]) }`.

- [ ] **Step 1: Write failing integration test** — `it('persiste regra e impede dedupKey duplicada')`: cria `CertificateRule`, depois dois `certificate.create` com o mesmo `dedupKey`; espera P2002 no segundo.
- [ ] **Step 2: Run** o teste com o config de integração existente em `test/integration` (confirmar o nome do ficheiro de config) → FAIL (modelo inexistente).
- [ ] **Step 3: Editar schema + escrever migration.sql** aditiva (só `CREATE TYPE`, `ALTER TABLE ... ADD COLUMN`, `CREATE TABLE`, índices; registos existentes ficam `status=ACTIVE`, `dedupKey=NULL`; backfill: `status='EXPIRED'` onde `expiresAt < now()` e não revogado, `status='REVOKED'` onde `revoked`). Gerar com `npx prisma migrate diff` (datasource → datamodel, `--script`) e rever à mão.
- [ ] **Step 4: Aplicar** `npx prisma migrate deploy && npx prisma generate`; re-correr o teste → PASS. Confirmar `npx prisma migrate status` limpo.
- [ ] **Step 5: Commit** `feat(certificates): schema de regras e campos de emissão`.

### Task 2: Código de verificação (lógica pura)

**Files:** Create `src/certificates/certificate-code.ts`; Test `src/certificates/certificate-code.spec.ts`.

**Interfaces:** Produces `generateVerificationCode(length = 16): string` (alfabeto Crockford base32 sem I/L/O/U, maiúsculas); `normalizeVerificationCode(raw: string): string | null` (trim, maiúsculas, remove hífens/espaços; devolve `null` se vazio, > 64 chars ou com caracteres fora do alfabeto).

- [ ] **Step 1: Tests** — 1000 códigos únicos e todos com 16 chars do alfabeto; `normalizeVerificationCode(' ab12-cd34 ')==='AB12CD34'`; `normalizeVerificationCode('x'.repeat(65))===null`; `normalizeVerificationCode("1' OR 1=1")===null`; `normalizeVerificationCode('')===null`.
- [ ] **Step 2: Run** `npx jest src/certificates/certificate-code` → FAIL.
- [ ] **Step 3: Implement** com `crypto.randomBytes` (sem `Math.random`).
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(certificates): geração e normalização do código de verificação`.

### Task 3: Avaliação de elegibilidade (lógica pura)

**Files:** Create `src/certificates/certificate-rules.ts`; Test `src/certificates/certificate-rules.spec.ts`.

**Interfaces:** Produces
```ts
export interface RuleCriteria { requireFullCompletion?: boolean; minScore?: number; minAttendancePct?: number; requireInstructorApproval?: boolean; requireManagerApproval?: boolean; requirePracticalPass?: boolean }
export interface ActivityFacts { completionPct: number; bestScore: number | null; attendancePct: number | null; practicalPassed: boolean | null; instructorApproved: boolean; managerApproved: boolean }
export type MissingReason = 'COMPLETION_INCOMPLETE'|'MIN_SCORE_NOT_MET'|'ATTENDANCE_BELOW_MIN'|'PRACTICAL_NOT_PASSED'|'INSTRUCTOR_APPROVAL_MISSING'|'MANAGER_APPROVAL_MISSING'|'NO_CRITERIA'
export interface EligibilityResult { eligible: boolean; missing: MissingReason[] }
export function evaluateEligibility(criteria: RuleCriteria, facts: ActivityFacts): EligibilityResult
```
No modo `APPROVAL` as aprovações de instrutor/gestor são tratadas pela camada de emissão (Task 5), que as exclui dos critérios avaliados antes de chamar esta função.

- [ ] **Step 1: Tests** (valores do spec, `minScore:70`): 100% + nota 70 → elegível; nota 69 → `MIN_SCORE_NOT_MET`; `bestScore:null` com `minScore` → `MIN_SCORE_NOT_MET`; presença `null` com `minAttendancePct` → `ATTENDANCE_BELOW_MIN`; `criteria={}` → `{eligible:false, missing:['NO_CRITERIA']}`; vários critérios falhados devolvem todos os motivos.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(certificates): avaliação de elegibilidade por critérios`.

### Task 4: Recolha de factos reais

**Files:** Create `src/certificates/certificate-facts.service.ts`; Test `src/certificates/certificate-facts.service.spec.ts` (+ cobertura real no teste de integração da Task 5).

**Interfaces:** Consumes `ActivityFacts` (Task 3). Produces `CertificateFactsService.collect(userId: number, kind: CertificateActivityKind, activityId: number): Promise<ActivityFacts & { hours: number | null; title: string }>`; lança `NotFoundException` se a atividade não existir.

- [ ] **Step 1: Tests (Prisma mockado, só para o mapeamento):** `COURSE` com matrícula `COMPLETED` e melhor `QuizAttempt` 82 → `completionPct:100,bestScore:82`; matrícula inexistente → `completionPct:0`; `EVENT` com `EventParticipant.status==='PRESENT'` → `attendancePct:100`, senão `0`. **Antes de escrever:** ler em `schema.prisma` os modelos `Enrollment`, `QuizAttempt`, `EventParticipant`, `Training` e usar os nomes de campo reais, não os deste plano.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** (COURSE e EVENT obrigatórios; TRAINING e LEARNING_PATH: implementar se os modelos de presença/progresso existirem, senão lançar `NotImplementedException('FACTS_UNSUPPORTED')` e listar no resumo final como pendência).
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(certificates): recolha de factos de progresso, nota e presença`.

### Task 5: Serviço de emissão idempotente

**Files:** Create `src/certificates/certificate-issuance.service.ts`; Test `src/certificates/certificate-issuance.service.spec.ts`, `test/integration/certificates-issuance.integration-spec.ts`.

**Interfaces:** Consumes `evaluateEligibility`, `CertificateFactsService.collect`, `generateVerificationCode`, `AuditService.log`, `createNotificationSafe` (usado em `course-completion.service.ts`). Produces
```ts
type IssueInput = { userId: number; activityKind: CertificateActivityKind; activityId: number; actorId?: number; trigger: 'AUTO'|'MANUAL'|'APPROVAL' }
type IssueResult = { outcome: 'ISSUED'|'EXISTS'|'PENDING_APPROVAL'|'NOT_ELIGIBLE'|'NO_RULE'; certificate?: Certificate; missing?: MissingReason[] }
issue(input: IssueInput): Promise<IssueResult>
approve(certificateId: number, actorId: number): Promise<Certificate>
```
Comportamento: sem regra activa → `NO_RULE` (não emite); factos recolhidos de novo; `NOT_ELIGIBLE` não cria registo; `dedupKey = ${userId}:${kind}:${activityId}:${cycleKey}`; `create` com captura de P2002 → devolve o existente (`EXISTS`); modo `APPROVAL` cria `status=PENDING_APPROVAL` e `approve` passa a `ACTIVE`; `MANUAL` exige `actorId` mas **também** revalida elegibilidade; `expiresAt = issuedAt + rule.validityDays` se definido; `snapshot` = JSON com `recipientName` (`User.fullName`), `title`, `hours`, `score` (só se existir), `issuedAt`, `expiresAt`, `issuerName`, `code`; auditoria `CERTIFICATE_ISSUED` (strict) e notificação `CERTIFICATE_ISSUED` só em `ISSUED`.

- [ ] **Step 1: Unit tests** (mocks): `NO_RULE`; nota 69 com `minScore:70` → `NOT_ELIGIBLE` e `certificate.create` não chamado; P2002 → `EXISTS`; modo APPROVAL → `PENDING_APPROVAL`; `validityDays:365` → `expiresAt` ≈ +365d; snapshot sem `score` quando `bestScore` é null.
- [ ] **Step 2: Integration test (Postgres real)** `it('20 chamadas concorrentes geram 1 certificado')`: `Promise.all` de 20 `issue()` → exactamente 1 `ISSUED` e 19 `EXISTS`, `count===1`. Teardown filhos→pais.
- [ ] **Step 3: Run** unit + integração → FAIL.
- [ ] **Step 4: Implement.**
- [ ] **Step 5: Run** → PASS.
- [ ] **Step 6: Commit** `feat(certificates): serviço de emissão idempotente com regras`.

### Task 6: Renderizador de PDF com QR

**Files:** Create `src/certificates/certificate-renderer.ts`; Modify `src/pdf/pdf.service.ts` (só se for preciso reutilizar `createDoc`/`bufferFromDoc` — exportar helpers em vez de duplicar); Test `src/certificates/certificate-renderer.spec.ts`.

**Interfaces:** Produces `renderCertificatePdf(snapshot: CertificateSnapshot, verifyUrl: string): Promise<Buffer>` — QR via `qrcode.toBuffer(verifyUrl)`; omite linhas de nota/validade/horas quando ausentes; nunca deixa `{{...}}` por substituir. `buildVerifyUrl(code: string): string` usa `process.env.PUBLIC_APP_URL` (nova variável; default `http://localhost:3000` só em desenvolvimento, erro claro em produção se faltar) → `${PUBLIC_APP_URL}/verify/${code}`.

- [ ] **Step 1: Tests:** buffer começa com `%PDF`; snapshot com nome `'José Ñandú 🎓 ' + 'A'.repeat(200)` não lança; PDF de snapshot sem `score` não contém o texto "Nota"; `buildVerifyUrl('ABC')` termina em `/verify/ABC`.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** (layout corporativo clássico, A4 horizontal).
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(certificates): renderizador de PDF com QR de verificação`.

### Task 7: API e ligação aos emissores existentes

**Files:** Create `src/certificates/certificates.service.ts`, `certificates.controller.ts`, `public-certificates.controller.ts`, `certificates.dto.ts`, `certificates.module.ts`; Modify `src/app.module.ts`, `src/course-completion/course-completion.service.ts`, `src/events/events.service.ts`, `src/pdf/pdf.controller.ts`, `src/courses/courses.controller.ts`; Test `src/certificates/certificates.service.spec.ts`, `test/integration/certificates-api.integration-spec.ts`.

**Interfaces:** Consumes `issue`, `approve`, `renderCertificatePdf`, `normalizeVerificationCode`. Produces
- `GET /certificates/my` (qualquer papel autenticado) → `listMine(userId)`.
- `GET /certificates/:id/pdf` → `getPdfFor(id, user)`: 403 se `cert.userId !== user.id` e papel ∉ {ADMIN, RH, AUDITOR}; 409 se `status !== ACTIVE`; incrementa `downloadCount`; `Content-Type: application/pdf`.
- `POST /certificates/issue` `@Roles(ADMIN, RH, INSTRUCTOR)`, body `IssueCertificateDto { userId:number; activityKind; activityId:number }` → `issue(trigger:'MANUAL')`.
- `POST /certificates/:id/approve` `@Roles(ADMIN, RH, GESTOR)` → `approve`.
- `GET /certificates/verify/:code` **`@Public()`** com throttle → `verifyPublic(code)`: devolve só `{ valid, status, holderName, title, issuerName, hours?, issuedAt, expiresAt?, type }`; `status` calculado no momento (REVOKED > EXPIRED > ACTIVE); 404 genérico para código inválido/inexistente/`PENDING*`; incrementa `verifyCount`.
- `course-completion.issueCertificateInternal` e `events.autoIssueCertificate` passam a chamar `issue({trigger:'AUTO'})`. Compatibilidade com dados existentes: cursos/eventos **sem** `CertificateRule` são tratados como regra implícita (`requireFullCompletion` para cursos, presença `PRESENT` para eventos), documentado no código; a migração da Task 1 não cria regras.
- `GET /courses/my/certificates` e `GET /courses/certificates/verify/:code` delegam em `CertificatesService` (mantendo os campos que o frontend actual usa). `GET /pdf/certificate/:id` é removido (passa a `/certificates/:id/pdf`).

- [ ] **Step 1: Integration tests:** colaborador A descarrega o seu PDF → 200 `%PDF`; colaborador B o mesmo id → 403; RH → 200; `verify` de revogado → `valid:false,status:'REVOKED'`; expirado → `EXPIRED`; `verify` com `"1' OR 1=1"` e com 65 chars → 404; resposta pública **não** contém `userId`, `email`, `id`, `fileUrl`, `metadata`.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** + registar o módulo em `app.module.ts`.
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Correr os specs existentes dos módulos tocados** (`npx jest src/course-completion src/events src/courses src/pdf`) e actualizar os mocks que dependiam de `certificate.create` directo.
- [ ] **Step 6: Commit** `feat(certificates): API de emissão, download com ownership e verificação pública`.

### Task 8: Frontend — verificação pública e download real

**Files:** Create `frontend/app/verify/[code]/page.tsx`, `frontend/components/certificates/VerifyResultCard.tsx`, test `frontend/components/certificates/VerifyResultCard.test.tsx`; Modify `frontend/middleware.ts` (`PUBLIC_PATHS` + prefixo `/verify/`), `frontend/components/courses/CertificatesView.tsx`, `frontend/components/courses/types.ts`, `frontend/lib/queryKeys.ts`.

**Interfaces:** Consumes `GET /certificates/verify/:code`, `GET /certificates/my`, `GET /certificates/:id/pdf`. `VerifyResultCard({ result }: { result: PublicVerifyResult | { notFound: true } })` — mostra nome completo, curso, emissor, horas, emissão, validade, tipo e selo de estado (ACTIVE verde; EXPIRED/REVOKED vermelho; nunca "válido" se não ACTIVE); "não encontrado" com `AlertCard` (regra 16). O botão "Download PDF" descarrega via `apiClient` como blob e reutiliza o helper de download já corrigido (`revokeObjectURL` diferido; procurar em `frontend/lib`) em vez de criar outro.

- [ ] **Step 1: Tests (vitest):** o card mostra "Revogado" e não mostra "Válido" para `status:'REVOKED'`; mostra o nome completo; `notFound` mostra o AlertCard.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npx vitest run components/certificates components/courses/CertificatesView` → PASS.
- [ ] **Step 5: Verificação real:** backend em :4000 (processo único, ver memória dual-process); emitir um certificado via `POST /certificates/issue`; abrir `/verify/<código>` sem sessão (não pode redirecionar para /login); descarregar o PDF em "Cursos → Certificados"; abrir o PDF e confirmar dados e QR a apontar para a mesma URL.
- [ ] **Step 6: Commit** (repo do frontend, separado) `feat(certificates): página pública de verificação e download real`.

### Task 9: Verificação final da fatia

- [ ] `npx tsc --noEmit` (BE e FE), `npx eslint` nos ficheiros novos, `npx prettier --write` nos alterados.
- [ ] Suite de integração **completa** (não só os ficheiros novos), com `DB_POOL_MAX` baixo e teardown filhos→pais.
- [ ] Resumo para o utilizador: o que ficou funcional, `PUBLIC_APP_URL` como nova variável, pendências (`TRAINING`/`LEARNING_PATH` se os factos não existirem), e que F2–F5 continuam por fazer.
