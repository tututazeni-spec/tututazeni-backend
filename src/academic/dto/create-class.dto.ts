import {
  IsString,
  IsOptional,
  IsEnum,
  IsInt,
  IsDateString,
  Min,
  Length,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ClassModality } from '@prisma/client';

export class CreateClassDto {
  @ApiProperty()
  @IsString()
  programId: string;

  @ApiProperty({ example: 'Turma A — 2026' })
  @IsString()
  @Length(2, 100)
  name: string;

  @ApiPropertyOptional({ description: 'ID (Int) do instrutor' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  instructorId?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  maxStudents?: number;

  @ApiProperty()
  @IsDateString()
  startDate: string;

  @ApiProperty()
  @IsDateString()
  endDate: string;

  @ApiPropertyOptional({ enum: ClassModality, default: 'ONLINE' })
  @IsOptional()
  @IsEnum(ClassModality)
  modality?: ClassModality;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  location?: string;

  @ApiPropertyOptional({ example: 'Seg/Qua 09:00-11:00' })
  @IsOptional()
  @IsString()
  schedule?: string;
}
