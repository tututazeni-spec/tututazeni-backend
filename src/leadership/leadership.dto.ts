import {
  IsString,
  IsOptional,
  IsBoolean,
  IsInt,
  IsEnum,
  IsIn,
  IsArray,
  IsNumber,
  IsDateString,
  Min,
  Max,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type, Transform } from 'class-transformer';
import {
  LeadershipProgramLevel as ProgramLevel,
  ProgramStatus,
  ParticipantStatus,
  OneOnOneStatus,
} from '@prisma/client';
import { BaseFilterDto } from '../common/dtos/pagination.dto';

// ─── Enums ────────────────────────────────────────────────────────────────────

export { ProgramLevel, ProgramStatus, ParticipantStatus, OneOnOneStatus };

// A Task 1 alargou `ProgramStatus` e `ParticipantStatus` com o ciclo de vida do
// programa corporativo, mas a máquina de estados que valida as transições só
// chega na Task 2. Até lá os endpoints existentes continuam a aceitar
// exactamente o conjunto de valores legado — sem esta restrição um caller podia
// saltar directamente para COMPLETED/CANCELLED (ou marcar um participante como
// SELECTED/REJECTED) sem qualquer validação de pré-requisitos.
// TODO(Task 2): widen to full ProgramStatus once transition guard exists
export const LEGACY_PROGRAM_STATUS = ['DRAFT', 'ACTIVE', 'ARCHIVED'] as const;
export type LegacyProgramStatus = (typeof LEGACY_PROGRAM_STATUS)[number];

// TODO(Task 2): widen to full ParticipantStatus once transition guard exists
export const LEGACY_PARTICIPANT_STATUS = [
  'ENROLLED',
  'IN_PROGRESS',
  'COMPLETED',
  'WITHDRAWN',
] as const;
export type LegacyParticipantStatus = (typeof LEGACY_PARTICIPANT_STATUS)[number];

export enum LeadershipCompetency {
  COMMUNICATION = 'COMMUNICATION',
  DEVELOPMENT = 'DEVELOPMENT',
  RECOGNITION = 'RECOGNITION',
  AUTONOMY = 'AUTONOMY',
  FAIRNESS = 'FAIRNESS',
  EXAMPLE = 'EXAMPLE',
  STRATEGY = 'STRATEGY',
  RESILIENCE = 'RESILIENCE',
}

// ─── Leadership Program ───────────────────────────────────────────────────────

export class CreateLeadershipProgramDto {
  @ApiProperty({ example: 'Programa Líderes do Futuro 2026' })
  @IsString()
  @MaxLength(200)
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ enum: ProgramLevel })
  @IsEnum(ProgramLevel)
  level!: ProgramLevel;

  @ApiPropertyOptional({ enum: [...LEGACY_PROGRAM_STATUS], default: 'DRAFT' })
  @IsOptional()
  @IsIn(LEGACY_PROGRAM_STATUS)
  status?: LegacyProgramStatus;

  @ApiPropertyOptional({ description: 'Duração em semanas' })
  @IsOptional()
  @IsInt()
  @Min(1)
  durationWeeks?: number;

  @ApiPropertyOptional({ description: 'Trilha de Aprendizagem associada' })
  @IsOptional()
  @IsInt()
  learningPathId?: number;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  mandatory?: boolean;

  @ApiPropertyOptional({ description: 'Pontuação mínima de liderança para acesso' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1000)
  minLeadershipScore?: number;

  @ApiPropertyOptional({ description: 'Data de início' })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({ description: 'Data de fim' })
  @IsOptional()
  @IsDateString()
  endDate?: string;
}

export class UpdateLeadershipProgramDto extends PartialType(CreateLeadershipProgramDto) {}

// ─── Enroll ───────────────────────────────────────────────────────────────────

export class EnrollLeadershipDto {
  @ApiProperty()
  @IsInt()
  userId!: number;

  @ApiProperty()
  @IsInt()
  programId!: number;
}

export class UpdateParticipantProgressDto {
  @ApiProperty({ description: 'Progresso 0-100' })
  @IsInt()
  @Min(0)
  @Max(100)
  progress!: number;

  @ApiPropertyOptional({ enum: [...LEGACY_PARTICIPANT_STATUS] })
  @IsOptional()
  @IsIn(LEGACY_PARTICIPANT_STATUS)
  status?: LegacyParticipantStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}

// ─── One-on-One ───────────────────────────────────────────────────────────────

export class LeadershipCreateOneOnOneDto {
  @ApiProperty({ description: 'ID do liderado' })
  @IsInt()
  subordinateId!: number;

  @ApiProperty({ description: 'Data e hora agendada' })
  @IsDateString()
  scheduledAt!: string;

  @ApiPropertyOptional({ description: 'Duração em minutos', default: 30 })
  @IsOptional()
  @IsInt()
  @Min(15)
  durationMinutes?: number;

  @ApiPropertyOptional({ description: 'Pauta/agenda da reunião' })
  @IsOptional()
  @IsString()
  agenda?: string;

