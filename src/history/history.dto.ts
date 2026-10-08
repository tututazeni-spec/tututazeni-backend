// src/history/history.dto.ts
import { IsString, IsOptional, IsInt, IsEnum, Min, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { BaseFilterDto } from '../common/dtos/pagination.dto';

// ─── Enums ────────────────────────────────────────────────────────

export enum EventCategory {
  LEARNING = 'LEARNING',
  PERFORMANCE = 'PERFORMANCE',
  CAREER = 'CAREER',
  ENGAGEMENT = 'ENGAGEMENT',
  SYSTEM = 'SYSTEM',
  COMPLIANCE = 'COMPLIANCE',
  ATTENDANCE = 'ATTENDANCE',
  FINANCIAL = 'FINANCIAL',
  WELLBEING = 'WELLBEING',
}

export enum EventModule {
  LMS = 'LMS',
  PERFORMANCE = 'PERFORMANCE',
  HR = 'HR',
  ENGAGEMENT = 'ENGAGEMENT',
  TALENT = 'TALENT',
  AVATAR = 'AVATAR',
  DOCUMENTS = 'DOCUMENTS',
  SYSTEM = 'SYSTEM',
  PAYROLL = 'PAYROLL',
}

// ─── Filter DTOs ──────────────────────────────────────────────────

export class HistoryFilterDto extends BaseFilterDto {
  @ApiPropertyOptional() @IsOptional() @IsInt() @Type(() => Number) userId?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() entity?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() action?: string;
  @ApiPropertyOptional({ enum: EventCategory })
  @IsOptional()
  @IsEnum(EventCategory)
  category?: EventCategory;
  @ApiPropertyOptional({ enum: EventModule })
  @IsOptional()
  @IsEnum(EventModule)
  module?: EventModule;
  @ApiPropertyOptional() @IsOptional() @IsString() from?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() to?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() search?: string;
  // Override: default de 30 (não 20) — preserva o comportamento pré-existente
  @ApiPropertyOptional({ default: 30 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  limit?: number;
}

export class TimelineFilterDto extends BaseFilterDto {
  @ApiPropertyOptional({ enum: EventCategory })
  @IsOptional()
  @IsEnum(EventCategory)
  category?: EventCategory;
  @ApiPropertyOptional({ enum: EventModule })
  @IsOptional()
  @IsEnum(EventModule)
  module?: EventModule;
  @ApiPropertyOptional() @IsOptional() @IsString() from?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() to?: string;
}

// ─── Manual Event ─────────────────────────────────────────────────

export class HistoryCreateEventDto {
  @ApiProperty() @IsInt() userId!: number;
  @ApiProperty() @IsString() @MaxLength(100) action!: string;
  @ApiProperty() @IsString() @MaxLength(200) entity!: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() entityId?: number;
  @ApiProperty({ enum: EventCategory }) @IsEnum(EventCategory) category!: EventCategory;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() metadata?: string;
}

// ─── Hub (Visão Geral, Histórico, Movimentos, …) ───────────────────

export enum HistoryEventType {
  CREATED = 'CREATED',
  UPDATED = 'UPDATED',
  DELETED = 'DELETED',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
  TRANSFERRED = 'TRANSFERRED',
  PROMOTED = 'PROMOTED',
  CHANGED = 'CHANGED',
  ASSIGNED = 'ASSIGNED',
  DEACTIVATED = 'DEACTIVATED',
  REACTIVATED = 'REACTIVATED',
  SUBMITTED = 'SUBMITTED',
  ARCHIVED = 'ARCHIVED',
}

export enum MovementType {
  ADMISSION = 'ADMISSION',
  TRANSFER = 'TRANSFER',
  PROMOTION = 'PROMOTION',
  POSITION_CHANGE = 'POSITION_CHANGE',
  DEPARTMENT_CHANGE = 'DEPARTMENT_CHANGE',
  MANAGER_CHANGE = 'MANAGER_CHANGE',
  RESTRUCTURE = 'RESTRUCTURE',
  EXIT = 'EXIT',
  REACTIVATION = 'REACTIVATION',
}

/** Barra de filtros global (docs/history.md §8) — partilhada por todas as abas. */
export class HistoryScopeDto {
  @ApiPropertyOptional() @IsOptional() @IsString() from?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() to?: string;
  /** Colaborador afectado */
  @ApiPropertyOptional() @IsOptional() @IsInt() @Type(() => Number) affectedUserId?: number;
  /** Utilizador que executou a acção */
  @ApiPropertyOptional() @IsOptional() @IsInt() @Type(() => Number) actorId?: number;
  @ApiPropertyOptional({ enum: EventModule })
  @IsOptional()
  @IsEnum(EventModule)
  module?: EventModule;
  @ApiPropertyOptional() @IsOptional() @IsString() entity?: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Type(() => Number) departmentId?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Type(() => Number) unitId?: number;
  /** Responsável = gestor directo do colaborador afectado */
  @ApiPropertyOptional() @IsOptional() @IsInt() @Type(() => Number) responsibleId?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() eventType?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() status?: string;
  @ApiPropertyOptional({ enum: MovementType })
  @IsOptional()
  @IsEnum(MovementType)
  movementType?: MovementType;
  @ApiPropertyOptional() @IsOptional() @IsString() search?: string;
  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  page?: number;
  @ApiPropertyOptional({ default: 30 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  limit?: number;
}

export const HISTORY_REPORT_TYPES = [
  'employee-history',
  'movements',
  'admissions',
  'exits',
  'transfers',
  'promotions',
  'position-changes',
  'department-changes',
  'org-changes',
  'activities-by-module',
  'activities-by-user',
  'changes-by-period',
] as const;
export type HistoryReportType = (typeof HISTORY_REPORT_TYPES)[number];

export class HistoryReportDto extends HistoryScopeDto {
  @ApiProperty({ enum: HISTORY_REPORT_TYPES })
  @IsEnum(HISTORY_REPORT_TYPES)
  type!: HistoryReportType;
}

export class HistoryExportDto extends HistoryReportDto {
  @ApiProperty({ enum: ['csv', 'xlsx', 'pdf'] })
  @IsEnum(['csv', 'xlsx', 'pdf'])
  format!: 'csv' | 'xlsx' | 'pdf';
}
