# INNOVA — Módulo 6: Dashboard Institucional
> Mesmo padrão dos Módulos 1-5 (adaptado: é maioritariamente leitura/agregação)
> Referência: SAP Analytics Cloud + Power BI Embedded + Tableau

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

## NATUREZA DESTE MÓDULO (diferente dos anteriores)

```
Os módulos 1-5 são de CRUD (criar/ler/actualizar/apagar).
O Dashboard Institucional é de AGREGAÇÃO:
→ Consome dados dos outros módulos
→ Calcula métricas, KPIs, tendências
→ Gera alertas automáticos
→ Permite snapshots guardados (histórico de KPIs)

Por isso tem:
✅ 1 modelo novo: DashboardSnapshot (histórico de KPIs)
✅ 1 modelo novo: DashboardWidget (configuração de widgets)
✅ Service rico em agregações (read-heavy)
✅ Endpoints de leitura + 1 de snapshot (write)
```

---

## CHECKLIST OBRIGATÓRIO

```
□ Schema Prisma (DashboardSnapshot + DashboardWidget) + migrate dev
□ DTOs (create-snapshot + create-widget + update-widget + filter)
□ Service completo (executive summary + tendências + geografia + alertas + snapshots)
□ Controller completo (Swagger + Guards + endpoints de leitura)
□ Module registado no AppModule
□ Spec file (8 testes mínimo)
□ Bruno CLI (6 ficheiros .bru)
□ Frontend page.tsx (dashboard com cards de KPI + gráficos SVG)
□ Frontend alertas e rankings
□ npm run build → 0 erros
□ npm run test → 0 falhas
□ npm run test:cov → > 55%
□ npx bru run bruno/dashboard-institutional/ → passa
□ git commit descritivo
```

---

## PASSO 1 — Schema Prisma

```prisma
# Adicionar a prisma/schema.prisma

model DashboardSnapshot {
  id          String   @id @default(cuid())
  period      String          # "2026-06", "2026-Q2"
  type        SnapshotType    @default(MONTHLY)
  metrics     String          # JSON com todos os KPIs do período
  totalUsers  Int      @default(0)
  totalEnrollments Int  @default(0)
  totalBeneficiaries Int @default(0)
  totalFunding Float   @default(0)
  totalCertificates Int @default(0)
  completionRate Float @default(0)
  notes       String?
  createdById String
  createdAt   DateTime @default(now())
  deletedAt   DateTime?

  createdBy User @relation("SnapshotCreator", fields: [createdById], references: [id])

  @@unique([period, type])
  @@index([type])
  @@index([createdAt])
  @@index([deletedAt])
}

model DashboardWidget {
  id          String   @id @default(cuid())
  userId      String
  type        WidgetType
  title       String
  config      String          # JSON com configuração do widget
  position    Int      @default(0)
  size        String   @default("medium")  # small, medium, large
  isVisible   Boolean  @default(true)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  deletedAt   DateTime?

  user User @relation("WidgetOwner", fields: [userId], references: [id])

  @@index([userId])
  @@index([type])
  @@index([deletedAt])
}

enum SnapshotType { DAILY WEEKLY MONTHLY QUARTERLY ANNUAL }
enum WidgetType {
  KPI_CARD LINE_CHART BAR_CHART PIE_CHART
  TABLE ALERT_LIST RANKING MAP
}
```

```bash
npx prisma validate
npx prisma migrate dev --name "add_dashboard_institutional"
npx prisma generate
```

---

## PASSO 2 — DTOs

```typescript
// src/dashboard-institutional/dto/create-snapshot.dto.ts
import { IsString, IsOptional, IsEnum, Length } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { SnapshotType } from '@prisma/client';

export class CreateSnapshotDto {
  @ApiProperty({ example: '2026-06' })
  @IsString() @Length(4, 20)
  period: string;

  @ApiPropertyOptional({ enum: SnapshotType, default: 'MONTHLY' })
  @IsOptional() @IsEnum(SnapshotType)
  type?: SnapshotType;

  @ApiPropertyOptional()
  @IsOptional() @IsString()
  notes?: string;
}

// src/dashboard-institutional/dto/create-widget.dto.ts
import {
  IsString, IsOptional, IsEnum, IsInt, IsBoolean, Length,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { WidgetType } from '@prisma/client';

export class CreateWidgetDto {
  @ApiProperty({ enum: WidgetType })
  @IsEnum(WidgetType)
  type: WidgetType;

  @ApiProperty({ example: 'Total de Funcionários' })
  @IsString() @Length(2, 100)
  title: string;

  @ApiProperty({ description: 'JSON de configuração do widget' })
  @IsString()
  config: string;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional() @IsInt()
  position?: number;

  @ApiPropertyOptional({ default: 'medium' })
  @IsOptional() @IsString()
  size?: string;
}

// src/dashboard-institutional/dto/update-widget.dto.ts
import { PartialType } from '@nestjs/swagger';
import { IsOptional, IsBoolean } from 'class-validator';
import { CreateWidgetDto } from './create-widget.dto';

export class UpdateWidgetDto extends PartialType(CreateWidgetDto) {
  @IsOptional() @IsBoolean()
  isVisible?: boolean;
}

// src/dashboard-institutional/dto/filter-snapshot.dto.ts
import { IsOptional, IsEnum, IsInt, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { SnapshotType } from '@prisma/client';

export class FilterSnapshotDto {
  @ApiPropertyOptional() @IsOptional() @IsEnum(SnapshotType)
  type?: SnapshotType;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ default: 12 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  limit?: number = 12;
}

// src/dashboard-institutional/dto/index.ts
export * from './create-snapshot.dto';
export * from './create-widget.dto';
export * from './update-widget.dto';
export * from './filter-snapshot.dto';
```

