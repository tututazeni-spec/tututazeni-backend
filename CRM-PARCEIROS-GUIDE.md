# INNOVA — Módulo 2: CRM Parceiros
> Mesmo padrão do Módulo 1 (CRM Beneficiários)
> Referência: Salesforce Partner Community + HubSpot Partner Portal

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
□ DTOs (create + update + filter + interaction + milestone)
□ Service completo (CRUD + dashboard + relatórios + follow-ups)
□ Controller completo (Swagger + Guards + rotas RESTful)
□ Module registado no AppModule
□ Spec file (8 testes mínimo)
□ Bruno CLI (6 ficheiros .bru)
□ Frontend page.tsx (lista + loading + paginação + filtros)
□ Frontend [id]/page.tsx (detalhe + interacções + milestones)
□ Frontend novo/page.tsx (formulário completo)
□ npm run build → 0 erros
□ npm run test → 0 falhas
□ npm run test:cov → > 55%
□ npx bru run bruno/crm-partners/ → passa
□ git commit descritivo
```

---

## PASSO 1 — Schema Prisma

```prisma
# Adicionar a prisma/schema.prisma

model Partner {
  id              String        @id @default(cuid())
  code            String        @unique
  name            String
  legalName       String?
  type            PartnerType
  tier            PartnerTier   @default(STANDARD)
  contactName     String?
  contactTitle    String?
  email           String?
  phone           String?
  mobile          String?
  website         String?
  linkedin        String?
  nif             String?
  address         String?
  city            String?
  province        String?
  country         String        @default("Angola")
  status          PartnerStatus @default(ACTIVE)
  contractStart   DateTime?
  contractEnd     DateTime?
  contractUrl     String?
  annualValue     Float?
  currency        String        @default("AOA")
  revenueSharing  Float?
  services        String[]
  tags            String[]
  kpis            String?
  rating          Float?
  assignedToId    String?
  notes           String?
  lastContactAt   DateTime?
  nextReviewAt    DateTime?
  satisfactionAvg Float         @default(0)
  createdById     String
  createdAt       DateTime      @default(now())
  updatedAt       DateTime      @updatedAt
  deletedAt       DateTime?

  createdBy    User                 @relation("PartnerCreator",  fields: [createdById],  references: [id])
  assignedTo   User?                @relation("PartnerOwner",    fields: [assignedToId], references: [id])
  interactions PartnerInteraction[]
  milestones   PartnerMilestone[]

  @@index([type])
  @@index([tier])
  @@index([status])
  @@index([assignedToId])
  @@index([contractEnd])
  @@index([nextReviewAt])
  @@index([deletedAt])
}

model PartnerInteraction {
  id          String              @id @default(cuid())
  partnerId   String
  userId      String
  type        PartnerInteractionType
  channel     String?
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

  partner Partner @relation(fields: [partnerId], references: [id])
  user    User    @relation("PartnerInteractionUser", fields: [userId], references: [id])

  @@index([partnerId])
  @@index([type])
  @@index([date])
  @@index([deletedAt])
}

model PartnerMilestone {
  id          String          @id @default(cuid())
  partnerId   String
  title       String
  description String?
  dueDate     DateTime
  completedAt DateTime?
  status      MilestoneStatus @default(PENDING)
  value       Float?
  currency    String          @default("AOA")
  priority    String          @default("MEDIUM")
  notes       String?
  createdById String
  createdAt   DateTime        @default(now())
  updatedAt   DateTime        @updatedAt
  deletedAt   DateTime?

  partner   Partner @relation(fields: [partnerId], references: [id])
  createdBy User    @relation("MilestoneCreator", fields: [createdById], references: [id])

  @@index([partnerId])
  @@index([status])
  @@index([dueDate])
  @@index([deletedAt])
}

enum PartnerType {
  TECHNOLOGY CONTENT TRAINING FUNDING
  INSTITUTIONAL COMMERCIAL MEDIA GOVERNMENT OTHER
}
enum PartnerTier   { PLATINUM GOLD SILVER STANDARD }
enum PartnerStatus { ACTIVE INACTIVE NEGOTIATION SUSPENDED FORMER }
enum PartnerInteractionType { EMAIL CALL MEETING VISIT EVENT NOTE REVIEW }
enum MilestoneStatus { PENDING IN_PROGRESS COMPLETED CANCELLED OVERDUE }
```

```bash
npx prisma validate
npx prisma migrate dev --name "add_crm_partners"
npx prisma generate
```

---

## PASSO 2 — DTOs

```typescript
// src/crm-partners/dto/create-partner.dto.ts
import {
  IsString, IsOptional, IsEmail, IsEnum, IsNumber,
  IsArray, IsDateString, Min, Max, Length,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PartnerType, PartnerTier, PartnerStatus } from '@prisma/client';

export class CreatePartnerDto {
  @ApiProperty({ enum: PartnerType })
  @IsEnum(PartnerType)
  type: PartnerType;

  @ApiProperty({ example: 'EVOS Tecnologia Lda.' })
  @IsString() @Length(2, 200)
  name: string;

  @ApiPropertyOptional()
  @IsOptional() @IsString()
  legalName?: string;

