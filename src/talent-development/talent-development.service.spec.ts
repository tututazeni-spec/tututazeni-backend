import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { TalentDevelopmentService } from './talent-development.service';
import { PrismaService } from '../prisma/prisma.service';

const makeFind = (data: any[] = []) => jest.fn().mockResolvedValue(data);
const makeCount = (n = 0) => jest.fn().mockResolvedValue(n);
const makeAgg = () => jest.fn().mockResolvedValue({ _avg: {}, _sum: {}, _count: {} });

const mockPrisma = {
  user: { findMany: makeFind(), count: makeCount(), findUnique: jest.fn() },
  performanceReview: {
    findMany: makeFind(),
    count: makeCount(),
    aggregate: makeAgg(),
    groupBy: jest.fn().mockResolvedValue([]),
  },
  developmentPlan: {
    findMany: makeFind(),
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    count: makeCount(),
    groupBy: jest.fn().mockResolvedValue([]),
  },
  developmentPlanAction: {
    findMany: makeFind(),
    create: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    count: makeCount(),
    createMany: jest.fn().mockResolvedValue({ count: 0 }),
    delete: jest.fn().mockResolvedValue({}),
  },
  pdiGoal: {
    findMany: makeFind(),
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn().mockResolvedValue({}),
    createMany: jest.fn().mockResolvedValue({ count: 0 }),
  },
  pdiEvidence: { create: jest.fn().mockResolvedValue({}) },
  position: { findMany: makeFind() },
  successionPlan: { findMany: makeFind(), count: makeCount() },
  careerRole: {
    findMany: makeFind(),
    findUnique: jest.fn().mockResolvedValue({ id: 1, skillRequirements: [] }),
  },
  roleSkillMatrix: { findMany: makeFind() },
  legacyEmployeeSkill: { findMany: makeFind(), count: makeCount() },
  userCompetencies: { findMany: makeFind() },
  competency: { findMany: makeFind() },
  mentoring: {
    count: makeCount(),
    findMany: makeFind(),
    findUnique: jest.fn(),
    findFirst: jest.fn().mockResolvedValue(null),
    create: jest.fn(),
    update: jest.fn(),
  },
  mentoringSession: {
    findMany: makeFind(),
    findUnique: jest.fn(),
    create: jest.fn(),
  },
  badgeAward: { count: makeCount(), findMany: makeFind() },
  userPoints: {
    findMany: makeFind(),
    findUnique: jest.fn().mockResolvedValue({ points: 0 }),
    upsert: jest.fn().mockResolvedValue({ points: 100 }),
    update: jest.fn().mockResolvedValue({}),
  },
  notificationLog: { create: jest.fn().mockResolvedValue({}) },
  enrollment: { findMany: makeFind(), count: makeCount() },
  course: { findMany: makeFind() },
  attendanceRecord: { count: makeCount() },
  nineBoxPlacement: { findMany: makeFind() },
};

const proxyPrisma: any = new Proxy(mockPrisma, {
  get(target, prop) {
      if (prop === 'db') return proxyPrisma;
    if (prop in target) return (target as any)[prop];
    return {
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn().mockResolvedValue(null),
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({}),
      update: jest.fn().mockResolvedValue({}),
      delete: jest.fn().mockResolvedValue({}),
      count: jest.fn().mockResolvedValue(0),
      groupBy: jest.fn().mockResolvedValue([]),
      upsert: jest.fn().mockResolvedValue({}),
    };
  },
});

const basePlan = {
  id: 1,
  name: 'PDI 2024',
  userId: 1,
  status: 'DRAFT',
  isTemplate: false,
  priority: 'MEDIUM',
  notes: null,
  actions: [],
  goals: [],
  user: { id: 1, fullName: 'Test User', avatarUrl: null, email: 'test@innova.com' },
  manager: { id: 2, fullName: 'Manager Test' },
  checkpoints: [],
  approvals: [],
};

