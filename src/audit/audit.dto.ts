// src/audit/audit.dto.ts
import {
  IsString, IsInt, IsOptional, IsEnum, IsDateString, IsBoolean, Min, MaxLength,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export enum AuditAction {
  CREATE  = 'CREATE',
  UPDATE  = 'UPDATE',
  DELETE  = 'DELETE',
  READ    = 'READ',
  LOGIN   = 'LOGIN',
  LOGOUT  = 'LOGOUT',
  EXPORT  = 'EXPORT',
  SEND    = 'SEND',
  APPROVE = 'APPROVE',
  REJECT  = 'REJECT',
  DENY    = 'DENY',
}

export enum AuditSeverity {
  LOW      = 'LOW',
  MEDIUM   = 'MEDIUM',
  HIGH     = 'HIGH',
  CRITICAL = 'CRITICAL',
}

export enum AuditStatus {
  SUCCESS = 'SUCCESS',
  FAILED  = 'FAILED',
  DENIED  = 'DENIED',
}

export class AuditFilterDto {
  @ApiPropertyOptional() @IsOptional() @IsInt() @Type(() => Number)
  userId?: number;

  @ApiPropertyOptional() @IsOptional() @IsString()
  entity?: string;

  @ApiPropertyOptional() @IsOptional() @IsInt() @Type(() => Number)
  entityId?: number;

  @ApiPropertyOptional({ enum: AuditAction }) @IsOptional() @IsEnum(AuditAction)
  action?: AuditAction;

  @ApiPropertyOptional({ enum: AuditSeverity }) @IsOptional() @IsEnum(AuditSeverity)
  severity?: AuditSeverity;

  @ApiPropertyOptional({ enum: AuditStatus }) @IsOptional() @IsEnum(AuditStatus)
  status?: AuditStatus;

  @ApiPropertyOptional() @IsOptional() @IsString()
  ip?: string;

  @ApiPropertyOptional() @IsOptional() @IsDateString()
  from?: string;

  @ApiPropertyOptional() @IsOptional() @IsDateString()
  to?: string;

  @ApiPropertyOptional() @IsOptional() @IsBoolean() @Type(() => Boolean)
  criticalOnly?: boolean;

  @ApiPropertyOptional({ default: 1 }) @IsOptional() @IsInt() @Min(1) @Type(() => Number)
  page?: number;

  @ApiPropertyOptional({ default: 50 }) @IsOptional() @IsInt() @Min(1) @Type(() => Number)
  limit?: number;
}

export class AuditTimelineFilterDto {
  @ApiPropertyOptional() @IsOptional() @IsString()
  entity?: string;

  @ApiPropertyOptional() @IsOptional() @IsInt() @Type(() => Number)
  entityId?: number;

  @ApiPropertyOptional() @IsOptional() @IsInt() @Type(() => Number)
  userId?: number;
}

export class CreateAuditLogDto {
  userId?:       number | null;
  action!:       AuditAction | string;
  entity!:       string;
  entityId?:     number;
  entityName?:   string;
  before?:       any;
  after?:        any;
  changes?:      Record<string, { from: any; to: any }>;
  status?:       AuditStatus;
  severity?:     AuditSeverity;
  ip?:           string;
  userAgent?:    string;
  sessionId?:    string;
  reason?:       string;
  metadata?:     Record<string, any>;
}

// ADICIONAR NO FINAL de src/audit/audit.dto.ts
// (depois de todas as classes existentes)
 
export type LogAuditDto = CreateAuditLogDto;
 
// Adicionar também o campo entityId ao AuditFilterDto se não existir:
// (dentro da classe AuditFilterDto, adiciona)
//   @ApiPropertyOptional() @IsOptional() @IsInt() @Type(() => Number)
//   entityId?: number;
