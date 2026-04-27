// src/executive-reports/executive-reports.dto.ts
import {
  IsString, IsInt, IsOptional, IsNumber, IsEnum,
  IsArray, IsBoolean, IsDateString, ValidateNested, MaxLength, Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';

// ─── Enums ────────────────────────────────────────────────────────────────────

export enum ReportType {
  FLASH        = 'FLASH',        // Semanal
  MONTHLY      = 'MONTHLY',      // Mensal
  QUARTERLY    = 'QUARTERLY',    // Trimestral
  ANNUAL       = 'ANNUAL',       // Anual
  CUSTOM       = 'CUSTOM',       // Sob demanda
  AUDIT        = 'AUDIT',        // Auditoria
}

export enum ReportStatus {
  DRAFT        = 'DRAFT',
  IN_REVIEW    = 'IN_REVIEW',
  APPROVED     = 'APPROVED',
  PUBLISHED    = 'PUBLISHED',
  ARCHIVED     = 'ARCHIVED',
}

export enum ReportConfidentiality {
  PUBLIC       = 'PUBLIC',
  INTERNAL     = 'INTERNAL',
  CONFIDENTIAL = 'CONFIDENTIAL',
  RESTRICTED   = 'RESTRICTED',
}

export enum KpiStatus {
  GREEN  = 'GREEN',   // Dentro do target
  YELLOW = 'YELLOW',  // Atenção
  RED    = 'RED',     // Crítico
}

// ─── KPI ──────────────────────────────────────────────────────────────────────

export class ReportKpiDto {
  @ApiProperty({ example: 'Taxa de conclusão de PDI' })
  @IsString() @MaxLength(100)
  label!: string;

  @ApiProperty({ description: 'Valor numérico' }) @IsNumber()
  value!: number;

  @ApiPropertyOptional({ description: 'Unidade: %, h, Kz, etc.' })
  @IsOptional() @IsString()
  unit?: string;

  @ApiPropertyOptional({ description: 'Valor do período anterior (para variação)' })
  @IsOptional() @IsNumber()
  previousValue?: number;

  @ApiPropertyOptional({ description: 'Meta/target' })
  @IsOptional() @IsNumber()
  target?: number;

  @ApiPropertyOptional({ enum: KpiStatus })
  @IsOptional() @IsEnum(KpiStatus)
  status?: KpiStatus;

  @ApiPropertyOptional({ description: 'Comentário sobre o KPI' })
  @IsOptional() @IsString()
  comment?: string;

  @ApiPropertyOptional({ default: 0 }) @IsOptional() @IsInt() @Min(0)
  sortOrder?: number;
}

// ─── Report ───────────────────────────────────────────────────────────────────

export class CreateExecutiveReportDto {
  @ApiProperty({ example: 'Executive Summary Q1 2026' })
  @IsString() @MaxLength(200)
  title!: string;

  @ApiPropertyOptional({ description: 'Subtítulo ou âmbito' })
  @IsOptional() @IsString() @MaxLength(300)
  subtitle?: string;

  @ApiPropertyOptional({ enum: ReportType, default: ReportType.MONTHLY })
  @IsOptional() @IsEnum(ReportType)
  type?: ReportType;

  @ApiPropertyOptional({ enum: ReportConfidentiality, default: ReportConfidentiality.CONFIDENTIAL })
  @IsOptional() @IsEnum(ReportConfidentiality)
  confidentiality?: ReportConfidentiality;

  @ApiPropertyOptional() @IsOptional() @IsInt()
  departmentId?: number;

  @ApiPropertyOptional({ description: 'Período ex: 2026-Q1' })
  @IsOptional() @IsString()
  period?: string;

  @ApiPropertyOptional() @IsOptional() @IsDateString()
  periodStart?: string;

  @ApiPropertyOptional() @IsOptional() @IsDateString()
  periodEnd?: string;

  @ApiPropertyOptional({ description: 'Top 3 conquistas' })
  @IsOptional() @IsArray() @IsString({ each: true })
  achievements?: string[];

  @ApiPropertyOptional({ description: 'Top 3 riscos/alertas' })
  @IsOptional() @IsArray() @IsString({ each: true })
  risks?: string[];

  @ApiPropertyOptional({ description: 'Recomendações principais' })
  @IsOptional() @IsArray() @IsString({ each: true })
  recommendations?: string[];

  @ApiPropertyOptional({ description: 'Próximos passos' })
  @IsOptional() @IsArray() @IsString({ each: true })
  nextSteps?: string[];

  @ApiPropertyOptional({ description: 'Narrativa executiva (texto livre ou gerado por IA)' })
  @IsOptional() @IsString()
  narrative?: string;

  @ApiProperty({ type: [ReportKpiDto] })
  @IsArray() @ValidateNested({ each: true }) @Type(() => ReportKpiDto)
  metrics!: ReportKpiDto[];

  @ApiPropertyOptional({ default: true }) @IsOptional() @IsBoolean()
  autoGenerateNarrative?: boolean;
}

export class UpdateExecutiveReportDto extends PartialType(CreateExecutiveReportDto) {}

// ─── Approval ─────────────────────────────────────────────────────────────────

export class ApproveReportDto {
  @ApiProperty() @IsInt()
  reportId!: number;

  @ApiProperty({ enum: ['approve', 'reject'] }) @IsString()
  decision!: 'approve' | 'reject';

  @ApiPropertyOptional() @IsOptional() @IsString()
  comment?: string;
}

// ─── Filters ──────────────────────────────────────────────────────────────────

export class ReportFilterDto {
  @ApiPropertyOptional({ enum: ReportType }) @IsOptional() @IsEnum(ReportType)
  type?: ReportType;

  @ApiPropertyOptional({ enum: ReportStatus }) @IsOptional() @IsEnum(ReportStatus)
  status?: ReportStatus;

  @ApiPropertyOptional() @IsOptional() @IsInt() @Type(() => Number)
  departmentId?: number;

  @ApiPropertyOptional() @IsOptional() @IsString()
  period?: string;

  @ApiPropertyOptional({ default: 1 }) @IsOptional() @IsInt() @Min(1) @Type(() => Number)
  page?: number;

  @ApiPropertyOptional({ default: 20 }) @IsOptional() @IsInt() @Min(1) @Type(() => Number)
  limit?: number;
}