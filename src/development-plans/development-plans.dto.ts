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
  ValidateNested,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type, Transform } from 'class-transformer';
import {
  PlanStatus,
  ActionType,
  ActionStatus,
  PlanPriority,
  CheckinType,
  PdiOrigin,
  PdiCompetencyPriority,
  PdiFinalResult,
  PdiOverallResult,
  PdiNextSteps,
} from '@prisma/client';

// ─── Enums ────────────────────────────────────────────────────────────────────

export {
  PlanStatus,
  ActionType,
  ActionStatus,
  PlanPriority,
  CheckinType,
  PdiOrigin,
  PdiCompetencyPriority,
  PdiFinalResult,
  PdiOverallResult,
  PdiNextSteps,
};

// ApprovalDecision (input do pedido, minúsculas 'approve'/'reject') é distinto do
// enum Prisma ApprovalDecision (coluna PdiApproval.decision, maiúsculas APPROVE/
// REJECT) — mesma convenção usada por executive-reports/onboarding/process-standard
// para os seus próprios endpoints de aprovação, não é o schema. Não consolidar.
export enum ApprovalDecision {
  APPROVE = 'approve',
  REJECT = 'reject',
}

// ─── Gap de competência (secção 5 do doc) ──────────────────────────────────────
// Substitui o antigo `focusCompetencyIds` (recebido e nunca persistido).

export class CompetencyGapInputDto {
  @ApiProperty({ description: 'ID da competência' })
  @IsInt()
  competencyId!: number;

  @ApiPropertyOptional({ description: 'Nível actual (escala da competência)' })
  @IsOptional()
  @IsInt()
  @Min(0)
  currentLevel?: number;

  @ApiPropertyOptional({ description: 'Nível desejado (escala da competência)' })
  @IsOptional()
  @IsInt()
  @Min(0)
  targetLevel?: number;

  @ApiPropertyOptional({ enum: PdiCompetencyPriority, default: PdiCompetencyPriority.MEDIUM })
  @IsOptional()
  @IsEnum(PdiCompetencyPriority)
  priority?: PdiCompetencyPriority;
}

export class AddCompetencyGapDto extends CompetencyGapInputDto {
  @ApiProperty()
  @IsInt()
  planId!: number;
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

  @ApiPropertyOptional({ description: 'Competências a desenvolver, com gap actual→desejado' })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CompetencyGapInputDto)
  competencyGaps?: CompetencyGapInputDto[];

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  isTemplate?: boolean;

  @ApiPropertyOptional({ description: 'Notas gerais' })
  @IsOptional()
  @IsString()
  notes?: string;

  // ─── Origem e diagnóstico (secções 2-3) ──────────────────────────────────
  @ApiPropertyOptional({ enum: PdiOrigin, description: 'Porque foi este PDI criado' })
  @IsOptional()
  @IsEnum(PdiOrigin)
  origin?: PdiOrigin;

  @ApiPropertyOptional({ description: 'Justificação para a criação do PDI' })
  @IsOptional()
  @IsString()
  originJustification?: string;

  @ApiPropertyOptional({ description: 'Principais pontos fortes do colaborador' })
  @IsOptional()
  @IsString()
  strengths?: string;

  @ApiPropertyOptional({ description: 'Principais necessidades de desenvolvimento' })
  @IsOptional()
  @IsString()
  developmentNeeds?: string;

  // ─── Ligação à avaliação de origem (secção 4) ────────────────────────────
  @ApiPropertyOptional({ description: 'ID da avaliação de desempenho que originou este PDI' })
  @IsOptional()
  @IsInt()
  sourceReviewId?: number;

  // ─── Ligação a objectivo de carreira (secção 8) ──────────────────────────
  @ApiPropertyOptional({ description: 'ID do plano de carreira associado' })
  @IsOptional()
  @IsInt()
  careerPlanId?: number;

  @ApiPropertyOptional({ description: 'Prontidão actual para o cargo-alvo (0-100)' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  careerReadinessPercent?: number;
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
  url?: string; // file-url-exempt: dual-propósito (ficheiro em storage OU link externo), ver campo 'type'

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

// ─── Avaliação final e próximos passos (secções 19-20) ─────────────────────────

export class CompletePlanDto {
  @ApiPropertyOptional({ enum: PdiFinalResult })
  @IsOptional()
  @IsEnum(PdiFinalResult)
  finalResult?: PdiFinalResult;

  @ApiPropertyOptional({ enum: PdiOverallResult })
  @IsOptional()
  @IsEnum(PdiOverallResult)
  overallResult?: PdiOverallResult;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  employeeComment?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  managerComment?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  rhComment?: string;

  @ApiPropertyOptional({ enum: PdiNextSteps })
  @IsOptional()
  @IsEnum(PdiNextSteps)
  nextSteps?: PdiNextSteps;

  @ApiPropertyOptional({ description: 'Marca conclusão parcial em vez de total' })
  @IsOptional()
  @IsBoolean()
  partial?: boolean;
}

export class MarkAtRiskDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  reason?: string;
}

export class AcceptPlanDto {
  @ApiPropertyOptional({ description: 'Comentário do colaborador ao aceitar o PDI' })
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
  @Type(() => String)
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
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
