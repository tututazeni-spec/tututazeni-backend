# Report Library & Scheduling Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persistir os endpoints `/reports/saved` e `/reports/schedules` criando os modelos Prisma `SavedReport` e `ReportSchedule` e removendo os fallbacks defensivos que mascaravam a sua ausência.

**Architecture:** Adicionar dois modelos ao `schema.prisma` (+ back-relations no `User`), gerar uma migração aditiva, e reescrever 7 métodos do `ReportsService` para usar os modelos reais tipados em vez de `(this.prisma as any).<model>?.…catch(fallback)`. Sem tocar na lógica dos relatórios analíticos.

**Tech Stack:** NestJS, Prisma 7 (PostgreSQL), Jest 30, TypeScript.

## Global Constraints

- IDs são `Int @id @default(autoincrement())`; relações a `User` por `Int`. (verbatim do schema)
- Enums de relatório guardam-se como `String`/`String[]` na BD, validados pelos enums do DTO (`ReportCategory`, `ScheduleFrequency`, `ReportFormat` em `src/reports/reports.dto.ts`). Não criar/expandir enums Prisma.
- Modelo `User`: campo é `fullName` (nunca `name`). `AuditLog`: campo é `entity` (nunca `entityType`).
- Jest 30: testes correm com `--forceExit`; a flag de filtro é `--testPathPatterns` (não `--testPathPattern`). Na máquina sob carga, correr em `-i` (runInBand).
- Shell primário é PowerShell: para correr `npx` num pipe usar o operador `&`; preferir comandos sem pipe.
- Migrações: `prisma migrate dev`. Se der `P1001`, usar o workaround com `--url` explícito (connection string do `.env`).
- Mensagens de commit terminam com: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`

---

### Task 1: Modelos Prisma + back-relations + migração

**Files:**
- Modify: `prisma/schema.prisma` (adicionar 2 modelos no fim; adicionar 2 relações ao `model User` perto da linha 580)
- Create: `prisma/migrations/<timestamp>_add_report_library/migration.sql` (gerada pelo Prisma)

**Interfaces:**
- Produces: modelos Prisma `SavedReport` e `ReportSchedule` no cliente gerado, tipados, acessíveis como `prisma.savedReport` e `prisma.reportSchedule` com `create/findMany/deleteMany/updateMany/delete/update`.

- [ ] **Step 1: Adicionar back-relations ao modelo `User`**

Em `prisma/schema.prisma`, no bloco `model User`, logo a seguir à linha `reportAccessLogs        ReportAccessLog[]` (~linha 580), adicionar:

```prisma
  savedReports            SavedReport[]           @relation("UserSavedReports")
  reportSchedules         ReportSchedule[]        @relation("UserReportSchedules")
```

- [ ] **Step 2: Adicionar os dois modelos no fim do `schema.prisma`**

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

- [ ] **Step 3: Validar o schema**

Run: `npx prisma validate`
Expected: `The schema at prisma\schema.prisma is valid 🚀`

- [ ] **Step 4: Gerar a migração**

Run: `npx prisma migrate dev --name add_report_library`
Expected: cria a pasta `prisma/migrations/<timestamp>_add_report_library/`, aplica `CREATE TABLE "SavedReport"` e `CREATE TABLE "ReportSchedule"`, e regenera o cliente.
Se falhar com `P1001` (BD inacessível): correr `npx prisma migrate dev --name add_report_library --url "<DATABASE_URL do .env>"` ou aplicar via `npx prisma migrate deploy` com a connection string explícita.

- [ ] **Step 5: Garantir o cliente gerado**

Run: `npx prisma generate`
Expected: `Generated Prisma Client`

- [ ] **Step 6: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat(reports): modelos SavedReport e ReportSchedule + migracao

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Ligar saved reports aos modelos reais (+ testes)

**Files:**
- Modify: `src/reports/reports.service.ts` (métodos `saveReport`, `listSavedReports`, `getTemplates`, `deleteReport`)
- Test: `src/reports/reports.service.spec.ts`

**Interfaces:**
- Consumes: `prisma.savedReport` (de Task 1).
- Produces: `saveReport(userId, dto)` devolve o registo criado; `deleteReport(id)` é idempotente (não lança em id inexistente).

- [ ] **Step 1: Estender o mock do Prisma no spec**

Em `src/reports/reports.service.spec.ts`, substituir o bloco `savedReport: { … }` (linhas ~60-63) por:

```ts
  savedReport: {
    create: jest.fn().mockResolvedValue({ id: 1, name: 'R' }),
    findMany: jest.fn().mockResolvedValue([]),
    deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
  },
