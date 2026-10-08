// src/ai-tutor/ai-tutor.dto.ts
import {
  IsString,
  IsOptional,
  IsInt,
  IsPositive,
  Max,
  IsEnum,
  IsBoolean,
  IsObject,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type, Transform } from 'class-transformer';
import { BaseFilterDto } from '../common/dtos/pagination.dto';

export enum TutorPersonality {
  PROFESSIONAL = 'PROFESSIONAL',
  FRIENDLY = 'FRIENDLY',
  COACH = 'COACH',
  TECHNICAL = 'TECHNICAL',
  GAMIFIED = 'GAMIFIED',
}

export enum AgentAction {
  ENROLL_COURSE = 'ENROLL_COURSE',
  UPDATE_PDI_ACTION = 'UPDATE_PDI_ACTION',
  REQUEST_FEEDBACK = 'REQUEST_FEEDBACK',
  NOTIFY_MANAGER = 'NOTIFY_MANAGER',
  GENERATE_QUIZ = 'GENERATE_QUIZ',
  GENERATE_SUMMARY = 'GENERATE_SUMMARY',
  GENERATE_FLASHCARDS = 'GENERATE_FLASHCARDS',
}

// ─── Session ──────────────────────────────────────────────────────────────────

export class StartAiSessionDto {
  @ApiPropertyOptional({ description: 'ID do curso para tutor contextualizado' })
  @IsOptional()
  @IsInt()
  courseId?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  enrollmentId?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  lessonId?: number;

  @ApiPropertyOptional({ description: 'ID do PDI para contexto de desenvolvimento' })
  @IsOptional()
  @IsInt()
  planId?: number;

  @ApiPropertyOptional({ description: 'ID da Formação (Training) para tutor contextualizado' })
  @IsOptional()
  @IsInt()
  trainingId?: number;

  @ApiPropertyOptional({ enum: TutorPersonality, default: TutorPersonality.FRIENDLY })
  @IsOptional()
  @IsEnum(TutorPersonality)
  personality?: TutorPersonality;
}

// ─── Message ──────────────────────────────────────────────────────────────────

export class SendAiMessageDto {
  @ApiProperty()
  @IsInt()
  sessionId!: number;

  @ApiProperty({ example: 'Qual a diferença entre crédito pessoal e crédito habitação?' })
  @IsString()
  message!: string;

  @ApiPropertyOptional({ default: 1024 })
  @IsOptional()
  @IsInt()
  @IsPositive()
  @Max(4096)
  maxTokens?: number;

  @ApiPropertyOptional({ description: 'Contexto extra (ex: conteúdo da lição actual)' })
  @IsOptional()
  @IsString()
  contextHint?: string;
}

// ─── Rating ───────────────────────────────────────────────────────────────────

export class RateMessageDto {
  @ApiProperty({ description: 'ID da mensagem ASSISTANT a avaliar' })
  @IsInt()
  messageId!: number;

  @ApiProperty({ description: '1-5', minimum: 1, maximum: 5 })
  @IsInt()
  @Min(1)
  @Max(5)
  rating!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  feedback?: string;
}

// ─── Agent ────────────────────────────────────────────────────────────────────

export class ExecuteAgentActionDto {
  @ApiProperty()
  @IsInt()
  sessionId!: number;

  @ApiProperty({ enum: AgentAction })
  @IsEnum(AgentAction)
  action!: AgentAction;

  @ApiProperty({ description: 'Parâmetros da acção (ex: { courseId: 5 })' })
  @IsObject()
  params!: Record<string, unknown>;

  @ApiProperty({ description: 'Confirmação explícita obrigatória' })
  @IsBoolean()
  confirmed!: boolean;
}

// ─── Generate ─────────────────────────────────────────────────────────────────

export const EXERCISE_TYPES = [
  'QUIZ',
  'TRUE_FALSE',
  'OPEN_QUESTION',
  'PRACTICAL_CASE',
  'SIMULATION',
  'SCENARIO',
  'FLASHCARDS',
] as const;

export type ExerciseType = (typeof EXERCISE_TYPES)[number];

export class GenerateContentDto {
  @ApiProperty({ enum: [...EXERCISE_TYPES, 'SUMMARY', 'STUDY_PLAN'] })
  @IsString()
  type!: ExerciseType | 'SUMMARY' | 'STUDY_PLAN';

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  courseId?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  lessonId?: number;