  @ApiPropertyOptional({ enum: PartnerTier, default: 'STANDARD' })
  @IsOptional() @IsEnum(PartnerTier)
  tier?: PartnerTier;

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
  linkedin?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsString()
  nif?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsString()
  address?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsString()
  city?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsString()
  province?: string;

  @ApiPropertyOptional({ default: 'Angola' })
  @IsOptional() @IsString()
  country?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsDateString()
  contractStart?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsDateString()
  contractEnd?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsString()
  contractUrl?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsNumber() @Min(0)
  annualValue?: number;

  @ApiPropertyOptional({ default: 'AOA' })
  @IsOptional() @IsString()
  currency?: string;

  @ApiPropertyOptional({ description: 'Percentagem de partilha de receita', minimum: 0, maximum: 100 })
  @IsOptional() @IsNumber() @Min(0) @Max(100)
  revenueSharing?: number;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional() @IsArray() @IsString({ each: true })
  services?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional() @IsArray() @IsString({ each: true })
  tags?: string[];

  @ApiPropertyOptional()
  @IsOptional() @IsString()
  assignedToId?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsString()
  notes?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsDateString()
  nextReviewAt?: string;
}

// src/crm-partners/dto/update-partner.dto.ts
import { PartialType } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';
import { PartnerStatus } from '@prisma/client';
import { CreatePartnerDto } from './create-partner.dto';

export class UpdatePartnerDto extends PartialType(CreatePartnerDto) {
  @IsOptional() @IsEnum(PartnerStatus)
  status?: PartnerStatus;
}

