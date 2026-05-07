// ============================================================
// INNOVA PLATFORM — SCALABILITY MODULE — DTOs
// src/modules/scalability/scalability.dto.ts
// ============================================================

import {
  IsString, IsOptional, IsBoolean, IsEnum, IsInt, IsArray,
  IsNumber, Min, Max, IsUrl, ValidateNested, IsDateString,
  IsNotEmpty, MaxLength, MinLength, IsPositive,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';

// -------------------------------------------------------
// ENUMS (espelhar do Prisma)
// -------------------------------------------------------
export enum TenantPlan { STARTER = 'STARTER', GROWTH = 'GROWTH', ENTERPRISE = 'ENTERPRISE', CUSTOM = 'CUSTOM' }
export enum SsoProvider { GOOGLE = 'GOOGLE', MICROSOFT = 'MICROSOFT', SAML = 'SAML', OIDC = 'OIDC', SLACK = 'SLACK' }
export enum IntegrationType {
  ERP_HR = 'ERP_HR', PAYROLL = 'PAYROLL', ATS = 'ATS',
  MICROSOFT_TEAMS = 'MICROSOFT_TEAMS', SLACK = 'SLACK',
  SSO_GOOGLE = 'SSO_GOOGLE', SSO_MICROSOFT = 'SSO_MICROSOFT',
  SCORM_PROVIDER = 'SCORM_PROVIDER', XAPI_LRS = 'XAPI_LRS',
  BI_TOOL = 'BI_TOOL', CUSTOM_WEBHOOK = 'CUSTOM_WEBHOOK',
}
export enum IntegrationStatus {
  ACTIVE = 'ACTIVE', INACTIVE = 'INACTIVE', ERROR = 'ERROR',
  PENDING_AUTH = 'PENDING_AUTH', RATE_LIMITED = 'RATE_LIMITED',
}
export enum SyncFrequency {
  REALTIME = 'REALTIME', HOURLY = 'HOURLY', DAILY = 'DAILY',
  WEEKLY = 'WEEKLY', MANUAL = 'MANUAL',
}
export enum AutomationTrigger {
  USER_HIRED = 'USER_HIRED', USER_PROMOTED = 'USER_PROMOTED',
  USER_TRANSFERRED = 'USER_TRANSFERRED', USER_OFFBOARDED = 'USER_OFFBOARDED',
  COURSE_COMPLETED = 'COURSE_COMPLETED', CERTIFICATE_EXPIRED = 'CERTIFICATE_EXPIRED',
  TRAIL_COMPLETED = 'TRAIL_COMPLETED', SCHEDULED_CRON = 'SCHEDULED_CRON',
  WEBHOOK_EVENT = 'WEBHOOK_EVENT', MANUAL = 'MANUAL',
}
export enum AlertSeverity { INFO = 'INFO', WARNING = 'WARNING', CRITICAL = 'CRITICAL' }
export enum AlertCategory {
  PERFORMANCE = 'PERFORMANCE', SECURITY = 'SECURITY', INTEGRATION = 'INTEGRATION',
  STORAGE = 'STORAGE', SLA_BREACH = 'SLA_BREACH', AUTOMATION = 'AUTOMATION', COMPLIANCE = 'COMPLIANCE',
}

// -------------------------------------------------------
// TENANT CONFIG
// -------------------------------------------------------
export class CreateTenantConfigDto {
  @ApiProperty() @IsString() @IsNotEmpty() tenantCode: string;
  @ApiProperty() @IsString() @IsNotEmpty() tenantName: string;

  @ApiPropertyOptional({ enum: TenantPlan }) @IsOptional() @IsEnum(TenantPlan) plan?: TenantPlan;
  @ApiPropertyOptional() @IsOptional() @IsInt() @IsPositive() maxUsers?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @IsPositive() maxStorageGb?: number;
  @ApiPropertyOptional() @IsOptional() @IsDateString() trialEndsAt?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() contractStartDate?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() contractEndDate?: string;
  @ApiPropertyOptional() @IsOptional() @IsUrl() customDomain?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() logoUrl?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() primaryColor?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() defaultLanguage?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() defaultTimezone?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() defaultCurrency?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() ssoEnabled?: boolean;
  @ApiPropertyOptional({ enum: SsoProvider }) @IsOptional() @IsEnum(SsoProvider) ssoProvider?: SsoProvider;
  @ApiPropertyOptional() @IsOptional() @IsString() ssoConfigJson?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() offlineModeEnabled?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() adaptiveBitrate?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() cdnEnabled?: boolean;
}

export class UpdateTenantConfigDto extends PartialType(CreateTenantConfigDto) {}

// -------------------------------------------------------
// INTEGRATION CONFIG
// -------------------------------------------------------
export class CreateIntegrationConfigDto {
  @ApiProperty() @IsString() @IsNotEmpty() tenantId: string;
  @ApiProperty() @IsString() @IsNotEmpty() name: string;
  @ApiProperty({ enum: IntegrationType }) @IsEnum(IntegrationType) type: IntegrationType;
  @ApiPropertyOptional() @IsOptional() @IsUrl() baseUrl?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() authType?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() credentialsJson?: string;
  @ApiPropertyOptional({ enum: SyncFrequency }) @IsOptional() @IsEnum(SyncFrequency) syncFrequency?: SyncFrequency;
  @ApiPropertyOptional() @IsOptional() @IsUrl() webhookUrl?: string;
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() @IsString({ each: true }) webhookEvents?: string[];
  @ApiPropertyOptional() @IsOptional() @IsString() configJson?: string;
}

export class UpdateIntegrationConfigDto extends PartialType(CreateIntegrationConfigDto) {}

export class TriggerSyncDto {
  @ApiProperty() @IsString() @IsNotEmpty() integrationId: string;
}

// -------------------------------------------------------
// AUTOMATION RULE
// -------------------------------------------------------
export class AutomationConditionDto {
  @ApiProperty() @IsString() field: string;   // ex: "departmentId"
  @ApiProperty() @IsString() operator: string; // EQ | NEQ | IN | NOT_IN | GT | LT
  @ApiProperty() value: any;                   // valor da condição
}

export class AutomationActionDto {
  @ApiProperty() @IsString() type: string;     // ENROLL_COURSE | ASSIGN_TRAIL | SEND_NOTIFICATION | GRANT_BADGE | REVOKE_ACCESS
  @ApiProperty() payload: Record<string, any>; // dados específicos da ação
}

export class CreateAutomationRuleDto {
  @ApiProperty() @IsString() @IsNotEmpty() tenantId: string;
  @ApiProperty() @IsString() @IsNotEmpty() @MaxLength(120) name: string;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
  @ApiProperty({ enum: AutomationTrigger }) @IsEnum(AutomationTrigger) triggerType: AutomationTrigger;
  @ApiProperty() @IsString() triggerConfigJson: string;     // JSON serializado
  @ApiPropertyOptional() @IsOptional() @IsString() conditionsJson?: string;
  @ApiProperty() @IsString() actionsJson: string;           // JSON serializado
  @ApiPropertyOptional() @IsOptional() @IsInt() priority?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() createdBy?: string;
}

export class UpdateAutomationRuleDto extends PartialType(CreateAutomationRuleDto) {}

export class ExecuteAutomationRuleDto {
  @ApiProperty() @IsString() @IsNotEmpty() ruleId: string;
  @ApiPropertyOptional() @IsOptional() @IsString() targetUserId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() triggeredBy?: string;
}

// -------------------------------------------------------
// BULK IMPORT
// -------------------------------------------------------
export class BulkUserImportDto {
  @ApiProperty() @IsString() @IsNotEmpty() tenantId: string;
  @ApiProperty({ description: 'Base64 encoded CSV or JSON string' })
  @IsString() payload: string;

  @ApiPropertyOptional({ enum: ['CSV', 'JSON'] })
  @IsOptional() @IsString() format?: 'CSV' | 'JSON';

  @ApiPropertyOptional({ description: 'If true, update existing users' })
  @IsOptional() @IsBoolean() upsert?: boolean;

  @ApiPropertyOptional({ description: 'Notify users after import' })
  @IsOptional() @IsBoolean() sendWelcomeEmail?: boolean;
}

export class BulkImportResultDto {
  total: number;
  created: number;
  updated: number;
  skipped: number;
  failed: number;
  errors: Array<{ row: number; reason: string }>;
}

// -------------------------------------------------------
// SLA CONFIG
// -------------------------------------------------------
export class CreateSlaConfigDto {
  @ApiProperty() @IsString() tenantId: string;
  @ApiProperty() @IsString() @IsNotEmpty() name: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(90) @Max(100) uptimePercent?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(100) maxLatencyMs?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) @Max(1) maxErrorRate?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) incidentResponse?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) dataRetentionDays?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() backupFrequency?: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() rpoMinutes?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() rtoMinutes?: number;
}

