import {
  IsString, IsOptional, IsInt, IsArray, IsEnum,
  IsNumber, IsDateString, ValidateNested, IsBoolean,
  Min, Max, ArrayMinSize,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';

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

export class ProcessStepDto {
  @ApiProperty({ enum: StepType }) @IsEnum(StepType)
  type!: StepType;

  @ApiProperty() @IsString()
  title!: string;

  @ApiPropertyOptional() @IsOptional() @IsString()
  description?: string;

  @ApiProperty({ description: 'Ordem de execução' }) @IsInt() @Min(0)
  order!: number;

  @ApiPropertyOptional() @IsOptional() @IsInt()
  responsibleId?: number;

  @ApiPropertyOptional() @IsOptional() @IsString()
  responsibleRole?: string;

  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0)
  slaHours?: number;

  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0)
  estimatedMinutes?: number;

  @ApiPropertyOptional() @IsOptional()
  formSchema?: Record<string, any>;

  @ApiPropertyOptional() @IsOptional()
  exitConditions?: Record<string, any>;

  @ApiPropertyOptional() @IsOptional() @IsArray() @IsInt({ each: true })
  documentIds?: number[];

  @ApiPropertyOptional() @IsOptional() @IsBoolean()
  requiresUpload?: boolean;

  @ApiPropertyOptional() @IsOptional()
  checklist?: string[];
}

export class CreateProcessDto {
  @ApiProperty({ example: 'Admissão de Colaborador' }) @IsString()
  title!: string;

  @ApiProperty({ example: 'RH-ADM-001', description: 'Código único do processo' })
  @IsString()
  code!: string;

  @ApiPropertyOptional() @IsOptional() @IsString()
  description?: string;

  @ApiPropertyOptional() @IsOptional() @IsString()
  objective?: string;

  @ApiPropertyOptional() @IsOptional() @IsString()
  scope?: string;

  @ApiPropertyOptional() @IsOptional() @IsInt()
  departmentId?: number;

  @ApiPropertyOptional({ enum: RiskLevel, default: RiskLevel.LOW })
  @IsOptional() @IsEnum(RiskLevel)
  riskLevel?: RiskLevel;

  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0)
  defaultSlaHours?: number;

  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0)
  estimatedMinutes?: number;

  @ApiPropertyOptional() @IsOptional() @IsDateString()
  nextReviewDate?: string;

  @ApiPropertyOptional() @IsOptional() @IsArray() @IsString({ each: true })
  tags?: string[];

  @ApiPropertyOptional() @IsOptional() @IsString()
  category?: string;

  @ApiProperty({ type: [ProcessStepDto] })
  @IsArray() @ArrayMinSize(1) @ValidateNested({ each: true }) @Type(() => ProcessStepDto)
  steps!: ProcessStepDto[];
}

export class UpdateProcessDto extends PartialType(CreateProcessDto) {}

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

export class StartInstanceDto {
  @ApiProperty({ description: 'ID do colaborador alvo' }) @IsInt()
  targetUserId!: number;

  @ApiPropertyOptional() @IsOptional() @IsString()
  notes?: string;
}

export class CompleteStepDto {
  @ApiPropertyOptional() @IsOptional() @IsString()
  notes?: string;

  @ApiPropertyOptional() @IsOptional()
  formData?: Record<string, any>;

  @ApiPropertyOptional() @IsOptional() @IsArray() @IsInt({ each: true })
  evidenceIds?: number[];

  @ApiPropertyOptional() @IsOptional() @IsString()
  action?: string;
}

export class RejectStepDto {
  @ApiProperty({ description: 'Motivo da rejeição' }) @IsString()
  reason!: string;
}

export class ApprovalActionDto {
  @ApiProperty({ enum: ['approve', 'reject'] }) @IsString()
  action!: 'approve' | 'reject';

  @ApiPropertyOptional() @IsOptional() @IsString()
  comment?: string;
}

export class CompareVersionsDto {
  @ApiProperty() @IsString()
  versionA!: string;

  @ApiProperty() @IsString()
  versionB!: string;
}
