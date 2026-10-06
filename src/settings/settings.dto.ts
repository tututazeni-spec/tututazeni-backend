// src/settings/settings.dto.ts
import {
  IsArray,
  IsBoolean,
  IsEmail,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { EmptyStringToUndefined } from '../common/transformers/empty-string-to-undefined';
import { POLICY_REQUIRED_FIELD_OPTIONS } from './user-policy';
import { TWO_FACTOR_MODES } from './security-policy';
import { ISIS_MODULE_OPTIONS } from './integration-settings';

const DATE_FORMATS = ['DD/MM/YYYY', 'MM/DD/YYYY', 'YYYY-MM-DD'] as const;
const TIME_FORMATS = ['24h', '12h'] as const;
const NUMBER_FORMATS = ['pt', 'en'] as const;
const LANGUAGES = ['pt', 'en', 'es', 'fr'] as const;

export class UpdateOrganizationSettingsDto {
  @ApiPropertyOptional({ description: 'Nome do tenant (aparece no cabeçalho do Dashboard)' })
  @IsOptional()
  @EmptyStringToUndefined()
  @IsString()
  @MaxLength(120)
  tenantName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @EmptyStringToUndefined()
  @IsString()
  @MaxLength(120)
  platformName?: string;

  @ApiPropertyOptional({ description: 'Logo — URL ou data-URL' })
  @IsOptional()
  @IsString()
  logoUrl?: string;

  @ApiPropertyOptional({ description: 'Favicon — URL ou data-URL' })
  @IsOptional()
  @IsString()
  faviconUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @EmptyStringToUndefined()
  @IsString()
  @MaxLength(30)
  nif?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @EmptyStringToUndefined()
  @IsString()
  @MaxLength(300)
  address?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @EmptyStringToUndefined()
  @IsString()
  @MaxLength(40)
  phone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @EmptyStringToUndefined()
  @IsEmail()
  contactEmail?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @EmptyStringToUndefined()
  @IsUrl({ require_protocol: false })
  website?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @EmptyStringToUndefined()
  @IsString()
  @MaxLength(80)
  sector?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @EmptyStringToUndefined()
  @IsString()
  @MaxLength(80)
  country?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(60)
  defaultTimezone?: string;

  @ApiPropertyOptional({ enum: LANGUAGES })
  @IsOptional()
  @IsIn(LANGUAGES)
  defaultLanguage?: string;

  @ApiPropertyOptional({ example: 'AOA' })
  @IsOptional()
  @IsString()
  @MaxLength(3)
  defaultCurrency?: string;

  @ApiPropertyOptional({ enum: DATE_FORMATS })
  @IsOptional()
  @IsIn(DATE_FORMATS)
  dateFormat?: string;

  @ApiPropertyOptional({ enum: TIME_FORMATS })
  @IsOptional()
  @IsIn(TIME_FORMATS)
  timeFormat?: string;

  @ApiPropertyOptional({ enum: NUMBER_FORMATS })
  @IsOptional()
  @IsIn(NUMBER_FORMATS)
  numberFormat?: string;
}

export class UpdateUserPolicyDto {
  @ApiPropertyOptional({ enum: POLICY_REQUIRED_FIELD_OPTIONS, isArray: true })
  @IsOptional()
  @IsArray()
  @IsIn(POLICY_REQUIRED_FIELD_OPTIONS, { each: true })
  requiredFields?: string[];

  @ApiPropertyOptional({ example: ['empresa.ao'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  allowedEmailDomains?: string[];

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  defaultRoleId?: number | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  invitesEnabled?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(90)
  invitationExpiryDays?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  forcePasswordChangeOnFirstLogin?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(7)
  @Max(730)
  inactiveAfterDays?: number;
}

export class SetDepartmentScopeDto {
  @ApiPropertyOptional({ type: [Number], description: 'Vazio = sem restrição' })
  @IsArray()
  @Type(() => Number)
  @IsInt({ each: true })
  departmentIds!: number[];
}

// ─── §4 Segurança ────────────────────────────────────────────────────────────

export class UpdateSecurityPolicyDto {
  @ApiPropertyOptional({ minimum: 10, maximum: 64, description: 'Piso do projecto: 10' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(10)
  @Max(64)
  passwordMinLength?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  passwordRequireSymbol?: boolean;

  @ApiPropertyOptional({ description: '0 = a palavra-passe nunca expira' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(730)
  passwordExpiryDays?: number;

  @ApiPropertyOptional({ description: '0 = sem bloqueio' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(20)
  maxFailedAttempts?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1440)
  lockoutMinutes?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(5)
  @Max(1440)
  sessionIdleMinutes?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(5)
  @Max(120)
  accessTokenMinutes?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(7) // limite do cookie de refresh (token-cookie.ts)
  refreshTokenDays?: number;

  @ApiPropertyOptional({ enum: TWO_FACTOR_MODES })
  @IsOptional()
  @IsIn(TWO_FACTOR_MODES)
  twoFactorMode?: string;
}

export class TwoFactorCodeDto {
  @ApiPropertyOptional({ example: '123456' })
  @IsString()
  @Matches(/^\d{6}$/, { message: 'O código deve ter 6 dígitos' })
  code!: string;
}

export class DisableTwoFactorDto extends TwoFactorCodeDto {}

// ─── §5 Notificações ─────────────────────────────────────────────────────────

class NotificationChannelsDto {
  @ApiPropertyOptional() @IsOptional() @IsBoolean() inApp?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() email?: boolean;
  @ApiPropertyOptional({ description: 'WhatsApp — só envio' })
  @IsOptional()
  @IsBoolean()
  whatsapp?: boolean;
}

class NotificationEventsDto {
  @ApiPropertyOptional() @IsOptional() @IsBoolean() ENROLLMENT?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() COURSE_REMINDER?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() CORPORATE_EVENT?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() PENDING_EVALUATION?: boolean;
}

class SendWindowDto {
  @ApiPropertyOptional() @IsOptional() @IsBoolean() enabled?: boolean;

  @ApiPropertyOptional({ minimum: 0, maximum: 23 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(23)
  startHour?: number;

  @ApiPropertyOptional({ minimum: 0, maximum: 23 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(23)
  endHour?: number;

  @ApiPropertyOptional() @IsOptional() @IsBoolean() weekdaysOnly?: boolean;
}

export class UpdateNotificationSettingsDto {
  @ApiPropertyOptional({ type: NotificationChannelsDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => NotificationChannelsDto)
  channels?: NotificationChannelsDto;

  @ApiPropertyOptional({ type: NotificationEventsDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => NotificationEventsDto)
  events?: NotificationEventsDto;

  @ApiPropertyOptional({ type: SendWindowDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => SendWindowDto)
  sendWindow?: SendWindowDto;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  criticalBypassWindow?: boolean;
}

// ─── §6 Integrações ──────────────────────────────────────────────────────────

class SmtpSettingsDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(255) host?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(65535)
  port?: number;

  @ApiPropertyOptional() @IsOptional() @IsBoolean() secure?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(255) user?: string;

  @ApiPropertyOptional({ description: 'Só é gravada se enviada; nunca é devolvida' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  password?: string;

  @ApiPropertyOptional({ example: 'INNOVA <noreply@empresa.ao>' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  from?: string;
}

class WhatsAppSettingsDto {
  @ApiPropertyOptional() @IsOptional() @IsBoolean() enabled?: boolean;

  @ApiPropertyOptional({ example: '+244923000000' })
  @IsOptional()
  @Matches(/^(\+[1-9]\d{6,14})?$/, { message: 'Número em formato E.164 (ex.: +244923000000)' })
  number?: string;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(64) accountSid?: string;

  @ApiPropertyOptional({ description: 'Só é gravado se enviado; nunca é devolvido' })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  authToken?: string;

  @ApiPropertyOptional({ description: '0 = sem limite' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100000)
  hourlyLimit?: number;

  @ApiPropertyOptional({ description: '0 = sem limite' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(1000000)
  dailyLimit?: number;
}

class IsisSettingsDto {
  @ApiPropertyOptional() @IsOptional() @IsBoolean() enabled?: boolean;

  @ApiPropertyOptional({ enum: ISIS_MODULE_OPTIONS, isArray: true, description: 'Vazio = todos' })
  @IsOptional()
  @IsArray()
  @IsIn(ISIS_MODULE_OPTIONS, { each: true })
  enabledModules?: string[];

  @ApiPropertyOptional({ description: '0 = usa o limite das definições do AI Tutor' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(10000)
  dailyLimitPerUser?: number;
}

export class UpdateIntegrationSettingsDto {
  @ApiPropertyOptional({ type: SmtpSettingsDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => SmtpSettingsDto)
  smtp?: SmtpSettingsDto;

  @ApiPropertyOptional({ type: WhatsAppSettingsDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => WhatsAppSettingsDto)
  whatsapp?: WhatsAppSettingsDto;

  @ApiPropertyOptional({ type: IsisSettingsDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => IsisSettingsDto)
  isis?: IsisSettingsDto;
}

export class TestSmtpDto {
  @ApiPropertyOptional({ description: 'Destinatário do email de teste (por omissão, o do admin)' })
  @IsOptional()
  @IsEmail()
  to?: string;
}
