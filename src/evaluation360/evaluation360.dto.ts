// ============================================================
// INNOVA PLATFORM — AVALIAÇÃO 360º — DTOs
// src/modules/evaluation360/evaluation360.dto.ts
// ============================================================

import {
  IsString,
  IsOptional,
  IsEnum,
  IsInt,
  IsBoolean,
  IsArray,
  IsNumber,
  IsDateString,
  IsNotEmpty,
  Min,
  Max,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import {
  CompetencyType,
  CompetencyCategory,
  EvaluationModel,
  Eval360CycleType,
  Eval360CycleStatus,
  AnonymityMode,
  EvaluatorRole,
  Eval360QuestionType,
  Eval360FeedbackType,
  CycleParticipantStatus,
  EvaluatorAssignmentStatus,
  Eval360QuestionnaireStatus,
} from '@prisma/client';

// ─── ENUMS ───────────────────────────────────────────────────
export {
  CompetencyType,
  EvaluationModel,
  Eval360CycleType,
  Eval360CycleStatus,
  AnonymityMode,
  EvaluatorRole,
  Eval360QuestionType,
  Eval360FeedbackType,
  CycleParticipantStatus,
  EvaluatorAssignmentStatus,
  Eval360QuestionnaireStatus,
};

// ─── COMPETENCY ──────────────────────────────────────────────
export class CompetencyIndicatorDto {
  @ApiProperty() @IsInt() @Min(1) @Max(10) level: number;
  @ApiProperty() @IsString() @IsNotEmpty() description: string;
  @ApiPropertyOptional() @IsOptional() @IsString() examples?: string;
}

export class Evaluation360CreateCompetencyDto {
  @ApiProperty() @IsString() @IsNotEmpty() @MaxLength(120) name: string;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
  @ApiProperty({ enum: CompetencyType }) @IsEnum(CompetencyType) type: CompetencyType;
  @ApiPropertyOptional({ enum: CompetencyCategory })
  @IsOptional()
  @IsEnum(CompetencyCategory)
  category?: CompetencyCategory;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) scaleMin?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(2) @Max(10) scaleMax?: number;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isGlobal?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsString() tenantId?: string;
  @ApiPropertyOptional({ type: [CompetencyIndicatorDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CompetencyIndicatorDto)
  indicators?: CompetencyIndicatorDto[];
}

export class Evaluation360UpdateCompetencyDto extends PartialType(
  Evaluation360CreateCompetencyDto,
) {}

// ─── CYCLE COMPETENCY ────────────────────────────────────────
export class CycleCompetencyDto {
  @ApiProperty() @IsString() competencyId: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) weight?: number;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isRequired?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) order?: number;
  // "Nível esperado" (docs/evaluation360.md §3) — usado no separador
  // Resultados para o gap face ao esperado.
  @ApiPropertyOptional() @IsOptional() @IsNumber() expectedLevel?: number;
}

// ─── EVALUATION CYCLE ────────────────────────────────────────
export class CreateEvaluationCycleDto {
  @ApiProperty() @IsString() @IsNotEmpty() tenantId: string;
  @ApiProperty() @IsString() @IsNotEmpty() @MaxLength(150) name: string;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
  @ApiProperty({ enum: EvaluationModel }) @IsEnum(EvaluationModel) model: EvaluationModel;
  @ApiProperty({ enum: Eval360CycleType }) @IsEnum(Eval360CycleType) type: Eval360CycleType;
  @ApiProperty() @IsDateString() startDate: string;
  @ApiProperty() @IsDateString() endDate: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) gracePeriodDays?: number;
  @ApiPropertyOptional({ enum: AnonymityMode })
  @IsOptional()
  @IsEnum(AnonymityMode)
  anonymityMode?: AnonymityMode;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) quorumMinimum?: number;

  // Pesos (devem somar 100)
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) @Max(100) weightSelf?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) @Max(100) weightManager?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) @Max(100) weightPeer?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) @Max(100) weightSubordinate?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) @Max(100) weightExternal?: number;

  // Réguas de corte
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) @Max(10) cutoffPromotion?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) @Max(10) cutoffBonus?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) @Max(10) cutoffProgram?: number;

  // Integrações
  @ApiPropertyOptional() @IsOptional() @IsBoolean() linkedToPdi?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() linkedToBonus?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() linkedToOkrs?: boolean;

  @ApiPropertyOptional({ type: [CycleCompetencyDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CycleCompetencyDto)
  competencies?: CycleCompetencyDto[];

  // Questionário (docs/evaluation360.md §6) usado para semear competências +
  // perguntas do ciclo — alternativa a `competencies` avulsas/doutrina-padrão.
  @ApiPropertyOptional() @IsOptional() @IsString() questionnaireId?: string;
}

export class UpdateEvaluationCycleDto extends PartialType(CreateEvaluationCycleDto) {}

export class PublishCycleDto {
  @ApiPropertyOptional({ description: 'Se true, envia convites imediatamente' })
  @IsOptional()
  @IsBoolean()
  sendInvitesNow?: boolean;
}

// ─── QUESTIONS ───────────────────────────────────────────────
export class Evaluation360CreateQuestionDto {
  @ApiPropertyOptional() @IsOptional() @IsString() cycleId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() competencyId?: string;
  @ApiProperty() @IsString() @IsNotEmpty() text: string;
  @ApiProperty({ enum: Eval360QuestionType })
  @IsEnum(Eval360QuestionType)
  type: Eval360QuestionType;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isRequired?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isOpen?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) order?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() scaleMin?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() scaleMax?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() scaleLabels?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() options?: string;
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() applicableTo?: string[];
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() targetPositions?: string[];
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() targetLevels?: string[];
}

