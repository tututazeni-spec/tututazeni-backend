// src/settings/settings.dto.ts
import {
  IsArray,
  IsBoolean,
  IsEmail,
  IsEnum,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { CertificateTemplateType, DsrStatus, DsrType, PermissionSubject } from '@prisma/client';
import { EmptyStringToUndefined } from '../common/transformers/empty-string-to-undefined';
import { POLICY_REQUIRED_FIELD_OPTIONS } from './user-policy';
import { TWO_FACTOR_MODES } from './security-policy';
import { ISIS_MODULE_OPTIONS } from './integration-settings';
import { OIDC_PROVIDERS } from './auth-settings';
import { EMAIL_TEMPLATE_KEYS } from './email-settings';

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
  logoUrl?: string; // file-url-exempt: data-URL base64 inline (ver comentário em settings.service.ts#updateOrganization), não é referência a storage externo

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

// ─── §7 Certificados ─────────────────────────────────────────────────────────

export class UpdateCertificateSettingsDto {
  @ApiPropertyOptional({ description: 'Logo da academia — substitui o logo de cada template' })
  @IsOptional()
  @IsString()
  academyLogoUrl?: string | null;

  @ApiPropertyOptional({ description: 'Assinatura electrónica — aplicada a todos os certificados' })
  @IsOptional()
  @IsString()
  signatureUrl?: string | null; // file-url-exempt: data-URL base64 inline (mesma convenção do logo/favicon da organização), não é referência a storage externo

  @ApiPropertyOptional()
  @IsOptional()
  @EmptyStringToUndefined()
  @IsString()
  @MaxLength(120)
  signatoryName?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @EmptyStringToUndefined()
  @IsString()
  @MaxLength(120)
  signatoryTitle?: string | null;

  @ApiPropertyOptional({ description: 'Texto padrão acrescentado a todos os certificados' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  defaultText?: string | null;

  @ApiPropertyOptional({ example: 'CERT-' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  numberingPrefix?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  numberingNextSeq?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(10)
  numberingPadding?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(6)
  @Max(32)
  verificationCodeLength?: number;
}

export class CreateCertificateTemplateDto {
  @ApiProperty() @IsString() @MaxLength(120) name!: string;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(500) description?: string;

  @ApiProperty({ enum: CertificateTemplateType })
  @IsEnum(CertificateTemplateType)
  type!: CertificateTemplateType;

  @ApiProperty() @IsString() @IsNotEmpty() html!: string;

  @ApiPropertyOptional() @IsOptional() @IsString() cssStyle?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() logoUrl?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() signatureUrl?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(120) signatoryName?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(120) signatoryTitle?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isDefault?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isActive?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(3650)
  validityDays?: number;
}

export class UpdateCertificateTemplateDto extends PartialType(CreateCertificateTemplateDto) {}

// ─── §8 Privacidade (LPDP) ───────────────────────────────────────────────────

export class UpdatePrivacySettingsDto {
  @ApiPropertyOptional()
  @IsOptional()
  @EmptyStringToUndefined()
  @IsString()
  @MaxLength(120)
  dpoName?: string;

  @ApiPropertyOptional() @IsOptional() @EmptyStringToUndefined() @IsEmail() dpoEmail?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @EmptyStringToUndefined()
  @IsString()
  @MaxLength(40)
  dpoPhone?: string;

  @ApiPropertyOptional({ description: 'Prazo geral de retenção de dados pessoais, em dias' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(30)
  @Max(3650)
  retentionDays?: number;

  @ApiPropertyOptional() @IsOptional() @IsBoolean() anonymizationEnabled?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() exportEnabled?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() autoDeleteOnRequest?: boolean;
}

export class PublishConsentTextDto {
  @ApiProperty() @IsString() @IsNotEmpty() @MaxLength(20000) text!: string;
}

export class CreateDataSubjectRequestDto {
  @ApiProperty() @IsString() @MaxLength(120) requesterName!: string;
  @ApiProperty() @IsEmail() requesterEmail!: string;
  @ApiProperty({ enum: DsrType }) @IsEnum(DsrType) type!: DsrType;

  @ApiPropertyOptional({
    description: 'Id do utilizador titular, se for colaborador da plataforma',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  userId?: number;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(4000) details?: string;
}

export class UpdateDataSubjectRequestDto {
  @ApiPropertyOptional({ enum: DsrStatus }) @IsOptional() @IsEnum(DsrStatus) status?: DsrStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  resolutionNote?: string;
}

// ─── §9 Licença e Módulos ─────────────────────────────────────────────────────

/**
 * Activar/desactivar módulos é informativo/administrativo nesta fase — persiste
 * a preferência da organização, mas não há ainda um guard central que bloqueie
 * rotas de um módulo desactivado (seria um projecto à parte, por módulo).
 */
export class UpdateModuleFlagsDto {
  @ApiProperty({
    type: 'object',
    additionalProperties: { type: 'boolean' },
    example: { LMS: true, PAYROLL: false },
  })
  @IsObject()
  modules!: Partial<Record<PermissionSubject, boolean>>;
}

// ─── §11 Autenticação / SSO ───────────────────────────────────────────────────

class OidcSettingsDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(255) clientId?: string;

  @ApiPropertyOptional({ description: 'Só é gravado se enviado; nunca é devolvido' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  clientSecret?: string;

  @ApiPropertyOptional({
    description: 'Só MICROSOFT — tenant do Azure AD ("common" = qualquer conta)',
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  tenantId?: string;

  @ApiPropertyOptional({
    description: 'Só OIDC genérico — emissor do fornecedor',
    example: 'https://idp.empresa.ao',
  })
  @IsOptional()
  @IsUrl()
  issuer?: string;
}

class LdapSettingsDto {
  @ApiPropertyOptional() @IsOptional() @IsBoolean() enabled?: boolean;

  @ApiPropertyOptional({ example: 'ldaps://ad.empresa.ao:636' })
  @IsOptional()
  @Matches(/^ldaps?:\/\/\S+$/, { message: 'URL LDAP inválido (ex.: ldaps://ad.empresa.ao:636)' })
  url?: string; // file-url-exempt: URI de ligação ao servidor LDAP (ldaps://), não é referência a ficheiro

  @ApiPropertyOptional({ example: 'CN=innova-svc,OU=Service Accounts,DC=empresa,DC=ao' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  bindDn?: string;

  @ApiPropertyOptional({ description: 'Só é gravada se enviada; nunca é devolvida' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  bindPassword?: string;

  @ApiPropertyOptional({ example: 'DC=empresa,DC=ao' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  baseDn?: string;

  @ApiPropertyOptional({ description: '{{email}} é substituído pelo email introduzido no login' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  userFilter?: string;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(64) emailAttribute?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(64) nameAttribute?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() startTls?: boolean;
}

export class UpdateAuthSettingsDto {
  @ApiPropertyOptional() @IsOptional() @IsBoolean() ssoEnabled?: boolean;

  @ApiPropertyOptional({ enum: [...OIDC_PROVIDERS, null] })
  @IsOptional()
  @IsIn([...OIDC_PROVIDERS, null])
  ssoProvider?: 'GOOGLE' | 'MICROSOFT' | 'OIDC' | null;

  @ApiPropertyOptional({ type: OidcSettingsDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => OidcSettingsDto)
  oidc?: OidcSettingsDto;

  @ApiPropertyOptional({ type: LdapSettingsDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => LdapSettingsDto)
  ldap?: LdapSettingsDto;

  @ApiPropertyOptional({ description: 'Bloqueia o login por password para quem não seja ADMIN' })
  @IsOptional()
  @IsBoolean()
  enforceSsoOnly?: boolean;
}

export class LdapLoginDto {
  @ApiProperty() @IsEmail() email!: string;
  @ApiProperty() @IsString() @IsNotEmpty() password!: string;
}

// ─── §12 Email ────────────────────────────────────────────────────────────────

class EmailTemplateDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(255) subject?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(4000) body?: string;
}

class EmailTemplatesDto {
  @ApiPropertyOptional({ type: EmailTemplateDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => EmailTemplateDto)
  PASSWORD_RESET?: EmailTemplateDto;

  @ApiPropertyOptional({ type: EmailTemplateDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => EmailTemplateDto)
  USER_INVITE?: EmailTemplateDto;
}

export class UpdateEmailSettingsDto {
  @ApiPropertyOptional({ description: 'Acrescentada ao fim de todos os emails transaccionais' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  signature?: string;

  @ApiPropertyOptional({ type: EmailTemplatesDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => EmailTemplatesDto)
  templates?: EmailTemplatesDto;

  @ApiPropertyOptional({
    type: SmtpSettingsDto,
    description: 'Delegado para as definições de Integrações (§6)',
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => SmtpSettingsDto)
  smtp?: SmtpSettingsDto;
}

export class TestEmailTemplateDto {
  @ApiPropertyOptional({ enum: EMAIL_TEMPLATE_KEYS })
  @IsIn(EMAIL_TEMPLATE_KEYS)
  key!: 'PASSWORD_RESET' | 'USER_INVITE';

  @ApiPropertyOptional({ description: 'Destinatário do email de teste (por omissão, o do admin)' })
  @IsOptional()
  @IsEmail()
  to?: string;
}
