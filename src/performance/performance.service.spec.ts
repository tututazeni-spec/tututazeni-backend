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
});
