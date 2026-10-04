// src/audit/audit-policy.dto.ts
// Aba «Políticas e Retenção» (docs/modulo_audit.md §12).
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEmail,
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export const RETENTION_CATEGORIES = [
  'ACCESS',
  'DATA_CHANGES',
  'SECURITY',
  'PAYROLL',
  'EXPORTS',
  'GENERAL',
] as const;
export type RetentionCategory = (typeof RETENTION_CATEGORIES)[number];

// Limites defensivos: abaixo do mínimo a trilha perde valor probatório; acima do máximo
// deixa de ser proporcional à finalidade (RGPD). Os prazos concretos devem ser validados
// pelo encarregado de proteção de dados / jurídico.
export const RETENTION_MIN_DAYS = 90;
export const RETENTION_MAX_DAYS = 3650;

export const SEVERITY_LEVELS = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const;

export const ALERT_RULE_KEYS = [
  'failedLoginsPerHour',
  'exportsPerHour',
  'deletesPerDay',
  'permissionChangesPerDay',
] as const;
export type AlertRuleKey = (typeof ALERT_RULE_KEYS)[number];

export interface AuditPolicyValues {
  requiredEvents: string[];
  coveredModules: string[];
  severityRules: Record<string, string>;
  alertRules: Record<AlertRuleKey, number>;
  retentionDays: Record<RetentionCategory, number>;
  archivePolicy: string | null;
  viewRoles: string[];
  exportRoles: string[];
  maskSensitive: boolean;
  maskedFields: string[];
  backupDestination: string | null;
  backupFrequency: string | null;
  serviceEnabled: boolean;
  failureAlertEmails: string[];
}

export const DEFAULT_POLICY: AuditPolicyValues = {
  requiredEvents: [
    'LOGIN',
    'FAILED',
    'CREATE',
    'UPDATE',
    'DELETE',
    'APPROVE',
    'REJECT',
    'EXPORT',
    'PERMISSION',
  ],
  coveredModules: [],
  severityRules: { DELETE: 'HIGH', EXPORT: 'HIGH', PERMISSION: 'HIGH', FAILED: 'MEDIUM' },
  alertRules: {
    failedLoginsPerHour: 3,
    exportsPerHour: 3,
    deletesPerDay: 5,
    permissionChangesPerDay: 5,
  },
  retentionDays: {
    ACCESS: 365,
    DATA_CHANGES: 1825,
    SECURITY: 1825,
    PAYROLL: 3650,
    EXPORTS: 730,
    GENERAL: 730,
  },
  archivePolicy: null,
  viewRoles: ['ADMIN', 'AUDITOR'],
  exportRoles: ['ADMIN'],
  maskSensitive: true,
  maskedFields: ['salary', 'iban', 'nib', 'nif', 'birthDate', 'address'],
  backupDestination: null,
  backupFrequency: null,
  serviceEnabled: true,
  failureAlertEmails: [],
};

const ROLE_CODES = ['ADMIN', 'RH', 'GESTOR', 'DIRECTOR', 'LIDER', 'AUDITOR'] as const;

export class UpdateAuditPolicyDto {
  @ApiPropertyOptional({ description: 'Eventos de registo obrigatório (ex.: LOGIN, DELETE)' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @IsString({ each: true })
  @MaxLength(80, { each: true })
  requiredEvents?: string[];

  @ApiPropertyOptional({ description: 'Módulos/entidades abrangidos (vazio = todos)' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @IsString({ each: true })
  @MaxLength(80, { each: true })
  coveredModules?: string[];

  @ApiPropertyOptional({ description: '{ "<ACÇÃO>": "LOW|MEDIUM|HIGH|CRITICAL" }' })
  @IsOptional()
  @IsObject()
  severityRules?: Record<string, string>;

  @ApiPropertyOptional({ description: `Limites de deteção: ${ALERT_RULE_KEYS.join(', ')}` })
  @IsOptional()
  @IsObject()
  alertRules?: Record<string, number>;

  @ApiPropertyOptional({
    description: `Dias de retenção por categoria (${RETENTION_CATEGORIES.join(', ')}); ${RETENTION_MIN_DAYS}-${RETENTION_MAX_DAYS}`,
  })
  @IsOptional()
  @IsObject()
  retentionDays?: Record<string, number>;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  archivePolicy?: string;

  @ApiPropertyOptional({ enum: ROLE_CODES, isArray: true })
  @IsOptional()
  @IsArray()
  @IsIn(ROLE_CODES, { each: true })
  viewRoles?: string[];

  @ApiPropertyOptional({ enum: ROLE_CODES, isArray: true })
  @IsOptional()
  @IsArray()
  @IsIn(ROLE_CODES, { each: true })
  exportRoles?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  maskSensitive?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @IsString({ each: true })
  @MaxLength(80, { each: true })
  maskedFields?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(300)
  backupDestination?: string;

  @ApiPropertyOptional({ enum: ['DAILY', 'WEEKLY', 'MONTHLY'] })
  @IsOptional()
  @IsIn(['DAILY', 'WEEKLY', 'MONTHLY'])
  backupFrequency?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  serviceEnabled?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsEmail({}, { each: true })
  failureAlertEmails?: string[];

  @ApiPropertyOptional({ description: 'Justificação da alteração (fica no registo de auditoria)' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
