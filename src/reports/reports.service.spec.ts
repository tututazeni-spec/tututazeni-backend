import { Test, TestingModule } from '@nestjs/testing';
import { ReportsService } from './reports.service';
import { PrismaService } from '../prisma/prisma.service';

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
  savedReport: {
    create: jest.fn().mockResolvedValue({ id: 1 }),
    findMany: jest.fn().mockResolvedValue([]),
  },
  reportSchedule: {
    create: jest.fn().mockResolvedValue({ id: 1 }),
    findMany: jest.fn().mockResolvedValue([]),
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

const mockPrismaProxy = new Proxy(mockPrisma, {
  get(target, prop) {
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

    const module: TestingModule = await Test.createTestingModule({
      providers: [ReportsService, { provide: PrismaService, useValue: mockPrismaProxy }],
    }).compile();
    service = module.get<ReportsService>(ReportsService);
  });

  describe('headcountReport', () => {
    it('deve retornar relatório headcount', async () => {
      mockPrisma.user.count
        .mockResolvedValueOnce(100)
        .mockResolvedValueOnce(90)
        .mockResolvedValueOnce(5)
        .mockResolvedValueOnce(3);

      const result = await service.headcountReport({});

      expect(result.report).toBe('HEADCOUNT');
      expect(result.summary.total).toBe(100);
      expect(result.summary.active).toBe(90);
    });
  });

  describe('turnoverReport', () => {
    it('deve retornar relatório de turnover', async () => {
      mockPrisma.user.count
        .mockResolvedValueOnce(100)
        .mockResolvedValueOnce(10)
        .mockResolvedValueOnce(8)
        .mockResolvedValueOnce(5);

      const result = await service.turnoverReport({});

      expect(result.report).toBe('TURNOVER');
      expect(result.summary.turnoverRate).toBe(5);
      expect(result.summary.retentionRate).toBe(95);
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
});