// src/crm-partners/dto/filter-partner.dto.ts
import { IsOptional, IsEnum, IsString, IsInt, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { PartnerType, PartnerTier, PartnerStatus } from '@prisma/client';

export class FilterPartnerDto {
  @ApiPropertyOptional() @IsOptional() @IsEnum(PartnerType)
  type?: PartnerType;

  @ApiPropertyOptional() @IsOptional() @IsEnum(PartnerTier)
  tier?: PartnerTier;

  @ApiPropertyOptional() @IsOptional() @IsEnum(PartnerStatus)
  status?: PartnerStatus;

  @ApiPropertyOptional() @IsOptional() @IsString()
  search?: string;

  @ApiPropertyOptional() @IsOptional() @IsString()
  assignedToId?: string;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  limit?: number = 20;
}

// src/crm-partners/dto/create-partner-interaction.dto.ts
import {
  IsString, IsOptional, IsEnum, IsInt, IsDateString,
  IsArray, Min, Max, IsBoolean,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PartnerInteractionType } from '@prisma/client';

export class CreatePartnerInteractionDto {
  @ApiProperty({ enum: PartnerInteractionType })
  @IsEnum(PartnerInteractionType)
  type: PartnerInteractionType;

  @ApiPropertyOptional()
  @IsOptional() @IsString()
  channel?: string;

  @ApiProperty()
  @IsString()
  subject: string;

  @ApiProperty()
  @IsString()
  description: string;

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

// src/crm-partners/dto/create-milestone.dto.ts
import {
  IsString, IsOptional, IsDateString, IsNumber, Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateMilestoneDto {
  @ApiProperty()
  @IsString()
  title: string;

  @ApiPropertyOptional()
  @IsOptional() @IsString()
  description?: string;

  @ApiProperty()
  @IsDateString()
  dueDate: string;

  @ApiPropertyOptional()
  @IsOptional() @IsNumber() @Min(0)
  value?: number;

  @ApiPropertyOptional({ default: 'AOA' })
  @IsOptional() @IsString()
  currency?: string;

  @ApiPropertyOptional({ default: 'MEDIUM' })
  @IsOptional() @IsString()
  priority?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsString()
  notes?: string;
}

// src/crm-partners/dto/index.ts
export * from './create-partner.dto';
export * from './update-partner.dto';
export * from './filter-partner.dto';
export * from './create-partner-interaction.dto';
export * from './create-milestone.dto';
```

---

## PASSO 3 — Service Completo

```typescript
// src/crm-partners/crm-partners.service.ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreatePartnerDto, UpdatePartnerDto, FilterPartnerDto,
  CreatePartnerInteractionDto, CreateMilestoneDto,
} from './dto';

@Injectable()
export class CrmPartnersService {
  constructor(private prisma: PrismaService) {}

  // ─── CÓDIGO AUTO-GERADO ──────────────────────────────

  private async generateCode(): Promise<string> {
    const last = await this.prisma.partner.findFirst({
      orderBy: { code: 'desc' },
      select: { code: true },
    });
    const num = last ? parseInt(last.code.replace('PAR-', '')) + 1 : 1;
    return `PAR-${String(num).padStart(5, '0')}`;
  }

  // ─── CRUD PRINCIPAL ──────────────────────────────────

  async create(dto: CreatePartnerDto, userId: string) {
    const code = await this.generateCode();
    const partner = await this.prisma.partner.create({
      data: { ...dto, code, createdById: userId },
      include: {
        createdBy:  { select: { fullName: true } },
        assignedTo: { select: { fullName: true } },
      },
    });
    await this.audit(userId, 'CREATE', 'Partner', partner.id, { code, type: dto.type });
    return partner;
  }

  async findAll(filters: FilterPartnerDto) {
    const { type, tier, status, search, assignedToId, page = 1, limit = 20 } = filters;
    const where: any = {
      deletedAt: null,
      ...(type   && { type }),
      ...(tier   && { tier }),
      ...(status && { status }),
      ...(assignedToId && { assignedToId }),
      ...(search && {
        OR: [
          { name:  { contains: search, mode: 'insensitive' } },
          { email: { contains: search, mode: 'insensitive' } },
          { code:  { contains: search, mode: 'insensitive' } },
          { nif:   { contains: search } },
        ],
      }),
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.partner.findMany({
        where, skip: (page - 1) * limit, take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          assignedTo: { select: { fullName: true } },
          _count: { select: { interactions: true, milestones: true } },
        },
      }),
      this.prisma.partner.count({ where }),
    ]);
    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async findOne(id: string) {
    const partner = await this.prisma.partner.findUnique({
      where: { id },
      include: {
        createdBy:  { select: { fullName: true } },
        assignedTo: { select: { fullName: true, email: true } },
        interactions: {
          where: { deletedAt: null },
          orderBy: { date: 'desc' },
          take: 20,
          include: { user: { select: { fullName: true } } },
        },
        milestones: {
          where: { deletedAt: null },
          orderBy: { dueDate: 'asc' },
          include: { createdBy: { select: { fullName: true } } },
        },
        _count: { select: { interactions: true } },
      },
    });
    if (!partner || partner.deletedAt) {
      throw new NotFoundException('Parceiro não encontrado');
    }
    return partner;
  }

  async update(id: string, dto: UpdatePartnerDto, userId: string) {
    await this.findOne(id);
    const updated = await this.prisma.partner.update({
      where: { id }, data: dto,
    });
    await this.audit(userId, 'UPDATE', 'Partner', id, dto);
    return updated;
  }

  async softDelete(id: string, userId: string) {
    await this.findOne(id);
    await this.prisma.partner.update({
      where: { id },
      data: { deletedAt: new Date(), status: 'INACTIVE' },
    });
    await this.audit(userId, 'DELETE', 'Partner', id, { deletedAt: new Date() });
    return { message: 'Parceiro removido com sucesso' };
  }

  // ─── INTERACÇÕES ─────────────────────────────────────

  async addInteraction(partnerId: string, dto: CreatePartnerInteractionDto, userId: string) {
    await this.findOne(partnerId);
    const interaction = await this.prisma.partnerInteraction.create({
      data: { ...dto, partnerId, userId },
      include: { user: { select: { fullName: true } } },
    });

    const allRatings = await this.prisma.partnerInteraction.findMany({
      where: { partnerId, satisfaction: { not: null }, deletedAt: null },
      select: { satisfaction: true },
    });
    const avg = allRatings.length > 0
      ? allRatings.reduce((s, i) => s + (i.satisfaction || 0), 0) / allRatings.length
      : 0;

    await this.prisma.partner.update({
      where: { id: partnerId },
      data: {
        lastContactAt: new Date(),
        satisfactionAvg: avg,
        ...(dto.nextDate && { nextReviewAt: new Date(dto.nextDate) }),
      },
    });
    await this.audit(userId, 'CREATE', 'PartnerInteraction', interaction.id, {
      partnerId, type: dto.type,
    });
    return interaction;
  }

  async getInteractions(partnerId: string, page = 1, limit = 20) {
    await this.findOne(partnerId);
    const where = { partnerId, deletedAt: null };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.partnerInteraction.findMany({
        where, skip: (page - 1) * limit, take: limit,
        orderBy: { date: 'desc' },
        include: { user: { select: { fullName: true } } },
      }),
      this.prisma.partnerInteraction.count({ where }),
    ]);
    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  // ─── MILESTONES ──────────────────────────────────────

  async addMilestone(partnerId: string, dto: CreateMilestoneDto, userId: string) {
    await this.findOne(partnerId);
    const milestone = await this.prisma.partnerMilestone.create({
      data: { ...dto, partnerId, createdById: userId },
    });
    await this.audit(userId, 'CREATE', 'PartnerMilestone', milestone.id, { partnerId });
    return milestone;
  }

  async completeMilestone(milestoneId: string, userId: string) {
    const milestone = await this.prisma.partnerMilestone.findUnique({
      where: { id: milestoneId },
    });
    if (!milestone) throw new NotFoundException('Milestone não encontrado');
    const updated = await this.prisma.partnerMilestone.update({
      where: { id: milestoneId },
      data: { status: 'COMPLETED', completedAt: new Date() },
    });
    await this.audit(userId, 'UPDATE', 'PartnerMilestone', milestoneId, { status: 'COMPLETED' });
    return updated;
  }

  async getOverdueMilestones() {
    return this.prisma.partnerMilestone.findMany({
      where: {
        status: { in: ['PENDING', 'IN_PROGRESS'] },
        dueDate: { lt: new Date() },
        deletedAt: null,
      },
      include: {
        partner: { select: { name: true, code: true } },
        createdBy: { select: { fullName: true } },
      },
      orderBy: { dueDate: 'asc' },
    });
  }

  // ─── CONTRATOS A EXPIRAR ─────────────────────────────

  async getExpiringContracts(days = 30) {
    const until = new Date();
    until.setDate(until.getDate() + days);
    return this.prisma.partner.findMany({
      where: {
        deletedAt: null,
        status: 'ACTIVE',
        contractEnd: { lte: until, gte: new Date() },
      },
      select: {
        id: true, code: true, name: true,
        contractEnd: true, contractUrl: true,
        annualValue: true, currency: true,
        assignedTo: { select: { fullName: true, email: true } },
      },
      orderBy: { contractEnd: 'asc' },
    });
  }

  // ─── DASHBOARD E RELATÓRIOS ──────────────────────────

  async getDashboard() {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const in30Days = new Date(now.getTime() + 30 * 86400000);

    const [
      total, newThisMonth, active, byType, byTier, byStatus,
      totalValue, expiringContracts, overdueMilestones,
      recentInteractions, avgSatisfaction,
    ] = await this.prisma.$transaction([
      this.prisma.partner.count({ where: { deletedAt: null } }),
      this.prisma.partner.count({ where: { createdAt: { gte: startOfMonth } } }),
      this.prisma.partner.count({ where: { status: 'ACTIVE', deletedAt: null } }),
      this.prisma.partner.groupBy({
        by: ['type'], where: { deletedAt: null }, _count: { id: true },
      }),
      this.prisma.partner.groupBy({
        by: ['tier'], where: { deletedAt: null, status: 'ACTIVE' },
        _count: { id: true },
      }),
      this.prisma.partner.groupBy({
        by: ['status'], where: { deletedAt: null }, _count: { id: true },
      }),
      this.prisma.partner.aggregate({
        _sum: { annualValue: true },
        where: { status: 'ACTIVE', deletedAt: null },
      }),
      this.prisma.partner.count({
        where: {
          status: 'ACTIVE', deletedAt: null,
          contractEnd: { lte: in30Days, gte: now },
        },
      }),
      this.prisma.partnerMilestone.count({
        where: {
          status: { in: ['PENDING', 'IN_PROGRESS'] },
          dueDate: { lt: now }, deletedAt: null,
        },
      }),
      this.prisma.partnerInteraction.findMany({
        where: { deletedAt: null },
        orderBy: { date: 'desc' }, take: 5,
        include: {
          partner: { select: { name: true, code: true } },
          user:    { select: { fullName: true } },
        },
      }),
      this.prisma.partner.aggregate({
        _avg: { satisfactionAvg: true },
        where: { deletedAt: null, satisfactionAvg: { gt: 0 } },
      }),
    ]);

    return {
      totals: {
        total, newThisMonth, active,
        totalValueAOA: totalValue._sum.annualValue || 0,
        expiringContracts, overdueMilestones,
      },
      satisfaction: avgSatisfaction._avg.satisfactionAvg || 0,
      distributions: { byType, byTier, byStatus },
      recentInteractions,
    };
  }

  async getReport(startDate: Date, endDate: Date) {
    const where = { createdAt: { gte: startDate, lte: endDate } };
    const [created, byType, byTier, totalValue, interactions, milestones] =
      await this.prisma.$transaction([
        this.prisma.partner.count({ where }),
        this.prisma.partner.groupBy({ by: ['type'], where, _count: { id: true } }),
        this.prisma.partner.groupBy({ by: ['tier'], where, _count: { id: true } }),
        this.prisma.partner.aggregate({
          _sum: { annualValue: true },
          where: { ...where, status: 'ACTIVE' },
        }),
        this.prisma.partnerInteraction.count({
          where: { createdAt: { gte: startDate, lte: endDate } },
        }),
        this.prisma.partnerMilestone.count({
          where: { status: 'COMPLETED', completedAt: { gte: startDate, lte: endDate } },
        }),
      ]);
    return {
      period: { start: startDate, end: endDate },
      created, byType, byTier,
      totalValue: totalValue._sum.annualValue || 0,
      interactions, milestonesCompleted: milestones,
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
// src/crm-partners/crm-partners.controller.ts
import {
  Controller, Get, Post, Put, Delete, Body, Param,
  Query, UseGuards, HttpCode, HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard }  from '../auth/guards/jwt-auth.guard';
import { RolesGuard }    from '../auth/guards/roles.guard';
import { Roles }         from '../auth/decorators/roles.decorator';
import { CurrentUser }   from '../auth/decorators/current-user.decorator';
import { CrmPartnersService } from './crm-partners.service';
import {
  CreatePartnerDto, UpdatePartnerDto, FilterPartnerDto,
  CreatePartnerInteractionDto, CreateMilestoneDto,
} from './dto';

@ApiTags('CRM — Parceiros')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('crm/partners')
export class CrmPartnersController {
  constructor(private readonly service: CrmPartnersService) {}

  // ─── CRUD ────────────────────────────────────────────

  @Post()
  @Roles('ADMIN', 'RH', 'MANAGER')
  @ApiOperation({ summary: 'Criar parceiro' })
  create(@Body() dto: CreatePartnerDto, @CurrentUser() user: any) {
    return this.service.create(dto, user.id);
  }

  @Get()
  @ApiOperation({ summary: 'Listar parceiros (paginado)' })
  findAll(@Query() filters: FilterPartnerDto) {
    return this.service.findAll(filters);
  }

  @Get('dashboard')
  @Roles('ADMIN', 'RH', 'MANAGER')
  @ApiOperation({ summary: 'Dashboard CRM Parceiros' })
  getDashboard() {
    return this.service.getDashboard();
  }

  @Get('expiring-contracts')
  @Roles('ADMIN', 'RH', 'MANAGER')
  @ApiOperation({ summary: 'Contratos a expirar nos próximos N dias' })
  getExpiringContracts(@Query('days') days?: number) {
    return this.service.getExpiringContracts(days);
  }

  @Get('overdue-milestones')
  @Roles('ADMIN', 'RH', 'MANAGER')
  @ApiOperation({ summary: 'Milestones em atraso' })
  getOverdueMilestones() {
    return this.service.getOverdueMilestones();
  }

  @Get('report')
  @Roles('ADMIN', 'RH')
  @ApiOperation({ summary: 'Relatório por período' })
  getReport(@Query('start') start: string, @Query('end') end: string) {
    return this.service.getReport(new Date(start), new Date(end));
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalhe de parceiro' })
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Put(':id')
  @Roles('ADMIN', 'RH', 'MANAGER')
  @ApiOperation({ summary: 'Actualizar parceiro' })
  update(@Param('id') id: string, @Body() dto: UpdatePartnerDto, @CurrentUser() user: any) {
    return this.service.update(id, dto, user.id);
  }

  @Delete(':id')
  @Roles('ADMIN', 'RH')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Remover parceiro (soft delete)' })
  remove(@Param('id') id: string, @CurrentUser() user: any) {
    return this.service.softDelete(id, user.id);
  }

  // ─── INTERACÇÕES ─────────────────────────────────────

  @Post(':id/interactions')
  @ApiOperation({ summary: 'Adicionar interacção' })
  addInteraction(
    @Param('id') id: string,
    @Body() dto: CreatePartnerInteractionDto,
    @CurrentUser() user: any,
  ) {
    return this.service.addInteraction(id, dto, user.id);
  }

  @Get(':id/interactions')
  @ApiOperation({ summary: 'Listar interacções do parceiro' })
  getInteractions(
    @Param('id') id: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.service.getInteractions(id, page, limit);
  }

  // ─── MILESTONES ──────────────────────────────────────

  @Post(':id/milestones')
  @Roles('ADMIN', 'RH', 'MANAGER')
  @ApiOperation({ summary: 'Criar milestone do parceiro' })
  addMilestone(
    @Param('id') id: string,
    @Body() dto: CreateMilestoneDto,
    @CurrentUser() user: any,
  ) {
    return this.service.addMilestone(id, dto, user.id);
  }

  @Put('milestones/:milestoneId/complete')
  @ApiOperation({ summary: 'Marcar milestone como concluído' })
  completeMilestone(@Param('milestoneId') milestoneId: string, @CurrentUser() user: any) {
    return this.service.completeMilestone(milestoneId, user.id);
  }
}
```

---

## PASSO 5 — Module

```typescript
// src/crm-partners/crm-partners.module.ts
import { Module }    from '@nestjs/common';
import { CrmPartnersController } from './crm-partners.controller';
import { CrmPartnersService }    from './crm-partners.service';
import { PrismaModule }          from '../prisma/prisma.module';

@Module({
  imports:     [PrismaModule],
  controllers: [CrmPartnersController],
  providers:   [CrmPartnersService],
  exports:     [CrmPartnersService],
})
export class CrmPartnersModule {}
```

```typescript
// src/app.module.ts — adicionar:
import { CrmPartnersModule } from './crm-partners/crm-partners.module';
// ...
imports: [ ...existentes..., CrmPartnersModule ],
```

---

## PASSO 6 — Spec File (8 testes)

```typescript
// src/crm-partners/crm-partners.service.spec.ts
import { Test, TestingModule }    from '@nestjs/testing';
import { CrmPartnersService }     from './crm-partners.service';
import { PrismaService }          from '../prisma/prisma.service';
import { NotFoundException }      from '@nestjs/common';

const mockPartner = {
  id: 'par-1', code: 'PAR-00001', name: 'EVOS Tecnologia',
  type: 'TECHNOLOGY', tier: 'GOLD', status: 'ACTIVE', deletedAt: null,
  createdBy: { fullName: 'Admin' }, assignedTo: null,
  interactions: [], milestones: [], _count: { interactions: 0 },
};

const mockPrisma = {
  partner: {
    create: jest.fn(), findMany: jest.fn(), findUnique: jest.fn(),
    findFirst: jest.fn(), update: jest.fn(), count: jest.fn(),
    groupBy: jest.fn(), aggregate: jest.fn(),
  },
  partnerInteraction: {
    create: jest.fn(), findMany: jest.fn(), count: jest.fn(),
  },
  partnerMilestone: {
    create: jest.fn(), findUnique: jest.fn(), update: jest.fn(),
    count: jest.fn(), findMany: jest.fn(),
  },
  auditLog: { create: jest.fn() },
  $transaction: jest.fn(),
};

describe('CrmPartnersService', () => {
  let service: CrmPartnersService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CrmPartnersService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();
    service = module.get<CrmPartnersService>(CrmPartnersService);
    jest.clearAllMocks();
  });

  // ─── CREATE ──────────────────────────────────────────

  describe('create', () => {
    it('deve criar parceiro com código PAR- auto-gerado', async () => {
      mockPrisma.partner.findFirst.mockResolvedValue(null);
      mockPrisma.partner.create.mockResolvedValue(mockPartner);
      mockPrisma.auditLog.create.mockResolvedValue({});

      const result = await service.create(
        { name: 'EVOS Tecnologia', type: 'TECHNOLOGY' as any },
        'user-1',
      );
      expect(result.code).toBe('PAR-00001');
      expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ entity: 'Partner', action: 'CREATE' }),
        }),
      );
    });

    it('deve incrementar código para PAR-00002', async () => {
      mockPrisma.partner.findFirst.mockResolvedValue({ code: 'PAR-00001' });
      mockPrisma.partner.create.mockResolvedValue({ ...mockPartner, code: 'PAR-00002' });
      mockPrisma.auditLog.create.mockResolvedValue({});

      const result = await service.create(
        { name: 'Outro Parceiro', type: 'COMMERCIAL' as any },
        'user-1',
      );
      expect(result.code).toBe('PAR-00002');
    });
  });

  // ─── FIND ALL ────────────────────────────────────────

  describe('findAll', () => {
    it('deve retornar lista paginada com totais', async () => {
      mockPrisma.$transaction.mockResolvedValue([[mockPartner], 1]);
      const result = await service.findAll({ page: 1, limit: 20 });
      expect(result).toMatchObject({ data: expect.any(Array), total: 1, totalPages: 1 });
    });

    it('deve filtrar por tipo, tier e status', async () => {
      mockPrisma.$transaction.mockResolvedValue([[], 0]);
      const result = await service.findAll({
        type: 'TECHNOLOGY' as any,
        tier: 'GOLD' as any,
        status: 'ACTIVE' as any,
      });
      expect(result.total).toBe(0);
    });
  });

  // ─── FIND ONE ────────────────────────────────────────

  describe('findOne', () => {
    it('deve retornar parceiro com interacções e milestones', async () => {
      mockPrisma.partner.findUnique.mockResolvedValue(mockPartner);
      const result = await service.findOne('par-1');
      expect(result.id).toBe('par-1');
    });

    it('deve lançar NotFoundException se não existir', async () => {
      mockPrisma.partner.findUnique.mockResolvedValue(null);
      await expect(service.findOne('nao-existe')).rejects.toThrow(NotFoundException);
    });

    it('deve lançar NotFoundException se deletedAt preenchido', async () => {
      mockPrisma.partner.findUnique.mockResolvedValue({
        ...mockPartner, deletedAt: new Date(),
      });
      await expect(service.findOne('par-1')).rejects.toThrow(NotFoundException);
    });
  });

  // ─── UPDATE ──────────────────────────────────────────

  describe('update', () => {
    it('deve actualizar e criar auditLog', async () => {
      mockPrisma.partner.findUnique.mockResolvedValue(mockPartner);
      mockPrisma.partner.update.mockResolvedValue({ ...mockPartner, name: 'Nome Actualizado' });
      mockPrisma.auditLog.create.mockResolvedValue({});

      const result = await service.update('par-1', { name: 'Nome Actualizado' } as any, 'user-1');
      expect(result.name).toBe('Nome Actualizado');
      expect(mockPrisma.auditLog.create).toHaveBeenCalled();
    });
  });

  // ─── SOFT DELETE ─────────────────────────────────────

  describe('softDelete', () => {
    it('deve definir deletedAt e status INACTIVE', async () => {
      mockPrisma.partner.findUnique.mockResolvedValue(mockPartner);
      mockPrisma.partner.update.mockResolvedValue({});
      mockPrisma.auditLog.create.mockResolvedValue({});

      const result = await service.softDelete('par-1', 'user-1');
      expect(result.message).toContain('sucesso');
      expect(mockPrisma.partner.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ deletedAt: expect.any(Date), status: 'INACTIVE' }),
        }),
      );
    });
  });

  // ─── INTERACÇÕES ─────────────────────────────────────

  describe('addInteraction', () => {
    it('deve criar interacção e actualizar lastContactAt', async () => {
      mockPrisma.partner.findUnique.mockResolvedValue(mockPartner);
      mockPrisma.partnerInteraction.create.mockResolvedValue({
        id: 'int-1', type: 'MEETING', subject: 'Reunião anual',
        user: { fullName: 'User Teste' },
      });
      mockPrisma.partnerInteraction.findMany.mockResolvedValue([]);
      mockPrisma.partner.update.mockResolvedValue({});
      mockPrisma.auditLog.create.mockResolvedValue({});

      const result = await service.addInteraction(
        'par-1',
        { type: 'MEETING' as any, subject: 'Reunião anual', description: 'Desc' } as any,
        'user-1',
      );
      expect(result.type).toBe('MEETING');
      expect(mockPrisma.partner.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ lastContactAt: expect.any(Date) }),
        }),
      );
    });
  });

  // ─── DASHBOARD ───────────────────────────────────────

  describe('getDashboard', () => {
    it('deve retornar totais, distribuições e interacções recentes', async () => {
      mockPrisma.$transaction.mockResolvedValue([
        10, 2, 8, [], [], [], { _sum: { annualValue: 5000000 } },
        1, 0, [], { _avg: { satisfactionAvg: 4.5 } },
      ]);
      const result = await service.getDashboard();
      expect(result).toHaveProperty('totals');
      expect(result).toHaveProperty('distributions');
      expect(result.totals.totalValueAOA).toBe(5000000);
    });
  });
});
```

---

## PASSO 7 — Bruno CLI (6 ficheiros)

```
# bruno/crm-partners/01-listar.bru
meta { name: Listar Parceiros  type: http  seq: 1 }
get { url: {{baseUrl}}/crm/partners?page=1&limit=20  auth: bearer }
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

