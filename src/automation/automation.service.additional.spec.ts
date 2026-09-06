import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { AutomationService } from './automation.service';
import { PrismaService } from '../prisma/prisma.service';
import { EnrollmentsService } from '../enrollments/enrollments.service';
import { DevelopmentPlansService } from '../development-plans/development-plans.service';
import { GamificationService } from '../gamification/gamification.service';

const mockEnrollments = { enroll: jest.fn().mockResolvedValue({ id: 1 }) };
const mockDevPlans = { create: jest.fn().mockResolvedValue({ id: 1, status: 'DRAFT' }) };
const mockGamification = {
  awardPoints: jest.fn().mockResolvedValue(undefined),
  awardBadge: jest.fn().mockResolvedValue(undefined),
};

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
    count: jest.fn().mockResolvedValue(0),
    groupBy: jest.fn().mockResolvedValue([]),
  },
  automationExecution: makeExec(),
  notificationLog: { create: jest.fn().mockResolvedValue({}) },
  user: { findMany: jest.fn().mockResolvedValue([]) },
  enrollment: { findMany: jest.fn().mockResolvedValue([]) },
  historyRecord: { count: jest.fn().mockResolvedValue(0) },
  payslip: { count: jest.fn().mockResolvedValue(0) },
  auditLog: { create: jest.fn().mockResolvedValue({}) },
  badge: { findFirst: jest.fn().mockResolvedValue(null) },
  badgeAward: { create: jest.fn().mockResolvedValue({}) },
  developmentPlan: { create: jest.fn().mockResolvedValue({}) },
  userPoints: { upsert: jest.fn().mockResolvedValue({}) },
  tenantConfig: {
    findFirst: jest.fn().mockResolvedValue({ id: 'tenant-1' }),
    create: jest.fn().mockResolvedValue({ id: 'tenant-1' }),
  },
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
    Object.defineProperty(mockPrisma, 'read', {
      get() {
        return mockPrisma;
      },
      configurable: true,
    });
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AutomationService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: EnrollmentsService, useValue: mockEnrollments },
        { provide: DevelopmentPlansService, useValue: mockDevPlans },
        { provide: GamificationService, useValue: mockGamification },
      ],
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

  // ─── J-a: executeAction delega nos serviços de domínio ────────

  describe('J-a — executeAction delega nos serviços de domínio', () => {
    beforeEach(() => {
      mockPrisma.automationExecution.create.mockResolvedValue({ id: 'exec-1' });
    });

    const ruleFor = (action: string, actionParams: Record<string, unknown>) => ({
      ...baseRule,
      action,
      condition: '',
      actionParams: JSON.stringify(actionParams),
    });

    it('ASSIGN_COURSE delega em EnrollmentsService.enroll e não escreve prisma.enrollment', async () => {
      mockPrisma.automationRule.findMany.mockResolvedValue([
        ruleFor('assign_course', { courseId: 5 }),
      ]);
      const res = (await service.triggerEvent({
        event: 'COURSE_COMPLETED' as any,
        userId: 10,
        payload: {},
      })) as any;
      expect(mockEnrollments.enroll).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 10, courseId: 5 }),
      );
      expect(res.results[0].status).toBe('SUCCESS');
    });

    it('ASSIGN_COURSE — erro de domínio (matrícula duplicada) → acção FAILED, sem propagar 500', async () => {
      mockPrisma.automationRule.findMany.mockResolvedValue([
        ruleFor('assign_course', { courseId: 5 }),
      ]);
      mockEnrollments.enroll.mockRejectedValueOnce(
        new ConflictException('Utilizador já tem matrícula activa neste curso'),
      );
      const res = (await service.triggerEvent({
        event: 'COURSE_COMPLETED' as any,
        userId: 10,
        payload: {},
      })) as any;
      expect(res.results[0].status).toBe('FAILED');
      expect(res.results[0].error).toMatch(/matrícula/i);
    });

    it('ASSIGN_COURSE — curso não publicado (BadRequest do domínio) → acção FAILED', async () => {
      mockPrisma.automationRule.findMany.mockResolvedValue([
        ruleFor('assign_course', { courseId: 5 }),
      ]);
      mockEnrollments.enroll.mockRejectedValueOnce(
        new BadRequestException('Apenas cursos publicados aceitam matrículas'),
      );
      const res = (await service.triggerEvent({
        event: 'COURSE_COMPLETED' as any,
        userId: 10,
        payload: {},
      })) as any;
      expect(res.results[0].status).toBe('FAILED');
    });

    it('CREATE_PDI delega em DevelopmentPlansService.create (entra em DRAFT/aprovação)', async () => {
      mockPrisma.automationRule.findMany.mockResolvedValue([
        ruleFor('create_pdi', { name: 'PDI X' }),
      ]);
      await service.triggerEvent({ event: 'EVALUATION_SUBMITTED' as any, userId: 10, payload: {} });
      expect(mockDevPlans.create).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 10, name: 'PDI X' }),
      );
      expect(mockPrisma.developmentPlan.create).not.toHaveBeenCalled();
    });

    it('AWARD_POINTS delega em GamificationService.awardPoints', async () => {
      mockPrisma.automationRule.findMany.mockResolvedValue([
        ruleFor('award_points', { points: 50 }),
      ]);
      await service.triggerEvent({ event: 'COURSE_COMPLETED' as any, userId: 10, payload: {} });
      expect(mockGamification.awardPoints).toHaveBeenCalledWith(10, 50, 'automation');
      expect(mockPrisma.userPoints.upsert).not.toHaveBeenCalled();
    });

    it('AWARD_BADGE delega em GamificationService.awardBadge', async () => {
      mockPrisma.automationRule.findMany.mockResolvedValue([
        ruleFor('award_badge', { badgeCode: 'COURSE_COMPLETE' }),
      ]);
      await service.triggerEvent({ event: 'COURSE_COMPLETED' as any, userId: 10, payload: {} });
      expect(mockGamification.awardBadge).toHaveBeenCalledWith(10, 'COURSE_COMPLETE');
      expect(mockPrisma.badge.findFirst).not.toHaveBeenCalled();
      expect(mockPrisma.badgeAward.create).not.toHaveBeenCalled();
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
