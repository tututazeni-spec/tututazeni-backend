# Fase G4 — Consolidar Reuniões 1:1 (`OneOnOne` → `OneOnOneMeeting`, serviço único) — Plano de Implementação

> **Para agentes de execução:** SUB-SKILL OBRIGATÓRIA: `superpowers:subagent-driven-development` (recomendado) ou `superpowers:executing-plans`. Steps usam checkbox (`- [ ]`).

**Goal:** Existe **um único** modelo (`OneOnOneMeeting`) e **um único serviço** (`OneOnOneService`, novo módulo dedicado) para reuniões 1:1. `engagement` e `leadership` deixam de ter cada um a sua implementação; `leadership`'s modelo `OneOnOne` é migrado.

**Architecture:** Novo `src/one-on-one/` (`OneOnOneModule`, `OneOnOneService`) — dono de `OneOnOneMeeting` (`hostId`/`participantId`, `recurring`/`frequency`, `@db.Text` em `agenda`/`minutes`/`actionItems`). `EngagementService` (`engagement.service.ts:851,921`) e `LeadershipService` (`leadership.service.ts:411,472`) importam `OneOnOneModule` e delegam. As rotas `/engagement/one-on-one*` e as de 1:1 de `/leadership` mantêm-se, com adaptador de forma no ponto de delegação (o `leadership` usava `managerId`/`subordinateId`; o canónico usa `hostId`/`participantId`). Os dados de `OneOnOne` migram para `OneOnOneMeeting` com `legacyOneOnOneId Int? @unique` + backfill idempotente. `OneOnOne` **fica no schema** (deprecado; remoção física é follow-up). `leader` só lê 1:1 (agregação) — fica (§4). Sem ciclo: `engagement`/`leadership` → `one-on-one` → Prisma.

**Tech Stack:** NestJS, Prisma (migração SQL manual), Jest (unit + integração), `class-validator`.

**Spec:** `docs/arquitetura-modular-analise.md` (§2.3 item 10, §2.5, §3–4 domínio 8, §13 fase G).

## Global Constraints

- **Forma de resposta do frontend preservada** (§12). Rotas preservadas: `POST /engagement/one-on-one`, `GET /engagement/one-on-one/my`, `PATCH /engagement/one-on-one/:id`, e as rotas de 1:1 de `LeadershipController` (identificar na Task 1). Adaptador no ponto de delegação — em particular, se o contrato de `/leadership` expõe `managerId`/`subordinateId`, o adaptador re-mapeia de `hostId`/`participantId` (chaves sempre presentes).
- **`OneOnOne` → `OneOnOneMeeting` field map:** `managerId`→`hostId`, `subordinateId`→`participantId`, `scheduledAt`/`durationMinutes`/`status`/`agenda`/`meetingUrl`/`minutes`/`actionItems`/`nextMeetingDate`/`completedAt` → homónimos. Sem `recurring`/`frequency` na origem → `false`/`null`. `enum OneOnOneStatus` é **partilhado** pelos dois modelos (confirmar na Task 1) — sem tradução de estado.
- **Migração de dados idempotente** (`upsert` por `legacyOneOnOneId`), passo de deploy + spec de integração.
- **Sem `@@unique` novo** — `OneOnOneMeeting` não tem par único (várias reuniões entre as mesmas pessoas são válidas).
- **`tenantId`** — nenhum dos dois modelos tem; §7 single-tenant — nada a fazer.
- `prettier`/`eslint`/`tsc` limpos; `format:check` do CI só `src/**`; **não** correr prettier em `prisma/**`.
- Integração: lotes `engagement`, `leadership` distintos (o novo `one-on-one` terá o seu).

---

## File Structure

**Novos:**
- `src/one-on-one/one-on-one.module.ts` — `OneOnOneModule`, exporta `OneOnOneService`.
- `src/one-on-one/one-on-one.service.ts` — CRUD de `OneOnOneMeeting` (`schedule`, `update`, `listForUser`, `getOne`, `complete`, `cancel`).
- `src/one-on-one/one-on-one.service.spec.ts`.
- `src/one-on-one/one-on-one-legacy-adapter.ts` + `.spec.ts` — `meetingToLeadershipShape(m)` (`hostId`→`managerId`, `participantId`→`subordinateId`).
- `prisma/migrations/<ts>_add_oneonone_meeting_legacy_id/migration.sql`.
- `prisma/backfill-one-on-ones.ts` + spec de integração.

