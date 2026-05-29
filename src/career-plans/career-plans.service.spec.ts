import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { CareerPlansService } from './career-plans.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/services/audit.service';

const mockPrisma = {
  careerRole: {
    findMany: jest.fn().mockResolvedValue([]),
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    findFirst: jest.fn(),
  },
  careerSkill: {
    findMany: jest.fn().mockResolvedValue([]),
    create: jest.fn(),
  },
  careerPath: {
    findMany: jest.fn().mockResolvedValue([]),
    create: jest.fn(),
  },
  roleSkillRequirement: {
    deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    createMany: jest.fn().mockResolvedValue({ count: 0 }),
  },
  roleSkillMatrix: { findMany: jest.fn().mockResolvedValue([]) },
  progressionRule: {
    create: jest.fn(),
    findMany: jest.fn().mockResolvedValue([]),
  },
  userCareerPlan: {
    findMany: jest.fn().mockResolvedValue([]),
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    count: jest.fn().mockResolvedValue(0),
  },
  careerGoal: {
    create: jest.fn(),
    findMany: jest.fn().mockResolvedValue([]),
    update: jest.fn(),
    findUnique: jest.fn(),
  },
  promotionRequest: {
    create: jest.fn(),
    findMany: jest.fn().mockResolvedValue([]),
    count: jest.fn().mockResolvedValue(0),
    findUnique: jest.fn(),
    update: jest.fn(),
  },
  legacyEmployeeSkill: { findMany: jest.fn().mockResolvedValue([]) },
  user: { findUnique: jest.fn() },
  course: { findMany: jest.fn().mockResolvedValue([]) },
  notificationLog: { create: jest.fn().mockResolvedValue({}) },
  employeeTimeline: { create: jest.fn().mockResolvedValue({}) },
};

const baseRole = { id: 1, name: 'Dev Senior', department: 'TI', level: 3 };
const basePlan = {
  id: 1,
  userId: 1,
  targetRoleId: 2,
  status: 'ACTIVE',
  goals: [],
  targetRole: baseRole,
  user: { id: 1, fullName: 'Test' },
  _count: { goals: 0 },
};

describe('CareerPlansService', () => {
  let service: CareerPlansService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CareerPlansService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AuditService, useValue: { log: jest.fn().mockResolvedValue({}) } },
      ],
    }).compile();
    service = module.get<CareerPlansService>(CareerPlansService);
  });

  describe('createRole', () => {
    it('deve criar role de carreira', async () => {
      mockPrisma.careerRole.create.mockResolvedValue(baseRole);
      const result = await service.createRole({ name: 'Dev Senior', department: 'TI', level: 3 } as any);
      expect(result.name).toBe('Dev Senior');
    });
  });

  describe('getRoles', () => {
    it('deve retornar roles', async () => {
      mockPrisma.careerRole.findMany.mockResolvedValue([baseRole]);
      const result = await service.getRoles();
      expect(result).toHaveLength(1);
    });
  });

  describe('getRole', () => {
    it('deve retornar role por id', async () => {
      mockPrisma.careerRole.findUnique.mockResolvedValue(baseRole);
      const result = await service.getRole(1);
      expect(result.name).toBe('Dev Senior');
    });

    it('deve lançar NotFoundException se não encontrada', async () => {
      mockPrisma.careerRole.findUnique.mockResolvedValue(null);
      await expect(service.getRole(99)).rejects.toThrow(NotFoundException);
    });
  });

  describe('findAll', () => {
    it('deve retornar planos de carreira paginados', async () => {
      mockPrisma.userCareerPlan.findMany.mockResolvedValue([basePlan]);
      mockPrisma.userCareerPlan.count.mockResolvedValue(1);

      const result = await service.findAll({});
      expect((result as any).data).toBeDefined();
    });
  });

  describe('findOne', () => {
    it('deve retornar plano por id', async () => {
      mockPrisma.userCareerPlan.findUnique.mockResolvedValue(basePlan);
      const result = await service.findOne(1);
      expect(result.id).toBe(1);
    });

    it('deve lançar NotFoundException se não encontrado', async () => {
      mockPrisma.userCareerPlan.findUnique.mockResolvedValue(null);
      await expect(service.findOne(99)).rejects.toThrow(NotFoundException);
    });
  });
});
