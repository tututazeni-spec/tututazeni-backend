import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { CareerPlansService } from './career-plans.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/services/audit.service';

const makeFind = (val: any = null) => jest.fn().mockResolvedValue(val);
const makeCount = (n = 0) => jest.fn().mockResolvedValue(n);
const makeFindMany = (data: any[] = []) => jest.fn().mockResolvedValue(data);

const careerPathMock = {
  create: makeFind({ id: 1, steps: [] }),
  findMany: makeFindMany([]),
};
const roleSkillMatrixMock = { upsert: makeFind({ id: 1 }) };

const mockPrisma = {
  careerRole: {
    findMany: makeFindMany([{ id: 1, name: 'Dev', skillRequirements: [] }]),
    findUnique: makeFind(null),
    create: makeFind({ id: 1 }),
    update: makeFind({ id: 1 }),
    findFirst: makeFind(null),
  },
  careerSkill: { findMany: makeFindMany([]), create: makeFind({ id: 1 }) },
  careerPath: careerPathMock,
  roleSkillRequirement: {
    deleteMany: makeFind({ count: 0 }),
    createMany: makeFind({ count: 0 }),
    findMany: makeFindMany([]),
  },
  roleSkillMatrix: roleSkillMatrixMock,
  progressionRule: { create: makeFind({ id: 1 }), findMany: makeFindMany([]) },
  userCareerPlan: {
    findMany: makeFindMany([]),
    findUnique: makeFind(null),
    findFirst: makeFind(null),
    create: makeFind({ id: 1, userId: 1, status: 'ACTIVE', goals: [] }),
    update: makeFind({ id: 1 }),
    count: makeCount(0),
  },
  careerGoal: {
    create: makeFind({ id: 1 }),
    findMany: makeFindMany([]),
    update: makeFind({ id: 1 }),
    findUnique: makeFind(null),
  },
  promotionRequest: {
    create: makeFind({ id: 1 }),
    findMany: makeFindMany([]),
    count: makeCount(0),
    findUnique: makeFind(null),
    update: makeFind({ id: 1 }),
  },
  legacyEmployeeSkill: { findMany: makeFindMany([]) },
  user: { findUnique: makeFind(null) },
  course: { findMany: makeFindMany([]) },
  notificationLog: { create: makeFind({}) },
  employeeTimeline: { create: makeFind({}) },
};

const mockPrismaProxy: any = new Proxy(mockPrisma, {
  get(target, prop) {
    if (prop === 'db') return mockPrismaProxy;
    if (prop === 'careerPath') return careerPathMock;
    if (prop === 'roleSkillMatrix') return roleSkillMatrixMock;
    return (target as any)[prop];
  },
});

const mockAudit = { log: jest.fn().mockResolvedValue({}) };

