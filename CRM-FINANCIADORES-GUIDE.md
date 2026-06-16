# INNOVA — Módulo 3: CRM Financiadores
> Mesmo padrão dos Módulos 1 e 2
> Referência: Blackbaud Raiser's Edge + Salesforce Nonprofit Cloud

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

## CHECKLIST OBRIGATÓRIO

```
□ Schema Prisma + migrate dev
□ DTOs (create + update + filter + interaction + grant + disbursement + report)
□ Service completo (CRUD + grants + desembolsos + relatórios + dashboard)
□ Controller completo (Swagger + Guards + rotas RESTful)
□ Module registado no AppModule
□ Spec file (8 testes mínimo)
□ Bruno CLI (6 ficheiros .bru)
□ Frontend page.tsx (lista + loading + paginação + filtros)
□ Frontend [id]/page.tsx (detalhe + grants + interacções)
□ Frontend novo/page.tsx (formulário completo)
□ npm run build → 0 erros
□ npm run test → 0 falhas
□ npm run test:cov → > 55%
□ npx bru run bruno/crm-funders/ → passa
□ git commit descritivo
```

---

## PASSO 1 — Schema Prisma

```prisma
# Adicionar a prisma/schema.prisma

model Funder {
  id                String       @id @default(cuid())
  code              String       @unique
  name              String
  legalName         String?
  type              FunderType
  category          String?
  contactName       String?
  contactTitle      String?
  email             String?
  phone             String?
  mobile            String?
  website           String?
  country           String?
  region            String?
  nif               String?
  status            FunderStatus @default(ACTIVE)
  relationshipStart DateTime?
  totalCommitted    Float        @default(0)
  totalReceived     Float        @default(0)
  totalPending      Float        @default(0)
  currency          String       @default("AOA")
  focusAreas        String[]
  tags              String[]
  reportingReqs     String?
  assignedToId      String?
  notes             String?
  lastContactAt     DateTime?
  nextReportDue     DateTime?
  satisfactionAvg   Float        @default(0)
  createdById       String
  createdAt         DateTime     @default(now())
  updatedAt         DateTime     @updatedAt
  deletedAt         DateTime?

  createdBy    User               @relation("FunderCreator",  fields: [createdById],  references: [id])
  assignedTo   User?              @relation("FunderOwner",    fields: [assignedToId], references: [id])
  grants       FundingGrant[]
  interactions FunderInteraction[]
  reports      FunderReport[]

  @@index([type])
  @@index([status])
  @@index([assignedToId])
  @@index([nextReportDue])
  @@index([deletedAt])
}

model FundingGrant {
  id             String      @id @default(cuid())
  funderId       String
  code           String      @unique
  title          String
  description    String?
  amount         Float
  disbursed      Float       @default(0)
  currency       String      @default("AOA")
  exchangeRate   Float?
  startDate      DateTime
  endDate        DateTime?
  status         GrantStatus @default(ACTIVE)
  objectives     String[]
  conditions     String?
  reportingCycle String      @default("quarterly")
  nextReportDue  DateTime?
  programIds     String[]
  createdAt      DateTime    @default(now())
  updatedAt      DateTime    @updatedAt
  deletedAt      DateTime?

  funder        Funder              @relation(fields: [funderId], references: [id])
  disbursements GrantDisbursement[]
  reports       FunderReport[]

  @@index([funderId])
  @@index([status])
  @@index([nextReportDue])
  @@index([deletedAt])
}

model GrantDisbursement {
  id          String   @id @default(cuid())
  grantId     String
  amount      Float
  currency    String   @default("AOA")
  receivedAt  DateTime
  reference   String?
  bankRef     String?
  notes       String?
  createdById String
  createdAt   DateTime @default(now())
  deletedAt   DateTime?

  grant     FundingGrant @relation(fields: [grantId],     references: [id])
  createdBy User         @relation("DisbursementCreator", fields: [createdById], references: [id])

  @@index([grantId])
  @@index([receivedAt])
  @@index([deletedAt])
}

model FunderInteraction {
  id          String              @id @default(cuid())
  funderId    String
  userId      String
  grantId     String?
  type        FunderInteractionType
  subject     String
  description String
  date        DateTime            @default(now())
  durationMin Int?
  outcome     String?
  nextAction  String?
  nextDate    DateTime?
  satisfaction Int?
  attachments String[]
  isPrivate   Boolean             @default(false)
  createdAt   DateTime            @default(now())
  updatedAt   DateTime            @updatedAt
  deletedAt   DateTime?

  funder Funder        @relation(fields: [funderId], references: [id])
  user   User          @relation("FunderInteractionUser", fields: [userId],  references: [id])
  grant  FundingGrant? @relation(fields: [grantId],  references: [id])

  @@index([funderId])
  @@index([grantId])
  @@index([date])
  @@index([deletedAt])
}

model FunderReport {
  id          String       @id @default(cuid())
  funderId    String
  grantId     String?
  title       String
  period      String
  dueDate     DateTime
  submittedAt DateTime?
  status      ReportStatus @default(PENDING)
  fileUrl     String?
  feedback    String?
  notes       String?
  createdById String
  createdAt   DateTime     @default(now())
  updatedAt   DateTime     @updatedAt
  deletedAt   DateTime?

  funder    Funder        @relation(fields: [funderId],   references: [id])
  grant     FundingGrant? @relation(fields: [grantId],   references: [id])
  createdBy User          @relation("ReportCreator",     fields: [createdById], references: [id])

  @@index([funderId])
  @@index([grantId])
  @@index([status])
  @@index([dueDate])
  @@index([deletedAt])
}

enum FunderType {
  GOVERNMENT BILATERAL MULTILATERAL
  NGO PRIVATE_FOUNDATION CORPORATE OTHER
}
enum FunderStatus        { ACTIVE INACTIVE PROSPECT FORMER SUSPENDED }
enum GrantStatus         { ACTIVE COMPLETED SUSPENDED CANCELLED CLOSED }
enum FunderInteractionType { EMAIL CALL MEETING VISIT EVENT NOTE REVIEW }
enum ReportStatus        { PENDING SUBMITTED APPROVED REJECTED OVERDUE }
```

```bash
npx prisma validate
npx prisma migrate dev --name "add_crm_funders"
npx prisma generate
```

---

## PASSO 2 — DTOs

