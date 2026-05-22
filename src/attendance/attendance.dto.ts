// ─── src/attendance/attendance.dto.ts ────────────────────────────────────────
import {
  IsInt,
  IsOptional,
  IsString,
  IsEnum,
  IsDateString,
  IsBoolean,
  IsNumber,
  IsObject,
  IsArray,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';

// ─── Enums ────────────────────────────────────────────────────────────────────

export enum AttendanceStatus {
  PRESENT = 'PRESENT', // Presente (100%)
  LATE = 'LATE', // Presente com atraso
  PARTIAL = 'PARTIAL', // Presença parcial (>X%)
  ABSENT = 'ABSENT', // Ausente sem justificativa
  JUSTIFIED = 'JUSTIFIED', // Ausente justificado
  REMOTE = 'REMOTE', // Trabalho remoto
  ON_LEAVE = 'ON_LEAVE', // Em licença/férias aprovada
  HALF_DAY_AM = 'HALF_DAY_AM', // Meio período manhã
  HALF_DAY_PM = 'HALF_DAY_PM', // Meio período tarde
  RECORDED = 'RECORDED', // Assistiu gravação (LMS)
  HOLIDAY = 'HOLIDAY', // Feriado
}

export enum CheckInMethod {
  MANUAL = 'MANUAL', // Registo manual pelo RH
  QR_STATIC = 'QR_STATIC', // QR code estático
  QR_DYNAMIC = 'QR_DYNAMIC', // QR code dinâmico (expira)
  GEOLOCATION = 'GEOLOCATION', // GPS / Geofencing
  FACIAL = 'FACIAL', // Reconhecimento facial
  NFC = 'NFC', // NFC / crachá
  TOKEN = 'TOKEN', // Código único manual
  VIRTUAL_LINK = 'VIRTUAL_LINK', // Link único (webinar/LMS)
  FACILITATOR = 'FACILITATOR', // Lista marcada pelo facilitador
}

export enum AttendanceContext {
  WORK = 'WORK', // Jornada de trabalho
  EVENT = 'EVENT', // Evento presencial
  WEBINAR = 'WEBINAR', // Evento virtual ao vivo
  LMS = 'LMS', // Atividade LMS assíncrona
  MENTORING = 'MENTORING', // Mentoria 1:1
  PRACTICAL = 'PRACTICAL', // Atividade prática/entrega
}

export enum LeaveType {
  VACATION = 'VACATION', // Férias
  SICK_LEAVE = 'SICK_LEAVE', // Licença médica
  MATERNITY = 'MATERNITY', // Licença maternidade
  PATERNITY = 'PATERNITY', // Licença paternidade
  JUSTIFIED_ABSENCE = 'JUSTIFIED_ABSENCE', // Falta justificada
  UNJUSTIFIED_ABSENCE = 'UNJUSTIFIED_ABSENCE', // Falta injustificada
  BEREAVEMENT = 'BEREAVEMENT', // Luto
  TRAINING = 'TRAINING', // Formação externa
  PUBLIC_DUTY = 'PUBLIC_DUTY', // Serviço público/militar
  OTHER = 'OTHER', // Outras licenças
}

export enum LeaveStatus {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
  CANCELLED = 'CANCELLED',
}

export enum ShiftType {
  MORNING = 'MORNING', // Manhã
  AFTERNOON = 'AFTERNOON', // Tarde
  NIGHT = 'NIGHT', // Noturno
  FULL_DAY = 'FULL_DAY', // Dia completo
  ROTATING = 'ROTATING', // Rotativo
  ON_CALL = 'ON_CALL', // Plantão
  FLEXIBLE = 'FLEXIBLE', // Flexível
}

export enum OvertimeStatus {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
  COMPENSATED = 'COMPENSATED',
  PAID = 'PAID',
}

export enum JustificationStatus {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
}

// ─── Clock-in / Check-in ──────────────────────────────────────────────────────

export class GeoLocationDto {
  @ApiProperty() @IsNumber() latitude!: number;
  @ApiProperty() @IsNumber() longitude!: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() accuracy?: number;
}

export class ClockInDto {
  @ApiPropertyOptional() @IsOptional() @IsEnum(CheckInMethod) method?: CheckInMethod;
  @ApiPropertyOptional() @IsOptional() @IsEnum(AttendanceContext) context?: AttendanceContext;
  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  @Type(() => GeoLocationDto)
  location?: GeoLocationDto;
  @ApiPropertyOptional() @IsOptional() @IsString() locationLabel?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() qrToken?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() deviceInfo?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() ipAddress?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() selfieUrl?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() facialValidated?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string;
  // Para contextos de evento/LMS
  @ApiPropertyOptional() @IsOptional() @IsInt() eventId?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() courseId?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() sessionId?: number;
}

export class ClockOutDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  @Type(() => GeoLocationDto)
  location?: GeoLocationDto;
  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() breakMinutes?: number;
}

// ─── Attendance Records ───────────────────────────────────────────────────────

export class CreateAttendanceDto {
  @ApiProperty() @IsInt() userId!: number;
  @ApiProperty() @IsDateString() date!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() clockIn?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() clockOut?: string;
  @ApiPropertyOptional() @IsOptional() @IsEnum(AttendanceStatus) status?: AttendanceStatus;
  @ApiPropertyOptional() @IsOptional() @IsEnum(AttendanceContext) context?: AttendanceContext;
  @ApiPropertyOptional() @IsOptional() @IsEnum(CheckInMethod) method?: CheckInMethod;
  @ApiPropertyOptional() @IsOptional() @IsNumber() hoursWorked?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() workMinutes?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() breakMinutes?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() presencePercent?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() justification?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() eventId?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() courseId?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() shiftId?: number;
}

