// src/api-integration/api-integration.dto.ts
import {
  IsString, IsOptional, IsEnum, IsBoolean, IsArray,
  IsInt, IsUrl, IsDateString, MaxLength, Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

// ─── Enums ────────────────────────────────────────────────────────

export enum IntegrationType {
  HRIS       = 'HRIS',
  ERP        = 'ERP',
  ATS        = 'ATS',
  LMS        = 'LMS',
  PAYROLL    = 'PAYROLL',
  BI         = 'BI',
  SSO        = 'SSO',
  MESSAGING  = 'MESSAGING',
  HEALTH     = 'HEALTH',
  CUSTOM     = 'CUSTOM',
  WEBHOOK    = 'WEBHOOK',
}

export enum ApiKeyScope {
  READ  = 'read',
  WRITE = 'write',
  ADMIN = 'admin',
}

export enum WebhookEventType {
  EMPLOYEE_CREATED    = 'employee.created',
  EMPLOYEE_UPDATED    = 'employee.updated',
  EMPLOYEE_DEACTIVATED= 'employee.deactivated',
  COURSE_COMPLETED    = 'course.completed',
  COURSE_ENROLLED     = 'course.enrolled',
  PDI_APPROVED        = 'pdi.approved',
  PDI_COMPLETED       = 'pdi.completed',
  EVALUATION_COMPLETED= 'evaluation.completed',
  REPORT_GENERATED    = 'report.generated',
  BADGE_AWARDED       = 'badge.awarded',
  DOCUMENT_SIGNED     = 'document.signed',
}

export enum IntegrationStatus {
  ACTIVE   = 'ACTIVE',
  INACTIVE = 'INACTIVE',
  ERROR    = 'ERROR',
  PENDING  = 'PENDING',
}

// ─── Integration DTOs ─────────────────────────────────────────────

export class CreateIntegrationDto {
  @ApiProperty()          @IsString() @MaxLength(100) name!: string;
  @ApiProperty({ enum: IntegrationType }) @IsEnum(IntegrationType) type!: IntegrationType;
  @ApiProperty()          @IsString() endpoint!: string;
  @ApiPropertyOptional()  @IsOptional() @IsString() description?: string;
  @ApiPropertyOptional()  @IsOptional() @IsString() baseUrl?: string;
  @ApiPropertyOptional()  @IsOptional() @IsString() apiKey?: string;
  @ApiPropertyOptional()  @IsOptional() @IsString() authType?: string;
  @ApiPropertyOptional()  @IsOptional() @IsBoolean() active?: boolean;
  @ApiPropertyOptional()  @IsOptional() config?: Record<string, any>;
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() allowedIps?: string[];
}

export class UpdateIntegrationDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(100) name?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() endpoint?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() baseUrl?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() apiKey?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() active?: boolean;
  @ApiPropertyOptional() @IsOptional() config?: Record<string, any>;
}

export class IntegrationLogFilterDto {
  @ApiPropertyOptional() @IsOptional() @IsString() from?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() to?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() status?: string;
  @ApiPropertyOptional({ default: 1 })  @IsOptional() @IsInt() @Min(1) @Type(() => Number) page?: number;
  @ApiPropertyOptional({ default: 50 }) @IsOptional() @IsInt() @Min(1) @Type(() => Number) limit?: number;
}

// ─── API Key DTOs ─────────────────────────────────────────────────

export class CreateApiKeyDto {
  @ApiProperty()          @IsString() @MaxLength(100) name!: string;
  @ApiPropertyOptional()  @IsOptional() @IsString() description?: string;
  @ApiProperty({ enum: ApiKeyScope, isArray: true }) @IsArray() @IsEnum(ApiKeyScope, { each: true }) scopes!: ApiKeyScope[];
  @ApiPropertyOptional()  @IsOptional() @IsDateString() expiresAt?: string;
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() allowedIps?: string[];
  @ApiPropertyOptional()  @IsOptional() @IsInt() @Min(1) rateLimit?: number; // requests/min
}

// ─── Webhook DTOs ─────────────────────────────────────────────────

export class CreateWebhookDto {
  @ApiProperty()          @IsString() @MaxLength(100) name!: string;
  @ApiProperty()          @IsString() url!: string;
  @ApiProperty({ enum: WebhookEventType, isArray: true }) @IsArray() @IsEnum(WebhookEventType, { each: true }) events!: WebhookEventType[];
  @ApiPropertyOptional()  @IsOptional() @IsString() secret?: string;
  @ApiPropertyOptional()  @IsOptional() @IsBoolean() active?: boolean;
  @ApiPropertyOptional()  @IsOptional() @IsInt() @Min(0) retryMax?: number;
}

export class TriggerWebhookDto {
  @ApiProperty({ enum: WebhookEventType }) @IsEnum(WebhookEventType) event!: WebhookEventType;
  @ApiProperty() payload!: Record<string, any>;
}

