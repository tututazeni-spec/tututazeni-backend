import { Test, TestingModule } from '@nestjs/testing';
import { AnalyticsService } from './analytics.service';
import { PrismaService } from '../prisma/prisma.service';

const makeCount = (n = 0) => jest.fn().mockResolvedValue(n);
const makeFind = (data: any[] = []) => jest.fn().mockResolvedValue(data);
const makeAgg = () => jest.fn().mockResolvedValue({ _avg: {}, _sum: {}, _count: {} });
const makeGroupBy = () => jest.fn().mockResolvedValue([]);

const mockPrisma: any = {
  user: {
    count: makeCount(),
    findMany: makeFind(),
    findUnique: jest.fn().mockResolvedValue(null),
    groupBy: makeGroupBy(),
  },
  course: { count: makeCount(), findMany: makeFind(), groupBy: makeGroupBy() },
  enrollment: {
    count: makeCount(),
    findMany: makeFind(),
    groupBy: makeGroupBy(),
    aggregate: makeAgg(),
  },
  certificate: { count: makeCount(), findMany: makeFind() },
  userPoints: {
    aggregate: makeAgg(),
    findMany: makeFind(),
    findUnique: jest.fn().mockResolvedValue({ points: 0 }),
    count: makeCount(),
  },
  badgeAward: { count: makeCount(), findMany: makeFind() },
  learningPath: { count: makeCount(), findMany: makeFind() },
  developmentPlan: {
    count: makeCount(),
    findMany: makeFind(),
    groupBy: makeGroupBy(),
    aggregate: makeAgg(),
  },
  developmentPlanAction: { count: makeCount(), findMany: makeFind() },
  performanceReview: {
    aggregate: makeAgg(),
    count: makeCount(),
    findMany: makeFind(),
    groupBy: makeGroupBy(),
  },
  department: { findMany: makeFind() },
  lessonProgress: { count: makeCount(), findMany: makeFind() },
  attendanceRecord: { count: makeCount(), aggregate: makeAgg() },
  notificationLog: { count: makeCount() },
  leaveRequest: { count: makeCount(), groupBy: makeGroupBy() },
  competency: { count: makeCount() },
  userCompetency: { findMany: makeFind(), count: makeCount(), aggregate: makeAgg() },
  assessmentAttempt: { count: makeCount(), findMany: makeFind(), aggregate: makeAgg() },
  aiTutorSession: { count: makeCount(), findMany: makeFind() },
  knowledgeInteraction: { count: makeCount() },
  dashboardSnapshot: {
    findFirst: jest.fn().mockResolvedValue(null),
    create: jest.fn().mockResolvedValue({}),
  },
  courseAnalytics: { findMany: makeFind() },
  courseFeedback: { aggregate: makeAgg(), count: makeCount() },
  learningPathEnrollment: { count: makeCount(), findMany: makeFind(), groupBy: makeGroupBy() },
  microLearningProgress: { count: makeCount(), findMany: makeFind() },
  nineBoxPlacement: { count: makeCount(), findMany: makeFind() },
  trainingImpact: { count: makeCount(), findMany: makeFind() },
  position: { count: makeCount(), findMany: makeFind() },
  learningStreak: {
    count: makeCount(),
    findMany: makeFind(),
    findUnique: jest.fn().mockResolvedValue(null),
  },
  engagementSurvey: { findMany: makeFind() },
  surveyResponse: { count: makeCount() },
  $queryRaw: jest.fn().mockResolvedValue([]),
};

const fallbackModel = () => ({
  findMany: makeFind(),
  findUnique: jest.fn().mockResolvedValue(null),
  findFirst: jest.fn().mockResolvedValue(null),
  create: jest.fn().mockResolvedValue({}),
  update: jest.fn().mockResolvedValue({}),
  count: makeCount(),
  groupBy: makeGroupBy(),
  aggregate: makeAgg(),
  upsert: jest.fn().mockResolvedValue({}),
});

const mockPrismaProxy: any = new Proxy(mockPrisma, {
  get(target, prop) {
    // O serviço usa this.prisma.db para a réplica; devolve o próprio mock.
    if (prop === 'db') return mockPrismaProxy;
    const val = target[prop];
    return val !== undefined ? val : fallbackModel();
  },
});

