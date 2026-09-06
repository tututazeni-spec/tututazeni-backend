# Fase F3 — Unificar Badges (`DigitalBadge`/`BadgeIssuance` → `Badge`/`BadgeAward`) — Plano de Implementação

> **Para agentes de execução:** SUB-SKILL OBRIGATÓRIA: usar `superpowers:subagent-driven-development` (recomendado) ou `superpowers:executing-plans`. Steps usam checkbox (`- [ ]`).
>
> **Ordem:** executar **depois** da Fase F2 (Certification) e sobre `main` já com F2 mergeada — ambas modificam `src/certification/certification.service.ts`.

**Goal:** Existe **um único** par de modelos de badge (`Badge` + `BadgeAward`) e um único caminho de emissão. Os modelos ricos `DigitalBadge`/`BadgeIssuance` — escritos só por `CertificationService`, lidos só por `dashboard-institutional` — são absorvidos: os campos úteis (`code`, `imageUrl`, `criteria`, `skills`, `level`, revogação, `verifyCode`/`assertionId`, `issuedById`) passam para `Badge`/`BadgeAward`; dados existentes migrados; `DigitalBadge`/`BadgeIssuance` deixam de ser escritos.

**Architecture:** `Badge` (`prisma/schema.prisma:4199`, id `Int`, hoje minimalista: `name @unique`, `description`) + `BadgeAward` (id `Int`, `userId`/`badgeId`/`awardedAt`/`userPointsId`) são o canónico — é o par que ~13 serviços já referenciam para gamificação. Ganham as colunas em falta + `legacyDigitalBadgeId`/`legacyBadgeIssuanceId` para rastreio. `CertificationService` (métodos de **badge**: `createBadge`, `findAllBadges`, `issueBadge`, `getMyBadges`, e a parte de badge de `getDashboard`) passa a `Badge`/`BadgeAward`. `dashboard-institutional` aponta as suas contagens de badge para `BadgeAward`. Rotas `/certification/badges*` (id `cuid` hoje) mantêm-se, resolvendo `cuid` → `Badge`/`BadgeAward` via as colunas legacy e devolvendo a forma histórica via adaptador. Backfill idempotente. `DigitalBadge`/`BadgeIssuance` **ficam no schema** (deprecados).

**Tech Stack:** NestJS, Prisma (migração SQL manual), Jest (unit + integração), `class-validator`.

**Spec:** `docs/arquitetura-modular-analise.md` (§2.3 item 5, §3–4 domínio 7, §13 fase F). **Decisão do dono do produto (2026-09-05):** manter o modelo simples (`Badge`/`BadgeAward`), absorver o rico.

## Global Constraints

- **Forma de resposta do frontend preservada** via adaptadores `badgeToDigitalShape()` e `badgeAwardToIssuanceShape()`:
  - `POST /certification/badges` (createBadge), `GET /certification/badges` (findAllBadges), `POST /certification/badges/issue` (issueBadge), `GET /certification/my-badges` (getMyBadges), a secção de badge de `GET /certification/dashboard` — todas devolvem a forma de `DigitalBadge`/`BadgeIssuance` (id string, `verifyCode`, `assertionId`, `isRevoked`, `level`, `imageUrl`, ...). Campo sem equivalente → `null`, chave sempre presente.
