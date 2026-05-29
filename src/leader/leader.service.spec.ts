import { Test, TestingModule } from '@nestjs/testing';
import { LeaderService } from './leader.service';
import { PrismaService } from '../prisma/prisma.service';

const makeFind = (data: any[] = []) => jest.fn().mockResolvedValue(data);
const makeCount = (n = 0) => jest.fn().mockResolvedValue(n);

const mockPrisma = {
  user: { findUnique: jest.fn(), findMany: makeFind(), count: makeCount() },
  performanceReview: { findMany: makeFind(), count: makeCount(), aggregate: jest.fn().mockResolvedValue({ _avg: {} }), groupBy: jest.fn().mockResolvedValue([]) },
  enrollment: { findMany: makeFind(), count: makeCount() },
  developmentPlan: { findMany: makeFind(), count: makeCount() },
  developmentPlanAction: { findMany: makeFind(), count: makeCount() },
  surveyResponse: { findMany: makeFind(), count: makeCount() },
  historyRecord: { findMany: makeFind(), count: makeCount() },
  badgeAward: { findMany: makeFind(), count: makeCount() },
  auditLog: { findMany: makeFind() },
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
        id: 1, fullName: 'Manager', _count: { subordinates: 3 },
        subordinates: [], position: null, department: null,
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
});
