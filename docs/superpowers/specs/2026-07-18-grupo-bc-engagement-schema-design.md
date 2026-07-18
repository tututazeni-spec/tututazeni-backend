# Spec — Grupo B+C: EngagementSurvey + OneOnOneMeeting + EngagementAction

> Data: 2026-07-18
> Âmbito: `prisma/schema.prisma` + `src/engagement/engagement.service.ts`

## Contexto

O `engagement.service.ts` tem 18 chamadas `(this.prisma as any)` distribuídas por quatro
modelos. Três desses modelos existem no schema mas com campos incompletos
(`EngagementSurvey`, `SurveyQuestion`, `SurveyResponse`); dois não existem de todo
(`OneOnOneMeeting`, `EngagementAction`). O objectivo é completar o schema e remover todos
os casts, à semelhança do Grupo A (Feedback/Recognition/MoodCheckin).

## Objectivo

Após esta PR:
- `(this.prisma as any).engagementSurvey` → zero ocorrências
- `(this.prisma as any).surveyResponse` → zero ocorrências
- `(this.prisma as any).oneOnOneMeeting` → zero ocorrências
- `(this.prisma as any).engagementAction` → zero ocorrências
- Zero alterações a DTOs, controllers, lógica de negócio ou testes existentes (só mocks)

## Tech Stack

NestJS, Prisma ORM, PostgreSQL, TypeScript. Branch em worktree isolado.

---

## Global Constraints

- Campo `fullName` no modelo `User` — nunca `name`
- Shell: PowerShell (Windows). Worktree em `.claude/worktrees/`
- Migração via `prisma migrate dev` (CI aplica via `migrate deploy`)
- Todos os novos campos com `@default(...)` — migração não-destrutiva

---

## Task 1: Completar EngagementSurvey, SurveyQuestion, SurveyResponse

**Ficheiro:** `prisma/schema.prisma`

### 1.1 — Adicionar campos ao modelo `EngagementSurvey` (~linha 3283)

Campos em falta (usados no service mas ausentes do schema):

```prisma
model EngagementSurvey {
  id                    Int              @id @default(autoincrement())
  title                 String
  description           String?          @db.Text
  type                  String           @default("PULSE")           // ← novo
  status                String           @default("ACTIVE")
  anonymous             Boolean          @default(false)             // ← novo
  minResponsesForResults Int             @default(3)                 // ← novo
  startDate             DateTime?                                    // ← novo
  endDate               DateTime?
  createdAt             DateTime         @default(now())
  updatedAt             DateTime         @updatedAt
  questions             SurveyQuestion[]
  responses             SurveyResponse[]
  engagementActions     EngagementAction[]                           // ← relação inversa (Task 3)

  @@index([status])
  @@index([type])                                                    // ← novo
}
```

### 1.2 — Adicionar campos ao modelo `SurveyQuestion` (~linha 3297)

```prisma
model SurveyQuestion {
  id       Int              @id @default(autoincrement())
  surveyId Int
  text     String           @db.Text
  type     String
  order    Int
  required Boolean          @default(true)     // ← novo
  options  String[]                             // ← novo (array nativo Postgres)
  scaleMax Int              @default(5)         // ← novo
  survey   EngagementSurvey @relation(fields: [surveyId], references: [id], onDelete: Cascade)
  answers  SurveyAnswer[]

  @@index([surveyId])
}
```

### 1.3 — Adicionar campo ao modelo `SurveyResponse` (~linha 3309)

```prisma
model SurveyResponse {
  id        Int              @id @default(autoincrement())
  surveyId  Int
  userId    Int
  score     Float?
  anonymous Boolean          @default(false)   // ← novo
  createdAt DateTime         @default(now())
  survey    EngagementSurvey @relation(fields: [surveyId], references: [id], onDelete: Cascade)
  user      User             @relation(fields: [userId], references: [id], onDelete: Cascade)
  answers   SurveyAnswer[]

  @@index([surveyId])
  @@index([userId])
}
```

