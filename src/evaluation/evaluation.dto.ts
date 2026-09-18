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
import {
  EvaluationRequestStatus as RequestStatus,
  EvalCampaignStatus as CycleStatus,
  EvalQuestionType as QuestionType,
} from '@prisma/client';
import { BaseFilterDto } from '../common/dtos/pagination.dto';

// ─── Enums ────────────────────────────────────────────────────────
// CycleStatus/QuestionType são os enums reais do Prisma (EvalCampaignStatus/
// EvalQuestionType) re-exportados — sem duplicação, sem casts na fronteira
// service↔Prisma.

export { RequestStatus, CycleStatus, QuestionType };

export enum EvalType {
  SELF = 'SELF',
  MANAGER = 'MANAGER',
  PEER = 'PEER',
  SUBORDINATE = 'SUBORDINATE',
  CLIENT = 'CLIENT',
}

// EvalModel usa códigos curtos ('90'/'360') no contrato da API — mapeados
// para o enum Prisma EvalCampaignModel ('DEG_90'/'DEG_360') em
// evaluation.service.ts (MODEL_TO_PRISMA/PRISMA_TO_MODEL).
export enum EvalModel {
  DEG_90 = '90',
  DEG_180 = '180',
  DEG_270 = '270',
  DEG_360 = '360',
  CONTINUOUS = 'CONTINUOUS',
  PROJECT = 'PROJECT',
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
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(50) code?: string;
  @ApiProperty() @IsString() @MaxLength(200) name!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(100) category?: string;
  @ApiProperty({ enum: EvalModel }) @IsEnum(EvalModel) model!: EvalModel;
  @ApiProperty() @IsDateString() startDate!: string;
  @ApiProperty() @IsDateString() endDate!: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() formId?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() templateId?: number;
  @ApiPropertyOptional() @IsOptional() @IsArray() @IsInt({ each: true }) targetDeptIds?: number[];
  @ApiPropertyOptional() @IsOptional() @IsBoolean() mandatory?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() confidential?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() selfEvalIncludedInScore?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) minScore?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) maxScore?: number;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() requireComments?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() requireEvidence?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() allowEdit?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() allowContest?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() allowCalibration?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsString() resultsVisibility?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() linkPdi?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() linkCompetencies?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() linkCareer?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() linkSuccession?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() link9Box?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string;
  @ApiProperty({ type: [EvaluatorWeightDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => EvaluatorWeightDto)
  weights!: EvaluatorWeightDto[];
}

export class UpdateCycleDto {
  @ApiPropertyOptional() @IsOptional() @IsString() name?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() category?: string;
  @ApiPropertyOptional({ enum: CycleStatus })
  @IsOptional()
  @IsEnum(CycleStatus)
  status?: CycleStatus;
  @ApiPropertyOptional() @IsOptional() @IsDateString() endDate?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() mandatory?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() confidential?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string;
}

export class CycleFilterDto extends BaseFilterDto {
  @ApiPropertyOptional({ enum: CycleStatus })
  @IsOptional()
  @IsEnum(CycleStatus)
  status?: CycleStatus;
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

// ─── Scale DTOs ───────────────────────────────────────────────────

export class ScaleLevelDto {
  @ApiProperty() @IsInt() value!: number;
  @ApiProperty() @IsString() @MaxLength(100) label!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
}

export class CreateScaleDto {
  @ApiProperty() @IsString() @MaxLength(100) name!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() minValue?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() maxValue?: number;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isDefault?: boolean;
  @ApiPropertyOptional({ type: [ScaleLevelDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ScaleLevelDto)
  levels?: ScaleLevelDto[];
}

export class UpdateScaleDto {
  @ApiPropertyOptional() @IsOptional() @IsString() name?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isDefault?: boolean;
}

// ─── Criteria DTOs ────────────────────────────────────────────────

export class CreateCriteriaDto {
  @ApiProperty() @IsString() @MaxLength(200) name!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() category?: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) weight?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() scaleId?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() competencyId?: number;
}

export class UpdateCriteriaDto {
  @ApiPropertyOptional() @IsOptional() @IsString() name?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() category?: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) weight?: number;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isActive?: boolean;
}

// ─── Template DTOs ────────────────────────────────────────────────

export class TemplateCriterionLinkDto {
  @ApiProperty() @IsInt() criteriaId!: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) weight?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) seq?: number;
}

export class CreateTemplateDto {
  @ApiProperty() @IsString() @MaxLength(200) name!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() type?: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() scaleId?: number;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isDefault?: boolean;
  @ApiPropertyOptional({ type: [TemplateCriterionLinkDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TemplateCriterionLinkDto)
  criteria?: TemplateCriterionLinkDto[];
}

export class UpdateTemplateDto {
  @ApiPropertyOptional() @IsOptional() @IsString() name?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isDefault?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isActive?: boolean;
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
