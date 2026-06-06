import { Test, TestingModule } from '@nestjs/testing';
import { DashboardRhService } from './dashboard-rh.service';
import { PrismaService } from '../prisma/prisma.service';

const makeCount = (n = 0) => jest.fn().mockResolvedValue(n);
const makeFind = (data: any[] = []) => jest.fn().mockResolvedValue(data);
const makeAgg = () => jest.fn().mockResolvedValue({ _avg: {}, _sum: {}, _count: {} });
const makeGroupBy = () => jest.fn().mockResolvedValue([]);

const mockPrisma = {
  user: {
    count: makeCount(100),
    findMany: makeFind(),
    groupBy: makeGroupBy(),
    aggregate: makeAgg(),
  },
  enrollment: {
    count: makeCount(50),
    findMany: makeFind(),
    groupBy: makeGroupBy(),
    aggregate: makeAgg(),
  },
  certificate: { count: makeCount(10), findMany: makeFind() },
  badgeAward: { count: makeCount(5), groupBy: makeGroupBy(), findMany: makeFind() },
  performanceReview: {
    count: makeCount(),
    findMany: makeFind(),
    aggregate: makeAgg(),
    groupBy: makeGroupBy(),
  },
  developmentPlan: { count: makeCount(), findMany: makeFind() },
  developmentPlanAction: { count: makeCount(), findMany: makeFind() },
  department: { findMany: makeFind(), count: makeCount() },
  position: { findMany: makeFind() },
  course: { count: makeCount(), findMany: makeFind() },
  engagementSurvey: { findMany: makeFind(), count: makeCount() },
  auditLog: { findMany: makeFind(), count: makeCount(), groupBy: makeGroupBy() },
  historyRecord: { findMany: makeFind(), count: makeCount() },
  avatarSession: { count: makeCount(), findMany: makeFind() },
  legacyEmployeeSkill: { findMany: makeFind(), count: makeCount() },
};

const mockPrismaProxy = new Proxy(mockPrisma, {
  get(target, prop) {
    if (prop === 'attendance')
      return { count: makeCount(), findMany: makeFind(), aggregate: makeAgg() };
    if (prop === 'leaveRequest')
      return { count: makeCount(), findMany: makeFind(), groupBy: makeGroupBy() };
    if (prop === 'surveyResponse') return { count: makeCount() };
    return (target as any)[prop];
  },
});

describe('DashboardRhService', () => {
  let service: DashboardRhService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [DashboardRhService, { provide: PrismaService, useValue: mockPrismaProxy }],
    }).compile();
    service = module.get<DashboardRhService>(DashboardRhService);
  });

  describe('getFullRhDashboard', () => {
    it('deve retornar dashboard RH completo', async () => {
      mockPrisma.user.count
        .mockResolvedValueOnce(100)
        .mockResolvedValueOnce(90)
        .mockResolvedValueOnce(5)
        .mockResolvedValueOnce(3);
      const result = await service.getFullRhDashboard();
      expect(result).toBeDefined();
    });
  });

  describe('getHeadcountPanel', () => {
    it('deve retornar painel de headcount', async () => {
      mockPrisma.user.count.mockResolvedValue(100);
      mockPrisma.department.findMany.mockResolvedValue([]);
      const result = await service.getHeadcountPanel();
      expect(result).toBeDefined();
    });
  });

  describe('getTurnoverPanel', () => {
    it('deve retornar painel de turnover', async () => {
      mockPrisma.user.count.mockResolvedValue(100);
      const result = await service.getTurnoverPanel();
      expect(result).toBeDefined();
    });
  });

  // ─── getHeadcountTrend ────────────────────────────────────────────────────

  describe('getHeadcountTrend', () => {
    it('deve retornar tendência de headcount', async () => {
      mockPrisma.user.count.mockResolvedValue(95);
      const result = await service.getHeadcountTrend(6);
      expect(result).toBeDefined();
    });
  });

  // ─── getEngagementPanel ───────────────────────────────────────────────────

  describe('getEngagementPanel', () => {
    it('deve retornar painel de engagement', async () => {
      mockPrisma.user.count.mockResolvedValue(100);
      const result = await service.getEngagementPanel();
      expect(result).toBeDefined();
    });
  });

  // ─── getPerformancePanel ──────────────────────────────────────────────────

  describe('getPerformancePanel', () => {
    it('deve retornar painel de performance', async () => {
      const result = await service.getPerformancePanel();
      expect(result).toBeDefined();
    });
  });

  // ─── getSkillsPanel ───────────────────────────────────────────────────────

  describe('getSkillsPanel', () => {
    it('deve retornar painel de competências', async () => {
      const result = await service.getSkillsPanel();
      expect(result).toBeDefined();
    });
  });

  // ─── getTrainingPanel ─────────────────────────────────────────────────────

  describe('getTrainingPanel', () => {
    it('deve retornar painel de formação', async () => {
      const result = await service.getTrainingPanel();
      expect(result).toBeDefined();
    });
  });

  // ─── getCompliancePanel ───────────────────────────────────────────────────

  describe('getCompliancePanel', () => {
    it('deve retornar painel de compliance', async () => {
      const result = await service.getCompliancePanel();
      expect(result).toBeDefined();
    });
  });

  // ─── getBirthdaysThisMonth ────────────────────────────────────────────────

  describe('getBirthdaysThisMonth', () => {
    it('deve retornar aniversários do mês', async () => {
      mockPrisma.user.findMany.mockResolvedValue([]);
      const result = await service.getBirthdaysThisMonth();
      expect(result).toBeDefined();
    });
  });

  // ─── getAnniversariesThisMonth ────────────────────────────────────────────

  describe('getAnniversariesThisMonth', () => {
    it('deve retornar aniversários de empresa do mês', async () => {
      mockPrisma.user.findMany.mockResolvedValue([]);
      const result = await service.getAnniversariesThisMonth();
      expect(result).toBeDefined();
    });
  });

  // ─── getAttendancePanel ───────────────────────────────────────────────────

  describe('getAttendancePanel', () => {
    it('deve retornar painel de presenças', async () => {
      const result = await service.getAttendancePanel();
      expect(result).toBeDefined();
    });
  });

  // ─── getTalentPipeline ────────────────────────────────────────────────────

  describe('getTalentPipeline', () => {
    it('deve retornar pipeline de talentos', async () => {
      mockPrisma.user.count.mockResolvedValue(50);
      const result = await service.getTalentPipeline();
      expect(result).toBeDefined();
    });
  });
});
