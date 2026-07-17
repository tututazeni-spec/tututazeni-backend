# Grupo A — Feedback, Recognition, MoodCheckin: Design Spec

> Data: 2026-07-17  
> Âmbito: criar 3 modelos Prisma em falta + remover `(prisma as any)` no engagement e reports services  
> PR alvo: `fix/grupo-a-prisma-models`

---

## 1. Contexto

O `engagement.service.ts` (1227 linhas) e o `reports.service.ts` usam três modelos com `(this.prisma as any).feedback`, `(this.prisma as any).recognition` e `(this.prisma as any).moodCheckin`, com fallbacks em `.catch()` para quando as tabelas não existem. O schema Prisma nunca teve estes modelos definidos — o código foi escrito à frente do schema. Esta PR fecha essa dívida: cria as tabelas, apaga os casts e os fallbacks.

Nota: `ContinuousFeedback` já existe no schema (linha 2161) para feedback de ciclos de performance — é um modelo diferente com campos `giverId/userId/cycleId`. O modelo novo chama-se `Feedback` (mapeia para `prisma.feedback`, que é o que o service já usa).

---

## 2. Novos modelos Prisma

### 2.1 MoodCheckin

```prisma
model MoodCheckin {
  id        Int      @id @default(autoincrement())
  userId    Int
  mood      Int                        // 1–5 (MoodLevel enum no DTO)
  note      String?
  tags      String[]
  date      DateTime @db.Date          // data sem hora — base do @@unique diário
  createdAt DateTime @default(now())
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([userId, date])             // BD enforça 1 check-in por utilizador por dia
  @@index([userId])
  @@index([createdAt])
}
```

**Decisão de design:** campo `date DateTime @db.Date` separado do `createdAt`. O PostgreSQL trunca o valor para só a data ao escrever num campo `@db.Date`, eliminando race conditions que a verificação aplicacional (`findFirst + gte today`) não conseguia prevenir.

### 2.2 Feedback

```prisma
model Feedback {
  id          Int       @id @default(autoincrement())
  fromUserId  Int?                     // null quando anonymous: true
  toUserId    Int?
  type        String                   // FeedbackType: OPEN | ANONYMOUS | PEER | MANAGER | RECOGNITION
  message     String    @db.Text
  anonymous   Boolean   @default(false)
  projectRef  String?
  status      String    @default("OPEN")   // OPEN | REPLIED
  reply       String?   @db.Text
  repliedAt   DateTime?
  repliedById Int?
  createdAt   DateTime  @default(now())
  from        User?     @relation("FeedbackFrom",    fields: [fromUserId], references: [id], onDelete: SetNull)
  to          User?     @relation("FeedbackTo",      fields: [toUserId],   references: [id], onDelete: SetNull)
  repliedBy   User?     @relation("FeedbackReplier", fields: [repliedById],references: [id], onDelete: SetNull)

  @@index([toUserId])
  @@index([fromUserId])
  @@index([status])
  @@index([createdAt])
}
```

**Decisão de design:** `fromUserId` e `toUserId` são `Int?` com `onDelete: SetNull` — se um utilizador for apagado, o feedback histórico fica mas sem referência de identidade (importante para feedback anónimo e para conformidade RGPD).

### 2.3 Recognition

