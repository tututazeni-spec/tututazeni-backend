# INNOVA — 9 Módulos Corporativos Completos (Opção C)
> Um módulo completo de cada vez | Passa em todos os testes antes de avançar
> SAP · Workday · Salesforce · Cornerstone · Credly · Blackbaud

---

## ⚠️ REGRAS ABSOLUTAS DO INNOVA

```
- fullName (NUNCA name) — User model
- entity (NUNCA entityType) — AuditLog
- courseId_userId — compound key Enrollment
- legacyPdi (NUNCA pdi) — modelo Prisma
- badgeAward (NUNCA badge) — modelo Prisma
- AttendanceRecord (NUNCA Attendance)
- NotificationLog.metadata → JSON.stringify()
- Soft delete: deletedAt DateTime? em TODOS os novos modelos
- auditLog em TODOS os CREATE, UPDATE, DELETE
- Paginação: { data, total, page, limit, totalPages }
- Angola: AOA, dd/MM/yyyy, UTC+1 (Africa/Luanda)
- Backend porta 4000 | Frontend porta 3000
```

---

## ORDEM DE IMPLEMENTAÇÃO (Opção C)

```
Módulo 1 → CRM Beneficiários      ← começa aqui
Módulo 2 → CRM Parceiros
Módulo 3 → CRM Financiadores
Módulo 4 → Biblioteca Digital
Módulo 5 → Certificação Digital
Módulo 6 → Dashboard Institucional
Módulo 7 → Sistema de Gestão Académica
Módulo 8 → LMS Completo
Módulo 9 → Monitoria e Avaliação

REGRA: só avança para o módulo seguinte
quando TODOS os testes do actual passam.
```

---

## CHECKLIST OBRIGATÓRIO POR MÓDULO

```
□ Schema Prisma + migrate dev
□ DTOs com class-validator (create + update + filter + response)
□ Service completo (CRUD + paginação + dashboard + relatórios)
□ Controller completo (Swagger + Guards + rotas RESTful)
□ Module registado no AppModule
□ Spec file (mínimo 8 testes: CRUD + erros + edge cases)
□ Bruno CLI (listar + criar + detalhe + actualizar + apagar)
□ Frontend page.tsx (lista + loading + paginação + filtros)
□ Frontend [id]/page.tsx (detalhe + interacções)
□ Frontend novo/page.tsx (formulário completo)
□ npm run build → 0 erros
□ npm run test → 0 falhas
□ npm run test:cov → > 55%
□ npx bru run bruno/MODULO/ → passa
□ git commit com mensagem descritiva
```

---

## ═══════════════════════════════════════════
## MÓDULO 1 — CRM BENEFICIÁRIOS
## Referência: Salesforce Nonprofit + Microsoft Dynamics
## ═══════════════════════════════════════════

### PASSO 1 — Schema Prisma

```prisma
# Adicionar a prisma/schema.prisma

model Beneficiary {
  id              String            @id @default(cuid())
  code            String            @unique
  fullName        String
  type            BeneficiaryType
  category        String?
  gender          Gender?
  birthDate       DateTime?
  nationality     String?
  nif             String?
  email           String?
  phone           String?
  mobile          String?
  address         String?
  city            String?
  province        AngolaProvince?
  country         String            @default("Angola")
  status          BeneficiaryStatus @default(ACTIVE)
  source          String?
  tags            String[]
  segment         String?
  assignedToId    String?
  totalBenefits   Float             @default(0)
  currency        String            @default("AOA")
  notes           String?
  lastContactAt   DateTime?
  nextFollowUpAt  DateTime?
  satisfactionAvg Float             @default(0)
  createdById     String
  createdAt       DateTime          @default(now())
  updatedAt       DateTime          @updatedAt
  deletedAt       DateTime?

  createdBy    User                    @relation("BeneficiaryCreator", fields: [createdById], references: [id])
  assignedTo   User?                   @relation("BeneficiaryOwner",   fields: [assignedToId], references: [id])
  interactions BeneficiaryInteraction[]
  documents    BeneficiaryDocument[]
  needs        BeneficiaryNeed[]

  @@index([type])
  @@index([status])
  @@index([province])
  @@index([assignedToId])
  @@index([nextFollowUpAt])
  @@index([createdById])
  @@index([deletedAt])
}

model BeneficiaryInteraction {
  id             String          @id @default(cuid())
  beneficiaryId  String
  userId         String
  type           InteractionType
  channel        String?
  subject        String
  description    String
  date           DateTime        @default(now())
  durationMin    Int?
  outcome        String?
  nextAction     String?
  nextActionDate DateTime?
  satisfaction   Int?
  attachments    String[]
  isPrivate      Boolean         @default(false)
  createdAt      DateTime        @default(now())
  updatedAt      DateTime        @updatedAt
  deletedAt      DateTime?

  beneficiary Beneficiary @relation(fields: [beneficiaryId], references: [id])
  user        User        @relation("InteractionUser", fields: [userId], references: [id])

  @@index([beneficiaryId])
  @@index([type])
  @@index([date])
  @@index([deletedAt])
}

model BeneficiaryDocument {
  id            String   @id @default(cuid())
  beneficiaryId String
  name          String
  type          String
  fileUrl       String
  fileSize      Int?
  expiresAt     DateTime?
  isVerified    Boolean  @default(false)
  uploadedById  String
  createdAt     DateTime @default(now())
  deletedAt     DateTime?

  beneficiary Beneficiary @relation(fields: [beneficiaryId], references: [id])
  uploadedBy  User        @relation("DocumentUploader", fields: [uploadedById], references: [id])

  @@index([beneficiaryId])
  @@index([expiresAt])
  @@index([deletedAt])
}

model BeneficiaryNeed {
  id            String   @id @default(cuid())
  beneficiaryId String
  category      String
  description   String
  priority      NeedPriority @default(MEDIUM)
  status        NeedStatus   @default(OPEN)
  resolvedAt    DateTime?
  resolvedById  String?
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  beneficiary Beneficiary @relation(fields: [beneficiaryId], references: [id])

  @@index([beneficiaryId])
  @@index([status])
  @@index([priority])
}

enum BeneficiaryType   { INDIVIDUAL FAMILY INSTITUTION COMMUNITY GROUP }
enum BeneficiaryStatus { ACTIVE INACTIVE PROSPECT FORMER BLOCKED }
enum Gender            { MALE FEMALE OTHER NOT_INFORMED }
enum AngolaProvince    {
  BENGO BENGUELA BIE CABINDA CUANDO_CUBANGO
  CUANZA_NORTE CUANZA_SUL CUNENE HUAMBO HUILA
  LUANDA LUNDA_NORTE LUNDA_SUL MALANJE MOXICO
  NAMIBE UIGE ZAIRE
}
enum InteractionType   { EMAIL CALL MEETING VISIT EVENT NOTE TASK }
enum NeedPriority      { LOW MEDIUM HIGH URGENT }
enum NeedStatus        { OPEN IN_PROGRESS RESOLVED CLOSED }
```

