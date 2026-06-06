import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { AvatarTrainingService } from './avatar-training.service';
import { PrismaService } from '../prisma/prisma.service';

const makeFind = (data: any[] = []) => jest.fn().mockResolvedValue(data);
const makeCount = (n = 0) => jest.fn().mockResolvedValue(n);

const mockPrisma = {
  avatarScenario: {
    findMany: makeFind(),
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    count: makeCount(),
    delete: jest.fn().mockResolvedValue({}),
  },
  avatarSession: {
    findMany: makeFind(),
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    count: makeCount(),
    groupBy: jest.fn().mockResolvedValue([]),
  },
  badge: { findMany: makeFind() },
  badgeAward: { create: jest.fn().mockResolvedValue({}), findFirst: jest.fn() },
  user: { findUnique: jest.fn() },
  userPoints: { update: jest.fn().mockResolvedValue({}), upsert: jest.fn().mockResolvedValue({}) },
  notificationLog: { create: jest.fn().mockResolvedValue({}) },
};

const proxyPrisma = new Proxy(mockPrisma, {
  get(target, prop) {
    if (prop in target) return (target as any)[prop];
    return {
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn().mockResolvedValue(null),
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({}),
      update: jest.fn().mockResolvedValue({}),
      count: jest.fn().mockResolvedValue(0),
      upsert: jest.fn().mockResolvedValue({}),
    };
  },
});

const baseScenario = {
  id: 1,
  title: 'Entrevista de Vendas',
  category: 'SALES',
  difficulty: 'MEDIUM',
  status: 'PUBLISHED',
  aiModel: 'GPT4',
  turns: [],
  _count: { sessions: 5 },
};

const baseSession = {
  id: 1,
  userId: 1,
  scenarioId: 1,
  status: 'IN_PROGRESS',
  turns: [],
  score: 0,
  scenario: baseScenario,
  user: { id: 1, fullName: 'Test' },
};

