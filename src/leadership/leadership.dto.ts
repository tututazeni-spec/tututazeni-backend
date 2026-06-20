import {
  IsString,
  IsOptional,
  IsBoolean,
  IsInt,
  IsEnum,
  IsArray,
  IsNumber,
  IsDateString,
  Min,
  Max,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';

// ─── Enums ────────────────────────────────────────────────────────────────────

export enum ProgramLevel {
  INITIAL = 'INITIAL',
  INTERMEDIATE = 'INTERMEDIATE',
  ADVANCED = 'ADVANCED',
}

export enum ProgramStatus {
  DRAFT = 'DRAFT',
  ACTIVE = 'ACTIVE',
  ARCHIVED = 'ARCHIVED',
}

export enum ParticipantStatus {
  ENROLLED = 'ENROLLED',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
  WITHDRAWN = 'WITHDRAWN',
}

export enum OneOnOneStatus {
  SCHEDULED = 'SCHEDULED',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
  RESCHEDULED = 'RESCHEDULED',
}

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

export enum MentoringStatus {
  ACTIVE = 'ACTIVE',
  PAUSED = 'PAUSED',
  COMPLETED = 'COMPLETED',
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

  @ApiPropertyOptional({ enum: ProgramStatus, default: ProgramStatus.DRAFT })
  @IsOptional()
  @IsEnum(ProgramStatus)
  status?: ProgramStatus;

  @ApiPropertyOptional({ description: 'Duração em semanas' })
  @IsOptional()
  @IsInt()
  @Min(1)
  durationWeeks?: number;

  @ApiPropertyOptional({ description: 'Learning Path associada' })
  @IsOptional()
  @IsInt()
  learningPathId?: number;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  mandatory?: boolean;

  @ApiPropertyOptional({ description: 'Score mínimo de liderança para acesso' })
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

  @ApiPropertyOptional({ enum: ParticipantStatus })
  @IsOptional()
  @IsEnum(ParticipantStatus)
  status?: ParticipantStatus;

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

export class UpdateOneOnOneDto extends PartialType(LeadershipCreateOneOnOneDto) {}

export class CompleteOneOnOneDto {
  @ApiProperty()
  @IsInt()
  oneOnOneId!: number;

  @ApiProperty({ description: 'Ata da reunião' })
  @IsString()
  minutes!: string;

  @ApiPropertyOptional({ description: 'Action items / próximos passos' })
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

  @ApiProperty({ description: 'Score geral (1-5)' })
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

  @ApiPropertyOptional({ description: 'Rating da sessão (1-5)' })
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

  @ApiPropertyOptional({ description: 'Taxa de turnover 12m (%)' })
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

  @ApiPropertyOptional({ description: 'Badge/ícone do kudo' })
  @IsOptional()
  @IsString()
  badge?: string;
}

// ─── Filter ───────────────────────────────────────────────────────────────────

export class LeadershipFilterDto {
  @ApiPropertyOptional({ enum: ProgramLevel })
  @IsOptional()
  @IsEnum(ProgramLevel)
  level?: ProgramLevel;

  @ApiPropertyOptional({ enum: ProgramStatus })
  @IsOptional()
  @IsEnum(ProgramStatus)
  status?: ProgramStatus;

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
