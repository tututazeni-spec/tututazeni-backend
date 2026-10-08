// src/audit/audit-incidents.dto.ts
// DTOs da aba «Segurança e Incidentes» (docs/modulo_audit.md §8).
import { IsEnum, IsIn, IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { RiskLevel, SecurityIncidentStatus } from '@prisma/client';
import { BaseFilterDto } from '../common/dtos/pagination.dto';

export const INCIDENT_CATEGORIES = ['SECURITY', 'ACCESS', 'DATA', 'INTEGRATION', 'OTHER'] as const;
export const INCIDENT_SOURCES = ['USER', 'SYSTEM', 'RULE'] as const;
export const INCIDENT_TYPES = [
  'UNAUTHORIZED_ACCESS',
  'PERMISSION_CHANGE',
  'ABNORMAL_EXPORT',
  'SENSITIVE_DOCUMENT_ACCESS',
  'REPEATED_FAILURES',
  'SALARY_DATA_CHANGE',
  'AUDIT_TAMPERING',
  'INTEGRATION_FAILURE',
  'OTHER',
] as const;

export class IncidentFilterDto extends BaseFilterDto {
  @ApiPropertyOptional({ enum: SecurityIncidentStatus })
  @IsOptional()
  @IsEnum(SecurityIncidentStatus)
  status?: SecurityIncidentStatus;

  @ApiPropertyOptional({ enum: RiskLevel })
  @IsOptional()
  @IsEnum(RiskLevel)
  severity?: RiskLevel;

  @ApiPropertyOptional({ enum: INCIDENT_CATEGORIES })
  @IsOptional()
  @IsIn(INCIDENT_CATEGORIES)
  category?: (typeof INCIDENT_CATEGORIES)[number];

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  assigneeId?: number;

  @ApiPropertyOptional({ description: 'Código ou título' })
  @IsOptional()
  @IsString()
  search?: string;
}

export class CreateIncidentDto {
  @IsString()
  @MaxLength(200)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string;

  @IsIn(INCIDENT_CATEGORIES)
  category!: (typeof INCIDENT_CATEGORIES)[number];

  @IsOptional()
  @IsIn(INCIDENT_TYPES)
  type?: (typeof INCIDENT_TYPES)[number];

  @IsEnum(RiskLevel)
  severity!: RiskLevel;

  @IsOptional()
  @IsIn(INCIDENT_SOURCES)
  source?: (typeof INCIDENT_SOURCES)[number];

  @IsOptional()
  @IsString()
  @MaxLength(200)
  sourceLabel?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  assigneeId?: number;

  /** Evento de auditoria que originou o incidente — fica logo como evidência. */
  @IsOptional()
  @IsInt()
  @Min(1)
  auditLogId?: number;
}

export class UpdateIncidentDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string;

  @IsOptional()
  @IsIn(INCIDENT_CATEGORIES)
  category?: (typeof INCIDENT_CATEGORIES)[number];

  @IsOptional()
  @IsIn(INCIDENT_TYPES)
  type?: (typeof INCIDENT_TYPES)[number];

  @IsOptional()
  @IsEnum(RiskLevel)
  severity?: RiskLevel;
}

export class AssignIncidentDto {
  @IsInt()
  @Min(1)
  assigneeId!: number;
}

export class IncidentStatusDto {
  @IsEnum(SecurityIncidentStatus)
  status!: SecurityIncidentStatus;

  /** Obrigatória ao mitigar ou encerrar. */
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  resolution?: string;
}

export class IncidentEvidenceDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  auditLogId?: number;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;
}
