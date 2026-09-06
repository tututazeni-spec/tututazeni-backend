# Fase F1 — Unificar Learning Path (3 → 1) — Plano de Implementação

> **Para agentes de execução:** SUB-SKILL OBRIGATÓRIA: usar `superpowers:subagent-driven-development` (recomendado) ou `superpowers:executing-plans` para executar este plano tarefa a tarefa. Os passos usam checkbox (`- [ ]`) para acompanhamento.

**Goal:** Existe **um único** sistema de "trilha de aprendizagem": o modelo `LearningPath` e o `LearningPathsService`. `content-library` deixa de aceder às tabelas via `safeModel()` dinâmico e passa a delegar no serviço canónico. `lms` deixa de escrever `LmsLearningPath` — os dados são migrados para `LearningPath` e as rotas `/lms/paths*` delegam com adaptador de forma.

**Architecture:** `LearningPathsService` (`src/learning-paths/`, modelo `LearningPath`/`LearningPathCourse`/`LearningPathEnrollment`/`LearningPathAssignment`/`LearningPathMilestone`) é o canónico e já é o "dono". `ContentLibraryService` injecta-o e delega os 4 endpoints de path (`GET content-library/paths/all`, `GET content-library/paths/:id`, `POST content-library/paths`, `POST content-library/paths/:id/enroll`) — nota: `content-library` já usava a **mesma tabela** `LearningPath` via `safeModel`, com um comentário no código a afirmar (erradamente) que a tabela "não existe"; isto é dívida técnica pura, não uma divergência de modelo. `LmsService` é o caso real de duplicação de modelo: `LmsLearningPath` (cuid, `courseIds String[]` desnormalizado, `targetRoles`/`targetDeptIds` String[], soft-delete). Migra-se para `LearningPath` com uma coluna de rastreio `LearningPath.legacyLmsId` + backfill idempotente (desnormalizado → linhas `LearningPathCourse`/`LearningPathAssignment`); `/lms/paths*` passa a delegar com adaptador. `LmsLearningPath`/`LmsPathEnrollment` **ficam no schema** (deprecados; remoção física é follow-up). Sem ciclo: `content-library`/`lms` → `learning-paths` → Prisma.

**Tech Stack:** NestJS, Prisma (migração SQL manual), Jest (unit + integração com Postgres real), `class-validator`.

**Spec:** `docs/arquitetura-modular-analise.md` (§2.3 item 6, §2.5, §3–4 domínio 6, §5 item 1 (contexto), §13 fase F) e `docs/arquitetura-modular.md` (Fases 3–6).

## Global Constraints

- **Forma de resposta do frontend preservada** (`docs/arquitetura-modular.md` §12). Rotas preservadas, com adaptador de forma onde o contrato histórico difere do canónico:
  - `GET /content-library/paths/all`, `GET /content-library/paths/:id`, `POST /content-library/paths`, `POST /content-library/paths/:id/enroll` — id numérico (já era, `LearningPath.id` é `Int`).
  - `POST /lms/paths`, `GET /lms/paths` (list), `GET /lms/paths/:id`, `PATCH /lms/paths/:id`, `PATCH|POST /lms/paths/:id/progress`, `DELETE /lms/paths/:id`, e as rotas de inscrição/recomendação de `lms` que tocam paths — `LmsLearningPath.id` é `cuid` (String). Após a migração cada `LearningPath` migrada guarda `legacyLmsId String? @unique`; os handlers de `/lms/paths/:id` resolvem o `cuid` via `legacyLmsId`. Paths **novas** criadas por `/lms/paths` recebem um `legacyLmsId` sintético (cuid) para manterem um id string estável no contrato.
- **Migração de dados idempotente** (`upsert` por `legacyLmsId`), corre como passo de deploy + é testada por spec de integração dedicado. Mapa desnormalizado→relacional:
  - `LmsLearningPath.courseIds[]` (+ `courseOrder[]`) → linhas `LearningPathCourse` (`seq` pela ordem, `required = true`). `courseIds` são `String` no LMS mas `Course.id` é `Int` — converter; ids não-numéricos ou inexistentes → registar e saltar essa linha (não abortar).
  - `targetRoles[]` / `targetDeptIds[]` → linhas `LearningPathAssignment` (`targetType = ROLE` / `DEPARTMENT`, `targetId` resolvido). `targetDeptIds` são `String` — converter para `Int`.
  - `LmsPathEnrollment` → `LearningPathEnrollment` (`status`: `PathEnrollmentStatus` → `LearningPathEnrollmentStatus`, tabela de tradução fixada na Task 1).
  - `level` (`PathLevel`) → `level` (`LearningPathLevel`) — tabela de tradução.
  - soft-deleted (`deletedAt != null`) → migrar com `status = ARCHIVED`.
