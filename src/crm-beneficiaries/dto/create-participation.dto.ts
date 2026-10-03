import { IsString, IsOptional, IsDateString, IsEnum, IsNumber, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AngolaProvince, ParticipationStatus } from '@prisma/client';

export class CreateParticipationDto {
  @ApiProperty()
  @IsString()
  program: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  project?: string;

  @ApiPropertyOptional({ enum: AngolaProvince })
  @IsOptional()
  @IsEnum(AngolaProvince)
  province?: AngolaProvince;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  municipality?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  locality?: string;

  @ApiPropertyOptional({ description: 'Turma' })
  @IsOptional()
  @IsString()
  cohort?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  programEdition?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  enrolledAt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  completedAt?: string;

  @ApiPropertyOptional({ enum: ParticipationStatus })
  @IsOptional()
  @IsEnum(ParticipationStatus)
  status?: ParticipationStatus;

  @ApiPropertyOptional({ description: 'Presença (%)', minimum: 0, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  attendanceRate?: number;

  @ApiPropertyOptional({ description: 'Aproveitamento' })
  @IsOptional()
  @IsString()
  performance?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  certification?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  employability?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  referral?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  finalResult?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  impact?: string;
}

export class UpdateParticipationDto extends CreateParticipationDto {}