- **`DigitalBadge.id`/`BadgeIssuance.id` são `cuid`; `Badge.id`/`BadgeAward.id` são `Int`.** Resolução `cuid` → registo via `legacyDigitalBadgeId`/`legacyBadgeIssuanceId`. Badges/issuances **novos** por este caminho recebem um id legacy sintético (`cuid`) para o contrato manter id string. (Alternativa: expor id numérico — decidir na Task 1.)
- **`BadgeIssuance` tem `@@unique([badgeId, userId])`; `BadgeAward` NÃO tem** — a F3 adiciona `@@unique([badgeId, userId])` a `BadgeAward` (para o guard "utilizador já possui este badge" de `issueBadge` funcionar sem race). ⚠️ **Verificar antes** que não há duplicados em produção (`SELECT "badgeId","userId",count(*) FROM "BadgeAward" GROUP BY 1,2 HAVING count(*)>1`) — se houver, a migração falha; incluir passo de dedup no PR.
- **`Badge.name` é `@unique`.** `DigitalBadge.name` **não é** único. Ao migrar, se dois `DigitalBadge` tiverem o mesmo `name`, sufixar (` (2)`, ...) e registar. Badges nativos com o mesmo `name` de um `DigitalBadge` → reutilizar o nativo (não criar duplicado; ligar `legacyDigitalBadgeId` ao existente).
- **Migração idempotente** (`upsert` por `legacyDigitalBadgeId` / `legacyBadgeIssuanceId`), corre no deploy + spec de integração dedicado.
- Executar **sobre `main` com F2 já mergeada** — `certification.service.ts` já terá sido reescrito para `Certificate`; F3 só toca os métodos de badge.
- `prettier`/`eslint`/`tsc` limpos; `format:check` do CI só `src/**`; **não** correr prettier em `prisma/**`.
- Integração: lotes contra `postgresql://.../innova_test`, `--runInBand`, Redis local, `DB_POOL_MAX=5`. `certification` e `dashboard-institutional` são lotes distintos.

---

## File Structure

**Novos:**
- `prisma/migrations/<ts>_badge_absorb_digital/migration.sql` — colunas novas em `Badge`/`BadgeAward` + índices legacy + `@@unique([badgeId, userId])` em `BadgeAward`.
- `prisma/backfill-digital-badges.ts` + spec de integração.
- `src/certification/badge-legacy-adapter.ts` + `.spec.ts` — `badgeToDigitalShape()`, `badgeAwardToIssuanceShape()`.

**Modificados:**
- `prisma/schema.prisma`:
  - `Badge` += `code String? @unique`, `imageUrl String?`, `criteria String?`, `skills String[]`, `level BadgeLevel @default(BASIC)`, `issuerName String? @default("INNOVA")`, `isActive Boolean @default(true)`, `createdById Int?`, `deletedAt DateTime?`, `legacyDigitalBadgeId String? @unique`.
  - `BadgeAward` += `verifyCode String? @unique`, `assertionId String? @unique`, `evidenceUrl String?`, `shareUrl String?`, `isRevoked Boolean @default(false)`, `revokedAt DateTime?`, `revokeReason String?`, `expiresAt DateTime?`, `issuedById Int?`, `deletedAt DateTime?`, `legacyBadgeIssuanceId String? @unique`, `@@unique([badgeId, userId])`.
- `src/certification/certification.service.ts` — métodos de badge → `Badge`/`BadgeAward` + adaptadores. `generateBadgeCode` mantido.
- `src/certification/certification.service.spec.ts` / `*.additional.spec.ts` — adaptar os testes de badge.
- `src/dashboard-institutional/dashboard-institutional.service.ts` — contagens de badge: `digitalBadge`/`badgeIssuance` → `badge`/`badgeAward`.
- `docs/arquitetura-modular-analise.md` — §2.3 item 5, §13 fase F (F3 feita → Fase F completa).

---

### Task 1: Nota de mapeamento `DigitalBadge`/`BadgeIssuance` ↔ `Badge`/`BadgeAward` + `DigitalShape`/`IssuanceShape`

**Files:** Create `docs/superpowers/plans/notes/fase-f3-badge-map.md`

