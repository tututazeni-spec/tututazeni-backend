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

const mockPrisma: any = new Proxy(
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
      findUnique: makeFind(null),
    },
    processInstance: {
      findUnique: makeFind(null),
      update: makeFind({}),
      findMany: makeFindMany([]),
      count: makeCount(0),
    },
    stepProgress: {
      findUnique: makeFind(null),
      findFirst: makeFind(null),
      count: makeCount(0),
      update: makeFind({}),
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
      if (prop === 'db') return mockPrisma;
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

  // A10-7: getInstanceDetail/completeStep/rejectStep não tinham @Roles nem
  // ownership — qualquer autenticado podia ver ou forjar a conclusão/rejeição
  // do passo de qualquer instância de processo.
  describe('ownership de instâncias e passos (A10-7)', () => {
    const target = { id: 10, email: 't@innova.com', role: { name: 'COLABORADOR' } };
    const other = { id: 999, email: 'o@innova.com', role: { name: 'COLABORADOR' } };
    const admin = { id: 1, email: 'a@innova.com', role: { name: 'ADMIN' } };
    const baseInstance = {
      id: 1,
      targetUserId: 10,
      initiatedById: 2,
      process: { steps: [] },
      stepProgress: [],
    };

    describe('getInstanceDetail', () => {
      it('alvo da instância pode ver o detalhe', async () => {
        mockPrisma.processInstance.findUnique.mockResolvedValue(baseInstance);
        const result = await service.getInstanceDetail(1, target as any);
        expect(result).toBeDefined();
      });

      it('ADMIN pode ver o detalhe de qualquer instância', async () => {
        mockPrisma.processInstance.findUnique.mockResolvedValue(baseInstance);
        const result = await service.getInstanceDetail(1, admin as any);
        expect(result).toBeDefined();
      });

      it('utilizador não participante não pode ver o detalhe', async () => {
        mockPrisma.processInstance.findUnique.mockResolvedValue(baseInstance);
        await expect(service.getInstanceDetail(1, other as any)).rejects.toThrow(NotFoundException);
      });
    });

    describe('completeStep', () => {
      const sp = { instanceId: 1, stepId: 5, status: 'PENDING', stepOrder: 1, startedAt: null };

      it('alvo da instância (sem responsável específico no passo) pode completar', async () => {
        mockPrisma.stepProgress.findUnique.mockResolvedValue(sp);
        mockPrisma.processInstance.findUnique.mockResolvedValue({ targetUserId: 10 });
        mockPrisma.processStep.findUnique.mockResolvedValue({ id: 5, responsibleId: null });
        mockPrisma.stepProgress.update.mockResolvedValue({ ...sp, status: 'COMPLETED' });
        const result = await service.completeStep(1, 5, target as any, {} as any);
        expect(result).toBeDefined();
      });

      it('utilizador sem relação com a instância nem responsável pelo passo é rejeitado', async () => {
        mockPrisma.stepProgress.findUnique.mockResolvedValue(sp);
        mockPrisma.processInstance.findUnique.mockResolvedValue({ targetUserId: 10 });
        mockPrisma.processStep.findUnique.mockResolvedValue({ id: 5, responsibleId: 777 });
        await expect(service.completeStep(1, 5, other as any, {} as any)).rejects.toThrow(
          NotFoundException,
        );
        expect(mockPrisma.stepProgress.update).not.toHaveBeenCalled();
      });

      it('responsável específico do passo pode completar mesmo não sendo o alvo', async () => {
        mockPrisma.stepProgress.findUnique.mockResolvedValue(sp);
        mockPrisma.processInstance.findUnique.mockResolvedValue({ targetUserId: 10 });
        mockPrisma.processStep.findUnique.mockResolvedValue({ id: 5, responsibleId: 999 });
        mockPrisma.stepProgress.update.mockResolvedValue({ ...sp, status: 'COMPLETED' });
        const result = await service.completeStep(1, 5, other as any, {} as any);
        expect(result).toBeDefined();
      });
    });

    describe('rejectStep', () => {
      const sp = { instanceId: 1, stepId: 5, status: 'PENDING' };

      it('utilizador sem relação com a instância nem responsável pelo passo é rejeitado', async () => {
        mockPrisma.stepProgress.findUnique.mockResolvedValue(sp);
        mockPrisma.processInstance.findUnique.mockResolvedValue({ targetUserId: 10 });
        mockPrisma.processStep.findUnique.mockResolvedValue({ id: 5, responsibleId: 777 });
        await expect(service.rejectStep(1, 5, other as any, {} as any)).rejects.toThrow(
          NotFoundException,
        );
        expect(mockPrisma.stepProgress.update).not.toHaveBeenCalled();
      });

      it('ADMIN pode rejeitar qualquer passo', async () => {
        mockPrisma.stepProgress.findUnique.mockResolvedValue(sp);
        mockPrisma.processInstance.findUnique.mockResolvedValue({ targetUserId: 10 });
        mockPrisma.processStep.findUnique.mockResolvedValue({ id: 5, responsibleId: null });
        const result = await service.rejectStep(1, 5, admin as any, {} as any);
        expect(result).toBeDefined();
      });
    });
  });
});
