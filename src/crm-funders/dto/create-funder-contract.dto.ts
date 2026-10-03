import {
  IsString,
  IsOptional,
  IsEnum,
  IsDateString,
  IsInt,
  IsNumber,
  Min,
  Length,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { FunderContractRenewal, FunderContractStatus, FunderContractType } from '@prisma/client';

export class CreateFunderContractDto {
  @ApiProperty({ enum: FunderContractType })
  @IsEnum(FunderContractType)
  type: FunderContractType;

  @ApiPropertyOptional({ description: 'Financiamento a que o contrato respeita (FundingGrant.id)' })
  @IsOptional()
  @IsString()
  grantId?: string;

  @ApiPropertyOptional({ example: 'CT-2026/014' })
  @IsOptional()
  @IsString()
  @Length(1, 100)
  contractNumber?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  signedAt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  endDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  amount?: number;

  @ApiPropertyOptional({ default: 'AOA' })
  @IsOptional()
  @IsString()
  currency?: string;

  @ApiPropertyOptional({ description: 'Responsável interno (User.id)' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  responsibleId?: number;

  @ApiPropertyOptional({ description: 'Responsável do financiador (FunderContact.id)' })
  @IsOptional()
  @IsString()
  funderContactId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  conditions?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  obligations?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  relevantClauses?: string;

  @ApiPropertyOptional({ enum: FunderContractRenewal, default: 'NONE' })
  @IsOptional()
  @IsEnum(FunderContractRenewal)
  renewalType?: FunderContractRenewal;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  renewalNotes?: string;

  @ApiPropertyOptional({ enum: FunderContractStatus, default: 'DRAFT' })
  @IsOptional()
  @IsEnum(FunderContractStatus)
  status?: FunderContractStatus;
}

export class UpdateFunderContractDto extends PartialType(CreateFunderContractDto) {}
