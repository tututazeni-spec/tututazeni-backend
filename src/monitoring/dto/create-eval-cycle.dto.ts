import {
  IsString,
  IsOptional,
  IsEnum,
  IsDateString,
  IsNumber,
  Min,
  Max,
  Length,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { EvalCycleType } from '@prisma/client';

export class CreateEvalCycleDto {
  @ApiProperty({ example: 'Avaliação Anual 2026' })
  @IsString()
  @Length(2, 150)
  name: string;

  @ApiPropertyOptional({ enum: EvalCycleType, default: 'ANNUAL' })
  @IsOptional()
  @IsEnum(EvalCycleType)
  type?: EvalCycleType;

  @ApiProperty()
  @IsDateString()
  startDate: string;

  @ApiProperty()
  @IsDateString()
  endDate: string;

  @ApiPropertyOptional({ default: 60, minimum: 0, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  passingScore?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;
}