---

## PASSO 3 — Service Completo

```typescript
// src/dashboard-institutional/dashboard-institutional.service.ts
import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateSnapshotDto, CreateWidgetDto, UpdateWidgetDto, FilterSnapshotDto,
} from './dto';

@Injectable()
export class DashboardInstitutionalService {
  constructor(private prisma: PrismaService) {}

  // ─── RESUMO EXECUTIVO ────────────────────────────────

  async getExecutiveSummary() {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfYear = new Date(now.getFullYear(), 0, 1);

    const [
      users, newUsersMonth, courses, activeEnrollments,
      completedThisYear, beneficiaries, partners, funders,
      totalFunding, libraryItems, certificates, badgesIssued,
    ] = await this.prisma.$transaction([
      this.prisma.user.count({ where: { isActive: true, deletedAt: null } }),
      this.prisma.user.count({ where: { createdAt: { gte: startOfMonth } } }),
      this.prisma.course.count({ where: { isActive: true } }),
      this.prisma.enrollment.count({
        where: { status: { in: ['IN_PROGRESS', 'APPROVED'] }, deletedAt: null },
      }),
      this.prisma.enrollment.count({
        where: { status: 'COMPLETED', updatedAt: { gte: startOfYear } },
      }),
      this.safeCount(() => this.prisma.beneficiary.count({ where: { status: 'ACTIVE', deletedAt: null } })),
      this.safeCount(() => this.prisma.partner.count({ where: { status: 'ACTIVE', deletedAt: null } })),
      this.safeCount(() => this.prisma.funder.count({ where: { status: 'ACTIVE', deletedAt: null } })),
      this.safeAggregate(() => this.prisma.fundingGrant.aggregate({
        _sum: { amount: true }, where: { status: 'ACTIVE', deletedAt: null },
      })),
      this.safeCount(() => this.prisma.libraryItem.count({ where: { deletedAt: null } })),
      this.safeCount(() => this.prisma.issuedCertificate.count({ where: { deletedAt: null } })),
      this.safeCount(() => this.prisma.badgeIssuance.count({ where: { deletedAt: null, isRevoked: false } })),
    ]);

    const completionRate = users > 0 ? (completedThisYear / users) * 100 : 0;

    return {
      people: { total: users, newThisMonth: newUsersMonth },
      learning: {
        courses, activeEnrollments, completedThisYear,
        completionRate: Math.round(completionRate * 10) / 10,
      },
      crm: {
        beneficiaries, partners, funders,
        totalFunding: totalFunding || 0,
      },
      knowledge: { libraryItems, certificates, badgesIssued },
    };
  }

  // ─── TENDÊNCIA DE CRESCIMENTO ────────────────────────

  async getGrowthTrend(months = 12) {
    const data = [];
    for (let i = months - 1; i >= 0; i--) {
      const d = new Date();
      d.setMonth(d.getMonth() - i);
      const start = new Date(d.getFullYear(), d.getMonth(), 1);
      const end = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59);
      const range = { gte: start, lte: end };

      const [users, enrollments, completions] = await this.prisma.$transaction([
        this.prisma.user.count({ where: { createdAt: range } }),
        this.prisma.enrollment.count({ where: { createdAt: range } }),
        this.prisma.enrollment.count({ where: { status: 'COMPLETED', updatedAt: range } }),
      ]);

      data.push({
        month: start.toLocaleDateString('pt-AO', { month: 'short', year: 'numeric' }),
        users, enrollments, completions,
      });
    }
    return data;
  }

  // ─── DISTRIBUIÇÃO GEOGRÁFICA ─────────────────────────

  async getGeographicDistribution() {
    const beneficiariesByProvince = await this.safeGroupBy(() =>
      this.prisma.beneficiary.groupBy({
        by: ['province'],
        where: { deletedAt: null, province: { not: null } },
        _count: { id: true },
        orderBy: { _count: { id: 'desc' } },
      }),
    );
    return { beneficiariesByProvince: beneficiariesByProvince || [] };
  }

  // ─── ALERTAS INSTITUCIONAIS ──────────────────────────

  async getAlerts() {
    const now = new Date();
    const in7Days = new Date(now.getTime() + 7 * 86400000);
    const in30Days = new Date(now.getTime() + 30 * 86400000);

    const [
      expiredCerts, overdueReports, followUps,
      expiringContracts, overdueMilestones, pendingApprovals,
    ] = await this.prisma.$transaction([
      this.safeCount(() => this.prisma.issuedCertificate.count({
        where: { expiresAt: { lt: now }, isRevoked: false, deletedAt: null },
      })),
      this.safeCount(() => this.prisma.funderReport.count({
        where: { dueDate: { lt: now }, status: { in: ['PENDING', 'REJECTED'] } },
      })),
      this.safeCount(() => this.prisma.beneficiary.count({
        where: { nextFollowUpAt: { lte: in7Days }, status: 'ACTIVE', deletedAt: null },
      })),
      this.safeCount(() => this.prisma.partner.count({
        where: { contractEnd: { lte: in30Days, gte: now }, status: 'ACTIVE', deletedAt: null },
      })),
      this.safeCount(() => this.prisma.partnerMilestone.count({
        where: { status: { in: ['PENDING', 'IN_PROGRESS'] }, dueDate: { lt: now }, deletedAt: null },
      })),
      this.safeCount(() => this.prisma.libraryItem.count({
        where: { isApproved: false, deletedAt: null },
      })),
    ]);

    return {
      critical: expiredCerts + overdueReports + overdueMilestones,
      warnings: expiringContracts + pendingApprovals,
      reminders: followUps,
      details: {
        expiredCerts, overdueReports, followUps,
        expiringContracts, overdueMilestones, pendingApprovals,
      },
    };
  }

  // ─── SNAPSHOTS (HISTÓRICO DE KPIs) ───────────────────

  async createSnapshot(dto: CreateSnapshotDto, userId: string) {
    const existing = await this.prisma.dashboardSnapshot.findUnique({
      where: { period_type: { period: dto.period, type: dto.type || 'MONTHLY' } },
    });
    if (existing && !existing.deletedAt) {
      throw new ConflictException(`Snapshot para ${dto.period} já existe`);
    }

    const summary = await this.getExecutiveSummary();

    const snapshot = await this.prisma.dashboardSnapshot.create({
      data: {
        period: dto.period,
        type: dto.type || 'MONTHLY',
        notes: dto.notes,
        metrics: JSON.stringify(summary),
        totalUsers: summary.people.total,
        totalEnrollments: summary.learning.activeEnrollments,
        totalBeneficiaries: summary.crm.beneficiaries,
        totalFunding: summary.crm.totalFunding,
        totalCertificates: summary.knowledge.certificates,
        completionRate: summary.learning.completionRate,
        createdById: userId,
      },
    });
    await this.audit(userId, 'CREATE', 'DashboardSnapshot', snapshot.id, { period: dto.period });
    return snapshot;
  }

  async findAllSnapshots(filters: FilterSnapshotDto) {
    const { type, page = 1, limit = 12 } = filters;
    const where = { deletedAt: null, ...(type && { type }) };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.dashboardSnapshot.findMany({
        where, skip: (page - 1) * limit, take: limit,
        orderBy: { period: 'desc' },
        include: { createdBy: { select: { fullName: true } } },
      }),
      this.prisma.dashboardSnapshot.count({ where }),
    ]);
    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async compareSnapshots(period1: string, period2: string, type = 'MONTHLY') {
    const [s1, s2] = await this.prisma.$transaction([
      this.prisma.dashboardSnapshot.findUnique({
        where: { period_type: { period: period1, type: type as any } },
      }),
      this.prisma.dashboardSnapshot.findUnique({
        where: { period_type: { period: period2, type: type as any } },
      }),
    ]);
    if (!s1 || !s2) throw new NotFoundException('Um dos snapshots não existe');

    const delta = (a: number, b: number) => ({
      from: a, to: b,
      change: b - a,
      changePct: a > 0 ? Math.round(((b - a) / a) * 1000) / 10 : 0,
    });

    return {
      period1, period2,
      comparison: {
        users:          delta(s1.totalUsers, s2.totalUsers),
        enrollments:    delta(s1.totalEnrollments, s2.totalEnrollments),
        beneficiaries:  delta(s1.totalBeneficiaries, s2.totalBeneficiaries),
        funding:        delta(s1.totalFunding, s2.totalFunding),
        certificates:   delta(s1.totalCertificates, s2.totalCertificates),
        completionRate: delta(s1.completionRate, s2.completionRate),
      },
    };
  }

  // ─── WIDGETS PERSONALIZADOS ──────────────────────────

  async createWidget(dto: CreateWidgetDto, userId: string) {
    const widget = await this.prisma.dashboardWidget.create({
      data: { ...dto, userId },
    });
    return widget;
  }

  async getMyWidgets(userId: string) {
    return this.prisma.dashboardWidget.findMany({
      where: { userId, deletedAt: null, isVisible: true },
      orderBy: { position: 'asc' },
    });
  }

  async updateWidget(id: string, dto: UpdateWidgetDto, userId: string) {
    const widget = await this.prisma.dashboardWidget.findFirst({
      where: { id, userId, deletedAt: null },
    });
    if (!widget) throw new NotFoundException('Widget não encontrado');
    return this.prisma.dashboardWidget.update({ where: { id }, data: dto });
  }

  async deleteWidget(id: string, userId: string) {
    const widget = await this.prisma.dashboardWidget.findFirst({
      where: { id, userId, deletedAt: null },
    });
    if (!widget) throw new NotFoundException('Widget não encontrado');
    await this.prisma.dashboardWidget.update({
      where: { id }, data: { deletedAt: new Date() },
    });
    return { message: 'Widget removido com sucesso' };
  }

  // ─── HELPERS DEFENSIVOS ──────────────────────────────
  // (módulos podem não existir ainda — evita crash)

  private async safeCount(fn: () => Promise<number>): Promise<number> {
    try { return await fn(); } catch { return 0; }
  }

  private async safeAggregate(fn: () => Promise<any>): Promise<number> {
    try {
      const result = await fn();
      return result?._sum?.amount || 0;
    } catch { return 0; }
  }

  private async safeGroupBy(fn: () => Promise<any>): Promise<any[]> {
    try { return await fn(); } catch { return []; }
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
// src/dashboard-institutional/dashboard-institutional.controller.ts
import {
  Controller, Get, Post, Put, Delete, Body,
  Param, Query, UseGuards, HttpCode, HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard }   from '../auth/guards/roles.guard';
import { Roles }        from '../auth/decorators/roles.decorator';
import { CurrentUser }  from '../auth/decorators/current-user.decorator';
import { DashboardInstitutionalService } from './dashboard-institutional.service';
import {
  CreateSnapshotDto, CreateWidgetDto, UpdateWidgetDto, FilterSnapshotDto,
} from './dto';

@ApiTags('Dashboard Institucional')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('dashboard-institutional')
export class DashboardInstitutionalController {
  constructor(private readonly service: DashboardInstitutionalService) {}

  // ─── LEITURA / AGREGAÇÃO ─────────────────────────────

  @Get('summary')
  @Roles('ADMIN', 'RH', 'MANAGER')
  @ApiOperation({ summary: 'Resumo executivo (KPIs globais)' })
  getExecutiveSummary() {
    return this.service.getExecutiveSummary();
  }

  @Get('growth-trend')
  @Roles('ADMIN', 'RH', 'MANAGER')
  @ApiOperation({ summary: 'Tendência de crescimento (N meses)' })
  getGrowthTrend(@Query('months') months?: number) {
    return this.service.getGrowthTrend(months);
  }

  @Get('geographic')
  @Roles('ADMIN', 'RH', 'MANAGER')
  @ApiOperation({ summary: 'Distribuição geográfica' })
  getGeographicDistribution() {
    return this.service.getGeographicDistribution();
  }

  @Get('alerts')
  @Roles('ADMIN', 'RH', 'MANAGER')
  @ApiOperation({ summary: 'Alertas institucionais' })
  getAlerts() {
    return this.service.getAlerts();
  }

  // ─── SNAPSHOTS ───────────────────────────────────────

  @Post('snapshots')
  @Roles('ADMIN', 'RH')
  @ApiOperation({ summary: 'Criar snapshot de KPIs do período' })
  createSnapshot(@Body() dto: CreateSnapshotDto, @CurrentUser() user: any) {
    return this.service.createSnapshot(dto, user.id);
  }

  @Get('snapshots')
  @Roles('ADMIN', 'RH', 'MANAGER')
  @ApiOperation({ summary: 'Listar snapshots (histórico de KPIs)' })
  findAllSnapshots(@Query() filters: FilterSnapshotDto) {
    return this.service.findAllSnapshots(filters);
  }

  @Get('snapshots/compare')
  @Roles('ADMIN', 'RH', 'MANAGER')
  @ApiOperation({ summary: 'Comparar dois períodos' })
  compareSnapshots(
    @Query('period1') period1: string,
    @Query('period2') period2: string,
    @Query('type') type?: string,
  ) {
    return this.service.compareSnapshots(period1, period2, type);
  }

  // ─── WIDGETS ─────────────────────────────────────────

  @Post('widgets')
  @ApiOperation({ summary: 'Criar widget personalizado' })
  createWidget(@Body() dto: CreateWidgetDto, @CurrentUser() user: any) {
    return this.service.createWidget(dto, user.id);
  }

  @Get('widgets')
  @ApiOperation({ summary: 'Meus widgets' })
  getMyWidgets(@CurrentUser() user: any) {
    return this.service.getMyWidgets(user.id);
  }

  @Put('widgets/:id')
  @ApiOperation({ summary: 'Actualizar widget' })
  updateWidget(@Param('id') id: string, @Body() dto: UpdateWidgetDto, @CurrentUser() user: any) {
    return this.service.updateWidget(id, dto, user.id);
  }

  @Delete('widgets/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Remover widget' })
  deleteWidget(@Param('id') id: string, @CurrentUser() user: any) {
    return this.service.deleteWidget(id, user.id);
  }
}
```

