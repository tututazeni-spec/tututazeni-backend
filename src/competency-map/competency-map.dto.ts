// ─── src/competency-map/competency-map.dto.ts ─────────────────────────────────
import {
  IsString,
  IsInt,
  IsOptional,
  IsEnum,
  IsBoolean,
  IsNumber,
  IsArray,
  ValidateNested,
  Min,
  Max,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';

// ─── Enums ────────────────────────────────────────────────────────────────────

export enum SkillType {
  TECHNICAL = 'TECHNICAL',
  BEHAVIORAL = 'BEHAVIORAL',
  LEADERSHIP = 'LEADERSHIP',
  LANGUAGE = 'LANGUAGE',
  CERTIFICATION = 'CERTIFICATION',
}

export enum AssessmentSource {
  SELF = 'SELF',
  MANAGER = 'MANAGER',
  HR = 'HR',
  PEER_360 = 'PEER_360',
  TEST = 'TEST',
  PROJECT = 'PROJECT',
  CERTIFICATION = 'CERTIFICATION',
  COURSE = 'COURSE',
}

export enum GapPriority {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
}

// ─── Skill Categories ─────────────────────────────────────────────────────────

export class CreateSkillCategoryDto {
  @ApiProperty() @IsString() name!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() family?: string; // Família (topo da taxonomia)
  @ApiPropertyOptional() @IsOptional() @IsString() domain?: string; // Domínio (nível intermédio)
  @ApiPropertyOptional() @IsOptional() @IsBoolean() active?: boolean;
}

// ─── Skills / Competencies ────────────────────────────────────────────────────

export class CreateSkillMapDto {
  @ApiProperty() @IsString() name!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
  @ApiProperty() @IsEnum(SkillType) type!: SkillType;
  @ApiPropertyOptional() @IsOptional() @IsInt() categoryId?: number;
  @ApiPropertyOptional() @IsOptional() @IsArray() @IsString({ each: true }) tags?: string[];
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) @Max(1) strategicWeight?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() maxLevel?: number; // 5 por defeito
  @ApiPropertyOptional() @IsOptional() @IsBoolean() active?: boolean;
}

export class UpdateSkillDto extends PartialType(CreateSkillMapDto) {}

// ─── Proficiency Levels ───────────────────────────────────────────────────────

export class CreateSkillProficiencyLevelDto {
  @ApiProperty() @IsInt() skillId!: number;
  @ApiProperty() @IsInt() @Min(1) @Max(10) level!: number;
  @ApiProperty() @IsString() name!: string; // Ex: "Iniciante", "Avançado"
  @ApiProperty() @IsString() description!: string;
  @ApiProperty() @IsString() observableBehavior!: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() expectedMonths?: number; // tempo médio para atingir
}

// ─── Role Skill Matrix ────────────────────────────────────────────────────────

export class RoleSkillEntryDto {
  @ApiProperty() @IsInt() skillId!: number;
  @ApiProperty() @IsInt() @Min(1) @Max(5) requiredLevel!: number;
  @ApiProperty() @IsNumber() @Min(0) @Max(1) weight!: number;
  @ApiProperty() @IsBoolean() mandatory!: boolean;
}

export class SetRoleSkillMatrixDto {
  @ApiProperty() @IsString() roleCode!: string; // código único do cargo
  @ApiPropertyOptional() @IsOptional() @IsString() department?: string;
  @ApiProperty({ type: [RoleSkillEntryDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RoleSkillEntryDto)
  skills!: RoleSkillEntryDto[];
}

// ─── Employee Skills (Assessment) ─────────────────────────────────────────────

export class UpsertEmployeeSkillDto {
  @ApiProperty() @IsInt() userId!: number;
  @ApiProperty() @IsInt() skillId!: number;
  @ApiProperty() @IsInt() @Min(0) @Max(5) currentLevel!: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) @Max(5) targetLevel?: number;
  @ApiProperty() @IsEnum(AssessmentSource) source!: AssessmentSource;
  @ApiPropertyOptional() @IsOptional() @IsInt() assessedById?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() evidenceUrl?: string; // certificado, link de projecto
  @ApiPropertyOptional() @IsOptional() @IsBoolean() managerValidated?: boolean;
}

// ─── Batch Assessment ─────────────────────────────────────────────────────────

export class BatchAssessmentItemDto {
  @ApiProperty() @IsInt() skillId!: number;
  @ApiProperty() @IsInt() @Min(0) @Max(5) currentLevel!: number;
  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string;
}

export class BatchAssessmentDto {
  @ApiProperty() @IsInt() userId!: number;
  @ApiProperty() @IsEnum(AssessmentSource) source!: AssessmentSource;
  @ApiPropertyOptional() @IsOptional() @IsInt() assessedById?: number;
  @ApiProperty({ type: [BatchAssessmentItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BatchAssessmentItemDto)
  assessments!: BatchAssessmentItemDto[];
}

// ─── Filters ──────────────────────────────────────────────────────────────────

export class SkillFilterDto {
  @ApiPropertyOptional() @IsOptional() @IsString() search?: string;
  @ApiPropertyOptional() @IsOptional() @IsEnum(SkillType) type?: SkillType;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Type(() => Number) categoryId?: number;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() @Type(() => Boolean) active?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Type(() => Number) page?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Type(() => Number) limit?: number;
}

export class GapAnalysisFilterDto {
  @ApiPropertyOptional() @IsOptional() @IsString() department?: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Type(() => Number) userId?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() roleCode?: string;
  @ApiPropertyOptional() @IsOptional() @IsEnum(GapPriority) priority?: GapPriority;
  @ApiPropertyOptional() @IsOptional() @IsEnum(SkillType) skillType?: SkillType;
}