### 1.4 — Validar e migrar

```powershell
npx prisma validate
npx prisma migrate dev --name "add-survey-missing-fields"
npx prisma generate
```

Expected: schema válido, migração criada com `ALTER TABLE` não-destrutivos.

### 1.5 — Commit

```powershell
git add prisma/schema.prisma prisma/migrations
git commit -m "feat(prisma): completar campos em falta em EngagementSurvey, SurveyQuestion, SurveyResponse"
```

---

## Task 2: Adicionar relações inversas no User + criar OneOnOneMeeting

**Ficheiro:** `prisma/schema.prisma`

### 2.1 — Relações inversas no modelo `User`

Localizar a secção `// ─── Engagement (Grupo A)` (~linha 840) e adicionar após as relações
já existentes do Grupo A:

```prisma
  // ─── Engagement (Grupo B+C) ───────────────────────────────────
  oneOnOneMeetingsHosted       OneOnOneMeeting[]  @relation("OneOnOneMeetingHost")
  oneOnOneMeetingsParticipated OneOnOneMeeting[]  @relation("OneOnOneMeetingParticipant")
  engagementActionsAssigned    EngagementAction[] @relation("EngagementActionAssignee")
  engagementActionsCreated     EngagementAction[] @relation("EngagementActionCreator")
```

### 2.2 — Novo modelo `OneOnOneMeeting` (adicionar no fim do ficheiro, após Recognition)

```prisma
// ══════════════════════════════════════════════════════════════════
// ENGAGEMENT — GRUPO B+C
// ══════════════════════════════════════════════════════════════════

model OneOnOneMeeting {
  id              Int       @id @default(autoincrement())
  hostId          Int
  participantId   Int
  scheduledAt     DateTime
  durationMinutes Int       @default(30)
  agenda          String?   @db.Text
  status          String    @default("SCHEDULED")
  recurring       Boolean   @default(false)
  frequency       String?
  meetingUrl      String?
  minutes         String?   @db.Text
  actionItems     String?   @db.Text
  nextMeetingDate DateTime?
  completedAt     DateTime?
  createdAt       DateTime  @default(now())
  host            User      @relation("OneOnOneMeetingHost",        fields: [hostId],        references: [id], onDelete: Cascade)
  participant     User      @relation("OneOnOneMeetingParticipant", fields: [participantId], references: [id], onDelete: Cascade)

  @@index([hostId])
  @@index([participantId])
  @@index([scheduledAt])
  @@index([status])
}
```

### 2.3 — Validar e migrar

```powershell
npx prisma validate
npx prisma migrate dev --name "add-one-on-one-meeting"
npx prisma generate
```

### 2.4 — Commit

```powershell
git add prisma/schema.prisma prisma/migrations
git commit -m "feat(prisma): adicionar OneOnOneMeeting (Grupo B+C)"
```

---

## Task 3: Criar EngagementAction

**Ficheiro:** `prisma/schema.prisma`

### 3.1 — Novo modelo `EngagementAction` (adicionar após OneOnOneMeeting)

```prisma
model EngagementAction {
  id           Int               @id @default(autoincrement())
  title        String
  description  String?           @db.Text
  assigneeId   Int?
  createdById  Int
  dueDate      DateTime?
  surveyId     Int?
  departmentId Int?
  priority     String            @default("MEDIUM")
  status       String            @default("OPEN")
  progress     Int               @default(0)
  createdAt    DateTime          @default(now())
  updatedAt    DateTime          @updatedAt
  assignee     User?             @relation("EngagementActionAssignee", fields: [assigneeId],   references: [id], onDelete: SetNull)
  createdBy    User              @relation("EngagementActionCreator",  fields: [createdById],  references: [id], onDelete: Cascade)
  survey       EngagementSurvey? @relation(fields: [surveyId],        references: [id],        onDelete: SetNull)
  department   Department?       @relation(fields: [departmentId],     references: [id],        onDelete: SetNull)

  @@index([status])
  @@index([assigneeId])
  @@index([createdById])
  @@index([surveyId])
}
```

