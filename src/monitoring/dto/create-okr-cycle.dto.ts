import {
  IsString,
  IsOptional,
  IsEnum,
  IsDateString,
  Length,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { OkrType } from '@prisma/client';

export class CreateOkrCycleDto {
  @ApiProperty({ example: 'Q2 2026' })
  @IsString()
  @Length(2, 100)
  name: string;

  @ApiPropertyOptional({ enum: OkrType, default: 'QUARTERLY' })
  @IsOptional()
  @IsEnum(OkrType)
  type?: OkrType;

  @ApiProperty()
  @IsDateString()
  startDate: string;

  @ApiProperty()
  @IsDateString()
  endDate: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;
}
