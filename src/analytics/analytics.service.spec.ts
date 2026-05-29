import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { AnalyticsService } from './analytics.service';
import { PrismaService } from '../prisma/prisma.service';

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
  developmentPlan: { count: makeCount(), findMany: makeFind() },
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
  developmentPlanAction: { count: makeCount(), findMany: makeFind() },
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
    const module: TestingModule = await Test.createTestingModule({
      providers: [AnalyticsService, { provide: PrismaService, useValue: mockPrismaProxy }],
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
});