> **Nota:** o modelo `Department` já existe no schema. A relação inversa `engagementActions`
> deve ser adicionada ao modelo `Department` também (campo `engagementActions EngagementAction[]`).

### 3.2 — Validar e migrar

```powershell
npx prisma validate
npx prisma migrate dev --name "add-engagement-action"
npx prisma generate
```

### 3.3 — Commit

```powershell
git add prisma/schema.prisma prisma/migrations
git commit -m "feat(prisma): adicionar EngagementAction (Grupo B+C)"
```

---

## Task 4: Substituir `(this.prisma as any).engagementSurvey` e `.surveyResponse`

**Ficheiro:** `src/engagement/engagement.service.ts`

**Consumes:** `this.prisma.engagementSurvey` e `this.prisma.surveyResponse` — disponíveis após Task 1.

Substituições (9 ocorrências):

| Linha | Método | Mudança |
|---|---|---|
| 103 | `createSurvey` | `.engagementSurvey.create(` |
| 168 | `submitSurvey` | `.engagementSurvey.findUnique(` |
| 186 | `submitSurvey` | `.surveyResponse.create(` — remover `anonymous` de `SurveyResponse` se não existir; já existe após Task 1 |
| 227 | `getSurveyResults` | `.engagementSurvey.findUnique(` |
| 329 | `getTemplates` | `.engagementSurvey.findMany(` |
| 345 | `getENPSScore` | `.engagementSurvey.findFirst(` |
| 363 | `getENPSScore` | `.engagementSurvey.findFirst(` |
| 862 | `getEngagementIndex` | `.engagementSurvey.findMany(` |
| 1144 | `getMyEngagementSummary` | `.engagementSurvey.findMany(` |

Para cada substituição:
- Remover `(this.prisma as any)` → `this.prisma`
- Remover `?.` (optional chain) e `.catch(...)` onde existam
- Manter a lógica de negócio intacta

Verificar após as substituições:

```powershell
npx tsc --noEmit 2>&1 | Select-String "engagementSurvey|surveyResponse" | Select-Object -First 10
```

Expected: zero linhas com esses modelos nos erros.

### Commit

```powershell
git add src/engagement/engagement.service.ts
git commit -m "refactor(engagement): substituir as any engagementSurvey e surveyResponse por Prisma tipado"
```

---

## Task 5: Substituir `(this.prisma as any).oneOnOneMeeting`

**Ficheiro:** `src/engagement/engagement.service.ts`

**Consumes:** `this.prisma.oneOnOneMeeting` — disponível após Task 2.

Substituições (4 ocorrências):

| Linha | Método | Mudança |
|---|---|---|
| 727 | `createOneOnOne` | `.oneOnOneMeeting.create(` — remover `.catch(() => null)` e fallback `?? { message: ... }` |
| 758 | `getOneOnOnes` | `.oneOnOneMeeting.findMany(` — remover `?.` e `.catch(() => [] as any[])` |
| 775 | `updateOneOnOne` | `.oneOnOneMeeting.update(` — remover `?.` e `.catch(() => ({ message: 'Actualizado' }))` |
| 1044 | `getManagerInsights` | `.oneOnOneMeeting.count(` — remover `?.` e `.catch(() => 0)` |

```powershell
npx tsc --noEmit 2>&1 | Select-String "oneOnOneMeeting" | Select-Object -First 10
```

Expected: zero erros com `oneOnOneMeeting`.

### Commit

```powershell
git add src/engagement/engagement.service.ts
git commit -m "refactor(engagement): substituir as any oneOnOneMeeting por Prisma tipado"
```

---

## Task 6: Substituir `(this.prisma as any).engagementAction`

**Ficheiro:** `src/engagement/engagement.service.ts`

