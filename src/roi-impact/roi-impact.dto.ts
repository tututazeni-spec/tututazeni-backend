// src/roi-impact/roi-impact.dto.ts
import {
  IsOptional,
  IsInt,
  IsNumber,
  IsDateString,
  IsString,
  IsBoolean,
  IsEnum,
  IsArray,
  ValidateNested,
  MaxLength,
  Min,
  Max,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  RoiInitiativeType,
  RoiAnalysisStatus,
  RoiBenefitType,
  ImpactSubjectType,
  ImpactCategory,
  RoiModelStatus,
  CostCategory,
  CostSubCategory,
  KpiCategory,
  KpiFrequency,
  KpiDefinitionStatus,
  CorrelationType,
} from '@prisma/client';

export {
  RoiInitiativeType,
  RoiAnalysisStatus,
  RoiBenefitType,
  ImpactSubjectType,
  ImpactCategory,
  RoiModelStatus,
  CostCategory,
  CostSubCategory,
  KpiCategory,
  KpiFrequency,
  KpiDefinitionStatus,
  CorrelationType,
};

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

// ─────────────────────────────────────────────────────────────────
// IMPACTO NO NEGÓCIO (docs/roi-impact.md §3)
// ─────────────────────────────────────────────────────────────────

export class ImpactRecordFilterDto {
  @ApiPropertyOptional() @IsOptional() @IsDateString() from?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() to?: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Type(() => Number) departmentId?: number;
  @ApiPropertyOptional({ enum: ImpactCategory })
  @IsOptional()
  @IsEnum(ImpactCategory)
  category?: ImpactCategory;
  @ApiPropertyOptional({ enum: RoiInitiativeType })
  @IsOptional()
  @IsEnum(RoiInitiativeType)
  initiativeType?: RoiInitiativeType;
  @ApiPropertyOptional({ enum: ImpactSubjectType })
  @IsOptional()
  @IsEnum(ImpactSubjectType)
  subjectType?: ImpactSubjectType;
}

export class CreateImpactRecordDto {
  @ApiProperty({ enum: ImpactSubjectType })
  @IsEnum(ImpactSubjectType)
  subjectType!: ImpactSubjectType;
  // Só um dos três deve vir preenchido, conforme subjectType — o backend
  // não valida a exclusividade, quem preenche o formulário é o wizard/UI.
  @ApiPropertyOptional() @IsOptional() @IsInt() @Type(() => Number) userId?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(120) team?: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Type(() => Number) departmentId?: number;

  @ApiProperty({ enum: RoiInitiativeType })
  @IsEnum(RoiInitiativeType)
  initiativeType!: RoiInitiativeType;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Type(() => Number) initiativeId?: number;

  @ApiProperty({ enum: ImpactCategory }) @IsEnum(ImpactCategory) category!: ImpactCategory;
  @ApiProperty() @IsString() @MaxLength(200) indicatorName!: string;

  @ApiPropertyOptional() @IsOptional() @IsNumber() valueBefore?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() valueAfter?: number;

  @ApiPropertyOptional() @IsOptional() @IsDateString() observationPeriodStart?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() observationPeriodEnd?: string;

  @ApiPropertyOptional({ minimum: 0, maximum: 100 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  attributionPercent?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) dataSource?: string;
}

export class UpdateImpactRecordDto {
  @ApiPropertyOptional({ enum: ImpactSubjectType })
  @IsOptional()
  @IsEnum(ImpactSubjectType)
  subjectType?: ImpactSubjectType;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Type(() => Number) userId?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(120) team?: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Type(() => Number) departmentId?: number;

  @ApiPropertyOptional({ enum: RoiInitiativeType })
  @IsOptional()
  @IsEnum(RoiInitiativeType)
  initiativeType?: RoiInitiativeType;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Type(() => Number) initiativeId?: number;

  @ApiPropertyOptional({ enum: ImpactCategory })
  @IsOptional()
  @IsEnum(ImpactCategory)
  category?: ImpactCategory;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) indicatorName?: string;

  @ApiPropertyOptional() @IsOptional() @IsNumber() valueBefore?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() valueAfter?: number;

  @ApiPropertyOptional() @IsOptional() @IsDateString() observationPeriodStart?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() observationPeriodEnd?: string;

