# Fase F2 — Unificar Certificação (`IssuedCertificate` → `Certificate`) — Plano de Implementação

> **Para agentes de execução:** SUB-SKILL OBRIGATÓRIA: usar `superpowers:subagent-driven-development` (recomendado) ou `superpowers:executing-plans` para executar este plano tarefa a tarefa. Os passos usam checkbox (`- [ ]`) para acompanhamento.
>
> **Ordem:** executar **antes** da Fase F3 (Badges) — ambas modificam `src/certification/certification.service.ts`. Não executar F2 e F3 em paralelo.

**Goal:** Existe **um único** modelo de certificado (`Certificate`) e um único caminho de emissão. O modelo rico `IssuedCertificate` — hoje escrito só por `CertificationService` e lido só por `dashboard-institutional` — é absorvido: os campos úteis (`hashCode`, `title`, `recipientName`, revogação com autor/motivo/data, contadores, `issuedById`, `templateId`) passam para `Certificate`; os dados existentes são migrados; `IssuedCertificate` deixa de ser escrito.

**Architecture:** `Certificate` (`prisma/schema.prisma:1991`, id `Int`, já tem `revoked`, `validationCode`, `code`, `fileUrl`, `expiresAt`, links tipados a user/course/enrollment/program/developmentPlan/event) é o canónico. Ganha as colunas em falta + `legacyIssuedCertId String? @unique` para rastreio. `CertificationService` (métodos de certificado — **não** os de badge, que são a F3) passa a escrever/ler `Certificate`. `dashboard-institutional` aponta as suas contagens para `Certificate`. As rotas `/certification/certificates/*` (id `cuid` hoje) mantêm-se, resolvendo `cuid` → `Certificate` via `legacyIssuedCertId` e devolvendo a forma histórica via adaptador. Backfill idempotente `IssuedCertificate` → `Certificate`. `IssuedCertificate`/`CertificateTemplate` **ficam no schema** (deprecados; remoção física é follow-up).

**Tech Stack:** NestJS, Prisma (migração SQL manual), Jest (unit + integração com Postgres real), `class-validator`.

**Spec:** `docs/arquitetura-modular-analise.md` (§2.3 item 5, §2.5, §3–4 domínio 7, §13 fase F) e `docs/arquitetura-modular.md` (Fases 3–6). **Decisão do dono do produto (2026-09-05):** manter o modelo simples (`Certificate`), absorver o rico.

## Global Constraints

- **Forma de resposta do frontend preservada** (`docs/arquitetura-modular.md` §12), via adaptador `certificateToIssuedShape()`:
  - `GET /certification/verify/:code` (público), `GET /certification/certificates`, `GET /certification/certificates/:id`, `GET /certification/my-certificates`, `POST /certification/certificates`, `POST /certification/certificates/:id/download`, `PUT /certification/certificates/:id/revoke`, `GET /certification/dashboard` — todas continuam a devolver a forma de `IssuedCertificate` (id string, `verificationCode`, `hashCode`, `recipientName`, `isRevoked`, `downloadCount`, ...). Campos sem equivalente em `Certificate` → `null` no adaptador, chave sempre presente.
  - `GET /certification/templates`, `POST /certification/templates` — `CertificateTemplate` é um catálogo pequeno e sem duplicação; **fica como está** (mini-serviço/prisma directo). Só o fluxo de emissão de certificado é consolidado.
- **`IssuedCertificate.id` é `cuid`; `Certificate.id` é `Int`.** Rotas `/certification/certificates/:id` recebem `cuid` hoje. Cada `Certificate` migrada guarda `legacyIssuedCertId`; handlers resolvem `cuid` → `Certificate` via essa coluna. Certificados **novos** por este caminho recebem um `legacyIssuedCertId` sintético (`cuid`) para o contrato manter um id string estável. (Alternativa se o revisor preferir: expor o id numérico — decidir na Task 1.)
- **`Certificate.type` é `CertificateType` (`COURSE|TRAINING|LEADERSHIP|DEVELOPMENT`); `IssuedCertificate.type` é `CertificateTemplateType` (`COURSE|PROGRAM|COMPETENCY|ATTENDANCE|PARTICIPATION|ACHIEVEMENT`).** Tabela de tradução fixada na Task 1 (`PROGRAM→LEADERSHIP`, `COMPETENCY→DEVELOPMENT`, `ATTENDANCE|PARTICIPATION|ACHIEVEMENT→TRAINING` — confirmar com o dono do produto no PR).
- **Migração de dados idempotente** (`upsert` por `legacyIssuedCertId`), corre como passo de deploy + spec de integração dedicado.
- **`revoked` (bool) já existe em `Certificate`.** A F2 acrescenta `revokedAt`/`revokeReason`/`revokedById` e mantém `revoked` como o booleano de estado (escrever ambos coerentes, como `active`/`status` na Fase C).
- Fase F3 (badges) toca o **mesmo ficheiro** `certification.service.ts` — F2 primeiro, merge, depois F3.
- `prettier`/`eslint`/`tsc` limpos; `format:check` do CI só `src/**`; **não** correr prettier em `prisma/**`.
- Integração: lotes contra `postgresql://.../innova_test`, `--runInBand`, Redis local, `DB_POOL_MAX=5`. `certification` e `dashboard-institutional` são lotes distintos.

