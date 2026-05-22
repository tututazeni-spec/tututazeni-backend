// ============================================================
// src/modules/work-declaration/dto/index.ts
// DTOs — Work Declaration Module (INNOVA)
// ============================================================

import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  Min,
} from 'class-validator';

// ─── Enums espelhados do Prisma ──────────────────────────────
export enum DeclarationStatus {
  DRAFT = 'DRAFT',
  PENDING = 'PENDING',
  SIGNED = 'SIGNED',
  ISSUED = 'ISSUED',
  EXPIRED = 'EXPIRED',
  REVOKED = 'REVOKED',
  GENERATED = 'GENERATED',
}

export enum DeclarationType {
  EMPLOYMENT = 'EMPLOYMENT',
  TRAINING = 'TRAINING',
  ATTENDANCE = 'ATTENDANCE',
  PERFORMANCE = 'PERFORMANCE',
  BANKING = 'BANKING',
  LEGAL = 'LEGAL',
  ACADEMIC = 'ACADEMIC',
  CUSTOM = 'CUSTOM',
}

export enum DeclarationLocale {
  PT = 'PT',
  EN = 'EN',
  FR = 'FR',
}

export enum DocumentLayout {
  FORMAL = 'FORMAL',
  INSTITUTIONAL = 'INSTITUTIONAL',
  SIMPLE = 'SIMPLE',
}

export enum SignatureType {
  IMAGE_UPLOAD = 'IMAGE_UPLOAD',
  DIGITAL_CERTIFIED = 'DIGITAL_CERTIFIED',
}

// ────────────────────────────────────────────────────────────
// TEMPLATES
// ────────────────────────────────────────────────────────────

export class CreateDeclarationTemplateDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsEnum(DeclarationType)
  type: DeclarationType;

  @IsOptional()
  @IsEnum(DeclarationLocale)
  locale?: DeclarationLocale;

  @IsOptional()
  @IsEnum(DocumentLayout)
  layout?: DocumentLayout;

  @IsString()
  @IsNotEmpty()
  bodyContent: string; // HTML com variáveis {{var}}

  @IsOptional()
  @IsInt()
  @Min(1)
  validityDays?: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  requiredFields?: string[];

  @IsOptional()
  @IsObject()
  customVariables?: Record<string, string>;

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}

export class UpdateDeclarationTemplateDto {
  @IsOptional()
  @IsString()
  @MaxLength(150)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsOptional()
  @IsEnum(DocumentLayout)
  layout?: DocumentLayout;

  @IsOptional()
  @IsString()
  bodyContent?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  validityDays?: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  requiredFields?: string[];

  @IsOptional()
  @IsObject()
  customVariables?: Record<string, string>;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}

export class TemplatePreviewDto {
  @IsString()
  @IsNotEmpty()
  templateId: string;

  @IsOptional()
  @IsString()
  employeeId?: string; // usa dados reais para preview

  @IsOptional()
  @IsObject()
  overrideData?: Record<string, string>; // dados manuais para preview
}

// ────────────────────────────────────────────────────────────
// DECLARAÇÕES
// ────────────────────────────────────────────────────────────

export class RequestDeclarationDto {
  @IsString()
  @IsNotEmpty()
  templateId: string;

  @IsEnum(DeclarationType)
  type: DeclarationType;

  @IsOptional()
  @IsEnum(DeclarationLocale)
  locale?: DeclarationLocale;

  @IsOptional()
  @IsEnum(DocumentLayout)
  layout?: DocumentLayout;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  purpose?: string;

  @IsOptional()
  @IsBoolean()
  showSalary?: boolean;

  @IsOptional()
  @IsBoolean()
  watermark?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  requestNotes?: string;
}

export class DeclarationFilterDto {
  @ApiPropertyOptional() @IsOptional() @IsInt() @Type(() => Number) userId?: number;
  @ApiPropertyOptional() @IsOptional() @IsEnum(DeclarationType) type?: DeclarationType;
  @ApiPropertyOptional() @IsOptional() @IsEnum(DeclarationStatus) status?: DeclarationStatus;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Type(() => Number) page?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Type(() => Number) limit?: number;
}

export { DeclarationFilterDto as FilterDeclarationsDto };

export class CreateDeclarationDto {
  @IsString()
  @IsNotEmpty()
  templateId: string;

  @IsString()
  @IsNotEmpty()
  employeeId: string;

  @IsEnum(DeclarationType)
  type: DeclarationType;

  @IsOptional()
  @IsEnum(DeclarationLocale)
  locale?: DeclarationLocale;

