// src/reports/reports.service.progress.spec.ts
// Cobre métodos não testados: turnoverReport, trainingReportFull, skillGapReport,
// engagementReport, talentReport, complianceReport, payrollSummary,
// competencyGapReport, platformUsageReport, listSavedReports, getTemplates,
// deleteReport, listSchedules, deleteSchedule, exportToCsv, getInsights

import { Test, TestingModule } from '@nestjs/testing';
import { ReportsService } from './reports.service';
import { PrismaService } from '../prisma/prisma.service';

const baseFilter = { from: '2026-01-01', to: '2026-06-30' };

function buildMockPrisma() {
  const crud = () => ({
    findMany: jest.fn().mockResolvedValue([]),
    findFirst: jest.fn().mockResolvedValue(null),
    findUnique: jest.fn().mockResolvedValue(null),
    create: jest.fn().mockResolvedValue({}),
    update: jest.fn().mockResolvedValue({}),
    delete: jest.fn().mockResolvedValue({}),
    count: jest.fn().mockResolvedValue(0),
    groupBy: jest.fn().mockResolvedValue([]),
    aggregate: jest.fn().mockResolvedValue({ _avg: { score: null }, _sum: {} }),
  });

  return {
    user: crud(),
    department: crud(),
    position: crud(),
    enrollment: crud(),
    course: crud(),
    userCompetency: crud(),
    competency: crud(),
    performanceReview: crud(),
    surveyResponse: crud(),
    attendance: crud(),
    historyRecord: crud(),
    auditLog: crud(),
    notificationLog: crud(),
    successionPlan: crud(),
    legacyPdi: crud(),
    badgeAward: crud(),
    engagementSurvey: crud(),
    developmentPlan: crud(),
    avatarSession: crud(),
    certificate: crud(),
    savedReport: crud(),
    reportSchedule: crud(),
  };
}

