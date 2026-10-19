# Certificados — Fatia 4: Ciclo de vida (revogação, reemissão, importação externa, lote, validade e alertas) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (inline, escolhido pelo utilizador). Steps use checkbox (`- [ ]`) syntax.

**Goal:** Fechar o ciclo de vida dos certificados: revogar, reemitir (com ligação ao anterior), reenviar, importar certificados externos, emitir em lote e tratar validade/expiração com alertas — tudo auditado e reflectido na verificação pública.

**Architecture:** Novo `CertificateLifecycleService` (revogar, reemitir, reenviar), `CertificateExternalService` (importação), `CertificateBatchService` (lote) e `CertificateExpiryService` (cron diário). Reutilizam `CertificateIssuanceService`, `effectiveStatus` e `AuditService` da fatia 1. Rotas no `CertificatesController`. Frontend: acções por linha, modais de importação e lote no centro de certificados da fatia 3.

**Tech Stack:** NestJS, Prisma, `@nestjs/schedule`, Jest (unit + `test/integration`); Next.js, TanStack Query, Vitest.

**Spec:** `docs/superpowers/specs/2026-10-19-certificados-design.md` (§11–12 e §10.3 de `docs/prompt_certificados_claude_code.md`). Fatias 1 e 3 já entregues.

**Fora desta fatia:** templates/editor (F2), vista do colaborador/gestor alargada e exportações (F5). **Reciclagem por inscrição automática fica pendente por limitação real:** `Enrollment` tem `@@unique([courseId, userId])`, por isso uma nova matrícula no mesmo curso exigiria reiniciar a matrícula antiga (o fluxo de inscrições não suporta isso). O alerta de expiração encaminha o colaborador para refazer a formação, sem matricular.

## Global Constraints

- Mesmas das fatias anteriores: campos Prisma confirmados no schema, `User.fullName`, DTOs com class-validator (`whitelist`+`forbidNonWhitelisted`), autorização no backend com `Role`, commits locais PT com `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`, nunca push/merge, migração manual aditiva com timestamp > `20261120000000`.
- Escrita (revogar, reemitir, reenviar, importar, lote): **ADMIN e RH**. AUDITOR só lê. Todas as operações escrevem auditoria `strict` (campo `entity: 'Certificate'`, nunca `entityType`).
- **Nunca apagar** um certificado: revogação e reemissão preservam o registo original.
- Motivo obrigatório (3–500 caracteres) em revogar e reemitir.
- Estado público sempre calculado por `effectiveStatus` (revogação > expiração > gravado).
- Certificados importados: `origin = EXTERNAL`; nunca se apresentam como emitidos pela academia (verificação pública e PDF).
- O PDF de um certificado externo é o documento carregado (`fileUrl`), nunca um PDF gerado; só PDF (`data:application/pdf;base64,…`) até 5 MB (`IsUrlOrInlineFile`, `maxBytes` 5 MB, MIME `application/pdf`).
- Alertas de expiração: limiares configuráveis por `CERT_EXPIRY_ALERT_DAYS` (por omissão `30,7`), nunca hardcoded no corpo da lógica; reclamação atómica para correr em 2 instâncias sem duplicar.
- Frontend: `AlertCard`, `useConfirm`, `Modal`, rótulos em português sem enums crus; botões só com comportamento real.

## Review Focus

- Revogar duas vezes o mesmo certificado → 409 (não regrava auditoria nem sobrescreve o motivo original).
- Reemitir um certificado revogado/pendente/externo → 409; reemitir duas vezes em simultâneo → só uma reemissão (restrição única em `cycleKey`/`dedupKey`).
- Verificar publicamente o certificado **antigo** após reemissão → REVOGADO (reemitido) e o novo → válido.
- Importação duplicada (mesmo titular, formação, entidade e data) → devolve o existente, não cria outro.
- Upload externo com MIME não-PDF, > 5 MB, ou base64 inválido → 400; titular inexistente → 404; data de validade anterior à de conclusão → 400.
- Lote de 500 titulares com falhas misturadas (inelegível, inexistente, duplicado) → 200 com resultado por titular; os válidos ficam emitidos; > 500 → 400.
- Cron em 2 instâncias a correr ao mesmo tempo → um único alerta por certificado e limiar; certificado já revogado/expirado nunca recebe alerta.

## File Structure

