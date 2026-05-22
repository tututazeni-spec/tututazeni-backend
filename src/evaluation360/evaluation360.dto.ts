// ============================================================
// INNOVA PLATFORM — AVALIAÇÃO 360º — DTOs
// src/modules/evaluation360/evaluation360.dto.ts
// ============================================================

import {
  IsString,
  IsOptional,
  IsEnum,
  IsInt,
  IsBoolean,
  IsArray,
  IsNumber,
  IsDateString,
  IsNotEmpty,
  Min,
  Max,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';

// ─── ENUMS ───────────────────────────────────────────────────
export enum CompetencyType {
  HARD_SKILL = 'HARD_SKILL',
  SOFT_SKILL = 'SOFT_SKILL',
  CULTURE = 'CULTURE',
  LEADERSHIP = 'LEADERSHIP',
  VITALITY = 'VITALITY',
  CUSTOM = 'CUSTOM',
}
export enum EvaluationModel {
  DEG_90 = 'DEG_90',
  DEG_180 = 'DEG_180',
  DEG_270 = 'DEG_270',
  DEG_360 = 'DEG_360',
  HYBRID = 'HYBRID',
}
export enum CycleType {
  TRIMESTRAL = 'TRIMESTRAL',
  SEMESTRAL = 'SEMESTRAL',
  ANUAL = 'ANUAL',
  PROJECT = 'PROJECT',
  CUSTOM = 'CUSTOM',
}
export enum CycleStatus {
  DRAFT = 'DRAFT',
  PUBLISHED = 'PUBLISHED',
  IN_PROGRESS = 'IN_PROGRESS',
  PROCESSING = 'PROCESSING',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
}
export enum AnonymityMode {
  ANONYMOUS = 'ANONYMOUS',
  SEMI_ANONYMOUS = 'SEMI_ANONYMOUS',
  OPEN = 'OPEN',
}
export enum EvaluatorRole {
  SELF = 'SELF',
  MANAGER = 'MANAGER',
  PEER = 'PEER',
  SUBORDINATE = 'SUBORDINATE',
  EXTERNAL = 'EXTERNAL',
}
export enum QuestionType {
  LIKERT = 'LIKERT',
  FREQUENCY = 'FREQUENCY',
  MULTIPLE_CHOICE = 'MULTIPLE_CHOICE',
  YES_NO = 'YES_NO',
  OPEN_TEXT = 'OPEN_TEXT',
  SITUATIONAL = 'SITUATIONAL',
}
export enum FeedbackType {
  RECOGNITION = 'RECOGNITION',
  DEVELOPMENT = 'DEVELOPMENT',
  CHECK_IN = 'CHECK_IN',
  PULSE = 'PULSE',
}

// ─── COMPETENCY ──────────────────────────────────────────────
export class CompetencyIndicatorDto {
  @ApiProperty() @IsInt() @Min(1) @Max(10) level: number;
  @ApiProperty() @IsString() @IsNotEmpty() description: string;
  @ApiPropertyOptional() @IsOptional() @IsString() examples?: string;
}

export class CreateCompetencyDto {
  @ApiProperty() @IsString() @IsNotEmpty() @MaxLength(120) name: string;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
  @ApiProperty({ enum: CompetencyType }) @IsEnum(CompetencyType) type: CompetencyType;
  @ApiPropertyOptional() @IsOptional() @IsString() category?: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) scaleMin?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(2) @Max(10) scaleMax?: number;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isGlobal?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsString() tenantId?: string;
  @ApiPropertyOptional({ type: [CompetencyIndicatorDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CompetencyIndicatorDto)
  indicators?: CompetencyIndicatorDto[];
}

export class UpdateCompetencyDto extends PartialType(CreateCompetencyDto) {}

// ─── CYCLE COMPETENCY ────────────────────────────────────────
export class CycleCompetencyDto {
  @ApiProperty() @IsString() competencyId: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) weight?: number;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isRequired?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) order?: number;
}

// ─── EVALUATION CYCLE ────────────────────────────────────────
export class CreateEvaluationCycleDto {
  @ApiProperty() @IsString() @IsNotEmpty() tenantId: string;
  @ApiProperty() @IsString() @IsNotEmpty() @MaxLength(150) name: string;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
  @ApiProperty({ enum: EvaluationModel }) @IsEnum(EvaluationModel) model: EvaluationModel;
  @ApiProperty({ enum: CycleType }) @IsEnum(CycleType) type: CycleType;
  @ApiProperty() @IsDateString() startDate: string;
  @ApiProperty() @IsDateString() endDate: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) gracePeriodDays?: number;
  @ApiPropertyOptional({ enum: AnonymityMode })
  @IsOptional()
  @IsEnum(AnonymityMode)
  anonymityMode?: AnonymityMode;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) quorumMinimum?: number;

  // Pesos (devem somar 100)
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) @Max(100) weightSelf?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) @Max(100) weightManager?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) @Max(100) weightPeer?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) @Max(100) weightSubordinate?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) @Max(100) weightExternal?: number;

  // Réguas de corte
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) @Max(10) cutoffPromotion?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) @Max(10) cutoffBonus?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) @Max(10) cutoffProgram?: number;

  // Integrações
  @ApiPropertyOptional() @IsOptional() @IsBoolean() linkedToPdi?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() linkedToBonus?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() linkedToOkrs?: boolean;

  @ApiPropertyOptional({ type: [CycleCompetencyDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CycleCompetencyDto)
  competencies?: CycleCompetencyDto[];
}

export class UpdateEvaluationCycleDto extends PartialType(CreateEvaluationCycleDto) {}

export class PublishCycleDto {
  @ApiPropertyOptional({ description: 'Se true, envia convites imediatamente' })
  @IsOptional()
  @IsBoolean()
  sendInvitesNow?: boolean;
}

// ─── QUESTIONS ───────────────────────────────────────────────
export class CreateQuestionDto {
  @ApiPropertyOptional() @IsOptional() @IsString() cycleId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() competencyId?: string;
  @ApiProperty() @IsString() @IsNotEmpty() text: string;
  @ApiProperty({ enum: QuestionType }) @IsEnum(QuestionType) type: QuestionType;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isRequired?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isOpen?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) order?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() scaleMin?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() scaleMax?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() scaleLabels?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() options?: string;
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() applicableTo?: string[];
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() targetPositions?: string[];
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() targetLevels?: string[];
}

