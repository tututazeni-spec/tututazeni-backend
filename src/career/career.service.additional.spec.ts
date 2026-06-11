import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { CareerService } from './career.service';
import { PrismaService } from '../prisma/prisma.service';

const baseUser = {
  id: 1,
  fullName: 'Utilizador Teste',
  email: 'test@innova.com',
  avatarUrl: null,
  hireDate: new Date('2023-01-01'),
  positionId: 1,
  active: true,
  position: { id: 1, name: 'Analista', level: 2 },
  department: { id: 1, name: 'TI' },
  manager: { id: 2, fullName: 'Gestor', avatarUrl: null },
  profile: null,
  points: { points: 500 },
  userCompetencies: [],
  userCareerPlans: [],
  careers: [],
  certificates: [],
  enrollments: [],
  performanceReviews: [],
  successionPlans: [],
  badgeAwards: [],
  _count: {
    certificates: 0,
    enrollments: 0,
    userCompetencies: 0,
    userCareerPlans: 0,
    badgeAwards: 0,
  },
};

const basePosition = {
  id: 2,
  name: 'Senior Analista',
  level: 3,
  competencies: [
    {
      competencyId: 1,
      requiredLevel: 3,
      competency: { id: 1, name: 'TypeScript', category: 'TECH' },
    },
  ],
};

const baseCareerPath = {
  id: 1,
  name: 'Trilha Tech',
  active: true,
  departmentId: 1,
  department: { id: 1, name: 'TI' },
  steps: [],
  _count: { steps: 3 },
};