**Modificados:**
- `prisma/schema.prisma` — `OneOnOneMeeting` += `legacyOneOnOneId Int? @unique`.
- `src/engagement/engagement.module.ts` — `imports: [..., OneOnOneModule]`.
- `src/engagement/engagement.service.ts` — os 2 pontos de 1:1 delegam.
- `src/engagement/engagement.service.spec.ts` — adaptar.
- `src/leadership/leadership.module.ts` — `imports: [..., OneOnOneModule]`.
- `src/leadership/leadership.service.ts` — os 2 pontos de 1:1 delegam + adaptador de forma.
- `src/leadership/leadership.service.spec.ts` — adaptar.
- `docs/arquitetura-modular-analise.md` — §2.3 item 10, §13 fase G (G4 feita → Fase G completa).

---

### Task 1: Nota de mapeamento — rotas de 1:1 dos 2 módulos, formas de resposta, `OneOnOneStatus`

**Files:** Create `docs/superpowers/plans/notes/fase-g4-one-on-one-map.md`

- [ ] **Step 1:** Ler `engagement.service.ts` linhas ~840–930 (create + update 1:1) e os handlers de `/engagement/one-on-one*`. Ler `leadership.service.ts` linhas ~400–480 (create + update `OneOnOne`) e os handlers de 1:1 de `LeadershipController` (grep `one` / `1:1` / `oneOnOne` no controller). Ler `model OneOnOne`, `model OneOnOneMeeting`, `enum OneOnOneStatus`.
- [ ] **Step 2:** Tabela: `rota | serviço/método actual | método canónico `OneOnOneService` | forma de resposta (campos) | adaptador?`.
- [ ] **Step 3:** Confirmar que `OneOnOneStatus` é o mesmo enum para os dois modelos. Definir `LeadershipMeetingShape` (a forma que `/leadership` devolve — provável `managerId`/`subordinateId`).
- [ ] **Step 4:** Definir a API canónica final: `schedule(dto: { hostId; participantId; scheduledAt; durationMinutes?; agenda?; meetingUrl?; recurring?; frequency? })`, `update(id, dto)`, `listForUser(userId, filters?)`, `getOne(id)`, `complete(id, dto: { minutes?; actionItems?; nextMeetingDate? })`, `cancel(id)`.
- [ ] **Step 5: Commit da nota.**

---

### Task 2: `OneOnOneModule` + `OneOnOneService` (CRUD de `OneOnOneMeeting`)

**Files:** Create `src/one-on-one/one-on-one.module.ts`, `one-on-one.service.ts`, `one-on-one.service.spec.ts`

**Interfaces:** `OneOnOneService` — `schedule`, `update`, `listForUser`, `getOne` (throws `NotFoundException`), `complete`, `cancel`, com as assinaturas da Task 1 Step 4.

- [ ] **Step 1: Testes (devem falhar)** — um por método, sobre `prisma.oneOnOneMeeting` mockado:

```ts
it('schedule cria um OneOnOneMeeting com host/participant', async () => {
  mockPrisma.oneOnOneMeeting.create.mockResolvedValue({ id: 1 });
  await service.schedule({ hostId: 10, participantId: 20, scheduledAt: '2026-02-01T10:00:00Z' } as any);
  expect(mockPrisma.oneOnOneMeeting.create).toHaveBeenCalledWith(
    expect.objectContaining({ data: expect.objectContaining({ hostId: 10, participantId: 20 }) }),
  );
});
it('getOne inexistente → NotFoundException', async () => {
  mockPrisma.oneOnOneMeeting.findUnique.mockResolvedValue(null);
  await expect(service.getOne(999)).rejects.toThrow(NotFoundException);
});
it('listForUser devolve reuniões onde é host OU participant', async () => {
  mockPrisma.read.oneOnOneMeeting.findMany.mockResolvedValue([]);
  await service.listForUser(10);
  expect(mockPrisma.read.oneOnOneMeeting.findMany).toHaveBeenCalledWith(
    expect.objectContaining({ where: expect.objectContaining({ OR: [{ hostId: 10 }, { participantId: 10 }] }) }),
  );
});
it('complete grava minutes/actionItems/completedAt + status COMPLETED', async () => {
  mockPrisma.oneOnOneMeeting.update.mockResolvedValue({ id: 1, status: 'COMPLETED' });
  await service.complete(1, { minutes: 'x' } as any);
  expect(mockPrisma.oneOnOneMeeting.update).toHaveBeenCalledWith(
    expect.objectContaining({ data: expect.objectContaining({ status: 'COMPLETED', completedAt: expect.any(Date), minutes: 'x' }) }),
  );
});
```