export class UpdateSlaConfigDto extends PartialType(CreateSlaConfigDto) {}

// -------------------------------------------------------
// CONTENT DELIVERY CONFIG
// -------------------------------------------------------
export class UpdateContentDeliveryConfigDto {
  @ApiPropertyOptional() @IsOptional() @IsString() cdnProvider?: string;
  @ApiPropertyOptional() @IsOptional() @IsUrl() cdnBaseUrl?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() adaptiveBitrate?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsString() bitrateProfiles?: string; // JSON
  @ApiPropertyOptional() @IsOptional() @IsBoolean() offlineSyncEnabled?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) maxOfflineDays?: number;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() compressionEnabled?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsInt() @IsPositive() maxVideoSizeMb?: number;
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() @IsString({ each: true }) allowedFormats?: string[];
}

// -------------------------------------------------------
// METRICS & ALERTS
// -------------------------------------------------------
export class MetricsQueryDto {
  @ApiPropertyOptional() @IsOptional() @IsString() tenantId?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() from?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() to?: string;
  @ApiPropertyOptional({ enum: ['1h', '6h', '24h', '7d', '30d'] })
  @IsOptional() @IsString() window?: '1h' | '6h' | '24h' | '7d' | '30d';
}

export class CreateAlertDto {
  @ApiPropertyOptional() @IsOptional() @IsString() tenantId?: string;
  @ApiProperty({ enum: AlertSeverity }) @IsEnum(AlertSeverity) severity: AlertSeverity;
  @ApiProperty({ enum: AlertCategory }) @IsEnum(AlertCategory) category: AlertCategory;
  @ApiProperty() @IsString() @IsNotEmpty() title: string;
  @ApiProperty() @IsString() @IsNotEmpty() message: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() metricValue?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() threshold?: number;
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() notifiedVia?: string[];
}

