import { Test, TestingModule } from '@nestjs/testing';
import { DashboardInstitutionalService } from './dashboard-institutional.service';
import { PrismaService } from '../prisma/prisma.service';
import { NotFoundException, ConflictException } from '@nestjs/common';
import { AuditService } from '../common/services/audit.service';
import { AuditService as AuditLogStatsService } from '../audit/audit.service';
import { CacheService } from '../cache/cache.service';
import { EngagementService } from '../engagement/engagement.service';
import { OnboardingService } from '../onboarding/onboarding.service';
import { SuccessionService } from '../succession/succession.service';
import { EventsService } from '../events/events.service';
import { ProcessStandardService } from '../process-standard/process-standard.service';
import { LegacyDocumentDeclarationsService } from '../work-declaration/legacy-document-declarations.service';
import { AutomationService } from '../automation/automation.service';
import { ScalabilityService } from '../scalability/scalability.service';
import { MonitoringService } from '../monitoring/monitoring.service';
import { DashboardService } from '../dashboard/dashboard.service';

const mockPrisma = {
  user: { count: jest.fn() },
  course: { count: jest.fn() },
  enrollment: { count: jest.fn() },
  beneficiary: { count: jest.fn(), groupBy: jest.fn() },
  partner: { count: jest.fn() },
  partnerMilestone: { count: jest.fn() },
  funder: { count: jest.fn() },
  fundingGrant: { aggregate: jest.fn() },
  funderReport: { count: jest.fn() },
  libraryItem: { count: jest.fn() },
  certificate: { count: jest.fn() },
  badgeAward: { count: jest.fn() },
  institutionalSnapshot: {
    create: jest.fn(),
    findMany: jest.fn(),
    findUnique: jest.fn(),
    count: jest.fn(),
  },
  dashboardWidget: {
    create: jest.fn(),
    findMany: jest.fn(),
    findFirst: jest.fn(),
    update: jest.fn(),
  },
  auditLog: { create: jest.fn() },
  $transaction: jest.fn(),
};

const mockAudit = {
  logEntity: jest.fn((userId, action, entity, entityId, meta = {}) =>
    mockPrisma.auditLog.create({
      data: { userId, action, entity, metadata: JSON.stringify({ ...meta, entityId }) },
    }),
  ),
};

const cacheGetOrSet = jest.fn((_k: string, _ttl: number, fn: () => any) => fn());
const cacheMock = { getOrSet: cacheGetOrSet } as any;

