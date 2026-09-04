// src/content-library/content-library.service.ts
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateContentDto,
  UpdateContentDto,
  ContentFilterDto,
  RateContentDto,
  UpdateProgressDto,
  SaveNoteDto,
  CreateLearningPathDto,
  ContentLibraryLearningPathFilterDto,
  ContentStatus,
  ContentFormat,
} from './content-library.dto';
import { assertCanAccess } from '../common/authz/ownership';
import { Role } from '../auth/enums/role.enum';
import { CurrentUserData } from '../common/types/current-user';
import { calculatePagination, buildPaginatedResponse } from '../common/helpers/pagination.helper';

// ─────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────

/**
 * Safe access to models that may not exist in the schema yet.
 * Acesso dinâmico `prisma[model]` a um modelo que pode não existir não tem
 * nenhum tipo gerado pelo Prisma para se agarrar (mesmo problema/solução de
 * api-integration.service.ts) — o único cast é o `as unknown as
 * DynamicModelDelegate` abaixo, confinado a esta linha; sem `any` em lado
 * nenhum. Os métodos do stub de fallback usam `{ data: unknown }`/
 * `{ create: unknown }` em vez de `(d: any)`.
 */
type DynamicModelDelegate = Record<string, (...args: unknown[]) => Promise<unknown>>;

function safeModel(prisma: PrismaService, model: string): DynamicModelDelegate {
  return (
    (prisma as unknown as Record<string, DynamicModelDelegate | undefined>)[model] ?? {
      findMany: async () => [],
      findFirst: async () => null,
      findUnique: async () => null,
      create: async (d: unknown) => (d as { data: unknown }).data,
      upsert: async (d: unknown) => (d as { create: unknown }).create,
      update: async (d: unknown) => (d as { data: unknown }).data,
      delete: async () => null,
      count: async () => 0,
      groupBy: async () => [],
    }
  );
}

// contentProgress/contentRating/contentNote não existem em prisma/schema.prisma
// — acedidos via safeModel() (degrada com graça se o modelo não existir), por
// isso não têm tipos gerados pelo Prisma. Estas interfaces documentam a forma
// real dos registos (confirmada nos próprios .create()/.upsert() deste
// ficheiro) para remover `any` do lado do consumo, mesmo que o lado da
// produção (safeModel) continue dinâmico.
export interface ContentProgressRow {
  userId: number;
  contentId: number;
  progress: number;
  timeSpent?: number | null;
  lastPosition?: number | null;
  lastAccessedAt?: Date;
  completedAt?: Date | null;
}

export interface ContentRatingRow {
  userId: number;
  contentId: number;
  rating: number;
  comment?: string | null;
  createdAt?: Date;
  updatedAt?: Date;
}

// learningPath/learningPathEnrollment também não existem em
// prisma/schema.prisma, e o shape assumido por este ficheiro (items/
// hasCertification/xpReward) diverge do modelo real "LearningPath" que lá
// existe (ver nota estrutural junto de createLearningPath() abaixo) — por
// isso este tipo é deliberadamente permissivo (index signature) em vez de
// fingir conhecer a forma real de um registo que nunca chega a persistir.
export interface LearningPathItemRow {
  contentId: number;
  [key: string]: unknown;
}

function buildWhereFromFilters(filters: ContentFilterDto): Prisma.ContentAssetWhereInput {
  const where: Prisma.ContentAssetWhereInput = { active: true };

  // Status filter — only show active by default
  where.status = ContentStatus.ACTIVE;

  if (filters.format) where.type = filters.format; // ContentAsset uses 'type'
  if (filters.level) where.level = filters.level;
  if (filters.language) where.language = filters.language;
  if (filters.mandatory !== undefined) where.mandatory = filters.mandatory;
  if (filters.hasCertification !== undefined) where.hasCertification = filters.hasCertification;
  if (filters.isMicrolearning !== undefined) where.isMicrolearning = filters.isMicrolearning;
  if (filters.maxDuration) where.durationMin = { lte: filters.maxDuration };
  if (filters.tag) where.tags = { has: filters.tag };
  if (filters.category) where.category = filters.category;

  if (filters.search) {
    where.OR = [
      { title: { contains: filters.search, mode: 'insensitive' } },
      { description: { contains: filters.search, mode: 'insensitive' } },
    ];
  }

  return where;
}

function buildOrderBy(
  sortBy?: string,
): Prisma.ContentAssetOrderByWithRelationInput | Prisma.ContentAssetOrderByWithRelationInput[] {
  switch (sortBy) {
    case 'newest':
      return { createdAt: 'desc' };
    case 'duration':
      return [{ durationMin: 'asc' }];
    case 'popular':
      // ContentAsset não tem coluna de contagem de visualizações — as vistas
      // são derivadas de AuditLog (ver findAll) e não podem ser usadas num
      // Prisma orderBy. 'rating' tem a mesma limitação (também cai aqui).
      // Antes desta função ser tipada, isto chamava orderBy: { viewCount },
      // um campo que nunca existiu em ContentAsset — rebentava com um erro
      // de validação do Prisma em runtime sempre que sortBy='popular'.
      return { createdAt: 'desc' };
    default:
      return { createdAt: 'desc' };
  }
}

