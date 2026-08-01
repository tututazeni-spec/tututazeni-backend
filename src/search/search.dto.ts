// src/search/search.dto.ts
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
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type, Transform } from 'class-transformer';

// ─── Enums ────────────────────────────────────────────────────────

export enum SearchEntityType {
  USER = 'user',
  COURSE = 'course',
  DOCUMENT = 'document',
  CONTENT = 'content',
  PDI = 'pdi',
  EVALUATION = 'evaluation',
  COMPETENCY = 'competency',
  SCENARIO = 'scenario',
}

export enum SearchSortBy {
  RELEVANCE = 'relevance',
  RECENCY = 'recency',
  POPULARITY = 'popularity',
  NAME = 'name',
}

// ─── Search DTOs ──────────────────────────────────────────────────

export class GlobalSearchDto {
  @ApiProperty({ description: 'Termo de pesquisa' })
  @IsString()
  @MaxLength(200)
  q!: string;

  @ApiPropertyOptional({
    enum: SearchEntityType,
    isArray: true,
    description: 'Filtrar por tipo(s) de entidade',
  })
  @IsOptional()
  // Express/qs entrega um único ?types=course como string simples, não um
  // array de 1 elemento — sem esta normalização, @IsArray() rejeitava
  // sempre (400) qualquer pedido a filtrar por um único tipo de entidade.
  @Transform(({ value }) => (value === undefined ? value : Array.isArray(value) ? value : [value]))
  @IsArray()
  @IsEnum(SearchEntityType, { each: true })
  types?: SearchEntityType[];

  @ApiPropertyOptional({ enum: SearchSortBy, default: SearchSortBy.RELEVANCE })
  @IsOptional()
  @IsEnum(SearchSortBy)
  sort?: SearchSortBy;

  @ApiPropertyOptional() @IsOptional() @IsInt() @Type(() => Number) departmentId?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() category?: string;
  // @Type(() => Boolean) coage '?activeOnly=false' para true — ver
  // [[project-innova-boolean-query-filter-coercion]]. @Type(() => String)
  // salta a coerção Boolean e deixa o @Transform decidir a partir da string.
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => String)
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  activeOnly?: boolean;

  @ApiPropertyOptional({ default: 5 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
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
  @ApiPropertyOptional() @IsOptional() @IsInt() @Type(() => Number) departmentId?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() category?: string;
  @ApiPropertyOptional({ enum: SearchSortBy })
  @IsOptional()
  @IsEnum(SearchSortBy)
  sort?: SearchSortBy;
}

export class AutocompleteDto {
  @ApiProperty() @IsString() @MaxLength(100) q!: string;
  @ApiPropertyOptional({ default: 5 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  @Type(() => Number)
  limit?: number;
}
