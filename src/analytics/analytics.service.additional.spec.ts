import { Test, TestingModule } from '@nestjs/testing';
import { AnalyticsService } from './analytics.service';
import { PrismaService } from '../prisma/prisma.service';

const mockPrisma: any = {
  user: { count: jest.fn().mockResolvedValue(0), findMany: jest.fn().mockResolvedValue([]) },
  course: { count: jest.fn().mockResolvedValue(0), findMany: jest.fn().mockResolvedValue([]) },
  enrollment: {
    count: jest.fn().mockResolvedValue(0),
    findMany: jest.fn().mockResolvedValue([]),
    groupBy: jest.fn().mockResolvedValue([]),
    aggregate: jest.fn().mockResolvedValue({ _avg: { progressPercent: 0 } }),
  },
  certificate: { count: jest.fn().mockResolvedValue(0) },
  userPoints: { aggregate: jest.fn().mockResolvedValue({ _sum: { points: 0 } }) },
  badgeAward: { count: jest.fn().mockResolvedValue(0) },
  learningPath: { count: jest.fn().mockResolvedValue(0) },
  developmentPlan: { count: jest.fn().mockResolvedValue(0) },
  performanceReview: {
    aggregate: jest.fn().mockResolvedValue({ _avg: { score: null } }),
    count: jest.fn().mockResolvedValue(0),
  },
  department: { findMany: jest.fn().mockResolvedValue([]) },
  lessonProgress: {
    count: jest.fn().mockResolvedValue(0),
    findMany: jest.fn().mockResolvedValue([]),
  },
  attendanceRecord: { count: jest.fn().mockResolvedValue(0) },
  notificationLog: { count: jest.fn().mockResolvedValue(0) },
};

describe('AnalyticsService (additional)', () => {
  let service: AnalyticsService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [AnalyticsService, { provide: PrismaService, useValue: mockPrisma }],
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
      expect(result).toHaveProperty('totalUsers');
      expect(result).toHaveProperty('completionRate');
    });

    it('deve retornar taxas zero quando não há dados', async () => {
      mockPrisma.user.count.mockResolvedValue(0);
      mockPrisma.enrollment.count.mockResolvedValue(0);
      const result = await service.getOrganizationOverview();
      expect(result).toBeDefined();
      expect(result.completionRate).toBe(0);
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

  // ─── getUserEngagement ────────────────────────────────────────

  describe('getUserEngagement', () => {
    it('deve retornar métricas de engagement dos utilizadores', async () => {
      mockPrisma.user.count.mockResolvedValue(600);
      mockPrisma.enrollment.count.mockResolvedValue(300);
      const result = await service.getUserEngagement({});
      expect(result).toBeDefined();
    });
  });

  // ─── getCourseAnalytics ───────────────────────────────────────

  describe('getCourseAnalytics', () => {
    it('deve retornar analytics dos cursos', async () => {
      mockPrisma.course.findMany.mockResolvedValue([
        { id: 1, title: 'TS', _count: { enrollments: 50 }, enrollments: [] },
      ]);
      const result = await service.getCourseAnalytics({});
      expect(result).toBeDefined();
    });
  });

  // ─── getDepartmentAnalytics ───────────────────────────────────

  describe('getDepartmentAnalytics', () => {
    it('deve retornar analytics por departamento', async () => {
      mockPrisma.department.findMany.mockResolvedValue([
        { id: 1, name: 'TI', users: [{ id: 1 }], _count: { users: 30 } },
      ]);
      const result = await service.getDepartmentAnalytics({});
      expect(result).toBeDefined();
    });
  });

  // ─── getPerformanceAnalytics ──────────────────────────────────

  describe('getPerformanceAnalytics', () => {
    it('deve retornar analytics de performance', async () => {
      mockPrisma.performanceReview.count.mockResolvedValue(100);
      mockPrisma.performanceReview.aggregate.mockResolvedValue({ _avg: { score: 4.2 } });
      const result = await service.getPerformanceAnalytics({});
      expect(result).toBeDefined();
    });
  });

  // ─── getSkillsAnalytics ───────────────────────────────────────

  describe('getSkillsAnalytics', () => {
    it('deve retornar analytics de competências', async () => {
      const result = await service.getSkillsAnalytics({});
      expect(result).toBeDefined();
    });
  });

  // ─── getPredictiveInsights ────────────────────────────────────

  describe('getPredictiveInsights', () => {
    it('deve retornar insights preditivos', async () => {
      mockPrisma.enrollment.count.mockResolvedValue(500);
      mockPrisma.certificate.count.mockResolvedValue(350);
      const result = await service.getPredictiveInsights({});
      expect(result).toBeDefined();
    });
  });
});