```bash
# Após adicionar o schema:
npx prisma validate
npx prisma migrate dev --name "add_crm_beneficiaries"
npx prisma generate
```

---

### PASSO 2 — DTOs

```typescript
// src/crm-beneficiaries/dto/create-beneficiary.dto.ts
import {
  IsString, IsOptional, IsEmail, IsEnum, IsDateString,
  IsNumber, IsArray, IsBoolean, Min, Max, Length,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  BeneficiaryType, BeneficiaryStatus, Gender, AngolaProvince,
} from '@prisma/client';

export class CreateBeneficiaryDto {
  @ApiProperty({ enum: BeneficiaryType })
  @IsEnum(BeneficiaryType)
  type: BeneficiaryType;

  @ApiProperty({ example: 'João Manuel dos Santos' })
  @IsString()
  @Length(2, 200)
  fullName: string;

  @ApiPropertyOptional({ example: 'Individual' })
  @IsOptional() @IsString()
  category?: string;

  @ApiPropertyOptional({ enum: Gender })
  @IsOptional() @IsEnum(Gender)
  gender?: Gender;

  @ApiPropertyOptional({ example: '1990-01-15' })
  @IsOptional() @IsDateString()
  birthDate?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsString()
  nationality?: string;

  @ApiPropertyOptional({ example: '123456789LA036' })
  @IsOptional() @IsString()
  nif?: string;

  @ApiPropertyOptional({ example: 'joao@email.com' })
  @IsOptional() @IsEmail()
  email?: string;

  @ApiPropertyOptional({ example: '+244 923 456 789' })
  @IsOptional() @IsString()
  phone?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsString()
  mobile?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsString()
  address?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsString()
  city?: string;

  @ApiPropertyOptional({ enum: AngolaProvince })
  @IsOptional() @IsEnum(AngolaProvince)
  province?: AngolaProvince;

  @ApiPropertyOptional({ default: 'Angola' })
  @IsOptional() @IsString()
  country?: string;

  @ApiPropertyOptional({ example: 'Referência' })
  @IsOptional() @IsString()
  source?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional() @IsArray() @IsString({ each: true })
  tags?: string[];

  @ApiPropertyOptional()
  @IsOptional() @IsString()
  segment?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsString()
  assignedToId?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsString()
  notes?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsDateString()
  nextFollowUpAt?: string;
}

// src/crm-beneficiaries/dto/update-beneficiary.dto.ts
import { PartialType } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';
import { BeneficiaryStatus } from '@prisma/client';
import { CreateBeneficiaryDto } from './create-beneficiary.dto';

export class UpdateBeneficiaryDto extends PartialType(CreateBeneficiaryDto) {
  @IsOptional() @IsEnum(BeneficiaryStatus)
  status?: BeneficiaryStatus;
}

// src/crm-beneficiaries/dto/filter-beneficiary.dto.ts
import { IsOptional, IsEnum, IsString, IsInt, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { BeneficiaryType, BeneficiaryStatus, AngolaProvince } from '@prisma/client';

export class FilterBeneficiaryDto {
  @ApiPropertyOptional() @IsOptional() @IsEnum(BeneficiaryType)
  type?: BeneficiaryType;

  @ApiPropertyOptional() @IsOptional() @IsEnum(BeneficiaryStatus)
  status?: BeneficiaryStatus;

  @ApiPropertyOptional() @IsOptional() @IsString()
  category?: string;

  @ApiPropertyOptional() @IsOptional() @IsEnum(AngolaProvince)
  province?: AngolaProvince;

  @ApiPropertyOptional() @IsOptional() @IsString()
  assignedToId?: string;

  @ApiPropertyOptional() @IsOptional() @IsString()
  search?: string;

  @ApiPropertyOptional({ default: 1 }) @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ default: 20 }) @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  limit?: number = 20;
}

// src/crm-beneficiaries/dto/create-interaction.dto.ts
import { IsString, IsOptional, IsEnum, IsInt, IsDateString, Min, Max, IsArray } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { InteractionType } from '@prisma/client';

export class CreateInteractionDto {
  @ApiProperty({ enum: InteractionType })
  @IsEnum(InteractionType)
  type: InteractionType;

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
  nextActionDate?: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 5 })
  @IsOptional() @IsInt() @Min(1) @Max(5)
  satisfaction?: number;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional() @IsArray() @IsString({ each: true })
  attachments?: string[];
}

// src/crm-beneficiaries/dto/create-need.dto.ts
import { IsString, IsOptional, IsEnum } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { NeedPriority } from '@prisma/client';

export class CreateNeedDto {
  @ApiProperty()
  @IsString()
  category: string;

  @ApiProperty()
  @IsString()
  description: string;

  @ApiPropertyOptional({ enum: NeedPriority, default: 'MEDIUM' })
  @IsOptional() @IsEnum(NeedPriority)
  priority?: NeedPriority;
}

// src/crm-beneficiaries/dto/index.ts
export * from './create-beneficiary.dto';
export * from './update-beneficiary.dto';
export * from './filter-beneficiary.dto';
export * from './create-interaction.dto';
export * from './create-need.dto';
```

