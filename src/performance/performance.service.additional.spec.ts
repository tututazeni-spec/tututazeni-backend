import { Test, TestingModule } from '@nestjs/testing';
import {
  NotFoundException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { PerformanceService } from './performance.service';
import { PrismaService } from '../prisma/prisma.service';

const mockPrisma: any = {
  performanceCycle: {
    findMany: jest.fn().mockResolvedValue([]),
    findFirst: jest.fn().mockResolvedValue(null),
    findUnique: jest.fn().mockResolvedValue(null),
    create: jest.fn(),
    update: jest.fn(),
  },
  performanceReview: {
    findMany: jest.fn().mockResolvedValue([]),
    findFirst: jest.fn().mockResolvedValue(null),
    findUnique: jest.fn().mockResolvedValue(null),
    create: jest.fn(),
    update: jest.fn(),
    count: jest.fn().mockResolvedValue(0),
    aggregate: jest.fn().mockResolvedValue({ _avg: { score: null } }),
  },
  performanceGoal: {
    findMany: jest.fn().mockResolvedValue([]),
    findFirst: jest.fn().mockResolvedValue(null),
    findUnique: jest.fn().mockResolvedValue(null),
    create: jest.fn(),
    update: jest.fn(),
  },
  performanceFeedback: {
    findMany: jest.fn().mockResolvedValue([]),
    create: jest.fn(),
  },
  user: {
    findUnique: jest.fn().mockResolvedValue(null),
    findMany: jest.fn().mockResolvedValue([]),
  },
  userCompetency: {
    findMany: jest.fn().mockResolvedValue([]),
    upsert: jest.fn(),
  },
  notificationLog: { create: jest.fn().mockResolvedValue({}) },
  auditLog: { create: jest.fn().mockResolvedValue({}) },
};

const baseCycle = {
  id: 1, name: 'Ciclo 2026-Q1', status: 'PLANNED',
  startDate: new Date('2026-01-01'), endDate: new Date('2026-03-31'),
  goalsWeight: 40, competenciesWeight: 40, behaviorsWeight: 20,
  _count: { reviews: 0 },
};

const baseReview = {
  id: 1, userId: 2, managerId: 1, cycleId: 1, status: 'DRAFT',
  score: null, feedback: null, createdAt: new Date(),
};

describe('PerformanceService (additional)', () => {
  let service: PerformanceService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [PerformanceService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();
    service = module.get<PerformanceService>(PerformanceService);
  });

  // ─── createCycle ──────────────────────────────────────────────

  describe('createCycle', () => {
    it('deve criar ciclo com pesos que somam 100', async () => {
      mockPrisma.performanceCycle.create.mockResolvedValue(baseCycle);
      const result = await service.createCycle({
        name: 'Ciclo 2026-Q1', type: 'ANNUAL' as any,
        startDate: '2026-01-01', endDate: '2026-03-31',
        goalsWeight: 40, competenciesWeight: 40, behaviorsWeight: 20,
      });
      expect(result).toBeDefined();
    });

    it('deve lançar BadRequestException se soma dos pesos != 100', async () => {
      await expect(service.createCycle({
        name: 'Inválido', type: 'ANNUAL' as any,
        startDate: '2026-01-01', endDate: '2026-12-31',
        goalsWeight: 50, competenciesWeight: 30, behaviorsWeight: 30,
      })).rejects.toThrow(BadRequestException);
    });

    it('deve usar defaults 40/40/20 quando pesos não fornecidos', async () => {
      mockPrisma.performanceCycle.create.mockResolvedValue(baseCycle);
      await service.createCycle({
        name: 'Ciclo default', type: 'ANNUAL' as any,
        startDate: '2026-01-01', endDate: '2026-12-31',
      });
      expect(mockPrisma.performanceCycle.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ goalsWeight: 40, competenciesWeight: 40, behaviorsWeight: 20 }),
        }),
      );
    });
  });

  // ─── getCycles ────────────────────────────────────────────────

  describe('getCycles', () => {
    it('deve retornar todos os ciclos', async () => {
      mockPrisma.performanceCycle.findMany.mockResolvedValue([baseCycle]);
      const result = await service.getCycles();
      expect(result).toHaveLength(1);
    });
  });

  // ─── getCurrentCycle ──────────────────────────────────────────

  describe('getCurrentCycle', () => {
    it('deve retornar ciclo activo', async () => {
      mockPrisma.performanceCycle.findFirst.mockResolvedValue({ ...baseCycle, status: 'ACTIVE' });
      const result = await service.getCurrentCycle();
      expect(result?.status).toBe('ACTIVE');
    });

    it('deve retornar null se sem ciclo activo', async () => {
      mockPrisma.performanceCycle.findFirst.mockResolvedValue(null);
      const result = await service.getCurrentCycle();
      expect(result).toBeNull();
    });
  });

  // ─── activateCycle ────────────────────────────────────────────

  describe('activateCycle', () => {
    it('deve activar ciclo PLANNED', async () => {
      mockPrisma.performanceCycle.findUnique.mockResolvedValue(baseCycle);
      mockPrisma.performanceCycle.update.mockResolvedValue({ ...baseCycle, status: 'ACTIVE' });
      const result = await service.activateCycle(1);
      expect(result).toBeDefined();
    });

    it('deve lançar NotFoundException se ciclo não existe', async () => {
      mockPrisma.performanceCycle.findUnique.mockResolvedValue(null);
      await expect(service.activateCycle(99)).rejects.toThrow(NotFoundException);
    });
  });

  // ─── createReview ─────────────────────────────────────────────

  describe('createReview', () => {
    it('deve criar avaliação de performance', async () => {
      mockPrisma.performanceCycle.findUnique.mockResolvedValue({ ...baseCycle, status: 'ACTIVE' });
      mockPrisma.performanceReview.findFirst.mockResolvedValue(null);
      mockPrisma.performanceReview.create.mockResolvedValue(baseReview);
      const result = await service.createReview({ userId: 2, cycleId: 1, type: 'MANAGER' as any }, 1);
      expect(result).toBeDefined();
    });

    it('deve lançar NotFoundException se ciclo não existe', async () => {
      mockPrisma.performanceCycle.findUnique.mockResolvedValue(null);
      await expect(service.createReview({ userId: 2, cycleId: 99, type: 'MANAGER' as any }, 1)).rejects.toThrow(NotFoundException);
    });

    it('deve lançar BadRequestException se ciclo não está ACTIVE', async () => {
      mockPrisma.performanceCycle.findUnique.mockResolvedValue({ ...baseCycle, status: 'PLANNED' });
      await expect(service.createReview({ userId: 2, cycleId: 1, type: 'MANAGER' as any }, 1)).rejects.toThrow(BadRequestException);
    });

    it('deve lançar ConflictException se avaliação já existe', async () => {
      mockPrisma.performanceCycle.findUnique.mockResolvedValue({ ...baseCycle, status: 'ACTIVE' });
      mockPrisma.performanceReview.findFirst.mockResolvedValue(baseReview);
      await expect(service.createReview({ userId: 2, cycleId: 1, type: 'MANAGER' as any }, 1)).rejects.toThrow(ConflictException);
    });
  });

  // ─── getMyReviews ─────────────────────────────────────────────

  describe('getMyReviews', () => {
    it('deve retornar avaliações do utilizador', async () => {
      mockPrisma.performanceReview.findMany.mockResolvedValue([baseReview]);
      const result = await service.getMyReviews(1, {});
      expect(result).toBeDefined();
    });
  });

  // ─── getReview ────────────────────────────────────────────────

  describe('getReview', () => {
    it('deve retornar avaliação por id', async () => {
      mockPrisma.performanceReview.findUnique.mockResolvedValue(baseReview);
      const result = await service.getReview(1, 1);
      expect(result).toBeDefined();
    });

    it('deve lançar NotFoundException se não encontrada', async () => {
      mockPrisma.performanceReview.findUnique.mockResolvedValue(null);
      await expect(service.getReview(99, 1)).rejects.toThrow(NotFoundException);
    });
  });

  // ─── updateReview ─────────────────────────────────────────────

  describe('updateReview', () => {
    it('deve actualizar avaliação em DRAFT', async () => {
      mockPrisma.performanceReview.findUnique.mockResolvedValue({ ...baseReview, managerId: 1 });
      mockPrisma.performanceReview.update.mockResolvedValue({ ...baseReview, score: 4.0 });
      const result = await service.updateReview(1, { score: 4.0 } as any, 1);
      expect(result).toBeDefined();
    });

    it('deve lançar ForbiddenException se utilizador não tem permissão', async () => {
      mockPrisma.performanceReview.findUnique.mockResolvedValue({ ...baseReview, userId: 2, managerId: 3 });
      await expect(service.updateReview(1, { score: 4.0 } as any, 99)).rejects.toThrow(ForbiddenException);
    });
  });

  // ─── submitReview ─────────────────────────────────────────────

  describe('submitReview', () => {
    it('deve submeter avaliação', async () => {
      mockPrisma.performanceReview.findUnique.mockResolvedValue({ ...baseReview, managerId: 1, score: 4.0 });
      mockPrisma.performanceReview.update.mockResolvedValue({ ...baseReview, status: 'SUBMITTED' });
      mockPrisma.notificationLog.create.mockResolvedValue({});
      const result = await service.submitReview(1, { score: 4.0, feedback: 'Bom desempenho' }, 1);
      expect(result).toBeDefined();
    });
  });

  // ─── createGoal ───────────────────────────────────────────────

  describe('createGoal', () => {
    it('deve criar objectivo de performance', async () => {
      mockPrisma.performanceCycle.findUnique.mockResolvedValue({ ...baseCycle, status: 'ACTIVE' });
      mockPrisma.performanceGoal.create.mockResolvedValue({ id: 1, userId: 2, cycleId: 1 });
      const result = await service.createGoal({ userId: 2, cycleId: 1, title: 'Obj 1', weight: 50 } as any, 1);
      expect(result).toBeDefined();
    });
  });

  // ─── updateGoalProgress ───────────────────────────────────────

  describe('updateGoalProgress', () => {
    it('deve actualizar progresso do objectivo', async () => {
      mockPrisma.performanceGoal.findFirst.mockResolvedValue({ id: 1, userId: 1 });
      mockPrisma.performanceGoal.update.mockResolvedValue({ id: 1, progress: 75 });
      const result = await service.updateGoalProgress(1, 1, { progress: 75, justification: 'OK' });
      expect(result).toBeDefined();
    });
  });

  // ─── createFeedback ───────────────────────────────────────────

  describe('createFeedback', () => {
    it('deve criar feedback de performance', async () => {
      mockPrisma.performanceFeedback.create.mockResolvedValue({ id: 1, fromId: 1, toId: 2 });
      const result = await service.createFeedback({ toId: 2, message: 'Excelente trabalho', type: 'POSITIVE' as any }, 1);
      expect(result).toBeDefined();
    });
  });

  // ─── getTeamReviews ───────────────────────────────────────────

  describe('getTeamReviews', () => {
    it('deve retornar avaliações da equipa do gestor', async () => {
      mockPrisma.user.findMany.mockResolvedValue([{ id: 2 }, { id: 3 }]);
      mockPrisma.performanceReview.findMany.mockResolvedValue([]);
      const result = await service.getTeamReviews(1, {});
      expect(result).toBeDefined();
    });
  });

  // ─── getAnalytics ─────────────────────────────────────────────

  describe('getAnalytics', () => {
    it('deve retornar analytics de performance', async () => {
      const result = await service.getAnalytics({});
      expect(result).toBeDefined();
    });
  });
});
