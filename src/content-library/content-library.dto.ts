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
import { Type, Transform } from 'class-transformer';
import {
  ContentFormat,
  ContentAssetStatus as ContentStatus,
  ContentAssetLevel as ContentLevel,
  ContentCategory,
} from '@prisma/client';
import { BaseFilterDto } from '../common/dtos/pagination.dto';

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

export class ContentFilterDto extends BaseFilterDto {
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
  // Os 3 campos abaixo: @Type(() => Boolean) coage '?campo=false' para true —
  // ver [[project-innova-boolean-query-filter-coercion]]. @Type(() => String)
  // + @Transform evita a coerção Boolean automática do class-transformer.
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => String)
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  mandatory?: boolean;
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => String)
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  hasCertification?: boolean;
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => String)
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  isMicrolearning?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Type(() => Number) maxDuration?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() tag?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() sortBy?:
    'popular' | 'newest' | 'rating' | 'duration';
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

// Learning Path DTOs removidos na Fase F1 — o dono é o módulo `learning-paths`
// (`LearningPathsCreateLearningPathDto` / `LearningPathFilterDto`).

// ─── Note DTOs ────────────────────────────────────────────────────

export class SaveNoteDto {
  @ApiProperty() @IsString() @MaxLength(5000) note!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() timestamp?: string;
}
