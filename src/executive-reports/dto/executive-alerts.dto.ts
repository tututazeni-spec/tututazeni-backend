// src/executive-reports/dto/executive-alerts.dto.ts
// DTOs dos alertas executivos (docs/Executive_Reports.md §9).
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export const ALERT_STATUSES = ['OPEN', 'ACKNOWLEDGED', 'RESOLVED', 'DISMISSED'] as const;
export const ALERT_SEVERITIES = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const;

export class AlertFilterDto {
  @ApiPropertyOptional({ enum: ALERT_STATUSES })
  @IsOptional()
  @IsIn(ALERT_STATUSES)
  status?: (typeof ALERT_STATUSES)[number];

  @ApiPropertyOptional({ enum: ALERT_SEVERITIES })
  @IsOptional()
  @IsIn(ALERT_SEVERITIES)
  severity?: (typeof ALERT_SEVERITIES)[number];

  @ApiPropertyOptional({ description: 'Módulo de origem (ex.: performance)' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  sourceModule?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  ownerId?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  departmentId?: number;

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

export class AlertActionDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  comment?: string;
}

export class AlertAssignDto extends AlertActionDto {
  @ApiPropertyOptional({ description: 'Responsável (utilizador); null remove' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  ownerId?: number;

  @ApiPropertyOptional({ description: 'Novo prazo (ISO)' })
  @IsOptional()
  @IsDateString()
  dueDate?: string;
}

export class UpdateAlertRuleDto {
  @ApiPropertyOptional({ description: 'Limiar da regra (unidade conforme a regra)' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  threshold?: number;

  @ApiPropertyOptional({ enum: ALERT_SEVERITIES })
  @IsOptional()
  @IsIn(ALERT_SEVERITIES)
  severity?: (typeof ALERT_SEVERITIES)[number];

  @ApiPropertyOptional({ description: 'Responsável pela área' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  ownerId?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