---

### PASSO 3 — Service Completo

```typescript
// src/crm-beneficiaries/crm-beneficiaries.service.ts
import {
  Injectable, NotFoundException, ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateBeneficiaryDto, UpdateBeneficiaryDto, FilterBeneficiaryDto,
  CreateInteractionDto, CreateNeedDto,
} from './dto';

@Injectable()
export class CrmBeneficiariesService {
  constructor(private prisma: PrismaService) {}

  // ─── GERAÇÃO DE CÓDIGO ───────────────────────────────

  private async generateCode(): Promise<string> {
    const last = await this.prisma.beneficiary.findFirst({
      orderBy: { code: 'desc' },
      select: { code: true },
    });
    const num = last ? parseInt(last.code.replace('BEN-', '')) + 1 : 1;
    return `BEN-${String(num).padStart(5, '0')}`;
  }

  // ─── CRUD PRINCIPAL ──────────────────────────────────

  async create(dto: CreateBeneficiaryDto, userId: string) {
    const code = await this.generateCode();
    const beneficiary = await this.prisma.beneficiary.create({
      data: { ...dto, code, createdById: userId },
      include: {
        createdBy: { select: { fullName: true } },
        assignedTo: { select: { fullName: true } },
      },
    });
    await this.audit(userId, 'CREATE', 'Beneficiary', beneficiary.id, { code, type: dto.type });
    return beneficiary;
  }

  async findAll(filters: FilterBeneficiaryDto) {
    const { type, status, category, province, search, assignedToId, page = 1, limit = 20 } = filters;
    const where: any = {
      deletedAt: null,
      ...(type && { type }),
      ...(status && { status }),
      ...(category && { category }),
      ...(province && { province }),
      ...(assignedToId && { assignedToId }),
      ...(search && {
        OR: [
          { fullName: { contains: search, mode: 'insensitive' } },
          { email: { contains: search, mode: 'insensitive' } },
          { code: { contains: search, mode: 'insensitive' } },
          { nif: { contains: search } },
          { phone: { contains: search } },
        ],
      }),
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.beneficiary.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          assignedTo: { select: { fullName: true } },
          _count: { select: { interactions: true, needs: true } },
        },
      }),
      this.prisma.beneficiary.count({ where }),
    ]);
    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async findOne(id: string) {
    const beneficiary = await this.prisma.beneficiary.findUnique({
      where: { id },
      include: {
        createdBy: { select: { fullName: true } },
        assignedTo: { select: { fullName: true, email: true } },
        interactions: {
          where: { deletedAt: null },
          orderBy: { date: 'desc' },
          take: 20,
          include: { user: { select: { fullName: true } } },
        },
        documents: {
          where: { deletedAt: null },
          orderBy: { createdAt: 'desc' },
        },
        needs: {
          orderBy: { priority: 'asc' },
        },
        _count: { select: { interactions: true } },
      },
    });
    if (!beneficiary || beneficiary.deletedAt) {
      throw new NotFoundException('Beneficiário não encontrado');
    }
    return beneficiary;
  }

  async update(id: string, dto: UpdateBeneficiaryDto, userId: string) {
    await this.findOne(id);
    const updated = await this.prisma.beneficiary.update({
      where: { id },
      data: dto,
    });
    await this.audit(userId, 'UPDATE', 'Beneficiary', id, dto);
    return updated;
  }

  async softDelete(id: string, userId: string) {
    await this.findOne(id);
    await this.prisma.beneficiary.update({
      where: { id },
      data: { deletedAt: new Date(), status: 'INACTIVE' },
    });
    await this.audit(userId, 'DELETE', 'Beneficiary', id, { deletedAt: new Date() });
    return { message: 'Beneficiário removido com sucesso' };
  }

  // ─── INTERACÇÕES ─────────────────────────────────────

  async addInteraction(beneficiaryId: string, dto: CreateInteractionDto, userId: string) {
    await this.findOne(beneficiaryId);
    const interaction = await this.prisma.beneficiaryInteraction.create({
      data: { ...dto, beneficiaryId, userId },
      include: { user: { select: { fullName: true } } },
    });

    // Actualiza lastContactAt, nextFollowUpAt e satisfação média
    const allInteractions = await this.prisma.beneficiaryInteraction.findMany({
      where: { beneficiaryId, satisfaction: { not: null }, deletedAt: null },
      select: { satisfaction: true },
    });
    const avgSatisfaction = allInteractions.length > 0
      ? allInteractions.reduce((s, i) => s + (i.satisfaction || 0), 0) / allInteractions.length
      : 0;

    await this.prisma.beneficiary.update({
      where: { id: beneficiaryId },
      data: {
        lastContactAt: new Date(),
        ...(dto.nextActionDate && { nextFollowUpAt: new Date(dto.nextActionDate) }),
        satisfactionAvg: avgSatisfaction,
      },
    });

    await this.audit(userId, 'CREATE', 'BeneficiaryInteraction', interaction.id, {
      beneficiaryId, type: dto.type,
    });
    return interaction;
  }

  async getInteractions(beneficiaryId: string, page = 1, limit = 20) {
    await this.findOne(beneficiaryId);
    const where = { beneficiaryId, deletedAt: null };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.beneficiaryInteraction.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { date: 'desc' },
        include: { user: { select: { fullName: true } } },
      }),
      this.prisma.beneficiaryInteraction.count({ where }),
    ]);
    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  // ─── NECESSIDADES ────────────────────────────────────

  async addNeed(beneficiaryId: string, dto: CreateNeedDto, userId: string) {
    await this.findOne(beneficiaryId);
    const need = await this.prisma.beneficiaryNeed.create({
      data: { ...dto, beneficiaryId },
    });
    await this.audit(userId, 'CREATE', 'BeneficiaryNeed', need.id, { beneficiaryId });
    return need;
  }

  async resolveNeed(needId: string, userId: string) {
    const need = await this.prisma.beneficiaryNeed.findUnique({ where: { id: needId } });
    if (!need) throw new NotFoundException('Necessidade não encontrada');
    const updated = await this.prisma.beneficiaryNeed.update({
      where: { id: needId },
      data: { status: 'RESOLVED', resolvedAt: new Date(), resolvedById: userId },
    });
    await this.audit(userId, 'UPDATE', 'BeneficiaryNeed', needId, { status: 'RESOLVED' });
    return updated;
  }

  // ─── FOLLOW-UPS ──────────────────────────────────────

  async getFollowUps(userId: string, days = 7) {
    const until = new Date();
    until.setDate(until.getDate() + days);
    return this.prisma.beneficiary.findMany({
      where: {
        deletedAt: null,
        status: 'ACTIVE',
        nextFollowUpAt: { lte: until },
        OR: [{ assignedToId: userId }, { createdById: userId }],
      },
      orderBy: { nextFollowUpAt: 'asc' },
      select: {
        id: true, code: true, fullName: true,
        phone: true, email: true,
        nextFollowUpAt: true,
        assignedTo: { select: { fullName: true } },
        _count: { select: { interactions: true } },
      },
    });
  }

  // ─── DASHBOARD E RELATÓRIOS ──────────────────────────

  async getDashboard() {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const in30Days = new Date(now.getTime() + 30 * 86400000);

    const [
      total, newThisMonth, active, byType, byStatus,
      byProvince, pendingFollowUps, recentInteractions,
      openNeeds, avgSatisfaction,
    ] = await this.prisma.$transaction([
      this.prisma.beneficiary.count({ where: { deletedAt: null } }),
      this.prisma.beneficiary.count({ where: { createdAt: { gte: startOfMonth } } }),
      this.prisma.beneficiary.count({ where: { status: 'ACTIVE', deletedAt: null } }),
      this.prisma.beneficiary.groupBy({
        by: ['type'], where: { deletedAt: null }, _count: { id: true },
      }),
      this.prisma.beneficiary.groupBy({
        by: ['status'], where: { deletedAt: null }, _count: { id: true },
      }),
      this.prisma.beneficiary.groupBy({
        by: ['province'],
        where: { deletedAt: null, province: { not: null } },
        _count: { id: true },
        orderBy: { _count: { id: 'desc' } },
        take: 10,
      }),
      this.prisma.beneficiary.count({
        where: { nextFollowUpAt: { lte: in30Days }, status: 'ACTIVE', deletedAt: null },
      }),
      this.prisma.beneficiaryInteraction.findMany({
        where: { deletedAt: null },
        orderBy: { date: 'desc' },
        take: 5,
        include: {
          beneficiary: { select: { fullName: true, code: true } },
          user: { select: { fullName: true } },
        },
      }),
      this.prisma.beneficiaryNeed.count({ where: { status: 'OPEN' } }),
      this.prisma.beneficiary.aggregate({
        _avg: { satisfactionAvg: true },
        where: { deletedAt: null, satisfactionAvg: { gt: 0 } },
      }),
    ]);

    return {
      totals: { total, newThisMonth, active, pendingFollowUps, openNeeds },
      satisfaction: avgSatisfaction._avg.satisfactionAvg || 0,
      distributions: { byType, byStatus, byProvince },
      recentInteractions,
    };
  }

  async getReport(startDate: Date, endDate: Date) {
    const where = { createdAt: { gte: startDate, lte: endDate } };
    const [created, byType, byProvince, interactions] = await this.prisma.$transaction([
      this.prisma.beneficiary.count({ where }),
      this.prisma.beneficiary.groupBy({
        by: ['type'], where, _count: { id: true },
      }),
      this.prisma.beneficiary.groupBy({
        by: ['province'], where: { ...where, province: { not: null } },
        _count: { id: true },
        orderBy: { _count: { id: 'desc' } },
      }),
      this.prisma.beneficiaryInteraction.count({
        where: { createdAt: { gte: startDate, lte: endDate } },
      }),
    ]);
    return {
      period: { start: startDate, end: endDate },
      created, interactions, byType, byProvince,
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

### PASSO 4 — Controller Completo

```typescript
// src/crm-beneficiaries/crm-beneficiaries.controller.ts
import {
  Controller, Get, Post, Put, Delete, Body, Param,
  Query, UseGuards, HttpCode, HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { CrmBeneficiariesService } from './crm-beneficiaries.service';
import {
  CreateBeneficiaryDto, UpdateBeneficiaryDto, FilterBeneficiaryDto,
  CreateInteractionDto, CreateNeedDto,
} from './dto';

@ApiTags('CRM — Beneficiários')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('crm/beneficiaries')
export class CrmBeneficiariesController {
  constructor(private readonly service: CrmBeneficiariesService) {}

  // ─── CRUD ────────────────────────────────────────────

  @Post()
  @Roles('ADMIN', 'RH', 'MANAGER')
  @ApiOperation({ summary: 'Criar beneficiário' })
  create(@Body() dto: CreateBeneficiaryDto, @CurrentUser() user: any) {
    return this.service.create(dto, user.id);
  }

  @Get()
  @ApiOperation({ summary: 'Listar beneficiários (paginado)' })
  findAll(@Query() filters: FilterBeneficiaryDto) {
    return this.service.findAll(filters);
  }

  @Get('dashboard')
  @Roles('ADMIN', 'RH', 'MANAGER')
  @ApiOperation({ summary: 'Dashboard do CRM de beneficiários' })
  getDashboard() {
    return this.service.getDashboard();
  }

  @Get('follow-ups')
  @ApiOperation({ summary: 'Follow-ups pendentes do utilizador' })
  getFollowUps(@CurrentUser() user: any, @Query('days') days?: number) {
    return this.service.getFollowUps(user.id, days);
  }

  @Get('report')
  @Roles('ADMIN', 'RH')
  @ApiOperation({ summary: 'Relatório por período' })
  getReport(@Query('start') start: string, @Query('end') end: string) {
    return this.service.getReport(new Date(start), new Date(end));
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalhe de beneficiário' })
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Put(':id')
  @Roles('ADMIN', 'RH', 'MANAGER')
  @ApiOperation({ summary: 'Actualizar beneficiário' })
  update(@Param('id') id: string, @Body() dto: UpdateBeneficiaryDto, @CurrentUser() user: any) {
    return this.service.update(id, dto, user.id);
  }

  @Delete(':id')
  @Roles('ADMIN', 'RH')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Remover beneficiário (soft delete)' })
  remove(@Param('id') id: string, @CurrentUser() user: any) {
    return this.service.softDelete(id, user.id);
  }

  // ─── INTERACÇÕES ─────────────────────────────────────

  @Post(':id/interactions')
  @ApiOperation({ summary: 'Adicionar interacção' })
  addInteraction(
    @Param('id') id: string,
    @Body() dto: CreateInteractionDto,
    @CurrentUser() user: any,
  ) {
    return this.service.addInteraction(id, dto, user.id);
  }

  @Get(':id/interactions')
  @ApiOperation({ summary: 'Listar interacções do beneficiário' })
  getInteractions(
    @Param('id') id: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.service.getInteractions(id, page, limit);
  }

  // ─── NECESSIDADES ────────────────────────────────────

  @Post(':id/needs')
  @ApiOperation({ summary: 'Registar necessidade' })
  addNeed(
    @Param('id') id: string,
    @Body() dto: CreateNeedDto,
    @CurrentUser() user: any,
  ) {
    return this.service.addNeed(id, dto, user.id);
  }

  @Put('needs/:needId/resolve')
  @ApiOperation({ summary: 'Resolver necessidade' })
  resolveNeed(@Param('needId') needId: string, @CurrentUser() user: any) {
    return this.service.resolveNeed(needId, user.id);
  }
}
```

---

### PASSO 5 — Module

```typescript
// src/crm-beneficiaries/crm-beneficiaries.module.ts
import { Module } from '@nestjs/common';
import { CrmBeneficiariesController } from './crm-beneficiaries.controller';
import { CrmBeneficiariesService } from './crm-beneficiaries.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [CrmBeneficiariesController],
  providers: [CrmBeneficiariesService],
  exports: [CrmBeneficiariesService],
})
export class CrmBeneficiariesModule {}
```

```typescript
// src/app.module.ts — adicionar:
import { CrmBeneficiariesModule } from './crm-beneficiaries/crm-beneficiaries.module';

