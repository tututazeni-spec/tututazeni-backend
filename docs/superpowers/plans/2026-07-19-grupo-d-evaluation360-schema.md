# Grupo D — evaluation360 Schema Completion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the Prisma schema for all 12 models used by `evaluation360.service.ts` and `evaluation360.events.ts`, then replace all 69 `(this.prisma as any)` casts with typed Prisma calls.

**Architecture:** Six schema-migration tasks build out the missing models (some with name remapping to avoid conflicts with existing schema); two service/events refactoring tasks replace casts; a final task fixes test mocks and opens the PR. Each task is independently compilable and committable.

**Tech Stack:** NestJS, Prisma ORM, PostgreSQL, TypeScript, Jest. Branch in isolated git worktree.

## Global Constraints

- Shell: PowerShell (Windows).
- Worktree: create via `git worktree add .claude/worktrees/fix+grupo-d-evaluation360 -b fix/grupo-d-evaluation360`
- All new schema fields: `@default(...)` — non-destructive migrations only
- New model IDs: `String @id @default(cuid())` (evaluation360 module uses string IDs throughout)
- **No `@relation` FK to `User`** in new models — store user IDs as plain `String` (DTOs pass `string`; `User.id` is `Int`)
- Exception: `Competency.id` is `Int` — FKs to `Competency` are `Int`
- **Three model renames** in the service (conflicts with existing schema models):
  - `evaluationCycle` → `eval360Cycle` (model `Eval360Cycle`)
  - `evaluationQuestion` → `eval360Question` (model `Eval360Question`)
  - `continuousFeedback` → `eval360Feedback` (model `Eval360Feedback`)
- **User casts**: replace `(this.prisma as any).user.findX({ where: { id: X } })` → `this.prisma.user.findX({ where: { id: +X } })` (unary `+` converts string to number)
- After every schema change: `npx prisma validate` before migrating
- Commit messages: `feat(prisma):` for schema, `refactor(evaluation360):` for service
- CI runs lint + Jest — Prettier formatting must be respected

---

## File Map

| File | What changes |
|---|---|
| `prisma/schema.prisma` | Tasks 1–6: add fields to `Competency`, add 11 new models |
| `src/evaluation360/evaluation360.service.ts` | Task 7: replace 62 `(this.prisma as any)` casts + 3 model renames |
| `src/evaluation360/evaluation360.events.ts` | Task 8: replace 7 `(this.prisma as any)` casts |
| `src/evaluation360/evaluation360.service.spec.ts` | Task 9: add new model names to Proxy mock |
| `src/evaluation360/evaluation360.events.spec.ts` | Task 9: verify/add missing mocks |

---

## Task 1: Schema — Extend Competency + create CompetencyIndicator

**Files:**
- Modify: `prisma/schema.prisma` (~line 1959)

**Interfaces:**
- Produces: `this.prisma.competency` with `type`, `scaleMin`, `scaleMax`, `isGlobal`, `tenantId`, `isActive`, `indicators`; `this.prisma.competencyIndicator` — consumed by Task 7.

- [ ] **Step 1: Create worktree**

```powershell
git worktree add .claude/worktrees/fix+grupo-d-evaluation360 -b fix/grupo-d-evaluation360
Set-Location "C:\Users\Placido Costa\innova\.claude\worktrees\fix+grupo-d-evaluation360"
```

All remaining steps run from this worktree directory.

- [ ] **Step 2: Add fields to Competency model**

Find the current Competency model (line ~1959):
```prisma
model Competency {
  id          Int      @id @default(autoincrement())
  name        String   @unique
  description String?
  category    String   @default("HARD_SKILL")
  tags        String[]
  status      String   @default("ACTIVE")
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  userCompetencies  UserCompetency[]
  courses           CourseCompetency[]
  positions         PositionCompetency[]
  proficiencyLevels ProficiencyLevel[]
  endorsements      CompetencyEndorsement[]
  evolutionLogs     CompetencyEvolutionLog[]
  competencyMaps    CompetencyMap[]
  avatarScenarios   AvatarScenario[]
  @@index([category])
  @@index([status])
}
```

