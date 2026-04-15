import {
  IsString, IsOptional, IsBoolean, IsInt, IsArray,
  IsEnum, IsUrl, Min, Max, MaxLength, ValidateNested, ArrayMinSize,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export enum CourseLevel    { BEGINNER = 'BEGINNER', INTERMEDIATE = 'INTERMEDIATE', ADVANCED = 'ADVANCED' }
export enum CourseStatus   { DRAFT = 'DRAFT', PUBLISHED = 'PUBLISHED', ARCHIVED = 'ARCHIVED' }
export enum LessonType     { VIDEO = 'VIDEO', PDF = 'PDF', TEXT = 'TEXT', AUDIO = 'AUDIO', SLIDE = 'SLIDE', LINK = 'LINK', SCORM = 'SCORM', QUIZ = 'QUIZ' }
export enum EnrollmentStatus { NOT_STARTED = 'NOT_STARTED', IN_PROGRESS = 'IN_PROGRESS', COMPLETED = 'COMPLETED', EXPIRED = 'EXPIRED' }
export enum QuizQuestionType { MULTIPLE_CHOICE = 'MULTIPLE_CHOICE', TRUE_FALSE = 'TRUE_FALSE', OPEN = 'OPEN' }
export enum AssignmentTarget { USER = 'USER', DEPARTMENT = 'DEPARTMENT', POSITION = 'POSITION' }

export class CreateCourseDto {
  @ApiProperty() @IsString() @MaxLength(200)
  title!: string;

  @ApiPropertyOptional() @IsOptional() @IsString()
  shortDescription?: string;

  @ApiPropertyOptional() @IsOptional() @IsString()
  description?: string;

  @ApiPropertyOptional() @IsOptional() @IsString()
  category?: string;

  @ApiPropertyOptional() @IsOptional() @IsArray() @IsString({ each: true })
  tags?: string[];

  @ApiPropertyOptional() @IsOptional() @IsString()
  thumbnailUrl?: string;

  @ApiPropertyOptional() @IsOptional() @IsString()
  introVideoUrl?: string;

  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0)
  workloadHours?: number;

  @ApiPropertyOptional({ default: 'pt' }) @IsOptional() @IsString()
  language?: string;

  @ApiPropertyOptional({ enum: CourseLevel }) @IsOptional() @IsEnum(CourseLevel)
  level?: CourseLevel;

  @ApiPropertyOptional({ enum: CourseStatus, default: CourseStatus.DRAFT })
  @IsOptional() @IsEnum(CourseStatus)
  status?: CourseStatus;

  @ApiPropertyOptional() @IsOptional() @IsBoolean()
  mandatory?: boolean;

  @ApiPropertyOptional() @IsOptional() @IsString()
  internalCode?: string;

  @ApiPropertyOptional() @IsOptional() @IsInt()
  departmentId?: number;

  @ApiPropertyOptional() @IsOptional() @IsArray() @IsString({ each: true })
  learningObjectives?: string[];

  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) @Max(100)
  passingScore?: number;

  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0)
  certificateValidityDays?: number;

  @ApiPropertyOptional() @IsOptional() @IsBoolean()
  allowDownload?: boolean;
}

export class UpdateCourseDto extends PartialType(CreateCourseDto) {}

export class CreateCourseModuleDto {
  @ApiProperty() @IsString() @MaxLength(200)
  title!: string;

  @ApiPropertyOptional() @IsOptional() @IsString()
  description?: string;

  @ApiProperty() @IsInt() @Min(0)
  seq!: number;
}

export class UpdateCourseModuleDto extends PartialType(CreateCourseModuleDto) {}

export class CreateLessonDto {
  @ApiProperty() @IsString() @MaxLength(200)
  title!: string;

  @ApiPropertyOptional() @IsOptional() @IsString()
  description?: string;

  @ApiProperty({ enum: LessonType }) @IsEnum(LessonType)
  type!: LessonType;

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

export class UpdateLessonDto extends PartialType(CreateLessonDto) {}

export class MarkLessonCompleteDto {
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0)
  watchedSeconds?: number;

  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0)
  resumePosition?: number;
}

export class CourseFilterDto {
  @ApiPropertyOptional() @IsOptional() @IsString()
  search?: string;

  @ApiPropertyOptional() @IsOptional() @IsString()
  category?: string;

  @ApiPropertyOptional({ enum: CourseLevel }) @IsOptional() @IsEnum(CourseLevel)
  level?: CourseLevel;

  @ApiPropertyOptional({ enum: CourseStatus }) @IsOptional() @IsEnum(CourseStatus)
  status?: CourseStatus;

  @ApiPropertyOptional() @IsOptional() @IsBoolean() @Type(() => Boolean)
  mandatory?: boolean;

  @ApiPropertyOptional() @IsOptional() @IsInt() @Type(() => Number)
  departmentId?: number;

  @ApiPropertyOptional() @IsOptional() @IsInt() @Type(() => Number)
  page?: number;

  @ApiPropertyOptional() @IsOptional() @IsInt() @Type(() => Number)
  limit?: number;
}

export class EnrollDto {
  @ApiPropertyOptional() @IsOptional() @IsString()
  deadline?: string;

  @ApiPropertyOptional() @IsOptional() @IsBoolean()
  mandatory?: boolean;
}

export class AssignCourseDto {
  @ApiProperty({ enum: AssignmentTarget }) @IsEnum(AssignmentTarget)
  targetType!: AssignmentTarget;

  @ApiProperty() @IsInt()
  targetId!: number;

  @ApiPropertyOptional() @IsOptional() @IsString()
  deadline?: string;

  @ApiPropertyOptional() @IsOptional() @IsBoolean()
  mandatory?: boolean;
}

export class QuizOptionDto {
  @ApiProperty() @IsString()
  text!: string;

  @ApiPropertyOptional() @IsOptional() @IsBoolean()
  isCorrect?: boolean;
}

export class CreateQuizQuestionDto {
  @ApiProperty() @IsString()
  question!: string;

  @ApiProperty({ enum: QuizQuestionType }) @IsEnum(QuizQuestionType)
  type!: QuizQuestionType;

  @ApiPropertyOptional({ type: [QuizOptionDto] })
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => QuizOptionDto)
  options?: QuizOptionDto[];

  @ApiPropertyOptional() @IsOptional() @IsString()
  correctAnswer?: string;

  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1)
  points?: number;
}

export class CreateQuizDto {
  @ApiProperty() @IsString()
  title!: string;

  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) @Max(100)
  passingScore?: number;

  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0)
  maxAttempts?: number;

  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0)
  timeLimitMinutes?: number;

  @ApiProperty({ type: [CreateQuizQuestionDto] })
  @IsArray() @ArrayMinSize(1) @ValidateNested({ each: true }) @Type(() => CreateQuizQuestionDto)
  questions!: CreateQuizQuestionDto[];
}

export class SubmitQuizDto {
  @ApiProperty()
  answers!: Record<string, string>;
}

export class CourseFeedbackDto {
  @ApiProperty() @IsString()
  comment!: string;

  @ApiProperty() @IsInt() @Min(1) @Max(5)
  rating!: number;
}