  @IsOptional()
  @IsEnum(DocumentLayout)
  layout?: DocumentLayout;

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  purpose?: string;

  @IsOptional()
  @IsBoolean()
  showSalary?: boolean;

  @IsOptional()
  @IsBoolean()
  watermark?: boolean;

  @IsOptional()
  @IsObject()
  customFields?: Record<string, string>; // campos extra definidos no template

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  internalNotes?: string;
}

export class UpdateDeclarationDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  purpose?: string;

  @IsOptional()
  @IsBoolean()
  showSalary?: boolean;

  @IsOptional()
  @IsBoolean()
  watermark?: boolean;

  @IsOptional()
  @IsObject()
  customFields?: Record<string, string>;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  internalNotes?: string;

  @IsOptional()
  @IsString()
  assignedToId?: string;
}

export class ChangeDeclarationStatusDto {
  @IsEnum(DeclarationStatus)
  status: DeclarationStatus;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string; // obrigatório para REVOKED / REJECTED
}

export class SignDeclarationDto {
  @IsEnum(SignatureType)
  type: SignatureType;

  @IsOptional()
  @IsUrl()
  signatureUrl?: string; // obrigatório para IMAGE_UPLOAD

  @IsOptional()
  @IsObject()
  certificateData?: Record<string, unknown>; // para DIGITAL_CERTIFIED

  @IsString()
  @IsNotEmpty()
  signerRole: string; // "RH" | "MANAGER" | "DIRECTOR"
}

export class ExportDeclarationDto {
  @IsEnum(['PDF', 'DOCX'])
  format: 'PDF' | 'DOCX';

  @IsOptional()
  @IsBoolean()
  includeWatermark?: boolean;
}

export class SendDeclarationDto {
  @IsArray()
  @IsString({ each: true })
  recipientEmails: string[];

  @IsOptional()
  @IsString()
  @MaxLength(500)
  message?: string;

  @IsOptional()
  @IsBoolean()
  generateSecureLink?: boolean;
}

// ────────────────────────────────────────────────────────────
// QUERY / FILTROS
// ────────────────────────────────────────────────────────────

export class DeclarationQueryDto {
  @IsOptional()
  @IsEnum(DeclarationStatus)
  status?: DeclarationStatus;

  @IsOptional()
  @IsEnum(DeclarationType)
  type?: DeclarationType;

  @IsOptional()
  @IsString()
  employeeId?: string;

  @IsOptional()
  @IsString()
  assignedToId?: string;

  @IsOptional()
  @IsDateString()
  fromDate?: string;

  @IsOptional()
  @IsDateString()
  toDate?: string;

  @IsOptional()
  @IsString()
  search?: string; // busca por código, nome do colaborador

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number = 20;

  @IsOptional()
  @IsString()
  sortBy?: string = 'createdAt';

  @IsOptional()
  @IsEnum(['asc', 'desc'])
  sortOrder?: 'asc' | 'desc' = 'desc';
}

export class TemplateQueryDto {
  @IsOptional()
  @IsEnum(DeclarationType)
  type?: DeclarationType;

  @IsOptional()
  @IsEnum(DeclarationLocale)
  locale?: DeclarationLocale;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsString()
  search?: string;
}

// ────────────────────────────────────────────────────────────
// CONFIGURAÇÃO DO TENANT
// ────────────────────────────────────────────────────────────

export class UpsertTenantConfigDto {
  @IsOptional()
  @IsUrl()
  logoUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  companyName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  companyAddress?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  companyPhone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  companyEmail?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  companyNif?: string;

  @IsOptional()
  @IsString()
  headerHtml?: string;

  @IsOptional()
  @IsString()
  footerHtml?: string;

  @IsOptional()
  @IsEnum(DocumentLayout)
  defaultLayout?: DocumentLayout;

  @IsOptional()
  @IsEnum(DeclarationLocale)
  defaultLocale?: DeclarationLocale;

  @IsOptional()
  @IsInt()
  @Min(1)
  defaultValidity?: number;

  @IsOptional()
  @IsBoolean()
  allowSalaryExposure?: boolean;

  @IsOptional()
  @IsBoolean()
  requireManagerSignature?: boolean;

  @IsOptional()
  @IsBoolean()
  emailNotifications?: boolean;
}

// ────────────────────────────────────────────────────────────
// VERIFICAÇÃO PÚBLICA
// ────────────────────────────────────────────────────────────

export class VerifyDeclarationDto {
  @IsString()
  @IsNotEmpty()
  code: string; // código único da declaração
}
