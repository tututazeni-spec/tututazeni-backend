// src/reports/reports.dto.ts
import {
  IsString,
  IsOptional,
  IsEnum,
  IsInt,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEmail,
  Min,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

// ─── Enums ────────────────────────────────────────────────────────

export enum ReportCategory {
  HR = 'HR',
  LEARNING = 'LEARNING',
  PERFORMANCE = 'PERFORMANCE',
  ENGAGEMENT = 'ENGAGEMENT',
  TALENT = 'TALENT',
  COMPLIANCE = 'COMPLIANCE',
  OPERATIONAL = 'OPERATIONAL',
  FINANCIAL = 'FINANCIAL',
}

export enum ReportFormat {
  JSON = 'JSON',
  CSV = 'CSV',
  XLSX = 'XLSX',
  PDF = 'PDF',
  HTML = 'HTML',
}

export enum ScheduleFrequency {
  ONCE = 'ONCE',
  DAILY = 'DAILY',
  WEEKLY = 'WEEKLY',
  MONTHLY = 'MONTHLY',
  QUARTERLY = 'QUARTERLY',
}

// ─── Filter DTOs ──────────────────────────────────────────────────

export class DateRangeDto {
  @ApiProperty() @IsDateString() from!: string;
  @ApiProperty() @IsDateString() to!: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Type(() => Number) departmentId?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Type(() => Number) managerId?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() period?: string;
}

export class ReportFilterDto {
  @ApiPropertyOptional() @IsOptional() @IsDateString() from?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() to?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() period?: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Type(() => Number) departmentId?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Type(() => Number) managerId?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Type(() => Number) positionId?: number;
  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  page?: number;
  @ApiPropertyOptional({ default: 50 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  limit?: number;
  @ApiPropertyOptional({ enum: ReportFormat })
  @IsOptional()
  @IsEnum(ReportFormat)
  format?: ReportFormat;
}

// ─── Saved Report DTOs ────────────────────────────────────────────

export class SaveReportDto {
  @ApiProperty() @IsString() @MaxLength(200) name!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
  @ApiProperty({ enum: ReportCategory }) @IsEnum(ReportCategory) category!: ReportCategory;
  @ApiProperty() @IsString() reportKey!: string;
  @ApiProperty() @IsString() params!: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isTemplate?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() favourite?: boolean;
}

// ─── Schedule DTOs ────────────────────────────────────────────────

export class CreateScheduleDto {
  @ApiProperty() @IsInt() savedReportId!: number;
  @ApiProperty({ enum: ScheduleFrequency })
  @IsEnum(ScheduleFrequency)
  frequency!: ScheduleFrequency;
  @ApiPropertyOptional() @IsOptional() @IsDateString() startDate?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() endDate?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsArray()
  @IsEmail({}, { each: true })
  recipients?: string[];
  @ApiPropertyOptional({ enum: ReportFormat, isArray: true })
  @IsOptional()
  @IsArray()
  @IsEnum(ReportFormat, { each: true })
  formats?: ReportFormat[];
}