const mockEngagement = {
  getDashboard: jest.fn().mockResolvedValue({
    kpis: { engagementIndex: 70, engagementLevel: 'GOOD', participationRate: 60, enps: 20 },
  }),
};
const mockOnboarding = {
  getDashboard: jest.fn().mockResolvedValue({
    summary: { byStatus: { IN_PROGRESS: 5, NOT_STARTED: 2 }, overdueTasks: 1, avgSurveyScore: 4.2 },
  }),
};
const mockSuccession = {
  getDashboard: jest.fn().mockResolvedValue({
    kpis: {
      totalCriticalPositions: 10,
      withoutSuccessor: 3,
      coverageRate: 70,
      highRiskPositions: 2,
    },
  }),
};
const mockEvents = {
  getStats: jest.fn().mockResolvedValue({ total: 15, totalParticipants: 120 }),
};
const mockProcessStandard = {
  getDashboard: jest.fn().mockResolvedValue({
    processes: { active: 8, draft: 1, inReview: 1 },
    instances: { inProgress: 4, completed: 20 },
    compliance: { overdueSteps: 2, slaComplianceRate: null },
  }),
};
const mockDeclarations = {
  getDashboard: jest.fn().mockResolvedValue({ pending: 3, generated: 1, issued: 40, total: 44 }),
};
const mockAuditStats = {
  getStats: jest
    .fn()
    .mockResolvedValue({ totals: { total: 500, today: 12, critical: 1, failedLoginsToday: 0 } }),
};
const mockAutomation = {
  getStats: jest.fn().mockResolvedValue({
    rules: { total: 6, active: 5, inactive: 1 },
    executions: { total: 40, success: 39, failed: 1, successRate: 98.5 },
  }),
};
const mockScalability = {
  resolveTenantId: jest.fn().mockResolvedValue('tenant-1'),
  getDashboard: jest.fn().mockResolvedValue({
    performanceSummary: { uptimePercent: 99.9 },
    alerts: { open: 2, critical: 0, warning: 2, info: 0 },
    integrations: { total: 4, active: 3, withErrors: 1 },
  }),
};
const mockMonitoring = {
  getDashboard: jest.fn().mockResolvedValue({
    okrs: {
      activeCycles: 2,
      totalObjectives: 20,
      completedObjectives: 10,
      objectiveCompletionRate: 50,
    },
    evaluation: {
      activeEvalCycles: 1,
      pendingEvaluations: 8,
      completedEvaluations: 32,
      evaluationCompletionRate: 80,
    },
  }),
};
const mockDashboard = {
  getExecutiveDashboard: jest.fn().mockResolvedValue({
    kpis: { headcount: { total: 200, active: 190 } },
    talentHealth: { healthScore: 72, grade: 'B' },
    enps: { enps: 30, promoterPct: 50, total: 20 },
    topTalent: [{ id: 1, fullName: 'Fulano' }],
    risks: [],
  }),
};

