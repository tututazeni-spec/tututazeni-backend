import { Test, TestingModule } from '@nestjs/testing';
import { DashboardService } from './dashboard.service';
import { PrismaService } from '../prisma/prisma.service';
import { CacheService } from '../cache/cache.service';
import { MetricsAggregationService } from '../metrics-aggregation/metrics-aggregation.service';

// ─── MetricsAggregationService mock (Fase H — Task 7) ─────────────────────
// getAlerts / getManagerDashboard delegam nesta camada canónica; os testes
// abaixo garantem a delegação + o embrulho na forma histórica de cada endpoint.
const mockMetrics = {
  alerts: jest.fn(),
  managerDashboard: jest.fn(),
};

const emptyManagerResult = {
  teamSize: 0,
  team: [],
  kpis: {},
  competencyGaps: [],
  nineBox: [],
  alerts: [],
};

const makeCount = (n = 0) => jest.fn().mockResolvedValue(n);
const makeFind = (data: any[] = []) => jest.fn().mockResolvedValue(data);
const makeAgg = () => jest.fn().mockResolvedValue({ _avg: {}, _sum: {}, _count: {} });
const makeGroupBy = () => jest.fn().mockResolvedValue([]);

const mockPrisma = {
  user: { findUnique: jest.fn(), findMany: makeFind(), count: makeCount(), groupBy: makeGroupBy() },
  enrollment: {
    count: makeCount(),
    findMany: makeFind(),
    groupBy: makeGroupBy(),
    aggregate: makeAgg(),
  },
  course: { count: makeCount(), findMany: makeFind(), groupBy: makeGroupBy() },
  certificate: { count: makeCount(), findMany: makeFind() },
  badgeAward: { count: makeCount(), findMany: makeFind() },
  performanceReview: { count: makeCount(), findMany: makeFind(), aggregate: makeAgg() },
  developmentPlan: {
    count: makeCount(),
    findMany: makeFind(),
    findFirst: jest.fn().mockResolvedValue(null),
  },
  developmentPlanAction: { count: makeCount(), findMany: makeFind() },
  department: { findMany: makeFind() },
  notificationLog: {
    count: makeCount(),
    findMany: makeFind(),
    create: jest.fn().mockResolvedValue({}),
  },
  auditLog: { findMany: makeFind(), count: makeCount(), groupBy: makeGroupBy() },
  engagementSurvey: {
    findMany: makeFind(),
    count: makeCount(),
    findFirst: jest.fn().mockResolvedValue(null),
  },
  surveyResponse: { count: makeCount(), findMany: makeFind() },
  userCompetency: {
    findMany: makeFind(),
    count: makeCount(),
    aggregate: makeAgg(),
    groupBy: makeGroupBy(),
  },
  evaluationRequest: { count: makeCount(), findMany: makeFind() },
  successionPlan: { count: makeCount(), findMany: makeFind() },
  position: { findMany: makeFind() },
  assessmentAttempt: { count: makeCount(), findMany: makeFind() },
  avatarSession: { count: makeCount(), findMany: makeFind() },
  contentAsset: { count: makeCount(), findMany: makeFind() },
  dashboardSnapshot: {
    findFirst: jest.fn().mockResolvedValue(null),
    create: jest.fn().mockResolvedValue({}),
  },
  userPoints: {
    findUnique: jest.fn().mockResolvedValue({ points: 100 }),
    findFirst: jest.fn().mockResolvedValue({ points: 100 }),
  },
};

const baseUser = {
  id: 1,
  fullName: 'Test User',
  managerId: null,
  position: null,
  department: null,
  points: { points: 100 },
  _count: { subordinates: 0 },
};

const cacheGetOrSet = jest.fn((_k: string, _ttl: number, fn: () => any) => fn());

