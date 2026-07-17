# Grupo A — Feedback, Recognition, MoodCheckin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Criar os modelos Prisma `Feedback`, `Recognition` e `MoodCheckin` no schema e substituir todas as chamadas `(this.prisma as any)` correspondentes em `engagement.service.ts` por chamadas Prisma tipadas.

**Architecture:** Duas alterações independentes em sequência: (1) schema + migração, (2) substituição dos casts no service. O service já está escrito correctamente em termos de lógica — só os tipos mudam. Após a migração, os fallbacks `.catch(() => ...)` que existiam para quando as tabelas não existiam tornam-se dead code e são removidos.

**Tech Stack:** NestJS, Prisma ORM, PostgreSQL, TypeScript.

## Global Constraints

- Campo `fullName` no modelo `User` — nunca `name`
- `Enrollment` compound unique: `courseId_userId`
- `NotificationLog.metadata` é sempre `JSON.stringify(obj)` ao escrever
- `AuditLog`: campo `entity`, nunca `entityType`
- Porta da app: `4000`; prefixo global de rotas: nenhum
- Shell: PowerShell (Windows). Comandos git/npx correm no directório `C:\Users\Placido Costa\innova`

---

### Task 1: Adicionar os 3 modelos ao schema.prisma + relações

**Files:**
- Modify: `prisma/schema.prisma` (User model ~linha 843, Badge model ~linha 3344, fim do ficheiro)

**Interfaces:**
- Produz: modelos `Feedback`, `Recognition`, `MoodCheckin` no Prisma client tipado — usados na Task 2

- [ ] **Step 1: Adicionar relações inversas no modelo `User` (linha 843, antes dos `@@index`)**

Localizar a secção `// ─── Auth Tokens ──────────────────────────────────────────────` (~linha 840) e inserir imediatamente antes dela:

```prisma
  // ─── Engagement (Grupo A) ─────────────────────────────────────
  moodCheckins         MoodCheckin[]
  feedbackGiven        Feedback[]     @relation("FeedbackFrom")
  feedbackReceived     Feedback[]     @relation("FeedbackTo")
  feedbackReplied      Feedback[]     @relation("FeedbackReplier")
  recognitionsGiven    Recognition[]  @relation("RecognitionFrom")
  recognitionsReceived Recognition[]  @relation("RecognitionTo")

```

- [ ] **Step 2: Adicionar relação inversa no modelo `Badge` (linha 3344)**

Localizar o modelo `Badge` (~linha 3340) e adicionar `recognitions Recognition[]` a seguir a `awards BadgeAward[]`:

```prisma
model Badge {
  id          Int           @id @default(autoincrement())
  name        String        @unique
  description String?       @db.Text
  awards      BadgeAward[]
  recognitions Recognition[]
}
```

- [ ] **Step 3: Adicionar os 3 novos modelos no fim do ficheiro schema.prisma**

Acrescentar no final do ficheiro (após o último modelo existente):

```prisma
// ══════════════════════════════════════════════════════════════════
// ENGAGEMENT — GRUPO A
// ══════════════════════════════════════════════════════════════════

model MoodCheckin {
  id        Int      @id @default(autoincrement())
  userId    Int
  mood      Int
  note      String?
  tags      String[]
  date      DateTime @db.Date
  createdAt DateTime @default(now())
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([userId, date])
  @@index([userId])
  @@index([createdAt])
}

model Feedback {
  id          Int       @id @default(autoincrement())
  fromUserId  Int?
  toUserId    Int?
  type        String
  message     String    @db.Text
  anonymous   Boolean   @default(false)
  projectRef  String?
  status      String    @default("OPEN")
  reply       String?   @db.Text
  repliedAt   DateTime?
  repliedById Int?
  createdAt   DateTime  @default(now())
  from        User?     @relation("FeedbackFrom",    fields: [fromUserId],  references: [id], onDelete: SetNull)
  to          User?     @relation("FeedbackTo",      fields: [toUserId],    references: [id], onDelete: SetNull)
  repliedBy   User?     @relation("FeedbackReplier", fields: [repliedById], references: [id], onDelete: SetNull)

  @@index([toUserId])
  @@index([fromUserId])
  @@index([status])
  @@index([createdAt])
}

model Recognition {
  id         Int      @id @default(autoincrement())
  fromUserId Int
  toUserId   Int
  type       String
  message    String
  public     Boolean  @default(true)
  value      String?
  badgeId    Int?
  createdAt  DateTime @default(now())
  from       User     @relation("RecognitionFrom", fields: [fromUserId], references: [id], onDelete: Cascade)
  to         User     @relation("RecognitionTo",   fields: [toUserId],   references: [id], onDelete: Cascade)
  badge      Badge?   @relation(fields: [badgeId], references: [id], onDelete: SetNull)

  @@index([toUserId])
  @@index([fromUserId])
  @@index([public])
  @@index([createdAt])
}
```

