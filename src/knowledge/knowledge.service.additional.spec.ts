import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ConflictException } from '@nestjs/common';
import { KnowledgeService } from './knowledge.service';
import { PrismaService } from '../prisma/prisma.service';

const makeFind = (val: any = null) => jest.fn().mockResolvedValue(val);
const makeFindMany = (data: any[] = []) => jest.fn().mockResolvedValue(data);
const makeCount = (n = 0) => jest.fn().mockResolvedValue(n);

const baseArticle = {
  id: 1,
  title: 'Artigo Teste',
  status: 'PUBLISHED',
  authorId: 1,
  author: { id: 1, fullName: 'Author' },
  category: null,
  tags: [],
  comments: [],
  questions: [],
  _count: { comments: 0, questions: 0, acknowledgements: 0 },
};

const mockPrisma = {
  knowledgeCategory: {
    findMany: makeFindMany([]),
    findFirst: makeFind(null),
    findUnique: makeFind(null),
    create: makeFind({ id: 1 }),
    update: makeFind({ id: 1 }),
    count: makeCount(0),
    delete: makeFind({}),
  },
  knowledgeArticle: {
    findMany: makeFindMany([]),
    findUnique: makeFind(null),
    findFirst: makeFind(null),
    create: makeFind({ id: 1 }),
    update: makeFind({ id: 1 }),
    count: makeCount(0),
    delete: makeFind({}),
  },
  knowledgeTag: {
    findMany: makeFindMany([]),
    findFirst: makeFind(null),
    create: makeFind({ id: 1, name: 'tag' }),
  },
  knowledgeInteraction: { create: makeFind({}) },
  knowledgeSearchLog: { create: makeFind({}) },
  articleAcknowledgement: {
    findFirst: makeFind(null),
    create: makeFind({}),
    update: makeFind({}),
    count: makeCount(0),
  },
  articleComment: {
    create: makeFind({ id: 1 }),
    findMany: makeFindMany([]),
    findUnique: makeFind(null),
    update: makeFind({}),
    delete: makeFind({}),
  },
  articleRating: {
    upsert: makeFind({}),
    aggregate: jest.fn().mockResolvedValue({ _avg: { rating: 4.5 } }),
  },
  articleQuestion: {
    create: makeFind({ id: 1 }),
    findMany: makeFindMany([]),
    findUnique: makeFind(null),
    update: makeFind({}),
  },
  articleVersion: { create: makeFind({}) },
  user: { findUnique: makeFind(null) },
};

describe('KnowledgeService — additional coverage', () => {
  let service: KnowledgeService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [KnowledgeService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();
    service = module.get<KnowledgeService>(KnowledgeService);
  });

  // ─── createCategory with conflict ─────────────────────────────────────────

  describe('createCategory with conflict', () => {
    it('deve lançar ConflictException se slug já existe', async () => {
      mockPrisma.knowledgeCategory.findFirst.mockResolvedValue({ id: 1 });

      await expect(
        service.createCategory({ name: 'NestJS', slug: 'nestjs' } as any),
      ).rejects.toThrow(ConflictException);
    });
  });

  // ─── updateCategory ───────────────────────────────────────────────────────

  describe('updateCategory', () => {
    it('deve actualizar categoria', async () => {
      mockPrisma.knowledgeCategory.update.mockResolvedValue({ id: 1, name: 'Updated' });

      const result = await service.updateCategory(1, { name: 'Updated' } as any);
      expect(result).toBeDefined();
    });
  });

  // ─── create (article) ─────────────────────────────────────────────────────

  describe('create', () => {
    it('deve criar artigo de conhecimento', async () => {
      mockPrisma.knowledgeArticle.create.mockResolvedValue(baseArticle);
      mockPrisma.knowledgeArticle.findUnique.mockResolvedValue(baseArticle);

      const result = await service.create(
        { title: 'Artigo Teste', content: 'Conteúdo', accessLevel: 'ALL' } as any,
        1,
      );
      expect(result).toBeDefined();
    });
  });

  // ─── update (article) ─────────────────────────────────────────────────────

  describe('update', () => {
    it('deve actualizar artigo existente', async () => {
      mockPrisma.knowledgeArticle.findUnique.mockResolvedValue({ ...baseArticle, authorId: 1 });
      mockPrisma.knowledgeArticle.update.mockResolvedValue({ ...baseArticle, title: 'Updated' });

      const result = await service.update(1, { title: 'Updated' } as any, 1, false);
      expect(result).toBeDefined();
    });

    it('deve lançar NotFoundException se artigo não encontrado', async () => {
      mockPrisma.knowledgeArticle.findUnique.mockResolvedValue(null);

      await expect(service.update(99, { title: 'X' } as any, 1, false)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ─── publish ──────────────────────────────────────────────────────────────

  describe('publish', () => {
    it('deve publicar artigo', async () => {
      mockPrisma.knowledgeArticle.findUnique.mockResolvedValue(baseArticle);
      mockPrisma.knowledgeArticle.update.mockResolvedValue({ ...baseArticle, status: 'PUBLISHED' });

      const result = await service.publish(1, 1, false);
      expect(result).toBeDefined();
    });
  });

  // ─── archive ──────────────────────────────────────────────────────────────

  describe('archive', () => {
    it('deve arquivar artigo', async () => {
      mockPrisma.knowledgeArticle.findUnique.mockResolvedValue(baseArticle);
      mockPrisma.knowledgeArticle.update.mockResolvedValue({ ...baseArticle, status: 'ARCHIVED' });

      const result = await service.archive(1, 1, false);
      expect(result).toBeDefined();
    });
  });

  // ─── rateArticle ──────────────────────────────────────────────────────────

  describe('rateArticle', () => {
    it('deve avaliar artigo com rating', async () => {
      mockPrisma.knowledgeArticle.findUnique.mockResolvedValue(baseArticle);
      mockPrisma.articleRating.upsert.mockResolvedValue({});
      mockPrisma.articleRating.aggregate.mockResolvedValue({ _avg: { rating: 4.5 } });
      mockPrisma.knowledgeArticle.update.mockResolvedValue({});

      const result = await service.rateArticle(1, { rating: 5, comment: 'Excelente' } as any, 1);
      expect(result).toBeDefined();
    });
  });

  // ─── createComment ────────────────────────────────────────────────────────

  describe('createComment', () => {
    it('deve criar comentário num artigo', async () => {
      mockPrisma.knowledgeArticle.findUnique.mockResolvedValue(baseArticle);
      mockPrisma.articleComment.create.mockResolvedValue({ id: 1, content: 'Ótimo artigo!' });

      const result = await service.createComment(1, { content: 'Ótimo artigo!' } as any, 1);
      expect(result).toBeDefined();
    });
  });

  // ─── findAll with filters ─────────────────────────────────────────────────

  describe('findAll with filters', () => {
    it('deve filtrar por categoria e pesquisa', async () => {
      mockPrisma.knowledgeArticle.findMany.mockResolvedValue([]);
      mockPrisma.knowledgeArticle.count.mockResolvedValue(0);

      const result = await service.findAll({ categoryId: 1, search: 'NestJS', sortBy: 'POPULAR' as any });
      expect(result).toHaveProperty('data');
    });

    it('deve filtrar por tag e mandatory', async () => {
      mockPrisma.knowledgeArticle.findMany.mockResolvedValue([]);
      mockPrisma.knowledgeArticle.count.mockResolvedValue(0);

      await service.findAll({ tag: 'typescript', mandatory: true });
      expect(mockPrisma.knowledgeArticle.findMany).toHaveBeenCalled();
    });
  });
});
