import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { RequirementCategory } from '@prisma/client';

export class CreatePositionRequirementDto {
  @ApiProperty({ enum: RequirementCategory })
  @IsEnum(RequirementCategory)
  category!: RequirementCategory;

  @ApiProperty({ description: 'Curso, idioma ou certificação' })
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  title!: string;

  @ApiPropertyOptional({ description: 'Grau académico (ACADEMIC) ou nível CEFR (LANGUAGE)' })
  @IsOptional()
  @IsString()
  level?: string;

  @ApiPropertyOptional({ description: 'Anos mínimos (EXPERIENCE)' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(60)
  minYears?: number;

  @ApiPropertyOptional({ description: 'Obrigatório (true) ou diferencial (false)', default: true })
  @IsOptional()
  @IsBoolean()
  mandatory?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}

export class UpdatePositionRequirementDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  title?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  level?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(60)
  minYears?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  mandatory?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}
