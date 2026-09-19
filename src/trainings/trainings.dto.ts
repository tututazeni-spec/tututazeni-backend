// src/trainings/trainings.dto.ts
import {
  IsString,
  IsInt,
  IsOptional,
  IsEnum,
  IsBoolean,
  IsArray,
  IsNumber,
  IsDateString,
  Min,
  Max,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type, Transform } from 'class-transformer';
import {
  TrainingType,
  TrainingLevel,
  TrainingStatus,
  TrainingParticipantStatus as ParticipantStatus,
  SessionModality,
  TrainingAssessmentRole,
  TrainingPriority,
  TrainingPlanPeriod,
  TrainingPlanStatus,
} from '@prisma/client';
import { IsAllowedFileUrl } from '../common/validators/is-allowed-file-url.validator';

// ─── Enums ────────────────────────────────────────────────────────────────────
// NOTA: ParticipantStatus aqui é o `TrainingParticipantStatus` do Prisma —
// nome local mantido por compatibilidade, distinto do `ParticipantStatus`
// (LeadershipProgramParticipant) usado no módulo leadership.

export {
  TrainingType,
  TrainingLevel,
  TrainingStatus,
  ParticipantStatus,
  SessionModality,
  TrainingAssessmentRole,
  TrainingPriority,
  TrainingPlanPeriod,
  TrainingPlanStatus,
};

// ─── Training ─────────────────────────────────────────────────────────────────

