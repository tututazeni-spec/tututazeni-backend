# Fase G2 — Consolidar `SuccessionPlan` (`career` + `talent-development` delegam em `succession`) — Plano de Implementação

> **Para agentes de execução:** SUB-SKILL OBRIGATÓRIA: `superpowers:subagent-driven-development` (recomendado) ou `superpowers:executing-plans`. Steps usam checkbox (`- [ ]`).
>
> **Coordenação:** a Fase G3 (PDI) também toca `talent-development.service.ts`. Executar G2 e G3 em sequência (não em paralelo).

**Goal:** Existe **um único** caminho de escrita para `SuccessionPlan` — `SuccessionService`. `career.createSuccessionPlan`/`updateReadiness` e as escritas de `SuccessionPlan` em `talent-development` passam a delegar. A divergência de `priority` (auto-calculada vs. do DTO) e de tipo de notificação (`SUCCESSION_MAPPED` vs `SUCCESSION_PLAN_ADDED`) desaparece.

**Architecture:** `SuccessionService` (`src/succession/succession.service.ts`, `create` linha ~307, `update` ~340) é o canónico — é o módulo dedicado. Ganha, na criação, um parâmetro/comportamento que unifica as duas regras de `priority`: **aceita `priority` do DTO; se ausente, calcula-a** (portar a heurística de `career.createSuccessionPlan`). Emite **uma** notificação (`SUCCESSION_PLAN_ADDED` — o tipo do módulo dedicado; `SUCCESSION_MAPPED` fica como alias aceite pelo frontend se necessário — confirmar na Task 1). `CareerService` e `TalentDevelopmentService` importam `SuccessionModule` e delegam. `dashboard-rh`/`reports` **só leem** `SuccessionPlan` (agregação) — ficam (§4). Rotas `/succession/*`, `/career/succession*` e as de `talent-development` inalteradas; adaptador de forma onde necessário. Sem ciclo: `career`/`talent-development` → `succession` → Prisma.

**Tech Stack:** NestJS, Prisma, Jest (unit + integração), `class-validator`.

**Spec:** `docs/arquitetura-modular-analise.md` (§2.3 item 8, §2.5, §3–4 domínio 8, §13 fase G).

## Global Constraints

- **Forma de resposta do frontend preservada** (§12). Rotas preservadas: `POST /succession/*`, `POST /career/succession`, `PATCH /career/succession/:id/readiness`, e as de `talent-development` que criam/actualizam sucessão. Adaptador de forma no ponto de delegação (chaves sempre presentes).
- **`SuccessionPlan.priority` (`SuccessorPriority`) e `readinessLevel` (`ReadinessLevel`)** — confirmar os valores dos enums na Task 1. A heurística de cálculo de `priority` de `career.createSuccessionPlan` (linhas ~971–1040) é portada verbatim para uma função privada `computePriority(...)` de `SuccessionService`, usada só quando o DTO não traz `priority`.
- **`SuccessionPlan` tem `@@unique([criticalPositionId, candidateId])`** — `create` deve tratar P2002 → 409 ou upsert (confirmar o comportamento actual de cada lado na Task 1 e unificar).
- **`SuccessionPlan.positionId` + `criticalPositionId`** — o modelo tem os dois; confirmar como cada serviço os preenche (a nota do schema diz "positionId Int // ou String — verificar").
- **Notificação:** um só tipo emitido pela criação. Se o frontend distinguir `SUCCESSION_MAPPED` de `SUCCESSION_PLAN_ADDED` em algum ecrã de notificações, manter ambos como aceitáveis (o handler de notificações não filtra por tipo — confirmar) ou emitir o tipo histórico do caminho que o utilizador usou. Decisão na Task 1; anotar no PR.
- **Sem migração de dados** — mesmo modelo/tabela.
- `prettier`/`eslint`/`tsc` limpos; `format:check` do CI só `src/**`.
- Integração: lotes `succession`, `career`, `talent-development` distintos.

---

## File Structure

**Modificados:**
- `src/succession/succession.service.ts` — `create` aceita `priority?` e calcula quando ausente (`computePriority` portado de `career`); unifica o tratamento de `@@unique`; `update` mantém.
- `src/succession/succession.dto.ts` — `CreateSuccessionPlanDto` do módulo canónico ganha `priority?` opcional (se ainda não tiver).
- `src/succession/succession.service.spec.ts` — casos novos (priority do DTO vs calculada; colisão de unique).
- `src/career/career.module.ts` — `imports: [..., SuccessionModule]`.
- `src/career/career.service.ts` — `createSuccessionPlan`/`updateReadiness` delegam; remover o corpo Prisma + a heurística local (agora em `succession`).
- `src/career/career.service.spec.ts` — adaptar.
- `src/talent-development/talent-development.module.ts` — `imports: [..., SuccessionModule]`.
- `src/talent-development/talent-development.service.ts` — as escritas de `SuccessionPlan` delegam.
- `src/talent-development/talent-development.service.spec.ts` — adaptar.
- `docs/arquitetura-modular-analise.md` — §2.3 item 8, §13 fase G (G2 feita).

