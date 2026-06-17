import { IsString, IsOptional, IsEnum, IsNumber, IsArray, Length } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IndicatorFrequency } from '@prisma/client';

export class CreateIndicatorDto {
  @ApiProperty({ example: 'IND-001' })
  @IsString()
  @Length(2, 50)
  code: string;

  @ApiProperty({ example: 'Taxa de Conclusão de Cursos' })
  @IsString()
  @Length(2, 200)
  name: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ example: '%' })
  @IsOptional()
  @IsString()
  unit?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  formula?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  baseline?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  target?: number;

  @ApiPropertyOptional({ enum: IndicatorFrequency, default: 'MONTHLY' })
  @IsOptional()
  @IsEnum(IndicatorFrequency)
  frequency?: IndicatorFrequency;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  responsible?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];
}
