// src/automation/automation.dto.ts
import {
  IsString, IsOptional, IsEnum, IsBoolean, IsArray,
  IsInt, IsObject, MaxLength, Min, IsNumber,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

// ─── Enums ────────────────────────────────────────────────────────

export enum TriggerType {
  // Event-based
  EMPLOYEE_CREATED     = 'employee.created',
  EMPLOYEE_UPDATED     = 'employee.updated',
  EMPLOYEE_DEACTIVATED = 'employee.deactivated',
  COURSE_COMPLETED     = 'course.completed',
  COURSE_ENROLLED      = 'course.enrolled',
  PDI_APPROVED         = 'pdi.approved',
  PDI_COMPLETED        = 'pdi.completed',
  EVALUATION_SUBMITTED = 'evaluation.submitted',
  BADGE_AWARDED        = 'badge.awarded',
  // Scheduled
  CRON_DAILY           = 'cron.daily',
  CRON_WEEKLY          = 'cron.weekly',
  CRON_MONTHLY         = 'cron.monthly',
  // Legacy (from original)
  BIRTHDAY_TODAY       = 'BIRTHDAY_TODAY',
  PENDING_LEAVE_3_DAYS = 'PENDING_LEAVE_3_DAYS',
  ENROLLMENT_EXPIRING  = 'ENROLLMENT_EXPIRING',
  PAYSLIP_DUE          = 'PAYSLIP_DUE',
  // Manual
  MANUAL               = 'manual',
}

export enum ActionType {
  SEND_EMAIL            = 'send_email',
  SEND_NOTIFICATION     = 'send_notification',
  ASSIGN_COURSE         = 'assign_course',
  CREATE_PDI            = 'create_pdi',
  APPROVE_PDI           = 'approve_pdi',
  AWARD_BADGE           = 'award_badge',
  AWARD_POINTS          = 'award_points',
  UPDATE_EMPLOYEE       = 'update_employee',
  WEBHOOK               = 'webhook',
  HTTP_REQUEST          = 'http_request',
  LOG                   = 'log',
  WAIT                  = 'wait',
  // Legacy
  SEND_BIRTHDAY_NOTIFICATION = 'SEND_BIRTHDAY_NOTIFICATION',
  NOTIFY_MANAGER        = 'NOTIFY_MANAGER',
  NOTIFY_LEARNER        = 'NOTIFY_LEARNER',
  NOTIFY_HR             = 'NOTIFY_HR',
}

export enum AutomationCategory {
  HR          = 'HR',
  LMS         = 'LMS',
  PERFORMANCE = 'PERFORMANCE',
  ENGAGEMENT  = 'ENGAGEMENT',
  GAMIFICATION= 'GAMIFICATION',
  OPERATIONAL = 'OPERATIONAL',
  CUSTOM      = 'CUSTOM',
}

export enum ExecutionStatus {
  PENDING = 'PENDING',
  RUNNING = 'RUNNING',
  SUCCESS = 'SUCCESS',
  FAILED  = 'FAILED',
  SKIPPED = 'SKIPPED',
}

// ─── Rule DTOs ────────────────────────────────────────────────────

export class CreateRuleDto {
  @ApiProperty()
  @IsString()
  @MaxLength(200)
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ enum: TriggerType })
  @IsEnum(TriggerType)
  trigger!: TriggerType;

  @ApiProperty({ enum: ActionType })
  @IsEnum(ActionType)
  action!: ActionType;

  @ApiPropertyOptional({ description: 'Condição JSON — ex: {"minScore": 4, "departmentId": 1}' })
  @IsOptional()
  @IsString()
  condition?: string;

  @ApiPropertyOptional({ description: 'Parâmetros da acção em JSON — ex: {"courseId": 5}' })
  @IsOptional()
  @IsString()
  actionParams?: string;

  @ApiPropertyOptional({ enum: AutomationCategory })
  @IsOptional()
  @IsEnum(AutomationCategory)
  category?: AutomationCategory;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  priority?: number;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @ApiPropertyOptional({ description: 'Cron expression (para triggers agendados)' })
  @IsOptional()
  @IsString()
  cronExpression?: string;

  @ApiPropertyOptional({ default: 3, description: 'Nº máximo de retries em caso de falha' })
  @IsOptional()
  @IsInt()
  @Min(0)
  maxRetries?: number;
}

export class UpdateRuleDto {
  @ApiPropertyOptional() @IsOptional() @IsString() name?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() condition?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() actionParams?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() active?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) priority?: number;
}

// ─── Execution DTOs ───────────────────────────────────────────────

export class TriggerEventDto {
  @ApiProperty({ enum: TriggerType }) @IsEnum(TriggerType) event!: TriggerType;
  @ApiPropertyOptional() @IsOptional() payload?: Record<string, any>;
  @ApiPropertyOptional() @IsOptional() @IsInt() userId?: number;
}

export class ExecutionFilterDto {
  @ApiPropertyOptional({ enum: ExecutionStatus }) @IsOptional() @IsEnum(ExecutionStatus) status?: ExecutionStatus;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Type(() => Number) ruleId?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() from?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() to?: string;
  @ApiPropertyOptional({ default: 1 })  @IsOptional() @IsInt() @Min(1) @Type(() => Number) page?: number;
  @ApiPropertyOptional({ default: 30 }) @IsOptional() @IsInt() @Min(1) @Type(() => Number) limit?: number;
}