Replace with:
```prisma
model Competency {
  id          Int      @id @default(autoincrement())
  name        String   @unique
  description String?
  category    String   @default("HARD_SKILL")
  type        String   @default("BEHAVIORAL")
  tags        String[]
  status      String   @default("ACTIVE")
  isActive    Boolean  @default(true)
  isGlobal    Boolean  @default(true)
  tenantId    String?
  scaleMin    Int      @default(1)
  scaleMax    Int      @default(5)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  userCompetencies         UserCompetency[]
  courses                  CourseCompetency[]
  positions                PositionCompetency[]
  proficiencyLevels        ProficiencyLevel[]
  endorsements             CompetencyEndorsement[]
  evolutionLogs            CompetencyEvolutionLog[]
  competencyMaps           CompetencyMap[]
  avatarScenarios          AvatarScenario[]
  indicators               CompetencyIndicator[]
  eval360CycleCompetencies Eval360CycleCompetency[]
  eval360Questions         Eval360Question[]        @relation("Eval360QuestionCompetency")
  @@index([category])
  @@index([status])
  @@index([isActive])
}
```

- [ ] **Step 3: Create CompetencyIndicator model**

Append after the `Competency` model block (before `ProficiencyLevel`):
```prisma
model CompetencyIndicator {
  id           String     @id @default(cuid())
  competencyId Int
  level        Int
  description  String     @db.Text
  examples     String?    @db.Text
  competency   Competency @relation(fields: [competencyId], references: [id], onDelete: Cascade)

  @@index([competencyId])
}
```

- [ ] **Step 4: Validate and migrate**

```powershell
npx prisma validate
```
Expected: `The schema at "prisma/schema.prisma" is valid`

```powershell
npx prisma migrate dev --name "add-competency-fields-and-indicator"
```
Expected: migration file created, `✔ Generated Prisma Client`

- [ ] **Step 5: Verify generated client has new fields**

```powershell
npx tsc --noEmit 2>&1 | Select-String "competency" | Select-Object -First 5
```
Expected: zero lines.

- [ ] **Step 6: Commit**

```powershell
git add prisma/schema.prisma prisma/migrations
git commit -m "feat(prisma): adicionar campos em falta em Competency e criar CompetencyIndicator (Grupo D)"
```

---

## Task 2: Schema — Create Eval360Cycle + Eval360CycleCompetency

**Files:**
- Modify: `prisma/schema.prisma` (end of file)

**Interfaces:**
- Produces: `this.prisma.eval360Cycle` with all cycle fields + `competencies`, `questions`, `participants`, `assignments`, `responses`, `results`; `this.prisma.eval360CycleCompetency` — consumed by Tasks 3–7.

- [ ] **Step 1: Add Eval360Cycle + Eval360CycleCompetency at end of schema**

Append after the last model (after the `// ENGAGEMENT — GRUPO B+C` section):

```prisma

// ══════════════════════════════════════════════════════════════════
// AVALIAÇÃO 360° — GRUPO D
// ══════════════════════════════════════════════════════════════════

model Eval360Cycle {
  id                String   @id @default(cuid())
  tenantId          String?
  name              String
  description       String?  @db.Text
  model             String   @default("360")
  type              String   @default("ANNUAL")
  startDate         DateTime
  endDate           DateTime
  gracePeriodDays   Int      @default(3)
  status            String   @default("DRAFT")
  anonymityMode     String   @default("ANONYMOUS")
  quorumMinimum     Int      @default(3)
  weightSelf        Float    @default(10)
  weightManager     Float    @default(40)
  weightPeer        Float    @default(30)
  weightSubordinate Float    @default(20)
  weightExternal    Float    @default(0)
  cutoffPromotion   Float?
  cutoffBonus       Float?
  cutoffProgram     Float?
  linkedToPdi       Boolean  @default(true)
  linkedToBonus     Boolean  @default(false)
  linkedToOkrs      Boolean  @default(false)
  createdBy         String
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt

  competencies Eval360CycleCompetency[]
  questions    Eval360Question[]
  participants CycleParticipant[]
  assignments  EvaluatorAssignment[]
  responses    EvaluationResponse[]
  results      EvaluationResult[]

  @@index([status])
  @@index([tenantId])
}

model Eval360CycleCompetency {
  id           String       @id @default(cuid())
  cycleId      String
  competencyId Int
  weight       Float        @default(1)
  isRequired   Boolean      @default(true)
  order        Int          @default(0)
  cycle        Eval360Cycle @relation(fields: [cycleId], references: [id], onDelete: Cascade)
  competency   Competency   @relation(fields: [competencyId], references: [id], onDelete: Cascade)

  @@unique([cycleId, competencyId])
  @@index([cycleId])
}
```

