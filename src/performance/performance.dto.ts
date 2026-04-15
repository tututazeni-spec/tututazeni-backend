import {
  IsInt, IsNumber, IsString, IsOptional, IsEnum, IsArray,
  IsBoolean, IsDateString, Min, Max, MaxLength, ValidateNested,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';

// ─── Enums ────────────────────────────────────────────────────────────────────

export enum CycleStatus {
  PLANNED   = 'PLANNED',
  ACTIVE    = 'ACTIVE',
  CLOSED    = 'CLOSED',
  CANCELLED = 'CANCELLED',
}

export enum CycleType {
  PROBATION  = 'PROBATION',
  QUARTERLY  = 'QUARTERLY',
  SEMESTER   = 'SEMESTER',
  ANNUAL     = 'ANNUAL',
  AD_HOC     = 'AD_HOC',
}

export enum ReviewType {
  SELF    = 'SELF',
  MANAGER = 'MANAGER',
  PEER    = 'PEER',
  R360    = 'R360',
}

export enum ReviewStatus {
  DRAFT            = 'DRAFT',
  PENDING_SELF     = 'PENDING_SELF',
  PENDING_MANAGER  = 'PENDING_MANAGER',
  PENDING_360      = 'PENDING_360',
  CALIBRATION      = 'CALIBRATION',
  PUBLISHED        = 'PUBLISHED',
  DISPUTE          = 'DISPUTE',
  FINALIZED        = 'FINALIZED',
}

export enum GoalStatus {
  ON_TRACK  = 'ON_TRACK',
  AT_RISK   = 'AT_RISK',
  OFF_TRACK = 'OFF_TRACK',
  COMPLETED = 'COMPLETED',
}

export enum PerformanceCategory {
  LOW    = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH   = 'HIGH',
}

export enum FeedbackType {
  PRAISE      = 'PRAISE',
  IMPROVEMENT = 'IMPROVEMENT',
  GENERAL     = 'GENERAL',
}

// ─── Review Cycle ─────────────────────────────────────────────────────────────

export class CreateCycleDto {
  @ApiProperty({ example: 'Avaliação Anual 2026' })
  @IsString() @MaxLength(200)
  name!: string;

  @ApiProperty({ enum: CycleType }) @IsEnum(CycleType)
  type!: CycleType;

  @ApiProperty({ example: '2026-01-01' }) @IsDateString()
  startDate!: string;

  @ApiProperty({ example: '2026-12-31' }) @IsDateString()
  endDate!: string;

  @ApiPropertyOptional({ description: 'Deadline da autoavaliação' })
  @IsOptional() @IsDateString()
  selfEvalDeadline?: string;

  @ApiPropertyOptional({ description: 'Deadline da avaliação do gestor' })
  @IsOptional() @IsDateString()
  managerEvalDeadline?: string;

  @ApiPropertyOptional({ description: 'Peso dos goals no score final (0-100)' })
  @IsOptional() @IsInt() @Min(0) @Max(100)
  goalsWeight?: number;

  @ApiPropertyOptional({ description: 'Peso das competências (0-100)' })
  @IsOptional() @IsInt() @Min(0) @Max(100)
  competenciesWeight?: number;

  @ApiPropertyOptional({ description: 'Peso dos comportamentos/valores (0-100)' })
  @IsOptional() @IsInt() @Min(0) @Max(100)
  behaviorsWeight?: number;

  @ApiPropertyOptional({ description: 'Self antes do gestor (default: true)' })
  @IsOptional() @IsBoolean()
  selfBeforeManager?: boolean;

  @ApiPropertyOptional({ description: 'Anonimato 360° (default: true)' })
  @IsOptional() @IsBoolean()
  anonymous360?: boolean;

  @ApiPropertyOptional({ description: 'Escala máxima do score (default: 5)' })
  @IsOptional() @IsInt() @Min(3) @Max(10)
  scoreScale?: number;
}

export class UpdateCycleDto extends PartialType(CreateCycleDto) {}

// ─── Performance Review ───────────────────────────────────────────────────────

export class CreatePerformanceReviewDto {
  @ApiProperty({ description: 'ID do colaborador avaliado' }) @IsInt()
  userId!: number;

  @ApiProperty({ description: 'ID do ciclo de avaliação' }) @IsInt()
  cycleId!: number;

  @ApiProperty({ enum: ReviewType }) @IsEnum(ReviewType)
  type!: ReviewType;

  @ApiPropertyOptional({ description: 'ID do avaliador (se diferente do gestor)' })
  @IsOptional() @IsInt()
  reviewerId?: number;
}

export class UpdatePerformanceReviewDto extends PartialType(CreatePerformanceReviewDto) {}

// ─── Submeter avaliação ───────────────────────────────────────────────────────

export class GoalEvaluationDto {
  @ApiProperty() @IsInt()
  goalId!: number;

  @ApiProperty({ description: 'Score do goal (0-100)' }) @IsNumber() @Min(0) @Max(100)
  score!: number;

  @ApiPropertyOptional() @IsOptional() @IsString()
  comment?: string;
}

export class CompetencyEvaluationDto {
  @ApiProperty() @IsInt()
  competencyId!: number;

  @ApiProperty({ description: 'Nível avaliado (1-5)' }) @IsInt() @Min(1) @Max(5)
  evaluatedLevel!: number;

  @ApiPropertyOptional() @IsOptional() @IsString()
  feedback?: string;
}

export class SubmitReviewDto {
  @ApiProperty() @IsInt()
  reviewId!: number;

  @ApiPropertyOptional({ description: 'Score global (0-escala)' })
  @IsOptional() @IsNumber() @Min(0)
  score?: number;

  @ApiPropertyOptional({ description: 'Feedback qualitativo' })
  @IsOptional() @IsString()
  feedback?: string;

  @ApiPropertyOptional({ description: 'Justificativa (obrigatória em scores extremos)' })
  @IsOptional() @IsString()
  justification?: string;

  @ApiPropertyOptional({ type: [GoalEvaluationDto] })
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => GoalEvaluationDto)
  goalEvaluations?: GoalEvaluationDto[];

  @ApiPropertyOptional({ type: [CompetencyEvaluationDto] })
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => CompetencyEvaluationDto)
  competencyEvaluations?: CompetencyEvaluationDto[];

  @ApiPropertyOptional({ description: 'Avaliação de potencial (1-5)' })
  @IsOptional() @IsInt() @Min(1) @Max(5)
  potentialScore?: number;
}