```

- [ ] **Step 2: Escrever os testes que falham (saved reports)**

Adicionar este bloco antes do último `});` que fecha o `describe('ReportsService', …)` em `src/reports/reports.service.spec.ts`:

```ts
  describe('saveReport', () => {
    it('devolve o registo criado (sem mensagem "execute migration")', async () => {
      mockPrisma.savedReport.create.mockResolvedValue({ id: 42, name: 'Meu Relatório' });
      const result = await service.saveReport(7, {
        name: 'Meu Relatório',
        category: 'HR' as any,
        reportKey: 'headcount',
        params: '{}',
      } as any);
      expect(mockPrisma.savedReport.create).toHaveBeenCalled();
      expect(result).toEqual({ id: 42, name: 'Meu Relatório' });
    });
  });

  describe('deleteReport', () => {
    it('apaga por id e devolve mensagem', async () => {
      const result = await service.deleteReport(42);
      expect(mockPrisma.savedReport.deleteMany).toHaveBeenCalledWith({ where: { id: 42 } });
      expect(result).toEqual({ message: 'Relatório removido' });
    });
  });

  describe('listSavedReports', () => {
    it('devolve as linhas da BD', async () => {
      mockPrisma.savedReport.findMany.mockResolvedValue([{ id: 1 }, { id: 2 }]);
      const result = await service.listSavedReports(7);
      expect(result).toHaveLength(2);
    });
  });
```

- [ ] **Step 3: Correr os testes para confirmar que falham**

Run: `npx jest src/reports/reports.service.spec.ts -i --forceExit`
Expected: FAIL — `saveReport` devolve hoje o objeto com `message: 'Relatório guardado…'` (não `{ id: 42, … }`), e `deleteReport` chama `savedReport.delete` (via `as any`/proxy), não `deleteMany`.

- [ ] **Step 4: Reescrever `saveReport`**

Em `src/reports/reports.service.ts`, substituir o método `saveReport` (atual ~L794-821) por:

```ts
  async saveReport(userId: number, dto: SaveReportDto) {
    return this.prisma.savedReport.create({
      data: {
        name: dto.name,
        description: dto.description,
        category: dto.category,
        reportKey: dto.reportKey,
        params: dto.params,
        isTemplate: dto.isTemplate ?? false,
        favourite: dto.favourite ?? false,
        createdById: userId,
      },
    });
  }
```

- [ ] **Step 5: Reescrever `listSavedReports`**

Substituir (atual ~L823-832) por:

```ts
  async listSavedReports(userId: number, category?: ReportCategory) {
    const where: any = { OR: [{ createdById: userId }, { isTemplate: true }] };
    if (category) where.category = category;
    return this.prismaRead.savedReport.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
    });
  }
```

- [ ] **Step 6: Reescrever `getTemplates`**

Substituir (atual ~L834-846) por:

```ts
  async getTemplates() {
    const templates = await this.prismaRead.savedReport.findMany({
      where: { isTemplate: true },
      orderBy: { category: 'asc' },
    });

    if (templates.length) return templates;

    // Built-in templates quando ainda não há nenhum guardado (regra de negócio)
    return this.getBuiltInTemplates();
  }
```

- [ ] **Step 7: Reescrever `deleteReport` (idempotente com `deleteMany`)**

Substituir (atual ~L848-851) por:

```ts
  async deleteReport(reportId: number) {
    // deleteMany é idempotente: não lança P2025 se o id não existir,
    // preservando o "sempre devolve mensagem" do comportamento anterior.
    await this.prisma.savedReport.deleteMany({ where: { id: reportId } });
    return { message: 'Relatório removido' };
  }
```

- [ ] **Step 8: Correr os testes para confirmar que passam**

Run: `npx jest src/reports/reports.service.spec.ts -i --forceExit`
Expected: PASS (todos os describe, incluindo os 3 novos).

- [ ] **Step 9: Commit**

```bash
git add src/reports/reports.service.ts src/reports/reports.service.spec.ts
git commit -m "feat(reports): persistir saved reports nos modelos reais

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: Ligar schedules + limpar getter + verificação final

**Files:**
- Modify: `src/reports/reports.service.ts` (métodos `createSchedule`, `listSchedules`, `deleteSchedule`; comentário do getter `prismaRead`)
- Test: `src/reports/reports.service.spec.ts`

**Interfaces:**
- Consumes: `prisma.reportSchedule` (de Task 1).
- Produces: `createSchedule` devolve o registo criado; `deleteSchedule(id)` é idempotente.

- [ ] **Step 1: Estender o mock do Prisma no spec**

Em `src/reports/reports.service.spec.ts`, substituir o bloco `reportSchedule: { … }` (linhas ~64-67) por:

```ts
  reportSchedule: {
    create: jest.fn().mockResolvedValue({ id: 1 }),
    findMany: jest.fn().mockResolvedValue([]),
    updateMany: jest.fn().mockResolvedValue({ count: 1 }),
  },
```

- [ ] **Step 2: Escrever os testes que falham (schedules)**

Adicionar antes do último `});` do `describe('ReportsService', …)`:

```ts
  describe('createSchedule', () => {
    it('devolve o agendamento criado (sem mensagem "execute migration")', async () => {
      mockPrisma.reportSchedule.create.mockResolvedValue({ id: 99, frequency: 'WEEKLY' });
      const result = await service.createSchedule(7, {
        savedReportId: 1,
        frequency: 'WEEKLY' as any,
      } as any);
      expect(mockPrisma.reportSchedule.create).toHaveBeenCalled();
      expect(result).toEqual({ id: 99, frequency: 'WEEKLY' });
    });
  });

  describe('listSchedules', () => {
    it('devolve agendamentos activos da BD', async () => {
      mockPrisma.reportSchedule.findMany.mockResolvedValue([{ id: 1 }]);
      const result = await service.listSchedules(7);
      expect(result).toHaveLength(1);
    });
  });

  describe('deleteSchedule', () => {
    it('marca como inactivo e devolve mensagem', async () => {
      const result = await service.deleteSchedule(99);
      expect(mockPrisma.reportSchedule.updateMany).toHaveBeenCalledWith({
        where: { id: 99 },
        data: { active: false },
      });
      expect(result).toEqual({ message: 'Agendamento cancelado' });
    });
  });
```

- [ ] **Step 3: Correr os testes para confirmar que falham**

Run: `npx jest src/reports/reports.service.spec.ts -i --forceExit`
Expected: FAIL — `createSchedule` devolve hoje `{ message: 'Agendamento registado…', …dto }`; `deleteSchedule` chama `update` (via proxy), não `updateMany`.

- [ ] **Step 4: Reescrever `createSchedule`**

Em `src/reports/reports.service.ts`, substituir `createSchedule` (atual ~L857-875) por:

```ts
  async createSchedule(userId: number, dto: CreateScheduleDto) {
    return this.prisma.reportSchedule.create({
      data: {
        savedReportId: dto.savedReportId,
        frequency: dto.frequency,
        startDate: dto.startDate ? new Date(dto.startDate) : new Date(),
        endDate: dto.endDate ? new Date(dto.endDate) : null,
        recipients: dto.recipients ?? [],
        formats: dto.formats ?? ['PDF'],
        createdById: userId,
        active: true,
      },
    });
  }
```

- [ ] **Step 5: Reescrever `listSchedules`**

Substituir (atual ~L877-884) por:

```ts
  async listSchedules(userId: number) {
    return this.prismaRead.reportSchedule.findMany({
      where: { createdById: userId, active: true },
      orderBy: { createdAt: 'desc' },
    });
  }
```

- [ ] **Step 6: Reescrever `deleteSchedule` (idempotente com `updateMany`)**

Substituir (atual ~L886-891) por:

```ts
  async deleteSchedule(scheduleId: number) {
    // updateMany é idempotente: não lança P2025 se o id não existir.
    await this.prisma.reportSchedule.updateMany({
      where: { id: scheduleId },
      data: { active: false },
    });
    return { message: 'Agendamento cancelado' };
  }
```

- [ ] **Step 7: Atualizar o comentário do getter `prismaRead`**

Em `src/reports/reports.service.ts`, substituir o bloco de comentário do getter `prismaRead` (atual ~L45-54) por:

```ts
  /**
   * Cliente de leitura: usa a réplica (this.prisma.db) quando disponível,
   * caindo para o primary quando .db não existe (ex.: mocks de teste).
   *
   * NOTA: mantém-se tipado `any` porque ainda acede a modelos do Grupo A que
   * não existem no schema (recognition, feedback, moodCheckin) e a `_count`
   * em select — só compilam com `any`. SavedReport e ReportSchedule já foram
   * migrados e são tipados normalmente via this.prisma.
   */
```

- [ ] **Step 8: Correr os testes para confirmar que passam**

Run: `npx jest src/reports/reports.service.spec.ts -i --forceExit`
Expected: PASS (incluindo os 3 novos describes de schedules).

- [ ] **Step 9: Typecheck final**

Run: `npx tsc --noEmit`
Expected: sem erros (prova que os `as any` para `savedReport`/`reportSchedule` foram removidos e os modelos estão tipados).

- [ ] **Step 10: Commit**

```bash
git add src/reports/reports.service.ts src/reports/reports.service.spec.ts
git commit -m "feat(reports): persistir schedules e limpar getter prismaRead

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Notas de execução

- **Idempotência dos deletes:** o spec aprovado dizia `delete`/`update`; o plano usa
  `deleteMany`/`updateMany` para preservar fielmente o comportamento idempotente
  ("sempre devolve mensagem de sucesso") que o antigo `.catch(() => null)` dava. É a
  única divergência face ao spec e é deliberada.
- **Verificação de testes na máquina sob carga:** correr sempre `-i` (runInBand) e
  apontar ao ficheiro `src/reports/reports.service.spec.ts` diretamente, evitando abrir
  vários workers Jest.
- **Push:** acumular os 3 commits e fazer `git push` no fim (o utilizador prefere
  `--no-verify` nesta sessão).