- [ ] **Step 2: Validate and migrate**

```powershell
npx prisma validate
```
Expected: valid

```powershell
npx prisma migrate dev --name "add-eval360-cycle"
```
Expected: migration created, `✔ Generated Prisma Client`

- [ ] **Step 3: Verify client**

```powershell
npx tsc --noEmit 2>&1 | Select-String "eval360Cycle" | Select-Object -First 5
```
Expected: zero lines.

- [ ] **Step 4: Commit**

```powershell
git add prisma/schema.prisma prisma/migrations
git commit -m "feat(prisma): adicionar Eval360Cycle e Eval360CycleCompetency (Grupo D)"
```

---

## Task 3: Schema — Create EvaluatorAssignment + CycleParticipant

**Files:**
- Modify: `prisma/schema.prisma` (after Eval360CycleCompetency)

**Interfaces:**
- Consumes: `Eval360Cycle` (Task 2)
- Produces: `this.prisma.evaluatorAssignment` with `id`, `cycleId`, `evaluateeId`, `evaluatorId`, `role`, `status`, `suggestedBy`, `approvedBy`, `approvedAt`, `invitedAt`, `completedAt`; `this.prisma.cycleParticipant` with `@@unique([cycleId, userId])` — consumed by Tasks 5, 7.

- [ ] **Step 1: Append EvaluatorAssignment + CycleParticipant to schema**

Append after `Eval360CycleCompetency`:
```prisma
model EvaluatorAssignment {
  id          String       @id @default(cuid())
  cycleId     String
  evaluateeId String
  evaluatorId String
  role        String
  status      String       @default("PENDING")
  suggestedBy String?
  approvedBy  String?
  approvedAt  DateTime?
  invitedAt   DateTime?
  completedAt DateTime?
  createdAt   DateTime     @default(now())
  updatedAt   DateTime     @updatedAt
  cycle       Eval360Cycle @relation(fields: [cycleId], references: [id], onDelete: Cascade)
  responses   EvaluationResponse[]

  @@index([cycleId])
  @@index([evaluateeId])
  @@index([evaluatorId])
  @@index([status])
}

model CycleParticipant {
  id                   String       @id @default(cuid())
  cycleId              String
  userId               String
  status               String       @default("PENDING")
  consentGiven         Boolean?
  consentAt            DateTime?
  finalScore           Float?
  completedAt          DateTime?
  isEligiblePromotion  Boolean?
  isEligibleBonus      Boolean?
  scoreByEvaluatorType String?
  createdAt            DateTime     @default(now())
  cycle                Eval360Cycle @relation(fields: [cycleId], references: [id], onDelete: Cascade)

  @@unique([cycleId, userId])
  @@index([cycleId])
  @@index([status])
}
```

- [ ] **Step 2: Validate and migrate**

```powershell
npx prisma validate
npx prisma migrate dev --name "add-evaluator-assignment-cycle-participant"
```
Expected: migration created, `✔ Generated Prisma Client`

- [ ] **Step 3: Commit**

```powershell
git add prisma/schema.prisma prisma/migrations
git commit -m "feat(prisma): adicionar EvaluatorAssignment e CycleParticipant (Grupo D)"
```

---

## Task 4: Schema — Create Eval360Question

**Files:**
- Modify: `prisma/schema.prisma`

**Interfaces:**
- Consumes: `Eval360Cycle` (Task 2), `Competency` (Task 1 with `"Eval360QuestionCompetency"` relation name)
- Produces: `this.prisma.eval360Question` with `cycleId`, `competencyId?`, `text`, `type`, `isRequired`, `order`; answers relation — consumed by Tasks 5, 7.

- [ ] **Step 1: Append Eval360Question to schema**

Append after `CycleParticipant`:
```prisma
model Eval360Question {
  id           String       @id @default(cuid())
  cycleId      String
  competencyId Int?
  text         String       @db.Text
  type         String
  isRequired   Boolean      @default(true)
  order        Int          @default(0)
  createdAt    DateTime     @default(now())
  cycle        Eval360Cycle @relation(fields: [cycleId], references: [id], onDelete: Cascade)
  competency   Competency?  @relation("Eval360QuestionCompetency", fields: [competencyId], references: [id], onDelete: SetNull)
  answers      EvaluationAnswer[]

  @@index([cycleId])
  @@index([competencyId])
}
```