---

## PASSO 5 — Module

```typescript
// src/dashboard-institutional/dashboard-institutional.module.ts
import { Module }    from '@nestjs/common';
import { DashboardInstitutionalController } from './dashboard-institutional.controller';
import { DashboardInstitutionalService }    from './dashboard-institutional.service';
import { PrismaModule }                     from '../prisma/prisma.module';

@Module({
  imports:     [PrismaModule],
  controllers: [DashboardInstitutionalController],
  providers:   [DashboardInstitutionalService],
  exports:     [DashboardInstitutionalService],
})
export class DashboardInstitutionalModule {}
```

```typescript
// src/app.module.ts — adicionar:
import { DashboardInstitutionalModule } from './dashboard-institutional/dashboard-institutional.module';
imports: [ ...existentes..., DashboardInstitutionalModule ],
```

---

## PASSO 6 — Spec File (8 testes)

```typescript
// src/dashboard-institutional/dashboard-institutional.service.spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import { DashboardInstitutionalService } from './dashboard-institutional.service';
import { PrismaService } from '../prisma/prisma.service';
import { NotFoundException, ConflictException } from '@nestjs/common';

const mockPrisma = {
  user:               { count: jest.fn() },
  course:             { count: jest.fn() },
  enrollment:         { count: jest.fn() },
  beneficiary:        { count: jest.fn(), groupBy: jest.fn() },
  partner:            { count: jest.fn() },
  partnerMilestone:   { count: jest.fn() },
  funder:             { count: jest.fn() },
  fundingGrant:       { aggregate: jest.fn() },
  funderReport:       { count: jest.fn() },
  libraryItem:        { count: jest.fn() },
  issuedCertificate:  { count: jest.fn() },
  badgeIssuance:      { count: jest.fn() },
  dashboardSnapshot: {
    create: jest.fn(), findMany: jest.fn(), findUnique: jest.fn(), count: jest.fn(),
  },
  dashboardWidget: {
    create: jest.fn(), findMany: jest.fn(), findFirst: jest.fn(), update: jest.fn(),
  },
  auditLog:     { create: jest.fn() },
  $transaction: jest.fn(),
};

describe('DashboardInstitutionalService', () => {
  let service: DashboardInstitutionalService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DashboardInstitutionalService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();
    service = module.get<DashboardInstitutionalService>(DashboardInstitutionalService);
    jest.clearAllMocks();
  });

  describe('getExecutiveSummary', () => {
    it('deve retornar resumo com people, learning, crm, knowledge', async () => {
      mockPrisma.$transaction.mockResolvedValue([
        100, 10, 25, 40, 60, 30, 5, 3, 5000000, 50, 80, 20,
      ]);
      const result = await service.getExecutiveSummary();
      expect(result).toHaveProperty('people');
      expect(result).toHaveProperty('learning');
      expect(result).toHaveProperty('crm');
      expect(result).toHaveProperty('knowledge');
      expect(result.people.total).toBe(100);
    });

    it('deve calcular completionRate correctamente', async () => {
      mockPrisma.$transaction.mockResolvedValue([
        100, 10, 25, 40, 50, 30, 5, 3, 0, 50, 80, 20,
      ]);
      const result = await service.getExecutiveSummary();
      expect(result.learning.completionRate).toBe(50);
    });
  });

  describe('getGrowthTrend', () => {
    it('deve retornar array com N meses', async () => {
      mockPrisma.$transaction.mockResolvedValue([5, 10, 8]);
      const result = await service.getGrowthTrend(3);
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(3);
      expect(result[0]).toHaveProperty('month');
      expect(result[0]).toHaveProperty('users');
    });
  });

  describe('getAlerts', () => {
    it('deve retornar críticos, avisos e lembretes', async () => {
      mockPrisma.$transaction.mockResolvedValue([2, 1, 3, 1, 0, 4]);
      const result = await service.getAlerts();
      expect(result).toHaveProperty('critical');
      expect(result).toHaveProperty('warnings');
      expect(result).toHaveProperty('reminders');
      expect(result.critical).toBe(3); // 2+1+0
    });
  });

  describe('createSnapshot', () => {
    it('deve criar snapshot com métricas em JSON', async () => {
      mockPrisma.dashboardSnapshot.findUnique.mockResolvedValue(null);
      mockPrisma.$transaction.mockResolvedValue([
        100, 10, 25, 40, 60, 30, 5, 3, 5000000, 50, 80, 20,
      ]);
      mockPrisma.dashboardSnapshot.create.mockResolvedValue({
        id: 'snap-1', period: '2026-06', totalUsers: 100,
      });
      mockPrisma.auditLog.create.mockResolvedValue({});

      const result = await service.createSnapshot({ period: '2026-06' }, 'user-1');
      expect(result.period).toBe('2026-06');
      expect(mockPrisma.auditLog.create).toHaveBeenCalled();
    });

    it('deve lançar ConflictException se snapshot já existe', async () => {
      mockPrisma.dashboardSnapshot.findUnique.mockResolvedValue({
        id: 'snap-1', deletedAt: null,
      });
      await expect(
        service.createSnapshot({ period: '2026-06' }, 'user-1'),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('compareSnapshots', () => {
    it('deve comparar dois períodos com variação percentual', async () => {
      mockPrisma.$transaction.mockResolvedValue([
        { totalUsers: 100, totalEnrollments: 40, totalBeneficiaries: 30,
          totalFunding: 1000000, totalCertificates: 50, completionRate: 60 },
        { totalUsers: 120, totalEnrollments: 50, totalBeneficiaries: 35,
          totalFunding: 1500000, totalCertificates: 70, completionRate: 65 },
      ]);
      const result = await service.compareSnapshots('2026-05', '2026-06');
      expect(result.comparison.users.change).toBe(20);
      expect(result.comparison.users.changePct).toBe(20);
    });

    it('deve lançar NotFoundException se snapshot não existe', async () => {
      mockPrisma.$transaction.mockResolvedValue([null, null]);
      await expect(
        service.compareSnapshots('2026-05', '2026-06'),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
```

