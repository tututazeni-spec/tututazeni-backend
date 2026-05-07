// src/search/search.dto.ts
import {
  IsString, IsOptional, IsEnum, IsInt, IsArray,
  IsBoolean, Min, MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

// ─── Enums ────────────────────────────────────────────────────────

export enum SearchEntityType {
  USER        = 'user',
  COURSE      = 'course',
  DOCUMENT    = 'document',
  CONTENT     = 'content',
  PDI         = 'pdi',
  EVALUATION  = 'evaluation',
  COMPETENCY  = 'competency',
  SCENARIO    = 'scenario',
}

export enum SearchSortBy {
  RELEVANCE  = 'relevance',
  RECENCY    = 'recency',
  POPULARITY = 'popularity',
  NAME       = 'name',
}

// ─── Search DTOs ──────────────────────────────────────────────────

export class GlobalSearchDto {
  @ApiProperty({ description: 'Termo de pesquisa' })
  @IsString()
  @MaxLength(200)
  q!: string;

  @ApiPropertyOptional({ enum: SearchEntityType, isArray: true, description: 'Filtrar por tipo(s) de entidade' })
  @IsOptional()
  @IsArray()
  types?: SearchEntityType[];

  @ApiPropertyOptional({ enum: SearchSortBy, default: SearchSortBy.RELEVANCE })
  @IsOptional()
  @IsEnum(SearchSortBy)
  sort?: SearchSortBy;

  @ApiPropertyOptional() @IsOptional() @IsInt() @Type(() => Number) departmentId?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() category?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() @Type(() => Boolean) activeOnly?: boolean;

  @ApiPropertyOptional({ default: 5 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  limit?: number;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  page?: number;
}

export class TypedSearchDto {
  @ApiProperty() @IsString() @MaxLength(200) q!: string;
  @ApiPropertyOptional({ default: 1 })  @IsOptional() @IsInt() @Min(1) @Type(() => Number) page?: number;
  @ApiPropertyOptional({ default: 20 }) @IsOptional() @IsInt() @Min(1) @Type(() => Number) limit?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Type(() => Number) departmentId?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() category?: string;
  @ApiPropertyOptional({ enum: SearchSortBy }) @IsOptional() @IsEnum(SearchSortBy) sort?: SearchSortBy;
}

export class AutocompleteDto {
  @ApiProperty() @IsString() @MaxLength(100) q!: string;
  @ApiPropertyOptional({ default: 5 }) @IsOptional() @IsInt() @Min(1) @Type(() => Number) limit?: number;
}
