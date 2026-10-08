// src/executive-reports/dto/executive-filters.dto.ts
// Filtros globais partilhados por todos os separadores (docs §5).
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDateString, IsIn, IsInt, IsOptional } from 'class-validator';
import { ContractType } from '@prisma/client';

export const EXECUTIVE_PERIODS = ['month', 'quarter', 'year', 'custom'] as const;
export type ExecutivePeriod = (typeof EXECUTIVE_PERIODS)[number];

export const EXECUTIVE_COMPARES = ['previous', 'previous_year', 'target'] as const;
export type ExecutiveCompare = (typeof EXECUTIVE_COMPARES)[number];

export const EXECUTIVE_KPI_STATES = [
  'ON_TARGET',
  'WARNING',
  'CRITICAL',
  'NO_TARGET',
  'NO_DATA',
] as const;
export type ExecutiveKpiStateFilter = (typeof EXECUTIVE_KPI_STATES)[number];

export class ExecutiveFiltersDto {
  @ApiPropertyOptional({ enum: EXECUTIVE_PERIODS, default: 'year' })
  @IsOptional()
  @IsIn(EXECUTIVE_PERIODS)
  period?: ExecutivePeriod;

  @ApiPropertyOptional({ description: 'Obrigatório se period=custom (ISO)' })
  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @ApiPropertyOptional({ description: 'Obrigatório se period=custom (ISO)' })
  @IsOptional()
  @IsDateString()
  dateTo?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  unitId?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  departmentId?: number;

  @ApiPropertyOptional({ enum: EXECUTIVE_COMPARES, default: 'previous' })
  @IsOptional()
  @IsIn(EXECUTIVE_COMPARES)
  compareWith?: ExecutiveCompare;

  // ── Outros filtros (§5) ──────────────────────────────────────────────────

  @ApiPropertyOptional({ description: 'Cargo' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  positionId?: number;

  @ApiPropertyOptional({ enum: ContractType, description: 'Tipo de vínculo' })
  @IsOptional()
  @IsIn(Object.values(ContractType))
  contractType?: ContractType;

  @ApiPropertyOptional({ description: 'Curso (restringe os indicadores de formação)' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  courseId?: number;

  @ApiPropertyOptional({ enum: EXECUTIVE_KPI_STATES, description: 'Estado do indicador' })
  @IsOptional()
  @IsIn(EXECUTIVE_KPI_STATES)
  kpiState?: ExecutiveKpiStateFilter;
}