---

## File Structure

**Novos:**
- `prisma/migrations/<ts>_certificate_absorb_issued/migration.sql` — colunas novas em `Certificate` + `legacyIssuedCertId`.
- `prisma/backfill-issued-certificates.ts` + spec de integração.
- `src/certification/certificate-legacy-adapter.ts` + `.spec.ts`.

**Modificados:**
- `prisma/schema.prisma` — `Certificate` += `hashCode String?`, `title String?`, `recipientName String?`, `issuerName String? @default("INNOVA")`, `score Float?`, `pdfUrl String?`, `publicUrl String?`, `linkedInUrl String?`, `revokedAt DateTime?`, `revokeReason String?`, `revokedById Int?`, `downloadCount Int @default(0)`, `verifyCount Int @default(0)`, `issuedById Int?`, `templateId String?`, `legacyIssuedCertId String? @unique`, `metadata String?`, `deletedAt DateTime?`. (Reutiliza `fileUrl` para o PDF? Decisão Task 1 — recomendação: manter `fileUrl` **e** adicionar `pdfUrl` para mapeamento 1:1, `fileUrl` fica como alias legado.)
- `src/certification/certification.service.ts` — métodos de **certificado** (`issueCertificate`, `findAllCertificates`, `findCertificateById`, `verify`, `revokeCertificate`, `downloadCertificate`, `getMyCertificates`, `getDashboard`) passam a `Certificate` + adaptador. `generateCertCode`/`generateVerificationCode`/`generateHash` mantidos. Métodos de **badge** **não tocados** (F3).
- `src/certification/certification.controller.ts` — sem alteração de rotas (o controller já encaminha).
- `src/certification/certification.service.spec.ts` / `*.additional.spec.ts` — adaptar os testes de certificado.
- `src/dashboard-institutional/dashboard-institutional.service.ts` — `this.prisma.read.issuedCertificate.count(...)` → `this.prisma.read.certificate.count(...)` (ajustar `where`: `deletedAt: null` → `revoked: false` ou `deletedAt: null` conforme a coluna nova).
- `docs/arquitetura-modular-analise.md` — §2.3 item 5, §13 fase F (F2 feita).

---

### Task 1: Nota de mapeamento `IssuedCertificate` ↔ `Certificate` + enums + `IssuedShape`

**Files:** Create `docs/superpowers/plans/notes/fase-f2-cert-map.md`

- [ ] **Step 1: Ler `model Certificate`, `model IssuedCertificate`, `enum CertificateType`, `enum CertificateTemplateType`.**
- [ ] **Step 2: Tabela de campos** (todos os de `IssuedCertificate` → destino em `Certificate`; marcar os que exigem coluna nova vs. os que mapeiam a coluna existente):
  - `id` → `legacyIssuedCertId`
  - `code` → `code` ; `verificationCode` → `validationCode` ; `hashCode` → `hashCode` (nova)
  - `userId` → `userId` ; `templateId` → `templateId` (nova, String) ; `courseId` (String) → `courseId` (Int, `Number()`; inválido → `null`) ; `programId` (String) → `programId` (Int, idem)
  - `title`/`recipientName`/`issuerName`/`score`/`pdfUrl`/`publicUrl`/`linkedInUrl`/`metadata` → colunas novas homónimas
  - `type` (`CertificateTemplateType`) → `type` (`CertificateType`) via tabela Step 3
  - `isRevoked` → `revoked` ; `revokedAt`/`revokeReason`/`revokedById` → colunas novas homónimas
  - `issuedAt`/`expiresAt` → homónimos ; `issuedById` → `issuedById` (nova) ; `downloadCount`/`verifyCount` → novas ; `deletedAt` → nova