@Module({
  imports: [
    // ... módulos existentes ...
    CrmBeneficiariesModule,
  ],
})
export class AppModule {}
```

---

### PASSO 6 — Spec File (8 testes)

```typescript
// src/crm-beneficiaries/crm-beneficiaries.service.spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import { CrmBeneficiariesService } from './crm-beneficiaries.service';
import { PrismaService } from '../prisma/prisma.service';
import { NotFoundException, ConflictException } from '@nestjs/common';

const mockBeneficiary = {
  id: 'ben-1', code: 'BEN-00001', fullName: 'João Teste',
  type: 'INDIVIDUAL', status: 'ACTIVE', deletedAt: null,
  createdBy: { fullName: 'Admin Teste' },
  assignedTo: null,
  interactions: [], documents: [], needs: [],
  _count: { interactions: 0 },
};

const mockPrisma = {
  beneficiary: {
    create: jest.fn(), findMany: jest.fn(), findUnique: jest.fn(),
    findFirst: jest.fn(), update: jest.fn(), count: jest.fn(),
    groupBy: jest.fn(), aggregate: jest.fn(),
  },
  beneficiaryInteraction: {
    create: jest.fn(), findMany: jest.fn(), count: jest.fn(),
  },
  beneficiaryNeed: {
    create: jest.fn(), findUnique: jest.fn(), update: jest.fn(), count: jest.fn(),
  },
  auditLog: { create: jest.fn() },
  $transaction: jest.fn(),
};

