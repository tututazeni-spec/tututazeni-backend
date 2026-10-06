// modulo_scalability.md §20 — DTOs da aba Testes de Carga.

import { ScalabilityLoadTestStatus, ScalabilityLoadTestVerdict } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export const LOAD_TEST_TYPES = [
  'LOAD',
  'STRESS',
  'SPIKE',
  'ENDURANCE',
  'VOLUME',
  'FAILOVER',
] as const;
export const LOAD_TEST_ENVIRONMENTS = ['LOCAL', 'STAGING', 'PRODUCTION'] as const;

export class CreateLoadTestDto {
  @IsString() @MaxLength(200) name!: string;
  @IsIn(LOAD_TEST_TYPES) type!: (typeof LOAD_TEST_TYPES)[number];
  @IsIn(LOAD_TEST_ENVIRONMENTS) environment!: (typeof LOAD_TEST_ENVIRONMENTS)[number];
  @IsOptional() @IsString() @MaxLength(60) appVersion?: string;
  @IsOptional() @IsString() @MaxLength(4000) scenario?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) modules?: string[];
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(1_000_000) simulatedUsers?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(1_000_000) targetRps?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(604_800) durationSec?: number;
  @IsOptional() @IsDateString() scheduledAt?: string;
}

export class UpdateLoadTestDto {
  @IsOptional() @IsString() @MaxLength(200) name?: string;
  @IsOptional() @IsIn(LOAD_TEST_TYPES) type?: (typeof LOAD_TEST_TYPES)[number];
  @IsOptional() @IsIn(LOAD_TEST_ENVIRONMENTS) environment?: (typeof LOAD_TEST_ENVIRONMENTS)[number];
  @IsOptional() @IsString() @MaxLength(60) appVersion?: string;
  @IsOptional() @IsString() @MaxLength(4000) scenario?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) modules?: string[];
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(1_000_000) simulatedUsers?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(1_000_000) targetRps?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(604_800) durationSec?: number;
  @IsOptional() @IsDateString() scheduledAt?: string;
  @IsOptional() @IsEnum(ScalabilityLoadTestStatus) status?: ScalabilityLoadTestStatus;
  // Resultados
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) throughputRps?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) p95Ms?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) p99Ms?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) @Max(100) errorRate?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) @Max(100) cpuPeak?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) @Max(100) ramPeak?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) dbPeakConn?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) queuePeak?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) peakConcurrent?: number;
  @IsOptional() @IsEnum(ScalabilityLoadTestVerdict) verdict?: ScalabilityLoadTestVerdict;
  @IsOptional() @IsString() @MaxLength(4000) observations?: string;
}

export class ListLoadTestsQueryDto {
  @IsOptional() @IsIn(LOAD_TEST_TYPES) type?: (typeof LOAD_TEST_TYPES)[number];
  @IsOptional() @IsEnum(ScalabilityLoadTestStatus) status?: ScalabilityLoadTestStatus;
}