export class UpdateQuestionDto extends PartialType(CreateQuestionDto) {}

// ─── PARTICIPANTS ─────────────────────────────────────────────
export class AddParticipantsDto {
  @ApiProperty({ type: [String] }) @IsArray() @IsString({ each: true }) userIds: string[];
}

export class ConsentDto {
  @ApiProperty() @IsBoolean() consent: boolean;
}

// ─── EVALUATOR ASSIGNMENTS ────────────────────────────────────
export class SuggestEvaluatorsDto {
  @ApiProperty() @IsString() evaluateeId: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) maxPerRole?: number;
}

export class AssignEvaluatorDto {
  @ApiProperty() @IsString() evaluateeId: string;
  @ApiProperty() @IsString() evaluatorId: string;
  @ApiProperty({ enum: EvaluatorRole }) @IsEnum(EvaluatorRole) role: EvaluatorRole;
}

export class BulkAssignEvaluatorsDto {
  @ApiProperty({ type: [AssignEvaluatorDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AssignEvaluatorDto)
  assignments: AssignEvaluatorDto[];
}

export class ApproveEvaluatorsDto {
  @ApiProperty({ type: [String] }) @IsArray() @IsString({ each: true }) assignmentIds: string[];
}

// ─── RESPONSES ───────────────────────────────────────────────
export class AnswerDto {
  @ApiProperty() @IsString() questionId: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() numericValue?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(2000) textValue?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() choiceValue?: string;
}

export class SubmitResponseDto {
  @ApiProperty({ type: [AnswerDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AnswerDto)
  answers: AnswerDto[];

  @ApiPropertyOptional({ description: 'Se true, envia definitivamente. Se false, salva rascunho.' })
  @IsOptional()
  @IsBoolean()
  submit?: boolean;
}

// ─── CONTINUOUS FEEDBACK ─────────────────────────────────────
export class CreateContinuousFeedbackDto {
  @ApiProperty() @IsString() tenantId: string;
  @ApiProperty() @IsString() toUserId: string;
  @ApiProperty({ enum: FeedbackType }) @IsEnum(FeedbackType) type: FeedbackType;
  @ApiProperty() @IsString() @IsNotEmpty() @MaxLength(1000) message: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isPrivate?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsString() competencyId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() relatedCycleId?: string;
}

// ─── PULSE SURVEY ────────────────────────────────────────────
export class CreatePulseSurveyDto {
  @ApiProperty() @IsString() tenantId: string;
  @ApiProperty() @IsString() @IsNotEmpty() title: string;
  @ApiProperty() @IsString() questions: string; // JSON array
  @ApiProperty({ type: [String] }) @IsArray() @IsString({ each: true }) targetUserIds: string[];
  @ApiProperty() @IsDateString() closesAt: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isAnonymous?: boolean;
}

export class SubmitPulseSurveyDto {
  @ApiProperty() @IsString() answersJson: string;
}

// ─── ANALYTICS QUERY ─────────────────────────────────────────
export class AnalyticsQueryDto {
  @ApiPropertyOptional() @IsOptional() @IsString() tenantId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() userId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() departmentId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() cycleId?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() from?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() to?: string;
}

export class NineBoxQueryDto {
  @ApiProperty() @IsString() cycleId: string;
  @ApiPropertyOptional() @IsOptional() @IsString() departmentId?: string;
}

// ─── RESULT / REPORT ─────────────────────────────────────────
export class GenerateReportDto {
  @ApiProperty() @IsString() cycleId: string;
  @ApiPropertyOptional() @IsOptional() @IsString() participantId?: string; // null = organizacional
  @ApiPropertyOptional({ enum: ['INDIVIDUAL', 'TEAM', 'ORGANIZATIONAL'] })
  @IsOptional()
  @IsString()
  scope?: 'INDIVIDUAL' | 'TEAM' | 'ORGANIZATIONAL';
  @ApiPropertyOptional() @IsOptional() @IsBoolean() includeAiInsights?: boolean;
}

// ─── CALIBRATION ─────────────────────────────────────────────
export class CalibrateScoreDto {
  @ApiProperty() @IsString() participantId: string;
  @ApiProperty() @IsNumber() @Min(0) @Max(10) calibratedScore: number;
  @ApiProperty() @IsString() @IsNotEmpty() justification: string;
}

// ─── REMINDERS ───────────────────────────────────────────────
export class SendRemindersDto {
  @ApiPropertyOptional({ description: 'Se não fornecido, envia para todos os pendentes' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  assignmentIds?: string[];
  @ApiPropertyOptional({ enum: ['EMAIL', 'PUSH', 'WHATSAPP'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  channels?: string[];
}

// ─── PAGINATION ───────────────────────────────────────────────
export class PaginationDto {
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) @Max(200) limit?: number = 20;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) offset?: number = 0;
  @ApiPropertyOptional() @IsOptional() @IsString() search?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() sortBy?: string;
  @ApiPropertyOptional({ enum: ['asc', 'desc'] }) @IsOptional() @IsString() sortOrder?:
    | 'asc'
    | 'desc';
}
