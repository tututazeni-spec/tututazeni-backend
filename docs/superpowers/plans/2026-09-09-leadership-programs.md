# Corporate Leadership Programs Implementation Plan

> **Status (2026-09-11): CONCLUÍDO.** Tasks 1–3 no branch `codex/leadership-programs`
> (schema do agregado, ciclo de vida seguro, elegibilidade). Tasks 4–6 no mesmo
> branch (modelo de desenvolvimento + validação de refs canónicas; execução do
> participante — baseline/PDI/mentoring/avaliações/projecto/documentos/custos/
> comunicações idempotentes; conclusão + certificado LEADERSHIP idempotente +
> readiness + sucessão + KPIs). Task 7 (workspace frontend: assistente de 16
> etapas + 7 separadores + testes Vitest) no branch `leadership-workspace` do repo
> frontend. Task 8 — verificação: backend `jest` 4604 ✓, `tsc`/`eslint`/`prettier`
> ✓; integração PostgreSQL do raio de impacto (certificates/certification/
> competencies/leader/leadership/succession) 181 ✓; frontend `vitest` 408 ✓ +
> `next build` ✓; `prisma migrate status` up to date.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a complete corporate leadership-program workflow, integrated with the canonical INNOVA domains.

**Architecture:** Expand `LeadershipProgram` into the aggregate root and add normalized leadership-owned relations. Focused Nest services orchestrate validated references to existing Academy, PDI, mentoring, certification, succession, documents, and notifications. The Next.js workspace follows existing `apiClient`, React Query, and split-component conventions.

**Tech Stack:** NestJS 11, Prisma 7/PostgreSQL, class-validator, Jest/Supertest, Next.js 15, React 19, React Query, Vitest.

**Spec:** `docs/superpowers/specs/2026-09-09-leadership-programs-design.md`

## Global Constraints

- Reuse `Course`, `LearningPath`, `DevelopmentPlan`, `Mentoring`, `Certificate`, `SuccessionPlan`, `Competency`, document, and notification records; never duplicate those domains.
- Use `User.fullName`; use the `Role` enum in guards; enforce authorization and ownership on the backend.
- Preserve `@@unique([userId, programId])` semantics when replacing `LeadershipParticipant`.
- Persist notification metadata through `NotificationsService` or `JSON.stringify`.
- Verify all Prisma names against `prisma/schema.prisma`; run integration tests with `DB_POOL_MAX=5`.

---

## File structure

| Path | Responsibility |
| --- | --- |
| `prisma/schema.prisma` | Leadership aggregate, normalized child models, relations, enums, and indexes. |
| `prisma/migrations/20260909120000_expand_leadership_programs/migration.sql` | Non-destructive PostgreSQL migration and record backfill. |
| `src/leadership/leadership-program.dto.ts` | Validated program configuration and state contracts. |
| `src/leadership/leadership-programs.service.ts` | Program CRUD, ownership, configuration and transitions. |
| `src/leadership/leadership-eligibility.service.ts` | Candidate lookup and explainable automatic score calculation. |
| `src/leadership/leadership-participants.service.ts` | Selection, lifecycle, baseline, mentors/coaches and PDI links. |
| `src/leadership/leadership-execution.service.ts` | Assessments, projects, costs, documents and communications. |
| `src/leadership/leadership-analytics.service.ts` | Completion, certificate, readiness/succession and KPIs. |
| `frontend/components/leadership/*` | Wizard and operational workspace views. |

