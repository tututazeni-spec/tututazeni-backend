import {
  IsString,
  IsOptional,
  IsDateString,
  IsNumber,
  IsArray,
  Min,
  Length,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional, PartialType, OmitType } from '@nestjs/swagger';

export class CreatePartnerFunderLinkDto {
  @ApiProperty({ description: 'Funder.id (CRM → Funders)' })
  @IsString()
  funderId: string;

  @ApiPropertyOptional({ type: [String], description: 'Programas financiados' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  fundedPrograms?: string[];

  @ApiPropertyOptional()
  @IsOptional()
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

// O Funder associado não muda: remove-se a ligação e cria-se outra.
export class UpdatePartnerFunderLinkDto extends PartialType(
  OmitType(CreatePartnerFunderLinkDto, ['funderId'] as const),
) {}