---

## PASSO 7 — Bruno CLI (6 ficheiros)

```
# bruno/dashboard-institutional/01-summary.bru
meta { name: Resumo Executivo  type: http  seq: 1 }
get { url: {{baseUrl}}/dashboard-institutional/summary  auth: bearer }
auth:bearer { token: {{accessToken}} }
tests {
  test("Status 200", function() { expect(res.status).to.equal(200); });
  test("Tem secções principais", function() {
    expect(res.body).to.have.property("people");
    expect(res.body).to.have.property("learning");
    expect(res.body).to.have.property("crm");
    expect(res.body).to.have.property("knowledge");
  });
}

---

# bruno/dashboard-institutional/02-growth-trend.bru
meta { name: Tendência de Crescimento  type: http  seq: 2 }
get { url: {{baseUrl}}/dashboard-institutional/growth-trend?months=6  auth: bearer }
auth:bearer { token: {{accessToken}} }
tests {
  test("Status 200", function() { expect(res.status).to.equal(200); });
  test("É um array", function() { expect(res.body).to.be.an("array"); });
}

---

# bruno/dashboard-institutional/03-alerts.bru
meta { name: Alertas  type: http  seq: 3 }
get { url: {{baseUrl}}/dashboard-institutional/alerts  auth: bearer }
auth:bearer { token: {{accessToken}} }
tests {
  test("Status 200", function() { expect(res.status).to.equal(200); });
  test("Tem critical, warnings, reminders", function() {
    expect(res.body).to.have.property("critical");
    expect(res.body).to.have.property("warnings");
    expect(res.body).to.have.property("reminders");
  });
}

---

# bruno/dashboard-institutional/04-criar-snapshot.bru
meta { name: Criar Snapshot  type: http  seq: 4 }
post { url: {{baseUrl}}/dashboard-institutional/snapshots  body: json  auth: bearer }
auth:bearer { token: {{accessToken}} }
body:json {
  { "period": "2026-06-BRUNO", "type": "MONTHLY", "notes": "Snapshot de teste Bruno" }
}
tests {
  test("Status 201", function() { expect(res.status).to.equal(201); });
  test("Tem período", function() { expect(res.body.period).to.equal("2026-06-BRUNO"); });
}

---

# bruno/dashboard-institutional/05-listar-snapshots.bru
meta { name: Listar Snapshots  type: http  seq: 5 }
get { url: {{baseUrl}}/dashboard-institutional/snapshots?page=1&limit=12  auth: bearer }
auth:bearer { token: {{accessToken}} }
tests {
  test("Status 200", function() { expect(res.status).to.equal(200); });
  test("Paginação", function() { expect(res.body).to.have.property("totalPages"); });
}

---

# bruno/dashboard-institutional/06-geographic.bru
meta { name: Distribuição Geográfica  type: http  seq: 6 }
get { url: {{baseUrl}}/dashboard-institutional/geographic  auth: bearer }
auth:bearer { token: {{accessToken}} }
tests {
  test("Status 200", function() { expect(res.status).to.equal(200); });
  test("Tem distribuição", function() {
    expect(res.body).to.have.property("beneficiariesByProvince");
  });
}
```