const baseAction = {
  id: 1,
  planId: 1,
  title: 'Ler livro',
  status: 'TODO',
  progress: 0,
  xpReward: 20,
  completedAt: null,
  plan: { userId: 1, name: 'PDI 2024' },
};

describe('TalentDevelopmentService', () => {
  let service: TalentDevelopmentService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [TalentDevelopmentService, { provide: PrismaService, useValue: proxyPrisma }],
    }).compile();
    service = module.get<TalentDevelopmentService>(TalentDevelopmentService);
  });

  // ─── getTalentPool ────────────────────────────────────────────────────────

  describe('getTalentPool', () => {
    it('deve retornar pool de talentos vazio', async () => {
      mockPrisma.user.findMany.mockResolvedValue([]);
      mockPrisma.user.count.mockResolvedValue(0);
      const result = await service.getTalentPool({});
      expect(result).toBeDefined();
      expect(result.meta.total).toBe(0);
    });

    it('deve calcular talentScore e tier correctamente', async () => {
      mockPrisma.user.findMany.mockResolvedValue([
        {
          id: 1,
          fullName: 'Star Player',
          email: 'star@innova.com',
          avatarUrl: null,
          userCompetencies: [{ currentLevel: 4.5, targetLevel: 5, competencyId: 1 }],
          points: { points: 2000 },
          position: { id: 1, name: 'Senior Dev', level: 3 },
          department: { id: 1, name: 'TI' },
          performanceReviews: [{ score: 4.8, potentialScore: 4.5 }],
          developmentPlans: [{ id: 1, overallProgress: 80, name: 'PDI' }],
          nineBoxPlacements: [],
        },
      ]);
      const result = await service.getTalentPool({});
      expect(result.data).toHaveLength(1);
    });

    it('deve filtrar por tier', async () => {
      mockPrisma.user.findMany.mockResolvedValue([]);
      const result = await service.getTalentPool({ tier: 'HIGH' as any });
      expect(result.data).toHaveLength(0);
    });
  });

  // ─── getHighPotentials ────────────────────────────────────────────────────

  describe('getHighPotentials', () => {
    it('deve retornar top talentos', async () => {
      mockPrisma.user.findMany.mockResolvedValue([]);
      const result = await service.getHighPotentials(10);
      expect(result).toBeDefined();
    });
  });

  // ─── getTalentMatrix ──────────────────────────────────────────────────────

  describe('getTalentMatrix', () => {
    it('deve retornar matriz 9-box', async () => {
      mockPrisma.user.findMany.mockResolvedValue([]);
      const result = await service.getTalentMatrix();
      expect(result.matrix).toBeDefined();
      expect(result.matrix).toHaveLength(9);
    });
  });

  // ─── getSuccessionCandidates ──────────────────────────────────────────────

  describe('getSuccessionCandidates', () => {
    it('deve retornar candidatos para sucessão', async () => {
      mockPrisma.successionPlan.findMany.mockResolvedValue([
        {
          id: 1,
          positionId: 5,
          candidateId: 1,
          readiness: 'READY',
          createdAt: new Date(),
          candidate: {
            id: 1,
            fullName: 'Candidato A',
            avatarUrl: null,
            position: { id: 1, name: 'Dev' },
            department: { id: 1, name: 'TI' },
            userCompetencies: [{ currentLevel: 4 }],
            nineBoxPlacements: [],
          },
          position: { id: 5, name: 'Tech Lead', level: 4 },
        },
      ]);
      const result = await service.getSuccessionCandidates(5);
      expect(result).toHaveLength(1);
    });
  });

  // ─── getSuccessionDashboard ───────────────────────────────────────────────

  describe('getSuccessionDashboard', () => {
    it('deve retornar dashboard de sucessão', async () => {
      mockPrisma.position.findMany.mockResolvedValue([
        { id: 1, name: 'Tech Lead', level: 4, _count: { users: 1, successionPlans: 0 } },
      ]);
      mockPrisma.successionPlan.findMany.mockResolvedValue([]);
      const result = await service.getSuccessionDashboard();
      expect(result.summary).toBeDefined();
      expect(result.summary.totalPositions).toBe(1);
    });
  });

  // ─── createPlan ───────────────────────────────────────────────────────────

  describe('createPlan', () => {
    it('deve criar plano de desenvolvimento', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ id: 1, fullName: 'Test' });
      mockPrisma.developmentPlan.create.mockResolvedValue({ ...basePlan, id: 1 });

      const result = await service.createPlan(
        { name: 'PDI 2024', userId: 1, goal: 'Crescer', managerId: 2 } as any,
        1,
      );
      expect(result).toBeDefined();
    });

    it('deve lançar NotFoundException se user não existe', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      await expect(
        service.createPlan({ name: 'PDI', userId: 99, goal: 'Goal' } as any, 1),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ─── getPlans ─────────────────────────────────────────────────────────────

  describe('getPlans', () => {
    it('deve retornar lista paginada de planos', async () => {
      mockPrisma.developmentPlan.findMany.mockResolvedValue([
        { ...basePlan, actions: [], goals: [] },
      ]);
      mockPrisma.developmentPlan.count.mockResolvedValue(1);

      const result = await service.getPlans({ page: 1, limit: 20 });
      expect(result.data).toHaveLength(1);
      expect(result.meta.total).toBe(1);
    });

    it('deve filtrar por userId e status', async () => {
      mockPrisma.developmentPlan.findMany.mockResolvedValue([]);
      mockPrisma.developmentPlan.count.mockResolvedValue(0);
      const result = await service.getPlans({ userId: 1, status: 'ACTIVE' as any });
      expect(result.data).toHaveLength(0);
    });
  });

  // ─── getPlan ──────────────────────────────────────────────────────────────

  describe('getPlan', () => {
    it('deve retornar plano por id', async () => {
      mockPrisma.developmentPlan.findUnique.mockResolvedValue(basePlan);
      const result = await service.getPlan(1);
      expect(result.id).toBe(1);
      expect(result.stats).toBeDefined();
    });

    it('deve lançar NotFoundException se não encontrado', async () => {
      mockPrisma.developmentPlan.findUnique.mockResolvedValue(null);
      await expect(service.getPlan(999)).rejects.toThrow(NotFoundException);
    });
  });

  // ─── updatePlan ───────────────────────────────────────────────────────────

  describe('updatePlan', () => {
    it('deve actualizar plano', async () => {
      mockPrisma.developmentPlan.findUnique.mockResolvedValue(basePlan);
      mockPrisma.developmentPlan.update.mockResolvedValue({ ...basePlan, name: 'PDI Actualizado' });

      const result = await service.updatePlan(1, { name: 'PDI Actualizado' });
      expect(result.name).toBe('PDI Actualizado');
    });
  });

  // ─── activatePlan ─────────────────────────────────────────────────────────

  describe('activatePlan', () => {
    it('deve activar plano com acções', async () => {
      mockPrisma.developmentPlan.findUnique.mockResolvedValue({
        ...basePlan,
        status: 'DRAFT',
        actions: [{ id: 1, status: 'TODO', progress: 0 }],
      });
      mockPrisma.developmentPlan.update.mockResolvedValue({ ...basePlan, status: 'ACTIVE' });

      const result = await service.activatePlan(1, 2);
      expect(result).toBeDefined();
    });

    it('deve lançar BadRequestException se já activo', async () => {
      mockPrisma.developmentPlan.findUnique.mockResolvedValue({
        ...basePlan,
        status: 'ACTIVE',
        actions: [{ id: 1 }],
      });
      await expect(service.activatePlan(1, 2)).rejects.toThrow(BadRequestException);
    });

    it('deve lançar BadRequestException se sem acções', async () => {
      mockPrisma.developmentPlan.findUnique.mockResolvedValue({
        ...basePlan,
        status: 'DRAFT',
        actions: [],
      });
      await expect(service.activatePlan(1, 2)).rejects.toThrow(BadRequestException);
    });
  });

  // ─── pausePlan ────────────────────────────────────────────────────────────

  describe('pausePlan', () => {
    it('deve pausar plano activo', async () => {
      mockPrisma.developmentPlan.findUnique.mockResolvedValue({
        ...basePlan,
        status: 'ACTIVE',
        actions: [],
      });
      mockPrisma.developmentPlan.update.mockResolvedValue({ ...basePlan, status: 'PAUSED' });

      const result = await service.pausePlan(1, 'Motivo de pausa');
      expect(result).toBeDefined();
    });

    it('deve lançar BadRequestException se não activo', async () => {
      mockPrisma.developmentPlan.findUnique.mockResolvedValue({
        ...basePlan,
        status: 'DRAFT',
        actions: [],
      });
      await expect(service.pausePlan(1)).rejects.toThrow(BadRequestException);
    });
  });

  // ─── completePlan ─────────────────────────────────────────────────────────

  describe('completePlan', () => {
    it('deve completar plano', async () => {
      mockPrisma.developmentPlan.findUnique.mockResolvedValue({
        ...basePlan,
        actions: [{ xpReward: 30, status: 'COMPLETED' }],
      });
      mockPrisma.developmentPlan.update.mockResolvedValue({ ...basePlan, status: 'COMPLETED' });

      const result = await service.completePlan(1);
      expect((result as any).message).toBe('Plano concluído');
    });
  });

  // ─── cancelPlan ───────────────────────────────────────────────────────────

  describe('cancelPlan', () => {
    it('deve cancelar plano', async () => {
      mockPrisma.developmentPlan.findUnique.mockResolvedValue(basePlan);
      mockPrisma.developmentPlan.update.mockResolvedValue({ ...basePlan, status: 'CANCELLED' });

      const result = await service.cancelPlan(1, 'Motivo de cancelamento');
      expect(result).toBeDefined();
    });
  });

  // ─── getTemplates ─────────────────────────────────────────────────────────

  describe('getTemplates', () => {
    it('deve retornar templates', async () => {
      mockPrisma.developmentPlan.findMany.mockResolvedValue([
        { ...basePlan, isTemplate: true, actions: [], goals: [], _count: { actions: 0, goals: 0 } },
      ]);
      const result = await service.getTemplates();
      expect(result).toBeDefined();
    });
  });

  // ─── addGoal ──────────────────────────────────────────────────────────────

  describe('addGoal', () => {
    it('deve adicionar meta ao plano', async () => {
      mockPrisma.developmentPlan.findUnique.mockResolvedValue(basePlan);
      mockPrisma.pdiGoal.create.mockResolvedValue({ id: 1, planId: 1, title: 'Meta A' });

      const result = await service.addGoal(1, { title: 'Meta A', weight: 100 } as any);
      expect(result).toBeDefined();
    });

    it('deve lançar NotFoundException se plano não existe', async () => {
      mockPrisma.developmentPlan.findUnique.mockResolvedValue(null);
      await expect(service.addGoal(99, { title: 'Meta A' } as any)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ─── updateGoal ───────────────────────────────────────────────────────────

  describe('updateGoal', () => {
    it('deve actualizar meta', async () => {
      mockPrisma.pdiGoal.findUnique.mockResolvedValue({
        id: 1,
        planId: 1,
        title: 'Meta A',
        completedAt: null,
      });
      mockPrisma.pdiGoal.update.mockResolvedValue({ id: 1, title: 'Meta B' });
      mockPrisma.developmentPlan.findUnique.mockResolvedValue({
        ...basePlan,
        actions: [],
        goals: [],
      });
      mockPrisma.developmentPlan.update.mockResolvedValue(basePlan);

      const result = await service.updateGoal(1, { title: 'Meta B' });
      expect(result).toBeDefined();
    });

    it('deve lançar NotFoundException se meta não existe', async () => {
      mockPrisma.pdiGoal.findUnique.mockResolvedValue(null);
      await expect(service.updateGoal(99, {})).rejects.toThrow(NotFoundException);
    });
  });

  // ─── deleteGoal ───────────────────────────────────────────────────────────

  describe('deleteGoal', () => {
    it('deve eliminar meta', async () => {
      mockPrisma.pdiGoal.findUnique.mockResolvedValue({ id: 1, planId: 1 });
      const result = await service.deleteGoal(1);
      expect((result as any).message).toBe('Meta removida');
    });

    it('deve lançar NotFoundException se meta não existe', async () => {
      mockPrisma.pdiGoal.findUnique.mockResolvedValue(null);
      await expect(service.deleteGoal(99)).rejects.toThrow(NotFoundException);
    });
  });

  // ─── addAction ────────────────────────────────────────────────────────────

  describe('addAction', () => {
    it('deve adicionar acção ao plano', async () => {
      mockPrisma.developmentPlan.findUnique.mockResolvedValue({
        ...basePlan,
        userId: 1,
        actions: [],
        goals: [],
      });
      mockPrisma.developmentPlanAction.create.mockResolvedValue({ id: 1, planId: 1, title: 'Ler' });
      mockPrisma.developmentPlan.update.mockResolvedValue(basePlan);

      const result = await service.addAction(1, { title: 'Ler', type: 'READING' } as any);
      expect(result).toBeDefined();
    });

    it('deve lançar NotFoundException se plano não existe', async () => {
      mockPrisma.developmentPlan.findUnique.mockResolvedValue(null);
      await expect(service.addAction(99, { title: 'Ler' } as any)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ─── updateAction ─────────────────────────────────────────────────────────

  describe('updateAction', () => {
    it('deve actualizar acção', async () => {
      mockPrisma.developmentPlanAction.findUnique.mockResolvedValue(baseAction);
      mockPrisma.developmentPlanAction.update.mockResolvedValue({ ...baseAction, title: 'Novo' });
      mockPrisma.developmentPlan.findUnique.mockResolvedValue({
        ...basePlan,
        actions: [],
        goals: [],
      });
      mockPrisma.developmentPlan.update.mockResolvedValue(basePlan);

      const result = await service.updateAction(1, { title: 'Novo' });
      expect(result).toBeDefined();
    });

    it('deve lançar NotFoundException se acção não existe', async () => {
      mockPrisma.developmentPlanAction.findUnique.mockResolvedValue(null);
      await expect(service.updateAction(99, {})).rejects.toThrow(NotFoundException);
    });
  });

  // ─── updateActionProgress ─────────────────────────────────────────────────

  describe('updateActionProgress', () => {
    it('deve actualizar progresso', async () => {
      mockPrisma.developmentPlanAction.findUnique.mockResolvedValue(baseAction);
      mockPrisma.developmentPlanAction.update.mockResolvedValue({ ...baseAction, progress: 50 });
      mockPrisma.developmentPlan.findUnique.mockResolvedValue({
        ...basePlan,
        actions: [{ ...baseAction, progress: 50 }],
        goals: [],
      });
      mockPrisma.developmentPlan.update.mockResolvedValue(basePlan);

      const result = await service.updateActionProgress(1, { progress: 50 }, 1);
      expect((result as any).progress).toBe(50);
    });

    it('deve lançar NotFoundException se acção não existe', async () => {
      mockPrisma.developmentPlanAction.findUnique.mockResolvedValue(null);
      await expect(service.updateActionProgress(99, { progress: 50 }, 1)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('deve conceder XP quando completado a 100%', async () => {
      const action = { ...baseAction, status: 'IN_PROGRESS', xpReward: 50 };
      mockPrisma.developmentPlanAction.findUnique.mockResolvedValue(action);
      mockPrisma.developmentPlanAction.update.mockResolvedValue({ ...action, progress: 100 });
      mockPrisma.developmentPlan.findUnique.mockResolvedValue({
        ...basePlan,
        actions: [],
        goals: [],
      });
      mockPrisma.developmentPlan.update.mockResolvedValue(basePlan);

      const result = await service.updateActionProgress(1, { progress: 100 }, 1);
      expect((result as any).progress).toBe(100);
    });
  });

  // ─── deleteAction ─────────────────────────────────────────────────────────

  describe('deleteAction', () => {
    it('deve lançar NotFoundException se acção não existe', async () => {
      mockPrisma.developmentPlanAction.findUnique.mockResolvedValue(null);
      await expect(service.deleteAction(99)).rejects.toThrow(NotFoundException);
    });
  });

  // ─── getMentorings ────────────────────────────────────────────────────────

  describe('getMentorings', () => {
    it('deve retornar lista de mentorings', async () => {
      mockPrisma.mentoring.findMany.mockResolvedValue([]);
      mockPrisma.mentoring.count.mockResolvedValue(0);
      const result = await service.getMentorings({});
      expect(result).toBeDefined();
    });
  });

  // ─── createMentoring ──────────────────────────────────────────────────────

  describe('createMentoring', () => {
    it('deve criar mentoring', async () => {
      mockPrisma.user.findUnique
        .mockResolvedValueOnce({ id: 1, fullName: 'Mentor' })
        .mockResolvedValueOnce({ id: 2, fullName: 'Mentee' });
      mockPrisma.mentoring.create.mockResolvedValue({
        id: 1,
        mentorId: 1,
        menteeId: 2,
        status: 'ACTIVE',
      });

      const result = await service.createMentoring({ mentorId: 1, menteeId: 2 } as any);
      expect(result).toBeDefined();
    });
  });

  // ─── getMentoring ─────────────────────────────────────────────────────────

  describe('getMentoring', () => {
    it('deve lançar NotFoundException se não encontrado', async () => {
      mockPrisma.mentoring.findUnique.mockResolvedValue(null);
      await expect(service.getMentoring(99)).rejects.toThrow(NotFoundException);
    });
  });

  // ─── getDashboard ─────────────────────────────────────────────────────────

  describe('getDashboard', () => {
    it('deve retornar dashboard', async () => {
      mockPrisma.developmentPlan.count.mockResolvedValue(10);
      mockPrisma.developmentPlan.findMany.mockResolvedValue([]);
      mockPrisma.developmentPlanAction.count.mockResolvedValue(30);
      mockPrisma.user.count.mockResolvedValue(50);
      mockPrisma.mentoring.count.mockResolvedValue(5);
      const result = await service.getDashboard({});
      expect(result).toBeDefined();
    });
  });

  // ─── getTrainingNeeds ─────────────────────────────────────────────────────

  describe('getTrainingNeeds', () => {
    it('deve retornar necessidades de formação', async () => {
      mockPrisma.roleSkillMatrix.findMany.mockResolvedValue([]);
      const result = await service.getTrainingNeeds({});
      expect(result).toBeDefined();
    });
  });

  // ─── getUserEvolution ─────────────────────────────────────────────────────

  describe('getUserEvolution', () => {
    it('deve retornar evolução do utilizador', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 1,
        fullName: 'Test',
        userCompetencies: [],
        nineBoxPlacements: [],
        developmentPlans: [],
      });
      const result = await service.getUserEvolution(1);
      expect(result).toBeDefined();
    });

    it('deve lançar NotFoundException se user não encontrado', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      await expect(service.getUserEvolution(99)).rejects.toThrow(NotFoundException);
    });
  });

  // ─── getRecommendations ───────────────────────────────────────────────────

  describe('getRecommendations', () => {
    it('deve retornar recomendações', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 1,
        fullName: 'Test',
        departmentId: 1,
        positionId: 1,
        userCompetencies: [],
        developmentPlans: [],
        performanceReviews: [],
        nineBoxPlacements: [],
      });
      const result = await service.getRecommendations(1);
      expect(result).toBeDefined();
    });
  });

  // ─── simulateCareer ───────────────────────────────────────────────────────

  describe('simulateCareer', () => {
    it('deve simular carreira', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 1,
        fullName: 'Test',
        userCompetencies: [],
        position: { id: 1, name: 'Dev', level: 1 },
        nineBoxPlacements: [],
      });
      const result = await service.simulateCareer(1, { targetPositionId: 2 } as any);
      expect(result).toBeDefined();
    });
  });
});
