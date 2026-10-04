// src/audit/audit-reports.dto.ts
// Abas «Relatórios» e «Exportações e Evidências» (docs/modulo_audit.md §10-11).
import {
  IsBase64,
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { AuditSeverity, AuditStatus } from './audit.dto';
import { BaseFilterDto } from '../common/dtos/pagination.dto';

export const AUDIT_REPORT_TYPES = [
  'executive-summary',
  'activity-by-module',
  'data-changes',
  'access-failures',
  'permission-changes',
  'payroll-critical',
  'attendance-leave',
  'approvals',
  'sensitive-exports',
  'incidents',
  'audits',
  'corrective-actions',
  'integrations-automations',
  'admin-activity',
] as const;
export type AuditReportType = (typeof AUDIT_REPORT_TYPES)[number];

export const AUDIT_MODULES = [
  'users',
  'organization',
  'lms',
  'performance',
  'talent',
  'payroll',
  'attendance-leave',
  'documents',
  'integrations',
  'security',
] as const;

export const CONFIDENTIALITY_LEVELS = ['INTERNAL', 'CONFIDENTIAL', 'RESTRICTED'] as const;

export class AuditReportDto {
  @ApiProperty({ enum: AUDIT_REPORT_TYPES })
  @IsIn(AUDIT_REPORT_TYPES)
  type!: AuditReportType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  to?: string;

  @ApiPropertyOptional({
    description: `Módulos separados por vírgula: ${AUDIT_MODULES.join(', ')}`,
  })
  @IsOptional()
  @IsString()
  modules?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  userId?: number;

  @ApiPropertyOptional({ description: 'Perfis (nomes de papel) separados por vírgula' })
  @IsOptional()
  @IsString()
  roles?: string;

  @ApiPropertyOptional({ description: 'Unidade / departamento' })
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  departmentId?: number;

  @ApiPropertyOptional({ description: 'Tipo de evento (acção, contém)' })
  @IsOptional()
  @IsString()
  eventType?: string;

  @ApiPropertyOptional({ enum: AuditSeverity })
  @IsOptional()
  @IsEnum(AuditSeverity)
  severity?: AuditSeverity;

  @ApiPropertyOptional({ enum: AuditStatus, description: 'Resultado da operação' })
  @IsOptional()
  @IsEnum(AuditStatus)
  result?: AuditStatus;

  @ApiPropertyOptional({ description: 'Estado do incidente ou da auditoria' })
  @IsOptional()
  @IsString()
  state?: string;
}

export class AuditReportExportDto extends AuditReportDto {
  @ApiProperty({ enum: ['csv', 'xlsx', 'pdf'] })
  @IsIn(['csv', 'xlsx', 'pdf'])
  format!: 'csv' | 'xlsx' | 'pdf';

  @ApiPropertyOptional({ enum: CONFIDENTIALITY_LEVELS })
  @IsOptional()
  @IsIn(CONFIDENTIALITY_LEVELS)
  confidentiality?: (typeof CONFIDENTIALITY_LEVELS)[number];
}

export class ExportFilterDto extends BaseFilterDto {
  @ApiPropertyOptional({ enum: ['REPORT', 'EVIDENCE'] })
  @IsOptional()
  @IsIn(['REPORT', 'EVIDENCE'])
  kind?: 'REPORT' | 'EVIDENCE';

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  reportType?: string;

  @ApiPropertyOptional({ enum: ['csv', 'xlsx', 'pdf', 'other'] })
  @IsOptional()
  @IsIn(['csv', 'xlsx', 'pdf', 'other'])
  format?: string;

  @ApiPropertyOptional({ enum: CONFIDENTIALITY_LEVELS })
  @IsOptional()
  @IsIn(CONFIDENTIALITY_LEVELS)
  confidentiality?: string;

  @ApiPropertyOptional({ enum: ['ACTIVE', 'EXPIRED', 'PURGED'] })
  @IsOptional()
  @IsIn(['ACTIVE', 'EXPIRED', 'PURGED'])
  status?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  incidentId?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  auditId?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  to?: string;
}

export class UploadEvidenceDto {
  @ApiProperty()
  @IsString()
  @MaxLength(200)
  fileName!: string;

  @ApiProperty({ description: 'Conteúdo do ficheiro em base64 (máx. ~5 MB)' })
  @IsBase64()
  contentBase64!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  mimeType?: string;

  @ApiPropertyOptional({ description: 'Incidente de segurança relacionado' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  incidentId?: number;

  @ApiPropertyOptional({ description: 'Auditoria interna relacionada' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  auditId?: number;

  @ApiPropertyOptional({ enum: CONFIDENTIALITY_LEVELS })
  @IsOptional()
  @IsIn(CONFIDENTIALITY_LEVELS)
  confidentiality?: (typeof CONFIDENTIALITY_LEVELS)[number];

  @ApiPropertyOptional({ description: 'Dias de retenção (por omissão, a política de EXPORTS)' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  retentionDays?: number;
}

export class UpdateExportDto {
  @ApiPropertyOptional({ enum: CONFIDENTIALITY_LEVELS })
  @IsOptional()
  @IsIn(CONFIDENTIALITY_LEVELS)
  confidentiality?: (typeof CONFIDENTIALITY_LEVELS)[number];

  @ApiPropertyOptional({ description: 'Nova data limite de retenção (só pode ser prolongada)' })
  @IsOptional()
  @IsDateString()
  retentionUntil?: string;
}