```prisma
model Recognition {
  id         Int      @id @default(autoincrement())
  fromUserId Int
  toUserId   Int
  type       String                   // RecognitionType: KUDOS | BADGE | ACHIEVEMENT | MILESTONE
  message    String
  public     Boolean  @default(true)
  value      String?                  // valor textual opcional (ex: "Inovação")
  badgeId    Int?                     // FK opcional para Badge
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

**Decisão de design:** `badgeId` é FK real para o modelo `Badge` (não referência livre) — garante integridade referencial. `onDelete: SetNull` preserva o reconhecimento mesmo que o badge seja apagado.

---

## 3. Relações inversas a adicionar

### No modelo `User`:
```prisma
moodCheckins         MoodCheckin[]
feedbackGiven        Feedback[]     @relation("FeedbackFrom")
feedbackReceived     Feedback[]     @relation("FeedbackTo")
feedbackReplied      Feedback[]     @relation("FeedbackReplier")
recognitionsGiven    Recognition[]  @relation("RecognitionFrom")
recognitionsReceived Recognition[]  @relation("RecognitionTo")
```

### No modelo `Badge`:
```prisma
recognitions         Recognition[]
```

---

## 4. Migração

```bash
npx prisma migrate dev --name "add-feedback-recognition-moodcheckin"
```

Cria 3 tabelas novas sem tocar em tabelas existentes. As relações inversas no User e Badge são resolvidas pelo Prisma sem DDL extra (só adicionam colunas FK nas novas tabelas).

---

## 5. Alterações ao código

### 5.1 engagement.service.ts

**Substituições (21 ocorrências total):**

| Antes | Depois |
|---|---|
| `(this.prisma as any).moodCheckin?.findFirst(...).catch(...)` | `this.prisma.moodCheckin.findFirst(...)` |
| `(this.prisma as any).moodCheckin?.create(...).catch(...)` | `this.prisma.moodCheckin.create(...)` |
| `(this.prisma as any).moodCheckin?.findMany(...).catch(...)` | `this.prisma.moodCheckin.findMany(...)` |
| `(this.prisma as any).feedback?.create(...).catch(async () => {...})` | `this.prisma.feedback.create(...)` |
| `(this.prisma as any).feedback?.findMany(...).catch(...)` | `this.prisma.feedback.findMany(...)` |
| `(this.prisma as any).feedback?.count(...).catch(...)` | `this.prisma.feedback.count(...)` |
| `(this.prisma as any).feedback?.update(...).catch(...)` | `this.prisma.feedback.update(...)` |
| `(this.prisma as any).recognition?.create(...).catch(...)` | `this.prisma.recognition.create(...)` |
| `(this.prisma as any).recognition?.findMany(...).catch(...)` | `this.prisma.recognition.findMany(...)` |
| `(this.prisma as any).recognition?.count(...).catch(...)` | `this.prisma.recognition.count(...)` |
| `(this.prisma as any).recognition?.groupBy(...).catch(...)` | `this.prisma.recognition.groupBy(...)` |

**Dead code a remover:**
- Bloco `if (!checkin) { return { message: 'Check-in registado (modo compatibilidade)', ... } }` em `submitMood`
- Bloco `.catch(async () => { notificationLog.create(...); return null; })` em `createFeedback`

**Ajuste em `submitMood`:** adicionar `date: new Date()` no `data` do `create` (o `@db.Date` do PostgreSQL trunca para só a data). O `findFirst` de duplicate-check passa a `where: { userId, date: today }` em vez de `where: { userId, createdAt: { gte: today } }`.

### 5.2 reports.service.ts

Mesmas substituições para os 3 modelos (7 ocorrências). Sem remoção de dead code — o reports service não tem fallbacks, só os `as any`.

### 5.3 O que NÃO muda

- DTOs, controllers, specs — zero alterações
- `(this.prisma as any).engagementSurvey` — fora do âmbito desta PR (modelo já existe no schema, é dívida separada)
- Lógica de negócio — idêntica

---

## 6. Verificação

1. `npx prisma migrate dev` local — sem erros
2. `npm run build` — `tsc` confirma zero erros de tipo
3. CI: `lint:check` + `build` passam
4. Smoke: `POST /engagement/mood`, `POST /engagement/feedback`, `POST /engagement/recognition` respondem 201

---

## 7. Fora de âmbito

- Testes unitários novos (lógica não muda, mocks existentes continuam válidos)
- `engagementSurvey` as any (modelo já existe, PR separada se necessário)
- Frontend
