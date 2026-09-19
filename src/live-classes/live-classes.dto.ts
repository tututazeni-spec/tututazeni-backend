import {
  IsString,
  IsInt,
  IsOptional,
  IsDateString,
  IsEnum,
  IsBoolean,
  IsArray,
  IsObject,
  Min,
  Max,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  LiveClassType,
  LiveClassStatus,
  LiveClassRecurrence,
  LiveClassEnrollmentMode,
  LiveAttendanceStatus,
  SessionModality,
} from '@prisma/client';
import { BaseFilterDto } from '../common/dtos/pagination.dto';

export {
  LiveClassType,
  LiveClassStatus,
  LiveClassRecurrence,
  LiveClassEnrollmentMode,
  LiveAttendanceStatus,
  SessionModality,
};

// Chaves aceites em `notifySettings` (etapa 9): onEnroll, reminder24h,
// reminder1h, onStart, onReschedule, onCancel, onRecordingAvailable — todas
// boolean. Sem scheduler para os lembretes temporizados (24h/1h antes); só
// os eventos que já acontecem em código (inscrição/alteração/cancelamento)
// disparam notificação de facto. Ver nota em live-classes.service.ts.

export class CreateLiveClassDto {
  // Etapa 1 — Informações gerais
  @ApiProperty() @IsInt() courseId!: number;
  @ApiProperty() @IsString() topic!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() code?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
  @ApiPropertyOptional({ enum: LiveClassType })
  @IsOptional()
  @IsEnum(LiveClassType)
  type?: LiveClassType;
  @ApiPropertyOptional() @IsOptional() @IsInt() moduleId?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() lessonId?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() instructorId?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() coInstructorId?: number;

  // Etapa 2 — Data e horário / recorrência
  @ApiProperty() @IsDateString() scheduledAt!: string;
  @ApiProperty() @IsInt() duration!: number;
  @ApiPropertyOptional() @IsOptional() @IsString() timezone?: string;
  @ApiPropertyOptional({ enum: LiveClassRecurrence })
  @IsOptional()
  @IsEnum(LiveClassRecurrence)
  recurrence?: LiveClassRecurrence;
  @ApiPropertyOptional() @IsOptional() @IsDateString() recurrenceEndDate?: string;
  @ApiPropertyOptional({ type: [Number], description: '0=Domingo … 6=Sábado' })
  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  recurrenceDaysOfWeek?: number[];

  // Etapa 3 — Modalidade
  @ApiPropertyOptional({ enum: SessionModality })
  @IsOptional()
  @IsEnum(SessionModality)
  modality?: SessionModality;
  @ApiPropertyOptional() @IsOptional() @IsString() zoomMeetingId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() location?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() building?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() room?: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() capacity?: number;

  // Etapa 4 — Participantes
  @ApiPropertyOptional({ enum: LiveClassEnrollmentMode })
  @IsOptional()
  @IsEnum(LiveClassEnrollmentMode)
  enrollmentMode?: LiveClassEnrollmentMode;
  @ApiPropertyOptional() @IsOptional() @IsInt() maxParticipants?: number;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() waitlistEnabled?: boolean;
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

  // Etapa 5 — Conteúdo
  @ApiPropertyOptional() @IsOptional() @IsString() objectives?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() agenda?: string;
  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  topics?: string[];
  @ApiPropertyOptional({ type: [Number], description: 'IDs de documentos da Biblioteca' })
  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  materialDocumentIds?: number[];

  // Etapa 6 — Presença
  @ApiPropertyOptional() @IsOptional() @IsBoolean() attendanceAutoRegister?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() attendanceRequired?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) @Max(100) minAttendancePercent?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) lateToleranceMinutes?: number;

  // Etapa 7 — Gravação
  @ApiPropertyOptional() @IsOptional() @IsString() recordingUrl?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() recordSession?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsDateString() recordingExpiresAt?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() allowRecordingDownload?: boolean;

  // Etapa 8 — Avaliação
  @ApiPropertyOptional() @IsOptional() @IsBoolean() evaluationRequired?: boolean;

  // Etapa 9 — Notificações
  @ApiPropertyOptional({ type: Object, description: 'Flags booleanas — ver comentário acima' })
  @IsOptional()
  @IsObject()
  notifySettings?: Record<string, boolean>;
}
export class UpdateLiveClassDto extends PartialType(CreateLiveClassDto) {}

