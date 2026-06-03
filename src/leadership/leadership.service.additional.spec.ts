import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { LeadershipService } from './leadership.service';
import { PrismaService } from '../prisma/prisma.service';

const makeFind = (val: any = null) => jest.fn().mockResolvedValue(val);
const makeCount = (n = 0) => jest.fn().mockResolvedValue(n);

const continuousFeedbackMock = { count: makeCount() };

const mockPrisma = {
  leadershipProgram: {
    findUnique: makeFind({ id: 1, name: 'Prog', _count: { participants: 0 } }),
    findMany: makeFind([]),
    create: makeFind({ id: 1 }),
    update: makeFind({ id: 1 }),
    count: makeCount(1),
    delete: makeFind({}),
  },
  leadershipParticipant: {
    findFirst: makeFind(null),
    findUnique: makeFind(null),
    create: makeFind({ id: 1, userId: 1, programId: 1, program: { name: 'Test' } }),
    update: makeFind({ id: 1, progress: 80, status: 'IN_PROGRESS' }),
    findMany: makeFind([]),
    count: makeCount(0),
    aggregate: jest.fn().mockResolvedValue({ _avg: { progress: 75 } }),
    delete: makeFind({}),
  },
  leadershipScore: { create: makeFind({}), findMany: makeFind([]) },
  leadershipFeedback360: { create: makeFind({}), findMany: makeFind([]) },
  leadershipPulse: { create: makeFind({}), findMany: makeFind([]) },
  mentoring: { create: makeFind({}), findMany: makeFind([]), findUnique: makeFind(null), update: makeFind({}), count: makeCount() },
  mentoringSession: { create: makeFind({}), findMany: makeFind([]) },
  oneOnOne: { create: makeFind({ id: 1 }), findMany: makeFind([]), findUnique: makeFind(null), update: makeFind({}) },
  teamHealth: { create: makeFind({}), findMany: makeFind([]), upsert: makeFind({}) },
  teamHealth2: makeFind(null),
  kudos: { create: makeFind({}), findMany: makeFind([]), count: makeCount() },
  performanceReview: { findMany: makeFind([]), count: makeCount(), aggregate: jest.fn().mockResolvedValue({ _avg: { score: null } }), findFirst: makeFind(null) },
  certificate: { create: makeFind({ id: 1 }) },
  notificationLog: { create: makeFind({}) },
  userPoints: { update: makeFind({}), upsert: makeFind({}) },
  user: { findMany: makeFind([]), findUnique: makeFind(null) },
};

const mockPrismaProxy = new Proxy(mockPrisma, {
  get(target, prop) {
    if (prop === 'continuousFeedback') return continuousFeedbackMock;
    if (prop === 'teamHealth') return { findUnique: makeFind(null), upsert: makeFind({}) };
    return (target as any)[prop];
  },
});

