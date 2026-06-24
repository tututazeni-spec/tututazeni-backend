import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { ContentLibraryService } from './content-library.service';
import { PrismaService } from '../prisma/prisma.service';

const makeFind = (data: any[] = []) => jest.fn().mockResolvedValue(data);
const makeCount = (n = 0) => jest.fn().mockResolvedValue(n);

const mockPrisma = {
  contentAsset: {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    findMany: makeFind(),
    create: jest.fn(),
    update: jest.fn(),
    count: makeCount(),
    delete: jest.fn(),
    aggregate: jest.fn().mockResolvedValue({ _sum: { views: 0 } }),
  },
  user: { findUnique: jest.fn() },
  notificationLog: { create: jest.fn().mockResolvedValue({}) },
  auditLog: {
    create: jest.fn().mockResolvedValue({}),
    count: jest.fn().mockResolvedValue(0),
    groupBy: jest.fn().mockResolvedValue([]),
    findMany: jest.fn().mockResolvedValue([]),
    findFirst: jest.fn().mockResolvedValue(null),
    findUnique: jest.fn().mockResolvedValue(null),
  },
  userPoints: { update: jest.fn().mockResolvedValue({}) },
};

const baseAsset = {
  id: 1,
  title: 'Manual NestJS',
  type: 'DOCUMENT',
  status: 'PUBLISHED',
  category: 'Tech',
  tags: [],
  _count: { views: 10 },
};

describe('ContentLibraryService', () => {
  let service: ContentLibraryService;

  beforeEach(async () => {
    jest.clearAllMocks();
    Object.defineProperty(mockPrisma, 'read', {
      get() {
        return mockPrisma;
      },
      configurable: true,
    });
    const module: TestingModule = await Test.createTestingModule({
      providers: [ContentLibraryService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();
    service = module.get<ContentLibraryService>(ContentLibraryService);
  });

  describe('findAll', () => {
    it('deve retornar assets paginados', async () => {
      mockPrisma.contentAsset.findMany.mockResolvedValue([baseAsset]);
      mockPrisma.contentAsset.count.mockResolvedValue(1);
      const result = await service.findAll({});
      expect(result).toBeDefined();
    });
  });

  describe('findOne', () => {
    it('deve retornar asset por id', async () => {
      mockPrisma.contentAsset.findUnique.mockResolvedValue(baseAsset);
      const result = await service.findOne(1);
      expect(result).toBeDefined();
    });

    it('deve lançar NotFoundException se não encontrado', async () => {
      mockPrisma.contentAsset.findUnique.mockResolvedValue(null);
      await expect(service.findOne(99)).rejects.toThrow(NotFoundException);
    });
  });

  describe('create', () => {
    it('deve criar asset', async () => {
      mockPrisma.contentAsset.findFirst.mockResolvedValue(null);
      mockPrisma.contentAsset.create.mockResolvedValue(baseAsset);
      const result = await service.create(1, { title: 'Manual NestJS', type: 'DOCUMENT' } as any);
      expect(result).toBeDefined();
    });
  });

  // ─── update ───────────────────────────────────────────────────────────────

  describe('update', () => {
    it('deve actualizar asset', async () => {
      mockPrisma.contentAsset.findUnique.mockResolvedValue(baseAsset);
      mockPrisma.contentAsset.update.mockResolvedValue({ ...baseAsset, title: 'Actualizado' });
      const result = await service.update(1, { title: 'Actualizado' } as any, 1);
      expect(result).toBeDefined();
    });

    it('deve lançar NotFoundException se asset não existe', async () => {
      mockPrisma.contentAsset.findUnique.mockResolvedValue(null);
      await expect(service.update(99, {} as any, 1)).rejects.toThrow(NotFoundException);
    });
  });

  // ─── publish ──────────────────────────────────────────────────────────────

  describe('publish', () => {
    it('deve publicar asset', async () => {
      mockPrisma.contentAsset.findUnique.mockResolvedValue(baseAsset);
      mockPrisma.contentAsset.update.mockResolvedValue({ ...baseAsset, status: 'PUBLISHED' });
      const result = await service.publish(1, 1);
      expect(result).toBeDefined();
    });
  });

  // ─── deprecate ────────────────────────────────────────────────────────────

  describe('deprecate', () => {
    it('deve deprecar asset', async () => {
      mockPrisma.contentAsset.findUnique.mockResolvedValue(baseAsset);
      mockPrisma.contentAsset.update.mockResolvedValue({ ...baseAsset, status: 'DEPRECATED' });
      const result = await service.deprecate(1);
      expect(result).toBeDefined();
    });
  });

  // ─── bookmark ─────────────────────────────────────────────────────────────

  describe('bookmark', () => {
    it('deve adicionar/remover bookmark', async () => {
      mockPrisma.contentAsset.findUnique.mockResolvedValue({
        ...baseAsset,
        bookmarkedBy: [],
      });
      mockPrisma.contentAsset.update.mockResolvedValue(baseAsset);
      const result = await service.bookmark(1, 1);
      expect(result).toBeDefined();
    });
  });

  // ─── getMyBookmarks ───────────────────────────────────────────────────────

  describe('getMyBookmarks', () => {
    it('deve retornar bookmarks do utilizador', async () => {
      mockPrisma.contentAsset.findMany.mockResolvedValue([baseAsset]);
      const result = await service.getMyBookmarks(1);
      expect(result).toBeDefined();
    });
  });

  // ─── view ─────────────────────────────────────────────────────────────────

  describe('view', () => {
    it('deve registar visualização', async () => {
      mockPrisma.contentAsset.findUnique.mockResolvedValue({
        ...baseAsset,
        status: 'PUBLISHED',
        views: 10,
      });
      mockPrisma.contentAsset.update.mockResolvedValue({ ...baseAsset, views: 11 });
      const result = await service.view(1, 1);
      expect(result).toBeDefined();
    });

    it('deve lançar NotFoundException se não encontrado', async () => {
      mockPrisma.contentAsset.findUnique.mockResolvedValue(null);
      await expect(service.view(99, 1)).rejects.toThrow(NotFoundException);
    });
  });

  // ─── updateProgress ───────────────────────────────────────────────────────

  describe('updateProgress', () => {
    it('deve actualizar progresso de leitura', async () => {
      mockPrisma.contentAsset.findUnique.mockResolvedValue(baseAsset);
      const result = await service.updateProgress(1, 1, { progress: 50 } as any);
      expect(result).toBeDefined();
    });
  });

  // ─── getMyProgress ────────────────────────────────────────────────────────

  describe('getMyProgress', () => {
    it('deve retornar progresso do utilizador', async () => {
      const result = await service.getMyProgress(1);
      expect(result).toBeDefined();
    });
  });
});
