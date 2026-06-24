import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { TrainingService as TrainingsService } from './trainings.service';
import { PrismaService } from '../prisma/prisma.service';

const mockPrisma = {
  training: {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn().mockResolvedValue([]),
    create: jest.fn(),
    update: jest.fn(),
    count: jest.fn().mockResolvedValue(0),
    delete: jest.fn(),
  },
  trainingParticipant: {
    findFirst: jest.fn(),
    create: jest.fn(),
    findMany: jest.fn().mockResolvedValue([]),
    update: jest.fn(),
    count: jest.fn().mockResolvedValue(0),
    delete: jest.fn(),
    createMany: jest.fn().mockResolvedValue({ count: 0 }),
  },
  trainingSession: {
    findMany: jest.fn().mockResolvedValue([]),
    create: jest.fn(),
    count: jest.fn().mockResolvedValue(0),
  },
  trainingRating: {
    upsert: jest.fn(),
    aggregate: jest.fn().mockResolvedValue({ _avg: { rating: 0 } }),
  },
  certificate: { create: jest.fn() },
  notificationLog: { create: jest.fn().mockResolvedValue({}) },
  userPoints: { update: jest.fn().mockResolvedValue({}) },
};

const baseTraining = {
  id: 1,
  title: 'Formação NestJS',
  status: 'PUBLISHED',
  type: 'ONLINE',
  participants: [],
  _count: { participants: 0, sessions: 1 },
};

describe('TrainingsService', () => {
  let service: TrainingsService;

  beforeEach(async () => {
    jest.clearAllMocks();
    Object.defineProperty(mockPrisma, 'read', {
      get() {
        return mockPrisma;
      },
      configurable: true,
    });
    const module: TestingModule = await Test.createTestingModule({
      providers: [TrainingsService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();
    service = module.get<TrainingsService>(TrainingsService);
  });

  describe('findAll', () => {
    it('deve retornar formações paginadas', async () => {
      mockPrisma.training.findMany.mockResolvedValue([baseTraining]);
      mockPrisma.training.count.mockResolvedValue(1);
      const result = await service.findAll({});
      expect((result as any).data).toBeDefined();
    });
  });

  describe('findOne', () => {
    it('deve retornar formação por id', async () => {
      mockPrisma.training.findUnique.mockResolvedValue(baseTraining);
      const result = await service.findOne(1);
      expect(result).toBeDefined();
    });
    it('deve lançar NotFoundException', async () => {
      mockPrisma.training.findUnique.mockResolvedValue(null);
      await expect(service.findOne(99)).rejects.toThrow(NotFoundException);
    });
  });

  describe('create', () => {
    it('deve criar formação', async () => {
      mockPrisma.training.create.mockResolvedValue(baseTraining);
      const result = await service.create({ title: 'NestJS', type: 'ONLINE' } as any);
      expect(result).toBeDefined();
    });
  });

  describe('publish', () => {
    it('deve publicar formação', async () => {
      mockPrisma.training.findUnique.mockResolvedValue(baseTraining);
      mockPrisma.training.update.mockResolvedValue({ ...baseTraining, status: 'PUBLISHED' });
      const result = await service.publish(1);
      expect(result).toBeDefined();
    });
  });
});
