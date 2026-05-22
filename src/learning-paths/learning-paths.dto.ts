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
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export enum LearningPathStatus {
  DRAFT = 'DRAFT',
  PUBLISHED = 'PUBLISHED',
  ARCHIVED = 'ARCHIVED',
}

export enum LearningPathLevel {
  BEGINNER = 'BEGINNER',
  INTERMEDIATE = 'INTERMEDIATE',
  ADVANCED = 'ADVANCED',
}

export enum LearningPathType {
  ONBOARDING = 'ONBOARDING',
  UPSKILLING = 'UPSKILLING',
  RESKILLING = 'RESKILLING',
  COMPLIANCE = 'COMPLIANCE',
  LEADERSHIP = 'LEADERSHIP',
  CERTIFICATION = 'CERTIFICATION',
  CUSTOM = 'CUSTOM',
}

export enum ProgressionType {
  SEQUENTIAL = 'SEQUENTIAL',
  FREE = 'FREE',
  HYBRID = 'HYBRID',
}

export enum AssignmentTarget {
  USER = 'USER',
  DEPARTMENT = 'DEPARTMENT',
  POSITION = 'POSITION',
  UNIT = 'UNIT',
  ROLE = 'ROLE',
}

export enum PathEnrollmentStatus {
  NOT_STARTED = 'NOT_STARTED',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
  EXPIRED = 'EXPIRED',
}

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

export class CreateLearningPathDto {
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

export class UpdateLearningPathDto extends PartialType(CreateLearningPathDto) {}

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
  @IsBoolean()
  @Type(() => Boolean)
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
