import { Test, TestingModule } from '@nestjs/testing';
import { DashboardRhService } from './dashboard-rh.service';
import { PrismaService } from '../prisma/prisma.service';
import { CacheService } from '../cache/cache.service';
import { MetricsAggregationService } from '../metrics-aggregation/metrics-aggregation.service';

// ─── MetricsAggregationService mock (Fase H — Task 6) ─────────────────────
// dashboard-rh delega headcount/headcountTrend/turnover/alerts a esta camada
// canónica; os testes abaixo asseguram a delegação + o embrulho na forma
// histórica de cada endpoint.
const DEFAULT_HEADCOUNT = {
  total: 0,
  active: 0,
  inactive: 0,
  newHires: 0,
  newHiresPrev: 0,
  newHiresTrend: 0,
  avgTenureMonths: 0,
  byTenure: { '<1yr': 0, '1-2yr': 0, '2-5yr': 0, '5+yr': 0 },
  byDepartment: [],
  byPosition: [],
  period: { from: new Date('2025-01-01'), to: new Date('2026-01-01') },
  generatedAt: new Date('2026-01-01'),
};
const DEFAULT_TURNOVER = {
  leavers: 0,
  avgHeadcount: 0,
  turnoverRate: 0,
  retentionRate: 100,
  turnoverRatePrev: 0,
  turnoverTrend: 0,
  newHires: 0,
  netHeadcountChange: 0,
  avgTenureMonths: 0,
  insights: [],
  period: { from: new Date('2025-01-01'), to: new Date('2026-01-01') },
};
const mockMetrics = {
  headcount: jest.fn(),
  headcountTrend: jest.fn(),
  turnover: jest.fn(),
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
    groupBy: makeGroupBy(),
    aggregate: makeAgg(),
  },
  enrollment: {
    count: makeCount(50),
    findMany: makeFind(),
    groupBy: makeGroupBy(),
    aggregate: makeAgg(),
  },
  certificate: { count: makeCount(10), findMany: makeFind() },
  badgeAward: { count: makeCount(5), groupBy: makeGroupBy(), findMany: makeFind() },
  performanceReview: {
    count: makeCount(),
    findMany: makeFind(),
    aggregate: makeAgg(),
    groupBy: makeGroupBy(),
  },
  developmentPlan: { count: makeCount(), findMany: makeFind() },
  developmentPlanAction: { count: makeCount(), findMany: makeFind() },
  department: { findMany: makeFind(), count: makeCount() },
  position: { findMany: makeFind() },
  course: { count: makeCount(), findMany: makeFind() },
  engagementSurvey: { findMany: makeFind(), count: makeCount() },
  auditLog: { findMany: makeFind(), count: makeCount(), groupBy: makeGroupBy() },
  historyRecord: { findMany: makeFind(), count: makeCount() },
  avatarSession: { count: makeCount(), findMany: makeFind() },
  legacyEmployeeSkill: { findMany: makeFind(), count: makeCount() },
};

const mockPrismaProxy = new Proxy(mockPrisma, {
  get(target, prop) {
    if (prop === 'attendance')
      return { count: makeCount(), findMany: makeFind(), aggregate: makeAgg() };
    if (prop === 'leaveRequest')
      return { count: makeCount(), findMany: makeFind(), groupBy: makeGroupBy() };
    if (prop === 'surveyResponse')
      return {
        count: makeCount(),
        aggregate: makeAgg(),
        findMany: makeFind(),
        groupBy: makeGroupBy(),
      };
    if (prop === 'userCompetency')
      return {
        count: makeCount(),
        findMany: makeFind(),
        groupBy: makeGroupBy(),
        aggregate: makeAgg(),
      };
    if (prop === 'successionPlan') return { findMany: makeFind(), count: makeCount() };
    if (prop === 'nineBoxPlacement') return { findMany: makeFind(), count: makeCount() };
    if (prop === 'recognition') return { count: makeCount(), findMany: makeFind() };
    return (target as any)[prop];
  },
});

