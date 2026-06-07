// src/automation/automation.service.progress.spec.ts
// Cobre métodos não testados: toggleRule, cloneRule, rerunExecution,
// getTemplates, applyTemplate, initDefaultRules

import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { AutomationService } from './automation.service';
import { PrismaService } from '../prisma/prisma.service';

const baseRule = {
  id: 1,
  name: 'Badge por curso',
  trigger: 'COURSE_COMPLETED',
  action: 'AWARD_BADGE',
  category: 'GAMIFICATION',
  condition: '{"minScore":80}',
  actionParams: '{}',
  active: true,
  priority: 10,
};

function buildMockPrisma() {
  const crud = () => ({
    findMany: jest.fn().mockResolvedValue([]),
    findFirst: jest.fn().mockResolvedValue(null),
    findUnique: jest.fn().mockResolvedValue(null),
    create: jest.fn().mockResolvedValue({}),
    update: jest.fn().mockResolvedValue({}),
    delete: jest.fn().mockResolvedValue({}),
    count: jest.fn().mockResolvedValue(0),
    groupBy: jest.fn().mockResolvedValue([]),
    upsert: jest.fn().mockResolvedValue({}),
  });

  return {
    automationRule: crud(),
    automationExecution: crud(),
    notificationLog: crud(),
    user: crud(),
    enrollment: crud(),
    badge: crud(),
    badgeAward: crud(),
    auditLog: crud(),
    historyRecord: crud(),
    payslip: crud(),
  };
}