- [ ] **Step 3: Tabela `CertificateTemplateType` → `CertificateType`** (recomendação, a confirmar no PR):
  `COURSE→COURSE`, `PROGRAM→LEADERSHIP`, `COMPETENCY→DEVELOPMENT`, `ATTENDANCE|PARTICIPATION|ACHIEVEMENT→TRAINING`.
- [ ] **Step 4: `IssuedShape`** — ler os retornos de `issueCertificate`/`findAllCertificates`/`findCertificateById`/`verify`/`revokeCertificate`/`downloadCertificate`/`getMyCertificates`/`getDashboard` e registar os campos exactos.
- [ ] **Step 5: Commit da nota.**

---

### Task 2: Migração de schema — `Certificate` absorve as colunas de `IssuedCertificate`

**Files:** Modify `prisma/schema.prisma`; Create `prisma/migrations/<ts>_certificate_absorb_issued/migration.sql`

- [ ] **Step 1: Editar `model Certificate`** com as colunas da secção File Structure.
- [ ] **Step 2: Migração SQL manual:**

```sql
ALTER TABLE "Certificate"
  ADD COLUMN "hashCode" TEXT,
  ADD COLUMN "title" TEXT,
  ADD COLUMN "recipientName" TEXT,
  ADD COLUMN "issuerName" TEXT DEFAULT 'INNOVA',
  ADD COLUMN "score" DOUBLE PRECISION,
  ADD COLUMN "pdfUrl" TEXT,
  ADD COLUMN "publicUrl" TEXT,
  ADD COLUMN "linkedInUrl" TEXT,
  ADD COLUMN "revokedAt" TIMESTAMP(3),
  ADD COLUMN "revokeReason" TEXT,
  ADD COLUMN "revokedById" INTEGER,
  ADD COLUMN "downloadCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "verifyCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "issuedById" INTEGER,
  ADD COLUMN "templateId" TEXT,
  ADD COLUMN "metadata" TEXT,
  ADD COLUMN "deletedAt" TIMESTAMP(3),
  ADD COLUMN "legacyIssuedCertId" TEXT;
CREATE UNIQUE INDEX "Certificate_legacyIssuedCertId_key" ON "Certificate"("legacyIssuedCertId");
```

- [ ] **Step 3: `npx prisma migrate deploy && npx prisma generate && npx tsc --noEmit`.**
- [ ] **Step 4: Commit.**

---

### Task 3: Backfill idempotente `IssuedCertificate` → `Certificate`

**Files:** Create `prisma/backfill-issued-certificates.ts`; Create `test/integration/certification/issued-cert-backfill.integration-spec.ts`

**Interfaces:** `backfillIssuedCertificates(prisma): Promise<{ created: number; skipped: number }>` — `upsert` por `legacyIssuedCertId`.

- [ ] **Step 1: Teste de integração (deve falhar)** — cria um `IssuedCertificate` (revogado e não-revogado), corre o backfill, verifica `Certificate` com `legacyIssuedCertId`, `type` traduzido, `revoked`/`revokedAt`/`revokeReason` coerentes, idempotência (2ª corrida → `created: 0`).
- [ ] **Step 2: FAIL → implementar** o script seguindo o mapa da Task 1. `courseId`/`programId` string→Int com `Number.isInteger` guard (inválido → `null` + `console.warn`). `code`/`validationCode` colidem? `IssuedCertificate.code`/`verificationCode` já são únicos — usar directamente; se houver colisão com um `Certificate` nativo existente, prefixar `LEG-`.
- [ ] **Step 3: PASS** (`jest --config test/jest-integration.json ... -t "backfill"`).
- [ ] **Step 4: tsc + commit.**

---

### Task 4: Adaptador `Certificate` → `IssuedShape`

**Files:** Create `src/certification/certificate-legacy-adapter.ts` + `.spec.ts`

**Interfaces:** `certificateToIssuedShape(cert): IssuedShape` — `id = legacyIssuedCertId ?? String(cert.id)`, `verificationCode = validationCode`, `isRevoked = revoked`, `type` invertido (`CertificateType` → `CertificateTemplateType` — mapa inverso; ambíguo TRAINING→? escolher `PARTICIPATION` por omissão, anotar), campos sem origem → `null`.

