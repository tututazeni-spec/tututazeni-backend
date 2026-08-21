import {
  IsString,
  IsInt,
  IsOptional,
  IsEnum,
  IsArray,
  IsBoolean,
  IsDateString,
  Min,
  Max,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsAllowedFileUrl } from '../common/validators/is-allowed-file-url.validator';
import { BaseFilterDto } from '../common/dtos/pagination.dto';
import {
  OnboardingStatus,
  TaskCategory,
  TaskType,
  TaskStatus,
  TaskPhase,
  ResponsibleRole,
  DocumentStatus,
  SurveyMilestone,
} from '@prisma/client';

// ─── Enums ────────────────────────────────────────────────────────────────────

export {
  OnboardingStatus,
  TaskCategory,
  TaskType,
  TaskStatus,
  TaskPhase,
  ResponsibleRole,
  DocumentStatus,
  SurveyMilestone,
};

// ─── Template ─────────────────────────────────────────────────────────────────

export class CreateOnboardingTemplateDto {
  @ApiProperty({ example: 'Onboarding Colaborador TI' })
  @IsString()
  @MaxLength(200)
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ description: 'ID do cargo alvo' })
  @IsOptional()
  @IsInt()
  positionId?: number;

  @ApiPropertyOptional({ description: 'ID do departamento alvo' })
  @IsOptional()
  @IsInt()
  departmentId?: number;

  @ApiProperty({ description: 'Duração em dias (7, 15, 30, 60, 90)' })
  @IsInt()
  @Min(1)
  durationDays!: number;

  @ApiPropertyOptional({ description: 'ID da Learning Path associada' })
  @IsOptional()
  @IsInt()
  learningPathId?: number;

  @ApiPropertyOptional({ description: 'URL do vídeo de boas-vindas' })
  @IsOptional()
  @IsString()
  welcomeVideoUrl?: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class UpdateOnboardingTemplateDto extends PartialType(CreateOnboardingTemplateDto) {}

// ─── Template Task ────────────────────────────────────────────────────────────

export class CreateTemplateTaskDto {
  @ApiProperty()
  @IsInt()
  templateId!: number;

  @ApiProperty()
  @IsString()
  @MaxLength(200)
  title!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ enum: TaskCategory })
  @IsEnum(TaskCategory)
  category!: TaskCategory;

  @ApiProperty({ enum: TaskType })
  @IsEnum(TaskType)
  type!: TaskType;

  @ApiProperty({ enum: TaskPhase })
  @IsEnum(TaskPhase)
  phase!: TaskPhase;

  @ApiProperty({ enum: ResponsibleRole })
  @IsEnum(ResponsibleRole)
  responsible!: ResponsibleRole;

  @ApiPropertyOptional({ description: 'Dia limite (ex: 5 = até ao dia 5)' })
  @IsOptional()
  @IsInt()
  @Min(0)
  dueDayOffset?: number;

  @ApiPropertyOptional({ description: 'IDs de tarefas que bloqueiam esta' })
  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  dependsOn?: number[];

  @ApiPropertyOptional({ description: 'ID do curso associado (tipo COURSE)' })
  @IsOptional()
  @IsInt()
  courseId?: number;

  @ApiPropertyOptional({ description: 'ID do processo associado' })
  @IsOptional()
  @IsInt()
  processId?: number;

  @ApiProperty({ description: 'XP ganho ao completar', default: 10 })
  @IsInt()
  @Min(0)
  xpReward!: number;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  requiresApproval?: boolean;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  requiresEvidence?: boolean;

  @ApiProperty({ description: 'Ordem na lista' })
  @IsInt()
  @Min(0)
  seq!: number;
}

export class UpdateTemplateTaskDto extends PartialType(CreateTemplateTaskDto) {}

// ─── Plan (Instância por colaborador) ────────────────────────────────────────

export class CreateOnboardingPlanDto {
  @ApiProperty({ description: 'ID do colaborador' })
  @IsInt()
  userId!: number;

  @ApiProperty({ description: 'ID do template' })
  @IsInt()
  templateId!: number;

  @ApiPropertyOptional({ description: 'Data de início' })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({ description: 'ID do buddy (mentor)' })
  @IsOptional()
  @IsInt()
  buddyId?: number;

  @ApiPropertyOptional({ description: 'ID do gestor direto' })
  @IsOptional()
  @IsInt()
  managerId?: number;

  @ApiPropertyOptional({ description: 'ID do responsável RH' })
  @IsOptional()
  @IsInt()
  hrResponsibleId?: number;
}

// ─── Task instance ────────────────────────────────────────────────────────────

export class CompleteTaskDto {
  @ApiProperty({ description: 'ID da tarefa da instância' })
  @IsInt()
  taskInstanceId!: number;

  @ApiPropertyOptional({ description: 'Comentário de evidência' })
  @IsOptional()
  @IsString()
  evidenceComment?: string;

  @ApiPropertyOptional({ description: 'URL de evidência (ficheiro)' })
  @IsOptional()
  @IsString()
  evidenceUrl?: string;
}

export class SkipTaskDto {
  @ApiProperty()
  @IsInt()
  taskInstanceId!: number;

  @ApiProperty({ description: 'Motivo de saltar a tarefa' })
  @IsString()
  reason!: string;
}

export class ApproveTaskDto {
  @ApiProperty()
  @IsInt()
  taskInstanceId!: number;

  @ApiProperty({ enum: ['approve', 'reject'] })
  @IsString()
  decision!: 'approve' | 'reject';

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  comment?: string;
}

// ─── Document ─────────────────────────────────────────────────────────────────

export class UploadDocumentDto {
  @ApiProperty()
  @IsInt()
  planId!: number;

  @ApiProperty()
  @IsString()
  documentType!: string;

  @ApiProperty()
  @IsAllowedFileUrl()
  fileUrl!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}

export class ValidateDocumentDto {
  @ApiProperty()
  @IsInt()
  documentId!: number;

  @ApiProperty({ enum: DocumentStatus })
  @IsEnum(DocumentStatus)
  status!: DocumentStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  rejectionReason?: string;
}

// ─── Survey ───────────────────────────────────────────────────────────────────

export class SubmitOnboardingSurveyDto {
  @ApiProperty()
  @IsInt()
  planId!: number;

  @ApiProperty({ enum: SurveyMilestone })
  @IsEnum(SurveyMilestone)
  milestone!: SurveyMilestone;

  @ApiProperty({ description: 'Nota 1-5' })
  @IsInt()
  @Min(1)
  @Max(5)
  score!: number;

  @ApiPropertyOptional({ description: 'eNPS (-10 a 10)' })
  @IsOptional()
  @IsInt()
  @Min(-10)
  @Max(10)
  enps?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  comment?: string;
}

// ─── Filters ──────────────────────────────────────────────────────────────────

export class OnboardingFilterDto extends BaseFilterDto {
  @ApiPropertyOptional({ enum: OnboardingStatus })
  @IsOptional()
  @IsEnum(OnboardingStatus)
  status?: OnboardingStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  departmentId?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  templateId?: number;
}
