// src/avatar-training/dto/avatar-training.dto.ts
import {
  IsString,
  IsInt,
  IsNumber,
  IsArray,
  IsOptional,
  IsBoolean,
  IsEnum,
  IsDateString,
  IsObject,
  Min,
  Max,
  MaxLength,
  ValidateNested,
  ArrayMaxSize,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  AvatarTrainingAvatarType,
  AvatarTrainingAvatarStatus,
  AvatarTrainingStatus,
  AvatarTrainingExperienceType,
  AvatarTrainingAssignmentStatus,
  AvatarTrainingAttemptStatus,
  AvatarTrainingInteractionType,
  AvatarTrainingSourceType,
  AvatarTrainingProviderService,
  Difficulty,
} from '@prisma/client';

export {
  AvatarTrainingProviderService,
  AvatarTrainingAvatarType,
  AvatarTrainingAvatarStatus,
  AvatarTrainingStatus,
  AvatarTrainingExperienceType,
  AvatarTrainingAssignmentStatus,
  AvatarTrainingAttemptStatus,
  AvatarTrainingInteractionType,
  AvatarTrainingSourceType,
};

// ─── Avatares ────────────────────────────────────────────────────────────────

export class CreateTrainingAvatarDto {
  @ApiProperty()
  @IsString()
  @MaxLength(120)
  name: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiPropertyOptional({ enum: AvatarTrainingAvatarType })
  @IsOptional()
  @IsEnum(AvatarTrainingAvatarType)
  avatarType?: AvatarTrainingAvatarType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2048)
  imageUrl?: string;

  @ApiPropertyOptional({ description: 'Voz e parâmetros permitidos (guardado como JSON)' })
  @IsOptional()
  @IsObject()
  voiceConfig?: Record<string, unknown>;

  @ApiPropertyOptional({ default: 'pt' })
  @IsOptional()
  @IsString()
  @MaxLength(10)
  language?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(20)
  languageVariant?: string;

  @ApiPropertyOptional({ description: 'Tom de comunicação / perfil didáctico' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  tone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  specialty?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  provider?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  providerModel?: string;

  @ApiPropertyOptional({ description: 'Responsável pela gestão do avatar (userId)' })
  @IsOptional()
  @IsInt()
  responsibleId?: number;
}

export class UpdateTrainingAvatarDto extends PartialType(CreateTrainingAvatarDto) {}

export class SetAvatarStatusDto {
  @ApiProperty({ enum: AvatarTrainingAvatarStatus })
  @IsEnum(AvatarTrainingAvatarStatus)
  status: AvatarTrainingAvatarStatus;
}

export class AvatarFilterDto {
  @ApiPropertyOptional({ enum: AvatarTrainingAvatarStatus })
  @IsOptional()
  @IsEnum(AvatarTrainingAvatarStatus)
  status?: AvatarTrainingAvatarStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  language?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  search?: string;
}

// ─── Formações (programas) ───────────────────────────────────────────────────

export class CreateAvatarProgramDto {
  @ApiPropertyOptional({ description: 'Gerado automaticamente (AVT-0001) se omitido' })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  code?: string;

  @ApiProperty()
  @IsString()
  @MaxLength(200)
  title: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(30)
  objectives?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  category?: string;

  @ApiPropertyOptional({ enum: Difficulty })
  @IsOptional()
  @IsEnum(Difficulty)
  difficulty?: Difficulty;

  @ApiPropertyOptional({ enum: AvatarTrainingExperienceType })
  @IsOptional()
  @IsEnum(AvatarTrainingExperienceType)
  experienceType?: AvatarTrainingExperienceType;

  @ApiPropertyOptional({ description: 'Curso associado (Courses)' })
  @IsOptional()
  @IsInt()
  courseId?: number;

  @ApiPropertyOptional({ description: 'Módulo do curso associado' })
  @IsOptional()
  @IsInt()
  moduleId?: number;

  @ApiPropertyOptional({ description: 'Avatar por defeito' })
  @IsOptional()
  @IsInt()
  avatarId?: number;

  @ApiPropertyOptional({ description: 'Formador humano responsável pelo conteúdo' })
  @IsOptional()
  @IsInt()
  responsibleId?: number;

  @ApiPropertyOptional({ type: [Number] })
  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  targetDepartmentIds?: number[];

  @ApiPropertyOptional({ type: [String], description: 'Nomes de papéis (Role.name)' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  targetRoleNames?: string[];

  @ApiPropertyOptional({ default: 'pt' })
  @IsOptional()
  @IsString()
  @MaxLength(10)
  language?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1440)
  durationMinutes?: number;

  @ApiPropertyOptional({ type: [Number], description: 'Cursos que têm de estar concluídos' })
  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  prerequisiteCourseIds?: number[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  certificateEnabled?: boolean;
}

export class UpdateAvatarProgramDto extends PartialType(CreateAvatarProgramDto) {}

export class AvatarProgramFilterDto {
  @ApiPropertyOptional({ enum: AvatarTrainingStatus })
  @IsOptional()
  @IsEnum(AvatarTrainingStatus)
  status?: AvatarTrainingStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  courseId?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  search?: string;
}

// ─── Sessões e etapas ────────────────────────────────────────────────────────

export enum AvatarStepType {
  CONTENT = 'CONTENT',
  QUESTION = 'QUESTION',
  SCENARIO = 'SCENARIO',
  EXERCISE = 'EXERCISE',
}

export enum AvatarQuestionKind {
  SINGLE = 'SINGLE',
  TRUE_FALSE = 'TRUE_FALSE',
  SHORT = 'SHORT',
}

export class StepQuestionDto {
  @ApiProperty({ enum: AvatarQuestionKind })
  @IsEnum(AvatarQuestionKind)
  kind: AvatarQuestionKind;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  options?: string[];

  @ApiPropertyOptional({ description: 'Resposta correcta (nunca devolvida ao formando)' })
  @IsOptional()
  @IsString()
  correctAnswer?: string;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  weight?: number;

  @ApiPropertyOptional({ description: 'Explicação apresentada após a resposta' })
  @IsOptional()
  @IsString()
  explanation?: string;
}

export class SessionStepDto {
  @ApiProperty({ description: 'Chave única da etapa dentro da sessão' })
  @IsString()
  @MaxLength(60)
  key: string;

  @ApiProperty()
  @IsString()
  @MaxLength(200)
  title: string;

  @ApiProperty({ enum: AvatarStepType })
  @IsEnum(AvatarStepType)
  type: AvatarStepType;

  @ApiPropertyOptional({ description: 'Texto que o avatar apresenta' })
  @IsOptional()
  @IsString()
  content?: string;

  @ApiPropertyOptional({ description: 'Slide, imagem, vídeo ou documento aprovado' })
  @IsOptional()
  @IsString()
  @MaxLength(2048)
  resourceUrl?: string;

  @ApiPropertyOptional({ type: StepQuestionDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => StepQuestionDto)
  question?: StepQuestionDto;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  mandatory?: boolean;
}

export class CreateAvatarSessionDto {
  @ApiProperty()
  @IsInt()
  programId: number;

  @ApiProperty()
  @IsString()
  @MaxLength(200)
  title: string;

  @ApiPropertyOptional({ description: 'Sobrepõe o avatar do programa' })
  @IsOptional()
  @IsInt()
  avatarId?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  position?: number;

  @ApiPropertyOptional({ enum: AvatarTrainingExperienceType })
  @IsOptional()
  @IsEnum(AvatarTrainingExperienceType)
  experienceType?: AvatarTrainingExperienceType;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  objectives?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  welcomeMessage?: string;

  @ApiPropertyOptional({ type: [SessionStepDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => SessionStepDto)
  steps?: SessionStepDto[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1440)
  durationMinutes?: number;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  mandatory?: boolean;
}

export class UpdateAvatarSessionDto extends PartialType(CreateAvatarSessionDto) {}

export class AvatarSessionFilterDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  programId?: number;

  @ApiPropertyOptional({ enum: AvatarTrainingStatus })
  @IsOptional()
  @IsEnum(AvatarTrainingStatus)
  status?: AvatarTrainingStatus;
}

// ─── Avaliação, fontes e atribuição ──────────────────────────────────────────

export class RubricCriterionDto {
  @ApiProperty()
  @IsString()
  @MaxLength(60)
  key: string;

  @ApiProperty()
  @IsString()
  @MaxLength(200)
  label: string;

  @ApiProperty({ description: 'Peso em % — a soma dos critérios tem de ser 100' })
  @IsNumber()
  @Min(0)
  @Max(100)
  weight: number;
}

export class UpsertSessionAssessmentDto {
  @ApiPropertyOptional({ description: 'Avaliação formal existente (Assessments)' })
  @IsOptional()
  @IsInt()
  assessmentId?: number;

  @ApiPropertyOptional({ type: [RubricCriterionDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RubricCriterionDto)
  rubric?: RubricCriterionDto[];

  @ApiPropertyOptional({ default: 70 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  passingScore?: number;

  @ApiPropertyOptional({ default: 0, description: '0 = ilimitadas' })
  @IsOptional()
  @IsInt()
  @Min(0)
  maxAttempts?: number;

  @ApiPropertyOptional({ description: 'Exigir aprovação na avaliação formal para concluir' })
  @IsOptional()
  @IsBoolean()
  requireFormalAssessment?: boolean;
}

export class AddKnowledgeSourceDto {
  @ApiProperty({ enum: AvatarTrainingSourceType })
  @IsEnum(AvatarTrainingSourceType)
  sourceType: AvatarTrainingSourceType;

  @ApiProperty({ description: 'Id do curso, lição, documento ou item da biblioteca' })
  @IsString()
  @MaxLength(60)
  sourceId: string;
}

export class AssignAvatarSessionDto {
  @ApiProperty({ type: [Number] })
  @IsArray()
  @ArrayMaxSize(500)
  @IsInt({ each: true })
  userIds: number[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  mandatory?: boolean;

  @ApiPropertyOptional({
    description: 'Inscrever no curso associado se ainda não estiver inscrito',
  })
  @IsOptional()
  @IsBoolean()
  autoEnroll?: boolean;
}

// ─── Tentativas ──────────────────────────────────────────────────────────────

export class StartAttemptDto {
  @ApiPropertyOptional({ default: true, description: 'Interacção apenas por texto' })
  @IsOptional()
  @IsBoolean()
  textOnly?: boolean;
}

export enum LearnerInteractionType {
  USER_MESSAGE = 'USER_MESSAGE',
  USER_ANSWER = 'USER_ANSWER',
  STEP_ADVANCE = 'STEP_ADVANCE',
  HELP_REQUEST = 'HELP_REQUEST',
}

export class RecordInteractionDto {
  @ApiProperty({ enum: LearnerInteractionType })
  @IsEnum(LearnerInteractionType)
  interactionType: LearnerInteractionType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(60)
  stepKey?: string;

  @ApiProperty()
  @IsString()
  @MaxLength(5000)
  content: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

// ─── AI-Tutor (fase 4) ───────────────────────────────────────────────────────

export enum TutorRequestMode {
  ASK = 'ASK',
  EXPLAIN_DIFFERENTLY = 'EXPLAIN_DIFFERENTLY',
  EXAMPLE = 'EXAMPLE',
  PRACTICE_EXERCISE = 'PRACTICE_EXERCISE',
}

export class AskTutorDto {
  @ApiPropertyOptional({ description: 'Dúvida do formando (obrigatória no modo ASK)' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  question?: string;

  @ApiPropertyOptional({ description: 'Etapa actual — único contexto de sessão enviado ao tutor' })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  stepKey?: string;

  @ApiPropertyOptional({ enum: TutorRequestMode, default: TutorRequestMode.ASK })
  @IsOptional()
  @IsEnum(TutorRequestMode)
  mode?: TutorRequestMode;
}

export class SubmitAnswerDto {
  @ApiProperty()
  @IsString()
  @MaxLength(60)
  stepKey: string;

  @ApiProperty()
  @IsString()
  @MaxLength(5000)
  answer: string;
}

export class SubmitAttemptDto {
  @ApiPropertyOptional({ type: [SubmitAnswerDto], description: 'Respostas ainda não registadas' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => SubmitAnswerDto)
  answers?: SubmitAnswerDto[];
}

export class CriterionScoreDto {
  @ApiProperty()
  @IsString()
  key: string;

  @ApiProperty({ description: '0-100' })
  @IsNumber()
  @Min(0)
  @Max(100)
  score: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  comment?: string;
}

export class ReviewAttemptDto {
  @ApiProperty({ type: [CriterionScoreDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CriterionScoreDto)
  criteria: CriterionScoreDto[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  feedback?: string;
}

// ─── Progresso e histórico ───────────────────────────────────────────────────

export class AvatarProgressFilterDto {
  @ApiPropertyOptional({ description: 'Só para perfis com acesso alargado' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  userId?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  programId?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  departmentId?: number;

  @ApiPropertyOptional({ enum: AvatarTrainingAssignmentStatus })
  @IsOptional()
  @IsEnum(AvatarTrainingAssignmentStatus)
  status?: AvatarTrainingAssignmentStatus;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}

// ── Fase 5 — voz e vídeo ─────────────────────────────────────────────────────

export class SetMediaPreferencesDto {
  @ApiProperty({ description: 'true activa a voz; false volta ao modo só texto' })
  @IsBoolean()
  voiceEnabled: boolean;

  @ApiPropertyOptional({
    description:
      'Obrigatório ao activar a voz: o formando reconhece a utilização de voz sintetizada, microfone opcional e serviços de IA',
  })
  @IsOptional()
  @IsBoolean()
  acknowledgedNotice?: boolean;

  @ApiPropertyOptional({ description: 'Legendas sincronizadas (por omissão sempre activas)' })
  @IsOptional()
  @IsBoolean()
  captions?: boolean;
}

export class SynthesizeSpeechDto {
  @ApiPropertyOptional({ description: 'Etapa da sessão cujo texto será lido' })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  stepKey?: string;

  @ApiPropertyOptional({ description: 'Resposta do AI-Tutor (aiMessageId) a ler em voz' })
  @IsOptional()
  @IsInt()
  @Min(1)
  aiMessageId?: number;
}

export class CaptionsQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(60)
  stepKey?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  aiMessageId?: number;
}

export class UpsertProviderConfigDto {
  @ApiPropertyOptional({ enum: ['ACTIVE', 'DISABLED'] })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  status?: 'ACTIVE' | 'DISABLED';

  @ApiPropertyOptional({ description: 'Custo estimado por unidade (carácter para TTS)' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  costPerUnit?: number;

  @ApiPropertyOptional({ description: 'Limite de unidades (caracteres) por tentativa' })
  @IsOptional()
  @IsInt()
  @Min(1)
  unitLimitPerAttempt?: number;

  @ApiPropertyOptional({ description: 'Limite mensal de custo estimado' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  monthlyCostLimit?: number;

  @ApiPropertyOptional({ description: 'Parâmetros não secretos (modelo, estabilidade, …)' })
  @IsOptional()
  @IsObject()
  configuration?: Record<string, unknown>;
}

export class UsageSummaryQueryDto {
  @ApiPropertyOptional({ description: 'Início do período (ISO)' })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({ description: 'Fim do período (ISO)' })
  @IsOptional()
  @IsDateString()
  to?: string;
}
