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
import { Type } from 'class-transformer';

// ─── Enums ────────────────────────────────────────────────────────────────────

export enum TrainingType {
  PRESENTIAL = 'PRESENTIAL',
  ONLINE = 'ONLINE',
  HYBRID = 'HYBRID',
}

export enum TrainingLevel {
  BEGINNER = 'BEGINNER',
  INTERMEDIATE = 'INTERMEDIATE',
  ADVANCED = 'ADVANCED',
}

export enum TrainingStatus {
  DRAFT = 'DRAFT',
  PUBLISHED = 'PUBLISHED',
  ARCHIVED = 'ARCHIVED',
}

export enum ParticipantStatus {
  WAITLIST = 'WAITLIST',
  REGISTERED = 'REGISTERED',
  ATTENDED = 'ATTENDED',
  ABSENT = 'ABSENT',
  CANCELLED = 'CANCELLED',
  COMPLETED = 'COMPLETED',
}

export enum SessionModality {
  PRESENTIAL = 'PRESENTIAL',
  ONLINE = 'ONLINE',
  HYBRID = 'HYBRID',
}

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

export class UpdateParticipantStatusDto {
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
  @IsBoolean()
  @Type(() => Boolean)
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
