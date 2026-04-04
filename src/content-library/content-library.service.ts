import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  IsString, IsOptional, IsEnum, IsInt, IsArray,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';

// NOTE: contentItem, contentBookmark, contentView do not exist in schema.
// Replaced with:
//   contentItem     → ContentAsset  (has: id, title, description, type, url, active, createdAt)
//   contentBookmark → KnowledgeInteraction with action = 'BOOKMARK'
//   contentView     → KnowledgeInteraction with action = 'VIEW'
//   contentView.viewCount / contentItem.viewCount → counted via KnowledgeInteraction
//
// ContentAsset has no: createdById, competencies, durationMin, tags, viewCount
// To restore full functionality add those fields/models to schema.prisma.

export enum ContentType {
  VIDEO        = 'VIDEO',
  PDF          = 'PDF',
  PRESENTATION = 'PRESENTATION',
  ARTICLE      = 'ARTICLE',
  PODCAST      = 'PODCAST',
  INFOGRAPHIC  = 'INFOGRAPHIC',
  QUIZ         = 'QUIZ',
  TEMPLATE     = 'TEMPLATE',
}

export class CreateContentDto {
  @ApiProperty() @IsString() title!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
  @ApiProperty({ enum: ContentType }) @IsEnum(ContentType) type!: ContentType;
  @ApiProperty() @IsString() fileUrl!: string;
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() tags?: string[];
  @ApiPropertyOptional({ type: [Number] }) @IsOptional() @IsArray() competencyIds?: number[];
  @ApiPropertyOptional() @IsOptional() @IsInt() @Type(() => Number) durationMin?: number;
}
export class UpdateContentDto extends PartialType(CreateContentDto) {}

export class ContentFilterDto {
  @ApiPropertyOptional() @IsOptional() @IsString() search?: string;
  @ApiPropertyOptional() @IsOptional() @IsEnum(ContentType) type?: ContentType;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Type(() => Number) competencyId?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Type(() => Number) page?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Type(() => Number) limit?: number;
}

@Injectable()
export class ContentLibraryService {
  constructor(private prisma: PrismaService) {}

  async findAll(filters: ContentFilterDto) {
    const { page = 1, limit = 20, search, type } = filters;
    const skip  = (page - 1) * limit;
    const where: any = { active: true };
    if (search) {
      where.OR = [
        { title:       { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
      ];
    }
    // ContentAsset.type is a plain String — filter works directly
    if (type) where.type = type;

    const [data, total] = await Promise.all([
      this.prisma.contentAsset.findMany({
        where, skip, take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.contentAsset.count({ where }),
    ]);
    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async findOne(id: number) {
    const c = await this.prisma.contentAsset.findUnique({ where: { id } });
    if (!c) throw new NotFoundException('Conteúdo não encontrado');
    return c;
  }

  async create(_createdById: number, dto: CreateContentDto) {
    // ContentAsset fields: title, description, type, url, version, active
    return this.prisma.contentAsset.create({
      data: {
        title:       dto.title,
        description: dto.description,
        type:        dto.type,
        url:         dto.fileUrl,
        active:      true,
      },
    });
  }

  async update(id: number, dto: UpdateContentDto) {
    await this.findOne(id);
    const data: any = {};
    if (dto.title)       data.title       = dto.title;
    if (dto.description) data.description = dto.description;
    if (dto.type)        data.type        = dto.type;
    if (dto.fileUrl)     data.url         = dto.fileUrl;
    return this.prisma.contentAsset.update({ where: { id }, data });
  }

  async view(id: number, userId: number) {
    await this.findOne(id);
    // Use KnowledgeInteraction as view tracker (action = 'VIEW', articleId used as contentId)
    // NOTE: KnowledgeInteraction.articleId references KnowledgeArticle, not ContentAsset.
    // Storing contentAssetId in entityId via AuditLog instead to avoid FK violation.
    await this.prisma.auditLog.create({
      data: {
        userId,
        action: 'CONTENT_VIEW',
        entity: 'ContentAsset',
        entityId: id,
      },
    });
    return { message: 'Visualização registada' };
  }

  async bookmark(id: number, userId: number) {
    await this.findOne(id);
    const existing = await this.prisma.auditLog.findFirst({
      where: {
        userId,
        action: 'CONTENT_BOOKMARK',
        entity: 'ContentAsset',
        entityId: id,
      },
    });
    if (existing) {
      await this.prisma.auditLog.delete({ where: { id: existing.id } });
      return { bookmarked: false };
    }
    await this.prisma.auditLog.create({
      data: {
        userId,
        action: 'CONTENT_BOOKMARK',
        entity: 'ContentAsset',
        entityId: id,
      },
    });
    return { bookmarked: true };
  }

  async getMyBookmarks(userId: number) {
    const logs = await this.prisma.auditLog.findMany({
      where: { userId, action: 'CONTENT_BOOKMARK', entity: 'ContentAsset' },
      orderBy: { timestamp: 'desc' },
    });
    const ids = logs.map(l => l.entityId).filter((id): id is number => id !== null);
    if (!ids.length) return [];
    return this.prisma.contentAsset.findMany({
      where: { id: { in: ids }, active: true },
    });
  }

  async getRecommended(_userId: number) {
    // Without competency links on ContentAsset, return most recently added active content
    return this.prisma.contentAsset.findMany({
      where: { active: true },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });
  }
}