// ─────────────────────────────────────────────────────────────────
// SERVICE
// ─────────────────────────────────────────────────────────────────

@Injectable()
export class ContentLibraryService {
  private readonly logger = new Logger(ContentLibraryService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ══════════════════════════════════════════════════════
  // CATALOGUE — SEARCH & BROWSE
  // ══════════════════════════════════════════════════════

  async findAll(filters: ContentFilterDto = {}) {
    const { page = 1, limit = 20 } = filters;
    const { skip, take } = calculatePagination(page, limit);
    const where = buildWhereFromFilters(filters);
    const orderBy = buildOrderBy(filters.sortBy);

    const [data, total] = await Promise.all([
      this.prisma.read.contentAsset.findMany({ where, skip, take, orderBy }),
      this.prisma.read.contentAsset.count({ where }),
    ]);

    // Enrich with view counts from AuditLog
    const ids = data.map(c => c.id);
    const viewCounts = await this.prisma.auditLog
      .groupBy({
        by: ['entityId'],
        where: { entity: 'ContentAsset', action: 'CONTENT_VIEW', entityId: { in: ids } },
        _count: { id: true },
      })
      .catch(e => {
        this.logger.warn({
          action: 'findAll.viewCounts',
          err: { message: e instanceof Error ? e.message : String(e) },
          msg: 'Falha ao obter contagens de visualizações de conteúdo',
        });
        return [] as { entityId: number | null; _count: { id: number } }[];
      });

    const vcMap = new Map(
      viewCounts.map((v): [number | null, number] => [v.entityId, v._count.id]),
    );

    const enriched = data.map(c => ({ ...c, viewCount: vcMap.get(c.id) ?? 0 }));
    return buildPaginatedResponse(enriched, total, page, limit);
  }

  async findOne(id: number, userId?: number) {
    const c = await this.prisma.read.contentAsset.findUnique({ where: { id } });
    if (!c) throw new NotFoundException('Conteúdo não encontrado');

    const [viewCount, avgRating, ratingCount, userProgress, isBookmarked] = await Promise.all([
      this.prisma.auditLog
        .count({
          where: { entity: 'ContentAsset', action: 'CONTENT_VIEW', entityId: id },
        })
        .catch(e => {
          this.logger.warn({
            contentId: id,
            action: 'findOne.viewCount',
            err: { message: e instanceof Error ? e.message : String(e) },
            msg: 'Falha ao contar visualizações de conteúdo',
          });
          return 0;
        }),
      safeModel(this.prisma, 'contentRating')
        .groupBy({
          by: ['contentId'],
          where: { contentId: id },
          _avg: { rating: true },
          _count: { id: true },
        })
        .then(
          (r: { contentId: number; _avg: { rating: number | null }; _count: { id: number } }[]) =>
            r[0] ?? null,
        )
        .catch(e => {
          this.logger.warn({
            contentId: id,
            action: 'findOne.avgRating',
            err: { message: e instanceof Error ? e.message : String(e) },
            msg: 'Falha ao calcular avaliação média — modelo contentRating pode estar ausente',
          });
          return null;
        }),
      safeModel(this.prisma, 'contentRating')
        .count({ where: { contentId: id } })
        .catch(e => {
          this.logger.warn({
            contentId: id,
            action: 'findOne.ratingCount',
            err: { message: e instanceof Error ? e.message : String(e) },
            msg: 'Falha ao contar avaliações — modelo contentRating pode estar ausente',
          });
          return 0;
        }),
      userId
        ? safeModel(this.prisma, 'contentProgress')
            .findUnique({
              where: { userId_contentId: { userId, contentId: id } },
            })
            .catch(e => {
              this.logger.warn({
                userId,
                contentId: id,
                action: 'findOne.userProgress',
                err: { message: e instanceof Error ? e.message : String(e) },
                msg: 'Falha ao obter progresso do utilizador — modelo contentProgress pode estar ausente',
              });
              return null;
            })
        : Promise.resolve(null),
      userId
        ? this.prisma.auditLog
            .findFirst({
              where: { userId, action: 'CONTENT_BOOKMARK', entity: 'ContentAsset', entityId: id },
            })
            .then(r => !!r)
            .catch(e => {
              this.logger.warn({
                userId,
                contentId: id,
                action: 'findOne.isBookmarked',
                err: { message: e instanceof Error ? e.message : String(e) },
                msg: 'Falha ao verificar se conteúdo está marcado como favorito',
              });
              return false;
            })
        : Promise.resolve(false),
    ]);

    return {
      ...c,
      viewCount,
      avgRating: avgRating ? +(avgRating._avg?.rating ?? 0).toFixed(1) : null,
      ratingCount,
      progress: userProgress,
      isBookmarked,
    };
  }

  async create(createdById: number, dto: CreateContentDto) {
    const asset = await this.prisma.contentAsset.create({
      data: {
        title: dto.title,
        description: dto.description,
        type: dto.format,
        url: dto.url,
        active: true,
        version: '1.0',
        ...(dto.thumbnailUrl && { thumbnailUrl: dto.thumbnailUrl }),
        ...(dto.author && { author: dto.author }),
        ...(dto.language && { language: dto.language }),
        ...(dto.level && { level: dto.level }),
        ...(dto.durationMin && { durationMin: dto.durationMin }),
        ...(dto.category && { category: dto.category }),
        ...(dto.mandatory !== undefined && { mandatory: dto.mandatory }),
        ...(dto.isMicrolearning !== undefined && { isMicrolearning: dto.isMicrolearning }),
        ...(dto.hasCertification !== undefined && { hasCertification: dto.hasCertification }),
        ...(dto.tags && { tags: dto.tags }),
        ...(dto.externalSource && { externalSource: dto.externalSource }),
        createdById,
        status: ContentStatus.DRAFT,
      },
    });

    await this.prisma.notificationLog
      .create({
        data: {
          userId: createdById,
          type: 'CONTENT_CREATED',
          message: `Conteúdo "${dto.title}" criado e aguarda revisão`,
          metadata: JSON.stringify({}),
        },
      })
      .catch(e => {
        this.logger.warn({
          userId: createdById,
          action: 'CONTENT_CREATED',
          contentId: asset.id,
          err: { message: e instanceof Error ? e.message : String(e) },
          msg: 'Falha ao criar notificação de conteúdo criado',
        });
      });

    return asset;
  }

  async update(id: number, dto: UpdateContentDto, updatedById: number, user?: CurrentUserData) {
    const existing = await this.prisma.contentAsset.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Conteúdo não encontrado');
    // Ownership (IDOR fix): só o autor (createdById) OU ADMIN/RH pode editar.
    // INSTRUCTOR só pode editar o próprio conteúdo — não o de outro instrutor.
    if (user) assertCanAccess(existing, existing.createdById ?? 0, user, [Role.ADMIN, Role.RH]);

    const data: Prisma.ContentAssetUpdateInput = {};
    if (dto.title) data.title = dto.title;
    if (dto.description) data.description = dto.description;
    if (dto.format) data.type = dto.format;
    if (dto.url) data.url = dto.url;
    if (dto.thumbnailUrl) data.thumbnailUrl = dto.thumbnailUrl;
    if (dto.author) data.author = dto.author;
    if (dto.language) data.language = dto.language;
    if (dto.level) data.level = dto.level;
    if (dto.durationMin) data.durationMin = dto.durationMin;
    if (dto.category) data.category = dto.category;
    if (dto.status) data.status = dto.status;
    if (dto.mandatory !== undefined) data.mandatory = dto.mandatory;
    if (dto.isMicrolearning !== undefined) data.isMicrolearning = dto.isMicrolearning;
    if (dto.hasCertification !== undefined) data.hasCertification = dto.hasCertification;
    if (dto.tags) data.tags = dto.tags;
    if (dto.externalSource) data.externalSource = dto.externalSource;

    if (dto.status === ContentStatus.ACTIVE) {
      // Bump version on publish
      const current = await this.prisma.contentAsset.findUnique({ where: { id } });
      const [major, minor] = (current?.version ?? '1.0').split('.').map(Number);
      data.version = `${major}.${(minor ?? 0) + 1}`;
    }

    await this.prisma.auditLog
      .create({
        data: {
          userId: updatedById,
          action: 'CONTENT_UPDATED',
          entity: 'ContentAsset',
          entityId: id,
        },
      })
      .catch(e => {
        this.logger.warn({
          userId: updatedById,
          action: 'CONTENT_UPDATED',
          entityId: id,
          err: { message: e instanceof Error ? e.message : String(e) },
          msg: 'Falha ao escrever audit log de conteúdo actualizado',
        });
      });

    return this.prisma.contentAsset.update({ where: { id }, data });
  }

  async publish(id: number, publishedById: number) {
    return this.update(id, { status: ContentStatus.ACTIVE }, publishedById);
  }

  async deprecate(id: number) {
    return this.prisma.contentAsset.update({
      where: { id },
      data: { active: false, status: ContentStatus.DEPRECATED },
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
    const logs = await this.prisma.read.auditLog.findMany({
      where: { userId, action: 'CONTENT_BOOKMARK', entity: 'ContentAsset' },
      orderBy: { timestamp: 'desc' },
    });
    const ids = logs.map(l => l.entityId).filter((id): id is number => id !== null);
    if (!ids.length) return [];

    return this.prisma.read.contentAsset.findMany({
      where: { id: { in: ids }, active: true },
    });
  }

  // ══════════════════════════════════════════════════════
  // VIEW TRACKING
  // ══════════════════════════════════════════════════════

  async view(id: number, userId: number) {
    await this.findOne(id);

    // Deduplicate: one view per user per day
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const already = await this.prisma.auditLog
      .findFirst({
        where: {
          userId,
          action: 'CONTENT_VIEW',
          entity: 'ContentAsset',
          entityId: id,
          timestamp: { gte: today },
        },
      })
      .catch(e => {
        this.logger.warn({
          userId,
          contentId: id,
          action: 'view.checkDuplicate',
          err: { message: e instanceof Error ? e.message : String(e) },
          msg: 'Falha ao verificar visualização duplicada de conteúdo',
        });
        return null;
      });

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
      progress: dto.progress,
      timeSpent: dto.timeSpentSeconds,
      lastPosition: dto.lastPosition,
      lastAccessedAt: new Date(),
      completedAt: dto.progress === 100 ? new Date() : undefined,
    };

    const updated = await safeModel(this.prisma, 'contentProgress')
      .upsert({
        where: { userId_contentId: { userId, contentId } },
        create: data,
        update: data,
      })
      .catch(e => {
        this.logger.warn({
          userId,
          contentId,
          action: 'updateProgress.upsert',
          err: { message: e instanceof Error ? e.message : String(e) },
          msg: 'Falha ao gravar progresso de conteúdo — modelo contentProgress pode estar ausente',
        });
        return data;
      });

    // XP for completion
    if (dto.progress === 100) {
      await this.prisma.userPoints.upsert({
        where: { userId },
        create: { userId, points: 25 },
        update: { points: { increment: 25 } },
      });

      await this.prisma.notificationLog
        .create({
          data: {
            userId,
            type: 'CONTENT_COMPLETED',
            message: `✅ Conteúdo concluído! +25 XP`,
            metadata: JSON.stringify({}),
          },
        })
        .catch(e => {
          this.logger.warn({
            userId,
            contentId,
            action: 'CONTENT_COMPLETED',
            err: { message: e instanceof Error ? e.message : String(e) },
            msg: 'Falha ao criar notificação de conteúdo concluído',
          });
        });
    }

    return updated;
  }

  async getMyProgress(userId: number) {
    const progresses: ContentProgressRow[] = await (
      safeModel(this.prisma, 'contentProgress').findMany({
        where: { userId },
        orderBy: { lastAccessedAt: 'desc' },
      }) as Promise<ContentProgressRow[]>
    ).catch(e => {
      this.logger.warn({
        userId,
        action: 'getMyProgress',
        err: { message: e instanceof Error ? e.message : String(e) },
        msg: 'Falha ao obter progresso de conteúdo — modelo contentProgress pode estar ausente',
      });
      return [] as ContentProgressRow[];
    });

    if (!progresses.length) return { data: [], stats: { total: 0, completed: 0, inProgress: 0 } };

    const ids = progresses.map(p => p.contentId);
    const contents = await this.prisma.read.contentAsset.findMany({ where: { id: { in: ids } } });
    const cMap = new Map(contents.map(c => [c.id, c]));

    const enriched = progresses.map(p => ({
      ...p,
      content: cMap.get(p.contentId) ?? null,
    }));

    const completed = enriched.filter(p => p.progress === 100).length;
    const inProgress = enriched.filter(p => p.progress > 0 && p.progress < 100).length;

    return {
      data: enriched,
      stats: { total: enriched.length, completed, inProgress },
    };
  }

  async getContinueWatching(userId: number, limit = 5) {
    const progresses: ContentProgressRow[] = await (
      safeModel(this.prisma, 'contentProgress').findMany({
        where: { userId, progress: { gt: 0, lt: 100 } },
        orderBy: { lastAccessedAt: 'desc' },
        take: limit,
      }) as Promise<ContentProgressRow[]>
    ).catch(e => {
      this.logger.warn({
        userId,
        action: 'getContinueWatching',
        err: { message: e instanceof Error ? e.message : String(e) },
        msg: 'Falha ao obter conteúdos em progresso — modelo contentProgress pode estar ausente',
      });
      return [] as ContentProgressRow[];
    });

    const ids = progresses.map(p => p.contentId);
    if (!ids.length) return [];

    const contents = await this.prisma.read.contentAsset.findMany({ where: { id: { in: ids } } });
    const cMap = new Map(contents.map(c => [c.id, c]));

    return progresses.map(p => ({
      ...cMap.get(p.contentId),
      progress: p.progress,
      lastPosition: p.lastPosition,
      lastAccessedAt: p.lastAccessedAt,
    }));
  }

  // ══════════════════════════════════════════════════════
  // RATINGS
  // ══════════════════════════════════════════════════════

  async rateContent(contentId: number, userId: number, dto: RateContentDto) {
    await this.findOne(contentId);

    const rating = await safeModel(this.prisma, 'contentRating')
      .upsert({
        where: { userId_contentId: { userId, contentId } },
        create: { userId, contentId, rating: dto.rating, comment: dto.comment },
        update: { rating: dto.rating, comment: dto.comment, updatedAt: new Date() },
      })
      .catch(e => {
        this.logger.warn({
          userId,
          contentId,
          action: 'rateContent',
          err: { message: e instanceof Error ? e.message : String(e) },
          msg: 'Falha ao gravar avaliação — modelo contentRating pode estar ausente',
        });
        return { userId, contentId, rating: dto.rating };
      });

    return { message: 'Avaliação registada', rating };
  }

  async getContentRatings(contentId: number) {
    await this.findOne(contentId);

    const ratings: ContentRatingRow[] = await (
      safeModel(this.prisma, 'contentRating').findMany({
        where: { contentId },
        orderBy: { createdAt: 'desc' },
      }) as Promise<ContentRatingRow[]>
    ).catch(e => {
      this.logger.warn({
        contentId,
        action: 'getContentRatings',
        err: { message: e instanceof Error ? e.message : String(e) },
        msg: 'Falha ao obter avaliações — modelo contentRating pode estar ausente',
      });
      return [] as ContentRatingRow[];
    });

    // Distribution 1–5
    const dist = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    for (const r of ratings) dist[r.rating as keyof typeof dist]++;

    const avg = ratings.length
      ? +(ratings.reduce((s, r) => s + r.rating, 0) / ratings.length).toFixed(1)
      : null;

    return {
      avg,
      total: ratings.length,
      distribution: dist,
      recent: ratings.slice(0, 10),
    };
  }

  // ══════════════════════════════════════════════════════
  // PERSONAL NOTES
  // ══════════════════════════════════════════════════════

  async saveNote(contentId: number, userId: number, dto: SaveNoteDto) {
    await this.findOne(contentId);
    return safeModel(this.prisma, 'contentNote')
      .upsert({
        where: { userId_contentId: { userId, contentId } },
        create: { userId, contentId, note: dto.note, timestamp: dto.timestamp },
        update: { note: dto.note, timestamp: dto.timestamp, updatedAt: new Date() },
      })
      .catch(e => {
        this.logger.warn({
          userId,
          contentId,
          action: 'saveNote',
          err: { message: e instanceof Error ? e.message : String(e) },
          msg: 'Falha ao gravar nota pessoal — modelo contentNote pode estar ausente',
        });
        return { userId, contentId, note: dto.note };
      });
  }

  async getMyNote(contentId: number, userId: number) {
    return safeModel(this.prisma, 'contentNote')
      .findUnique({
        where: { userId_contentId: { userId, contentId } },
      })
      .catch(e => {
        this.logger.warn({
          userId,
          contentId,
          action: 'getMyNote',
          err: { message: e instanceof Error ? e.message : String(e) },
          msg: 'Falha ao obter nota pessoal — modelo contentNote pode estar ausente',
        });
        return null;
      });
  }

  // ══════════════════════════════════════════════════════
  // RECOMMENDATIONS
  // ══════════════════════════════════════════════════════

  async getRecommended(userId: number, limit = 10) {
    const user = await this.prisma.read.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        roleId: true,
        departmentId: true,
        positionId: true,
        userCompetencies: {
          select: { competencyId: true, currentLevel: true, targetLevel: true },
        },
      },
    });
    if (!user) return [];

