// modulo_monitoring.md §7 — DTOs da aba Alertas.

import { AlertSeverity } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsEnum, IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export const ALERT_AREAS = [
  'SISTEMA',
  'PROCESSOS',
  'INTEGRACAO',
  'AUTOMACAO',
  'SLA',
  'SEGURANCA',
] as const;
export type AlertArea = (typeof ALERT_AREAS)[number];

export const ALERT_STATES = ['ABERTO', 'RECONHECIDO', 'EM_TRATAMENTO', 'RESOLVIDO'] as const;
export type AlertState = (typeof ALERT_STATES)[number];

export class ListAlertsQueryDto {
  @IsOptional() @IsIn(ALERT_AREAS) area?: AlertArea;
  @IsOptional() @IsEnum(AlertSeverity) severity?: AlertSeverity;
  @IsOptional() @IsIn(ALERT_STATES) state?: AlertState;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(200) limit?: number;
}

export class AssignAlertDto {
  @Type(() => Number) @IsInt() @Min(1) assigneeId!: number;
}

export class AlertActionDto {
  @IsString() @MaxLength(2000) note!: string;
}

export class ResolveAlertActionDto {
  @IsOptional() @IsString() @MaxLength(2000) note?: string;
}
