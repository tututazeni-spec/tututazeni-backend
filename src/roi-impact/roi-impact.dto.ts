// src/roi-impact/roi-impact.dto.ts
import { IsOptional, IsInt, IsNumber, IsDateString, Min, Max } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export enum ImpactCategory {
  PRODUCTIVITY = 'PRODUCTIVITY',
  RETENTION = 'RETENTION',
  SALES = 'SALES',
  QUALITY = 'QUALITY',
  COMPLIANCE = 'COMPLIANCE',
  WELLBEING = 'WELLBEING',
  ENGAGEMENT = 'ENGAGEMENT',
}

export enum RoiConfidence {
  HIGH = 'HIGH',
  MEDIUM = 'MEDIUM',
  LOW = 'LOW',
}

export class RoiFilterDto {
  @ApiPropertyOptional() @IsOptional() @IsDateString() from?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() to?: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Type(() => Number) departmentId?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Type(() => Number) courseId?: number;
}

export class CalculateRoiDto {
  @ApiPropertyOptional({ default: 200 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  costPerEnrollment?: number;
  @ApiPropertyOptional({ default: 500 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  benefitPerCompletion?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() avgSalaryPerDay?: number;
  @ApiPropertyOptional() @IsOptional() @IsDateString() from?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() to?: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Type(() => Number) departmentId?: number;
}

export class WhatIfDto {
  @ApiProperty({ minimum: 0, maximum: 100 })
  @IsNumber()
  @Min(0)
  @Max(100)
  targetCompletionRate!: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) targetEnrollments?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) costPerEnrollment?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) benefitPerCompletion?: number;
}