const mockPrisma: any = {
  user: {
    findUnique: jest.fn(),
    findMany: jest.fn().mockResolvedValue([]),
    update: jest.fn(),
    count: jest.fn().mockResolvedValue(0),
    groupBy: jest.fn().mockResolvedValue([]),
  },
  careerPath: {
    findMany: jest.fn().mockResolvedValue([]),
    findUnique: jest.fn().mockResolvedValue(null),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  careerPathStep: {
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    deleteMany: jest.fn(),
    findFirst: jest.fn().mockResolvedValue(null),
  },
  userCareerPlan: {
    findMany: jest.fn().mockResolvedValue([]),
    findFirst: jest.fn().mockResolvedValue(null),
    findUnique: jest.fn().mockResolvedValue(null),
    create: jest.fn(),
    update: jest.fn(),
    count: jest.fn().mockResolvedValue(0),
  },
  careerGoal: {
    create: jest.fn(),
    update: jest.fn(),
    findFirst: jest.fn().mockResolvedValue(null),
  },
  internalVacancy: {
    findMany: jest.fn().mockResolvedValue([]),
    findUnique: jest.fn().mockResolvedValue(null),
    findFirst: jest.fn().mockResolvedValue(null),
    create: jest.fn(),
    update: jest.fn(),
    count: jest.fn().mockResolvedValue(0),
    groupBy: jest.fn().mockResolvedValue([]),
  },
  userPoints: {
    upsert: jest.fn().mockResolvedValue({}),
    findUnique: jest.fn().mockResolvedValue(null),
  },
  vacancyApplication: {
    findFirst: jest.fn().mockResolvedValue(null),
    findUnique: jest.fn().mockResolvedValue(null),
    create: jest.fn(),
    update: jest.fn(),
    findMany: jest.fn().mockResolvedValue([]),
    count: jest.fn().mockResolvedValue(0),
  },
  internalApplication: {
    findUnique: jest.fn().mockResolvedValue(null),
    findFirst: jest.fn().mockResolvedValue(null),
    create: jest.fn().mockResolvedValue({ id: 1 }),
    findMany: jest.fn().mockResolvedValue([]),
    count: jest.fn().mockResolvedValue(0),
  },
  successionPlan: {
    findMany: jest.fn().mockResolvedValue([]),
    findUnique: jest.fn().mockResolvedValue(null),
    create: jest.fn(),
    update: jest.fn(),
  },
  positionCompetency: {
    findMany: jest.fn().mockResolvedValue([]),
    groupBy: jest.fn().mockResolvedValue([]),
  },
  userCompetency: {
    findMany: jest.fn().mockResolvedValue([]),
    count: jest.fn().mockResolvedValue(0),
  },
  position: {
    findUnique: jest.fn().mockResolvedValue(null),
    findMany: jest.fn().mockResolvedValue([]),
  },
  enrollment: {
    findMany: jest.fn().mockResolvedValue([]),
  },
  performanceReview: {
    aggregate: jest.fn().mockResolvedValue({ _avg: { score: 0 } }),
    findMany: jest.fn().mockResolvedValue([]),
  },
  courseCompetency: {
    findMany: jest.fn().mockResolvedValue([]),
  },
  notificationLog: {
    create: jest.fn().mockResolvedValue({}),
  },
  auditLog: { create: jest.fn().mockResolvedValue({}) },
};

describe('CareerService (additional)', () => {
  let service: CareerService;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockPrisma.user.findUnique.mockResolvedValue(null);
    mockPrisma.user.findMany.mockResolvedValue([]);
    mockPrisma.careerPath.findMany.mockResolvedValue([]);
    mockPrisma.careerPath.findUnique.mockResolvedValue(null);
    mockPrisma.position.findUnique.mockResolvedValue(null);

    const module: TestingModule = await Test.createTestingModule({
      providers: [CareerService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();
    service = module.get<CareerService>(CareerService);
  });

  // ─── getCareerProfile ─────────────────────────────────────────

  describe('getCareerProfile', () => {
    it('deve retornar perfil de carreira completo', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(baseUser);
      mockPrisma.positionCompetency.findMany.mockResolvedValue([]);
      mockPrisma.userCompetency.findMany.mockResolvedValue([]);
      mockPrisma.internalVacancy.findMany.mockResolvedValue([]);

      const result = await service.getCareerProfile(1);
      expect(result).toBeDefined();
      expect(result.user.fullName).toBe('Utilizador Teste');
      expect(result).toHaveProperty('careerPlan');
      expect(result).toHaveProperty('competencies');
      expect(result).toHaveProperty('insights');
    });

    it('deve lançar NotFoundException se utilizador não encontrado', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      await expect(service.getCareerProfile(99)).rejects.toThrow(NotFoundException);
    });

    it('deve retornar careerPlan null quando sem planos', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ ...baseUser, userCareerPlans: [] });
      mockPrisma.positionCompetency.findMany.mockResolvedValue([]);
      mockPrisma.userCompetency.findMany.mockResolvedValue([]);
      mockPrisma.internalVacancy.findMany.mockResolvedValue([]);

      const result = await service.getCareerProfile(1);
      expect(result.careerPlan).toBeNull();
    });
  });

  // ─── getCompetencyGapsForUser ─────────────────────────────────

  describe('getCompetencyGapsForUser', () => {
    it('deve retornar [] se utilizador sem posição', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ positionId: null });
      const result = await service.getCompetencyGapsForUser(1);
      expect(result).toEqual([]);
    });

    it('deve calcular gaps de competências', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ positionId: 1 });
      mockPrisma.positionCompetency.findMany.mockResolvedValue([
        { competencyId: 1, requiredLevel: 3, competency: { id: 1, name: 'TypeScript' } },
      ]);
      mockPrisma.userCompetency.findMany.mockResolvedValue([{ competencyId: 1, currentLevel: 2 }]);

      const result = await service.getCompetencyGapsForUser(1);
      expect(result).toHaveLength(1);
      expect(result[0].gap).toBe(1);
      expect(result[0].status).toBe('PARTIAL');
    });

    it('deve identificar competência MET quando nível suficiente', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ positionId: 1 });
      mockPrisma.positionCompetency.findMany.mockResolvedValue([
        { competencyId: 1, requiredLevel: 3, competency: { id: 1, name: 'TypeScript' } },
      ]);
      mockPrisma.userCompetency.findMany.mockResolvedValue([{ competencyId: 1, currentLevel: 3 }]);

      const result = await service.getCompetencyGapsForUser(1);
      expect(result[0].status).toBe('MET');
      expect(result[0].gap).toBe(0);
    });

    it('deve identificar competência MISSING quando gap > 1', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ positionId: 1 });
      mockPrisma.positionCompetency.findMany.mockResolvedValue([
        { competencyId: 1, requiredLevel: 5, competency: { id: 1, name: 'Liderança' } },
      ]);
      mockPrisma.userCompetency.findMany.mockResolvedValue([]);

      const result = await service.getCompetencyGapsForUser(1);
      expect(result[0].status).toBe('MISSING');
      expect(result[0].currentLevel).toBe(0);
    });
  });

  // ─── simulateNextRole ─────────────────────────────────────────

  describe('simulateNextRole', () => {
    it('deve lançar NotFoundException se utilizador não existe', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      await expect(service.simulateNextRole(99, 2)).rejects.toThrow(NotFoundException);
    });

    it('deve lançar NotFoundException se posição alvo não existe', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ positionId: 1, hireDate: new Date() });
      mockPrisma.position.findUnique.mockResolvedValue(null);
      await expect(service.simulateNextRole(1, 99)).rejects.toThrow(NotFoundException);
    });

    it('deve calcular readiness score para cargo alvo', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        positionId: 1,
        hireDate: new Date('2023-01-01'),
      });
      mockPrisma.position.findUnique.mockResolvedValue(basePosition);
      mockPrisma.userCompetency.findMany.mockResolvedValue([
        { competencyId: 1, currentLevel: 3, competency: { id: 1, name: 'TypeScript' } },
      ]);
      mockPrisma.enrollment.findMany.mockResolvedValue([]);
      mockPrisma.performanceReview.aggregate.mockResolvedValue({ _avg: { score: 4.2 } });
      mockPrisma.courseCompetency.findMany.mockResolvedValue([]);

      const result = await service.simulateNextRole(1, 2);
      expect(result.readinessScore).toBe(100);
      expect(result.summary.ready).toBe(true);
    });

    it('deve recomendar cursos para gaps não cumpridos', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        positionId: 1,
        hireDate: new Date('2023-01-01'),
      });
      mockPrisma.position.findUnique.mockResolvedValue(basePosition);
      mockPrisma.userCompetency.findMany.mockResolvedValue([]);
      mockPrisma.enrollment.findMany.mockResolvedValue([]);
      mockPrisma.performanceReview.aggregate.mockResolvedValue({ _avg: { score: 0 } });
      mockPrisma.courseCompetency.findMany.mockResolvedValue([
        {
          courseId: 1,
          competencyId: 1,
          course: { id: 1, title: 'TypeScript Avançado', status: 'PUBLISHED' },
        },
      ]);

      const result = await service.simulateNextRole(1, 2);
      expect(result.readinessScore).toBeLessThan(100);
      expect(result.recommendedCourses.length).toBeGreaterThan(0);
      expect(result.summary.ready).toBe(false);
    });
  });

  // ─── findAllCareerPaths ───────────────────────────────────────

  describe('findAllCareerPaths', () => {
    it('deve retornar todas as trilhas de carreira', async () => {
      mockPrisma.careerPath.findMany.mockResolvedValue([baseCareerPath]);
      const result = await service.findAllCareerPaths();
      expect(result).toHaveLength(1);
    });

    it('deve filtrar por departmentId', async () => {
      mockPrisma.careerPath.findMany.mockResolvedValue([]);
      await service.findAllCareerPaths(1);
      expect(mockPrisma.careerPath.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ departmentId: 1 }) }),
      );
    });
  });

  // ─── findOneCareerPath ────────────────────────────────────────

  describe('findOneCareerPath', () => {
    it('deve retornar trilha de carreira por id', async () => {
      mockPrisma.careerPath.findUnique.mockResolvedValue(baseCareerPath);
      const result = await service.findOneCareerPath(1);
      expect(result).toBeDefined();
    });

    it('deve lançar NotFoundException se trilha não existe', async () => {
      mockPrisma.careerPath.findUnique.mockResolvedValue(null);
      await expect(service.findOneCareerPath(99)).rejects.toThrow(NotFoundException);
    });
  });

  // ─── createCareerPath ─────────────────────────────────────────

  describe('createCareerPath', () => {
    it('deve criar trilha de carreira', async () => {
      mockPrisma.careerPath.create.mockResolvedValue(baseCareerPath);
      const result = await service.createCareerPath({
        name: 'Trilha Tech',
        departmentId: 1,
      } as any);
      expect(result).toBeDefined();
    });
  });

  // ─── updateCareerPath ─────────────────────────────────────────

  describe('updateCareerPath', () => {
    it('deve actualizar trilha de carreira', async () => {
      mockPrisma.careerPath.findUnique.mockResolvedValue(baseCareerPath);
      mockPrisma.careerPath.update.mockResolvedValue({ ...baseCareerPath, name: 'Actualizada' });
      const result = await service.updateCareerPath(1, { name: 'Actualizada' } as any);
      expect(result).toBeDefined();
    });

    it('deve lançar NotFoundException se trilha não existe', async () => {
      mockPrisma.careerPath.findUnique.mockResolvedValue(null);
      await expect(service.updateCareerPath(99, {} as any)).rejects.toThrow(NotFoundException);
    });
  });

  // ─── addCareerPathStep ────────────────────────────────────────

  describe('addCareerPathStep', () => {
    it('deve adicionar passo à trilha de carreira', async () => {
      mockPrisma.careerPath.findUnique.mockResolvedValue(baseCareerPath);
      mockPrisma.careerPathStep.create.mockResolvedValue({
        id: 1,
        careerPathId: 1,
        positionId: 2,
        order: 1,
      });
      const result = await service.addCareerPathStep(1, { positionId: 2, order: 1 } as any);
      expect(result).toBeDefined();
    });
  });

  // ─── getMyCareerPlan ──────────────────────────────────────────

  describe('getMyCareerPlan', () => {
    it('deve retornar plano de carreira activo', async () => {
      mockPrisma.userCareerPlan.findFirst.mockResolvedValue({
        id: 1,
        userId: 1,
        status: 'ACTIVE',
        goals: [],
      });
      const result = await service.getMyCareerPlan(1);
      expect(result).toBeDefined();
    });

    it('deve retornar null se sem plano activo', async () => {
      mockPrisma.userCareerPlan.findFirst.mockResolvedValue(null);
      const result = await service.getMyCareerPlan(1);
      expect(result).toBeNull();
    });
  });

  // ─── createCareerPlan ─────────────────────────────────────────

  describe('createCareerPlan', () => {
    it('deve criar plano de carreira', async () => {
      mockPrisma.userCareerPlan.findFirst.mockResolvedValue(null);
      mockPrisma.userCareerPlan.create.mockResolvedValue({ id: 1, userId: 1, status: 'ACTIVE' });
      const result = await service.createCareerPlan(1, {
        targetPositionId: 2,
        targetDate: '2027-12-31',
      } as any);
      expect(result).toBeDefined();
    });
  });

  // ─── addGoalToPlan ────────────────────────────────────────────

  describe('addGoalToPlan', () => {
    it('deve adicionar objectivo ao plano', async () => {
      mockPrisma.userCareerPlan.findFirst.mockResolvedValue({ id: 1, userId: 1 });
      mockPrisma.careerGoal.create.mockResolvedValue({
        id: 1,
        planId: 1,
        title: 'Aprender NestJS',
      });
      const result = await service.addGoalToPlan(1, 1, {
        title: 'Aprender NestJS',
        type: 'SKILL' as any,
      } as any);
      expect(result).toBeDefined();
    });

    it('deve lançar NotFoundException se plano não existe', async () => {
      mockPrisma.userCareerPlan.findFirst.mockResolvedValue(null);
      await expect(service.addGoalToPlan(99, 1, { title: 'X' } as any)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ─── findAllVacancies ─────────────────────────────────────────

  describe('findAllVacancies', () => {
    it('deve retornar vagas internas disponíveis', async () => {
      mockPrisma.internalVacancy.findMany.mockResolvedValue([]);
      mockPrisma.internalVacancy.count = jest.fn().mockResolvedValue(0);
      const result = await service.findAllVacancies({});
      expect(result).toBeDefined();
    });
  });

  // ─── publishVacancy ───────────────────────────────────────────

  describe('publishVacancy', () => {
    it('deve publicar vaga por id', async () => {
      mockPrisma.internalVacancy.findUnique.mockResolvedValue({
        id: 1,
        title: 'Dev Senior',
        status: 'DRAFT',
      });
      mockPrisma.internalVacancy.update = jest.fn().mockResolvedValue({
        id: 1,
        status: 'OPEN',
      });
      const result = await service.publishVacancy(1);
      expect(result).toBeDefined();
    });

    it('deve lançar NotFoundException se vaga não existe', async () => {
      mockPrisma.internalVacancy.findUnique.mockResolvedValue(null);
      await expect(service.publishVacancy(99)).rejects.toThrow(NotFoundException);
    });
  });

  // ─── applyToVacancy ───────────────────────────────────────────

  describe('applyToVacancy', () => {
    it('deve candidatar utilizador a vaga aberta', async () => {
      mockPrisma.internalVacancy.findUnique.mockResolvedValue({ id: 1, status: 'OPEN' });
      mockPrisma.vacancyApplication.findFirst.mockResolvedValue(null);
      mockPrisma.vacancyApplication.create.mockResolvedValue({ id: 1, vacancyId: 1, userId: 1 });
      const result = await service.applyToVacancy(1, 1, { motivation: 'Quero crescer' } as any);
      expect(result).toBeDefined();
    });

    it('deve lançar NotFoundException se vaga não existe', async () => {
      mockPrisma.internalVacancy.findUnique.mockResolvedValue(null);
      await expect(service.applyToVacancy(99, 1, {} as any)).rejects.toThrow(NotFoundException);
    });
  });

  // ─── getCareerAnalytics ───────────────────────────────────────

  describe('getCareerAnalytics', () => {
    it('deve retornar analytics de carreira', async () => {
      mockPrisma.user.findMany.mockResolvedValue([]);
      const result = await service.getCareerAnalytics({});
      expect(result).toBeDefined();
    });
  });
});
