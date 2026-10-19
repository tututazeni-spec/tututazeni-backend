import { ApiPropertyOptional } from '@nestjs/swagger';
import { CertificateActivityKind, CertificateIssueMode } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export const EFFECTIVE_STATUSES = ['ACTIVE', 'EXPIRED', 'REVOKED', 'PENDING_APPROVAL'] as const;
export type EffectiveStatusFilter = (typeof EFFECTIVE_STATUSES)[number];

export class ListCertificatesQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;

  @ApiPropertyOptional({ enum: EFFECTIVE_STATUSES })
  @IsOptional()
  @IsIn(EFFECTIVE_STATUSES)
  status?: EffectiveStatusFilter;

  @ApiPropertyOptional({ enum: CertificateActivityKind })
  @IsOptional()
  @IsEnum(CertificateActivityKind)
  activityKind?: CertificateActivityKind;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  departmentId?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  courseId?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  issuedFrom?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  issuedTo?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  expiresFrom?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  expiresTo?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(64)
  code?: string;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @ApiPropertyOptional({ enum: ['issuedAt', 'expiresAt', 'holderName'] })
  @IsOptional()
  @IsIn(['issuedAt', 'expiresAt', 'holderName'])
  sort?: 'issuedAt' | 'expiresAt' | 'holderName';

  @ApiPropertyOptional({ enum: ['asc', 'desc'] })
  @IsOptional()
  @IsIn(['asc', 'desc'])
  order?: 'asc' | 'desc';
}

export class HistoryQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  certificateId?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsIn(['CERTIFICATE_ISSUED', 'CERTIFICATE_APPROVED', 'CERTIFICATE_RULE_UPSERTED'])
  action?: string;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}

export class CertificateCriteriaDto {
  @IsOptional()
  @IsBoolean()
  requireFullCompletion?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  minScore?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  minAttendancePct?: number;

  @IsOptional()
  @IsBoolean()
  requireInstructorApproval?: boolean;

  @IsOptional()
  @IsBoolean()
  requireManagerApproval?: boolean;

  @IsOptional()
  @IsBoolean()
  requirePracticalPass?: boolean;
}

export class UpsertCertificateRuleDto {
  @ApiPropertyOptional({ enum: CertificateActivityKind })
  @IsEnum(CertificateActivityKind)
  activityKind!: CertificateActivityKind;

  @IsInt()
  @Min(1)
  activityId!: number;

  @IsEnum(CertificateIssueMode)
  mode!: CertificateIssueMode;

  @ValidateNested()
  @Type(() => CertificateCriteriaDto)
  criteria!: CertificateCriteriaDto;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(3650)
  validityDays?: number;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export const EXPORT_FORMATS = ['csv', 'xlsx', 'pdf'] as const;
export type ExportFormat = (typeof EXPORT_FORMATS)[number];

/** Mesmos filtros da lista; a paginação é ignorada (exporta tudo até ao máximo). */
export class ExportCertificatesQueryDto extends ListCertificatesQueryDto {
  @ApiPropertyOptional({ enum: EXPORT_FORMATS, default: 'csv' })
  @IsOptional()
  @IsIn(EXPORT_FORMATS)
  format?: ExportFormat;
}