export class ResolveAlertDto {
  @ApiProperty() @IsString() @IsNotEmpty() resolvedBy: string;
}

export class AlertsQueryDto {
  @ApiPropertyOptional() @IsOptional() @IsString() tenantId?: string;
  @ApiPropertyOptional({ enum: AlertSeverity }) @IsOptional() @IsEnum(AlertSeverity) severity?: AlertSeverity;
  @ApiPropertyOptional({ enum: AlertCategory }) @IsOptional() @IsEnum(AlertCategory) category?: AlertCategory;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isResolved?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) @Max(200) limit?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) offset?: number;
}

// -------------------------------------------------------
// DASHBOARD SUMMARY RESPONSE (não é DTO de entrada, mas de saída)
// -------------------------------------------------------
export class ScalabilityDashboardDto {
  tenantInfo: {
    id: string;
    tenantCode: string;
    tenantName: string;
    plan: string;
    maxUsers: number;
    activeUsersCount: number;
    storageUsedGb: number;
    maxStorageGb: number;
  };
  performanceSummary: {
    uptimePercent: number;
    avgLatencyMs: number;
    errorRate: number;
    activeSessionsNow: number;
    requestsPerMinute: number;
    cpuUsagePercent: number;
    memoryUsagePercent: number;
  };
  integrations: {
    total: number;
    active: number;
    withErrors: number;
    lastSyncAt: string | null;
  };
  automations: {
    total: number;
    active: number;
    executionsToday: number;
    failedToday: number;
  };
  alerts: {
    open: number;
    critical: number;
    warning: number;
    info: number;
  };
  slaCompliance: {
    currentUptimePercent: number;
    slaTarget: number;
    isBreached: boolean;
    avgLatencyMs: number;
    latencyTarget: number;
  };
}

// -------------------------------------------------------
// LOAD TEST / STRESS TEST
// -------------------------------------------------------
export class LoadTestConfigDto {
  @ApiProperty({ description: 'Concurrent virtual users' })
  @IsInt() @Min(1) @Max(10000) concurrentUsers: number;

  @ApiProperty({ description: 'Duration in seconds' })
  @IsInt() @Min(30) @Max(3600) durationSeconds: number;

  @ApiPropertyOptional({ description: 'Ramp-up seconds' })
  @IsOptional() @IsInt() @Min(0) rampUpSeconds?: number;

  @ApiProperty({ description: 'Target URL or endpoint pattern' })
  @IsString() @IsNotEmpty() targetEndpoint: string;

  @ApiPropertyOptional() @IsOptional() @IsString() tenantId?: string;
}

// -------------------------------------------------------
// GLOBAL SEARCH / FILTERS
// -------------------------------------------------------
export class PaginationDto {
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) @Max(200) limit?: number = 20;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) offset?: number = 0;
  @ApiPropertyOptional() @IsOptional() @IsString() search?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() sortBy?: string;
  @ApiPropertyOptional({ enum: ['asc', 'desc'] }) @IsOptional() @IsString() sortOrder?: 'asc' | 'desc';
}