- [ ] **Step 1: Teste (deve falhar)** — todas as chaves de `IssuedShape` presentes; `id`/`verificationCode`/`isRevoked` mapeados; `type` invertido.
- [ ] **Step 2: FAIL → implementar.**
- [ ] **Step 3: PASS + tsc + commit.**

---

### Task 5: `CertificationService` (métodos de certificado) escrevem/lêem `Certificate`

**Files:** Modify `src/certification/certification.service.ts`; Test `src/certification/certification.service.spec.ts`

- [ ] **Step 1: Reescrever os testes dos 8 métodos de certificado (devem falhar)** — mocks passam a esperar `mockPrisma.certificate.*` (não `issuedCertificate`); o retorno passa por `certificateToIssuedShape`. Exemplo:

```ts
it('issueCertificate cria um Certificate com type traduzido e devolve a forma IssuedShape', async () => {
  mockPrisma.certificate.create.mockResolvedValue({ id: 1, type: 'LEADERSHIP', validationCode: 'V1', revoked: false });
  const res = await service.issueCertificate({ type: 'PROGRAM', userId: 10, title: 'X', recipientName: 'Y' } as any, 99);
  expect(mockPrisma.certificate.create).toHaveBeenCalledWith(
    expect.objectContaining({ data: expect.objectContaining({ type: 'LEADERSHIP', issuedById: 99 }) }),
  );
  expect(res).toHaveProperty('verificationCode');
  expect(res).toHaveProperty('isRevoked', false);
});

it('revokeCertificate escreve revoked=true + revokedAt/revokeReason/revokedById', async () => {
  mockPrisma.certificate.findFirst.mockResolvedValue({ id: 1, legacyIssuedCertId: 'clx1' });
  mockPrisma.certificate.update.mockResolvedValue({ id: 1, revoked: true });
  await service.revokeCertificate('clx1', 'fraude', { id: 99, role: { name: 'ADMIN' } } as any);
  expect(mockPrisma.certificate.update).toHaveBeenCalledWith(
    expect.objectContaining({ data: expect.objectContaining({ revoked: true, revokeReason: 'fraude', revokedById: 99, revokedAt: expect.any(Date) }) }),
  );
});
```

- [ ] **Step 2: FAIL.**
- [ ] **Step 3: Implementar** — em cada método:
  - `issueCertificate(dto, issuerId)`: traduz `type`, gera `code`/`validationCode`/`hashCode` (helpers já existentes), `create` em `Certificate` com `legacyIssuedCertId = <cuid sintético>`, `issuedById = issuerId`; devolve `certificateToIssuedShape(created)`; notificação `CERTIFICATE_ISSUED` (ou `COURSE_COMPLETED`? manter o `type` histórico do `certification` — provavelmente `CERTIFICATE_ISSUED`).
  - `findAllCertificates(filters)`: `certificate.findMany` com `where` traduzido (`isRevoked`→`revoked`, `deletedAt: null`), `.map(certificateToIssuedShape)`.
  - `findCertificateById(id, user)`: resolve `id` (cuid) via `legacyIssuedCertId` (ou `Int` se numérico); ownership igual ao actual; devolve adaptado.
  - `verify(verificationCode)`: `certificate.findFirst({ where: { validationCode } })`, `verifyCount` `increment`, devolve adaptado (+ `valid: !revoked && !expired`).
  - `revokeCertificate(id, reason, user)`: resolve, `update` com os 4 campos de revogação coerentes.
  - `downloadCertificate(id, user)`: resolve, `downloadCount` `increment`, devolve `pdfUrl ?? fileUrl`.
  - `getMyCertificates(userId, filters)`: `certificate.findMany({ where: { userId, ... } })` adaptado.
  - `getDashboard()`: contagens sobre `Certificate` na forma histórica.
- [ ] **Step 4: PASS** (`npx jest src/certification/`).
- [ ] **Step 5: prettier + tsc + eslint + commit.**

---

### Task 6: `dashboard-institutional` conta `Certificate`

**Files:** Modify `src/dashboard-institutional/dashboard-institutional.service.ts`; Test o spec correspondente.

- [ ] **Step 1: Ajustar o teste (deve falhar)** — mock passa a `mockPrisma.read.certificate.count`.
- [ ] **Step 2: FAIL → substituir** `this.prisma.read.issuedCertificate.count({ where: { deletedAt: null } })` por `this.prisma.read.certificate.count({ where: { deletedAt: null } })` (linhas ~69 e ~162; ajustar `where` se a semântica histórica era "não revogado" → `{ revoked: false }`).
- [ ] **Step 3: PASS + prettier + tsc + commit.**