- [ ] **Step 2: Validate and migrate**

```powershell
npx prisma validate
npx prisma migrate dev --name "add-eval360-question"
```
Expected: migration created, `✔ Generated Prisma Client`

- [ ] **Step 3: Commit**

```powershell
git add prisma/schema.prisma prisma/migrations
git commit -m "feat(prisma): adicionar Eval360Question (Grupo D)"
```

---

## Task 5: Schema — Create EvaluationResponse + EvaluationAnswer

**Files:**
- Modify: `prisma/schema.prisma`

**Interfaces:**
- Consumes: `Eval360Cycle` (Task 2), `EvaluatorAssignment` (Task 3), `Eval360Question` (Task 4)
- Produces: `this.prisma.evaluationResponse` with `@@unique([assignmentId])` + `sentimentScore`; `this.prisma.evaluationAnswer` with `@@unique([responseId, questionId])` — consumed by Tasks 7, 8.

- [ ] **Step 1: Append EvaluationResponse + EvaluationAnswer to schema**

Append after `Eval360Question`:
```prisma
model EvaluationResponse {
  id            String              @id @default(cuid())
  cycleId       String
  assignmentId  String              @unique
  evaluateeId   String
  evaluatorId   String
  evaluatorRole String
  status        String              @default("DRAFT")
  startedAt     DateTime            @default(now())
  submittedAt   DateTime?
  isAnonymized  Boolean             @default(false)
  sentimentScore Float?
  createdAt     DateTime            @default(now())
  updatedAt     DateTime            @updatedAt
  cycle         Eval360Cycle        @relation(fields: [cycleId], references: [id], onDelete: Cascade)
  assignment    EvaluatorAssignment @relation(fields: [assignmentId], references: [id], onDelete: Cascade)
  answers       EvaluationAnswer[]

  @@index([cycleId])
  @@index([evaluateeId])
  @@index([status])
}

model EvaluationAnswer {
  id           String             @id @default(cuid())
  responseId   String
  questionId   String
  numericValue Float?
  textValue    String?            @db.Text
  choiceValue  String?
  response     EvaluationResponse @relation(fields: [responseId], references: [id], onDelete: Cascade)
  question     Eval360Question    @relation(fields: [questionId], references: [id], onDelete: Cascade)

  @@unique([responseId, questionId])
  @@index([responseId])
}
```

- [ ] **Step 2: Validate and migrate**

```powershell
npx prisma validate
npx prisma migrate dev --name "add-evaluation-response-answer"
```
Expected: migration created, `✔ Generated Prisma Client`

- [ ] **Step 3: Commit**

```powershell
git add prisma/schema.prisma prisma/migrations
git commit -m "feat(prisma): adicionar EvaluationResponse e EvaluationAnswer (Grupo D)"
```

---

## Task 6: Schema — Create EvaluationResult, Eval360Feedback, PulseSurvey, PulseSurveyResponse

**Files:**
- Modify: `prisma/schema.prisma`

**Interfaces:**
- Consumes: `Eval360Cycle` (Task 2)
- Produces: `this.prisma.evaluationResult` with `@@unique([cycleId, participantId])`; `this.prisma.eval360Feedback`; `this.prisma.pulseSurvey`; `this.prisma.pulseSurveyResponse` with `@@unique([surveyId, userId])` — consumed by Tasks 7, 8.

- [ ] **Step 1: Append four models to schema**