# bruno/crm-partners/02-criar.bru
meta { name: Criar Parceiro  type: http  seq: 2 }
post { url: {{baseUrl}}/crm/partners  body: json  auth: bearer }
auth:bearer { token: {{accessToken}} }
body:json {
  {
    "type": "TECHNOLOGY",
    "name": "Bruno Parceiro Teste",
    "tier": "GOLD",
    "email": "parceiro@teste.com",
    "contactName": "Ana Silva",
    "contactTitle": "Directora",
    "annualValue": 1200000,
    "currency": "AOA",
    "services": ["Consultoria", "Formação"]
  }
}
tests {
  test("Status 201", function() { expect(res.status).to.equal(201); });
  test("Código PAR-", function() { expect(res.body.code).to.match(/^PAR-\d{5}$/); });
  test("Nome correcto", function() { expect(res.body.name).to.equal("Bruno Parceiro Teste"); });
}
script:post-response {
  if (res.status === 201) { bru.setEnvVar("partnerId", res.body.id); }
}

---

# bruno/crm-partners/03-detalhe.bru
meta { name: Detalhe Parceiro  type: http  seq: 3 }
get { url: {{baseUrl}}/crm/partners/{{partnerId}}  auth: bearer }
auth:bearer { token: {{accessToken}} }
tests {
  test("Status 200", function() { expect(res.status).to.equal(200); });
  test("Tem interacções e milestones", function() {
    expect(res.body).to.have.property("interactions");
    expect(res.body).to.have.property("milestones");
  });
}

