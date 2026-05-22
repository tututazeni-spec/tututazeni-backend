// src/dashboard/dashboard.dto.ts
import { IsOptional, IsInt, IsEnum } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export enum DashboardPeriod {
  WEEK = 'WEEK',
  MONTH = 'MONTH',
  QUARTER = 'QUARTER',
  YEAR = 'YEAR',
}

export enum AlertPriority {
  URGENT = 'URGENT',
  ATTENTION = 'ATTENTION',
  INFORMATIVE = 'INFORMATIVE',
}

export class DashboardFilterDto {
  @ApiPropertyOptional({ enum: DashboardPeriod })
  @IsOptional()
  @IsEnum(DashboardPeriod)
  period?: DashboardPeriod;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Type(() => Number) departmentId?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Type(() => Number) managerId?: number;
}

export class OrgFilterDto {
  @ApiPropertyOptional({ enum: DashboardPeriod })
  @IsOptional()
  @IsEnum(DashboardPeriod)
  period?: DashboardPeriod;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Type(() => Number) departmentId?: number;
}
