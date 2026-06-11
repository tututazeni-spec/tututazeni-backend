import { Test, TestingModule } from '@nestjs/testing';
import { HistoryService } from './history.service';
import { PrismaService } from '../prisma/prisma.service';

const mockPrisma: any = {
  auditLog: {
    findMany: jest.fn().mockResolvedValue([]),
    create: jest.fn().mockResolvedValue({ id: 1 }),
    count: jest.fn().mockResolvedValue(0),
    groupBy: jest.fn().mockResolvedValue([]),
  },
  historyRecord: {
    findMany: jest.fn().mockResolvedValue([]),
    create: jest.fn().mockResolvedValue({ id: 1 }),
    count: jest.fn().mockResolvedValue(0),
  },
  enrollment: { findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0) },
  certificate: { findMany: jest.fn().mockResolvedValue([]) },
  performanceReview: { findMany: jest.fn().mockResolvedValue([]) },
  developmentPlan: { findMany: jest.fn().mockResolvedValue([]) },
  badgeAward: { findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0) },
  userPoints: { findUnique: jest.fn().mockResolvedValue({ points: 100 }) },
  user: {
    findUnique: jest.fn().mockResolvedValue({ id: 1, fullName: 'Test' }),
    findMany: jest.fn().mockResolvedValue([]),
  },
  avatarSession: { findMany: jest.fn().mockResolvedValue([]) },
};

describe('HistoryService', () => {
  let service: HistoryService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [HistoryService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();
    service = module.get<HistoryService>(HistoryService);
  });

  describe('findAll', () => {
    it('deve retornar histórico paginado', async () => {
      const result = await service.findAll({ page: 1, limit: 20 });
      expect(result).toBeDefined();
    });
  });

  describe('getUserActivity', () => {
    it('deve retornar actividade do utilizador', async () => {
      const result = await service.getUserActivity(1);
      expect(result).toBeDefined();
    });
  });

  describe('getEntityHistory', () => {
    it('deve retornar histórico de entidade', async () => {
      const result = await service.getEntityHistory('User', 1);
      expect(result).toBeDefined();
    });
  });

  describe('createEvent', () => {
    it('deve criar evento', async () => {
      mockPrisma.auditLog.create.mockResolvedValue({
        id: 1,
        userId: 1,
        action: 'COURSE_COMPLETED',
        entity: 'Enrollment',
        entityId: 1,
        timestamp: new Date(),
        changes: null,
        reason: null,
      });
      const result = await service.createEvent({
        userId: 1,
        action: 'COURSE_COMPLETED',
        entity: 'Enrollment',
        entityId: 1,
        category: 'LEARNING' as any,
        title: 'Completou curso',
        description: 'Completou o curso NestJS',
      } as any);
      expect(result).toBeDefined();
    });
  });

  describe('getUserMilestones', () => {
    it('deve retornar milestones do utilizador', async () => {
      const result = await service.getUserMilestones(1);
      expect(result).toBeDefined();
    });
  });

  describe('getUserActivityStats', () => {
    it('deve retornar estatísticas de actividade', async () => {
      const result = await service.getUserActivityStats(1);
      expect(result).toBeDefined();
    });
  });

  // ─── findAll ──────────────────────────────────────────────────────────────

  describe('findAll', () => {
    it('deve retornar histórico paginado', async () => {
      const result = await service.findAll({ page: 1, limit: 20 });
      expect(result).toBeDefined();
    });

    it('deve filtrar por userId', async () => {
      const result = await service.findAll({ userId: 1, page: 1, limit: 10 });
      expect(result).toBeDefined();
    });
  });

  // ─── getUserActivity ──────────────────────────────────────────────────────

  describe('getUserActivity', () => {
    it('deve retornar actividade recente do utilizador', async () => {
      const result = await service.getUserActivity(1, 50);
      expect(result).toBeDefined();
    });
  });

  // ─── getEntityHistory ─────────────────────────────────────────────────────

  describe('getEntityHistory', () => {
    it('deve retornar histórico de uma entidade', async () => {
      const result = await service.getEntityHistory('Course', 1);
      expect(result).toBeDefined();
    });
  });

  // ─── getUserTimeline ──────────────────────────────────────────────────────

  describe('getUserTimeline', () => {
    it('deve retornar timeline do utilizador', async () => {
      const result = await service.getUserTimeline(1, {});
      expect(result).toBeDefined();
    });
  });

  // ─── getTeamTimeline ──────────────────────────────────────────────────────

  describe('getTeamTimeline', () => {
    it('deve retornar timeline da equipa', async () => {
      const result = await service.getTeamTimeline(1, {});
      expect(result).toBeDefined();
    });
  });

  // ─── getUpcomingEvents ────────────────────────────────────────────────────

  describe('getUpcomingEvents', () => {
    it('deve retornar eventos futuros', async () => {
      const result = await service.getUpcomingEvents();
      expect(result).toBeDefined();
    });
  });

  // ─── getAuditStats ────────────────────────────────────────────────────────

  describe('getAuditStats', () => {
    it('deve retornar estatísticas de auditoria', async () => {
      const result = await service.getAuditStats('2024-01-01', '2024-12-31');
      expect(result).toBeDefined();
    });
  });
});
