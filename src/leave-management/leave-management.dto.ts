// ─── src/leave-management/leave-management.dto.ts ────────────────────────────
import {
  IsInt,
  IsString,
  IsOptional,
  IsEnum,
  IsDateString,
  IsBoolean,
  IsNumber,
  IsArray,
  ValidateNested,
  Min,
  Max,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { BaseFilterDto } from '../common/dtos/pagination.dto';

// ─── Enums ────────────────────────────────────────────────────────────────────

export enum LeaveCategory {
  STATUTORY = 'STATUTORY', // Legalmente obrigatória (férias, maternidade)
  MEDICAL = 'MEDICAL', // Saúde e bem-estar
  FAMILY = 'FAMILY', // Família e eventos pessoais
  TRAINING = 'TRAINING', // Formação e desenvolvimento
  FLEXIBLE = 'FLEXIBLE', // Banco de horas, folgas
  UNPAID = 'UNPAID', // Licença sem vencimento
  DISCIPLINARY = 'DISCIPLINARY', // Suspensão
  OTHER = 'OTHER',
}

export enum LeaveStatus {
  DRAFT = 'DRAFT',
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
  CANCELLED = 'CANCELLED',
  EXPIRED = 'EXPIRED',
}

export enum ApprovalAction {
  APPROVE = 'APPROVE',
  REJECT = 'REJECT',
  ESCALATE = 'ESCALATE',
  DELEGATE = 'DELEGATE',
}

export enum DurationMode {
  FULL_DAY = 'FULL_DAY',
  HALF_AM = 'HALF_AM',
  HALF_PM = 'HALF_PM',
  HOURS = 'HOURS',
}

// ─── Leave Types (configuráveis) ──────────────────────────────────────────────

export class CreateLeaveTypeDto {
  @ApiProperty() @IsString() code!: string; // VACATION, SICK_SHORT, etc.
  @ApiProperty() @IsString() name!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
  @ApiProperty() @IsEnum(LeaveCategory) category!: LeaveCategory;
  @ApiProperty() @IsBoolean() isPaid!: boolean;
  @ApiProperty() @IsBoolean() requiresApproval!: boolean;
  @ApiProperty() @IsBoolean() requiresDocument!: boolean;
  @ApiPropertyOptional() @IsOptional() @IsInt() annualLimit?: number; // dias/ano
  @ApiPropertyOptional() @IsOptional() @IsInt() maxConsecutiveDays?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() minNoticeDays?: number; // antecedência mínima
  @ApiPropertyOptional() @IsOptional() @IsBoolean() allowCarryOver?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsInt() carryOverLimit?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() carryOverExpiryDays?: number;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() allowHalfDay?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() autoApprove?: boolean; // aprovação auto
  @ApiPropertyOptional() @IsOptional() @IsInt() autoApproveUnderDays?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() color?: string; // hex #3B82F6
  @ApiPropertyOptional() @IsOptional() @IsString() icon?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() countWorkDaysOnly?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() affectsSalary?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsNumber() salaryDeductionPercent?: number;
  @ApiProperty() @IsBoolean() active!: boolean;
}

export class UpdateLeaveTypeDto extends PartialType(CreateLeaveTypeDto) {}

// ─── Leave Policies ───────────────────────────────────────────────────────────

export class BlackoutPeriodDto {
  @ApiProperty() @IsString() label!: string;
  @ApiProperty() @IsDateString() startDate!: string;
  @ApiProperty() @IsDateString() endDate!: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  leaveTypeCodes?: string[];
}

export class CreateLeavePolicyDto {
  @ApiProperty() @IsString() name!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() country?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() department?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() seniority?: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) @Max(100) maxAbsencePercent?: number; // % máxima do time ausente
  @ApiPropertyOptional() @IsOptional() @IsInt() approvalLevels?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() slaHours?: number; // SLA de aprovação em horas
  @ApiPropertyOptional()
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BlackoutPeriodDto)
  blackoutPeriods?: BlackoutPeriodDto[];
  @ApiPropertyOptional() @IsOptional() @IsBoolean() active?: boolean;
}

// ─── Leave Requests ───────────────────────────────────────────────────────────