- [ ] **Step 4: Validar o schema**

```powershell
npx prisma validate
```

Expected: `The schema at prisma/schema.prisma is valid`

- [ ] **Step 5: Correr a migração**

```powershell
npx prisma migrate dev --name "add-feedback-recognition-moodcheckin"
```

Expected: `Your database is now in sync with your schema.` + 3 novas tabelas criadas (`mood_checkin`, `feedback`, `recognition`).

- [ ] **Step 6: Confirmar que o Prisma client gerou os novos tipos**

```powershell
npx prisma generate
```

Expected: `Generated Prisma Client` sem erros. Após este passo, `this.prisma.moodCheckin`, `this.prisma.feedback` e `this.prisma.recognition` ficam disponíveis com tipos.

- [ ] **Step 7: Commit**

```powershell
git add prisma/schema.prisma prisma/migrations
git commit -m "feat(prisma): adicionar modelos Feedback, Recognition e MoodCheckin (Grupo A)"
```

---

### Task 2: Substituir `(this.prisma as any).moodCheckin` no engagement service

**Files:**
- Modify: `src/engagement/engagement.service.ts`

**Interfaces:**
- Consumes: `this.prisma.moodCheckin` (tipado) — disponível após Task 1
- Produz: métodos `submitMood`, `getMoodTrend`, `getTeamMoodOverview`, `detectMoodAlert`, `getMyEngagementSummary` sem `as any`

- [ ] **Step 1: Substituir `submitMood` (linhas 397–425)**

Substituir o método completo por:

```typescript
async submitMood(userId: number, dto: SubmitMoodDto) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const existing = await this.prisma.moodCheckin.findFirst({
    where: { userId, date: today },
  });

  if (existing) return { message: 'Já fizeste o teu check-in hoje', mood: existing.mood };

  const checkin = await this.prisma.moodCheckin.create({
    data: { userId, mood: dto.mood, note: dto.note, tags: dto.tags ?? [], date: today },
  });

  // Detect sudden mood drop — alert manager if mood ≤ 2 for 3 consecutive days
  await this.detectMoodAlert(userId, dto.mood);

  return { message: `Check-in registado! Estado: ${dto.mood}/5`, checkin };
}
```

- [ ] **Step 2: Substituir `getMoodTrend` (linhas 427–444)**

Substituir:
```typescript
// ANTES
const checkins = await (this.prisma as any).moodCheckin
  ?.findMany({
    where: { userId, createdAt: { gte: from } },
    orderBy: { createdAt: 'asc' },
    select: { mood: true, note: true, createdAt: true, tags: true },
  })
  .catch(() => [] as any[]);
```
Por:
```typescript
// DEPOIS
const checkins = await this.prisma.moodCheckin.findMany({
  where: { userId, createdAt: { gte: from } },
  orderBy: { createdAt: 'asc' },
  select: { mood: true, note: true, createdAt: true, tags: true },
});
```
E substituir o cálculo de `avg` (linhas 439–441):
```typescript
// ANTES
const avg = checkins.length
  ? +(checkins.reduce((s: number, c: any) => s + c.mood, 0) / checkins.length).toFixed(1)
  : null;
// DEPOIS
const avg = checkins.length
  ? +(checkins.reduce((s, c) => s + c.mood, 0) / checkins.length).toFixed(1)
  : null;
```

- [ ] **Step 3: Substituir `getTeamMoodOverview` — chamada moodCheckin (linhas 457–463)**

