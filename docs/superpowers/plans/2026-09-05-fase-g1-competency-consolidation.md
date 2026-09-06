# Fase G1 — Consolidar `Competency` (`evaluation360` deixa de escrever directamente) — Plano de Implementação

> **Para agentes de execução:** SUB-SKILL OBRIGATÓRIA: `superpowers:subagent-driven-development` (recomendado) ou `superpowers:executing-plans`. Steps usam checkbox (`- [ ]`).

**Goal:** O modelo `Competency` passa a ter **um único dono de escrita** — `CompetenciesService` (`src/competencies/`). `evaluation360` deixa de fazer `prisma.competency.create/update` directo e passa a delegar.

**Architecture:** `CompetenciesService` (`src/competencies/competencies.service.ts`, métodos `create`/`update`/`archive`/`remove` sobre `Competency` com validação de nome único, `status`, mapeamento a posição/curso, endorsements) é o canónico. `Evaluation360Service` (`src/evaluation360/evaluation360.service.ts:95,128,133,149`) injecta `CompetenciesService` e delega os 3–4 pontos onde hoje toca `prisma.competency`. Rotas de `/evaluation360` inalteradas; onde a forma de resposta histórica difere da de `CompetenciesService`, um adaptador fino no controller/serviço de `evaluation360` preserva-a. `dashboard.service.ts:965` (`prisma.competency.findMany`) é **leitura pura de agregação** — fica (§4). `competency-map` é sobre `SkillMap`/`EmployeeSkill` (modelo diferente, apesar do nome) — **não é tocado**. Sem ciclo: `evaluation360` → `competencies` → Prisma.

**Tech Stack:** NestJS, Prisma, Jest (unit + integração), `class-validator`.

**Spec:** `docs/arquitetura-modular-analise.md` (§2.3 item 7, §2.5, §3–4 domínio 7/8, §13 fase G) e `docs/arquitetura-modular.md` (Fases 3–5).

## Global Constraints

- **Forma de resposta do frontend preservada** (§12). Rotas de `evaluation360` que hoje criam/actualizam competências (identificar as exactas na Task 1 — provavelmente `POST /evaluation360/competencies`, `PATCH /evaluation360/competencies/:id`, `GET /evaluation360/competencies`) mantêm rota/verbo/forma; se `CompetenciesService.create`/`update`/`findAll` devolverem forma diferente, adaptar no ponto de delegação (chaves sempre presentes, extras toleradas).
- **`Competency` model não tem `tenantId`** (§7 single-tenant — nada a fazer). Nota: `Competency` está na lista de 14 modelos com `tenantId` vestigial (§2.6/§7); **não** propagar nem usar `tenantId` em código novo.
- **Sem migração de dados** — mesmo modelo, mesma tabela; só muda o caminho de escrita.
- `prettier`/`eslint`/`tsc` limpos; `format:check` do CI só `src/**`.
- Integração: lotes `evaluation360` e `competencies` distintos; `--runInBand`, Redis local, `DB_POOL_MAX=5`.

---

## File Structure

**Modificados:**
- `src/competencies/competencies.service.ts` — se `evaluation360` precisar de um comportamento que o canónico não tem (ex.: `id` como string via `+id`), adicionar um wrapper compatível; caso contrário, sem alteração.
- `src/evaluation360/evaluation360.module.ts` — `imports: [..., CompetenciesModule]`.
- `src/evaluation360/evaluation360.service.ts` — os pontos `prisma.competency.*` delegam em `CompetenciesService`.
- `src/evaluation360/evaluation360.service.spec.ts` / `*.additional.spec.ts` — adaptar.
- `docs/arquitetura-modular-analise.md` — §2.3 item 7, §13 fase G (G1 feita).

---

### Task 1: Inventário — pontos `prisma.competency` em `evaluation360` + método canónico equivalente + delta de forma

**Files:** Create `docs/superpowers/plans/notes/fase-g1-competency-map.md`

- [ ] **Step 1:** Ler `src/evaluation360/evaluation360.service.ts` linhas ~90–155 (os 4 pontos) + os handlers do controller que os expõem. Ler `CompetenciesService.create`/`update`/`archive`/`remove`/`findAll`/`findOne`.
- [ ] **Step 2:** Tabela: `ponto evaluation360 | prisma call | método CompetenciesService equivalente | delta de forma | adaptador?`. Notar que `evaluation360` usa `+id` (string→number) — o canónico recebe `number`; o handler de `evaluation360` faz a conversão antes de delegar.
- [ ] **Step 3:** Confirmar o `CreateCompetencyDto` vs o DTO de `evaluation360` — mapear campos.
- [ ] **Step 4: Commit da nota.**

---

### Task 2: `evaluation360` importa `CompetenciesModule` + injecta o serviço

**Files:** Modify `src/evaluation360/evaluation360.module.ts`, `src/evaluation360/evaluation360.service.ts` (construtor); Test `evaluation360.service.spec.ts`

