// src/development-plans/development-plans.dto.ts
import {
  IsString,
  IsOptional,
  IsInt,
  IsEnum,
  IsArray,
  IsBoolean,
  IsDateString,
  MaxLength,
  Min,
  Max,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';

// ─── Enums ────────────────────────────────────────────────────────────────────

export enum PlanStatus {
  DRAFT = 'DRAFT',
  PENDING = 'PENDING_APPROVAL',
  ACTIVE = 'ACTIVE',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
  OVERDUE = 'OVERDUE',
}

export enum ActionType {
  COURSE = 'COURSE',
  MENTORING = 'MENTORING',
  COACHING = 'COACHING',
  READING = 'READING',
  PROJECT = 'PROJECT',
  JOB_ROTATION = 'JOB_ROTATION',
  MICROLEARNING = 'MICROLEARNING',
  WORKSHOP = 'WORKSHOP',
  CERTIFICATION = 'CERTIFICATION',
  OTHER = 'OTHER',
}

export enum ActionStatus {
  TODO = 'TODO',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
  BLOCKED = 'BLOCKED',
  CANCELLED = 'CANCELLED',
}

export enum PlanPriority {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  URGENT = 'URGENT',
}

export enum CheckinType {
  QUICK = 'QUICK',
  STRUCTURED = 'STRUCTURED',
}

export enum ApprovalDecision {
  APPROVE = 'approve',
  REJECT = 'reject',
}

// ─── Plan ─────────────────────────────────────────────────────────────────────

export class CreateDevelopmentPlanDto {
  @ApiProperty({ example: 'PDI 2026 — Evolução para Sénior' })
  @IsString()
  @MaxLength(200)
  name!: string;

  @ApiProperty({ description: 'Objectivo geral SMART' })
  @IsString()
  goal!: string;

  @ApiProperty({ description: 'ID do colaborador' })
  @IsInt()
  userId!: number;

  @ApiPropertyOptional({ description: 'ID do gestor responsável' })
  @IsOptional()
  @IsInt()
  managerId?: number;

  @ApiPropertyOptional({ enum: PlanPriority, default: PlanPriority.MEDIUM })
  @IsOptional()
  @IsEnum(PlanPriority)
  priority?: PlanPriority;

  @ApiPropertyOptional({ description: 'Período ex: 2026-Q1' })
  @IsOptional()
  @IsString()
  period?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  endDate?: string;

  @ApiPropertyOptional({ description: 'ID do ciclo de performance associado' })
  @IsOptional()
  @IsInt()
  performanceCycleId?: number;

  @ApiPropertyOptional({ description: 'IDs de competências foco' })
  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  focusCompetencyIds?: number[];

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  isTemplate?: boolean;

  @ApiPropertyOptional({ description: 'Notas gerais' })
  @IsOptional()
  @IsString()
  notes?: string;
}

export class UpdateDevelopmentPlanDto extends PartialType(CreateDevelopmentPlanDto) {
  @ApiPropertyOptional({ enum: PlanStatus })
  @IsOptional()
  @IsEnum(PlanStatus)
  status?: PlanStatus;
}

// ─── Action ───────────────────────────────────────────────────────────────────

export class CreatePlanActionDto {
  @ApiProperty()
  @IsInt()
  planId!: number;

  @ApiProperty()
  @IsString()
  @MaxLength(200)
  title!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ enum: ActionType })
  @IsEnum(ActionType)
  type!: ActionType;

  @ApiPropertyOptional({ enum: ActionStatus, default: ActionStatus.TODO })
  @IsOptional()
  @IsEnum(ActionStatus)
  status?: ActionStatus;

  @ApiPropertyOptional({ description: 'IDs de competências relacionadas' })
  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  competencyIds?: number[];

  @ApiPropertyOptional({ description: 'ID do curso associado (tipo COURSE)' })
  @IsOptional()
  @IsInt()
  courseId?: number;

  @ApiPropertyOptional({ description: 'Carga horária em horas' })
  @IsOptional()
  @IsInt()
  @Min(0)
  workloadHours?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @ApiPropertyOptional({ description: 'Recursos: links, materiais' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  resources?: string[];

  @ApiPropertyOptional({ description: 'XP ao concluir', default: 20 })
  @IsOptional()
  @IsInt()
  @Min(0)
  xpReward?: number;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  seq?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  mandatory?: boolean;
}

export class UpdatePlanActionDto extends PartialType(CreatePlanActionDto) {
  @ApiPropertyOptional({ description: 'Progresso 0-100' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  progress?: number;
}

// ─── Evidência ────────────────────────────────────────────────────────────────

export class AddEvidenceDto {
  @ApiProperty()
  @IsInt()
  actionId!: number;

  @ApiProperty()
  @IsString()
  title!: string;

  @ApiPropertyOptional({ description: 'URL do ficheiro ou link externo' })
  @IsOptional()
  @IsString()
  url?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;

  @ApiPropertyOptional({ enum: ['FILE', 'LINK', 'NOTE'] })
  @IsOptional()
  @IsString()
  evidenceType?: 'FILE' | 'LINK' | 'NOTE';
}

// ─── Goal (SMART) ─────────────────────────────────────────────────────────────

export class CreatePlanGoalDto {
  @ApiProperty()
  @IsInt()
  planId!: number;

  @ApiProperty()
  @IsString()
  @MaxLength(200)
  title!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ description: 'Indicador de sucesso mensurável' })
  @IsOptional()
  @IsString()
  successIndicator?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @ApiPropertyOptional({ description: 'Peso da meta no plano (0-100)' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  weight?: number;
}

export class UpdatePlanGoalProgressDto {
  @ApiProperty()
  @IsInt()
  goalId!: number;

  @ApiProperty({ description: 'Progresso 0-100' })
  @IsInt()
  @Min(0)
  @Max(100)
  progress!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}

// ─── Checkpoint ───────────────────────────────────────────────────────────────

export class CreateCheckpointDto {
  @ApiProperty()
  @IsInt()
  planId!: number;

  @ApiProperty()
  @IsString()
  @MaxLength(200)
  title!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty()
  @IsDateString()
  scheduledAt!: string;

  @ApiPropertyOptional({ enum: CheckinType, default: CheckinType.QUICK })
  @IsOptional()
  @IsEnum(CheckinType)
  type?: CheckinType;
}

export class CompleteCheckpointDto {
  @ApiProperty()
  @IsInt()
  checkpointId!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({ description: 'Score de progresso percebido 1-5' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  selfScore?: number;
}

// ─── Aprovação ────────────────────────────────────────────────────────────────

export class ApprovePlanDto {
  @ApiProperty()
  @IsInt()
  planId!: number;

  @ApiProperty({ enum: ApprovalDecision })
  @IsEnum(ApprovalDecision)
  decision!: ApprovalDecision;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  comment?: string;
}

// ─── Filters ──────────────────────────────────────────────────────────────────

export class DevelopmentPlanFilterDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  userId?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  managerId?: number;

  @ApiPropertyOptional({ enum: PlanStatus })
  @IsOptional()
  @IsEnum(PlanStatus)
  status?: PlanStatus;

  @ApiPropertyOptional({ enum: PlanPriority })
  @IsOptional()
  @IsEnum(PlanPriority)
  priority?: PlanPriority;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  period?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  overdue?: boolean;

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
