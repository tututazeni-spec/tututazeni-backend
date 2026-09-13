// src/api-integration/api-integration.dto.ts
import {
  IsString,
  IsOptional,
  IsEnum,
  IsBoolean,
  IsArray,
  IsInt,
  IsDateString,
  IsObject,
  MaxLength,
  Min,
  IsNotEmpty,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import {
  IntegrationType,
  IntegrationStatus,
  AuthType,
  ApiCallStatus,
  IntegrationCategory,
  IntegrationEnvironment,
  IntegrationDataFormat,
  IntegrationCommunicationMethod,
  IntegrationSyncDirection,
  SyncFrequency,
} from '@prisma/client';
import { BaseFilterDto } from '../common/dtos/pagination.dto';

// ─── Enums ────────────────────────────────────────────────────────
// CORRIGIDO: IntegrationType/IntegrationStatus eram enums locais com valores
// completamente diferentes dos enums Prisma reais de IntegrationConfig.type/
// .status (ex.: 'HRIS'/'LMS'/'BI'/'SSO'/'MESSAGING'/'HEALTH'/'CUSTOM'/'WEBHOOK'
// vs. ERP_HR/MICROSOFT_TEAMS/SLACK/SSO_GOOGLE/SSO_MICROSOFT/SCORM_PROVIDER/
// XAPI_LRS/BI_TOOL/CUSTOM_WEBHOOK). createIntegration() grava dto.type
// directamente em integrationConfig.create() — qualquer um destes valores
// só-do-DTO (ex. 'HRIS') passava a validação do DTO mas rebentava com 500 no
// Prisma. Corrigido importando os enums reais.

export {
  IntegrationType,
  IntegrationStatus,
  AuthType,
  ApiCallStatus,
  IntegrationCategory,
  IntegrationEnvironment,
  IntegrationDataFormat,
  IntegrationCommunicationMethod,
  IntegrationSyncDirection,
  SyncFrequency,
};

export enum ApiKeyScope {
  READ = 'read',
  WRITE = 'write',
  ADMIN = 'admin',
}

export enum WebhookEventType {
  EMPLOYEE_CREATED = 'employee.created',
  EMPLOYEE_UPDATED = 'employee.updated',
  EMPLOYEE_DEACTIVATED = 'employee.deactivated',
  COURSE_COMPLETED = 'course.completed',
  COURSE_ENROLLED = 'course.enrolled',
  PDI_APPROVED = 'pdi.approved',
  PDI_COMPLETED = 'pdi.completed',
  EVALUATION_COMPLETED = 'evaluation.completed',
  REPORT_GENERATED = 'report.generated',
  BADGE_AWARDED = 'badge.awarded',
  DOCUMENT_SIGNED = 'document.signed',
}

// ─── Integration DTOs ─────────────────────────────────────────────

export class CreateIntegrationDto {
  @ApiProperty() @IsString() @MaxLength(100) name!: string;
  @ApiProperty({ enum: IntegrationType }) @IsEnum(IntegrationType) type!: IntegrationType;
  @ApiPropertyOptional({ enum: IntegrationCategory })
  @IsOptional()
  @IsEnum(IntegrationCategory)
  category?: IntegrationCategory;
  @ApiPropertyOptional({
    description: 'Sistema/Plataforma — texto livre (SAP, Workday, Moodle...)',
  })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  platform?: string;
  @ApiProperty() @IsString() endpoint!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() baseUrl?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() apiKey?: string;
  @ApiPropertyOptional({ enum: AuthType }) @IsOptional() @IsEnum(AuthType) authType?: AuthType;
  // Combinados pelo service em credentialsJson (encriptado) — nunca
  // persistidos em texto plano. Ver IntegrationConfig.credentialsJson.
  @ApiPropertyOptional() @IsOptional() @IsString() clientId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() clientSecret?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() accessToken?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() authUrl?: string;
  @ApiPropertyOptional({ enum: IntegrationEnvironment })
  @IsOptional()
  @IsEnum(IntegrationEnvironment)
  environment?: IntegrationEnvironment;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(30) apiVersion?: string;
  @ApiPropertyOptional({ enum: IntegrationDataFormat })
  @IsOptional()
  @IsEnum(IntegrationDataFormat)
  dataFormat?: IntegrationDataFormat;
  @ApiPropertyOptional({ enum: IntegrationCommunicationMethod })
  @IsOptional()
  @IsEnum(IntegrationCommunicationMethod)
  communicationMethod?: IntegrationCommunicationMethod;
  @ApiPropertyOptional({ enum: SyncFrequency })
  @IsOptional()
  @IsEnum(SyncFrequency)
  syncFrequency?: SyncFrequency;
  @ApiPropertyOptional({ enum: IntegrationSyncDirection })
  @IsOptional()
  @IsEnum(IntegrationSyncDirection)
  syncDirection?: IntegrationSyncDirection;
  @ApiPropertyOptional({
    type: [String],
    description: 'Dados a sincronizar (ex.: users, courses, enrollments)',
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  dataToSync?: string[];
  @ApiPropertyOptional({ description: 'Mapeamento de campos origem→destino' })
  @IsOptional()
  fieldMapping?: Record<string, string>;
  @ApiPropertyOptional() @IsOptional() @IsString() webhookUrl?: string;
  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  webhookEvents?: string[];
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) timeoutMs?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) maxRetries?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) retryIntervalMs?: number;
  @ApiPropertyOptional({ enum: IntegrationStatus })
  @IsOptional()
  @IsEnum(IntegrationStatus)
  status?: IntegrationStatus;
  @ApiPropertyOptional() @IsOptional() @IsDateString() activatedAt?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() responsibleUserId?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() active?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string;
  @ApiPropertyOptional() @IsOptional() config?: Record<string, unknown>;
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() allowedIps?: string[];
}

