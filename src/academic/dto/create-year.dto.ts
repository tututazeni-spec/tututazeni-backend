import {
  IsString,
  IsOptional,
  IsBoolean,
  IsDateString,
  IsEnum,
  Length,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AcademicYearStatus } from '@prisma/client';

export class CreateYearDto {
  @ApiProperty({ example: '2025/2026' })
  @IsString()
  @Length(4, 20)
  name: string;

  @ApiProperty()
  @IsDateString()
  startDate: string;

  @ApiProperty()
  @IsDateString()
  endDate: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  isCurrent?: boolean;

  @ApiPropertyOptional({ enum: AcademicYearStatus })
  @IsOptional()
  @IsEnum(AcademicYearStatus)
  status?: AcademicYearStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;
}
