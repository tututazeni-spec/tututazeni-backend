# INNOVA — Módulo 9: Monitoria e Avaliação (FINAL)
> Mesmo padrão dos Módulos 1-8 — o último módulo
> Referência: SAP SuccessFactors + Workday Performance + OKR (Google/Intel) + 15Five

---

## ⚠️ REGRAS ABSOLUTAS DO INNOVA

```
- fullName (NUNCA name) — User model
- entity (NUNCA entityType) — AuditLog
- metadata → JSON.stringify()
- deletedAt em TODOS os novos modelos
- auditLog em CREATE, UPDATE, DELETE
- Paginação: { data, total, page, limit, totalPages }
- Backend porta 4000 | Frontend porta 3000
```

---

## ARQUITECTURA DO MÓDULO

```
Três pilares integrados:

1. OKRs (Objectives & Key Results)
   OkrCycle → Objective → KeyResult → KeyResultUpdate
   Cascata: empresa → equipa → individual

2. Indicadores de Monitoria (M&E)
   MonitoringIndicator → MonitoringRecord
   Métricas com baseline, target, variância

3. Avaliação de Desempenho
   EvaluationCycle → UserEvaluation
   Auto-avaliação + Manager + Calibração
```

---

## CHECKLIST OBRIGATÓRIO

```
□ Schema Prisma (8 modelos + 5 enums) + migrate dev
□ DTOs (okr-cycle + objective + key-result + kr-update + indicator + record + eval-cycle + user-eval)
□ Service completo (OKRs + indicadores + avaliações + dashboard)
□ Controller completo (Swagger + Guards)
□ Module registado no AppModule
□ Spec file (10 testes — módulo complexo)
□ Bruno CLI (8 ficheiros .bru)
□ Frontend page.tsx (OKRs) + indicadores + avaliações
□ npm run build → 0 erros
□ npm run test → 0 falhas
□ npm run test:cov → > 55%
□ npx bru run bruno/monitoring/ → passa
□ git commit descritivo
```

---

## PASSO 1 — Schema Prisma

```prisma
# Adicionar a prisma/schema.prisma

# ─── OKRs ──────────────────────────────────────

model OkrCycle {
  id          String    @id @default(cuid())
  name        String
  type        OkrType   @default(QUARTERLY)
  startDate   DateTime
  endDate     DateTime
  status      OkrStatus @default(DRAFT)
  description String?
  createdById String
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt
  deletedAt   DateTime?

  createdBy  User        @relation("OkrCycleCreator", fields: [createdById], references: [id])
  objectives Objective[]

  @@index([status])
  @@index([deletedAt])
}

model Objective {
  id           String   @id @default(cuid())
  cycleId      String
  ownerId      String
  departmentId String?
  title        String
  description  String?
  type         ObjectiveType @default(INDIVIDUAL)
  status       String   @default("DRAFT")
  progress     Float    @default(0)
  weight       Float    @default(1)
  parentId     String?
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt
  deletedAt    DateTime?

  cycle      OkrCycle    @relation(fields: [cycleId], references: [id])
  owner      User        @relation("ObjectiveOwner", fields: [ownerId], references: [id])
  keyResults KeyResult[]

  @@index([cycleId])
  @@index([ownerId])
  @@index([type])
  @@index([deletedAt])
}

model KeyResult {
  id           String   @id @default(cuid())
  objectiveId  String
  title        String
  description  String?
  metric       String?
  startValue   Float    @default(0)
  targetValue  Float
  currentValue Float    @default(0)
  unit         String?
  progress     Float    @default(0)
  status       String   @default("ON_TRACK")
  dueDate      DateTime?
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt
  deletedAt    DateTime?

  objective Objective         @relation(fields: [objectiveId], references: [id])
  updates   KeyResultUpdate[]

  @@index([objectiveId])
  @@index([status])
  @@index([deletedAt])
}

model KeyResultUpdate {
  id            String   @id @default(cuid())
  keyResultId   String
  previousValue Float
  newValue      Float
  progress      Float
  notes         String?
  updatedById   String
  createdAt     DateTime @default(now())

  keyResult KeyResult @relation(fields: [keyResultId], references: [id])
  updatedBy User      @relation("KrUpdater", fields: [updatedById], references: [id])

  @@index([keyResultId])
  @@index([createdAt])
}

# ─── INDICADORES DE MONITORIA ──────────────────

model MonitoringIndicator {
  id          String             @id @default(cuid())
  code        String             @unique
  name        String
  description String?
  unit        String?
  formula     String?
  baseline    Float?
  target      Float?
  frequency   IndicatorFrequency @default(MONTHLY)
  category    String?
  responsible String?
  isActive    Boolean            @default(true)
  tags        String[]
  createdById String
  createdAt   DateTime           @default(now())
  updatedAt   DateTime           @updatedAt
  deletedAt   DateTime?

  createdBy User               @relation("IndicatorCreator", fields: [createdById], references: [id])
  records   MonitoringRecord[]

  @@index([category])
  @@index([isActive])
  @@index([deletedAt])
}

model MonitoringRecord {
  id           String   @id @default(cuid())
  indicatorId  String
  value        Float
  target       Float?
  variance     Float?
  variancePct  Float?
  period       String
  date         DateTime @default(now())
  notes        String?
  recordedById String
  createdAt    DateTime @default(now())
  deletedAt    DateTime?

  indicator  MonitoringIndicator @relation(fields: [indicatorId], references: [id])
  recordedBy User                @relation("RecordCreator", fields: [recordedById], references: [id])

  @@index([indicatorId])
  @@index([period])
  @@index([date])
  @@index([deletedAt])
}

# ─── AVALIAÇÃO DE DESEMPENHO ───────────────────

model EvaluationCycle {
  id           String           @id @default(cuid())
  name         String
  type         EvalCycleType    @default(ANNUAL)
  startDate    DateTime
  endDate      DateTime
  status       EvaluationStatus @default(DRAFT)
  description  String?
  passingScore Float            @default(60)
  createdById  String
  createdAt    DateTime         @default(now())
  updatedAt    DateTime         @updatedAt
  deletedAt    DateTime?

  createdBy   User             @relation("EvalCycleCreator", fields: [createdById], references: [id])
  evaluations UserEvaluation[]

  @@index([status])
  @@index([deletedAt])
}

model UserEvaluation {
  id              String   @id @default(cuid())
  cycleId         String
  userId          String
  evaluatorId     String
  type            String   @default("MANAGER")
  status          String   @default("PENDING")
  selfScore       Float?
  managerScore    Float?
  finalScore      Float?
  calibratedScore Float?
  selfFeedback    String?
  managerFeedback String?
  strengths       String?
  improvements    String?
  developmentPlan String?
  submittedAt     DateTime?
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
  deletedAt       DateTime?

  cycle     EvaluationCycle @relation(fields: [cycleId], references: [id])
  user      User            @relation("EvalUser",      fields: [userId],      references: [id])
  evaluator User            @relation("EvalEvaluator", fields: [evaluatorId], references: [id])

  @@unique([cycleId, userId, evaluatorId, type])
  @@index([cycleId])
  @@index([userId])
  @@index([status])
  @@index([deletedAt])
}

enum OkrType            { ANNUAL QUARTERLY MONTHLY }
enum OkrStatus          { DRAFT ACTIVE CLOSED ARCHIVED }
enum ObjectiveType      { COMPANY TEAM INDIVIDUAL }
enum IndicatorFrequency { DAILY WEEKLY MONTHLY QUARTERLY ANNUAL }
enum EvalCycleType      { ANNUAL SEMI_ANNUAL QUARTERLY PROBATION }
enum EvaluationStatus   { DRAFT OPEN SELF_EVAL MANAGER_EVAL CALIBRATION CLOSED ARCHIVED }
```

