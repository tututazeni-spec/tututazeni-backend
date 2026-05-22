// ─── src/career-plans/career-plans.dto.ts ────────────────────────────────────
import {
  IsString,
  IsInt,
  IsOptional,
  IsEnum,
  IsDateString,
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

export enum CareerPlanStatus {
  DRAFT = 'DRAFT',
  ACTIVE = 'ACTIVE',
  COMPLETED = 'COMPLETED',
  PAUSED = 'PAUSED',
  ARCHIVED = 'ARCHIVED',
}

export enum CareerPathType {
  LINEAR = 'LINEAR', // Vertical
  Y_SHAPED = 'Y_SHAPED', // Gestão vs Especialista
  W_SHAPED = 'W_SHAPED', // Múltiplos caminhos
  HORIZONTAL = 'HORIZONTAL', // Mobilidade lateral
  HYBRID = 'HYBRID',
}

export enum SkillType {
  TECHNICAL = 'TECHNICAL',
  BEHAVIORAL = 'BEHAVIORAL',
  LEADERSHIP = 'LEADERSHIP',
  LANGUAGE = 'LANGUAGE',
  CERTIFICATION = 'CERTIFICATION',
}

export enum ReadinessLevel {
  READY = 'READY', // ≥ 80%
  DEVELOPING = 'DEVELOPING', // 50–79%
  STARTING = 'STARTING', // < 50%
}

export enum PromotionStatus {
  DRAFT = 'DRAFT',
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
  EXECUTED = 'EXECUTED',
}

export enum GoalType {
  COURSE = 'COURSE',
  PROJECT = 'PROJECT',
  MENTORING = 'MENTORING',
  CERTIFICATION = 'CERTIFICATION',
  SKILL = 'SKILL',
  OTHER = 'OTHER',
}

export enum GoalStatus {
  PENDING = 'PENDING',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
}

// ─── Roles & Levels ───────────────────────────────────────────────────────────

export class CreateRoleDto {
  @ApiProperty() @IsString() name!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
  @ApiProperty() @IsString() department!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() seniority?: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() salaryMin?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() salaryMax?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() level?: number; // 1=Junior ... 7=C-Level
  @ApiPropertyOptional() @IsOptional() @IsInt() parentRoleId?: number;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() active?: boolean;
}

// ─── Skills / Competencies ────────────────────────────────────────────────────

export class CreateSkillDto {
  @ApiProperty() @IsString() name!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
  @ApiProperty() @IsEnum(SkillType) type!: SkillType;
  @ApiPropertyOptional() @IsOptional() @IsString() category?: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) @Max(5) maxLevel?: number;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() active?: boolean;
}

export class RoleSkillRequirementDto {
  @ApiProperty() @IsInt() skillId!: number;
  @ApiProperty() @IsInt() @Min(1) @Max(5) requiredLevel!: number;
  @ApiProperty() @IsNumber() @Min(0) @Max(1) weight!: number;
  @ApiProperty() @IsBoolean() mandatory!: boolean;
}

export class SetRoleSkillsDto {
  @ApiProperty() @IsInt() roleId!: number;
  @ApiProperty({ type: [RoleSkillRequirementDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RoleSkillRequirementDto)
  skills!: RoleSkillRequirementDto[];
}

// ─── Career Paths ─────────────────────────────────────────────────────────────

export class CareerPathStepDto {
  @ApiProperty() @IsInt() roleId!: number;
  @ApiProperty() @IsInt() @Min(1) order!: number;
  @ApiPropertyOptional() @IsOptional() @IsString() label?: string;
}

export class CreateCareerPathDto {
  @ApiProperty() @IsString() name!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
  @ApiProperty() @IsEnum(CareerPathType) type!: CareerPathType;
  @ApiPropertyOptional() @IsOptional() @IsString() department?: string;
  @ApiProperty({ type: [CareerPathStepDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CareerPathStepDto)
  steps!: CareerPathStepDto[];
  @ApiPropertyOptional() @IsOptional() @IsBoolean() active?: boolean;
}

// ─── Progression Rules ────────────────────────────────────────────────────────

export class CreateProgressionRuleDto {
  @ApiProperty() @IsInt() fromRoleId!: number;
  @ApiProperty() @IsInt() toRoleId!: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() minMonthsInRole?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() minPerformanceScore?: number; // 0-10
  @ApiPropertyOptional() @IsOptional() @IsInt() minCompletedProjects?: number;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() requiresManagerApproval?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() requiresHrApproval?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() requiresCommitteeApproval?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() active?: boolean;
}

// ─── Career Plans ─────────────────────────────────────────────────────────────

export class CreateCareerPlanDto {
  @ApiProperty() @IsInt() userId!: number;
  @ApiProperty() @IsString() title!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() currentRoleId?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() targetRoleId?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() careerPathId?: number;
  @ApiPropertyOptional() @IsOptional() @IsDateString() targetDate?: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() mentorId?: number;
}

export class UpdateCareerPlanDto extends PartialType(CreateCareerPlanDto) {}

// ─── Goals / PDI Actions ──────────────────────────────────────────────────────

export class AddCareerGoalDto {
  @ApiProperty() @IsInt() careerPlanId!: number;
  @ApiProperty() @IsString() title!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
  @ApiProperty() @IsEnum(GoalType) type!: GoalType;
  @ApiPropertyOptional() @IsOptional() @IsInt() skillId?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() courseId?: number;
  @ApiPropertyOptional() @IsOptional() @IsDateString() dueDate?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() resourceUrl?: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) @Max(100) targetProgress?: number;
}

export class UpdateGoalProgressDto {
  @ApiProperty() @IsInt() @Min(0) @Max(100) progress!: number;
  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string;
}

// ─── Promotion Requests ───────────────────────────────────────────────────────

export class CreatePromotionRequestDto {
  @ApiProperty() @IsInt() userId!: number;
  @ApiProperty() @IsInt() targetRoleId!: number;
  @ApiProperty() @IsString() justification!: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() careerPlanId?: number;
}

export class ReviewPromotionDto {
  @ApiProperty() @IsBoolean() approved!: boolean;
  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() effectiveDate?: string;
}

// ─── Simulate ─────────────────────────────────────────────────────────────────

export class SimulateCareerDto {
  @ApiProperty() @IsInt() userId!: number;
  @ApiProperty() @IsInt() targetRoleId!: number;
}

// ─── Filters ──────────────────────────────────────────────────────────────────

export class CareerPlanFilterDto {
  @ApiPropertyOptional() @IsOptional() @IsInt() @Type(() => Number) userId?: number;
  @ApiPropertyOptional() @IsOptional() @IsEnum(CareerPlanStatus) status?: CareerPlanStatus;
  @ApiPropertyOptional() @IsOptional() @IsString() department?: string;
  @ApiPropertyOptional() @IsOptional() @IsEnum(ReadinessLevel) readiness?: ReadinessLevel;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Type(() => Number) page?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Type(() => Number) limit?: number;
}

export class PromotionFilterDto {
  @ApiPropertyOptional() @IsOptional() @IsInt() @Type(() => Number) userId?: number;
  @ApiPropertyOptional() @IsOptional() @IsEnum(PromotionStatus) status?: PromotionStatus;
  @ApiPropertyOptional() @IsOptional() @IsString() department?: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Type(() => Number) page?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Type(() => Number) limit?: number;
}
