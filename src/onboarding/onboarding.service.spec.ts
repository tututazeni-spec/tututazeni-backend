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

    it('cria a Estrutura (tasks) atomicamente com o template, sem chamar templates/tasks à parte', async () => {
      mockPrisma.onboardingTemplate.create.mockResolvedValue(baseTemplate);
      const tasks = [
        {
          title: 'Assinar contrato',
          category: 'ADMIN',
          type: 'TASK',
          phase: 'PRE_BOARDING',
          responsible: 'HR',
          dueDayOffset: 0,
          xpReward: 10,
          seq: 0,
        },
      ];
      await service.createTemplate({
        name: 'Template Comercial',
        durationDays: 30,
        company: 'INNOVA',
        location: 'Lisboa',
        tasks,
      } as any);
      expect(mockPrisma.onboardingTemplate.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            name: 'Template Comercial',
            company: 'INNOVA',
            location: 'Lisboa',
            tasks: { create: tasks },
          }),
        }),
      );
      expect(mockPrisma.onboardingTemplateTask.create).not.toHaveBeenCalled();
    });

    it('propaga isMandatory e a categoria ONE_ON_ONE (Reuniões 1:1) tal como vieram no DTO', async () => {
      mockPrisma.onboardingTemplate.create.mockResolvedValue(baseTemplate);
      const tasks = [
        {
          title: '1:1 com o gestor',
          category: 'ONE_ON_ONE',
          type: 'MEETING',
          phase: 'WEEK_1',
          responsible: 'MANAGER',
          dueDayOffset: 5,
          isMandatory: true,
          xpReward: 5,
          seq: 0,
        },
      ];
      await service.createTemplate({
        name: 'Template Comercial',
        durationDays: 30,
        tasks,
      } as any);
      expect(mockPrisma.onboardingTemplate.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ tasks: { create: tasks } }),
        }),
      );
    });

    it('não envia `tasks` na criação do template quando a estrutura não é fornecida', async () => {
      mockPrisma.onboardingTemplate.create.mockResolvedValue(baseTemplate);
      await service.createTemplate({
        name: 'Template Padrão',
        durationDays: 30,
      } as any);
      const call = mockPrisma.onboardingTemplate.create.mock.calls[0][0];
      expect(call.data.tasks).toBeUndefined();
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
