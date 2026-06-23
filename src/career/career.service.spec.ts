import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ConflictException } from '@nestjs/common';
import { CareerService } from './career.service';
import { PrismaService } from '../prisma/prisma.service';

const mockUser = {
  findUnique: jest.fn(),
  findMany: jest.fn(),
  update: jest.fn(),
};

const mockPrisma = {
  user: mockUser,
  careerPath: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    count: jest.fn(),
  },
  careerPathStep: {
    create: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    findMany: jest.fn(),
  },
  userCareerPlan: {
    findFirst: jest.fn(),
    create: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
  },
  careerGoal: {
    create: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    findMany: jest.fn(),
  },
  internalVacancy: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    count: jest.fn(),
  },
  internalApplication: {
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
  },
  successionPlan: {
    findFirst: jest.fn(),
    create: jest.fn(),
    findMany: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
  },
  careerHistory: { create: jest.fn(), findMany: jest.fn() },
  positionCompetency: { findMany: jest.fn().mockResolvedValue([]) },
  userCompetency: { findMany: jest.fn().mockResolvedValue([]) },
  position: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
  },
  performanceReview: {
    findMany: jest.fn().mockResolvedValue([]),
    aggregate: jest.fn().mockResolvedValue({ _avg: { score: null } }),
  },
  enrollment: { findMany: jest.fn().mockResolvedValue([]) },
  courseCompetency: { findMany: jest.fn().mockResolvedValue([]) },
  profile: { upsert: jest.fn() },
  notificationLog: { create: jest.fn().mockResolvedValue({}) },
  auditLog: { create: jest.fn().mockResolvedValue({}) },
  userPoints: {
    update: jest.fn().mockResolvedValue({}),
    upsert: jest.fn().mockResolvedValue({}),
  },
};

const mockPrismaProxy: any = new Proxy(mockPrisma, {
  get(target, prop) {
    if (prop === 'db') return mockPrismaProxy;
    if (prop === 'user') return mockUser;
    return (target as any)[prop];
  },
});

const baseUser = {
  id: 1,
  fullName: 'Test User',
  email: 'test@innova.com',
  avatarUrl: null,
  hireDate: null,
  positionId: null,
  position: { id: 1, name: 'Developer', level: 2 },
  department: { id: 1, name: 'TI' },
  manager: null,
  profile: null,
  points: { points: 200 },
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

describe('CareerService', () => {
  let service: CareerService;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockPrisma.positionCompetency.findMany.mockResolvedValue([]);
    mockPrisma.userCompetency.findMany.mockResolvedValue([]);
    mockPrisma.performanceReview.findMany.mockResolvedValue([]);
    mockPrisma.performanceReview.aggregate.mockResolvedValue({ _avg: { score: null } });
    mockPrisma.enrollment.findMany.mockResolvedValue([]);
    mockPrisma.internalVacancy.findMany.mockResolvedValue([]);
    mockPrisma.internalVacancy.count.mockResolvedValue(0);

    const module: TestingModule = await Test.createTestingModule({
      providers: [CareerService, { provide: PrismaService, useValue: mockPrismaProxy }],
    }).compile();
    service = module.get<CareerService>(CareerService);
  });

  // ─── getCareerProfile ─────────────────────────────────────────────────────

  describe('getCareerProfile', () => {
    it('deve retornar perfil de carreira do utilizador', async () => {
      // findUnique called multiple times: for user, for competencyGaps (returns null positionId)
      mockUser.findUnique.mockResolvedValue({ ...baseUser, positionId: null });

      const result = await service.getCareerProfile(1);

      expect((result as any).user.fullName).toBe('Test User');
      expect((result as any).insights.competencyGaps).toEqual([]);
    });

    it('deve lançar NotFoundException se utilizador não encontrado', async () => {
      mockUser.findUnique.mockResolvedValue(null);
      await expect(service.getCareerProfile(99)).rejects.toThrow(NotFoundException);
    });
  });

  // ─── findAllCareerPaths ───────────────────────────────────────────────────

  describe('findAllCareerPaths', () => {
    it('deve retornar trilhas de carreira', async () => {
      mockPrisma.careerPath.findMany.mockResolvedValue([
        { id: 1, title: 'Trilha Tech', isActive: true, steps: [], _count: { steps: 3, plans: 5 } },
      ]);

      const result = await service.findAllCareerPaths();

      expect(result).toHaveLength(1);
    });
  });

  // ─── createCareerPlan ─────────────────────────────────────────────────────

  describe('createCareerPlan', () => {
    it('deve criar plano de carreira', async () => {
      mockPrisma.userCareerPlan.findFirst.mockResolvedValue(null);
      mockPrisma.userCareerPlan.create.mockResolvedValue({
        id: 1,
        userId: 1,
        status: 'DRAFT',
        goals: [],
        title: 'Tornar-me Tech Lead',
      });

      const result = await service.createCareerPlan(1, { title: 'Tornar-me Tech Lead' });

      expect((result as any).status).toBe('DRAFT');
    });
  });

  // ─── findAllVacancies ─────────────────────────────────────────────────────

  describe('findAllVacancies', () => {
    it('deve retornar vagas internas paginadas', async () => {
      mockPrisma.internalVacancy.findMany.mockResolvedValue([
        { id: 1, title: 'Dev Senior', status: 'OPEN', _count: { applications: 3 } },
      ]);
      mockPrisma.internalVacancy.count.mockResolvedValue(1);

      const result = await service.findAllVacancies({ page: 1, limit: 20 });

      expect((result as any).data).toHaveLength(1);
    });
  });

  // ─── applyToVacancy ───────────────────────────────────────────────────────

  describe('applyToVacancy', () => {
    it('deve lançar ConflictException se já candidatou', async () => {
      mockPrisma.internalVacancy.findUnique.mockResolvedValue({ id: 1, status: 'OPEN' });
      mockPrisma.internalApplication.findUnique.mockResolvedValue({ id: 1 });
      await expect(
        service.applyToVacancy(1, 1, { motivation: 'Gosto de desafios' }),
      ).rejects.toThrow(ConflictException);
    });

    it('deve lançar NotFoundException se vaga não existe', async () => {
      mockPrisma.internalVacancy.findUnique.mockResolvedValue(null);
      await expect(service.applyToVacancy(99, 1, { motivation: 'Test' })).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