Substituir:
```typescript
// ANTES
const checkins = await (this.prisma as any).moodCheckin
  ?.findMany({
    where: { userId: u.id, createdAt: { gte: from } },
    select: { mood: true, createdAt: true },
    orderBy: { createdAt: 'desc' },
  })
  .catch(() => [] as any[]);
```
Por:
```typescript
// DEPOIS
const checkins = await this.prisma.moodCheckin.findMany({
  where: { userId: u.id, createdAt: { gte: from } },
  select: { mood: true, createdAt: true },
  orderBy: { createdAt: 'desc' },
});
```
E no cálculo do `avg` a seguir, remover as anotações `as any`:
```typescript
// ANTES
const avg = checkins.length
  ? +(checkins.reduce((s: number, c: any) => s + c.mood, 0) / checkins.length).toFixed(1)
  : null;
// DEPOIS
const avg = checkins.length
  ? +(checkins.reduce((s, c) => s + c.mood, 0) / checkins.length).toFixed(1)
  : null;
```

- [ ] **Step 4: Substituir `detectMoodAlert` (linhas 497–502)**

Substituir:
```typescript
// ANTES
const recent = await (this.prisma as any).moodCheckin
  ?.findMany({
    where: { userId, createdAt: { gte: from } },
    select: { mood: true },
  })
  .catch(() => [] as any[]);

if (recent.length >= 2 && recent.every((c: any) => c.mood <= 2)) {
  const user = await (this.prisma as any).user.findUnique({
```
Por:
```typescript
// DEPOIS
const recent = await this.prisma.moodCheckin.findMany({
  where: { userId, createdAt: { gte: from } },
  select: { mood: true },
});

if (recent.length >= 2 && recent.every(c => c.mood <= 2)) {
  const user = await this.prisma.user.findUnique({
```

- [ ] **Step 5: Substituir `getEngagementHeatmap` — chamada moodCheckin (linhas 1043–1051)**

Substituir:
```typescript
// ANTES
const checkins = await (this.prisma as any).moodCheckin
  ?.findMany({
    where: {
      userId: { in: userIds },
      createdAt: { gte: new Date(Date.now() - 7 * 86400000) },
    },
    select: { mood: true },
  })
  .catch(() => [] as any[]);
const avgMood = (checkins as any[]).length
  ? +(
      (checkins as any[]).reduce((s: number, c: any) => s + c.mood, 0) /
      (checkins as any[]).length
    ).toFixed(2)
  : null;
return { department: dept.name, value: avgMood, count: (checkins as any[]).length };
```
Por:
```typescript
// DEPOIS
const checkins = await this.prisma.moodCheckin.findMany({
  where: {
    userId: { in: userIds },
    createdAt: { gte: new Date(Date.now() - 7 * 86400000) },
  },
  select: { mood: true },
});
const avgMood = checkins.length
  ? +(checkins.reduce((s, c) => s + c.mood, 0) / checkins.length).toFixed(2)
  : null;
return { department: dept.name, value: avgMood, count: checkins.length };
```

- [ ] **Step 6: Substituir `getManagerInsights` — chamada moodCheckin (linhas 1080–1088)**

Substituir:
```typescript
// ANTES
(this.prisma as any).moodCheckin
  ?.findMany({
    where: {
      userId: { in: userIds },
      createdAt: { gte: new Date(Date.now() - 7 * 86400000) },
    },
    select: { userId: true, mood: true },
  })
  .catch(() => [] as any[]),
```
Por:
```typescript
// DEPOIS
this.prisma.moodCheckin.findMany({
  where: {
    userId: { in: userIds },
    createdAt: { gte: new Date(Date.now() - 7 * 86400000) },
  },
  select: { userId: true, mood: true },
}),
```

- [ ] **Step 7: Substituir `getMyEngagementSummary` — chamada moodCheckin (linhas 1207–1213)**

Substituir:
```typescript
// ANTES
(this.prisma as any).moodCheckin
  ?.findFirst({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    select: { mood: true, createdAt: true },
  })
  .catch(() => null),
```
Por:
```typescript
// DEPOIS
this.prisma.moodCheckin.findFirst({
  where: { userId },
  orderBy: { createdAt: 'desc' },
  select: { mood: true, createdAt: true },
}),
```

- [ ] **Step 8: Verificar compilação parcial**

```powershell
npx tsc --noEmit 2>&1 | Select-String "moodCheckin" | Select-Object -First 10
```

Expected: sem linhas com `moodCheckin` nos erros.

- [ ] **Step 9: Commit**

