// src/engagement/engagement.dto.ts
import {
  IsString,
  IsInt,
  IsOptional,
  IsEnum,
  IsBoolean,
  IsDateString,
  IsArray,
  IsNumber,
  Min,
  Max,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

// ─── Enums ────────────────────────────────────────────────────────

export enum SurveyType {
  CLIMATE = 'CLIMATE',
  PULSE = 'PULSE',
  ENPS = 'ENPS',
  ONBOARDING = 'ONBOARDING',
  OFFBOARDING = 'OFFBOARDING',
  CUSTOM = 'CUSTOM',
  WELLBEING = 'WELLBEING',
}

export enum SurveyStatus {
  DRAFT = 'DRAFT',
  ACTIVE = 'ACTIVE',
  PAUSED = 'PAUSED',
  COMPLETED = 'COMPLETED',
  ARCHIVED = 'ARCHIVED',
}

export enum QuestionType {
  SCALE = 'SCALE',
  MULTIPLE = 'MULTIPLE',
  TEXT = 'TEXT',
  ENPS = 'ENPS',
  EMOJI = 'EMOJI',
}

export enum FeedbackType {
  OPEN = 'OPEN',
  ANONYMOUS = 'ANONYMOUS',
  PEER = 'PEER',
  MANAGER = 'MANAGER',
  RECOGNITION = 'RECOGNITION',
}

export enum RecognitionType {
  KUDOS = 'KUDOS',
  BADGE = 'BADGE',
  ACHIEVEMENT = 'ACHIEVEMENT',
  MILESTONE = 'MILESTONE',
}

export enum MoodLevel {
  GREAT = 5,
  GOOD = 4,
  NEUTRAL = 3,
  SAD = 2,
  TERRIBLE = 1,
}

export enum ActionPlanStatus {
  OPEN = 'OPEN',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
}

// ─── Survey DTOs ──────────────────────────────────────────────────

export class QuestionDto {
  @ApiProperty() @IsString() @MaxLength(500) text!: string;
  @ApiProperty({ enum: QuestionType }) @IsEnum(QuestionType) type!: QuestionType;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) @Max(100) order?: number;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() required?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsArray() @IsString({ each: true }) options?: string[];
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) @Max(10) scaleMax?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() category?: number;
}

export class CreateSurveyDto {
  @ApiProperty() @IsString() @MaxLength(200) title!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
  @ApiProperty({ enum: SurveyType }) @IsEnum(SurveyType) type!: SurveyType;
  @ApiPropertyOptional() @IsOptional() @IsDateString() startDate?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() endDate?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() anonymous?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isTemplate?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) @Max(100) minResponsesForResults?: number;
  @ApiPropertyOptional()
  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  targetDepartmentIds?: number[];
  @ApiPropertyOptional() @IsOptional() @IsString() frequency?: string;
  @ApiProperty({ type: [QuestionDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => QuestionDto)
  questions!: QuestionDto[];
}

export class UpdateSurveyDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) title?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
  @ApiPropertyOptional({ enum: SurveyStatus })
  @IsOptional()
  @IsEnum(SurveyStatus)
  status?: SurveyStatus;
  @ApiPropertyOptional() @IsOptional() @IsDateString() endDate?: string;
}