---

## PASSO 8 — Frontend Completo (com gráficos SVG)

```tsx
// frontend/app/dashboard/institutional/page.tsx
'use client';
import { useState, useEffect, useCallback } from 'react';

interface Summary {
  people: { total: number; newThisMonth: number };
  learning: { courses: number; activeEnrollments: number; completedThisYear: number; completionRate: number };
  crm: { beneficiaries: number; partners: number; funders: number; totalFunding: number };
  knowledge: { libraryItems: number; certificates: number; badgesIssued: number };
}

function KpiCard({ label, value, sub, color }: any) {
  return (
    <div className="bg-white rounded-xl shadow p-5">
      <p className="text-xs text-gray-400 uppercase tracking-wide">{label}</p>
      <p className={`text-3xl font-bold mt-1 ${color || 'text-gray-900'}`}>{value}</p>
      {sub && <p className="text-xs text-gray-500 mt-1">{sub}</p>}
    </div>
  );
}

// Gráfico de barras simples em SVG (sem libraria externa)
function MiniBarChart({ data }: { data: { month: string; users: number }[] }) {
  const max = Math.max(...data.map(d => d.users), 1);
  return (
    <div className="flex items-end gap-2 h-32">
      {data.map((d, i) => (
        <div key={i} className="flex-1 flex flex-col items-center gap-1">
          <div className="w-full bg-blue-500 rounded-t"
            style={{ height: `${(d.users / max) * 100}%`, minHeight: '4px' }} />
          <span className="text-[10px] text-gray-400">{d.month.split(' ')[0]}</span>
        </div>
      ))}
    </div>
  );
}

export default function InstitutionalDashboardPage() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [trend, setTrend]     = useState<any[]>([]);
  const [alerts, setAlerts]   = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');

  const fetchAll = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const [sumRes, trendRes, alertRes] = await Promise.all([
        fetch('/api/dashboard-institutional/summary', { credentials: 'include' }),
        fetch('/api/dashboard-institutional/growth-trend?months=6', { credentials: 'include' }),
        fetch('/api/dashboard-institutional/alerts', { credentials: 'include' }),
      ]);
      if (!sumRes.ok) throw new Error('Erro ao carregar o dashboard');
      setSummary(await sumRes.json());
      setTrend(await trendRes.json());
      setAlerts(await alertRes.json());
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  if (loading) return (
    <div className="p-6 grid grid-cols-2 lg:grid-cols-4 gap-4">
      {[...Array(8)].map((_, i) => (
        <div key={i} className="h-28 bg-gray-100 rounded-xl animate-pulse" />
      ))}
    </div>
  );

  if (error) return (
    <div className="p-6">
      <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-lg">
        {error}
        <button onClick={fetchAll} className="ml-4 underline">Tentar novamente</button>
      </div>
    </div>
  );

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Dashboard Institucional</h1>

      {/* Alertas */}
      {alerts && (alerts.critical > 0 || alerts.warnings > 0) && (
        <div className="flex gap-4">
          {alerts.critical > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 flex-1">
              <span className="text-red-700 font-semibold">{alerts.critical} alertas críticos</span>
            </div>
          )}
          {alerts.warnings > 0 && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg px-4 py-3 flex-1">
              <span className="text-yellow-700 font-semibold">{alerts.warnings} avisos</span>
            </div>
          )}
          {alerts.reminders > 0 && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 flex-1">
              <span className="text-blue-700 font-semibold">{alerts.reminders} lembretes</span>
            </div>
          )}
        </div>
      )}

      {/* KPIs principais */}
      {summary && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCard label="Funcionários" value={summary.people.total}
            sub={`+${summary.people.newThisMonth} este mês`} color="text-blue-600" />
          <KpiCard label="Inscrições Activas" value={summary.learning.activeEnrollments}
            sub={`${summary.learning.completionRate}% conclusão`} color="text-green-600" />
          <KpiCard label="Beneficiários" value={summary.crm.beneficiaries} />
          <KpiCard label="Financiamento"
            value={`AOA ${(summary.crm.totalFunding / 1_000_000).toFixed(1)}M`} color="text-purple-600" />
          <KpiCard label="Cursos" value={summary.learning.courses} />
          <KpiCard label="Parceiros" value={summary.crm.partners} />
          <KpiCard label="Certificados" value={summary.knowledge.certificates} />
          <KpiCard label="Biblioteca" value={summary.knowledge.libraryItems} sub="recursos" />
        </div>
      )}

      {/* Tendência */}
      <div className="bg-white rounded-xl shadow p-5">
        <h2 className="font-semibold text-gray-900 mb-4">Novos Funcionários (6 meses)</h2>
        {trend.length > 0 && <MiniBarChart data={trend} />}
      </div>
    </div>
  );
}
```