---

### Task 7: Testes de integração — fluxo de certificado pós-consolidação + backfill

**Files:** Modify `test/integration/certification/*.integration-spec.ts`

- [ ] **Step 1:** `POST /certification/certificates` → cria `Certificate` (verificar em BD `legacyIssuedCertId` presente); resposta com id string, `verificationCode`, `isRevoked: false`.
- [ ] **Step 2:** `GET /certification/certificates/:id` resolve o id string; `PUT .../revoke` → `revoked: true` na forma legada; `GET /certification/verify/:code` (público) verifica um migrado e um nativo.
- [ ] **Step 3:** estender `issued-cert-backfill.integration-spec.ts` com vários `type` e revogados.
- [ ] **Step 4: prettier + commit.**

---

### Task 8: Verificação completa + doc

- [ ] **Step 1–3:** `npx jest src/certification src/dashboard-institutional` ; `npm test` ; integração dos lotes `certification` e `dashboard-institutional`.
- [ ] **Step 4:** `npx prettier --check "src/**/*.ts"` ; `npx eslint src/certification src/dashboard-institutional --config eslint.config.staged.mjs` ; `npx tsc --noEmit`.
- [ ] **Step 5: `grep`** — `grep -rn "prisma.\(read.\)\?issuedCertificate" src/` deve ficar sem hits em código vivo.
- [ ] **Step 6: Actualizar `docs/arquitetura-modular-analise.md`** — §2.3 item 5 (nota "certificados unificados em `Certificate`, F2 2026-09-05; `IssuedCertificate` deprecado"); §13 linha F (marcar Certificação como feita, deixar Badges/F3).
- [ ] **Step 7: Commit.**

---

### Task 9: PR e CI

- [ ] Branch `refactor/certification-unification` + push.
- [ ] PR — corpo: aviso de **migração de dados** (`prisma/backfill-issued-certificates.ts` no deploy após `migrate deploy`); **confirmar a tabela de tradução `CertificateTemplateType`→`CertificateType`** com o dono do produto; **verificação do frontend** (campos que o adaptador devolve `null`); nota de que `IssuedCertificate`/`CertificateTemplate` ficam no schema; **F3 (badges) vem a seguir, mesmo ficheiro**.
- [ ] Aguardar `quality` verde → `gh pr merge --squash --auto`.
- [ ] Pós-merge manual: `npx prisma migrate deploy && npx ts-node prisma/backfill-issued-certificates.ts`.

---

## Self-Review

**1. Cobertura da spec (§2.3 item 5 + §13 fase F, parte Certificação):**
- "`Certificate` (simples) vs `IssuedCertificate` (rico) — nunca disparado automaticamente" → F2 unifica em `Certificate`; o fluxo de `CertificationService` continua a ser emissão manual (não automática — a emissão automática por conclusão de curso é a Fase A, `CourseCompletionService`, que já escreve `Certificate`). ✔
- Badges → F3 (plano separado). §13 fica parcial. ✔
- `CertificateTemplate` fora do âmbito (catálogo, sem duplicação) — anotado. ✔

**2. Placeholders:** a tabela de tradução de `type` está marcada "confirmar no PR" com uma recomendação concreta; o `IssuedShape` é registado na Task 1 a partir do código real. Sem "TODO" sem critério.

**3. Consistência de tipos:**
- `Certificate.legacyIssuedCertId` (String? @unique) — Task 2, usado 3/4/5/6/7.
- `backfillIssuedCertificates(prisma) → { created, skipped }` — Tasks 3 e 7.
- `certificateToIssuedShape(cert) → IssuedShape` — Tasks 4, 5, 6; `IssuedShape` definido na Task 1 Step 4.
- `revoked` (bool existente) + `revokedAt`/`revokeReason`/`revokedById` (novos) — escritos coerentes na Task 5 (`revokeCertificate`) e no backfill (Task 3). ✔

**4. Riscos anotados:** migração de dados (idempotente + deploy step no PR); `cuid` vs `Int` nas rotas → `legacyIssuedCertId`; tradução de enum ambígua (TRAINING agrupa 3 valores — perda de granularidade, aceite e anotada no PR); coordenação com F3 (mesmo ficheiro, ordem imposta). Sem ciclo de módulos.