- [ ] **Step 1:** Ler `model Badge`, `model BadgeAward`, `model DigitalBadge`, `model BadgeIssuance`, `enum BadgeLevel`.
- [ ] **Step 2: Tabelas de campos** (`DigitalBadge`→`Badge`, `BadgeIssuance`→`BadgeAward`), marcando coluna-nova vs. mapeamento a coluna existente:
  - `DigitalBadge.id`→`Badge.legacyDigitalBadgeId` ; `code`/`imageUrl`/`criteria`/`skills`/`level`/`issuerName`/`isActive`/`deletedAt`→homónimos novos ; `name`→`name` (dedup por sufixo se colidir) ; `description`→`description` ; `courseId`/`programId` (String) → descartar (não há em `Badge`; anotar) ou guardar em `criteria` ; `createdById`→`createdById`.
  - `BadgeIssuance.id`→`BadgeAward.legacyBadgeIssuanceId` ; `badgeId` (String)→`badgeId` (Int, resolver via `Badge.legacyDigitalBadgeId`) ; `userId`→`userId` ; `assertionId`/`verifyCode`/`evidenceUrl`/`shareUrl`/`isRevoked`/`revokedAt`/`revokeReason`/`expiresAt`/`issuedById`/`deletedAt`→homónimos novos ; `issuedAt`→`awardedAt`.
- [ ] **Step 3:** `DigitalShape` e `IssuanceShape` — ler retornos de `createBadge`/`findAllBadges`/`issueBadge`/`getMyBadges`/`getDashboard` (`src/certification/certification.service.ts:294–385`) e registar os campos.
- [ ] **Step 4:** Query de verificação de duplicados em `BadgeAward` (Global Constraints) — anexar à nota o comando e o plano de dedup se houver.
- [ ] **Step 5: Commit.**

---

### Task 2: Migração de schema — `Badge`/`BadgeAward` absorvem `DigitalBadge`/`BadgeIssuance`

**Files:** Modify `prisma/schema.prisma`; Create `prisma/migrations/<ts>_badge_absorb_digital/migration.sql`

- [ ] **Step 1:** Editar `model Badge` e `model BadgeAward` (secção File Structure). Confirmar que `enum BadgeLevel` existe (usado por `DigitalBadge`) — reutilizar.
- [ ] **Step 2: Migração SQL manual:**

```sql
ALTER TABLE "Badge"
  ADD COLUMN "code" TEXT,
  ADD COLUMN "imageUrl" TEXT,
  ADD COLUMN "criteria" TEXT,
  ADD COLUMN "skills" TEXT[] DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "level" "BadgeLevel" NOT NULL DEFAULT 'BASIC',
  ADD COLUMN "issuerName" TEXT DEFAULT 'INNOVA',
  ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "createdById" INTEGER,
  ADD COLUMN "deletedAt" TIMESTAMP(3),
  ADD COLUMN "legacyDigitalBadgeId" TEXT;
CREATE UNIQUE INDEX "Badge_code_key" ON "Badge"("code");
CREATE UNIQUE INDEX "Badge_legacyDigitalBadgeId_key" ON "Badge"("legacyDigitalBadgeId");

ALTER TABLE "BadgeAward"
  ADD COLUMN "verifyCode" TEXT,
  ADD COLUMN "assertionId" TEXT,
  ADD COLUMN "evidenceUrl" TEXT,
  ADD COLUMN "shareUrl" TEXT,
  ADD COLUMN "isRevoked" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "revokedAt" TIMESTAMP(3),
  ADD COLUMN "revokeReason" TEXT,
  ADD COLUMN "expiresAt" TIMESTAMP(3),
  ADD COLUMN "issuedById" INTEGER,
  ADD COLUMN "deletedAt" TIMESTAMP(3),
  ADD COLUMN "legacyBadgeIssuanceId" TEXT;
CREATE UNIQUE INDEX "BadgeAward_verifyCode_key" ON "BadgeAward"("verifyCode");
CREATE UNIQUE INDEX "BadgeAward_assertionId_key" ON "BadgeAward"("assertionId");
CREATE UNIQUE INDEX "BadgeAward_legacyBadgeIssuanceId_key" ON "BadgeAward"("legacyBadgeIssuanceId");
-- só depois de confirmar/dedup (ver Global Constraints):
CREATE UNIQUE INDEX "BadgeAward_badgeId_userId_key" ON "BadgeAward"("badgeId", "userId");
```

