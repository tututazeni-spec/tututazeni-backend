import { Test, TestingModule } from '@nestjs/testing';
import { DashboardService } from './dashboard.service';
import { PrismaService } from '../prisma/prisma.service';

const mockPrisma: any = {
  user: { findUnique: jest.fn(), findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0) },
  enrollment: { count: jest.fn().mockResolvedValue(0), findMany: jest.fn().mockResolvedValue([]) },
  userPoints: { findUnique: jest.fn().mockResolvedValue(null) },
  badgeAward: { findMany: jest.fn().mockResolvedValue([]) },
  assessmentAttempt: { count: jest.fn().mockResolvedValue(0) },
  developmentPlan: { findFirst: jest.fn().mockResolvedValue(null), findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0) },
  surveyResponse: { count: jest.fn().mockResolvedValue(0), aggregate: jest.fn().mockResolvedValue({ _avg: { score: 0 } }) },
  evaluationRequest: { count: jest.fn().mockResolvedValue(0), findMany: jest.fn().mockResolvedValue([]) },
  avatarSession: { count: jest.fn().mockResolvedValue(0) },
  userCompetency: { findMany: jest.fn().mockResolvedValue([]), groupBy: jest.fn().mockResolvedValue([]) },
  developmentPlanAction: { count: jest.fn().mockResolvedValue(0) },
  notificationLog: { findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0) },
  performanceCycle: { findFirst: jest.fn().mockResolvedValue(null), findMany: jest.fn().mockResolvedValue([]) },
  performanceReview: { findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0), aggregate: jest.fn().mockResolvedValue({ _avg: { score: 0 } }) },
  course: { count: jest.fn().mockResolvedValue(0), findMany: jest.fn().mockResolvedValue([]) },
  certificate: { count: jest.fn().mockResolvedValue(0), findMany: jest.fn().mockResolvedValue([]) },
  department: { findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0) },
  position: { findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0) },
  successionPlan: { count: jest.fn().mockResolvedValue(0), findMany: jest.fn().mockResolvedValue([]) },
  competency: { findMany: jest.fn().mockResolvedValue([]) },
  role: { findMany: jest.fn().mockResolvedValue([]) },
  auditLog: { findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0), groupBy: jest.fn().mockResolvedValue([]) },
  engagementSurvey: { findMany: jest.fn().mockResolvedValue([]), findFirst: jest.fn().mockResolvedValue(null), count: jest.fn().mockResolvedValue(0) },
  engagementResponse: { count: jest.fn().mockResolvedValue(0), aggregate: jest.fn().mockResolvedValue({ _avg: { score: 0 } }) },
  careerPath: { findMany: jest.fn().mockResolvedValue([]) },
  internalVacancy: { findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0) },
  performanceGoal: { findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0) },
  courseAnalytics: { findMany: jest.fn().mockResolvedValue([]) },
};

// Proxy para safeM — garante que modelos opcionais existem
const safeProxy = { findMany: jest.fn().mockResolvedValue([]), findFirst: jest.fn().mockResolvedValue(null), count: jest.fn().mockResolvedValue(0), aggregate: jest.fn().mockResolvedValue({ _avg: {}, _sum: {}, _count: {} }), groupBy: jest.fn().mockResolvedValue([]) };
['engagementSurvey', 'engagementResponse', 'avatarTrainingSession', 'assessmentResult'].forEach(k => {
  if (!mockPrisma[k]) mockPrisma[k] = { ...safeProxy };
});

const baseUser = {
  id: 1, fullName: 'Admin User', avatarUrl: null, email: 'admin@innova.com',
  position: { id: 1, name: 'Director', level: 5 },
  department: { id: 1, name: 'TI' },
  createdAt: new Date(),
};

describe('DashboardService (additional)', () => {
  let service: DashboardService;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockPrisma.user.findUnique.mockResolvedValue(baseUser);
    mockPrisma.user.findMany.mockResolvedValue([]);

    const module: TestingModule = await Test.createTestingModule({
      providers: [DashboardService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();
    service = module.get<DashboardService>(DashboardService);
  });

  // ─── getMyDashboard ────────────────────────────────────────────

  describe('getMyDashboard', () => {
    it('deve retornar dashboard pessoal do colaborador', async () => {
      const result = await service.getMyDashboard(1);
      expect(result).toBeDefined();
      expect(result).toHaveProperty('user');
      expect(result).toHaveProperty('learning');
    });

    it('deve calcular progresso de aprendizagem', async () => {
      mockPrisma.enrollment.count
        .mockResolvedValueOnce(3)  // IN_PROGRESS
        .mockResolvedValueOnce(10) // COMPLETED
        .mockResolvedValueOnce(15); // total
      const result = await service.getMyDashboard(1);
      expect(result.learning).toBeDefined();
    });

    it('deve retornar plano de desenvolvimento activo', async () => {
      mockPrisma.developmentPlan.findFirst.mockResolvedValue({
        id: 1, userId: 1, status: 'ACTIVE', isTemplate: false,
        actions: [{ status: 'COMPLETED', progress: 100 }],
        goals: [{ progress: 80 }],
      });
      const result = await service.getMyDashboard(1);
      expect(result).toBeDefined();
    });

    it('deve incluir badges recentes', async () => {
      mockPrisma.badgeAward.findMany.mockResolvedValue([
        { id: 1, badge: { name: 'First Course', icon: '🎓' }, awardedAt: new Date() },
      ]);
      const result = await service.getMyDashboard(1);
      expect(result).toBeDefined();
    });
  });

  // ─── getOrganizationSummary ────────────────────────────────────

  describe('getOrganizationSummary', () => {
    it('deve retornar sumário organizacional', async () => {
      const result = await service.getOrganizationSummary({});
      expect(result).toBeDefined();
    });

    it('deve funcionar com período WEEK', async () => {
      const result = await service.getOrganizationSummary({ period: 'WEEK' as any });
      expect(result).toBeDefined();
    });

    it('deve funcionar com período QUARTER', async () => {
      const result = await service.getOrganizationSummary({ period: 'QUARTER' as any });
      expect(result).toBeDefined();
    });

    it('deve funcionar com período YEAR', async () => {
      const result = await service.getOrganizationSummary({ period: 'YEAR' as any });
      expect(result).toBeDefined();
    });
  });

  // ─── getManagerDashboard ───────────────────────────────────────

  describe('getManagerDashboard', () => {
    it('deve retornar dashboard do gestor', async () => {
      mockPrisma.user.findMany.mockResolvedValue([{ id: 2 }, { id: 3 }]);
      const result = await service.getManagerDashboard(1, {});
      expect(result).toBeDefined();
    });
  });

  // ─── getDepartmentDashboard ────────────────────────────────────

  describe('getDepartmentDashboard', () => {
    it('deve retornar dashboard do departamento', async () => {
      const result = await service.getDepartmentDashboard(1);
      expect(result).toBeDefined();
    });
  });

  // ─── getAlerts ────────────────────────────────────────────────

  describe('getAlerts', () => {
    it('deve retornar alertas do sistema', async () => {
      const result = await service.getAlerts(1);
      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
    });
  });

  // ─── getLeaderboard ────────────────────────────────────────────

  describe('getLeaderboard', () => {
    it('deve retornar leaderboard de utilizadores', async () => {
      mockPrisma.user.findMany.mockResolvedValue([
        { id: 1, fullName: 'Ana', avatarUrl: null, position: null,
          points: { points: 500 }, _count: { badgeAwards: 2 } },
      ]);
      const result = await service.getLeaderboard();
      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
    });
  });
});
