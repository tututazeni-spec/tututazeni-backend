// src/automation/automation-governance.dto.ts
// DTOs de §10 (configurações, segurança e controlo) e §11 (modelos pré-configurados).
import {
  IsString,
  IsOptional,
  IsBoolean,
  IsInt,
  IsArray,
  IsDateString,
  IsObject,
  IsIn,
  MaxLength,
  Max,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { BaseFilterDto } from '../common/dtos/pagination.dto';

// ─── Auditoria ────────────────────────────────────────────────────

export class AuditFilterDto extends BaseFilterDto {
  @ApiPropertyOptional({
    description: 'RULE | SETTINGS | PERMISSION | CONNECTION | DEAD_LETTER | RETENTION',
  })
  @IsOptional()
  @IsString()
  entity?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() action?: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Type(() => Number) ruleId?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Type(() => Number) userId?: number;
  @ApiPropertyOptional() @IsOptional() @IsDateString() from?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() to?: string;
}

// ─── Limites, alertas e retenção ──────────────────────────────────

export class UpdateAutomationSettingsDto {
  @ApiPropertyOptional({ description: 'Execuções por minuto e por automação' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10000)
  @Type(() => Number)
  maxExecutionsPerMinute?: number;

  @ApiPropertyOptional({ description: 'Execuções em curso em simultâneo por automação' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(200)
  @Type(() => Number)
  maxConcurrentPerRule?: number;

  @ApiPropertyOptional({ description: 'Profundidade máxima de cadeias evento → regra' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(20)
  @Type(() => Number)
  maxEventDepth?: number;

  @ApiPropertyOptional() @IsOptional() @IsBoolean() requireApprovalCritical?: boolean;

  @ApiPropertyOptional({ description: 'Falhas definitivas na janela que disparam alerta' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1000)
  @Type(() => Number)
  failureAlertThreshold?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10080)
  @Type(() => Number)
  failureAlertWindowMinutes?: number;

  @ApiPropertyOptional({ description: 'Dias até remover os dados pessoais do registo' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(3650)
  @Type(() => Number)
  archiveAfterDays?: number;

  @ApiPropertyOptional({ description: 'Dias até apagar a execução' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(3650)
  @Type(() => Number)
  retentionDays?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(3650)
  @Type(() => Number)
  deadLetterRetentionDays?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(30)
  @Max(3650)
  @Type(() => Number)
  auditRetentionDays?: number;
}

export class RetentionRunDto {
  @ApiPropertyOptional({ description: 'true = só conta o que seria arquivado/apagado' })
  @IsOptional()
  @IsBoolean()
  dryRun?: boolean;
}

// ─── Permissões por perfil ────────────────────────────────────────

export class UpdateRolePermissionDto {
  @ApiPropertyOptional() @IsOptional() @IsBoolean() view?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() create?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() edit?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() test?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() activate?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() execute?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() cancel?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() delete?: boolean;
  @ApiPropertyOptional({ enum: ['ALL', 'DEPARTMENT'] })
  @IsOptional()
  @IsIn(['ALL', 'DEPARTMENT'])
  scope?: 'ALL' | 'DEPARTMENT';
}

// ─── Aprovação de publicação ──────────────────────────────────────

export class DecidePublishDto {
  @ApiPropertyOptional({ description: 'Obrigatória ao recusar' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}

// ─── Ligações e segredos ──────────────────────────────────────────

export const CONNECTION_TYPES = ['HTTP', 'WEBHOOK', 'SMTP', 'SMS', 'WHATSAPP', 'OTHER'] as const;
export const CONNECTION_AUTH = ['NONE', 'BEARER', 'BASIC', 'API_KEY_HEADER'] as const;

export class ConnectionFilterDto extends BaseFilterDto {
  @ApiPropertyOptional() @IsOptional() @IsIn(['ACTIVE', 'DISABLED']) status?: string;
  @ApiPropertyOptional() @IsOptional() @IsIn([...CONNECTION_TYPES]) type?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(120) search?: string;
}

export class CreateConnectionDto {
  @ApiProperty() @IsString() @MaxLength(120) name!: string;
  @ApiPropertyOptional({ enum: CONNECTION_TYPES })
  @IsOptional()
  @IsIn([...CONNECTION_TYPES])
  type?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(500) baseUrl?: string;
  @ApiPropertyOptional({ enum: CONNECTION_AUTH })
  @IsOptional()
  @IsIn([...CONNECTION_AUTH])
  authType?: string;
  @ApiPropertyOptional({ description: 'API_KEY_HEADER: nome do cabeçalho' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  headerName?: string;
  @ApiPropertyOptional({ description: 'BASIC: utilizador' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  username?: string;
  @ApiPropertyOptional({ description: 'Token / palavra-passe / chave — cifrado, nunca devolvido' })
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  secret?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(1000) description?: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Type(() => Number) ownerId?: number;
}

export class UpdateConnectionDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(120) name?: string;
  @ApiPropertyOptional({ enum: CONNECTION_TYPES })
  @IsOptional()
  @IsIn([...CONNECTION_TYPES])
  type?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(500) baseUrl?: string;
  @ApiPropertyOptional({ enum: CONNECTION_AUTH })
  @IsOptional()
  @IsIn([...CONNECTION_AUTH])
  authType?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(100) headerName?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) username?: string;
  @ApiPropertyOptional({ description: 'Novo segredo (rotação); omitir mantém o actual' })
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  secret?: string;
  @ApiPropertyOptional({ enum: ['ACTIVE', 'DISABLED'] })
  @IsOptional()
  @IsIn(['ACTIVE', 'DISABLED'])
  status?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(1000) description?: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Type(() => Number) ownerId?: number;
}

// ─── Dead letter ──────────────────────────────────────────────────

export class DeadLetterFilterDto extends BaseFilterDto {
  @ApiPropertyOptional({ enum: ['OPEN', 'REPROCESSED', 'DISCARDED'] })
  @IsOptional()
  @IsIn(['OPEN', 'REPROCESSED', 'DISCARDED'])
  status?: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Type(() => Number) ruleId?: number;
  @ApiPropertyOptional() @IsOptional() @IsDateString() from?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() to?: string;
}

// ─── Modelos pré-configurados (§11) ───────────────────────────────

export class TemplateFilterDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(60) area?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(120) search?: string;
}

export class InstantiateTemplateDto {
  @ApiPropertyOptional({ description: 'Nome da automação; omissão = nome do modelo' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  name?: string;

  @ApiPropertyOptional({
    description: 'Valores dos campos (ver GET /automation/template-library/:key)',
  })
  @IsOptional()
  @IsObject()
  values?: Record<string, unknown>;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  departmentIds?: string[];

  @ApiPropertyOptional() @IsOptional() @IsBoolean() critical?: boolean;
}