```powershell
git add src/engagement/engagement.service.ts
git commit -m "refactor(engagement): substituir as any moodCheckin por Prisma tipado"
```

---

### Task 3: Substituir `(this.prisma as any).feedback` no engagement service

**Files:**
- Modify: `src/engagement/engagement.service.ts`

**Interfaces:**
- Consumes: `this.prisma.feedback` (tipado) — disponível após Task 1
- Produz: métodos `createFeedback`, `getFeedback`, `replyToFeedback` sem `as any`

- [ ] **Step 1: Substituir `createFeedback` (linhas 528–568)**

Substituir o método completo por:

```typescript
async createFeedback(fromUserId: number, dto: CreateFeedbackDto) {
  const fb = await this.prisma.feedback.create({
    data: {
      fromUserId: dto.anonymous ? null : fromUserId,
      toUserId: dto.toUserId,
      type: dto.type,
      message: dto.message,
      anonymous: dto.anonymous ?? false,
      projectRef: dto.projectRef,
      status: 'OPEN',
    },
  });

  // Notify recipient
  if (dto.toUserId && !dto.anonymous) {
    await this.prisma.notificationLog
      .create({
        data: {
          userId: dto.toUserId,
          type: 'FEEDBACK_RECEIVED',
          message: `Recebeste novo feedback de um colega`,
          metadata: JSON.stringify({}),
        },
      })
      .catch(() => {});
  }

  return fb;
}
```

- [ ] **Step 2: Substituir `getFeedback` (linhas 571–600)**

Substituir:
```typescript
// ANTES
const data = await (this.prisma as any).feedback
  ?.findMany({
    where,
    skip,
    take: limit,
    include: {
      from: { select: { id: true, fullName: true, avatarUrl: true } },
      to: { select: { id: true, fullName: true, avatarUrl: true } },
    },
    orderBy: { createdAt: 'desc' },
  })
  .catch(() => [] as any[]);

const total = await (this.prisma as any).feedback?.count({ where }).catch(() => 0);

// Mask anonymous authors
const safe = (data as any[]).map((f: any) => ({
  ...f,
  from: f.anonymous ? { id: null, fullName: 'Anónimo', avatarUrl: null } : f.from,
}));
```
Por:
```typescript
// DEPOIS
const data = await this.prisma.feedback.findMany({
  where,
  skip,
  take: limit,
  include: {
    from: { select: { id: true, fullName: true, avatarUrl: true } },
    to: { select: { id: true, fullName: true, avatarUrl: true } },
  },
  orderBy: { createdAt: 'desc' },
});

const total = await this.prisma.feedback.count({ where });

// Mask anonymous authors
const safe = data.map(f => ({
  ...f,
  from: f.anonymous ? { id: null, fullName: 'Anónimo', avatarUrl: null } : f.from,
}));
```

- [ ] **Step 3: Substituir `replyToFeedback` (linhas 603–609)**

Substituir:
```typescript
// ANTES
return (this.prisma as any).feedback
  ?.update({
    where: { id: feedbackId },
    data: { reply: dto.message, repliedAt: new Date(), repliedById: userId, status: 'REPLIED' },
  })
  .catch(() => ({ message: 'Resposta registada' }));
```
Por:
```typescript
// DEPOIS
return this.prisma.feedback.update({
  where: { id: feedbackId },
  data: { reply: dto.message, repliedAt: new Date(), repliedById: userId, status: 'REPLIED' },
});
```

- [ ] **Step 4: Substituir chamadas feedback no `getDashboard` (linhas 973–974)**

Substituir:
```typescript
// ANTES
(this.prisma as any).recognition?.count().catch(() => 0),
(this.prisma as any).feedback?.count().catch(() => 0),
```
Por:
```typescript
// DEPOIS
this.prisma.recognition.count(),
this.prisma.feedback.count(),
```
(Nota: a linha `recognition` aqui é antecipada — será confirmada na Task 4, mas ambas estão no mesmo `Promise.all` e devem ser substituídas juntas.)

- [ ] **Step 5: Verificar compilação parcial**

```powershell
npx tsc --noEmit 2>&1 | Select-String "feedback" | Select-Object -First 10
```

Expected: sem linhas com `feedback` nos erros de tipo (pode haver outros erros de `recognition`/`moodCheckin` ainda não resolvidos — ignorar por agora).

- [ ] **Step 6: Commit**

