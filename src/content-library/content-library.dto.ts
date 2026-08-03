// src/content-library/content-library.dto.ts
import {
  IsString,
  IsOptional,
  IsEnum,
  IsInt,
  IsArray,
  IsBoolean,
  Min,
  Max,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ContentFormat,
  ContentAssetStatus as ContentStatus,
  ContentAssetLevel as ContentLevel,
  ContentCategory,
} from '@prisma/client';

// ─── Enums ────────────────────────────────────────────────────────
// NOTA: ContentStatus/ContentLevel aqui são `ContentAssetStatus`/
// `ContentAssetLevel` do Prisma — nomes locais mantidos por compatibilidade,
// distintos do `ContentStatus`/`ContentLevel` (MicroLearning, lote 5).

export { ContentFormat, ContentStatus, ContentLevel, ContentCategory };

// ─── Content DTOs ─────────────────────────────────────────────────

export class CreateContentDto {
  @ApiProperty() @IsString() @MaxLength(300) title!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
  @ApiProperty({ enum: ContentFormat }) @IsEnum(ContentFormat) format!: ContentFormat;
  @ApiPropertyOptional({ enum: ContentCategory })
  @IsOptional()
  @IsEnum(ContentCategory)
  category?: ContentCategory;
  @ApiProperty() @IsString() url!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() thumbnailUrl?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() author?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() language?: string;
  @ApiPropertyOptional({ enum: ContentLevel })
  @IsOptional()
  @IsEnum(ContentLevel)
  level?: ContentLevel;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) durationMin?: number;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() mandatory?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isMicrolearning?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsArray() @IsString({ each: true }) tags?: string[];
  @ApiPropertyOptional() @IsOptional() @IsArray() @IsInt({ each: true }) skillIds?: number[];
  @ApiPropertyOptional()
  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  targetPositionIds?: number[];
  @ApiPropertyOptional() @IsOptional() @IsArray() @IsInt({ each: true }) targetDeptIds?: number[];
  @ApiPropertyOptional() @IsOptional() @IsBoolean() hasCertification?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsString() externalSource?: string;
}

export class UpdateContentDto extends PartialType(CreateContentDto) {
  @ApiPropertyOptional({ enum: ContentStatus })
  @IsOptional()
  @IsEnum(ContentStatus)
  status?: ContentStatus;
}

export class ContentFilterDto {
  @ApiPropertyOptional() @IsOptional() @IsString() search?: string;
  @ApiPropertyOptional({ enum: ContentFormat })
  @IsOptional()
  @IsEnum(ContentFormat)
  format?: ContentFormat;
  @ApiPropertyOptional({ enum: ContentCategory })
  @IsOptional()
  @IsEnum(ContentCategory)
  category?: ContentCategory;
  @ApiPropertyOptional({ enum: ContentLevel })
  @IsOptional()
  @IsEnum(ContentLevel)
  level?: ContentLevel;
  @ApiPropertyOptional() @IsOptional() @IsString() language?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() @Type(() => Boolean) mandatory?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() @Type(() => Boolean) hasCertification?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() @Type(() => Boolean) isMicrolearning?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Type(() => Number) maxDuration?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() tag?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() sortBy?:
    'popular' | 'newest' | 'rating' | 'duration';
  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  page?: number;
  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  @Type(() => Number)
  limit?: number;
}

// ─── Progress DTOs ────────────────────────────────────────────────

export class UpdateProgressDto {
  @ApiProperty({ minimum: 0, maximum: 100 }) @IsInt() @Min(0) @Max(100) progress!: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) timeSpentSeconds?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() lastPosition?: string;
}

// ─── Rating DTOs ──────────────────────────────────────────────────

export class RateContentDto {
  @ApiProperty({ minimum: 1, maximum: 5 }) @IsInt() @Min(1) @Max(5) rating!: number;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(1000) comment?: string;
}

// ─── Learning Path DTOs ───────────────────────────────────────────

export class LearningPathItemDto {
  @ApiProperty() @IsInt() contentId!: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) order?: number;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() mandatory?: boolean;
}

export class CreateLearningPathDto {
  @ApiProperty() @IsString() @MaxLength(200) title!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() thumbnailUrl?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() hasCertification?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) xpReward?: number;
  @ApiPropertyOptional()
  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  targetPositionIds?: number[];
  @ApiProperty({ type: [LearningPathItemDto] }) @IsArray() items!: LearningPathItemDto[];
}

export class ContentLibraryLearningPathFilterDto {
  @ApiPropertyOptional() @IsOptional() @IsString() search?: string;
  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  page?: number;
  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  limit?: number;
}

// ─── Note DTOs ────────────────────────────────────────────────────

export class SaveNoteDto {
  @ApiProperty() @IsString() @MaxLength(5000) note!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() timestamp?: string;
}