describe('AvatarTrainingService', () => {
  let service: AvatarTrainingService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [AvatarTrainingService, { provide: PrismaService, useValue: proxyPrisma }],
    }).compile();
    service = module.get<AvatarTrainingService>(AvatarTrainingService);
  });

  // ─── createAvatar ─────────────────────────────────────────────────────────

  describe('createAvatar', () => {
    it('deve criar avatar', async () => {
      const result = await service.createAvatar(1, { name: 'Avatar Test' } as any);
      expect(result).toBeDefined();
    });
  });

  // ─── getAvatars ───────────────────────────────────────────────────────────

  describe('getAvatars', () => {
    it('deve retornar avatares', async () => {
      const result = await service.getAvatars({});
      expect(result).toBeDefined();
    });
  });

  // ─── createScenario ───────────────────────────────────────────────────────

  describe('createScenario', () => {
    it('deve criar cenário de treino', async () => {
      mockPrisma.avatarScenario.create.mockResolvedValue(baseScenario);
      const result = await service.createScenario(1, {
        title: 'Entrevista de Vendas',
        category: 'SALES',
        difficulty: 'MEDIUM',
      } as any);
      expect(result).toBeDefined();
    });
  });

  // ─── getScenarios ─────────────────────────────────────────────────────────

  describe('getScenarios', () => {
    it('deve retornar cenários paginados', async () => {
      mockPrisma.avatarScenario.findMany.mockResolvedValue([baseScenario]);
      mockPrisma.avatarScenario.count.mockResolvedValue(1);
      const result = await service.getScenarios({});
      expect(result).toBeDefined();
    });

    it('deve retornar lista vazia', async () => {
      mockPrisma.avatarScenario.findMany.mockResolvedValue([]);
      mockPrisma.avatarScenario.count.mockResolvedValue(0);
      const result = await service.getScenarios({ category: 'SOFT_SKILLS' as any });
      expect(result).toBeDefined();
    });
  });

  // ─── getScenario ──────────────────────────────────────────────────────────

  describe('getScenario', () => {
    it('deve retornar cenário por id', async () => {
      mockPrisma.avatarScenario.findUnique.mockResolvedValue(baseScenario);
      const result = await service.getScenario(1);
      expect(result).toBeDefined();
    });

    it('deve retornar cenário com progresso do utilizador', async () => {
      mockPrisma.avatarScenario.findUnique.mockResolvedValue(baseScenario);
      mockPrisma.avatarSession.findMany.mockResolvedValue([{ id: 1, score: 85 }]);
      const result = await service.getScenario(1, 1);
      expect(result).toBeDefined();
    });

    it('deve lançar NotFoundException se não encontrado', async () => {
      mockPrisma.avatarScenario.findUnique.mockResolvedValue(null);
      await expect(service.getScenario(99)).rejects.toThrow(NotFoundException);
    });
  });

  // ─── startSession ─────────────────────────────────────────────────────────

  describe('startSession', () => {
    it('deve iniciar sessão', async () => {
      mockPrisma.avatarScenario.findUnique.mockResolvedValue(baseScenario);
      mockPrisma.avatarSession.create.mockResolvedValue(baseSession);

      const result = await service.startSession(1, { scenarioId: 1 } as any);
      expect(result).toBeDefined();
    });

    it('deve lançar NotFoundException se cenário não existe', async () => {
      mockPrisma.avatarScenario.findUnique.mockResolvedValue(null);
      await expect(service.startSession(1, { scenarioId: 99 } as any)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ─── sendMessage ──────────────────────────────────────────────────────────

  describe('sendMessage', () => {
    it('deve processar mensagem na sessão', async () => {
      mockPrisma.avatarSession.findUnique.mockResolvedValue({
        ...baseSession,
        scenario: { ...baseScenario, systemPrompt: 'You are a sales trainer' },
      });
      mockPrisma.avatarSession.update.mockResolvedValue(baseSession);

      const result = await service.sendMessage(1, 1, {
        message: 'Bom dia, tenho interesse no produto',
      } as any);
      expect(result).toBeDefined();
    });

    it('deve lançar NotFoundException se sessão não existe', async () => {
      mockPrisma.avatarSession.findUnique.mockResolvedValue(null);
      await expect(service.sendMessage(99, 1, { message: 'Test' } as any)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ─── completeSession ──────────────────────────────────────────────────────

  describe('completeSession', () => {
    it('deve completar sessão e calcular score', async () => {
      mockPrisma.avatarSession.findUnique.mockResolvedValue({
        ...baseSession,
        status: 'IN_PROGRESS',
        turns: [{ role: 'user', content: 'msg', score: 4 }],
      });
      mockPrisma.avatarSession.update.mockResolvedValue({ ...baseSession, status: 'COMPLETED', score: 85 });
      mockPrisma.badgeAward.findFirst.mockResolvedValue(null);

      const result = await service.completeSession(1, 1, {} as any);
      expect(result).toBeDefined();
    });

    it('deve lançar NotFoundException se sessão não existe', async () => {
      mockPrisma.avatarSession.findUnique.mockResolvedValue(null);
      await expect(service.completeSession(99, 1, {} as any)).rejects.toThrow(NotFoundException);
    });
  });

  // ─── pauseSession ─────────────────────────────────────────────────────────

  describe('pauseSession', () => {
    it('deve pausar sessão', async () => {
      mockPrisma.avatarSession.findUnique.mockResolvedValue({
        ...baseSession,
        status: 'IN_PROGRESS',
      });
      mockPrisma.avatarSession.update.mockResolvedValue({ ...baseSession, status: 'PAUSED' });

      const result = await service.pauseSession(1, 1);
      expect(result).toBeDefined();
    });
  });

  // ─── resumeSession ────────────────────────────────────────────────────────

  describe('resumeSession', () => {
    it('deve retomar sessão', async () => {
      mockPrisma.avatarSession.findUnique.mockResolvedValue({
        ...baseSession,
        status: 'PAUSED',
      });
      mockPrisma.avatarSession.update.mockResolvedValue({ ...baseSession, status: 'IN_PROGRESS' });

      const result = await service.resumeSession(1, 1);
      expect(result).toBeDefined();
    });
  });

  // ─── getMyHistory ─────────────────────────────────────────────────────────

  describe('getMyHistory', () => {
    it('deve retornar histórico do utilizador', async () => {
      mockPrisma.avatarSession.findMany.mockResolvedValue([baseSession]);
      const result = await service.getMyHistory(1, 20);
      expect(result).toBeDefined();
    });
  });

  // ─── getSessionDetail ─────────────────────────────────────────────────────

  describe('getSessionDetail', () => {
    it('deve retornar detalhe da sessão', async () => {
      mockPrisma.avatarSession.findUnique.mockResolvedValue(baseSession);
      const result = await service.getSessionDetail(1, 1);
      expect(result).toBeDefined();
    });

    it('deve lançar NotFoundException se sessão não existe', async () => {
      mockPrisma.avatarSession.findUnique.mockResolvedValue(null);
      await expect(service.getSessionDetail(99, 1)).rejects.toThrow(NotFoundException);
    });
  });

  // ─── getLeaderboard ───────────────────────────────────────────────────────

  describe('getLeaderboard', () => {
    it('deve retornar leaderboard do cenário', async () => {
      mockPrisma.avatarSession.findMany.mockResolvedValue([]);
      const result = await service.getLeaderboard(1, 10);
      expect(result).toBeDefined();
    });
  });

  // ─── getGlobalLeaderboard ─────────────────────────────────────────────────

  describe('getGlobalLeaderboard', () => {
    it('deve retornar leaderboard global', async () => {
      mockPrisma.avatarSession.groupBy.mockResolvedValue([]);
      const result = await service.getGlobalLeaderboard(undefined, 20);
      expect(result).toBeDefined();
    });
  });
});