```bash
npx prisma validate
npx prisma migrate dev --name "add_monitoring_evaluation"
npx prisma generate
```

---

## PASSO 2 — DTOs

```typescript
// src/monitoring/dto/create-okr-cycle.dto.ts
import { IsString, IsOptional, IsEnum, IsDateString, Length } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { OkrType } from '@prisma/client';

export class CreateOkrCycleDto {
  @ApiProperty({ example: 'Q2 2026' })
  @IsString() @Length(2, 100)
  name: string;

  @ApiPropertyOptional({ enum: OkrType, default: 'QUARTERLY' })
  @IsOptional() @IsEnum(OkrType)
  type?: OkrType;

  @ApiProperty()
  @IsDateString()
  startDate: string;

  @ApiProperty()
  @IsDateString()
  endDate: string;

  @ApiPropertyOptional()
  @IsOptional() @IsString()
  description?: string;
}

// src/monitoring/dto/create-objective.dto.ts
import {
  IsString, IsOptional, IsEnum, IsNumber, Min, Length,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ObjectiveType } from '@prisma/client';

export class CreateObjectiveDto {
  @ApiProperty()
  @IsString()
  cycleId: string;

  @ApiProperty()
  @IsString()
  ownerId: string;

  @ApiProperty({ example: 'Aumentar a taxa de conclusão de cursos' })
  @IsString() @Length(2, 250)
  title: string;

  @ApiPropertyOptional()
  @IsOptional() @IsString()
  description?: string;

  @ApiPropertyOptional({ enum: ObjectiveType, default: 'INDIVIDUAL' })
  @IsOptional() @IsEnum(ObjectiveType)
  type?: ObjectiveType;

  @ApiPropertyOptional()
  @IsOptional() @IsString()
  departmentId?: string;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional() @IsNumber() @Min(0)
  weight?: number;

  @ApiPropertyOptional({ description: 'Objectivo pai (cascata)' })
  @IsOptional() @IsString()
  parentId?: string;
}

// src/monitoring/dto/create-key-result.dto.ts
import { IsString, IsOptional, IsNumber, IsDateString, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateKeyResultDto {
  @ApiProperty()
  @IsString()
  objectiveId: string;

  @ApiProperty({ example: 'Atingir 80% de conclusão' })
  @IsString()
  title: string;

  @ApiPropertyOptional()
  @IsOptional() @IsString()
  description?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsString()
  metric?: string;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional() @IsNumber()
  startValue?: number;

  @ApiProperty({ example: 80 })
  @IsNumber()
  targetValue: number;

  @ApiPropertyOptional()
  @IsOptional() @IsString()
  unit?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsDateString()
  dueDate?: string;
}

// src/monitoring/dto/update-key-result.dto.ts
import { IsNumber, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateKeyResultDto {
  @ApiProperty({ description: 'Novo valor actual' })
  @IsNumber()
  newValue: number;

  @ApiPropertyOptional()
  @IsOptional() @IsString()
  notes?: string;
}

// src/monitoring/dto/create-indicator.dto.ts
import {
  IsString, IsOptional, IsEnum, IsNumber, IsArray, Length,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IndicatorFrequency } from '@prisma/client';

export class CreateIndicatorDto {
  @ApiProperty({ example: 'IND-001' })
  @IsString() @Length(2, 50)
  code: string;

  @ApiProperty({ example: 'Taxa de Conclusão de Cursos' })
  @IsString() @Length(2, 200)
  name: string;

  @ApiPropertyOptional()
  @IsOptional() @IsString()
  description?: string;

  @ApiPropertyOptional({ example: '%' })
  @IsOptional() @IsString()
  unit?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsString()
  formula?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsNumber()
  baseline?: number;

  @ApiPropertyOptional()
  @IsOptional() @IsNumber()
  target?: number;

  @ApiPropertyOptional({ enum: IndicatorFrequency, default: 'MONTHLY' })
  @IsOptional() @IsEnum(IndicatorFrequency)
  frequency?: IndicatorFrequency;

  @ApiPropertyOptional()
  @IsOptional() @IsString()
  category?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsString()
  responsible?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional() @IsArray() @IsString({ each: true })
  tags?: string[];
}

// src/monitoring/dto/create-record.dto.ts
import { IsString, IsOptional, IsNumber, IsDateString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateRecordDto {
  @ApiProperty()
  @IsNumber()
  value: number;

  @ApiProperty({ example: '2026-06' })
  @IsString()
  period: string;

  @ApiPropertyOptional()
  @IsOptional() @IsDateString()
  date?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsString()
  notes?: string;
}

// src/monitoring/dto/create-eval-cycle.dto.ts
import { IsString, IsOptional, IsEnum, IsDateString, IsNumber, Min, Max, Length } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { EvalCycleType } from '@prisma/client';

export class CreateEvalCycleDto {
  @ApiProperty({ example: 'Avaliação Anual 2026' })
  @IsString() @Length(2, 150)
  name: string;

  @ApiPropertyOptional({ enum: EvalCycleType, default: 'ANNUAL' })
  @IsOptional() @IsEnum(EvalCycleType)
  type?: EvalCycleType;

  @ApiProperty()
  @IsDateString()
  startDate: string;

  @ApiProperty()
  @IsDateString()
  endDate: string;

  @ApiPropertyOptional({ default: 60, minimum: 0, maximum: 100 })
  @IsOptional() @IsNumber() @Min(0) @Max(100)
  passingScore?: number;

  @ApiPropertyOptional()
  @IsOptional() @IsString()
  description?: string;
}

// src/monitoring/dto/submit-evaluation.dto.ts
import { IsNumber, IsOptional, IsString, Min, Max } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class SubmitEvaluationDto {
  @ApiProperty({ minimum: 0, maximum: 100 })
  @IsNumber() @Min(0) @Max(100)
  score: number;

  @ApiPropertyOptional()
  @IsOptional() @IsString()
  feedback?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsString()
  strengths?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsString()
  improvements?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsString()
  developmentPlan?: string;
}

// src/monitoring/dto/index.ts
export * from './create-okr-cycle.dto';
export * from './create-objective.dto';
export * from './create-key-result.dto';
export * from './update-key-result.dto';
export * from './create-indicator.dto';
export * from './create-record.dto';
export * from './create-eval-cycle.dto';
export * from './submit-evaluation.dto';
```

