import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ForbiddenException } from '@nestjs/common';
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
  },
  microLearningProgress: {
    findFirst: jest.fn().mockResolvedValue(null),
    upsert: jest.fn().mockResolvedValue({}),
    findMany: jest.fn().mockResolvedValue([]),
  },
  microLearningLike: {
    findFirst: jest.fn().mockResolvedValue(null),
    create: jest.fn().mockResolvedValue({}),
    delete: jest.fn().mockResolvedValue({}),
    count: jest.fn().mockResolvedValue(0),
  },
  microLearningPlaylist: {
    findMany: jest.fn().mockResolvedValue([]),
    findUnique: jest.fn().mockResolvedValue(null),
    create: jest.fn().mockResolvedValue({}),
    update: jest.fn().mockResolvedValue({}),
  },
  notificationLog: { createMany: jest.fn().mockResolvedValue({ count: 0 }) },
  user: { findMany: jest.fn().mockResolvedValue([]) },
};

const baseMl = {
  id: 1, title: '5 Dicas TypeScript', contentType: 'VIDEO', status: 'PUBLISHED',
  durationSeconds: 180, level: 'BEGINNER', tags: ['typescript', 'coding'],
  viewCount: 100, authorId: 1,
  author: { id: 1, fullName: 'Admin', position: { name: 'CTO' } },
  category: { id: 1, name: 'Programação' },
  _count: { progress: 50, likes: 20 },
};

describe('MicroLearningService (additional)', () => {
  let service: MicroLearningService;

  beforeEach(async () => {
    jest.clearAllMocks();
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
      await service.findAll({ contentType: 'VIDEO' as any, level: 'BEGINNER' as any, tag: 'typescript', maxDuration: 300 });
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
      const result = await service.create({ title: '5 Dicas TS', contentType: 'VIDEO' as any, durationSeconds: 180 } as any, 1);
      expect(result).toBeDefined();
    });
  });

  // ─── update ───────────────────────────────────────────────────

  describe('update', () => {
    it('deve actualizar micro-learning pelo autor', async () => {
      mockPrisma.microLearning.findUnique.mockResolvedValue(baseMl);
      mockPrisma.microLearning.update.mockResolvedValue({ ...baseMl, title: 'Actualizado' });
      const result = await service.update(1, { title: 'Actualizado' } as any, 1, 'EMPLOYEE');
      expect(result).toBeDefined();
    });

    it('deve lançar ForbiddenException se não é o autor', async () => {
      mockPrisma.microLearning.findUnique.mockResolvedValue({ ...baseMl, authorId: 2 });
      await expect(service.update(1, {} as any, 99, 'EMPLOYEE')).rejects.toThrow(ForbiddenException);
    });
  });

  // ─── updateProgress ───────────────────────────────────────────

  describe('updateProgress', () => {
    it('deve actualizar progresso do utilizador', async () => {
      mockPrisma.microLearning.findUnique.mockResolvedValue(baseMl);
      mockPrisma.microLearningProgress.upsert.mockResolvedValue({ id: 1, progressPercent: 60, completed: false });
      const result = await service.updateProgress(1, { progressPercent: 60, timeSpent: 108 } as any, 2);
      expect(result).toBeDefined();
    });
  });

  // ─── interact ─────────────────────────────────────────────────

  describe('interact', () => {
    it('deve adicionar like ao micro-learning', async () => {
      mockPrisma.microLearning.findUnique.mockResolvedValue(baseMl);
      mockPrisma.microLearningLike.findFirst.mockResolvedValue(null);
      mockPrisma.microLearningLike.create.mockResolvedValue({ id: 1 });
      mockPrisma.microLearning.update.mockResolvedValue({ ...baseMl, viewCount: 101 });
      const result = await service.interact(1, { type: 'LIKE' } as any, 2);
      expect(result).toBeDefined();
    });

    it('deve remover like existente (toggle)', async () => {
      mockPrisma.microLearning.findUnique.mockResolvedValue(baseMl);
      mockPrisma.microLearningLike.findFirst.mockResolvedValue({ id: 1 });
      mockPrisma.microLearningLike.delete.mockResolvedValue({});
      mockPrisma.microLearning.update.mockResolvedValue(baseMl);
      const result = await service.interact(1, { type: 'LIKE' } as any, 2);
      expect(result).toBeDefined();
    });
  });

  // ─── createPlaylist ───────────────────────────────────────────

  describe('createPlaylist', () => {
    it('deve criar playlist de micro-learnings', async () => {
      mockPrisma.microLearningPlaylist.create.mockResolvedValue({ id: 1, userId: 1, title: 'Minha Playlist' });
      const result = await service.createPlaylist({ title: 'Minha Playlist', itemIds: [1, 2] } as any, 1);
      expect(result).toBeDefined();
    });
  });

  // ─── dispatch ─────────────────────────────────────────────────

  describe('dispatch', () => {
    it('deve enviar micro-learning para utilizadores', async () => {
      mockPrisma.microLearning.findUnique.mockResolvedValue(baseMl);
      mockPrisma.user.findMany.mockResolvedValue([{ id: 1 }, { id: 2 }]);
      mockPrisma.notificationLog.createMany.mockResolvedValue({ count: 2 });
      const result = await service.dispatch(1, { userIds: [1, 2] } as any, 1);
      expect(result).toBeDefined();
      expect(result).toHaveProperty('sent');
    });
  });

  // ─── getStats ────────────────────────────────────────────────

  describe('getStats', () => {
    it('deve retornar estatísticas de micro-learning', async () => {
      mockPrisma.microLearning.count.mockResolvedValue(50);
      const result = await service.getStats(1);
      expect(result).toBeDefined();
    });
  });
});