- Modify `prisma/schema.prisma` + create `prisma/migrations/20261121000000_certificate_lifecycle/migration.sql`; modify `src/test-mocks/prisma-client.mock.js`.
- Create `src/certificates/certificate-lifecycle.service.ts`, `certificate-external.service.ts`, `certificate-batch.service.ts`, `certificate-expiry.service.ts`, `certificates-lifecycle.dto.ts` (+ specs).
- Modify `src/certificates/certificates.service.ts` (`verifyPublic` com `origin`, `getPdfFor` para externos), `certificates-admin.service.ts` (linha com `origin`), `certificates.controller.ts`, `certificates.module.ts` (importar `MailModule`).
- Frontend: modify `components/certificates/{CertificatesTab,labels,types,VerifyResultCard}.tsx`; create `RevokeDialog`-style modais (`ReasonDialog.tsx`, `ImportExternalModal.tsx`, `BatchIssueModal.tsx`) e testes.

---

### Task 1: Schema do ciclo de vida

**Files:** Modify `prisma/schema.prisma` (`Certificate`); Create `prisma/migrations/20261121000000_certificate_lifecycle/migration.sql`; Modify `src/test-mocks/prisma-client.mock.js`; Test `test/integration/certificates/certificates-lifecycle-schema.integration-spec.ts`.

**Interfaces:** Produces em `Certificate`: enum `CertificateOrigin { INTERNAL EXTERNAL }`; `origin CertificateOrigin @default(INTERNAL)`; `replacesId Int?` com relação própria `replaces Certificate? @relation("CertificateReissue", fields:[replacesId], references:[id])` e `replacedBy Certificate[] @relation("CertificateReissue")`; `observations String? @db.Text`; `lastExpiryAlertDays Int?`; índice em `replacesId` e `expiresAt`.

- [ ] **Step 1: Test (Postgres real)** — cria certificado, depois um segundo com `replacesId` do primeiro e `origin:'EXTERNAL'`; relê o primeiro com `include:{ replacedBy: true }` e espera 1 elemento; `origin` por omissão é `INTERNAL`.
- [ ] **Step 2: Run** (`NODE_OPTIONS=--max-old-space-size=8192`, `--runInBand`, em segundo plano) → FAIL.
- [ ] **Step 3: Implement** schema + migration manual (`CREATE TYPE`, `ALTER TABLE ... ADD COLUMN`, FK `ON DELETE SET NULL`, índices) + enum no mock Jest.
- [ ] **Step 4: Run** → PASS; aplicar a migração à BD de desenvolvimento só no fim da fatia, com `prisma migrate deploy`.
- [ ] **Step 5: Commit** `feat(certificates): schema do ciclo de vida`.

### Task 2: Revogar, reemitir e reenviar

**Files:** Create `src/certificates/certificate-lifecycle.service.ts`, `certificates-lifecycle.dto.ts`; Test `src/certificates/certificate-lifecycle.service.spec.ts`.

**Interfaces:**
- Consumes: `AuditService.log`, `createNotificationSafe`, `MailService.sendNotification(to, subject, text)`, `effectiveStatus`, `generateVerificationCode`, `buildVerifyUrl`.
- Produces:
```ts
revoke(id: number, reason: string, actorId: number): Promise<Certificate>
reissue(id: number, reason: string, actorId: number): Promise<{ original: Certificate; replacement: Certificate }>
resend(id: number, actorId: number): Promise<{ notified: boolean; emailed: boolean }>
```
DTO `ReasonDto { reason: string }` (`@IsString @MinLength(3) @MaxLength(500)`).
Regras: `revoke` — 404 se não existe, 409 se já revogado; grava `revoked:true,status:REVOKED,revokedAt,revokedById,revokeReason`; audita `CERTIFICATE_REVOKED` (before/after de estado, `reason`); notifica o titular. `reissue` — só `origin INTERNAL` e estado efectivo ACTIVE ou EXPIRED (senão 409); numa transacção revoga o original (`revokeReason: "Reemitido: <reason>"`) e cria o novo com `replacesId`, `cycleKey = String(maxCycle+1)`, `dedupKey` com o novo ciclo, novo `validationCode`, snapshot com nome actual do titular e título/horas/nota do original, `expiresAt` conservando a duração original (`expiresAt - issuedAt`) quando existir; audita `CERTIFICATE_REISSUED` (referência aos dois ids) e notifica. `resend` — só estado ACTIVE; cria notificação `CERTIFICATE_RESENT` e tenta e-mail (`MailService`, falha de SMTP não falha a operação: `emailed:false`); audita `CERTIFICATE_RESENT`.

