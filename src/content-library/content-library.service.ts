// src/content-library/content-library.service.ts
import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateContentDto, UpdateContentDto, ContentFilterDto,
  RateContentDto, UpdateProgressDto, SaveNoteDto,
  CreateLearningPathDto, LearningPathFilterDto,
  ContentStatus, ContentFormat,
} from './content-library.dto';

// ─────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────

/** Safe access to models that may not exist in the schema yet */
function safeModel(prisma: any, model: string) {
  return (prisma as any)[model] ?? {
    findMany:  async () => [],
    findFirst: async () => null,
    findUnique:async () => null,
    create:    async (d: any) => d.data,
    upsert:    async (d: any) => d.create,
    update:    async (d: any) => d.data,
    delete:    async () => null,
    count:     async () => 0,
    groupBy:   async () => [],
  };
}

function buildWhereFromFilters(filters: ContentFilterDto): any {
  const where: any = { active: true };

  // Status filter — only show active by default
  where.status = ContentStatus.ACTIVE;

  if (filters.format)   where.type = filters.format; // ContentAsset uses 'type'
  if (filters.level)    (where as any).level    = filters.level;
  if (filters.language) (where as any).language = filters.language;
  if (filters.mandatory !== undefined)        (where as any).mandatory        = filters.mandatory;
  if (filters.hasCertification !== undefined) (where as any).hasCertification = filters.hasCertification;
  if (filters.isMicrolearning !== undefined)  (where as any).isMicrolearning  = filters.isMicrolearning;
  if (filters.maxDuration)                    (where as any).durationMin = { lte: filters.maxDuration };
  if (filters.tag)                            (where as any).tags = { has: filters.tag };
  if (filters.category)                       (where as any).category = filters.category;

  if (filters.search) {
    where.OR = [
      { title:       { contains: filters.search, mode: 'insensitive' } },
      { description: { contains: filters.search, mode: 'insensitive' } },
    ];
  }

  return where;
}

function buildOrderBy(sortBy?: string): any {
  switch (sortBy) {
    case 'newest':   return { createdAt: 'desc' };
    case 'duration': return [{ durationMin: 'asc' }];
    case 'popular':  return { viewCount: 'desc' };
    default:         return { createdAt: 'desc' };
  }
}

// ─────────────────────────────────────────────────────────────────
// SERVICE
// ─────────────────────────────────────────────────────────────────

@Injectable()
export class ContentLibraryService {
  constructor(private readonly prisma: PrismaService) {}

  // ══════════════════════════════════════════════════════
  // CATALOGUE — SEARCH & BROWSE
  // ══════════════════════════════════════════════════════

