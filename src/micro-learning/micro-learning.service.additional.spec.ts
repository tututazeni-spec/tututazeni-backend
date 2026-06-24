import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { MicroLearningService } from './micro-learning.service';
import { PrismaService } from '../prisma/prisma.service';

const mockPrisma: any = {
  microLearning: {
    findMany: jest.fn().mockResolvedValue([]),
    findUnique: jest.fn().mockResolvedValue(null),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    count: jest.fn().mockResolvedValue(0),
    aggregate: jest.fn().mockResolvedValue({ _sum: { viewCount: 0 } }),
  },
  microLearningProgress: {
    findFirst: jest.fn().mockResolvedValue(null),
    upsert: jest.fn().mockResolvedValue({}),
    findMany: jest.fn().mockResolvedValue([]),
    createMany: jest.fn().mockResolvedValue({ count: 0 }),
    count: jest.fn().mockResolvedValue(0),
    aggregate: jest.fn().mockResolvedValue({ _avg: { progress: 0, watchedSeconds: 0 } }),
  },
  microLearningLike: {
    findFirst: jest.fn().mockResolvedValue(null),
    create: jest.fn().mockResolvedValue({}),
    delete: jest.fn().mockResolvedValue({}),
    count: jest.fn().mockResolvedValue(0),
  },
  microLearningInteraction: {
    findFirst: jest.fn().mockResolvedValue(null),
    create: jest.fn().mockResolvedValue({}),
    delete: jest.fn().mockResolvedValue({}),
    count: jest.fn().mockResolvedValue(0),
    findMany: jest.fn().mockResolvedValue([]),
  },
  microLearningPlaylist: {
    findMany: jest.fn().mockResolvedValue([]),
    findUnique: jest.fn().mockResolvedValue(null),
    create: jest.fn().mockResolvedValue({}),
    update: jest.fn().mockResolvedValue({}),
  },
  playlistItem: {
    createMany: jest.fn().mockResolvedValue({ count: 0 }),
  },
  microQuizQuestion: {
    findMany: jest.fn().mockResolvedValue([]),
    createMany: jest.fn().mockResolvedValue({ count: 0 }),
    deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
  },
  microQuizAttempt: {
    create: jest.fn().mockResolvedValue({}),
    aggregate: jest.fn().mockResolvedValue({ _avg: { score: 0 }, _count: 0 }),
  },
  notificationLog: {
    create: jest.fn().mockResolvedValue({}),
    createMany: jest.fn().mockResolvedValue({ count: 0 }),
  },
  user: { findMany: jest.fn().mockResolvedValue([]) },
  userPoints: { upsert: jest.fn().mockResolvedValue({}) },
  learningStreak: {
    findUnique: jest.fn().mockResolvedValue(null),
    create: jest.fn().mockResolvedValue({}),
    update: jest.fn().mockResolvedValue({}),
    count: jest.fn().mockResolvedValue(0),
  },
};

const baseMl = {
  id: 1,
  title: '5 Dicas TypeScript',
  contentType: 'VIDEO',
  status: 'PUBLISHED',
  durationSeconds: 180,
  level: 'BEGINNER',
  tags: ['typescript', 'coding'],
  viewCount: 100,
  authorId: 1,
  xpReward: 10,
  author: { id: 1, fullName: 'Admin', position: { name: 'CTO' } },
  category: { id: 1, name: 'Programação' },
  _count: { progress: 50, likes: 20 },
};

