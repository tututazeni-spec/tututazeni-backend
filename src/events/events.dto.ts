// src/events/events.dto.ts
import {
  IsString,
  IsOptional,
  IsInt,
  IsDateString,
  IsEnum,
  IsBoolean,
  IsArray,
  Min,
  Max,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';

// ─── Enums ────────────────────────────────────────────────────────────────────

export enum EventType {
  TRAINING = 'TRAINING',
  WORKSHOP = 'WORKSHOP',
  WEBINAR = 'WEBINAR',
  LIVE_CLASS = 'LIVE_CLASS',
  HACKATHON = 'HACKATHON',
  MENTORING = 'MENTORING',
  CORPORATE = 'CORPORATE',
  ONBOARDING = 'ONBOARDING',
  NETWORKING = 'NETWORKING',
  EXTERNAL = 'EXTERNAL',
  TALK = 'TALK',
}

export enum EventModalidade {
  ONLINE = 'ONLINE',
  PRESENCIAL = 'PRESENCIAL',
  HYBRID = 'HYBRID',
}

export enum EventStatus {
  DRAFT = 'DRAFT',
  PUBLISHED = 'PUBLISHED',
  LIVE = 'LIVE',
  ENDED = 'ENDED',
  CANCELLED = 'CANCELLED',
}

export enum ParticipantStatus {
  PENDING = 'PENDING',
  CONFIRMED = 'CONFIRMED',
  WAITLIST = 'WAITLIST',
  PRESENT = 'PRESENT',
  ABSENT = 'ABSENT',
  CANCELLED = 'CANCELLED',
  NO_SHOW = 'NO_SHOW',
}

// ─── Event ────────────────────────────────────────────────────────────────────

export class CreateEventDto {
  @ApiProperty()
  @IsString()
  @MaxLength(200)
  title!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ enum: EventType, default: EventType.TRAINING })
  @IsEnum(EventType)
  type!: EventType;

  @ApiPropertyOptional({ enum: EventModalidade, default: EventModalidade.ONLINE })
  @IsOptional()
  @IsEnum(EventModalidade)
  modalidade?: EventModalidade;

  @ApiProperty()
  @IsDateString()
  startAt!: string;

  @ApiProperty()
  @IsDateString()
  endAt!: string;

  @ApiPropertyOptional({ description: 'Localização física' })
  @IsOptional()
  @IsString()
  location?: string;

  @ApiPropertyOptional({ description: 'Link para evento virtual (Zoom, Teams, Meet)' })
  @IsOptional()
  @IsString()
  meetingUrl?: string;

  @ApiPropertyOptional({ description: 'Senha do meeting' })
  @IsOptional()
  @IsString()
  meetingPassword?: string;

  @ApiPropertyOptional({ description: 'Capacidade máxima de participantes', default: 50 })
  @IsOptional()
  @IsInt()
  @Min(1)
  maxCapacity?: number;

  @ApiPropertyOptional({ description: 'Habilitar lista de espera automática', default: true })
  @IsOptional()
  @IsBoolean()
  waitlistEnabled?: boolean;

  @ApiPropertyOptional({ description: 'Emitir certificado automático ao concluir' })
  @IsOptional()
  @IsBoolean()
  certificateEnabled?: boolean;

  @ApiPropertyOptional({ description: 'Presença mínima para certificado (0-100)', default: 80 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  minAttendancePercent?: number;

  @ApiPropertyOptional({ description: 'Tags do evento' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @ApiPropertyOptional({ description: 'IDs de departamentos restritos' })
  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  restrictedDeptIds?: number[];

  @ApiPropertyOptional({ description: 'Inscrição obrigatória (tracking de compliance)' })
  @IsOptional()
  @IsBoolean()
  mandatory?: boolean;

  @ApiPropertyOptional({ description: 'ID do curso associado' })
  @IsOptional()
  @IsInt()
  courseId?: number;

  @ApiPropertyOptional({ description: 'URL da imagem/banner' })
  @IsOptional()
  @IsString()
  bannerUrl?: string;
}

export class UpdateEventDto extends PartialType(CreateEventDto) {
  @ApiPropertyOptional({ enum: EventStatus })
  @IsOptional()
  @IsEnum(EventStatus)
  status?: EventStatus;
}

// ─── Participante ─────────────────────────────────────────────────────────────

export class UpdateParticipantStatusDto {
  @ApiProperty({ enum: ParticipantStatus })
  @IsEnum(ParticipantStatus)
  status!: ParticipantStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  note?: string;
}

// ─── Check-in ─────────────────────────────────────────────────────────────────

export class CheckInDto {
  @ApiProperty({ description: 'ID do evento' })
  @IsInt()
  eventId!: number;

  @ApiPropertyOptional({ description: 'Código QR (para presencial)' })
  @IsOptional()
  @IsString()
  qrCode?: string;
}

// ─── Feedback ─────────────────────────────────────────────────────────────────

export class SubmitFeedbackDto {
  @ApiProperty({ description: 'NPS 1-10' })
  @IsInt()
  @Min(1)
  @Max(10)
  nps!: number;

  @ApiPropertyOptional({ description: 'Rating do evento 1-5' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  rating?: number;

  @ApiPropertyOptional({ description: 'Avaliação do instrutor 1-5' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  instructorRating?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  comment?: string;
}

// ─── Filters ──────────────────────────────────────────────────────────────────

export class EventFilterDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ enum: EventType })
  @IsOptional()
  @IsEnum(EventType)
  type?: EventType;

  @ApiPropertyOptional({ enum: EventModalidade })
  @IsOptional()
  @IsEnum(EventModalidade)
  modalidade?: EventModalidade;

  @ApiPropertyOptional({ enum: EventStatus })
  @IsOptional()
  @IsEnum(EventStatus)
  status?: EventStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  organizerId?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  upcoming?: boolean;

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