- **Single-tenant** (§7) — nenhum destes modelos tem `tenantId`; nada a fazer.
- `prettier`/`eslint`/`tsc` limpos antes de cada commit. `format:check` do CI corre só `src/**`. **Não** correr prettier em `prisma/**`.
- Integração: lotes contra `postgresql://postgres:postgres@127.0.0.1:5432/innova_test`, `--runInBand`, Redis local, `DB_POOL_MAX=5`. `learning-paths`, `content-library`, `lms` são lotes distintos.
- `micro-learning` **não é tocado** (não tem learning paths — §2.3 item 6 só nomeia os 3).

---

## File Structure

**Novos:**
- `prisma/migrations/<ts>_add_learningpath_legacy_lms_id/migration.sql` — `ALTER TABLE "LearningPath" ADD COLUMN "legacyLmsId" TEXT; CREATE UNIQUE INDEX ...`
- `prisma/backfill-lms-learning-paths.ts` — backfill idempotente `LmsLearningPath` → `LearningPath`.
- `src/lms/lms-path-legacy-adapter.ts` + `.spec.ts` — `learningPathToLmsShape(path): LmsPathShape`.
- `test/integration/lms/lms-path-backfill.integration-spec.ts`.

**Modificados:**
- `prisma/schema.prisma` — `LearningPath` += `legacyLmsId String? @unique`; `enum LearningPathStatus` já tem `ARCHIVED`? confirmar (Task 1).
- `src/learning-paths/learning-paths.service.ts` — expor helpers necessários ao backfill/adaptador; adicionar (se preciso) `createFromLms`/wrappers.
- `src/content-library/content-library.module.ts` — `imports: [PrismaModule, LearningPathsModule]`.
- `src/content-library/content-library.service.ts` — os 4 métodos de path delegam em `LearningPathsService`; remover o bloco `safeModel(this.prisma, 'learningPath'|'learningPathEnrollment')` e o comentário errado.
- `src/content-library/content-library.service.spec.ts` / `*.additional.spec.ts` — adaptar.
- `src/lms/lms.module.ts` — `imports: [PrismaModule, LearningPathsModule]`.
- `src/lms/lms.service.ts` — métodos de path delegam em `LearningPathsService` + adaptador; parar de escrever `LmsLearningPath`/`LmsPathEnrollment`.
- `src/lms/lms.service.spec.ts` / `*.additional.spec.ts` — adaptar.
- `docs/arquitetura-modular-analise.md` — §2.3 item 6, §13 fase F (parcial: F1 feita).

---

### Task 1: Nota de mapeamento — `LmsLearningPath` ↔ `LearningPath`, enums, formas de resposta

**Files:**
- Create: `docs/superpowers/plans/notes/fase-f1-lms-path-map.md`

- [ ] **Step 1: Ler modelos e enums** — `model LearningPath`/`LearningPathCourse`/`LearningPathAssignment`/`LearningPathEnrollment` (~2125), `model LmsLearningPath`/`LmsPathEnrollment` (~7868); enums `LearningPathLevel`/`PathLevel`, `LearningPathStatus` (tem `ARCHIVED`?), `LearningPathEnrollmentStatus`/`PathEnrollmentStatus`, `AssignmentTarget`.

- [ ] **Step 2: Tabela de campos `LmsLearningPath` → `LearningPath`**