- [ ] **Step 1: Tests (Prisma mockado)** — revoke: já revogado → `ConflictException` e `update` não chamado; sucesso grava motivo e chama `audit.log` com `action:'CERTIFICATE_REVOKED'` e `reason`; reissue: `origin EXTERNAL` → 409; revogado → 409; sucesso devolve `replacement.replacesId === original.id`, `cycleKey` incrementado, código novo ≠ antigo, original com `revokeReason` a começar por "Reemitido:"; validade conservada (365 dias → 365 dias); P2002 na criação → 409; resend: PENDING_APPROVAL → 409; SMTP a falhar devolve `{notified:true, emailed:false}`; `ReasonDto` rejeita motivo com 2 caracteres e com 501.
- [ ] **Step 2: Run** `npx jest src/certificates/certificate-lifecycle` → FAIL.
- [ ] **Step 3: Implement** (`prisma.$transaction` no reissue).
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(certificates): revogação, reemissão e reenvio`.

### Task 3: Importação de certificados externos

**Files:** Create `src/certificates/certificate-external.service.ts`; Modify `src/certificates/certificates-lifecycle.dto.ts`, `src/certificates/certificates.service.ts`, `src/certificates/certificates-admin.service.ts`; Test `src/certificates/certificate-external.service.spec.ts`, `certificates.service.spec.ts`.

**Interfaces:**
- Produces:
```ts
importExternal(dto: ImportExternalCertificateDto, actorId: number): Promise<{ outcome: 'IMPORTED' | 'EXISTS'; certificate: Certificate }>
```
DTO `ImportExternalCertificateDto`: `userId` (int ≥1), `title` (1–200), `issuerName` (1–200), `completedAt` (ISO date), `expiresAt?` (ISO date), `hours?` (número 0–10000), `observations?` (≤2000), `document` (`@IsUrlOrInlineFile({ maxBytes: 5 MB })`, e quando `data:` só `application/pdf`), `validated?` (bool, por omissão false).
Comportamento: titular inexistente → 404; `expiresAt < completedAt` → 400; cria `origin:EXTERNAL`, `type:COURSE`, `status: validated ? ACTIVE : PENDING_APPROVAL`, `issuerName` = entidade externa, `issuedAt = completedAt`, `fileUrl = document`, `validationCode` aleatório, `dedupKey = "<userId>:EXTERNAL:<sha1(title|issuer|completedAt)>"` (P2002 → `EXISTS` com o registo existente); audita `CERTIFICATE_EXTERNAL_IMPORTED`. `CertificatesService.verifyPublic` passa a devolver `origin`; `getPdfFor` de certificado externo devolve o conteúdo do `fileUrl` (só se for `data:application/pdf`) em vez de gerar PDF, senão 409; a lista admin devolve `origin`.

- [ ] **Step 1: Tests** — titular inexistente → `NotFoundException`; `expiresAt` anterior a `completedAt` → `BadRequestException`; sucesso cria `origin:'EXTERNAL'` e `status:'PENDING_APPROVAL'` por omissão e `'ACTIVE'` com `validated:true`; P2002 → `EXISTS`; DTO rejeita `data:image/png;base64,…` e `data:application/pdf;base64,` com mais de 5 MB; `verifyPublic` de externo devolve `origin:'EXTERNAL'` e `issuerName` da entidade externa; `getPdfFor` de externo devolve exactamente os bytes do PDF carregado.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(certificates): importação de certificados externos`.

### Task 4: Emissão em lote

**Files:** Create `src/certificates/certificate-batch.service.ts`; Modify `src/certificates/certificates-lifecycle.dto.ts`; Test `src/certificates/certificate-batch.service.spec.ts`.