export class SurveyFilterDto {
  @ApiPropertyOptional({ enum: SurveyType }) @IsOptional() @IsEnum(SurveyType) type?: SurveyType;
  @ApiPropertyOptional({ enum: SurveyStatus })
  @IsOptional()
  @IsEnum(SurveyStatus)
  status?: SurveyStatus;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Type(() => Number) departmentId?: number;
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

// ─── Submit DTOs ──────────────────────────────────────────────────

export class SurveyAnswerDto {
  @ApiProperty() @IsInt() questionId!: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() value?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() comment?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() selectedOption?: string;
}

export class SubmitSurveyDto {
  @ApiProperty() @IsInt() surveyId!: number;
  @ApiProperty({ type: [SurveyAnswerDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SurveyAnswerDto)
  answers!: SurveyAnswerDto[];
  @ApiPropertyOptional() @IsOptional() @IsBoolean() submitAnonymously?: boolean;
}

// ─── eNPS DTOs ────────────────────────────────────────────────────

export class SubmitENPSDto {
  @ApiProperty({ minimum: 0, maximum: 10 }) @IsInt() @Min(0) @Max(10) score!: number;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(1000) reason?: string;
}

// ─── Mood DTOs ────────────────────────────────────────────────────

export class SubmitMoodDto {
  @ApiProperty({ enum: [1, 2, 3, 4, 5] }) @IsInt() @Min(1) @Max(5) mood!: number;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(500) note?: string;
  @ApiPropertyOptional() @IsOptional() @IsArray() @IsString({ each: true }) tags?: string[];
}

// ─── Feedback DTOs ───────────────────────────────────────────────

export class CreateFeedbackDto {
  @ApiPropertyOptional() @IsOptional() @IsInt() toUserId?: number;
  @ApiProperty({ enum: FeedbackType }) @IsEnum(FeedbackType) type!: FeedbackType;
  @ApiProperty() @IsString() @MaxLength(2000) message!: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() anonymous?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsString() projectRef?: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() categoryId?: number;
}

export class FeedbackReplyDto {
  @ApiProperty() @IsString() @MaxLength(2000) message!: string;
}

export class FeedbackFilterDto {
  @ApiPropertyOptional({ enum: FeedbackType })
  @IsOptional()
  @IsEnum(FeedbackType)
  type?: FeedbackType;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Type(() => Number) toUserId?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Type(() => Number) fromUserId?: number;
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

// ─── Recognition DTOs ────────────────────────────────────────────

export class CreateRecognitionDto {
  @ApiProperty() @IsInt() toUserId!: number;
  @ApiProperty({ enum: RecognitionType }) @IsEnum(RecognitionType) type!: RecognitionType;
  @ApiProperty() @IsString() @MaxLength(500) message!: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() public?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsString() value?: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) badgeId?: number;
}

export class RecognitionFilterDto {
  @ApiPropertyOptional() @IsOptional() @IsInt() @Type(() => Number) toUserId?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Type(() => Number) fromUserId?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Type(() => Number) departmentId?: number;
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

// ─── 1:1 Meeting DTOs ─────────────────────────────────────────────

export class CreateOneOnOneDto {
  @ApiProperty() @IsInt() participantId!: number;
  @ApiProperty() @IsDateString() scheduledAt!: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(15) @Max(120) durationMinutes?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() agenda?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() recurring?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsString() frequency?: string;
}

export class EngagementUpdateOneOnOneDto {
  @ApiPropertyOptional() @IsOptional() @IsDateString() scheduledAt?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() agenda?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() completed?: boolean;
}

// ─── Action Plan DTOs ────────────────────────────────────────────

export class CreateActionPlanDto {
  @ApiProperty() @IsString() @MaxLength(200) title!: string;
  @ApiProperty() @IsString() description!: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() assigneeId?: number;
  @ApiPropertyOptional() @IsOptional() @IsDateString() dueDate?: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() surveyId?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() departmentId?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() priority?: string;
}

export class UpdateActionPlanDto {
  @ApiPropertyOptional() @IsOptional() @IsString() title?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
  @ApiPropertyOptional({ enum: ActionPlanStatus })
  @IsOptional()
  @IsEnum(ActionPlanStatus)
  status?: ActionPlanStatus;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) @Max(100) progress?: number;
  @ApiPropertyOptional() @IsOptional() @IsDateString() dueDate?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string;
}

// ─── Analytics DTOs ──────────────────────────────────────────────

export class EngagementFilterDto {
  @ApiPropertyOptional() @IsOptional() @IsInt() @Type(() => Number) departmentId?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Type(() => Number) managerId?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() period?: string;
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
