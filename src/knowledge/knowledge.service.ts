import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateKnowledgeArticleDto, UpdateKnowledgeArticleDto,
  KnowledgeFilterDto, KnowledgeInteractionDto,
  CreateKnowledgeCategoryDto,
} from './knowledge.dto';
 
@Injectable()
export class KnowledgeService {
  constructor(private prisma: PrismaService) {}
 
  // ─── CATEGORIES ───────────────────────────────────────────────────────────
 
  async findAllCategories() {
    return this.prisma.knowledgeCategory.findMany({
      include: { _count: { select: { articles: true } } },
      orderBy: { name: 'asc' },
    });
  }
 
  async createCategory(dto: CreateKnowledgeCategoryDto) {
    return this.prisma.knowledgeCategory.create({ data: dto });
  }
 
  // ─── ARTICLES ─────────────────────────────────────────────────────────────
 
  async findAll(filters: KnowledgeFilterDto) {
    const { page = 1, limit = 20, search, categoryId, authorId } = filters;
    const skip = (page - 1) * limit;
    const where: any = {};
    if (search) where.OR = [
      { title: { contains: search, mode: 'insensitive' } },
      { description: { contains: search, mode: 'insensitive' } },
    ];
    if (categoryId) where.categoryId = categoryId;
    if (authorId) where.authorId = authorId;
 
    const [data, total] = await Promise.all([
      this.prisma.knowledgeArticle.findMany({
        where, skip, take: limit,
        include: {
          author: { select: { id: true, fullName: true } },
          category: true,
          tags: true,
          _count: { select: { interactions: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.knowledgeArticle.count({ where }),
    ]);
    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }
 
  async findOne(id: number, userId?: number) {
    const article = await this.prisma.knowledgeArticle.findUnique({
      where: { id },
      include: {
        author: { select: { id: true, fullName: true } },
        category: true,
        tags: true,
        interactions: {
          select: { userId: true, action: true, createdAt: true },
        },
      },
    });
    if (!article) throw new NotFoundException('Artigo não encontrado');
 
    if (userId) {
      await this.prisma.knowledgeInteraction.create({
        data: { userId, articleId: id, action: 'VIEW' },
      });
    }
 
    const likes = article.interactions.filter(i => i.action === 'LIKE').length;
    const views = article.interactions.filter(i => i.action === 'VIEW').length;
    const userLiked = userId ? article.interactions.some(i => i.userId === userId && i.action === 'LIKE') : false;
 
    return { ...article, likes, views, userLiked };
  }
 
  async create(authorId: number, dto: CreateKnowledgeArticleDto) {
    const { tags, ...data } = dto;
    const article = await this.prisma.knowledgeArticle.create({
      data: {
        ...data,
        authorId,
        tags: tags?.length
          ? { create: tags.map(name => ({ name, userId: authorId })) }
          : undefined,
      },
      include: { tags: true, category: true },
    });
    return article;
  }
 
  async update(id: number, dto: UpdateKnowledgeArticleDto) {
    await this.findOne(id);
    const { tags, ...data } = dto;
    if (tags) {
      await this.prisma.knowledgeTag.deleteMany({ where: { articleId: id } });
    }
    return this.prisma.knowledgeArticle.update({
      where: { id },
      data: {
        ...data,
        tags: tags?.length
          ? { create: tags.map(name => ({ name })) }
          : undefined,
      },
      include: { tags: true, category: true },
    });
  }
 
  async remove(id: number) {
    await this.findOne(id);
    await this.prisma.knowledgeArticle.delete({ where: { id } });
    return { message: 'Artigo removido' };
  }
 
  async interact(userId: number, dto: KnowledgeInteractionDto) {
    // Para LIKE, toggle
    if (dto.action === 'LIKE') {
      const existing = await this.prisma.knowledgeInteraction.findFirst({
        where: { userId, articleId: dto.articleId, action: 'LIKE' },
      });
      if (existing) {
        await this.prisma.knowledgeInteraction.delete({ where: { id: existing.id } });
        return { liked: false };
      }
    }
    await this.prisma.knowledgeInteraction.create({
      data: { userId, articleId: dto.articleId, action: dto.action },
    });
    return { action: dto.action, done: true };
  }
 
  async getTrending(limit = 10) {
    const views = await this.prisma.knowledgeInteraction.groupBy({
      by: ['articleId'],
      where: {
        action: 'VIEW',
        createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
      },
      _count: { articleId: true },
      orderBy: { _count: { articleId: 'desc' } },
      take: limit,
    });
    const articleIds = views.map(v => v.articleId);
    return this.prisma.knowledgeArticle.findMany({
      where: { id: { in: articleIds } },
      include: { author: { select: { id: true, fullName: true } }, category: true, tags: true },
    });
  }
 
  async searchFullText(query: string) {
    return this.prisma.knowledgeArticle.findMany({
      where: {
        OR: [
          { title: { contains: query, mode: 'insensitive' } },
          { content: { contains: query, mode: 'insensitive' } },
          { description: { contains: query, mode: 'insensitive' } },
          { tags: { some: { name: { contains: query, mode: 'insensitive' } } } },
        ],
      },
      include: {
        author: { select: { id: true, fullName: true } },
        category: true,
        tags: true,
      },
      take: 20,
    });
  }
}
 
