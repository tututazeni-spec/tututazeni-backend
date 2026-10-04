// ─── src/leave-management/leave-settings.dto.ts ──────────────────────────────
// Configurações do módulo Leave (docs/Modulo_Leave.md §10).
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ArrayMaxSize,
  ArrayUnique,
  IsIn,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { AbsenceOccurrenceType } from './leave-management.dto';

export type DayCountRule = 'PER_TYPE' | 'WORK_DAYS' | 'CALENDAR_DAYS';
export const DAY_COUNT_RULES: DayCountRule[] = ['PER_TYPE', 'WORK_DAYS', 'CALENDAR_DAYS'];

/** Valores efectivos das configurações — o que o motor de Leave realmente lê. */
export interface LeaveSettings {
  // Ano de referência e período de férias
  referenceYear: number | null; // null = ano corrente
  vacationWindowStart: string | null; // MM-DD
  vacationWindowEnd: string | null; // MM-DD
  // Semana de trabalho e horário
  workWeekDays: number[]; // 0 = domingo … 6 = sábado
  workdayStart: string; // HH:mm
  workdayEnd: string; // HH:mm
  hoursPerDay: number;
  // Regra de contagem de dias
  dayCountRule: DayCountRule;
  // Categorias justificadas / injustificadas
  justifiedOccurrenceTypes: AbsenceOccurrenceType[];
  unjustifiedOccurrenceTypes: AbsenceOccurrenceType[];
  // Saldo e transição de dias
  carryOverEnabled: boolean;
  carryOverMaxDays: number | null; // tecto global (o tipo pode ter um menor)
  // Antecedência
  minNoticeDays: number | null; // por omissão para tipos sem antecedência própria
  maxAdvanceDays: number | null; // quão cedo se pode pedir
  // Documentos exigidos por categoria de tipo
  documentRequiredCategories: string[];
  // Aprovação e substituição
  substituteRequiredOverDays: number | null;
  decisionSlaDays: number;
  escalationAfterDays: number | null; // dias de atraso até escalar para o RH
  // Cancelamento e alteração
  employeeCanCancelApproved: boolean;
  cancelApprovedMinDaysBefore: number | null; // 0/null = até ao dia de início
  // Cobertura operacional
  defaultMaxAbsencePercent: number;
  // Permissões por perfil
  managerCanRegisterAbsences: boolean;
  managerCanValidateAbsences: boolean;
  // Integrações
  syncAttendance: boolean;
  payrollFeedEnabled: boolean;
  notifyHrOnApproval: boolean;
}

export const DEFAULT_LEAVE_SETTINGS: LeaveSettings = {
  referenceYear: null,
  vacationWindowStart: null,
  vacationWindowEnd: null,
  workWeekDays: [1, 2, 3, 4, 5],
  workdayStart: '08:00',
  workdayEnd: '17:00',
  hoursPerDay: 8,
  dayCountRule: 'PER_TYPE',
  justifiedOccurrenceTypes: [
    AbsenceOccurrenceType.JUSTIFIED_ABSENCE,
    AbsenceOccurrenceType.HEALTH_ABSENCE,
    AbsenceOccurrenceType.AUTHORIZED_ABSENCE,
  ],
  unjustifiedOccurrenceTypes: [
    AbsenceOccurrenceType.UNJUSTIFIED_ABSENCE,
    AbsenceOccurrenceType.NO_SHOW,
  ],
  carryOverEnabled: true,
  carryOverMaxDays: null,
  minNoticeDays: null,
  maxAdvanceDays: null,
  documentRequiredCategories: [],
  substituteRequiredOverDays: null,
  decisionSlaDays: 3,
  escalationAfterDays: null,
  employeeCanCancelApproved: true,
  cancelApprovedMinDaysBefore: null,
  defaultMaxAbsencePercent: 30,
  managerCanRegisterAbsences: true,
  managerCanValidateAbsences: true,
  syncAttendance: true,
  payrollFeedEnabled: true,
  notifyHrOnApproval: false,
};

const MONTH_DAY = /^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const HH_MM = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Todos os campos são opcionais: o que vier substitui o valor activo. */
export class UpdateLeaveSettingsDto {
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @IsInt() @Min(2000) @Max(2100)
  referenceYear?: number | null;

  @ApiPropertyOptional({ description: 'MM-DD', nullable: true })
  @IsOptional()
  @Matches(MONTH_DAY)
  vacationWindowStart?: string | null;

