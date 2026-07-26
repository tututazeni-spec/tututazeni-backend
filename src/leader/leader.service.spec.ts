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
  oneOnOneMeeting: {
    findUnique: jest.fn(),
    update: jest.fn().mockResolvedValue({}),
    create: jest.fn().mockResolvedValue({}),
    findMany: makeFind(),
  },
};

const leaderUser = { id: 1, email: 'leader@innova.com', role: { name: 'LIDER' } };
const otherLeaderUser = { id: 99, email: 'other@innova.com', role: { name: 'LIDER' } };
const adminUser = { id: 999, email: 'admin@innova.com', role: { name: 'ADMIN' } };

describe('LeaderService', () => {
  let service: LeaderService;

  beforeEach(async () => {
    jest.clearAllMocks();
    Object.defineProperty(mockPrisma, 'read', {
      get() {
        return mockPrisma;
      },
      configurable: true,
    });
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
      mockPrisma.user.count.mockResolvedValue(1); // memberId 2 pertence à equipa do leaderUser (id 1)
      const result = await service.getMemberProfile(leaderUser as any, 2);
      expect(result).toBeDefined();
    });

    it('não permite líder B aceder a perfil de membro de outra equipa (A ≠ B)', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 2,
        fullName: 'Team Member',
        managerId: 1, // pertence ao leaderUser (id 1), não ao otherLeaderUser (id 99)
        createdAt: new Date('2021-01-01'),
        enrollments: [],
        certificates: [],
        badgeAwards: [],
        performanceReviews: [],
        developmentPlans: [],
        userCompetencies: [],
      });
      mockPrisma.user.count.mockResolvedValue(0); // não é membro da equipa do otherLeaderUser

      await expect(service.getMemberProfile(otherLeaderUser as any, 2)).rejects.toThrow(
        'Membro não encontrado',
      );
    });

    it('permite ADMIN aceder a perfil de membro de qualquer equipa', async () => {
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
      mockPrisma.user.count.mockResolvedValue(0);

      const result = await service.getMemberProfile(adminUser as any, 2);
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

  // ─── completeOneOnOne ─────────────────────────────────────────────────────

  describe('completeOneOnOne', () => {
    it('permite ao host (líder dono) concluir a reunião', async () => {
      mockPrisma.oneOnOneMeeting.findUnique.mockResolvedValue({
        id: 10,
        hostId: 1,
        participantId: 2,
        status: 'SCHEDULED',
      });
      mockPrisma.oneOnOneMeeting.update.mockResolvedValue({ id: 10, status: 'COMPLETED' });

      const result = await service.completeOneOnOne(10, 'notas', leaderUser as any);
      expect(result).toBeDefined();
      expect(mockPrisma.oneOnOneMeeting.update).toHaveBeenCalled();
    });

    it('permite ao participante concluir a reunião', async () => {
      mockPrisma.oneOnOneMeeting.findUnique.mockResolvedValue({
        id: 11,
        hostId: 1,
        participantId: 2,
        status: 'SCHEDULED',
      });
      mockPrisma.oneOnOneMeeting.update.mockResolvedValue({ id: 11, status: 'COMPLETED' });

      const participantUser = { id: 2, email: 'member@innova.com', role: { name: 'COLABORADOR' } };
      const result = await service.completeOneOnOne(11, 'notas', participantUser as any);
      expect(result).toBeDefined();
    });

    it('não permite líder B (nem host nem participante) concluir reunião de A', async () => {
      mockPrisma.oneOnOneMeeting.findUnique.mockResolvedValue({
        id: 12,
        hostId: 1,
        participantId: 2,
        status: 'SCHEDULED',
      });

      await expect(service.completeOneOnOne(12, 'notas', otherLeaderUser as any)).rejects.toThrow(
        'Reunião 1:1 não encontrada',
      );
      expect(mockPrisma.oneOnOneMeeting.update).not.toHaveBeenCalled();
    });

    it('permite ADMIN concluir reunião de qualquer líder', async () => {
      mockPrisma.oneOnOneMeeting.findUnique.mockResolvedValue({
        id: 13,
        hostId: 1,
        participantId: 2,
        status: 'SCHEDULED',
      });
      mockPrisma.oneOnOneMeeting.update.mockResolvedValue({ id: 13, status: 'COMPLETED' });

      const result = await service.completeOneOnOne(13, 'notas', adminUser as any);
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