  @ApiPropertyOptional({ description: 'ID da Formação (Training) para gerar exercícios' })
  @IsOptional()
  @IsInt()
  trainingId?: number;

  @ApiPropertyOptional({ description: 'Tema livre se não houver curso' })
  @IsOptional()
  @IsString()
  topic?: string;

  @ApiPropertyOptional({ description: 'Número de perguntas/cards', default: 5 })
  @IsOptional()
  @IsInt()
  @Min(2)
  @Max(20)
  count?: number;
}

// ─── Feedback de exercícios ────────────────────────────────────────────────────

export class ExerciseFeedbackDto {
  @ApiProperty({ enum: ['OPEN_QUESTION', 'PRACTICAL_CASE', 'SIMULATION', 'SCENARIO'] })
  @IsEnum(['OPEN_QUESTION', 'PRACTICAL_CASE', 'SIMULATION', 'SCENARIO'])
  exerciseType!: 'OPEN_QUESTION' | 'PRACTICAL_CASE' | 'SIMULATION' | 'SCENARIO';

  @ApiProperty({ description: 'Enunciado da pergunta/caso/cenário' })
  @IsString()
  question!: string;

  @ApiProperty({ description: 'Resposta dada pelo colaborador' })
  @IsString()
  userAnswer!: string;

  @ApiPropertyOptional({ description: 'Resposta-modelo ou pontos-chave esperados' })
  @IsOptional()
  @IsString()
  modelAnswer?: string;
}

// ─── Base de Conhecimento ───────────────────────────────────────────────────────

export class KnowledgeSearchDto {
  @ApiProperty({ description: 'Texto a pesquisar na base de conhecimento autorizada' })
  @IsString()
  q!: string;

  @ApiPropertyOptional({ default: 5 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(20)
  @Type(() => Number)
  limit?: number;
}

// ─── Filters ──────────────────────────────────────────────────────────────────

export class AiSessionFilterDto extends BaseFilterDto {
  @ApiPropertyOptional() @IsOptional() @IsInt() @Type(() => Number) courseId?: number;
  // @Type(() => Boolean) coage '?activeOnly=false' para true — ver
  // [[project-innova-boolean-query-filter-coercion]]. @Type(() => String) +
  // @Transform evita a coerção Boolean automática do class-transformer.
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => String)
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  activeOnly?: boolean;
}

export class AdminSessionFilterDto extends BaseFilterDto {
  @ApiPropertyOptional() @IsOptional() @IsInt() @Type(() => Number) userId?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Type(() => Number) courseId?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() dateFrom?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() dateTo?: string;
}

// ─── Recomendações (secção 6/7 — histórico e aceitação) ─────────────────────────

export class AcceptRecommendationDto {
  @ApiProperty({ description: 'Curso recomendado que o colaborador aceitou' })
  @IsInt()
  courseId!: number;
}

// ─── Configurações (secção 8) ──────────────────────────────────────────────────

export class UpdateAiTutorSettingsDto {
  @ApiPropertyOptional({ description: 'Permitir respostas fora da base de conhecimento' })
  @IsOptional()
  @IsBoolean()
  allowOutsideKnowledge?: boolean;

  @ApiPropertyOptional({
    description: 'Responder apenas com informação encontrada nas fontes autorizadas',
  })
  @IsOptional()
  @IsBoolean()
  sourceOnlyMode?: boolean;

  @ApiPropertyOptional({ description: 'Incluir "Fonte: ..." nas respostas' })
  @IsOptional()
  @IsBoolean()
  showSources?: boolean;

  @ApiPropertyOptional({ minimum: 0, maximum: 1 })
  @IsOptional()
  @Min(0)
  @Max(1)
  temperature?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  defaultLanguage?: string;

  @ApiPropertyOptional({ description: 'Máximo de perguntas por colaborador por dia' })
  @IsOptional()
  @IsInt()
  @Min(1)
  dailyMessageLimit?: number;

  @ApiPropertyOptional({ description: 'Dias de retenção do histórico de sessões' })
  @IsOptional()
  @IsInt()
  @Min(1)
  historyRetentionDays?: number;

  @ApiPropertyOptional({ description: 'Texto adicional anexado ao prompt de sistema' })
  @IsOptional()
  @IsString()
  customSystemPromptAddendum?: string;
}