```typescript
// src/crm-funders/dto/create-funder.dto.ts
import {
  IsString, IsOptional, IsEmail, IsEnum,
  IsArray, IsDateString, Length,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { FunderType, FunderStatus } from '@prisma/client';

export class CreateFunderDto {
  @ApiProperty({ enum: FunderType })
  @IsEnum(FunderType)
  type: FunderType;

  @ApiProperty({ example: 'União Europeia — Delegação Angola' })
  @IsString() @Length(2, 200)
  name: string;

  @ApiPropertyOptional()
  @IsOptional() @IsString()
  legalName?: string;

  @ApiPropertyOptional({ example: 'Bilateral' })
  @IsOptional() @IsString()
  category?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsString()
  contactName?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsString()
  contactTitle?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsEmail()
  email?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsString()
  phone?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsString()
  mobile?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsString()
  website?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsString()
  country?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsString()
  region?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsString()
  nif?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsDateString()
  relationshipStart?: string;

  @ApiPropertyOptional({ default: 'AOA' })
  @IsOptional() @IsString()
  currency?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional() @IsArray() @IsString({ each: true })
  focusAreas?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional() @IsArray() @IsString({ each: true })
  tags?: string[];

  @ApiPropertyOptional()
  @IsOptional() @IsString()
  reportingReqs?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsString()
  assignedToId?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsString()
  notes?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsDateString()
  nextReportDue?: string;
}

// src/crm-funders/dto/update-funder.dto.ts
import { PartialType } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';
import { FunderStatus } from '@prisma/client';
import { CreateFunderDto } from './create-funder.dto';

export class UpdateFunderDto extends PartialType(CreateFunderDto) {
  @IsOptional() @IsEnum(FunderStatus)
  status?: FunderStatus;
}

// src/crm-funders/dto/filter-funder.dto.ts
import { IsOptional, IsEnum, IsString, IsInt, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { FunderType, FunderStatus } from '@prisma/client';

export class FilterFunderDto {
  @ApiPropertyOptional() @IsOptional() @IsEnum(FunderType)   type?:   FunderType;
  @ApiPropertyOptional() @IsOptional() @IsEnum(FunderStatus) status?: FunderStatus;
  @ApiPropertyOptional() @IsOptional() @IsString()           search?: string;
  @ApiPropertyOptional() @IsOptional() @IsString()           country?: string;
  @ApiPropertyOptional() @IsOptional() @IsString()           assignedToId?: string;
  @ApiPropertyOptional({ default: 1  }) @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?:  number = 1;
  @ApiPropertyOptional({ default: 20 }) @IsOptional() @Type(() => Number) @IsInt() @Min(1) limit?: number = 20;
}

// src/crm-funders/dto/create-grant.dto.ts
import {
  IsString, IsOptional, IsNumber, IsDateString,
  IsArray, Min, Length,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateGrantDto {
  @ApiProperty()
  @IsString() @Length(2, 200)
  title: string;

  @ApiPropertyOptional()
  @IsOptional() @IsString()
  description?: string;

  @ApiProperty()
  @IsNumber() @Min(0)
  amount: number;

  @ApiPropertyOptional({ default: 'AOA' })
  @IsOptional() @IsString()
  currency?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsNumber() @Min(0)
  exchangeRate?: number;

  @ApiProperty()
  @IsDateString()
  startDate: string;

  @ApiPropertyOptional()
  @IsOptional() @IsDateString()
  endDate?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional() @IsArray() @IsString({ each: true })
  objectives?: string[];

  @ApiPropertyOptional()
  @IsOptional() @IsString()
  conditions?: string;

  @ApiPropertyOptional({ default: 'quarterly' })
  @IsOptional() @IsString()
  reportingCycle?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsDateString()
  nextReportDue?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional() @IsArray() @IsString({ each: true })
  programIds?: string[];
}

// src/crm-funders/dto/create-disbursement.dto.ts
import { IsNumber, IsOptional, IsString, IsDateString, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateDisbursementDto {
  @ApiProperty()
  @IsNumber() @Min(0)
  amount: number;

  @ApiPropertyOptional({ default: 'AOA' })
  @IsOptional() @IsString()
  currency?: string;

  @ApiProperty()
  @IsDateString()
  receivedAt: string;

  @ApiPropertyOptional()
  @IsOptional() @IsString()
  reference?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsString()
  bankRef?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsString()
  notes?: string;
}

// src/crm-funders/dto/create-funder-interaction.dto.ts
import {
  IsString, IsOptional, IsEnum, IsInt,
  IsDateString, IsArray, Min, Max, IsBoolean,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { FunderInteractionType } from '@prisma/client';

export class CreateFunderInteractionDto {
  @ApiProperty({ enum: FunderInteractionType })
  @IsEnum(FunderInteractionType)
  type: FunderInteractionType;

  @ApiProperty()
  @IsString()
  subject: string;

  @ApiProperty()
  @IsString()
  description: string;

  @ApiPropertyOptional()
  @IsOptional() @IsString()
  grantId?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsString()
  channel?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsDateString()
  date?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsInt() @Min(1)
  durationMin?: number;

  @ApiPropertyOptional()
  @IsOptional() @IsString()
  outcome?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsString()
  nextAction?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsDateString()
  nextDate?: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 5 })
  @IsOptional() @IsInt() @Min(1) @Max(5)
  satisfaction?: number;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional() @IsArray() @IsString({ each: true })
  attachments?: string[];

  @ApiPropertyOptional()
  @IsOptional() @IsBoolean()
  isPrivate?: boolean;
}

// src/crm-funders/dto/create-report.dto.ts
import { IsString, IsOptional, IsDateString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateFunderReportDto {
  @ApiProperty()
  @IsString()
  title: string;

  @ApiProperty({ example: 'Q2 2026' })
  @IsString()
  period: string;

  @ApiProperty()
  @IsDateString()
  dueDate: string;

  @ApiPropertyOptional()
  @IsOptional() @IsString()
  grantId?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsString()
  notes?: string;
}

// src/crm-funders/dto/index.ts
export * from './create-funder.dto';
export * from './update-funder.dto';
export * from './filter-funder.dto';
export * from './create-grant.dto';
export * from './create-disbursement.dto';
export * from './create-funder-interaction.dto';
export * from './create-report.dto';
```

---

## PASSO 3 — Service Completo