Append after `EvaluationAnswer`:
```prisma
model EvaluationResult {
  id                  String       @id @default(cuid())
  cycleId             String
  participantId       String
  overallScore        Float?
  weightedScore       Float?
  selfScore           Float?
  managerScore        Float?
  peerScore           Float?
  subordinateScore    Float?
  externalScore       Float?
  scoresByCompetency  String?      @db.Text
  gaps                String?      @db.Text
  strengths           String?      @db.Text
  isEligiblePromotion Boolean      @default(false)
  isEligibleBonus     Boolean      @default(false)
  bonusMultiplier     Float?
  calculatedAt        DateTime     @default(now())
  createdAt           DateTime     @default(now())
  updatedAt           DateTime     @updatedAt
  cycle               Eval360Cycle @relation(fields: [cycleId], references: [id], onDelete: Cascade)

  @@unique([cycleId, participantId])
  @@index([cycleId])
  @@index([participantId])
}

model Eval360Feedback {
  id         String   @id @default(cuid())
  fromUserId String
  toUserId   String
  type       String
  message    String   @db.Text
  isPrivate  Boolean  @default(false)
  createdAt  DateTime @default(now())

  @@index([toUserId])
  @@index([fromUserId])
}

model PulseSurvey {
  id          String                @id @default(cuid())
  title       String
  description String?               @db.Text
  closesAt    DateTime
  createdBy   String
  sentAt      DateTime              @default(now())
  createdAt   DateTime              @default(now())
  responses   PulseSurveyResponse[]
}

model PulseSurveyResponse {
  id          String      @id @default(cuid())
  surveyId    String
  userId      String
  answersJson Json
  createdAt   DateTime    @default(now())
  survey      PulseSurvey @relation(fields: [surveyId], references: [id], onDelete: Cascade)

  @@unique([surveyId, userId])
  @@index([surveyId])
}
```

- [ ] **Step 2: Validate and migrate**

```powershell
npx prisma validate
npx prisma migrate dev --name "add-evaluation-result-feedback-pulse"
```
Expected: migration created, `✔ Generated Prisma Client`

- [ ] **Step 3: Verify zero TypeScript errors in schema-related code**

```powershell
npx tsc --noEmit 2>&1 | Select-String "evaluationResult|eval360Feedback|pulseSurvey" | Select-Object -First 10
```
Expected: zero lines.

- [ ] **Step 4: Commit**

```powershell
git add prisma/schema.prisma prisma/migrations
git commit -m "feat(prisma): adicionar EvaluationResult, Eval360Feedback, PulseSurvey, PulseSurveyResponse (Grupo D)"
```

---

## Task 7: Service — Remove all 62 `(this.prisma as any)` casts in evaluation360.service.ts

**Files:**
- Modify: `src/evaluation360/evaluation360.service.ts`

**Interfaces:**
- Consumes: all typed models from Tasks 1–6
- Produces: all methods typed; 3 model renames applied (`evaluationCycle`→`eval360Cycle`, `evaluationQuestion`→`eval360Question`, `continuousFeedback`→`eval360Feedback`); user casts replaced with `this.prisma.user` + `+id`

**Note on user ID type:** `User.id` is `Int` but the service passes `string` IDs from DTOs. Fix: `this.prisma.user.findUnique({ where: { id: +dto.evaluateeId } })` — unary `+` converts string to number.

- [ ] **Step 1: Replace all `evaluationCycle` occurrences (12 total — use replace_all)**

In `src/evaluation360/evaluation360.service.ts`, replace ALL occurrences:
- `(this.prisma as any).evaluationCycle.` → `this.prisma.eval360Cycle.`

- [ ] **Step 2: Replace all `evaluationQuestion` occurrences (5 total — use replace_all)**

- `(this.prisma as any).evaluationQuestion.` → `this.prisma.eval360Question.`

- [ ] **Step 3: Replace all `continuousFeedback` occurrences (3 total — use replace_all)**

- `(this.prisma as any).continuousFeedback.` → `this.prisma.eval360Feedback.`

- [ ] **Step 4: Replace all remaining `(this.prisma as any)` simple model casts (use replace_all)**

Replace `(this.prisma as any).competency.` → `this.prisma.competency.`
Replace `(this.prisma as any).evaluatorAssignment.` → `this.prisma.evaluatorAssignment.`
Replace `(this.prisma as any).cycleParticipant.` → `this.prisma.cycleParticipant.`
Replace `(this.prisma as any).evaluationResponse.` → `this.prisma.evaluationResponse.`
Replace `(this.prisma as any).evaluationAnswer.` → `this.prisma.evaluationAnswer.`
Replace `(this.prisma as any).evaluationResult.` → `this.prisma.evaluationResult.`
Replace `(this.prisma as any).pulseSurvey.` → `this.prisma.pulseSurvey.`
Replace `(this.prisma as any).pulseSurveyResponse.` → `this.prisma.pulseSurveyResponse.`

