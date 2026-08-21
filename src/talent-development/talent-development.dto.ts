// src/talent-development/talent-development.dto.ts
import {
  IsString,
  IsInt,
  IsOptional,
  IsEnum,
  IsBoolean,
  IsDateString,
  IsArray,
  Min,
  Max,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type, Transform } from 'class-transformer';
import { PlanStatus, ActionType, ActionStatus, PlanPriority, SkillType } from '@prisma/client';
import { BaseFilterDto } from '../common/dtos/pagination.dto';

// ─── Enums ───────────────────────────────────────────────────────

export { PlanStatus, ActionType, ActionStatus, PlanPriority };

export enum TalentTier {
  HIGH = 'HIGH',
  MEDIUM = 'MEDIUM',
  DEVELOPING = 'DEVELOPING',
}

export enum MentoringStatus {
  ACTIVE = 'ACTIVE',
  COMPLETED = 'COMPLETED',
  PAUSED = 'PAUSED',
  CANCELLED = 'CANCELLED',
}

// ─── Plan DTOs ───────────────────────────────────────────────────

export class PlanFilterDto extends BaseFilterDto {
  @ApiPropertyOptional() @IsOptional() @IsInt() @Type(() => Number) userId?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Type(() => Number) managerId?: number;
  @ApiPropertyOptional({ enum: PlanStatus }) @IsOptional() @IsEnum(PlanStatus) status?: PlanStatus;
  // @Type(() => Boolean) coage '?isTemplate=false' para true — ver
  // [[project-innova-boolean-query-filter-coercion]].
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => String)
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  isTemplate?: boolean;
}

export class TalentDevelopmentCreateDevelopmentPlanDto {
  @ApiProperty() @IsString() @MaxLength(200) name!: string;
  @ApiProperty() @IsString() goal!: string;
  @ApiProperty() @IsInt() userId!: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() managerId?: number;
  @ApiPropertyOptional({ enum: PlanPriority })
  @IsOptional()
  @IsEnum(PlanPriority)
  priority?: PlanPriority;
  @ApiPropertyOptional() @IsOptional() @IsDateString() startDate?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() endDate?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() period?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isTemplate?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsInt() performanceCycleId?: number;
}

export class TalentDevelopmentUpdateDevelopmentPlanDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) name?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() goal?: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() managerId?: number;
  @ApiPropertyOptional({ enum: PlanPriority })
  @IsOptional()
  @IsEnum(PlanPriority)
  priority?: PlanPriority;
  @ApiPropertyOptional() @IsOptional() @IsDateString() startDate?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() endDate?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string;
}

export class CancelPlanDto {
  @ApiProperty() @IsString() @MaxLength(500) reason!: string;
}

// ─── Goal DTOs ───────────────────────────────────────────────────

export class TalentDevelopmentCreateGoalDto {
  @ApiProperty() @IsString() @MaxLength(200) title!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() successIndicator?: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) @Max(100) weight?: number;
  @ApiPropertyOptional() @IsOptional() @IsDateString() dueDate?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string;
}

export class TalentDevelopmentUpdateGoalDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) title?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() successIndicator?: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) @Max(100) progress?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) @Max(100) weight?: number;
  @ApiPropertyOptional() @IsOptional() @IsDateString() dueDate?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string;
}

// ─── Action DTOs ─────────────────────────────────────────────────

export class CreateActionDto {
  @ApiProperty() @IsString() @MaxLength(200) title!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
  @ApiProperty({ enum: ActionType }) @IsEnum(ActionType) type!: ActionType;
  @ApiPropertyOptional() @IsOptional() @IsInt() courseId?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) workloadHours?: number;
  @ApiPropertyOptional() @IsOptional() @IsDateString() dueDate?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() mandatory?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) seq?: number;
  @ApiPropertyOptional() @IsOptional() @IsArray() @IsString({ each: true }) resources?: string[];
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) xpReward?: number;
}

export class UpdateActionDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) title?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
  @ApiPropertyOptional({ enum: ActionStatus })
  @IsOptional()
  @IsEnum(ActionStatus)
  status?: ActionStatus;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) @Max(100) progress?: number;
  @ApiPropertyOptional() @IsOptional() @IsDateString() dueDate?: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) workloadHours?: number;
  @ApiPropertyOptional() @IsOptional() @IsArray() @IsString({ each: true }) resources?: string[];
}

export class TalentDevelopmentUpdateProgressDto {
  @ApiProperty({ minimum: 0, maximum: 100 }) @IsInt() @Min(0) @Max(100) progress!: number;
  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() evidenceUrl?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() evidenceTitle?: string;
}

export class ApproveActionDto {
  @ApiProperty() @IsBoolean() approved!: boolean;
  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string;
}

// ─── Talent Pool DTOs ────────────────────────────────────────────

export class TalentFilterDto extends BaseFilterDto {
  @ApiPropertyOptional() @IsOptional() @IsInt() @Type(() => Number) departmentId?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Type(() => Number) positionId?: number;
  @ApiPropertyOptional({ enum: TalentTier }) @IsOptional() @IsEnum(TalentTier) tier?: TalentTier;
  // limit por omissão é 50 aqui (não 20 como no BaseFilterDto) — override intencional.
  @ApiPropertyOptional({ default: 50 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  limit?: number;
}

// ─── Mentoring DTOs ──────────────────────────────────────────────

export class TalentDevelopmentCreateMentoringDto {
  @ApiProperty() @IsInt() mentorId!: number;
  @ApiProperty() @IsInt() menteeId!: number;
  @ApiPropertyOptional() @IsOptional() @IsString() objective?: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) @Max(24) durationMonths?: number;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() reverseMentoring?: boolean;
}

export class CreateMentoringSessionDto {
  @ApiProperty() @IsDateString() sessionDate!: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(15) durationMinutes?: number;
  @ApiProperty() @IsString() @MaxLength(2000) summary!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() actionItems?: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) @Max(5) rating?: number;
}

export class MentoringFilterDto extends BaseFilterDto {
  @ApiPropertyOptional() @IsOptional() @IsInt() @Type(() => Number) mentorId?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Type(() => Number) menteeId?: number;
  @ApiPropertyOptional({ enum: MentoringStatus })
  @IsOptional()
  @IsEnum(MentoringStatus)
  status?: MentoringStatus;
}

// ─── Skill Gap DTOs ──────────────────────────────────────────────

export class SkillGapFilterDto {
  @ApiPropertyOptional() @IsOptional() @IsInt() @Type(() => Number) departmentId?: number;
  @ApiPropertyOptional({ enum: SkillType }) @IsOptional() @IsEnum(SkillType) skillType?: SkillType;
}

// ─── Simulation ──────────────────────────────────────────────────

export class CareerSimulationDto {
  @ApiProperty() @IsInt() targetRoleId!: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) @Max(60) targetMonths?: number;
}

// ─── Template ────────────────────────────────────────────────────

export class CreateFromTemplateDto {
  @ApiProperty() @IsInt() userId!: number;
  @ApiProperty() @IsInt() managerId!: number;
}

// ─── Dashboard filter ────────────────────────────────────────────

export class TalentDevelopmentDashboardFilterDto {
  @ApiPropertyOptional() @IsOptional() @IsInt() @Type(() => Number) departmentId?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Type(() => Number) managerId?: number;
}
