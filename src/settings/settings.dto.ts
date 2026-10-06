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
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { EmptyStringToUndefined } from '../common/transformers/empty-string-to-undefined';
import { POLICY_REQUIRED_FIELD_OPTIONS } from './user-policy';

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
