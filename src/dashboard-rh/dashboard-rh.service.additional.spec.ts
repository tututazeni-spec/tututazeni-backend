import { Test, TestingModule } from '@nestjs/testing';
import { DashboardRhService } from './dashboard-rh.service';
import { PrismaService } from '../prisma/prisma.service';
import { CacheService } from '../cache/cache.service';

const fallbackModel = () => ({
  findMany: jest.fn().mockResolvedValue([]),
  findUnique: jest.fn().mockResolvedValue(null),
  findFirst: jest.fn().mockResolvedValue(null),
  create: jest.fn().mockResolvedValue({}),
  update: jest.fn().mockResolvedValue({}),
  count: jest.fn().mockResolvedValue(0),
  groupBy: jest.fn().mockResolvedValue([]),
  aggregate: jest.fn().mockResolvedValue({ _avg: {}, _sum: {}, _count: {} }),
  upsert: jest.fn().mockResolvedValue({}),
});

const mockPrismaBase: any = {
  user: {
    count: jest.fn().mockResolvedValue(0),
    findMany: jest.fn().mockResolvedValue([]),
    groupBy: jest.fn().mockResolvedValue([]),
  },
  department: { findMany: jest.fn().mockResolvedValue([]) },
  enrollment: {
    count: jest.fn().mockResolvedValue(0),
    findMany: jest.fn().mockResolvedValue([]),
    aggregate: jest.fn().mockResolvedValue({ _avg: { progressPercent: 0 } }),
    groupBy: jest.fn().mockResolvedValue([]),
  },
  certificate: { count: jest.fn().mockResolvedValue(0) },
  course: { count: jest.fn().mockResolvedValue(0), findMany: jest.fn().mockResolvedValue([]) },
  notificationLog: { count: jest.fn().mockResolvedValue(0) },
  auditLog: { count: jest.fn().mockResolvedValue(0), findMany: jest.fn().mockResolvedValue([]) },
  performanceReview: {
    count: jest.fn().mockResolvedValue(0),
    findMany: jest.fn().mockResolvedValue([]),
    aggregate: jest.fn().mockResolvedValue({ _avg: { score: null } }),
    groupBy: jest.fn().mockResolvedValue([]),
  },
  attendanceRecord: {
    count: jest.fn().mockResolvedValue(0),
    aggregate: jest.fn().mockResolvedValue({ _avg: { hoursWorked: 0 } }),
    groupBy: jest.fn().mockResolvedValue([]),
  },
  notificationChannel: { findMany: jest.fn().mockResolvedValue([]) },
  leaveRequest: { count: jest.fn().mockResolvedValue(0), groupBy: jest.fn().mockResolvedValue([]) },
  position: { findMany: jest.fn().mockResolvedValue([]) },
  userCompetency: {
    count: jest.fn().mockResolvedValue(0),
    findMany: jest.fn().mockResolvedValue([]),
  },
  nineBoxPlacement: {
    count: jest.fn().mockResolvedValue(0),
    findMany: jest.fn().mockResolvedValue([]),
  },
};

const mockPrisma = new Proxy(mockPrismaBase, {
  get(target, prop) {
    if (prop === 'db') return mockPrisma; // read-replica client → mesmo mock
    const val = target[prop];
    return val !== undefined ? val : fallbackModel();
  },
});

describe('DashboardRhService (additional)', () => {
  let service: DashboardRhService;

  beforeEach(async () => {
    jest.clearAllMocks();
    Object.defineProperty(mockPrisma, 'read', {
      get() {
        return mockPrisma;
      },
      configurable: true,
    });
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DashboardRhService,
        { provide: PrismaService, useValue: mockPrisma },
        {
          provide: CacheService,
          useValue: { getOrSet: jest.fn((_k: string, _ttl: number, fn: () => any) => fn()) },
        },
      ],
    }).compile();
    service = module.get<DashboardRhService>(DashboardRhService);
  });

  // ─── getFullRhDashboard ───────────────────────────────────────

  describe('getFullRhDashboard', () => {
    it('deve retornar dashboard completo de RH', async () => {
      mockPrismaBase.user.count.mockResolvedValue(600);
      mockPrismaBase.department.findMany.mockResolvedValue([
        { id: 1, name: 'TI', _count: { users: 50 } },
      ]);
      mockPrismaBase.enrollment.count.mockResolvedValue(300);
      mockPrismaBase.certificate.count.mockResolvedValue(150);
      const result = await service.getFullRhDashboard();
      expect(result).toBeDefined();
    });

    it('deve funcionar com valores zero', async () => {
      mockPrismaBase.user.count.mockResolvedValue(0);
      mockPrismaBase.department.findMany.mockResolvedValue([]);
      const result = await service.getFullRhDashboard();
      expect(result).toBeDefined();
    });
  });

  // ─── getHeadcountPanel ────────────────────────────────────────

  describe('getHeadcountPanel', () => {
    it('deve retornar painel de headcount', async () => {
      mockPrismaBase.user.count.mockResolvedValue(600);
      const result = await service.getHeadcountPanel();
      expect(result).toBeDefined();
    });

    it('deve filtrar por departamento', async () => {
      mockPrismaBase.user.count.mockResolvedValue(50);
      const result = await service.getHeadcountPanel(1);
      expect(result).toBeDefined();
    });
  });

  // ─── getTurnoverPanel ────────────────────────────────────────

  describe('getTurnoverPanel', () => {
    it('deve retornar painel de turnover', async () => {
      const result = await service.getTurnoverPanel(12);
      expect(result).toBeDefined();
    });
  });

  // ─── getEngagementPanel ───────────────────────────────────────

  describe('getEngagementPanel', () => {
    it('deve retornar painel de engagement', async () => {
      mockPrismaBase.enrollment.count.mockResolvedValue(500);
      mockPrismaBase.certificate.count.mockResolvedValue(200);
      const result = await service.getEngagementPanel();
      expect(result).toBeDefined();
    });
  });

  // ─── getAttendancePanel ────────────────────────────────────────

  describe('getAttendancePanel', () => {
    it('deve retornar painel de presenças', async () => {
      mockPrismaBase.attendanceRecord.count.mockResolvedValue(1200);
      const result = await service.getAttendancePanel();
      expect(result).toBeDefined();
    });
  });

  // ─── getTrainingPanel ────────────────────────────────────────

  describe('getTrainingPanel', () => {
    it('deve retornar painel de formação', async () => {
      mockPrismaBase.course.findMany.mockResolvedValue([
        { id: 1, title: 'TypeScript', _count: { enrollments: 150 } },
      ]);
      const result = await service.getTrainingPanel();
      expect(result).toBeDefined();
    });
  });

  // ─── getSkillsPanel ───────────────────────────────────────────

  describe('getSkillsPanel', () => {
    it('deve retornar painel de competências', async () => {
      const result = await service.getSkillsPanel();
      expect(result).toBeDefined();
    });
  });

  // ─── getBirthdaysThisMonth ────────────────────────────────────

  describe('getBirthdaysThisMonth', () => {
    it('deve retornar aniversários do mês', async () => {
      mockPrismaBase.user.findMany.mockResolvedValue([]);
      const result = await service.getBirthdaysThisMonth();
      expect(result).toBeDefined();
    });
  });
});
