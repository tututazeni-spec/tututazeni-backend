import { IsString, IsOptional, IsDateString, IsEnum, Length } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PeriodType } from '@prisma/client';

export class CreatePeriodDto {
  @ApiProperty()
  @IsString()
  yearId: string;

  @ApiProperty({ example: '1º Semestre' })
  @IsString()
  @Length(2, 100)
  name: string;

  @ApiProperty()
  @IsDateString()
  startDate: string;

  @ApiProperty()
  @IsDateString()
  endDate: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  enrollmentStart?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  enrollmentEnd?: string;

  @ApiPropertyOptional({ enum: PeriodType, default: 'SEMESTER' })
  @IsOptional()
  @IsEnum(PeriodType)
  type?: PeriodType;
}
