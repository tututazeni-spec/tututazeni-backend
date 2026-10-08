# Competencies — Fase 3b: Gaps de Competências (§7) + Desenvolvimento (§8)

Retroactive design note (written after implementation, same session) —
covers the two tabs added on top of the §5/§6 work (`GET
/competencies/skill-matrix` filters + `GET /competencies/evaluations`),
which itself shipped without its own spec doc. Kept short: both tabs are
pure read views over existing tables, no schema change.

## Decision 1 — no new tables for gap "estado"/"prioridade"

`docs/módulo_competencies.md` §7 asks for a gap lifecycle (Identificado → Em
desenvolvimento → Em acompanhamento → Resolvido → Encerrado) and a
4-tier priority (Baixa/Média/Alta/Crítica). Nothing in the schema persists
either — `UserCompetency` only has `currentLevel`/`targetLevel`. Rather than
add a `CompetencyGap` table (a new source of truth that would need to stay
in sync with `UserCompetency` and with PDI state), both are derived at read
time in `competencies.service.ts#getGaps`:

- **Prioridade**: tiered by gap size (`targetLevel - currentLevel`: 1→LOW,
  2→MEDIUM, 3→HIGH, 4+→CRITICAL), bumped one tier when
  `Competency.isCritical` is true. Mirrors the existing bump pattern in
  `src/competency-map/competency-map.service.ts#getGapPriority` (mandatory →
  bump), extended with a 4th tier since this doc explicitly asks for
  Crítica and competency-map's local 3-tier enum doesn't have one.
- **Estado**: resolved from the `DevelopmentPlan` (if any) covering that
  `(userId, competencyId)` pair — matched via `PdiCompetencyGap` or via a
  `DevelopmentPlanAction.competencyIds` hit — mapping `PlanStatus` → gap
  status (ACTIVE→Em desenvolvimento; PAUSED/AT_RISK/OVERDUE/COMPLETED/
  PARTIALLY_COMPLETED→Em acompanhamento; CANCELLED→Encerrado; no plan→
  Identificado). "Resolvido" never comes from a plan status — a truly
  resolved gap wouldn't have `currentLevel < targetLevel` any more, so it
  simply drops out of the list.
- **Impacto**: `isCritical && isStrategic` → Alto, either alone → Médio,
  neither → Baixo. Kept separate from Prioridade (which already surfaces
  `competenciaCritica` as its own boolean column) rather than folded in, so
  the UI can show both independently.
- **Data de identificação**: `UserCompetency.evaluatedAt` — the date the
  assessment that revealed the gap was recorded, since there's no separate
  "first seen" timestamp.

## Decision 2 — Desenvolvimento reuses DevelopmentPlanAction, one row per competency

`DevelopmentPlanAction.competencyIds: Int[]` already exists (added for §5/9
of the PDI wizard spec, see `project_innova_pdi_criar_novo_estrutura_completa`
memory) but was never surfaced from Competencies. §8 needs one row per
(colaborador, competência, acção); since an action can target several
competencies, `getDevelopmentActions` expands `action.competencyIds` into
one row each rather than exposing the raw array.

- **Curso/formação**: `action.courseId` → `Course.title`.
- **Responsável**: `plan.managerId` → fullName (PDI manager, not the action
  itself — actions have no owner of their own).
- **Resultado / Nível após desenvolvimento**: read from the most recent
  `CompetencyEvolutionLog` row for that `(userId, competencyId)` pair, but
  only trusted when `action.status === 'COMPLETED'` — otherwise `PENDENTE`
  and `null`, since an in-progress action can't yet claim a result. Compares
  `newLevel` vs `previousLevel` on that log entry to say Melhorou/Manteve.

## Non-decisions / things intentionally left alone

- `GapPriority` (Prisma enum, LOW/MEDIUM/HIGH, unused except by
  competency-map) and `PdiCompetencyPriority` (LOW/MEDIUM/HIGH, used by
  `PdiCompetencyGap`) were **not** extended with a `CRITICAL` value and not
  reused here — this tab's priority is a purely computed/local enum
  (`CompetencyGapPriority` in `competencies.dto.ts`), decoupled from those,
  same pattern as `CompetencyEvaluationStatus` in the §6 work.
- `ActionType`/`ActionStatus` are the **full** Prisma enums (14/6 values),
  not the reduced subset frontend already hand-rolls in
  `components/development-plans/types.ts` (missing SHADOWING,
  PEER_COACHING, FEEDBACK, CONFERENCE, LEADERSHIP_EXPOSURE, OVERDUE) — that
  subset is pre-existing drift in a different module, out of scope here.
  This module's own `types.ts`/`constants.ts` define the complete set.

## §9 Relatórios

Also derived at read time, same philosophy as §7/§8 — no new table. All 14
reports docs/módulo_competencies.md §9 asks for come from one shared pair of
sets (users matching the filters × competencies matching the filters) and the
`UserCompetency` rows linking them, computed once in
`competencies.service.ts#getReports` and sliced 14 ways. The one exception is
"Impacto das formações", which reads `CompetencyEvolutionLog` directly
(source `TRAINING`/`COURSE`) since it measures change over time, not current
state.

- **Departamento/Subdepartamento**: no gap-lifecycle-style enum needed here,
  just hierarchy resolution — "Departamento" without "Subdepartamento" widens
  to the department **and its direct children** (`Department.parentId`, one
  level, not the full subtree) via a `department.findMany({ where: {
  parentId } })` lookup; "Subdepartamento" alone narrows to exactly that one
  department. Both ultimately just filter `User.departmentId`.
- **Unidade**: `User.unitId` directly — `Department.unitId` was not used,
  since a user's own unit can differ from their department's (matches how
  `SkillMatrixFilterDto`/`CompetencyGapFilterDto` already only touch
  `User.departmentId`, not `Department.unitId`, elsewhere in this file).
- **Estado**: reuses `CompetencyStatus` (Activa/Em revisão/Arquivada, same
  field as the §2 catalog), not `CompetencyGapStatus` from §7 — §9's "Estado"
  sits on the competency, not on a gap.
- **Período**: `from`/`to` on `UserCompetency.evaluatedAt` (and, for the
  formation-impact report only, on `CompetencyEvolutionLog.createdAt`) —
  mirrors `ReportFilterDto` in `src/reports/reports.dto.ts` rather than the
  `year`-only convention `TrainingReportFilterDto` uses, since nothing in
  this module's date fields lines up with a calendar year the way a
  training's `startDate` does.
- **Grouped reports** (por departamento/cargo/unidade/nível hierárquico, and
  gaps por departamento/cargo) all go through two small generic helpers
  (`groupCompetencyRows`, `groupGapRows`) instead of six near-identical
  `reduce` blocks — group by a pre-resolved label, not by re-joining to
  `userMap` inside each one.
- **CSV export** (`GET /competencies/reports/export`) only flattens the
  top-level scalars (`mapaGeral`, `gaps`, `impactoFormacoes` totals), same
  restraint as `trainings.service.ts#exportReportsCsv` — the ranked/grouped
  breakdowns stay JSON-only, no attempt to flatten a table-of-tables into one
  CSV.

## Remaining

None — docs/módulo_competencies.md fully implemented (§1-9).
