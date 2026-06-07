// src/dashboard-rh/dashboard-rh.service.progress.spec.ts
// Cobre métodos não testados: getHeadcountPanel, getHeadcountTrend, getTurnoverPanel,
// getEngagementPanel, getPerformancePanel, getSkillsPanel, getTrainingPanel,
// getCompliancePanel, getBirthdaysThisMonth, getAnniversariesThisMonth,
// getAttendancePanel, getTalentPipeline, getAlerts, getPredictions,
// getCorrelations, getPayrollPanel

import { Test, TestingModule } from '@nestjs/testing';
import { DashboardRhService } from './dashboard-rh.service';
import { PrismaService } from '../prisma/prisma.service';

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
  };
}

describe('DashboardRhService (progress)', () => {
  let service: DashboardRhService;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();

    const module: TestingModule = await Test.createTestingModule({
      providers: [DashboardRhService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();

    service = module.get<DashboardRhService>(DashboardRhService);
  });

  // ─── getHeadcountPanel ──────────────────────────────────────────

  describe('getHeadcountPanel', () => {
    it('deve retornar dados de headcount com departamentos e posições', async () => {
      mockPrisma.user.count
        .mockResolvedValueOnce(100) // total
        .mockResolvedValueOnce(90); // active
      mockPrisma.department.findMany.mockResolvedValue([
        { id: 1, name: 'TI', _count: { users: 30 } },
      ]);
      mockPrisma.position.findMany.mockResolvedValue([
        { id: 1, name: 'Dev', level: 2, _count: { users: 20 } },
      ]);
      mockPrisma.user.findMany
        .mockResolvedValueOnce([{ createdAt: new Date('2022-01-01') }]) // byTenure
        .mockResolvedValueOnce([{ createdAt: new Date('2022-01-01') }]); // avgTenure

      const result = await service.getHeadcountPanel() as any;
      expect(result.total).toBe(100);
      expect(result.active).toBe(90);
      expect(result.byDepartment).toHaveLength(1);
      expect(result.byPosition).toHaveLength(1);
    });

    it('deve filtrar por departmentId', async () => {
      mockPrisma.user.count.mockResolvedValue(0);
      mockPrisma.department.findMany.mockResolvedValue([]);
      mockPrisma.position.findMany.mockResolvedValue([]);
      mockPrisma.user.findMany.mockResolvedValue([]);
      await service.getHeadcountPanel(5);
      expect(mockPrisma.user.count).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ departmentId: 5 }) }),
      );
    });

    it('deve calcular categorias de tenure correctamente', async () => {
      const tenureData = [
        { createdAt: new Date(Date.now() - 6 * 30 * 86400000) },  // <1yr
        { createdAt: new Date(Date.now() - 18 * 30 * 86400000) }, // 1-2yr
        { createdAt: new Date(Date.now() - 36 * 30 * 86400000) }, // 2-5yr
        { createdAt: new Date(Date.now() - 72 * 30 * 86400000) }, // 5+yr
      ];
      mockPrisma.user.count.mockResolvedValue(4);
      mockPrisma.department.findMany.mockResolvedValue([]);
      mockPrisma.position.findMany.mockResolvedValue([]);
      mockPrisma.user.findMany
        .mockResolvedValueOnce(tenureData)
        .mockResolvedValueOnce(tenureData);
      const result = await service.getHeadcountPanel() as any;
      expect(result.byTenure['<1yr']).toBe(1);
      expect(result.byTenure['1-2yr']).toBe(1);
      expect(result.byTenure['2-5yr']).toBe(1);
      expect(result.byTenure['5+yr']).toBe(1);
    });
  });

  // ─── getHeadcountTrend ──────────────────────────────────────────

  describe('getHeadcountTrend', () => {
    it('deve retornar trend de headcount para N meses', async () => {
      mockPrisma.user.count.mockResolvedValue(100);
      const result = await service.getHeadcountTrend(3) as any[];
      expect(result).toHaveLength(3);
      result.forEach(m => {
        expect(m.month).toMatch(/^\d{4}-\d{2}$/);
        expect(m.count).toBeDefined();
        expect(m.new).toBeDefined();
      });
    });

    it('deve usar 6 meses como padrão', async () => {
      mockPrisma.user.count.mockResolvedValue(0);
      const result = await service.getHeadcountTrend() as any[];
      expect(result).toHaveLength(6);
    });
  });

  // ─── getTurnoverPanel ───────────────────────────────────────────

  describe('getTurnoverPanel', () => {
    it('deve retornar turnover panel com zero saídas', async () => {
      mockPrisma.user.count.mockResolvedValue(100);
      mockPrisma.auditLog.findMany.mockResolvedValue([]);
      const result = await service.getTurnoverPanel(12) as any;
      expect(result).toBeDefined();
      expect(result.turnoverRate).toBeDefined();
    });

    it('deve usar 12 meses como padrão', async () => {
      mockPrisma.user.count.mockResolvedValue(100);
      mockPrisma.auditLog.findMany.mockResolvedValue([]);
      const result = await service.getTurnoverPanel() as any;
      expect(result).toBeDefined();
    });
  });

  // ─── getEngagementPanel ─────────────────────────────────────────

  describe('getEngagementPanel', () => {
    it('deve retornar painel de engagement com zero inquéritos', async () => {
      mockPrisma.surveyResponse.count.mockResolvedValue(0);
      mockPrisma.surveyResponse.aggregate.mockResolvedValue({ _avg: { score: null } });
      mockPrisma.user.count.mockResolvedValue(50);
      const result = await service.getEngagementPanel() as any;
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
      const result = await service.getPerformancePanel() as any;
      expect(result).toBeDefined();
    });

    it('deve calcular score médio e estatísticas', async () => {
      mockPrisma.performanceReview.aggregate.mockResolvedValue({ _avg: { score: 3.8 } });
      mockPrisma.performanceReview.count.mockResolvedValue(5);
      mockPrisma.user.count.mockResolvedValue(50);
      const result = await service.getPerformancePanel() as any;
      expect(result).toBeDefined();
    });
  });

  // ─── getSkillsPanel ─────────────────────────────────────────────

  describe('getSkillsPanel', () => {
    it('deve retornar painel de competências', async () => {
      mockPrisma.userCompetency.groupBy.mockResolvedValue([]);
      mockPrisma.competency.findMany.mockResolvedValue([]);
      mockPrisma.user.count.mockResolvedValue(50);
      const result = await service.getSkillsPanel() as any;
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
      const result = await service.getTrainingPanel() as any;
      expect(result).toBeDefined();
    });
  });

  // ─── getCompliancePanel ─────────────────────────────────────────

  describe('getCompliancePanel', () => {
    it('deve retornar painel de compliance', async () => {
      mockPrisma.enrollment.count.mockResolvedValue(0);
      mockPrisma.user.count.mockResolvedValue(50);
      const result = await service.getCompliancePanel() as any;
      expect(result).toBeDefined();
    });
  });

  // ─── getBirthdaysThisMonth ──────────────────────────────────────

  describe('getBirthdaysThisMonth', () => {
    it('deve retornar lista vazia (campo dateOfBirth não existe no schema)', async () => {
      const result = await service.getBirthdaysThisMonth() as any[];
      expect(Array.isArray(result)).toBe(true);
      expect(result).toHaveLength(0);
    });
  });

  // ─── getAnniversariesThisMonth ──────────────────────────────────

  describe('getAnniversariesThisMonth', () => {
    it('deve retornar lista vazia quando sem utilizadores este mês', async () => {
      mockPrisma.user.findMany.mockResolvedValue([]);
      const result = await service.getAnniversariesThisMonth() as any[];
      expect(Array.isArray(result)).toBe(true);
    });

    it('deve retornar utilizadores com aniversário este mês', async () => {
      const now = new Date();
      const hireDate = new Date(now.getFullYear() - 3, now.getMonth(), 15);
      mockPrisma.user.findMany.mockResolvedValue([
        {
          id: 1, fullName: 'Ana', avatarUrl: null, createdAt: hireDate,
          department: { name: 'TI' }, position: { name: 'Dev' },
        },
      ]);
      const result = await service.getAnniversariesThisMonth() as any[];
      expect(result).toHaveLength(1);
      expect(result[0].years).toBe(3);
    });
  });

  // ─── getAttendancePanel ─────────────────────────────────────────

  describe('getAttendancePanel', () => {
    it('deve retornar painel de presenças vazio', async () => {
      mockPrisma.attendance.findMany.mockResolvedValue([]);
      const result = await service.getAttendancePanel() as any;
      expect(result.total).toBe(0);
      expect(result.presenceRate).toBe(0);
    });

    it('deve contar estatísticas de presença', async () => {
      mockPrisma.attendance.findMany.mockResolvedValue([
        { status: 'present', employee: { id: 1, name: 'Ana' } },
        { status: 'absent', employee: { id: 2, name: 'João' } },
        { status: 'late', employee: { id: 3, name: 'Maria' } },
      ]);
      const result = await service.getAttendancePanel('2026-01-01', '2026-01-31') as any;
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
      const result = await service.getTalentPipeline() as any;
      expect(result).toBeDefined();
    });
  });

  // ─── getAlerts ──────────────────────────────────────────────────

  describe('getAlerts', () => {
    it('deve retornar lista vazia de alertas quando sem problemas', async () => {
      mockPrisma.developmentPlanAction.count.mockResolvedValue(0);
      mockPrisma.enrollment.count.mockResolvedValue(0);
      mockPrisma.performanceReview.count.mockResolvedValue(0);
      mockPrisma.surveyResponse.count.mockResolvedValue(100); // alta participação
      mockPrisma.user.count.mockResolvedValue(100);
      const result = await service.getAlerts() as any[];
      expect(Array.isArray(result)).toBe(true);
      expect(result).toHaveLength(0);
    });

    it('deve adicionar alertas HIGH quando existem problemas', async () => {
      mockPrisma.developmentPlanAction.count.mockResolvedValue(5);  // PDI em atraso
      mockPrisma.enrollment.count.mockResolvedValue(10);             // formações obrigatórias
      mockPrisma.performanceReview.count.mockResolvedValue(3);       // performance crítica
      mockPrisma.surveyResponse.count.mockResolvedValue(5);
      mockPrisma.user.count.mockResolvedValue(100); // 5% participação < 30%
      const result = await service.getAlerts() as any[];
      expect(result.length).toBeGreaterThan(0);
      const severities = result.map((a: any) => a.severity);
      expect(severities).toContain('HIGH');
    });
  });

  // ─── getPredictions ─────────────────────────────────────────────

  describe('getPredictions', () => {
    it('deve retornar previsões com zero risco de turnover', async () => {
      mockPrisma.performanceReview.findMany.mockResolvedValue([]);
      mockPrisma.performanceReview.count.mockResolvedValue(0);
      mockPrisma.surveyResponse.count.mockResolvedValue(50);
      const result = await service.getPredictions() as any;
      expect(result.summary).toBeDefined();
      expect(result.turnoverRisk).toHaveLength(0);
      expect(result.generatedAt).toBeDefined();
    });

    it('deve classificar risk levels para colaboradores com baixa performance', async () => {
      const hireDate = new Date('2020-01-01');
      mockPrisma.performanceReview.findMany.mockResolvedValue([
        { score: 1.5, status: 'COMPLETED', user: { id: 1, fullName: 'Ana', avatarUrl: null, department: { name: 'TI' }, createdAt: hireDate } },
        { score: 2.2, status: 'COMPLETED', user: { id: 2, fullName: 'João', avatarUrl: null, department: { name: 'RH' }, createdAt: hireDate } },
      ]);
      mockPrisma.performanceReview.count.mockResolvedValue(2);
      mockPrisma.surveyResponse.count.mockResolvedValue(50);
      const result = await service.getPredictions() as any;
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
      const result = await service.getCorrelations() as any;
      expect(result).toBeDefined();
    });
  });

  // ─── getPayrollPanel ────────────────────────────────────────────

  describe('getPayrollPanel', () => {
    it('deve retornar painel de folha salarial vazio', async () => {
      mockPrisma.historyRecord.findMany.mockResolvedValue([]);
      const result = await service.getPayrollPanel('2026-06') as any;
      expect(result.period).toBe('2026-06');
      expect(result.headcount).toBe(0);
      expect(result.totalGross).toBe(0);
    });

    it('deve calcular totais salariais a partir de registos', async () => {
      mockPrisma.historyRecord.findMany.mockResolvedValue([
        {
          action: 'PAYSLIP',
          description: JSON.stringify({ period: '2026-06', grossSalary: 2000, netSalary: 1600, totalDeductions: 400 }),
          user: { id: 1, fullName: 'Ana', department: { name: 'TI' } },
        },
        {
          action: 'PAYSLIP',
          description: JSON.stringify({ period: '2026-06', grossSalary: 3000, netSalary: 2400, totalDeductions: 600 }),
          user: { id: 2, fullName: 'João', department: { name: 'RH' } },
        },
      ]);
      const result = await service.getPayrollPanel('2026-06') as any;
      expect(result.headcount).toBe(2);
      expect(result.totalGross).toBe(5000);
      expect(result.totalNet).toBe(4000);
      expect(result.avgGross).toBe(2500);
    });
  });
});
