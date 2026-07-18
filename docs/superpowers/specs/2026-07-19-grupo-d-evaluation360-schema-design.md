# Spec — Grupo D: evaluation360 Schema Completion

> Data: 2026-07-19
> Âmbito: `prisma/schema.prisma` + `src/evaluation360/evaluation360.service.ts` + `src/evaluation360/evaluation360.events.ts`

## Contexto

O `evaluation360.service.ts` tem **62** chamadas `(this.prisma as any)` e o `evaluation360.events.ts` tem **7**, distribuídas por 12 modelos. O padrão é idêntico ao Grupo A e B+C: o código foi escrito antecipando modelos que ainda não existem no schema.

## Complicações vs. Grupos Anteriores

Três modelos do Grupo D têm **conflitos de nome** com modelos existentes no schema:

| Nome usado no service | Modelo existente | Conflito |
|---|---|---|
| `evaluationCycle` | `EvaluationCycle` (linha 6915) — para avaliações de cursos | Shape completamente diferente |
| `evaluationQuestion` | `EvaluationQuestion` (linha 4971) — perguntas de testes de cursos | Shape completamente diferente |
| `continuousFeedback` | `ContinuousFeedback` (linha 2176) — feedback de performance | Nomes de campos diferentes |

**Solução:** criar modelos com nomes alternativos e renomear as referências no service:
- `evaluationCycle` → `eval360Cycle` (modelo: `Eval360Cycle`)
- `evaluationQuestion` → `eval360Question` (modelo: `Eval360Question`)
- `continuousFeedback` → `eval360Feedback` (modelo: `Eval360Feedback`)

## Objectivo

Após esta PR:
- Zero `(this.prisma as any)` nos ficheiros `evaluation360.service.ts` e `evaluation360.events.ts`
- 9 novos modelos Prisma + extensão do modelo `Competency`
- 3 referências de modelo renomeadas no service
- Zero alterações a DTOs, controllers, lógica de negócio

## Global Constraints

- Shell: PowerShell (Windows). Worktree em `.claude/worktrees/`
- Todos os novos campos com `@default(...)` — migração não-destrutiva
- IDs nos novos modelos: `String @id @default(cuid())` (o módulo 360 usa String IDs)
- Relações a `User`: não usar `@relation` FK (os IDs de user nos DTOs são `string`; User.id é `Int`) — guardar como `String` simples
- Excepção: `Competency.id` é `Int` — as FK para `Competency` são `Int`
- `User.findUnique/findMany` nas linhas com cast de `user`: substituir por `this.prisma.user` com `+id` (unary plus converte string para number)
- Commit convention: `feat(prisma):` para schema, `refactor(evaluation360):` para service

---

## Modelos a criar/modificar

### Competency (existente — linha 1959) — adicionar campos

| Campo | Tipo | Default |
|---|---|---|
| `type` | `String` | `"BEHAVIORAL"` |
| `scaleMin` | `Int` | `1` |
| `scaleMax` | `Int` | `5` |
| `isGlobal` | `Boolean` | `true` |
| `tenantId` | `String?` | — |
| `isActive` | `Boolean` | `true` |
| `indicators` | `CompetencyIndicator[]` | relação inversa |
| `eval360CycleCompetencies` | `Eval360CycleCompetency[]` | relação inversa |
| `eval360Questions` | `Eval360Question[] @relation("Eval360QuestionCompetency")` | relação inversa nomeada |

### CompetencyIndicator (novo)

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

### Eval360Cycle (novo — substitui `evaluationCycle` no service)

Campos-chave: `tenantId`, `name`, `description`, `model`, `type`, `startDate`, `endDate`, `gracePeriodDays`, `status`, `anonymityMode`, `quorumMinimum`, `weightSelf/Manager/Peer/Subordinate/External`, `cutoffPromotion/Bonus/Program`, `linkedToPdi/Bonus/Okrs`, `createdBy String`, `createdAt`, `updatedAt`. Relações: `competencies Eval360CycleCompetency[]`, `questions Eval360Question[]`, `participants CycleParticipant[]`, `assignments EvaluatorAssignment[]`, `responses EvaluationResponse[]`, `results EvaluationResult[]`.

### Eval360CycleCompetency (novo — junction)

Campos: `cycleId String`, `competencyId Int`, `weight Float @default(1)`, `isRequired Boolean @default(true)`, `order Int @default(0)`. Unique: `[cycleId, competencyId]`.

### EvaluatorAssignment (novo)

Campos: `cycleId`, `evaluateeId`, `evaluatorId`, `role`, `status @default("PENDING")`, `suggestedBy?`, `approvedBy?`, `approvedAt?`, `invitedAt?`, `completedAt?`. Relações: `cycle Eval360Cycle`, `responses EvaluationResponse[]`.

### CycleParticipant (novo)

