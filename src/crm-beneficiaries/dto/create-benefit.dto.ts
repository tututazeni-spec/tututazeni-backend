import { IsString, IsOptional, IsDateString, IsEnum, IsNumber, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { BenefitKind, BenefitStatus } from '@prisma/client';

export class CreateBenefitDto {
  @ApiProperty({ enum: BenefitKind })
  @IsEnum(BenefitKind)
  kind: BenefitKind;

  @ApiProperty()
  @IsString()
  name: string;

  @ApiPropertyOptional({ description: 'Valor do apoio' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  amount?: number;

  @ApiPropertyOptional({ default: 'AOA' })
  @IsOptional()
  @IsString()
  currency?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  awardedAt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  endDate?: string;

  @ApiPropertyOptional({ enum: BenefitStatus })
  @IsOptional()
  @IsEnum(BenefitStatus)
  status?: BenefitStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}

export class UpdateBenefitDto {
  @ApiPropertyOptional({ enum: BenefitStatus })
  @IsOptional()
  @IsEnum(BenefitStatus)
  status?: BenefitStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  endDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}
