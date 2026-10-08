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
  ValidateNested,
  ArrayMinSize,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type, Transform } from 'class-transformer';
import {
  CourseLevel,
  CourseStatus,
  CourseVisibility,
  CourseType,
  CourseModality,
  ModuleStatus,
  ModuleType,
  ProgressionType,
  CompletionRule,
  LessonType,
  LessonStatus,
  LessonActivityType,
  QuizQuestionType,
  CourseCohortStatus,
} from '@prisma/client';
import { BaseFilterDto } from '../common/dtos/pagination.dto';
import { IsAllowedFileUrl } from '../common/validators/is-allowed-file-url.validator';

export {
  CourseLevel,
  CourseStatus,
  CourseVisibility,
  CourseType,
  CourseModality,
  ModuleStatus,
  ModuleType,
  ProgressionType,
  CompletionRule,
  LessonType,
  LessonStatus,
  LessonActivityType,
  QuizQuestionType,
  CourseCohortStatus,
};

// AssignmentTarget local — usado apenas para despachar destinatários de
// atribuição de curso (não é persistido directamente como coluna neste
// modelo); distinto do AssignmentTarget do Prisma (LearningPathAssignment).
export enum AssignmentTarget {
  USER = 'USER',
  DEPARTMENT = 'DEPARTMENT',
  POSITION = 'POSITION',
}

export class CreateCourseDto {
  @ApiProperty()
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
  category?: string;

  @ApiPropertyOptional({ description: 'Área de conhecimento' })
  @IsOptional()
  @IsString()
  knowledgeArea?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  // Imagem do curso: data URL base64 (upload self-service, ver
  // CreateCourseModal) ou URL normal. Guardada tal e qual em
  // Course.thumbnailUrl. O @MaxLength é a fronteira real do tamanho
  // (o body parser em main.ts só corta muito acima disto).
  // ~700k ≈ 512KB de imagem em base64.
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(700_000)
  thumbnailUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  introVideoUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  workloadHours?: number;

  @ApiPropertyOptional({ description: 'Duração estimada em dias' })
  @IsOptional()
  @IsInt()
  @Min(0)
  estimatedDurationDays?: number;

  @ApiPropertyOptional({ default: 'pt' })
  @IsOptional()
  @IsString()
  language?: string;

  @ApiPropertyOptional({ enum: CourseLevel })
  @IsOptional()
  @IsEnum(CourseLevel)
  level?: CourseLevel;

  @ApiPropertyOptional({ enum: CourseStatus, default: CourseStatus.DRAFT })
  @IsOptional()
  @IsEnum(CourseStatus)
  status?: CourseStatus;

  @ApiPropertyOptional({ enum: CourseVisibility, default: CourseVisibility.PUBLIC })
  @IsOptional()
  @IsEnum(CourseVisibility)
  visibility?: CourseVisibility;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  mandatory?: boolean;

  @ApiPropertyOptional({ enum: CourseType })
  @IsOptional()
  @IsEnum(CourseType)
  type?: CourseType;

  @ApiPropertyOptional({ enum: CourseModality })
  @IsOptional()
  @IsEnum(CourseModality)
  modality?: CourseModality;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  internalCode?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  departmentId?: number;

  @ApiPropertyOptional({ description: 'Unidade responsável' })
  @IsOptional()
  @IsString()
  unit?: string;

