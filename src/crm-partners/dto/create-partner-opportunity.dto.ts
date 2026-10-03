import {
  IsString,
  IsOptional,
  IsEnum,
  IsDateString,
  IsInt,
  IsNumber,
  Min,
  Max,
  Length,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { PartnerOpportunityStatus, PartnershipKind } from '@prisma/client';

export class CreatePartnerOpportunityDto {
  @ApiProperty()
  @IsString()
  name: string;

  @ApiPropertyOptional({ description: 'Programa/projecto (texto livre, como em PartnerProgram)' })
  @IsOptional()
  @IsString()
  program?: string;

  @ApiPropertyOptional({ enum: PartnershipKind })
  @IsOptional()
  @IsEnum(PartnershipKind)
  partnershipType?: PartnershipKind;

  @ApiPropertyOptional({ description: 'User.id do responsável interno' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  responsibleId?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  potentialValue?: number;

  @ApiPropertyOptional({ default: 'AOA' })
  @IsOptional()
  @IsString()
  @Length(3, 3)
  currency?: string;

  @ApiPropertyOptional({ description: 'Probabilidade interna 0-100' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100)
  probability?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  expectedDate?: string;

  @ApiPropertyOptional({ enum: PartnerOpportunityStatus, default: 'IDENTIFIED' })
  @IsOptional()
  @IsEnum(PartnerOpportunityStatus)
  status?: PartnerOpportunityStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}

export class UpdatePartnerOpportunityDto extends PartialType(CreatePartnerOpportunityDto) {}