describe('DashboardRhService', () => {
  let service: DashboardRhService;
  let cacheGetOrSet: jest.Mock;

  beforeEach(async () => {
    jest.clearAllMocks();
    cacheGetOrSet = jest.fn((_k: string, _ttl: number, fn: () => any) => fn());
    mockMetrics.headcount.mockResolvedValue(DEFAULT_HEADCOUNT);
    mockMetrics.headcountTrend.mockResolvedValue([]);
    mockMetrics.turnover.mockResolvedValue(DEFAULT_TURNOVER);
    mockMetrics.alerts.mockResolvedValue([]);
    Object.defineProperty(mockPrismaProxy, 'read', {
      get() {
        return mockPrismaProxy;
      },
      configurable: true,
    });
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DashboardRhService,
        { provide: PrismaService, useValue: mockPrismaProxy },
        { provide: CacheService, useValue: { getOrSet: cacheGetOrSet } },
        { provide: MetricsAggregationService, useValue: mockMetrics },
      ],
    }).compile();
    service = module.get<DashboardRhService>(DashboardRhService);
  });

  describe('getFullRhDashboard', () => {
    it('deve retornar dashboard RH completo', async () => {
      mockPrisma.user.count
        .mockResolvedValueOnce(100)
        .mockResolvedValueOnce(90)
        .mockResolvedValueOnce(5)
        .mockResolvedValueOnce(3);
      const result = await service.getFullRhDashboard();
      expect(result).toBeDefined();
    });

    it('getFullRhDashboard usa cache com chave e TTL certos', async () => {
      await service.getFullRhDashboard();
      expect(cacheGetOrSet).toHaveBeenCalledWith('dashboard:rh:full', 90, expect.any(Function));
    });
  });

  // ─── getHeadcountPanel — delega a metrics.headcount (Fase H) ──────────────

  describe('getHeadcountPanel', () => {
    const canonical = {
      total: 120,
      active: 100,
      inactive: 20,
      newHires: 8,
      newHiresPrev: 5,
      newHiresTrend: 60,
      avgTenureMonths: 30.5,
      byTenure: { '<1yr': 10, '1-2yr': 20, '2-5yr': 40, '5+yr': 30 },
      byDepartment: [
        { id: 1, name: 'TI', count: 50 },
        { id: 2, name: 'RH', count: 50 },
      ],
      byPosition: [{ id: 9, name: 'Dev', level: 'SENIOR', count: 20 }],
      period: { from: new Date('2025-01-01'), to: new Date('2026-01-01') },
      generatedAt: new Date('2026-01-01'),
    };

    it('delega a metrics.headcount({ departmentId }) e devolve a forma histórica', async () => {
      mockMetrics.headcount.mockResolvedValue(canonical);
      const result = await service.getHeadcountPanel(7);
      expect(mockMetrics.headcount).toHaveBeenCalledWith({ departmentId: 7 });
      expect(result).toEqual({
        total: 120,
        active: 100,
        inactive: 20,
        turnoverRate: 16.7, // 20 / 120 * 100, 1 dp — derivado no adapter
        avgTenureMonths: 30.5,
        byDepartment: canonical.byDepartment,
        byPosition: [{ id: 9, name: 'Dev', level: 'SENIOR', count: 20 }],
        byTenure: canonical.byTenure,
      });
    });

    it('sem departmentId chama metrics.headcount com {}', async () => {
      mockMetrics.headcount.mockResolvedValue(canonical);
      await service.getHeadcountPanel();
      expect(mockMetrics.headcount).toHaveBeenCalledWith({});
    });

    it('turnoverRate = 0 quando total = 0 (guarda de divisão)', async () => {
      mockMetrics.headcount.mockResolvedValue({
        ...canonical,
        total: 0,
        active: 0,
        inactive: 0,
      });
      const result = await service.getHeadcountPanel();
      expect(result.turnoverRate).toBe(0);
    });

    it('byPosition sem level → level: null (forma histórica)', async () => {
      mockMetrics.headcount.mockResolvedValue({
        ...canonical,
        byPosition: [{ id: 3, name: 'Estágio', count: 4 }],
      });
      const result = await service.getHeadcountPanel();
      expect(result.byPosition).toEqual([{ id: 3, name: 'Estágio', level: null, count: 4 }]);
    });
  });

  // ─── getHeadcountTrend — delega a metrics.headcountTrend (Fase H) ─────────

  describe('getHeadcountTrend', () => {
    it('delega a metrics.headcountTrend({ months }) e mapeia headcount→count, dropa left', async () => {
      mockMetrics.headcountTrend.mockResolvedValue([
        { month: '2025-08', headcount: 95, new: 3, left: 1 },
        { month: '2025-09', headcount: 97, new: 4, left: 2 },
      ]);
      const result = await service.getHeadcountTrend(6);
      expect(mockMetrics.headcountTrend).toHaveBeenCalledWith({ months: 6 });
      expect(result).toEqual([
        { month: '2025-08', count: 95, new: 3 },
        { month: '2025-09', count: 97, new: 4 },
      ]);
    });

    it('usa 6 meses por omissão', async () => {
      mockMetrics.headcountTrend.mockResolvedValue([]);
      await service.getHeadcountTrend();
      expect(mockMetrics.headcountTrend).toHaveBeenCalledWith({ months: 6 });
    });
  });

  // ─── getTurnoverPanel — números via metrics.turnover, atRiskUsers local ──

  describe('getTurnoverPanel', () => {
    const canonical = {
      leavers: 12,
      avgHeadcount: 110,
      turnoverRate: 10.9,
      retentionRate: 89.1,
      turnoverRatePrev: 8,
      turnoverTrend: 2.9,
      newHires: 15,
      netHeadcountChange: 3,
      avgTenureMonths: 42,
      insights: ['⚠️ Turnover acima da média: 10.9%', '12 saída(s) no período'],
      period: { from: new Date('2025-01-01'), to: new Date('2026-01-01') },
    };

    beforeEach(() => {
      mockPrisma.performanceReview.findMany.mockResolvedValue([]);
      // 1ª chamada (janela default 12m) → canonical; 2ª (janela 3m) → leavers:4
      mockMetrics.turnover.mockImplementation((p: any) =>
        Promise.resolve(p && p.from ? { ...canonical, leavers: 4 } : canonical),
      );
    });

    it('delega os números a metrics.turnover({}) e devolve a forma histórica', async () => {
      const result = await service.getTurnoverPanel();
      expect(mockMetrics.turnover).toHaveBeenNthCalledWith(1, {});
      expect(result.turnoverRate).toBe(10.9);
      expect(result.retentionRate).toBe(89.1);
      expect(result.totalLeft).toBe(12);
      expect(result.avgTenureMonths).toBe(42);
      expect(result.avgTenureYears).toBe(3.5); // 42 / 12
      expect(result.insights).toEqual(canonical.insights);
    });

    it('leftLast3Months vem de uma 2ª chamada turnover com janela de 3 meses', async () => {
      const result = await service.getTurnoverPanel();
      expect(mockMetrics.turnover).toHaveBeenCalledTimes(2);
      const secondArg = mockMetrics.turnover.mock.calls[1][0];
      expect(secondArg.from).toBeInstanceOf(Date);
      expect(secondArg.to).toBeInstanceOf(Date);
      expect(result.leftLast3Months).toBe(4);
    });

    it('atRiskUsers continua calculado localmente via prisma (não é métrica canónica)', async () => {
      mockPrisma.performanceReview.findMany.mockResolvedValue([
        { score: 1.5, user: { id: 1, fullName: 'Ana' } },
        { score: 2.3, user: { id: 2, fullName: 'Bea' } },
      ]);
      const result = await service.getTurnoverPanel();
      expect(mockPrisma.performanceReview.findMany).toHaveBeenCalled();
      expect(result.atRiskUsers).toEqual([
        { user: { id: 1, fullName: 'Ana' }, score: 1.5, risk: 'HIGH' },
        { user: { id: 2, fullName: 'Bea' }, score: 2.3, risk: 'MEDIUM' },
      ]);
    });
  });

  // ─── getAlerts — delega a metrics.alerts, filtra o subconjunto RH ────────

  describe('getAlerts', () => {
    it('delega a metrics.alerts({ scope: organization }), filtra o subconjunto e remapeia type', async () => {
      mockMetrics.alerts.mockResolvedValue([
        {
          key: 'MANDATORY_TRAINING_PENDING',
          type: 'COMPLIANCE',
          severity: 'HIGH',
          message: '3 formação(ões) obrigatória(s) por concluir',
          count: 3,
          actionUrl: '/content-library/mandatory',
          scope: 'organization',
        },
        {
          key: 'PERFORMANCE_CRITICAL',
          type: 'PERFORMANCE',
          severity: 'HIGH',
          message: '2 colaborador(es) com performance crítica',
          count: 2,
          scope: 'organization',
        },
        {
          key: 'PDI_ACTIONS_OVERDUE',
          type: 'PDI',
          severity: 'MEDIUM',
          message: '5 acção(ões) de PDI em atraso',
          count: 5,
          actionUrl: '/talent-development/plans',
          scope: 'organization',
        },
        {
          key: 'SURVEY_PARTICIPATION_LOW',
          type: 'SURVEY',
          severity: 'MEDIUM',
          message: 'Taxa de participação em surveys abaixo de 30%',
          scope: 'organization',
        },
        // fora do subconjunto que o dashboard-rh mostrava — deve ser filtrado
        {
          key: 'INACTIVE_COLLABORATORS',
          type: 'RISK',
          severity: 'MEDIUM',
          message: '1 colaborador(es) sem actividade de formação há 60+ dias',
          count: 1,
          scope: 'organization',
        },
        {
          key: 'PDI_PLAN_OVERDUE',
          type: 'PDI',
          severity: 'MEDIUM',
          message: '2 PDI(s) além do prazo',
          count: 2,
          scope: 'organization',
        },
      ]);
      const result = await service.getAlerts();
      expect(mockMetrics.alerts).toHaveBeenCalledWith({ scope: 'organization' });
      expect(result).toEqual([
        {
          type: 'COMPLIANCE',
          severity: 'HIGH',
          message: '3 formação(ões) obrigatória(s) por concluir',
          count: 3,
        },
        {
          type: 'PERFORMANCE',
          severity: 'HIGH',
          message: '2 colaborador(es) com performance crítica',
          count: 2,
        },
        { type: 'PDI', severity: 'MEDIUM', message: '5 acção(ões) de PDI em atraso', count: 5 },
        {
          type: 'ENGAGEMENT', // SURVEY_PARTICIPATION_LOW remapeado p/ ENGAGEMENT (forma histórica)
          severity: 'MEDIUM',
          message: 'Taxa de participação em surveys abaixo de 30%',
        },
      ]);
    });

    it('sem alertas devolve lista vazia', async () => {
      mockMetrics.alerts.mockResolvedValue([]);
      expect(await service.getAlerts()).toEqual([]);
    });

    it('SURVEY_PARTICIPATION_LOW não traz count e sai como ENGAGEMENT', async () => {
      mockMetrics.alerts.mockResolvedValue([
        {
          key: 'SURVEY_PARTICIPATION_LOW',
          type: 'SURVEY',
          severity: 'MEDIUM',
          message: 'Taxa de participação em surveys abaixo de 30%',
          scope: 'organization',
        },
      ]);
      const [a] = await service.getAlerts();
      expect(a).not.toHaveProperty('count');
      expect(a.type).toBe('ENGAGEMENT');
    });
  });

  // ─── getEngagementPanel ───────────────────────────────────────────────────

  describe('getEngagementPanel', () => {
    it('deve retornar painel de engagement', async () => {
      mockPrisma.user.count.mockResolvedValue(100);
      const result = await service.getEngagementPanel();
      expect(result).toBeDefined();
    });
  });

  // ─── getPerformancePanel ──────────────────────────────────────────────────

  describe('getPerformancePanel', () => {
    it('deve retornar painel de performance', async () => {
      const result = await service.getPerformancePanel();
      expect(result).toBeDefined();
    });
  });

  // ─── getSkillsPanel ───────────────────────────────────────────────────────

  describe('getSkillsPanel', () => {
    it('deve retornar painel de competências', async () => {
      const result = await service.getSkillsPanel();
      expect(result).toBeDefined();
    });
  });

  // ─── getTrainingPanel ─────────────────────────────────────────────────────

  describe('getTrainingPanel', () => {
    it('deve retornar painel de formação', async () => {
      const result = await service.getTrainingPanel();
      expect(result).toBeDefined();
    });
  });

  // ─── getCompliancePanel ───────────────────────────────────────────────────

  describe('getCompliancePanel', () => {
    it('deve retornar painel de compliance', async () => {
      const result = await service.getCompliancePanel();
      expect(result).toBeDefined();
    });
  });

  // ─── getBirthdaysThisMonth ────────────────────────────────────────────────

  describe('getBirthdaysThisMonth', () => {
    it('deve retornar aniversários do mês', async () => {
      mockPrisma.user.findMany.mockResolvedValue([]);
      const result = await service.getBirthdaysThisMonth();
      expect(result).toBeDefined();
    });
  });

  // ─── getAnniversariesThisMonth ────────────────────────────────────────────

  describe('getAnniversariesThisMonth', () => {
    it('deve retornar aniversários de empresa do mês', async () => {
      mockPrisma.user.findMany.mockResolvedValue([]);
      const result = await service.getAnniversariesThisMonth();
      expect(result).toBeDefined();
    });
  });

  // ─── getAttendancePanel ───────────────────────────────────────────────────

  describe('getAttendancePanel', () => {
    it('deve retornar painel de presenças', async () => {
      const result = await service.getAttendancePanel();
      expect(result).toBeDefined();
    });
  });

  // ─── getTalentPipeline ────────────────────────────────────────────────────

  describe('getTalentPipeline', () => {
    it('deve retornar pipeline de talentos', async () => {
      mockPrisma.user.count.mockResolvedValue(50);
      const result = await service.getTalentPipeline();
      expect(result).toBeDefined();
    });
  });
});