---

### Task 1: Nota de mapeamento — as 3 escritas de `SuccessionPlan`, regras de `priority`, notificações, `@@unique`

**Files:** Create `docs/superpowers/plans/notes/fase-g2-succession-map.md`

- [ ] **Step 1:** Ler `career.createSuccessionPlan`/`updateReadiness` (`career.service.ts:971–1045`), `succession.create`/`update` (`succession.service.ts:307–345`), e as escritas de `SuccessionPlan` em `talent-development.service.ts` (grep `successionPlan\.` nesse ficheiro). Ler `model SuccessionPlan`, `enum SuccessorPriority`, `enum ReadinessLevel`.
- [ ] **Step 2:** Tabela: `caminho | campos escritos | regra de priority | tipo de notificação | tratamento de @@unique | forma de resposta`.
- [ ] **Step 3:** Definir a assinatura canónica final de `SuccessionService.create(dto)` e a `computePriority(readinessLevel, matchScore?, readinessByDate?)` (heurística portada de `career`).
- [ ] **Step 4:** Decidir o tipo de notificação único + se se mantém alias.
- [ ] **Step 5: Commit da nota.**

---

### Task 2: `SuccessionService.create` unifica `priority` (DTO ou calculada) + `@@unique` + notificação única

**Files:** Modify `src/succession/succession.service.ts`, `src/succession/succession.dto.ts`; Test `src/succession/succession.service.spec.ts`

- [ ] **Step 1: Testes (devem falhar)**

```ts
it('create com priority no DTO → usa-a tal como veio', async () => {
  mockPrisma.successionPlan.create.mockResolvedValue({ id: 1, priority: 'HIGH' });
  await service.create({ criticalPositionId: 1, candidateId: 2, readinessLevel: 'READY_NOW', priority: 'HIGH' } as any);
  expect(mockPrisma.successionPlan.create).toHaveBeenCalledWith(
    expect.objectContaining({ data: expect.objectContaining({ priority: 'HIGH' }) }),
  );
});

it('create sem priority → calcula via computePriority (heurística portada de career)', async () => {
  mockPrisma.successionPlan.create.mockResolvedValue({ id: 1 });
  await service.create({ criticalPositionId: 1, candidateId: 2, readinessLevel: 'READY_NOW' } as any);
  const data = mockPrisma.successionPlan.create.mock.calls[0][0].data;
  expect(data.priority).toBeDefined(); // valor conforme a heurística da Task 1
});

it('create com par (criticalPositionId, candidateId) já existente → 409 (comportamento unificado)', async () => {
  const p2002 = Object.assign(new Error('unique'), { code: 'P2002' });
  Object.setPrototypeOf(p2002, require('@prisma/client').Prisma.PrismaClientKnownRequestError.prototype);
  mockPrisma.successionPlan.create.mockRejectedValue(p2002);
  await expect(service.create({ criticalPositionId: 1, candidateId: 2, readinessLevel: 'READY_NOW' } as any))
    .rejects.toThrow(ConflictException);
});

it('create emite uma notificação do tipo unificado', async () => {
  mockPrisma.successionPlan.create.mockResolvedValue({ id: 1, candidateId: 2 });
  await service.create({ criticalPositionId: 1, candidateId: 2, readinessLevel: 'READY_NOW' } as any);
  expect(mockPrisma.notificationLog.create).toHaveBeenCalledWith(
    expect.objectContaining({ data: expect.objectContaining({ type: /* tipo da Task 1 */ expect.any(String) }) }),
  );
});
```

- [ ] **Step 2: FAIL.**
- [ ] **Step 3: Implementar** — `CreateSuccessionPlanDto` += `priority?: SuccessorPriority`; `create`:
  - `const priority = dto.priority ?? this.computePriority(dto.readinessLevel, dto.matchScore, dto.readinessByDate);`
  - `try { ... create ... } catch P2002 → throw new ConflictException('Já existe um plano para este candidato nesta posição crítica')`.
  - `matchScore` auto (manter o comportamento actual de `succession`).
  - notificação única (`createNotificationSafe`, tipo da Task 1).
  - portar `computePriority` (privado) de `career.service.ts`.
