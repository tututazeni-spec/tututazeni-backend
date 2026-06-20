// src/instructor/instructor.dto.ts
import {
  IsString,
  IsOptional,
  IsBoolean,
  IsInt,
  IsNumber,
  IsEnum,
  IsArray,
  IsDateString,
  Min,
  Max,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';

// ─── Enums ────────────────────────────────────────────────────────────────────

export enum InstructorType {
  MASTER = 'MASTER',
  SENIOR = 'SENIOR',
  STANDARD = 'STANDARD',
  MENTOR = 'MENTOR',
  EXTERNAL = 'EXTERNAL',
}

export enum CohortModalidade {
  ONLINE = 'ONLINE',
  PRESENCIAL = 'PRESENCIAL',
  HYBRID = 'HYBRID',
}

export enum CohortStatus {
  DRAFT = 'DRAFT',
  OPEN = 'OPEN',
  ACTIVE = 'ACTIVE',
  CLOSED = 'CLOSED',
  CANCELLED = 'CANCELLED',
}

// ─── Profile ──────────────────────────────────────────────────────────────────

export class CreateInstructorProfileDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  bio?: string;

  @ApiProperty()
  @IsString()
  @MaxLength(200)
  expertiseArea!: string;

  @ApiPropertyOptional({ enum: InstructorType, default: InstructorType.STANDARD })
  @IsOptional()
  @IsEnum(InstructorType)
  instructorType?: InstructorType;

  @ApiPropertyOptional({ description: 'Especialidades adicionais' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  specialties?: string[];

  @ApiPropertyOptional({ description: 'Certificações do instrutor' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  certifications?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  linkedinUrl?: string;

  @ApiPropertyOptional({ description: 'Valor hora (instrutores externos)' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  hourlyRate?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  availableForMentoring?: boolean;
}

export class UpdateInstructorProfileDto extends PartialType(CreateInstructorProfileDto) {}

// ─── Cohort ───────────────────────────────────────────────────────────────────

export class CreateCohortDto {
  @ApiProperty()
  @IsString()
  @MaxLength(200)
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ description: 'ID do curso associado' })
  @IsInt()
  courseId!: number;

  @ApiPropertyOptional({ enum: CohortModalidade, default: CohortModalidade.ONLINE })
  @IsOptional()
  @IsEnum(CohortModalidade)
  modalidade?: CohortModalidade;

  @ApiPropertyOptional({ default: 30 })
  @IsOptional()
  @IsInt()
  @Min(1)
  maxParticipants?: number;

  @ApiProperty()
  @IsDateString()
  startDate!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  endDate?: string;

  @ApiPropertyOptional({ description: 'IDs de utilizadores a inscrever' })
  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  participantIds?: number[];
}

export class UpdateCohortDto extends PartialType(CreateCohortDto) {
  @ApiPropertyOptional({ enum: CohortStatus })
  @IsOptional()
  @IsEnum(CohortStatus)
  status?: CohortStatus;
}

export class InstructorAddParticipantsDto {
  @ApiProperty({ type: [Number] })
  @IsArray()
  @IsInt({ each: true })
  userIds!: number[];
}

// ─── Review ───────────────────────────────────────────────────────────────────

export class InstructorReviewDto {
  @ApiProperty()
  @IsInt()
  instructorId!: number;

  @ApiProperty({ minimum: 1, maximum: 5 })
  @IsInt()
  @Min(1)
  @Max(5)
  rating!: number;

  @ApiProperty()
  @IsString()
  @MaxLength(1000)
  comment!: string;
}

// ─── Marketplace ──────────────────────────────────────────────────────────────

export class CreateMarketplaceCourseDto {
  @ApiProperty()
  @IsString()
  @MaxLength(200)
  title!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty()
  @IsNumber()
  @Min(0)
  price!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  level?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  workloadHours?: number;
}

// ─── Filters ──────────────────────────────────────────────────────────────────

export class InstructorFilterDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  approved?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ enum: InstructorType })
  @IsOptional()
  @IsEnum(InstructorType)
  instructorType?: InstructorType;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  page?: number;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  limit?: number;
}

export class CohortFilterDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  courseId?: number;

  @ApiPropertyOptional({ enum: CohortStatus })
  @IsOptional()
  @IsEnum(CohortStatus)
  status?: CohortStatus;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  page?: number;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  limit?: number;
}