| `LmsLearningPath` | `LearningPath` | Regra |
|---|---|---|
| `id` (cuid) | `legacyLmsId` (novo) | rastreio 1:1; `LearningPath.id` fica Int |
| `code` | — (não há `code` em `LearningPath`) | guardar em `objective` prefixado ou descartar; decidir |
| `name` | `title` | |
| `description` | `description` | |
| `thumbnail` | `thumbnailUrl` | |
| `courseIds[]` + `courseOrder[]` | `LearningPathCourse[]` | `seq` pela ordem; `courseId` = `Number(x)`; inválido → skip+log |
| `targetRoles[]` | `LearningPathAssignment{targetType:ROLE}` | `targetId` = id do `Role` pelo nome/code |
| `targetDeptIds[]` | `LearningPathAssignment{targetType:DEPARTMENT}` | `targetId` = `Number(x)` |
| `skills[]` | `tags[]` (merge) | |
| `estimatedHours` | `totalHours` | |
| `level` (`PathLevel`) | `level` (`LearningPathLevel`) | tabela Step 3 |
| `isActive`/`deletedAt` | `status` | `deletedAt≠null → ARCHIVED`; `isActive → PUBLISHED`; senão `DRAFT` |
| `isMandatory` | `mandatory` | |
| `isFeatured` | — | descartar (não há campo) ou `pathType` |
| `enrolledCount`/`completedCount` | — (derivados) | não migrar (calculados) |
| `createdById` | — | `LearningPath` não tem `createdById`; descartar |

- [ ] **Step 3: Tabelas de tradução de enum** (valores reais confirmados)

```
PathLevel → LearningPathLevel
  BASIC → BEGINNER ; INTERMEDIATE → INTERMEDIATE ; ADVANCED → ADVANCED ; <outro> → BEGINNER

PathEnrollmentStatus → LearningPathEnrollmentStatus
  IN_PROGRESS → IN_PROGRESS ; COMPLETED → COMPLETED ; <outro> → NOT_STARTED
```

- [ ] **Step 4: Formas de resposta**
  - `LmsPathShape` — ler `lms.service.ts` `createPath`/`listPaths`/`getPath`/`updatePathProgress` e registar os campos exactos que devolvem (incl. `courseIds`/`courseOrder` reconstruídos a partir de `LearningPathCourse`, `progress` de `LearningPathEnrollment`).
  - `ContentLibraryPathShape` — ler `content-library.service.ts` `getLearningPaths`/`getLearningPath`/`createLearningPath`/`enrollLearningPath` (linhas ~880–1030). Comparar com `LearningPathsService.findAll`/`findOne`/`create`/`selfEnroll` — anotar deltas → adaptador.

- [ ] **Step 5: Commit da nota**

```bash
git add docs/superpowers/plans/notes/fase-f1-lms-path-map.md
git commit -m "docs(fase-f1): mapa LmsLearningPath↔LearningPath + formas de resposta content-library/lms"
```

---

### Task 2: `content-library` — 4 endpoints de path delegam em `LearningPathsService`

**Files:**
- Modify: `src/content-library/content-library.module.ts`
- Modify: `src/content-library/content-library.service.ts`
- Test: `src/content-library/content-library.service.spec.ts`

**Interfaces:**
- Consumes: `LearningPathsService.findAll`/`findOne`/`create`/`selfEnroll` (assinaturas existentes — confirmar em `learning-paths.service.ts`).

- [ ] **Step 1: Reescrever os testes dos 4 métodos (devem falhar)**

Em `content-library.service.spec.ts`: adicionar `{ provide: LearningPathsService, useValue: mockLP }` aos providers; reescrever `getLearningPaths`/`getLearningPath`/`createLearningPath`/`enrollLearningPath` como testes de delegação (+ adaptador de forma conforme a nota da Task 1). Exemplo:

```ts
it('getLearningPaths delega em LearningPathsService.findAll e adapta a forma', async () => {
  mockLP.findAll.mockResolvedValue({ data: [{ id: 1, title: 'X' }], total: 1 });
  const res = await service.getLearningPaths({});
  expect(mockLP.findAll).toHaveBeenCalled();
  expect(res.data[0]).toEqual(expect.objectContaining({ id: 1 }));
});
```

- [ ] **Step 2: FAIL**

```bash
npx jest src/content-library/content-library.service.spec.ts -t "earningPath"
```

- [ ] **Step 3: Implementar**

- `content-library.module.ts`: `imports: [PrismaModule, LearningPathsModule]` (import `LearningPathsModule` de `../learning-paths/learning-paths.module`).
- `content-library.service.ts`: construtor `+ private readonly learningPaths: LearningPathsService`. Substituir os corpos:

```ts
  async getLearningPaths(filters: ContentLibraryLearningPathFilterDto = {}) {
    const result = await this.learningPaths.findAll(filters as any);
    return result; // + adaptação de forma se a nota da Task 1 indicar deltas
  }
  async getLearningPath(id: number, userId?: number) {
    const path = await this.learningPaths.findOne(id);
    // se o contrato histórico incluía progresso do utilizador:
    if (userId) {
      const progress = await this.learningPaths.getMyProgress(id, userId).catch(() => null);
      return { ...path, myProgress: progress };
    }
    return path;
  }
  async createLearningPath(dto: CreateLearningPathDto, createdById: number) {
    return this.learningPaths.create(dto as any);
  }
  async enrollLearningPath(pathId: number, userId: number) {
    return this.learningPaths.selfEnroll(pathId, userId);
  }
```

- Remover o bloco `safeModel(this.prisma, 'learningPath'|'learningPathEnrollment')` e o comentário `// "LearningPath" em prisma/schema.prisma tem um shape completamente...`. Se `safeModel` deixar de ser usado no ficheiro, remover o import.

- [ ] **Step 4: PASS**

```bash
npx jest src/content-library/
```

- [ ] **Step 5: prettier + tsc + eslint**

```bash
npx prettier --write src/content-library/
npx tsc --noEmit
npx eslint src/content-library/content-library.service.ts --config eslint.config.staged.mjs
```

- [ ] **Step 6: Commit**

```bash
git add src/content-library/
git commit -m "refactor(content-library): endpoints de learning path delegam em LearningPathsService (remove safeModel)"
```

---