---

# bruno/crm-partners/04-adicionar-interacao.bru
meta { name: Adicionar Interacção Parceiro  type: http  seq: 4 }
post { url: {{baseUrl}}/crm/partners/{{partnerId}}/interactions  body: json  auth: bearer }
auth:bearer { token: {{accessToken}} }
body:json {
  {
    "type": "MEETING",
    "subject": "Revisão anual do contrato",
    "description": "Reunião para rever os termos do contrato",
    "durationMin": 60,
    "outcome": "Renovação aprovada",
    "satisfaction": 5
  }
}
tests {
  test("Status 201", function() { expect(res.status).to.equal(201); });
  test("Tipo MEETING", function() { expect(res.body.type).to.equal("MEETING"); });
}

---

# bruno/crm-partners/05-dashboard.bru
meta { name: Dashboard Parceiros  type: http  seq: 5 }
get { url: {{baseUrl}}/crm/partners/dashboard  auth: bearer }
auth:bearer { token: {{accessToken}} }
tests {
  test("Status 200", function() { expect(res.status).to.equal(200); });
  test("Tem totais e distribuições", function() {
    expect(res.body).to.have.property("totals");
    expect(res.body).to.have.property("distributions");
    expect(res.body.totals).to.have.property("totalValueAOA");
  });
}