```typescript
// src/crm-funders/crm-funders.service.ts
import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateFunderDto, UpdateFunderDto, FilterFunderDto,
  CreateGrantDto, CreateDisbursementDto,
  CreateFunderInteractionDto, CreateFunderReportDto,
} from './dto';

@Injectable()
export class CrmFundersService {
  constructor(private prisma: PrismaService) {}

  // ─── CÓDIGO AUTO-GERADO ──────────────────────────────

  private async generateCode(prefix: string, model: 'funder' | 'fundingGrant'): Promise<string> {
    const last = await (this.prisma[model] as any).findFirst({
      orderBy: { code: 'desc' },
      select: { code: true },
    });
    const num = last ? parseInt(last.code.replace(`${prefix}-`, '')) + 1 : 1;
    return `${prefix}-${String(num).padStart(5, '0')}`;
  }

  // ─── CRUD FINANCIADORES ──────────────────────────────

  async create(dto: CreateFunderDto, userId: string) {
    const code = await this.generateCode('FIN', 'funder');
    const funder = await this.prisma.funder.create({
      data: { ...dto, code, createdById: userId },
      include: {
        createdBy:  { select: { fullName: true } },
        assignedTo: { select: { fullName: true } },
      },
    });
    await this.audit(userId, 'CREATE', 'Funder', funder.id, { code, type: dto.type });
    return funder;
  }

  async findAll(filters: FilterFunderDto) {
    const { type, status, search, country, assignedToId, page = 1, limit = 20 } = filters;
    const where: any = {
      deletedAt: null,
      ...(type         && { type }),
      ...(status       && { status }),
      ...(country      && { country }),
      ...(assignedToId && { assignedToId }),
      ...(search && {
        OR: [
          { name:  { contains: search, mode: 'insensitive' } },
          { email: { contains: search, mode: 'insensitive' } },
          { code:  { contains: search, mode: 'insensitive' } },
        ],
      }),
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.funder.findMany({
        where, skip: (page - 1) * limit, take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          assignedTo: { select: { fullName: true } },
          _count: { select: { grants: true, interactions: true } },
        },
      }),
      this.prisma.funder.count({ where }),
    ]);
    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async findOne(id: string) {
    const funder = await this.prisma.funder.findUnique({
      where: { id },
      include: {
        createdBy:  { select: { fullName: true } },
        assignedTo: { select: { fullName: true, email: true } },
        grants: {
          where: { deletedAt: null },
          orderBy: { createdAt: 'desc' },
          include: {
            _count: { select: { disbursements: true } },
          },
        },
        interactions: {
          where: { deletedAt: null },
          orderBy: { date: 'desc' },
          take: 20,
          include: { user: { select: { fullName: true } } },
        },
        reports: {
          where: { deletedAt: null },
          orderBy: { dueDate: 'asc' },
        },
        _count: { select: { grants: true, interactions: true } },
      },
    });
    if (!funder || funder.deletedAt) throw new NotFoundException('Financiador não encontrado');
    return funder;
  }

  async update(id: string, dto: UpdateFunderDto, userId: string) {
    await this.findOne(id);
    const updated = await this.prisma.funder.update({ where: { id }, data: dto });
    await this.audit(userId, 'UPDATE', 'Funder', id, dto);
    return updated;
  }

  async softDelete(id: string, userId: string) {
    await this.findOne(id);
    await this.prisma.funder.update({
      where: { id },
      data: { deletedAt: new Date(), status: 'INACTIVE' },
    });
    await this.audit(userId, 'DELETE', 'Funder', id, { deletedAt: new Date() });
    return { message: 'Financiador removido com sucesso' };
  }

  // ─── GRANTS (FINANCIAMENTOS) ─────────────────────────

  async createGrant(funderId: string, dto: CreateGrantDto, userId: string) {
    await this.findOne(funderId);
    const code = await this.generateCode('GRT', 'fundingGrant');
    const grant = await this.prisma.fundingGrant.create({
      data: { ...dto, funderId, code },
    });
    await this.updateFunderTotals(funderId);
    await this.audit(userId, 'CREATE', 'FundingGrant', grant.id, { funderId, code });
    await this.prisma.notificationLog.create({
      data: {
        userId,
        title: 'Novo financiamento registado',
        message: `Grant "${grant.title}" no valor de ${dto.currency} ${dto.amount.toLocaleString('pt-AO')} criado.`,
        metadata: JSON.stringify({ grantId: grant.id, funderId }),
      },
    });
    return grant;
  }

  async findGrants(funderId: string, page = 1, limit = 20) {
    await this.findOne(funderId);
    const where = { funderId, deletedAt: null };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.fundingGrant.findMany({
        where, skip: (page - 1) * limit, take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          _count: { select: { disbursements: true, reports: true } },
        },
      }),
      this.prisma.fundingGrant.count({ where }),
    ]);
    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async updateGrantStatus(grantId: string, status: string, userId: string) {
    const grant = await this.prisma.fundingGrant.findUnique({ where: { id: grantId } });
    if (!grant) throw new NotFoundException('Grant não encontrado');
    const updated = await this.prisma.fundingGrant.update({
      where: { id: grantId }, data: { status: status as any },
    });
    await this.updateFunderTotals(grant.funderId);
    await this.audit(userId, 'UPDATE', 'FundingGrant', grantId, { status });
    return updated;
  }

  // ─── DESEMBOLSOS ─────────────────────────────────────

  async addDisbursement(grantId: string, dto: CreateDisbursementDto, userId: string) {
    const grant = await this.prisma.fundingGrant.findUnique({
      where: { id: grantId },
    });
    if (!grant) throw new NotFoundException('Grant não encontrado');

    const totalDisbursed = grant.disbursed + dto.amount;
    if (totalDisbursed > grant.amount) {
      throw new BadRequestException(
        `Desembolso excede o valor total do grant (${grant.amount} ${grant.currency})`
      );
    }

    const disbursement = await this.prisma.grantDisbursement.create({
      data: { ...dto, grantId, createdById: userId },
    });

    await this.prisma.fundingGrant.update({
      where: { id: grantId },
      data: { disbursed: totalDisbursed },
    });

    await this.updateFunderTotals(grant.funderId);
    await this.audit(userId, 'CREATE', 'GrantDisbursement', disbursement.id, {
      grantId, amount: dto.amount,
    });
    return disbursement;
  }

  async getDisbursements(grantId: string, page = 1, limit = 20) {
    const where = { grantId, deletedAt: null };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.grantDisbursement.findMany({
        where, skip: (page - 1) * limit, take: limit,
        orderBy: { receivedAt: 'desc' },
        include: { createdBy: { select: { fullName: true } } },
      }),
      this.prisma.grantDisbursement.count({ where }),
    ]);
    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  // ─── INTERACÇÕES ─────────────────────────────────────

  async addInteraction(funderId: string, dto: CreateFunderInteractionDto, userId: string) {
    await this.findOne(funderId);
    const interaction = await this.prisma.funderInteraction.create({
      data: { ...dto, funderId, userId },
      include: { user: { select: { fullName: true } } },
    });

    const ratings = await this.prisma.funderInteraction.findMany({
      where: { funderId, satisfaction: { not: null }, deletedAt: null },
      select: { satisfaction: true },
    });
    const avg = ratings.length > 0
      ? ratings.reduce((s, r) => s + (r.satisfaction || 0), 0) / ratings.length
      : 0;

    await this.prisma.funder.update({
      where: { id: funderId },
      data: {
        lastContactAt: new Date(),
        satisfactionAvg: avg,
        ...(dto.nextDate && { nextReportDue: new Date(dto.nextDate) }),
      },
    });
    await this.audit(userId, 'CREATE', 'FunderInteraction', interaction.id, { funderId });
    return interaction;
  }

  // ─── RELATÓRIOS ──────────────────────────────────────

  async createReport(funderId: string, dto: CreateFunderReportDto, userId: string) {
    await this.findOne(funderId);
    const report = await this.prisma.funderReport.create({
      data: { ...dto, funderId, createdById: userId },
    });
    await this.audit(userId, 'CREATE', 'FunderReport', report.id, { funderId, period: dto.period });
    return report;
  }

  async submitReport(reportId: string, fileUrl: string, userId: string) {
    const report = await this.prisma.funderReport.findUnique({ where: { id: reportId } });
    if (!report) throw new NotFoundException('Relatório não encontrado');
    const updated = await this.prisma.funderReport.update({
      where: { id: reportId },
      data: { status: 'SUBMITTED', submittedAt: new Date(), fileUrl },
    });
    await this.audit(userId, 'UPDATE', 'FunderReport', reportId, { status: 'SUBMITTED' });
    return updated;
  }

  async getOverdueReports() {
    return this.prisma.funderReport.findMany({
      where: {
        status: { in: ['PENDING', 'REJECTED'] },
        dueDate: { lt: new Date() },
        deletedAt: null,
      },
      include: {
        funder: { select: { name: true, code: true, email: true } },
        grant:  { select: { title: true, code: true } },
      },
      orderBy: { dueDate: 'asc' },
    });
  }

  // ─── DASHBOARD ───────────────────────────────────────

  async getDashboard() {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const in30Days = new Date(now.getTime() + 30 * 86400000);

    const [
      total, newThisMonth, active, byType, byStatus,
      totalCommitted, totalReceived, activeGrants,
      overdueReports, reportsThisMonth,
      recentDisbursements, recentInteractions,
    ] = await this.prisma.$transaction([
      this.prisma.funder.count({ where: { deletedAt: null } }),
      this.prisma.funder.count({ where: { createdAt: { gte: startOfMonth } } }),
      this.prisma.funder.count({ where: { status: 'ACTIVE', deletedAt: null } }),
      this.prisma.funder.groupBy({
        by: ['type'], where: { deletedAt: null }, _count: { id: true },
      }),
      this.prisma.funder.groupBy({
        by: ['status'], where: { deletedAt: null }, _count: { id: true },
      }),
      this.prisma.fundingGrant.aggregate({
        _sum: { amount: true },
        where: { status: 'ACTIVE', deletedAt: null },
      }),
      this.prisma.fundingGrant.aggregate({
        _sum: { disbursed: true },
        where: { status: 'ACTIVE', deletedAt: null },
      }),
      this.prisma.fundingGrant.count({
        where: { status: 'ACTIVE', deletedAt: null },
      }),
      this.prisma.funderReport.count({
        where: {
          status: { in: ['PENDING', 'REJECTED'] },
          dueDate: { lt: now },
        },
      }),
      this.prisma.funderReport.count({
        where: { dueDate: { lte: in30Days, gte: now }, status: 'PENDING' },
      }),
      this.prisma.grantDisbursement.findMany({
        where: { createdAt: { gte: startOfMonth }, deletedAt: null },
        orderBy: { receivedAt: 'desc' }, take: 5,
        include: {
          grant:     { select: { title: true, code: true } },
          createdBy: { select: { fullName: true } },
        },
      }),
      this.prisma.funderInteraction.findMany({
        where: { deletedAt: null },
        orderBy: { date: 'desc' }, take: 5,
        include: {
          funder: { select: { name: true, code: true } },
          user:   { select: { fullName: true } },
        },
      }),
    ]);

    const committed = totalCommitted._sum.amount   || 0;
    const received  = totalReceived._sum.disbursed || 0;

    return {
      totals: {
        total, newThisMonth, active, activeGrants,
        overdueReports, reportsThisMonth,
        totalCommitted: committed,
        totalReceived:  received,
        totalPending:   committed - received,
        executionRate:  committed > 0 ? (received / committed) * 100 : 0,
      },
      distributions: { byType, byStatus },
      recentDisbursements,
      recentInteractions,
    };
  }

  async getReport(startDate: Date, endDate: Date) {
    const range = { gte: startDate, lte: endDate };
    const [created, byType, grantsCreated, totalDisbursed, reports] =
      await this.prisma.$transaction([
        this.prisma.funder.count({ where: { createdAt: range } }),
        this.prisma.funder.groupBy({ by: ['type'], where: { createdAt: range }, _count: { id: true } }),
        this.prisma.fundingGrant.count({ where: { createdAt: range } }),
        this.prisma.grantDisbursement.aggregate({
          _sum: { amount: true },
          where: { receivedAt: range },
        }),
        this.prisma.funderReport.count({ where: { submittedAt: range } }),
      ]);
    return {
      period: { start: startDate, end: endDate },
      created, byType, grantsCreated,
      totalDisbursed: totalDisbursed._sum.amount || 0,
      reportsSubmitted: reports,
    };
  }

  // ─── HELPER PRIVADO ──────────────────────────────────

  private async updateFunderTotals(funderId: string) {
    const grants = await this.prisma.fundingGrant.findMany({
      where: { funderId, deletedAt: null },
      select: { amount: true, disbursed: true, status: true },
    });
    const totalCommitted = grants.reduce((s, g) => s + g.amount, 0);
    const totalReceived  = grants.reduce((s, g) => s + g.disbursed, 0);
    await this.prisma.funder.update({
      where: { id: funderId },
      data: {
        totalCommitted,
        totalReceived,
        totalPending: totalCommitted - totalReceived,
      },
    });
  }

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
// src/crm-funders/crm-funders.controller.ts
import {
  Controller, Get, Post, Put, Delete, Body,
  Param, Query, UseGuards, HttpCode, HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard }   from '../auth/guards/roles.guard';
import { Roles }        from '../auth/decorators/roles.decorator';
import { CurrentUser }  from '../auth/decorators/current-user.decorator';
import { CrmFundersService } from './crm-funders.service';
import {
  CreateFunderDto, UpdateFunderDto, FilterFunderDto,
  CreateGrantDto, CreateDisbursementDto,
  CreateFunderInteractionDto, CreateFunderReportDto,
} from './dto';

@ApiTags('CRM — Financiadores')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('crm/funders')
export class CrmFundersController {
  constructor(private readonly service: CrmFundersService) {}

  // ─── CRUD FINANCIADORES ──────────────────────────────

  @Post()
  @Roles('ADMIN', 'RH', 'MANAGER')
  @ApiOperation({ summary: 'Criar financiador' })
  create(@Body() dto: CreateFunderDto, @CurrentUser() user: any) {
    return this.service.create(dto, user.id);
  }

  @Get()
  @ApiOperation({ summary: 'Listar financiadores (paginado)' })
  findAll(@Query() filters: FilterFunderDto) {
    return this.service.findAll(filters);
  }

  @Get('dashboard')
  @Roles('ADMIN', 'RH', 'MANAGER')
  @ApiOperation({ summary: 'Dashboard CRM Financiadores' })
  getDashboard() {
    return this.service.getDashboard();
  }

  @Get('overdue-reports')
  @Roles('ADMIN', 'RH', 'MANAGER')
  @ApiOperation({ summary: 'Relatórios em atraso' })
  getOverdueReports() {
    return this.service.getOverdueReports();
  }

  @Get('report')
  @Roles('ADMIN', 'RH')
  @ApiOperation({ summary: 'Relatório por período' })
  getReport(@Query('start') start: string, @Query('end') end: string) {
    return this.service.getReport(new Date(start), new Date(end));
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalhe de financiador' })
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Put(':id')
  @Roles('ADMIN', 'RH', 'MANAGER')
  @ApiOperation({ summary: 'Actualizar financiador' })
  update(@Param('id') id: string, @Body() dto: UpdateFunderDto, @CurrentUser() user: any) {
    return this.service.update(id, dto, user.id);
  }

  @Delete(':id')
  @Roles('ADMIN', 'RH')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Remover financiador (soft delete)' })
  remove(@Param('id') id: string, @CurrentUser() user: any) {
    return this.service.softDelete(id, user.id);
  }

  // ─── GRANTS ──────────────────────────────────────────

  @Post(':id/grants')
  @Roles('ADMIN', 'RH', 'MANAGER')
  @ApiOperation({ summary: 'Criar grant (financiamento)' })
  createGrant(@Param('id') id: string, @Body() dto: CreateGrantDto, @CurrentUser() user: any) {
    return this.service.createGrant(id, dto, user.id);
  }

  @Get(':id/grants')
  @ApiOperation({ summary: 'Listar grants do financiador' })
  findGrants(
    @Param('id') id: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.service.findGrants(id, page, limit);
  }

  @Put('grants/:grantId/status')
  @Roles('ADMIN', 'RH')
  @ApiOperation({ summary: 'Actualizar estado do grant' })
  updateGrantStatus(
    @Param('grantId') grantId: string,
    @Body('status') status: string,
    @CurrentUser() user: any,
  ) {
    return this.service.updateGrantStatus(grantId, status, user.id);
  }

  // ─── DESEMBOLSOS ─────────────────────────────────────

  @Post('grants/:grantId/disbursements')
  @Roles('ADMIN', 'RH', 'MANAGER')
  @ApiOperation({ summary: 'Registar desembolso' })
  addDisbursement(
    @Param('grantId') grantId: string,
    @Body() dto: CreateDisbursementDto,
    @CurrentUser() user: any,
  ) {
    return this.service.addDisbursement(grantId, dto, user.id);
  }

  @Get('grants/:grantId/disbursements')
  @ApiOperation({ summary: 'Listar desembolsos do grant' })
  getDisbursements(
    @Param('grantId') grantId: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.service.getDisbursements(grantId, page, limit);
  }

  // ─── INTERACÇÕES ─────────────────────────────────────

  @Post(':id/interactions')
  @ApiOperation({ summary: 'Adicionar interacção' })
  addInteraction(
    @Param('id') id: string,
    @Body() dto: CreateFunderInteractionDto,
    @CurrentUser() user: any,
  ) {
    return this.service.addInteraction(id, dto, user.id);
  }

  // ─── RELATÓRIOS ──────────────────────────────────────

  @Post(':id/reports')
  @Roles('ADMIN', 'RH', 'MANAGER')
  @ApiOperation({ summary: 'Criar relatório para financiador' })
  createReport(
    @Param('id') id: string,
    @Body() dto: CreateFunderReportDto,
    @CurrentUser() user: any,
  ) {
    return this.service.createReport(id, dto, user.id);
  }

  @Put('reports/:reportId/submit')
  @ApiOperation({ summary: 'Submeter relatório' })
  submitReport(
    @Param('reportId') reportId: string,
    @Body('fileUrl') fileUrl: string,
    @CurrentUser() user: any,
  ) {
    return this.service.submitReport(reportId, fileUrl, user.id);
  }
}
```