describe('LeadershipService — additional coverage', () => {
  let service: LeadershipService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [LeadershipService, { provide: PrismaService, useValue: mockPrismaProxy }],
    }).compile();
    service = module.get<LeadershipService>(LeadershipService);
  });

  // ─── update ───────────────────────────────────────────────────────────────

  describe('update', () => {
    it('deve actualizar programa existente', async () => {
      mockPrisma.leadershipProgram.findUnique.mockResolvedValue({
        id: 1,
        name: 'Prog',
        _count: { participants: 0 },
      });
      mockPrisma.leadershipProgram.update.mockResolvedValue({ id: 1, name: 'Actualizado' });

      const result = await service.update(1, { name: 'Actualizado' } as any);
      expect(result).toBeDefined();
    });

    it('deve lançar NotFoundException se programa não existe', async () => {
      mockPrisma.leadershipProgram.findUnique.mockResolvedValue(null);
      await expect(service.update(99, { name: 'X' } as any)).rejects.toThrow(NotFoundException);
    });
  });

  // ─── remove ───────────────────────────────────────────────────────────────

  describe('remove', () => {
    it('deve remover programa sem participantes', async () => {
      mockPrisma.leadershipProgram.findUnique.mockResolvedValue({
        id: 1,
        name: 'Prog',
        _count: { participants: 0 },
      });
      mockPrisma.leadershipProgram.delete.mockResolvedValue({});

      const result = await service.remove(1);
      expect(result).toHaveProperty('message');
    });

    it('deve lançar BadRequestException se tem participantes', async () => {
      mockPrisma.leadershipProgram.findUnique.mockResolvedValue({
        id: 1,
        name: 'Prog',
        _count: { participants: 3 },
      });

      await expect(service.remove(1)).rejects.toThrow(BadRequestException);
    });
  });

  // ─── updateProgress ───────────────────────────────────────────────────────

  describe('updateProgress', () => {
    it('deve actualizar progresso do participante', async () => {
      mockPrisma.leadershipParticipant.findUnique.mockResolvedValue({
        id: 1,
        userId: 1,
        programId: 1,
        status: 'IN_PROGRESS',
        program: { name: 'Test' },
      });
      mockPrisma.leadershipParticipant.update.mockResolvedValue({
        id: 1,
        progress: 80,
        status: 'IN_PROGRESS',
      });

      const result = await service.updateProgress(1, 1, { progress: 80 } as any);
      expect(result).toBeDefined();
    });

    it('deve lançar NotFoundException se participante não encontrado', async () => {
      mockPrisma.leadershipParticipant.findUnique.mockResolvedValue(null);

      await expect(service.updateProgress(99, 99, { progress: 50 } as any)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ─── withdraw ─────────────────────────────────────────────────────────────

  describe('withdraw', () => {
    it('deve efectuar withdrawal do programa', async () => {
      mockPrisma.leadershipParticipant.findUnique.mockResolvedValue({ id: 1 });
      mockPrisma.leadershipParticipant.update.mockResolvedValue({ id: 1, status: 'WITHDRAWN' });

      const result = await service.withdraw(1, 1);
      expect(result).toBeDefined();
    });

    it('deve lançar NotFoundException se inscrição não encontrada', async () => {
      mockPrisma.leadershipParticipant.findUnique.mockResolvedValue(null);
      await expect(service.withdraw(99, 99)).rejects.toThrow(NotFoundException);
    });
  });

  // ─── getMyPrograms ────────────────────────────────────────────────────────

  describe('getMyPrograms', () => {
    it('deve retornar programas do utilizador', async () => {
      mockPrisma.leadershipParticipant.findMany.mockResolvedValue([
        { id: 1, userId: 1, program: { id: 1, name: 'Test', level: 'BASIC', status: 'ACTIVE' } },
      ]);

      const result = await service.getMyPrograms(1);
      expect(result).toHaveLength(1);
    });
  });

  // ─── getProgramStats ──────────────────────────────────────────────────────

  describe('getProgramStats', () => {
    it('deve retornar estatísticas do programa', async () => {
      mockPrisma.leadershipProgram.findUnique.mockResolvedValue({
        id: 1,
        name: 'Prog',
        _count: { participants: 5 },
      });
      mockPrisma.leadershipParticipant.count.mockResolvedValue(5);
      mockPrisma.leadershipParticipant.aggregate.mockResolvedValue({ _avg: { progress: 60 } });

      const result = await service.getProgramStats(1);

      expect(result).toHaveProperty('programId', 1);
      expect(result).toHaveProperty('total');
      expect(result).toHaveProperty('completionRate');
    });
  });

  // ─── getTeamDashboard ─────────────────────────────────────────────────────

  describe('getTeamDashboard', () => {
    it('deve retornar dashboard da equipa (sem membros)', async () => {
      mockPrisma.user.findMany.mockResolvedValue([]);

      const result = await service.getTeamDashboard(1);

      expect(result).toHaveProperty('team');
      expect(result).toHaveProperty('alerts');
      expect(result.total).toBe(0);
    });
  });

  // ─── findAll com filtros ──────────────────────────────────────────────────

  describe('findAll with filters', () => {
    it('deve filtrar por level e status', async () => {
      mockPrisma.leadershipProgram.findMany.mockResolvedValue([]);
      mockPrisma.leadershipProgram.count.mockResolvedValue(0);

      const result = await service.findAll({ page: 1, limit: 10, status: 'ACTIVE' as any });

      expect(result).toHaveProperty('data');
      expect(result).toHaveProperty('total');
    });
  });
});