**Consumes:** `this.prisma.engagementAction` — disponível após Task 3.

Substituições (5 ocorrências):

| Linha | Método | Mudança |
|---|---|---|
| 788 | `createActionPlan` | `.engagementAction.create(` — remover `.catch(() => null)` e fallback `?? { message: ... }` |
| 830 | `getActionPlans` | `.engagementAction.findMany(` — remover `?.` e `.catch(() => [] as any[])` |
| 843 | `getActionPlans` | `.engagementAction.count(` — remover `?.` e `.catch(() => 0)` |
| 851 | `updateActionPlan` | `.engagementAction.update(` — remover `?.` e `.catch(() => ({ ... }))` |
| 945 | `getDashboard` | `.engagementAction.count(` — remover `?.` e `.catch(() => 0)` |

```powershell
npx tsc --noEmit 2>&1 | Select-String "engagement.service" | Select-Object -First 20
```

Expected: zero erros em `engagement.service.ts`.

### Commit

```powershell
git add src/engagement/engagement.service.ts
git commit -m "refactor(engagement): substituir as any engagementAction por Prisma tipado"
```

---

## Task 7: Corrigir mocks nos spec files + PR

**Ficheiros:** `src/engagement/engagement.service.spec.ts`,
`src/engagement/engagement.service.progress.spec.ts`,
`src/engagement/engagement.service.additional.spec.ts`

### 7.1 — Verificar quais spec files têm `oneOnOneMeeting` e `engagementAction` nos mocks

```powershell
Select-String -Path "src\engagement\*.spec.ts" -Pattern "oneOnOneMeeting|engagementAction"
```

Para cada spec que **não** tenha estes modelos no mock, adicionar:
- `oneOnOneMeeting: crud()` (ou equivalente ao padrão do ficheiro)
- `engagementAction: crud()`

### 7.2 — Verificar zero `(this.prisma as any).engagementSurvey|surveyResponse|oneOnOneMeeting|engagementAction`

```powershell
Select-String -Path "src\engagement\engagement.service.ts" -Pattern "\(this\.prisma as any\)\.(engagementSurvey|surveyResponse|oneOnOneMeeting|engagementAction)"
```

Expected: sem resultados.

### 7.3 — Criar PR

```powershell
git push -u origin HEAD
gh pr create `
  --title "feat(prisma): Grupo B+C — EngagementSurvey completo, OneOnOneMeeting, EngagementAction + remover as any" `
  --body "..."
gh pr merge --auto --merge
```

---

## Self-Review

| Requisito | Coberto |
|---|---|
| `EngagementSurvey` com `startDate`, `type`, `anonymous`, `minResponsesForResults` | ✅ Task 1 |
| `SurveyQuestion` com `required`, `options String[]`, `scaleMax` | ✅ Task 1 |
| `SurveyResponse` com `anonymous` | ✅ Task 1 |
| `OneOnOneMeeting` novo com `hostId`/`participantId`, `recurring`, `frequency` | ✅ Task 2 |
| `EngagementAction` novo com todos os campos do service | ✅ Task 3 |
| Relações inversas em `User` (4 novas) | ✅ Task 2 |
| Relação inversa em `Department` | ✅ Task 3 |
| Relação inversa em `EngagementSurvey` (`engagementActions`) | ✅ Task 3 |
| 9 casts `engagementSurvey`/`surveyResponse` removidos | ✅ Task 4 |
| 4 casts `oneOnOneMeeting` removidos | ✅ Task 5 |
| 5 casts `engagementAction` removidos | ✅ Task 6 |
| Mocks dos spec files actualizados | ✅ Task 7 |
| Zero alterações a DTOs, controllers, lógica de negócio | ✅ escopo explícito |
| Todos os defaults não-destrutivos | ✅ verificado por campo |

**Fora de âmbito:** outros `(this.prisma as any)` no mesmo ficheiro (e.g. `enpsResponse`, `surveyAnswer`) — PR separada.
