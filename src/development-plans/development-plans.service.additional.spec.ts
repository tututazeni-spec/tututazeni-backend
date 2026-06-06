import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { DevelopmentPlansService } from './development-plans.service';
import { PrismaService } from '../prisma/prisma.service';

const mockPrisma: any = {
  developmentPlan: {
    findMany: jest.fn().mockResolvedValue([]),
    findFirst: jest.fn().mockResolvedValue(null),
    findUnique: jest.fn().mockResolvedValue(null),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    count: jest.fn().mockResolvedValue(0),
  },
  developmentPlanAction: {
    findMany: jest.fn().mockResolvedValue([]),
    findUnique: jest.fn().mockResolvedValue(null),
    findFirst: jest.fn().mockResolvedValue(null),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  planGoal: {
    findMany: jest.fn().mockResolvedValue([]),
    findUnique: jest.fn().mockResolvedValue(null),
    create: jest.fn(),
    update: jest.fn(),
  },
  planCheckpoint: {
    findMany: jest.fn().mockResolvedValue([]),
    findUnique: jest.fn().mockResolvedValue(null),
    create: jest.fn(),
    update: jest.fn(),
  },
  actionEvidence: { create: jest.fn() },
  notificationLog: { create: jest.fn().mockResolvedValue({}) },
  auditLog: { create: jest.fn().mockResolvedValue({}) },
  user: { findUnique: jest.fn().mockResolvedValue(null) },
};

const basePlan = {
  id: 1, userId: 2, managerId: 1, status: 'DRAFT', priority: 'MEDIUM',
  title: 'Plano de Desenvolvimento 2026',
  actions: [], goals: [], checkpoints: [],
  _count: { actions: 0, goals: 0, checkpoints: 0 },
  user: { id: 2, fullName: 'Colaborador', email: 'colab@innova.com', avatarUrl: null, position: { name: 'Dev', level: 2 }, department: { name: 'TI' } },
  manager: { id: 1, fullName: 'Gestor', avatarUrl: null },
};

describe('DevelopmentPlansService (additional)', () => {
  let service: DevelopmentPlansService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [DevelopmentPlansService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();
    service = module.get<DevelopmentPlansService>(DevelopmentPlansService);
  });

  // ─── findAll ──────────────────────────────────────────────────

  describe('findAll', () => {
    it('deve retornar planos paginados com progresso calculado', async () => {
      const planWithActions = {
        ...basePlan,
        actions: [{ id: 1, status: 'COMPLETED' }, { id: 2, status: 'PENDING' }],
        goals: [{ id: 1, progress: 60 }, { id: 2, progress: 80 }],
      };
      mockPrisma.developmentPlan.findMany.mockResolvedValue([planWithActions]);
      mockPrisma.developmentPlan.count.mockResolvedValue(1);
      const result = await service.findAll({ page: 1, limit: 10 });
      expect(result.data).toHaveLength(1);
      expect(result.data[0].actionProgress).toBe(50);
      expect(result.data[0].avgGoalProgress).toBe(70);
    });

    it('deve filtrar por userId, managerId, status, priority', async () => {
      mockPrisma.developmentPlan.findMany.mockResolvedValue([]);
      mockPrisma.developmentPlan.count.mockResolvedValue(0);
      await service.findAll({ userId: 1, managerId: 2, status: 'ACTIVE' as any, priority: 'HIGH' as any });
      expect(mockPrisma.developmentPlan.findMany).toHaveBeenCalled();
    });

    it('deve filtrar planos em atraso', async () => {
      mockPrisma.developmentPlan.findMany.mockResolvedValue([]);
      mockPrisma.developmentPlan.count.mockResolvedValue(0);
      await service.findAll({ overdue: true });
      expect(mockPrisma.developmentPlan.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ endDate: { lt: expect.any(Date) } }) }),
      );
    });

    it('deve retornar 0% progresso quando sem acções', async () => {
      mockPrisma.developmentPlan.findMany.mockResolvedValue([{ ...basePlan, actions: [], goals: [] }]);
      mockPrisma.developmentPlan.count.mockResolvedValue(1);
      const result = await service.findAll({});
      expect(result.data[0].actionProgress).toBe(0);
      expect(result.data[0].avgGoalProgress).toBe(0);
    });
  });

  // ─── findOne ──────────────────────────────────────────────────

  describe('findOne', () => {
    it('deve retornar plano por id', async () => {
      mockPrisma.developmentPlan.findUnique.mockResolvedValue(basePlan);
      const result = await service.findOne(1);
      expect(result).toBeDefined();
    });

    it('deve lançar NotFoundException se plano não existe', async () => {
      mockPrisma.developmentPlan.findUnique.mockResolvedValue(null);
      await expect(service.findOne(99)).rejects.toThrow(NotFoundException);
    });
  });

  // ─── create ───────────────────────────────────────────────────

  describe('create', () => {
    it('deve criar plano de desenvolvimento', async () => {
      mockPrisma.developmentPlan.create.mockResolvedValue(basePlan);
      const result = await service.create({ title: 'Plano 2026', userId: 2 } as any, 1);
      expect(result).toBeDefined();
    });
  });

  // ─── update ───────────────────────────────────────────────────

  describe('update', () => {
    it('deve actualizar plano em DRAFT', async () => {
      mockPrisma.developmentPlan.findUnique.mockResolvedValue({ ...basePlan, managerId: 1 });
      mockPrisma.developmentPlan.update.mockResolvedValue({ ...basePlan, title: 'Actualizado' });
      const result = await service.update(1, { title: 'Actualizado' } as any, 1);
      expect(result).toBeDefined();
    });

    it('deve lançar NotFoundException se plano não existe', async () => {
      mockPrisma.developmentPlan.findUnique.mockResolvedValue(null);
      await expect(service.update(99, {} as any, 1)).rejects.toThrow(NotFoundException);
    });
  });

  // ─── approve ──────────────────────────────────────────────────

  describe('approve', () => {
    it('deve aprovar plano pendente', async () => {
      mockPrisma.developmentPlan.findUnique.mockResolvedValue({ ...basePlan, status: 'PENDING_APPROVAL', managerId: 1 });
      mockPrisma.developmentPlan.update.mockResolvedValue({ ...basePlan, status: 'ACTIVE' });
      mockPrisma.notificationLog.create.mockResolvedValue({});
      const result = await service.approve(1, { approved: true, feedback: 'Aprovado' }, 1);
      expect(result).toBeDefined();
    });

    it('deve rejeitar plano e notificar utilizador', async () => {
      mockPrisma.developmentPlan.findUnique.mockResolvedValue({ ...basePlan, status: 'PENDING_APPROVAL', managerId: 1 });
      mockPrisma.developmentPlan.update.mockResolvedValue({ ...basePlan, status: 'REJECTED' });
      mockPrisma.notificationLog.create.mockResolvedValue({});
      const result = await service.approve(1, { approved: false, feedback: 'Precisa de revisão' }, 1);
      expect(result).toBeDefined();
    });
  });

  // ─── addAction ────────────────────────────────────────────────

  describe('addAction', () => {
    it('deve adicionar acção ao plano', async () => {
      mockPrisma.developmentPlan.findUnique.mockResolvedValue(basePlan);
      mockPrisma.developmentPlanAction.create.mockResolvedValue({ id: 1, planId: 1, title: 'Acção 1' });
      const result = await service.addAction(1, { title: 'Acção 1', type: 'COURSE' as any } as any, 1);
      expect(result).toBeDefined();
    });
  });

  // ─── updateAction ─────────────────────────────────────────────

  describe('updateAction', () => {
    it('deve actualizar acção', async () => {
      mockPrisma.developmentPlanAction.findUnique.mockResolvedValue({ id: 1, planId: 1, status: 'PENDING' });
      mockPrisma.developmentPlanAction.update.mockResolvedValue({ id: 1, status: 'IN_PROGRESS' });
      const result = await service.updateAction(1, { status: 'IN_PROGRESS' } as any, 1);
      expect(result).toBeDefined();
    });

    it('deve lançar NotFoundException se acção não existe', async () => {
      mockPrisma.developmentPlanAction.findUnique.mockResolvedValue(null);
      await expect(service.updateAction(99, {} as any, 1)).rejects.toThrow(NotFoundException);
    });
  });

  // ─── addEvidence ──────────────────────────────────────────────

  describe('addEvidence', () => {
    it('deve adicionar evidência a uma acção', async () => {
      mockPrisma.developmentPlanAction.findUnique.mockResolvedValue({ id: 1 });
      mockPrisma.actionEvidence.create.mockResolvedValue({ id: 1, actionId: 1 });
      const result = await service.addEvidence(1, { description: 'Certificado concluído', type: 'CERTIFICATE' as any } as any, 1);
      expect(result).toBeDefined();
    });
  });

  // ─── addGoal ──────────────────────────────────────────────────

  describe('addGoal', () => {
    it('deve adicionar objectivo ao plano', async () => {
      mockPrisma.developmentPlan.findUnique.mockResolvedValue(basePlan);
      mockPrisma.planGoal.create.mockResolvedValue({ id: 1, planId: 1, title: 'Objectivo 1' });
      const result = await service.addGoal(1, { title: 'Objectivo 1' } as any, 1);
      expect(result).toBeDefined();
    });
  });

  // ─── updateGoalProgress ───────────────────────────────────────

  describe('updateGoalProgress', () => {
    it('deve actualizar progresso do objectivo', async () => {
      mockPrisma.planGoal.findUnique.mockResolvedValue({ id: 1, planId: 1 });
      mockPrisma.planGoal.update.mockResolvedValue({ id: 1, progress: 80 });
      const result = await service.updateGoalProgress(1, { progress: 80, notes: 'A progredir' }, 1);
      expect(result).toBeDefined();
    });
  });

  // ─── addCheckpoint ────────────────────────────────────────────

  describe('addCheckpoint', () => {
    it('deve adicionar checkpoint ao plano', async () => {
      mockPrisma.developmentPlan.findUnique.mockResolvedValue(basePlan);
      mockPrisma.planCheckpoint.create.mockResolvedValue({ id: 1, planId: 1 });
      const result = await service.addCheckpoint(1, { title: 'Checkpoint 1', scheduledDate: '2026-06-01' } as any, 1);
      expect(result).toBeDefined();
    });
  });

  // ─── getMyPlans ───────────────────────────────────────────────

  describe('getMyPlans', () => {
    it('deve retornar planos do utilizador', async () => {
      mockPrisma.developmentPlan.findMany.mockResolvedValue([basePlan]);
      const result = await service.getMyPlans(1);
      expect(result).toBeDefined();
    });
  });

  // ─── getStats ────────────────────────────────────────────────

  describe('getStats', () => {
    it('deve retornar estatísticas dos planos', async () => {
      mockPrisma.developmentPlan.findMany.mockResolvedValue([]);
      mockPrisma.developmentPlan.count.mockResolvedValue(0);
      const result = await service.getStats({});
      expect(result).toBeDefined();
    });
  });
});
