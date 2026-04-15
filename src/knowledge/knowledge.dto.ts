import {
  IsString, IsOptional, IsInt, IsArray, IsEnum,
  IsBoolean, IsDateString, MaxLength, Min, Max,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';

// ─── Enums ────────────────────────────────────────────────────────────────────

export enum ArticleStatus {
  DRAFT     = 'DRAFT',
  IN_REVIEW = 'IN_REVIEW',
  PUBLISHED = 'PUBLISHED',
  ARCHIVED  = 'ARCHIVED',
}

export enum ArticleAccess {
  PUBLIC       = 'PUBLIC',
  DEPARTMENT   = 'DEPARTMENT',
  ROLE         = 'ROLE',
  CONFIDENTIAL = 'CONFIDENTIAL',
}

export enum InteractionAction {
  VIEW     = 'VIEW',
  LIKE     = 'LIKE',
  DISLIKE  = 'DISLIKE',
  BOOKMARK = 'BOOKMARK',
  SHARE    = 'SHARE',
}

export enum ArticleSortBy {
  RECENT     = 'RECENT',
  POPULAR    = 'POPULAR',
  RATING     = 'RATING',
  UPDATED    = 'UPDATED',
}

// ─── Category ─────────────────────────────────────────────────────────────────

export class CreateKnowledgeCategoryDto {
  @ApiProperty({ example: 'Políticas Internas' })
  @IsString() @MaxLength(120)
  name!: string;

  @ApiPropertyOptional() @IsOptional() @IsString()
  description?: string;

  @ApiPropertyOptional({ description: 'Slug URL amigável' })
  @IsOptional() @IsString()
  slug?: string;

  @ApiPropertyOptional({ description: 'Emoji ou ícone' })
  @IsOptional() @IsString()
  icon?: string;

  @ApiPropertyOptional({ description: 'Cor HEX' })
  @IsOptional() @IsString()
  color?: string;

  @ApiPropertyOptional({ description: 'Categoria pai' })
  @IsOptional() @IsInt()
  parentId?: number;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional() @IsInt() @Min(0)
  sortOrder?: number;
}

export class UpdateKnowledgeCategoryDto extends PartialType(CreateKnowledgeCategoryDto) {}

// ─── Article ──────────────────────────────────────────────────────────────────

export class CreateKnowledgeArticleDto {
  @ApiProperty({ example: 'Política de Férias — Angola 2026' })
  @IsString() @MaxLength(300)
  title!: string;

  @ApiPropertyOptional({ description: 'Resumo breve (máx 500 chars)' })
  @IsOptional() @IsString() @MaxLength(500)
  summary?: string;

  @ApiProperty({ description: 'Conteúdo em Markdown/HTML' })
  @IsString()
  content!: string;

  @ApiPropertyOptional() @IsOptional() @IsInt()
  categoryId?: number;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional() @IsArray() @IsString({ each: true })
  tags?: string[];

  @ApiPropertyOptional({ enum: ArticleStatus, default: ArticleStatus.DRAFT })
  @IsOptional() @IsEnum(ArticleStatus)
  status?: ArticleStatus;

  @ApiPropertyOptional({ enum: ArticleAccess, default: ArticleAccess.PUBLIC })
  @IsOptional() @IsEnum(ArticleAccess)
  accessLevel?: ArticleAccess;

  @ApiPropertyOptional({ description: 'Leitura obrigatória?' })
  @IsOptional() @IsBoolean()
  mandatory?: boolean;

  @ApiPropertyOptional({ description: 'Data de expiração/revisão' })
  @IsOptional() @IsDateString()
  expiresAt?: string;

  @ApiPropertyOptional({ description: 'Agendar publicação' })
  @IsOptional() @IsDateString()
  scheduledAt?: string;

  @ApiPropertyOptional({ description: 'ID do departamento (para ACCESS=DEPARTMENT)' })
  @IsOptional() @IsInt()
  restrictedDepartmentId?: number;
}

export class UpdateKnowledgeArticleDto extends PartialType(CreateKnowledgeArticleDto) {
  @ApiPropertyOptional({ description: 'Razão da actualização (para changelog)' })
  @IsOptional() @IsString()
  changeReason?: string;
}

// ─── Filter ───────────────────────────────────────────────────────────────────

export class KnowledgeFilterDto {
  @ApiPropertyOptional() @IsOptional() @IsString()
  search?: string;

  @ApiPropertyOptional() @IsOptional() @IsInt() @Type(() => Number)
  categoryId?: number;

  @ApiPropertyOptional() @IsOptional() @IsInt() @Type(() => Number)
  authorId?: number;

  @ApiPropertyOptional({ enum: ArticleStatus }) @IsOptional() @IsEnum(ArticleStatus)
  status?: ArticleStatus;

  @ApiPropertyOptional({ enum: ArticleAccess }) @IsOptional() @IsEnum(ArticleAccess)
  accessLevel?: ArticleAccess;

  @ApiPropertyOptional() @IsOptional() @IsString()
  tag?: string;

  @ApiPropertyOptional() @IsOptional() @IsBoolean() @Type(() => Boolean)
  mandatory?: boolean;

  @ApiPropertyOptional({ enum: ArticleSortBy, default: ArticleSortBy.RECENT })
  @IsOptional() @IsEnum(ArticleSortBy)
  sortBy?: ArticleSortBy;

  @ApiPropertyOptional({ default: 1 }) @IsOptional() @IsInt() @Min(1) @Type(() => Number)
  page?: number;

  @ApiPropertyOptional({ default: 20 }) @IsOptional() @IsInt() @Min(1) @Type(() => Number)
  limit?: number;
}

// ─── Interaction ──────────────────────────────────────────────────────────────

export class KnowledgeInteractionDto {
  @ApiProperty() @IsInt()
  articleId!: number;

  @ApiProperty({ enum: InteractionAction }) @IsEnum(InteractionAction)
  action!: InteractionAction;
}

// ─── Comentário ───────────────────────────────────────────────────────────────

export class CreateCommentDto {
  @ApiProperty() @IsInt()
  articleId!: number;

  @ApiProperty() @IsString() @MaxLength(2000)
  content!: string;

  @ApiPropertyOptional({ description: 'ID do comentário pai (resposta)' })
  @IsOptional() @IsInt()
  parentId?: number;
}

// ─── Rating ───────────────────────────────────────────────────────────────────

export class RateArticleDto {
  @ApiProperty() @IsInt()
  articleId!: number;

  @ApiProperty({ description: 'Score de utilidade 1-5' })
  @IsInt() @Min(1) @Max(5)
  score!: number;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(500)
  comment?: string;
}

// ─── Q&A ──────────────────────────────────────────────────────────────────────

export class CreateKnowledgeQuestionDto {
  @ApiProperty() @IsInt()
  articleId!: number;

  @ApiProperty() @IsString() @MaxLength(500)
  question!: string;
}

export class AnswerQuestionDto {
  @ApiProperty() @IsInt()
  questionId!: number;

  @ApiProperty() @IsString() @MaxLength(2000)
  answer!: string;
}

// ─── Acknowledgement ─────────────────────────────────────────────────────────

export class AcknowledgeArticleDto {
  @ApiProperty() @IsInt()
  articleId!: number;
}
