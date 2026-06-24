import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { ProcessStandardService } from './process-standard.service';
import { PrismaService } from '../prisma/prisma.service';

const mockPrisma = {
  processStandard: {
    findUnique: jest.fn(),
    findFirst: jest.fn().mockResolvedValue(null),
    findMany: jest.fn().mockResolvedValue([]),
    create: jest.fn(),
    update: jest.fn(),
    count: jest.fn().mockResolvedValue(0),
    delete: jest.fn(),
  },
  processStep: {
    createMany: jest.fn().mockResolvedValue({ count: 0 }),
    deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    findMany: jest.fn().mockResolvedValue([]),
  },
  processParticipant: {
    create: jest.fn(),
    findMany: jest.fn().mockResolvedValue([]),
    delete: jest.fn(),
  },
  auditLog: { create: jest.fn().mockResolvedValue({}) },
  notificationLog: { create: jest.fn().mockResolvedValue({}) },
};

const baseProcess = {
  id: 1,
  title: 'Processo Onboarding',
  type: 'ONBOARDING',
  status: 'PUBLISHED',
  steps: [],
};

describe('ProcessStandardService', () => {
  let service: ProcessStandardService;

  beforeEach(async () => {
    jest.clearAllMocks();
    Object.defineProperty(mockPrisma, 'read', {
      get() {
        return mockPrisma;
      },
      configurable: true,
    });
    const module: TestingModule = await Test.createTestingModule({
      providers: [ProcessStandardService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();
    service = module.get<ProcessStandardService>(ProcessStandardService);
  });

  describe('findAll', () => {
    it('deve retornar processos paginados', async () => {
      mockPrisma.processStandard.findMany.mockResolvedValue([baseProcess]);
      mockPrisma.processStandard.count.mockResolvedValue(1);
      const result = await service.findAll({});
      expect(result).toBeDefined();
    });
  });

  describe('findOne', () => {
    it('deve retornar processo por id', async () => {
      mockPrisma.processStandard.findUnique.mockResolvedValue(baseProcess);
      const result = await service.findOne(1);
      expect(result).toBeDefined();
    });
    it('deve lançar NotFoundException', async () => {
      mockPrisma.processStandard.findUnique.mockResolvedValue(null);
      await expect(service.findOne(99)).rejects.toThrow(NotFoundException);
    });
  });

  describe('create', () => {
    it('deve criar processo', async () => {
      mockPrisma.processStandard.create.mockResolvedValue(baseProcess);
      const result = await service.create(1, {
        title: 'Processo Onboarding',
        type: 'ONBOARDING',
        code: 'PROC001',
        steps: [],
      } as any);
      expect(result).toBeDefined();
    });
  });
});
