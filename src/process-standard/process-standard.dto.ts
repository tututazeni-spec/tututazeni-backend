// src/process-standard/process-standard.dto.ts
import {
  IsString, IsOptional, IsInt, IsArray, IsEnum,
  IsNumber, IsDateString, ValidateNested, IsBoolean,
  Min, Max, ArrayMinSize,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';

// ─── Enums ─────────────────────────────────────────────────────────────────
export enum ProcessStatus {
  DRAFT      = 'DRAFT',
  IN_REVIEW  = 'IN_REVIEW',
  ACTIVE     = 'ACTIVE',
  ARCHIVED   = 'ARCHIVED',
}

export enum RiskLevel {
  LOW      = 'LOW',
  MEDIUM   = 'MEDIUM',
  HIGH     = 'HIGH',
  CRITICAL = 'CRITICAL',
}

export enum StepType {
  START    = 'START',
  END      = 'END',
  TASK     = 'TASK',
  DECISION = 'DECISION',
  GATEWAY  = 'GATEWAY',
  REVIEW   = 'REVIEW',
}

export enum InstanceStatus {
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED   = 'COMPLETED',
  CANCELLED   = 'CANCELLED',
  ON_HOLD     = 'ON_HOLD',
}

export enum TaskStatus {
  PENDING   = 'PENDING',
  COMPLETED = 'COMPLETED',
  REJECTED  = 'REJECTED',
  ESCALATED = 'ESCALATED',
  SKIPPED   = 'SKIPPED',
}

// ─── Step DTO ─────────────────────────────────────────────────────────────
export class ProcessStepDto {
  @ApiProperty({ enum: StepType }) @IsEnum(StepType)
  type: StepType;

  @ApiProperty() @IsString()
  title: string;

  @ApiPropertyOptional() @IsOptional() @IsString()
  description?: string;

  @ApiProperty({ description: 'Ordem de execução' }) @IsInt() @Min(0)
  order: number;

  @ApiPropertyOptional({ description: 'ID do responsável (user)' })
  @IsOptional() @IsInt()
  responsibleId?: number;

  @ApiPropertyOptional({ description: 'Role responsável (ex: GESTOR)' })
  @IsOptional() @IsString()
  responsibleRole?: string;

  @ApiPropertyOptional({ description: 'SLA em horas' })
  @IsOptional() @IsNumber() @Min(0)
  slaHours?: number;

  @ApiPropertyOptional({ description: 'Tempo estimado em minutos' })
  @IsOptional() @IsNumber() @Min(0)
  estimatedMinutes?: number;

  @ApiPropertyOptional({ description: 'Formulário em JSON (campos input)' })
  @IsOptional()
  formSchema?: Record<string, any>;

  @ApiPropertyOptional({ description: 'Condições de saída do nó (JSON)' })
  @IsOptional()
  exitConditions?: Record<string, any>;

  @ApiPropertyOptional({ description: 'IDs de documentos associados' })
  @IsOptional() @IsArray() @IsInt({ each: true })
  documentIds?: number[];

  @ApiPropertyOptional({ description: 'Upload obrigatório?' })
  @IsOptional() @IsBoolean()
  requiresUpload?: boolean;

  @ApiPropertyOptional({ description: 'Checklist de verificação (JSON)' })
  @IsOptional()
  checklist?: string[];
}

// ─── Create Process ────────────────────────────────────────────────────────
export class CreateProcessDto {
  @ApiProperty({ example: 'Admissão de Colaborador' }) @IsString()
  title: string;

  @ApiProperty({ example: 'RH-ADM-001', description: 'Código único do processo' })
  @IsString()
  code: string;

  @ApiPropertyOptional() @IsOptional() @IsString()
  description?: string;

  @ApiPropertyOptional({ description: 'Objetivo do processo' })
  @IsOptional() @IsString()
  objective?: string;

  @ApiPropertyOptional({ description: 'Âmbito / Escopo' })
  @IsOptional() @IsString()
  scope?: string;

  @ApiPropertyOptional() @IsOptional() @IsInt()
  departmentId?: number;

  @ApiPropertyOptional({ enum: RiskLevel, default: RiskLevel.LOW })
  @IsOptional() @IsEnum(RiskLevel)
  riskLevel?: RiskLevel;

  @ApiPropertyOptional({ description: 'SLA padrão em horas' })
  @IsOptional() @IsNumber() @Min(0)
  defaultSlaHours?: number;

  @ApiPropertyOptional({ description: 'Tempo estimado total em minutos' })
  @IsOptional() @IsNumber() @Min(0)
  estimatedMinutes?: number;

  @ApiPropertyOptional({ description: 'Data da próxima revisão' })
  @IsOptional() @IsDateString()
  nextReviewDate?: string;

  @ApiPropertyOptional({ description: 'Tags' })
  @IsOptional() @IsArray() @IsString({ each: true })
  tags?: string[];

  @ApiPropertyOptional({ description: 'Categoria' })
  @IsOptional() @IsString()
  category?: string;

  @ApiProperty({ type: [ProcessStepDto], description: 'Etapas do processo' })
  @IsArray() @ArrayMinSize(1) @ValidateNested({ each: true }) @Type(() => ProcessStepDto)
  steps: ProcessStepDto[];
}

export class UpdateProcessDto extends PartialType(CreateProcessDto) {}

// ─── Filter DTO ─────────────────────────────────────────────────────────────
export class ProcessFilterDto {
  @ApiPropertyOptional() @IsOptional() @IsString()
  search?: string;

  @ApiPropertyOptional({ enum: ProcessStatus }) @IsOptional() @IsEnum(ProcessStatus)
  status?: ProcessStatus;

  @ApiPropertyOptional({ enum: RiskLevel }) @IsOptional() @IsEnum(RiskLevel)
  riskLevel?: RiskLevel;

  @ApiPropertyOptional() @IsOptional() @IsInt() @Type(() => Number)
  departmentId?: number;

  @ApiPropertyOptional() @IsOptional() @IsString()
  category?: string;

  @ApiPropertyOptional({ default: 1 }) @IsOptional() @IsInt() @Min(1) @Type(() => Number)
  page?: number;

  @ApiPropertyOptional({ default: 20 }) @IsOptional() @IsInt() @Min(1) @Max(100) @Type(() => Number)
  limit?: number;
}

// ─── Start Instance ──────────────────────────────────────────────────────────
export class StartInstanceDto {
  @ApiProperty({ description: 'ID do colaborador alvo' }) @IsInt()
  targetUserId: number;

  @ApiPropertyOptional({ description: 'Notas de abertura' })
  @IsOptional() @IsString()
  notes?: string;
}

// ─── Complete Step ──────────────────────────────────────────────────────────
export class CompleteStepDto {
  @ApiPropertyOptional() @IsOptional() @IsString()
  notes?: string;

  @ApiPropertyOptional({ description: 'Dados do formulário preenchido (JSON)' })
  @IsOptional()
  formData?: Record<string, any>;

  @ApiPropertyOptional({ description: 'IDs de evidências/uploads' })
  @IsOptional() @IsArray() @IsInt({ each: true })
  evidenceIds?: number[];

  @ApiPropertyOptional({ description: 'Acção executada (approve/reject/etc.)' })
  @IsOptional() @IsString()
  action?: string;
}

// ─── Reject / Escalate Step ─────────────────────────────────────────────────
export class RejectStepDto {
  @ApiProperty({ description: 'Motivo da rejeição' }) @IsString()
  reason: string;
}

// ─── Submit for Approval ─────────────────────────────────────────────────────
export class ApprovalActionDto {
  @ApiProperty({ enum: ['approve', 'reject'] }) @IsString()
  action: 'approve' | 'reject';

  @ApiPropertyOptional() @IsOptional() @IsString()
  comment?: string;
}

// ─── Compare versions ────────────────────────────────────────────────────────
export class CompareVersionsDto {
  @ApiProperty() @IsString() versionA: string;
  @ApiProperty() @IsString() versionB: string;
}