---

## PASSO 3 — Service Completo

```typescript
// src/monitoring/monitoring.service.ts
import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateOkrCycleDto, CreateObjectiveDto, CreateKeyResultDto,
  UpdateKeyResultDto, CreateIndicatorDto, CreateRecordDto,
  CreateEvalCycleDto, SubmitEvaluationDto,
} from './dto';

@Injectable()
export class MonitoringService {
  constructor(private prisma: PrismaService) {}

  // ════════════════════════════════════════════════════
  // OKRs
  // ════════════════════════════════════════════════════

  async createOkrCycle(dto: CreateOkrCycleDto, userId: string) {
    const cycle = await this.prisma.okrCycle.create({
      data: { ...dto, createdById: userId },
    });
    await this.audit(userId, 'CREATE', 'OkrCycle', cycle.id, { name: dto.name });
    return cycle;
  }

  async findAllCycles() {
    return this.prisma.okrCycle.findMany({
      where: { deletedAt: null },
      orderBy: { startDate: 'desc' },
      include: { _count: { select: { objectives: true } } },
    });
  }

  async createObjective(dto: CreateObjectiveDto, userId: string) {
    const cycle = await this.prisma.okrCycle.findUnique({ where: { id: dto.cycleId } });
    if (!cycle) throw new NotFoundException('Ciclo OKR não encontrado');
    const objective = await this.prisma.objective.create({ data: dto });
    await this.audit(userId, 'CREATE', 'Objective', objective.id, { title: dto.title });
    return objective;
  }

  async findObjectives(cycleId: string, ownerId?: string) {
    return this.prisma.objective.findMany({
      where: { cycleId, deletedAt: null, ...(ownerId && { ownerId }) },
      orderBy: { createdAt: 'desc' },
      include: {
        owner: { select: { fullName: true } },
        keyResults: { where: { deletedAt: null } },
      },
    });
  }

  async createKeyResult(dto: CreateKeyResultDto, userId: string) {
    const objective = await this.prisma.objective.findUnique({ where: { id: dto.objectiveId } });
    if (!objective) throw new NotFoundException('Objectivo não encontrado');
    const kr = await this.prisma.keyResult.create({
      data: { ...dto, currentValue: dto.startValue || 0 },
    });
    await this.audit(userId, 'CREATE', 'KeyResult', kr.id, { title: dto.title });
    return kr;
  }

  async updateKeyResult(id: string, dto: UpdateKeyResultDto, userId: string) {
    const kr = await this.prisma.keyResult.findUnique({ where: { id } });
    if (!kr) throw new NotFoundException('Key Result não encontrado');

    const range = kr.targetValue - kr.startValue;
    const achieved = dto.newValue - kr.startValue;
    const progress = range !== 0
      ? Math.max(0, Math.min(100, Math.round((achieved / range) * 100)))
      : 0;

    const status = progress >= 100 ? 'COMPLETED'
      : progress >= 70 ? 'ON_TRACK'
      : progress >= 40 ? 'AT_RISK'
      : 'OFF_TRACK';

    await this.prisma.keyResultUpdate.create({
      data: {
        keyResultId: id,
        previousValue: kr.currentValue,
        newValue: dto.newValue,
        progress,
        notes: dto.notes,
        updatedById: userId,
      },
    });

    const updated = await this.prisma.keyResult.update({
      where: { id },
      data: { currentValue: dto.newValue, progress, status },
    });

    // Recalcula progresso do objectivo (média dos KRs)
    await this.recalcObjectiveProgress(kr.objectiveId);
    await this.audit(userId, 'UPDATE', 'KeyResult', id, { newValue: dto.newValue, progress });
    return updated;
  }

  private async recalcObjectiveProgress(objectiveId: string) {
    const krs = await this.prisma.keyResult.findMany({
      where: { objectiveId, deletedAt: null },
      select: { progress: true },
    });
    const avg = krs.length > 0
      ? Math.round(krs.reduce((s, k) => s + k.progress, 0) / krs.length)
      : 0;
    await this.prisma.objective.update({
      where: { id: objectiveId },
      data: { progress: avg, status: avg >= 100 ? 'COMPLETED' : 'IN_PROGRESS' },
    });
  }

  // ════════════════════════════════════════════════════
  // INDICADORES DE MONITORIA
  // ════════════════════════════════════════════════════

  async createIndicator(dto: CreateIndicatorDto, userId: string) {
    const existing = await this.prisma.monitoringIndicator.findUnique({ where: { code: dto.code } });
    if (existing && !existing.deletedAt) {
      throw new ConflictException(`Código ${dto.code} já existe`);
    }
    const indicator = await this.prisma.monitoringIndicator.create({
      data: { ...dto, createdById: userId },
    });
    await this.audit(userId, 'CREATE', 'MonitoringIndicator', indicator.id, { code: dto.code });
    return indicator;
  }

  async findAllIndicators(page = 1, limit = 20, category?: string) {
    const where = { deletedAt: null, isActive: true, ...(category && { category }) };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.monitoringIndicator.findMany({
        where, skip: (page - 1) * limit, take: limit,
        orderBy: { createdAt: 'desc' },
        include: { _count: { select: { records: true } } },
      }),
      this.prisma.monitoringIndicator.count({ where }),
    ]);
    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async addRecord(indicatorId: string, dto: CreateRecordDto, userId: string) {
    const indicator = await this.prisma.monitoringIndicator.findUnique({
      where: { id: indicatorId },
    });
    if (!indicator) throw new NotFoundException('Indicador não encontrado');

    const target = indicator.target;
    const variance = target != null ? dto.value - target : null;
    const variancePct = target != null && target !== 0
      ? Math.round(((dto.value - target) / target) * 1000) / 10
      : null;

    const record = await this.prisma.monitoringRecord.create({
      data: {
        indicatorId, value: dto.value, target,
        variance, variancePct,
        period: dto.period,
        date: dto.date ? new Date(dto.date) : new Date(),
        notes: dto.notes,
        recordedById: userId,
      },
    });
    await this.audit(userId, 'CREATE', 'MonitoringRecord', record.id, {
      indicatorId, value: dto.value, period: dto.period,
    });
    return record;
  }

  async getIndicatorHistory(indicatorId: string) {
    const [indicator, records] = await this.prisma.$transaction([
      this.prisma.monitoringIndicator.findUnique({ where: { id: indicatorId } }),
      this.prisma.monitoringRecord.findMany({
        where: { indicatorId, deletedAt: null },
        orderBy: { date: 'asc' },
        include: { recordedBy: { select: { fullName: true } } },
      }),
    ]);
    if (!indicator) throw new NotFoundException('Indicador não encontrado');
    return { indicator, records };
  }

  // ════════════════════════════════════════════════════
  // AVALIAÇÃO DE DESEMPENHO
  // ════════════════════════════════════════════════════

  async createEvalCycle(dto: CreateEvalCycleDto, userId: string) {
    const cycle = await this.prisma.evaluationCycle.create({
      data: { ...dto, createdById: userId },
    });
    await this.audit(userId, 'CREATE', 'EvaluationCycle', cycle.id, { name: dto.name });
    return cycle;
  }

  async assignEvaluation(cycleId: string, userId: string, evaluatorId: string, type: string, assignedBy: string) {
    const existing = await this.prisma.userEvaluation.findUnique({
      where: { cycleId_userId_evaluatorId_type: { cycleId, userId, evaluatorId, type } },
    });
    if (existing) throw new ConflictException('Avaliação já atribuída');

    const evaluation = await this.prisma.userEvaluation.create({
      data: { cycleId, userId, evaluatorId, type },
    });
    await this.prisma.notificationLog.create({
      data: {
        userId: evaluatorId,
        title: 'Nova avaliação atribuída',
        message: 'Foi-te atribuída uma avaliação de desempenho.',
        metadata: JSON.stringify({ evaluationId: evaluation.id, cycleId }),
      },
    });
    await this.audit(assignedBy, 'CREATE', 'UserEvaluation', evaluation.id, { cycleId, userId });
    return evaluation;
  }

  async submitEvaluation(id: string, dto: SubmitEvaluationDto, evaluatorId: string) {
    const evaluation = await this.prisma.userEvaluation.findUnique({ where: { id } });
    if (!evaluation) throw new NotFoundException('Avaliação não encontrada');

    const isSelf = evaluation.type === 'SELF';
    const updated = await this.prisma.userEvaluation.update({
      where: { id },
      data: {
        ...(isSelf
          ? { selfScore: dto.score, selfFeedback: dto.feedback }
          : { managerScore: dto.score, managerFeedback: dto.feedback }),
        finalScore: dto.score,
        strengths: dto.strengths,
        improvements: dto.improvements,
        developmentPlan: dto.developmentPlan,
        status: 'CLOSED',
        submittedAt: new Date(),
      },
    });
    await this.audit(evaluatorId, 'UPDATE', 'UserEvaluation', id, { status: 'CLOSED', score: dto.score });
    await this.prisma.notificationLog.create({
      data: {
        userId: evaluation.userId,
        title: 'Avaliação concluída',
        message: 'A tua avaliação de desempenho foi concluída.',
        metadata: JSON.stringify({ evaluationId: id }),
      },
    });
    return updated;
  }

  async getMyEvaluations(userId: string) {
    return this.prisma.userEvaluation.findMany({
      where: { userId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
      include: {
        cycle: { select: { name: true, type: true } },
        evaluator: { select: { fullName: true } },
      },
    });
  }

  async getEvaluationsToComplete(evaluatorId: string) {
    return this.prisma.userEvaluation.findMany({
      where: { evaluatorId, status: { in: ['PENDING', 'OPEN'] }, deletedAt: null },
      orderBy: { createdAt: 'asc' },
      include: {
        user: { select: { fullName: true } },
        cycle: { select: { name: true } },
      },
    });
  }

  // ════════════════════════════════════════════════════
  // DASHBOARD
  // ════════════════════════════════════════════════════

  async getDashboard() {
    const [
      activeCycles, totalObjectives, completedObjectives,
      activeIndicators, recordsThisMonth,
      activeEvalCycles, pendingEvaluations, completedEvaluations,
    ] = await this.prisma.$transaction([
      this.prisma.okrCycle.count({ where: { status: 'ACTIVE', deletedAt: null } }),
      this.prisma.objective.count({ where: { deletedAt: null } }),
      this.prisma.objective.count({ where: { status: 'COMPLETED', deletedAt: null } }),
      this.prisma.monitoringIndicator.count({ where: { isActive: true, deletedAt: null } }),
      this.prisma.monitoringRecord.count({
        where: { createdAt: { gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1) } },
      }),
      this.prisma.evaluationCycle.count({
        where: { status: { in: ['OPEN', 'SELF_EVAL', 'MANAGER_EVAL'] }, deletedAt: null },
      }),
      this.prisma.userEvaluation.count({ where: { status: { in: ['PENDING', 'OPEN'] }, deletedAt: null } }),
      this.prisma.userEvaluation.count({ where: { status: 'CLOSED', deletedAt: null } }),
    ]);
    return {
      okrs: {
        activeCycles, totalObjectives, completedObjectives,
        objectiveCompletionRate: totalObjectives > 0
          ? Math.round((completedObjectives / totalObjectives) * 100) : 0,
      },
      monitoring: { activeIndicators, recordsThisMonth },
      evaluation: {
        activeEvalCycles, pendingEvaluations, completedEvaluations,
        evaluationCompletionRate: (pendingEvaluations + completedEvaluations) > 0
          ? Math.round((completedEvaluations / (pendingEvaluations + completedEvaluations)) * 100) : 0,
      },
    };
  }

  // ─── HELPER ──────────────────────────────────────────

  private async audit(userId: string, action: string, entity: string, entityId: string, meta: any) {
    await this.prisma.auditLog.create({
      data: { userId, action, entity, entityId, metadata: JSON.stringify(meta) },
    });
  }
}
```

