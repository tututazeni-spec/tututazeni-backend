import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { LiveClassesService } from './live-classes.service';
import { PrismaService } from '../prisma/prisma.service';

const mockPrisma = {
  liveClass: {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn().mockResolvedValue([]),
    create: jest.fn(),
    update: jest.fn(),
    count: jest.fn().mockResolvedValue(0),
  },
  liveAttendance: {
    findMany: jest.fn().mockResolvedValue([]),
    create: jest.fn(),
    upsert: jest.fn(),
  },
  liveChatMessage: { findMany: jest.fn().mockResolvedValue([]), create: jest.fn() },
  postClassEvaluation: { create: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
  postClassResponse: { create: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
};

const baseClass = {
  id: 1,
  title: 'Live NestJS',
  status: 'SCHEDULED',
  startAt: new Date(),
  endAt: new Date(),
};

describe('LiveClassesService', () => {
  let service: LiveClassesService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [LiveClassesService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();
    service = module.get<LiveClassesService>(LiveClassesService);
  });

  describe('findAll', () => {
    it('deve retornar aulas ao vivo paginadas', async () => {
      mockPrisma.liveClass.findMany.mockResolvedValue([baseClass]);
      mockPrisma.liveClass.count.mockResolvedValue(1);
      const result = await service.findAll({});
      expect(result).toBeDefined();
    });
  });

  describe('findOne', () => {
    it('deve retornar aula por id', async () => {
      mockPrisma.liveClass.findUnique.mockResolvedValue(baseClass);
      const result = await service.findOne(1);
      expect(result).toBeDefined();
    });
    it('deve lançar NotFoundException', async () => {
      mockPrisma.liveClass.findUnique.mockResolvedValue(null);
      await expect(service.findOne(99)).rejects.toThrow(NotFoundException);
    });
  });

  describe('create', () => {
    it('deve criar aula ao vivo', async () => {
      mockPrisma.liveClass.create.mockResolvedValue(baseClass);
      const result = await service.create({
        title: 'Live NestJS',
        startAt: new Date().toISOString(),
      } as any);
      expect(result).toBeDefined();
    });
  });
});
