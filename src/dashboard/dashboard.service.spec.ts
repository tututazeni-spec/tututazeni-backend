import { Test, TestingModule } from '@nestjs/testing';
import { DashboardService } from './dashboard.service';
import { PrismaService } from '../prisma/prisma.service';
import { CacheService } from '../cache/cache.service';

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
    it('deve retornar dashboard do gestor', async () => {
      mockPrisma.user.findMany.mockResolvedValue([]);
      const result = await service.getManagerDashboard(1);
      expect(result).toBeDefined();
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
