// ─── src/document-repository/document-repository.dto.ts ──────────────────────
import {
  Max,
  Min,
  IsIn,
  IsString,
  IsOptional,
  IsInt,
  IsEnum,
  IsArray,
  IsBoolean,
  IsDateString,
  IsNotEmpty,
  MaxLength,
  Matches,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional, PartialType, ApiSchema } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  DocCategoryType,
  DocSensitivity,
  DocStatus,
  DocPermissionType,
  DocOrigin,
  ShareLinkAccess,
} from '@prisma/client';
import { IsAllowedFileUrl } from '../common/validators/is-allowed-file-url.validator';
import {
  ALLOWED_MIME_TYPES,
  MAX_FILE_SIZE_BYTES,
  MAX_FILE_NAME_LENGTH,
} from '../common/validators/allowed-mime-types';

const NO_PATH_SEPARATORS = /^[^/\\]+$/;
const NO_PATH_SEPARATORS_MESSAGE = 'fileName não pode conter separadores de caminho (/ ou \\)';

// ─── Categories (configuráveis) ───────────────────────────────────────────────

export class CreateDocCategoryDto {
  @ApiProperty() @IsString() name!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
  @ApiProperty() @IsEnum(DocCategoryType) type!: DocCategoryType;
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
  @ApiProperty() @IsEnum(DocCategoryType) category!: DocCategoryType;
  @ApiPropertyOptional() @IsOptional() @IsInt() categoryId?: number;
  @ApiProperty() @IsEnum(DocSensitivity) sensitivity!: DocSensitivity;
  @ApiProperty() @IsAllowedFileUrl() fileUrl!: string; // URL no storage (S3/Azure)
  @ApiProperty({ enum: ALLOWED_MIME_TYPES }) @IsIn(ALLOWED_MIME_TYPES) mimeType!: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) @Max(MAX_FILE_SIZE_BYTES) fileSize?: number; // bytes
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(MAX_FILE_NAME_LENGTH)
  @Matches(NO_PATH_SEPARATORS, { message: NO_PATH_SEPARATORS_MESSAGE })
  fileName?: string;
  @ApiPropertyOptional() @IsOptional() @IsArray() @IsString({ each: true }) tags?: string[];
  @ApiPropertyOptional() @IsOptional() @IsInt() ownerId?: number; // colaborador vinculado
  @ApiPropertyOptional() @IsOptional() @IsString() department?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() expiresAt?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string;
  @ApiPropertyOptional() @IsOptional() @IsEnum(DocOrigin) origin?: DocOrigin;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() requestSignature?: boolean;
}

export class UpdateDocumentDto extends PartialType(CreateDocumentDto) {}

export class NewVersionDto {
  @ApiProperty() @IsAllowedFileUrl() fileUrl!: string;
  @ApiProperty({ enum: ALLOWED_MIME_TYPES }) @IsIn(ALLOWED_MIME_TYPES) mimeType!: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) @Max(MAX_FILE_SIZE_BYTES) fileSize?: number;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(MAX_FILE_NAME_LENGTH)
  @Matches(NO_PATH_SEPARATORS, { message: NO_PATH_SEPARATORS_MESSAGE })
  fileName?: string;
  @ApiProperty() @IsString() changeDescription!: string;
}

// ─── Permissions ──────────────────────────────────────────────────────────────

export class GrantPermissionDto {
  @ApiProperty() @IsInt() documentId!: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() userId?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() department?: string;
  @ApiProperty({ type: [String] })
  @IsArray()
  @IsEnum(DocPermissionType, { each: true })
  permissions!: DocPermissionType[];
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
  @ApiPropertyOptional() @IsOptional() @IsEnum(DocCategoryType) category?: DocCategoryType;
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
  @ApiPropertyOptional() @IsOptional() @IsInt() @Max(100) @Type(() => Number) limit?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() sortBy?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() sortOrder?: 'asc' | 'desc';
}

// ─── OptionalReasonDto ────────────────────────────────────────────────────────

export class OptionalReasonDto {
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reason?: string;
}

// ─── UpdateExpiresAtDto ───────────────────────────────────────────────────────

export class UpdateExpiresAtDto {
  @IsDateString()
  newExpiresAt!: string;
}

// ─── ReasonDto ────────────────────────────────────────────────────────────────

export class ReasonDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  reason!: string;
}
