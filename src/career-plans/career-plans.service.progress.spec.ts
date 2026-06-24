// src/career-plans/career-plans.service.progress.spec.ts
// Cobre métodos não testados: createSkill, getSkills, setRoleSkills, createProgressionRule,
// getProgressionRules, calculateReadiness, getMyPlan, update, activate, addGoal,
// updateGoalProgress, getProgress, getPromotions

import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { CareerPlansService } from './career-plans.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/services/audit.service';

function buildMockPrisma() {
  return {
    careerRole: {
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({}),
      update: jest.fn().mockResolvedValue({}),
    },
    careerSkill: {
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockResolvedValue({ id: 1, name: 'TypeScript', type: 'TECHNICAL' }),
    },
    careerPath: {
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockResolvedValue({}),
    },
    roleSkillRequirement: {
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      createMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    roleSkillMatrix: {
      findMany: jest.fn().mockResolvedValue([]),
      upsert: jest.fn().mockResolvedValue({ id: 1, roleCode: 'ROLE_1' }),
    },
    progressionRule: {
      create: jest.fn().mockResolvedValue({ id: 1 }),
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn().mockResolvedValue(null),
    },
    userCareerPlan: {
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn().mockResolvedValue(null),
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({ id: 1 }),
      update: jest.fn().mockResolvedValue({ id: 1 }),
      count: jest.fn().mockResolvedValue(0),
    },
    careerGoal: {
      create: jest.fn().mockResolvedValue({ id: 1 }),
      findMany: jest.fn().mockResolvedValue([]),
      update: jest.fn().mockResolvedValue({ id: 1 }),
      findUnique: jest.fn().mockResolvedValue(null),
    },
    promotionRequest: {
      create: jest.fn().mockResolvedValue({ id: 1 }),
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
      findUnique: jest.fn().mockResolvedValue(null),
      update: jest.fn().mockResolvedValue({}),
    },
    legacyEmployeeSkill: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    user: { findUnique: jest.fn().mockResolvedValue(null) },
    course: { findMany: jest.fn().mockResolvedValue([]) },
    notificationLog: { create: jest.fn().mockResolvedValue({}) },
    auditLog: { create: jest.fn().mockResolvedValue({}) },
  };
}

const mockAudit = { log: jest.fn().mockResolvedValue({}) };

const baseRole = {
  id: 1,
  name: 'Dev Senior',
  level: 3,
  department: 'TI',
  active: true,
  skillRequirements: [], // empty by default
};

const basePlan = {
  id: 1,
  userId: 5,
  targetRoleId: 1,
  status: 'ACTIVE',
  goals: [],
  readiness: null,
  user: { id: 5, fullName: 'Ana' },
  currentRole: null,
  targetRole: baseRole,
  careerPath: null,
  mentor: null,
  _count: { goals: 0 },
};

describe('CareerPlansService (progress)', () => {
  let service: CareerPlansService;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockPrisma = buildMockPrisma();

    Object.defineProperty(mockPrisma, 'read', {
      get() {
        return mockPrisma;
      },
      configurable: true,
    });
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CareerPlansService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AuditService, useValue: mockAudit },
      ],
    }).compile();

    service = module.get<CareerPlansService>(CareerPlansService);
  });

  // ─── createSkill ──────────────────────────────────────────────────────────

  describe('createSkill', () => {
    it('deve criar nova skill de carreira', async () => {
      const result = await service.createSkill({ name: 'TypeScript', type: 'TECHNICAL' } as any);
      expect(result).toBeDefined();
      expect(mockPrisma.careerSkill.create).toHaveBeenCalled();
    });
  });

  // ─── getSkills ────────────────────────────────────────────────────────────

  describe('getSkills', () => {
    it('deve retornar todas as skills activas', async () => {
      mockPrisma.careerSkill.findMany.mockResolvedValue([
        { id: 1, name: 'TypeScript', type: 'TECHNICAL' },
      ]);
      const result = (await service.getSkills()) as any[];
      expect(result).toHaveLength(1);
    });

    it('deve filtrar por type', async () => {
      mockPrisma.careerSkill.findMany.mockResolvedValue([]);
      await service.getSkills('SOFT');
      expect(mockPrisma.careerSkill.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ type: 'SOFT' }) }),
      );
    });
  });

  // ─── setRoleSkills ────────────────────────────────────────────────────────

  describe('setRoleSkills', () => {
    it('deve definir competências da role', async () => {
      mockPrisma.careerRole.findUnique.mockResolvedValue({ ...baseRole, skillRequirements: [] });
      mockPrisma.roleSkillMatrix.upsert.mockResolvedValue({ id: 1 });

      await service.setRoleSkills({
        roleId: 1,
        skills: [{ skillId: 5, requiredLevel: 3, weight: 1, mandatory: true }],
      } as any);

      expect(mockPrisma.roleSkillRequirement.deleteMany).toHaveBeenCalled();
      expect(mockPrisma.roleSkillMatrix.upsert).toHaveBeenCalled();
      expect(mockPrisma.roleSkillRequirement.createMany).toHaveBeenCalled();
    });
  });

  // ─── createProgressionRule ────────────────────────────────────────────────

  describe('createProgressionRule', () => {
    it('deve criar regra de progressão', async () => {
      mockPrisma.progressionRule.create.mockResolvedValue({ id: 1, fromRoleId: 1, toRoleId: 2 });
      const result = await service.createProgressionRule({
        fromRoleId: 1,
        toRoleId: 2,
      } as any);
      expect(result).toBeDefined();
      expect(mockPrisma.progressionRule.create).toHaveBeenCalled();
    });
  });

  // ─── getProgressionRules ──────────────────────────────────────────────────

  describe('getProgressionRules', () => {
    it('deve retornar regras de progressão', async () => {
      mockPrisma.progressionRule.findMany.mockResolvedValue([{ id: 1 }, { id: 2 }]);
      const result = (await service.getProgressionRules()) as any[];
      expect(result).toHaveLength(2);
    });

    it('deve filtrar por fromRoleId', async () => {
      mockPrisma.progressionRule.findMany.mockResolvedValue([]);
      await service.getProgressionRules(5);
      expect(mockPrisma.progressionRule.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ fromRoleId: 5 }) }),
      );
    });
  });

  // ─── calculateReadiness ───────────────────────────────────────────────────

  describe('calculateReadiness', () => {
    it('deve retornar score 100 se role não tem requisitos de skills', async () => {
      mockPrisma.careerRole.findUnique.mockResolvedValue({ ...baseRole, skillRequirements: [] });
      mockPrisma.legacyEmployeeSkill.findMany.mockResolvedValue([]);

      const result = (await service.calculateReadiness(5, 1)) as any;
      expect(result.score).toBe(100);
      expect(result.readinessLevel).toBe('READY');
      expect(result.skillGaps).toHaveLength(0);
    });

    it('deve calcular readiness com gaps', async () => {
      const roleWithRequirements = {
        ...baseRole,
        skillRequirements: [
          {
            skillId: 10,
            requiredLevel: 4,
            weight: 1,
            mandatory: true,
            skill: { id: 10, name: 'TypeScript', type: 'TECHNICAL' },
          },
          {
            skillId: 11,
            requiredLevel: 3,
            weight: 1,
            mandatory: false,
            skill: { id: 11, name: 'React', type: 'TECHNICAL' },
          },
        ],
      };
      mockPrisma.careerRole.findUnique.mockResolvedValue(roleWithRequirements);
      mockPrisma.legacyEmployeeSkill.findMany.mockResolvedValue([
        { skillId: 10, currentLevel: 2, skill: { id: 10 } }, // gap=2 (mandatory)
      ]);

      const result = (await service.calculateReadiness(5, 1)) as any;
      expect(result.score).toBeLessThan(100);
      expect(result.missingSkills).toHaveLength(1); // mandatory gap
      expect(result.skillGaps).toHaveLength(1); // non-mandatory gap
    });

    it('deve retornar nível READY quando score >= 80', async () => {
      const roleWithReq = {
        ...baseRole,
        skillRequirements: [
          {
            skillId: 5,
            requiredLevel: 3,
            weight: 1,
            mandatory: false,
            skill: { id: 5, name: 'Go', type: 'TECHNICAL' },
          },
        ],
      };
      mockPrisma.careerRole.findUnique.mockResolvedValue(roleWithReq);
      // User has level 3 → meets requirement → score 100
      mockPrisma.legacyEmployeeSkill.findMany.mockResolvedValue([{ skillId: 5, currentLevel: 3 }]);
      const result = (await service.calculateReadiness(5, 1)) as any;
      expect(result.readinessLevel).toBe('READY');
    });
  });

  // ─── getMyPlan ────────────────────────────────────────────────────────────

  describe('getMyPlan', () => {
    it('deve retornar null se utilizador não tem plano activo', async () => {
      mockPrisma.userCareerPlan.findFirst.mockResolvedValue(null);
      const result = await service.getMyPlan(5);
      expect(result).toBeNull();
    });

    it('deve retornar plano activo sem targetRoleId sem calcular readiness', async () => {
      mockPrisma.userCareerPlan.findFirst.mockResolvedValue({ ...basePlan, targetRoleId: null });
      const result = (await service.getMyPlan(5)) as any;
      expect(result.readiness).toBeNull();
      expect(mockPrisma.careerRole.findUnique).not.toHaveBeenCalled();
    });
  });

  // ─── update ───────────────────────────────────────────────────────────────

  describe('update', () => {
    it('deve actualizar plano de carreira', async () => {
      mockPrisma.userCareerPlan.findUnique.mockResolvedValue(basePlan);
      mockPrisma.userCareerPlan.update.mockResolvedValue({ ...basePlan, title: 'Actualizado' });
      const result = await service.update(1, { title: 'Actualizado' } as any, 9);
      expect(result).toBeDefined();
      expect(mockPrisma.userCareerPlan.update).toHaveBeenCalled();
    });
  });

  // ─── activate ─────────────────────────────────────────────────────────────

  describe('activate', () => {
    it('deve activar plano de carreira', async () => {
      mockPrisma.userCareerPlan.findUnique.mockResolvedValue(basePlan);
      mockPrisma.userCareerPlan.update.mockResolvedValue({ ...basePlan, status: 'ACTIVE' });
      const result = await service.activate(1, 9);
      expect(result).toBeDefined();
      expect(mockPrisma.userCareerPlan.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 1 },
          data: expect.objectContaining({ status: 'ACTIVE' }),
        }),
      );
    });
  });

  // ─── addGoal ──────────────────────────────────────────────────────────────

  describe('addGoal', () => {
    it('deve adicionar meta ao plano de carreira', async () => {
      mockPrisma.careerGoal.create.mockResolvedValue({ id: 1, progress: 0 });
      const result = await service.addGoal({
        planId: 1,
        title: 'Completar certificação',
        dueDate: '2026-12-31',
      } as any);
      expect(result).toBeDefined();
      expect(mockPrisma.careerGoal.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'PENDING', progress: 0 }),
        }),
      );
    });
  });

  // ─── updateGoalProgress ───────────────────────────────────────────────────

  describe('updateGoalProgress', () => {
    it('deve lançar NotFoundException se meta não encontrada', async () => {
      mockPrisma.careerGoal.findUnique.mockResolvedValue(null);
      await expect(service.updateGoalProgress(99, { progress: 50 } as any, 5)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('deve marcar meta como COMPLETED quando progresso = 100', async () => {
      mockPrisma.careerGoal.findUnique.mockResolvedValue({
        id: 1,
        planId: 1,
        status: 'IN_PROGRESS',
      });
      mockPrisma.careerGoal.update.mockResolvedValue({ id: 1, progress: 100, status: 'COMPLETED' });

      await service.updateGoalProgress(1, { progress: 100 } as any, 5);

      expect(mockPrisma.careerGoal.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'COMPLETED', progress: 100 }),
        }),
      );
    });

    it('deve marcar meta como IN_PROGRESS quando progresso > 0 e < 100', async () => {
      mockPrisma.careerGoal.findUnique.mockResolvedValue({ id: 1, planId: 1, status: 'PENDING' });
      mockPrisma.careerGoal.update.mockResolvedValue({
        id: 1,
        progress: 50,
        status: 'IN_PROGRESS',
      });

      await service.updateGoalProgress(1, { progress: 50 } as any, 5);

      expect(mockPrisma.careerGoal.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'IN_PROGRESS' }),
        }),
      );
    });

    it('deve manter status PENDING quando progresso = 0', async () => {
      mockPrisma.careerGoal.findUnique.mockResolvedValue({ id: 1, planId: 1, status: 'PENDING' });
      mockPrisma.careerGoal.update.mockResolvedValue({ id: 1, progress: 0, status: 'PENDING' });

      await service.updateGoalProgress(1, { progress: 0 } as any, 5);

      expect(mockPrisma.careerGoal.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'PENDING' }),
        }),
      );
    });
  });

  // ─── getProgress ──────────────────────────────────────────────────────────

  describe('getProgress', () => {
    it('deve calcular progresso do plano com metas', async () => {
      const planWithGoals = {
        ...basePlan,
        goals: [
          { id: 1, status: 'COMPLETED', progress: 100 },
          { id: 2, status: 'IN_PROGRESS', progress: 50 },
          { id: 3, status: 'PENDING', progress: 0 },
        ],
      };
      mockPrisma.userCareerPlan.findUnique.mockResolvedValue(planWithGoals);

      const result = (await service.getProgress(1)) as any;
      expect(result.total).toBe(3);
      expect(result.completed).toBe(1);
      expect(result.inProgress).toBe(1);
      expect(result.pending).toBe(1);
      expect(result.progress).toBe(33); // 1/3 * 100 ≈ 33%
    });

    it('deve retornar progresso 0 se sem metas', async () => {
      mockPrisma.userCareerPlan.findUnique.mockResolvedValue({ ...basePlan, goals: [] });
      const result = (await service.getProgress(1)) as any;
      expect(result.progress).toBe(0);
      expect(result.total).toBe(0);
    });
  });

  // ─── getPromotions ────────────────────────────────────────────────────────

  describe('getPromotions', () => {
    it('deve retornar lista de pedidos de promoção paginada', async () => {
      mockPrisma.promotionRequest.findMany.mockResolvedValue([
        { id: 1, userId: 5, status: 'PENDING', user: { fullName: 'Ana' } },
      ]);
      mockPrisma.promotionRequest.count.mockResolvedValue(1);

      const result = (await service.getPromotions({ page: 1, limit: 10 } as any)) as any;
      expect(result.data).toHaveLength(1);
      expect(result.meta.total).toBe(1);
    });

    it('deve filtrar por userId e status', async () => {
      mockPrisma.promotionRequest.findMany.mockResolvedValue([]);
      mockPrisma.promotionRequest.count.mockResolvedValue(0);

      await service.getPromotions({ userId: 5, status: 'PENDING' } as any);

      expect(mockPrisma.promotionRequest.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ userId: 5, status: 'PENDING' }),
        }),
      );
    });
  });
});