```powershell
git add src/engagement/engagement.service.ts
git commit -m "refactor(engagement): substituir as any feedback por Prisma tipado"
```

---

### Task 4: Substituir `(this.prisma as any).recognition` no engagement service

**Files:**
- Modify: `src/engagement/engagement.service.ts`

**Interfaces:**
- Consumes: `this.prisma.recognition` (tipado) — disponível após Task 1
- Produz: métodos `giveRecognition`, `getRecognitionFeed`, `getLeaderboard`, `getDashboard`, `getManagerInsights`, `getMyEngagementSummary` sem `as any`

- [ ] **Step 1: Substituir `giveRecognition` — criação do recognition (linhas 626–638)**

Substituir:
```typescript
// ANTES
const recognition = await (this.prisma as any).recognition
  ?.create({
    data: {
      fromUserId,
      toUserId: dto.toUserId,
      type: dto.type,
      message: dto.message,
      public: dto.public ?? true,
      value: dto.value,
      badgeId: dto.badgeId,
    },
  })
  .catch(() => null);
```
Por:
```typescript
// DEPOIS
const recognition = await this.prisma.recognition.create({
  data: {
    fromUserId,
    toUserId: dto.toUserId,
    type: dto.type,
    message: dto.message,
    public: dto.public ?? true,
    value: dto.value,
    badgeId: dto.badgeId,
  },
});
```

- [ ] **Step 2: Substituir `getRecognitionFeed` (linhas 690–712)**

Substituir:
```typescript
// ANTES
const data = await (this.prisma as any).recognition
  ?.findMany({
    where,
    skip,
    take: limit,
    include: {
      from: { select: { id: true, fullName: true, avatarUrl: true } },
      to: {
        select: {
          id: true,
          fullName: true,
          avatarUrl: true,
          department: { select: { name: true } },
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  })
  .catch(() => [] as any[]);

const total = await (this.prisma as any).recognition?.count({ where }).catch(() => 0);
```
Por:
```typescript
// DEPOIS
const data = await this.prisma.recognition.findMany({
  where,
  skip,
  take: limit,
  include: {
    from: { select: { id: true, fullName: true, avatarUrl: true } },
    to: {
      select: {
        id: true,
        fullName: true,
        avatarUrl: true,
        department: { select: { name: true } },
      },
    },
  },
  orderBy: { createdAt: 'desc' },
});

const total = await this.prisma.recognition.count({ where });
```

- [ ] **Step 3: Substituir `getLeaderboard` — recognition groupBy (linhas 738–746)**

Substituir:
```typescript
// ANTES
const data = await (this.prisma as any).recognition
  ?.groupBy({
    by: ['toUserId'],
    where: { ...(departmentId ? { to: { departmentId } } : {}) },
    _count: { id: true },
    orderBy: { _count: { id: 'desc' } },
    take: limit,
  })
  .catch(() => [] as any[]);

const userIds = (data as any[]).map((d: any) => d.toUserId);
```
Por:
```typescript
// DEPOIS
const data = await this.prisma.recognition.groupBy({
  by: ['toUserId'],
  where: { ...(departmentId ? { to: { departmentId } } : {}) },
  _count: { id: true },
  orderBy: { _count: { id: 'desc' } },
  take: limit,
});

const userIds = data.map(d => d.toUserId);
```

- [ ] **Step 4: Substituir `getDashboard` — recognition findMany recente (linhas 975–985)**

Substituir:
```typescript
// ANTES
(this.prisma as any).recognition
  ?.findMany({
    take: 5,
    orderBy: { createdAt: 'desc' },
    where: { public: true },
    include: {
      from: { select: { id: true, fullName: true, avatarUrl: true } },
      to: { select: { id: true, fullName: true, avatarUrl: true } },
    },
  })
  .catch(() => [] as any[]),
```
Por:
```typescript
// DEPOIS
this.prisma.recognition.findMany({
  take: 5,
  orderBy: { createdAt: 'desc' },
  where: { public: true },
  include: {
    from: { select: { id: true, fullName: true, avatarUrl: true } },
    to: { select: { id: true, fullName: true, avatarUrl: true } },
  },
}),
```

- [ ] **Step 5: Substituir `getManagerInsights` — recognition (linhas 1089–1096)**