// ─── Goal ─────────────────────────────────────────────────────────────────────

export class CreateGoalDto {
  @ApiProperty() @IsInt()
  userId!: number;

  @ApiProperty() @IsInt()
  cycleId!: number;

  @ApiProperty() @IsString() @MaxLength(200)
  title!: string;

  @ApiPropertyOptional() @IsOptional() @IsString()
  description?: string;

  @ApiProperty({ description: 'Valor alvo' }) @IsNumber()
  targetValue!: number;

  @ApiPropertyOptional({ description: 'Valor actual' })
  @IsOptional() @IsNumber() @Min(0)
  currentValue?: number;

  @ApiPropertyOptional({ description: 'Peso do goal no score total (0-100)' })
  @IsOptional() @IsNumber() @Min(0) @Max(100)
  weight?: number;

  @ApiPropertyOptional({ description: 'Unidade de medida (%, Kz, unidades, etc.)' })
  @IsOptional() @IsString()
  unit?: string;

  @ApiPropertyOptional() @IsOptional() @IsDateString()
  dueDate?: string;
}

export class UpdateGoalDto extends PartialType(CreateGoalDto) {}

export class UpdateGoalProgressDto {
  @ApiProperty() @IsNumber() @Min(0)
  currentValue!: number;

  @ApiPropertyOptional() @IsOptional() @IsString()
  notes?: string;
}

// ─── Feedback contínuo ────────────────────────────────────────────────────────

export class CreateFeedbackDto {
  @ApiProperty({ description: 'ID do colaborador que recebe' }) @IsInt()
  targetUserId!: number;

  @ApiProperty({ enum: FeedbackType }) @IsEnum(FeedbackType)
  type!: FeedbackType;

  @ApiProperty() @IsString() @MaxLength(2000)
  message!: string;

  @ApiPropertyOptional({ description: 'Visível ao colaborador?' })
  @IsOptional() @IsBoolean()
  visibleToUser?: boolean;

  @ApiPropertyOptional() @IsOptional() @IsInt()
  cycleId?: number;
}

// ─── Calibração ───────────────────────────────────────────────────────────────

export class CalibrateReviewDto {
  @ApiProperty() @IsInt()
  reviewId!: number;

  @ApiProperty({ description: 'Score calibrado' }) @IsNumber() @Min(0)
  calibratedScore!: number;

  @ApiProperty({ description: 'Motivo da calibração' }) @IsString()
  reason!: string;

  @ApiPropertyOptional({ enum: PerformanceCategory })
  @IsOptional() @IsEnum(PerformanceCategory)
  category?: PerformanceCategory;
}

// ─── Disputa ──────────────────────────────────────────────────────────────────

export class CreateDisputeDto {
  @ApiProperty() @IsInt()
  reviewId!: number;

  @ApiProperty() @IsString() @MaxLength(2000)
  reason!: string;

  @ApiPropertyOptional() @IsOptional() @IsString()
  evidence?: string;
}

// ─── 9-box ────────────────────────────────────────────────────────────────────

export class Update9BoxDto {
  @ApiProperty({ description: 'ID do utilizador' }) @IsInt()
  userId!: number;

  @ApiProperty({ description: 'Eixo Performance (1-3)' }) @IsInt() @Min(1) @Max(3)
  performanceAxis!: number;

  @ApiProperty({ description: 'Eixo Potencial (1-3)' }) @IsInt() @Min(1) @Max(3)
  potentialAxis!: number;

  @ApiProperty({ description: 'Justificativa' }) @IsString()
  justification!: string;

  @ApiPropertyOptional() @IsOptional() @IsInt()
  cycleId?: number;
}

// ─── Filters ──────────────────────────────────────────────────────────────────

export class PerformanceFilterDto {
  @ApiPropertyOptional() @IsOptional() @IsInt() @Type(() => Number)
  userId?: number;

  @ApiPropertyOptional() @IsOptional() @IsInt() @Type(() => Number)
  cycleId?: number;

  @ApiPropertyOptional() @IsOptional() @IsString()
  period?: string;

  @ApiPropertyOptional({ enum: ReviewStatus }) @IsOptional() @IsEnum(ReviewStatus)
  status?: ReviewStatus;

  @ApiPropertyOptional({ enum: ReviewType }) @IsOptional() @IsEnum(ReviewType)
  type?: ReviewType;

  @ApiPropertyOptional({ default: 1 }) @IsOptional() @IsInt() @Min(1) @Type(() => Number)
  page?: number;

  @ApiPropertyOptional({ default: 20 }) @IsOptional() @IsInt() @Min(1) @Type(() => Number)
  limit?: number;
}
