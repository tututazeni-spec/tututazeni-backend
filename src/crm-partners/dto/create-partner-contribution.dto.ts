import { IsString, IsOptional, IsEnum, IsDateString, IsNumber, Min, Length } from 'class-validator';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { PartnerContributionType, PartnerContributionPeriodicity } from '@prisma/client';

export class CreatePartnerContributionDto {
  @ApiProperty({ enum: PartnerContributionType })
  @IsEnum(PartnerContributionType)
  type: PartnerContributionType;

  @ApiPropertyOptional({ description: 'PartnerProgram.id a que a contribuição se destina' })
  @IsOptional()
  @IsString()
  programId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  quantity?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  estimatedValue?: number;

  @ApiPropertyOptional({ default: 'AOA' })
  @IsOptional()
  @IsString()
  @Length(3, 3)
  currency?: string;

  @ApiPropertyOptional({ enum: PartnerContributionPeriodicity, default: 'ONE_TIME' })
  @IsOptional()
  @IsEnum(PartnerContributionPeriodicity)
  periodicity?: PartnerContributionPeriodicity;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  endDate?: string;
}

export class UpdatePartnerContributionDto extends PartialType(CreatePartnerContributionDto) {}
