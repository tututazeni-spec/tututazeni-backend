# Spec — Persistir biblioteca e agendamento de relatórios (Grupo B)

> Data: 2026-06-25
> Branch: `chore/code-review-improvements`
> Origem: item 5 do code review do PR #6 — `reports.service.ts` acede a modelos
> que não existem no schema Prisma (só compilam por estarem tipados `any`).

## Contexto e problema

`src/reports/reports.service.ts` lê e escreve em modelos Prisma que **não existem**
no `schema.prisma`. Confirmado por inspeção do schema — não existem sob nenhum nome:

- `savedReport` — biblioteca de relatórios guardados
- `reportSchedule` — agendamento de relatórios recorrentes
- (Grupo A, **fora deste âmbito**: `recognition`, `feedback`, `moodCheckin`)

Hoje o código defende-se com optional chaining (`?.`) + `.catch(...)`, devolvendo
fallbacks (mensagens "execute migration", listas vazias, log para AuditLog). Não é
um bug — degrada graciosamente — mas os endpoints `/reports/saved` e
`/reports/schedules` **nunca persistem nada**.

Decisão de produto (utilizador): **construir a sério**, faseado, **Grupo B primeiro**.
O Grupo B já tem o lado de escrita feito no controller; só faltam os modelos.

## Objetivo

Os 6 endpoints de biblioteca/agendamento passam a persistir em base de dados, sem
mensagens "execute migration", com o cliente Prisma a tipar os modelos (remover os
`as any`). Comportamento dos relatórios analíticos fica **inalterado**.

Endpoints abrangidos (`src/reports/reports.controller.ts`):
- `GET /reports/saved`, `POST /reports/saved`, `DELETE /reports/saved/:id`
- `GET /reports/templates` (mantém fallback built-in)
- `GET /reports/schedules`, `POST /reports/schedules`, `DELETE /reports/schedules/:id`

Roles: `ADMIN`, `RH`, `LIDER`, `DIRECTOR` (já no controller).

## Design

### 1. Modelos Prisma novos

Campos ditados pelo uso atual (DTO em `reports.dto.ts` + chamadas no serviço).
Convenções seguidas do schema: `Int @id @default(autoincrement())`, relações a
`User` por Int, enums guardados como `String` validados no DTO (à la `SuccessionPlan`),
evitando expandir o enum parcial `ReportFormat` (só tem `PDF`).

```prisma
model SavedReport {
  id          Int      @id @default(autoincrement())
  name        String
  description String?
  category    String   // ReportCategory — validado no DTO
  reportKey   String
  params      String   // JSON string dos filtros guardados
  isTemplate  Boolean  @default(false)
  favourite   Boolean  @default(false)
  createdById Int
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  createdBy   User             @relation("UserSavedReports", fields: [createdById], references: [id], onDelete: Cascade)
  schedules   ReportSchedule[]
  @@index([createdById])
  @@index([isTemplate])
}

model ReportSchedule {
  id            Int       @id @default(autoincrement())
  savedReportId Int
  frequency     String    // ScheduleFrequency — validado no DTO
  startDate     DateTime  @default(now())
  endDate       DateTime?
  recipients    String[]  @default([])
  formats       String[]  @default([])
  createdById   Int
  active        Boolean   @default(true)
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt
  savedReport   SavedReport @relation(fields: [savedReportId], references: [id], onDelete: Cascade)
  createdBy     User        @relation("UserReportSchedules", fields: [createdById], references: [id], onDelete: Cascade)
  @@index([createdById])
  @@index([savedReportId])
}
```

Back-relations a adicionar ao modelo `User`:

```prisma
savedReports    SavedReport[]    @relation("UserSavedReports")
reportSchedules ReportSchedule[] @relation("UserReportSchedules")
```

### 2. Alterações no serviço (`reports.service.ts`)

Remover os fallbacks defensivos (`?.` + `.catch`) agora redundantes:

| Método | Depois |
|---|---|
| `saveReport` | `this.prisma.savedReport.create(...)` — devolve o registo criado |
| `listSavedReports` | `this.prismaRead.savedReport.findMany(...)` |
| `getTemplates` | direto; **mantém** o fallback de templates built-in quando vazio |
| `deleteReport` | `this.prisma.savedReport.delete(...)` |
| `createSchedule` | `this.prisma.reportSchedule.create(...)` |
| `listSchedules` | `this.prismaRead.reportSchedule.findMany(...)` |
| `deleteSchedule` | `this.prisma.reportSchedule.update({ active: false })` |

Notas:
- **Mudança de comportamento intencional:** sem `.catch`, um erro real de BD propaga
  (500) em vez de fallback silencioso. Correto para uma feature a sério; endpoints
  só de gestão.
- O getter local `prismaRead` mantém-se, mas o comentário é atualizado para referir
  apenas os fantasmas restantes do Grupo A (`recognition`, `feedback`, `moodCheckin`,
  `_count` em select).
- Remover os `as any` que existiam só para aceder a `savedReport`/`reportSchedule`.

**Fora de âmbito (deliberado):** `deleteReport`/`deleteSchedule` continuam a operar
por `id` sem verificar dono — comportamento preservado; reforço de autorização fica
como nota para item futuro, não muda agora.

### 3. Migração

- `npx prisma migrate dev --name add_report_library` → cria `SavedReport` e
  `ReportSchedule` (+ FKs e índices). Aditiva, não toca em tabelas existentes.
- Fallback `P1001`: usar `migrate --url`/`migrate deploy` com connection string
  explícita (workaround conhecido do projeto).
- `npx prisma generate` para tipar os novos modelos.

### 4. Testes (TDD — specs primeiro)

- Atualizar o mock do Prisma no spec de `reports.service` para incluir `savedReport`
  e `reportSchedule` (`create`/`findMany`/`delete`/`update`).
- Casos:
  - `saveReport` → devolve o registo criado (não mais a mensagem "execute migration").
  - `listSavedReports` / `getTemplates` → devolvem linhas; `getTemplates` cai nos
    built-in quando vazio.
  - `createSchedule` / `listSchedules` / `deleteSchedule` → CRUD persistido.
- Verificação final: `tsc --noEmit` (prova `as any` limpos) + specs do reports a
  verde, em `-i` (runInBand), focados no path `reports` (máquina sob carga).

## Critério de sucesso

1. Os 6 endpoints persistem em BD real, sem mensagens "execute migration".
2. Cliente Prisma tipa `savedReport`/`reportSchedule`; sem `as any` para os aceder.
3. `tsc --noEmit` verde e specs do reports verdes.
4. Relatórios analíticos inalterados.

## Fora de âmbito

- Grupo A (`recognition`, `feedback`, `moodCheckin`) — features novas com lado de
  escrita próprio, cada uma em ciclo spec→plano separado.
- Execução/distribuição efetiva dos agendamentos (envio de email, cron) — este spec
  cobre apenas persistência da definição do agendamento.
- Reforço de autorização por dono nos deletes.