---

## PASSO 4 — Controller Completo

```typescript
// src/monitoring/monitoring.controller.ts
import {
  Controller, Get, Post, Put, Body, Param, Query, UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard }   from '../auth/guards/roles.guard';
import { Roles }        from '../auth/decorators/roles.decorator';
import { CurrentUser }  from '../auth/decorators/current-user.decorator';
import { MonitoringService } from './monitoring.service';
import {
  CreateOkrCycleDto, CreateObjectiveDto, CreateKeyResultDto,
  UpdateKeyResultDto, CreateIndicatorDto, CreateRecordDto,
  CreateEvalCycleDto, SubmitEvaluationDto,
} from './dto';

@ApiTags('Monitoria e Avaliação')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('monitoring')
export class MonitoringController {
  constructor(private readonly service: MonitoringService) {}

  // ─── DASHBOARD ───────────────────────────────────────

  @Get('dashboard')
  @Roles('ADMIN', 'RH', 'MANAGER')
  @ApiOperation({ summary: 'Dashboard de Monitoria e Avaliação' })
  getDashboard() {
    return this.service.getDashboard();
  }

  // ─── OKRs ────────────────────────────────────────────

  @Post('okr/cycles')
  @Roles('ADMIN', 'RH', 'MANAGER')
  @ApiOperation({ summary: 'Criar ciclo OKR' })
  createOkrCycle(@Body() dto: CreateOkrCycleDto, @CurrentUser() user: any) {
    return this.service.createOkrCycle(dto, user.id);
  }

  @Get('okr/cycles')
  @ApiOperation({ summary: 'Listar ciclos OKR' })
  findAllCycles() {
    return this.service.findAllCycles();
  }

  @Post('okr/objectives')
  @ApiOperation({ summary: 'Criar objectivo' })
  createObjective(@Body() dto: CreateObjectiveDto, @CurrentUser() user: any) {
    return this.service.createObjective(dto, user.id);
  }

  @Get('okr/cycles/:cycleId/objectives')
  @ApiOperation({ summary: 'Objectivos de um ciclo' })
  findObjectives(@Param('cycleId') cycleId: string, @Query('ownerId') ownerId?: string) {
    return this.service.findObjectives(cycleId, ownerId);
  }

  @Post('okr/key-results')
  @ApiOperation({ summary: 'Criar Key Result' })
  createKeyResult(@Body() dto: CreateKeyResultDto, @CurrentUser() user: any) {
    return this.service.createKeyResult(dto, user.id);
  }

  @Put('okr/key-results/:id')
  @ApiOperation({ summary: 'Actualizar progresso do Key Result' })
  updateKeyResult(@Param('id') id: string, @Body() dto: UpdateKeyResultDto, @CurrentUser() user: any) {
    return this.service.updateKeyResult(id, dto, user.id);
  }

  // ─── INDICADORES ─────────────────────────────────────

  @Post('indicators')
  @Roles('ADMIN', 'RH', 'MANAGER')
  @ApiOperation({ summary: 'Criar indicador de monitoria' })
  createIndicator(@Body() dto: CreateIndicatorDto, @CurrentUser() user: any) {
    return this.service.createIndicator(dto, user.id);
  }

  @Get('indicators')
  @ApiOperation({ summary: 'Listar indicadores (paginado)' })
  findAllIndicators(
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('category') category?: string,
  ) {
    return this.service.findAllIndicators(page, limit, category);
  }

  @Post('indicators/:id/records')
  @Roles('ADMIN', 'RH', 'MANAGER')
  @ApiOperation({ summary: 'Registar valor do indicador' })
  addRecord(@Param('id') id: string, @Body() dto: CreateRecordDto, @CurrentUser() user: any) {
    return this.service.addRecord(id, dto, user.id);
  }

  @Get('indicators/:id/history')
  @ApiOperation({ summary: 'Histórico do indicador' })
  getIndicatorHistory(@Param('id') id: string) {
    return this.service.getIndicatorHistory(id);
  }

  // ─── AVALIAÇÃO ───────────────────────────────────────

  @Post('evaluation/cycles')
  @Roles('ADMIN', 'RH')
  @ApiOperation({ summary: 'Criar ciclo de avaliação' })
  createEvalCycle(@Body() dto: CreateEvalCycleDto, @CurrentUser() user: any) {
    return this.service.createEvalCycle(dto, user.id);
  }

  @Post('evaluation/cycles/:cycleId/assign')
  @Roles('ADMIN', 'RH', 'MANAGER')
  @ApiOperation({ summary: 'Atribuir avaliação' })
  assignEvaluation(
    @Param('cycleId') cycleId: string,
    @Body('userId') userId: string,
    @Body('evaluatorId') evaluatorId: string,
    @Body('type') type: string,
    @CurrentUser() user: any,
  ) {
    return this.service.assignEvaluation(cycleId, userId, evaluatorId, type || 'MANAGER', user.id);
  }

  @Put('evaluation/:id/submit')
  @ApiOperation({ summary: 'Submeter avaliação' })
  submitEvaluation(@Param('id') id: string, @Body() dto: SubmitEvaluationDto, @CurrentUser() user: any) {
    return this.service.submitEvaluation(id, dto, user.id);
  }

  @Get('evaluation/my-evaluations')
  @ApiOperation({ summary: 'As minhas avaliações' })
  getMyEvaluations(@CurrentUser() user: any) {
    return this.service.getMyEvaluations(user.id);
  }

  @Get('evaluation/to-complete')
  @ApiOperation({ summary: 'Avaliações que tenho de completar' })
  getEvaluationsToComplete(@CurrentUser() user: any) {
    return this.service.getEvaluationsToComplete(user.id);
  }
}
```

