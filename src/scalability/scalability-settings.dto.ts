// modulo_scalability.md §24 — DTO da aba Configurações.

import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsDateString,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class MaintenanceWindowDto {
  @IsOptional() @IsString() @MaxLength(64) id?: string;
  @IsString() @MaxLength(120) name!: string;
  @IsDateString() startsAt!: string;
  @IsDateString() endsAt!: string;
  @IsOptional() @IsString() @MaxLength(300) note?: string;
}

export class UpdateScalabilitySettingsDto {
  @IsOptional() @IsInt() @Min(1) @Max(10_000_000) maxConcurrentUsers?: number;
  @IsOptional() @IsInt() @Min(1) @Max(1_000_000) maxApiRps?: number;

  /** { cpu: 90, p95Ms: 2000, … } — chaves e intervalos validados no serviço. */
  @IsOptional() @IsObject() thresholds?: Record<string, number>;

  /** Chaves das regras de alerta desactivadas (lista completa — substitui a anterior). */
  @IsOptional() @IsArray() @ArrayMaxSize(50) @IsString({ each: true }) disabledRules?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => MaintenanceWindowDto)
  maintenanceWindows?: MaintenanceWindowDto[];

  @IsOptional() @IsInt() @Min(7) @Max(3650) metricRetentionDays?: number;
  @IsOptional() @IsInt() @Min(1) @Max(60) collectionIntervalMinutes?: number;

  @IsOptional() @IsArray() @ArrayMaxSize(10) @IsString({ each: true }) authorizedRoles?: string[];
}
