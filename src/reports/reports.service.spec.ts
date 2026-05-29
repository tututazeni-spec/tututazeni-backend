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
    findMany: jest.fn(),
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
    count: jest.fn(),
    aggregate: jest.fn(),
  },
  performanceReview: {
    aggregate: jest.fn().mockResolvedValue({ _avg: { score: null } }),
    findMany: jest.fn().mockResolvedValue([]),
    count: jest.fn().mockResolvedValue(0),
    groupBy: jest.fn().mockResolvedValue([]),
  },
  badgeAward: { count: jest.fn().mockResolvedValue(0), findMany: jest.fn().mockResolvedValue([]) },
  engagementSurvey: { findMany: jest.fn().mockResolvedValue([]) },
  savedReport: { create: jest.fn().mockResolvedValue({ id: 1 }), findMany: jest.fn() },
  reportSchedule: { create: jest.fn().mockResolvedValue({ id: 1 }), findMany: jest.fn() },
};

const mockPrismaProxy = new Proxy(mockPrisma, {
  get(target, prop) {
    if (prop === 'position') return positionMock;
    if (prop === 'attendanceRecord') return { findMany: jest.fn().mockResolvedValue([]) };
    return (target as any)[prop];
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
});
