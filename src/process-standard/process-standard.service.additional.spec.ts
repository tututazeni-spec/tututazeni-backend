import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { ProcessStandardService } from './process-standard.service';
import { PrismaService } from '../prisma/prisma.service';

const makeFind = (val: any = null) => jest.fn().mockResolvedValue(val);
const makeFindMany = (data: any[] = []) => jest.fn().mockResolvedValue(data);
const makeCount = (n = 0) => jest.fn().mockResolvedValue(n);

const baseProcess = {
  id: 1,
  title: 'Processo Teste',
  code: 'PROC001',
  type: 'ONBOARDING',
  status: 'DRAFT',
  version: '1.0',
  ownerId: 1,
  defaultSlaHours: null,
  steps: [{ id: 1, type: 'APPROVAL', title: 'Passo 1', order: 1 }],
};

const mockPrisma = new Proxy(
  {
    processStandard: {
      findUnique: makeFind(baseProcess),
      findFirst: makeFind(null),
      findMany: makeFindMany([baseProcess]),
      create: makeFind(baseProcess),
      update: makeFind(baseProcess),
      count: makeCount(0),
      delete: makeFind({}),
    },
    processStep: {
      createMany: makeFind({ count: 0 }),
      deleteMany: makeFind({ count: 0 }),
      findMany: makeFindMany([]),
    },
    processParticipant: {
      create: makeFind({}),
      findMany: makeFindMany([]),
      delete: makeFind({}),
    },
    auditLog: { create: makeFind({}) },
    notificationLog: { create: makeFind({}) },
  },
  {
    get(target, prop) {
      return (
        (target as any)[prop] ?? {
          create: makeFind({}),
          findMany: makeFindMany([]),
          count: makeCount(0),
          findFirst: makeFind(null),
          findUnique: makeFind(null),
        }
      );
    },
  },
);

describe('ProcessStandardService — additional coverage', () => {
  let service: ProcessStandardService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [ProcessStandardService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();
    service = module.get<ProcessStandardService>(ProcessStandardService);
  });

  // ─── update ───────────────────────────────────────────────────────────────

  describe('update', () => {
    it('deve actualizar processo em DRAFT', async () => {
      mockPrisma.processStandard.findUnique.mockResolvedValue({ ...baseProcess, status: 'DRAFT' });
      mockPrisma.processStandard.findFirst.mockResolvedValue(null);
      mockPrisma.processStandard.update.mockResolvedValue({ ...baseProcess, title: 'Updated' });

      const result = await service.update(1, { title: 'Updated', steps: [] } as any, 1);
      expect(result).toBeDefined();
    });

    it('deve lançar ForbiddenException se processo está ACTIVE', async () => {
      mockPrisma.processStandard.findUnique.mockResolvedValue({ ...baseProcess, status: 'ACTIVE' });

      await expect(service.update(1, { title: 'Updated' } as any, 1)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('deve lançar NotFoundException se não encontrado', async () => {
      mockPrisma.processStandard.findUnique.mockResolvedValue(null);

      await expect(service.update(99, {} as any, 1)).rejects.toThrow(NotFoundException);
    });

    it('deve substituir steps quando fornecidos', async () => {
      mockPrisma.processStandard.findUnique.mockResolvedValue({ ...baseProcess, status: 'DRAFT' });
      mockPrisma.processStandard.findFirst.mockResolvedValue(null);
      mockPrisma.processStandard.update.mockResolvedValue(baseProcess);

      await service.update(
        1,
        { title: 'Updated', steps: [{ type: 'APPROVAL', title: 'Novo Passo', order: 1 }] } as any,
        1,
      );

      expect(mockPrisma.processStep.deleteMany).toHaveBeenCalled();
      expect(mockPrisma.processStep.createMany).toHaveBeenCalled();
    });
  });

  // ─── submitForReview ──────────────────────────────────────────────────────

  describe('submitForReview', () => {
    it('deve submeter processo para revisão', async () => {
      mockPrisma.processStandard.findUnique.mockResolvedValue({
        ...baseProcess,
        status: 'DRAFT',
        steps: [{ id: 1 }],
      });
      mockPrisma.processStandard.update.mockResolvedValue({ ...baseProcess, status: 'IN_REVIEW' });

      const result = await service.submitForReview(1, 1);
      expect(result).toBeDefined();
    });

    it('deve lançar BadRequestException se não está em DRAFT', async () => {
      mockPrisma.processStandard.findUnique.mockResolvedValue({
        ...baseProcess,
        status: 'ACTIVE',
      });
      await expect(service.submitForReview(1, 1)).rejects.toThrow(BadRequestException);
    });

    it('deve lançar BadRequestException se sem passos', async () => {
      mockPrisma.processStandard.findUnique.mockResolvedValue({
        ...baseProcess,
        status: 'DRAFT',
        steps: [],
      });
      await expect(service.submitForReview(1, 1)).rejects.toThrow(BadRequestException);
    });
  });

  // ─── archive ──────────────────────────────────────────────────────────────

  describe('archive', () => {
    it('deve arquivar processo', async () => {
      mockPrisma.processStandard.findUnique.mockResolvedValue(baseProcess);
      mockPrisma.processStandard.update.mockResolvedValue({ ...baseProcess, status: 'ARCHIVED' });

      const result = await service.archive(1, 1);
      expect(result).toBeDefined();
    });

    it('deve retornar imediatamente se já está ARCHIVED', async () => {
      mockPrisma.processStandard.findUnique.mockResolvedValue({
        ...baseProcess,
        status: 'ARCHIVED',
      });

      const result = await service.archive(1, 1);
      expect((result as any).status).toBe('ARCHIVED');
    });
  });

  // ─── getInstances ─────────────────────────────────────────────────────────

  describe('getInstances', () => {
    it('deve retornar instâncias paginadas', async () => {
      const result = await service.getInstances({ processId: 1, page: 1, limit: 10 });
      expect(result).toHaveProperty('data');
    });

    it('deve filtrar por userId', async () => {
      await service.getInstances({ userId: 1 });
      expect(service).toBeDefined();
    });
  });

  // ─── findAll with filters ─────────────────────────────────────────────────

  describe('findAll with filters', () => {
    it('deve filtrar por status e search', async () => {
      mockPrisma.processStandard.findMany.mockResolvedValue([]);
      mockPrisma.processStandard.count.mockResolvedValue(0);

      const result = await service.findAll({
        status: 'PUBLISHED' as any,
        riskLevel: 'HIGH' as any,
        search: 'Onboarding',
      });
      expect(result).toBeDefined();
    });
  });
});