describe('DashboardInstitutionalService', () => {
  let service: DashboardInstitutionalService;

  beforeEach(async () => {
    Object.defineProperty(mockPrisma, 'read', {
      get() {
        return mockPrisma;
      },
      configurable: true,
    });
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DashboardInstitutionalService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AuditService, useValue: mockAudit },
        { provide: CacheService, useValue: cacheMock },
        { provide: EngagementService, useValue: mockEngagement },
        { provide: OnboardingService, useValue: mockOnboarding },
        { provide: SuccessionService, useValue: mockSuccession },
        { provide: EventsService, useValue: mockEvents },
        { provide: ProcessStandardService, useValue: mockProcessStandard },
        { provide: LegacyDocumentDeclarationsService, useValue: mockDeclarations },
        { provide: AuditLogStatsService, useValue: mockAuditStats },
        { provide: AutomationService, useValue: mockAutomation },
        { provide: ScalabilityService, useValue: mockScalability },
        { provide: MonitoringService, useValue: mockMonitoring },
        { provide: DashboardService, useValue: mockDashboard },
      ],
    }).compile();
    service = module.get<DashboardInstitutionalService>(DashboardInstitutionalService);
    jest.clearAllMocks();
  });

  describe('getExecutiveSummary', () => {
    it('deve retornar resumo com people, learning, crm, knowledge', async () => {
      mockPrisma.$transaction.mockResolvedValue([
        100,
        10,
        25,
        40,
        60,
        30,
        5,
        3,
        { _sum: { amount: 5000000 } },
        50,
        80,
        20,
      ]);
      const result = await service.getExecutiveSummary();
      expect(result).toHaveProperty('people');
      expect(result).toHaveProperty('learning');
      expect(result).toHaveProperty('crm');
      expect(result).toHaveProperty('knowledge');
      expect(result.people.total).toBe(100);
      expect(result.crm.totalFunding).toBe(5000000);
    });

    it('getExecutiveSummary usa cache com chave e TTL certos', async () => {
      await service.getExecutiveSummary();
      expect(cacheGetOrSet).toHaveBeenCalledWith(
        'dashboard:institutional:executive-summary',
        90,
        expect.any(Function),
      );
    });

    it('deve calcular completionRate correctamente', async () => {
      mockPrisma.$transaction.mockResolvedValue([
        100,
        10,
        25,
        40,
        50,
        30,
        5,
        3,
        { _sum: { amount: 0 } },
        50,
        80,
        20,
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
      expect(result[0].users).toBe(5);
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
      expect(result.warnings).toBe(5); // 1+4
      expect(result.reminders).toBe(3);
    });
  });

  describe('getGeographicDistribution', () => {
    it('deve retornar distribuição por província', async () => {
      mockPrisma.beneficiary.groupBy.mockResolvedValue([
        { province: 'LUANDA', _count: { id: 10 } },
      ]);
      const result = await service.getGeographicDistribution();
      expect(result).toHaveProperty('beneficiariesByProvince');
      expect(result.beneficiariesByProvince).toHaveLength(1);
    });
  });

  describe('createSnapshot', () => {
    it('deve criar snapshot com métricas em JSON', async () => {
      mockPrisma.institutionalSnapshot.findUnique.mockResolvedValue(null);
      mockPrisma.$transaction.mockResolvedValue([
        100,
        10,
        25,
        40,
        60,
        30,
        5,
        3,
        { _sum: { amount: 5000000 } },
        50,
        80,
        20,
      ]);
      mockPrisma.institutionalSnapshot.create.mockResolvedValue({
        id: 'snap-1',
        period: '2026-06',
        totalUsers: 100,
      });
      mockPrisma.auditLog.create.mockResolvedValue({});

      const result = await service.createSnapshot({ period: '2026-06' }, 1);
      expect(result.period).toBe('2026-06');
      expect(mockPrisma.auditLog.create).toHaveBeenCalled();
    });

    it('deve lançar ConflictException se snapshot já existe', async () => {
      mockPrisma.institutionalSnapshot.findUnique.mockResolvedValue({
        id: 'snap-1',
        deletedAt: null,
      });
      await expect(service.createSnapshot({ period: '2026-06' }, 1)).rejects.toThrow(
        ConflictException,
      );
    });
  });

  describe('findAllSnapshots', () => {
    it('deve retornar snapshots paginados', async () => {
      mockPrisma.$transaction.mockResolvedValue([[{ id: 'snap-1' }], 1]);
      const result = await service.findAllSnapshots({ page: 1, limit: 12 });
      expect(result.total).toBe(1);
      expect(result.totalPages).toBe(1);
    });
  });

  describe('compareSnapshots', () => {
    it('deve comparar dois períodos com variação percentual', async () => {
      mockPrisma.$transaction.mockResolvedValue([
        {
          totalUsers: 100,
          totalEnrollments: 40,
          totalBeneficiaries: 30,
          totalFunding: 1000000,
          totalCertificates: 50,
          completionRate: 60,
        },
        {
          totalUsers: 120,
          totalEnrollments: 50,
          totalBeneficiaries: 35,
          totalFunding: 1500000,
          totalCertificates: 70,
          completionRate: 65,
        },
      ]);
      const result = await service.compareSnapshots('2026-05', '2026-06');
      expect(result.comparison.users.change).toBe(20);
      expect(result.comparison.users.changePct).toBe(20);
    });

    it('deve lançar NotFoundException se snapshot não existe', async () => {
      mockPrisma.$transaction.mockResolvedValue([null, null]);
      await expect(service.compareSnapshots('2026-05', '2026-06')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('widgets', () => {
    it('createWidget deve criar widget', async () => {
      mockPrisma.dashboardWidget.create.mockResolvedValue({ id: 'w-1' });
      const result = await service.createWidget(
        { type: 'KPI_CARD' as any, title: 'T', config: '{}' },
        1,
      );
      expect(result.id).toBe('w-1');
    });

    it('updateWidget deve lançar NotFoundException se não existir', async () => {
      mockPrisma.dashboardWidget.findFirst.mockResolvedValue(null);
      await expect(service.updateWidget('w-1', { title: 'X' } as any, 1)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('deleteWidget deve remover (soft delete)', async () => {
      mockPrisma.dashboardWidget.findFirst.mockResolvedValue({ id: 'w-1' });
      mockPrisma.dashboardWidget.update.mockResolvedValue({});
      const result = await service.deleteWidget('w-1', 1);
      expect(result.message).toContain('sucesso');
    });
  });

  describe('getExecutive', () => {
    it('deve compor organização (DashboardService) + resumo institucional num único payload', async () => {
      jest.spyOn(service, 'getExecutiveSummary').mockResolvedValue({ mock: 'summary' } as any);
      jest.spyOn(service, 'getGrowthTrend').mockResolvedValue([{ month: 'Jan' }] as any);
      jest
        .spyOn(service, 'getGeographicDistribution')
        .mockResolvedValue({ beneficiariesByProvince: [] } as any);
      jest.spyOn(service, 'getAlerts').mockResolvedValue({ critical: 0 } as any);
      jest.spyOn(service, 'getModulesOverview').mockResolvedValue({ engagement: null } as any);

      const result = await service.getExecutive('QUARTER' as any);

      expect(mockDashboard.getExecutiveDashboard).toHaveBeenCalledWith('QUARTER');
      expect(result.organization.talentHealth).toEqual({ healthScore: 72, grade: 'B' });
      expect(result.summary).toEqual({ mock: 'summary' });
      expect(result.growthTrend).toEqual([{ month: 'Jan' }]);
      expect(result.geographic).toEqual({ beneficiariesByProvince: [] });
      expect(result.alerts).toEqual({ critical: 0 });
      expect(result.modules).toEqual({ engagement: null });
    });
  });

  describe('getModulesOverview', () => {
    it('deve agregar os painéis de todos os módulos', async () => {
      const result = await service.getModulesOverview();

      expect(result.engagement).toEqual({
        index: 70,
        level: 'GOOD',
        participationRate: 60,
        enps: 20,
      });
      expect(result.talentAndSuccession).toEqual({
        criticalPositions: 10,
        withoutSuccessor: 3,
        coverageRate: 70,
        highRiskPositions: 2,
      });
      expect(result.onboarding).toEqual({ active: 7, overdueTasks: 1, avgSurveyScore: 4.2 });
      expect(result.events).toEqual({ total: 15, totalParticipants: 120 });
      expect(result.processes).toEqual({ active: 8, inProgress: 4, overdueSteps: 2 });
      expect(result.declarations).toEqual({ pending: 3, issued: 40, total: 44 });
      expect(result.audit).toEqual({ totalEvents: 500, todayEvents: 12, criticalEvents: 1 });
      expect(result.automation).toEqual({ totalRules: 6, activeRules: 5, successRate: 98.5 });
      expect(result.platform).toEqual({
        uptimePercent: 99.9,
        openAlerts: 2,
        criticalAlerts: 0,
        integrationsWithErrors: 1,
      });
      expect(result.okr).toEqual({ activeCycles: 2, objectiveCompletionRate: 50 });
      expect(result.evaluationCycles).toEqual({
        activeCycles: 1,
        pendingEvaluations: 8,
        completionRate: 80,
      });
      expect(mockScalability.resolveTenantId).toHaveBeenCalled();
      expect(mockScalability.getDashboard).toHaveBeenCalledWith('tenant-1');
    });

    it('deve degradar graciosamente quando um módulo falha (Promise.allSettled)', async () => {
      mockSuccession.getDashboard.mockRejectedValueOnce(new Error('sucessão indisponível'));
      const result = await service.getModulesOverview();

      expect(result.talentAndSuccession).toBeNull();
      // restantes módulos continuam presentes
      expect(result.engagement).not.toBeNull();
      expect(result.onboarding).not.toBeNull();
    });

    it('getModulesOverview usa cache com chave e TTL certos', async () => {
      await service.getModulesOverview();
      expect(cacheGetOrSet).toHaveBeenCalledWith(
        'dashboard:institutional:modules-overview',
        90,
        expect.any(Function),
      );
    });
  });
});
