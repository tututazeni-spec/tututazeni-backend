// src/executive-reports/dto/executive-generation.dto.ts
// DTOs de geração, relatórios personalizados e agendados (docs §7 e §8).
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { ExecutiveFiltersDto } from './executive-filters.dto';
import { SECTION_KEYS } from '../executive-reports.templates';
import { PRIMARY_KPI_CODES } from '../executive-reports.kpi-catalog';

export const EXPORT_FORMATS = ['PDF', 'XLSX', 'CSV'] as const;
export const SCHEDULE_FREQUENCIES = ['WEEKLY', 'MONTHLY', 'QUARTERLY', 'ANNUAL'] as const;

export class GenerateExecutiveReportDto {
  @ApiProperty({ description: 'Código de um modelo predefinido (GET /templates)' })
  @IsString()
  @MaxLength(60)
  templateCode!: string;

  @ApiPropertyOptional({ description: 'Título; omissão = nome do modelo + período' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @ApiPropertyOptional({ type: ExecutiveFiltersDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => ExecutiveFiltersDto)
  filters?: ExecutiveFiltersDto;
}

/** Configuração de um relatório personalizado (§8 pontos 1-6). */
export class CustomReportConfigDto {
  @ApiProperty({ description: 'Módulos/indicadores a apresentar', isArray: true })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(SECTION_KEYS.length)
  @IsIn(SECTION_KEYS, { each: true })
  sections!: string[];

  @ApiPropertyOptional({ description: 'KPIs a mostrar na secção kpis (omissão: todos)' })
  @IsOptional()
  @IsArray()
  @IsIn(PRIMARY_KPI_CODES, { each: true })
  kpiCodes?: string[];

  @ApiPropertyOptional({ description: 'Coluna de ordenação (aplica-se às secções que a tenham)' })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  sortBy?: string;

  @ApiPropertyOptional({ enum: ['asc', 'desc'] })
  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortDir?: 'asc' | 'desc';

  @ApiPropertyOptional({ type: ExecutiveFiltersDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => ExecutiveFiltersDto)
  filters?: ExecutiveFiltersDto;
}

export class GenerateCustomReportDto extends CustomReportConfigDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;
}

export class SaveReportTemplateDto {
  @ApiProperty()
  @IsString()
  @MinLength(3)
  @MaxLength(120)
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiProperty({ type: CustomReportConfigDto })
  @ValidateNested()
  @Type(() => CustomReportConfigDto)
  config!: CustomReportConfigDto;
}

export class UpdateReportTemplateDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(120)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiPropertyOptional({ type: CustomReportConfigDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => CustomReportConfigDto)
  config?: CustomReportConfigDto;
}

export class CreateScheduleDto {
  @ApiProperty()
  @IsString()
  @MinLength(3)
  @MaxLength(120)
  name!: string;

  @ApiPropertyOptional({ description: 'Modelo predefinido' })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  templateCode?: string;

  @ApiPropertyOptional({ description: 'Modelo personalizado guardado' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  templateId?: number;

  @ApiProperty({ enum: SCHEDULE_FREQUENCIES })
  @IsIn(SCHEDULE_FREQUENCIES)
  frequency!: (typeof SCHEDULE_FREQUENCIES)[number];

  @ApiPropertyOptional({ description: 'Hora de execução (0-23)', default: 8 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(23)
  hour?: number;

  @ApiPropertyOptional({ description: 'Dia da semana (0=Domingo) — semanal', default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(6)
  dayOfWeek?: number;

  @ApiPropertyOptional({ description: 'Dia do mês (1-28) — mensal/trimestral/anual', default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(28)
  dayOfMonth?: number;

  @ApiProperty({ enum: EXPORT_FORMATS })
  @IsIn(EXPORT_FORMATS)
  format!: (typeof EXPORT_FORMATS)[number];

  @ApiProperty({ description: 'Utilizadores destinatários (permissões revalidadas na entrega)' })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @Type(() => Number)
  @IsInt({ each: true })
  recipientIds!: number[];

  @ApiPropertyOptional({
    type: ExecutiveFiltersDto,
    description: 'Omissão: último período fechado da periodicidade',
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => ExecutiveFiltersDto)
  filters?: ExecutiveFiltersDto;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class UpdateScheduleDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(120)
  name?: string;

  @ApiPropertyOptional({ enum: SCHEDULE_FREQUENCIES })
  @IsOptional()
  @IsIn(SCHEDULE_FREQUENCIES)
  frequency?: (typeof SCHEDULE_FREQUENCIES)[number];

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(23)
  hour?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(6)
  dayOfWeek?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(28)
  dayOfMonth?: number;

  @ApiPropertyOptional({ enum: EXPORT_FORMATS })
  @IsOptional()
  @IsIn(EXPORT_FORMATS)
  format?: (typeof EXPORT_FORMATS)[number];

  @ApiPropertyOptional()
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @Type(() => Number)
  @IsInt({ each: true })
  recipientIds?: number[];

  @ApiPropertyOptional({ type: ExecutiveFiltersDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => ExecutiveFiltersDto)
  filters?: ExecutiveFiltersDto;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class ArchiveFilterDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(60)
  templateCode?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  scheduleId?: number;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}

export class ExportQueryDto {
  @ApiPropertyOptional({ enum: EXPORT_FORMATS, default: 'PDF' })
  @IsOptional()
  @IsIn(EXPORT_FORMATS)
  format?: (typeof EXPORT_FORMATS)[number];
}
