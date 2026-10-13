import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { AcademicDegree, CefrLevel } from '@prisma/client';

export class QualificationDto {
  @ApiProperty({ enum: AcademicDegree })
  @IsEnum(AcademicDegree)
  degree!: AcademicDegree;

  @ApiProperty()
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  course!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  institution?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1950)
  @Max(2100)
  year?: number;
}

export class LanguageDto {
  @ApiProperty()
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  language!: string;

  @ApiProperty({ enum: CefrLevel })
  @IsEnum(CefrLevel)
  level!: CefrLevel;
}

export class ExternalCertificationDto {
  @ApiProperty()
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  issuer?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  issuedAt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  expiresAt?: string;
}

export class ExperienceDto {
  @ApiProperty({ description: 'Anos de experiência profissional anterior à empresa' })
  @IsNumber()
  @Min(0)
  @Max(60)
  priorExperienceYears!: number;
}