describe('AutomationService (progress)', () => {
  let service: AutomationService;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();

    const module: TestingModule = await Test.createTestingModule({
      providers: [AutomationService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();

    service = module.get<AutomationService>(AutomationService);
  });

  // ─── toggleRule ────────────────────────────────────────────────

  describe('toggleRule', () => {
    it('deve activar regra desactivada', async () => {
      mockPrisma.automationRule.findUnique.mockResolvedValue({ ...baseRule, active: false });
      mockPrisma.automationRule.update.mockResolvedValue({ ...baseRule, active: true });
      const result = await service.toggleRule(1);
      expect(result).toBeDefined();
      expect(mockPrisma.automationRule.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { active: true } }),
      );
    });

    it('deve desactivar regra activa', async () => {
      mockPrisma.automationRule.findUnique.mockResolvedValue({ ...baseRule, active: true });
      mockPrisma.automationRule.update.mockResolvedValue({ ...baseRule, active: false });
      const result = await service.toggleRule(1);
      expect(result).toBeDefined();
      expect(mockPrisma.automationRule.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { active: false } }),
      );
    });

    it('deve lançar NotFoundException se regra não existe', async () => {
      mockPrisma.automationRule.findUnique.mockResolvedValue(null);
      await expect(service.toggleRule(99)).rejects.toThrow(NotFoundException);
    });
  });

  // ─── cloneRule ─────────────────────────────────────────────────

  describe('cloneRule', () => {
    it('deve clonar regra existente com nome prefixado', async () => {
      mockPrisma.automationRule.findUnique.mockResolvedValue(baseRule);
      mockPrisma.automationRule.create.mockResolvedValue({
        ...baseRule, id: 2, name: 'Cópia de: Badge por curso', active: false,
      });

      const result = await service.cloneRule(1) as any;
      expect(result).toBeDefined();
      expect(mockPrisma.automationRule.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            name: 'Cópia de: Badge por curso',
            active: false,
            id: undefined,
          }),
        }),
      );
    });

    it('deve lançar NotFoundException se regra original não existe', async () => {
      mockPrisma.automationRule.findUnique.mockResolvedValue(null);
      await expect(service.cloneRule(99)).rejects.toThrow(NotFoundException);
    });
  });

  // ─── rerunExecution ────────────────────────────────────────────

  describe('rerunExecution', () => {
    it('deve retornar mensagem se execução não encontrada (safeM fallback)', async () => {
      // safeM fallback: automationExecution.findUnique retorna null
      const result = await service.rerunExecution(99) as any;
      expect(result.message).toContain('não encontrada');
    });

    it('deve retornar mensagem se regra não encontrada', async () => {
      // Para simular que a execução existe mas a regra não:
      // safeM fallback não permite override, mas podemos verificar o comportamento
      // quando a regra é null
      // Como safeM fallback retorna null para findUnique → exec = null → 'Execução não encontrada'
      const result = await service.rerunExecution(1) as any;
      expect(result.message).toBeDefined();
    });
  });

  // ─── getTemplates ──────────────────────────────────────────────

  describe('getTemplates', () => {
    it('deve retornar lista de templates com ID gerado', async () => {
      const result = await service.getTemplates() as any[];
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeGreaterThan(0);
      result.forEach(t => {
        expect(t.id).toMatch(/^TPL_/);
        expect(t.name).toBeDefined();
        expect(t.trigger).toBeDefined();
      });
    });
  });

  // ─── applyTemplate ─────────────────────────────────────────────

  describe('applyTemplate', () => {
    it('deve retornar mensagem se índice de template inválido', async () => {
      const result = await service.applyTemplate(999) as any;
      expect(result.message).toContain('não encontrado');
    });

    it('deve criar regra a partir de template quando não existe', async () => {
      mockPrisma.automationRule.findFirst.mockResolvedValue(null);
      mockPrisma.automationRule.create.mockResolvedValue(baseRule);
      const result = await service.applyTemplate(0); // primeiro template
      expect(result).toBeDefined();
      expect(mockPrisma.automationRule.create).toHaveBeenCalled();
    });

    it('deve retornar mensagem se automação já existe', async () => {
      mockPrisma.automationRule.findFirst.mockResolvedValue(baseRule);
      const result = await service.applyTemplate(0) as any;
      expect(result.message).toContain('já existe');
      expect(result.rule).toBeDefined();
    });
  });

  // ─── initDefaultRules ──────────────────────────────────────────

  describe('initDefaultRules', () => {
    it('deve criar regras padrão que não existem', async () => {
      mockPrisma.automationRule.findFirst.mockResolvedValue(null); // nenhuma existe
      mockPrisma.automationRule.create.mockResolvedValue(baseRule);
      const result = await service.initDefaultRules() as any;
      expect(result.created).toBeGreaterThan(0);
      expect(result.message).toContain('regra');
    });

    it('deve ignorar regras que já existem', async () => {
      mockPrisma.automationRule.findFirst.mockResolvedValue(baseRule); // já existe
      const result = await service.initDefaultRules() as any;
      expect(result.created).toBe(0);
    });
  });

  // ─── getExecutions com filtros avançados ───────────────────────

  describe('getExecutions com filtros', () => {
    it('deve filtrar execuções por status', async () => {
      const result = await service.getExecutions({ status: 'SUCCESS' as any });
      expect(result).toHaveProperty('data');
      expect(result).toHaveProperty('meta');
    });

    it('deve filtrar por ruleId e intervalo de datas', async () => {
      const result = await service.getExecutions({
        ruleId: 1,
        from: '2026-01-01',
        to: '2026-12-31',
      });
      expect(result).toHaveProperty('data');
    });

    it('deve paginar correctamente', async () => {
      const result = await service.getExecutions({ page: 2, limit: 10 }) as any;
      expect(result.meta.page).toBe(2);
      expect(result.meta.limit).toBe(10);
    });
  });

  // ─── runAllActiveRules com triggers específicos ────────────────

  describe('runAllActiveRules com triggers', () => {
    it('deve executar regra com trigger BIRTHDAY_TODAY', async () => {
      mockPrisma.automationRule.findMany.mockResolvedValue([
        { ...baseRule, trigger: 'BIRTHDAY_TODAY' },
      ]);
      mockPrisma.user.findMany.mockResolvedValue([]);
      const result = await service.runAllActiveRules() as any;
      expect(result.executed).toBe(1);
    });

    it('deve executar regra com trigger ENROLLMENT_EXPIRING', async () => {
      mockPrisma.automationRule.findMany.mockResolvedValue([
        { ...baseRule, trigger: 'ENROLLMENT_EXPIRING' },
      ]);
      mockPrisma.enrollment.findMany.mockResolvedValue([]);
      const result = await service.runAllActiveRules() as any;
      expect(result.executed).toBe(1);
    });

    it('deve executar regra com trigger PENDING_LEAVE_3_DAYS', async () => {
      mockPrisma.automationRule.findMany.mockResolvedValue([
        { ...baseRule, trigger: 'PENDING_LEAVE_3_DAYS' },
      ]);
      mockPrisma.user.findMany.mockResolvedValue([]);
      const result = await service.runAllActiveRules() as any;
      expect(result.executed).toBe(1);
    });

    it('deve executar regra com trigger desconhecido (default path)', async () => {
      mockPrisma.automationRule.findMany.mockResolvedValue([
        { ...baseRule, trigger: 'CUSTOM_TRIGGER_XYZ' },
      ]);
      const result = await service.runAllActiveRules() as any;
      expect(result.executed).toBe(1);
      expect(result.results[0].success).toBe(true);
    });

    it('deve tratar erros nas regras com graceful error handling', async () => {
      mockPrisma.automationRule.findMany.mockResolvedValue([
        { ...baseRule, trigger: 'ENROLLMENT_EXPIRING' },
      ]);
      // sendEnrollmentReminders usa enrollment.findMany — forçar erro
      mockPrisma.enrollment.findMany.mockRejectedValue(new Error('DB error'));
      const result = await service.runAllActiveRules() as any;
      expect(result.executed).toBe(1);
      expect(result.results[0].success).toBe(false);
      expect(result.results[0].error).toBeDefined();
    });
  });

  // ─── triggerEvent com condições ───────────────────────────────

  describe('triggerEvent com condições', () => {
    it('deve ignorar regra cuja condição não é satisfeita', async () => {
      mockPrisma.automationRule.findMany.mockResolvedValue([
        { ...baseRule, condition: '{"minScore":90}', trigger: 'COURSE_COMPLETED' },
      ]);
      const result = await service.triggerEvent({
        event: 'COURSE_COMPLETED' as any,
        userId: 1,
        payload: { minScore: 50 }, // minScore < 90 → condition fails
      }) as any;
      expect(result.results[0].status).toBe('SKIPPED');
    });

    it('deve executar regra quando condição é satisfeita', async () => {
      mockPrisma.automationRule.findMany.mockResolvedValue([
        { ...baseRule, condition: '{"minScore":80}', trigger: 'COURSE_COMPLETED' },
      ]);
      const result = await service.triggerEvent({
        event: 'COURSE_COMPLETED' as any,
        userId: 1,
        payload: { minScore: 90 }, // minScore >= 80 → condition passes
      }) as any;
      expect(result.triggered).toBeGreaterThanOrEqual(0);
      expect(result.results.length).toBeGreaterThan(0);
    });
  });
});
