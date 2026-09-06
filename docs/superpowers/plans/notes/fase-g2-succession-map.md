# Fase G2 — Nota de mapeamento: escrita de `SuccessionPlan` → `SuccessionService`

> Task 1 do plano `docs/superpowers/plans/2026-09-05-fase-g2-succession-plan-consolidation.md`.
> Data: 2026-09-06.

## Achado que corrige o plano

O plano assumia que `talent-development` **escreve** `SuccessionPlan`. **Não escreve** —
`talent-development.service.ts` só faz `prisma.read.successionPlan.findMany` (linhas 252, 303),
leitura de agregação. **A Task 4 do plano (delegação de `talent-development`) é um no-op** —
não há nada a delegar. Só `career` tem um 2º caminho de escrita.

O plano também assumia que a heurística de `priority` de `career` era baseada em
`readinessLevel`/`matchScore`. **É baseada em contagem posicional**: conta os planos
já existentes para o cargo crítico → `0 → PRIMARY`, `1 → SECONDARY`, `>=2 → TERTIARY`.

## As 2 escritas de `SuccessionPlan` (linhas confirmadas)

| aspecto | `career.createSuccessionPlan(dto)` (`career.service.ts:971`) | `succession.create(dto)` (`succession.service.ts:264`) |
|---|---|---|
| DTO | `CreateSuccessionPlanDto` (career): `positionId`, `candidateId`, `readiness`, `justification?`, `estimatedReadyDate?` | `SuccessionCreateSuccessionPlanDto`: `criticalPositionId`, `candidateId`, `readinessLevel`, `priority`, `matchScore?`, `geographicMobility?`, `available?`, `notes?`, `readinessByDate?` |
| resolve cargo crítico | por `positionId` → `criticalPosition.findUnique({ where: { positionId } })`; **404** com hint `/succession/critical-positions` | recebe `criticalPositionId` directo; 404 `Cargo crítico não encontrado` |
| valida candidato | não | `user.findUnique` → 404 `Candidato não encontrado` |
| `priority` | **contagem**: `count({ criticalPositionId })` → `0:PRIMARY / 1:SECONDARY / else TERTIARY` | do DTO (`dto.priority`, obrigatório) |
| `matchScore` | não escreve | auto-calcula se ausente (`calculateMatchScoreForCandidate`) |
| `positionId` (FK obrigatória) | `dto.positionId` | `cp.positionId` (reutiliza o do cargo crítico) |
| `geographicMobility` / `available` | não escreve (defaults do schema: `true`/`true`) | do DTO ou `true`/`true` |
| dup `@@unique([criticalPositionId, candidateId])` | `findFirst` → `ConflictException('Este candidato já está mapeado para este cargo')` | `findFirst` → `ConflictException('Candidato já está no plano de sucessão deste cargo')` |
| notificação | `type: 'SUCCESSION_MAPPED'`, `metadata: { priority: 'HIGH', category: 'CAREER' }` | `type: 'SUCCESSION_PLAN_ADDED'`, `metadata: {}` |
| `include` no retorno | `position {id,name}`, `candidate {id,fullName}` | `criticalPosition { include: position }`, `candidate {id,fullName,avatarUrl}` |

`NotificationLog.type` é `String` livre — **nenhum consumidor** (backend ou frontend) filtra por
`SUCCESSION_MAPPED` vs `SUCCESSION_PLAN_ADDED` (grep confirmado). Unificar em
`SUCCESSION_PLAN_ADDED` é seguro; anotar no PR.

## `updateReadiness`

| `career.updateSuccessionReadiness(planId, readiness, justification?)` (`career.service.ts:1033`) | `succession.update(id, dto)` (`succession.service.ts:338`) |
|---|---|
| `findUnique` guard → 404 `Plano de sucessão não encontrado` | `findOne(id)` → 404 `Plano de sucessão não encontrado` (+ calcula matchScore, mais pesado) |
| `update({ data: { readinessLevel: readiness, notes: justification ?? plan.notes } })` | `update({ where: { id }, data: dto })` |
| retorno: resultado bruto do `update` (sem includes) | idem |

`notes: justification ?? plan.notes` ≡ passar `notes: undefined` ao Prisma (não altera). O
wrapper de `career` passa `notes` só quando `justification !== undefined`.

## API canónica final (usada na Task 3)

- `SuccessionService.create(dto)` — `SuccessionCreateSuccessionPlanDto.priority` passa a **opcional**;
  quando ausente, `create` chama `private computePriority(criticalPositionId): Promise<SuccessorPriority>`
  (contagem, portada de `career`). `try/catch` P2002 → `ConflictException` (defensivo; o `findFirst`
  já cobre o caso normal). Notificação única: `SUCCESSION_PLAN_ADDED`.
- `SuccessionService.update(id, dto)` — inalterado; `career` delega aqui para readiness.
- `SuccessionService.findOne(id)` — inalterado (`throws NotFoundException`).

## `career` como wrapper fino

- `createSuccessionPlan(dto)`: resolve `criticalPosition` por `positionId` (mantém o 404 com hint),
  chama `succession.create({ criticalPositionId: cp.id, candidateId, readinessLevel: dto.readiness,
  notes: dto.justification, readinessByDate: dto.estimatedReadyDate })` (sem `priority` → calculada),
  passa o retorno por `toCareerSuccessionShape(plan)` (adiciona `position` de topo a partir de
  `criticalPosition.position`; mantém `candidate`). Remove a heurística local e o corpo Prisma.
- `updateSuccessionReadiness(planId, readiness, justification?)`: `succession.update(planId,
  { readinessLevel: readiness, ...(justification !== undefined ? { notes: justification } : {}) })`.
- `getSuccessionPlans` (leitura de lista) — **fica** em `career` (§4, agregação com includes próprios).

## Enums (confirmados no schema)

- `SuccessorPriority`: `PRIMARY | SECONDARY | TERTIARY`
- `ReadinessLevel`: `READY_NOW | READY_SOON | NEEDS_DEVELOPMENT`
- `SuccessionPlan` tem `@@unique([criticalPositionId, candidateId])`, `matchScore Float?`,
  `geographicMobility`/`available` default `true`, `positionId Int` FK obrigatória.

## Módulos

`SuccessionModule` já `exports: [SuccessionService]`. `career.module.ts` ganha
`imports: [SuccessionModule]`. `talent-development` **não** precisa (só lê).

## Rotas preservadas (sem alteração de contrato)

`POST /career/succession`, `PATCH /career/succession/:id/readiness`, `GET /career/succession`,
e todas as de `/succession/*`. Verbos/DTOs/roles inalterados.
