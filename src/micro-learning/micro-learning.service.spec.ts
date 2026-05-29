import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { MicroLearningService } from './micro-learning.service';
import { PrismaService } from '../prisma/prisma.service';

const mockPrisma = {
  microLearning: {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn().mockResolvedValue([]),
    create: jest.fn(),
    update: jest.fn(),
    count: jest.fn().mockResolvedValue(0),
    delete: jest.fn(),
  },
  microLearningInteraction: {
    create: jest.fn().mockResolvedValue({}),
    count: jest.fn().mockResolvedValue(0),
  },
  microLearningProgress: {
    upsert: jest.fn().mockResolvedValue({}),
    findFirst: jest.fn(),
    findMany: jest.fn().mockResolvedValue([]),
  },
  microLearningPlaylist: {
    findMany: jest.fn().mockResolvedValue([]),
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    count: jest.fn().mockResolvedValue(0),
  },
  playlistItem: {
    createMany: jest.fn().mockResolvedValue({ count: 0 }),
    deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
  },
  microQuizQuestion: { findMany: jest.fn().mockResolvedValue([]) },
  microQuizAttempt: { create: jest.fn(), findFirst: jest.fn() },
  learningStreak: { upsert: jest.fn().mockResolvedValue({}) },
  user: { findUnique: jest.fn() },
  notificationLog: { create: jest.fn().mockResolvedValue({}) },
};

const baseMicro = {
  id: 1,
  title: 'Quick NestJS Tip',
  type: 'ARTICLE',
  status: 'PUBLISHED',
  durationSeconds: 60,
};

describe('MicroLearningService', () => {
  let service: MicroLearningService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [MicroLearningService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();
    service = module.get<MicroLearningService>(MicroLearningService);
  });

  describe('findAll', () => {
    it('deve retornar micro-learnings paginados', async () => {
      mockPrisma.microLearning.findMany.mockResolvedValue([baseMicro]);
      mockPrisma.microLearning.count.mockResolvedValue(1);
      const result = await service.findAll({});
      expect(result).toBeDefined();
    });
  });

  describe('findOne', () => {
    it('deve retornar por id', async () => {
      mockPrisma.microLearning.findUnique.mockResolvedValue(baseMicro);
      const result = await service.findOne(1);
      expect(result).toBeDefined();
    });
    it('deve lançar NotFoundException', async () => {
      mockPrisma.microLearning.findUnique.mockResolvedValue(null);
      await expect(service.findOne(99)).rejects.toThrow(NotFoundException);
    });
  });

  describe('create', () => {
    it('deve criar micro-learning', async () => {
      mockPrisma.microLearning.create.mockResolvedValue(baseMicro);
      mockPrisma.microLearning.findUnique.mockResolvedValue(baseMicro);
      const result = await service.create({ title: 'Quick NestJS Tip', type: 'ARTICLE' } as any);
      expect(result).toBeDefined();
    });
  });
});
