import {
  IsString,
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

  // ③ Contactos (o primeiro é o principal se nenhum for marcado)

  @ApiPropertyOptional({ type: [CreateFunderContactDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => CreateFunderContactDto)
  contacts?: CreateFunderContactDto[];
}