- [ ] **Step 2: FAIL → implementar** o módulo + serviço (padrão dos outros serviços do repo: `constructor(private prisma: PrismaService)`, `private readonly logger`).
- [ ] **Step 3: PASS + tsc.**
- [ ] **Step 4: prettier + commit.**

```bash
git add src/one-on-one/
git commit -m "feat(one-on-one): OneOnOneModule + OneOnOneService (dono único de OneOnOneMeeting)"
```

---

### Task 3: Migração de schema — `OneOnOneMeeting.legacyOneOnOneId`

**Files:** Modify `prisma/schema.prisma`; Create migration SQL.

- [ ] **Step 1:** `model OneOnOneMeeting` += `legacyOneOnOneId Int? @unique`.
- [ ] **Step 2:** Migração SQL manual (`migrate deploy`, não `migrate dev`):

```sql
ALTER TABLE "OneOnOneMeeting" ADD COLUMN "legacyOneOnOneId" INTEGER;
CREATE UNIQUE INDEX "OneOnOneMeeting_legacyOneOnOneId_key" ON "OneOnOneMeeting"("legacyOneOnOneId");
```

- [ ] **Step 3:** `npx prisma migrate deploy && npx prisma generate && npx tsc --noEmit`.
- [ ] **Step 4: Commit.**

---

### Task 4: Backfill idempotente `OneOnOne` → `OneOnOneMeeting`

**Files:** Create `prisma/backfill-one-on-ones.ts`; Create `test/integration/leadership/one-on-one-backfill.integration-spec.ts`

**Interfaces:** `backfillOneOnOnes(prisma): Promise<{ created: number; skipped: number }>` — `upsert` por `legacyOneOnOneId`.

- [ ] **Step 1: Teste de integração (deve falhar)** — cria um `OneOnOne`, corre o backfill, verifica `OneOnOneMeeting` com `legacyOneOnOneId`, `hostId === oneOnOne.managerId`, `participantId === oneOnOne.subordinateId`, `recurring === false`; idempotência (2ª corrida → `created: 0`).
- [ ] **Step 2: FAIL → implementar** seguindo o field map das Global Constraints.
- [ ] **Step 3: PASS** (`jest --config test/jest-integration.json ... -t "one-on-one-backfill"`).
- [ ] **Step 4: tsc + commit.**

---

### Task 5: Adaptador + `engagement`/`leadership` delegam

**Files:** Create `src/one-on-one/one-on-one-legacy-adapter.ts` + `.spec.ts`; Modify `engagement`/`leadership` module+service+specs

- [ ] **Step 1: Adaptador (teste + impl)** — `meetingToLeadershipShape(m)`: `managerId = m.hostId`, `subordinateId = m.participantId`, `id = legacyOneOnOneId ?? m.id` (decisão da Task 1 — se `/leadership` expõe id numérico do `OneOnOne`, resolver via `legacyOneOnOneId`), restantes campos directos, chaves sempre presentes.
- [ ] **Step 2: `engagement` delega** — `engagement.module.ts` `imports: [..., OneOnOneModule]`; construtor `+ oneOnOne`; os 2 pontos (`:851` create, `:921` update) → `this.oneOnOne.schedule(...)` / `this.oneOnOne.update(...)`. Reescrever os testes afectados (delegação). `GET /engagement/one-on-one/my` → `this.oneOnOne.listForUser(user.id)`.
- [ ] **Step 3: `leadership` delega** — `leadership.module.ts` `imports: [..., OneOnOneModule]`; construtor `+ oneOnOne`; os 2 pontos (`:411` create, `:472` update) → `this.oneOnOne.schedule(mapManagerSubordinate(dto))` / `this.oneOnOne.update(id, ...)`, e cada retorno passa por `meetingToLeadershipShape`. Reescrever os testes.
- [ ] **Step 4: PASS** (`npx jest src/one-on-one src/engagement src/leadership`).
- [ ] **Step 5: `grep -n "prisma.oneOnOne\b\|prisma.oneOnOne\." src/leadership/leadership.service.ts src/engagement/engagement.service.ts`** → zero em código vivo (`oneOnOneMeeting` directo idem).
- [ ] **Step 6: prettier + tsc + eslint + commit.**

---

### Task 6: Testes de integração — paridade + backfill

**Files:** Modify `test/integration/engagement/*.integration-spec.ts`, `test/integration/leadership/*.integration-spec.ts`