- [ ] **Step 3:** `npx prisma migrate deploy && npx prisma generate && npx tsc --noEmit`.
- [ ] **Step 4: Commit.**

---

### Task 3: Backfill idempotente `DigitalBadge`/`BadgeIssuance` → `Badge`/`BadgeAward`

**Files:** Create `prisma/backfill-digital-badges.ts`; Create `test/integration/certification/digital-badge-backfill.integration-spec.ts`

**Interfaces:** `backfillDigitalBadges(prisma): Promise<{ badgesCreated: number; badgesLinked: number; issuancesCreated: number; skipped: number }>`.

- [ ] **Step 1: Teste de integração (deve falhar)** — cria um `DigitalBadge` + `BadgeIssuance` (revogado e não), corre o backfill:
  - `Badge` com `legacyDigitalBadgeId`, `level`/`imageUrl` copiados; se `name` colidir com `Badge` nativo → liga ao nativo (não duplica).
  - `BadgeAward` com `legacyBadgeIssuanceId`, `verifyCode`/`assertionId`/`isRevoked` copiados, `awardedAt = issuance.issuedAt`.
  - idempotência (2ª corrida → tudo `0`).
- [ ] **Step 2: FAIL → implementar** seguindo o mapa da Task 1: primeiro upsert de todos os `Badge` (por `legacyDigitalBadgeId`, com fallback "reutilizar nativo por `name`"), depois upsert de `BadgeAward` (por `legacyBadgeIssuanceId`; `badgeId` resolvido via o `Badge` acabado de garantir). `if (require.main === module)` runner.
- [ ] **Step 3: PASS** (`jest --config test/jest-integration.json ... -t "digital-badge"`).
- [ ] **Step 4: tsc + commit.**

---

### Task 4: Adaptadores `Badge`→`DigitalShape`, `BadgeAward`→`IssuanceShape`

**Files:** Create `src/certification/badge-legacy-adapter.ts` + `.spec.ts`

- [ ] **Step 1: Testes (devem falhar)** — todas as chaves de `DigitalShape`/`IssuanceShape` presentes; `id = legacyDigitalBadgeId ?? String(badge.id)`; `issuedAt = award.awardedAt`; `isRevoked = award.isRevoked`; campos sem origem → `null`.
- [ ] **Step 2: FAIL → implementar.**
- [ ] **Step 3: PASS + tsc + commit.**

---

### Task 5: `CertificationService` (métodos de badge) escrevem/lêem `Badge`/`BadgeAward`

**Files:** Modify `src/certification/certification.service.ts`; Test `src/certification/certification.service.spec.ts`

- [ ] **Step 1: Reescrever os testes de badge (devem falhar)** — mocks passam a `mockPrisma.badge.*` / `mockPrisma.badgeAward.*`; retornos via adaptadores. Exemplo:

```ts
it('issueBadge cria um BadgeAward (não BadgeIssuance) e devolve a forma IssuanceShape', async () => {
  mockPrisma.badge.findFirst.mockResolvedValue({ id: 5, name: 'Pioneiro', legacyDigitalBadgeId: 'db1' });
  mockPrisma.badgeAward.findUnique.mockResolvedValue(null); // guard "já possui"
  mockPrisma.badgeAward.create.mockResolvedValue({ id: 1, badgeId: 5, userId: 10, isRevoked: false });
  const res = await service.issueBadge({ badgeId: 'db1', userId: 10 } as any, 99);
  expect(mockPrisma.badgeAward.create).toHaveBeenCalledWith(
    expect.objectContaining({ data: expect.objectContaining({ badgeId: 5, userId: 10, issuedById: 99 }) }),
  );
  expect(res).toHaveProperty('verifyCode');
  expect(res).toHaveProperty('isRevoked', false);
});

it('issueBadge — utilizador já possui o badge → ConflictException', async () => {
  mockPrisma.badge.findFirst.mockResolvedValue({ id: 5, legacyDigitalBadgeId: 'db1' });
  mockPrisma.badgeAward.findUnique.mockResolvedValue({ id: 9, isRevoked: false });
  await expect(service.issueBadge({ badgeId: 'db1', userId: 10 } as any, 99)).rejects.toThrow(ConflictException);
});
```

