import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ForbiddenException } from '@nestjs/common';
import { KnowledgeService } from './knowledge.service';
import { PrismaService } from '../prisma/prisma.service';

const mockPrisma = {
  articleComment: { findUnique: jest.fn(), delete: jest.fn().mockResolvedValue({}) },
  articleVersion: { findFirst: jest.fn(), create: jest.fn().mockResolvedValue({}) },
  knowledgeTag: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
  knowledgeArticle: {
    findUnique: jest.fn(),
    update: jest.fn().mockResolvedValue({}),
  },
  knowledgeInteraction: {
    findFirst: jest.fn(),
    findMany: jest.fn().mockResolvedValue([]),
    create: jest.fn().mockResolvedValue({}),
    delete: jest.fn().mockResolvedValue({}),
  },
  articleRating: {
    upsert: jest.fn().mockResolvedValue({}),
    aggregate: jest.fn().mockResolvedValue({ _avg: { score: 4.5 } }),
  },
};

describe('KnowledgeService — deleteComment (ownership)', () => {
  let service: KnowledgeService;

  beforeEach(async () => {
    jest.clearAllMocks();
    Object.defineProperty(mockPrisma, 'read', { get: () => mockPrisma, configurable: true });
    const module: TestingModule = await Test.createTestingModule({
      providers: [KnowledgeService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();
    service = module.get<KnowledgeService>(KnowledgeService);
  });

  it('comentário inexistente → NotFoundException', async () => {
    mockPrisma.articleComment.findUnique.mockResolvedValue(null);
    await expect(service.deleteComment(1, 7)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('outro utilizador não pode remover comentário alheio → ForbiddenException', async () => {
    mockPrisma.articleComment.findUnique.mockResolvedValue({ id: 1, authorId: 7 });
    await expect(service.deleteComment(1, 999)).rejects.toBeInstanceOf(ForbiddenException);
    expect(mockPrisma.articleComment.delete).not.toHaveBeenCalled();
  });

  it('o autor pode remover o próprio comentário', async () => {
    mockPrisma.articleComment.findUnique.mockResolvedValue({ id: 1, authorId: 7 });
    const result = await service.deleteComment(1, 7);
    expect(mockPrisma.articleComment.delete).toHaveBeenCalledWith({ where: { id: 1 } });
    expect(result).toHaveProperty('message');
  });
});

describe('KnowledgeService — restoreVersion / interact / rateArticle', () => {
  let service: KnowledgeService;

  beforeEach(async () => {
    jest.clearAllMocks();
    Object.defineProperty(mockPrisma, 'read', { get: () => mockPrisma, configurable: true });
    const module: TestingModule = await Test.createTestingModule({
      providers: [KnowledgeService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();
    service = module.get<KnowledgeService>(KnowledgeService);
  });

  it('restoreVersion com versão inexistente → NotFoundException', async () => {
    mockPrisma.articleVersion.findFirst.mockResolvedValue(null);
    await expect(service.restoreVersion(1, 99, 7)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('restoreVersion válida delega em update() com o conteúdo da versão', async () => {
    mockPrisma.articleVersion.findFirst.mockResolvedValue({
      id: 99,
      articleId: 1,
      version: 3,
      title: 'Título antigo',
      content: 'Conteúdo antigo',
    });
    mockPrisma.knowledgeArticle.findUnique.mockResolvedValue({
      id: 1,
      title: 'x',
      content: 'y',
      status: 'PUBLISHED',
      authorId: 7,
      _count: { versions: 2 },
    });
    mockPrisma.knowledgeArticle.update.mockResolvedValue({ id: 1, title: 'Título antigo' });

    await service.restoreVersion(1, 99, 7);

    expect(mockPrisma.knowledgeArticle.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ title: 'Título antigo', content: 'Conteúdo antigo' }),
      }),
    );
  });

  it('interact com LIKE activa na primeira vez', async () => {
    mockPrisma.knowledgeInteraction.findFirst.mockResolvedValue(null);
    const result = await service.interact(7, { articleId: 1, action: 'LIKE' } as any);
    expect(result).toEqual({ action: 'LIKE', active: true });
    expect(mockPrisma.knowledgeInteraction.create).toHaveBeenCalled();
  });

  it('interact com LIKE alterna (toggle) para desactivado na segunda vez', async () => {
    mockPrisma.knowledgeInteraction.findFirst.mockResolvedValue({ id: 5 });
    const result = await service.interact(7, { articleId: 1, action: 'LIKE' } as any);
    expect(result).toEqual({ action: 'LIKE', active: false });
    expect(mockPrisma.knowledgeInteraction.delete).toHaveBeenCalledWith({ where: { id: 5 } });
  });

  it('interact com VIEW não faz toggle — regista sempre uma nova interacção', async () => {
    const result = await service.interact(7, { articleId: 1, action: 'VIEW' } as any);
    expect(result).toEqual({ action: 'VIEW', active: true });
    expect(mockPrisma.knowledgeInteraction.findFirst).not.toHaveBeenCalled();
  });

  it('rateArticle recalcula a média do artigo após avaliar', async () => {
    await service.rateArticle(7, { articleId: 1, score: 5 } as any);
    expect(mockPrisma.articleRating.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId_articleId: { userId: 7, articleId: 1 } } }),
    );
    expect(mockPrisma.knowledgeArticle.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { avgRating: 4.5 } }),
    );
  });
});
