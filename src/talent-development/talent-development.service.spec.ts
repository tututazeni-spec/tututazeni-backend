import { Test, TestingModule } from '@nestjs/testing';
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
  },
  developmentPlanAction: {
    findMany: makeFind(),
    create: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
    count: makeCount(),
    createMany: jest.fn().mockResolvedValue({ count: 0 }),
  },
  pdiGoal: { findMany: makeFind(), create: jest.fn() },
  position: { findMany: makeFind() },
  successionPlan: { findMany: makeFind(), count: makeCount() },
  careerRole: { findMany: makeFind() },
  roleSkillMatrix: { findMany: makeFind() },
  legacyEmployeeSkill: { findMany: makeFind() },
  mentoring: { count: makeCount(), findMany: makeFind() },
  mentoringSession: { findMany: makeFind() },
  badgeAward: { count: makeCount(), findMany: makeFind() },
  userPoints: { findMany: makeFind(), findUnique: jest.fn().mockResolvedValue({ points: 0 }) },
  notificationLog: { create: jest.fn().mockResolvedValue({}) },
};

describe('TalentDevelopmentService', () => {
  let service: TalentDevelopmentService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [TalentDevelopmentService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();
    service = module.get<TalentDevelopmentService>(TalentDevelopmentService);
  });

  describe('getTalentPool', () => {
    it('deve retornar pool de talentos', async () => {
      mockPrisma.user.findMany.mockResolvedValue([]);
      mockPrisma.user.count.mockResolvedValue(0);
      const result = await service.getTalentPool({});
      expect(result).toBeDefined();
    });
  });

  describe('getHighPotentials', () => {
    it('deve retornar top talentos', async () => {
      mockPrisma.user.findMany.mockResolvedValue([]);
      const result = await service.getHighPotentials(10);
      expect(result).toBeDefined();
    });
  });

  describe('getTalentMatrix', () => {
    it('deve retornar matriz 9-box', async () => {
      mockPrisma.user.findMany.mockResolvedValue([]);
      const result = await service.getTalentMatrix();
      expect(result).toBeDefined();
    });
  });

  describe('createPlan', () => {
    it('deve criar plano de desenvolvimento', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ id: 1, fullName: 'Test' });
      mockPrisma.developmentPlan.create.mockResolvedValue({
        id: 1,
        name: 'PDI 2024',
        userId: 1,
        status: 'DRAFT',
        goals: [],
      });

      const result = await service.createPlan(
        { name: 'PDI 2024', userId: 1, goal: 'Crescer', managerId: 2 } as any,
        1,
      );
      expect(result).toBeDefined();
    });
  });
});