export class PostponeLiveClassDto {
  @ApiProperty() @IsDateString() scheduledAt!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() reason?: string;
}

export class CancelLiveClassDto {
  @ApiPropertyOptional() @IsOptional() @IsString() reason?: string;
}

export class CreateLiveClassSessionDto {
  @ApiProperty() @IsDateString() sessionDate!: string;
  @ApiProperty() @IsInt() durationMinutes!: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() instructorId?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() location?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() meetingUrl?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string;
}
export class UpdateLiveClassSessionDto extends PartialType(CreateLiveClassSessionDto) {
  @ApiPropertyOptional({ enum: LiveClassStatus })
  @IsOptional()
  @IsEnum(LiveClassStatus)
  status?: LiveClassStatus;
  @ApiPropertyOptional() @IsOptional() @IsString() recordingUrl?: string;
}

export class LiveChatMessageDto {
  @ApiProperty() @IsString() message!: string;
}

export class PostClassResponseDto {
  @ApiProperty() @IsInt() evaluationId!: number;
  @ApiProperty() @IsInt() rating!: number;
  @ApiPropertyOptional() @IsOptional() @IsString() feedback?: string;
}

export class LiveClassFilterDto extends BaseFilterDto {
  @ApiPropertyOptional() @IsOptional() @IsInt() @Type(() => Number) courseId?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Type(() => Number) instructorId?: number;
  @ApiPropertyOptional({ enum: LiveClassType })
  @IsOptional()
  @IsEnum(LiveClassType)
  type?: LiveClassType;
  @ApiPropertyOptional({ enum: LiveClassStatus })
  @IsOptional()
  @IsEnum(LiveClassStatus)
  status?: LiveClassStatus;
  @ApiPropertyOptional({ enum: SessionModality })
  @IsOptional()
  @IsEnum(SessionModality)
  modality?: SessionModality;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Type(() => Number) departmentId?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Type(() => Number) unitId?: number;
  @ApiPropertyOptional() @IsOptional() @IsDateString() dateFrom?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() dateTo?: string;
}

export class LiveClassCalendarFilterDto {
  @ApiProperty() @IsDateString() from!: string;
  @ApiProperty() @IsDateString() to!: string;
}

// ─── Participantes / Presenças (secções 6 e 10) ────────────────────────────

export class RegisterAttendanceDto {
  @ApiProperty() @IsInt() userId!: number;
  @ApiPropertyOptional({ description: 'Sessão de uma aula recorrente' })
  @IsOptional()
  @IsInt()
  sessionId?: number;
  @ApiPropertyOptional({ enum: LiveAttendanceStatus })
  @IsOptional()
  @IsEnum(LiveAttendanceStatus)
  status?: LiveAttendanceStatus;
  @ApiPropertyOptional() @IsOptional() @IsDateString() joinedAt?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() leftAt?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() justification?: string;
}

export class UpdateAttendanceDto {
  @ApiPropertyOptional({ enum: LiveAttendanceStatus })
  @IsOptional()
  @IsEnum(LiveAttendanceStatus)
  status?: LiveAttendanceStatus;
  @ApiPropertyOptional() @IsOptional() @IsDateString() joinedAt?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() leftAt?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() justification?: string;
}

export class ParticipantsFilterDto extends BaseFilterDto {
  @ApiPropertyOptional() @IsOptional() @IsInt() @Type(() => Number) liveClassId?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Type(() => Number) sessionId?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Type(() => Number) courseId?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Type(() => Number) departmentId?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Type(() => Number) unitId?: number;
  @ApiPropertyOptional({ enum: LiveAttendanceStatus })
  @IsOptional()
  @IsEnum(LiveAttendanceStatus)
  status?: LiveAttendanceStatus;
  @ApiPropertyOptional() @IsOptional() @IsDateString() dateFrom?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() dateTo?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() search?: string;
}
