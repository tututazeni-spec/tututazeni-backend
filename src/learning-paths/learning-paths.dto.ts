import {
  IsString,
  IsOptional,
  IsBoolean,
  IsInt,
  IsArray,
  IsEnum,
  IsDateString,
  Min,
  Max,
  MaxLength,
  IsNotEmpty,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type, Transform } from 'class-transformer';
import {
  LearningPathStatus,
  LearningPathLevel,
  LearningPathType,
  ProgressionType,
  AssignmentTarget,
  LearningPathEnrollmentStatus as PathEnrollmentStatus,
} from '@prisma/client';

export {
  LearningPathStatus,
  LearningPathLevel,
  LearningPathType,
  ProgressionType,
  AssignmentTarget,
  PathEnrollmentStatus,
};

export class LearningPathStepDto {
  @ApiProperty()
  @IsInt()
  courseId!: number;

  @ApiProperty()
  @IsInt()
  @Min(0)
  seq!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  required?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  milestoneId?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  deadlineDays?: number;
}

export class LearningPathsCreateLearningPathDto {
  @ApiProperty({ example: 'Onboarding Colaborador 2026' })
  @IsString()
  @MaxLength(200)
  title!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  shortDescription?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  objective?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  thumbnailUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @ApiPropertyOptional({ enum: LearningPathLevel })
  @IsOptional()
  @IsEnum(LearningPathLevel)
  level?: LearningPathLevel;

  @ApiPropertyOptional({ enum: LearningPathType })
  @IsOptional()
  @IsEnum(LearningPathType)
  pathType?: LearningPathType;

  @ApiPropertyOptional({ enum: ProgressionType, default: ProgressionType.SEQUENTIAL })
  @IsOptional()
  @IsEnum(ProgressionType)
  progressionType?: ProgressionType;

  @ApiPropertyOptional({ enum: LearningPathStatus, default: LearningPathStatus.DRAFT })
  @IsOptional()
  @IsEnum(LearningPathStatus)
  status?: LearningPathStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  mandatory?: boolean;

  @ApiPropertyOptional({ default: 'pt' })
  @IsOptional()
  @IsString()
  language?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  deadline?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  courseIds?: number[];
}

export class UpdateLearningPathDto extends PartialType(LearningPathsCreateLearningPathDto) {}

export class LearningPathFilterDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ enum: LearningPathStatus })
  @IsOptional()
  @IsEnum(LearningPathStatus)
  status?: LearningPathStatus;

  @ApiPropertyOptional({ enum: LearningPathLevel })
  @IsOptional()
  @IsEnum(LearningPathLevel)
  level?: LearningPathLevel;

  @ApiPropertyOptional({ enum: LearningPathType })
  @IsOptional()
  @IsEnum(LearningPathType)
  pathType?: LearningPathType;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => String)
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  mandatory?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  category?: string;

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
  @Max(100)
  @Type(() => Number)
  limit?: number;
}

export class AssignLearningPathDto {
  @ApiProperty()
  @IsInt()
  learningPathId!: number;

  @ApiProperty({ enum: AssignmentTarget })
  @IsEnum(AssignmentTarget)
  targetType!: AssignmentTarget;

  @ApiProperty()
  @IsInt()
  targetId!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  mandatory?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  deadline?: string;
}

export class ReorderStepsDto {
  @ApiProperty({ type: [Object] })
  @IsArray()
  order!: Array<{ courseId: number; seq: number }>;
}

// ─── CreateMilestoneDto ───────────────────────────────────────────────────────

export class CreateMilestoneDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @IsInt()
  @Min(1)
  seq!: number;
}
