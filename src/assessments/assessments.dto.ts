// src/assessments/assessments.dto.ts
import {
  IsString,
  IsInt,
  IsNumber,
  IsArray,
  IsOptional,
  IsBoolean,
  IsEnum,
  Min,
  Max,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';

// ─── Enums ────────────────────────────────────────────────────────────────────

export enum AssessmentType {
  QUIZ = 'QUIZ',
  EXAM = 'EXAM',
  DIAGNOSTIC = 'DIAGNOSTIC',
  PRACTICAL = 'PRACTICAL',
  SURVEY = 'SURVEY',
}

export enum AssessmentStatus {
  DRAFT = 'DRAFT',
  PUBLISHED = 'PUBLISHED',
  ARCHIVED = 'ARCHIVED',
}

export enum FeedbackMode {
  IMMEDIATE = 'IMMEDIATE', // Por pergunta, imediatamente
  ON_SUBMIT = 'ON_SUBMIT', // Após submissão
  RESULT_ONLY = 'RESULT_ONLY', // Apenas score final
}

export enum QuestionType {
  MULTIPLE_CHOICE_SINGLE = 'MULTIPLE_CHOICE_SINGLE',
  MULTIPLE_CHOICE_MULTI = 'MULTIPLE_CHOICE_MULTI',
  TRUE_FALSE = 'TRUE_FALSE',
  OPEN_TEXT = 'OPEN_TEXT',
  FILE_UPLOAD = 'FILE_UPLOAD',
  MATCHING = 'MATCHING',
  ORDERING = 'ORDERING',
}

export enum AttemptStatus {
  IN_PROGRESS = 'IN_PROGRESS',
  SUBMITTED = 'SUBMITTED',
  PASSED = 'PASSED',
  FAILED = 'FAILED',
  EXPIRED = 'EXPIRED',
}

// ─── Question ─────────────────────────────────────────────────────────────────

export class QuestionOptionDto {
  @ApiProperty()
  @IsString()
  text: string;

  @ApiPropertyOptional({ description: 'Para MULTIPLE_CHOICE_SINGLE / TRUE_FALSE' })
  @IsOptional()
  @IsBoolean()
  isCorrect?: boolean;

  @ApiPropertyOptional({ description: 'Feedback por opção (opcional)' })
  @IsOptional()
  @IsString()
  feedback?: string;
}

export class CreateQuestionDto {
  @ApiProperty({ enum: QuestionType })
  @IsEnum(QuestionType)
  type: QuestionType;

  @ApiProperty()
  @IsString()
  @MaxLength(2000)
  questionText: string;

  @ApiPropertyOptional({ description: 'URL de imagem/vídeo associado' })
  @IsOptional()
  @IsString()
  mediaUrl?: string;

  @ApiPropertyOptional({ type: [QuestionOptionDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => QuestionOptionDto)
  options?: QuestionOptionDto[];

  @ApiPropertyOptional({ description: 'Resposta correcta (para OPEN_TEXT / TRUE_FALSE)' })
  @IsOptional()
  @IsString()
  correctAnswer?: string;

  @ApiPropertyOptional({ description: 'Explicação da resposta (feedback)' })
  @IsOptional()
  @IsString()
  explanation?: string;

  @ApiProperty({ description: 'Peso da pergunta', default: 1 })
  @IsNumber()
  @Min(0.1)
  weight: number;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  mandatory?: boolean;

  @ApiPropertyOptional({ description: 'Nível de dificuldade 1-5' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  difficulty?: number;

  @ApiPropertyOptional({ description: 'Tags para banco de questões' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @ApiProperty({ description: 'Ordem na avaliação' })
  @IsInt()
  @Min(0)
  seq: number;
}

export class UpdateQuestionDto extends PartialType(CreateQuestionDto) {}

// ─── Assessment ───────────────────────────────────────────────────────────────

export class CreateAssessmentDto {
  @ApiProperty()
  @IsString()
  @MaxLength(200)
  title: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ enum: AssessmentType })
  @IsEnum(AssessmentType)
  type: AssessmentType;

  @ApiPropertyOptional({ enum: AssessmentStatus, default: AssessmentStatus.DRAFT })
  @IsOptional()
  @IsEnum(AssessmentStatus)
  status?: AssessmentStatus;

  @ApiPropertyOptional({ description: 'ID do curso (opcional)' })
  @IsOptional()
  @IsInt()
  courseId?: number;

  @ApiPropertyOptional({ description: 'ID do módulo (opcional)' })
  @IsOptional()
  @IsInt()
  moduleId?: number;

  @ApiPropertyOptional({ description: 'ID do Learning Path (opcional)' })
  @IsOptional()
  @IsInt()
  learningPathId?: number;

  @ApiPropertyOptional({ description: 'Nota mínima de aprovação (0-100)', default: 70 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  passingScore?: number;

  @ApiPropertyOptional({ description: 'Tentativas máximas (0 = ilimitado)', default: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  maxAttempts?: number;

  @ApiPropertyOptional({ description: 'Cooldown entre tentativas em horas', default: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  cooldownHours?: number;

  @ApiPropertyOptional({ description: 'Tempo limite em minutos (0 = sem limite)', default: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  timeLimitMinutes?: number;

  @ApiPropertyOptional({ enum: FeedbackMode, default: FeedbackMode.ON_SUBMIT })
  @IsOptional()
  @IsEnum(FeedbackMode)
  feedbackMode?: FeedbackMode;

  @ApiPropertyOptional({ description: 'Randomizar ordem das perguntas?' })
  @IsOptional()
  @IsBoolean()
  randomizeQuestions?: boolean;

  @ApiPropertyOptional({ description: 'Randomizar ordem das opções?' })
  @IsOptional()
  @IsBoolean()
  randomizeOptions?: boolean;

  @ApiPropertyOptional({ description: 'Mostrar revisão após submissão?' })
  @IsOptional()
  @IsBoolean()
  allowReview?: boolean;

  @ApiPropertyOptional({ type: [CreateQuestionDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateQuestionDto)
  questions?: CreateQuestionDto[];
}

export class UpdateAssessmentDto extends PartialType(CreateAssessmentDto) {}

// ─── Filter ───────────────────────────────────────────────────────────────────

export class AssessmentFilterDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  courseId?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  moduleId?: number;

  @ApiPropertyOptional({ enum: AssessmentType })
  @IsOptional()
  @IsEnum(AssessmentType)
  type?: AssessmentType;

  @ApiPropertyOptional({ enum: AssessmentStatus })
  @IsOptional()
  @IsEnum(AssessmentStatus)
  status?: AssessmentStatus;
}

// ─── Start Attempt ────────────────────────────────────────────────────────────

export class StartAttemptDto {
  @ApiProperty()
  @IsInt()
  assessmentId: number;
}

// ─── Submit ───────────────────────────────────────────────────────────────────

export class AnswerDto {
  @ApiProperty({ description: 'ID da pergunta' })
  @IsInt()
  questionId: number;

  @ApiPropertyOptional({ description: 'Índices seleccionados (MULTIPLE_CHOICE)' })
  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  selectedIndices?: number[];

  @ApiPropertyOptional({ description: 'Resposta texto (OPEN_TEXT)' })
  @IsOptional()
  @IsString()
  textAnswer?: string;

  @ApiPropertyOptional({ description: 'URL do ficheiro (FILE_UPLOAD)' })
  @IsOptional()
  @IsString()
  fileUrl?: string;
}

export class SubmitAttemptDto {
  @ApiProperty()
  @IsInt()
  attemptId: number;

  @ApiProperty({ type: [AnswerDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AnswerDto)
  answers: AnswerDto[];
}

// ─── Auto-save ────────────────────────────────────────────────────────────────

export class AutoSaveDto {
  @ApiProperty()
  @IsInt()
  attemptId: number;

  @ApiProperty({ type: [AnswerDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AnswerDto)
  answers: AnswerDto[];
}

// ─── Manual review (open questions) ──────────────────────────────────────────

export class ReviewAnswerDto {
  @ApiProperty()
  @IsInt()
  attemptAnswerId: number;

  @ApiProperty({ description: 'Pontuação manual atribuída (0-100)' })
  @IsNumber()
  @Min(0)
  @Max(100)
  score: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  reviewComment?: string;
}