---

# bruno/crm-partners/06-apagar.bru
meta { name: Apagar Parceiro  type: http  seq: 6 }
delete { url: {{baseUrl}}/crm/partners/{{partnerId}}  auth: bearer }
auth:bearer { token: {{accessToken}} }
tests {
  test("Status 200", function() { expect(res.status).to.equal(200); });
  test("Mensagem sucesso", function() { expect(res.body.message).to.contain("sucesso"); });
}
```

---

## PASSO 8 — Frontend Completo

```tsx
// frontend/app/crm/partners/page.tsx
'use client';
import { useState, useEffect, useCallback } from 'react';

const TIER_COLORS: Record<string, string> = {
  PLATINUM: 'bg-purple-100 text-purple-800',
  GOLD:     'bg-yellow-100 text-yellow-800',
  SILVER:   'bg-gray-100 text-gray-700',
  STANDARD: 'bg-blue-50 text-blue-700',
};
const STATUS_COLORS: Record<string, string> = {
  ACTIVE:       'bg-green-100 text-green-800',
  INACTIVE:     'bg-gray-100 text-gray-600',
  NEGOTIATION:  'bg-blue-100 text-blue-800',
  SUSPENDED:    'bg-red-100 text-red-800',
  FORMER:       'bg-orange-100 text-orange-700',
};