- [ ] **Step 5: Replace user casts (4 occurrences)**

Line ~356 — suggestEvaluators evaluatee lookup:
Find:
```typescript
    const evaluatee = await (this.prisma as any).user.findUnique({
      where: { id: dto.evaluateeId },
    });
```
Replace with:
```typescript
    const evaluatee = await this.prisma.user.findUnique({
      where: { id: +dto.evaluateeId },
    });
```

Line ~382 — peers lookup:
Find:
```typescript
      const peers = await (this.prisma as any).user.findMany({
        where: {
          departmentId: evaluatee.departmentId,
          id: { not: dto.evaluateeId },
          managerId: evaluatee.managerId ?? undefined,
        },
        take: maxPerRole,
      });
```
Replace with:
```typescript
      const peers = await this.prisma.user.findMany({
        where: {
          departmentId: evaluatee.departmentId,
          id: { not: +dto.evaluateeId },
          managerId: evaluatee.managerId ?? undefined,
        },
        take: maxPerRole,
      });
```

Line ~400 — subordinates lookup:
Find:
```typescript
    const subordinates = await (this.prisma as any).user.findMany({
      where: { managerId: dto.evaluateeId },
      take: maxPerRole,
    });
```
Replace with:
```typescript
    const subordinates = await this.prisma.user.findMany({
      where: { managerId: +dto.evaluateeId },
      take: maxPerRole,
    });
```

Line ~948 — getTeamAnalytics managedUsers lookup:
Find:
```typescript
    const managedUsers = await (this.prisma as any).user.findMany({
      where: { managerId },
```
Replace with:
```typescript
    const managedUsers = await this.prisma.user.findMany({
      where: { managerId: +managerId },
```

- [ ] **Step 6: Verify zero remaining casts for all 12 models**

```powershell
Select-String -Path "src\evaluation360\evaluation360.service.ts" -Pattern "\(this\.prisma as any\)"
```
Expected: no output.

- [ ] **Step 7: TypeScript compile check**

```powershell
npx tsc --noEmit 2>&1 | Select-String "evaluation360.service.ts" | Select-Object -First 20
```
Expected: zero lines (no errors in this file).

If errors appear, they are likely type mismatches in method arguments. Fix by casting the specific argument with `as any` (not the whole prisma call), e.g. `answers: { create: dto.answers.map(...) } as any`.

- [ ] **Step 8: Run tests**

```powershell
$result = npx jest evaluation360.service --passWithNoTests --no-coverage --forceExit 2>&1
$result | Select-Object -Last 20
```
Expected: test suites pass.

- [ ] **Step 9: Commit**

```powershell
git add src/evaluation360/evaluation360.service.ts
git commit -m "refactor(evaluation360): substituir 62 as any no service — renomear eval360Cycle, eval360Question, eval360Feedback (Grupo D)"
```

---

## Task 8: Events — Remove all 7 `(this.prisma as any)` casts in evaluation360.events.ts

**Files:**
- Modify: `src/evaluation360/evaluation360.events.ts`

**Interfaces:**
- Consumes: `this.prisma.user`, `this.prisma.evaluationResponse`, `this.prisma.cycleParticipant` (all available from Tasks 3, 5)
- Produces: events file fully typed; 4 user casts + 2 evaluationResponse casts + 1 cycleParticipant cast removed

- [ ] **Step 1: Replace user casts (4 occurrences)**

Replace ALL occurrences of `(this.prisma as any).user.findUnique({` → `this.prisma.user.findUnique({`

Note: the `assignment.evaluatorId` and `assignment.evaluateeId` are `any` from the event payload — Prisma accepts `any` for `where: { id: ... }` without error.

- [ ] **Step 2: Replace evaluationResponse casts (2 occurrences)**

Replace ALL occurrences of `(this.prisma as any).evaluationResponse.` → `this.prisma.evaluationResponse.`

- [ ] **Step 3: Replace cycleParticipant cast (1 occurrence)**

Find:
```typescript
      const participants = await (this.prisma as any).cycleParticipant.findMany({
        where: { cycleId: payload.cycleId, status: 'COMPLETED' },
      });
```
Replace with:
```typescript
      const participants = await this.prisma.cycleParticipant.findMany({
        where: { cycleId: payload.cycleId, status: 'COMPLETED' },
      });
```