export class UpdateAttendanceDto extends PartialType(CreateAttendanceDto) {}

// ─── Leaves / Ausências ───────────────────────────────────────────────────────

export class CreateLeaveRequestDto {
  @ApiProperty() @IsEnum(LeaveType) type!: LeaveType;
  @ApiProperty() @IsDateString() startDate!: string;
  @ApiProperty() @IsDateString() endDate!: string;
  @ApiProperty() @IsString() reason!: string;
  @ApiPropertyOptional() @IsOptional() @IsArray() @IsString({ each: true }) attachments?: string[];
  @ApiPropertyOptional() @IsOptional() @IsBoolean() halfDay?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsString() halfDayPeriod?: 'AM' | 'PM';
}

export class ReviewLeaveDto {
  @ApiProperty() @IsEnum(LeaveStatus) status!: LeaveStatus;
  @ApiPropertyOptional() @IsOptional() @IsString() reviewNotes?: string;
}

// ─── Work Schedules & Shifts ──────────────────────────────────────────────────

export class CreateWorkScheduleDto {
  @ApiProperty() @IsString() name!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
  @ApiProperty() @IsEnum(ShiftType) shiftType!: ShiftType;
  @ApiProperty() @IsString() startTime!: string; // HH:mm
  @ApiProperty() @IsString() endTime!: string; // HH:mm
  @ApiPropertyOptional() @IsOptional() @IsInt() breakMinutes?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() toleranceMinutes?: number; // Tolerância de atraso
  @ApiPropertyOptional() @IsOptional() @IsNumber() minPresencePercent?: number;
  @ApiPropertyOptional() @IsOptional() @IsArray() @IsInt({ each: true }) workDays?: number[]; // 0=Dom, 6=Sáb
}

export class AssignScheduleDto {
  @ApiProperty() @IsInt() userId!: number;
  @ApiProperty() @IsInt() scheduleId!: number;
  @ApiProperty() @IsDateString() effectiveFrom!: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() effectiveTo?: string;
}

// ─── Overtime ─────────────────────────────────────────────────────────────────

export class CreateOvertimeDto {
  @ApiProperty() @IsInt() userId!: number;
  @ApiProperty() @IsDateString() date!: string;
  @ApiProperty() @IsInt() overtimeMinutes!: number;
  @ApiProperty() @IsString() reason!: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() compensateWithTime?: boolean; // banco de horas vs pago
}

export class ReviewOvertimeDto {
  @ApiProperty() @IsEnum(OvertimeStatus) status!: OvertimeStatus;
  @ApiPropertyOptional() @IsOptional() @IsString() reviewNotes?: string;
}

// ─── Justifications ───────────────────────────────────────────────────────────

export class CreateJustificationDto {
  @ApiProperty() @IsInt() attendanceId!: number;
  @ApiProperty() @IsString() reason!: string;
  @ApiPropertyOptional() @IsOptional() @IsArray() @IsString({ each: true }) attachments?: string[];
  @ApiPropertyOptional() @IsOptional() @IsEnum(LeaveType) leaveType?: LeaveType;
}

export class ReviewJustificationDto {
  @ApiProperty() @IsEnum(JustificationStatus) status!: JustificationStatus;
  @ApiPropertyOptional() @IsOptional() @IsString() reviewNotes?: string;
}

// ─── QR Code ─────────────────────────────────────────────────────────────────

export class GenerateQrDto {
  @ApiPropertyOptional() @IsOptional() @IsEnum(AttendanceContext) context?: AttendanceContext;
  @ApiPropertyOptional() @IsOptional() @IsInt() eventId?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() sessionId?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() ttlSeconds?: number; // Time-to-live do QR dinâmico
  @ApiPropertyOptional() @IsOptional() @IsBoolean() requireGeolocation?: boolean;
}

export class ValidateQrDto {
  @ApiProperty() @IsString() token!: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  @Type(() => GeoLocationDto)
  location?: GeoLocationDto;
  @ApiPropertyOptional() @IsOptional() @IsString() deviceInfo?: string;
}

// ─── Adjustments ──────────────────────────────────────────────────────────────

export class CreateAdjustmentDto {
  @ApiProperty() @IsInt() attendanceId!: number;
  @ApiProperty() @IsString() field!: string; // Ex: 'clockIn', 'clockOut', 'status'
  @ApiProperty() oldValue!: any;
  @ApiProperty() newValue!: any;
  @ApiProperty() @IsString() reason!: string;
}

// ─── Filters ──────────────────────────────────────────────────────────────────

export class AttendanceFilterDto {
  @ApiPropertyOptional() @IsOptional() @IsInt() @Type(() => Number) userId?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() department?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() from?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() to?: string;
  @ApiPropertyOptional() @IsOptional() @IsEnum(AttendanceStatus) status?: AttendanceStatus;
  @ApiPropertyOptional() @IsOptional() @IsEnum(AttendanceContext) context?: AttendanceContext;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Type(() => Number) eventId?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Type(() => Number) courseId?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Type(() => Number) page?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Type(() => Number) limit?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() sortBy?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() sortOrder?: 'asc' | 'desc';
}

export class LeaveFilterDto {
  @ApiPropertyOptional() @IsOptional() @IsInt() @Type(() => Number) userId?: number;
  @ApiPropertyOptional() @IsOptional() @IsEnum(LeaveType) type?: LeaveType;
  @ApiPropertyOptional() @IsOptional() @IsEnum(LeaveStatus) status?: LeaveStatus;
  @ApiPropertyOptional() @IsOptional() @IsString() from?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() to?: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Type(() => Number) page?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Type(() => Number) limit?: number;
}