export class CreateTrainingDto {
  @ApiProperty({ example: 'Liderança e Gestão de Equipas' })
  @IsString()
  @MaxLength(200)
  title!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(300)
  shortDescription?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ description: 'Objectivos do treinamento' })
  @IsOptional()
  @IsString()
  objectives?: string;

  @ApiPropertyOptional({ description: 'Público-alvo' })
  @IsOptional()
  @IsString()
  targetAudience?: string;

  @ApiProperty({ enum: TrainingType })
  @IsEnum(TrainingType)
  type!: TrainingType;

  @ApiProperty({ enum: TrainingLevel })
  @IsEnum(TrainingLevel)
  level!: TrainingLevel;

  @ApiPropertyOptional({ enum: TrainingStatus, default: TrainingStatus.DRAFT })
  @IsOptional()
  @IsEnum(TrainingStatus)
  status?: TrainingStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @ApiPropertyOptional({ description: 'Idioma', default: 'pt' })
  @IsOptional()
  @IsString()
  language?: string;

  @ApiPropertyOptional({ description: 'Carga horária total em horas' })
  @IsOptional()
  @IsNumber()
  @Min(0.5)
  workloadHours?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  thumbnailUrl?: string;

  @ApiPropertyOptional({ description: 'Pré-requisitos em texto' })
  @IsOptional()
  @IsString()
  prerequisites?: string;

  @ApiPropertyOptional({ description: 'ID do instrutor principal' })
  @IsOptional()
  @IsInt()
  instructorId?: number;

  @ApiPropertyOptional({ description: 'IDs de instrutores adicionais' })
  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  coInstructorIds?: number[];

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  mandatory?: boolean;

  @ApiPropertyOptional({ description: 'Nota mínima para certificado (0-100)' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  passingScore?: number;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  issueCertificate?: boolean;

  @ApiPropertyOptional({ description: 'Custo do treinamento (Kz)' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  cost?: number;

  @ApiPropertyOptional({ description: 'IDs de competências associadas' })
  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  competencyIds?: number[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  endDate?: string;

  @ApiPropertyOptional({ description: 'Prazo de conclusão (dias desde inscrição)' })
  @IsOptional()
  @IsInt()
  @Min(1)
  completionDeadlineDays?: number;

  // ─── Informações adicionais ─────────────────────────────────────────────

  @ApiPropertyOptional({ description: 'Código da formação (único)' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  code?: string;

  @ApiPropertyOptional({ description: 'Área temática' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  thematicArea?: string;

  @ApiPropertyOptional({ description: 'Entidade formadora' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  trainingEntity?: string;

  @ApiPropertyOptional({ description: 'Descrição específica desta turma/edição' })
  @IsOptional()
  @IsString()
  classDescription?: string;

  @ApiPropertyOptional({
    description:
      'Detalhes da modalidade: plataforma/link (ONLINE), sala virtual (VIRTUAL_ROOM) ou instruções de acesso (HYBRID)',
  })
  @IsOptional()
  @IsString()
  modalityDetails?: string;

  // ─── Planeamento ─────────────────────────────────────────────────────────

  @ApiPropertyOptional({ description: 'Horário (ex: 09h00-13h00)' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  schedule?: string;

  @ApiPropertyOptional({ description: 'Local/sala (default para as sessões)' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  roomLocation?: string;

  @ApiPropertyOptional({ description: 'Capacidade (default para as sessões)' })
  @IsOptional()
  @IsInt()
  @Min(0)
  capacity?: number;

  @ApiPropertyOptional({ description: 'Número de sessões planeadas' })
  @IsOptional()
  @IsInt()
  @Min(0)
  plannedSessionsCount?: number;

  // ─── Participantes ───────────────────────────────────────────────────────

  @ApiPropertyOptional({
    default: false,
    description: 'Inscrição fica PENDING_APPROVAL até ser aprovada/rejeitada',
  })
  @IsOptional()
  @IsBoolean()
  requiresApproval?: boolean;

  // ─── Operação ────────────────────────────────────────────────────────────

  @ApiPropertyOptional({ type: [String], description: 'Recursos necessários' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  requiredResources?: string[];

  // ─── Custos ──────────────────────────────────────────────────────────────

  @ApiPropertyOptional({ description: 'Custo do formador (Kz)' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  instructorCost?: number;

  @ApiPropertyOptional({ description: 'Custo de material (Kz)' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  materialCost?: number;

  @ApiPropertyOptional({ description: 'Custo de transporte (Kz)' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  transportCost?: number;

  @ApiPropertyOptional({ description: 'Custo de alimentação (Kz)' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  foodCost?: number;

  @ApiPropertyOptional({ description: 'Custo de alojamento (Kz)' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  lodgingCost?: number;

  @ApiPropertyOptional({ description: 'Outros custos (Kz)' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  otherCosts?: number;

  @ApiPropertyOptional({ description: 'Orçamento previsto (Kz)' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  plannedBudget?: number;

  // ─── docs/trainings-detalhado.md pt.3 — campos novos de "Nova Formação" ──

  @ApiPropertyOptional({ enum: TrainingPriority, default: TrainingPriority.MEDIUM })
  @IsOptional()
  @IsEnum(TrainingPriority)
  priority?: TrainingPriority;

  @ApiPropertyOptional({ description: 'ID do responsável (distinto do formador)' })
  @IsOptional()
  @IsInt()
  responsibleId?: number;

  @ApiPropertyOptional({ description: 'ID do Plano de Formação a que pertence' })
  @IsOptional()
  @IsInt()
  trainingPlanId?: number;

  @ApiPropertyOptional({ description: 'ID do curso associado' })
  @IsOptional()
  @IsInt()
  courseId?: number;

  @ApiPropertyOptional({ description: 'ID do percurso de aprendizagem associado' })
  @IsOptional()
  @IsInt()
  learningPathId?: number;

  @ApiPropertyOptional({ type: [Number], description: 'IDs de departamentos abrangidos' })
  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  targetDeptIds?: number[];

  @ApiPropertyOptional({ type: [Number], description: 'IDs de unidades abrangidas' })
  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  targetUnitIds?: number[];

  @ApiPropertyOptional({ type: [Number], description: 'IDs de cargos abrangidos' })
  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  targetPositionIds?: number[];
}

// ─── Cancelar / concluir formação ──────────────────────────────────────────────

export class CancelTrainingDto {
  @ApiPropertyOptional({ description: 'Motivo do cancelamento' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class UpdateTrainingDto extends PartialType(CreateTrainingDto) {}

// ─── Session ──────────────────────────────────────────────────────────────────

export class CreateTrainingSessionDto {
  @ApiProperty()
  @IsInt()
  trainingId!: number;

  @ApiProperty({ description: 'Data e hora da sessão' })
  @IsDateString()
  sessionDate!: string;

  @ApiPropertyOptional({ description: 'Data de fim (opcional)' })
  @IsOptional()
  @IsDateString()
  sessionEndDate?: string;

  @ApiProperty({ description: 'Duração em minutos' })
  @IsInt()
  @Min(15)
  durationMinutes!: number;

  @ApiProperty({ enum: SessionModality })
  @IsEnum(SessionModality)
  modality!: SessionModality;

  @ApiPropertyOptional({ description: 'Local físico (presencial)' })
  @IsOptional()
  @IsString()
  location?: string;

  @ApiPropertyOptional({ description: 'Link da reunião online' })
  @IsOptional()
  @IsString()
  meetingUrl?: string;

  @ApiPropertyOptional({ description: 'Vagas máximas (0 = ilimitado)' })
  @IsOptional()
  @IsInt()
  @Min(0)
  maxParticipants?: number;

  @ApiPropertyOptional({ description: 'Habilitar lista de espera?' })
  @IsOptional()
  @IsBoolean()
  waitlistEnabled?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}

export class UpdateTrainingSessionDto extends PartialType(CreateTrainingSessionDto) {}

// ─── Participant ──────────────────────────────────────────────────────────────

export class RegisterParticipantDto {
  @ApiProperty()
  @IsInt()
  sessionId!: number;

  @ApiProperty()
  @IsInt()
  userId!: number;

  @ApiPropertyOptional({
    description: 'Registar mesmo que tenha vagas esgotadas? (vai para lista de espera)',
  })
  @IsOptional()
  @IsBoolean()
  allowWaitlist?: boolean;
}

export class TrainingsUpdateParticipantStatusDto {
  @ApiProperty({ enum: ParticipantStatus })
  @IsEnum(ParticipantStatus)
  status!: ParticipantStatus;

  @ApiPropertyOptional({ description: 'Nota final (se COMPLETED)' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  finalScore?: number;

  @ApiPropertyOptional({ description: 'Motivo de cancelamento (se CANCELLED)' })
  @IsOptional()
  @IsString()
  cancellationReason?: string;

  @ApiPropertyOptional({ description: 'Horas presenciais registadas' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  attendedHours?: number;
}

// ─── Presença em massa ────────────────────────────────────────────────────────

export class BulkAttendanceDto {
  @ApiProperty()
  @IsInt()
  sessionId!: number;

  @ApiProperty({ description: 'Lista de userId dos presentes' })
  @IsArray()
  @IsInt({ each: true })
  presentUserIds!: number[];
}

// ─── Aprovações ───────────────────────────────────────────────────────────────

export class RejectParticipantDto {
  @ApiPropertyOptional({ description: 'Motivo da rejeição' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

// ─── Comunicação/notificações ─────────────────────────────────────────────────

export class NotifyTrainingDto {
  @ApiProperty({ description: 'Mensagem a enviar a todos os participantes activos' })
  @IsString()
  @MaxLength(1000)
  message!: string;
}

// ─── Documentos administrativos ────────────────────────────────────────────────

export class CreateTrainingDocumentDto {
  @ApiProperty()
  @IsString()
  @MaxLength(200)
  name!: string;

  @ApiProperty({ description: 'URL do ficheiro (HTTPS, domínio autorizado)' })
  @IsString()
  @IsAllowedFileUrl()
  fileUrl!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  category?: string;
}

// ─── Avaliação — associar avaliações existentes ────────────────────────────────

export class LinkTrainingAssessmentDto {
  @ApiProperty({ description: 'ID de um Assessment já existente' })
  @IsInt()
  assessmentId!: number;

  @ApiProperty({ enum: TrainingAssessmentRole })
  @IsEnum(TrainingAssessmentRole)
  role!: TrainingAssessmentRole;
}

// ─── Rating do treinamento ────────────────────────────────────────────────────

export class RateTrainingDto {
  @ApiProperty()
  @IsInt()
  trainingId!: number;

  @ApiProperty({ description: 'Avaliação 1-5' })
  @IsInt()
  @Min(1)
  @Max(5)
  rating!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  comment?: string;
}

// ─── Filters ──────────────────────────────────────────────────────────────────

export class TrainingFilterDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ enum: TrainingType })
  @IsOptional()
  @IsEnum(TrainingType)
  type?: TrainingType;

  @ApiPropertyOptional({ enum: TrainingLevel })
  @IsOptional()
  @IsEnum(TrainingLevel)
  level?: TrainingLevel;

  @ApiPropertyOptional({ enum: TrainingStatus })
  @IsOptional()
  @IsEnum(TrainingStatus)
  status?: TrainingStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  instructorId?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  trainingPlanId?: number;

  @ApiPropertyOptional({ enum: TrainingPriority })
  @IsOptional()
  @IsEnum(TrainingPriority)
  priority?: TrainingPriority;

  // @Type(() => Boolean) coage '?mandatory=false' para true — ver
  // [[project-innova-boolean-query-filter-coercion]].
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => String)
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  mandatory?: boolean;

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

// ─── Calendário (docs/trainings-detalhado.md pt.4) ─────────────────────────────

export class TrainingCalendarFilterDto {
  @ApiPropertyOptional({ description: 'Início do intervalo (ISO)' })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({ description: 'Fim do intervalo (ISO)' })
  @IsOptional()
  @IsDateString()
  to?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  trainingId?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  instructorId?: number;

  @ApiPropertyOptional({ description: 'Local/sala (texto livre, corresponde a location/roomLocation)' })
  @IsOptional()
  @IsString()
  location?: string;

  @ApiPropertyOptional({ enum: SessionModality })
  @IsOptional()
  @IsEnum(SessionModality)
  modality?: SessionModality;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  departmentId?: number;

  @ApiPropertyOptional({ enum: TrainingStatus })
  @IsOptional()
  @IsEnum(TrainingStatus)
  status?: TrainingStatus;
}

// ═════════════════════════════════════════════════════════════════════════════
// Plano de Formação (docs/trainings-detalhado.md pt.2)
// ═════════════════════════════════════════════════════════════════════════════

export class CreateTrainingPlanDto {
  @ApiProperty({ example: 'Plano de Formação 2027' })
  @IsString()
  @MaxLength(200)
  name!: string;

  @ApiPropertyOptional({ description: 'Código (único)' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  code?: string;

  @ApiProperty({ example: 2027 })
  @IsInt()
  @Min(2000)
  @Max(2100)
  year!: number;

  @ApiPropertyOptional({ enum: TrainingPlanPeriod, default: TrainingPlanPeriod.ANNUAL })
  @IsOptional()
  @IsEnum(TrainingPlanPeriod)
  period?: TrainingPlanPeriod;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  objectives?: string;

  @ApiPropertyOptional({ description: 'Necessidades de formação identificadas' })
  @IsOptional()
  @IsString()
  identifiedNeeds?: string;

  @ApiPropertyOptional({ description: 'Prioridades estratégicas' })
  @IsOptional()
  @IsString()
  strategicPriorities?: string;

  @ApiPropertyOptional({ type: [Number] })
  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  targetDeptIds?: number[];

  @ApiPropertyOptional({ type: [Number] })
  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  targetUnitIds?: number[];

  @ApiPropertyOptional({ type: [Number] })
  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  targetPositionIds?: number[];

  @ApiPropertyOptional({ description: 'Público-alvo (texto livre)' })
  @IsOptional()
  @IsString()
  targetAudience?: string;

  @ApiPropertyOptional({ description: 'IDs de competências a desenvolver' })
  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  competencyIds?: number[];

  @ApiPropertyOptional({ description: 'Número previsto de participantes' })
  @IsOptional()
  @IsInt()
  @Min(0)
  expectedParticipants?: number;

  @ApiPropertyOptional({ description: 'Horas previstas' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  expectedHours?: number;

  @ApiPropertyOptional({ enum: TrainingType, description: 'Modalidade prevista' })
  @IsOptional()
  @IsEnum(TrainingType)
  modality?: TrainingType;

  @ApiPropertyOptional({ description: 'Orçamento previsto (Kz)' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  plannedBudget?: number;

  @ApiPropertyOptional({ enum: TrainingPriority, default: TrainingPriority.MEDIUM })
  @IsOptional()
  @IsEnum(TrainingPriority)
  priority?: TrainingPriority;

  @ApiPropertyOptional({ description: 'ID do responsável pelo plano' })
  @IsOptional()
  @IsInt()
  responsibleId?: number;

  @ApiPropertyOptional({ description: 'ID do aprovador' })
  @IsOptional()
  @IsInt()
  approverId?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  endDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}

export class UpdateTrainingPlanDto extends PartialType(CreateTrainingPlanDto) {}

export class RejectTrainingPlanDto {
  @ApiPropertyOptional({ description: 'Motivo da rejeição' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class AddTrainingToPlanDto {
  @ApiProperty({ description: 'ID de uma Training já existente a associar ao plano' })
  @IsInt()
  trainingId!: number;
}

export class TrainingPlanFilterDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  year?: number;

  @ApiPropertyOptional({ enum: TrainingPlanPeriod })
  @IsOptional()
  @IsEnum(TrainingPlanPeriod)
  period?: TrainingPlanPeriod;

  @ApiPropertyOptional({ enum: TrainingPlanStatus })
  @IsOptional()
  @IsEnum(TrainingPlanStatus)
  status?: TrainingPlanStatus;

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
