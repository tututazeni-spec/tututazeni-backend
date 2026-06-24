import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ForbiddenException } from '@nestjs/common';
import { OnboardingService } from './onboarding.service';
import { PrismaService } from '../prisma/prisma.service';

const makeFind = (val: any = null) => jest.fn().mockResolvedValue(val);
const makeFindMany = (data: any[] = []) => jest.fn().mockResolvedValue(data);
const makeCount = (n = 0) => jest.fn().mockResolvedValue(n);

const mockPrisma = {
  onboardingTemplate: {
    findMany: makeFindMany([]),
    findUnique: makeFind(null),
    create: makeFind({ id: 1, name: 'Test', _count: { plans: 0 } }),
    update: makeFind({ id: 1 }),
    delete: makeFind({}),
  },
  onboardingTemplateTask: {
    create: makeFind({ id: 1 }),
    update: makeFind({ id: 1 }),
    delete: makeFind({}),
    findMany: makeFindMany([]),
    findUnique: makeFind(null),
    updateMany: makeFind({ count: 0 }),
  },
  onboardingPlan: {
    findMany: makeFindMany([]),
    findUnique: makeFind(null),
    findFirst: makeFind(null),
    create: makeFind({ id: 1, userId: 1, status: 'IN_PROGRESS' }),
    update: makeFind({ id: 1 }),
    count: makeCount(0),
  },
  onboardingTaskInstance: {
    findMany: makeFindMany([]),
    findUnique: makeFind(null),
    create: makeFind({ id: 1 }),
    update: makeFind({ id: 1 }),
    createMany: makeFind({ count: 0 }),
    count: makeCount(0),
    findFirst: makeFind(null),
  },
  onboardingDocument: {
    create: makeFind({ id: 1 }),
    findMany: makeFindMany([]),
    findUnique: makeFind(null),
    update: makeFind({ id: 1 }),
  },
  onboardingSurvey: { create: makeFind({}), findMany: makeFindMany([]) },
  user: { findUnique: makeFind(null) },
  notificationLog: { create: makeFind({}) },
  userPoints: { update: makeFind({}) },
};

