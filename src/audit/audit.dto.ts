// src/audit/audit.dto.ts
import { IsString, IsInt, IsOptional, IsEnum, IsBoolean, IsDateString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type, Transform } from 'class-transformer';
import { BaseFilterDto } from '../common/dtos/pagination.dto';
import { AuditStatus, RiskLevel as AuditSeverity } from '@prisma/client';

export { AuditStatus, AuditSeverity };

// AuditLog.action permanece String livre no schema — escrito por 19+ serviços
// através de common/services/audit.service.ts com nomes de acção arbitrários
// (CLOCK_IN, SKILL_CREATED, DOWNLOAD, PUBLISH, REMIND, etc.), muito além dos
// 12 valores documentados no comentário do schema. Este enum aqui é usado só
// para validar o filtro opcional AuditFilterDto.action — não reflecte a
// totalidade dos valores reais gravados.
export enum AuditAction {
  CREATE = 'CREATE',
  UPDATE = 'UPDATE',
  DELETE = 'DELETE',
  LOGIN = 'LOGIN',
  LOGOUT = 'LOGOUT',
  EXPORT = 'EXPORT',
  SEND = 'SEND',
  READ = 'READ',
  APPROVE = 'APPROVE',
  REJECT = 'REJECT',
  DENIED = 'DENIED',
  FAILED = 'FAILED',
}

export class AuditFilterDto extends BaseFilterDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  userId?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  entity?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  entityId?: number;

  @ApiPropertyOptional({ enum: AuditAction })
  @IsOptional()
  @IsEnum(AuditAction)
  action?: AuditAction;

  @ApiPropertyOptional({ enum: AuditSeverity })
  @IsOptional()
  @IsEnum(AuditSeverity)
  severity?: AuditSeverity;

  @ApiPropertyOptional({ enum: AuditStatus })
  @IsOptional()
  @IsEnum(AuditStatus)
  status?: AuditStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  ip?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  to?: string;

  // @Type(() => Boolean) coage '?criticalOnly=false' para true — ver
  // [[project-innova-boolean-query-filter-coercion]]. @Type(() => String) +
  // @Transform evita a coerção Boolean automática do class-transformer.
  @ApiPropertyOptional({ description: 'Apenas eventos críticos e altos' })
  @IsOptional()
  @Type(() => String)
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  criticalOnly?: boolean;
}

export class LogAuditDto {
  userId!: number | null;
  action!: string;
  entity!: string;
  entityId?: number;
  entityName?: string;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  changes?: Record<string, { from: unknown; to: unknown }>;
  status?: AuditStatus;
  severity?: AuditSeverity;
  ip?: string;
  userAgent?: string;
  reason?: string;
  metadata?: Record<string, unknown>;
}

// ADICIONAR NO FINAL de src/audit/audit.dto.ts
// (depois de todas as classes existentes)

// Adicionar também o campo entityId ao AuditFilterDto se não existir:
// (dentro da classe AuditFilterDto, adiciona)
//   @ApiPropertyOptional() @IsOptional() @IsInt() @Type(() => Number)
//   entityId?: number;
