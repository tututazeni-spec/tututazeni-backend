// src/notifications/notifications.dto.ts
import {
  IsString, IsInt, IsOptional, IsBoolean, IsArray,
  IsEnum, IsDateString, IsObject, MaxLength, Min, IsIn,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';

// ─── Enums ────────────────────────────────────────────────────────────────────

export enum NotificationPriority {
  LOW      = 'LOW',
  MEDIUM   = 'MEDIUM',
  HIGH     = 'HIGH',
  CRITICAL = 'CRITICAL',
}

export enum NotificationCategory {
  LMS         = 'LMS',
  PDI         = 'PDI',
  PERFORMANCE = 'PERFORMANCE',
  HR          = 'HR',
  ENGAGEMENT  = 'ENGAGEMENT',
  GAMIFICATION= 'GAMIFICATION',
  SYSTEM      = 'SYSTEM',
  ONBOARDING  = 'ONBOARDING',
  KNOWLEDGE   = 'KNOWLEDGE',
}

// ─── Send ─────────────────────────────────────────────────────────────────────

export class CreateNotificationDto {
  @ApiProperty() @IsInt()
  userId!: number;

  @ApiProperty({ example: 'PDI_CREATED' }) @IsString() @MaxLength(60)
  type!: string;

  @ApiProperty() @IsString() @MaxLength(500)
  message!: string;

  @ApiPropertyOptional({ description: 'Título curto (para push/toast)' })
  @IsOptional() @IsString() @MaxLength(120)
  title?: string;

  @ApiPropertyOptional({ enum: NotificationPriority, default: NotificationPriority.MEDIUM })
  @IsOptional() @IsEnum(NotificationPriority)
  priority?: NotificationPriority;

  @ApiPropertyOptional({ enum: NotificationCategory })
  @IsOptional() @IsEnum(NotificationCategory)
  category?: NotificationCategory;

  @ApiPropertyOptional({ description: 'URL de acção directa (deep link)' })
  @IsOptional() @IsString()
  actionUrl?: string;

  @ApiPropertyOptional({ description: 'Texto do botão de acção' })
  @IsOptional() @IsString() @MaxLength(50)
  actionLabel?: string;

  @ApiPropertyOptional({ description: 'Metadados extras (JSON)' })
  @IsOptional() @IsObject()
  metadata?: Record<string, any>;

  @ApiPropertyOptional({ description: 'Data de expiração' })
  @IsOptional() @IsDateString()
  expiresAt?: string;
}

export class BulkNotificationDto {
  @ApiProperty({ type: [Number] }) @IsArray() @IsInt({ each: true })
  userIds!: number[];

  @ApiProperty() @IsString() @MaxLength(60)
  type!: string;

  @ApiProperty() @IsString() @MaxLength(500)
  message!: string;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(120)
  title?: string;

  @ApiPropertyOptional({ enum: NotificationPriority })
  @IsOptional() @IsEnum(NotificationPriority)
  priority?: NotificationPriority;

  @ApiPropertyOptional({ enum: NotificationCategory })
  @IsOptional() @IsEnum(NotificationCategory)
  category?: NotificationCategory;

  @ApiPropertyOptional() @IsOptional() @IsString()
  actionUrl?: string;

  @ApiPropertyOptional() @IsOptional() @IsObject()
  metadata?: Record<string, any>;
}

// ─── Template ─────────────────────────────────────────────────────────────────

export class CreateTemplateDto {
  @ApiProperty({ example: 'PDI aprovado' }) @IsString() @MaxLength(120)
  name!: string;

  @ApiProperty({ example: 'PDI_APPROVED' }) @IsString() @MaxLength(60)
  eventType!: string;

  @ApiProperty({ description: 'Template de mensagem com variáveis {{nome}}, {{prazo}}' })
  @IsString()
  messageTemplate!: string;

  @ApiPropertyOptional() @IsOptional() @IsString()
  titleTemplate?: string;

  @ApiPropertyOptional({ enum: NotificationPriority })
  @IsOptional() @IsEnum(NotificationPriority)
  priority?: NotificationPriority;

  @ApiPropertyOptional({ enum: NotificationCategory })
  @IsOptional() @IsEnum(NotificationCategory)
  category?: NotificationCategory;

  @ApiPropertyOptional() @IsOptional() @IsString()
  actionUrlTemplate?: string;

  @ApiPropertyOptional({ default: true }) @IsOptional() @IsBoolean()
  active?: boolean;
}

export class UpdateTemplateDto extends PartialType(CreateTemplateDto) {}

// ─── Preferences ──────────────────────────────────────────────────────────────

export class UpdatePreferencesDto {
  @ApiPropertyOptional({ default: true }) @IsOptional() @IsBoolean()
  inApp?: boolean;

  @ApiPropertyOptional({ default: true }) @IsOptional() @IsBoolean()
  email?: boolean;

  @ApiPropertyOptional({ default: false }) @IsOptional() @IsBoolean()
  push?: boolean;

  @ApiPropertyOptional({ default: false }) @IsOptional() @IsBoolean()
  slack?: boolean;

  @ApiPropertyOptional({ default: false }) @IsOptional() @IsBoolean()
  sms?: boolean;

  @ApiPropertyOptional({ description: 'Hora início do período silencioso (0-23)', default: 22 })
  @IsOptional() @IsInt() @Min(0)
  quietHourStart?: number;

  @ApiPropertyOptional({ description: 'Hora fim do período silencioso (0-23)', default: 8 })
  @IsOptional() @IsInt() @Min(0)
  quietHourEnd?: number;

  @ApiPropertyOptional({ description: 'Digest: NONE, DAILY, WEEKLY' })
  @IsOptional() @IsIn(['NONE', 'DAILY', 'WEEKLY'])
  digestFrequency?: string;

  @ApiPropertyOptional({ description: 'Categorias desactivadas' })
  @IsOptional() @IsArray() @IsString({ each: true })
  disabledCategories?: string[];
}

// ─── Filters ──────────────────────────────────────────────────────────────────

export class NotificationFilterDto {
  @ApiPropertyOptional() @IsOptional() @IsString()
  type?: string;

  @ApiPropertyOptional({ enum: NotificationCategory }) @IsOptional() @IsEnum(NotificationCategory)
  category?: NotificationCategory;

  @ApiPropertyOptional({ enum: NotificationPriority }) @IsOptional() @IsEnum(NotificationPriority)
  priority?: NotificationPriority;

  @ApiPropertyOptional() @IsOptional() @IsBoolean() @Type(() => Boolean)
  read?: boolean;

  @ApiPropertyOptional({ default: 1 }) @IsOptional() @IsInt() @Min(1) @Type(() => Number)
  page?: number;

  @ApiPropertyOptional({ default: 20 }) @IsOptional() @IsInt() @Min(1) @Type(() => Number)
  limit?: number;
}