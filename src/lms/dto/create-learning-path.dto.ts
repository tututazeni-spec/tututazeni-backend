import {
  IsString,
  IsOptional,
  IsEnum,
  IsInt,
  IsBoolean,
  IsArray,
  Min,
  Length,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PathLevel } from '@prisma/client';

export class CreateLearningPathDto {
  @ApiProperty({ example: 'PATH-001' })
  @IsString()
  @Length(2, 50)
  code: string;

  @ApiProperty({ example: 'Percurso de Liderança' })
  @IsString()
  @Length(2, 200)
  name: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  thumbnail?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  targetRoles?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  skills?: string[];

  @ApiProperty({ type: [String], description: 'IDs dos cursos do percurso' })
  @IsArray()
  @IsString({ each: true })
  courseIds: string[];

  @ApiPropertyOptional({ type: [String], description: 'Ordem dos cursos' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  courseOrder?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  estimatedHours?: number;

  @ApiPropertyOptional({ enum: PathLevel, default: 'BASIC' })
  @IsOptional()
  @IsEnum(PathLevel)
  level?: PathLevel;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  isFeatured?: boolean;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  isMandatory?: boolean;
}