  @ApiPropertyOptional({ description: 'Link da reunião (Zoom, Teams, etc.)' })
  @IsOptional()
  @IsString()
  meetingUrl?: string;
}

export class CompleteOneOnOneDto {
  @ApiProperty()
  @IsInt()
  oneOnOneId!: number;

  @ApiProperty({ description: 'Acta da reunião' })
  @IsString()
  minutes!: string;

  @ApiPropertyOptional({ description: 'Acções a Executar / próximos passos' })
  @IsOptional()
  @IsString()
  actionItems?: string;

  @ApiPropertyOptional({ description: 'Próxima reunião (data)' })
  @IsOptional()
  @IsDateString()
  nextMeetingDate?: string;
}

// ─── Feedback 360° de Liderança ───────────────────────────────────────────────

export class Leadership360ResponseDto {
  @ApiProperty({ enum: LeadershipCompetency })
  @IsEnum(LeadershipCompetency)
  competency!: LeadershipCompetency;

  @ApiProperty({ description: 'Score 1-5' })
  @IsInt()
  @Min(1)
  @Max(5)
  score!: number;
}

export class Submit360FeedbackDto {
  @ApiProperty({ description: 'ID do líder avaliado' })
  @IsInt()
  leaderId!: number;

  @ApiPropertyOptional({ description: 'ID do ciclo (opcional)' })
  @IsOptional()
  @IsInt()
  cycleId?: number;

  @ApiProperty({ type: [Leadership360ResponseDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => Leadership360ResponseDto)
  responses!: Leadership360ResponseDto[];

  @ApiPropertyOptional({ description: 'Feedback qualitativo (campo aberto)' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  qualitativeFeedback?: string;

  @ApiPropertyOptional({ description: 'Avaliação anónima?' })
  @IsOptional()
  @IsBoolean()
  anonymous?: boolean;
}

// ─── Pulse Survey ─────────────────────────────────────────────────────────────

export class SubmitPulseDto {
  @ApiProperty({ description: 'ID do líder avaliado' })
  @IsInt()
  leaderId!: number;

  @ApiProperty({ description: 'Pontuação geral (1-5)' })
  @IsInt()
  @Min(1)
  @Max(5)
  overallScore!: number;

  @ApiPropertyOptional({ description: 'Resposta à pergunta 1' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  q1?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  q2?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  q3?: string;
}

// ─── Mentoring ────────────────────────────────────────────────────────────────

export class CreateMentoringDto {
  @ApiProperty({ description: 'ID do mentor' })
  @IsInt()
  mentorId!: number;

  @ApiProperty({ description: 'ID do mentorado' })
  @IsInt()
  menteeId!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  objective?: string;

  @ApiPropertyOptional({ description: 'Duração prevista em meses' })
  @IsOptional()
  @IsInt()
  @Min(1)
  durationMonths?: number;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  reverseMentoring?: boolean;
}

export class LogMentoringSessionDto {
  @ApiProperty()
  @IsInt()
  mentoringId!: number;

  @ApiProperty({ description: 'Data da sessão' })
  @IsDateString()
  sessionDate!: string;

  @ApiPropertyOptional({ description: 'Duração em minutos' })
  @IsOptional()
  @IsInt()
  @Min(15)
  durationMinutes?: number;

  @ApiProperty()
  @IsString()
  @MaxLength(2000)
  summary!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  actionItems?: string;

  @ApiPropertyOptional({ description: 'Classificação da sessão (1-5)' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  rating?: number;
}

// ─── Team Health ──────────────────────────────────────────────────────────────

export class UpsertTeamHealthDto {
  @ApiPropertyOptional({ description: 'Score de engajamento (0-100)' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  engagementScore?: number;

  @ApiPropertyOptional({ description: 'Taxa de rotatividade 12m (%)' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  turnoverRate?: number;

  @ApiPropertyOptional({ description: 'Taxa de absenteísmo (%)' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  absenteeismRate?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  pdisCompletedPct?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  evaluationsOnTimePct?: number;
}

// ─── Kudos / Reconhecimento ───────────────────────────────────────────────────

export class SendKudosDto {
  @ApiProperty({ description: 'ID do destinatário' })
  @IsInt()
  receiverId!: number;

  @ApiProperty()
  @IsString()
  @MaxLength(500)
  message!: string;

  @ApiPropertyOptional({ description: 'Distintivo/ícone do reconhecimento' })
  @IsOptional()
  @IsString()
  badge?: string;
}

// ─── Filter ───────────────────────────────────────────────────────────────────

export class LeadershipFilterDto extends BaseFilterDto {
  @ApiPropertyOptional({ enum: ProgramLevel })
  @IsOptional()
  @IsEnum(ProgramLevel)
  level?: ProgramLevel;

  @ApiPropertyOptional({ enum: [...LEGACY_PROGRAM_STATUS] })
  @IsOptional()
  @IsIn(LEGACY_PROGRAM_STATUS)
  status?: LegacyProgramStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => String)
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  mandatory?: boolean;
}