Campos: `cycleId`, `userId String`, `status @default("PENDING")`, `consentGiven Boolean?`, `consentAt?`, `finalScore Float?`, `completedAt?`, `isEligiblePromotion Boolean?`, `isEligibleBonus Boolean?`, `scoreByEvaluatorType String?`. Unique: `[cycleId, userId]`. Relação: `cycle Eval360Cycle`.

### Eval360Question (novo — substitui `evaluationQuestion` no service)

Campos: `cycleId`, `competencyId Int?`, `text String @db.Text`, `type String`, `isRequired Boolean @default(true)`, `order Int @default(0)`. Relações: `cycle Eval360Cycle`, `competency Competency? @relation("Eval360QuestionCompetency")`, `answers EvaluationAnswer[]`.

### EvaluationResponse (novo)

Campos: `cycleId`, `assignmentId String @unique`, `evaluateeId`, `evaluatorId`, `evaluatorRole`, `status @default("DRAFT")`, `startedAt`, `submittedAt?`, `isAnonymized Boolean @default(false)`, `sentimentScore Float?`. Relações: `cycle Eval360Cycle`, `assignment EvaluatorAssignment`, `answers EvaluationAnswer[]`.

### EvaluationAnswer (novo)

Campos: `responseId`, `questionId`, `numericValue Float?`, `textValue String? @db.Text`, `choiceValue String?`. Unique: `[responseId, questionId]`. Relações: `response EvaluationResponse`, `question Eval360Question`.

### EvaluationResult (novo)

Campos: `cycleId`, `participantId String`, `overallScore Float?`, `weightedScore Float?`, `selfScore/managerScore/peerScore/subordinateScore/externalScore Float?`, `scoresByCompetency String? @db.Text`, `gaps String? @db.Text`, `strengths String? @db.Text`, `isEligiblePromotion/Bonus Boolean @default(false)`, `bonusMultiplier Float?`, `calculatedAt DateTime @default(now())`. Unique: `[cycleId, participantId]`. Relação: `cycle Eval360Cycle`.

### Eval360Feedback (novo — substitui `continuousFeedback` no service)

Campos: `fromUserId String`, `toUserId String`, `type String`, `message String @db.Text`, `isPrivate Boolean @default(false)`, `createdAt`.

### PulseSurvey (novo)

Campos: `title String`, `description String? @db.Text`, `closesAt DateTime`, `createdBy String`, `sentAt DateTime @default(now())`. Relação: `responses PulseSurveyResponse[]`.

### PulseSurveyResponse (novo)

Campos: `surveyId`, `userId String`, `answersJson Json`. Unique: `[surveyId, userId]`. Relação: `survey PulseSurvey`.

---

## Casts a remover (total 69)

| Modelo (nome no service) | Service | Events | Acção |
|---|---|---|---|
| `competency` | 4 | 0 | remover cast |
| `evaluationCycle` → `eval360Cycle` | 12 | 0 | renomear + remover cast |
| `evaluatorAssignment` | 12 | 0 | remover cast |
| `cycleParticipant` | 7 | 1 | remover cast |
| `evaluationQuestion` → `eval360Question` | 5 | 0 | renomear + remover cast |
| `evaluationResponse` | 3 | 2 | remover cast |
| `evaluationAnswer` | 1 | 0 | remover cast |
| `continuousFeedback` → `eval360Feedback` | 3 | 1 | renomear + remover cast |
| `evaluationResult` | 9 | 0 | remover cast |
| `pulseSurvey` | 1 | 0 | remover cast |
| `pulseSurveyResponse` | 1 | 0 | remover cast |
| `user` | 4 | 4 | `this.prisma.user` + `+id` |

---

## Self-Review

| Requisito | Coberto |
|---|---|
| `Competency` com 6 novos campos + 3 relações inversas | ✅ Task 1 |
| `CompetencyIndicator` novo | ✅ Task 1 |
| `Eval360Cycle` novo (substitui `evaluationCycle`) | ✅ Task 2 |
| `Eval360CycleCompetency` junction | ✅ Task 2 |
| `EvaluatorAssignment` novo | ✅ Task 3 |
| `CycleParticipant` novo | ✅ Task 3 |
| `Eval360Question` novo (substitui `evaluationQuestion`) | ✅ Task 4 |
| `EvaluationResponse` novo | ✅ Task 5 |
| `EvaluationAnswer` novo | ✅ Task 5 |
| `EvaluationResult` novo | ✅ Task 6 |
| `Eval360Feedback` novo (substitui `continuousFeedback`) | ✅ Task 6 |
| `PulseSurvey` novo | ✅ Task 6 |
| `PulseSurveyResponse` novo | ✅ Task 6 |
| 62 casts removidos no service | ✅ Tasks 7 |
| 7 casts removidos no events | ✅ Task 8 |
| Mocks dos spec files actualizados | ✅ Task 9 |
| Zero DTOs/controllers alterados | ✅ escopo explícito |
