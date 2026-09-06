# Fase G1 — Nota de mapeamento: `prisma.competency` em `evaluation360` → `CompetenciesService`

> Task 1 do plano `docs/superpowers/plans/2026-09-05-fase-g1-competency-consolidation.md`.
> Data: 2026-09-06.

## Decisões do dono do produto (2026-09-06)

1. **Âmbito da delegação:** delegação **completa** — `create` + `update` + `list` (Task 3 Step 3 do plano). `listCompetencies` também passa a delegar.
2. **`tenantId`:** mantém-se o encaminhamento (`evaluation360` já persistia `dto.tenantId`); comentário no serviço canónico a assinalar que o campo é vestigial (§7 single-tenant) e que não se constrói lógica nova sobre ele.

## O modelo

Só existe **um** `model Competency` (`prisma/schema.prisma:2411`) — superconjunto de campos.
Os dois caminhos de escrita gravam a mesma tabela. Confirmado por grep: só
`src/competencies/competencies.service.ts` e `src/evaluation360/evaluation360.service.ts`
fazem `prisma.competency.{create,update,delete}` em código vivo.
`dashboard.service.ts:965` (`competency.findMany`) é leitura de agregação pura → fica (§4).
`competency-map` é sobre `CompetencyMap`/`SkillMap` — modelo diferente, não é tocado.

## Os 3 pontos de `evaluation360` (linhas confirmadas)

| # | ponto | prisma call (linha) | método canónico | delta de forma | adaptador |
|---|---|---|---|---|---|
| 1 | `createCompetency(dto, actorId)` | `competency.create` (`:95`) — grava `name, description, type, category, scaleMin, scaleMax, isGlobal, tenantId`, `indicators` (create aninhado); `include: { indicators: true }` | `CompetenciesService.create(dto)` **estendido** | canónico só gravava `name/description/category/tags/status`. Estender com opcionais `type/scaleMin/scaleMax/isGlobal/tenantId/indicators` + `include: { indicators: true }` | mapeamento explícito de campos no ponto de delegação |
| 2 | `updateCompetency(id, dto, actorId)` | `competency.findUnique` guard (`:128`) + `competency.update` (`:133`) — faz `const { indicators, ...data } = dto` (strip da relação) | `CompetenciesService.update(Number(id), dto)` | canónico faz `data: dto` directo → tem de fazer strip de `indicators`. Canónico já valida nome duplicado (eval360 não validava) — melhoria, aceite. `findOne` lança `NotFoundException` (msg `'Competência não encontrada'` sem ponto final; eval360 tinha `.` no fim) — mensagem tolerada | `Number(id)` no ponto de delegação |
| 3 | `listCompetencies(tenantId?, query?)` | `competency.findMany` (`:149`) — `where: { isActive:true, (isGlobal|tenantId), name contains }`, `include: { indicators ordenados }`, `skip/take` de offset/limit, **devolve array** | **novo** `CompetenciesService.listCatalogue({ tenantId?, search?, offset?, limit? })` | `findAll` devolve envelope `{data,total,...}` + `_count` e não tem filtro `isActive/isGlobal/tenantId`. Um método dedicado no canónico reproduz a query exacta e devolve **array** — forma de resposta idêntica | nenhum (o novo método já devolve a forma histórica) |

## Conversão de tipos

`evaluation360.controller` passa `id: string` nos handlers de competência (`@Param('id') id: string`).
`CompetenciesService` recebe `number`. A conversão (`Number(id)` / `+id`) fica no lado de `evaluation360`,
no ponto de delegação. As rotas/verbos/DTOs do controller **não mudam**.

## Auditoria

`evaluation360.createCompetency`/`updateCompetency` chamam `this.audit.log({ entity: 'Competency', ... })`
depois da escrita. O `CompetenciesService` não audita. A chamada `audit.log` **fica em `evaluation360`**
(a seguir à delegação) — sem alteração de comportamento de auditoria.

## API canónica final (assinaturas usadas na Task 3)

- `create(dto: CreateCompetencyDto)` — `CreateCompetencyDto` ganha opcionais `type?`, `scaleMin?`,
  `scaleMax?`, `isGlobal?`, `tenantId?`, `indicators?: CompetencyIndicatorInputDto[]`.
  Mantém o pre-check `findFirst` case-insensitive → `ConflictException`. `include: { indicators: true }`.
- `update(id: number, dto: UpdateCompetencyDto)` — faz strip de `indicators` antes do `data`.
- `listCatalogue(params: { tenantId?: string; search?: string; offset?: number; limit?: number })` →
  `Competency[]` com `indicators` (novo).
- `findOne(id: number)` — inalterado (`throws NotFoundException`).

## DTO map (`Evaluation360CreateCompetencyDto` → `CreateCompetencyDto` estendido)

| eval360 | canónico | nota |
|---|---|---|
| `name` (req) | `name` (req) | — |
| `description?` | `description?` | — |
| `type` (req, `CompetencyType`) | `type?` (novo) | eval360 exige; canónico opcional (default no schema) |
| `category?` (`CompetencyCategory`) | `category` (req no canónico) | eval360 opcional → passa `undefined` → default `HARD_SKILL`; cast no ponto de delegação |
| `scaleMin?` / `scaleMax?` | `scaleMin?` / `scaleMax?` (novos) | — |
| `isGlobal?` | `isGlobal?` (novo) | — |
| `tenantId?` | `tenantId?` (novo) | vestigial — comentado |
| `indicators?: CompetencyIndicatorDto[]` | `indicators?: CompetencyIndicatorInputDto[]` (novo) | `{ level, description, examples? }` |
| — | `tags?` | eval360 nunca enviou tags; fica `[]` por default |
| — | `status?` | eval360 nunca enviou status; fica `ACTIVE` por default |
