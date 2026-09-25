// src/roi-impact/roi-impact.dto.ts
import {
  IsOptional,
  IsInt,
  IsNumber,
  IsDateString,
  IsString,
  IsBoolean,
  IsEnum,
  MaxLength,
  Min,
  Max,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { RoiInitiativeType, RoiAnalysisStatus, RoiBenefitType } from '@prisma/client';

export { RoiInitiativeType, RoiAnalysisStatus, RoiBenefitType };

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

// ─────────────────────────────────────────────────────────────────
// ROI DA FORMAÇÃO — "Nova Análise de ROI" (docs/roi-impact.md §2)
// ─────────────────────────────────────────────────────────────────

export class RoiAnalysisFilterDto {
  @ApiPropertyOptional() @IsOptional() @IsDateString() from?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() to?: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Type(() => Number) departmentId?: number;
  @ApiPropertyOptional({ enum: RoiInitiativeType })
  @IsOptional()
  @IsEnum(RoiInitiativeType)
  initiativeType?: RoiInitiativeType;
  @ApiPropertyOptional({ enum: RoiAnalysisStatus })
  @IsOptional()
  @IsEnum(RoiAnalysisStatus)
  status?: RoiAnalysisStatus;
}

// Etapa 1 — Identificação
export class CreateRoiAnalysisDto {
  @ApiProperty() @IsString() @MaxLength(200) name!: string;
  @ApiProperty({ enum: RoiInitiativeType })
  @IsEnum(RoiInitiativeType)
  initiativeType!: RoiInitiativeType;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Type(() => Number) initiativeId?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Type(() => Number) departmentId?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(120) unit?: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Type(() => Number) responsibleId?: number;
  @ApiPropertyOptional() @IsOptional() @IsDateString() referencePeriodStart?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() referencePeriodEnd?: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) measurementPeriodDays?: number;
}

// Etapas 2–4 — Custos, Benefícios esperados, Metodologia (edição incremental)
export class UpdateRoiAnalysisDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) name?: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Type(() => Number) departmentId?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(120) unit?: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Type(() => Number) responsibleId?: number;
  @ApiPropertyOptional() @IsOptional() @IsDateString() referencePeriodStart?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() referencePeriodEnd?: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) measurementPeriodDays?: number;

  // Etapa 2 — Custos
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) costDirect?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) costIndirect?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) costOpportunity?: number;

  // Etapa 3 — Benefícios esperados
  @ApiPropertyOptional({ enum: RoiBenefitType })
  @IsOptional()
  @IsEnum(RoiBenefitType)
  benefitType?: RoiBenefitType;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) benefitIndicator?: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() benefitBaselineValue?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() benefitExpectedValue?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(500) benefitConversionNote?: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Type(() => Number) benefitValidatorId?: number;

  // Etapa 4 — Metodologia
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(120) evaluationModelUsed?: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) @Max(1) isolationFactor?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) dataSource?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() hasControlGroup?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(1000) assumptions?: string;
}

// Etapa 5 — Resultado (cálculo)
export class ComputeRoiAnalysisDto {
  // Sobrepõe o benefício monetário quando o RH já validou um valor
  // definitivo; caso contrário é derivado de benefitExpectedValue/baseline ×
  // isolationFactor (ver RoiImpactService#computeRoiAnalysisResult).
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) monetaryBenefitOverride?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(1000) observations?: string;
}

// Etapa 5 — Aprovação
export class ApproveRoiAnalysisDto {
  @ApiProperty({ enum: [RoiAnalysisStatus.VALIDADO, RoiAnalysisStatus.REVISTO] })
  @IsEnum(RoiAnalysisStatus)
  status!: RoiAnalysisStatus;
  @ApiProperty() @IsInt() @Type(() => Number) approvedById!: number;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(1000) observations?: string;
}