describe('OnboardingService — additional coverage', () => {
  let service: OnboardingService;

  beforeEach(async () => {
    jest.clearAllMocks();
    Object.defineProperty(mockPrisma, 'read', {
      get() {
        return mockPrisma;
      },
      configurable: true,
    });
    const module: TestingModule = await Test.createTestingModule({
      providers: [OnboardingService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();
    service = module.get<OnboardingService>(OnboardingService);
  });

  // ─── updateTemplate ───────────────────────────────────────────────────────

  describe('updateTemplate', () => {
    it('deve actualizar template existente', async () => {
      mockPrisma.onboardingTemplate.findUnique.mockResolvedValue({
        id: 1,
        name: 'Antigo',
        _count: { plans: 0 },
      });
      mockPrisma.onboardingTemplate.update.mockResolvedValue({ id: 1, name: 'Novo' });

      const result = await service.updateTemplate(1, { name: 'Novo' } as any);
      expect(result).toBeDefined();
    });

    it('deve lançar NotFoundException se não encontrado', async () => {
      mockPrisma.onboardingTemplate.findUnique.mockResolvedValue(null);
      await expect(service.updateTemplate(99, {} as any)).rejects.toThrow(NotFoundException);
    });
  });

  // ─── deleteTemplate ───────────────────────────────────────────────────────

  describe('deleteTemplate', () => {
    it('deve eliminar template sem planos', async () => {
      mockPrisma.onboardingTemplate.findUnique.mockResolvedValue({
        id: 1,
        _count: { plans: 0 },
      });
      mockPrisma.onboardingTemplate.delete.mockResolvedValue({});

      const result = await service.deleteTemplate(1);
      expect(result).toHaveProperty('message');
    });

    it('deve lançar ForbiddenException se template em uso', async () => {
      mockPrisma.onboardingTemplate.findUnique.mockResolvedValue({
        id: 1,
        _count: { plans: 3 },
      });

      await expect(service.deleteTemplate(1)).rejects.toThrow(ForbiddenException);
    });

    it('deve lançar NotFoundException se não encontrado', async () => {
      mockPrisma.onboardingTemplate.findUnique.mockResolvedValue(null);
      await expect(service.deleteTemplate(99)).rejects.toThrow(NotFoundException);
    });
  });

  // ─── addTemplateTask ──────────────────────────────────────────────────────

  describe('addTemplateTask', () => {
    it('deve adicionar tarefa ao template', async () => {
      mockPrisma.onboardingTemplate.findUnique.mockResolvedValue({
        id: 1,
        _count: { plans: 0 },
      });
      mockPrisma.onboardingTemplateTask.create.mockResolvedValue({ id: 1, title: 'Tarefa 1' });

      const result = await service.addTemplateTask({
        templateId: 1,
        title: 'Tarefa 1',
        seq: 1,
      } as any);
      expect(result).toBeDefined();
    });
  });

  // ─── updateTemplateTask ───────────────────────────────────────────────────

  describe('updateTemplateTask', () => {
    it('deve actualizar tarefa do template', async () => {
      mockPrisma.onboardingTemplateTask.findUnique.mockResolvedValue({ id: 1, title: 'Old' });
      mockPrisma.onboardingTemplateTask.update.mockResolvedValue({ id: 1, title: 'New' });

      const result = await service.updateTemplateTask(1, { title: 'New' } as any);
      expect(result).toBeDefined();
    });

    it('deve lançar NotFoundException se tarefa não encontrada', async () => {
      mockPrisma.onboardingTemplateTask.findUnique.mockResolvedValue(null);
      await expect(service.updateTemplateTask(99, {} as any)).rejects.toThrow(NotFoundException);
    });
  });

  // ─── deleteTemplateTask ───────────────────────────────────────────────────

  describe('deleteTemplateTask', () => {
    it('deve eliminar tarefa', async () => {
      mockPrisma.onboardingTemplateTask.delete.mockResolvedValue({});

      const result = await service.deleteTemplateTask(1);
      expect(result).toHaveProperty('message');
    });
  });

  // ─── findOne ──────────────────────────────────────────────────────────────

  describe('findOne', () => {
    it('deve retornar plano por id', async () => {
      mockPrisma.onboardingPlan.findUnique.mockResolvedValue({
        id: 1,
        userId: 1,
        status: 'IN_PROGRESS',
        user: {
          id: 1,
          fullName: 'Test',
          email: 'test@innova.com',
          department: null,
          position: null,
        },
        template: { id: 1, name: 'Padrão', tasks: [] },
        buddy: null,
        manager: null,
        hrResponsible: null,
        taskInstances: [],
        documents: [],
        surveys: [],
      });

      const result = await service.findOne(1);
      expect(result).toBeDefined();
    });

    it('deve lançar NotFoundException se plano não encontrado', async () => {
      mockPrisma.onboardingPlan.findUnique.mockResolvedValue(null);
      await expect(service.findOne(99)).rejects.toThrow(NotFoundException);
    });
  });

  // ─── findAll com filtros ──────────────────────────────────────────────────

  describe('findAll with filters', () => {
    it('deve filtrar planos por status', async () => {
      mockPrisma.onboardingPlan.findMany.mockResolvedValue([]);
      mockPrisma.onboardingPlan.count.mockResolvedValue(0);

      const result = await service.findAll({ status: 'IN_PROGRESS' as any });
      expect(result).toHaveProperty('data');
      expect(result).toHaveProperty('total');
    });

    it('deve filtrar por departmentId', async () => {
      mockPrisma.onboardingPlan.findMany.mockResolvedValue([]);
      mockPrisma.onboardingPlan.count.mockResolvedValue(0);

      await service.findAll({ departmentId: 1 });
      expect(mockPrisma.onboardingPlan.findMany).toHaveBeenCalled();
    });
  });
});
