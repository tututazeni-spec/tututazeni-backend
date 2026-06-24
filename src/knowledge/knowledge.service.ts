import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateKnowledgeCategoryDto,
  UpdateKnowledgeCategoryDto,
  CreateKnowledgeArticleDto,
  UpdateKnowledgeArticleDto,
  KnowledgeFilterDto,
  KnowledgeInteractionDto,
  CreateCommentDto,
  RateArticleDto,
  CreateKnowledgeQuestionDto,
  AnswerQuestionDto,
  AcknowledgeArticleDto,
} from './knowledge.dto';

@Injectable()
export class KnowledgeService {
  private readonly logger = new Logger(KnowledgeService.name);

  constructor(private prisma: PrismaService) {}

  // ─── CATEGORIAS ───────────────────────────────────────────────────────────

  async findAllCategories() {
    const cats = await this.prisma.read.knowledgeCategory.findMany({
      include: {
        parent: { select: { id: true, name: true } },
        children: { select: { id: true, name: true, _count: { select: { articles: true } } } },
        _count: { select: { articles: true } },
      },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
    return cats;
  }

  async createCategory(dto: CreateKnowledgeCategoryDto) {
    const slug =
      dto.slug ??
      dto.name
        .toLowerCase()
        .replace(/\s+/g, '-')
        .replace(/[^a-z0-9-]/g, '');
    const exists = await this.prisma.knowledgeCategory.findFirst({ where: { slug } });
    if (exists) throw new ConflictException(`Categoria com slug "${slug}" já existe`);

    return this.prisma.knowledgeCategory.create({
      data: { ...dto, slug },
    });
  }

  async updateCategory(id: number, dto: UpdateKnowledgeCategoryDto) {
    return this.prisma.knowledgeCategory.update({ where: { id }, data: dto });
  }

  // ─── ARTIGOS ──────────────────────────────────────────────────────────────

  async findAll(filters: KnowledgeFilterDto) {
    const {
      page = 1,
      limit = 20,
      search,
      categoryId,
      authorId,
      status,
      accessLevel,
      tag,
      mandatory,
      sortBy,
    } = filters;
    const skip = (page - 1) * limit;

    const where: any = {};
    if (status) where.status = status;
    else where.status = 'PUBLISHED'; // por defeito apenas publicados
    if (accessLevel) where.accessLevel = accessLevel;
    if (categoryId) where.categoryId = categoryId;
    if (authorId) where.authorId = authorId;
    if (mandatory !== undefined) where.mandatory = mandatory;
    if (tag) where.tags = { some: { name: { equals: tag, mode: 'insensitive' } } };

    if (search) {
      where.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        { summary: { contains: search, mode: 'insensitive' } },
        { content: { contains: search, mode: 'insensitive' } },
        { tags: { some: { name: { contains: search, mode: 'insensitive' } } } },
      ];
    }

    // Ordenação
    let orderBy: any = { createdAt: 'desc' };
    if (sortBy === 'POPULAR') orderBy = { viewCount: 'desc' };
    if (sortBy === 'RATING') orderBy = { avgRating: 'desc' };
    if (sortBy === 'UPDATED') orderBy = { updatedAt: 'desc' };

    const [data, total] = await Promise.all([
      this.prisma.read.knowledgeArticle.findMany({
        where,
        skip,
        take: limit,
        include: {
          author: { select: { id: true, fullName: true, avatarUrl: true } },
          category: { select: { id: true, name: true, icon: true, color: true } },
          tags: { select: { id: true, name: true } },
          _count: { select: { comments: true, questions: true, acknowledgements: true } },
        },
        orderBy,
      }),
      this.prisma.read.knowledgeArticle.count({ where }),
    ]);

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async findOne(id: number, userId?: number) {
    const article = await this.prisma.read.knowledgeArticle.findUnique({
      where: { id },
      include: {
        author: {
          select: {
            id: true,
            fullName: true,
            avatarUrl: true,
            position: { select: { name: true } },
          },
        },
        category: true,
        tags: { select: { id: true, name: true } },
        comments: {
          where: { parentId: null },
          include: {
            author: { select: { id: true, fullName: true, avatarUrl: true } },
            replies: {
              include: { author: { select: { id: true, fullName: true, avatarUrl: true } } },
              orderBy: { createdAt: 'asc' },
            },
          },
          orderBy: { createdAt: 'desc' },
          take: 20,
        },
        questions: {
          include: { askedBy: { select: { id: true, fullName: true } } },
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
        _count: { select: { comments: true, questions: true, acknowledgements: true } },
      },
    });
    if (!article) throw new NotFoundException('Artigo não encontrado');

    // Registar VIEW (uma por utilizador por sessão de 30 min)
    if (userId) {
      const recentView = await this.prisma.read.knowledgeInteraction.findFirst({
        where: {
          userId,
          articleId: id,
          action: 'VIEW',
          createdAt: { gte: new Date(Date.now() - 30 * 60 * 1000) },
        },
      });
      if (!recentView) {
        await this.prisma.knowledgeInteraction.create({
          data: { userId, articleId: id, action: 'VIEW' },
        });
        await this.prisma.knowledgeArticle.update({
          where: { id },
          data: { viewCount: { increment: 1 } },
        });
      }

      // Verificar bookmark e rating do user
      const [bookmark, rating, acknowledged] = await Promise.all([
        this.prisma.read.knowledgeInteraction.findFirst({
          where: { userId, articleId: id, action: 'BOOKMARK' },
        }),
        this.prisma.read.articleRating.findFirst({
          where: { userId, articleId: id },
        }),
        this.prisma.read.articleAcknowledgement.findFirst({
          where: { userId, articleId: id },
        }),
      ]);

      return {
        ...article,
        userBookmarked: !!bookmark,
        userRating: rating?.score ?? null,
        userAcknowledged: !!acknowledged,
        acknowledgedAt: acknowledged?.acknowledgedAt ?? null,
      };
    }

    return article;
  }

  async create(authorId: number, dto: CreateKnowledgeArticleDto) {
    const { tags, ...data } = dto;

    // Calcular tempo de leitura (aprox. 200 palavras/min)
    const wordCount = dto.content.split(/\s+/).length;
    const readingMinutes = Math.ceil(wordCount / 200);

    const article = await this.prisma.knowledgeArticle.create({
      data: {
        title: data.title,
        summary: data.summary,
        content: data.content,
        categoryId: data.categoryId,
        authorId,
        status: data.status ?? 'DRAFT',
        accessLevel: data.accessLevel ?? 'PUBLIC',
        mandatory: data.mandatory ?? false,
        expiresAt: data.expiresAt ? new Date(data.expiresAt) : null,
        scheduledAt: data.scheduledAt ? new Date(data.scheduledAt) : null,
        restrictedDepartmentId: data.restrictedDepartmentId,
        readingMinutes,
        viewCount: 0,
        avgRating: null,
        tags: tags?.length ? { create: tags.map(name => ({ name })) } : undefined,
      },
      include: { tags: true, category: true },
    });

    // Guardar primeira versão
    await this.prisma.articleVersion.create({
      data: {
        articleId: article.id,
        version: 1,
        title: article.title,
        content: article.content,
        authorId,
        changeReason: 'Criação inicial',
      },
    });

    // Gamificação: pontos por criação
    await this.prisma.userPoints
      .upsert({
        where: { userId: authorId },
        create: { userId: authorId, points: 30 },
        update: { points: { increment: 30 } },
      })
      .catch(() => {});

    return article;
  }

  async update(id: number, dto: UpdateKnowledgeArticleDto, updatedById?: number) {
    const existing = await this.prisma.knowledgeArticle.findUnique({
      where: { id },
      include: { _count: { select: { versions: true } } },
    });
    if (!existing) throw new NotFoundException('Artigo não encontrado');

    const { tags, changeReason, ...data } = dto;

    if (tags) {
      await this.prisma.knowledgeTag.deleteMany({ where: { articleId: id } });
    }

    const updated = await this.prisma.knowledgeArticle.update({
      where: { id },
      data: {
        ...data,
        expiresAt: data.expiresAt ? new Date(data.expiresAt) : undefined,
        scheduledAt: data.scheduledAt ? new Date(data.scheduledAt) : undefined,
        tags: tags?.length ? { create: tags.map(name => ({ name })) } : undefined,
      },
      include: { tags: true, category: true },
    });

    // Guardar nova versão se conteúdo mudou
    if (dto.content && dto.content !== (existing as any).content) {
      await this.prisma.articleVersion.create({
        data: {
          articleId: id,
          version: (existing._count as any).versions + 1,
          title: updated.title,
          content: dto.content,
          authorId: updatedById ?? (existing as any).authorId,
          changeReason: changeReason ?? 'Actualização de conteúdo',
        },
      });
    }

    // Notificar seguidores/bookmarkers
    const bookmarkers = await this.prisma.read.knowledgeInteraction.findMany({
      where: { articleId: id, action: 'BOOKMARK' },
      select: { userId: true },
      distinct: ['userId'],
    });
    for (const b of bookmarkers) {
      await this.prisma.notificationLog
        .create({
          data: {
            userId: b.userId,
            type: 'KNOWLEDGE_UPDATED',
            message: `O artigo "${updated.title}" foi actualizado`,
            metadata: JSON.stringify({}),
          },
        })
        .catch(() => {});
    }

    return updated;
  }

  async publish(id: number) {
    const article = await this.prisma.read.knowledgeArticle.findUnique({ where: { id } });
    if (!article) throw new NotFoundException('Artigo não encontrado');
    return this.prisma.knowledgeArticle.update({
      where: { id },
      data: { status: 'PUBLISHED', publishedAt: new Date() },
    });
  }

  async archive(id: number) {
    return this.prisma.knowledgeArticle.update({ where: { id }, data: { status: 'ARCHIVED' } });
  }

  async remove(id: number) {
    const article = await this.prisma.read.knowledgeArticle.findUnique({
      where: { id },
      include: { _count: { select: { acknowledgements: true } } },
    });
    if (!article) throw new NotFoundException('Artigo não encontrado');
    if ((article._count as any).acknowledgements > 0 && article.mandatory) {
      throw new ForbiddenException(
        'Artigo obrigatório com confirmações não pode ser eliminado. Archive-o.',
      );
    }
    await this.prisma.knowledgeArticle.delete({ where: { id } });
    return { message: 'Artigo eliminado' };
  }

  // ─── VERSÕES ──────────────────────────────────────────────────────────────

  async getVersions(articleId: number) {
    return this.prisma.read.articleVersion.findMany({
      where: { articleId },
      include: { author: { select: { id: true, fullName: true } } },
      orderBy: { version: 'desc' },
    });
  }

  async restoreVersion(articleId: number, versionId: number, userId: number) {
    const version = await this.prisma.read.articleVersion.findFirst({
      where: { id: versionId, articleId },
    });
    if (!version) throw new NotFoundException('Versão não encontrada');

    return this.update(
      articleId,
      {
        title: version.title,
        content: version.content,
        changeReason: `Restauro para versão ${version.version}`,
      },
      userId,
    );
  }

  // ─── INTERAÇÕES ───────────────────────────────────────────────────────────

  async interact(userId: number, dto: KnowledgeInteractionDto) {
    // LIKE e BOOKMARK fazem toggle
    if (dto.action === 'LIKE' || dto.action === 'BOOKMARK') {
      const existing = await this.prisma.knowledgeInteraction.findFirst({
        where: { userId, articleId: dto.articleId, action: dto.action },
      });
      if (existing) {
        await this.prisma.knowledgeInteraction.delete({ where: { id: existing.id } });
        return { action: dto.action, active: false };
      }
    }

    await this.prisma.knowledgeInteraction.create({
      data: { userId, articleId: dto.articleId, action: dto.action },
    });

    return { action: dto.action, active: true };
  }

  // ─── RATING ───────────────────────────────────────────────────────────────

  async rateArticle(userId: number, dto: RateArticleDto) {
    await this.prisma.articleRating.upsert({
      where: { userId_articleId: { userId, articleId: dto.articleId } },
      create: { userId, articleId: dto.articleId, score: dto.score, comment: dto.comment },
      update: { score: dto.score, comment: dto.comment },
    });

    // Recalcular média
    const avg = await this.prisma.read.articleRating.aggregate({
      where: { articleId: dto.articleId },
      _avg: { score: true },
    });

    await this.prisma.knowledgeArticle.update({
      where: { id: dto.articleId },
      data: { avgRating: avg._avg.score },
    });

    return { rated: true, score: dto.score };
  }

  // ─── COMENTÁRIOS ──────────────────────────────────────────────────────────

  async createComment(userId: number, dto: CreateCommentDto) {
    const comment = await this.prisma.articleComment.create({
      data: {
        articleId: dto.articleId,
        authorId: userId,
        content: dto.content,
        parentId: dto.parentId,
      },
      include: {
        author: { select: { id: true, fullName: true, avatarUrl: true } },
      },
    });

    // Notificar autor do artigo
    const article = await this.prisma.read.knowledgeArticle.findUnique({
      where: { id: dto.articleId },
      select: { authorId: true, title: true },
    });
    if (article && article.authorId !== userId) {
      await this.prisma.notificationLog
        .create({
          data: {
            userId: article.authorId,
            type: 'KNOWLEDGE_COMMENT',
            message: `Novo comentário no seu artigo "${article.title}"`,
            metadata: JSON.stringify({}),
          },
        })
        .catch(() => {});
    }

    return comment;
  }

  async deleteComment(commentId: number, userId: number) {
    const comment = await this.prisma.read.articleComment.findUnique({ where: { id: commentId } });
    if (!comment) throw new NotFoundException('Comentário não encontrado');
    if ((comment as any).authorId !== userId) throw new ForbiddenException('Sem permissão');
    await this.prisma.articleComment.delete({ where: { id: commentId } });
    return { message: 'Comentário removido' };
  }

  // ─── Q&A ──────────────────────────────────────────────────────────────────

  async createQuestion(userId: number, dto: CreateKnowledgeQuestionDto) {
    return this.prisma.articleQuestion.create({
      data: {
        articleId: dto.articleId,
        askedById: userId,
        question: dto.question,
      },
      include: { askedBy: { select: { id: true, fullName: true } } },
    });
  }

  async answerQuestion(userId: number, dto: AnswerQuestionDto) {
    const question = await this.prisma.read.articleQuestion.findUnique({
      where: { id: dto.questionId },
    });
    if (!question) throw new NotFoundException('Pergunta não encontrada');

    const updated = await this.prisma.articleQuestion.update({
      where: { id: dto.questionId },
      data: { answer: dto.answer, answeredById: userId, answeredAt: new Date() },
    });

    // Notificar quem perguntou
    if ((question as any).askedById !== userId) {
      await this.prisma.notificationLog
        .create({
          data: {
            userId: (question as any).askedById,
            type: 'KNOWLEDGE_ANSWER',
            message: `A sua pergunta foi respondida`,
            metadata: JSON.stringify({}),
          },
        })
        .catch(() => {});
    }

    return updated;
  }

  // ─── LEITURA OBRIGATÓRIA ──────────────────────────────────────────────────

  async acknowledgeArticle(userId: number, dto: AcknowledgeArticleDto) {
    const existing = await this.prisma.articleAcknowledgement.findFirst({
      where: { userId, articleId: dto.articleId },
    });
    if (existing) return { alreadyAcknowledged: true, acknowledgedAt: existing.acknowledgedAt };

    const ack = await this.prisma.articleAcknowledgement.create({
      data: { userId, articleId: dto.articleId, acknowledgedAt: new Date() },
    });

    return { acknowledged: true, acknowledgedAt: ack.acknowledgedAt };
  }

  async getAcknowledgementReport(articleId: number) {
    const article = await this.prisma.read.knowledgeArticle.findUnique({
      where: { id: articleId },
    });
    if (!article) throw new NotFoundException('Artigo não encontrado');

    const [acknowledged, allUsers] = await Promise.all([
      this.prisma.read.articleAcknowledgement.findMany({
        where: { articleId },
        include: {
          user: {
            select: {
              id: true,
              fullName: true,
              avatarUrl: true,
              department: { select: { name: true } },
            },
          },
        },
      }),
      this.prisma.read.user.findMany({
        where: { active: true },
        select: { id: true, fullName: true, department: { select: { name: true } } },
      }),
    ]);

    const acknowledgedIds = new Set(acknowledged.map(a => a.userId));
    const notRead = allUsers.filter(u => !acknowledgedIds.has(u.id));

    return {
      articleId,
      title: article.title,
      total: allUsers.length,
      read: acknowledged.length,
      notRead: notRead.length,
      readPct: allUsers.length > 0 ? Math.round((acknowledged.length / allUsers.length) * 100) : 0,
      acknowledgedUsers: acknowledged.map(a => a.user),
      pendingUsers: notRead,
    };
  }

  // ─── TRENDING ─────────────────────────────────────────────────────────────

  async getTrending(limit = 10) {
    const articles = await this.prisma.read.knowledgeArticle.findMany({
      where: { status: 'PUBLISHED' },
      include: {
        author: { select: { id: true, fullName: true, avatarUrl: true } },
        category: { select: { id: true, name: true, icon: true, color: true } },
        tags: { select: { id: true, name: true } },
      },
      orderBy: { viewCount: 'desc' },
      take: limit,
    });
    return articles;
  }

  async getBookmarks(userId: number) {
    const bookmarks = await this.prisma.read.knowledgeInteraction.findMany({
      where: { userId, action: 'BOOKMARK' },
      include: {
        article: {
          include: {
            author: { select: { id: true, fullName: true, avatarUrl: true } },
            category: { select: { id: true, name: true, icon: true, color: true } },
            tags: { select: { id: true, name: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
    return bookmarks.map(b => b.article);
  }

  // ─── FULL-TEXT SEARCH ─────────────────────────────────────────────────────

  async searchFullText(query: string, userId?: number) {
    if (!query || query.trim().length < 2) return [];

    const results = await this.prisma.read.knowledgeArticle.findMany({
      where: {
        status: 'PUBLISHED',
        OR: [
          { title: { contains: query, mode: 'insensitive' } },
          { summary: { contains: query, mode: 'insensitive' } },
          { content: { contains: query, mode: 'insensitive' } },
          { tags: { some: { name: { contains: query, mode: 'insensitive' } } } },
        ],
      },
      include: {
        author: { select: { id: true, fullName: true } },
        category: { select: { id: true, name: true, icon: true, color: true } },
        tags: { select: { id: true, name: true } },
      },
      orderBy: { viewCount: 'desc' },
      take: 20,
    });

    // Registar busca sem resultado para gap analysis
    if (results.length === 0) {
      await this.prisma.knowledgeSearchLog
        .create({
          data: { query, userId, resultsCount: 0 },
        })
        .catch(() => {});
    }

    return results;
  }

  // ─── ANALYTICS ────────────────────────────────────────────────────────────

  async getDashboard() {
    const [totalArticles, published, totalViews, emptySearches, topArticles, recentlyUpdated] =
      await Promise.all([
        this.prisma.read.knowledgeArticle.count(),
        this.prisma.read.knowledgeArticle.count({ where: { status: 'PUBLISHED' } }),
        this.prisma.read.knowledgeArticle.aggregate({ _sum: { viewCount: true } }),
        this.prisma.read.knowledgeSearchLog.count({ where: { resultsCount: 0 } }),
        this.prisma.read.knowledgeArticle.findMany({
          where: { status: 'PUBLISHED' },
          include: {
            author: { select: { id: true, fullName: true } },
            category: { select: { name: true } },
          },
          orderBy: { viewCount: 'desc' },
          take: 5,
        }),
        this.prisma.read.knowledgeArticle.findMany({
          where: { status: 'PUBLISHED' },
          include: { author: { select: { id: true, fullName: true } } },
          orderBy: { updatedAt: 'desc' },
          take: 5,
        }),
      ]);

    // Artigos desactualizados (sem actualização há >6 meses)
    const staleThreshold = new Date(Date.now() - 180 * 24 * 3600 * 1000);
    const staleArticles = await this.prisma.read.knowledgeArticle.count({
      where: { status: 'PUBLISHED', updatedAt: { lt: staleThreshold } },
    });

    // Top termos de busca sem resultado
    const gapSearches = await this.prisma.read.knowledgeSearchLog.groupBy({
      by: ['query'],
      where: { resultsCount: 0 },
      _count: true,
      orderBy: { _count: { query: 'desc' } },
      take: 10,
    });

    return {
      articles: { total: totalArticles, published, stale: staleArticles },
      views: totalViews._sum.viewCount ?? 0,
      emptySearches,
      topArticles,
      recentlyUpdated,
      knowledgeGaps: gapSearches.map(g => ({ query: g.query, searches: g._count })),
    };
  }
}