export class CreateLeaveManagementRequestDto {
  @ApiProperty() @IsInt() userId!: number;
  @ApiProperty() @IsString() leaveTypeCode!: string;
  @ApiProperty() @IsDateString() startDate!: string;
  @ApiProperty() @IsDateString() endDate!: string;
  @ApiPropertyOptional() @IsOptional() @IsEnum(DurationMode) durationMode?: DurationMode;
  @ApiPropertyOptional() @IsOptional() @IsNumber() hours?: number; // se HOURS
  @ApiPropertyOptional() @IsOptional() @IsString() reason?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() saveAsDraft?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsInt() substituteId?: number; // substituto
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(2000) @Max(2100) referenceYear?: number; // ano do saldo (férias)
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(120) contactDuringLeave?: string; // contacto alternativo
  @ApiPropertyOptional() @IsOptional() @IsArray() @IsString({ each: true }) attachments?: string[];
}

// ─── Approvals ────────────────────────────────────────────────────────────────

export class ApproveLeaveDto {
  @ApiProperty({ enum: ApprovalAction }) @IsEnum(ApprovalAction) action!: ApprovalAction;
  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() delegateToId?: number; // para delegate
}

export class BulkApproveDto {
  @ApiProperty({ type: [Number] }) @IsArray() @IsInt({ each: true }) requestIds!: number[];
  @ApiProperty({ enum: ApprovalAction }) @IsEnum(ApprovalAction) action!: ApprovalAction;
  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string;
}

// ─── Leave Balance ────────────────────────────────────────────────────────────

export class UpdateBalanceDto {
  @ApiProperty() @IsString() leaveTypeCode!: string;
  @ApiProperty() @IsNumber() balance!: number;
  @ApiPropertyOptional() @IsOptional() @IsString() reason?: string;
}

export class AccrueBalanceDto {
  @ApiProperty({ type: [Number] }) @IsArray() @IsInt({ each: true }) userIds!: number[];
  @ApiProperty() @IsString() leaveTypeCode!: string;
  @ApiProperty() @IsNumber() days!: number;
  @ApiPropertyOptional() @IsOptional() @IsString() reason?: string;
}

// ─── Filters ──────────────────────────────────────────────────────────────────

export class LeaveFilterDto extends BaseFilterDto {
  @ApiPropertyOptional() @IsOptional() @IsInt() @Type(() => Number) userId?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() leaveTypeCode?: string;
  @ApiPropertyOptional() @IsOptional() @IsEnum(LeaveStatus) status?: LeaveStatus;
  @ApiPropertyOptional() @IsOptional() @IsString() department?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() from?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() to?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() sortBy?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() sortOrder?: 'asc' | 'desc';
}

export class CalendarFilterDto {
  @ApiPropertyOptional() @IsOptional() @IsInt() @Type(() => Number) year?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Type(() => Number) month?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() department?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() leaveTypeCode?: string;
}

export class OverviewFilterDto {
  @ApiPropertyOptional() @IsOptional() @IsDateString() from?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() to?: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Type(() => Number) unitId?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Type(() => Number) departmentId?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() leaveTypeCode?: string;
  @ApiPropertyOptional() @IsOptional() @IsEnum(LeaveStatus) status?: LeaveStatus;
}

export enum VacationPlanState {
  NOT_STARTED = 'NOT_STARTED',
  IN_PREPARATION = 'IN_PREPARATION',
  SUBMITTED = 'SUBMITTED',
  APPROVED = 'APPROVED',
}

export class VacationFilterDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  @Min(2000)
  @Max(2100)
  year?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Type(() => Number) unitId?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Type(() => Number) departmentId?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() search?: string;
  @ApiPropertyOptional({ enum: VacationPlanState })
  @IsOptional()
  @IsEnum(VacationPlanState)
  planState?: VacationPlanState;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Type(() => Number) @Min(1) page?: number;
  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  @Min(1)
  @Max(100)
  limit?: number;
}

export class DurationPreviewDto {
  @ApiProperty() @IsString() leaveTypeCode!: string;
  @ApiProperty() @IsDateString() startDate!: string;
  @ApiProperty() @IsDateString() endDate!: string;
  @ApiPropertyOptional() @IsOptional() @IsEnum(DurationMode) durationMode?: DurationMode;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Type(() => Number) hours?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Type(() => Number) userId?: number;
}