describe('CrmBeneficiariesService', () => {
  let service: CrmBeneficiariesService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CrmBeneficiariesService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();
    service = module.get<CrmBeneficiariesService>(CrmBeneficiariesService);
    jest.clearAllMocks();
  });

  // ─── CREATE ──────────────────────────────────────────

  describe('create', () => {
    it('deve criar beneficiário com código auto-gerado', async () => {
      mockPrisma.beneficiary.findFirst.mockResolvedValue(null);
      mockPrisma.beneficiary.create.mockResolvedValue(mockBeneficiary);
      mockPrisma.auditLog.create.mockResolvedValue({});

      const result = await service.create(
        { fullName: 'João Teste', type: 'INDIVIDUAL' as any },
        'user-1',
      );

      expect(result.code).toBe('BEN-00001');
      expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ entity: 'Beneficiary', action: 'CREATE' }),
        }),
      );
    });

    it('deve gerar BEN-00002 quando já existe BEN-00001', async () => {
      mockPrisma.beneficiary.findFirst.mockResolvedValue({ code: 'BEN-00001' });
      mockPrisma.beneficiary.create.mockResolvedValue({ ...mockBeneficiary, code: 'BEN-00002' });
      mockPrisma.auditLog.create.mockResolvedValue({});

      const result = await service.create(
        { fullName: 'Maria Teste', type: 'INDIVIDUAL' as any },
        'user-1',
      );
      expect(result.code).toBe('BEN-00002');
    });
  });

  // ─── FIND ALL ────────────────────────────────────────

  describe('findAll', () => {
    it('deve retornar lista paginada', async () => {
      mockPrisma.$transaction.mockResolvedValue([[mockBeneficiary], 1]);

      const result = await service.findAll({ page: 1, limit: 20 });

      expect(result).toHaveProperty('data');
      expect(result).toHaveProperty('total', 1);
      expect(result).toHaveProperty('totalPages', 1);
    });

    it('deve filtrar por tipo e status', async () => {
      mockPrisma.$transaction.mockResolvedValue([[], 0]);
      const result = await service.findAll({
        type: 'INDIVIDUAL' as any, status: 'ACTIVE' as any,
      });
      expect(result.total).toBe(0);
    });
  });

  // ─── FIND ONE ────────────────────────────────────────

  describe('findOne', () => {
    it('deve retornar beneficiário por id', async () => {
      mockPrisma.beneficiary.findUnique.mockResolvedValue(mockBeneficiary);
      const result = await service.findOne('ben-1');
      expect(result.id).toBe('ben-1');
    });

    it('deve lançar NotFoundException se não existir', async () => {
      mockPrisma.beneficiary.findUnique.mockResolvedValue(null);
      await expect(service.findOne('nao-existe'))
        .rejects.toThrow(NotFoundException);
    });

    it('deve lançar NotFoundException se deletedAt preenchido', async () => {
      mockPrisma.beneficiary.findUnique.mockResolvedValue({
        ...mockBeneficiary, deletedAt: new Date(),
      });
      await expect(service.findOne('ben-1'))
        .rejects.toThrow(NotFoundException);
    });
  });

  // ─── UPDATE ──────────────────────────────────────────

  describe('update', () => {
    it('deve actualizar e criar auditLog', async () => {
      mockPrisma.beneficiary.findUnique.mockResolvedValue(mockBeneficiary);
      mockPrisma.beneficiary.update.mockResolvedValue({
        ...mockBeneficiary, fullName: 'João Actualizado',
      });
      mockPrisma.auditLog.create.mockResolvedValue({});

      const result = await service.update('ben-1', { fullName: 'João Actualizado' } as any, 'user-1');
      expect(result.fullName).toBe('João Actualizado');
      expect(mockPrisma.auditLog.create).toHaveBeenCalled();
    });
  });

  // ─── SOFT DELETE ─────────────────────────────────────

  describe('softDelete', () => {
    it('deve definir deletedAt e status INACTIVE', async () => {
      mockPrisma.beneficiary.findUnique.mockResolvedValue(mockBeneficiary);
      mockPrisma.beneficiary.update.mockResolvedValue({});
      mockPrisma.auditLog.create.mockResolvedValue({});

      const result = await service.softDelete('ben-1', 'user-1');
      expect(result.message).toContain('sucesso');
      expect(mockPrisma.beneficiary.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ deletedAt: expect.any(Date), status: 'INACTIVE' }),
        }),
      );
    });
  });

  // ─── INTERACÇÕES ─────────────────────────────────────

  describe('addInteraction', () => {
    it('deve criar interacção e actualizar lastContactAt', async () => {
      mockPrisma.beneficiary.findUnique.mockResolvedValue(mockBeneficiary);
      mockPrisma.beneficiaryInteraction.create.mockResolvedValue({
        id: 'int-1', type: 'CALL', subject: 'Contacto inicial',
        user: { fullName: 'Utilizador Teste' },
      });
      mockPrisma.beneficiaryInteraction.findMany.mockResolvedValue([]);
      mockPrisma.beneficiary.update.mockResolvedValue({});
      mockPrisma.auditLog.create.mockResolvedValue({});

      const result = await service.addInteraction(
        'ben-1',
        { type: 'CALL' as any, subject: 'Contacto inicial', description: 'Desc' } as any,
        'user-1',
      );
      expect(result.type).toBe('CALL');
      expect(mockPrisma.beneficiary.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ lastContactAt: expect.any(Date) }),
        }),
      );
    });
  });

  // ─── DASHBOARD ───────────────────────────────────────

  describe('getDashboard', () => {
    it('deve retornar totais e distribuições', async () => {
      mockPrisma.$transaction.mockResolvedValue([
        5, 2, 4, [], [], [], 1, [], 3, { _avg: { satisfactionAvg: 4.2 } },
      ]);
      const result = await service.getDashboard();
      expect(result).toHaveProperty('totals');
      expect(result).toHaveProperty('distributions');
      expect(result).toHaveProperty('satisfaction');
    });
  });
});
```

---

### PASSO 7 — Bruno CLI

```
# bruno/crm-beneficiaries/01-listar.bru
meta {
  name: Listar Beneficiários
  type: http
  seq: 1
}
get {
  url: {{baseUrl}}/crm/beneficiaries?page=1&limit=20
  auth: bearer
}
auth:bearer { token: {{accessToken}} }
tests {
  test("Status 200", function() {
    expect(res.status).to.equal(200);
  });
  test("Tem paginação", function() {
    expect(res.body).to.have.property("data");
    expect(res.body).to.have.property("total");
    expect(res.body).to.have.property("totalPages");
  });
}