---

## PASSO 5 — Module

```typescript
// src/monitoring/monitoring.module.ts
import { Module }    from '@nestjs/common';
import { MonitoringController } from './monitoring.controller';
import { MonitoringService }    from './monitoring.service';
import { PrismaModule }         from '../prisma/prisma.module';

@Module({
  imports:     [PrismaModule],
  controllers: [MonitoringController],
  providers:   [MonitoringService],
  exports:     [MonitoringService],
})
export class MonitoringModule {}
```

```typescript
// src/app.module.ts — adicionar:
import { MonitoringModule } from './monitoring/monitoring.module';
imports: [ ...existentes..., MonitoringModule ],
```

---

## PASSO 6 — Spec File (10 testes)

```typescript
// src/monitoring/monitoring.service.spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import { MonitoringService } from './monitoring.service';
import { PrismaService } from '../prisma/prisma.service';
import { NotFoundException, ConflictException } from '@nestjs/common';

const mockPrisma = {
  okrCycle: {
    create: jest.fn(), findUnique: jest.fn(), findMany: jest.fn(), count: jest.fn(),
  },
  objective: {
    create: jest.fn(), findUnique: jest.fn(), findMany: jest.fn(),
    update: jest.fn(), count: jest.fn(),
  },
  keyResult: {
    create: jest.fn(), findUnique: jest.fn(), findMany: jest.fn(), update: jest.fn(),
  },
  keyResultUpdate: { create: jest.fn() },
  monitoringIndicator: {
    create: jest.fn(), findUnique: jest.fn(), findMany: jest.fn(), count: jest.fn(),
  },
  monitoringRecord: { create: jest.fn(), findMany: jest.fn(), count: jest.fn() },
  evaluationCycle: { create: jest.fn(), count: jest.fn() },
  userEvaluation: {
    create: jest.fn(), findUnique: jest.fn(), findMany: jest.fn(),
    update: jest.fn(), count: jest.fn(),
  },
  auditLog:        { create: jest.fn() },
  notificationLog: { create: jest.fn() },
  $transaction:    jest.fn(),
};

describe('MonitoringService', () => {
  let service: MonitoringService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [MonitoringService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();
    service = module.get<MonitoringService>(MonitoringService);
    jest.clearAllMocks();
  });

  // ─── OKRs ────────────────────────────────────────────

  describe('createOkrCycle', () => {
    it('deve criar ciclo OKR', async () => {
      mockPrisma.okrCycle.create.mockResolvedValue({ id: 'cyc-1', name: 'Q2 2026' });
      mockPrisma.auditLog.create.mockResolvedValue({});
      const result = await service.createOkrCycle(
        { name: 'Q2 2026', startDate: '2026-04-01', endDate: '2026-06-30' },
        'user-1',
      );
      expect(result.name).toBe('Q2 2026');
    });
  });

  describe('createObjective', () => {
    it('deve criar objectivo num ciclo existente', async () => {
      mockPrisma.okrCycle.findUnique.mockResolvedValue({ id: 'cyc-1' });
      mockPrisma.objective.create.mockResolvedValue({ id: 'obj-1', title: 'Objectivo' });
      mockPrisma.auditLog.create.mockResolvedValue({});
      const result = await service.createObjective(
        { cycleId: 'cyc-1', ownerId: 'user-1', title: 'Objectivo' },
        'user-1',
      );
      expect(result.title).toBe('Objectivo');
    });

    it('deve lançar NotFoundException se ciclo não existe', async () => {
      mockPrisma.okrCycle.findUnique.mockResolvedValue(null);
      await expect(
        service.createObjective({ cycleId: 'x', ownerId: 'u', title: 't' }, 'user-1'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('updateKeyResult', () => {
    it('deve calcular progresso e marcar COMPLETED', async () => {
      mockPrisma.keyResult.findUnique.mockResolvedValue({
        id: 'kr-1', objectiveId: 'obj-1', startValue: 0, targetValue: 100, currentValue: 0,
      });
      mockPrisma.keyResultUpdate.create.mockResolvedValue({});
      mockPrisma.keyResult.update.mockResolvedValue({ id: 'kr-1', progress: 100, status: 'COMPLETED' });
      mockPrisma.keyResult.findMany.mockResolvedValue([{ progress: 100 }]);
      mockPrisma.objective.update.mockResolvedValue({});
      mockPrisma.auditLog.create.mockResolvedValue({});

      const result = await service.updateKeyResult('kr-1', { newValue: 100 }, 'user-1');
      expect(result.progress).toBe(100);
      expect(result.status).toBe('COMPLETED');
    });

    it('deve marcar AT_RISK para progresso entre 40-70', async () => {
      mockPrisma.keyResult.findUnique.mockResolvedValue({
        id: 'kr-1', objectiveId: 'obj-1', startValue: 0, targetValue: 100, currentValue: 0,
      });
      mockPrisma.keyResultUpdate.create.mockResolvedValue({});
      mockPrisma.keyResult.update.mockResolvedValue({ id: 'kr-1', progress: 50, status: 'AT_RISK' });
      mockPrisma.keyResult.findMany.mockResolvedValue([{ progress: 50 }]);
      mockPrisma.objective.update.mockResolvedValue({});
      mockPrisma.auditLog.create.mockResolvedValue({});

      const result = await service.updateKeyResult('kr-1', { newValue: 50 }, 'user-1');
      expect(result.status).toBe('AT_RISK');
    });
  });

  // ─── INDICADORES ─────────────────────────────────────

  describe('createIndicator', () => {
    it('deve criar indicador com código', async () => {
      mockPrisma.monitoringIndicator.findUnique.mockResolvedValue(null);
      mockPrisma.monitoringIndicator.create.mockResolvedValue({ id: 'ind-1', code: 'IND-001' });
      mockPrisma.auditLog.create.mockResolvedValue({});
      const result = await service.createIndicator(
        { code: 'IND-001', name: 'Taxa Conclusão' },
        'user-1',
      );
      expect(result.code).toBe('IND-001');
    });

    it('deve lançar ConflictException se código existe', async () => {
      mockPrisma.monitoringIndicator.findUnique.mockResolvedValue({ id: 'ind-1', deletedAt: null });
      await expect(
        service.createIndicator({ code: 'IND-001', name: 'X' }, 'user-1'),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('addRecord', () => {
    it('deve calcular variância vs target', async () => {
      mockPrisma.monitoringIndicator.findUnique.mockResolvedValue({
        id: 'ind-1', target: 80,
      });
      mockPrisma.monitoringRecord.create.mockResolvedValue({
        id: 'rec-1', value: 90, variance: 10, variancePct: 12.5,
      });
      mockPrisma.auditLog.create.mockResolvedValue({});
      const result = await service.addRecord(
        'ind-1', { value: 90, period: '2026-06' }, 'user-1',
      );
      expect(result.variance).toBe(10);
    });
  });

  // ─── AVALIAÇÃO ───────────────────────────────────────

  describe('submitEvaluation', () => {
    it('deve submeter avaliação e fechar', async () => {
      mockPrisma.userEvaluation.findUnique.mockResolvedValue({
        id: 'ev-1', type: 'MANAGER', userId: 'user-2',
      });
      mockPrisma.userEvaluation.update.mockResolvedValue({
        id: 'ev-1', status: 'CLOSED', finalScore: 85,
      });
      mockPrisma.auditLog.create.mockResolvedValue({});
      mockPrisma.notificationLog.create.mockResolvedValue({});

      const result = await service.submitEvaluation('ev-1', { score: 85 }, 'evaluator-1');
      expect(result.status).toBe('CLOSED');
    });

    it('deve lançar NotFoundException se avaliação não existe', async () => {
      mockPrisma.userEvaluation.findUnique.mockResolvedValue(null);
      await expect(
        service.submitEvaluation('x', { score: 80 }, 'evaluator-1'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('getDashboard', () => {
    it('deve retornar OKRs, monitoring e evaluation', async () => {
      mockPrisma.$transaction.mockResolvedValue([2, 10, 6, 5, 20, 1, 3, 7]);
      const result = await service.getDashboard();
      expect(result).toHaveProperty('okrs');
      expect(result).toHaveProperty('monitoring');
      expect(result).toHaveProperty('evaluation');
      expect(result.okrs.objectiveCompletionRate).toBe(60);
    });
  });
});
```