- [ ] **Step 4: Verify zero remaining casts**

```powershell
Select-String -Path "src\evaluation360\evaluation360.events.ts" -Pattern "\(this\.prisma as any\)"
```
Expected: no output.

- [ ] **Step 5: TypeScript compile check**

```powershell
npx tsc --noEmit 2>&1 | Select-String "evaluation360.events.ts" | Select-Object -First 10
```
Expected: zero lines.

- [ ] **Step 6: Run events tests**

```powershell
$result = npx jest evaluation360.events --passWithNoTests --no-coverage --forceExit 2>&1
$result | Select-Object -Last 15
```
Expected: pass.

- [ ] **Step 7: Commit**

```powershell
git add src/evaluation360/evaluation360.events.ts
git commit -m "refactor(evaluation360): substituir 7 as any no events (Grupo D)"
```

---

## Task 9: Fix spec mocks + PR

**Files:**
- Modify: `src/evaluation360/evaluation360.service.spec.ts`
- Verify: `src/evaluation360/evaluation360.events.spec.ts`

**Context — current mock state:**
The `evaluation360.service.spec.ts` uses a `Proxy` that intercepts model names. The Proxy currently handles `competency`, `evaluationCycle`, `cycleQuestion`, `evaluationRequest`. After Tasks 7–8 we renamed three models and introduced new ones. The Proxy needs to handle:
- `eval360Cycle` (was `evaluationCycle`)
- `eval360Question` (was `cycleQuestion` — note: the mock used `cycleQuestion`, service now calls `eval360Question`)
- `eval360Feedback` (new)
- `evaluatorAssignment` (new)
- `cycleParticipant` (new)
- `evaluationResponse` (new)
- `evaluationAnswer` (new)
- `evaluationResult` (new)
- `pulseSurvey` (new)
- `pulseSurveyResponse` (new)

- [ ] **Step 1: Update Proxy mock in evaluation360.service.spec.ts**

Find the current Proxy block:
```typescript
const mockPrisma = new Proxy(
  {},
  {
    get(_target, prop) {
      if (prop === 'competency') return competencyMock;
      if (prop === 'evaluationCycle') return cycleMock;
      if (prop === 'cycleQuestion') return questionMock;
      if (prop === 'evaluationRequest') return requestMock;
      return {
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockResolvedValue({}),
        count: jest.fn().mockResolvedValue(0),
        findUnique: jest.fn(),
      };
    },
  },
);
```

Replace with:
```typescript
const crud = () => ({
  create: jest.fn().mockResolvedValue({ id: 'id-1' }),
  findMany: jest.fn().mockResolvedValue([]),
  findUnique: jest.fn().mockResolvedValue(null),
  findFirst: jest.fn().mockResolvedValue(null),
  update: jest.fn().mockResolvedValue({ id: 'id-1' }),
  updateMany: jest.fn().mockResolvedValue({ count: 0 }),
  upsert: jest.fn().mockResolvedValue({ id: 'id-1' }),
  count: jest.fn().mockResolvedValue(0),
  delete: jest.fn().mockResolvedValue({ id: 'id-1' }),
});

const mockPrisma = new Proxy(
  {},
  {
    get(_target, prop) {
      if (prop === 'competency') return competencyMock;
      if (prop === 'eval360Cycle') return cycleMock;
      if (prop === 'eval360Question') return questionMock;
      if (prop === 'evaluationRequest') return requestMock;
      if (prop === 'user') return { findMany: jest.fn().mockResolvedValue([]), findUnique: jest.fn().mockResolvedValue(null) };
      // New models from Grupo D
      if (prop === 'eval360Feedback') return crud();
      if (prop === 'evaluatorAssignment') return crud();
      if (prop === 'cycleParticipant') return crud();
      if (prop === 'evaluationResponse') return crud();
      if (prop === 'evaluationAnswer') return crud();
      if (prop === 'evaluationResult') return crud();
      if (prop === 'pulseSurvey') return crud();
      if (prop === 'pulseSurveyResponse') return crud();
      if (prop === 'competencyIndicator') return crud();
      return crud();
    },
  },
);
```

- [ ] **Step 2: Run the full evaluation360 test suite**

```powershell
$result = npx jest evaluation360 --passWithNoTests --no-coverage --forceExit 2>&1
$result | Select-Object -Last 30
```
Expected: all test suites pass, zero failures.