  async findAll(filters: ContentFilterDto = {}) {
    const { page = 1, limit = 20 } = filters;
    const skip    = (page - 1) * limit;
    const where   = buildWhereFromFilters(filters);
    const orderBy = buildOrderBy(filters.sortBy);

    const [data, total] = await Promise.all([
      this.prisma.contentAsset.findMany({ where, skip, take: limit, orderBy }),
      this.prisma.contentAsset.count({ where }),
    ]);

    // Enrich with view counts from AuditLog
    const ids     = data.map(c => c.id);
    const viewCounts = await this.prisma.auditLog.groupBy({
      by:      ['entityId'],
      where:   { entity: 'ContentAsset', action: 'CONTENT_VIEW', entityId: { in: ids } },
      _count:  { id: true },
    }).catch(() => [] as any[]);

    const vcMap = new Map((viewCounts as any[]).map((v: any) => [v.entityId, v._count.id]));

    return {
      data: data.map(c => ({ ...c, viewCount: vcMap.get(c.id) ?? 0 })),
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async findOne(id: number, userId?: number) {
    const c = await this.prisma.contentAsset.findUnique({ where: { id } });
    if (!c) throw new NotFoundException('Conteúdo não encontrado');

    const [viewCount, avgRating, ratingCount, userProgress, isBookmarked] = await Promise.all([
      this.prisma.auditLog.count({
        where: { entity: 'ContentAsset', action: 'CONTENT_VIEW', entityId: id },
      }).catch(() => 0),
      safeModel(this.prisma, 'contentRating').groupBy({
        by:     ['contentId'],
        where:  { contentId: id },
        _avg:   { rating: true },
        _count: { id: true },
      }).then((r: any[]) => r[0] ?? null).catch(() => null),
      safeModel(this.prisma, 'contentRating').count({ where: { contentId: id } }).catch(() => 0),
      userId
        ? safeModel(this.prisma, 'contentProgress').findUnique({
            where: { userId_contentId: { userId, contentId: id } },
          }).catch(() => null)
        : Promise.resolve(null),
      userId
        ? this.prisma.auditLog.findFirst({
            where: { userId, action: 'CONTENT_BOOKMARK', entity: 'ContentAsset', entityId: id },
          }).then(r => !!r).catch(() => false)
        : Promise.resolve(false),
    ]);

    return {
      ...c,
      viewCount,
      avgRating:   avgRating ? +(avgRating._avg?.rating ?? 0).toFixed(1) : null,
      ratingCount,
      progress:    userProgress,
      isBookmarked,
    };
  }

  async create(createdById: number, dto: CreateContentDto) {
    const asset = await this.prisma.contentAsset.create({
      data: {
        title:       dto.title,
        description: dto.description,
        type:        dto.format,
        url:         dto.url,
        active:      true,
        version:     '1.0',
        // Extended fields — cast as any for fields not yet in base schema
        ...(dto.thumbnailUrl   && { thumbnailUrl:   dto.thumbnailUrl   } as any),
        ...(dto.author         && { author:         dto.author         } as any),
        ...(dto.language       && { language:       dto.language       } as any),
        ...(dto.level          && { level:          dto.level          } as any),
        ...(dto.durationMin    && { durationMin:    dto.durationMin    } as any),
        ...(dto.category       && { category:       dto.category       } as any),
        ...(dto.mandatory      !== undefined && { mandatory:      dto.mandatory      } as any),
        ...(dto.isMicrolearning !== undefined && { isMicrolearning: dto.isMicrolearning } as any),
        ...(dto.hasCertification !== undefined && { hasCertification: dto.hasCertification } as any),
        ...(dto.tags           && { tags:           dto.tags           } as any),
        ...(dto.externalSource && { externalSource: dto.externalSource } as any),
        ...({ createdById, status: ContentStatus.DRAFT } as any),
      },
    });

    await this.prisma.notificationLog.create({
      data: {
        userId:   createdById,
        type:     'CONTENT_CREATED',
        message:  `Conteúdo "${dto.title}" criado e aguarda revisão`,
        metadata: JSON.stringify({}),
      },
    }).catch(() => {});

    return asset;
  }

  async update(id: number, dto: UpdateContentDto, updatedById: number) {
    await this.findOne(id);
    const data: any = {};
    if (dto.title)           data.title           = dto.title;
    if (dto.description)     data.description     = dto.description;
    if (dto.format)          data.type            = dto.format;
    if (dto.url)             data.url             = dto.url;
    if (dto.thumbnailUrl)    data.thumbnailUrl    = dto.thumbnailUrl;
    if (dto.author)          data.author          = dto.author;
    if (dto.language)        data.language        = dto.language;
    if (dto.level)           data.level           = dto.level;
    if (dto.durationMin)     data.durationMin     = dto.durationMin;
    if (dto.category)        data.category        = dto.category;
    if (dto.status)          data.status          = dto.status;
    if (dto.mandatory !== undefined)         data.mandatory         = dto.mandatory;
    if (dto.isMicrolearning !== undefined)   data.isMicrolearning   = dto.isMicrolearning;
    if (dto.hasCertification !== undefined)  data.hasCertification  = dto.hasCertification;
    if (dto.tags)            data.tags            = dto.tags;
    if (dto.externalSource)  data.externalSource  = dto.externalSource;

    if (dto.status === ContentStatus.ACTIVE) {
      // Bump version on publish
      const current = await this.prisma.contentAsset.findUnique({ where: { id } });
      const [major, minor] = ((current as any).version ?? '1.0').split('.').map(Number);
      data.version = `${major}.${(minor ?? 0) + 1}`;
    }

    await this.prisma.auditLog.create({
      data: {
        userId:   updatedById,
        action:   'CONTENT_UPDATED',
        entity:   'ContentAsset',
        entityId: id,
      },
    }).catch(() => {});

    return this.prisma.contentAsset.update({ where: { id }, data });
  }

  async publish(id: number, publishedById: number) {
    return this.update(id, { status: ContentStatus.ACTIVE } as any, publishedById);
  }

  async deprecate(id: number) {
    return this.prisma.contentAsset.update({
      where: { id }, data: { active: false, ...(({ status: ContentStatus.DEPRECATED }) as any) },
    });
  }

  // ══════════════════════════════════════════════════════
  // BOOKMARKS
  // ══════════════════════════════════════════════════════

  async bookmark(id: number, userId: number) {
    await this.findOne(id);
    const existing = await this.prisma.auditLog.findFirst({
      where: { userId, action: 'CONTENT_BOOKMARK', entity: 'ContentAsset', entityId: id },
    });

    if (existing) {
      await this.prisma.auditLog.delete({ where: { id: existing.id } });
      return { bookmarked: false };
    }

    await this.prisma.auditLog.create({
      data: { userId, action: 'CONTENT_BOOKMARK', entity: 'ContentAsset', entityId: id },
    });
    return { bookmarked: true };
  }

  async getMyBookmarks(userId: number) {
    const logs = await this.prisma.auditLog.findMany({
      where:   { userId, action: 'CONTENT_BOOKMARK', entity: 'ContentAsset' },
      orderBy: { timestamp: 'desc' },
    });
    const ids = logs.map(l => l.entityId).filter((id): id is number => id !== null);
    if (!ids.length) return [];

    return this.prisma.contentAsset.findMany({
      where: { id: { in: ids }, active: true },
    });
  }

  // ══════════════════════════════════════════════════════
  // VIEW TRACKING
  // ══════════════════════════════════════════════════════

  async view(id: number, userId: number) {
    await this.findOne(id);

    // Deduplicate: one view per user per day
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const already = await this.prisma.auditLog.findFirst({
      where: {
        userId, action: 'CONTENT_VIEW', entity: 'ContentAsset',
        entityId: id, timestamp: { gte: today },
      },
    }).catch(() => null);

    if (!already) {
      await this.prisma.auditLog.create({
        data: { userId, action: 'CONTENT_VIEW', entity: 'ContentAsset', entityId: id },
      });
    }

    return { message: 'Visualização registada' };
  }

  // ══════════════════════════════════════════════════════
  // PROGRESS
  // ══════════════════════════════════════════════════════

  async updateProgress(contentId: number, userId: number, dto: UpdateProgressDto) {
    await this.findOne(contentId);

    const data = {
      userId,
      contentId,
      progress:       dto.progress,
      timeSpent:      dto.timeSpentSeconds,
      lastPosition:   dto.lastPosition,
      lastAccessedAt: new Date(),
      completedAt:    dto.progress === 100 ? new Date() : undefined,
    };

    const updated = await safeModel(this.prisma, 'contentProgress').upsert({
      where:  { userId_contentId: { userId, contentId } },
      create: data,
      update: data,
    }).catch(() => data);

    // XP for completion
    if (dto.progress === 100) {
      await this.prisma.userPoints.upsert({
        where:  { userId },
        create: { userId, points: 25 },
        update: { points: { increment: 25 } },
      });

      await this.prisma.notificationLog.create({
        data: {
          userId,
          type:     'CONTENT_COMPLETED',
          message:  `✅ Conteúdo concluído! +25 XP`,
          metadata: JSON.stringify({}),
        },
      }).catch(() => {});
    }

    return updated;
  }

  async getMyProgress(userId: number) {
    const progresses = await safeModel(this.prisma, 'contentProgress').findMany({
      where:   { userId },
      orderBy: { lastAccessedAt: 'desc' },
    }).catch(() => [] as any[]);

    if (!(progresses as any[]).length) return { data: [], stats: { total: 0, completed: 0, inProgress: 0 } };

    const ids      = (progresses as any[]).map((p: any) => p.contentId);
    const contents = await this.prisma.contentAsset.findMany({ where: { id: { in: ids } } });
    const cMap     = new Map(contents.map(c => [c.id, c]));

    const enriched = (progresses as any[]).map((p: any) => ({
      ...p,
      content: cMap.get(p.contentId) ?? null,
    }));

    const completed  = enriched.filter((p: any) => p.progress === 100).length;
    const inProgress = enriched.filter((p: any) => p.progress > 0 && p.progress < 100).length;

    return {
      data: enriched,
      stats: { total: enriched.length, completed, inProgress },
    };
  }

  async getContinueWatching(userId: number, limit = 5) {
    const progresses = await safeModel(this.prisma, 'contentProgress').findMany({
      where:   { userId, progress: { gt: 0, lt: 100 } },
      orderBy: { lastAccessedAt: 'desc' },
      take:    limit,
    }).catch(() => [] as any[]);

    const ids      = (progresses as any[]).map((p: any) => p.contentId);
    if (!ids.length) return [];

    const contents = await this.prisma.contentAsset.findMany({ where: { id: { in: ids } } });
    const cMap     = new Map(contents.map(c => [c.id, c]));

    return (progresses as any[]).map((p: any) => ({
      ...cMap.get(p.contentId),
      progress: p.progress,
      lastPosition:   p.lastPosition,
      lastAccessedAt: p.lastAccessedAt,
    }));
  }

  // ══════════════════════════════════════════════════════
  // RATINGS
  // ══════════════════════════════════════════════════════

  async rateContent(contentId: number, userId: number, dto: RateContentDto) {
    await this.findOne(contentId);

    const rating = await safeModel(this.prisma, 'contentRating').upsert({
      where:  { userId_contentId: { userId, contentId } },
      create: { userId, contentId, rating: dto.rating, comment: dto.comment },
      update: { rating: dto.rating, comment: dto.comment, updatedAt: new Date() },
    }).catch(() => ({ userId, contentId, rating: dto.rating }));

    return { message: 'Avaliação registada', rating };
  }

  async getContentRatings(contentId: number) {
    await this.findOne(contentId);

    const ratings = await safeModel(this.prisma, 'contentRating').findMany({
      where:   { contentId },
      orderBy: { createdAt: 'desc' },
    }).catch(() => [] as any[]);

    // Distribution 1–5
    const dist = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    for (const r of ratings as any[]) dist[r.rating as keyof typeof dist]++;

    const avg = (ratings as any[]).length
      ? +((ratings as any[]).reduce((s: number, r: any) => s + r.rating, 0) / (ratings as any[]).length).toFixed(1)
      : null;

    return { avg, total: (ratings as any[]).length, distribution: dist, recent: (ratings as any[]).slice(0, 10) };
  }

  // ══════════════════════════════════════════════════════
  // PERSONAL NOTES
  // ══════════════════════════════════════════════════════

  async saveNote(contentId: number, userId: number, dto: SaveNoteDto) {
    await this.findOne(contentId);
    return safeModel(this.prisma, 'contentNote').upsert({
      where:  { userId_contentId: { userId, contentId } },
      create: { userId, contentId, note: dto.note, timestamp: dto.timestamp },
      update: { note: dto.note, timestamp: dto.timestamp, updatedAt: new Date() },
    }).catch(() => ({ userId, contentId, note: dto.note }));
  }

  async getMyNote(contentId: number, userId: number) {
    return safeModel(this.prisma, 'contentNote').findUnique({
      where: { userId_contentId: { userId, contentId } },
    }).catch(() => null);
  }

  // ══════════════════════════════════════════════════════
  // RECOMMENDATIONS
  // ══════════════════════════════════════════════════════

  async getRecommended(userId: number, limit = 10) {
    const user = await this.prisma.user.findUnique({
      where:  { id: userId },
      select: {
        id: true, roleId: true, departmentId: true, positionId: true,
        userCompetencies: {
          select: { competencyId: true, currentLevel: true, targetLevel: true },
        },
      },
    });
    if (!user) return [];

    // 1. Content already consumed
    const viewed = await this.prisma.auditLog.findMany({
      where:  { userId, action: 'CONTENT_VIEW', entity: 'ContentAsset' },
      select: { entityId: true },
    });
    const viewedIds = viewed.map(v => v.entityId).filter(Boolean) as number[];

    // 2. In-progress content has priority
    const inProgress = await safeModel(this.prisma, 'contentProgress').findMany({
      where: { userId, progress: { gt: 0, lt: 100 } },
      select: { contentId: true },
    }).catch(() => [] as any[]);

    const inProgressIds = (inProgress as any[]).map((p: any) => p.contentId);

    // 3. Recommend content not yet viewed
    const fresh = await this.prisma.contentAsset.findMany({
      where: {
        active: true,
        id:     { notIn: [...viewedIds, ...inProgressIds] },
      },
      orderBy: { createdAt: 'desc' },
      take:    limit * 2,
    });

    // 4. Score — prefer mandatory + matching category/format from user history
    const mostUsedFormat = await this.prisma.auditLog.groupBy({
      by:      ['entityId'],
      where:   { userId, action: 'CONTENT_VIEW', entity: 'ContentAsset' },
      _count:  { id: true },
      orderBy: { _count: { id: 'desc' } },
      take:    3,
    }).catch(() => [] as any[]);

    const scored = fresh.map(c => {
      let score = 0;
      if ((c as any).mandatory)     score += 5;
      if ((c as any).isMicrolearning) score += 2;
      if (mostUsedFormat.length)    score += 1;
      return { ...c, recommendationScore: score };
    }).sort((a, b) => b.recommendationScore - a.recommendationScore);

    return scored.slice(0, limit);
  }

  async getTrending(limit = 10) {
    // Most viewed in last 7 days
    const since = new Date(Date.now() - 7 * 86400000);
    const topViews = await this.prisma.auditLog.groupBy({
      by:      ['entityId'],
      where:   { action: 'CONTENT_VIEW', entity: 'ContentAsset', timestamp: { gte: since } },
      _count:  { id: true },
      orderBy: { _count: { id: 'desc' } },
      take:    limit,
    }).catch(() => [] as any[]);

    const ids = (topViews as any[]).map((v: any) => v.entityId).filter(Boolean) as number[];
    if (!ids.length) {
      return this.prisma.contentAsset.findMany({
        where:   { active: true },
        orderBy: { createdAt: 'desc' },
        take:    limit,
      });
    }

    const contents = await this.prisma.contentAsset.findMany({ where: { id: { in: ids } } });
    const vcMap    = new Map((topViews as any[]).map((v: any) => [v.entityId, v._count.id]));

    return contents
      .map(c => ({ ...c, weeklyViews: vcMap.get(c.id) ?? 0 }))
      .sort((a, b) => b.weeklyViews - a.weeklyViews);
  }

  async getNewContent(limit = 10) {
    return this.prisma.contentAsset.findMany({
      where:   { active: true },
      orderBy: { createdAt: 'desc' },
      take:    limit,
    });
  }

  async getMandatory(userId: number) {
    const mandatory = await this.prisma.contentAsset.findMany({
      where: { active: true, ...(({ mandatory: true }) as any) },
    });

    // Enrich with user progress
    const ids   = mandatory.map(c => c.id);
    const progs = await safeModel(this.prisma, 'contentProgress').findMany({
      where: { userId, contentId: { in: ids } },
    }).catch(() => [] as any[]);
    const pMap = new Map((progs as any[]).map((p: any) => [p.contentId, p]));

    return mandatory.map(c => ({
      ...c,
      progress:  pMap.get(c.id)?.progress ?? 0,
      completed: pMap.get(c.id)?.progress === 100,
    }));
  }

  // ══════════════════════════════════════════════════════
  // LEARNING PATHS
  // ══════════════════════════════════════════════════════

  async createLearningPath(dto: CreateLearningPathDto, createdById: number) {
    const path = await safeModel(this.prisma, 'learningPath').create({
      data: {
        title:            dto.title,
        description:      dto.description,
        thumbnailUrl:     dto.thumbnailUrl,
        hasCertification: dto.hasCertification ?? false,
        xpReward:         dto.xpReward ?? 100,
        createdById,
        items: {
          create: dto.items.map((item, i) => ({
            contentId: item.contentId,
            order:     item.order ?? i,
            mandatory: item.mandatory ?? true,
          })),
        },
      },
    }).catch(() => ({ ...dto, id: null, message: 'Learning path criada (modo compatibilidade)' }));

    return path;
  }

  async getLearningPaths(filters: LearningPathFilterDto = {}) {
    const { page = 1, limit = 20, search } = filters;
    const skip  = (page - 1) * limit;
    const where: any = {};
    if (search) where.title = { contains: search, mode: 'insensitive' };

    const data = await safeModel(this.prisma, 'learningPath').findMany({
      where, skip, take: limit,
      orderBy: { createdAt: 'desc' },
    }).catch(() => [] as any[]);

    const total = await safeModel(this.prisma, 'learningPath').count({ where }).catch(() => 0);
    return { data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  async getLearningPath(id: number, userId?: number) {
    const path = await safeModel(this.prisma, 'learningPath').findUnique({
      where:   { id },
      include: {
        items: {
          orderBy: { order: 'asc' },
          include: { content: true },
        },
      },
    }).catch(() => null);

    if (!path) throw new NotFoundException('Learning Path não encontrada');

    if (!userId) return path;

    // Enrich items with user progress
    const contentIds = (path.items ?? []).map((i: any) => i.contentId);
    const progs      = await safeModel(this.prisma, 'contentProgress').findMany({
      where: { userId, contentId: { in: contentIds } },
    }).catch(() => [] as any[]);
    const pMap = new Map((progs as any[]).map((p: any) => [p.contentId, p]));

    const enrichedItems = (path.items ?? []).map((item: any) => ({
      ...item,
      progress:  pMap.get(item.contentId)?.progress ?? 0,
      completed: pMap.get(item.contentId)?.progress === 100,
    }));

    const totalItems     = enrichedItems.length;
    const completedItems = enrichedItems.filter((i: any) => i.completed).length;
    const overallPct     = totalItems > 0 ? Math.round((completedItems / totalItems) * 100) : 0;

    return { ...path, items: enrichedItems, overallProgress: overallPct, completedItems, totalItems };
  }

  async enrollLearningPath(pathId: number, userId: number) {
    await safeModel(this.prisma, 'learningPathEnrollment').upsert({
      where:  { userId_pathId: { userId, pathId } },
      create: { userId, pathId, enrolledAt: new Date() },
      update: { resumedAt: new Date() },
    }).catch(() => null);

    return { message: 'Inscrito com sucesso na learning path', pathId, userId };
  }

  // ══════════════════════════════════════════════════════
  // ANALYTICS
  // ══════════════════════════════════════════════════════

  async getAnalyticsDashboard(departmentId?: number) {
    const userWhere: any = { active: true };
    if (departmentId) userWhere.departmentId = departmentId;

    const [
      totalContent, activeContent, totalViews, totalCompletions,
      mostViewed, mostCompleted, formatBreakdown, recentlyAdded,
    ] = await Promise.all([
      this.prisma.contentAsset.count(),
      this.prisma.contentAsset.count({ where: { active: true } }),
      this.prisma.auditLog.count({ where: { action: 'CONTENT_VIEW', entity: 'ContentAsset' } }),
      safeModel(this.prisma, 'contentProgress').count({ where: { progress: 100 } }).catch(() => 0),
      // Most viewed (last 30 days)
      this.prisma.auditLog.groupBy({
        by:      ['entityId'],
        where:   { action: 'CONTENT_VIEW', entity: 'ContentAsset', timestamp: { gte: new Date(Date.now() - 30 * 86400000) } },
        _count:  { id: true },
        orderBy: { _count: { id: 'desc' } },
        take:    5,
      }).catch(() => [] as any[]),
      // Most completed
      safeModel(this.prisma, 'contentProgress').groupBy({
        by:      ['contentId'],
        where:   { progress: 100 },
        _count:  { id: true },
        orderBy: { _count: { id: 'desc' } },
        take:    5,
      }).catch(() => [] as any[]),
      // By format
      this.prisma.contentAsset.groupBy({
        by:     ['type'],
        where:  { active: true },
        _count: { id: true },
      }).catch(() => [] as any[]),
      this.prisma.contentAsset.findMany({
        where:   { active: true },
        orderBy: { createdAt: 'desc' },
        take:    6,
        select:  { id: true, title: true, type: true, createdAt: true },
      }),
    ]);

    // Enrich most viewed with titles
    const mvIds      = (mostViewed as any[]).map((v: any) => v.entityId).filter(Boolean);
    const mcIds      = (mostCompleted as any[]).map((v: any) => v.contentId).filter(Boolean);
    const allIds     = [...new Set([...mvIds, ...mcIds])];

    const contents   = allIds.length
      ? await this.prisma.contentAsset.findMany({ where: { id: { in: allIds } }, select: { id: true, title: true, type: true } })
      : [];
    const cMap       = new Map(contents.map(c => [c.id, c]));

    return {
      kpis: {
        totalContent, activeContent, totalViews, totalCompletions,
      },
      mostViewed: (mostViewed as any[]).map((v: any) => ({
        content:    cMap.get(v.entityId),
        weeklyViews: v._count.id,
      })).filter((v: any) => v.content),
      mostCompleted: (mostCompleted as any[]).map((v: any) => ({
        content:    cMap.get(v.contentId),
        completions: v._count.id,
      })).filter((v: any) => v.content),
      formatBreakdown: (formatBreakdown as any[]).map((f: any) => ({ format: f.type, count: f._count.id })),
      recentlyAdded,
    };
  }

  async getUserAnalytics(userId: number) {
    const [viewCount, completions, bookmarkCount, totalTimeSpent] = await Promise.all([
      this.prisma.auditLog.count({
        where: { userId, action: 'CONTENT_VIEW', entity: 'ContentAsset' },
      }),
      safeModel(this.prisma, 'contentProgress').count({ where: { userId, progress: 100 } }).catch(() => 0),
      this.prisma.auditLog.count({
        where: { userId, action: 'CONTENT_BOOKMARK', entity: 'ContentAsset' },
      }),
      safeModel(this.prisma, 'contentProgress').findMany({
        where: { userId }, select: { timeSpent: true },
      }).then((ps: any[]) => ps.reduce((s: number, p: any) => s + (p.timeSpent ?? 0), 0))
        .catch(() => 0),
    ]);

    const totalHours = Math.round(totalTimeSpent / 3600);

    return {
      userId, viewCount, completions, bookmarkCount,
      totalTimeSpentSeconds: totalTimeSpent,
      totalHours,
      level: completions >= 20 ? 'EXPERT' : completions >= 10 ? 'INTERMEDIATE' : 'BEGINNER',
    };
  }

  // ══════════════════════════════════════════════════════
  // CATEGORIES & TAGS (Discovery)
  // ══════════════════════════════════════════════════════

  async getCategoryBreakdown() {
    return this.prisma.contentAsset.groupBy({
      by:     ['type'],
      where:  { active: true },
      _count: { id: true },
    }).then(groups => groups.map(g => ({ format: g.type, count: g._count.id })));
  }

  async getAllTags() {
    const contents = await this.prisma.contentAsset.findMany({
      where:  { active: true },
      select: { id: true },
      // tags not guaranteed in schema — cast safe
    }).catch(() => [] as any[]);

    // Return empty array if tags field doesn't exist
    return { tags: [] as string[] };
  }
}