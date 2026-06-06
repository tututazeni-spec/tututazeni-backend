import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { AutomationService } from './automation.service';
import { PrismaService } from '../prisma/prisma.service';

const automationRuleMock = {
  findMany: jest.fn().mockResolvedValue([]),
  findUnique: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
  count: jest.fn().mockResolvedValue(0),
  delete: jest.fn(),
};

const mockPrisma = {
  automationRule: automationRuleMock,
  user: { findMany: jest.fn().mockResolvedValue([]), findUnique: jest.fn() },
  badge: { findMany: jest.fn().mockResolvedValue([]) },
  badgeAward: { create: jest.fn().mockResolvedValue({}), findFirst: jest.fn() },
  enrollment: { create: jest.fn(), findFirst: jest.fn() },
  developmentPlan: { create: jest.fn() },
  notificationLog: {
    create: jest.fn().mockResolvedValue({}),
    createMany: jest.fn().mockResolvedValue({ count: 0 }),
  },
  auditLog: { create: jest.fn().mockResolvedValue({}) },
  historyRecord: { create: jest.fn().mockResolvedValue({}) },
  payslip: { create: jest.fn() },
};

const baseRule = {
  id: 1,
  name: 'Auto Badge',
  trigger: 'COURSE_COMPLETED',
  active: true,
  actions: [],
  conditions: [],
};

describe('AutomationService', () => {
  let service: AutomationService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [AutomationService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();
    service = module.get<AutomationService>(AutomationService);
  });

  describe('getRules', () => {
    it('deve retornar regras de automação', async () => {
      automationRuleMock.findMany.mockResolvedValue([baseRule]);
      const result = await service.getRules();
      expect(result).toBeDefined();
    });
  });

  describe('getRule', () => {
    it('deve retornar regra por id', async () => {
      automationRuleMock.findUnique.mockResolvedValue(baseRule);
      const result = await service.getRule(1);
      expect(result).toBeDefined();
    });
    it('deve lançar NotFoundException', async () => {
      automationRuleMock.findUnique.mockResolvedValue(null);
      await expect(service.getRule(99)).rejects.toThrow(NotFoundException);
    });
  });

  describe('toggleRule', () => {
    it('deve alternar estado da regra', async () => {
      automationRuleMock.findUnique.mockResolvedValue(baseRule);
      automationRuleMock.update.mockResolvedValue({ ...baseRule, active: false });
      const result = await service.toggleRule(1);
      expect(result).toBeDefined();
    });
  });

  // ─── createRule ───────────────────────────────────────────────────────────

  describe('createRule', () => {
    it('deve criar regra de automação', async () => {
      automationRuleMock.create.mockResolvedValue({
        ...baseRule,
        id: 2,
        name: 'Nova Regra',
      });
      const result = await service.createRule({
        name: 'Nova Regra',
        trigger: 'COURSE_COMPLETED',
        actions: [],
      } as any);
      expect(result).toBeDefined();
    });
  });

  // ─── updateRule ───────────────────────────────────────────────────────────

  describe('updateRule', () => {
    it('deve actualizar regra', async () => {
      automationRuleMock.findUnique.mockResolvedValue(baseRule);
      automationRuleMock.update.mockResolvedValue({ ...baseRule, name: 'Actualizado' });
      const result = await service.updateRule(1, { name: 'Actualizado' } as any);
      expect(result).toBeDefined();
    });
  });

  // ─── deleteRule ───────────────────────────────────────────────────────────

  describe('deleteRule', () => {
    it('deve eliminar regra', async () => {
      automationRuleMock.findUnique.mockResolvedValue(baseRule);
      const result = await service.deleteRule(1);
      expect(result).toBeDefined();
    });
  });

  // ─── cloneRule ────────────────────────────────────────────────────────────

  describe('cloneRule', () => {
    it('deve clonar regra', async () => {
      automationRuleMock.findUnique.mockResolvedValue({
        ...baseRule,
        conditions: [],
        actions: [],
      });
      automationRuleMock.create.mockResolvedValue({ ...baseRule, id: 3, name: '[COPY] Auto Badge' });
      const result = await service.cloneRule(1);
      expect(result).toBeDefined();
    });
  });

  // ─── triggerEvent ─────────────────────────────────────────────────────────

  describe('triggerEvent', () => {
    it('deve processar evento de automação', async () => {
      automationRuleMock.findMany.mockResolvedValue([]);
      const result = await service.triggerEvent({
        trigger: 'COURSE_COMPLETED',
        userId: 1,
        data: { courseId: 1 },
      } as any);
      expect(result).toBeDefined();
    });
  });

  // ─── getStats ─────────────────────────────────────────────────────────────

  describe('getStats', () => {
    it('deve retornar estatísticas de automação', async () => {
      const result = await service.getStats();
      expect(result).toBeDefined();
    });
  });

  // ─── getTemplates ─────────────────────────────────────────────────────────

  describe('getTemplates', () => {
    it('deve retornar templates de automação', async () => {
      const result = await service.getTemplates();
      expect(result).toBeDefined();
    });
  });

  // ─── getExecutions ────────────────────────────────────────────────────────

  describe('getExecutions', () => {
    it('deve retornar execuções de regras', async () => {
      const result = await service.getExecutions({});
      expect(result).toBeDefined();
    });
  });
});
