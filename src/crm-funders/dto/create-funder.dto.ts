import {
  IsString,
  IsBoolean,
  IsNumber,
  IsOptional,
  IsEmail,
  IsEnum,
  IsArray,
  IsDateString,
  IsInt,
  Min,
  Max,
  Length,
  ValidateNested,
  ArrayMaxSize,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  FunderType,
  FunderThematicArea,
  FunderFundingType,
  FunderTargetGroup,
  PartnerOrganizationSize,
  AngolaProvince,
} from '@prisma/client';
import { IsAllowedFileUrl } from '../../common/validators/is-allowed-file-url.validator';
import { CreateFunderContactDto } from './create-funder-contact.dto';

export class CreateFunderDto {
  @ApiProperty({ enum: FunderType })
  @IsEnum(FunderType)
  type: FunderType;

  @ApiProperty({ example: 'União Europeia — Delegação Angola' })
  @IsString()
  @Length(2, 200)
  name: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  legalName?: string;

  @ApiPropertyOptional({ example: 'Bilateral' })
  @IsOptional()
  @IsString()
  category?: string;

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
  country?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  region?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  nif?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  relationshipStart?: string;

  @ApiPropertyOptional({ default: 'AOA' })
  @IsOptional()
  @IsString()
  currency?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  focusAreas?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  reportingReqs?: string;

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
  nextReportDue?: string;

  // ① Identificação

  @ApiPropertyOptional({ description: 'Nome comercial' })
  @IsOptional()
  @IsString()
  commercialName?: string;

  @ApiPropertyOptional({ description: 'URL do logotipo' })
  @IsOptional()
  @IsString()
  @IsAllowedFileUrl()
  logoUrl?: string;

  @ApiPropertyOptional({ description: 'Data de registo (por omissão, agora)' })
  @IsOptional()
  @IsDateString()
  registeredAt?: string;

  @ApiPropertyOptional({ description: 'Origem do financiador (ex.: indicação, evento)' })
  @IsOptional()
  @IsString()
  origin?: string;

  @ApiPropertyOptional({ description: 'Nº de registo institucional' })
  @IsOptional()
  @IsString()
  registrationNumber?: string;

  // ② Dados institucionais

  @ApiPropertyOptional({ enum: AngolaProvince })
  @IsOptional()
  @IsEnum(AngolaProvince)
  province?: AngolaProvince;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  municipality?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  address?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  sector?: string;

  @ApiPropertyOptional({ description: 'Tipo de organização' })
  @IsOptional()
  @IsString()
  organizationType?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1000)
  @Max(2100)
  foundedYear?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  employeeCount?: number;

  @ApiPropertyOptional({ enum: PartnerOrganizationSize })
  @IsOptional()
  @IsEnum(PartnerOrganizationSize)
  organizationSize?: PartnerOrganizationSize;

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

  @ApiPropertyOptional({ type: [String], description: 'Países/regiões onde financia' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  fundingCountries?: string[];

  @ApiPropertyOptional({ enum: FunderThematicArea, isArray: true })
  @IsOptional()
  @IsArray()
  @IsEnum(FunderThematicArea, { each: true })
  thematicAreas?: FunderThematicArea[];

  // ④ Perfil de financiamento

  @ApiPropertyOptional({ enum: FunderFundingType, isArray: true })
  @IsOptional()
  @IsArray()
  @IsEnum(FunderFundingType, { each: true })
  fundingTypes?: FunderFundingType[];

  @ApiPropertyOptional({ description: 'Valor mínimo habitual' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  typicalMinAmount?: number;

  @ApiPropertyOptional({ description: 'Valor máximo habitual' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  typicalMaxAmount?: number;

  @ApiPropertyOptional({ description: 'Duração típica do financiamento (meses)' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  typicalDurationMonths?: number;

  @ApiPropertyOptional({ description: 'Financia projectos?' })
  @IsOptional()
  @IsBoolean()
  fundsProjects?: boolean;

  @ApiPropertyOptional({ description: 'Financia programas?' })
  @IsOptional()
  @IsBoolean()
  fundsPrograms?: boolean;

  @ApiPropertyOptional({ description: 'Financia organizações?' })
  @IsOptional()
  @IsBoolean()
  fundsOrganizations?: boolean;

  @ApiPropertyOptional({ description: 'Financia pessoas/bolsas?' })
  @IsOptional()
  @IsBoolean()
  fundsIndividuals?: boolean;

  @ApiPropertyOptional({ description: 'Exige co-financiamento?' })
  @IsOptional()
  @IsBoolean()
  requiresCofinancing?: boolean;

  @ApiPropertyOptional({ description: 'Percentagem máxima financiável (0-100)' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  maxFundingPercentage?: number;

  @ApiPropertyOptional({ description: 'Contrapartida exigida' })
  @IsOptional()
  @IsString()
  counterpartRequirement?: string;

  // ⑤ Áreas e critérios de elegibilidade

  @ApiPropertyOptional({
    enum: FunderTargetGroup,
    isArray: true,
    description: 'Público-alvo financiável',
  })
  @IsOptional()
  @IsArray()
  @IsEnum(FunderTargetGroup, { each: true })
  eligibleTargetGroups?: FunderTargetGroup[];

  @ApiPropertyOptional({ type: [String], description: 'Localização geográfica elegível' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  eligibleLocations?: string[];

  @ApiPropertyOptional({ description: 'Idade mínima' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(150)
  eligibleMinAge?: number;

  @ApiPropertyOptional({ description: 'Idade máxima' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(150)
  eligibleMaxAge?: number;

  @ApiPropertyOptional({ description: 'Dimensão mínima do projecto' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  eligibleMinProjectSize?: number;

  @ApiPropertyOptional({ description: 'Dimensão máxima do projecto' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  eligibleMaxProjectSize?: number;

  @ApiPropertyOptional({ type: [String], description: 'Sectores elegíveis' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  eligibleSectors?: string[];

  @ApiPropertyOptional({ type: [String], description: 'Tipos de organização elegíveis' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  eligibleOrganizationTypes?: string[];

  @ApiPropertyOptional({ description: 'Prazo mínimo (meses)' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  eligibleMinDurationMonths?: number;

  @ApiPropertyOptional({ description: 'Prazo máximo (meses)' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  eligibleMaxDurationMonths?: number;

  @ApiPropertyOptional({ description: 'Requisitos de co-financiamento' })
  @IsOptional()
  @IsString()
  cofinancingCriteria?: string;

  @ApiPropertyOptional({ description: 'Outros critérios' })
  @IsOptional()
  @IsString()
  otherEligibilityCriteria?: string;

  // ③ Contactos (o primeiro é o principal se nenhum for marcado)

  @ApiPropertyOptional({ type: [CreateFunderContactDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => CreateFunderContactDto)
  contacts?: CreateFunderContactDto[];
}