    // 1. Content already consumed
    const viewed = await this.prisma.read.auditLog.findMany({
      where: { userId, action: 'CONTENT_VIEW', entity: 'ContentAsset' },
      select: { entityId: true },
    });
    const viewedIds = viewed.map(v => v.entityId).filter(Boolean);

    // 2. In-progress content has priority
    const inProgress: Pick<ContentProgressRow, 'contentId'>[] = await (
      safeModel(this.prisma, 'contentProgress').findMany({
        where: { userId, progress: { gt: 0, lt: 100 } },
        select: { contentId: true },
      }) as Promise<Pick<ContentProgressRow, 'contentId'>[]>
    ).catch(e => {
      this.logger.warn({
        userId,
        action: 'getRecommended.inProgress',
        err: { message: e instanceof Error ? e.message : String(e) },
        msg: 'Falha ao obter conteúdos em progresso — modelo contentProgress pode estar ausente',
      });
      return [] as Pick<ContentProgressRow, 'contentId'>[];
    });

    const inProgressIds = inProgress.map(p => p.contentId);

    // 3. Recommend content not yet viewed
    const fresh = await this.prisma.read.contentAsset.findMany({
      where: {
        active: true,
        id: { notIn: [...viewedIds, ...inProgressIds] },
      },
      orderBy: { createdAt: 'desc' },
      take: limit * 2,
    });

