// src/avatar-training/avatar-training.dto.ts
import {
  IsString,
  IsInt,
  IsOptional,
  IsEnum,
  IsBoolean,
  IsArray,
  IsNumber,
  Min,
  Max,
  MaxLength,
  ValidateNested,
  IsNotEmpty,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type, Transform } from 'class-transformer';
import { IsAllowedFileUrl } from '../common/validators/is-allowed-file-url.validator';
import { BaseFilterDto } from '../common/dtos/pagination.dto';
import { ScenarioCategory, Difficulty, AvatarSessionStatus as SessionStatus } from '@prisma/client';

// ─── Enums ────────────────────────────────────────────────────────
// NOTA: SessionStatus aqui é o `AvatarSessionStatus` do Prisma — nome local
// mantido por compatibilidade, distinto do `SessionStatus` de outro módulo
// (SCHEDULED/LIVE/COMPLETED/CANCELLED/POSTPONED).

export { ScenarioCategory, Difficulty, SessionStatus };

export enum AvatarRole {
  COACH = 'COACH',
  MENTOR = 'MENTOR',
  CHARACTER = 'CHARACTER',
  EXPERT = 'EXPERT',
  PEER = 'PEER',
  BRAND = 'BRAND',
  CLONE = 'CLONE',
  EVALUATOR = 'EVALUATOR',
}

export enum AvatarStyle {
  PHOTOREALISTIC = 'PHOTOREALISTIC',
  CARTOON_2D = 'CARTOON_2D',
  STYLE_3D = 'STYLE_3D',
  MINIMALIST = 'MINIMALIST',
  HOLOGRAPHIC = 'HOLOGRAPHIC',
}

export enum AvatarPersonality {
  EMPATHETIC = 'EMPATHETIC',
  DIRECT = 'DIRECT',
  ANALYTICAL = 'ANALYTICAL',
  MOTIVATIONAL = 'MOTIVATIONAL',
  STRICT = 'STRICT',
  FRIENDLY = 'FRIENDLY',
}

export enum MessageRole {
  USER = 'USER',
  AVATAR = 'AVATAR',
  SYSTEM = 'SYSTEM',
}

// ─── Avatar DTOs ──────────────────────────────────────────────────

export class CreateAvatarDto {
  @ApiProperty() @IsString() @MaxLength(100) name!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
  @ApiProperty({ enum: AvatarRole }) @IsEnum(AvatarRole) role!: AvatarRole;
  @ApiPropertyOptional({ enum: AvatarStyle })
  @IsOptional()
  @IsEnum(AvatarStyle)
  style?: AvatarStyle;
  @ApiPropertyOptional({ enum: AvatarPersonality })
  @IsOptional()
  @IsEnum(AvatarPersonality)
  personality?: AvatarPersonality;
  @ApiPropertyOptional() @IsOptional() @IsString() language?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() voiceId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() avatarImageUrl?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() systemPrompt?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isPublic?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() hasMemory?: boolean;
  @ApiPropertyOptional()
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  knowledgeUrls?: string[];
  @ApiPropertyOptional() @IsOptional() @IsString() brandingColor?: string;
}

export class UpdateAvatarDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(100) name?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
  @ApiPropertyOptional({ enum: AvatarPersonality })
  @IsOptional()
  @IsEnum(AvatarPersonality)
  personality?: AvatarPersonality;
  @ApiPropertyOptional() @IsOptional() @IsString() systemPrompt?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isPublic?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() hasMemory?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsString() avatarImageUrl?: string;
}

export class AvatarFilterDto extends BaseFilterDto {
  @ApiPropertyOptional({ enum: AvatarRole }) @IsOptional() @IsEnum(AvatarRole) role?: AvatarRole;
  // @Type(() => Boolean) coage '?isPublic=false' para true — ver
  // [[project-innova-boolean-query-filter-coercion]]. @Type(() => String) +
  // @Transform evita a coerção Boolean automática do class-transformer.
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => String)
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  isPublic?: boolean;
}

// ─── Scenario DTOs ────────────────────────────────────────────────

export class ScenarioTurnDto {
  @ApiProperty() @IsInt() @Min(1) order!: number;
  @ApiProperty() @IsString() avatarLine!: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  expectedKeywords?: string[];
  @ApiPropertyOptional() @IsOptional() @IsString() hint?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isBranching?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsString() successPath?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() failPath?: string;
}

export class CreateScenarioDto {
  @ApiProperty() @IsString() @MaxLength(200) title!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
  @ApiProperty({ enum: ScenarioCategory }) @IsEnum(ScenarioCategory) category!: ScenarioCategory;
  @ApiProperty({ enum: Difficulty }) @IsEnum(Difficulty) difficulty!: Difficulty;
  @ApiPropertyOptional() @IsOptional() @IsInt() avatarId?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() competencyId?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) estimatedMinutes?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) xpReward?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() context?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() objective?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() thumbnailUrl?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isTemplate?: boolean;
  @ApiPropertyOptional({ type: [ScenarioTurnDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ScenarioTurnDto)
  turns?: ScenarioTurnDto[];
}

export class ScenarioFilterDto extends BaseFilterDto {
  @ApiPropertyOptional({ enum: ScenarioCategory })
  @IsOptional()
  @IsEnum(ScenarioCategory)
  category?: ScenarioCategory;
  @ApiPropertyOptional({ enum: Difficulty })
  @IsOptional()
  @IsEnum(Difficulty)
  difficulty?: Difficulty;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Type(() => Number) competencyId?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() search?: string;
}

// ─── Session DTOs ─────────────────────────────────────────────────

export class StartSessionDto {
  @ApiProperty() @IsInt() scenarioId!: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() avatarId?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() language?: string;
}

export class SendMessageDto {
  @ApiProperty() @IsString() @MaxLength(2000) message!: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isAudio?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) turnIndex?: number;
}

export class CompleteSessionDto {
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) @Max(100) score?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() feedback?: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) @Max(5) userRating?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) @Max(5) confidenceLevel?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() reflection?: string;
}

export class BehavioralScoreDto {
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) @Max(100) clarity?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) @Max(100) empathy?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) @Max(100) assertiveness?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) @Max(100) decisionMaking?: number;
}

// ─── Analytics DTOs ──────────────────────────────────────────────

export class AvatarTrainingAnalyticsFilterDto {
  @ApiPropertyOptional() @IsOptional() @IsInt() @Type(() => Number) userId?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Type(() => Number) managerId?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Type(() => Number) departmentId?: number;
  @ApiPropertyOptional({ enum: ScenarioCategory })
  @IsOptional()
  @IsEnum(ScenarioCategory)
  category?: ScenarioCategory;
}

// ─── UploadKnowledgeDto ───────────────────────────────────────────────────────

export class UploadKnowledgeDto {
  @IsAllowedFileUrl()
  fileUrl!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title!: string;
}
