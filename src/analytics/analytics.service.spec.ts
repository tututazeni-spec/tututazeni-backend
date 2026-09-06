import { Test, TestingModule } from '@nestjs/testing';
import { AnalyticsService } from './analytics.service';
import { PrismaService } from '../prisma/prisma.service';
import { MetricsAggregationService } from '../metrics-aggregation/metrics-aggregation.service';

// ─── MetricsAggregationService mock (Fase H — Task 8) ─────────────────────
// analytics.getRiskAlerts delega as CONTAGENS do `summary` à camada canónica
// (`metrics.alerts`, filtradas às 3 regras de risco); as listas de entidades
// continuam a ser lidas localmente via prisma.
const mockMetrics = {
  headcount: jest.fn(),
  turnover: jest.fn(),
  trainingRoi: jest.fn(),
  alerts: jest.fn(),
};

const makeCount = (n = 0) => jest.fn().mockResolvedValue(n);
const makeFind = (data: any[] = []) => jest.fn().mockResolvedValue(data);
const makeAgg = () => jest.fn().mockResolvedValue({ _avg: {}, _sum: {}, _count: {} });
const makeGroupBy = () => jest.fn().mockResolvedValue([]);

const mockPrisma = {
  user: {
    count: makeCount(100),
    findMany: makeFind(),
    findUnique: jest.fn(),
    groupBy: makeGroupBy(),
  },
  enrollment: {
    count: makeCount(50),
    findMany: makeFind(),
    aggregate: makeAgg(),
    groupBy: makeGroupBy(),
  },
  course: { count: makeCount(20), findMany: makeFind(), groupBy: makeGroupBy() },
  certificate: { count: makeCount(10), findMany: makeFind() },
  badgeAward: { count: makeCount(5), findMany: makeFind() },
  performanceReview: {
    count: makeCount(),
    findMany: makeFind(),
    aggregate: makeAgg(),
    groupBy: makeGroupBy(),
  },
  developmentPlan: {
    count: makeCount(),
    findMany: makeFind(),
    groupBy: makeGroupBy(),
    aggregate: makeAgg(),
  },
  department: { findMany: makeFind() },
  courseAnalytics: { findMany: makeFind() },
  courseFeedback: { aggregate: makeAgg(), count: makeCount() },
  learningPath: { count: makeCount(), findMany: makeFind() },
  learningPathEnrollment: { count: makeCount(), findMany: makeFind() },
  assessmentAttempt: { count: makeCount(), findMany: makeFind(), aggregate: makeAgg() },
  aiTutorSession: { count: makeCount(), findMany: makeFind() },
  knowledgeInteraction: { count: makeCount() },
  dashboardSnapshot: {
    findFirst: jest.fn().mockResolvedValue(null),
    create: jest.fn().mockResolvedValue({}),
  },
  userCompetency: { findMany: makeFind(), count: makeCount(), aggregate: makeAgg() },
  userPoints: {
    findMany: makeFind(),
    findUnique: jest.fn().mockResolvedValue({ points: 100 }),
    aggregate: makeAgg(),
    count: makeCount(),
  },
  competency: { count: makeCount() },
  developmentPlanAction: { count: makeCount(), findMany: makeFind(), groupBy: makeGroupBy() },
  engagementSurvey: { findMany: makeFind() },
  surveyResponse: { count: makeCount() },
  leaveRequest: { count: makeCount(), groupBy: makeGroupBy() },
  learningStreak: {
    count: makeCount(),
    findMany: makeFind(),
    findUnique: jest.fn().mockResolvedValue(null),
  },
  microLearningProgress: { count: makeCount(), findMany: makeFind() },
  nineBoxPlacement: { count: makeCount(), findMany: makeFind() },
  trainingImpact: { count: makeCount(), findMany: makeFind() },
  position: { count: makeCount(), findMany: makeFind() },
  $queryRaw: jest.fn().mockResolvedValue([]),
};

const mockPrismaProxy = new Proxy(mockPrisma, {
  get(target, prop) {
    if (prop === 'attendanceRecord') return { count: makeCount(), aggregate: makeAgg() };
    if (prop === 'learningPathEnrollment')
      return { count: makeCount(), findMany: makeFind(), groupBy: makeGroupBy() };
    return (target as any)[prop];
  },
});

