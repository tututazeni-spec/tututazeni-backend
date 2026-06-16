import {
  IsString,
  IsOptional,
  IsEnum,
  IsInt,
  IsNumber,
  IsBoolean,
  IsArray,
  Min,
  Max,
  Length,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ProgramLevel } from '@prisma/client';

export class CreateProgramDto {
  @ApiProperty({ example: 'PROG-001' })
  @IsString()
  @Length(2, 50)
  code: string;

  @ApiProperty({ example: 'Liderança e Gestão de Equipas' })
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
  category?: string;

  @ApiPropertyOptional({ enum: ProgramLevel, default: 'BASIC' })
  @IsOptional()
  @IsEnum(ProgramLevel)
  level?: ProgramLevel;

  @ApiProperty({ example: 40 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  durationHours: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  maxStudents?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  minStudents?: number;

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
  certificateType?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  yearId?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  prerequisites?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  courseIds?: string[];

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  isMandatory?: boolean;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  targetRoles?: string[];
}
