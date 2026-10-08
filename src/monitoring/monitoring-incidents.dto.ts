// modulo_monitoring.md §8 — DTOs da aba Incidentes.
// Criar/actualizar reutiliza CreateIncidentDto/UpdateIncidentDto do Scalability
// (incidentes operacionais); os de segurança são geridos no módulo Audit.

import { IsIn, IsOptional } from 'class-validator';

export const INCIDENT_KINDS = ['OPERATIONAL', 'SECURITY'] as const;
export type IncidentKind = (typeof INCIDENT_KINDS)[number];

export const UNIFIED_SEVERITIES = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] as const;
export type UnifiedSeverity = (typeof UNIFIED_SEVERITIES)[number];

export class ListMonitoringIncidentsQueryDto {
  @IsOptional() @IsIn(INCIDENT_KINDS) kind?: IncidentKind;
  @IsOptional() @IsIn(['ACTIVE', 'RESOLVED']) group?: 'ACTIVE' | 'RESOLVED';
  @IsOptional() @IsIn(UNIFIED_SEVERITIES) severity?: UnifiedSeverity;
}