---

## PASSO 7 — Bruno CLI (8 ficheiros)

```
# bruno/monitoring/01-criar-ciclo-okr.bru
meta { name: Criar Ciclo OKR  type: http  seq: 1 }
post { url: {{baseUrl}}/monitoring/okr/cycles  body: json  auth: bearer }
auth:bearer { token: {{accessToken}} }
body:json {
  { "name": "Q2 2026 Bruno", "type": "QUARTERLY", "startDate": "2026-04-01", "endDate": "2026-06-30" }
}
tests {
  test("Status 201", function() { expect(res.status).to.equal(201); });
}
script:post-response {
  if (res.status === 201) { bru.setEnvVar("cycleId", res.body.id); }
}

---

# bruno/monitoring/02-criar-objectivo.bru
meta { name: Criar Objectivo  type: http  seq: 2 }
post { url: {{baseUrl}}/monitoring/okr/objectives  body: json  auth: bearer }
auth:bearer { token: {{accessToken}} }
body:json {
  { "cycleId": "{{cycleId}}", "ownerId": "{{testUserId}}", "title": "Objectivo Bruno de Teste", "type": "INDIVIDUAL" }
}
tests {
  test("Status 201", function() { expect(res.status).to.equal(201); });
}
script:post-response {
  if (res.status === 201) { bru.setEnvVar("objectiveId", res.body.id); }
}

---

# bruno/monitoring/03-criar-key-result.bru
meta { name: Criar Key Result  type: http  seq: 3 }
post { url: {{baseUrl}}/monitoring/okr/key-results  body: json  auth: bearer }
auth:bearer { token: {{accessToken}} }
body:json {
  { "objectiveId": "{{objectiveId}}", "title": "Atingir 80%", "startValue": 0, "targetValue": 80, "unit": "%" }
}
tests {
  test("Status 201", function() { expect(res.status).to.equal(201); });
}
script:post-response {
  if (res.status === 201) { bru.setEnvVar("krId", res.body.id); }
}

---

# bruno/monitoring/04-actualizar-kr.bru
meta { name: Actualizar Key Result  type: http  seq: 4 }
put { url: {{baseUrl}}/monitoring/okr/key-results/{{krId}}  body: json  auth: bearer }
auth:bearer { token: {{accessToken}} }
body:json {
  { "newValue": 80, "notes": "Meta atingida" }
}
tests {
  test("Status 200", function() { expect(res.status).to.equal(200); });
  test("Progresso 100", function() { expect(res.body.progress).to.equal(100); });
}

---

# bruno/monitoring/05-criar-indicador.bru
meta { name: Criar Indicador  type: http  seq: 5 }
post { url: {{baseUrl}}/monitoring/indicators  body: json  auth: bearer }
auth:bearer { token: {{accessToken}} }
body:json {
  { "code": "IND-BRUNO", "name": "Taxa de Conclusão Bruno", "unit": "%", "target": 80, "frequency": "MONTHLY" }
}
tests {
  test("Status 201", function() { expect(res.status).to.equal(201); });
}
script:post-response {
  if (res.status === 201) { bru.setEnvVar("indicatorId", res.body.id); }
}

---

# bruno/monitoring/06-registar-valor.bru
meta { name: Registar Valor Indicador  type: http  seq: 6 }
post { url: {{baseUrl}}/monitoring/indicators/{{indicatorId}}/records  body: json  auth: bearer }
auth:bearer { token: {{accessToken}} }
body:json {
  { "value": 85, "period": "2026-06", "notes": "Acima da meta" }
}
tests {
  test("Status 201", function() { expect(res.status).to.equal(201); });
  test("Variância positiva", function() { expect(res.body.variance).to.equal(5); });
}

---

# bruno/monitoring/07-criar-ciclo-avaliacao.bru
meta { name: Criar Ciclo Avaliação  type: http  seq: 7 }
post { url: {{baseUrl}}/monitoring/evaluation/cycles  body: json  auth: bearer }
auth:bearer { token: {{accessToken}} }
body:json {
  { "name": "Avaliação Anual 2026 Bruno", "type": "ANNUAL", "startDate": "2026-01-01", "endDate": "2026-12-31" }
}
tests {
  test("Status 201", function() { expect(res.status).to.equal(201); });
}

---

# bruno/monitoring/08-dashboard.bru
meta { name: Dashboard M&E  type: http  seq: 8 }
get { url: {{baseUrl}}/monitoring/dashboard  auth: bearer }
auth:bearer { token: {{accessToken}} }
tests {
  test("Status 200", function() { expect(res.status).to.equal(200); });
  test("Tem 3 pilares", function() {
    expect(res.body).to.have.property("okrs");
    expect(res.body).to.have.property("monitoring");
    expect(res.body).to.have.property("evaluation");
  });
}
```