  @ApiPropertyOptional({ description: 'MM-DD', nullable: true })
  @IsOptional()
  @Matches(MONTH_DAY)
  vacationWindowEnd?: string | null;

  @ApiPropertyOptional({ type: [Number], description: '0 = domingo … 6 = sábado' })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(7)
  @IsInt({ each: true })
  @Min(0, { each: true })
  @Max(6, { each: true })
  workWeekDays?: number[];

  @ApiPropertyOptional() @IsOptional() @Matches(HH_MM) workdayStart?: string;
  @ApiPropertyOptional() @IsOptional() @Matches(HH_MM) workdayEnd?: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) @Max(24) hoursPerDay?: number;

  @ApiPropertyOptional({ enum: DAY_COUNT_RULES })
  @IsOptional()
  @IsIn(DAY_COUNT_RULES)
  dayCountRule?: DayCountRule;

  @ApiPropertyOptional({ enum: AbsenceOccurrenceType, isArray: true })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsEnum(AbsenceOccurrenceType, { each: true })
  justifiedOccurrenceTypes?: AbsenceOccurrenceType[];

  @ApiPropertyOptional({ enum: AbsenceOccurrenceType, isArray: true })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsEnum(AbsenceOccurrenceType, { each: true })
  unjustifiedOccurrenceTypes?: AbsenceOccurrenceType[];

  @ApiPropertyOptional() @IsOptional() @IsBoolean() carryOverEnabled?: boolean;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @IsInt() @Min(0) @Max(365)
  carryOverMaxDays?: number | null;

  @ApiPropertyOptional({ nullable: true }) @IsOptional() @IsInt() @Min(0) @Max(365)
  minNoticeDays?: number | null;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @IsInt() @Min(1) @Max(1095)
  maxAdvanceDays?: number | null;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(30)
  @IsString({ each: true })
  @MaxLength(60, { each: true })
  documentRequiredCategories?: string[];

  @ApiPropertyOptional({ nullable: true }) @IsOptional() @IsInt() @Min(1) @Max(365)
  substituteRequiredOverDays?: number | null;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) @Max(60) decisionSlaDays?: number;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @IsInt() @Min(1) @Max(60)
  escalationAfterDays?: number | null;

  @ApiPropertyOptional() @IsOptional() @IsBoolean() employeeCanCancelApproved?: boolean;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @IsInt() @Min(0) @Max(365)
  cancelApprovedMinDaysBefore?: number | null;

  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) @Max(100) defaultMaxAbsencePercent?: number;

  @ApiPropertyOptional() @IsOptional() @IsBoolean() managerCanRegisterAbsences?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() managerCanValidateAbsences?: boolean;

  @ApiPropertyOptional() @IsOptional() @IsBoolean() syncAttendance?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() payrollFeedEnabled?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() notifyHrOnApproval?: boolean;

  @ApiPropertyOptional({ description: 'Data de entrada em vigor (por omissão: agora)' })
  @IsOptional()
  @IsDateString()
  effectiveFrom?: string;

  @ApiProperty({ description: 'Motivo da alteração (fica no histórico)' })
  @IsString()
  @MaxLength(500)
  changeNote!: string;
}

export class SettingsHistoryFilterDto {
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(200) limit?: number;
}

export class CreateLeaveHolidayDto {
  @ApiProperty() @IsString() @MaxLength(120) name!: string;
  @ApiProperty({ description: 'YYYY-MM-DD' }) @IsDateString() date!: string;
  @ApiPropertyOptional({ description: 'Vazio = nacional' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  location?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() recurring?: boolean;
  @ApiPropertyOptional({ description: 'false = suprime o feriado de base nessa data' })
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class UpdateLeaveHolidayDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(120) name?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() date?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(120) location?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() recurring?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() active?: boolean;
}

export class HolidayFilterDto {
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(2000) @Max(2100) year?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(120) location?: string;
}

export class CreateLeaveDelegationDto {
  @ApiPropertyOptional({ description: 'Aprovador que se ausenta (por omissão: o próprio)' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  delegatorId?: number;
  @ApiProperty() @Type(() => Number) @IsInt() delegateId!: number;
  @ApiProperty({ description: 'YYYY-MM-DD' }) @IsDateString() startDate!: string;
  @ApiProperty({ description: 'YYYY-MM-DD' }) @IsDateString() endDate!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(300) reason?: string;
}

export class PayrollFeedFilterDto {
  @ApiProperty({ description: 'YYYY-MM' })
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/)
  period!: string;
}
