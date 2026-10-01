// src/executive-reports/dto/executive-filters.dto.ts
// Filtros globais partilhados por todos os separadores (docs §5).
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDateString, IsIn, IsInt, IsOptional } from 'class-validator';

export const EXECUTIVE_PERIODS = ['month', 'quarter', 'year', 'custom'] as const;
export type ExecutivePeriod = (typeof EXECUTIVE_PERIODS)[number];

export const EXECUTIVE_COMPARES = ['previous', 'previous_year', 'target'] as const;
export type ExecutiveCompare = (typeof EXECUTIVE_COMPARES)[number];

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
}
