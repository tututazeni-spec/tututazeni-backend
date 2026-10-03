import {
  IsString,
  IsOptional,
  IsEmail,
  IsEnum,
  IsNumber,
  IsArray,
  IsDateString,
  IsInt,
  Min,
  Max,
  Length,
  ValidateNested,
  ArrayMaxSize,
  IsBoolean,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  PartnerType,
  PartnerTier,
  PartnerStatus,
  PartnershipLevel,
  PartnershipKind,
  PartnerOrganizationSize,
  AngolaProvince,
} from '@prisma/client';
import { IsAllowedFileUrl } from '../../common/validators/is-allowed-file-url.validator';
import { CreatePartnerContactDto } from './create-partner-contact.dto';

export class CreatePartnerDto {
  @ApiProperty({ enum: PartnerType })
  @IsEnum(PartnerType)
  type: PartnerType;

  @ApiProperty({ example: 'EVOS Tecnologia Lda.' })
  @IsString()
  @Length(2, 200)
  name: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  legalName?: string;

  @ApiPropertyOptional({ enum: PartnerTier, default: 'STANDARD' })
  @IsOptional()
  @IsEnum(PartnerTier)
  tier?: PartnerTier;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  contactName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  contactTitle?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  mobile?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  website?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  linkedin?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  nif?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  address?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  city?: string;

  @ApiPropertyOptional({ enum: AngolaProvince })
  @IsOptional()
  @IsEnum(AngolaProvince)
  province?: AngolaProvince;

  @ApiPropertyOptional({ default: 'Angola' })
  @IsOptional()
  @IsString()
  country?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  contractStart?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  contractEnd?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  contractUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  annualValue?: number;

  @ApiPropertyOptional({ default: 'AOA' })
  @IsOptional()
  @IsString()
  currency?: string;

  @ApiPropertyOptional({
    description: 'Percentagem de partilha de receita',
    minimum: 0,
    maximum: 100,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  revenueSharing?: number;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  services?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  assignedToId?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  nextReviewAt?: string;

  // ─── ① Identificação ───────────────────────────────

  @ApiPropertyOptional({ enum: PartnerStatus, description: 'Por omissão ACTIVE' })
  @IsOptional()
  @IsEnum(PartnerStatus)
  status?: PartnerStatus;

  @ApiPropertyOptional({ description: 'Nome comercial' })
  @IsOptional()
  @IsString()
  commercialName?: string;

  @ApiPropertyOptional({ description: 'URL do logotipo' })
  @IsOptional()
  @IsString()
  @IsAllowedFileUrl()
  logoUrl?: string;

  @ApiPropertyOptional({ description: 'Data de registo' })
  @IsOptional()
  @IsDateString()
  registeredAt?: string;

  @ApiPropertyOptional({ description: 'Origem do parceiro (indicação, evento, contacto directo…)' })
  @IsOptional()
  @IsString()
  origin?: string;

  // ─── ② Dados institucionais ────────────────────────

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  municipality?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  postalCode?: string;

  @ApiPropertyOptional({ description: 'Sector de actividade' })
  @IsOptional()
  @IsString()
  sector?: string;

  @ApiPropertyOptional({ enum: PartnerOrganizationSize })
  @IsOptional()
  @IsEnum(PartnerOrganizationSize)
  organizationSize?: PartnerOrganizationSize;

  @ApiPropertyOptional({ description: 'Nº de colaboradores' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  employeeCount?: number;

  @ApiPropertyOptional({ example: 2010 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1800)
  @Max(2100)
  foundedYear?: number;

  @ApiPropertyOptional({ description: 'Tipo de organização (ex.: Lda., S.A., ONG)' })
  @IsOptional()
  @IsString()
  organizationType?: string;

  @ApiPropertyOptional({ description: 'Nº de identificação/registo empresarial' })
  @IsOptional()
  @IsString()
  registrationNumber?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  mission?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  areasOfActivity?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  segment?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  specializationArea?: string;

  @ApiPropertyOptional({ enum: PartnershipLevel })
  @IsOptional()
  @IsEnum(PartnershipLevel)
  partnershipLevel?: PartnershipLevel;

  // ─── ④ Tipo de parceria ────────────────────────────

  @ApiPropertyOptional({ enum: PartnershipKind, isArray: true })
  @IsOptional()
  @IsArray()
  @IsEnum(PartnershipKind, { each: true })
  partnershipTypes?: PartnershipKind[];

  // ─── ⑧ Financiamento ───────────────────────────────

  @ApiPropertyOptional({ description: 'O parceiro também financia iniciativas?', default: false })
  @IsOptional()
  @IsBoolean()
  isFunder?: boolean;

  // ─── ③ Contactos ───────────────────────────────────

  @ApiPropertyOptional({
    type: () => [CreatePartnerContactDto],
    description: 'Contactos iniciais; no máximo um com isPrimary=true',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => CreatePartnerContactDto)
  contacts?: CreatePartnerContactDto[];
}