describe('DashboardService', () => {
  let service: DashboardService;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockPrisma.user.findUnique.mockResolvedValue(baseUser);
    mockPrisma.user.count.mockResolvedValue(100);
    mockPrisma.enrollment.count.mockResolvedValue(50);
    mockPrisma.certificate.count.mockResolvedValue(10);
    mockMetrics.alerts.mockResolvedValue([]);
    mockMetrics.managerDashboard.mockResolvedValue(emptyManagerResult);

    Object.defineProperty(mockPrisma, 'read', {
      get() {
        return mockPrisma;
      },
      configurable: true,
    });
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DashboardService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: CacheService, useValue: { getOrSet: cacheGetOrSet } },
        { provide: MetricsAggregationService, useValue: mockMetrics },
      ],
    }).compile();
    service = module.get<DashboardService>(DashboardService);
  });

  describe('getMyDashboard', () => {
    it('deve retornar dashboard do colaborador', async () => {
      const result = await service.getMyDashboard(1);
      expect(result).toBeDefined();
    });
  });

  describe('getManagerDashboard', () => {
    it('delega a metrics.managerDashboard com userId + period + departmentId dos filtros', async () => {
      await service.getManagerDashboard(1, { period: 'QUARTER' as any, departmentId: 7 });
      expect(mockMetrics.managerDashboard).toHaveBeenCalledWith({
        userId: 1,
        period: 'QUARTER',
        departmentId: 7,
      });
    });

    it('equipa vazia devolve a forma histórica de early-return (com pendingItems)', async () => {
      mockMetrics.managerDashboard.mockResolvedValue(emptyManagerResult);
      const result = await service.getManagerDashboard(1);
      expect(result).toEqual({ teamSize: 0, team: [], kpis: {}, alerts: [], pendingItems: [] });
      expect(mockMetrics.managerDashboard).toHaveBeenCalledWith({
        userId: 1,
        period: undefined,
        departmentId: undefined,
      });
    });

    it('embrulha o retorno canónico: KPIs projectados aos 11 campos, atRisk→alert, alerts adaptados', async () => {
      mockMetrics.managerDashboard.mockResolvedValue({
        teamSize: 2,
        team: [
          {
            user: {
              id: 2,
              fullName: 'Bea',
              avatarUrl: null,
              position: { name: 'Dev' },
              department: { name: 'TI' },
            },
            xp: 120,
            enrollment: { completed: 3, inProgress: 1 },
            plan: { progress: 40, status: 'ACTIVE' },
            lastScore: 2.1,
            atRisk: true,
          },
        ],
        kpis: {
          pdpCoverage: 50,
          activePlans: 1,
          completedPlans: 2,
          inProgress: 4,
          completedEnrollments: 6,
          enrollmentsTotal: 30,
          completions: 12,
          completionRate: 40,
          avgScore: 3.2,
          scoreTrend: -5,
          mandatoryRate: 75,
          engagementResponses: 8,
          avatarSessions: 2,
          pendingEvals: 3,
          overdueActions: 9,
        },
        competencyGaps: [{ name: 'X', totalGap: 4, count: 2, avgGap: 2 }],
        nineBox: [
          {
            userId: 2,
            fullName: 'Bea',
            avatarUrl: null,
            performanceAxis: '1',
            potentialAxis: '2',
            quadrant: '1-2',
          },
        ],
        alerts: [
          {
            key: 'MANAGER_TEAM_RISK',
            type: 'PERFORMANCE',
            severity: 'HIGH',
            message: '1 colaborador(es) em risco de performance',
            count: 1,
            scope: 'team',
          },
          {
            key: 'MANDATORY_RATE_LOW',
            type: 'COMPLIANCE',
            severity: 'MEDIUM',
            message: 'Taxa de formações obrigatórias abaixo de 80% (75%)',
            scope: 'team',
          },
          {
            key: 'EVAL_360_PENDING',
            type: 'EVALUATION',
            severity: 'HIGH',
            message: '3 avaliação(ões) 360° pendentes',
            count: 3,
            scope: 'team',
          },
          {
            key: 'INACTIVE_COLLABORATORS',
            type: 'RISK',
            severity: 'MEDIUM',
            message: 'fora do subconjunto',
            count: 1,
            scope: 'team',
          },
        ],
      });

      const result: any = await service.getManagerDashboard(1, {});

      expect(result.teamSize).toBe(2);
      expect(Object.keys(result.kpis).sort()).toEqual(
        [
          'activePlans',
          'avatarSessions',
          'avgScore',
          'completedEnrollments',
          'completedPlans',
          'engagementResponses',
          'inProgress',
          'mandatoryRate',
          'pdpCoverage',
          'pendingEvals',
          'scoreTrend',
        ].sort(),
      );
      expect(result.kpis).not.toHaveProperty('enrollmentsTotal');
      expect(result.kpis).not.toHaveProperty('completions');
      expect(result.kpis).not.toHaveProperty('completionRate');
      expect(result.kpis).not.toHaveProperty('overdueActions');
      expect(result.kpis.avgScore).toBe(3.2);

      expect(result.team[0]).toEqual({
        user: { id: 2, fullName: 'Bea', avatarUrl: null, position: { name: 'Dev' } },
        xp: 120,
        enrollment: { completed: 3, inProgress: 1 },
        plan: { progress: 40, status: 'ACTIVE' },
        lastScore: 2.1,
        alert: true,
      });
      expect(result.team[0].user).not.toHaveProperty('department');

      // adaptManagerAlerts: só as 4 keys do subconjunto; EVAL_360_PENDING → URGENT
      expect(result.alerts).toEqual([
        { message: '1 colaborador(es) em risco de performance', priority: 'URGENT', type: 'RISK' },
        {
          message: 'Taxa de formações obrigatórias abaixo de 80% (75%)',
          priority: 'ATTENTION',
          type: 'TRAINING',
        },
        { message: '3 avaliação(ões) 360° pendentes', priority: 'URGENT', type: 'EVALUATION' },
      ]);
      expect(result).not.toHaveProperty('competencyGaps');
      expect(result).not.toHaveProperty('nineBox');
    });

    it('degrada para a forma de equipa vazia (sem rebentar) e loga quando metrics.managerDashboard falha', async () => {
      const warn = jest.spyOn((service as any).logger, 'warn').mockImplementation(() => undefined);
      mockMetrics.managerDashboard.mockRejectedValue(new Error('read replica down'));
      await expect(service.getManagerDashboard(1, {})).resolves.toEqual({
        teamSize: 0,
        team: [],
        kpis: {},
        alerts: [],
        pendingItems: [],
      });
      expect(warn).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'DASHBOARD_MANAGER_METRICS' }),
      );
      warn.mockRestore();
    });
  });

  describe('getOrganizationSummary', () => {
    it('deve retornar sumário organizacional', async () => {
      mockPrisma.user.count
        .mockResolvedValueOnce(100)
        .mockResolvedValueOnce(90)
        .mockResolvedValueOnce(5);
      const result = await service.getOrganizationSummary({});
      expect(result).toBeDefined();
    });
  });

  describe('getExecutiveDashboard (cache)', () => {
    it('getExecutiveDashboard usa cache com chave e TTL certos', async () => {
      await service.getExecutiveDashboard();
      expect(cacheGetOrSet).toHaveBeenCalledWith('dashboard:executive', 90, expect.any(Function));
    });
  });
});