describe('CareerPlansService — additional coverage', () => {
  let service: CareerPlansService;

  beforeEach(async () => {
    jest.clearAllMocks();
    Object.defineProperty(mockPrismaProxy, 'read', {
      get() {
        return mockPrismaProxy;
      },
      configurable: true,
    });
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CareerPlansService,
        { provide: PrismaService, useValue: mockPrismaProxy },
        { provide: AuditService, useValue: mockAudit },
      ],
    }).compile();
    service = module.get<CareerPlansService>(CareerPlansService);
  });

  // ─── createSkill ──────────────────────────────────────────────────────────

  describe('createSkill', () => {
    it('deve criar skill de carreira', async () => {
      mockPrisma.careerSkill.create.mockResolvedValue({
        id: 1,
        name: 'TypeScript',
        type: 'TECHNICAL',
      });

      const result = await service.createSkill({ name: 'TypeScript', type: 'TECHNICAL' as any });
      expect(result).toBeDefined();
    });
  });

  // ─── getSkills ────────────────────────────────────────────────────────────

  describe('getSkills', () => {
    it('deve retornar todas as skills activas', async () => {
      mockPrisma.careerSkill.findMany.mockResolvedValue([{ id: 1, name: 'NestJS' }]);

      const result = await service.getSkills();
      expect(result).toHaveLength(1);
    });

    it('deve filtrar por tipo', async () => {
      mockPrisma.careerSkill.findMany.mockResolvedValue([]);

      await service.getSkills('TECHNICAL');
      expect(mockPrisma.careerSkill.findMany).toHaveBeenCalled();
    });
  });

  // ─── createCareerPath ─────────────────────────────────────────────────────

  describe('createCareerPath', () => {
    it('deve criar trilha de carreira', async () => {
      careerPathMock.create.mockResolvedValue({
        id: 1,
        name: 'Tech Lead',
        steps: [],
      });

      const result = await service.createCareerPath(
        { name: 'Tech Lead', steps: [{ roleId: 1, order: 1 }] } as any,
        1,
      );
      expect(result).toBeDefined();
    });
  });

  // ─── getCareerPaths ───────────────────────────────────────────────────────

  describe('getCareerPaths', () => {
    it('deve retornar trilhas de carreira', async () => {
      careerPathMock.findMany.mockResolvedValue([{ id: 1, name: 'Tech Lead', steps: [] }]);

      const result = await service.getCareerPaths();
      expect(result).toBeDefined();
    });
  });

  // ─── createProgressionRule ────────────────────────────────────────────────

  describe('createProgressionRule', () => {
    it('deve criar regra de progressão', async () => {
      mockPrisma.progressionRule.create.mockResolvedValue({
        id: 1,
        fromRoleId: 1,
        toRoleId: 2,
        fromRole: { name: 'Junior' },
        toRole: { name: 'Senior' },
      });

      const result = await service.createProgressionRule({ fromRoleId: 1, toRoleId: 2 } as any);
      expect(result).toBeDefined();
    });
  });

  // ─── getProgressionRules ──────────────────────────────────────────────────

  describe('getProgressionRules', () => {
    it('deve retornar regras de progressão', async () => {
      mockPrisma.progressionRule.findMany.mockResolvedValue([]);

      const result = await service.getProgressionRules();
      expect(Array.isArray(result)).toBe(true);
    });

    it('deve filtrar por fromRoleId', async () => {
      mockPrisma.progressionRule.findMany.mockResolvedValue([]);

      await service.getProgressionRules(1);
      expect(mockPrisma.progressionRule.findMany).toHaveBeenCalled();
    });
  });

  // ─── calculateReadiness ───────────────────────────────────────────────────

  describe('calculateReadiness', () => {
    it('deve retornar READY se sem requisitos configurados', async () => {
      mockPrisma.careerRole.findUnique.mockResolvedValue({ id: 1, skillRequirements: [] });
      mockPrisma.legacyEmployeeSkill.findMany.mockResolvedValue([]);

      const result = await service.calculateReadiness(1, 1);

      expect(result).toHaveProperty('score', 100);
      expect(result).toHaveProperty('readinessLevel', 'READY');
    });

    it('deve calcular gaps de skills quando há requisitos', async () => {
      mockPrisma.careerRole.findUnique.mockResolvedValue({
        id: 1,
        skillRequirements: [
          {
            skillId: 1,
            requiredLevel: 3,
            weight: 100,
            mandatory: true,
            skill: { id: 1, name: 'NestJS', type: 'TECHNICAL' },
          },
        ],
        fromRules: [],
        toRules: [],
      });
      mockPrisma.legacyEmployeeSkill.findMany.mockResolvedValue([
        { skillId: 1, currentLevel: 1, skill: { id: 1, name: 'NestJS' } },
      ]);

      const result = await service.calculateReadiness(1, 1);

      expect(result).toHaveProperty('userId', 1);
      expect(result).toHaveProperty('readinessLevel');
      expect(result.missingSkills.length).toBeGreaterThan(0);
    });

    it('deve lançar NotFoundException se role não encontrada', async () => {
      mockPrisma.careerRole.findUnique.mockResolvedValue(null);

      await expect(service.calculateReadiness(1, 99)).rejects.toThrow(NotFoundException);
    });
  });

  // ─── create plan ──────────────────────────────────────────────────────────

  describe('create', () => {
    it('deve criar plano de carreira', async () => {
      mockPrisma.userCareerPlan.findFirst.mockResolvedValue(null);
      mockPrisma.careerRole.findUnique.mockResolvedValue({
        id: 2,
        skillRequirements: [],
        fromRules: [],
        toRules: [],
      });
      const createdPlan = {
        id: 1,
        userId: 1,
        targetRoleId: 2,
        status: 'ACTIVE',
        goals: [],
        user: null,
        currentRole: null,
        targetRole: { id: 2, skillRequirements: [], fromRules: [], toRules: [] },
        careerPath: null,
        mentor: null,
      };
      mockPrisma.userCareerPlan.create.mockResolvedValue(createdPlan);
      mockPrisma.userCareerPlan.findUnique.mockResolvedValue(createdPlan);

      const result = await service.create({ targetRoleId: 2, title: 'Plano 2024' } as any, 1);
      expect(result).toBeDefined();
    });
  });

  // ─── addGoal ──────────────────────────────────────────────────────────────

  describe('addGoal', () => {
    it('deve adicionar objectivo ao plano', async () => {
      mockPrisma.userCareerPlan.findUnique.mockResolvedValue({
        id: 1,
        userId: 1,
        status: 'ACTIVE',
      });
      mockPrisma.careerGoal.create.mockResolvedValue({
        id: 1,
        title: 'Meta 1',
        status: 'IN_PROGRESS',
      });

      const result = await service.addGoal({
        planId: 1,
        title: 'Meta 1',
        description: 'Desc',
      } as any);
      expect(result).toBeDefined();
    });
  });

  // ─── getPromotions ────────────────────────────────────────────────────────

  describe('getPromotions', () => {
    it('deve retornar pedidos de promoção paginados', async () => {
      mockPrisma.promotionRequest.findMany.mockResolvedValue([{ id: 1, status: 'PENDING' }]);
      mockPrisma.promotionRequest.count.mockResolvedValue(1);

      const result = await service.getPromotions({});
      expect((result as any).data).toBeDefined();
    });
  });
});
