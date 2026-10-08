// modulo_scalability.md §18 — DTOs da aba Incidentes de Capacidade.

import { AlertSeverity, ScalabilityIncidentStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export const INCIDENT_CATEGORIES = [
  'OVERLOAD',
  'SLOW_API',
  'DB_SATURATED',
  'STORAGE_FULL',
  'QUEUE_CONGESTED',
  'TIMEOUT',
  'MEMORY_LEAK',
  'HIGH_CPU',
  'SCALING_FAILURE',
  'DEGRADATION',
] as const;

export const INCIDENT_COMPONENTS = [
  'API',
  'DATABASE',
  'STORAGE',
  'QUEUE',
  'FRONTEND',
  'INTEGRATIONS',
  'INFRASTRUCTURE',
] as const;

export class CreateIncidentDto {
  @IsString() @MaxLength(200) title!: string;
  @IsIn(INCIDENT_CATEGORIES) category!: (typeof INCIDENT_CATEGORIES)[number];
  @IsIn(INCIDENT_COMPONENTS) component!: (typeof INCIDENT_COMPONENTS)[number];
  @IsEnum(AlertSeverity) severity!: AlertSeverity;
  @IsOptional() @IsDateString() occurredAt?: string;
  @IsOptional() @IsString() @MaxLength(4000) impact?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(10_000_000) affectedUsers?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) ownerId?: number;
}

export class UpdateIncidentDto {
  @IsOptional() @IsString() @MaxLength(200) title?: string;
  @IsOptional() @IsIn(INCIDENT_CATEGORIES) category?: (typeof INCIDENT_CATEGORIES)[number];
  @IsOptional() @IsIn(INCIDENT_COMPONENTS) component?: (typeof INCIDENT_COMPONENTS)[number];
  @IsOptional() @IsEnum(AlertSeverity) severity?: AlertSeverity;
  @IsOptional() @IsEnum(ScalabilityIncidentStatus) status?: ScalabilityIncidentStatus;
  @IsOptional() @IsString() @MaxLength(4000) impact?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(10_000_000) affectedUsers?: number;
  @IsOptional() @IsString() @MaxLength(4000) rootCause?: string;
  @IsOptional() @IsString() @MaxLength(4000) actionTaken?: string;
  @IsOptional() @IsString() @MaxLength(20_000) postMortem?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) ownerId?: number;
}

export class ListIncidentsQueryDto {
  @IsOptional() @IsEnum(ScalabilityIncidentStatus) status?: ScalabilityIncidentStatus;
  @IsOptional() @IsIn(INCIDENT_COMPONENTS) component?: (typeof INCIDENT_COMPONENTS)[number];
  @IsOptional() @IsEnum(AlertSeverity) severity?: AlertSeverity;
}
