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
