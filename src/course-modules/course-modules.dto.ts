import {
  IsString, IsInt, IsOptional, IsEnum, IsBoolean,
  IsArray, IsNumber, Min, Max, MaxLength, ValidateNested,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export enum ModuleStatus {
  DRAFT     = 'DRAFT',
  PUBLISHED = 'PUBLISHED',
}

export enum ModuleType {
  THEORETICAL = 'THEORETICAL',
  PRACTICAL   = 'PRACTICAL',
  ASSESSMENT  = 'ASSESSMENT',
  PROJECT     = 'PROJECT',
}

export enum ProgressionType {
  SEQUENTIAL = 'SEQUENTIAL',
  FREE       = 'FREE',
  HYBRID     = 'HYBRID',
}

export enum CompletionRule {
  ALL_LESSONS = 'ALL_LESSONS',
  MIN_PERCENT = 'MIN_PERCENT',
  QUIZ_PASS   = 'QUIZ_PASS',
  COMBINED    = 'COMBINED',
}

export enum LessonContentType {
  VIDEO  = 'VIDEO',
  PDF    = 'PDF',
  TEXT   = 'TEXT',
  AUDIO  = 'AUDIO',
  SLIDE  = 'SLIDE',
  LINK   = 'LINK',
  SCORM  = 'SCORM',
  QUIZ   = 'QUIZ',
}

export class CreateModuleDto {
  @ApiProperty() @IsInt()
  courseId!: number;

  @ApiProperty() @IsString() @MaxLength(200)
  title!: string;

  @ApiPropertyOptional() @IsOptional() @IsString()
  description?: string;

  @ApiPropertyOptional() @IsOptional() @IsArray() @IsString({ each: true })
  learningObjectives?: string[];

  @ApiProperty() @IsInt() @Min(0)
  seq!: number;

  @ApiPropertyOptional({ enum: ModuleStatus, default: ModuleStatus.DRAFT })
  @IsOptional() @IsEnum(ModuleStatus)
  status?: ModuleStatus;

  @ApiPropertyOptional({ enum: ModuleType }) @IsOptional() @IsEnum(ModuleType)
  type?: ModuleType;

  @ApiPropertyOptional({ enum: ProgressionType, default: ProgressionType.SEQUENTIAL })
  @IsOptional() @IsEnum(ProgressionType)
  progressionType?: ProgressionType;

  @ApiPropertyOptional({ enum: CompletionRule, default: CompletionRule.ALL_LESSONS })
  @IsOptional() @IsEnum(CompletionRule)
  completionRule?: CompletionRule;

  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) @Max(100)
  minCompletionPercent?: number;

  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) @Max(100)
  minQuizScore?: number;

  @ApiPropertyOptional() @IsOptional() @IsBoolean()
  mandatory?: boolean;

  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0)
  dripDays?: number;

  @ApiPropertyOptional() @IsOptional() @IsString()
  availableFrom?: string;
}

export class UpdateModuleDto extends PartialType(CreateModuleDto) {}

export class ReorderModulesDto {
  @ApiProperty({ type: [Object] })
  @IsArray() @ValidateNested({ each: true }) @Type(() => Object)
  order!: Array<{ id: number; seq: number }>;
}

export class CreateModuleLessonDto {
  @ApiProperty() @IsInt()
  moduleId!: number;

  @ApiProperty() @IsString() @MaxLength(200)
  title!: string;

  @ApiPropertyOptional() @IsOptional() @IsString()
  description?: string;

  @ApiProperty({ enum: LessonContentType }) @IsEnum(LessonContentType)
  contentType!: LessonContentType;

  @ApiPropertyOptional() @IsOptional() @IsString()
  contentUrl?: string;

  @ApiPropertyOptional() @IsOptional() @IsString()
  textContent?: string;

  @ApiProperty() @IsInt() @Min(0)
  seq!: number;

  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0)
  durationMinutes?: number;

  @ApiPropertyOptional() @IsOptional() @IsBoolean()
  isFree?: boolean;

  @ApiPropertyOptional() @IsOptional() @IsBoolean()
  allowDownload?: boolean;
}

export class UpdateModuleLessonDto extends PartialType(CreateModuleLessonDto) {}

export class MoveLessonDto {
  @ApiProperty() @IsInt()
  targetModuleId!: number;

  @ApiProperty() @IsInt() @Min(0)
  seq!: number;
}

export class MarkModuleLessonCompleteDto {
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0)
  watchedSeconds?: number;

  @ApiProperty() @IsInt()
  lessonId!: number;

  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0)
  resumePosition?: number;
}

export class CreateModuleMaterialDto {
  @ApiProperty() @IsString() @MaxLength(200)
  title!: string;

  @ApiProperty() @IsString()
  url!: string;

  @ApiPropertyOptional() @IsOptional() @IsString()
  fileType?: string;

  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0)
  fileSizeKb?: number;
}

export class CloneModuleDto {
  @ApiProperty() @IsInt()
  targetCourseId!: number;

  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0)
  seq?: number;
}