Localizar dentro do `Promise.all` em `getManagerInsights` e substituir:
```typescript
// ANTES
(this.prisma as any).recognition
  ?.findMany({
    where: { toUserId: { in: userIds }, createdAt: { gte: new Date(Date.now() - 30 * 86400000) } },
    select: { type: true, message: true, fromUserId: true },
    take: 10,
  })
  .catch(() => [] as any[]),
```
Por:
```typescript
// DEPOIS
this.prisma.recognition.findMany({
  where: { toUserId: { in: userIds }, createdAt: { gte: new Date(Date.now() - 30 * 86400000) } },
  select: { type: true, message: true, fromUserId: true },
  take: 10,
}),
```

- [ ] **Step 6: Substituir `getMyEngagementSummary` — recognition count (linha 1205)**

Substituir:
```typescript
// ANTES
(this.prisma as any).recognition?.count({ where: { toUserId: userId } }).catch(() => 0),
```
Por:
```typescript
// DEPOIS
this.prisma.recognition.count({ where: { toUserId: userId } }),
```

- [ ] **Step 7: Verificar compilação completa**

```powershell
npx tsc --noEmit 2>&1 | Select-String "engagement.service" | Select-Object -First 20
```

Expected: zero erros em `engagement.service.ts`.

- [ ] **Step 8: Commit**

```powershell
git add src/engagement/engagement.service.ts
git commit -m "refactor(engagement): substituir as any recognition por Prisma tipado"
```

---

### Task 5: Build final + PR

**Files:**
- No file changes — verificação e ship

**Interfaces:**
- Consumes: tudo das Tasks 1–4

- [ ] **Step 1: Build completo**

```powershell
npm run build 2>&1 | tail -20
```

Expected: `webpack` ou `nest build` sem erros TypeScript.

- [ ] **Step 2: Verificar zero `(this.prisma as any).moodCheckin\|feedback\|recognition` no service**

```powershell
Select-String -Path "src\engagement\engagement.service.ts" -Pattern "\(this\.prisma as any\)\.(moodCheckin|feedback|recognition)"
```

Expected: sem resultados.

- [ ] **Step 3: Criar PR**

```powershell
git push -u origin HEAD
gh pr create `
  --title "feat(prisma): Grupo A — modelos Feedback, Recognition, MoodCheckin + remover as any" `
  --body "$(cat <<'EOF'
## Resumo

- Adiciona 3 modelos Prisma em falta: ``Feedback``, ``Recognition``, ``MoodCheckin``
- Migração: ``add-feedback-recognition-moodcheckin``
- Remove todas as chamadas ``(this.prisma as any).feedback/recognition/moodCheckin`` (21 ocorrências) em ``engagement.service.ts``
- Remove dead code: fallback de compatibilidade em ``submitMood`` e ``createFeedback``
- Zero alterações a DTOs, controllers, lógica de negócio ou testes

## Verificação

- ``npx prisma validate`` ✅
- ``npx prisma migrate dev`` ✅ (3 tabelas criadas)
- ``npm run build`` ✅ (zero erros TypeScript)

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
gh pr merge --auto --merge
```

- [ ] **Step 4: Aguardar CI verde**

```powershell
gh pr checks (gh pr list --state open --json number --jq '.[0].number') --watch
```

Expected: `quality` ✅ `build` ✅

---

## Self-Review

**Cobertura do spec:**
- 3 modelos Prisma com todos os campos ✅ (Task 1)
- `@@unique([userId, date])` no MoodCheckin ✅ (Task 1, Step 3)
- FK `badgeId → Badge` com `onDelete: SetNull` ✅ (Task 1, Step 3)
- Relações inversas no User e Badge ✅ (Task 1, Steps 1–2)
- Migração ✅ (Task 1, Step 5)
- Substituição dos `as any` moodCheckin (8 ocorrências) ✅ (Task 2)
- Substituição dos `as any` feedback (5 ocorrências) ✅ (Task 3)
- Substituição dos `as any` recognition (8 ocorrências) ✅ (Task 4)
- Remoção do fallback de compatibilidade em `submitMood` ✅ (Task 2, Step 1)
- Remoção do fallback em `createFeedback` ✅ (Task 3, Step 1)
- `date: today` passado no `moodCheckin.create` ✅ (Task 2, Step 1)

**Fora de âmbito confirmado:** `engagementSurvey as any` (modelo já existe no schema, PR separada).
