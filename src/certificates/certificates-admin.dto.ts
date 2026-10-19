import { ApiPropertyOptional } from '@nestjs/swagger';
import { CertificateActivityKind } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
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
