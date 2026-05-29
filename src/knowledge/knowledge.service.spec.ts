import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { KnowledgeService } from './knowledge.service';
import { PrismaService } from '../prisma/prisma.service';

const mockPrisma = {
  knowledgeCategory: {
    findMany: jest.fn().mockResolvedValue([]),
    findFirst: jest.fn().mockResolvedValue(null),
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    count: jest.fn().mockResolvedValue(0),
  },
  knowledgeArticle: {
    findMany: jest.fn().mockResolvedValue([]),
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    count: jest.fn().mockResolvedValue(0),
    delete: jest.fn(),
  },
  knowledgeTag: { findMany: jest.fn().mockResolvedValue([]), findFirst: jest.fn(), create: jest.fn() },
  knowledgeInteraction: { create: jest.fn().mockResolvedValue({}) },
  knowledgeSearchLog: { create: jest.fn().mockResolvedValue({}) },
  articleAcknowledgement: { findFirst: jest.fn(), create: jest.fn(), update: jest.fn(), count: jest.fn().mockResolvedValue(0) },
  articleComment: { create: jest.fn(), findMany: jest.fn().mockResolvedValue([]), findUnique: jest.fn(), update: jest.fn(), delete: jest.fn() },
  articleRating: { upsert: jest.fn(), aggregate: jest.fn().mockResolvedValue({ _avg: { rating: 0 } }) },
  articleQuestion: { create: jest.fn(), findMany: jest.fn().mockResolvedValue([]), findUnique: jest.fn(), update: jest.fn() },
  articleVersion: { create: jest.fn().mockResolvedValue({}) },
  user: { findUnique: jest.fn() },
};

const baseArticle = {
  id: 1, title: 'Como usar NestJS', status: 'PUBLISHED', category: null,
  tags: [], views: 0, _count: { views: 0, comments: 0, acknowledgements: 0 },
};

describe('KnowledgeService', () => {
  let service: KnowledgeService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        KnowledgeService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();
    service = module.get<KnowledgeService>(KnowledgeService);
  });

  describe('findAllCategories', () => {
    it('deve retornar categorias', async () => {
      mockPrisma.knowledgeCategory.findMany.mockResolvedValue([{ id: 1, name: 'Tech' }]);
      const result = await service.findAllCategories();
      expect(result).toHaveLength(1);
    });
  });

  describe('findAll', () => {
    it('deve retornar artigos paginados', async () => {
      mockPrisma.knowledgeArticle.findMany.mockResolvedValue([baseArticle]);
      mockPrisma.knowledgeArticle.count.mockResolvedValue(1);
      const result = await service.findAll({});
      expect((result as any).data).toBeDefined();
    });
  });

  describe('findOne', () => {
    it('deve retornar artigo por id', async () => {
      mockPrisma.knowledgeArticle.findUnique.mockResolvedValue(baseArticle);
      const result = await service.findOne(1);
      expect(result).toBeDefined();
    });

    it('deve lançar NotFoundException se não encontrado', async () => {
      mockPrisma.knowledgeArticle.findUnique.mockResolvedValue(null);
      await expect(service.findOne(99)).rejects.toThrow(NotFoundException);
    });
  });

  describe('createCategory', () => {
    it('deve criar categoria', async () => {
      mockPrisma.knowledgeCategory.create.mockResolvedValue({ id: 1, name: 'Nova Categoria' });
      const result = await service.createCategory({ name: 'Nova Categoria' } as any);
      expect(result.name).toBe('Nova Categoria');
    });
  });
});