If a test fails because it expected `evaluationCycle` and now gets `eval360Cycle` (mock key mismatch), the Proxy already handles this. If there are assertion failures due to `cycleMock` not being called because the Proxy intercept changed, verify the `cycleMock` is still returned for `eval360Cycle`.

- [ ] **Step 3: Commit**

```powershell
git add src/evaluation360/evaluation360.service.spec.ts
git commit -m "fix(test): actualizar mocks evaluation360 para modelos Grupo D (eval360Cycle, eval360Question, eval360Feedback)"
```

- [ ] **Step 4: Push and create PR**

```powershell
git push -u origin fix/grupo-d-evaluation360
```

```powershell
gh pr create `
  --title "feat(prisma): Grupo D — evaluation360 schema completo, 69 as-any removidos" `
  --body "$(cat <<'EOF'
## Summary

- Extende `Competency` com 6 campos + cria `CompetencyIndicator`
- Cria `Eval360Cycle` + `Eval360CycleCompetency` (evita conflito com `EvaluationCycle` existente)
- Cria `EvaluatorAssignment`, `CycleParticipant`
- Cria `Eval360Question` (evita conflito com `EvaluationQuestion` existente)
- Cria `EvaluationResponse`, `EvaluationAnswer`
- Cria `EvaluationResult`, `Eval360Feedback`, `PulseSurvey`, `PulseSurveyResponse`
- Remove **69** ocorrências de `(this.prisma as any)` em `evaluation360.service.ts` e `evaluation360.events.ts`
- Renomeia 3 referências de modelo no service: `eval360Cycle`, `eval360Question`, `eval360Feedback`

## Test plan

- [x] `npx prisma validate` — schema válido
- [x] 6 migrações aplicadas sem erros
- [x] `npx tsc --noEmit` — zero erros em `evaluation360.service.ts` e `evaluation360.events.ts`
- [x] `npx jest evaluation360` — todos os testes passam
- [ ] CI quality check

🤖 Generated with Claude Code
EOF
)"
```

- [ ] **Step 5: Arm auto-merge**

```powershell
gh pr merge --auto --merge
```

---

## Self-Review

**Spec coverage:**
| Spec requirement | Task |
|---|---|
| `Competency`: 6 novos campos | Task 1 ✓ |
| `CompetencyIndicator` novo | Task 1 ✓ |
| `Eval360Cycle` + `Eval360CycleCompetency` | Task 2 ✓ |
| `EvaluatorAssignment` | Task 3 ✓ |
| `CycleParticipant` com `@@unique([cycleId, userId])` | Task 3 ✓ |
| `Eval360Question` com relação nomeada `"Eval360QuestionCompetency"` | Task 4 ✓ |
| `EvaluationResponse` com `@@unique([assignmentId])` + `sentimentScore` | Task 5 ✓ |
| `EvaluationAnswer` com `@@unique([responseId, questionId])` | Task 5 ✓ |
| `EvaluationResult` com `@@unique([cycleId, participantId])` | Task 6 ✓ |
| `Eval360Feedback` (substitui `continuousFeedback`) | Task 6 ✓ |
| `PulseSurvey` + `PulseSurveyResponse` com `@@unique([surveyId, userId])` | Task 6 ✓ |
| 62 casts removidos em `evaluation360.service.ts` | Task 7 ✓ |
| 7 casts removidos em `evaluation360.events.ts` | Task 8 ✓ |
| Spec mocks actualizados | Task 9 ✓ |
| Zero DTOs/controllers alterados | verificado — scope explícito ✓ |

**Placeholder scan:** Todos os passos têm código completo. Sem TBD ou TODO.

**Type consistency:**
- `Eval360Cycle.id String` → `EvaluatorAssignment.cycleId String` → `EvaluationResponse.cycleId String` — consistente
- `Eval360Question.id String` → `EvaluationAnswer.questionId String` — consistente
- `CompetencyIndicator.competencyId Int` → `Competency.id Int` — consistente
- Relação nomeada `"Eval360QuestionCompetency"` aparece em `Competency.eval360Questions` (Task 1) e `Eval360Question.competency` (Task 4) — consistente
- Rename `evaluationCycle` → `eval360Cycle` aplicado em Task 7 (service) e Task 9 (mock Proxy) — consistente
