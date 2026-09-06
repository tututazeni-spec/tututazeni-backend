import { Test, TestingModule } from '@nestjs/testing';
import { ReportsService } from './reports.service';
import { PrismaService } from '../prisma/prisma.service';
import { MetricsAggregationService } from '../metrics-aggregation/metrics-aggregation.service';

// ─── MetricsAggregationService mock (Fase H — Task 8) ─────────────────────
// reports.headcountReport / reports.turnoverReport delegam os números à camada
// canónica e montam o relatório à volta deles.
const DEFAULT_HEADCOUNT = {
  total: 0,
  active: 0,
  inactive: 0,
  newHires: 0,
  newHiresPrev: 0,
  newHiresTrend: 0,
  avgTenureMonths: 0,
  byTenure: { '<1yr': 0, '1-2yr': 0, '2-5yr': 0, '5+yr': 0 },
  byDepartment: [] as { id: number; name: string; count: number }[],
  byPosition: [] as { id: number; name: string; level?: string; count: number }[],
  period: { from: new Date('2026-01-01'), to: new Date('2026-12-31') },
  generatedAt: new Date('2026-12-31'),
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
  insights: [] as string[],
  period: { from: new Date('2026-01-01'), to: new Date('2026-12-31') },
};
const mockMetrics = {
  headcount: jest.fn(),
  turnover: jest.fn(),
  trainingRoi: jest.fn(),
  alerts: jest.fn(),
};

const positionMock = {
  findMany: jest.fn().mockResolvedValue([]),
};

const mockPrisma = {
  user: {
    count: jest.fn(),
    findMany: jest.fn(),
    groupBy: jest.fn(),
  },
  department: {
    findMany: jest.fn(),
    count: jest.fn(),
  },
  enrollment: {
    count: jest.fn(),
    findMany: jest.fn(),
    groupBy: jest.fn(),
    aggregate: jest.fn(),
  },
  course: {
    count: jest.fn(),
    findMany: jest.fn(),
    groupBy: jest.fn(),
  },
  certificate: {
    count: jest.fn(),
    findMany: jest.fn().mockResolvedValue([]),
  },
  leaveRequest: {
    count: jest.fn(),
    findMany: jest.fn(),
    groupBy: jest.fn(),
  },
  attendanceRecord: { findMany: jest.fn().mockResolvedValue([]) },
  competency: { count: jest.fn(), findMany: jest.fn() },
  userCompetency: {
    findMany: jest.fn().mockResolvedValue([]),
    count: jest.fn().mockResolvedValue(0),
    aggregate: jest.fn().mockResolvedValue({ _avg: {} }),
    groupBy: jest.fn().mockResolvedValue([]),
  },
  performanceReview: {
    aggregate: jest.fn().mockResolvedValue({ _avg: { score: null } }),
    findMany: jest.fn().mockResolvedValue([]),
    count: jest.fn().mockResolvedValue(0),
    groupBy: jest.fn().mockResolvedValue([]),
  },
  badgeAward: { count: jest.fn().mockResolvedValue(0), findMany: jest.fn().mockResolvedValue([]) },
  engagementSurvey: {
    findMany: jest.fn().mockResolvedValue([]),
    count: jest.fn().mockResolvedValue(0),
    groupBy: jest.fn().mockResolvedValue([]),
    aggregate: jest.fn().mockResolvedValue({ _avg: {} }),
  },
  kudos: { count: jest.fn().mockResolvedValue(3) },
  continuousFeedback: { count: jest.fn().mockResolvedValue(5) },
  leadershipPulse: { aggregate: jest.fn().mockResolvedValue({ _avg: { overallScore: 4.2 } }) },
  savedReport: {
    create: jest.fn().mockResolvedValue({ id: 1, name: 'R' }),
    findMany: jest.fn().mockResolvedValue([]),
    findUnique: jest.fn().mockResolvedValue(null),
    deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
  },
  reportSchedule: {
    create: jest.fn().mockResolvedValue({ id: 1 }),
    findMany: jest.fn().mockResolvedValue([]),
    findUnique: jest.fn().mockResolvedValue(null),
    updateMany: jest.fn().mockResolvedValue({ count: 1 }),
  },
};