---

## PROMPT PARA O CLAUDE CODE

```
O Módulo 5 (Certificação Digital) está completo e aprovado.
Implementa agora o Módulo 6 — Dashboard Institucional.
Lê o DASHBOARD-INSTITUCIONAL-GUIDE.md na raiz do projecto.

ATENÇÃO: este módulo é diferente dos anteriores.
É maioritariamente LEITURA/AGREGAÇÃO — consome dados
dos módulos 1-5 e calcula KPIs.
Usa os helpers defensivos (safeCount, safeAggregate)
porque alguns módulos podem não existir ainda.

Segue EXACTAMENTE estes 22 passos:

1. Verifica os modelos existentes no schema

2. Adiciona ao prisma/schema.prisma:
   DashboardSnapshot, DashboardWidget + enums

3. npx prisma validate
4. npx prisma migrate dev --name "add_dashboard_institutional"
5. npx prisma generate

6. Cria src/dashboard-institutional/dto/ com os 4 DTOs

7. Cria src/dashboard-institutional/dashboard-institutional.service.ts
   IMPORTANTE: inclui os helpers safeCount/safeAggregate/safeGroupBy
   para não rebentar se beneficiary/partner/funder/library/cert
   ainda não existirem no schema

8. Cria src/dashboard-institutional/dashboard-institutional.controller.ts

9. Cria src/dashboard-institutional/dashboard-institutional.module.ts

10. Adiciona DashboardInstitutionalModule ao src/app.module.ts

11. npm run build → DEVE PASSAR com 0 erros

12. Cria o spec file (8 testes conforme o guia)

13. npm run test -- --testPathPattern=dashboard-institutional --forceExit
    → DEVE PASSAR com 0 falhas

14. npm run test:cov 2>&1 | tail -5
    → Se < 55% adiciona mais testes

15. Cria bruno/dashboard-institutional/ com os 6 ficheiros .bru

16. Com o backend a correr:
    npx bru run bruno/dashboard-institutional/ --env local
    → TODOS devem passar

17. Cria frontend/app/dashboard/institutional/page.tsx
    (KPIs em cards + gráfico de barras SVG + alertas)

18. Adiciona ao sidebar: link para /dashboard/institutional
    (só visível para ADMIN/RH/MANAGER)

19. Confirma que o gráfico SVG funciona sem libraria externa
    (o INNOVA não usa bibliotecas de charting)

20. npm run build do frontend → confirma 0 erros

21. git add -A
    git commit -m "feat: Dashboard Institucional completo - KPIs, snapshots, alertas, 8 specs, 6 bruno" --no-verify
    git push origin main

22. Mostra resumo:
    - Build: OK / FALHOU
    - Testes: X/8 passaram
    - Cobertura: X%
    - Bruno: X/6 passaram
    PARA e espera confirmação para Módulo 7

REGRAS ABSOLUTAS DO INNOVA:
- fullName (NUNCA name) — User model
- entity (NUNCA entityType) — AuditLog
- metadata → JSON.stringify()
- deletedAt em TODOS os novos modelos
- auditLog em CREATE, UPDATE, DELETE
- Paginação: { data, total, page, limit, totalPages }
- Sem bibliotecas de charting — usar SVG nativo
- Backend porta 4000 | Frontend porta 3000

EXECUTA UMA OPERAÇÃO DE CADA VEZ.
A CADA 20 MINUTOS FAZ COMMIT PARCIAL.
SE FICAR LENTA (>25 min): commit e para.
```

---

*INNOVA — Dashboard Institucional Guide v1.0*
*Mesmo padrão dos Módulos 1-5 (adaptado a agregação)*
*SAP Analytics Cloud + Power BI Embedded + Tableau*
*KPIs + Snapshots + Comparação + Alertas + Widgets + Gráficos SVG*