  @ApiPropertyOptional({ description: 'Público-alvo' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  targetAudience?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  learningObjectives?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  endDate?: string;

  @ApiPropertyOptional({ description: 'Requer aprovação para inscrição' })
  @IsOptional()
  @IsBoolean()
  requiresApproval?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  passingScore?: number;

  @ApiPropertyOptional({ description: 'Percentagem mínima de conclusão' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  minCompletionPercent?: number;

  @ApiPropertyOptional({ description: 'Emite certificado ao concluir' })
  @IsOptional()
  @IsBoolean()
  certificateEnabled?: boolean;

  @ApiPropertyOptional({ description: 'Critérios para emissão do certificado' })
  @IsOptional()
  @IsString()
  certificateCriteria?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  certificateValidityDays?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  allowDownload?: boolean;

  @ApiPropertyOptional({ description: 'Instrutor principal' })
  @IsOptional()
  @IsInt()
  primaryInstructorId?: number;

  @ApiPropertyOptional({ description: 'Curso pré-requisito' })
  @IsOptional()
  @IsInt()
  requiredCourseId?: number;
}

export class UpdateCourseDto extends PartialType(CreateCourseDto) {}

export class CreateCourseModuleDto {
  @ApiProperty()
  @IsString()
  @MaxLength(200)
  title!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  code?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  thumbnailUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  learningObjectives?: string[];

  @ApiProperty()
  @IsInt()
  @Min(0)
  seq!: number;

  @ApiPropertyOptional({ enum: ModuleStatus })
  @IsOptional()
  @IsEnum(ModuleStatus)
  status?: ModuleStatus;

  @ApiPropertyOptional({ enum: ModuleType })
  @IsOptional()
  @IsEnum(ModuleType)
  type?: ModuleType;

  @ApiPropertyOptional({ enum: ProgressionType })
  @IsOptional()
  @IsEnum(ProgressionType)
  progressionType?: ProgressionType;

  @ApiPropertyOptional({ enum: CompletionRule })
  @IsOptional()
  @IsEnum(CompletionRule)
  completionRule?: CompletionRule;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  minCompletionPercent?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  minQuizScore?: number;

  @ApiPropertyOptional({ description: 'Módulo obrigatório' })
  @IsOptional()
  @IsBoolean()
  mandatory?: boolean;

  @ApiPropertyOptional({ description: 'Pode avançar sem concluir' })
  @IsOptional()
  @IsBoolean()
  allowSkip?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  estimatedDurationMinutes?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  dripDays?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  availableFrom?: string;

  @ApiPropertyOptional({ description: 'Módulo pré-requisito' })
  @IsOptional()
  @IsInt()
  requiredModuleId?: number;

  @ApiPropertyOptional({ description: 'Competências associadas ao módulo', type: [Number] })
  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  competencyIds?: number[];
}

export class UpdateCourseModuleDto extends PartialType(CreateCourseModuleDto) {}

export class CreateLessonDto {
  @ApiProperty()
  @IsString()
  @MaxLength(200)
  title!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  code?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  learningObjectives?: string[];

  @ApiProperty({ enum: LessonType })
  @IsEnum(LessonType)
  type!: LessonType;

  @ApiPropertyOptional({ enum: LessonStatus })
  @IsOptional()
  @IsEnum(LessonStatus)
  status?: LessonStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  contentUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  textContent?: string;

  @ApiPropertyOptional({ description: 'Legendas (URL)' })
  @IsOptional()
  @IsString()
  captionsUrl?: string;

  @ApiPropertyOptional({ description: 'Transcrição do vídeo/áudio' })
  @IsOptional()
  @IsString()
  transcript?: string;

  @ApiProperty()
  @IsInt()
  @Min(0)
  seq!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  durationMinutes?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isFree?: boolean;

  @ApiPropertyOptional({ description: 'Aula obrigatória' })
  @IsOptional()
  @IsBoolean()
  mandatory?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  allowDownload?: boolean;

  @ApiPropertyOptional({ description: 'Tempo mínimo de visualização (segundos)' })
  @IsOptional()
  @IsInt()
  @Min(0)
  minWatchSeconds?: number;

  @ApiPropertyOptional({ description: 'Permitir avançar antes de concluir' })
  @IsOptional()
  @IsBoolean()
  allowSkip?: boolean;

  @ApiPropertyOptional({ description: 'Marcar automaticamente como concluída' })
  @IsOptional()
  @IsBoolean()
  autoComplete?: boolean;

  @ApiPropertyOptional({ description: 'Exigir conclusão de actividade' })
  @IsOptional()
  @IsBoolean()
  requiresActivity?: boolean;

  @ApiPropertyOptional({ description: 'Exigir avaliação' })
  @IsOptional()
  @IsBoolean()
  requiresAssessment?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  availableFrom?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  availableUntil?: string;

  @ApiPropertyOptional({ description: 'Aula pré-requisito' })
  @IsOptional()
  @IsInt()
  requiredLessonId?: number;

  @ApiPropertyOptional({ description: 'Data/hora da aula ao vivo (type=LIVE)' })
  @IsOptional()
  @IsDateString()
  liveDate?: string;

  @ApiPropertyOptional({ description: 'Link da sessão ao vivo (type=LIVE)' })
  @IsOptional()
  @IsString()
  liveSessionUrl?: string;

  @ApiPropertyOptional({ description: 'Instrutor da aula ao vivo (type=LIVE)' })
  @IsOptional()
  @IsInt()
  liveInstructorId?: number;
}

export class UpdateLessonDto extends PartialType(CreateLessonDto) {}

export class MarkLessonCompleteDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  watchedSeconds?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  resumePosition?: number;
}

export class CourseFilterDto extends BaseFilterDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional({ enum: CourseLevel })
  @IsOptional()
  @IsEnum(CourseLevel)
  level?: CourseLevel;

  @ApiPropertyOptional({ enum: CourseStatus })
  @IsOptional()
  @IsEnum(CourseStatus)
  status?: CourseStatus;

  @ApiPropertyOptional({ enum: CourseType })
  @IsOptional()
  @IsEnum(CourseType)
  type?: CourseType;

  @ApiPropertyOptional({ enum: CourseModality })
  @IsOptional()
  @IsEnum(CourseModality)
  modality?: CourseModality;

  @ApiPropertyOptional({ description: 'Unidade responsável (contains, case-insensitive)' })
  @IsOptional()
  @IsString()
  unit?: string;

  // @Type(() => Boolean) coage '?mandatory=false' para true — ver
  // [[project-innova-boolean-query-filter-coercion]]. @Type(() => String) +
  // @Transform evita a coerção Boolean automática do class-transformer.
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => String)
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  mandatory?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  departmentId?: number;
}

export class EnrollDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  deadline?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  mandatory?: boolean;
}