  @ApiPropertyOptional({ minimum: 0, maximum: 100 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  attributionPercent?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) dataSource?: string;
}

export class ValidateImpactRecordDto {
  @ApiProperty() @IsInt() @Type(() => Number) validatedById!: number;
}

// ─────────────────────────────────────────────────────────────────
// MODELOS DE AVALIAÇÃO (docs/roi-impact.md §4)
// ─────────────────────────────────────────────────────────────────

export class RoiEvaluationLevelDto {
  @ApiProperty({ minimum: 1, maximum: 5 }) @IsInt() @Min(1) @Max(5) level!: number;
  @ApiProperty() @IsString() @MaxLength(120) name!: string;
  @ApiProperty() @IsBoolean() mandatory!: boolean;
  @ApiProperty({ minimum: 0, maximum: 100 }) @IsNumber() @Min(0) @Max(100) weight!: number;
}

export class RoiEvaluationApplicabilityDto {
  @ApiPropertyOptional({ enum: RoiInitiativeType, isArray: true })
  @IsOptional()
  @IsArray()
  @IsEnum(RoiInitiativeType, { each: true })
  initiativeTypes?: RoiInitiativeType[];
  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  criticality?: string[];
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) minCost?: number;
}

export class CreateRoiEvaluationModelDto {
  @ApiProperty() @IsString() @MaxLength(150) name!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(1000) description?: string;
  @ApiProperty({ type: [RoiEvaluationLevelDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RoiEvaluationLevelDto)
  levels!: RoiEvaluationLevelDto[];
  @ApiPropertyOptional({ type: RoiEvaluationApplicabilityDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => RoiEvaluationApplicabilityDto)
  applicability?: RoiEvaluationApplicabilityDto;
}

export class UpdateRoiEvaluationModelDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(150) name?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(1000) description?: string;
  @ApiPropertyOptional({ type: [RoiEvaluationLevelDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RoiEvaluationLevelDto)
  levels?: RoiEvaluationLevelDto[];
  @ApiPropertyOptional({ type: RoiEvaluationApplicabilityDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => RoiEvaluationApplicabilityDto)
  applicability?: RoiEvaluationApplicabilityDto;
  @ApiPropertyOptional({ enum: RoiModelStatus })
  @IsOptional()
  @IsEnum(RoiModelStatus)
  status?: RoiModelStatus;
}

// ─────────────────────────────────────────────────────────────────
// CUSTOS & INVESTIMENTO (docs/roi-impact.md §5)
// ─────────────────────────────────────────────────────────────────

export class CostEntryFilterDto {
  @ApiPropertyOptional({ enum: RoiInitiativeType })
  @IsOptional()
  @IsEnum(RoiInitiativeType)
  initiativeType?: RoiInitiativeType;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Type(() => Number) initiativeId?: number;
  @ApiPropertyOptional({ enum: CostCategory })
  @IsOptional()
  @IsEnum(CostCategory)
  category?: CostCategory;
  @ApiPropertyOptional({ enum: CostSubCategory })
  @IsOptional()
  @IsEnum(CostSubCategory)
  subCategory?: CostSubCategory;
  @ApiPropertyOptional() @IsOptional() @IsDateString() from?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() to?: string;
}

export class CreateCostEntryDto {
  @ApiProperty({ enum: RoiInitiativeType })
  @IsEnum(RoiInitiativeType)
  initiativeType!: RoiInitiativeType;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Type(() => Number) initiativeId?: number;
  @ApiProperty({ enum: CostSubCategory })
  @IsEnum(CostSubCategory)
  subCategory!: CostSubCategory;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(500) description?: string;
  @ApiProperty() @IsNumber() @Min(0) amount!: number;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) source?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() incurredAt?: string;
}

export class UpdateCostEntryDto {
  @ApiPropertyOptional({ enum: CostSubCategory })
  @IsOptional()
  @IsEnum(CostSubCategory)
  subCategory?: CostSubCategory;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(500) description?: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) amount?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) source?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() incurredAt?: string;
}

// "Custo de horas perdidas" (Fontes → Payroll) — estimativa de apoio, nunca
// persistida directamente: devolve um valor sugerido que o RH confirma e
// submete como CreateCostEntryDto(subCategory: HORAS_TRABALHO_PERDIDAS).
export class EstimateLaborCostDto {
  @ApiProperty({ type: [Number] }) @IsArray() @Type(() => Number) userIds!: number[];
  @ApiProperty() @IsNumber() @Min(0) hours!: number;
}

// ─────────────────────────────────────────────────────────────────
// INDICADORES & KPIS (docs/roi-impact.md §6)
// ─────────────────────────────────────────────────────────────────

export class KpiDefinitionFilterDto {
  @ApiPropertyOptional({ enum: KpiCategory })
  @IsOptional()
  @IsEnum(KpiCategory)
  category?: KpiCategory;
  @ApiPropertyOptional({ enum: KpiDefinitionStatus })
  @IsOptional()
  @IsEnum(KpiDefinitionStatus)
  status?: KpiDefinitionStatus;
}

export class CreateKpiDefinitionDto {
  @ApiProperty() @IsString() @MaxLength(150) name!: string;
  @ApiProperty() @IsString() @MaxLength(40) code!: string;
  @ApiProperty({ enum: KpiCategory }) @IsEnum(KpiCategory) category!: KpiCategory;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(1000) description?: string;
  @ApiProperty() @IsString() @MaxLength(60) unit!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(500) formula?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) dataSource?: string;
  @ApiProperty({ enum: KpiFrequency }) @IsEnum(KpiFrequency) frequency!: KpiFrequency;
  @ApiPropertyOptional() @IsOptional() @IsNumber() targetValue?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(500) benchmarkNote?: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Type(() => Number) responsibleId?: number;
}

export class UpdateKpiDefinitionDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(150) name?: string;
  @ApiPropertyOptional({ enum: KpiCategory })
  @IsOptional()
  @IsEnum(KpiCategory)
  category?: KpiCategory;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(1000) description?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(60) unit?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(500) formula?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) dataSource?: string;
  @ApiPropertyOptional({ enum: KpiFrequency })
  @IsOptional()
  @IsEnum(KpiFrequency)
  frequency?: KpiFrequency;
  @ApiPropertyOptional() @IsOptional() @IsNumber() targetValue?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(500) benchmarkNote?: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Type(() => Number) responsibleId?: number;
  @ApiPropertyOptional({ enum: KpiDefinitionStatus })
  @IsOptional()
  @IsEnum(KpiDefinitionStatus)
  status?: KpiDefinitionStatus;
}

