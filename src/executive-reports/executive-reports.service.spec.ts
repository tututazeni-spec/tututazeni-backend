import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { ExecutiveReportsService } from './executive-reports.service';
import { PrismaService } from '../prisma/prisma.service';

const mockPrisma = {
  executiveReport: {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn().mockResolvedValue([]),
    create: jest.fn(),
    update: jest.fn(),
    count: jest.fn().mockResolvedValue(0),
  },
  executiveMetric: {
    createMany: jest.fn().mockResolvedValue({ count: 0 }),
    findMany: jest.fn().mockResolvedValue([]),
  },
  executiveSnapshot: { create: jest.fn().mockResolvedValue({}), findFirst: jest.fn() },
  reportAccessLog: { create: jest.fn().mockResolvedValue({}) },
  reportApproval: { create: jest.fn().mockResolvedValue({}) },
  reportLog: { create: jest.fn().mockResolvedValue({}) },
  enrollment: { count: jest.fn().mockResolvedValue(0), findMany: jest.fn().mockResolvedValue([]) },
  performanceReview: {
    count: jest.fn().mockResolvedValue(0),
    aggregate: jest.fn().mockResolvedValue({ _avg: {} }),
  },
  developmentPlan: { count: jest.fn().mockResolvedValue(0) },
  developmentPlanAction: { count: jest.fn().mockResolvedValue(0) },
  certificate: { count: jest.fn().mockResolvedValue(0) },
};

const baseReport = {
  id: 1,
  title: 'Relatório Q1',
  type: 'QUARTERLY',
  status: 'DRAFT',
  generatedById: 1,
  metrics: [],
};

describe('ExecutiveReportsService', () => {
  let service: ExecutiveReportsService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [ExecutiveReportsService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();
    service = module.get<ExecutiveReportsService>(ExecutiveReportsService);
  });

  describe('findAll', () => {
    it('deve retornar relatórios paginados', async () => {
      mockPrisma.executiveReport.findMany.mockResolvedValue([baseReport]);
      mockPrisma.executiveReport.count.mockResolvedValue(1);
      const result = await service.findAll({});
      expect(result).toBeDefined();
    });
  });

  describe('findOne', () => {
    it('deve retornar relatório por id', async () => {
      mockPrisma.executiveReport.findUnique.mockResolvedValue(baseReport);
      const result = await service.findOne(1);
      expect(result).toBeDefined();
    });
    it('deve lançar NotFoundException', async () => {
      mockPrisma.executiveReport.findUnique.mockResolvedValue(null);
      await expect(service.findOne(99)).rejects.toThrow(NotFoundException);
    });
  });

  describe('create', () => {
    it('deve criar relatório com métricas', async () => {
      mockPrisma.executiveReport.create.mockResolvedValue(baseReport);
      const result = await service.create(1, {
        title: 'Relatório Q1',
        type: 'QUARTERLY',
        metrics: [{ label: 'Activos', value: 90, unit: '%', status: 'OK' }],
      } as any);
      expect(result).toBeDefined();
    });
  });
});