---

## PASSO 5 — Module

```typescript
// src/crm-funders/crm-funders.module.ts
import { Module }    from '@nestjs/common';
import { CrmFundersController } from './crm-funders.controller';
import { CrmFundersService }    from './crm-funders.service';
import { PrismaModule }         from '../prisma/prisma.module';

@Module({
  imports:     [PrismaModule],
  controllers: [CrmFundersController],
  providers:   [CrmFundersService],
  exports:     [CrmFundersService],
})
export class CrmFundersModule {}
```

```typescript
// src/app.module.ts — adicionar:
import { CrmFundersModule } from './crm-funders/crm-funders.module';
imports: [ ...existentes..., CrmFundersModule ],
```

---

## PASSO 6 — Spec File (8 testes)

```typescript
// src/crm-funders/crm-funders.service.spec.ts
import { Test, TestingModule }  from '@nestjs/testing';
import { CrmFundersService }    from './crm-funders.service';
import { PrismaService }        from '../prisma/prisma.service';
import { NotFoundException, BadRequestException } from '@nestjs/common';

const mockFunder = {
  id: 'fun-1', code: 'FIN-00001', name: 'União Europeia',
  type: 'BILATERAL', status: 'ACTIVE', deletedAt: null,
  totalCommitted: 0, totalReceived: 0, totalPending: 0,
  createdBy: { fullName: 'Admin' }, assignedTo: null,
  grants: [], interactions: [], reports: [], _count: { grants: 0, interactions: 0 },
};

const mockGrant = {
  id: 'grt-1', code: 'GRT-00001',
  funderId: 'fun-1', title: 'Grant Educação 2026',
  amount: 5000000, disbursed: 0, currency: 'AOA', status: 'ACTIVE',
};

const mockPrisma = {
  funder: {
    create: jest.fn(), findMany: jest.fn(), findUnique: jest.fn(),
    findFirst: jest.fn(), update: jest.fn(), count: jest.fn(),
    groupBy: jest.fn(), aggregate: jest.fn(),
  },
  fundingGrant: {
    create: jest.fn(), findMany: jest.fn(), findUnique: jest.fn(),
    update: jest.fn(), count: jest.fn(), aggregate: jest.fn(),
    findFirst: jest.fn(),
  },
  grantDisbursement: {
    create: jest.fn(), findMany: jest.fn(), count: jest.fn(), aggregate: jest.fn(),
  },
  funderInteraction: {
    create: jest.fn(), findMany: jest.fn(), count: jest.fn(),
  },
  funderReport: {
    create: jest.fn(), findUnique: jest.fn(), update: jest.fn(),
    count: jest.fn(), findMany: jest.fn(),
  },
  auditLog:        { create: jest.fn() },
  notificationLog: { create: jest.fn() },
  $transaction:    jest.fn(),
};

describe('CrmFundersService', () => {
  let service: CrmFundersService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CrmFundersService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();
    service = module.get<CrmFundersService>(CrmFundersService);
    jest.clearAllMocks();
  });

  describe('create', () => {
    it('deve criar financiador com código FIN- auto-gerado', async () => {
      mockPrisma.funder.findFirst.mockResolvedValue(null);
      mockPrisma.funder.create.mockResolvedValue(mockFunder);
      mockPrisma.auditLog.create.mockResolvedValue({});

      const result = await service.create(
        { name: 'União Europeia', type: 'BILATERAL' as any },
        'user-1',
      );
      expect(result.code).toBe('FIN-00001');
      expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ entity: 'Funder', action: 'CREATE' }),
        }),
      );
    });
  });

  describe('findAll', () => {
    it('deve retornar lista paginada', async () => {
      mockPrisma.$transaction.mockResolvedValue([[mockFunder], 1]);
      const result = await service.findAll({ page: 1, limit: 20 });
      expect(result).toMatchObject({ data: expect.any(Array), total: 1, totalPages: 1 });
    });

    it('deve filtrar por tipo e status', async () => {
      mockPrisma.$transaction.mockResolvedValue([[], 0]);
      const result = await service.findAll({ type: 'GOVERNMENT' as any, status: 'ACTIVE' as any });
      expect(result.total).toBe(0);
    });
  });

  describe('findOne', () => {
    it('deve retornar financiador com grants e interacções', async () => {
      mockPrisma.funder.findUnique.mockResolvedValue(mockFunder);
      const result = await service.findOne('fun-1');
      expect(result.id).toBe('fun-1');
    });

    it('deve lançar NotFoundException se não existir', async () => {
      mockPrisma.funder.findUnique.mockResolvedValue(null);
      await expect(service.findOne('nao-existe')).rejects.toThrow(NotFoundException);
    });

    it('deve lançar NotFoundException se deletedAt preenchido', async () => {
      mockPrisma.funder.findUnique.mockResolvedValue({ ...mockFunder, deletedAt: new Date() });
      await expect(service.findOne('fun-1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('softDelete', () => {
    it('deve definir deletedAt e status INACTIVE', async () => {
      mockPrisma.funder.findUnique.mockResolvedValue(mockFunder);
      mockPrisma.funder.update.mockResolvedValue({});
      mockPrisma.auditLog.create.mockResolvedValue({});

      const result = await service.softDelete('fun-1', 'user-1');
      expect(result.message).toContain('sucesso');
      expect(mockPrisma.funder.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ deletedAt: expect.any(Date), status: 'INACTIVE' }),
        }),
      );
    });
  });

  describe('createGrant', () => {
    it('deve criar grant com código GRT- e notificação', async () => {
      mockPrisma.funder.findUnique.mockResolvedValue(mockFunder);
      mockPrisma.fundingGrant.findFirst.mockResolvedValue(null);
      mockPrisma.fundingGrant.create.mockResolvedValue(mockGrant);
      mockPrisma.fundingGrant.findMany.mockResolvedValue([mockGrant]);
      mockPrisma.funder.update.mockResolvedValue({});
      mockPrisma.auditLog.create.mockResolvedValue({});
      mockPrisma.notificationLog.create.mockResolvedValue({});

      const result = await service.createGrant(
        'fun-1',
        { title: 'Grant Educação 2026', amount: 5000000, startDate: '2026-01-01' } as any,
        'user-1',
      );
      expect(result.code).toBe('GRT-00001');
      expect(mockPrisma.notificationLog.create).toHaveBeenCalled();
    });
  });

  describe('addDisbursement', () => {
    it('deve registar desembolso e actualizar totais', async () => {
      mockPrisma.fundingGrant.findUnique.mockResolvedValue(mockGrant);
      mockPrisma.grantDisbursement.create.mockResolvedValue({ id: 'dis-1', amount: 1000000 });
      mockPrisma.fundingGrant.update.mockResolvedValue({});
      mockPrisma.fundingGrant.findMany.mockResolvedValue([{ ...mockGrant, disbursed: 1000000 }]);
      mockPrisma.funder.update.mockResolvedValue({});
      mockPrisma.auditLog.create.mockResolvedValue({});

      const result = await service.addDisbursement(
        'grt-1',
        { amount: 1000000, receivedAt: '2026-06-01', currency: 'AOA' } as any,
        'user-1',
      );
      expect(result.amount).toBe(1000000);
    });

    it('deve lançar BadRequestException se desembolso excede o grant', async () => {
      mockPrisma.fundingGrant.findUnique.mockResolvedValue({ ...mockGrant, disbursed: 4500000 });
      await expect(
        service.addDisbursement('grt-1', { amount: 600000, receivedAt: '2026-06-01' } as any, 'user-1'),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('getDashboard', () => {
    it('deve retornar totais financeiros e taxa de execução', async () => {
      mockPrisma.$transaction.mockResolvedValue([
        5, 1, 4, [], [],
        { _sum: { amount: 10000000 } },
        { _sum: { disbursed: 6000000 } },
        3, 0, 2, [], [],
      ]);
      const result = await service.getDashboard();
      expect(result).toHaveProperty('totals');
      expect(result.totals.executionRate).toBe(60);
      expect(result.totals.totalPending).toBe(4000000);
    });
  });
});
```