**Interfaces:**
- Consumes `CertificateIssuanceService.issue`.
- Produces:
```ts
issueBatch(dto: BatchIssueDto, actorId: number): Promise<{ total: number; issued: number; existing: number; failed: number; results: { userId: number; outcome: IssueResult['outcome'] | 'ERROR'; missing?: string[]; error?: string }[] }>
```
DTO `BatchIssueDto`: `activityKind` (enum), `activityId` (int ≥1), `userIds?` (int[] 1–500, sem duplicados), `allEligible?` (bool); exactamente um dos dois (`userIds` ou `allEligible:true`), senão 400. `allEligible` resolve titulares: COURSE → matrículas `COMPLETED` do curso; EVENT → participantes `PRESENT`; outros tipos → 400. Máximo 500 titulares por chamada (mais → 400). Cada titular é emitido individualmente com `trigger:'MANUAL'`; um erro num titular nunca impede os restantes; `NOT_ELIGIBLE` devolve os motivos traduzidos com `describeMissing`. Audita `CERTIFICATE_BATCH_ISSUED` (contagens, sem lista de ids).

- [ ] **Step 1: Tests** — sem `userIds` nem `allEligible` → `BadRequestException`; ambos → `BadRequestException`; 501 titulares → `BadRequestException`; mistura {ISSUED, EXISTS, NOT_ELIGIBLE, excepção} → contagens `issued:1, existing:1, failed:2` e a excepção de um titular não impede os seguintes; `allEligible` em COURSE consulta `enrollment.findMany` com `status:'COMPLETED'`; `TRAINING` com `allEligible` → 400; auditoria uma só vez.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement** (sequencial com `for`, não `Promise.all`, para não esgotar o pool). **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(certificates): emissão em lote`.

### Task 5: Expiração e alertas

**Files:** Create `src/certificates/certificate-expiry.service.ts`; Test `src/certificates/certificate-expiry.service.spec.ts`; Modify `src/certificates/certificates.module.ts` (provider).

**Interfaces:**
- Produces:
```ts
export function parseAlertDays(raw: string | undefined): number[]   // "30,7" → [30,7] ordenado desc; inválidos descartados; vazio → [30,7]
runExpiryJob(now?: Date): Promise<{ markedExpired: number; alerted: number }>   // @Cron('0 7 * * *') chama-o
```
Comportamento: (1) `updateMany` ACTIVE com `expiresAt < now` e `revoked:false` → `status:'EXPIRED'`; (2) para cada limiar `d` (do maior para o menor), certificados `ACTIVE`, `revoked:false`, `expiresAt` entre `now` e `now+d` e `lastExpiryAlertDays` nulo ou `> d`, em lotes de 200: reclama com `updateMany({ where:{ id, OR:[{lastExpiryAlertDays:null},{lastExpiryAlertDays:{gt:d}}] }, data:{ lastExpiryAlertDays:d } })` e só notifica se `count === 1`; notifica o titular (`CERTIFICATE_EXPIRING`, mensagem com data de validade e a indicação de refazer a formação), e, se tiver `managerId`, o gestor; nunca alerta revogados/expirados. Erros por certificado são registados e não interrompem o ciclo.

- [ ] **Step 1: Tests** — `parseAlertDays('30,7')`=[30,7]; `'7, 30,abc,-1,0'`=[30,7]; `undefined` e `''` = [30,7]; job: reclamação com `count:0` (outra instância ganhou) → não notifica; reclamação com `count:1` → uma notificação ao titular e outra ao gestor; certificado a 20 dias com `lastExpiryAlertDays:30` já alertado → sem 2.º alerta de 30 mas alerta de 7 quando entrar nessa janela; `markedExpired` conta o `updateMany` da fase 1; excepção ao notificar um certificado não impede o seguinte.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(certificates): expiração automática e alertas de validade`.

### Task 6: Rotas HTTP e integração

**Files:** Modify `src/certificates/certificates.controller.ts`, `certificates.module.ts`; Test `test/integration/certificates/certificates-lifecycle.integration-spec.ts`.

**Interfaces:** (todas `@Roles(Role.ADMIN, Role.RH)`; declaradas antes de `:id/pdf`)
- `POST /certificates/:id/revoke` body `ReasonDto` → certificado revogado; `POST /certificates/:id/reissue` body `ReasonDto` → `{ original, replacement }`; `POST /certificates/:id/resend`; `POST /certificates/external` body `ImportExternalCertificateDto`; `POST /certificates/issue-batch` body `BatchIssueDto`.

