import {
  IsString,
  IsOptional,
  IsEnum,
  IsDateString,
  IsNumber,
  IsArray,
  Min,
  Length,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional, PartialType, OmitType } from '@nestjs/swagger';
import { FunderPartnerRelationType } from '@prisma/client';

// ⑭ Funder ↔ Parceiro ↔ Programa/Projecto (consórcios e co-financiamento)
export class CreateFunderPartnerLinkDto {
  @ApiProperty({ description: 'Partner.id (CRM → Parceiros)' })
  @IsString()
  partnerId: string;

  @ApiPropertyOptional({ description: 'FunderProgram.id do mesmo financiador' })
  @IsOptional()
  @IsString()
  programId?: string;

  @ApiPropertyOptional({ enum: FunderPartnerRelationType, default: 'OTHER' })
  @IsOptional()
  @IsEnum(FunderPartnerRelationType)
  relationType?: FunderPartnerRelationType;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  fundedPrograms?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  amountFunded?: number;

  @ApiPropertyOptional({ default: 'AOA' })
  @IsOptional()
  @IsString()
  @Length(3, 3)
  currency?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  periodStart?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  periodEnd?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}

// O parceiro associado não muda: remove-se a ligação e cria-se outra.
export class UpdateFunderPartnerLinkDto extends PartialType(
  OmitType(CreateFunderPartnerLinkDto, ['partnerId'] as const),
) {}

export class FilterFunderBeneficiaryDto {
  @ApiPropertyOptional({ description: 'Nome do programa (FunderProgram.program)' })
  @IsOptional()
  @IsString()
  program?: string;

  @ApiPropertyOptional({ description: 'Nome do projecto (FunderProgram.project)' })
  @IsOptional()
  @IsString()
  project?: string;
}
