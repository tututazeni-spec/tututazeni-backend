// src/evaluation/evaluation.dto.ts
import {
  IsString,
  IsInt,
  IsOptional,
  IsEnum,
  IsArray,
  IsBoolean,
  IsDateString,
  IsNumber,
  Min,
  Max,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

// ─── Enums ────────────────────────────────────────────────────────

export enum EvalType {
  SELF = 'SELF',
  MANAGER = 'MANAGER',
  PEER = 'PEER',
  SUBORDINATE = 'SUBORDINATE',
  CLIENT = 'CLIENT',
}

export enum EvalModel {
  DEG_90 = '90',
  DEG_180 = '180',
  DEG_270 = '270',
  DEG_360 = '360',
  CONTINUOUS = 'CONTINUOUS',
  PROJECT = 'PROJECT',
}

export enum CycleStatus {
  DRAFT = 'DRAFT',
  PUBLISHED = 'PUBLISHED',
  ACTIVE = 'ACTIVE',
  CALIBRATING = 'CALIBRATING',
  COMPLETED = 'COMPLETED',
  ARCHIVED = 'ARCHIVED',
}

export enum QuestionType {
  SCALE = 'SCALE',
  TEXT = 'TEXT',
  NPS = 'NPS',
  BOOLEAN = 'BOOLEAN',
  NA_ALLOWED = 'NA_ALLOWED',
}

export enum RequestStatus {
  PENDING = 'PENDING',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
  SKIPPED = 'SKIPPED',
}

// ─── Cycle DTOs ───────────────────────────────────────────────────

export class EvaluatorWeightDto {
  @ApiProperty({ enum: EvalType }) @IsEnum(EvalType) type!: EvalType;
  @ApiProperty({ minimum: 0, maximum: 100 }) @IsNumber() @Min(0) @Max(100) weight!: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) minEvaluators?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() maxEvaluators?: number;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() anonymous?: boolean;
}

export class CreateCycleDto {
  @ApiProperty() @IsString() @MaxLength(200) name!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
  @ApiProperty({ enum: EvalModel }) @IsEnum(EvalModel) model!: EvalModel;
  @ApiProperty() @IsDateString() startDate!: string;
  @ApiProperty() @IsDateString() endDate!: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() formId?: number;
  @ApiPropertyOptional() @IsOptional() @IsArray() @IsInt({ each: true }) targetDeptIds?: number[];
  @ApiPropertyOptional() @IsOptional() @IsBoolean() selfEvalIncludedInScore?: boolean;
  @ApiProperty({ type: [EvaluatorWeightDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => EvaluatorWeightDto)
  weights!: EvaluatorWeightDto[];
}

export class UpdateCycleDto {
  @ApiPropertyOptional() @IsOptional() @IsString() name?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
  @ApiPropertyOptional({ enum: CycleStatus })
  @IsOptional()
  @IsEnum(CycleStatus)
  status?: CycleStatus;
  @ApiPropertyOptional() @IsOptional() @IsDateString() endDate?: string;
}

export class CycleFilterDto {
  @ApiPropertyOptional({ enum: CycleStatus })
  @IsOptional()
  @IsEnum(CycleStatus)
  status?: CycleStatus;
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

// ─── Form / Question DTOs ─────────────────────────────────────────

export class FormQuestionDto {
  @ApiProperty() @IsString() @MaxLength(500) text!: string;
  @ApiProperty({ enum: QuestionType }) @IsEnum(QuestionType) type!: QuestionType;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) order?: number;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() required?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) @Max(10) scaleMax?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() competencyId?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) @Max(100) weight?: number;
}

export class CreateFormDto {
  @ApiProperty() @IsString() @MaxLength(200) title!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isTemplate?: boolean;
  @ApiProperty({ type: [FormQuestionDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => FormQuestionDto)
  questions!: FormQuestionDto[];
}

// ─── Submit DTOs ──────────────────────────────────────────────────

export class AnswerDto {
  @ApiProperty() @IsInt() questionId!: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) score?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(2000) comment?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() notApplicable?: boolean;
}

export class SubmitEvaluationDto {
  @ApiProperty() @IsInt() requestId!: number;
  @ApiProperty({ type: [AnswerDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AnswerDto)
  answers!: AnswerDto[];
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(2000) strengths?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(2000) improvements?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(2000) recommendations?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isDraft?: boolean;
}

// ─── Evaluator Assignment DTOs ────────────────────────────────────

export class AssignEvaluatorDto {
  @ApiProperty() @IsInt() evaluatedId!: number;
  @ApiProperty() @IsInt() evaluatorId!: number;
  @ApiProperty({ enum: EvalType }) @IsEnum(EvalType) type!: EvalType;
  @ApiPropertyOptional() @IsOptional() @IsInt() cycleId?: number;
}

export class BulkAssignDto {
  @ApiProperty() @IsInt() cycleId!: number;
  @ApiProperty({ type: [AssignEvaluatorDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AssignEvaluatorDto)
  assignments!: AssignEvaluatorDto[];
}

// ─── Calibration DTOs ────────────────────────────────────────────

export class CalibrateScoreDto {
  @ApiProperty() @IsInt() evaluatedId!: number;
  @ApiProperty() @IsNumber() @Min(0) @Max(5) calibratedScore!: number;
  @ApiPropertyOptional() @IsOptional() @IsString() calibrationNote?: string;
}

// ─── Analytics DTOs ──────────────────────────────────────────────

export class EvaluationAnalyticsFilterDto {
  @ApiPropertyOptional() @IsOptional() @IsInt() @Type(() => Number) cycleId?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Type(() => Number) departmentId?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() period?: string;
}

// ─── Legacy DTO (keep backward compat) ───────────────────────────

export class CreateEvaluationDto {
  @ApiProperty() @IsInt() evaluatedId!: number;
  @ApiProperty({ enum: EvalType }) @IsEnum(EvalType) type!: EvalType;
  @ApiProperty() @IsString() period!: string;
  @ApiProperty({ type: [Object] })
  @IsArray()
  criteria!: { name: string; score: number; comment?: string }[];
  @ApiPropertyOptional() @IsOptional() @IsString() generalComment?: string;
}