---

## PASSO 7 — Bruno CLI (6 ficheiros)

```
# bruno/crm-funders/01-listar.bru
meta { name: Listar Financiadores  type: http  seq: 1 }
get { url: {{baseUrl}}/crm/funders?page=1&limit=20  auth: bearer }
auth:bearer { token: {{accessToken}} }
tests {
  test("Status 200", function() { expect(res.status).to.equal(200); });
  test("Paginação presente", function() {
    expect(res.body).to.have.property("data");
    expect(res.body).to.have.property("total");
    expect(res.body).to.have.property("totalPages");
  });
}

---

# bruno/crm-funders/02-criar.bru
meta { name: Criar Financiador  type: http  seq: 2 }
post { url: {{baseUrl}}/crm/funders  body: json  auth: bearer }
auth:bearer { token: {{accessToken}} }
body:json {
  {
    "type": "BILATERAL",
    "name": "Bruno Financiador Teste",
    "country": "Portugal",
    "region": "Europa",
    "contactName": "Dr. António Costa",
    "contactTitle": "Director de Cooperação",
    "email": "fin@teste.com",
    "focusAreas": ["Educação", "Formação Profissional"],
    "reportingReqs": "Relatório trimestral"
  }
}
tests {
  test("Status 201", function() { expect(res.status).to.equal(201); });
  test("Código FIN-", function() { expect(res.body.code).to.match(/^FIN-\d{5}$/); });
  test("Nome correcto", function() { expect(res.body.name).to.equal("Bruno Financiador Teste"); });
}
script:post-response {
  if (res.status === 201) { bru.setEnvVar("funderId", res.body.id); }
}

---

# bruno/crm-funders/03-criar-grant.bru
meta { name: Criar Grant  type: http  seq: 3 }
post { url: {{baseUrl}}/crm/funders/{{funderId}}/grants  body: json  auth: bearer }
auth:bearer { token: {{accessToken}} }
body:json {
  {
    "title": "Programa Educação Angola 2026",
    "amount": 5000000,
    "currency": "AOA",
    "startDate": "2026-01-01",
    "endDate": "2026-12-31",
    "objectives": ["Formar 500 jovens", "Certificar 200 profissionais"],
    "reportingCycle": "quarterly"
  }
}
tests {
  test("Status 201", function() { expect(res.status).to.equal(201); });
  test("Código GRT-", function() { expect(res.body.code).to.match(/^GRT-\d{5}$/); });
  test("Valor correcto", function() { expect(res.body.amount).to.equal(5000000); });
}
script:post-response {
  if (res.status === 201) { bru.setEnvVar("grantId", res.body.id); }
}

---

# bruno/crm-funders/04-detalhe.bru
meta { name: Detalhe Financiador  type: http  seq: 4 }
get { url: {{baseUrl}}/crm/funders/{{funderId}}  auth: bearer }
auth:bearer { token: {{accessToken}} }
tests {
  test("Status 200", function() { expect(res.status).to.equal(200); });
  test("Tem grants, interacções e relatórios", function() {
    expect(res.body).to.have.property("grants");
    expect(res.body).to.have.property("interactions");
    expect(res.body).to.have.property("reports");
  });
}

---

# bruno/crm-funders/05-dashboard.bru
meta { name: Dashboard Financiadores  type: http  seq: 5 }
get { url: {{baseUrl}}/crm/funders/dashboard  auth: bearer }
auth:bearer { token: {{accessToken}} }
tests {
  test("Status 200", function() { expect(res.status).to.equal(200); });
  test("Tem totais financeiros", function() {
    expect(res.body).to.have.property("totals");
    expect(res.body.totals).to.have.property("totalCommitted");
    expect(res.body.totals).to.have.property("totalReceived");
    expect(res.body.totals).to.have.property("executionRate");
  });
}

---

# bruno/crm-funders/06-apagar.bru
meta { name: Apagar Financiador  type: http  seq: 6 }
delete { url: {{baseUrl}}/crm/funders/{{funderId}}  auth: bearer }
auth:bearer { token: {{accessToken}} }
tests {
  test("Status 200", function() { expect(res.status).to.equal(200); });
  test("Mensagem sucesso", function() { expect(res.body.message).to.contain("sucesso"); });
}
```

