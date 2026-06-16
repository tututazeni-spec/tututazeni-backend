import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateCollectionDto,
  CreateItemDto,
  UpdateItemDto,
  FilterItemDto,
  CreateRatingDto,
  CreateCommentDto,
} from './dto';

@Injectable()
export class LibraryService {
  constructor(private prisma: PrismaService) {}

  // ─── CÓDIGO AUTO-GERADO ──────────────────────────────

  private async generateCode(): Promise<string> {
    const last = await this.prisma.libraryItem.findFirst({
      orderBy: { code: 'desc' },
      select: { code: true },
    });
    const num = last ? parseInt(last.code.replace('LIB-', ''), 10) + 1 : 1;
    return `LIB-${String(num).padStart(5, '0')}`;
  }

  // ─── COLECÇÕES ───────────────────────────────────────

  async createCollection(dto: CreateCollectionDto, userId: number) {
    const collection = await this.prisma.libraryCollection.create({
      data: { ...dto, createdById: userId },
    });
    await this.audit(userId, 'CREATE', 'LibraryCollection', collection.id, dto);
    return collection;
  }

  async findAllCollections() {
    return this.prisma.libraryCollection.findMany({
      where: { deletedAt: null },
      orderBy: { order: 'asc' },
      include: {
        _count: { select: { items: true } },
      },
    });
  }

  // ─── ITENS — CRUD ────────────────────────────────────

  async createItem(dto: CreateItemDto, userId: number) {
    const code = await this.generateCode();
    const { expiresAt, ...rest } = dto;
    const item = await this.prisma.libraryItem.create({
      data: {
        ...rest,
        ...(expiresAt && { expiresAt: new Date(expiresAt) }),
        code,
        uploadedById: userId,
      },
      include: {
        collection: { select: { name: true } },
        uploadedBy: { select: { fullName: true } },
      },
    });
    await this.audit(userId, 'CREATE', 'LibraryItem', item.id, {
      code,
      type: dto.type,
    });
    return item;
  }