---

# bruno/crm-beneficiaries/02-criar.bru
meta {
  name: Criar Beneficiário
  type: http
  seq: 2
}
post {
  url: {{baseUrl}}/crm/beneficiaries
  body: json
  auth: bearer
}
auth:bearer { token: {{accessToken}} }
body:json {
  {
    "type": "INDIVIDUAL",
    "fullName": "Bruno Teste Beneficiário",
    "email": "bruno.teste@innova-test.com",
    "phone": "+244 923 000 001",
    "province": "BENGUELA",
    "category": "Estudante",
    "source": "Web"
  }
}
tests {
  test("Status 201", function() {
    expect(res.status).to.equal(201);
  });
  test("Tem código BEN-", function() {
    expect(res.body.code).to.match(/^BEN-\d{5}$/);
  });
  test("fullName correcto", function() {
    expect(res.body.fullName).to.equal("Bruno Teste Beneficiário");
  });
}
script:post-response {
  if (res.status === 201) {
    bru.setEnvVar("beneficiaryId", res.body.id);
  }
}

---

# bruno/crm-beneficiaries/03-detalhe.bru
meta {
  name: Detalhe Beneficiário
  type: http
  seq: 3
}
get {
  url: {{baseUrl}}/crm/beneficiaries/{{beneficiaryId}}
  auth: bearer
}
auth:bearer { token: {{accessToken}} }
tests {
  test("Status 200", function() {
    expect(res.status).to.equal(200);
  });
  test("Tem interacções e necessidades", function() {
    expect(res.body).to.have.property("interactions");
    expect(res.body).to.have.property("needs");
  });
}