describe('MicroLearningService (additional)', () => {
  let service: MicroLearningService;

  beforeEach(async () => {
    jest.clearAllMocks();
    Object.defineProperty(mockPrisma, 'read', {
      get() {
        return mockPrisma;
      },
      configurable: true,
    });
    const module: TestingModule = await Test.createTestingModule({
      providers: [MicroLearningService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();
    service = module.get<MicroLearningService>(MicroLearningService);
  });

  // ─── findAll ──────────────────────────────────────────────────

  describe('findAll', () => {
    it('deve retornar micro-learnings paginados', async () => {
      mockPrisma.microLearning.findMany.mockResolvedValue([baseMl]);
      mockPrisma.microLearning.count.mockResolvedValue(1);
      const result = await service.findAll({ page: 1, limit: 10 });
      expect(result.data).toHaveLength(1);
      expect(result.total).toBe(1);
    });

    it('deve filtrar por contentType, level, tag, maxDuration', async () => {
      mockPrisma.microLearning.findMany.mockResolvedValue([]);
      mockPrisma.microLearning.count.mockResolvedValue(0);
      await service.findAll({
        contentType: 'VIDEO' as any,
        level: 'BEGINNER' as any,
        tag: 'typescript',
        maxDuration: 300,
      });
      expect(mockPrisma.microLearning.findMany).toHaveBeenCalled();
    });

    it('deve ordenar por POPULAR', async () => {
      mockPrisma.microLearning.findMany.mockResolvedValue([]);
      mockPrisma.microLearning.count.mockResolvedValue(0);
      await service.findAll({ sortBy: 'POPULAR' as any });
      expect(mockPrisma.microLearning.findMany).toHaveBeenCalled();
    });
  });

  // ─── findOne ──────────────────────────────────────────────────

  describe('findOne', () => {
    it('deve retornar micro-learning e incrementar viewCount', async () => {
      mockPrisma.microLearning.findUnique.mockResolvedValue(baseMl);
      mockPrisma.microLearning.update.mockResolvedValue({ ...baseMl, viewCount: 101 });
      const result = await service.findOne(1);
      expect(result).toBeDefined();
    });

    it('deve lançar NotFoundException se não encontrado', async () => {
      mockPrisma.microLearning.findUnique.mockResolvedValue(null);
      await expect(service.findOne(99)).rejects.toThrow(NotFoundException);
    });
  });

  // ─── create ───────────────────────────────────────────────────

  describe('create', () => {
    it('deve criar micro-learning', async () => {
      mockPrisma.microLearning.create.mockResolvedValue(baseMl);
      mockPrisma.microLearning.findUnique.mockResolvedValue(baseMl);
      const result = await service.create(
        { title: '5 Dicas TS', contentType: 'VIDEO' as any, durationSeconds: 180 } as any,
        1,
      );
      expect(result).toBeDefined();
    });
  });

  // ─── update ───────────────────────────────────────────────────

  describe('update', () => {
    it('deve actualizar micro-learning', async () => {
      mockPrisma.microLearning.findUnique.mockResolvedValue(baseMl);
      mockPrisma.microLearning.update.mockResolvedValue({ ...baseMl, title: 'Actualizado' });
      // Real signature: update(id, dto, updatedById?) — 2-3 args max
      const result = await service.update(1, { title: 'Actualizado' } as any, 1);
      expect(result).toBeDefined();
    });

    it('deve actualizar micro-learning sem updatedById', async () => {
      mockPrisma.microLearning.findUnique.mockResolvedValue(baseMl);
      mockPrisma.microLearning.update.mockResolvedValue(baseMl);
      const result = await service.update(1, {} as any);
      expect(result).toBeDefined();
    });
  });

  // ─── updateProgress ───────────────────────────────────────────

  describe('updateProgress', () => {
    it('deve actualizar progresso do utilizador', async () => {
      mockPrisma.microLearning.findUnique.mockResolvedValue(baseMl);
      mockPrisma.microLearningProgress.findFirst.mockResolvedValue(null);
      mockPrisma.microLearningProgress.upsert.mockResolvedValue({
        id: 1,
        progress: 60,
      });
      mockPrisma.microLearning.update.mockResolvedValue(baseMl);
      // Real signature: updateProgress(userId, dto) — 2 args
      const result = await service.updateProgress(1, {
        microLearningId: 1,
        progress: 60,
        watchedSeconds: 108,
      } as any);
      expect(result).toBeDefined();
    });
  });

  // ─── interact ─────────────────────────────────────────────────

  describe('interact', () => {
    it('deve adicionar like ao micro-learning', async () => {
      mockPrisma.microLearningInteraction.findFirst.mockResolvedValue(null);
      mockPrisma.microLearningInteraction.create.mockResolvedValue({ id: 1 });
      // Real signature: interact(userId, dto) — 2 args
      const result = await service.interact(1, { microLearningId: 1, action: 'LIKE' } as any);
      expect(result).toBeDefined();
    });

    it('deve remover like existente (toggle)', async () => {
      mockPrisma.microLearningInteraction.findFirst.mockResolvedValue({ id: 1 });
      mockPrisma.microLearningInteraction.delete.mockResolvedValue({});
      // Real signature: interact(userId, dto) — 2 args
      const result = await service.interact(1, { microLearningId: 1, action: 'LIKE' } as any);
      expect(result).toBeDefined();
    });
  });

  // ─── createPlaylist ───────────────────────────────────────────

  describe('createPlaylist', () => {
    it('deve criar playlist de micro-learnings', async () => {
      mockPrisma.microLearningPlaylist.create.mockResolvedValue({
        id: 1,
        authorId: 1,
        title: 'Minha Playlist',
      });
      mockPrisma.microLearningPlaylist.findUnique.mockResolvedValue({
        id: 1,
        title: 'Minha Playlist',
        items: [],
        author: { id: 1, fullName: 'Admin' },
        _count: { items: 0 },
      });
      const result = await service.createPlaylist(
        { title: 'Minha Playlist', contentIds: [1, 2] } as any,
        1,
      );
      expect(result).toBeDefined();
    });
  });

  // ─── dispatch ─────────────────────────────────────────────────

  describe('dispatch', () => {
    it('deve enviar micro-learning para utilizadores', async () => {
      mockPrisma.microLearning.findUnique.mockResolvedValue(baseMl);
      mockPrisma.microLearningProgress.findMany.mockResolvedValue([]);
      mockPrisma.microLearningProgress.createMany.mockResolvedValue({ count: 2 });
      mockPrisma.notificationLog.create.mockResolvedValue({});
      // Real signature: dispatch(dto) — 1 arg (DispatchMicroLearningDto)
      const result = await service.dispatch({ microLearningId: 1, userIds: [1, 2] } as any);
      expect(result).toBeDefined();
      expect(result).toHaveProperty('dispatched');
    });
  });

  // ─── getContentStats (replaces non-existent getStats) ────────

  describe('getContentStats', () => {
    it('deve retornar estatísticas de micro-learning', async () => {
      mockPrisma.microLearning.findUnique.mockResolvedValue(baseMl);
      mockPrisma.microLearningProgress.count.mockResolvedValue(50);
      mockPrisma.microLearningProgress.aggregate.mockResolvedValue({
        _avg: { progress: 70, watchedSeconds: 100 },
      });
      mockPrisma.microQuizAttempt.aggregate.mockResolvedValue({ _avg: { score: 80 }, _count: 5 });
      mockPrisma.microLearningInteraction.count.mockResolvedValue(20);
      // Real method is getContentStats(id) — getStats doesn't exist
      const result = await service.getContentStats(1);
      expect(result).toBeDefined();
    });
  });
});