- [ ] **Step 4: PASS** (`npx jest src/succession/`).
- [ ] **Step 5: prettier + tsc + commit.**

---

### Task 3: `CareerService` delega em `SuccessionService`

**Files:** Modify `src/career/career.module.ts`, `src/career/career.service.ts`; Test `src/career/career.service.spec.ts`

- [ ] **Step 1:** Reescrever os testes de `createSuccessionPlan`/`updateReadiness` (devem falhar) — mock de `SuccessionService`, delegação.
- [ ] **Step 2: FAIL.**
- [ ] **Step 3: Implementar** — `career.module.ts` `imports: [..., SuccessionModule]`; construtor `+ private readonly succession: SuccessionService`; `createSuccessionPlan(dto)` → `this.succession.create(dto)`; `updateReadiness(id, dto)` → `this.succession.update(id, dto)` (ou o método de readiness do canónico — confirmar na Task 1). Remover o corpo Prisma e a heurística `computePriority` local (agora vive em `succession`). Remover imports órfãos.
- [ ] **Step 4: PASS** (`npx jest src/career/`).
- [ ] **Step 5: `grep -n "successionPlan\." src/career/career.service.ts`** → só leituras de agregação, se existirem.
- [ ] **Step 6: prettier + tsc + eslint + commit.**

---

### Task 4: `TalentDevelopmentService` — escritas de `SuccessionPlan` delegam

**Files:** Modify `src/talent-development/talent-development.module.ts`, `src/talent-development/talent-development.service.ts`; Test o spec.

- [ ] **Step 1:** Identificar (grep `successionPlan\.` no ficheiro) e reescrever os testes desses métodos (devem falhar) — delegação em `SuccessionService`.
- [ ] **Step 2: FAIL.**
- [ ] **Step 3: Implementar** — `imports: [..., SuccessionModule]`; construtor `+ succession`; cada `this.prisma.successionPlan.create/update` → `this.succession.create/update`.
- [ ] **Step 4: PASS** (`npx jest src/talent-development/`).
- [ ] **Step 5: prettier + tsc + eslint + commit.**

---

### Task 5: Integração + doc

- [ ] **Step 1:** `npx jest src/succession src/career src/talent-development` ; `npm test`.
- [ ] **Step 2:** integração dos lotes `succession`, `career`, `talent-development`.
- [ ] **Step 3:** `npx prettier --check "src/**/*.ts"` ; `npx eslint src/succession src/career src/talent-development --config eslint.config.staged.mjs` ; `npx tsc --noEmit`.
- [ ] **Step 4:** Actualizar `docs/arquitetura-modular-analise.md` — §2.3 item 8 (nota de consolidação, G2 2026-09-05); §13 linha G marcar G2.
- [ ] **Step 5: Commit.**

---

### Task 6: PR e CI

- [ ] Branch `refactor/succession-plan-consolidation` + push.
- [ ] PR — corpo: `priority` passa a poder vir do DTO **ou** ser calculada (comportamento unificado — pode mudar a `priority` gravada para criações que antes iam pelo caminho `career` sem priority explícita); notificação única; **verificação do frontend** para os ecrãs de sucessão de `/career`; sem migração de dados.
- [ ] Aguardar `quality` verde → `gh pr merge --squash --auto`.

---

## Self-Review

**1. Cobertura da spec (§2.3 item 8 + §13 fase G):** "`career.createSuccessionPlan` (prioridade auto) vs `succession.create` (prioridade do DTO)" → Task 2 unifica (DTO **ou** calculada); Tasks 3–4 fazem `career` e `talent-development` delegar; `dashboard-rh`/`reports` leitura pura ficam (§4). ✔

**2. Placeholders:** a heurística `computePriority` e o tipo de notificação são fixados na Task 1 a partir do código real de `career`. O teste da Task 2 Step 1 refere "valor conforme a heurística da Task 1" — o executor preenche o `expect` exacto após portar a função. Aceitável e sinalizado.

**3. Consistência de tipos:** `SuccessionService.create(dto & { priority?: SuccessorPriority }) → SuccessionPlan`, `.update(id, dto)`, `computePriority(readinessLevel, matchScore?, readinessByDate?) → SuccessorPriority` (privado). Usados nas Tasks 3–4. ✔

**4. Riscos anotados:** `priority` gravada pode mudar para o caminho `career` (comportamento unificado, deliberado, no PR); `@@unique` → 409 unificado (confirmar que ambos os lados não faziam upsert silencioso — Task 1); notificação (alias `SUCCESSION_MAPPED` — Task 1); `positionId` vs `criticalPositionId` (Task 1). Coordenação com G3 (mesmo ficheiro `talent-development.service.ts`). Sem ciclo de módulos.