  async findAllItems(filters: FilterItemDto) {
    const {
      type,
      collectionId,
      category,
      search,
      isApproved,
      page = 1,
      limit = 20,
    } = filters;
    const where: any = {
      deletedAt: null,
      ...(type && { type }),
      ...(collectionId && { collectionId }),
      ...(category && { categories: { has: category } }),
      ...(isApproved !== undefined && { isApproved }),
      ...(search && {
        OR: [
          { title: { contains: search, mode: 'insensitive' } },
          { author: { contains: search, mode: 'insensitive' } },
          { code: { contains: search, mode: 'insensitive' } },
          { keywords: { has: search } },
        ],
      }),
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.libraryItem.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          collection: { select: { name: true } },
          uploadedBy: { select: { fullName: true } },
          _count: { select: { comments: true, ratings: true } },
        },
      }),
      this.prisma.libraryItem.count({ where }),
    ]);
    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async findItemById(id: string) {
    const item = await this.prisma.libraryItem.findUnique({
      where: { id },
      include: {
        collection: { select: { name: true } },
        uploadedBy: { select: { fullName: true } },
        reviewedBy: { select: { fullName: true } },
        comments: {
          where: { deletedAt: null, parentId: null },
          orderBy: { createdAt: 'desc' },
          include: { user: { select: { fullName: true } } },
        },
        ratings: {
          orderBy: { createdAt: 'desc' },
          take: 10,
          include: { user: { select: { fullName: true } } },
        },
        _count: { select: { comments: true, ratings: true } },
      },
    });
    if (!item || item.deletedAt)
      throw new NotFoundException('Item não encontrado');
    return item;
  }

  async updateItem(id: string, dto: UpdateItemDto, userId: number) {
    await this.findItemById(id);
    const { expiresAt, ...rest } = dto;
    const updated = await this.prisma.libraryItem.update({
      where: { id },
      data: {
        ...rest,
        ...(expiresAt && { expiresAt: new Date(expiresAt) }),
      },
    });
    await this.audit(userId, 'UPDATE', 'LibraryItem', id, dto);
    return updated;
  }

  async softDeleteItem(id: string, userId: number) {
    await this.findItemById(id);
    await this.prisma.libraryItem.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
    await this.audit(userId, 'DELETE', 'LibraryItem', id, {
      deletedAt: new Date(),
    });
    return { message: 'Item removido com sucesso' };
  }

  // ─── APROVAÇÃO ───────────────────────────────────────

  async approveItem(id: string, userId: number) {
    await this.findItemById(id);
    const updated = await this.prisma.libraryItem.update({
      where: { id },
      data: { isApproved: true, approvedAt: new Date(), reviewedById: userId },
    });
    await this.audit(userId, 'UPDATE', 'LibraryItem', id, { isApproved: true });
    return updated;
  }

  // ─── VISUALIZAÇÃO E DOWNLOAD (TRACKING) ──────────────

  async view(id: string, userId: number, ipAddress?: string, userAgent?: string) {
    const item = await this.findItemById(id);
    await this.prisma.$transaction([
      this.prisma.libraryItem.update({
        where: { id },
        data: { views: { increment: 1 } },
      }),
      this.prisma.libraryAccess.create({
        data: { itemId: id, userId, action: 'VIEW', ipAddress, userAgent },
      }),
    ]);
    return item;
  }

  async download(id: string, userId: number, ipAddress?: string) {
    const item = await this.findItemById(id);
    await this.prisma.$transaction([
      this.prisma.libraryItem.update({
        where: { id },
        data: { downloads: { increment: 1 } },
      }),
      this.prisma.libraryAccess.create({
        data: { itemId: id, userId, action: 'DOWNLOAD', ipAddress },
      }),
    ]);
    await this.audit(userId, 'DOWNLOAD', 'LibraryItem', id, { code: item.code });
    return { fileUrl: item.fileUrl, fileName: item.title };
  }

  // ─── AVALIAÇÕES ──────────────────────────────────────

  async rateItem(itemId: string, dto: CreateRatingDto, userId: number) {
    await this.findItemById(itemId);

    const rating = await this.prisma.libraryRating.upsert({
      where: { itemId_userId: { itemId, userId } },
      update: { score: dto.score, comment: dto.comment },
      create: { itemId, userId, score: dto.score, comment: dto.comment },
    });

    // Recalcula média de avaliações
    const ratings = await this.prisma.libraryRating.findMany({
      where: { itemId },
      select: { score: true },
    });
    const avg = ratings.reduce((s, r) => s + r.score, 0) / ratings.length;

    await this.prisma.libraryItem.update({
      where: { id: itemId },
      data: { rating: avg, ratingCount: ratings.length },
    });
    return rating;
  }

  // ─── COMENTÁRIOS ─────────────────────────────────────

  async addComment(itemId: string, dto: CreateCommentDto, userId: number) {
    await this.findItemById(itemId);
    const comment = await this.prisma.libraryComment.create({
      data: { ...dto, itemId, userId },
      include: { user: { select: { fullName: true } } },
    });
    return comment;
  }

  async deleteComment(commentId: string, userId: number) {
    const comment = await this.prisma.libraryComment.findUnique({
      where: { id: commentId },
    });
    if (!comment) throw new NotFoundException('Comentário não encontrado');
    await this.prisma.libraryComment.update({
      where: { id: commentId },
      data: { deletedAt: new Date() },
    });
    await this.audit(userId, 'DELETE', 'LibraryComment', commentId, {});
    return { message: 'Comentário removido' };
  }

  // ─── DASHBOARD E ESTATÍSTICAS ────────────────────────

  async getDashboard() {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const [
      totalItems,
      newThisMonth,
      totalCollections,
      byType,
      pendingApproval,
      mostViewed,
      mostDownloaded,
      topRated,
      totalViews,
      totalDownloads,
    ] = await this.prisma.$transaction([
      this.prisma.libraryItem.count({ where: { deletedAt: null } }),
      this.prisma.libraryItem.count({
        where: { createdAt: { gte: startOfMonth } },
      }),
      this.prisma.libraryCollection.count({ where: { deletedAt: null } }),
      (this.prisma.libraryItem.groupBy as any)({
        by: ['type'],
        where: { deletedAt: null },
        _count: { id: true },
      }),
      this.prisma.libraryItem.count({
        where: { isApproved: false, deletedAt: null },
      }),
      this.prisma.libraryItem.findMany({
        where: { deletedAt: null },
        orderBy: { views: 'desc' },
        take: 5,
        select: { id: true, code: true, title: true, views: true, type: true },
      }),
      this.prisma.libraryItem.findMany({
        where: { deletedAt: null },
        orderBy: { downloads: 'desc' },
        take: 5,
        select: {
          id: true,
          code: true,
          title: true,
          downloads: true,
          type: true,
        },
      }),
      this.prisma.libraryItem.findMany({
        where: { deletedAt: null, ratingCount: { gt: 0 } },
        orderBy: { rating: 'desc' },
        take: 5,
        select: {
          id: true,
          code: true,
          title: true,
          rating: true,
          ratingCount: true,
        },
      }),
      this.prisma.libraryAccess.count({ where: { action: 'VIEW' } }),
      this.prisma.libraryAccess.count({ where: { action: 'DOWNLOAD' } }),
    ]);

    return {
      totals: {
        totalItems,
        newThisMonth,
        totalCollections,
        pendingApproval,
        totalViews,
        totalDownloads,
      },
      byType,
      rankings: { mostViewed, mostDownloaded, topRated },
    };
  }

  // ─── HELPER ──────────────────────────────────────────

  private async audit(
    userId: number,
    action: string,
    entity: string,
    entityId: string,
    meta: any,
  ) {
    // AuditLog.entityId é Int? no schema; os IDs da biblioteca são cuid (String),
    // por isso guardamos o id real dentro de metadata (sempre JSON.stringify).
    await this.prisma.auditLog.create({
      data: {
        userId,
        action,
        entity,
        metadata: JSON.stringify({ ...meta, entityId }),
      },
    });
  }
}