---

## PASSO 8 — Frontend Completo

```tsx
// frontend/app/monitoring/okrs/page.tsx
'use client';
import { useState, useEffect, useCallback } from 'react';

const STATUS_COLORS: Record<string, string> = {
  ON_TRACK:  'bg-green-100 text-green-800',
  AT_RISK:   'bg-yellow-100 text-yellow-800',
  OFF_TRACK: 'bg-red-100 text-red-800',
  COMPLETED: 'bg-blue-100 text-blue-800',
};

export default function OkrsPage() {
  const [cycles, setCycles]       = useState<any[]>([]);
  const [selectedCycle, setSelectedCycle] = useState<string>('');
  const [objectives, setObjectives] = useState<any[]>([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState('');

  const fetchCycles = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const res = await fetch('/api/monitoring/okr/cycles', { credentials: 'include' });
      if (!res.ok) throw new Error('Erro ao carregar ciclos');
      const json = await res.json();
      setCycles(json);
      if (json.length > 0) setSelectedCycle(json[0].id);
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  }, []);

  const fetchObjectives = useCallback(async (cycleId: string) => {
    try {
      const res = await fetch(`/api/monitoring/okr/cycles/${cycleId}/objectives`, { credentials: 'include' });
      if (res.ok) setObjectives(await res.json());
    } catch { /* silencioso */ }
  }, []);

  useEffect(() => { fetchCycles(); }, [fetchCycles]);
  useEffect(() => { if (selectedCycle) fetchObjectives(selectedCycle); }, [selectedCycle, fetchObjectives]);

  if (loading) return (
    <div className="p-6 space-y-4">
      {[...Array(4)].map((_, i) => (
        <div key={i} className="h-32 bg-gray-100 rounded-lg animate-pulse" />
      ))}
    </div>
  );

  if (error) return (
    <div className="p-6">
      <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-lg">
        {error}
        <button onClick={fetchCycles} className="ml-4 underline">Tentar novamente</button>
      </div>
    </div>
  );

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-gray-900">OKRs — Objectivos e Resultados-Chave</h1>
        <a href="/monitoring/okrs/novo"
          className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700">
          + Novo Objectivo
        </a>
      </div>

      {/* Selector de ciclo */}
      <select value={selectedCycle} onChange={e => setSelectedCycle(e.target.value)}
        className="border rounded-lg px-4 py-2">
        {cycles.map(c => (
          <option key={c.id} value={c.id}>{c.name}</option>
        ))}
      </select>

      {/* Objectivos */}
      {objectives.length === 0 ? (
        <div className="text-center py-12 text-gray-400">Nenhum objectivo neste ciclo</div>
      ) : (
        <div className="space-y-4">
          {objectives.map((obj: any) => (
            <div key={obj.id} className="bg-white rounded-lg shadow p-5">
              <div className="flex justify-between items-start mb-3">
                <div>
                  <span className="text-xs text-gray-400 uppercase">{obj.type}</span>
                  <h3 className="font-semibold text-gray-900">{obj.title}</h3>
                  <p className="text-sm text-gray-500">{obj.owner?.fullName}</p>
                </div>
                <div className="text-right">
                  <span className="text-2xl font-bold text-blue-600">{Math.round(obj.progress)}%</span>
                </div>
              </div>

              {/* Barra de progresso do objectivo */}
              <div className="w-full bg-gray-100 rounded-full h-2 mb-4">
                <div className="bg-blue-600 h-2 rounded-full" style={{ width: `${obj.progress}%` }} />
              </div>

              {/* Key Results */}
              <div className="space-y-2">
                {obj.keyResults?.map((kr: any) => (
                  <div key={kr.id} className="flex justify-between items-center bg-gray-50 rounded-lg p-3">
                    <div className="flex-1">
                      <p className="text-sm font-medium">{kr.title}</p>
                      <p className="text-xs text-gray-400">
                        {kr.currentValue} / {kr.targetValue} {kr.unit}
                      </p>
                    </div>
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${STATUS_COLORS[kr.status]}`}>
                      {Math.round(kr.progress)}%
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