export default function PartnersPage() {
  const [data, setData]           = useState<any[]>([]);
  const [total, setTotal]         = useState(0);
  const [page, setPage]           = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState('');
  const [search, setSearch]       = useState('');
  const [tierFilter, setTierFilter]     = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  const fetchData = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const params = new URLSearchParams({
        page: String(page), limit: '20',
        ...(search       && { search }),
        ...(tierFilter   && { tier: tierFilter }),
        ...(statusFilter && { status: statusFilter }),
      });
      const res = await fetch(`/api/crm/partners?${params}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Erro ao carregar parceiros');
      const json = await res.json();
      setData(json.data); setTotal(json.total); setTotalPages(json.totalPages);
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  }, [page, search, tierFilter, statusFilter]);

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
          <h1 className="text-2xl font-bold text-gray-900">Parceiros</h1>
          <p className="text-gray-500">{total} parceiros registados</p>
        </div>
        <a href="/crm/partners/novo"
          className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700">
          + Novo Parceiro
        </a>
      </div>

      {/* Filtros */}
      <div className="flex gap-4 flex-wrap">
        <input type="text" placeholder="Pesquisar por nome, código, NIF..."
          value={search} onChange={e => { setSearch(e.target.value); setPage(1); }}
          className="border rounded-lg px-4 py-2 flex-1 min-w-[200px]" />
        <select value={tierFilter}
          onChange={e => { setTierFilter(e.target.value); setPage(1); }}
          className="border rounded-lg px-4 py-2">
          <option value="">Todos os níveis</option>
          <option value="PLATINUM">Platinum</option>
          <option value="GOLD">Gold</option>
          <option value="SILVER">Silver</option>
          <option value="STANDARD">Standard</option>
        </select>
        <select value={statusFilter}
          onChange={e => { setStatusFilter(e.target.value); setPage(1); }}
          className="border rounded-lg px-4 py-2">
          <option value="">Todos os estados</option>
          <option value="ACTIVE">Activo</option>
          <option value="NEGOTIATION">Em negociação</option>
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
              <th className="px-4 py-3 text-left">Nível</th>
              <th className="px-4 py-3 text-left">Estado</th>
              <th className="px-4 py-3 text-left">Valor Anual</th>
              <th className="px-4 py-3 text-left">Responsável</th>
              <th className="px-4 py-3 text-left">Acções</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {data.length === 0 ? (
              <tr><td colSpan={8} className="px-4 py-8 text-center text-gray-400">
                Nenhum parceiro encontrado
              </td></tr>
            ) : data.map((p: any) => (
              <tr key={p.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 font-mono text-blue-600">{p.code}</td>
                <td className="px-4 py-3 font-medium">{p.name}</td>
                <td className="px-4 py-3 text-gray-600">{p.type}</td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${TIER_COLORS[p.tier]}`}>
                    {p.tier}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${STATUS_COLORS[p.status]}`}>
                    {p.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-gray-700">
                  {p.annualValue ? `AOA ${p.annualValue.toLocaleString('pt-AO')}` : '—'}
                </td>
                <td className="px-4 py-3 text-gray-600">{p.assignedTo?.fullName || '—'}</td>
                <td className="px-4 py-3">
                  <a href={`/crm/partners/${p.id}`} className="text-blue-600 hover:underline">Ver</a>
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
O Módulo 1 (CRM Beneficiários) está completo e aprovado.
Implementa agora o Módulo 2 — CRM Parceiros.
Lê o CRM-PARCEIROS-GUIDE.md na raiz do projecto.

Segue EXACTAMENTE estes 22 passos:

1. Verifica se algum enum do schema já existe
   (PartnerType, PartnerTier, etc.)
   Se existir, não duplica — adapta o código

2. Adiciona ao prisma/schema.prisma:
   Partner, PartnerInteraction, PartnerMilestone
   + enums (só os que não existem)

3. npx prisma validate
4. npx prisma migrate dev --name "add_crm_partners"
5. npx prisma generate

6. Cria src/crm-partners/dto/ com os 5 DTOs:
   create-partner, update-partner, filter-partner,
   create-partner-interaction, create-milestone, index.ts

7. Cria src/crm-partners/crm-partners.service.ts

8. Cria src/crm-partners/crm-partners.controller.ts

9. Cria src/crm-partners/crm-partners.module.ts

10. Adiciona CrmPartnersModule ao src/app.module.ts

11. npm run build → DEVE PASSAR com 0 erros

12. Cria src/crm-partners/crm-partners.service.spec.ts
    (8 testes conforme o guia)

13. npm run test -- --testPathPattern=crm-partners --forceExit
    → DEVE PASSAR com 0 falhas

14. npm run test:cov 2>&1 | tail -5
    → Se < 55% adiciona mais testes

15. Cria bruno/crm-partners/ com os 6 ficheiros .bru

16. Com o backend a correr:
    npx bru run bruno/crm-partners/ --env local
    → TODOS devem passar

17. Cria frontend/app/crm/partners/page.tsx
    (lista com loading, paginação, filtros tier+status)

18. Cria frontend/app/crm/partners/[id]/page.tsx
    (detalhe com interacções, milestones e contratos)

19. Cria frontend/app/crm/partners/novo/page.tsx
    (formulário completo de criação)

20. Adiciona ao sidebar: link para /crm/partners

21. git add -A
    git commit -m "feat: CRM Parceiros completo - 8 specs, 6 bruno, frontend" --no-verify
    git push origin main

22. Mostra resumo:
    - Build: OK / FALHOU
    - Testes: X/8 passaram
    - Cobertura: X%
    - Bruno: X/6 passaram
    PARA e espera confirmação para Módulo 3

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

*INNOVA — CRM Parceiros Guide v1.0*
*Mesmo padrão do Módulo 1 (CRM Beneficiários)*
*DTOs + Service + Controller + Module + Spec + Bruno + Frontend*