describe('ReportsService (progress)', () => {
  let service: ReportsService;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();

    Object.defineProperty(mockPrisma, 'read', {
      get() {
        return mockPrisma;
      },
      configurable: true,
    });
    const module: TestingModule = await Test.createTestingModule({
      providers: [ReportsService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();

    service = module.get<ReportsService>(ReportsService);
  });

  // ─── turnoverReport ─────────────────────────────────────────────

  describe('turnoverReport', () => {
    it('deve gerar relatório de turnover com zero saídas', async () => {
      mockPrisma.user.count
        .mockResolvedValueOnce(100) // total
        .mockResolvedValueOnce(0) // inactive
        .mockResolvedValueOnce(0) // newInPeriod
        .mockResolvedValueOnce(0); // leftInPeriod (zero saídas)
      const result = (await service.turnoverReport(baseFilter)) as any;
      expect(result.report).toBe('TURNOVER');
      expect(result.summary).toBeDefined();
      expect(result.summary.turnoverRate).toBe(0);
      expect(result.summary.retentionRate).toBe(100);
    });

    it('deve filtrar por departamento', async () => {
      mockPrisma.user.count.mockResolvedValue(50);
      await service.turnoverReport({ ...baseFilter, departmentId: 2 });
      expect(mockPrisma.user.count).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ departmentId: 2 }) }),
      );
    });

    it('deve calcular turnoverRate quando há saídas', async () => {
      mockPrisma.user.count
        .mockResolvedValueOnce(100) // total
        .mockResolvedValueOnce(10) // inactive
        .mockResolvedValueOnce(5) // newInPeriod
        .mockResolvedValueOnce(8); // leftInPeriod
      const result = (await service.turnoverReport(baseFilter)) as any;
      expect(result.summary.turnoverRate).toBe(8);
      expect(result.insights.length).toBeGreaterThan(0);
    });
  });

  // ─── trainingReportFull ─────────────────────────────────────────

  describe('trainingReportFull', () => {
    it('deve gerar relatório de formação completo', async () => {
      mockPrisma.enrollment.count.mockResolvedValue(0);
      mockPrisma.enrollment.groupBy.mockResolvedValue([]);
      mockPrisma.department.findMany.mockResolvedValue([]);
      mockPrisma.performanceReview.aggregate.mockResolvedValue({ _avg: { score: null } });
      const result = (await service.trainingReportFull(baseFilter)) as any;
      expect(result.report).toBe('TRAINING');
      expect(result.summary).toBeDefined();
    });
  });

  // ─── skillGapReport ─────────────────────────────────────────────

  describe('skillGapReport', () => {
    it('deve gerar relatório de gap de competências', async () => {
      mockPrisma.userCompetency.findMany.mockResolvedValue([]);
      mockPrisma.user.count.mockResolvedValue(50);
      const result = (await service.skillGapReport(baseFilter)) as any;
      expect(result.report).toBe('SKILL_GAP');
    });

    it('deve agrupar gaps por competência', async () => {
      mockPrisma.userCompetency.findMany.mockResolvedValue([
        {
          userId: 1,
          currentLevel: 2,
          competency: { id: 1, name: 'Excel', type: 'TECHNICAL' },
          user: { id: 1, fullName: 'Ana', department: null, position: null },
        },
        {
          userId: 2,
          currentLevel: 4,
          competency: { id: 1, name: 'Excel', type: 'TECHNICAL' },
          user: { id: 2, fullName: 'João', department: null, position: null },
        },
      ]);
      mockPrisma.user.count.mockResolvedValue(10);
      const result = (await service.skillGapReport(baseFilter)) as any;
      expect(result.skills).toBeDefined();
      expect(result.skills.length).toBe(1);
      expect(result.skills[0].competency.name).toBe('Excel');
    });
  });

  // ─── engagementReport ───────────────────────────────────────────

  describe('engagementReport', () => {
    it('deve gerar relatório de engagement sem dados', async () => {
      mockPrisma.surveyResponse.count.mockResolvedValue(0);
      mockPrisma.surveyResponse.aggregate.mockResolvedValue({ _avg: { score: null } });
      mockPrisma.user.count.mockResolvedValue(50);
      const result = (await service.engagementReport(baseFilter)) as any;
      expect(result.report).toBe('ENGAGEMENT');
      expect(result.summary).toBeDefined();
    });
  });

  // ─── talentReport ───────────────────────────────────────────────

  describe('talentReport', () => {
    it('deve gerar relatório de talento', async () => {
      mockPrisma.user.count.mockResolvedValue(50);
      mockPrisma.legacyPdi.count.mockResolvedValue(0);
      mockPrisma.successionPlan.count.mockResolvedValue(0);
      mockPrisma.badgeAward.count.mockResolvedValue(0);
      const result = (await service.talentReport(baseFilter)) as any;
      expect(result.report).toBe('TALENT');
      expect(result.summary).toBeDefined();
    });
  });

  // ─── complianceReport ───────────────────────────────────────────

  describe('complianceReport', () => {
    it('deve gerar relatório de compliance', async () => {
      mockPrisma.enrollment.count.mockResolvedValue(0);
      mockPrisma.user.count.mockResolvedValue(50);
      mockPrisma.enrollment.findMany.mockResolvedValue([]);
      const result = (await service.complianceReport(baseFilter)) as any;
      expect(result.report).toBe('COMPLIANCE');
    });
  });

  // ─── payrollSummary ─────────────────────────────────────────────

  describe('payrollSummary', () => {
    it('deve retornar sumário de folha vazio', async () => {
      mockPrisma.historyRecord.findMany.mockResolvedValue([]);
      const result = (await service.payrollSummary('2026-06')) as any;
      expect(result.report).toBe('PAYROLL');
      expect(result.headcount).toBe(0);
      expect(result.totals.grossSalary).toBe(0);
    });

    it('deve calcular totais de folha salarial', async () => {
      mockPrisma.historyRecord.findMany.mockResolvedValue([
        {
          action: 'PAYSLIP',
          description: JSON.stringify({ grossSalary: 2000, netSalary: 1600, totalDeductions: 400 }),
          user: { id: 1, fullName: 'Ana', department: null },
        },
      ]);
      const result = (await service.payrollSummary('2026-06')) as any;
      expect(result.headcount).toBe(1);
      expect(result.totals.grossSalary).toBe(2000);
      expect(result.totals.netSalary).toBe(1600);
    });
  });

  // ─── competencyGapReport ────────────────────────────────────────

  describe('competencyGapReport', () => {
    it('deve retornar lista vazia sem registos', async () => {
      mockPrisma.userCompetency.findMany.mockResolvedValue([]);
      const result = (await service.competencyGapReport()) as any[];
      expect(Array.isArray(result)).toBe(true);
    });

    it('deve agrupar gaps por competência com médias', async () => {
      mockPrisma.userCompetency.findMany.mockResolvedValue([
        {
          userId: 1,
          currentLevel: 2,
          competency: { name: 'Liderança' },
          user: { id: 1, fullName: 'Ana', department: null },
        },
        {
          userId: 2,
          currentLevel: 4,
          competency: { name: 'Liderança' },
          user: { id: 2, fullName: 'João', department: null },
        },
      ]);
      const result = (await service.competencyGapReport(1)) as any[];
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Liderança');
      expect(result[0].count).toBe(2);
      expect(result[0].avgGap).toBeDefined();
    });
  });

  // ─── platformUsageReport ────────────────────────────────────────

  describe('platformUsageReport', () => {
    it('deve gerar relatório de uso da plataforma', async () => {
      mockPrisma.auditLog.count.mockResolvedValue(0);
      mockPrisma.auditLog.findMany.mockResolvedValue([]);
      mockPrisma.user.count.mockResolvedValue(50);
      const result = (await service.platformUsageReport(baseFilter)) as any;
      expect(result.report).toBe('PLATFORM_USAGE');
    });
  });

  // ─── listSavedReports ───────────────────────────────────────────

  describe('listSavedReports', () => {
    it('deve retornar lista vazia (modelo opcional via ?.)', async () => {
      // savedReport não existe no mock → ?.findMany retorna undefined → .catch retorna []
      const result = (await service.listSavedReports(1)) as any[];
      expect(Array.isArray(result)).toBe(true);
    });

    it('deve filtrar por categoria', async () => {
      const result = (await service.listSavedReports(1, 'HR' as any)) as any[];
      expect(Array.isArray(result)).toBe(true);
    });
  });

  // ─── getTemplates ───────────────────────────────────────────────

  describe('getTemplates', () => {
    it('deve retornar templates built-in quando savedReport vazio', async () => {
      const result = (await service.getTemplates()) as any[];
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeGreaterThan(0);
    });
  });

  // ─── deleteReport ───────────────────────────────────────────────

  describe('deleteReport', () => {
    it('deve remover relatório (modelo opcional graceful)', async () => {
      const result = (await service.deleteReport(1)) as any;
      expect(result.message).toContain('removido');
    });
  });

  // ─── listSchedules ──────────────────────────────────────────────

  describe('listSchedules', () => {
    it('deve retornar lista de agendamentos (modelo opcional)', async () => {
      const result = (await service.listSchedules(1)) as any[];
      expect(Array.isArray(result)).toBe(true);
    });
  });

  // ─── deleteSchedule ─────────────────────────────────────────────

  describe('deleteSchedule', () => {
    it('deve cancelar agendamento (modelo opcional)', async () => {
      const result = (await service.deleteSchedule(1)) as any;
      expect(result.message).toContain('cancelado');
    });
  });

  // ─── exportToCsv ────────────────────────────────────────────────

  describe('exportToCsv', () => {
    it('deve converter array para CSV', async () => {
      const data = [
        { name: 'Ana', dept: 'TI', score: 4 },
        { name: 'João', dept: 'RH', score: 3 },
      ];
      const headers = ['name', 'dept', 'score'];
      const result = await service.exportToCsv(data, headers);
      expect(result).toContain('name,dept,score');
      expect(result).toContain('Ana,TI,4');
      expect(result).toContain('João,RH,3');
    });

    it('deve envolver valores com vírgula em aspas', async () => {
      const data = [{ name: 'Silva, Ana', dept: 'TI', score: 5 }];
      const result = await service.exportToCsv(data, ['name', 'dept', 'score']);
      expect(result).toContain('"Silva, Ana"');
    });
  });

  // ─── getInsights ────────────────────────────────────────────────

  describe('getInsights', () => {
    it('deve retornar insights sem problemas críticos', async () => {
      // Mocks para todos os sub-reports chamados internamente
      mockPrisma.enrollment.count.mockResolvedValue(100);
      mockPrisma.enrollment.groupBy.mockResolvedValue([]);
      mockPrisma.department.findMany.mockResolvedValue([]);
      mockPrisma.performanceReview.aggregate.mockResolvedValue({ _avg: { score: 4.0 } });
      mockPrisma.performanceReview.findMany.mockResolvedValue([]);
      mockPrisma.performanceReview.count.mockResolvedValue(0);
      mockPrisma.user.count.mockResolvedValue(50);
      mockPrisma.surveyResponse.count.mockResolvedValue(40);
      mockPrisma.surveyResponse.aggregate.mockResolvedValue({ _avg: { score: 4.0 } });
      mockPrisma.legacyPdi.count.mockResolvedValue(30);
      mockPrisma.successionPlan.count.mockResolvedValue(10);
      mockPrisma.badgeAward.count.mockResolvedValue(20);
      mockPrisma.userCompetency.findMany.mockResolvedValue([]);

      const result = (await service.getInsights(baseFilter)) as any;
      expect(result.insights).toBeDefined();
      expect(Array.isArray(result.insights)).toBe(true);
    });
  });
});