### Task 1: Add the program aggregate schema

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260909120000_expand_leadership_programs/migration.sql`
- Test: `test/integration/leadership-program-schema.integration-spec.ts`

**Interfaces:**
- Produces `LeadershipProgram.code`, `createdById`, `responsibleId`, planning fields, and normalized relations.
- Produces `LeadershipProgramParticipant`, targeting, selection criteria, competency, content, methodology, advisor, objective, assessment, project, cost, document, and communication models.

- [ ] **Step 1: Write the failing integration test for program-code and participant uniqueness.**

```ts
it('enforces unique code and user-program participation', async () => {
  await prisma.leadershipProgram.create({ data: programData({ code: 'LDR-2026' }) });
  await expect(prisma.leadershipProgram.create({ data: programData({ code: 'LDR-2026' }) })).rejects.toThrow();
  await prisma.leadershipProgramParticipant.create({ data: { userId, programId } });
  await expect(prisma.leadershipProgramParticipant.create({ data: { userId, programId } })).rejects.toThrow();
});
```

- [ ] **Step 2: Run it and verify it fails before the schema exists.**

Run: `npm run test:integration -- --testPathPatterns=leadership-program-schema`

- [ ] **Step 3: Add normalized relations and indexes; retain legacy records through a migration backfill.**

```prisma
model LeadershipProgram {
  id Int @id @default(autoincrement())
  code String @unique
  createdById Int
  createdBy User @relation("LeadershipProgramCreator", fields: [createdById], references: [id])
  participants LeadershipProgramParticipant[]
  @@index([createdById])
}
model LeadershipProgramParticipant {
  id Int @id @default(autoincrement())
  userId Int
  programId Int
  eligibilityScore Decimal? @db.Decimal(5, 2)
  @@unique([userId, programId])
  @@index([programId, status])
}
```

- [ ] **Step 4: Generate and inspect the migration.**

Run: `npx prisma migrate dev --name expand_leadership_programs; npm run prisma:check`

- [ ] **Step 5: Run the integration test and commit.**

```bash
npm run test:integration -- --testPathPatterns=leadership-program-schema
git add prisma/schema.prisma prisma/migrations test/integration/leadership-program-schema.integration-spec.ts
git commit -m "feat(leadership): add corporate program schema"
```

### Task 2: Secure program lifecycle and configuration

**Files:**
- Create: `src/leadership/leadership-program.dto.ts`, `src/leadership/leadership-programs.service.ts`
- Modify: `src/leadership/leadership.controller.ts`, `src/leadership/leadership.module.ts`
- Test: `src/leadership/leadership-programs.service.spec.ts`, `src/leadership/leadership.controller.spec.ts`

**Interfaces:**
- Produces `create(actor, dto)`, `update(actor, id, dto)`, `transition(actor, id, status)`, and `replaceConfiguration(actor, id, dto)`.

- [ ] **Step 1: Write failing tests for all creator roles and restricted ownership.**

```ts
it.each([Role.ADMIN, Role.RH, Role.GESTOR, Role.INSTRUCTOR, Role.DIRECTOR, Role.LIDER])('allows %s to create', async role => {
  await expect(service.create(actor(role), dto)).resolves.toMatchObject({ createdById: 7 });
});
it('rejects editing another author program', async () => {
  await expect(service.update(actor(Role.GESTOR, 7), 9, dto)).rejects.toBeInstanceOf(ForbiddenException);
});
```

- [ ] **Step 2: Run the tests, implement DTO validation, transition map, and ownership check.**

```ts
const PROGRAM_MANAGERS = [Role.ADMIN, Role.RH, Role.GESTOR, Role.INSTRUCTOR, Role.DIRECTOR, Role.LIDER] as const;
if (![Role.ADMIN, Role.RH].includes(actor.role.name as Role) && program.createdById !== actor.id && program.responsibleId !== actor.id) {
  throw new ForbiddenException();
}
```

- [ ] **Step 3: Add guarded controller endpoints for CRUD, configuration and valid status transitions; existing endpoints delegate to the service.**
- [ ] **Step 4: Run unit tests and commit.**

```bash
npx jest src/leadership --runInBand
git add src/leadership
git commit -m "feat(leadership): secure program lifecycle"
```

### Task 3: Implement automatic eligibility and candidate selection

**Files:**
- Create: `src/leadership/leadership-eligibility.service.ts`
- Modify: `src/leadership/leadership-program.dto.ts`, controller and module
- Test: `src/leadership/leadership-eligibility.service.spec.ts`, `test/integration/leadership-eligibility.integration-spec.ts`

**Interfaces:**
- Produces `calculate(programId, userId): { score: number; eligible: boolean; breakdown: EligibilityFactor[]; missingData: string[] }`.

- [ ] **Step 1: Write failing tests for weights, score, missing data, and invalid totals.**

```ts
expect(service.calculateFromFactors([{ source: 'PERFORMANCE', weight: 30, value: 80 }, { source: 'POTENTIAL', weight: 70, value: 90 }]).score).toBe(87);
expect(() => service.validateWeights([{ weight: 60 }, { weight: 30 }])).toThrow(BadRequestException);
```

- [ ] **Step 2: Implement deterministic server-side calculation from existing performance, potential, competency, 360°, experience, and career data. Persist score, breakdown snapshot, and missing factors on the participant.**
- [ ] **Step 3: Add manager-only candidate-list/recalculate/select endpoints and participant states `CANDIDATE -> SELECTED -> CALLED -> ENROLLED -> IN_PROGRESS -> COMPLETED|WITHDRAWN|NOT_COMPLETED`.**
- [ ] **Step 4: Run unit/integration tests and commit.**

```bash
npx jest src/leadership/leadership-eligibility.service.spec.ts --runInBand
npm run test:integration -- --testPathPatterns=leadership-eligibility
git add src/leadership test/integration/leadership-eligibility.integration-spec.ts
git commit -m "feat(leadership): calculate candidate eligibility"
```

### Task 4: Configure the program's development model

**Files:**
- Modify: program DTO/service/controller
- Test: `src/leadership/leadership-programs.service.spec.ts`, `test/integration/leadership-program-relations.integration-spec.ts`

- [ ] **Step 1: Write failing tests that reject unknown canonical IDs, duplicate associations, and methodology/selection totals other than 100.**

```ts
await expect(service.replaceConfiguration(admin, 1, { courseIds: [99999] })).rejects.toBeInstanceOf(NotFoundException);
await expect(service.replaceConfiguration(admin, 1, { methodologyWeights: [{ type: 'COACHING', weight: 40 }, { type: 'MENTORING', weight: 40 }] })).rejects.toBeInstanceOf(BadRequestException);
```

- [ ] **Step 2: Implement one transaction that validates and replaces objectives, target filters, criteria, competency targets/indicators, course/learning-path references, methodologies, and advisors.**
- [ ] **Step 3: Return the full configuration aggregate in program detail and run relation integration tests.**
- [ ] **Step 4: Commit.**

```bash
npm run test:integration -- --testPathPatterns=leadership-program-relations
git add src/leadership test/integration/leadership-program-relations.integration-spec.ts
git commit -m "feat(leadership): configure program development model"
```

### Task 5: Link participants to PDI, mentors and execution records

**Files:**
- Create: `src/leadership/leadership-participants.service.ts`, `src/leadership/leadership-execution.service.ts`
- Modify: DTO/controller/module
- Test: participant and execution service specs plus matching integration specs

- [ ] **Step 1: Write failing tests for self-only participant access, mentor/coach assignment, existing-PDI reference, assessment phases, leadership project, costs, documents, and notification metadata.**
- [ ] **Step 2: Implement participant baseline/readiness, PDI links, mentor/coach assignments, and only references to existing `DevelopmentPlan` and `Mentoring` records.**
- [ ] **Step 3: Implement initial/intermediate/final assessment snapshots, project KPI/evidence, document IDs after access validation, cost totals, and idempotent communication dispatch through `NotificationsService.enqueueSend`.**
- [ ] **Step 4: Run unit and integration tests and commit.**

```bash
npx jest src/leadership --runInBand
npm run test:integration -- --testPathPatterns=leadership-participants|leadership-execution
git add src/leadership test/integration
git commit -m "feat(leadership): execute participant development"
```

### Task 6: Complete programs and publish outcomes

**Files:**
- Create: `src/leadership/leadership-analytics.service.ts`
- Modify: programs service/controller/module
- Test: `src/leadership/leadership-analytics.service.spec.ts`, `test/integration/leadership-completion.integration-spec.ts`

- [ ] **Step 1: Write failing tests preventing incomplete participants from completing and requiring exactly one canonical certificate for a valid completion.**

```ts
await expect(service.completeParticipant(admin, programId, userId)).rejects.toBeInstanceOf(BadRequestException);
await satisfyCompletionCriteria(programId, userId);
await service.completeParticipant(admin, programId, userId);
expect(prisma.certificate.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ type: 'LEADERSHIP', programId, userId }) }));
```

- [ ] **Step 2: Implement completion rules, idempotent certificate issuance, readiness snapshot, configured succession update, and KPIs for completion/dropout, attendance, score, competency evolution, satisfaction, projects, promotions, mobility, succession, readiness, and ROI.**
- [ ] **Step 3: Add result endpoints with manager ownership and run completion integration tests.**
- [ ] **Step 4: Commit.**

```bash
npm run test:integration -- --testPathPatterns=leadership-completion
git add src/leadership test/integration/leadership-completion.integration-spec.ts
git commit -m "feat(leadership): complete programs and publish outcomes"
```

### Task 7: Deliver the frontend leadership workspace

**Files:**
- Create: `frontend/components/leadership/ProgramWizard.tsx`, `ProgramFormSteps.tsx`, `ParticipantsView.tsx`, `AdvisorsView.tsx`, `ProjectsView.tsx`, `AssessmentsView.tsx`, `ResultsView.tsx`, `SettingsView.tsx`
- Modify: `frontend/app/(platform)/leadership/page.tsx`, `ProgramsView.tsx`, `constants.ts`, `types.ts`, `frontend/lib/queryKeys.ts`
- Test: one Vitest file per wizard, participants, and results view

- [ ] **Step 1: Write failing UI tests for six-role creation visibility, invalid wizard-step blocking, score-breakdown display, and absence of another participant's individual plan.**

```tsx
render(<ProgramWizard role="GESTOR" />);
expect(screen.getByRole('button', { name: /criar programa/i })).toBeVisible();
await user.click(screen.getByRole('button', { name: /continuar/i }));
expect(screen.getByText(/nome do programa é obrigatório/i)).toBeVisible();
```

- [ ] **Step 2: Implement the 16-step draft wizard with existing UI primitives, `useApiMutation`, `apiClient`, and server errors; persist each valid step.**
- [ ] **Step 3: Implement the approved workspace tabs: Visão Geral, Programas, Participantes, Mentores & Coaches, Projetos de Liderança, Avaliações, Resultados and Configurações. Use one query key per resource and invalidate only affected keys.**
- [ ] **Step 4: Run frontend tests/lint/build and commit.**

```bash
cd frontend
npm test -- ProgramWizard ParticipantsView ResultsView
npm run lint
npm run build
git add app/'(platform)'/leadership components/leadership lib/queryKeys.ts
git commit -m "feat(leadership-ui): add corporate program workspace"
```

### Task 8: Verify cross-project release quality

**Files:**
- Test: all leadership unit tests, PostgreSQL integration specs, frontend leadership tests

- [ ] **Step 1: Add regression coverage for authorization, ownership, transitions, duplicate prevention, JSON notification metadata, certificate idempotency, and migration backfill.**
- [ ] **Step 2: Run database, backend and frontend suites.**

Run: `npm run prisma:check; npx jest src/leadership --runInBand; npm run test:integration; cd frontend; npm test`

- [ ] **Step 3: Run lint/build checks and inspect migration and diff.**

Run: `npm run lint:check; npm run build; npx prisma migrate status; git diff --check; git status --short`

- [ ] **Step 4: Commit verification-only fixes.**

```bash
git add prisma src/leadership test/integration frontend/app/'(platform)'/leadership frontend/components/leadership frontend/lib/queryKeys.ts
git commit -m "test(leadership): verify corporate programs workflow"
```

## Coverage review

- Programme information, planning, target audience, selection, competencies, objectives, Academy contents, methodologies and advisors: Tasks 1–4.
- Participants, PDI, mentoring, assessments, projects, documents, costs and communications: Task 5.
- Completion, certificates, readiness, succession, KPIs and ROI: Task 6.
- Creation wizard and management interface: Task 7.
- Migration, RBAC, ownership, unit, integration, lint and build verification: Task 8.