---

# bruno/crm-beneficiaries/04-adicionar-interacao.bru
meta {
  name: Adicionar Interacção
  type: http
  seq: 4
}
post {
  url: {{baseUrl}}/crm/beneficiaries/{{beneficiaryId}}/interactions
  body: json
  auth: bearer
}
auth:bearer { token: {{accessToken}} }
body:json {
  {
    "type": "CALL",
    "subject": "Primeiro contacto",
    "description": "Contacto inicial para avaliar necessidades",
    "durationMin": 15,
    "outcome": "Interessado em formação",
    "satisfaction": 4
  }
}
tests {
  test("Status 201", function() {
    expect(res.status).to.equal(201);
  });
  test("Tipo correcto", function() {
    expect(res.body.type).to.equal("CALL");
  });
}

---

# bruno/crm-beneficiaries/05-dashboard.bru
meta {
  name: Dashboard CRM Beneficiários
  type: http
  seq: 5
}
get {
  url: {{baseUrl}}/crm/beneficiaries/dashboard
  auth: bearer
}
auth:bearer { token: {{accessToken}} }
tests {
  test("Status 200", function() {
    expect(res.status).to.equal(200);
  });
  test("Tem totais e distribuições", function() {
    expect(res.body).to.have.property("totals");
    expect(res.body).to.have.property("distributions");
    expect(res.body).to.have.property("satisfaction");
  });
}

---

# bruno/crm-beneficiaries/06-apagar.bru
meta {
  name: Apagar Beneficiário (soft delete)
  type: http
  seq: 6
}
delete {
  url: {{baseUrl}}/crm/beneficiaries/{{beneficiaryId}}
  auth: bearer
}
auth:bearer { token: {{accessToken}} }
tests {
  test("Status 200", function() {
    expect(res.status).to.equal(200);
  });
  test("Mensagem de sucesso", function() {
    expect(res.body.message).to.contain("sucesso");
  });
}
```

---

### PASSO 8 — Frontend Completo

```tsx
// frontend/app/crm/beneficiaries/page.tsx
'use client';
import { useState, useEffect, useCallback } from 'react';

interface Beneficiary {
  id: string; code: string; fullName: string;
  type: string; status: string; province: string;
  email: string; phone: string; nextFollowUpAt: string;
  assignedTo?: { fullName: string };
  _count: { interactions: number };
}

const STATUS_COLORS: Record<string, string> = {
  ACTIVE: 'bg-green-100 text-green-800',
  INACTIVE: 'bg-gray-100 text-gray-600',
  PROSPECT: 'bg-blue-100 text-blue-800',
  BLOCKED: 'bg-red-100 text-red-800',
};

