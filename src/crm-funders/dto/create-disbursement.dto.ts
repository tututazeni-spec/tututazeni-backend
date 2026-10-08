import { IsNumber, IsOptional, IsString, IsDateString, IsEnum, IsInt, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { DisbursementStatus } from '@prisma/client';

export class CreateDisbursementDto {
  @ApiProperty()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  amount: number;

  @ApiPropertyOptional({ default: 'AOA' })
  @IsOptional()
  @IsString()
  currency?: string;

  @ApiPropertyOptional({ description: 'Nº da parcela (automático se omitido)' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  installmentNumber?: number;

  @ApiPropertyOptional({ description: 'Data prevista' })
  @IsOptional()
  @IsDateString()
  expectedDate?: string;

  @ApiPropertyOptional({ description: 'Data efectiva de recebimento' })
  @IsOptional()
  @IsDateString()
  receivedAt?: string;

  @ApiPropertyOptional({
    enum: DisbursementStatus,
    description: 'Omitido: RECEIVED se houver data efectiva, senão PREDICTED',
  })
  @IsOptional()
  @IsEnum(DisbursementStatus)
  status?: DisbursementStatus;

  @ApiPropertyOptional({ description: 'URL do comprovativo' })
  @IsOptional()
  @IsString()
  proofUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  reference?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  bankRef?: string;

  @ApiPropertyOptional({ description: 'Observações' })
  @IsOptional()
  @IsString()
  notes?: string;
}

export class UpdateDisbursementDto extends PartialType(CreateDisbursementDto) {}