- [ ] **Step 1: `engagement`** — `POST /engagement/one-on-one` cria `OneOnOneMeeting` (sem `legacyOneOnOneId`); `PATCH .../:id` actualiza; `GET .../my` devolve a forma histórica.
- [ ] **Step 2: `leadership`** — o fluxo de 1:1 de `/leadership` cria `OneOnOneMeeting` e devolve `managerId`/`subordinateId` (adaptador); backfill multi-estado (`SCHEDULED`/`COMPLETED`/`CANCELLED`).
- [ ] **Step 3: prettier + commit.**

---

### Task 7: Verificação completa + doc

- [ ] **Step 1–3:** `npx jest src/one-on-one src/engagement src/leadership` ; `npm test` ; integração dos lotes `engagement` e `leadership`.
- [ ] **Step 4:** `npx prettier --check "src/**/*.ts"` ; `npx eslint src/one-on-one src/engagement src/leadership --config eslint.config.staged.mjs` ; `npx tsc --noEmit`.
- [ ] **Step 5: `grep`** — `grep -rn "prisma.oneOnOne\b" src/` sem hits em código vivo (só leituras de agregação em `leader`, se as houver).
- [ ] **Step 6:** Actualizar `docs/arquitetura-modular-analise.md`:
  - §2.3 item 10: nota "1:1 tem um só modelo (`OneOnOneMeeting`) e um só serviço (`OneOnOneService`); `engagement` e `leadership` delegam; `OneOnOne` migrado (`legacyOneOnOneId`) e deprecado — G4 2026-09-05."
  - §13 linha G: marcar G4 → **Fase G completa** (G1+G2+G3+G4):

```
| G | ~~Sub-fase dedicada: PDI/Sucessão/1:1 no domínio Talento & Performance~~ — **concluída** em 4 sub-fases: G1 (Competency → `CompetenciesService`), G2 (SuccessionPlan → `SuccessionService`), G3 (PDI → `DevelopmentPlansService`, fecha buraco de auditoria), G4 (1:1 → `OneOnOneService`/`OneOnOneMeeting`). Modelos legados (`OneOnOne`, `LegacyPdi`) deprecados/isolados. | 8 | — | Ver `docs/superpowers/plans/2026-09-05-fase-g{1,2,3,4}-*.md` |
```

- [ ] **Step 7: Commit.**

---

### Task 8: PR e CI

- [ ] Branch `refactor/one-on-one-consolidation` + push.
- [ ] PR — corpo: **migração de dados** (`prisma/backfill-one-on-ones.ts` no deploy após `migrate deploy`); **verificação do frontend** (ecrãs de 1:1 de `/leadership` — o adaptador re-mapeia `hostId`/`participantId` → `managerId`/`subordinateId`); nota de que `OneOnOne` fica no schema.
- [ ] Aguardar `quality` verde → `gh pr merge --squash --auto`.
- [ ] Pós-merge manual: `npx prisma migrate deploy && npx ts-node prisma/backfill-one-on-ones.ts`.

---

## Self-Review

**1. Cobertura da spec (§2.3 item 10 + §13 fase G):** "`leadership` (`OneOnOne`) vs `engagement`+`leader` (`OneOnOneMeeting`) — 3 implementações independentes" → novo `OneOnOneService` único; `engagement` e `leadership` delegam; `OneOnOne` migrado para `OneOnOneMeeting`; `leader` (só leitura de 1:1) fica (§4). Com G1–G4, a §13 fase G fica completa. ✔

**2. Placeholders:** `LeadershipMeetingShape` e a API canónica são fixadas na Task 1 a partir do código real. `id` numérico de `/leadership` (via `legacyOneOnOneId`) — decisão anotada na Task 1. Sem "TODO" sem critério.

**3. Consistência de tipos:** `OneOnOneService.schedule(dto)`, `.update(id, dto)`, `.listForUser(userId, filters?)`, `.getOne(id)` (throws NotFound), `.complete(id, dto)`, `.cancel(id)` — definidas na Task 2, usadas na Task 5. `meetingToLeadershipShape(m) → LeadershipMeetingShape` — Task 5. `OneOnOneMeeting.legacyOneOnOneId` (Int? @unique) — Task 3, usado 4/5. ✔

**4. Riscos anotados:** migração de dados (idempotente + deploy step); `managerId`/`subordinateId` ↔ `hostId`/`participantId` via adaptador; `OneOnOneStatus` partilhado (confirmar na Task 1 — se não for, adicionar tradução); id numérico de `/leadership` via `legacyOneOnOneId`. Sem ciclo de módulos: `engagement`/`leadership` → `one-on-one` → Prisma.