describe('AnalyticsService', () => {
  let service: AnalyticsService;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockMetrics.alerts.mockResolvedValue([]);
    Object.defineProperty(mockPrismaProxy, 'read', {
      get() {
        return mockPrismaProxy;
      },
      configurable: true,
    });
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AnalyticsService,
        { provide: PrismaService, useValue: mockPrismaProxy },
        { provide: MetricsAggregationService, useValue: mockMetrics },
      ],
    }).compile();
    service = module.get<AnalyticsService>(AnalyticsService);
  });

  describe('getOrganizationOverview', () => {
    it('deve retornar overview organizacional', async () => {
      const result = await service.getOrganizationOverview();
      expect(result).toBeDefined();
    });
  });

  describe('getCollaboratorDashboard', () => {
    it('deve retornar dashboard do colaborador', async () => {
      (mockPrismaProxy as any).user.findUnique.mockResolvedValue({
        id: 1,
        fullName: 'Test',
        position: null,
        department: null,
        manager: null,
        points: { points: 100 },
        _count: { enrollments: 5, certificates: 2, badgeAwards: 1 },
      });
      const result = await service.getCollaboratorDashboard(1);
      expect(result).toBeDefined();
    });

    it('deve retornar dados mesmo sem utilizador', async () => {
      (mockPrismaProxy as any).user.findUnique.mockResolvedValue(null);
      const result = await service.getCollaboratorDashboard(99);
      expect(result).toBeDefined();
    });
  });

  describe('getLearningAnalytics', () => {
    it('deve retornar analytics de aprendizagem', async () => {
      const result = await service.getLearningAnalytics({});
      expect(result).toBeDefined();
    });
  });

  describe('getHRDashboard', () => {
    it('deve retornar dashboard RH', async () => {
      mockPrisma.user.count
        .mockResolvedValueOnce(100)
        .mockResolvedValueOnce(90)
        .mockResolvedValueOnce(5)
        .mockResolvedValueOnce(3);
      const result = await service.getHRDashboard({});
      expect(result).toBeDefined();
    });
  });

  // ─── getManagerDashboard ──────────────────────────────────────────────────

  describe('getManagerDashboard', () => {
    it('deve retornar dashboard do gestor', async () => {
      mockPrisma.user.findMany.mockResolvedValue([]);
      mockPrisma.user.count.mockResolvedValue(5);
      const result = await service.getManagerDashboard(1);
      expect(result).toBeDefined();
    });

    it('sem membros de equipa activos deve devolver o shape completo (não {})', async () => {
      mockPrisma.user.findMany.mockResolvedValue([]);
      const result = await service.getManagerDashboard(1);
      expect(result).toEqual({
        team: [],
        metrics: {
          headcount: 0,
          enrollments: 0,
          completions: 0,
          completionRate: 0,
          activePDIs: 0,
          pdiAdoptionRate: 0,
          avgPerformance: 0,
          overdueActions: 0,
        },
        competencyGaps: [],
        nineBox: [],
        alerts: [],
      });
    });
  });

  // ─── getPeopleAnalytics ───────────────────────────────────────────────────

  describe('getPeopleAnalytics', () => {
    it('deve retornar analytics de pessoas', async () => {
      const result = await service.getPeopleAnalytics({});
      expect(result).toBeDefined();
    });
  });

  // ─── getCompetencyGapAnalytics ────────────────────────────────────────────

  describe('getCompetencyGapAnalytics', () => {
    it('deve retornar analytics de gap de competências', async () => {
      const result = await service.getCompetencyGapAnalytics({});
      expect(result).toBeDefined();
    });
  });

  // ─── getPDIAnalytics ──────────────────────────────────────────────────────

  describe('getPDIAnalytics', () => {
    it('deve retornar analytics de PDI', async () => {
      const result = await service.getPDIAnalytics({});
      expect(result).toBeDefined();
    });
  });

  // ─── getRiskAlerts ────────────────────────────────────────────────────────

  describe('getRiskAlerts', () => {
    it('deve retornar alertas de risco', async () => {
      const result = await service.getRiskAlerts({});
      expect(result).toBeDefined();
    });

    it('summary vem de metrics.alerts filtrado às 3 regras de risco; listas ficam locais', async () => {
      mockPrismaProxy.user.findMany.mockResolvedValue([
        { id: 1, fullName: 'Ana', avatarUrl: null, department: { name: 'TI' } },
        { id: 2, fullName: 'Bea', avatarUrl: null, department: { name: 'RH' } },
      ]);
      // recentEnrollments (distinct) — Ana tem, Bea não → Bea inactiva
      mockPrismaProxy.enrollment.findMany.mockResolvedValue([{ userId: 1 }]);
      mockPrismaProxy.developmentPlan.findMany.mockResolvedValue([
        {
          id: 7,
          name: 'PDI Bea',
          user: { id: 2, fullName: 'Bea', avatarUrl: null },
          endDate: new Date('2020-01-01'),
        },
      ]);
      mockPrismaProxy.developmentPlanAction.findMany.mockResolvedValue([]);
      mockMetrics.alerts.mockResolvedValue([
        {
          key: 'INACTIVE_COLLABORATORS',
          type: 'RISK',
          severity: 'MEDIUM',
          message: 'x',
          count: 9,
          scope: 'organization',
        },
        {
          key: 'PDI_PLAN_OVERDUE',
          type: 'PDI',
          severity: 'MEDIUM',
          message: 'y',
          count: 4,
          scope: 'organization',
        },
        {
          key: 'PDI_ACTION_CRITICAL',
          type: 'PDI',
          severity: 'HIGH',
          message: 'z',
          count: 2,
          scope: 'organization',
        },
        // fora do subconjunto — deve ser ignorado
        {
          key: 'PERFORMANCE_CRITICAL',
          type: 'PERFORMANCE',
          severity: 'HIGH',
          message: 'w',
          count: 50,
          scope: 'organization',
        },
      ]);

      const result = await service.getRiskAlerts({ departmentId: 3 });

      expect(mockMetrics.alerts).toHaveBeenCalledWith({ scope: 'organization', departmentId: 3 });
      expect(result.summary).toEqual({
        inactiveCount: 9,
        overduePDICount: 4,
        criticalActionCount: 2,
      });
      // listas ainda montadas localmente
      expect(result.inactiveCollaborators).toEqual([
        { id: 2, fullName: 'Bea', avatarUrl: null, department: { name: 'RH' } },
      ]);
      expect(result.overduePDIs).toHaveLength(1);
      expect(result.overduePDIs[0].planId).toBe(7);
    });

    it('sem departmentId chama metrics.alerts só com { scope: organization }', async () => {
      await service.getRiskAlerts({});
      expect(mockMetrics.alerts).toHaveBeenCalledWith({ scope: 'organization' });
    });

    it('degrada summary para zeros (+ logger.warn) quando metrics.alerts falha; listas mantêm-se', async () => {
      const warn = jest.spyOn((service as any).logger, 'warn').mockImplementation(() => undefined);
      mockPrismaProxy.user.findMany.mockResolvedValue([
        { id: 1, fullName: 'Ana', avatarUrl: null, department: null },
      ]);
      mockPrismaProxy.enrollment.findMany.mockResolvedValue([]);
      mockMetrics.alerts.mockRejectedValue(new Error('read replica down'));

      const result = await service.getRiskAlerts({});

      expect(result.summary).toEqual({
        inactiveCount: 0,
        overduePDICount: 0,
        criticalActionCount: 0,
      });
      expect(result.inactiveCollaborators).toHaveLength(1);
      expect(warn).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'ANALYTICS_RISK_ALERTS' }),
      );
      warn.mockRestore();
    });
  });

  // ─── getCoursePerformance ─────────────────────────────────────────────────

  describe('getCoursePerformance', () => {
    it('deve retornar performance dos cursos', async () => {
      const result = await service.getCoursePerformance();
      expect(result).toBeDefined();
    });
  });
});