- [ ] **Step 1:** `evaluation360.module.ts` → `imports: [..., CompetenciesModule]` (import de `../competencies/competencies.module`).
- [ ] **Step 2:** Construtor de `Evaluation360Service` → `+ private readonly competencies: CompetenciesService`.
- [ ] **Step 3:** Adaptar todos os specs de `evaluation360` que instanciam o `TestingModule` — adicionar `{ provide: CompetenciesService, useValue: mockCompetencies }` (mock com `create`/`update`/`archive`/`remove`/`findAll`/`findOne`).
- [ ] **Step 4:** `npx jest src/evaluation360/` — PASS (nada usa o novo provider ainda).
- [ ] **Step 5: prettier + tsc + commit.**

---

### Task 3: Os pontos `prisma.competency` de `evaluation360` delegam

**Files:** Modify `src/evaluation360/evaluation360.service.ts`; Test `evaluation360.service.spec.ts`

- [ ] **Step 1: Reescrever os testes dos métodos afectados (devem falhar)** — passam a esperar `mockCompetencies.create`/`update`/... (não `mockPrisma.competency.*`). Exemplo:

```ts
it('createCompetency delega em CompetenciesService.create', async () => {
  mockCompetencies.create.mockResolvedValue({ id: 1, name: 'Liderança' });
  const res = await service.createCompetency({ name: 'Liderança' } as any);
  expect(mockCompetencies.create).toHaveBeenCalledWith(expect.objectContaining({ name: 'Liderança' }));
  expect(res).toEqual(expect.objectContaining({ id: 1 }));
});

it('updateCompetency converte id string→number e delega', async () => {
  mockCompetencies.update.mockResolvedValue({ id: 2 });
  await service.updateCompetency('2', { name: 'X' } as any);
  expect(mockCompetencies.update).toHaveBeenCalledWith(2, expect.objectContaining({ name: 'X' }));
});
```

- [ ] **Step 2: FAIL.**
- [ ] **Step 3: Implementar** — substituir cada `this.prisma.competency.create(...)` / `.update(...)` / `.findMany(...)` pelo método canónico (`this.competencies.create(dto)` / `this.competencies.update(Number(id), dto)` / `this.competencies.findAll(filters)`), com adaptador de forma conforme a nota da Task 1. O `findUnique` de guard (linha ~128) → `this.competencies.findOne(Number(id))` (que lança `NotFoundException` — confirmar que o comportamento de erro histórico é compatível; se `evaluation360` devolvia `null`, adaptar).
- [ ] **Step 4: PASS** (`npx jest src/evaluation360/`).
- [ ] **Step 5: `grep -n "prisma.competency\." src/evaluation360/evaluation360.service.ts`** → só leituras de agregação pura, se as houver (idealmente zero).
- [ ] **Step 6: prettier + tsc + eslint + commit.**

---

### Task 4: Integração + doc

- [ ] **Step 1:** `npx jest src/evaluation360 src/competencies` ; `npm test`.
- [ ] **Step 2:** integração dos lotes `evaluation360` e `competencies` (Redis local).
- [ ] **Step 3:** `npx prettier --check "src/**/*.ts"` ; `npx eslint src/evaluation360 --config eslint.config.staged.mjs` ; `npx tsc --noEmit`.
- [ ] **Step 4:** Actualizar `docs/arquitetura-modular-analise.md` — §2.3 item 7 (nota "`Competency` tem um só dono de escrita, `CompetenciesService`; `evaluation360` delega — G1 2026-09-05"); §13 linha G marcar G1.
- [ ] **Step 5: Commit.**

---

### Task 5: PR e CI

- [ ] Branch `refactor/competency-consolidation` + push.
- [ ] PR — corpo: mudança de caminho de escrita (sem migração de dados); **verificação do frontend** se algum campo de resposta mudou de forma.
- [ ] Aguardar `quality` verde → `gh pr merge --squash --auto`.

---

## Self-Review

**1. Cobertura da spec (§2.3 item 7 + §13 fase G):** "dono canónico ... mas `evaluation360` faz CRUD completo do mesmo modelo" → Tasks 2–3 (delegação). `dashboard` leitura pura fica (§4). `competency-map` (modelo `SkillMap`, não `Competency`) fora do âmbito — anotado. ✔

**2. Placeholders:** a Task 1 identifica os pontos exactos e o delta de forma; steps dependentes referem a nota. Sem "TODO" sem critério.

**3. Consistência de tipos:** `CompetenciesService.create(dto)`, `.update(id: number, dto)`, `.findOne(id: number)` (throws NotFound), `.findAll(filters)`, `.archive(id)`, `.remove(id)` — usados com estas assinaturas na Task 3; a conversão `+id`/`Number(id)` é feita no lado de `evaluation360`. ✔

**4. Riscos anotados:** `evaluation360` usa `id` string (`+id`) — conversão no ponto de delegação; comportamento de erro (`null` vs `NotFoundException`) — adaptar se divergir; `tenantId` vestigial em `Competency` — não usar. Sem ciclo de módulos.
