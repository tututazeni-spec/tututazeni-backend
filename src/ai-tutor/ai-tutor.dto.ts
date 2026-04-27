// src/ai-tutor/ai-tutor.dto.ts
import {
  IsString, IsOptional, IsInt, IsPositive, Max, IsEnum, IsBoolean, Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export enum TutorPersonality {
  PROFESSIONAL = 'PROFESSIONAL',
  FRIENDLY     = 'FRIENDLY',
  COACH        = 'COACH',
  TECHNICAL    = 'TECHNICAL',
  GAMIFIED     = 'GAMIFIED',
}

export enum AgentAction {
  ENROLL_COURSE      = 'ENROLL_COURSE',
  UPDATE_PDI_ACTION  = 'UPDATE_PDI_ACTION',
  REQUEST_FEEDBACK   = 'REQUEST_FEEDBACK',
  NOTIFY_MANAGER     = 'NOTIFY_MANAGER',
  GENERATE_QUIZ      = 'GENERATE_QUIZ',
  GENERATE_SUMMARY   = 'GENERATE_SUMMARY',
  GENERATE_FLASHCARDS= 'GENERATE_FLASHCARDS',
}

// ─── Session ──────────────────────────────────────────────────────────────────

export class StartAiSessionDto {
  @ApiPropertyOptional({ description: 'ID do curso para tutor contextualizado' })
  @IsOptional() @IsInt() courseId?: number;

  @ApiPropertyOptional() @IsOptional() @IsInt()
  enrollmentId?: number;

  @ApiPropertyOptional() @IsOptional() @IsInt()
  lessonId?: number;

  @ApiPropertyOptional({ description: 'ID do PDI para contexto de desenvolvimento' })
  @IsOptional() @IsInt() planId?: number;

  @ApiPropertyOptional({ enum: TutorPersonality, default: TutorPersonality.FRIENDLY })
  @IsOptional() @IsEnum(TutorPersonality) personality?: TutorPersonality;
}

// ─── Message ──────────────────────────────────────────────────────────────────

export class SendAiMessageDto {
  @ApiProperty() @IsInt()
  sessionId!: number;

  @ApiProperty({ example: 'Qual a diferença entre crédito pessoal e crédito habitação?' })
  @IsString()
  message!: string;

  @ApiPropertyOptional({ default: 1024 })
  @IsOptional() @IsInt() @IsPositive() @Max(4096)
  maxTokens?: number;

  @ApiPropertyOptional({ description: 'Contexto extra (ex: conteúdo da lição actual)' })
  @IsOptional() @IsString()
  contextHint?: string;
}

// ─── Rating ───────────────────────────────────────────────────────────────────

export class RateMessageDto {
  @ApiProperty({ description: 'ID da mensagem ASSISTANT a avaliar' }) @IsInt()
  messageId!: number;

  @ApiProperty({ description: '1-5', minimum: 1, maximum: 5 })
  @IsInt() @Min(1) @Max(5)
  rating!: number;

  @ApiPropertyOptional() @IsOptional() @IsString()
  feedback?: string;
}

// ─── Agent ────────────────────────────────────────────────────────────────────

export class ExecuteAgentActionDto {
  @ApiProperty() @IsInt()
  sessionId!: number;

  @ApiProperty({ enum: AgentAction })
  @IsEnum(AgentAction)
  action!: AgentAction;

  @ApiProperty({ description: 'Parâmetros da acção (ex: { courseId: 5 })' })
  params!: Record<string, any>;

  @ApiProperty({ description: 'Confirmação explícita obrigatória' })
  @IsBoolean()
  confirmed!: boolean;
}

// ─── Generate ─────────────────────────────────────────────────────────────────

export class GenerateContentDto {
  @ApiProperty({ enum: ['QUIZ', 'FLASHCARDS', 'SUMMARY', 'STUDY_PLAN'] })
  @IsString()
  type!: 'QUIZ' | 'FLASHCARDS' | 'SUMMARY' | 'STUDY_PLAN';

  @ApiPropertyOptional() @IsOptional() @IsInt()
  courseId?: number;

  @ApiPropertyOptional() @IsOptional() @IsInt()
  lessonId?: number;

  @ApiPropertyOptional({ description: 'Tema livre se não houver curso' })
  @IsOptional() @IsString()
  topic?: string;

  @ApiPropertyOptional({ description: 'Número de perguntas/cards', default: 5 })
  @IsOptional() @IsInt() @Min(2) @Max(20)
  count?: number;
}

// ─── Filters ──────────────────────────────────────────────────────────────────

export class AiSessionFilterDto {
  @ApiPropertyOptional() @IsOptional() @IsInt() @Type(() => Number) courseId?: number;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() @Type(() => Boolean) activeOnly?: boolean;
  @ApiPropertyOptional({ default: 1 }) @IsOptional() @IsInt() @Min(1) @Type(() => Number) page?: number;
  @ApiPropertyOptional({ default: 20 }) @IsOptional() @IsInt() @Min(1) @Type(() => Number) limit?: number;
}