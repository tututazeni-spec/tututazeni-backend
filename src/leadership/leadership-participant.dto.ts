import {
  IsString,
  IsOptional,
  IsInt,
  IsEnum,
  IsArray,
  IsNumber,
  IsDateString,
  Min,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ReadinessLevel,
  PlanStatus,
  ActionType,
  ActionStatus,
  LeadershipAssessmentStage,
  LeadershipAssessmentStatus,
  LeadershipProjectStatus,
  LeadershipDocumentKind,
  LeadershipCostCategory,
  LeadershipCommunicationEvent,
  LeadershipCommunicationChannel,
} from '@prisma/client';

// ─────────────────────────────────────────────────────────────────────────────
// DTOs da execução do participante (Task 5): baseline/readiness, ligação ao PDI
// e ao mentoring canónicos, avaliações, projecto, documentos, custos e
// comunicações. Todas as escritas são de gestão (autor/responsável do programa
// ou ADMIN/RH); o participante só tem leitura dos seus próprios dados.
// ─────────────────────────────────────────────────────────────────────────────

export class ParticipantBaselineDto {
  @ApiPropertyOptional({ description: 'Pontuação de baseline (0-100)' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  baselineScore?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  baselineNotes?: string;

  @ApiPropertyOptional({ enum: ReadinessLevel })
  @IsOptional()
  @IsEnum(ReadinessLevel)
  readinessLevel?: ReadinessLevel;
}

export class AssignAdvisorsDto {
  @ApiPropertyOptional({ description: 'User.id do mentor (null limpa)' })
  @IsOptional()
  @IsInt()
  mentorId?: number | null;

  @ApiPropertyOptional({ description: 'User.id do coach (null limpa)' })
  @IsOptional()
  @IsInt()
  coachId?: number | null;

  @ApiPropertyOptional({
    description: 'Mentoring.id existente — tem de ter este participante como mentee',
  })
  @IsOptional()
  @IsInt()
  mentoringId?: number | null;
}

export class LinkDevelopmentPlanDto {
  @ApiPropertyOptional({ description: 'DevelopmentPlan.id existente do próprio participante' })
  @IsOptional()
  @IsInt()
  developmentPlanId?: number | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  summary?: string;

  @ApiPropertyOptional({ enum: PlanStatus })
  @IsOptional()
  @IsEnum(PlanStatus)
  status?: PlanStatus;
}

export class ParticipantPlanActionInput {
  @ApiProperty()
  @IsString()
  @MaxLength(300)
  title!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ enum: ActionType })
  @IsOptional()
  @IsEnum(ActionType)
  type?: ActionType;

  @ApiPropertyOptional({ enum: ActionStatus })
  @IsOptional()
  @IsEnum(ActionStatus)
  status?: ActionStatus;

  @ApiPropertyOptional({
    description: 'DevelopmentPlanAction.id canónico quando a acção vem do PDI',
  })
  @IsOptional()
  @IsInt()
  developmentPlanActionId?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  courseId?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  seq?: number;
}

export class ReplacePlanActionsDto {
  @ApiProperty({ type: [ParticipantPlanActionInput] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ParticipantPlanActionInput)
  actions!: ParticipantPlanActionInput[];
}

// ─── Execução ───────────────────────────────────────────────────────────────

export class RecordAssessmentDto {
  @ApiProperty({ enum: LeadershipAssessmentStage })
  @IsEnum(LeadershipAssessmentStage)
  stage!: LeadershipAssessmentStage;

  @ApiPropertyOptional({ enum: LeadershipAssessmentStatus })
  @IsOptional()
  @IsEnum(LeadershipAssessmentStatus)
  status?: LeadershipAssessmentStatus;

  @ApiPropertyOptional({ description: 'Assessment.id canónico quando corre pela Academia' })
  @IsOptional()
  @IsInt()
  assessmentId?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  score?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  maxScore?: number;

  @ApiPropertyOptional({ enum: ReadinessLevel })
  @IsOptional()
  @IsEnum(ReadinessLevel)
  readinessLevel?: ReadinessLevel;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  feedback?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  strengths?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  improvements?: string;
}

export class UpsertProjectDto {
  @ApiPropertyOptional({ description: 'Preenchido para actualizar um projecto existente' })
  @IsOptional()
  @IsInt()
  projectId?: number;

  @ApiPropertyOptional({ description: 'User.id do participante dono do projecto' })
  @IsOptional()
  @IsInt()
  participantUserId?: number;

  @ApiProperty()
  @IsString()
  @MaxLength(300)
  title!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  challenge?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ enum: LeadershipProjectStatus })
  @IsOptional()
  @IsEnum(LeadershipProjectStatus)
  status?: LeadershipProjectStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  kpiName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  kpiTarget?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  kpiResult?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  sponsorId?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  mentorId?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  endDate?: string;
}

export class EvaluateProjectDto {
  @ApiPropertyOptional({
    enum: LeadershipProjectStatus,
    description: 'Só UNDER_REVIEW, COMPLETED ou REJECTED. Omitido → COMPLETED.',
  })
  @IsOptional()
  @IsEnum(LeadershipProjectStatus)
  status?: LeadershipProjectStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  score?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  outcome?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  evaluationNotes?: string;
}

export class AttachDocumentDto {
  @ApiProperty({ description: 'Document.id existente do repositório documental' })
  @IsInt()
  documentId!: number;

  @ApiPropertyOptional({ enum: LeadershipDocumentKind })
  @IsOptional()
  @IsEnum(LeadershipDocumentKind)
  kind?: LeadershipDocumentKind;

  @ApiPropertyOptional({ description: 'Associar a evidência a um participante' })
  @IsOptional()
  @IsInt()
  participantUserId?: number;

  @ApiPropertyOptional({ description: 'Associar a evidência a um projecto do programa' })
  @IsOptional()
  @IsInt()
  projectId?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}

export class AddCostDto {
  @ApiProperty({ enum: LeadershipCostCategory })
  @IsEnum(LeadershipCostCategory)
  category!: LeadershipCostCategory;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(300)
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  plannedAmount?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  actualAmount?: number;

  @ApiPropertyOptional({ default: 'AOA' })
  @IsOptional()
  @IsString()
  @MaxLength(3)
  currency?: string;

  @ApiPropertyOptional({ description: 'Imputar o custo a um participante específico' })
  @IsOptional()
  @IsInt()
  participantUserId?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  incurredAt?: string;
}

export class ScheduleCommunicationDto {
  @ApiProperty({ enum: LeadershipCommunicationEvent })
  @IsEnum(LeadershipCommunicationEvent)
  event!: LeadershipCommunicationEvent;

  @ApiPropertyOptional({ enum: LeadershipCommunicationChannel })
  @IsOptional()
  @IsEnum(LeadershipCommunicationChannel)
  channel?: LeadershipCommunicationChannel;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  subject?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  body?: string;

  @ApiPropertyOptional({ description: 'Agendamento relativo a uma data-âncora (negativo = antes)' })
  @IsOptional()
  @IsInt()
  daysOffset?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  scheduledFor?: string;

  @ApiPropertyOptional({ description: 'Destinatário único; omitido → todos os participantes' })
  @IsOptional()
  @IsInt()
  participantUserId?: number;
}