- [ ] **Step 2: FAIL.**
- [ ] **Step 3: Implementar**:
  - `createBadge(dto, userId)`: `badge.create` com `code` (helper), `createdById = userId`, `legacyDigitalBadgeId = <cuid sintético>`, `level`/`imageUrl`/`criteria`/`skills` do dto; devolve `badgeToDigitalShape(created)`.
  - `findAllBadges()`: `badge.findMany({ where: { deletedAt: null, isActive: true }, orderBy: { level: 'asc' }, include: { _count: { select: { awards: true } } } })` → `.map(badgeToDigitalShape)`.
  - `issueBadge(dto, issuerId)`: resolve `dto.badgeId` (cuid) via `Badge.legacyDigitalBadgeId` (ou `Int`); guard via `badgeAward.findUnique({ where: { badgeId_userId: { badgeId, userId } } })` + `isRevoked`; `badgeAward.create` com `verifyCode`/`assertionId`/`shareUrl`/`issuedById`; `audit.logEntity(..., 'BadgeAward', ...)`; `createNotificationSafe` `BADGE_EARNED`; devolve `badgeAwardToIssuanceShape(created)`.
  - `getMyBadges(userId)`: `badgeAward.findMany({ where: { userId, deletedAt: null, isRevoked: false }, orderBy: { awardedAt: 'desc' }, include: { badge: true } })` → adaptado.
  - `getDashboard()`: a parte de badge conta `Badge`/`BadgeAward` na forma histórica.
- [ ] **Step 4: PASS** (`npx jest src/certification/`).
- [ ] **Step 5: prettier + tsc + eslint + commit.**

---

### Task 6: `dashboard-institutional` conta `BadgeAward`

**Files:** Modify `src/dashboard-institutional/dashboard-institutional.service.ts`; Test o spec.

- [ ] **Step 1: Ajustar o teste (deve falhar).**
- [ ] **Step 2: FAIL → substituir** as contagens de `digitalBadge`/`badgeIssuance` por `badge`/`badgeAward` (ajustar `where` para a semântica histórica: `deletedAt: null` / `isRevoked: false`).
- [ ] **Step 3: PASS + prettier + tsc + commit.**

---

### Task 7: Testes de integração — fluxo de badge pós-consolidação + backfill

**Files:** Modify `test/integration/certification/*.integration-spec.ts`

- [ ] **Step 1:** `POST /certification/badges` → cria `Badge` (verificar `legacyDigitalBadgeId` em BD); `POST /certification/badges/issue` → cria `BadgeAward`; segunda emissão ao mesmo utilizador → 409; `GET /certification/my-badges` devolve a forma legada.
- [ ] **Step 2:** estender `digital-badge-backfill.integration-spec.ts` — `name` colidente (sufixo), issuance revogada, badge soft-deleted.
- [ ] **Step 3: prettier + commit.**

---

### Task 8: Verificação completa + doc

