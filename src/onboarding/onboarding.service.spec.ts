import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { OnboardingService } from './onboarding.service';
import { PrismaService } from '../prisma/prisma.service';

const mockPrisma = {
  onboardingTemplate: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  onboardingTemplateTask: {
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    findMany: jest.fn(),
    findUnique: jest.fn(),
    updateMany: jest.fn(),
  },
  onboardingPlan: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    count: jest.fn(),
  },
  onboardingTaskInstance: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    createMany: jest.fn(),
    count: jest.fn(),
    findFirst: jest.fn(),
  },
  onboardingDocument: {
    create: jest.fn(),
    findMany: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
  },
  onboardingSurvey: { create: jest.fn(), findMany: jest.fn() },
  user: { findUnique: jest.fn() },
  notificationLog: { create: jest.fn().mockResolvedValue({}) },
  userPoints: { update: jest.fn().mockResolvedValue({}) },
};

const baseTemplate = {
  id: 1,
  name: 'Template Padrão',
  description: 'Template para novos colaboradores',
  tasks: [],
  _count: { tasks: 5 },
};

const basePlan = {
  id: 1,
  userId: 1,
  status: 'IN_PROGRESS',
  template: baseTemplate,
  tasks: [],
  _count: { tasks: 5 },
};

describe('OnboardingService', () => {
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

  describe('findAllTemplates', () => {
    it('deve retornar templates', async () => {
      mockPrisma.onboardingTemplate.findMany.mockResolvedValue([baseTemplate]);
      const result = await service.findAllTemplates();
      expect(result).toHaveLength(1);
    });
  });

  describe('findOneTemplate', () => {
    it('deve retornar template por id', async () => {
      mockPrisma.onboardingTemplate.findUnique.mockResolvedValue(baseTemplate);
      const result = await service.findOneTemplate(1);
      expect(result.name).toBe('Template Padrão');
    });

    it('deve lançar NotFoundException se não encontrado', async () => {
      mockPrisma.onboardingTemplate.findUnique.mockResolvedValue(null);
      await expect(service.findOneTemplate(99)).rejects.toThrow(NotFoundException);
    });
  });

  describe('createTemplate', () => {
    it('deve criar template', async () => {
      mockPrisma.onboardingTemplate.create.mockResolvedValue(baseTemplate);
      const result = await service.createTemplate({
        name: 'Template Padrão',
        description: 'Desc',
        durationDays: 30,
      } as any);
      expect(result.name).toBe('Template Padrão');
    });
  });

  describe('findAll', () => {
    it('deve retornar planos paginados', async () => {
      mockPrisma.onboardingPlan.findMany.mockResolvedValue([basePlan]);
      mockPrisma.onboardingPlan.count.mockResolvedValue(1);
      const result = await service.findAll({});
      expect((result as any).data).toHaveLength(1);
    });
  });

  describe('findByUser', () => {
    it('deve retornar plano do utilizador', async () => {
      mockPrisma.onboardingPlan.findFirst.mockResolvedValue(basePlan);
      const result = await service.findByUser(1);
      expect(result).toBeDefined();
    });
  });
});
