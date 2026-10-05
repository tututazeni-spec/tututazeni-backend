// src/audit/audit-internal.dto.ts
// DTOs da aba «Auditorias e Inspeções» (docs/modulo_audit.md §9).
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { InternalAuditStatus, InternalAuditType, RiskLevel } from '@prisma/client';
import { BaseFilterDto } from '../common/dtos/pagination.dto';
import { IsAllowedFileUrl } from '../common/validators/is-allowed-file-url.validator';

export const CHECK_STATUSES = ['PENDING', 'PASSED', 'FAILED', 'NOT_APPLICABLE'] as const;
export const ACTION_STATUSES = ['OPEN', 'IN_PROGRESS', 'DONE'] as const;
export const AUDIT_RESULTS = ['CONFORME', 'CONFORME_COM_RESERVAS', 'NAO_CONFORME'] as const;

export class InternalAuditFilterDto extends BaseFilterDto {
  @ApiPropertyOptional({ enum: InternalAuditStatus })
  @IsOptional()
  @IsEnum(InternalAuditStatus)
  status?: InternalAuditStatus;

  @ApiPropertyOptional({ enum: InternalAuditType })
  @IsOptional()
  @IsEnum(InternalAuditType)
  type?: InternalAuditType;

  @ApiPropertyOptional({ description: 'Código ou título' })
  @IsOptional()
  @IsString()
  search?: string;
}

export class CreateInternalAuditDto {
  @IsString()
  @MaxLength(200)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  objective?: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  scope?: string;

  @IsEnum(InternalAuditType)
  type!: InternalAuditType;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  modules?: string[];

  @IsOptional()
  @IsDateString()
  periodFrom?: string;

  @IsOptional()
  @IsDateString()
  periodTo?: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  criteria?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  leadAuditorId?: number;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsInt({ each: true })
  teamIds?: number[];

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  dueDate?: string;
}

export class UpdateInternalAuditDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  objective?: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  scope?: string;

  @IsOptional()
  @IsEnum(InternalAuditType)
  type?: InternalAuditType;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  modules?: string[];

  @IsOptional()
  @IsDateString()
  periodFrom?: string;

  @IsOptional()
  @IsDateString()
  periodTo?: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  criteria?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  leadAuditorId?: number;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsInt({ each: true })
  teamIds?: number[];

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  dueDate?: string;
}

export class AuditStatusDto {
  @IsEnum(InternalAuditStatus)
  status!: InternalAuditStatus;

  /** Obrigatória ao cancelar. */
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  reason?: string;
}

export class ApproveAuditReportDto {
  @IsIn(AUDIT_RESULTS)
  result!: (typeof AUDIT_RESULTS)[number];

  @IsString()
  @MaxLength(20000)
  closingReport!: string;
}

export class AuditCheckDto {
  @IsString()
  @MaxLength(300)
  title!: string;
}

export class UpdateAuditCheckDto {
  @IsIn(CHECK_STATUSES)
  status!: (typeof CHECK_STATUSES)[number];

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}

export class AuditEvidenceDto {
  @IsString()
  @MaxLength(300)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  @IsAllowedFileUrl()
  url?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  auditLogId?: number;
}

export class AuditFindingDto {
  @IsString()
  @MaxLength(300)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string;

  @IsBoolean()
  nonConformity!: boolean;

  @IsEnum(RiskLevel)
  risk!: RiskLevel;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  recommendation?: string;
}

export class AuditActionDto {
  @IsString()
  @MaxLength(2000)
  description!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  findingId?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  responsibleId?: number;

  @IsOptional()
  @IsDateString()
  dueDate?: string;
}

export class UpdateAuditActionDto {
  @IsIn(ACTION_STATUSES)
  status!: (typeof ACTION_STATUSES)[number];
}