- [ ] **Step 1: Integration tests (Postgres real)** — colaborador/gestor/auditor → 403 em todas; revogar sem motivo → 400, com motivo → 201 e **verificação pública devolve REVOKED**; revogar de novo → 409; reemitir válido → 201, verificação do antigo = REVOKED e do novo = ACTIVE, `GET /certificates/admin/list` mostra ambos, e histórico contém `CERTIFICATE_REISSUED`; reemitir revogado → 409; importar PDF externo (data URL mínima válida) → 201 `PENDING_APPROVAL`, repetir → mesmo id (`EXISTS`), verificação pública mostra `origin:'EXTERNAL'` só depois de aprovado (antes → 404), download devolve `%PDF`; importar PNG → 400; lote com 2 titulares (1 elegível, 1 sem matrícula) → 201/200 com `issued:1, failed:1`; lote vazio → 400; reenviar válido → 201 com `notified:true`.
- [ ] **Step 2: Run** → FAIL (404). **Step 3: Implement** rotas. **Step 4: Run** `certificates`, `courses`, `enrollments`, `events` → PASS.
- [ ] **Step 5: Commit** `feat(certificates): endpoints do ciclo de vida`.

### Task 7: Frontend — acções, importação, lote e verificação de externos

**Files:** Modify `frontend/components/certificates/{CertificatesTab,labels,types,VerifyResultCard}.tsx`; Create `ReasonDialog.tsx`, `ImportExternalModal.tsx`, `BatchIssueModal.tsx` e testes `ReasonDialog.test.tsx`, `CertificatesTab.test.tsx` (alargado), `VerifyResultCard.test.tsx` (alargado).

**Interfaces:** Consumes endpoints da Task 6 e `PublicVerifyResult.origin`. `ReasonDialog({ title, confirmLabel, onConfirm(reason: string): void, onClose(): void, pending?: boolean, error?: string })` — motivo obrigatório 3–500, contador, erro inline. Acções por linha só para ADMIN/RH (`canApprove`→`canManage`): **Revogar** (ACTIVE/EXPIRED/PENDING_APPROVAL), **Reemitir** (ACTIVE/EXPIRED e `origin INTERNAL`), **Reenviar** (ACTIVE); todas com `ReasonDialog`/`useConfirm` e invalidação de `queryKeys.certificates.all` e `queryKeys.courses.myCertificates()`. Cabeçalho da lista: **Importar certificado externo** (modal: titular via `Combobox` com pesquisa, título, entidade emissora, datas, horas, observações, validado, ficheiro PDF ≤ 5 MB lido como data URL) e **Emitir em lote** (modal: curso/evento + "todos os elegíveis" + resultado por titular com contagens). Rótulos novos em `labels.ts` (`CERTIFICATE_REVOKED` → "Certificado revogado", `CERTIFICATE_REISSUED` → "Certificado reemitido", `CERTIFICATE_RESENT`, `CERTIFICATE_EXTERNAL_IMPORTED`, `CERTIFICATE_BATCH_ISSUED`, `CERTIFICATE_EXPIRING`). `VerifyResultCard`: para `origin === 'EXTERNAL'` mostra o selo "Certificado externo" e a frase "Importado para a plataforma; emitido por <entidade>, não pela academia."

- [ ] **Step 1: Tests (vitest)** — `ReasonDialog` não confirma com motivo de 2 caracteres e mostra o erro, confirma com 3; linha ACTIVE interna mostra Revogar/Reemitir/Reenviar a RH e nenhuma a AUDITOR; linha externa não mostra Reemitir; linha REVOKED não mostra nenhuma acção de ciclo; `VerifyResultCard` externo mostra a frase de não emissão pela academia e nunca "emitido pela academia".
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** `npx vitest run components/certificates` + `tsc --noEmit` + eslint → PASS.
- [ ] **Step 5: Commit** (repo frontend) `feat(certificates): revogar, reemitir, reenviar, importar e emitir em lote`.

### Task 8: Verificação final da fatia

- [ ] `tsc --noEmit` e eslint (BE ficheiros não-spec, FE ficheiros novos); prettier só nos ficheiros alterados do backend (nunca `prettier --write` em pastas inteiras do frontend).
- [ ] Suite unitária completa BE, `vitest run` FE (módulos tocados) e integração `certificates|courses|enrollments|events` em segundo plano.
- [ ] Aplicar `prisma migrate deploy` à BD de desenvolvimento (aditiva) e confirmar `migrate status`.
- [ ] Resumo ao utilizador: o que ficou funcional, decisões, e a pendência declarada (reciclagem por matrícula automática).
