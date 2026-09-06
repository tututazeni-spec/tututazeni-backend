// src/dashboard-rh/dashboard-rh.service.progress.spec.ts
// Cobre métodos não testados: getHeadcountPanel, getHeadcountTrend, getTurnoverPanel,
// getEngagementPanel, getPerformancePanel, getSkillsPanel, getTrainingPanel,
// getCompliancePanel, getBirthdaysThisMonth, getAnniversariesThisMonth,
// getAttendancePanel, getTalentPipeline, getAlerts, getPredictions,
// getCorrelations, getPayrollPanel

import { Test, TestingModule } from '@nestjs/testing';
import { DashboardRhService } from './dashboard-rh.service';
import { PrismaService } from '../prisma/prisma.service';
import { CacheService } from '../cache/cache.service';
import { MetricsAggregationService } from '../metrics-aggregation/metrics-aggregation.service';

// Fase H — Task 6: headcount/headcountTrend/turnover/alerts delegam a esta camada.
function buildMockMetrics() {
  return {
    headcount: jest.fn().mockResolvedValue({
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
      period: { from: new Date(), to: new Date() },
      generatedAt: new Date(),
    }),
    headcountTrend: jest.fn().mockResolvedValue([]),
    turnover: jest.fn().mockResolvedValue({
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
      period: { from: new Date(), to: new Date() },
    }),
    alerts: jest.fn().mockResolvedValue([]),
  };
}

function buildMockPrisma() {
  const crud = () => ({
    findMany: jest.fn().mockResolvedValue([]),
    findFirst: jest.fn().mockResolvedValue(null),
    findUnique: jest.fn().mockResolvedValue(null),
    create: jest.fn().mockResolvedValue({}),
    update: jest.fn().mockResolvedValue({}),
    upsert: jest.fn().mockResolvedValue({}),
    delete: jest.fn().mockResolvedValue({}),
    count: jest.fn().mockResolvedValue(0),
    groupBy: jest.fn().mockResolvedValue([]),
    aggregate: jest.fn().mockResolvedValue({ _avg: { score: null }, _sum: {}, _count: {} }),
  });

  return {
    user: crud(),
    department: crud(),
    position: crud(),
    attendance: crud(),
    attendanceRecord: crud(),
    successionPlan: crud(),
    userCompetency: crud(),
    competency: crud(),
    developmentPlanAction: crud(),
    enrollment: crud(),
    course: crud(),
    certificate: crud(),
    performanceReview: crud(),
    surveyResponse: crud(),
    notificationLog: crud(),
    historyRecord: crud(),
    payslip: crud(),
    legacyPdi: crud(),
    auditLog: crud(),
    badgeAward: crud(),
    avatarSession: crud(),
    developmentPlan: crud(),
    legacyEmployeeSkill: crud(),
    engagementSurvey: crud(),
    recognition: crud(),
  };
}

