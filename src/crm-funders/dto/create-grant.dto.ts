import {
  IsString,
  IsOptional,
  IsNumber,
  IsDateString,
  IsArray,
  IsEnum,
  Min,
  Length,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { FunderFundingType, GrantStatus } from '@prisma/client';

export class CreateGrantDto {
  @ApiProperty()
  @IsString()
  @Length(2, 200)
  title: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  amount: number;

  @ApiPropertyOptional({ default: 'AOA' })
  @IsOptional()
  @IsString()
  currency?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  exchangeRate?: number;

  @ApiProperty()
  @IsDateString()
  startDate: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  endDate?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  objectives?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  conditions?: string;

  @ApiPropertyOptional({ default: 'quarterly' })
  @IsOptional()
  @IsString()
  reportingCycle?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  nextReportDue?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  programIds?: string[];

  @ApiPropertyOptional({ enum: FunderFundingType })
  @IsOptional()
  @IsEnum(FunderFundingType)
  fundingType?: FunderFundingType;

  @ApiPropertyOptional({ description: 'Programa/projecto financiado (FunderProgram.id)' })
  @IsOptional()
  @IsString()
  programId?: string;

  @ApiPropertyOptional({ description: 'Valor solicitado' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  requestedAmount?: number;

  @ApiPropertyOptional({ description: 'Valor utilizado' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  usedAmount?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  approvalDate?: string;

  @ApiPropertyOptional({ enum: GrantStatus, default: 'ACTIVE' })
  @IsOptional()
  @IsEnum(GrantStatus)
  status?: GrantStatus;
}

export class UpdateGrantDto extends PartialType(CreateGrantDto) {}