### Task 3: Migração de schema — `LearningPath.legacyLmsId`

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/<ts>_add_learningpath_legacy_lms_id/migration.sql`

- [ ] **Step 1: Schema** — em `model LearningPath`: `legacyLmsId String? @unique`. Confirmar que `enum LearningPathStatus` tem `ARCHIVED`; se não, adicionar.

- [ ] **Step 2: Migração SQL manual** (dev DB tem drift — `migrate deploy`, não `migrate dev`):

```sql
ALTER TABLE "LearningPath" ADD COLUMN "legacyLmsId" TEXT;
CREATE UNIQUE INDEX "LearningPath_legacyLmsId_key" ON "LearningPath"("legacyLmsId");
-- se ARCHIVED faltar no enum:
-- ALTER TYPE "LearningPathStatus" ADD VALUE IF NOT EXISTS 'ARCHIVED';
```

- [ ] **Step 3: Aplicar + gerar**

```bash
npx prisma migrate deploy && npx prisma generate && npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/
git commit -m "feat(db): LearningPath.legacyLmsId para rastrear a migração de LmsLearningPath"
```

---

### Task 4: Backfill idempotente `LmsLearningPath` → `LearningPath`

**Files:**
- Create: `prisma/backfill-lms-learning-paths.ts`
- Create: `test/integration/lms/lms-path-backfill.integration-spec.ts`

**Interfaces:**
- Produces: `backfillLmsLearningPaths(prisma): Promise<{ created: number; skipped: number; coursesLinked: number; assignmentsCreated: number; enrollmentsMigrated: number }>` — idempotente por `legacyLmsId`.

- [ ] **Step 1: Teste de integração (deve falhar)**

```ts
describe('backfill LmsLearningPath → LearningPath', () => {
  it('migra path com courseIds desnormalizados para LearningPathCourse + assignments + enrollment', async () => {
    const c1 = await prisma.course.create({ data: { /* mínimo */ } as any });
    const lms = await prisma.lmsLearningPath.create({
      data: {
        code: 'LMS-E2E-1', name: 'Path E2E', courseIds: [String(c1.id)], courseOrder: [String(c1.id)],
        targetDeptIds: [], targetRoles: [], skills: ['x'], level: 'BASIC', isActive: true, createdById: seededUserId,
      },
    });
    const enr = await prisma.lmsPathEnrollment.create({
      data: { pathId: lms.id, userId: seededUserId, status: 'IN_PROGRESS', progress: 20, completedCourseIds: [] },
    });

    const r1 = await backfillLmsLearningPaths(prisma);
    expect(r1.created).toBeGreaterThanOrEqual(1);

    const lp = await prisma.learningPath.findUnique({
      where: { legacyLmsId: lms.id }, include: { courses: true, assignments: true, enrollments: true },
    });
    expect(lp).not.toBeNull();
    expect(lp!.title).toBe('Path E2E');
    expect(lp!.courses).toHaveLength(1);
    expect(lp!.courses[0].courseId).toBe(c1.id);
    expect(lp!.enrollments.some(e => e.userId === seededUserId && e.status === 'IN_PROGRESS')).toBe(true);

    // idempotência
    const r2 = await backfillLmsLearningPaths(prisma);
    expect(r2.created).toBe(0);
    expect(await prisma.learningPath.count({ where: { legacyLmsId: lms.id } })).toBe(1);

    // cleanup
    await prisma.learningPathEnrollment.deleteMany({ where: { learningPathId: lp!.id } });
    await prisma.learningPathCourse.deleteMany({ where: { learningPathId: lp!.id } });
    await prisma.learningPathAssignment.deleteMany({ where: { learningPathId: lp!.id } });
    await prisma.learningPath.delete({ where: { id: lp!.id } });
    await prisma.lmsPathEnrollment.delete({ where: { id: enr.id } });
    await prisma.lmsLearningPath.delete({ where: { id: lms.id } });
    await prisma.course.delete({ where: { id: c1.id } });
  });
});
```

- [ ] **Step 2: FAIL → implementar** o script (`prisma/backfill-lms-learning-paths.ts`) seguindo os mapas da Task 1: cria `LearningPath` (upsert por `legacyLmsId`), depois `LearningPathCourse` (skip ids inválidos com `console.warn`), `LearningPathAssignment` (resolve role por nome/code, dept por Number), `LearningPathEnrollment` (upsert por `@@unique([learningPathId, userId])`). Bloco `if (require.main === module)` para correr standalone.

- [ ] **Step 3: PASS**

```bash
npx cross-env NODE_ENV=test jest --config test/jest-integration.json --forceExit --runInBand --testPathPatterns "test/integration/(lms)/" -t "backfill"
```

- [ ] **Step 4: tsc + commit**

```bash
npx tsc --noEmit
git add prisma/backfill-lms-learning-paths.ts test/integration/lms/lms-path-backfill.integration-spec.ts
git commit -m "feat(db): backfill idempotente LmsLearningPath → LearningPath (desnormalizado → relacional)"
```

---

### Task 5: Adaptador `LearningPath` → forma LMS + `/lms/paths*` delega em `LearningPathsService`

**Files:**
- Create: `src/lms/lms-path-legacy-adapter.ts` + `.spec.ts`
- Modify: `src/lms/lms.module.ts`, `src/lms/lms.service.ts`
- Test: `src/lms/lms.service.spec.ts`

**Interfaces:**
- Produces: `learningPathToLmsShape(path & {courses, enrollments}): LmsPathShape` — `id = legacyLmsId ?? <cuid sintético>`, `courseIds`/`courseOrder` reconstruídos de `courses` ordenados por `seq`, `level` invertido, `progress` de `enrollments`.
- Consumes: `LearningPathsService` (métodos de CRUD/enroll/progress).

- [ ] **Step 1: Teste do adaptador (deve falhar)** — id ← legacyLmsId, courseIds reconstruídos por seq, level invertido, todas as chaves LMS presentes.

- [ ] **Step 2: FAIL → implementar** o adaptador (tabela inversa de enums da Task 1).

- [ ] **Step 3: PASS**

```bash
npx jest src/lms/lms-path-legacy-adapter.spec.ts
```

- [ ] **Step 4: Reescrever os testes de path do `lms.service.spec.ts` (devem falhar)** — mock de `LearningPathsService`; `createPath`/`listPaths`/`getPath`/`updatePath`/`updatePathProgress`/`deletePath` delegam + adaptam. `getPath('cuid')` resolve via `legacyLmsId`.

- [ ] **Step 5: FAIL → implementar**

- `lms.module.ts`: `imports: [PrismaModule, LearningPathsModule]`.
- `lms.service.ts`: construtor `+ private readonly learningPaths: LearningPathsService`. Substituir os métodos de path:
  - `createPath(dto, userId)` → mapear `LmsCreateLearningPathDto` → DTO canónico, `this.learningPaths.create(...)`, gerar `legacyLmsId` sintético (`cuid`) e gravá-lo, devolver `learningPathToLmsShape(created)`.
  - `listPaths(query)` → `this.learningPaths.findAll(mappedFilters)` → `.map(learningPathToLmsShape)`.
  - `getPath(id)` → resolver `id` (cuid) via `prisma.learningPath.findUnique({ where: { legacyLmsId: id } })` (ou aceitar Int se numérico) → `learningPathToLmsShape`.
  - `updatePath(id, dto, userId)` → resolver + `this.learningPaths.update(realId, mappedDto)`.
  - `updatePathProgress(id, completedCourseId, userId)` → resolver + `this.learningPaths.markCourseComplete`/equivalente (confirmar o método real de progresso em `learning-paths.service.ts`; se não existir um por-curso, usar `getMyProgress` + a lógica de conclusão de path `completePath`).
  - `deletePath(id)` → resolver + `this.learningPaths.archive(realId)` (soft) ou `.remove(realId)` conforme o comportamento histórico do LMS (que faz soft-delete via `deletedAt`) → **archive**.
  - Métodos de recomendação/stats que liam `lmsLearningPath` → passam a ler `learningPath` via o serviço canónico (ou `prisma.learningPath` para agregação pura — §4).
- **Parar** de escrever `LmsLearningPath`/`LmsPathEnrollment` (nenhum `.create`/`.update` a esses modelos em código vivo).

- [ ] **Step 6: PASS**

```bash
npx jest src/lms/
```

- [ ] **Step 7: prettier + tsc + eslint + commit**

```bash
npx prettier --write src/lms/
npx tsc --noEmit
npx eslint src/lms/lms.service.ts --config eslint.config.staged.mjs
git add src/lms/
git commit -m "refactor(lms): /lms/paths delega em LearningPathsService com adaptador; para de escrever LmsLearningPath"
```

---

### Task 6: Testes de integração — paridade dos 3 caminhos

**Files:**
- Modify: `test/integration/content-library/*.integration-spec.ts`
- Modify: `test/integration/lms/*.integration-spec.ts`
- Modify: `test/integration/learning-paths/*.integration-spec.ts`

- [ ] **Step 1: `content-library` — path criada aqui aparece em `/learning-paths`**

```ts
it('POST /content-library/paths cria uma LearningPath real, visível em GET /learning-paths', async () => {
  const created = await request(app.getHttpServer())
    .post('/content-library/paths').set('Authorization', `Bearer ${adminToken}`)
    .send({ title: 'F1 CL Path', courses: [{ courseId: seededCourseId, seq: 1 }] }).expect(201);
  const viaCanonical = await request(app.getHttpServer())
    .get(`/learning-paths/${created.body.id}`).set('Authorization', `Bearer ${adminToken}`).expect(200);
  expect(viaCanonical.body.title).toBe('F1 CL Path');
});
```

- [ ] **Step 2: `lms` — fluxo completo pós-consolidação + backfill multi-estado**

`POST /lms/paths` → verificar que cria `LearningPath` com `legacyLmsId`; `GET /lms/paths/:id` resolve o cuid; `PATCH .../progress` reflecte em `LearningPathEnrollment`. Estender `lms-path-backfill.integration-spec.ts` com paths soft-deleted (→ `ARCHIVED`) e `courseIds` com id inválido (→ skip sem abortar).

- [ ] **Step 3: `learning-paths` — specs existentes continuam verdes sem alteração.**

- [ ] **Step 4: prettier + commit**

```bash
npx prettier --write test/integration/
git add test/integration/
git commit -m "test(integration): paridade learning path content-library/lms/canónico + backfill LMS"
```

---

### Task 7: Verificação completa + documento de arquitectura

**Files:**
- Modify: `docs/arquitetura-modular-analise.md`

- [ ] **Step 1–3: unit dos módulos + `npm test` + integração dos 3 lotes**

```bash
npx jest src/learning-paths src/content-library src/lms
npm test
npx cross-env NODE_ENV=test jest --config test/jest-integration.json --forceExit --runInBand --testPathPatterns "test/integration/(learning-paths)/"
npx cross-env NODE_ENV=test jest --config test/jest-integration.json --forceExit --runInBand --testPathPatterns "test/integration/(content-library)/"
npx cross-env NODE_ENV=test jest --config test/jest-integration.json --forceExit --runInBand --testPathPatterns "test/integration/(lms)/"
```

- [ ] **Step 4: prettier (`src/**`) + eslint + tsc**

```bash
npx prettier --check "src/**/*.ts"
npx eslint src/content-library src/lms --config eslint.config.staged.mjs
npx tsc --noEmit
```

- [ ] **Step 5: `grep` de confirmação**

```bash
grep -rn "safeModel(this.prisma, 'learningPath" src/content-library/
grep -rn "prisma.lmsLearningPath\|prisma\.\(read\.\)\?lmsLearningPath" src/lms/lms.service.ts
```

Esperado: primeiro sem hits; segundo só leituras de agregação pura (se as houver) ou zero.

- [ ] **Step 6: Actualizar `docs/arquitetura-modular-analise.md`**

- §2.3 item 6: acrescentar `\n\n> **Actualização (Fase F1, 2026-09-05):** consolidado — `LearningPathsService`/`LearningPath` é o único sistema. `content-library` deixou o `safeModel` e delega; `lms` migrou `LmsLearningPath` para `LearningPath` (`legacyLmsId` + backfill). Remoção física de `LmsLearningPath`/`LmsPathEnrollment` fica para follow-up.`
- §13 linha F: marcar a parte de Learning Path como feita, deixando Certificação/Badges (F2/F3) por fazer:

```
| F | Unificar Learning Path (3→1) [~~feito, F1~~] e Certificação/Badges (2→1 cada) [F2/F3] | 6, 7 | Médio-alto | ... |
```

- [ ] **Step 7: Commit**

```bash
git add docs/arquitetura-modular-analise.md
git commit -m "docs: marcar Fase F1 (unificação de Learning Path) como concluída"
```

---

### Task 8: PR e CI

- [ ] **Step 1: Branch + push** → `refactor/learning-path-unification`.
- [ ] **Step 2: PR** — corpo inclui: aviso de **migração de dados** (`prisma/backfill-lms-learning-paths.ts` corre no deploy após `migrate deploy`); **verificação do frontend** (rotas `/lms/paths*` e `/content-library/paths*` — confirmar que nenhum campo perdido no adaptador é usado); nota de que `LmsLearningPath` fica no schema.
- [ ] **Step 3: Aguardar `quality` verde.**
- [ ] **Step 4: `gh pr merge --squash --auto`.**
- [ ] **Step 5 (pós-merge, manual no ambiente):** `npx prisma migrate deploy && npx ts-node prisma/backfill-lms-learning-paths.ts`.

---

## Self-Review

**1. Cobertura da spec (§2.3 item 6 + §13 fase F, parte Learning Path):**
- "`learning-paths` (dono) vs `content-library` (safeModel, comentário errado) vs `lms` (3º modelo)" → Task 2 (content-library delega), Tasks 3–5 (lms migra). ✔
- "remover funcionalidades de `content-library` que apontam a tabelas inexistentes" (§3–4 domínio 6) → Task 2 Step 3 remove `safeModel` + comentário. ✔ (na verdade a tabela existe — a correcção é usar o serviço canónico.)
- Certificação/Badges → **não** nesta fase; F2/F3 são planos separados (decisão do dono do produto, 2026-09-05). §13 fica marcado como parcial. ✔

**2. Placeholders:** a Task 1 produz mapas cujos valores de enum são confirmados no schema em runtime — steps dependentes dizem-no. `updatePathProgress` na Task 5 Step 5 diz "confirmar o método real de progresso em learning-paths.service.ts" com fallback explícito. Sem "TODO" sem critério.

**3. Consistência de tipos:**
- `LearningPath.legacyLmsId` (String? @unique) — Task 3, usado nas Tasks 4/5/6.
- `backfillLmsLearningPaths(prisma) → { created, skipped, coursesLinked, assignmentsCreated, enrollmentsMigrated }` — Tasks 4 e 6.
- `learningPathToLmsShape(path) → LmsPathShape` — Task 5; `LmsPathShape` definida na Task 1 Step 4.
- `content-library` delega em `findAll`/`findOne`/`create`/`selfEnroll`/`getMyProgress` — assinaturas a confirmar contra `learning-paths.service.ts` no arranque da Task 2 (o método `getMyProgress(id, userId)` existe — visto no method list). ✔

**4. Riscos anotados:** migração de dados (idempotente + passo de deploy no PR); `LmsLearningPath.id` cuid vs rotas → `legacyLmsId`; `courseIds` String no LMS vs `Course.id` Int (skip+log); `migrate dev` inutilizável → SQL manual; formas de resposta preservadas via adaptadores; `micro-learning` fora do âmbito. Sem ciclo de módulos: `content-library`/`lms` → `learning-paths` → Prisma; `learning-paths` não importa nenhum dos dois.