const fallbackModel = () => ({
  findMany: jest.fn().mockResolvedValue([]),
  findUnique: jest.fn().mockResolvedValue(null),
  findFirst: jest.fn().mockResolvedValue(null),
  create: jest.fn().mockResolvedValue({}),
  update: jest.fn().mockResolvedValue({}),
  delete: jest.fn().mockResolvedValue({}),
  count: jest.fn().mockResolvedValue(0),
  groupBy: jest.fn().mockResolvedValue([]),
  aggregate: jest.fn().mockResolvedValue({ _avg: {}, _sum: {}, _count: {} }),
  upsert: jest.fn().mockResolvedValue({}),
});

const mockPrismaProxy: any = new Proxy(mockPrisma, {
  get(target, prop) {
    // O serviço usa this.prisma.db para a réplica; devolve o próprio mock.
    if (prop === 'db') return mockPrismaProxy;
    if (prop === 'position') return positionMock;
    if (prop === 'attendanceRecord')
      return { findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0) };
    const val = (target as any)[prop];
    return val !== undefined ? val : fallbackModel();
  },
});

describe('ReportsService', () => {
  let service: ReportsService;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockMetrics.headcount.mockResolvedValue(DEFAULT_HEADCOUNT);
    mockMetrics.turnover.mockResolvedValue(DEFAULT_TURNOVER);
    mockPrisma.user.count.mockResolvedValue(100);
    mockPrisma.user.findMany.mockResolvedValue([]);
    mockPrisma.department.findMany.mockResolvedValue([]);
    mockPrisma.enrollment.count.mockResolvedValue(50);
    mockPrisma.enrollment.findMany.mockResolvedValue([]);
    mockPrisma.enrollment.groupBy.mockResolvedValue([]);
    mockPrisma.enrollment.aggregate.mockResolvedValue({ _avg: { progressPercent: 0 } });
    mockPrisma.course.count.mockResolvedValue(20);
    mockPrisma.course.findMany.mockResolvedValue([]);
    mockPrisma.certificate.count.mockResolvedValue(10);
    mockPrisma.leaveRequest.count.mockResolvedValue(5);
    mockPrisma.leaveRequest.groupBy.mockResolvedValue([]);
    mockPrisma.competency.count.mockResolvedValue(15);
    positionMock.findMany.mockResolvedValue([]);

    Object.defineProperty(mockPrismaProxy, 'read', {
      get() {
        return mockPrismaProxy;
      },
      configurable: true,
    });
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReportsService,
        { provide: PrismaService, useValue: mockPrismaProxy },
        { provide: MetricsAggregationService, useValue: mockMetrics },
      ],
    }).compile();
    service = module.get<ReportsService>(ReportsService);
  });

  describe('headcountReport', () => {
    it('delega a metrics.headcount e monta o relatório à volta do número canónico', async () => {
      mockMetrics.headcount.mockResolvedValue({
        ...DEFAULT_HEADCOUNT,
        total: 100,
        active: 90,
        inactive: 10,
        newHires: 5,
        newHiresTrend: 25,
        byDepartment: [{ id: 1, name: 'TI', count: 40 }],
        byPosition: [{ id: 9, name: 'Dev', level: 'SENIOR', count: 20 }],
      });

      const result = await service.headcountReport({ departmentId: 3 });

      expect(mockMetrics.headcount).toHaveBeenCalledWith(
        expect.objectContaining({ departmentId: 3, from: expect.any(Date), to: expect.any(Date) }),
      );
      expect(result.report).toBe('HEADCOUNT');
      expect(result.summary.total).toBe(100);
      expect(result.summary.active).toBe(90);
      expect(result.summary.inactive).toBe(10);
      expect(result.summary.newHires).toBe(5);
      expect(result.summary.newHiresTrend).toBe(25);
      expect(result.summary.turnoverRate).toBe(10); // 10 / 100 * 100 — derivado no adapter
      expect(result.byDepartment).toEqual([{ id: 1, name: 'TI', count: 40 }]);
      expect(result.byPosition).toEqual([{ id: 9, name: 'Dev', level: 'SENIOR', count: 20 }]);
    });

    it('degrada para relatório zerado (shape-válido) + logger.warn quando metrics.headcount falha', async () => {
      const warn = jest.spyOn((service as any).logger, 'warn').mockImplementation(() => undefined);
      mockMetrics.headcount.mockRejectedValue(new Error('db down'));

      const result = await service.headcountReport({});

      expect(result.report).toBe('HEADCOUNT');
      expect(result.summary).toEqual({
        total: 0,
        active: 0,
        inactive: 0,
        newHires: 0,
        newHiresTrend: 0,
        turnoverRate: 0,
      });
      expect(result.byDepartment).toEqual([]);
      expect(result.byPosition).toEqual([]);
      expect(warn).toHaveBeenCalledWith(expect.objectContaining({ action: 'REPORTS_HEADCOUNT' }));
      warn.mockRestore();
    });
  });

  describe('turnoverReport', () => {
    it('delega a metrics.turnover, mantém total/inactive locais e usa r.insights', async () => {
      mockPrisma.user.count.mockResolvedValueOnce(100).mockResolvedValueOnce(10); // total, inactive
      mockMetrics.turnover.mockResolvedValue({
        ...DEFAULT_TURNOVER,
        leavers: 8,
        turnoverRate: 8,
        retentionRate: 92,
        newHires: 5,
        insights: ['linha 1', 'linha 2'],
      });

      const result = await service.turnoverReport({ departmentId: 2 });

      expect(mockMetrics.turnover).toHaveBeenCalledWith(
        expect.objectContaining({ departmentId: 2, from: expect.any(Date), to: expect.any(Date) }),
      );
      expect(result.report).toBe('TURNOVER');
      expect(result.summary.total).toBe(100);
      expect(result.summary.inactive).toBe(10);
      expect(result.summary.newInPeriod).toBe(5);
      expect(result.summary.leftInPeriod).toBe(8);
      expect(result.summary.turnoverRate).toBe(8);
      expect(result.summary.retentionRate).toBe(92);
      expect(result.insights).toEqual(['linha 1', 'linha 2']);
    });

    it('degrada (turnover 0, retention 100, insights []) + warn quando metrics.turnover falha', async () => {
      const warn = jest.spyOn((service as any).logger, 'warn').mockImplementation(() => undefined);
      mockPrisma.user.count.mockResolvedValueOnce(50).mockResolvedValueOnce(4);
      mockMetrics.turnover.mockRejectedValue(new Error('replica down'));

      const result = await service.turnoverReport({});

      expect(result.summary).toEqual({
        total: 50,
        inactive: 4,
        newInPeriod: 0,
        leftInPeriod: 0,
        turnoverRate: 0,
        retentionRate: 100,
      });
      expect(result.insights).toEqual([]);
      expect(warn).toHaveBeenCalledWith(expect.objectContaining({ action: 'REPORTS_TURNOVER' }));
      warn.mockRestore();
    });
  });

  describe('trainingReport', () => {
    it('deve retornar relatório de formação', async () => {
      mockPrisma.enrollment.aggregate.mockResolvedValue({ _avg: { progressPercent: 75 } });
      mockPrisma.enrollment.groupBy.mockResolvedValue([]);
      mockPrisma.course.groupBy.mockResolvedValue([]);

      const result = await service.trainingReport('2024-01-01', '2024-12-31');

      expect(result).toBeDefined();
    });
  });

  // ─── trainingReportFull ───────────────────────────────────────────────────

  describe('trainingReportFull', () => {
    it('deve retornar relatório de formação completo', async () => {
      mockPrisma.enrollment.count.mockResolvedValue(50);
      mockPrisma.enrollment.aggregate.mockResolvedValue({ _avg: { progressPercent: 70 } });
      const result = await service.trainingReportFull({});
      expect(result).toBeDefined();
    });
  });

  // ─── skillGapReport ───────────────────────────────────────────────────────

  describe('skillGapReport', () => {
    it('deve retornar relatório de gap de competências', async () => {
      const result = await service.skillGapReport({});
      expect(result).toBeDefined();
    });
  });

  // ─── performanceReportFull ────────────────────────────────────────────────

  describe('performanceReportFull', () => {
    it('deve retornar relatório de performance completo', async () => {
      const result = await service.performanceReportFull({});
      expect(result).toBeDefined();
    });
  });

  // ─── engagementReport ─────────────────────────────────────────────────────

  describe('engagementReport', () => {
    it('deve retornar relatório de engagement', async () => {
      const result = await service.engagementReport({});
      expect(result).toBeDefined();
    });

    it('usa kudos/continuousFeedback/leadershipPulse e avgMood do overallScore', async () => {
      const result = await service.engagementReport({});
      expect(mockPrisma.kudos.count).toHaveBeenCalled();
      expect(mockPrisma.continuousFeedback.count).toHaveBeenCalled();
      expect(mockPrisma.leadershipPulse.aggregate).toHaveBeenCalled();
      expect(result.summary.recognitions).toBe(3);
      expect(result.summary.feedbackCount).toBe(5);
      expect(result.avgMood).toBe(4.2);
    });
  });

  // ─── talentReport ─────────────────────────────────────────────────────────

  describe('talentReport', () => {
    it('deve retornar relatório de talentos', async () => {
      const result = await service.talentReport({});
      expect(result).toBeDefined();
    });
  });

  // ─── complianceReport ─────────────────────────────────────────────────────

  describe('complianceReport', () => {
    it('deve retornar relatório de compliance', async () => {
      const result = await service.complianceReport({});
      expect(result).toBeDefined();
    });
  });

  // ─── attendanceReport ─────────────────────────────────────────────────────

  describe('attendanceReport', () => {
    it('deve retornar relatório de presenças', async () => {
      const result = await service.attendanceReport('2024-01-01', '2024-12-31');
      expect(result).toBeDefined();
    });
  });

  // ─── payrollSummary ───────────────────────────────────────────────────────

  describe('payrollSummary', () => {
    it('deve retornar resumo de payroll', async () => {
      const result = await service.payrollSummary('2024-01');
      expect(result).toBeDefined();
    });
  });

  // ─── competencyGapReport ──────────────────────────────────────────────────

  describe('competencyGapReport', () => {
    it('deve retornar relatório de gap de competências', async () => {
      const result = await service.competencyGapReport();
      expect(result).toBeDefined();
    });
  });

  describe('saveReport', () => {
    it('devolve o registo criado (sem mensagem "execute migration")', async () => {
      mockPrisma.savedReport.create.mockResolvedValue({ id: 42, name: 'Meu Relatório' });
      const result = await service.saveReport(7, {
        name: 'Meu Relatório',
        category: 'HR' as any,
        reportKey: 'headcount',
        params: '{}',
      } as any);
      expect(mockPrisma.savedReport.create).toHaveBeenCalled();
      expect(result).toEqual({ id: 42, name: 'Meu Relatório' });
    });
  });

  describe('deleteReport', () => {
    it('apaga por id e devolve mensagem', async () => {
      const result = await service.deleteReport(42);
      expect(mockPrisma.savedReport.deleteMany).toHaveBeenCalledWith({ where: { id: 42 } });
      expect(result).toEqual({ message: 'Relatório removido' });
    });
  });

  describe('listSavedReports', () => {
    it('devolve as linhas da BD', async () => {
      mockPrisma.savedReport.findMany.mockResolvedValue([{ id: 1 }, { id: 2 }]);
      const result = await service.listSavedReports(7);
      expect(result).toHaveLength(2);
    });
  });

  describe('createSchedule', () => {
    it('devolve o agendamento criado (sem mensagem "execute migration")', async () => {
      mockPrisma.reportSchedule.create.mockResolvedValue({ id: 99, frequency: 'WEEKLY' });
      const result = await service.createSchedule(7, {
        savedReportId: 1,
        frequency: 'WEEKLY' as any,
      } as any);
      expect(mockPrisma.reportSchedule.create).toHaveBeenCalled();
      expect(result).toEqual({ id: 99, frequency: 'WEEKLY' });
    });
  });

  describe('listSchedules', () => {
    it('devolve agendamentos activos da BD', async () => {
      mockPrisma.reportSchedule.findMany.mockResolvedValue([{ id: 1 }]);
      const result = await service.listSchedules(7);
      expect(result).toHaveLength(1);
    });
  });

  describe('deleteSchedule', () => {
    it('marca como inactivo e devolve mensagem', async () => {
      const result = await service.deleteSchedule(99);
      expect(mockPrisma.reportSchedule.updateMany).toHaveBeenCalledWith({
        where: { id: 99 },
        data: { active: false },
      });
      expect(result).toEqual({ message: 'Agendamento cancelado' });
    });
  });
});
