import {
  IsString, IsInt, IsNumber, IsArray, IsOptional, IsBoolean,
  IsEnum, Min, Max, MaxLength, ValidateNested, ArrayMinSize,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export enum AssessmentType {
  QUIZ       = 'QUIZ',
  EXAM       = 'EXAM',
  DIAGNOSTIC = 'DIAGNOSTIC',
  PRACTICAL  = 'PRACTICAL',
  SURVEY     = 'SURVEY',
}

export enum AssessmentStatus {
  DRAFT     = 'DRAFT',
  PUBLISHED = 'PUBLISHED',
  ARCHIVED  = 'ARCHIVED',
}

export enum FeedbackMode {
  IMMEDIATE   = 'IMMEDIATE',
  ON_SUBMIT   = 'ON_SUBMIT',
  RESULT_ONLY = 'RESULT_ONLY',
}

export enum QuestionType {
  MULTIPLE_CHOICE_SINGLE = 'MULTIPLE_CHOICE_SINGLE',
  MULTIPLE_CHOICE_MULTI  = 'MULTIPLE_CHOICE_MULTI',
  TRUE_FALSE             = 'TRUE_FALSE',
  OPEN_TEXT              = 'OPEN_TEXT',
  FILE_UPLOAD            = 'FILE_UPLOAD',
  MATCHING               = 'MATCHING',
  ORDERING               = 'ORDERING',
}

export enum AttemptStatus {
  IN_PROGRESS = 'IN_PROGRESS',
  SUBMITTED   = 'SUBMITTED',
  PASSED      = 'PASSED',
  FAILED      = 'FAILED',
  EXPIRED     = 'EXPIRED',
}

export class QuestionOptionDto {
  @ApiProperty() @IsString()
  text!: string;

  @ApiPropertyOptional() @IsOptional() @IsBoolean()
  isCorrect?: boolean;

  @ApiPropertyOptional() @IsOptional() @IsString()
  feedback?: string;
}

export class CreateQuestionDto {
  @ApiProperty({ enum: QuestionType }) @IsEnum(QuestionType)
  type!: QuestionType;

  @ApiProperty() @IsString() @MaxLength(2000)
  questionText!: string;

  @ApiPropertyOptional() @IsOptional() @IsString()
  mediaUrl?: string;

  @ApiPropertyOptional({ type: [QuestionOptionDto] })
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => QuestionOptionDto)
  options?: QuestionOptionDto[];

  @ApiPropertyOptional() @IsOptional() @IsString()
  correctAnswer?: string;

  @ApiPropertyOptional() @IsOptional() @IsString()
  explanation?: string;

  @ApiProperty({ description: 'Peso da pergunta', default: 1 })
  @IsNumber() @Min(0.1)
  weight!: number;

  @ApiPropertyOptional({ default: false }) @IsOptional() @IsBoolean()
  mandatory?: boolean;

  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) @Max(5)
  difficulty?: number;

  @ApiPropertyOptional() @IsOptional() @IsArray() @IsString({ each: true })
  tags?: string[];

  @ApiProperty() @IsInt() @Min(0)
  seq!: number;
}

export class UpdateQuestionDto extends PartialType(CreateQuestionDto) {}

export class CreateAssessmentDto {
  @ApiProperty() @IsString() @MaxLength(200)
  title!: string;

  @ApiPropertyOptional() @IsOptional() @IsString()
  description?: string;

  @ApiProperty({ enum: AssessmentType }) @IsEnum(AssessmentType)
  type!: AssessmentType;

  @ApiPropertyOptional({ enum: AssessmentStatus, default: AssessmentStatus.DRAFT })
  @IsOptional() @IsEnum(AssessmentStatus)
  status?: AssessmentStatus;

  @ApiPropertyOptional() @IsOptional() @IsInt()
  courseId?: number;

  @ApiPropertyOptional() @IsOptional() @IsInt()
  moduleId?: number;

  @ApiPropertyOptional() @IsOptional() @IsInt()
  learningPathId?: number;

  @ApiPropertyOptional({ default: 70 }) @IsOptional() @IsInt() @Min(0) @Max(100)
  passingScore?: number;

  @ApiPropertyOptional({ default: 0 }) @IsOptional() @IsInt() @Min(0)
  maxAttempts?: number;

  @ApiPropertyOptional({ default: 0 }) @IsOptional() @IsInt() @Min(0)
  cooldownHours?: number;

  @ApiPropertyOptional({ default: 0 }) @IsOptional() @IsInt() @Min(0)
  timeLimitMinutes?: number;

  @ApiPropertyOptional({ enum: FeedbackMode, default: FeedbackMode.ON_SUBMIT })
  @IsOptional() @IsEnum(FeedbackMode)
  feedbackMode?: FeedbackMode;

  @ApiPropertyOptional() @IsOptional() @IsBoolean()
  randomizeQuestions?: boolean;

  @ApiPropertyOptional() @IsOptional() @IsBoolean()
  randomizeOptions?: boolean;

  @ApiPropertyOptional() @IsOptional() @IsBoolean()
  allowReview?: boolean;

  @ApiPropertyOptional({ type: [CreateQuestionDto] })
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => CreateQuestionDto)
  questions?: CreateQuestionDto[];
}

export class UpdateAssessmentDto extends PartialType(CreateAssessmentDto) {}

export class AssessmentFilterDto {
  @ApiPropertyOptional() @IsOptional() @IsInt() @Type(() => Number)
  courseId?: number;

  @ApiPropertyOptional() @IsOptional() @IsInt() @Type(() => Number)
  moduleId?: number;

  @ApiPropertyOptional({ enum: AssessmentType }) @IsOptional() @IsEnum(AssessmentType)
  type?: AssessmentType;

  @ApiPropertyOptional({ enum: AssessmentStatus }) @IsOptional() @IsEnum(AssessmentStatus)
  status?: AssessmentStatus;
}

export class StartAttemptDto {
  @ApiProperty() @IsInt()
  assessmentId!: number;
}

export class AnswerDto {
  @ApiProperty() @IsInt()
  questionId!: number;

  @ApiPropertyOptional() @IsOptional() @IsArray() @IsInt({ each: true })
  selectedIndices?: number[];

  @ApiPropertyOptional() @IsOptional() @IsString()
  textAnswer?: string;

  @ApiPropertyOptional() @IsOptional() @IsString()
  fileUrl?: string;
}

export class SubmitAttemptDto {
  @ApiProperty() @IsInt()
  attemptId!: number;

  @ApiProperty({ type: [AnswerDto] })
  @IsArray() @ValidateNested({ each: true }) @Type(() => AnswerDto)
  answers!: AnswerDto[];
}

export class AutoSaveDto {
  @ApiProperty() @IsInt()
  attemptId!: number;

  @ApiProperty({ type: [AnswerDto] })
  @IsArray() @ValidateNested({ each: true }) @Type(() => AnswerDto)
  answers!: AnswerDto[];
}

export class ReviewAnswerDto {
  @ApiProperty() @IsInt()
  attemptAnswerId!: number;

  @ApiProperty() @IsNumber() @Min(0) @Max(100)
  score!: number;

  @ApiPropertyOptional() @IsOptional() @IsString()
  reviewComment?: string;
}
