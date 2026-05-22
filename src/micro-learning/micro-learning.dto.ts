// src/micro-learning/micro-learning.dto.ts
import {
  IsString,
  IsOptional,
  IsInt,
  IsArray,
  IsEnum,
  IsBoolean,
  IsDateString,
  Min,
  Max,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';

// ─── Enums ────────────────────────────────────────────────────────────────────

export enum ContentType {
  VIDEO = 'VIDEO',
  TEXT = 'TEXT',
  AUDIO = 'AUDIO',
  INFOGRAPHIC = 'INFOGRAPHIC',
  QUIZ = 'QUIZ',
}

export enum ContentLevel {
  BEGINNER = 'BEGINNER',
  INTERMEDIATE = 'INTERMEDIATE',
  ADVANCED = 'ADVANCED',
}

export enum ContentStatus {
  DRAFT = 'DRAFT',
  PUBLISHED = 'PUBLISHED',
  ARCHIVED = 'ARCHIVED',
}

export enum FeedSortBy {
  RECENT = 'RECENT',
  POPULAR = 'POPULAR',
  RECOMMENDED = 'RECOMMENDED',
  DURATION = 'DURATION',
}

// ─── Quiz Question ────────────────────────────────────────────────────────────

export class MicroQuizOptionDto {
  @ApiProperty()
  @IsString()
  text!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isCorrect?: boolean;
}

export class MicroQuizQuestionDto {
  @ApiProperty()
  @IsString()
  question!: string;

  @ApiProperty({ type: [MicroQuizOptionDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MicroQuizOptionDto)
  options!: MicroQuizOptionDto[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  explanation?: string;
}

// ─── Micro-Learning Content ───────────────────────────────────────────────────

export class CreateMicroLearningDto {
  @ApiProperty({ example: 'Como dar feedback eficaz em 3 passos' })
  @IsString()
  @MaxLength(80)
  title!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  description?: string;

  @ApiProperty({ enum: ContentType })
  @IsEnum(ContentType)
  contentType!: ContentType;

  @ApiProperty({ enum: ContentLevel })
  @IsEnum(ContentLevel)
  level!: ContentLevel;

  @ApiPropertyOptional({ enum: ContentStatus, default: ContentStatus.DRAFT })
  @IsOptional()
  @IsEnum(ContentStatus)
  status?: ContentStatus;

  @ApiPropertyOptional({ description: 'Duração em segundos' })
  @IsOptional()
  @IsInt()
  @Min(10)
  durationSeconds?: number;

  @ApiPropertyOptional({ description: 'URL do vídeo/áudio/imagem' })
  @IsOptional()
  @IsString()
  mediaUrl?: string;

  @ApiPropertyOptional({ description: 'Conteúdo em texto (para tipo TEXT)' })
  @IsOptional()
  @IsString()
  textContent?: string;

  @ApiPropertyOptional({ description: 'URL de thumbnail' })
  @IsOptional()
  @IsString()
  thumbnailUrl?: string;

  @ApiPropertyOptional({ type: [String], description: 'Max 5 tags' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @ApiPropertyOptional({ description: 'ID da categoria' })
  @IsOptional()
  @IsInt()
  categoryId?: number;

  @ApiPropertyOptional({ description: 'Competências associadas (IDs)' })
  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  competencyIds?: number[];

  @ApiPropertyOptional({ description: 'Learning Path associada' })
  @IsOptional()
  @IsInt()
  learningPathId?: number;

  @ApiPropertyOptional({ description: 'XP ganho ao completar', default: 10 })
  @IsOptional()
  @IsInt()
  @Min(0)
  xpReward?: number;

  @ApiPropertyOptional({ description: 'Perguntas do quiz (se contentType=QUIZ)' })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MicroQuizQuestionDto)
  quizQuestions?: MicroQuizQuestionDto[];

  @ApiPropertyOptional({ description: 'Takeaways (3-5 pontos principais)' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  takeaways?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  scheduledAt?: string;
}

export class UpdateMicroLearningDto extends PartialType(CreateMicroLearningDto) {}

// ─── Playlist ─────────────────────────────────────────────────────────────────

export class CreatePlaylistDto {
  @ApiProperty()
  @IsString()
  @MaxLength(120)
  title!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ type: [Number] })
  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  contentIds?: number[];
}

export class UpdatePlaylistDto extends PartialType(CreatePlaylistDto) {}

// ─── Dispatch ─────────────────────────────────────────────────────────────────

export class DispatchMicroLearningDto {
  @ApiProperty()
  @IsInt()
  microLearningId!: number;

  @ApiProperty({ type: [Number] })
  @IsArray()
  @IsInt({ each: true })
  userIds!: number[];
}

// ─── Progress ─────────────────────────────────────────────────────────────────

export class UpdateProgressDto {
  @ApiProperty()
  @IsInt()
  microLearningId!: number;

  @ApiProperty({ description: 'Progresso 0-100' })
  @IsInt()
  @Min(0)
  @Max(100)
  progress!: number;

  @ApiPropertyOptional({ description: 'Tempo assistido em segundos' })
  @IsOptional()
  @IsInt()
  @Min(0)
  watchedSeconds?: number;
}

// ─── Quiz Submit ──────────────────────────────────────────────────────────────

export class SubmitQuizDto {
  @ApiProperty()
  @IsInt()
  microLearningId!: number;

  @ApiProperty({ description: 'Índices das respostas seleccionadas por questão' })
  @IsArray()
  answers!: number[];
}

// ─── Interaction ──────────────────────────────────────────────────────────────

export class InteractDto {
  @ApiProperty()
  @IsInt()
  microLearningId!: number;

  @ApiProperty({ enum: ['LIKE', 'SAVE', 'SKIP'] })
  @IsString()
  action!: 'LIKE' | 'SAVE' | 'SKIP';
}

// ─── Filters ──────────────────────────────────────────────────────────────────

export class MicroLearningFilterDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ enum: ContentType })
  @IsOptional()
  @IsEnum(ContentType)
  contentType?: ContentType;

  @ApiPropertyOptional({ enum: ContentLevel })
  @IsOptional()
  @IsEnum(ContentLevel)
  level?: ContentLevel;

  @ApiPropertyOptional({ enum: ContentStatus })
  @IsOptional()
  @IsEnum(ContentStatus)
  status?: ContentStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  tag?: string;

  @ApiPropertyOptional({ description: 'Duração máxima em segundos' })
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  maxDuration?: number;

  @ApiPropertyOptional({ enum: FeedSortBy, default: FeedSortBy.RECENT })
  @IsOptional()
  @IsEnum(FeedSortBy)
  sortBy?: FeedSortBy;

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