export class AssignCourseDto {
  @ApiProperty({ enum: AssignmentTarget })
  @IsEnum(AssignmentTarget)
  targetType!: AssignmentTarget;

  @ApiProperty()
  @IsInt()
  targetId!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  deadline?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  mandatory?: boolean;
}

export class QuizOptionDto {
  @ApiProperty()
  @IsString()
  text!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isCorrect?: boolean;
}

export class CreateQuizQuestionDto {
  @ApiProperty()
  @IsString()
  question!: string;

  @ApiProperty({ enum: QuizQuestionType })
  @IsEnum(QuizQuestionType)
  type!: QuizQuestionType;

  @ApiPropertyOptional({ type: [QuizOptionDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => QuizOptionDto)
  options?: QuizOptionDto[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  correctAnswer?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  points?: number;
}

export class CreateQuizDto {
  @ApiProperty()
  @IsString()
  title!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  passingScore?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  maxAttempts?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  timeLimitMinutes?: number;

  @ApiPropertyOptional({ description: 'Embaralhar perguntas' })
  @IsOptional()
  @IsBoolean()
  shuffleQuestions?: boolean;

  @ApiPropertyOptional({ description: 'Embaralhar respostas' })
  @IsOptional()
  @IsBoolean()
  shuffleAnswers?: boolean;

  @ApiPropertyOptional({ description: 'Mostrar respostas correctas após submissão' })
  @IsOptional()
  @IsBoolean()
  showCorrectAnswers?: boolean;

  @ApiPropertyOptional({ description: 'Feedback automático' })
  @IsOptional()
  @IsBoolean()
  autoFeedback?: boolean;

  @ApiProperty({ type: [CreateQuizQuestionDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateQuizQuestionDto)
  questions!: CreateQuizQuestionDto[];
}

export class UpdateQuizDto extends PartialType(CreateQuizDto) {}

export class SubmitQuizDto {
  @ApiProperty()
  answers!: Record<string, string>;
}

export class CourseFeedbackDto {
  @ApiProperty()
  @IsString()
  comment!: string;

  @ApiProperty()
  @IsInt()
  @Min(1)
  @Max(5)
  rating!: number;
}

// ── Actividades da lição ──────────────────────────────────────────────────

export class CreateLessonActivityDto {
  @ApiProperty({ enum: LessonActivityType })
  @IsEnum(LessonActivityType)
  type!: LessonActivityType;

  @ApiProperty()
  @IsString()
  @MaxLength(200)
  title!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  contentUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  seq?: number;
}

export class UpdateLessonActivityDto extends PartialType(CreateLessonActivityDto) {}

// ── Recursos da lição ────────────────────────────────────────────────────

export class CreateLessonResourceDto {
  @ApiProperty()
  @IsString()
  @MaxLength(200)
  title!: string;

  @ApiProperty()
  @IsAllowedFileUrl()
  url!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  fileType?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  fileSizeKb?: number;
}

export class UpdateLessonResourceDto extends PartialType(CreateLessonResourceDto) {}

// ── Grupos de audiência (visibilidade = SELECTED_GROUPS) ───────────────────

export class CreateCourseAudienceGroupDto {
  @ApiProperty()
  @IsString()
  @MaxLength(200)
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  userIds?: number[];
}

// ── Turmas (docs/modulo_courses.md secção 5) ────────────────────────────────

export class CreateCourseCohortDto {
  @ApiProperty()
  @IsString()
  @MaxLength(200)
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  instructorId?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  location?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  room?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  schedule?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  capacity?: number;

  @ApiProperty()
  @IsDateString()
  startDate!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  endDate?: string;
}

export class UpdateCourseCohortDto extends PartialType(CreateCourseCohortDto) {
  @ApiPropertyOptional({ enum: CourseCohortStatus })
  @IsOptional()
  @IsEnum(CourseCohortStatus)
  status?: CourseCohortStatus;
}

export class AddCohortParticipantsDto {
  @ApiProperty({ type: [Number] })
  @IsArray()
  @ArrayMinSize(1)
  @IsInt({ each: true })
  userIds!: number[];
}

export class MarkCohortAttendanceDto {
  @ApiProperty()
  @IsDateString()
  date!: string;

  @ApiProperty({ type: [Object], description: 'Lista de { userId, present, notes? }' })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CohortAttendanceEntryDto)
  records!: CohortAttendanceEntryDto[];
}

export class CohortAttendanceEntryDto {
  @ApiProperty()
  @IsInt()
  userId!: number;

  @ApiProperty()
  @IsBoolean()
  present!: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}

// ── Categorias (docs/modulo_courses.md secção 6) ────────────────────────────

export class CreateCourseCategoryDto {
  @ApiProperty()
  @IsString()
  @MaxLength(120)
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;
}

export class UpdateCourseCategoryDto extends PartialType(CreateCourseCategoryDto) {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateCourseAudienceGroupDto extends PartialType(CreateCourseAudienceGroupDto) {}