---

## PROMPT PARA O CLAUDE CODE

```
O Módulo 8 (LMS Completo) está completo e aprovado.
Implementa agora o Módulo 9 — Monitoria e Avaliação.
ESTE É O ÚLTIMO MÓDULO — fecha o ciclo dos 9.
Lê o MONITORIA-AVALIACAO-GUIDE.md na raiz do projecto.

ATENÇÃO: este módulo tem 3 pilares integrados:
1. OKRs (ciclos → objectivos → key results)
2. Indicadores de Monitoria (M&E)
3. Avaliação de Desempenho

Segue EXACTAMENTE estes 22 passos:

1. Verifica modelos existentes
   (pode existir 360 evaluation antigo — não confundir)

2. Adiciona ao prisma/schema.prisma:
   OkrCycle, Objective, KeyResult, KeyResultUpdate,
   MonitoringIndicator, MonitoringRecord,
   EvaluationCycle, UserEvaluation + 5 enums

3. npx prisma validate
4. npx prisma migrate dev --name "add_monitoring_evaluation"
5. npx prisma generate

6. Cria src/monitoring/dto/ com os 8 DTOs

7. Cria src/monitoring/monitoring.service.ts
   (OKRs + indicadores + avaliações + dashboard)

8. Cria src/monitoring/monitoring.controller.ts

9. Cria src/monitoring/monitoring.module.ts

10. Adiciona MonitoringModule ao src/app.module.ts

11. npm run build → DEVE PASSAR com 0 erros

12. Cria o spec file (10 testes — módulo complexo)

13. npm run test -- --testPathPattern=monitoring --forceExit
    → DEVE PASSAR com 0 falhas

14. npm run test:cov 2>&1 | tail -5
    → Se < 55% adiciona mais testes

15. Cria bruno/monitoring/ com os 8 ficheiros .bru
    (fluxo: ciclo OKR → objectivo → KR → actualizar →
    indicador → registo → ciclo avaliação → dashboard)

16. Com o backend a correr:
    npx bru run bruno/monitoring/ --env local
    → TODOS devem passar (por ordem 01→08)

17. Cria frontend/app/monitoring/okrs/page.tsx
    (objectivos com barra de progresso e key results)

18. Cria frontend/app/monitoring/indicators/page.tsx
    (indicadores com valores vs target)

19. Cria frontend/app/monitoring/evaluations/page.tsx
    (minhas avaliações + avaliações a completar)

20. Adiciona ao sidebar: link para /monitoring/okrs

21. git add -A
    git commit -m "feat: Monitoria e Avaliação completa - OKRs, indicadores, avaliações, 10 specs, 8 bruno" --no-verify
    git push origin main

22. VERIFICAÇÃO FINAL DOS 9 MÓDULOS:
    npm run build → 0 erros
    npm run test → todos passam
    npm run test:cov → > 65%
    npx bru run bruno/ --env local → todos passam
    Mostra resumo final de TODOS os 9 módulos implementados

REGRAS ABSOLUTAS DO INNOVA:
- fullName (NUNCA name) — User model
- entity (NUNCA entityType) — AuditLog
- metadata → JSON.stringify()
- deletedAt em TODOS os novos modelos
- auditLog em CREATE, UPDATE, DELETE
- Paginação: { data, total, page, limit, totalPages }
- Backend porta 4000 | Frontend porta 3000

EXECUTA UMA OPERAÇÃO DE CADA VEZ.
A CADA 20 MINUTOS FAZ COMMIT PARCIAL.
SE FICAR LENTA (>25 min): commit e para.
```

---

*INNOVA — Monitoria e Avaliação Guide v1.0 (MÓDULO FINAL)*
*Mesmo padrão dos Módulos 1-8*
*SAP SuccessFactors + Workday Performance + OKR (Google/Intel) + 15Five*
*OKRs (cascata) + Indicadores M&E + Avaliação 360° + Dashboard integrado*