---

## PASSO 8 — Frontend Completo

```tsx
// frontend/app/crm/funders/page.tsx
'use client';
import { useState, useEffect, useCallback } from 'react';

const STATUS_COLORS: Record<string, string> = {
  ACTIVE:    'bg-green-100 text-green-800',
  INACTIVE:  'bg-gray-100 text-gray-600',
  PROSPECT:  'bg-blue-100 text-blue-800',
  SUSPENDED: 'bg-red-100 text-red-800',
  FORMER:    'bg-orange-100 text-orange-700',
};
const TYPE_LABELS: Record<string, string> = {
  GOVERNMENT:        'Governo', BILATERAL:  'Bilateral',
  MULTILATERAL:      'Multilateral', NGO: 'ONG',
  PRIVATE_FOUNDATION:'Fundação Privada', CORPORATE: 'Empresa',
  OTHER:             'Outro',
};

export default function FundersPage() {
  const [data, setData]               = useState<any[]>([]);
  const [total, setTotal]             = useState(0);
  const [page, setPage]               = useState(1);
  const [totalPages, setTotalPages]   = useState(1);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState('');
  const [search, setSearch]           = useState('');
  const [typeFilter, setTypeFilter]   = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  const fetchData = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const params = new URLSearchParams({
        page: String(page), limit: '20',
        ...(search       && { search }),
        ...(typeFilter   && { type: typeFilter }),
        ...(statusFilter && { status: statusFilter }),
      });
      const res = await fetch(`/api/crm/funders?${params}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Erro ao carregar financiadores');
      const json = await res.json();
      setData(json.data); setTotal(json.total); setTotalPages(json.totalPages);
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  }, [page, search, typeFilter, statusFilter]);

  useEffect(() => { fetchData(); }, [fetchData]);

  if (loading) return (
    <div className="p-6 space-y-4">
      {[...Array(5)].map((_, i) => (
        <div key={i} className="h-16 bg-gray-100 rounded-lg animate-pulse" />
      ))}
    </div>
  );

  if (error) return (
    <div className="p-6">
      <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-lg flex justify-between">
        <span>{error}</span>
        <button onClick={fetchData} className="underline">Tentar novamente</button>
      </div>
    </div>
  );

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Financiadores</h1>
          <p className="text-gray-500">{total} financiadores registados</p>
        </div>
        <a href="/crm/funders/novo"
          className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700">
          + Novo Financiador
        </a>
      </div>

      {/* Filtros */}
      <div className="flex gap-4 flex-wrap">
        <input type="text" placeholder="Pesquisar por nome, código, email..."
          value={search} onChange={e => { setSearch(e.target.value); setPage(1); }}
          className="border rounded-lg px-4 py-2 flex-1 min-w-[200px]" />
        <select value={typeFilter}
          onChange={e => { setTypeFilter(e.target.value); setPage(1); }}
          className="border rounded-lg px-4 py-2">
          <option value="">Todos os tipos</option>
          {Object.entries(TYPE_LABELS).map(([v, l]) => (
            <option key={v} value={v}>{l}</option>
          ))}
        </select>
        <select value={statusFilter}
          onChange={e => { setStatusFilter(e.target.value); setPage(1); }}
          className="border rounded-lg px-4 py-2">
          <option value="">Todos os estados</option>
          <option value="ACTIVE">Activo</option>
          <option value="PROSPECT">Prospecto</option>
          <option value="SUSPENDED">Suspenso</option>
          <option value="INACTIVE">Inactivo</option>
        </select>
      </div>

      {/* Tabela */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-600 uppercase text-xs">
            <tr>
              <th className="px-4 py-3 text-left">Código</th>
              <th className="px-4 py-3 text-left">Nome</th>
              <th className="px-4 py-3 text-left">Tipo</th>
              <th className="px-4 py-3 text-left">País</th>
              <th className="px-4 py-3 text-left">Estado</th>
              <th className="px-4 py-3 text-right">Comprometido</th>
              <th className="px-4 py-3 text-right">Recebido</th>
              <th className="px-4 py-3 text-left">Grants</th>
              <th className="px-4 py-3 text-left">Acções</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {data.length === 0 ? (
              <tr><td colSpan={9} className="px-4 py-8 text-center text-gray-400">
                Nenhum financiador encontrado
              </td></tr>
            ) : data.map((f: any) => (
              <tr key={f.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 font-mono text-blue-600">{f.code}</td>
                <td className="px-4 py-3 font-medium">{f.name}</td>
                <td className="px-4 py-3 text-gray-600">{TYPE_LABELS[f.type] || f.type}</td>
                <td className="px-4 py-3 text-gray-600">{f.country || '—'}</td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${STATUS_COLORS[f.status]}`}>
                    {f.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-right text-gray-700">
                  {f.totalCommitted > 0
                    ? `AOA ${f.totalCommitted.toLocaleString('pt-AO')}`
                    : '—'}
                </td>
                <td className="px-4 py-3 text-right text-green-700">
                  {f.totalReceived > 0
                    ? `AOA ${f.totalReceived.toLocaleString('pt-AO')}`
                    : '—'}
                </td>
                <td className="px-4 py-3 text-center text-gray-600">
                  {f._count?.grants || 0}
                </td>
                <td className="px-4 py-3">
                  <a href={`/crm/funders/${f.id}`} className="text-blue-600 hover:underline">Ver</a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Paginação */}
      {totalPages > 1 && (
        <div className="flex justify-between items-center">
          <span className="text-gray-500">Página {page} de {totalPages}</span>
          <div className="flex gap-2">
            <button onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1} className="px-4 py-2 border rounded-lg disabled:opacity-50">
              Anterior
            </button>
            <button onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page === totalPages} className="px-4 py-2 border rounded-lg disabled:opacity-50">
              Próxima
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
```

---

## PROMPT PARA O CLAUDE CODE

```
O Módulo 2 (CRM Parceiros) está completo e aprovado.
Implementa agora o Módulo 3 — CRM Financiadores.
Lê o CRM-FINANCIADORES-GUIDE.md na raiz do projecto.

Segue EXACTAMENTE estes 22 passos:

1. Verifica se algum enum do schema já existe
   (FunderType, FunderStatus, GrantStatus, etc.)
   Se existir, não duplica — adapta o código

2. Adiciona ao prisma/schema.prisma:
   Funder, FundingGrant, GrantDisbursement,
   FunderInteraction, FunderReport + enums novos

3. npx prisma validate
4. npx prisma migrate dev --name "add_crm_funders"
5. npx prisma generate

6. Cria src/crm-funders/dto/ com os 7 DTOs:
   create-funder, update-funder, filter-funder,
   create-grant, create-disbursement,
   create-funder-interaction, create-report, index.ts

7. Cria src/crm-funders/crm-funders.service.ts

8. Cria src/crm-funders/crm-funders.controller.ts

9. Cria src/crm-funders/crm-funders.module.ts

10. Adiciona CrmFundersModule ao src/app.module.ts

11. npm run build → DEVE PASSAR com 0 erros

12. Cria src/crm-funders/crm-funders.service.spec.ts
    (8 testes conforme o guia)

13. npm run test -- --testPathPattern=crm-funders --forceExit
    → DEVE PASSAR com 0 falhas

14. npm run test:cov 2>&1 | tail -5
    → Se < 55% adiciona mais testes

15. Cria bruno/crm-funders/ com os 6 ficheiros .bru

16. Com o backend a correr:
    npx bru run bruno/crm-funders/ --env local
    → TODOS devem passar

17. Cria frontend/app/crm/funders/page.tsx
    (lista com loading, paginação, totais AOA, filtros)

18. Cria frontend/app/crm/funders/[id]/page.tsx
    (detalhe com grants, desembolsos, interacções, relatórios)

19. Cria frontend/app/crm/funders/novo/page.tsx
    (formulário completo de criação)

20. Adiciona ao sidebar: link para /crm/funders

21. git add -A
    git commit -m "feat: CRM Financiadores completo - 8 specs, 6 bruno, frontend" --no-verify
    git push origin main

22. Mostra resumo:
    - Build: OK / FALHOU
    - Testes: X/8 passaram
    - Cobertura: X%
    - Bruno: X/6 passaram
    PARA e espera confirmação para Módulo 4

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

*INNOVA — CRM Financiadores Guide v1.0*
*Mesmo padrão dos Módulos 1 e 2*
*Blackbaud Raiser's Edge + Salesforce Nonprofit Cloud*
*DTOs + Service + Controller + Module + Spec + Bruno + Frontend*