// ─── QUESTIONÁRIOS (docs/evaluation360.md §6) ─────────────────
export class QuestionnaireQuestionDto {
  @ApiPropertyOptional() @IsOptional() @IsString() competencyId?: string;
  @ApiProperty() @IsString() @IsNotEmpty() text: string;
  @ApiProperty({ enum: Eval360QuestionType })
  @IsEnum(Eval360QuestionType)
  type: Eval360QuestionType;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isRequired?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() allowComment?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) order?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() scaleMin?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() scaleMax?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() scaleLabels?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() options?: string;
}

export class QuestionnaireCompetencyDto {
  @ApiProperty() @IsString() competencyId: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) order?: number;
}

export class CreateEvaluationQuestionnaireDto {
  @ApiProperty() @IsString() @IsNotEmpty() tenantId: string;
  @ApiProperty() @IsString() @IsNotEmpty() @MaxLength(150) name: string;
  @ApiProperty() @IsString() @IsNotEmpty() @MaxLength(60) code: string;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() instructions?: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) scaleMin?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(2) @Max(10) scaleMax?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() scaleLabels?: string;

  @ApiPropertyOptional({ type: [QuestionnaireCompetencyDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => QuestionnaireCompetencyDto)
  competencies?: QuestionnaireCompetencyDto[];

  @ApiPropertyOptional({ type: [QuestionnaireQuestionDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => QuestionnaireQuestionDto)
  questions?: QuestionnaireQuestionDto[];
}

export class UpdateEvaluationQuestionnaireDto extends PartialType(
  CreateEvaluationQuestionnaireDto,
) {}

// ─── PARTICIPANTS ─────────────────────────────────────────────
export class AddParticipantsDto {
  @ApiProperty({ type: [String] }) @IsArray() @IsString({ each: true }) userIds: string[];
}

export class AddParticipantsByDepartmentDto {
  @ApiProperty({
    type: [String],
    description:
      'IDs de Department (todos os utilizadores activos destes departamentos entram como participantes)',
  })
  @IsArray()
  @IsString({ each: true })
  departmentIds: string[];
}

export class ConsentDto {
  @ApiProperty() @IsBoolean() consent: boolean;
}

// ─── EVALUATOR ASSIGNMENTS ────────────────────────────────────
export class SuggestEvaluatorsDto {
  @ApiProperty() @IsString() evaluateeId: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) maxPerRole?: number;
}

export class Evaluation360AssignEvaluatorDto {
  @ApiProperty() @IsString() evaluateeId: string;
  @ApiProperty() @IsString() evaluatorId: string;
  @ApiProperty({ enum: EvaluatorRole }) @IsEnum(EvaluatorRole) role: EvaluatorRole;
}

export class BulkAssignEvaluatorsDto {
  @ApiProperty({ type: [Evaluation360AssignEvaluatorDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => Evaluation360AssignEvaluatorDto)
  assignments: Evaluation360AssignEvaluatorDto[];
}

export class ApproveEvaluatorsDto {
  @ApiProperty({ type: [String] }) @IsArray() @IsString({ each: true }) assignmentIds: string[];
}

// ─── RESPONSES ───────────────────────────────────────────────
export class Evaluation360AnswerDto {
  @ApiProperty() @IsString() questionId: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() numericValue?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(2000) textValue?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() choiceValue?: string;
}

export class SubmitResponseDto {
  @ApiProperty({ type: [Evaluation360AnswerDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => Evaluation360AnswerDto)
  answers: Evaluation360AnswerDto[];

  @ApiPropertyOptional({ description: 'Se true, envia definitivamente. Se false, salva rascunho.' })
  @IsOptional()
  @IsBoolean()
  submit?: boolean;
}

// ─── CONTINUOUS FEEDBACK ─────────────────────────────────────
export class CreateContinuousFeedbackDto {
  @ApiProperty() @IsString() tenantId: string;
  @ApiProperty() @IsString() toUserId: string;
  @ApiProperty({ enum: Eval360FeedbackType })
  @IsEnum(Eval360FeedbackType)
  type: Eval360FeedbackType;
  @ApiProperty() @IsString() @IsNotEmpty() @MaxLength(1000) message: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isPrivate?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsString() competencyId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() relatedCycleId?: string;
}

// Separador "Feedback" (docs/evaluation360.md §8) — comentários qualitativos
// das respostas já submetidas num ciclo, distintos do feedback contínuo
// acima (esse é sempre "recebido por mim", fora de qualquer ciclo). Sem
// filtro nenhum devolve todo o feedback do ciclo ao alcance do requisitante
// (ownership resolvida no service, igual a getParticipantDetailForAdmin).
export class CycleFeedbackQueryDto {
  @ApiPropertyOptional() @IsOptional() @IsString() evaluateeId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() competencyId?: string;
  @ApiPropertyOptional({ enum: EvaluatorRole })
  @IsOptional()
  @IsEnum(EvaluatorRole)
  evaluatorRole?: EvaluatorRole;
}

// ─── PULSE SURVEY ────────────────────────────────────────────
export class CreatePulseSurveyDto {
  @ApiProperty() @IsString() tenantId: string;
  @ApiProperty() @IsString() @IsNotEmpty() title: string;
  @ApiProperty() @IsString() questions: string; // JSON array
  @ApiProperty({ type: [String] }) @IsArray() @IsString({ each: true }) targetUserIds: string[];
  @ApiProperty() @IsDateString() closesAt: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isAnonymous?: boolean;
}

export class SubmitPulseSurveyDto {
  @ApiProperty() @IsString() answersJson: string;
}

// ─── ANALYTICS QUERY ─────────────────────────────────────────
export class AnalyticsQueryDto {
  @ApiPropertyOptional() @IsOptional() @IsString() tenantId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() userId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() departmentId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() cycleId?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() from?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() to?: string;
}

export class NineBoxQueryDto {
  @ApiProperty() @IsString() cycleId: string;
  @ApiPropertyOptional() @IsOptional() @IsString() departmentId?: string;
}

// ─── RESULT / REPORT ─────────────────────────────────────────
export class GenerateReportDto {
  @ApiProperty() @IsString() cycleId: string;
  @ApiPropertyOptional() @IsOptional() @IsString() participantId?: string; // null = organizacional
  @ApiPropertyOptional({ enum: ['INDIVIDUAL', 'TEAM', 'ORGANIZATIONAL'] })
  @IsOptional()
  @IsString()
  scope?: 'INDIVIDUAL' | 'TEAM' | 'ORGANIZATIONAL';
  @ApiPropertyOptional() @IsOptional() @IsBoolean() includeAiInsights?: boolean;
}

// ─── RELATÓRIOS (docs/evaluation360.md §9) ────────────────────
// Filtros do documento: Período, Ciclo, Unidade, Departamento, Cargo,
// Competência, Grupo de avaliador, Estado. Ciclo é sempre um path param
// (getCycleReport) ou o `cycleIds` abaixo (evolução/comparação); os restantes
// aplicam-se ao relatório de um ciclo concreto.
export class CycleReportQueryDto {
  @ApiPropertyOptional() @IsOptional() @IsString() departmentId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() unitId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() positionId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() competencyId?: string;
  // "Grupo de avaliador" (§9) — só se aplica à lista de avaliadores
  // pendentes; as médias por grupo (byEvaluatorGroup) mostram sempre todos
  // os grupos lado a lado, filtrar aí esvaziaria a comparação que a própria
  // vista existe para mostrar.
  @ApiPropertyOptional({ enum: EvaluatorRole })
  @IsOptional()
  @IsEnum(EvaluatorRole)
  evaluatorRole?: EvaluatorRole;
}

// "Evolução entre ciclos"/"Comparação entre ciclos" (docs/evaluation360.md
// §9) — a mesma série de pontos por ciclo; passar `cycleIds` restringe a
// série aos ciclos escolhidos (comparação), omiti-lo devolve a evolução
// completa filtrada por tipo/estado/período.
export class CycleEvolutionQueryDto {
  @ApiPropertyOptional({
    description: 'IDs de ciclo separados por vírgula — restringe a comparação a ciclos específicos',
  })
  @IsOptional()
  @IsString()
  cycleIds?: string;
  @ApiPropertyOptional({ enum: Eval360CycleType })
  @IsOptional()
  @IsEnum(Eval360CycleType)
  type?: Eval360CycleType;
  @ApiPropertyOptional({ enum: Eval360CycleStatus })
  @IsOptional()
  @IsEnum(Eval360CycleStatus)
  status?: Eval360CycleStatus;
  @ApiPropertyOptional() @IsOptional() @IsDateString() from?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() to?: string;
}

// ─── CALIBRATION ─────────────────────────────────────────────
// Nota: Evaluation360CalibrateScoreDto (matriz de calibração RH) foi
// removido junto com calibrateScore() — ver evaluation360.service.ts.

// ─── REMINDERS ───────────────────────────────────────────────
export class SendRemindersDto {
  @ApiPropertyOptional({ description: 'Se não fornecido, envia para todos os pendentes' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  assignmentIds?: string[];
  @ApiPropertyOptional({ enum: ['EMAIL', 'PUSH', 'WHATSAPP'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  channels?: string[];
}

// ─── PAGINATION ───────────────────────────────────────────────
export class Evaluation360PaginationDto {
  // Também recebido via @Query('tenantId') separado no controller (listCycles)
  // — tem de estar aqui também, senão o forbidNonWhitelisted do ValidationPipe
  // rejeita o pedido inteiro por "property tenantId should not exist".
  @ApiPropertyOptional() @IsOptional() @IsString() tenantId?: string;
  // GET /evaluation360/competencies?tag=... (mesma armadilha do tenantId
  // acima) — banco curado do modal "Dar Feedback" contínuo.
  @ApiPropertyOptional() @IsOptional() @IsString() tag?: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) @Max(200) limit?: number = 20;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) offset?: number = 0;
  @ApiPropertyOptional() @IsOptional() @IsString() search?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() sortBy?: string;
  @ApiPropertyOptional({ enum: ['asc', 'desc'] }) @IsOptional() @IsString() sortOrder?:
    'asc' | 'desc';
}

// ─── LISTAGEM DE CICLOS (aba "Avaliações 360°") ────────────────
// Filtros pedidos em docs/evaluation360.md §2: Estado, Período, Departamento,
// Unidade, Cargo, Responsável, Data, Tipo de avaliação.
export class ListEvaluationCyclesDto extends Evaluation360PaginationDto {
  @ApiPropertyOptional({ enum: Eval360CycleStatus })
  @IsOptional()
  @IsEnum(Eval360CycleStatus)
  status?: Eval360CycleStatus;
  @ApiPropertyOptional({ enum: Eval360CycleType })
  @IsOptional()
  @IsEnum(Eval360CycleType)
  type?: Eval360CycleType;
  // Departamento/Unidade/Cargo: filtram ciclos com pelo menos um avaliado
  // (CycleParticipant) cujo User pertença a essa entidade — não são campos
  // do próprio Eval360Cycle.
  @ApiPropertyOptional() @IsOptional() @IsString() departmentId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() unitId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() positionId?: string;
  // "Responsável" — Eval360Cycle.createdBy.
  @ApiPropertyOptional() @IsOptional() @IsString() createdBy?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() from?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() to?: string;
}

// ─── LISTAGEM DE AVALIADOS (aba "Avaliados") ───────────────────
// docs/evaluation360.md §4 — não lista filtros explícitos; Estado e
// Departamento são os únicos dois que fazem sentido sobre CycleParticipant
// (as restantes colunas do §4 — cargo, unidade, gestor — vêm do User
// relacionado, sem filtro pedido para eles).
export class ListCycleParticipantsDto extends Evaluation360PaginationDto {
  @ApiPropertyOptional({ enum: CycleParticipantStatus })
  @IsOptional()
  @IsEnum(CycleParticipantStatus)
  status?: CycleParticipantStatus;
  @ApiPropertyOptional() @IsOptional() @IsString() departmentId?: string;
}

// ─── LISTAGEM DE AVALIADORES (aba "Avaliadores") ───────────────
// docs/evaluation360.md §5 — idem, sem filtros explícitos no documento;
// Estado, Tipo de avaliador e Avaliado são os campos com sentido de filtro
// directo sobre EvaluatorAssignment.
export class ListCycleEvaluatorsDto extends Evaluation360PaginationDto {
  @ApiPropertyOptional({ enum: EvaluatorAssignmentStatus })
  @IsOptional()
  @IsEnum(EvaluatorAssignmentStatus)
  status?: EvaluatorAssignmentStatus;
  @ApiPropertyOptional({ enum: EvaluatorRole })
  @IsOptional()
  @IsEnum(EvaluatorRole)
  role?: EvaluatorRole;
  @ApiPropertyOptional() @IsOptional() @IsString() evaluateeId?: string;
}

// ─── LISTAGEM DE QUESTIONÁRIOS (aba "Questionários", docs/evaluation360.md §6) ──
export class ListQuestionnairesDto extends Evaluation360PaginationDto {
  @ApiPropertyOptional({ enum: Eval360QuestionnaireStatus })
  @IsOptional()
  @IsEnum(Eval360QuestionnaireStatus)
  status?: Eval360QuestionnaireStatus;
}
