// ─── src/document-repository/document-repository.dto.ts ──────────────────────
import {
  IsString,
  IsOptional,
  IsInt,
  IsEnum,
  IsArray,
  IsBoolean,
  IsDateString,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional, PartialType, ApiSchema } from '@nestjs/swagger';
import { Type } from 'class-transformer';

// ─── Enums ────────────────────────────────────────────────────────────────────

export enum DocCategory {
  PERSONAL = 'PERSONAL', // Documentos pessoais
  LABOUR = 'LABOUR', // Trabalhistas / contratos
  LEARNING = 'LEARNING', // Certificados, materiais LMS
  CORPORATE = 'CORPORATE', // Políticas, manuais, regulamentos
  RECRUITMENT = 'RECRUITMENT', // Candidaturas (LGPD: 1 ano)
  COMPLIANCE = 'COMPLIANCE', // Legais, fiscais
  HEALTH = 'HEALTH', // Saúde (até 20 anos)
  PAYROLL = 'PAYROLL', // Holerites, comprovantes
  LEAVE = 'LEAVE', // Atestados, licenças
  OTHER = 'OTHER',
}

export enum DocSensitivity {
  PUBLIC = 'PUBLIC', // Visível a todos internamente
  INTERNAL = 'INTERNAL', // Uso interno geral
  CONFIDENTIAL = 'CONFIDENTIAL', // Apenas RH / gestor directo
  RESTRICTED = 'RESTRICTED', // Owner + admin
  SECRET = 'SECRET', // Admin only
}

export enum DocStatus {
  DRAFT = 'DRAFT',
  ACTIVE = 'ACTIVE',
  EXPIRED = 'EXPIRED',
  ARCHIVED = 'ARCHIVED',
  DELETED = 'DELETED', // soft delete, mantido para retenção
}

export enum DocPermission {
  VIEW = 'VIEW',
  COMMENT = 'COMMENT',
  EDIT = 'EDIT',
  SHARE = 'SHARE',
  DELETE = 'DELETE',
}

export enum DocAuditAction {
  UPLOADED = 'UPLOADED',
  VIEWED = 'VIEWED',
  DOWNLOADED = 'DOWNLOADED',
  UPDATED = 'UPDATED',
  VERSIONED = 'VERSIONED',
  SHARED = 'SHARED',
  ARCHIVED = 'ARCHIVED',
  DELETED = 'DELETED',
  ACCESS_DENIED = 'ACCESS_DENIED',
}

export enum ShareLinkAccess {
  VIEW_ONLY = 'VIEW_ONLY',
  VIEW_DOWNLOAD = 'VIEW_DOWNLOAD',
}

// ─── Categories (configuráveis) ───────────────────────────────────────────────

export class CreateDocCategoryDto {
  @ApiProperty() @IsString() name!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
  @ApiProperty() @IsEnum(DocCategory) type!: DocCategory;
  @ApiPropertyOptional() @IsOptional() @IsInt() retentionYears?: number; // anos de retenção legal
  @ApiPropertyOptional() @IsOptional() @IsEnum(DocSensitivity) defaultSensitivity?: DocSensitivity;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() requiresApproval?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() active?: boolean;
}

// ─── Documents ────────────────────────────────────────────────────────────────

@ApiSchema({ name: 'CreateRepositoryDocumentDto' })
export class CreateDocumentDto {
  @ApiProperty() @IsString() title!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
  @ApiProperty() @IsEnum(DocCategory) category!: DocCategory;
  @ApiPropertyOptional() @IsOptional() @IsInt() categoryId?: number;
  @ApiProperty() @IsEnum(DocSensitivity) sensitivity!: DocSensitivity;
  @ApiProperty() @IsString() fileUrl!: string; // URL no storage (S3/Azure)
  @ApiProperty() @IsString() mimeType!: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() fileSize?: number; // bytes
  @ApiPropertyOptional() @IsOptional() @IsString() fileName?: string;
  @ApiPropertyOptional() @IsOptional() @IsArray() @IsString({ each: true }) tags?: string[];
  @ApiPropertyOptional() @IsOptional() @IsInt() ownerId?: number; // colaborador vinculado
  @ApiPropertyOptional() @IsOptional() @IsString() department?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() expiresAt?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() origin?: string; // UPLOAD | SYSTEM | INTEGRATION
  @ApiPropertyOptional() @IsOptional() @IsBoolean() requestSignature?: boolean;
}

export class UpdateDocumentDto extends PartialType(CreateDocumentDto) {}

export class NewVersionDto {
  @ApiProperty() @IsString() fileUrl!: string;
  @ApiProperty() @IsString() mimeType!: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() fileSize?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() fileName?: string;
  @ApiProperty() @IsString() changeDescription!: string;
}

// ─── Permissions ──────────────────────────────────────────────────────────────

export class GrantPermissionDto {
  @ApiProperty() @IsInt() documentId!: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() userId?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() department?: string;
  @ApiProperty({ type: [String] })
  @IsArray()
  @IsEnum(DocPermission, { each: true })
  permissions!: DocPermission[];
  @ApiPropertyOptional() @IsOptional() @IsDateString() expiresAt?: string;
}

// ─── Share Links ──────────────────────────────────────────────────────────────

export class CreateShareLinkDto {
  @ApiProperty() @IsInt() documentId!: number;
  @ApiProperty() @IsEnum(ShareLinkAccess) access!: ShareLinkAccess;
  @ApiPropertyOptional() @IsOptional() @IsDateString() expiresAt?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() password?: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() maxDownloads?: number;
}

// ─── Filters ──────────────────────────────────────────────────────────────────

export class DocumentFilterDto {
  @ApiPropertyOptional() @IsOptional() @IsString() search?: string;
  @ApiPropertyOptional() @IsOptional() @IsEnum(DocCategory) category?: DocCategory;
  @ApiPropertyOptional() @IsOptional() @IsEnum(DocSensitivity) sensitivity?: DocSensitivity;
  @ApiPropertyOptional() @IsOptional() @IsEnum(DocStatus) status?: DocStatus;
  @ApiPropertyOptional() @IsOptional() @IsString() department?: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Type(() => Number) ownerId?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() tag?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() from?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() to?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() @Type(() => Boolean) expiringSoon?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() @Type(() => Boolean) expired?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Type(() => Number) page?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Type(() => Number) limit?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() sortBy?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() sortOrder?: 'asc' | 'desc';
}