describe('AnalyticsService (additional)', () => {
  let service: AnalyticsService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [AnalyticsService, { provide: PrismaService, useValue: mockPrismaProxy }],
    }).compile();
    service = module.get<AnalyticsService>(AnalyticsService);
  });

  // ─── getOrganizationOverview ──────────────────────────────────

  describe('getOrganizationOverview', () => {
    it('deve retornar visão geral da organização', async () => {
      mockPrisma.user.count.mockResolvedValue(600);
      mockPrisma.course.count.mockResolvedValue(50);
      mockPrisma.enrollment.count.mockResolvedValue(300);
      mockPrisma.badgeAward.count.mockResolvedValue(150);
      const result = await service.getOrganizationOverview();
      expect(result).toBeDefined();
      expect(result).toHaveProperty('users');
      expect(result).toHaveProperty('enrollments');
    });

    it('deve retornar taxas zero quando não há dados', async () => {
      mockPrisma.user.count.mockResolvedValue(0);
      mockPrisma.enrollment.count.mockResolvedValue(0);
      const result = await service.getOrganizationOverview();
      expect(result).toBeDefined();
      // completionRate is nested inside enrollments
      expect(
        (result as any).enrollments?.completionRate ?? (result as any).completionRate ?? 0,
      ).toBe(0);
    });
  });

  // ─── getLearningAnalytics ─────────────────────────────────────

  describe('getLearningAnalytics', () => {
    it('deve retornar analytics de aprendizagem', async () => {
      mockPrisma.enrollment.count.mockResolvedValue(100);
      mockPrisma.certificate.count.mockResolvedValue(50);
      const result = await service.getLearningAnalytics({});
      expect(result).toBeDefined();
    });

    it('deve filtrar por período', async () => {
      const result = await service.getLearningAnalytics({ period: '30d' as any });
      expect(result).toBeDefined();
    });

    it('deve filtrar por departamento e curso', async () => {
      const result = await service.getLearningAnalytics({ departmentId: 1, courseId: 1 });
      expect(result).toBeDefined();
    });
  });

  // ─── getEngagementMetrics ─────────────────────────────────────

  describe('getEngagementMetrics', () => {
    it('deve retornar métricas de engagement dos utilizadores', async () => {
      mockPrisma.user.count.mockResolvedValue(600);
      mockPrisma.enrollment.count.mockResolvedValue(300);
      const result = await service.getEngagementMetrics({});
      expect(result).toBeDefined();
    });
  });

  // ─── getCoursePerformance ─────────────────────────────────────

  describe('getCoursePerformance', () => {
    it('deve retornar analytics dos cursos', async () => {
      mockPrisma.course.findMany.mockResolvedValue([
        { id: 1, title: 'TS', _count: { enrollments: 50 }, enrollments: [] },
      ]);
      const result = await service.getCoursePerformance();
      expect(result).toBeDefined();
    });
  });

  // ─── getDepartmentAnalytics ───────────────────────────────────

  describe('getDepartmentAnalytics', () => {
    it('deve retornar analytics por departamento', async () => {
      mockPrisma.department.findMany.mockResolvedValue([
        { id: 1, name: 'TI', users: [{ id: 1 }], _count: { users: 30 } },
      ]);
      const result = await service.getDepartmentAnalytics(1);
      expect(result).toBeDefined();
    });
  });

  // ─── getPeopleAnalytics ───────────────────────────────────────

  describe('getPeopleAnalytics', () => {
    it('deve retornar analytics de performance', async () => {
      mockPrisma.performanceReview.count.mockResolvedValue(100);
      mockPrisma.performanceReview.aggregate.mockResolvedValue({
        _avg: { score: 4.2 },
        _sum: {},
        _count: {},
      });
      const result = await service.getPeopleAnalytics({});
      expect(result).toBeDefined();
    });
  });

  // ─── getCompetencyGapAnalytics ────────────────────────────────

  describe('getCompetencyGapAnalytics', () => {
    it('deve retornar analytics de competências', async () => {
      const result = await service.getCompetencyGapAnalytics({});
      expect(result).toBeDefined();
    });
  });

  // ─── getRiskAlerts ────────────────────────────────────────────

  describe('getRiskAlerts', () => {
    it('deve retornar insights preditivos', async () => {
      mockPrisma.enrollment.count.mockResolvedValue(500);
      mockPrisma.certificate.count.mockResolvedValue(350);
      const result = await service.getRiskAlerts({});
      expect(result).toBeDefined();
    });
  });
});
