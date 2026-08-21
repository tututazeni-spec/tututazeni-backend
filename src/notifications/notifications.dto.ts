// src/notifications/notifications.dto.ts
import {
  IsString,
  IsInt,
  IsOptional,
  IsBoolean,
  IsArray,
  IsEnum,
  IsDateString,
  IsObject,
  MaxLength,
  Min,
  ArrayMaxSize,
  IsNotEmpty,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type, Transform } from 'class-transformer';
import { NotificationPriority, NotificationCategory, DigestFrequency } from '@prisma/client';
import { BaseFilterDto } from '../common/dtos/pagination.dto';

// ─── Enums ────────────────────────────────────────────────────────────────────

export { NotificationPriority, NotificationCategory, DigestFrequency };

// ─── Send ─────────────────────────────────────────────────────────────────────

export class CreateNotificationDto {
  @ApiProperty()
  @IsInt()
  userId!: number;

  @ApiProperty({ example: 'PDI_CREATED' })
  @IsString()
  @MaxLength(60)
  type!: string;

  @ApiProperty()
  @IsString()
  @MaxLength(500)
  message!: string;

  @ApiPropertyOptional({ description: 'Título curto (para push/toast)' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  title?: string;

  @ApiPropertyOptional({ enum: NotificationPriority, default: NotificationPriority.MEDIUM })
  @IsOptional()
  @IsEnum(NotificationPriority)
  priority?: NotificationPriority;

  @ApiPropertyOptional({ enum: NotificationCategory })
  @IsOptional()
  @IsEnum(NotificationCategory)
  category?: NotificationCategory;

  @ApiPropertyOptional({ description: 'URL de acção directa (deep link)' })
  @IsOptional()
  @IsString()
  actionUrl?: string;

  @ApiPropertyOptional({ description: 'Texto do botão de acção' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  actionLabel?: string;

  @ApiPropertyOptional({ description: 'Metadados extras (JSON)' })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;

  @ApiPropertyOptional({ description: 'Data de expiração' })
  @IsOptional()
  @IsDateString()
  expiresAt?: string;
}

export class BulkNotificationDto {
  @ApiProperty({ type: [Number] })
  @IsArray()
  @IsInt({ each: true })
  userIds!: number[];

  @ApiProperty()
  @IsString()
  @MaxLength(60)
  type!: string;

  @ApiProperty()
  @IsString()
  @MaxLength(500)
  message!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  title?: string;

  @ApiPropertyOptional({ enum: NotificationPriority })
  @IsOptional()
  @IsEnum(NotificationPriority)
  priority?: NotificationPriority;

  @ApiPropertyOptional({ enum: NotificationCategory })
  @IsOptional()
  @IsEnum(NotificationCategory)
  category?: NotificationCategory;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  actionUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

// ─── Template ─────────────────────────────────────────────────────────────────

export class NotificationsCreateTemplateDto {
  @ApiProperty({ example: 'PDI aprovado' })
  @IsString()
  @MaxLength(120)
  name!: string;

  @ApiProperty({ example: 'PDI_APPROVED' })
  @IsString()
  @MaxLength(60)
  eventType!: string;

  @ApiProperty({ description: 'Template de mensagem com variáveis {{nome}}, {{prazo}}' })
  @IsString()
  messageTemplate!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  titleTemplate?: string;

  @ApiPropertyOptional({ enum: NotificationPriority })
  @IsOptional()
  @IsEnum(NotificationPriority)
  priority?: NotificationPriority;

  @ApiPropertyOptional({ enum: NotificationCategory })
  @IsOptional()
  @IsEnum(NotificationCategory)
  category?: NotificationCategory;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  actionUrlTemplate?: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class NotificationsUpdateTemplateDto extends PartialType(NotificationsCreateTemplateDto) {}

// ─── Preferences ──────────────────────────────────────────────────────────────

export class UpdatePreferencesDto {
  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  inApp?: boolean;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  email?: boolean;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  push?: boolean;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  slack?: boolean;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  sms?: boolean;

  @ApiPropertyOptional({ description: 'Hora início do período silencioso (0-23)', default: 22 })
  @IsOptional()
  @IsInt()
  @Min(0)
  quietHourStart?: number;

  @ApiPropertyOptional({ description: 'Hora fim do período silencioso (0-23)', default: 8 })
  @IsOptional()
  @IsInt()
  @Min(0)
  quietHourEnd?: number;

  @ApiPropertyOptional({ enum: DigestFrequency })
  @IsOptional()
  @IsEnum(DigestFrequency)
  digestFrequency?: DigestFrequency;

  @ApiPropertyOptional({ description: 'Categorias desactivadas' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  disabledCategories?: string[];
}

// ─── Filters ──────────────────────────────────────────────────────────────────

export class NotificationFilterDto extends BaseFilterDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  type?: string;

  @ApiPropertyOptional({ enum: NotificationCategory })
  @IsOptional()
  @IsEnum(NotificationCategory)
  category?: NotificationCategory;

  @ApiPropertyOptional({ enum: NotificationPriority })
  @IsOptional()
  @IsEnum(NotificationPriority)
  priority?: NotificationPriority;

  // @Type(() => Boolean) coage '?read=false' para true — ver
  // [[project-innova-boolean-query-filter-coercion]]. @Type(() => String) +
  // @Transform evita a coerção Boolean automática do class-transformer.
  // Bug real e activo: o frontend (hooks/useNotificationsInbox.ts) envia
  // read=false para o filtro "Não lidas" — sem este fix devolvia as lidas.
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => String)
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  read?: boolean;
}

// ─── ReadBulkDto ─────────────────────────────────────────────────────────────

export class ReadBulkDto {
  @IsArray()
  @ArrayMaxSize(100)
  @IsInt({ each: true })
  @Min(1, { each: true })
  ids!: number[];
}

// ─── SendAllNotificationDto ──────────────────────────────────────────────────

export class SendAllNotificationDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  type!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  message!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;
}

// ─── CreateAutomationRuleBodyDto ─────────────────────────────────────────────

export class CreateAutomationRuleBodyDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  trigger!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  action!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  condition!: string;
}