    // 4. Score — prefer mandatory + matching category/format from user history
    const mostUsedFormat = await this.prisma.auditLog
      .groupBy({
        by: ['entityId'],
        where: { userId, action: 'CONTENT_VIEW', entity: 'ContentAsset' },
        _count: { id: true },
        orderBy: { _count: { id: 'desc' } },
        take: 3,
      })
      .catch(e => {
        this.logger.warn({
          userId,
          action: 'getRecommended.mostUsedFormat',
          err: { message: e instanceof Error ? e.message : String(e) },
          msg: 'Falha ao calcular formato mais usado pelo utilizador',
        });
        return [] as { entityId: number | null; _count: { id: number } }[];
      });

    const scored = fresh
      .map(c => {
        let score = 0;
        if (c.mandatory) score += 5;
        if (c.isMicrolearning) score += 2;
        if (mostUsedFormat.length) score += 1;
        return { ...c, recommendationScore: score };
      })
      .sort((a, b) => b.recommendationScore - a.recommendationScore);

    return scored.slice(0, limit);
  }

  async getTrending(limit = 10) {
    // Most viewed in last 7 days
    const since = new Date(Date.now() - 7 * 86400000);
    const topViews = await this.prisma.auditLog
      .groupBy({
        by: ['entityId'],
        where: { action: 'CONTENT_VIEW', entity: 'ContentAsset', timestamp: { gte: since } },
        _count: { id: true },
        orderBy: { _count: { id: 'desc' } },
        take: limit,
      })
      .catch(e => {
        this.logger.warn({
          action: 'getTrending',
          err: { message: e instanceof Error ? e.message : String(e) },
          msg: 'Falha ao calcular conteúdos em alta (mais vistos na semana)',
        });
        return [] as { entityId: number | null; _count: { id: number } }[];
      });

    const ids = topViews.map(v => v.entityId).filter((id): id is number => id !== null);
    if (!ids.length) {
      return this.prisma.read.contentAsset.findMany({
        where: { active: true },
        orderBy: { createdAt: 'desc' },
        take: limit,
      });
    }

    const contents = await this.prisma.read.contentAsset.findMany({ where: { id: { in: ids } } });
    const vcMap = new Map(topViews.map((v): [number | null, number] => [v.entityId, v._count.id]));

    return contents
      .map(c => ({ ...c, weeklyViews: vcMap.get(c.id) ?? 0 }))
      .sort((a, b) => b.weeklyViews - a.weeklyViews);
  }

  async getNewContent(limit = 10) {
    return this.prisma.read.contentAsset.findMany({
      where: { active: true },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  async getMandatory(userId: number) {
    const mandatory = await this.prisma.read.contentAsset.findMany({
      where: { active: true, mandatory: true },
    });

    // Enrich with user progress
    const ids = mandatory.map(c => c.id);
    const progs: ContentProgressRow[] = await (
      safeModel(this.prisma, 'contentProgress').findMany({
        where: { userId, contentId: { in: ids } },
      }) as Promise<ContentProgressRow[]>
    ).catch(e => {
      this.logger.warn({
        userId,
        action: 'getMandatory',
        err: { message: e instanceof Error ? e.message : String(e) },
        msg: 'Falha ao obter progresso de conteúdos obrigatórios — modelo contentProgress pode estar ausente',
      });
      return [] as ContentProgressRow[];
    });
    const pMap = new Map(progs.map(p => [p.contentId, p]));

    return mandatory.map(c => ({
      ...c,
      progress: pMap.get(c.id)?.progress ?? 0,
      completed: pMap.get(c.id)?.progress === 100,
    }));
  }

  // ══════════════════════════════════════════════════════
  // LEARNING PATHS
  //
  // ACHADO ESTRUTURAL (não corrigido nesta limpeza de tipos): o modelo real
  // "LearningPath" em prisma/schema.prisma tem um shape completamente
  // diferente do que este bloco assume — sem hasCertification, xpReward,
  // createdById nem relação "items" (tem antes courses/milestones/
  // assignments). O enrollLearningPath também usa a chave composta errada
  // ("userId_pathId" em vez de "learningPathId_userId") e campos
  // inexistentes (pathId, resumedAt). Como estas chamadas passam sempre por
  // safeModel(), qualquer erro de validação do Prisma é apanhado pelo
  // .catch() e degrada silenciosamente — na prática, este bloco NUNCA
  // persiste um learning path real, sempre cai no fallback "modo
  // compatibilidade". Corrigir isto é uma decisão de produto (que campos
  // reais mapear, ou se este módulo deve passar a usar directamente o
  // LearningPath real) e fica fora do âmbito de uma limpeza de `any` — os
  // tipos aqui ficam propositadamente pouco fiáveis para não mascarar o
  // problema com uma falsa sensação de segurança de tipos.
  // ══════════════════════════════════════════════════════

  async createLearningPath(dto: CreateLearningPathDto, createdById: number) {
    const path = await safeModel(this.prisma, 'learningPath')
      .create({
        data: {
          title: dto.title,
          description: dto.description,
          thumbnailUrl: dto.thumbnailUrl,
          hasCertification: dto.hasCertification ?? false,
          xpReward: dto.xpReward ?? 100,
          createdById,
          items: {
            create: dto.items.map((item, i) => ({
              contentId: item.contentId,
              order: item.order ?? i,
              mandatory: item.mandatory ?? true,
            })),
          },
        },
      })
      .catch(e => {
        this.logger.warn({
          createdById,
          action: 'createLearningPath',
          err: { message: e instanceof Error ? e.message : String(e) },
          msg: 'Falha ao criar learning path — modelo learningPath pode estar ausente',
        });
        return { ...dto, id: null, message: 'Learning path criada (modo compatibilidade)' };
      });

    return path;
  }

  async getLearningPaths(filters: ContentLibraryLearningPathFilterDto = {}) {
    const { page = 1, limit = 20, search } = filters;
    const { skip, take } = calculatePagination(page, limit);
    // Record<string, unknown> em vez de `any` — learningPath não existe em
    // prisma/schema.prisma (ver nota estrutural acima), por isso não há
    // Prisma.LearningPathWhereInput real a que amarrar este filtro.
    const where: Record<string, unknown> = {};
    if (search) where.title = { contains: search, mode: 'insensitive' };

    const data = await (
      safeModel(this.prisma, 'learningPath').findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
      }) as Promise<Record<string, unknown>[]>
    ).catch(e => {
      this.logger.warn({
        action: 'getLearningPaths.findMany',
        err: { message: e instanceof Error ? e.message : String(e) },
        msg: 'Falha ao obter learning paths — modelo learningPath pode estar ausente',
      });
      return [];
    });

    const total = await (
      safeModel(this.prisma, 'learningPath').count({ where }) as Promise<number>
    ).catch(e => {
      this.logger.warn({
        action: 'getLearningPaths.count',
        err: { message: e instanceof Error ? e.message : String(e) },
        msg: 'Falha ao contar learning paths — modelo learningPath pode estar ausente',
      });
      return 0;
    });
    return buildPaginatedResponse(data, total, page, limit);
  }

  async getLearningPath(id: number, userId?: number) {
    const path: { items?: LearningPathItemRow[]; [key: string]: unknown } | null = await (
      safeModel(this.prisma, 'learningPath').findUnique({
        where: { id },
        include: {
          items: {
            orderBy: { order: 'asc' },
            include: { content: true },
          },
        },
      }) as Promise<{ items?: LearningPathItemRow[]; [key: string]: unknown } | null>
    ).catch(e => {
      this.logger.warn({
        learningPathId: id,
        action: 'getLearningPath.findUnique',
        err: { message: e instanceof Error ? e.message : String(e) },
        msg: 'Falha ao obter learning path — modelo learningPath pode estar ausente',
      });
      return null;
    });

    if (!path) throw new NotFoundException('Learning Path não encontrada');

    if (!userId) return path;

    // Enrich items with user progress
    const contentIds = (path.items ?? []).map(i => i.contentId);
    const progs: ContentProgressRow[] = await (
      safeModel(this.prisma, 'contentProgress').findMany({
        where: { userId, contentId: { in: contentIds } },
      }) as Promise<ContentProgressRow[]>
    ).catch(e => {
      this.logger.warn({
        userId,
        learningPathId: id,
        action: 'getLearningPath.progress',
        err: { message: e instanceof Error ? e.message : String(e) },
        msg: 'Falha ao obter progresso da learning path — modelo contentProgress pode estar ausente',
      });
      return [];
    });
    const pMap = new Map(progs.map(p => [p.contentId, p]));

    const enrichedItems = (path.items ?? []).map(item => ({
      ...item,
      progress: pMap.get(item.contentId)?.progress ?? 0,
      completed: pMap.get(item.contentId)?.progress === 100,
    }));

    const totalItems = enrichedItems.length;
    const completedItems = enrichedItems.filter(i => i.completed).length;
    const overallPct = totalItems > 0 ? Math.round((completedItems / totalItems) * 100) : 0;

    return {
      ...path,
      items: enrichedItems,
      overallProgress: overallPct,
      completedItems,
      totalItems,
    };
  }

  async enrollLearningPath(pathId: number, userId: number) {
    await safeModel(this.prisma, 'learningPathEnrollment')
      .upsert({
        where: { userId_pathId: { userId, pathId } },
        create: { userId, pathId, enrolledAt: new Date() },
        update: { resumedAt: new Date() },
      })
      .catch(e => {
        this.logger.warn({
          userId,
          pathId,
          action: 'enrollLearningPath',
          err: { message: e instanceof Error ? e.message : String(e) },
          msg: 'Falha ao inscrever utilizador na learning path — modelo learningPathEnrollment pode estar ausente',
        });
        return null;
      });

    return { message: 'Inscrito com sucesso na learning path', pathId, userId };
  }

  // ══════════════════════════════════════════════════════
  // ANALYTICS
  // ══════════════════════════════════════════════════════

  async getAnalyticsDashboard(departmentId?: number) {
    // NOTA: userWhere é construído mas nunca aplicado a nenhuma query abaixo
    // — o filtro por departamento neste dashboard é, e sempre foi, um no-op
    // (achado pré-existente, não introduzido por esta limpeza de tipos;
    // corrigi-lo implica decidir como relacionar ContentAsset/AuditLog com
    // departamento, fora do âmbito desta limpeza).
    const userWhere: Prisma.UserWhereInput = { active: true };
    if (departmentId) userWhere.departmentId = departmentId;

    const [
      totalContent,
      activeContent,
      totalViews,
      totalCompletions,
      mostViewed,
      mostCompleted,
      formatBreakdown,
      recentlyAdded,
    ] = await Promise.all([
      this.prisma.read.contentAsset.count(),
      this.prisma.read.contentAsset.count({ where: { active: true } }),
      this.prisma.read.auditLog.count({
        where: { action: 'CONTENT_VIEW', entity: 'ContentAsset' },
      }),
      safeModel(this.prisma, 'contentProgress')
        .count({ where: { progress: 100 } })
        .catch(e => {
          this.logger.warn({
            action: 'getAnalyticsDashboard.totalCompletions',
            err: { message: e instanceof Error ? e.message : String(e) },
            msg: 'Falha ao contar conclusões de conteúdo — modelo contentProgress pode estar ausente',
          });
          return 0;
        }),
      // Most viewed (last 30 days)
      this.prisma.auditLog
        .groupBy({
          by: ['entityId'],
          where: {
            action: 'CONTENT_VIEW',
            entity: 'ContentAsset',
            timestamp: { gte: new Date(Date.now() - 30 * 86400000) },
          },
          _count: { id: true },
          orderBy: { _count: { id: 'desc' } },
          take: 5,
        })
        .catch(e => {
          this.logger.warn({
            action: 'getAnalyticsDashboard.mostViewed',
            err: { message: e instanceof Error ? e.message : String(e) },
            msg: 'Falha ao calcular conteúdos mais vistos',
          });
          return [] as { entityId: number | null; _count: { id: number } }[];
        }),
      // Most completed
      (
        safeModel(this.prisma, 'contentProgress').groupBy({
          by: ['contentId'],
          where: { progress: 100 },
          _count: { id: true },
          orderBy: { _count: { id: 'desc' } },
          take: 5,
        }) as Promise<{ contentId: number; _count: { id: number } }[]>
      ).catch(e => {
        this.logger.warn({
          action: 'getAnalyticsDashboard.mostCompleted',
          err: { message: e instanceof Error ? e.message : String(e) },
          msg: 'Falha ao calcular conteúdos mais concluídos — modelo contentProgress pode estar ausente',
        });
        return [] as { contentId: number; _count: { id: number } }[];
      }),
      // By format
      this.prisma.contentAsset
        .groupBy({
          by: ['type'],
          where: { active: true },
          _count: { id: true },
        })
        .catch(e => {
          this.logger.warn({
            action: 'getAnalyticsDashboard.formatBreakdown',
            err: { message: e instanceof Error ? e.message : String(e) },
            msg: 'Falha ao calcular distribuição de conteúdos por formato',
          });
          return [] as { type: ContentFormat; _count: { id: number } }[];
        }),
      this.prisma.read.contentAsset.findMany({
        where: { active: true },
        orderBy: { createdAt: 'desc' },
        take: 6,
        select: { id: true, title: true, type: true, createdAt: true },
      }),
    ]);

    // Enrich most viewed with titles
    const mvIds = mostViewed.map(v => v.entityId).filter((id): id is number => id !== null);
    const mcIds = mostCompleted.map(v => v.contentId).filter(Boolean);
    const allIds = [...new Set([...mvIds, ...mcIds])];

    const contents = allIds.length
      ? await this.prisma.read.contentAsset.findMany({
          where: { id: { in: allIds } },
          select: { id: true, title: true, type: true },
        })
      : [];
    const cMap = new Map(contents.map(c => [c.id, c]));

    return {
      kpis: {
        totalContent,
        activeContent,
        totalViews,
        totalCompletions,
      },
      mostViewed: mostViewed
        .map(v => ({
          content: v.entityId === null ? undefined : cMap.get(v.entityId),
          weeklyViews: v._count.id,
        }))
        .filter(v => v.content),
      mostCompleted: mostCompleted
        .map(v => ({
          content: cMap.get(v.contentId),
          completions: v._count.id,
        }))
        .filter(v => v.content),
      formatBreakdown: formatBreakdown.map(f => ({
        format: f.type,
        count: f._count.id,
      })),
      recentlyAdded,
    };
  }

  async getUserAnalytics(userId: number) {
    const [viewCount, completions, bookmarkCount, totalTimeSpent] = await Promise.all([
      this.prisma.read.auditLog.count({
        where: { userId, action: 'CONTENT_VIEW', entity: 'ContentAsset' },
      }),
      (
        safeModel(this.prisma, 'contentProgress').count({
          where: { userId, progress: 100 },
        }) as Promise<number>
      ).catch(e => {
        this.logger.warn({
          userId,
          action: 'getUserAnalytics.completions',
          err: { message: e instanceof Error ? e.message : String(e) },
          msg: 'Falha ao contar conclusões do utilizador — modelo contentProgress pode estar ausente',
        });
        return 0;
      }),
      this.prisma.read.auditLog.count({
        where: { userId, action: 'CONTENT_BOOKMARK', entity: 'ContentAsset' },
      }),
      (
        safeModel(this.prisma, 'contentProgress').findMany({
          where: { userId },
          select: { timeSpent: true },
        }) as Promise<Pick<ContentProgressRow, 'timeSpent'>[]>
      )
        .then(ps => ps.reduce((s, p) => s + (p.timeSpent ?? 0), 0))
        .catch(e => {
          this.logger.warn({
            userId,
            action: 'getUserAnalytics.totalTimeSpent',
            err: { message: e instanceof Error ? e.message : String(e) },
            msg: 'Falha ao calcular tempo total gasto pelo utilizador — modelo contentProgress pode estar ausente',
          });
          return 0;
        }),
    ]);

    const totalHours = Math.round(totalTimeSpent / 3600);

    return {
      userId,
      viewCount,
      completions,
      bookmarkCount,
      totalTimeSpentSeconds: totalTimeSpent,
      totalHours,
      level: completions >= 20 ? 'EXPERT' : completions >= 10 ? 'INTERMEDIATE' : 'BEGINNER',
    };
  }

  // ══════════════════════════════════════════════════════
  // CATEGORIES & TAGS (Discovery)
  // ══════════════════════════════════════════════════════

  async getCategoryBreakdown() {
    return this.prisma.contentAsset
      .groupBy({
        by: ['type'],
        where: { active: true },
        _count: { id: true },
      })
      .then(groups => groups.map(g => ({ format: g.type, count: g._count.id })));
  }

  async getAllTags() {
    // NOTA: `contents` é obtido mas nunca usado — a função devolve sempre
    // {tags: []}. ContentAsset.tags existe de facto no schema (String[]
    // @default([])), ao contrário do que o comentário original assumia;
    // achado pré-existente, não corrigido aqui (extrair tags distintas é
    // uma mudança de comportamento, fora do âmbito desta limpeza de tipos).
    await this.prisma.contentAsset
      .findMany({
        where: { active: true },
        select: { id: true },
      })
      .catch(e => {
        this.logger.warn({
          action: 'getAllTags',
          err: { message: e instanceof Error ? e.message : String(e) },
          msg: 'Falha ao obter conteúdos para extrair tags',
        });
        return [] as { id: number }[];
      });

    return { tags: [] as string[] };
  }
}