- [ ] **Step 1–3:** `npx jest src/certification src/dashboard-institutional` ; `npm test` ; integração dos lotes `certification` e `dashboard-institutional`.
- [ ] **Step 4:** `npx prettier --check "src/**/*.ts"` ; `npx eslint src/certification src/dashboard-institutional --config eslint.config.staged.mjs` ; `npx tsc --noEmit`.
- [ ] **Step 5: `grep`** — `grep -rn "prisma.\(read.\)\?\(digitalBadge\|badgeIssuance\)" src/` sem hits em código vivo.
- [ ] **Step 6: Actualizar `docs/arquitetura-modular-analise.md`** — §2.3 item 5 (nota "badges unificados em `Badge`/`BadgeAward`, F3 2026-09-05; `DigitalBadge`/`BadgeIssuance` deprecados"); §13 linha F → **Fase F completa** (F1+F2+F3):

```
| F | ~~Unificar Learning Path (3→1) e Certificação/Badges (2→1 cada)~~ — **concluída** em 3 sub-fases: F1 (learning path), F2 (certificação → `Certificate`), F3 (badges → `Badge`/`BadgeAward`). Modelos ricos (`LmsLearningPath`, `IssuedCertificate`, `DigitalBadge`/`BadgeIssuance`) deprecados, remoção física em follow-up. | 6, 7 | — | Ver `docs/superpowers/plans/2026-09-05-fase-f{1,2,3}-*.md` |
```

- [ ] **Step 7: Commit.**

---

### Task 9: PR e CI

- [ ] Branch `refactor/badges-unification` + push (**sobre `main` com F2 já mergeada**).
- [ ] PR — corpo: **migração de dados** (`prisma/backfill-digital-badges.ts` no deploy após `migrate deploy`); ⚠️ **`@@unique([badgeId, userId])` novo em `BadgeAward`** — correr a query de duplicados e dedup **antes** do `migrate deploy` em produção (incluir o SQL de dedup); **verificação do frontend**; nota de que `DigitalBadge`/`BadgeIssuance` ficam no schema.
- [ ] Aguardar `quality` verde → `gh pr merge --squash --auto`.
- [ ] Pós-merge manual: (dedup se necessário) → `npx prisma migrate deploy && npx ts-node prisma/backfill-digital-badges.ts`.

---

## Self-Review

**1. Cobertura da spec (§2.3 item 5 + §13 fase F, parte Badges):**
- "`Badge`/`BadgeAward` (avatar-training) vs `DigitalBadge`/`BadgeIssuance` (certification) — dois sistemas sem relação" → F3 unifica em `Badge`/`BadgeAward`; `CertificationService` passa a escrever o par canónico. ✔
- Com F1+F2+F3 as três duplicações do domínio 6/7 (Learning Path, Certificação, Badges) ficam resolvidas → §13 fase F completa. ✔

**2. Placeholders:** `DigitalShape`/`IssuanceShape` registados na Task 1 a partir do código real; `courseId`/`programId` de `DigitalBadge` marcados "descartar ou guardar em `criteria`" com decisão na Task 1. Sem "TODO" sem critério.

**3. Consistência de tipos:**
- `Badge.legacyDigitalBadgeId` / `BadgeAward.legacyBadgeIssuanceId` (String? @unique) — Task 2, usados 3/4/5/6/7.
- `backfillDigitalBadges(prisma) → { badgesCreated, badgesLinked, issuancesCreated, skipped }` — Tasks 3 e 7.
- `badgeToDigitalShape(badge)` / `badgeAwardToIssuanceShape(award)` — Tasks 4, 5, 6; shapes definidos na Task 1 Step 3.
- `BadgeAward` `@@unique([badgeId, userId])` — introduzido na Task 2, usado pelo guard de `issueBadge` (Task 5) via `where: { badgeId_userId: {...} }`. ✔

**4. Riscos anotados:** migração de dados (idempotente + deploy step); `@@unique([badgeId, userId])` novo → dedup obrigatório antes (query + SQL no PR); `Badge.name @unique` vs `DigitalBadge.name` não-único → sufixo/reutilização; `cuid` vs `Int` nas rotas → colunas legacy; **coordenação com F2** (mesmo ficheiro `certification.service.ts` — F3 só depois de F2 em `main`). Sem ciclo de módulos.