describe('DashboardRhService (progress)', () => {
  let service: DashboardRhService;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;
  let mockMetrics: ReturnType<typeof buildMockMetrics>;

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();
    mockMetrics = buildMockMetrics();

    Object.defineProperty(mockPrisma, 'read', {
      get() {
        return mockPrisma;
      },
      configurable: true,
    });
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DashboardRhService,
        { provide: PrismaService, useValue: mockPrisma },
        {
          provide: CacheService,
          useValue: { getOrSet: jest.fn((_k: string, _ttl: number, fn: () => any) => fn()) },
        },
        { provide: MetricsAggregationService, useValue: mockMetrics },
      ],
    }).compile();

    service = module.get<DashboardRhService>(DashboardRhService);
  });

  // ─── getHeadcountPanel (delega a metrics.headcount) ─────────────

  describe('getHeadcountPanel', () => {
    const canonical = {
      total: 100,
      active: 90,
      inactive: 10,
      avgTenureMonths: 25,
      byTenure: { '<1yr': 1, '1-2yr': 1, '2-5yr': 1, '5+yr': 1 },
      byDepartment: [{ id: 1, name: 'TI', count: 30 }],
      byPosition: [{ id: 1, name: 'Dev', level: 'PLENO', count: 20 }],
    };

    it('devolve os dados canónicos embrulhados na forma histórica', async () => {
      mockMetrics.headcount.mockResolvedValue(canonical);
      const result = (await service.getHeadcountPanel()) as any;
      expect(result.total).toBe(100);
      expect(result.active).toBe(90);
      expect(result.inactive).toBe(10);
      expect(result.turnoverRate).toBe(10); // 10 / 100 * 100
      expect(result.byDepartment).toHaveLength(1);
      expect(result.byPosition).toHaveLength(1);
      expect(result.byTenure).toEqual(canonical.byTenure);
    });

    it('propaga o departmentId para metrics.headcount', async () => {
      mockMetrics.headcount.mockResolvedValue(canonical);
      await service.getHeadcountPanel(5);
      expect(mockMetrics.headcount).toHaveBeenCalledWith({ departmentId: 5 });
    });
  });

  // ─── getHeadcountTrend (delega a metrics.headcountTrend) ────────

  describe('getHeadcountTrend', () => {
    it('mapeia headcount→count e remove left', async () => {
      mockMetrics.headcountTrend.mockResolvedValue([
        { month: '2025-07', headcount: 100, new: 2, left: 1 },
        { month: '2025-08', headcount: 101, new: 3, left: 2 },
        { month: '2025-09', headcount: 102, new: 4, left: 3 },
      ]);
      const result = (await service.getHeadcountTrend(3)) as any[];
      expect(mockMetrics.headcountTrend).toHaveBeenCalledWith({ months: 3 });
      expect(result).toHaveLength(3);
      result.forEach(m => {
        expect(m.month).toMatch(/^\d{4}-\d{2}$/);
        expect(m.count).toBeDefined();
        expect(m.new).toBeDefined();
        expect(m).not.toHaveProperty('left');
      });
    });

    it('deve usar 6 meses como padrão', async () => {
      mockMetrics.headcountTrend.mockResolvedValue([]);
      await service.getHeadcountTrend();
      expect(mockMetrics.headcountTrend).toHaveBeenCalledWith({ months: 6 });
    });
  });

  // ─── getTurnoverPanel (números via metrics.turnover) ───────────

  describe('getTurnoverPanel', () => {
    beforeEach(() => {
      mockPrisma.performanceReview.findMany.mockResolvedValue([]);
    });

    it('deve retornar turnover panel com zero saídas', async () => {
      const result = (await service.getTurnoverPanel(12)) as any;
      expect(result).toBeDefined();
      expect(result.turnoverRate).toBe(0);
      expect(mockMetrics.turnover).toHaveBeenCalledWith({});
    });

    it('leftLast3Months vem de uma 2ª chamada com janela de 3 meses', async () => {
      mockMetrics.turnover.mockImplementation((p: any) =>
        Promise.resolve({
          leavers: p && p.from ? 4 : 12,
          turnoverRate: 5,
          retentionRate: 95,
          avgTenureMonths: 36,
          insights: [],
        }),
      );
      const result = (await service.getTurnoverPanel()) as any;
      expect(mockMetrics.turnover).toHaveBeenCalledTimes(2);
      expect(result.totalLeft).toBe(12);
      expect(result.leftLast3Months).toBe(4);
      expect(result.avgTenureYears).toBe(3);
    });
  });

  // ─── getEngagementPanel ─────────────────────────────────────────

  describe('getEngagementPanel', () => {
    it('deve retornar painel de engagement com zero inquéritos', async () => {
      mockPrisma.surveyResponse.count.mockResolvedValue(0);
      mockPrisma.surveyResponse.aggregate.mockResolvedValue({ _avg: { score: null } });
      mockPrisma.user.count.mockResolvedValue(50);
      const result = (await service.getEngagementPanel()) as any;
      expect(result).toBeDefined();
      expect(result.participationRate).toBeDefined();
    });
  });

  // ─── getPerformancePanel ────────────────────────────────────────

  describe('getPerformancePanel', () => {
    it('deve retornar painel de performance vazio', async () => {
      mockPrisma.performanceReview.aggregate.mockResolvedValue({ _avg: { score: null } });
      mockPrisma.performanceReview.count.mockResolvedValue(0);
      mockPrisma.user.count.mockResolvedValue(50);
      const result = (await service.getPerformancePanel()) as any;
      expect(result).toBeDefined();
    });

    it('deve calcular score médio e estatísticas', async () => {
      mockPrisma.performanceReview.aggregate.mockResolvedValue({ _avg: { score: 3.8 } });
      mockPrisma.performanceReview.count.mockResolvedValue(5);
      mockPrisma.user.count.mockResolvedValue(50);
      const result = (await service.getPerformancePanel()) as any;
      expect(result).toBeDefined();
    });
  });

  // ─── getSkillsPanel ─────────────────────────────────────────────

  describe('getSkillsPanel', () => {
    it('deve retornar painel de competências', async () => {
      mockPrisma.userCompetency.groupBy.mockResolvedValue([]);
      mockPrisma.competency.findMany.mockResolvedValue([]);
      mockPrisma.user.count.mockResolvedValue(50);
      const result = (await service.getSkillsPanel()) as any;
      expect(result).toBeDefined();
    });
  });

  // ─── getTrainingPanel ───────────────────────────────────────────

  describe('getTrainingPanel', () => {
    it('deve retornar painel de formação com zero inscrições', async () => {
      mockPrisma.enrollment.count.mockResolvedValue(0);
      mockPrisma.course.count.mockResolvedValue(0);
      mockPrisma.course.findMany.mockResolvedValue([]);
      mockPrisma.enrollment.groupBy.mockResolvedValue([]);
      const result = (await service.getTrainingPanel()) as any;
      expect(result).toBeDefined();
    });
  });

  // ─── getCompliancePanel ─────────────────────────────────────────

  describe('getCompliancePanel', () => {
    it('deve retornar painel de compliance', async () => {
      mockPrisma.enrollment.count.mockResolvedValue(0);
      mockPrisma.user.count.mockResolvedValue(50);
      const result = (await service.getCompliancePanel()) as any;
      expect(result).toBeDefined();
    });
  });

  // ─── getBirthdaysThisMonth ──────────────────────────────────────

  describe('getBirthdaysThisMonth', () => {
    it('deve retornar lista vazia (campo dateOfBirth não existe no schema)', async () => {
      const result = (await service.getBirthdaysThisMonth()) as any[];
      expect(Array.isArray(result)).toBe(true);
      expect(result).toHaveLength(0);
    });
  });

  // ─── getAnniversariesThisMonth ──────────────────────────────────

  describe('getAnniversariesThisMonth', () => {
    it('deve retornar lista vazia quando sem utilizadores este mês', async () => {
      mockPrisma.user.findMany.mockResolvedValue([]);
      const result = (await service.getAnniversariesThisMonth()) as any[];
      expect(Array.isArray(result)).toBe(true);
    });

    it('deve retornar utilizadores com aniversário este mês', async () => {
      const now = new Date();
      const hireDate = new Date(now.getFullYear() - 3, now.getMonth(), 15);
      mockPrisma.user.findMany.mockResolvedValue([
        {
          id: 1,
          fullName: 'Ana',
          avatarUrl: null,
          createdAt: hireDate,
          department: { name: 'TI' },
          position: { name: 'Dev' },
        },
      ]);
      const result = (await service.getAnniversariesThisMonth()) as any[];
      expect(result).toHaveLength(1);
      expect(result[0].years).toBe(3);
    });
  });

  // ─── getAttendancePanel ─────────────────────────────────────────

  describe('getAttendancePanel', () => {
    it('deve retornar painel de presenças vazio', async () => {
      mockPrisma.attendance.findMany.mockResolvedValue([]);
      const result = (await service.getAttendancePanel()) as any;
      expect(result.total).toBe(0);
      expect(result.presenceRate).toBe(0);
    });

    it('deve contar estatísticas de presença', async () => {
      mockPrisma.attendance.findMany.mockResolvedValue([
        { status: 'present', employee: { id: 1, name: 'Ana' } },
        { status: 'absent', employee: { id: 2, name: 'João' } },
        { status: 'late', employee: { id: 3, name: 'Maria' } },
      ]);
      const result = (await service.getAttendancePanel('2026-01-01', '2026-01-31')) as any;
      expect(result.total).toBe(3);
      expect(result.present).toBe(1);
      expect(result.absent).toBe(1);
      expect(result.late).toBe(1);
    });
  });

  // ─── getTalentPipeline ──────────────────────────────────────────

  describe('getTalentPipeline', () => {
    it('deve retornar pipeline de talentos vazio', async () => {
      mockPrisma.position.findMany.mockResolvedValue([]);
      mockPrisma.successionPlan.findMany.mockResolvedValue([]);
      mockPrisma.userCompetency.groupBy.mockResolvedValue([]);
      mockPrisma.user.findMany.mockResolvedValue([]);
      const result = (await service.getTalentPipeline()) as any;
      expect(result).toBeDefined();
    });
  });

  // ─── getAlerts ──────────────────────────────────────────────────

  describe('getAlerts', () => {
    it('deve retornar lista vazia de alertas quando a camada não devolve nada', async () => {
      mockMetrics.alerts.mockResolvedValue([]);
      const result = (await service.getAlerts()) as any[];
      expect(mockMetrics.alerts).toHaveBeenCalledWith({ scope: 'organization' });
      expect(Array.isArray(result)).toBe(true);
      expect(result).toHaveLength(0);
    });

    it('filtra o subconjunto RH e remapeia o type para a forma histórica', async () => {
      mockMetrics.alerts.mockResolvedValue([
        {
          key: 'PERFORMANCE_CRITICAL',
          type: 'PERFORMANCE',
          severity: 'HIGH',
          message: '3 colaborador(es) com performance crítica',
          count: 3,
          scope: 'organization',
        },
        {
          key: 'MANDATORY_TRAINING_PENDING',
          type: 'COMPLIANCE',
          severity: 'HIGH',
          message: '10 formação(ões) obrigatória(s) por concluir',
          count: 10,
          scope: 'organization',
        },
        {
          key: 'SURVEY_PARTICIPATION_LOW',
          type: 'SURVEY',
          severity: 'MEDIUM',
          message: 'Taxa de participação em surveys abaixo de 30%',
          scope: 'organization',
        },
        {
          key: 'PDI_ACTION_CRITICAL',
          type: 'PDI',
          severity: 'HIGH',
          message: 'fora do subconjunto',
          count: 1,
          scope: 'organization',
        },
      ]);
      const result = (await service.getAlerts()) as any[];
      expect(result).toHaveLength(3);
      const severities = result.map((a: any) => a.severity);
      expect(severities).toContain('HIGH');
      expect(result.map((a: any) => a.type)).toEqual(['PERFORMANCE', 'COMPLIANCE', 'ENGAGEMENT']);
      expect(result.find((a: any) => a.type === 'ENGAGEMENT')).not.toHaveProperty('count');
    });
  });

  // ─── getPredictions ─────────────────────────────────────────────

  describe('getPredictions', () => {
    it('deve retornar previsões com zero risco de turnover', async () => {
      mockPrisma.performanceReview.findMany.mockResolvedValue([]);
      mockPrisma.performanceReview.count.mockResolvedValue(0);
      mockPrisma.surveyResponse.count.mockResolvedValue(50);
      const result = (await service.getPredictions()) as any;
      expect(result.summary).toBeDefined();
      expect(result.turnoverRisk).toHaveLength(0);
      expect(result.generatedAt).toBeDefined();
    });

    it('deve classificar risk levels para colaboradores com baixa performance', async () => {
      const hireDate = new Date('2020-01-01');
      mockPrisma.performanceReview.findMany.mockResolvedValue([
        {
          score: 1.5,
          status: 'COMPLETED',
          user: {
            id: 1,
            fullName: 'Ana',
            avatarUrl: null,
            department: { name: 'TI' },
            createdAt: hireDate,
          },
        },
        {
          score: 2.2,
          status: 'COMPLETED',
          user: {
            id: 2,
            fullName: 'João',
            avatarUrl: null,
            department: { name: 'RH' },
            createdAt: hireDate,
          },
        },
      ]);
      mockPrisma.performanceReview.count.mockResolvedValue(2);
      mockPrisma.surveyResponse.count.mockResolvedValue(50);
      const result = (await service.getPredictions()) as any;
      expect(result.turnoverRisk).toHaveLength(2);
      const highRisk = result.turnoverRisk.find((u: any) => u.riskLevel === 'HIGH');
      expect(highRisk).toBeDefined();
    });
  });

  // ─── getCorrelations ────────────────────────────────────────────

  describe('getCorrelations', () => {
    it('deve retornar correlações sem dados', async () => {
      mockPrisma.user.findMany.mockResolvedValue([]);
      mockPrisma.performanceReview.findMany.mockResolvedValue([]);
      mockPrisma.enrollment.findMany.mockResolvedValue([]);
      mockPrisma.surveyResponse.findMany.mockResolvedValue([]);
      const result = (await service.getCorrelations()) as any;
      expect(result).toBeDefined();
    });
  });

  // ─── getPayrollPanel ────────────────────────────────────────────

  describe('getPayrollPanel', () => {
    it('deve retornar painel de folha salarial vazio', async () => {
      mockPrisma.payslip.findMany.mockResolvedValue([]);
      const result = (await service.getPayrollPanel('2026-06')) as any;
      expect(result.period).toBe('2026-06');
      expect(result.headcount).toBe(0);
      expect(result.totalGross).toBe(0);
    });

    it('deve calcular totais salariais a partir dos payslips reais do período', async () => {
      mockPrisma.payslip.findMany.mockResolvedValue([
        {
          grossSalary: 2000,
          netSalary: 1600,
          totalDeductions: 400,
          user: { id: 1, fullName: 'Ana', department: { name: 'TI' } },
        },
        {
          grossSalary: 3000,
          netSalary: 2400,
          totalDeductions: 600,
          user: { id: 2, fullName: 'João', department: { name: 'RH' } },
        },
      ]);
      const result = (await service.getPayrollPanel('2026-06')) as any;
      expect(mockPrisma.payslip.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { period: '2026-06' } }),
      );
      expect(result.headcount).toBe(2);
      expect(result.totalGross).toBe(5000);
      expect(result.totalNet).toBe(4000);
      expect(result.avgGross).toBe(2500);
    });
  });
});
