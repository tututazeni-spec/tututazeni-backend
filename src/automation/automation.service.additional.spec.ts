import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { AutomationService } from './automation.service';
import { PrismaService } from '../prisma/prisma.service';

const makeExec = () => ({
  findMany: jest.fn().mockResolvedValue([]),
  count: jest.fn().mockResolvedValue(0),
  create: jest.fn().mockResolvedValue({}),
  update: jest.fn().mockResolvedValue({}),
  delete: jest.fn().mockResolvedValue({}),
});

const mockPrisma: any = {
  automationRule: {
    findMany: jest.fn().mockResolvedValue([]),
    findUnique: jest.fn().mockResolvedValue(null),
    findFirst: jest.fn().mockResolvedValue(null),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    upsert: jest.fn(),
  },
  automationExecution: makeExec(),
  notificationLog: { create: jest.fn().mockResolvedValue({}) },
  user: { findMany: jest.fn().mockResolvedValue([]) },
  enrollment: { findMany: jest.fn().mockResolvedValue([]) },
};

const baseRule = {
  id: 1,
  name: 'Badge por curso',
  trigger: 'COURSE_COMPLETED',
  action: 'AWARD_BADGE',
  category: 'GAMIFICATION',
  condition: '{"minScore":80}',
  active: true,
  priority: 10,
};

describe('AutomationService (additional)', () => {
  let service: AutomationService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [AutomationService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();
    service = module.get<AutomationService>(AutomationService);
  });

  // ─── getRules ─────────────────────────────────────────────────

  describe('getRules', () => {
    it('deve retornar regras com estatísticas', async () => {
      mockPrisma.automationRule.findMany.mockResolvedValue([baseRule]);
      mockPrisma.automationExecution.count.mockResolvedValue(5);
      const result = await service.getRules();
      expect(result).toHaveLength(1);
      expect(result[0]).toHaveProperty('stats');
      expect(result[0].stats.total).toBe(5);
    });

    it('deve filtrar por categoria', async () => {
      mockPrisma.automationRule.findMany.mockResolvedValue([]);
      await service.getRules('GAMIFICATION' as any);
      expect(mockPrisma.automationRule.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { category: 'GAMIFICATION' } }),
      );
    });
  });

  // ─── getRule ──────────────────────────────────────────────────

  describe('getRule', () => {
    it('deve retornar regra por id', async () => {
      mockPrisma.automationRule.findUnique.mockResolvedValue(baseRule);
      const result = await service.getRule(1);
      expect(result).toBeDefined();
      expect(result.name).toBe('Badge por curso');
    });

    it('deve lançar NotFoundException se regra não existe', async () => {
      mockPrisma.automationRule.findUnique.mockResolvedValue(null);
      await expect(service.getRule(99)).rejects.toThrow(NotFoundException);
    });
  });

  // ─── createRule ───────────────────────────────────────────────

  describe('createRule', () => {
    it('deve criar regra de automação', async () => {
      mockPrisma.automationRule.create.mockResolvedValue(baseRule);
      const result = await service.createRule({
        name: 'Badge por curso',
        trigger: 'COURSE_COMPLETED' as any,
        action: 'AWARD_BADGE' as any,
        category: 'GAMIFICATION' as any,
        condition: '',
        active: true,
        priority: 10,
      } as any);
      expect(result).toBeDefined();
    });
  });

  // ─── updateRule ───────────────────────────────────────────────

  describe('updateRule', () => {
    it('deve actualizar regra', async () => {
      mockPrisma.automationRule.findUnique.mockResolvedValue(baseRule);
      mockPrisma.automationRule.update.mockResolvedValue({ ...baseRule, active: false });
      const result = await service.updateRule(1, { active: false } as any);
      expect(result).toBeDefined();
    });

    it('deve lançar NotFoundException se regra não existe', async () => {
      mockPrisma.automationRule.findUnique.mockResolvedValue(null);
      await expect(service.updateRule(99, {} as any)).rejects.toThrow(NotFoundException);
    });
  });

  // ─── deleteRule ───────────────────────────────────────────────

  describe('deleteRule', () => {
    it('deve eliminar regra', async () => {
      mockPrisma.automationRule.findUnique.mockResolvedValue(baseRule);
      mockPrisma.automationRule.delete.mockResolvedValue(baseRule);
      await service.deleteRule(1);
      expect(mockPrisma.automationRule.delete).toHaveBeenCalled();
    });
  });

  // ─── getExecutions ────────────────────────────────────────────

  describe('getExecutions', () => {
    it('deve retornar histórico de execuções', async () => {
      mockPrisma.automationExecution.findMany.mockResolvedValue([]);
      const result = await service.getExecutions({});
      expect(result).toBeDefined();
    });
  });

  // ─── triggerEvent ─────────────────────────────────────────────

  describe('triggerEvent', () => {
    it('deve disparar evento e executar regras activas', async () => {
      mockPrisma.automationRule.findMany.mockResolvedValue([baseRule]);
      mockPrisma.automationExecution.create.mockResolvedValue({ id: 1 });
      await service.triggerEvent({
        event: 'COURSE_COMPLETED' as any,
        userId: 1,
        payload: { score: 90 },
      });
      expect(mockPrisma.automationRule.findMany).toHaveBeenCalled();
    });

    it('deve ignorar evento sem regras activas', async () => {
      mockPrisma.automationRule.findMany.mockResolvedValue([]);
      await service.triggerEvent({ event: 'COURSE_COMPLETED' as any, userId: 1, payload: {} });
      expect(mockPrisma.automationExecution.create).not.toHaveBeenCalled();
    });
  });

  // ─── runAllActiveRules ────────────────────────────────────────

  describe('runAllActiveRules', () => {
    it('deve correr todas as regras activas', async () => {
      mockPrisma.automationRule.findMany.mockResolvedValue([baseRule]);
      const result = await service.runAllActiveRules();
      expect(result).toBeDefined();
    });
  });

  // ─── getStats ────────────────────────────────────────────────

  describe('getStats', () => {
    it('deve retornar estatísticas das automações', async () => {
      mockPrisma.automationRule.findMany.mockResolvedValue([baseRule]);
      mockPrisma.automationExecution.count.mockResolvedValue(10);
      const result = await service.getStats();
      expect(result).toBeDefined();
    });
  });
});
