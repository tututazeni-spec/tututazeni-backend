import { Test, TestingModule } from '@nestjs/testing';
import { LeaderService } from './leader.service';
import { PrismaService } from '../prisma/prisma.service';

const makeFind = (data: any[] = []) => jest.fn().mockResolvedValue(data);
const makeCount = (n = 0) => jest.fn().mockResolvedValue(n);

const mockPrisma = {
  user: { findUnique: jest.fn(), findMany: makeFind(), count: makeCount() },
  performanceReview: {
    findMany: makeFind(),
    count: makeCount(),
    aggregate: jest.fn().mockResolvedValue({ _avg: {} }),
    groupBy: jest.fn().mockResolvedValue([]),
  },
  enrollment: { findMany: makeFind(), count: makeCount() },
  developmentPlan: { findMany: makeFind(), count: makeCount() },
  developmentPlanAction: { findMany: makeFind(), count: makeCount() },
  surveyResponse: { findMany: makeFind(), count: makeCount() },
  historyRecord: { findMany: makeFind(), count: makeCount() },
  badgeAward: { findMany: makeFind(), count: makeCount() },
  auditLog: { findMany: makeFind(), create: jest.fn().mockResolvedValue({}) },
  notificationLog: { create: jest.fn().mockResolvedValue({}) },
};

describe('LeaderService', () => {
  let service: LeaderService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [LeaderService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();
    service = module.get<LeaderService>(LeaderService);
  });

  describe('getLeaders', () => {
    it('deve retornar lista de líderes', async () => {
      mockPrisma.user.findMany.mockResolvedValue([]);
      const result = await service.getLeaders();
      expect(result).toBeDefined();
    });
  });

  describe('getLeaderDashboard', () => {
    it('deve retornar dashboard do líder', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 1,
        fullName: 'Manager',
        _count: { subordinates: 3 },
        subordinates: [],
        position: null,
        department: null,
      });
      const result = await service.getLeaderDashboard(1);
      expect(result).toBeDefined();
    });
  });

  describe('getTeamPerformance', () => {
    it('deve retornar performance da equipa', async () => {
      mockPrisma.user.findMany.mockResolvedValue([]);
      const result = await service.getTeamPerformance(1);
      expect(result).toBeDefined();
    });
  });

  // ─── getTeam ──────────────────────────────────────────────────────────────

  describe('getTeam', () => {
    it('deve retornar equipa do líder', async () => {
      mockPrisma.user.findMany.mockResolvedValue([]);
      mockPrisma.user.count.mockResolvedValue(0);
      const result = await service.getTeam(1, {});
      expect(result).toBeDefined();
    });
  });

  // ─── getMemberProfile ─────────────────────────────────────────────────────

  describe('getMemberProfile', () => {
    it('deve retornar perfil do membro', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 2,
        fullName: 'Team Member',
        managerId: 1,
        createdAt: new Date('2021-01-01'),
        enrollments: [],
        certificates: [],
        badgeAwards: [],
        performanceReviews: [],
        developmentPlans: [],
        userCompetencies: [],
      });
      const result = await service.getMemberProfile(1, 2);
      expect(result).toBeDefined();
    });
  });

  // ─── giveFeedback ─────────────────────────────────────────────────────────

  describe('giveFeedback', () => {
    it('deve dar feedback a membro da equipa', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ id: 2, managerId: 1 });
      const result = await service.giveFeedback(1, {
        toUserId: 2,
        type: 'RECOGNITION',
        message: 'Excelente trabalho',
      } as any);
      expect(result).toBeDefined();
    });
  });

  // ─── getTeamFeedbacks ─────────────────────────────────────────────────────

  describe('getTeamFeedbacks', () => {
    it('deve retornar feedbacks da equipa', async () => {
      mockPrisma.user.findMany.mockResolvedValue([{ id: 2 }, { id: 3 }]);
      const result = await service.getTeamFeedbacks(1);
      expect(result).toBeDefined();
    });
  });

  // ─── createOneOnOne ───────────────────────────────────────────────────────

  describe('createOneOnOne', () => {
    it('deve criar 1:1 com membro da equipa', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ id: 2, managerId: 1 });
      const result = await service.createOneOnOne(1, {
        memberId: 2,
        scheduledAt: new Date().toISOString(),
        topics: [],
      } as any);
      expect(result).toBeDefined();
    });
  });

  // ─── getOneOnOnes ─────────────────────────────────────────────────────────

  describe('getOneOnOnes', () => {
    it('deve retornar 1:1s do líder', async () => {
      const result = await service.getOneOnOnes(1);
      expect(result).toBeDefined();
    });
  });

  // ─── getTeamPlans ─────────────────────────────────────────────────────────

  describe('getTeamPlans', () => {
    it('deve retornar planos de desenvolvimento da equipa', async () => {
      mockPrisma.user.findMany.mockResolvedValue([]);
      const result = await service.getTeamPlans(1);
      expect(result).toBeDefined();
    });
  });

  // ─── getTalentPipeline ────────────────────────────────────────────────────

  describe('getTalentPipeline', () => {
    it('deve retornar pipeline de talentos da equipa', async () => {
      mockPrisma.user.findMany.mockResolvedValue([]);
      const result = await service.getTalentPipeline(1);
      expect(result).toBeDefined();
    });
  });
});