// ─────────────────────────────────────────────────────────────────
// CORRELAÇÕES (docs/roi-impact.md §7)
// ─────────────────────────────────────────────────────────────────

export class RunCorrelationDto {
  @ApiProperty({ enum: CorrelationType }) @IsEnum(CorrelationType) type!: CorrelationType;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Type(() => Number) departmentId?: number;
  @ApiPropertyOptional() @IsOptional() @IsDateString() periodStart?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() periodEnd?: string;
}

export class CorrelationFilterDto {
  @ApiPropertyOptional({ enum: CorrelationType })
  @IsOptional()
  @IsEnum(CorrelationType)
  type?: CorrelationType;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Type(() => Number) departmentId?: number;
}

// ─────────────────────────────────────────────────────────────────
// CENÁRIOS & SIMULAÇÕES (docs/roi-impact.md §8)
// ─────────────────────────────────────────────────────────────────

export class ScenarioFilterDto {
  @ApiPropertyOptional({ enum: RoiInitiativeType })
  @IsOptional()
  @IsEnum(RoiInitiativeType)
  initiativeType?: RoiInitiativeType;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Type(() => Number) departmentId?: number;
}

export class CreateScenarioDto {
  @ApiProperty() @IsString() @MaxLength(200) name!: string;
  @ApiProperty({ enum: RoiInitiativeType })
  @IsEnum(RoiInitiativeType)
  initiativeType!: RoiInitiativeType;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(1000) description?: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Type(() => Number) departmentId?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) targetAudienceCount?: number;
  @ApiProperty() @IsNumber() @Min(0) estimatedCost!: number;
  // Benefício esperado: preencher OU basedOnAnalysisId (deriva o benefício do
  // BCR de uma RoiAnalysis semelhante já medida) OU expectedBenefit
  // (premissa manual do RH) — nunca os dois ao mesmo tempo (ver
  // ScenarioService#resolveExpectedBenefit: expectedBenefit manual tem
  // sempre prioridade quando ambos vêm preenchidos).
  @ApiPropertyOptional() @IsOptional() @IsInt() @Type(() => Number) basedOnAnalysisId?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) expectedBenefit?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(1000) assumptions?: string;
}

export class UpdateScenarioDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) name?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(1000) description?: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Type(() => Number) departmentId?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) targetAudienceCount?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) estimatedCost?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Type(() => Number) basedOnAnalysisId?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) expectedBenefit?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(1000) assumptions?: string;
}

export class CompareScenariosDto {
  @ApiProperty({ type: [Number], minItems: 2 })
  @IsArray()
  @IsInt({ each: true })
  @Type(() => Number)
  ids!: number[];
}