export default function BeneficiariesPage() {
  const [data, setData] = useState<Beneficiary[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({
        page: String(page), limit: '20',
        ...(search && { search }),
        ...(statusFilter && { status: statusFilter }),
        ...(typeFilter && { type: typeFilter }),
      });
      const res = await fetch(`/api/crm/beneficiaries?${params}`, {
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Erro ao carregar beneficiários');
      const json = await res.json();
      setData(json.data);
      setTotal(json.total);
      setTotalPages(json.totalPages);
    } catch (e: any) {
      setError(e.message || 'Erro inesperado');
    } finally {
      setLoading(false);
    }
  }, [page, search, statusFilter, typeFilter]);

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
      <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-lg">
        {error}
        <button onClick={fetchData} className="ml-4 underline">Tentar novamente</button>
      </div>
    </div>
  );

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Beneficiários</h1>
          <p className="text-gray-500">{total} beneficiários registados</p>
        </div>
        <a href="/crm/beneficiaries/novo"
          className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700">
          + Novo Beneficiário
        </a>
      </div>

      {/* Filtros */}
      <div className="flex gap-4 flex-wrap">
        <input
          type="text"
          placeholder="Pesquisar por nome, email, código..."
          value={search}
          onChange={e => { setSearch(e.target.value); setPage(1); }}
          className="border rounded-lg px-4 py-2 flex-1 min-w-[200px]"
        />
        <select value={statusFilter}
          onChange={e => { setStatusFilter(e.target.value); setPage(1); }}
          className="border rounded-lg px-4 py-2">
          <option value="">Todos os estados</option>
          <option value="ACTIVE">Activo</option>
          <option value="PROSPECT">Prospecto</option>
          <option value="INACTIVE">Inactivo</option>
          <option value="FORMER">Ex-beneficiário</option>
        </select>
        <select value={typeFilter}
          onChange={e => { setTypeFilter(e.target.value); setPage(1); }}
          className="border rounded-lg px-4 py-2">
          <option value="">Todos os tipos</option>
          <option value="INDIVIDUAL">Individual</option>
          <option value="FAMILY">Família</option>
          <option value="INSTITUTION">Instituição</option>
          <option value="COMMUNITY">Comunidade</option>
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
              <th className="px-4 py-3 text-left">Província</th>
              <th className="px-4 py-3 text-left">Estado</th>
              <th className="px-4 py-3 text-left">Interacções</th>
              <th className="px-4 py-3 text-left">Responsável</th>
              <th className="px-4 py-3 text-left">Acções</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {data.length === 0 ? (
              <tr><td colSpan={8} className="px-4 py-8 text-center text-gray-400">
                Nenhum beneficiário encontrado
              </td></tr>
            ) : data.map(b => (
              <tr key={b.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 font-mono text-blue-600">{b.code}</td>
                <td className="px-4 py-3 font-medium">{b.fullName}</td>
                <td className="px-4 py-3 text-gray-600">{b.type}</td>
                <td className="px-4 py-3 text-gray-600">{b.province || '—'}</td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${STATUS_COLORS[b.status]}`}>
                    {b.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-gray-600">{b._count.interactions}</td>
                <td className="px-4 py-3 text-gray-600">{b.assignedTo?.fullName || '—'}</td>
                <td className="px-4 py-3">
                  <a href={`/crm/beneficiaries/${b.id}`}
                    className="text-blue-600 hover:underline">Ver</a>
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
              disabled={page === 1}
              className="px-4 py-2 border rounded-lg disabled:opacity-50">
              Anterior
            </button>
            <button onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="px-4 py-2 border rounded-lg disabled:opacity-50">
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

## PROMPT PARA MÓDULO 1 (CRM BENEFICIÁRIOS)

```
Implementa o Módulo 1 — CRM Beneficiários — completamente.
Lê o NOVOS-MODULOS-GUIDE.md na raiz.

Segue EXACTAMENTE esta ordem:

1. Adiciona os modelos ao prisma/schema.prisma
   (Beneficiary, BeneficiaryInteraction, BeneficiaryDocument,
   BeneficiaryNeed + todos os enums)
   VERIFICA antes se algum enum já existe no schema

2. npx prisma validate
3. npx prisma migrate dev --name "add_crm_beneficiaries"
4. npx prisma generate

5. Cria src/crm-beneficiaries/dto/ com todos os DTOs
   (create, update, filter, interaction, need, index.ts)

6. Cria src/crm-beneficiaries/crm-beneficiaries.service.ts
   (completo conforme o guia)

7. Cria src/crm-beneficiaries/crm-beneficiaries.controller.ts
   (completo conforme o guia)

8. Cria src/crm-beneficiaries/crm-beneficiaries.module.ts

9. Adiciona CrmBeneficiariesModule ao src/app.module.ts

10. npm run build → DEVE PASSAR com 0 erros

11. Cria src/crm-beneficiaries/crm-beneficiaries.service.spec.ts
    (8 testes conforme o guia)

12. npm run test -- --testPathPattern=crm-beneficiaries --forceExit
    → DEVE PASSAR com 0 falhas

13. npm run test:cov 2>&1 | tail -5
    → Se < 55% adiciona mais testes

14. Cria bruno/crm-beneficiaries/ com os 6 ficheiros .bru
    (01-listar, 02-criar, 03-detalhe, 04-adicionar-interacao,
    05-dashboard, 06-apagar)

15. Arranca o backend: node dist/main.js
    npx bru run bruno/crm-beneficiaries/ --env local
    → TODOS devem passar

16. Cria frontend/app/crm/beneficiaries/page.tsx
    (conforme o guia — com loading, paginação, filtros)

17. Cria frontend/app/crm/beneficiaries/[id]/page.tsx
    (detalhe com interacções, documentos e necessidades)

18. Cria frontend/app/crm/beneficiaries/novo/page.tsx
    (formulário completo de criação)

19. Adiciona ao sidebar do frontend o link
    para /crm/beneficiaries

20. git add -A
    git commit -m "feat: CRM Beneficiários completo - 8 specs, 6 bruno, frontend" --no-verify
    git push origin main

21. Mostra resumo:
    - Testes: X/X passaram
    - Cobertura: X%
    - Bruno: X/6 passaram
    - Build: OK

22. PARA e espera confirmação antes de avançar
    para o Módulo 2 — CRM Parceiros

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
SE A SESSÃO FICAR LENTA (>25 min):
git add -A && git commit -m "feat: CRM Beneficiários em progresso" --no-verify
E PARA.
```

---

## NOTA PARA OS MÓDULOS 2-9

Após o Módulo 1 estar completo e aprovado,
o Claude Code usa o mesmo padrão para os restantes.
Para cada módulo seguinte pede:

```
O Módulo 1 (CRM Beneficiários) está completo e aprovado.
Avança para o Módulo 2 — CRM Parceiros.
Usa exactamente o mesmo padrão do Módulo 1:
DTOs + Service + Controller + Module +
Spec (8 testes) + Bruno (6 ficheiros) + Frontend (3 páginas).

O schema do CRM Parceiros está no NOVOS-MODULOS-GUIDE.md.
Segue os mesmos 22 passos do Módulo 1.
```

---

*INNOVA — Módulos Corporativos v4.0 (Opção C)*
*1 módulo completo de cada vez | Todos os testes antes de avançar*
*DTOs + Service + Controller + Module + Spec + Bruno + Frontend*