export class UpdateIntegrationDto extends PartialType(CreateIntegrationDto) {}

export class TestIntegrationConnectionDto {
  @ApiProperty() @IsString() @IsNotEmpty() baseUrl: string;
  @ApiPropertyOptional({ enum: AuthType }) @IsOptional() @IsEnum(AuthType) authType?: AuthType;
  @ApiPropertyOptional() @IsOptional() @IsString() apiKey?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() accessToken?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() clientId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() clientSecret?: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) timeoutMs?: number;
}

export class IntegrationLogFilterDto extends BaseFilterDto {
  @ApiPropertyOptional() @IsOptional() @IsString() from?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() to?: string;
  @ApiPropertyOptional({ enum: ApiCallStatus })
  @IsOptional()
  @IsEnum(ApiCallStatus)
  status?: ApiCallStatus;
}

// ─── API Key DTOs ─────────────────────────────────────────────────

export class CreateApiKeyDto {
  @ApiProperty() @IsString() @MaxLength(100) name!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
  @ApiProperty({ enum: ApiKeyScope, isArray: true })
  @IsArray()
  @IsEnum(ApiKeyScope, { each: true })
  scopes!: ApiKeyScope[];
  @ApiPropertyOptional() @IsOptional() @IsDateString() expiresAt?: string;
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() allowedIps?: string[];
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) rateLimit?: number; // requests/min
}

// ─── Webhook DTOs ─────────────────────────────────────────────────

export class CreateWebhookDto {
  @ApiProperty() @IsString() @MaxLength(100) name!: string;
  @ApiProperty() @IsString() url!: string;
  @ApiProperty({ enum: WebhookEventType, isArray: true })
  @IsArray()
  @IsEnum(WebhookEventType, { each: true })
  events!: WebhookEventType[];
  @ApiPropertyOptional() @IsOptional() @IsString() secret?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() active?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) retryMax?: number;
}

export class TriggerWebhookDto {
  @ApiProperty({ enum: WebhookEventType }) @IsEnum(WebhookEventType) event!: WebhookEventType;
  @ApiProperty() @IsObject() payload!: Record<string, unknown>;
}

// ─── ValidateApiKeyBodyDto ────────────────────────────────────────────────────

export class ValidateApiKeyBodyDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(512)
  key!: string;
}
