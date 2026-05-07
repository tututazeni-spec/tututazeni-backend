// src/competencies/competencies.dto.ts
import {
  IsString, IsOptional, IsInt, IsArray, IsBoolean,
  IsEnum, Min, Max, MaxLength, IsNumber,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';

// ─── Enums ────────────────────────────────────────────────────────────────────

export enum CompetencyCategory {
  HARD_SKILL  = 'HARD_SKILL',
  SOFT_SKILL  = 'SOFT_SKILL',
  LANGUAGE    = 'LANGUAGE',
  TOOL        = 'TOOL',
  LEADERSHIP  = 'LEADERSHIP',
}

export enum CompetencyStatus {
  ACTIVE   = 'ACTIVE',
  INACTIVE = 'INACTIVE',
}

export enum CompetencySource {
  MANUAL     = 'MANUAL',
  COURSE     = 'COURSE',
  ASSESSMENT = 'ASSESSMENT',
  MANAGER    = 'MANAGER',
  HRIS       = 'HRIS',
}

export enum MappingPriority {
  MANDATORY = 'MANDATORY',
  OPTIONAL  = 'OPTIONAL',
}

// ─── Competency ───────────────────────────────────────────────────────────────

export class CreateCompetencyDto {
  @ApiProperty({ example: 'Comunicação Eficaz' })
  @IsString() @MaxLength(120)
  name!: string;

  @ApiPropertyOptional()
  @IsOptional() @IsString()
  description?: string;

  @ApiProperty({ enum: CompetencyCategory })
  @IsEnum(CompetencyCategory)
  category!: CompetencyCategory;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional() @IsArray() @IsString({ each: true })
  tags?: string[];

  @ApiPropertyOptional({ enum: CompetencyStatus, default: CompetencyStatus.ACTIVE })
  @IsOptional() @IsEnum(CompetencyStatus)
  status?: CompetencyStatus;
}

export class UpdateCompetencyDto extends PartialType(CreateCompetencyDto) {}

// ─── Proficiency Level ────────────────────────────────────────────────────────

export class CreateProficiencyLevelDto {
  @ApiProperty() @IsInt()
  competencyId!: number;

  @ApiProperty({ example: 'Básico' }) @IsString()
  name!: string;

  @ApiProperty({ description: 'Escala 1-5' }) @IsInt() @Min(1) @Max(5)
  value!: number;

  @ApiPropertyOptional({ description: 'Âncoras comportamentais' })
  @IsOptional() @IsString()
  description?: string;
}

// ─── User Competency ──────────────────────────────────────────────────────────

export class UpsertUserCompetencyDto {
  @ApiProperty() @IsInt()
  userId!: number;

  @ApiProperty() @IsInt()
  competencyId!: number;

  @ApiProperty({ description: 'Nível actual (1-5)' }) @IsInt() @Min(1) @Max(5)
  currentLevel!: number;

  @ApiPropertyOptional({ description: 'Nível alvo (1-5)' })
  @IsOptional() @IsInt() @Min(1) @Max(5)
  targetLevel?: number;

  @ApiProperty({ enum: CompetencySource })
  @IsEnum(CompetencySource)
  source!: CompetencySource;

  @ApiPropertyOptional()
  @IsOptional() @IsString()
  notes?: string;

  @ApiPropertyOptional({ description: 'URL de evidência (certificado, link, etc.)' })
  @IsOptional() @IsString()
  evidenceUrl?: string;
}

// ─── Autoavaliação ────────────────────────────────────────────────────────────

export class SelfAssessmentDto {
  @ApiProperty() @IsInt()
  competencyId!: number;

  @ApiProperty() @IsInt() @Min(1) @Max(5)
  selfLevel!: number;

  @ApiPropertyOptional() @IsOptional() @IsString()
  notes?: string;

  @ApiPropertyOptional() @IsOptional() @IsString()
  evidenceUrl?: string;
}

// ─── Avaliação do gestor ──────────────────────────────────────────────────────

export class ManagerAssessmentDto {
  @ApiProperty({ description: 'ID do colaborador avaliado' }) @IsInt()
  userId!: number;

  @ApiProperty() @IsInt()
  competencyId!: number;

  @ApiProperty() @IsInt() @Min(1) @Max(5)
  managerLevel!: number;

  @ApiPropertyOptional() @IsOptional() @IsString()
  feedback?: string;
}

// ─── Role / Position mapping ──────────────────────────────────────────────────

export class MapCompetencyToPositionDto {
  @ApiProperty() @IsInt()
  positionId!: number;

  @ApiProperty() @IsInt()
  competencyId!: number;

  @ApiProperty({ description: 'Nível requerido (1-5)' }) @IsInt() @Min(1) @Max(5)
  requiredLevel!: number;

  @ApiProperty({ enum: MappingPriority })
  @IsEnum(MappingPriority)
  priority!: MappingPriority;

  @ApiPropertyOptional({ description: 'Peso no desempenho (0-100)' })
  @IsOptional() @IsNumber() @Min(0) @Max(100)
  weight?: number;
}

export class MapCompetencyToCourseDto {
  @ApiProperty() @IsInt()
  courseId!: number;

  @ApiProperty() @IsInt()
  competencyId!: number;

  @ApiPropertyOptional({ description: 'Nível que o curso desenvolve' })
  @IsOptional() @IsInt() @Min(1) @Max(5)
  levelGained?: number;
}

// ─── Filter ───────────────────────────────────────────────────────────────────

export class CompetencyFilterDto {
  @ApiPropertyOptional() @IsOptional() @IsString()
  search?: string;

  @ApiPropertyOptional({ enum: CompetencyCategory })
  @IsOptional() @IsEnum(CompetencyCategory)
  category?: CompetencyCategory;

  @ApiPropertyOptional({ enum: CompetencyStatus })
  @IsOptional() @IsEnum(CompetencyStatus)
  status?: CompetencyStatus;

  @ApiPropertyOptional() @IsOptional() @IsString()
  tag?: string;

  @ApiPropertyOptional({ default: 1 }) @IsOptional() @IsInt() @Min(1) @Type(() => Number)
  page?: number;

  @ApiPropertyOptional({ default: 20 }) @IsOptional() @IsInt() @Min(1) @Type(() => Number)
  limit?: number;
}

// ─── Endorsement ─────────────────────────────────────────────────────────────

export class CreateEndorsementDto {
  @ApiProperty({ description: 'ID do utilizador endossado' }) @IsInt()
  targetUserId!: number;

  @ApiProperty() @IsInt()
  competencyId!: number;

  @ApiPropertyOptional() @IsOptional() @IsString()
  comment?: string;
}