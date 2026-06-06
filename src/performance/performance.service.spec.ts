import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { PerformanceService } from './performance.service';
import { PrismaService } from '../prisma/prisma.service';

const mockPrisma = {
  performanceCycle: {
    findMany: jest.fn().mockResolvedValue([]),
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    count: jest.fn().mockResolvedValue(0),
  },
  performanceReview: {
    findMany: jest.fn().mockResolvedValue([]),
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    count: jest.fn().mockResolvedValue(0),
    updateMany: jest.fn().mockResolvedValue({ count: 0 }),
  },
  performanceGoal: {
    findMany: jest.fn().mockResolvedValue([]),
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    count: jest.fn().mockResolvedValue(0),
  },
  goalEvaluation: { create: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
  competencyEvaluation: {
    createMany: jest.fn().mockResolvedValue({ count: 0 }),
    findMany: jest.fn().mockResolvedValue([]),
  },
  calibrationLog: { create: jest.fn().mockResolvedValue({}) },
  nineBoxPlacement: { upsert: jest.fn().mockResolvedValue({}) },
  performanceDispute: { create: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
  user: { findMany: jest.fn().mockResolvedValue([]), findUnique: jest.fn() },
  notificationLog: {
    create: jest.fn().mockResolvedValue({}),
    createMany: jest.fn().mockResolvedValue({ count: 0 }),
  },
};

const baseCycle = {
  id: 1,
  name: 'Ciclo 2024',
  status: 'DRAFT',
  startDate: new Date(),
  endDate: new Date(),
  reviews: [],
  _count: { reviews: 0 },
};

describe('PerformanceService', () => {
  let service: PerformanceService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [PerformanceService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();
    service = module.get<PerformanceService>(PerformanceService);
  });

  describe('getCycles', () => {
    it('deve retornar ciclos de performance', async () => {
      mockPrisma.performanceCycle.findMany.mockResolvedValue([baseCycle]);
      const result = await service.getCycles();
      expect(result).toHaveLength(1);
    });
  });

  describe('createCycle', () => {
    it('deve criar ciclo de performance', async () => {
      mockPrisma.performanceCycle.create.mockResolvedValue(baseCycle);
      const result = await service.createCycle({
        name: 'Ciclo 2024',
        startDate: '2024-01-01',
        endDate: '2024-12-31',
      } as any);
      expect(result).toBeDefined();
    });
  });

  describe('getCurrentCycle', () => {
    it('deve retornar ciclo activo ou null', async () => {
      mockPrisma.performanceCycle.findFirst.mockResolvedValue(null);
      const result = await service.getCurrentCycle();
      expect(result).toBeNull();
    });
  });

  describe('findAll', () => {
    it('deve retornar avaliações paginadas', async () => {
      mockPrisma.performanceReview.findMany.mockResolvedValue([]);
      mockPrisma.performanceReview.count.mockResolvedValue(0);
      const result = await service.findAll({});
      expect(result).toBeDefined();
    });
  });

  // ─── getCycles ────────────────────────────────────────────────────────────

  describe('getCycles', () => {
    it('deve retornar todos os ciclos', async () => {
      mockPrisma.performanceCycle.findMany.mockResolvedValue([]);
      const result = await service.getCycles();
      expect(result).toBeDefined();
    });
  });

  // ─── activateCycle ────────────────────────────────────────────────────────

  describe('activateCycle', () => {
    it('deve activar ciclo e criar avaliações', async () => {
      mockPrisma.performanceCycle.findUnique.mockResolvedValue(baseCycle);
      mockPrisma.performanceCycle.update.mockResolvedValue({ ...baseCycle, status: 'ACTIVE' });
      mockPrisma.user.findMany.mockResolvedValue([]);
      const result = await service.activateCycle(1);
      expect(result).toBeDefined();
    });
  });

  // ─── findOne ──────────────────────────────────────────────────────────────

  describe('findOne', () => {
    it('deve retornar avaliação por id', async () => {
      mockPrisma.performanceReview.findUnique.mockResolvedValue({
        id: 1,
        evaluatorId: 1,
        evaluatedId: 2,
        status: 'DRAFT',
      });
      const result = await service.findOne(1);
      expect(result).toBeDefined();
    });

    it('deve lançar NotFoundException se não encontrado', async () => {
      mockPrisma.performanceReview.findUnique.mockResolvedValue(null);
      await expect(service.findOne(99)).rejects.toThrow();
    });
  });

  // ─── create ───────────────────────────────────────────────────────────────

  describe('create', () => {
    it('deve criar avaliação de performance', async () => {
      mockPrisma.performanceReview.create.mockResolvedValue({ id: 1, score: 0 });
      const result = await service.create({
        evaluatorId: 1,
        evaluatedId: 2,
        type: 'SELF',
        period: '2024-Q1',
      } as any);
      expect(result).toBeDefined();
    });
  });

  // ─── createGoal ───────────────────────────────────────────────────────────

  describe('createGoal', () => {
    it('deve criar meta de performance', async () => {
      const result = await service.createGoal({
        userId: 1,
        title: 'Aumentar vendas',
        target: 100,
      } as any);
      expect(result).toBeDefined();
    });
  });

  // ─── getUserGoals ─────────────────────────────────────────────────────────

  describe('getUserGoals', () => {
    it('deve retornar metas do utilizador', async () => {
      mockPrisma.performanceGoal.findMany.mockResolvedValue([]);
      const result = await service.getUserGoals(1);
      expect(result).toBeDefined();
    });
  });

  // ─── createFeedback ───────────────────────────────────────────────────────

  describe('createFeedback', () => {
    it('deve criar feedback de performance', async () => {
      const result = await service.createFeedback(1, {
        receiverId: 2,
        message: 'Excelente trabalho',
      } as any);
      expect(result).toBeDefined();
    });
  });

  // ─── getUserFeedback ──────────────────────────────────────────────────────

  describe('getUserFeedback', () => {
    it('deve retornar feedback do utilizador', async () => {
      const result = await service.getUserFeedback(1);
      expect(result).toBeDefined();
    });
  });
});
