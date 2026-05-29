import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { AvatarTrainingService } from './avatar-training.service';
import { PrismaService } from '../prisma/prisma.service';

const makeFind = (data: any[] = []) => jest.fn().mockResolvedValue(data);
const makeCount = (n = 0) => jest.fn().mockResolvedValue(n);

const mockPrisma = {
  avatarScenario: { findMany: makeFind(), findUnique: jest.fn(), create: jest.fn(), update: jest.fn(), count: makeCount() },
  avatarSession: { findMany: makeFind(), findUnique: jest.fn(), create: jest.fn(), update: jest.fn(), count: makeCount(), groupBy: jest.fn().mockResolvedValue([]) },
  badge: { findMany: makeFind() },
  badgeAward: { create: jest.fn().mockResolvedValue({}), findFirst: jest.fn() },
  user: { findUnique: jest.fn() },
  userPoints: { update: jest.fn().mockResolvedValue({}) },
  notificationLog: { create: jest.fn().mockResolvedValue({}) },
};

const baseScenario = {
  id: 1, title: 'Entrevista de Vendas', category: 'SALES', difficulty: 'MEDIUM',
  status: 'PUBLISHED', _count: { sessions: 5 },
};

describe('AvatarTrainingService', () => {
  let service: AvatarTrainingService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [AvatarTrainingService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();
    service = module.get<AvatarTrainingService>(AvatarTrainingService);
  });

  describe('getScenarios', () => {
    it('deve retornar cenários paginados', async () => {
      mockPrisma.avatarScenario.findMany.mockResolvedValue([baseScenario]);
      mockPrisma.avatarScenario.count.mockResolvedValue(1);
      const result = await service.getScenarios({});
      expect(result).toBeDefined();
    });
  });

  describe('getScenario', () => {
    it('deve retornar cenário por id', async () => {
      mockPrisma.avatarScenario.findUnique.mockResolvedValue(baseScenario);
      const result = await service.getScenario(1);
      expect(result).toBeDefined();
    });
    it('deve lançar NotFoundException', async () => {
      mockPrisma.avatarScenario.findUnique.mockResolvedValue(null);
      await expect(service.getScenario(99)).rejects.toThrow(NotFoundException);
    });
  });

  describe('getAvatars', () => {
    it('deve retornar avatares', async () => {
      const result = await service.getAvatars({});
      expect(result).toBeDefined();
    });
  });
});
