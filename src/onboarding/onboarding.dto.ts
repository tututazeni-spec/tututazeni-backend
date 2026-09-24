import {
  IsString,
  IsInt,
  IsOptional,
  IsEnum,
  IsArray,
  IsBoolean,
  IsDateString,
  Min,
  Max,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional, PartialType, OmitType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsAllowedFileUrl } from '../common/validators/is-allowed-file-url.validator';
import { BaseFilterDto } from '../common/dtos/pagination.dto';
import {
  OnboardingStatus,
  TaskCategory,
  TaskType,
  TaskStatus,
  TaskPhase,
  ResponsibleRole,
  DocumentStatus,
  SurveyMilestone,
  OnboardingCheckinType,
  OnboardingCheckinStatus,
} from '@prisma/client';

// ─── Enums ────────────────────────────────────────────────────────────────────

export {
  OnboardingStatus,
  TaskCategory,
  TaskType,
  TaskStatus,
  TaskPhase,
  ResponsibleRole,
  DocumentStatus,
  SurveyMilestone,
  OnboardingCheckinType,
  OnboardingCheckinStatus,
};

// ─── Template Task ────────────────────────────────────────────────────────────
// Definida antes de CreateOnboardingTemplateDto porque este último referencia
// OnboardingTemplateTaskInputDto (Estrutura aninhada, criada junto do plano).

// Campos de uma tarefa da Estrutura, comuns à criação aninhada (dentro de
// CreateOnboardingTemplateDto.tasks) e à criação avulsa via
// POST /onboarding/templates/tasks (CreateTemplateTaskDto, que acrescenta
// templateId). dueDayOffset e responsible são obrigatórios — "Responsáveis"
// e "Prazos" fazem parte da Estrutura pedida, não são metadados opcionais.
export class OnboardingTemplateTaskInputDto {
  @ApiProperty()
  @IsString()
  @MaxLength(200)
  title!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ enum: TaskCategory })
  @IsEnum(TaskCategory)
  category!: TaskCategory;

  @ApiProperty({ enum: TaskType })
  @IsEnum(TaskType)
  type!: TaskType;

  @ApiProperty({ enum: TaskPhase })
  @IsEnum(TaskPhase)
  phase!: TaskPhase;

  @ApiProperty({ enum: ResponsibleRole, description: 'Responsável pela tarefa' })
  @IsEnum(ResponsibleRole)
  responsible!: ResponsibleRole;

  @ApiPropertyOptional({
    description: 'Se a tarefa é obrigatória (ex: Formação obrigatória) ou opcional. Default true.',
    default: true,
  })
  @IsOptional()
  @IsBoolean()
  isMandatory?: boolean;

  @ApiProperty({ description: 'Prazo — dia limite a partir do início (ex: 5 = até ao dia 5)' })
  @IsInt()
  @Min(0)
  dueDayOffset!: number;

  @ApiPropertyOptional({ description: 'IDs de tarefas que bloqueiam esta' })
  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  dependsOn?: number[];

  @ApiPropertyOptional({ description: 'ID do curso associado (tipo COURSE)' })
  @IsOptional()
  @IsInt()
  courseId?: number;

  @ApiPropertyOptional({ description: 'ID do processo associado' })
  @IsOptional()
  @IsInt()
  processId?: number;

  @ApiProperty({ description: 'XP ganho ao completar', default: 10 })
  @IsInt()
  @Min(0)
  xpReward!: number;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  requiresApproval?: boolean;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  requiresEvidence?: boolean;

  @ApiProperty({ description: 'Ordem na lista' })
  @IsInt()
  @Min(0)
  seq!: number;
}

export class CreateTemplateTaskDto extends OnboardingTemplateTaskInputDto {
  @ApiProperty()
  @IsInt()
  templateId!: number;
}

export class UpdateTemplateTaskDto extends PartialType(CreateTemplateTaskDto) {}

// ─── Template ─────────────────────────────────────────────────────────────────

export class CreateOnboardingTemplateDto {
  @ApiProperty({ example: 'Onboarding Colaborador TI' })
  @IsString()
  @MaxLength(200)
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ description: 'Empresa a que o plano se aplica' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  company?: string;

  @ApiPropertyOptional({ description: 'Localização (ex: escritório, cidade)' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  location?: string;

  @ApiPropertyOptional({ description: 'Objectivo do plano de integração' })
  @IsOptional()
  @IsString()
  objective?: string;

  @ApiPropertyOptional({ description: 'ID do cargo/função alvo' })
  @IsOptional()
  @IsInt()
  positionId?: number;

  @ApiPropertyOptional({ description: 'ID do departamento alvo' })
  @IsOptional()
  @IsInt()
  departmentId?: number;

  @ApiPropertyOptional({ description: 'ID da unidade/empresa alvo' })
  @IsOptional()
  @IsInt()
  unitId?: number;

  @ApiProperty({ description: 'Duração em dias (7, 15, 30, 60, 90)' })
  @IsInt()
  @Min(1)
  durationDays!: number;

  @ApiPropertyOptional({ description: 'ID da Learning Path associada' })
  @IsOptional()
  @IsInt()
  learningPathId?: number;

  @ApiPropertyOptional({ description: 'URL do vídeo de boas-vindas' })
  @IsOptional()
  @IsString()
  welcomeVideoUrl?: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @ApiPropertyOptional({
    type: [OnboardingTemplateTaskInputDto],
    description:
      'Estrutura do plano: Tarefas, Formação obrigatória, Documentos, ' +
      'Apresentações/equipa, Acessos e equipamentos, Políticas e ' +
      'procedimentos, Reuniões 1:1 (categoria ONE_ON_ONE, distinta de ' +
      'MEETING para reuniões de equipa), Avaliações — criadas junto com o ' +
      'template, cada uma já com Responsáveis, Prazos e isMandatory.',
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OnboardingTemplateTaskInputDto)
  tasks?: OnboardingTemplateTaskInputDto[];
}

// `tasks` fica fora do update — é só para a criação nascer já com Estrutura;
// editar/adicionar/remover tarefas de um template existente continua a ser
// só via POST/PUT/DELETE /onboarding/templates/tasks. Sem este OmitType, o
// `tasks` (array simples) não bate certo com o shape de
// Prisma.OnboardingTemplateUpdateInput (que espera { create/update/... }) e
// o `this.prisma.onboardingTemplate.update({ data: dto })` deixa de compilar.
export class UpdateOnboardingTemplateDto extends PartialType(
  OmitType(CreateOnboardingTemplateDto, ['tasks'] as const),
) {}

// ─── Plan (Instância por colaborador) ────────────────────────────────────────

export class CreateOnboardingPlanDto {
  @ApiProperty({ description: 'ID do colaborador' })
  @IsInt()
  userId!: number;

  @ApiProperty({ description: 'ID do template' })
  @IsInt()
  templateId!: number;

  @ApiPropertyOptional({ description: 'Data de início' })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({ description: 'ID do buddy (mentor)' })
  @IsOptional()
  @IsInt()
  buddyId?: number;

  @ApiPropertyOptional({ description: 'ID do gestor direto' })
  @IsOptional()
  @IsInt()
  managerId?: number;

  @ApiPropertyOptional({ description: 'ID do responsável RH' })
  @IsOptional()
  @IsInt()
  hrResponsibleId?: number;
}

// ─── Task instance ────────────────────────────────────────────────────────────

export class CompleteTaskDto {
  @ApiProperty({ description: 'ID da tarefa da instância' })
  @IsInt()
  taskInstanceId!: number;

  @ApiPropertyOptional({ description: 'Comentário de evidência' })
  @IsOptional()
  @IsString()
  evidenceComment?: string;

  @ApiPropertyOptional({ description: 'URL de evidência (ficheiro)' })
  @IsOptional()
  @IsString()
  evidenceUrl?: string;
}

export class SkipTaskDto {
  @ApiProperty()
  @IsInt()
  taskInstanceId!: number;

  @ApiProperty({ description: 'Motivo de saltar a tarefa' })
  @IsString()
  reason!: string;
}

export class ApproveTaskDto {
  @ApiProperty()
  @IsInt()
  taskInstanceId!: number;

  @ApiProperty({ enum: ['approve', 'reject'] })
  @IsString()
  decision!: 'approve' | 'reject';

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  comment?: string;
}

// ─── Document ─────────────────────────────────────────────────────────────────

export class UploadDocumentDto {
  @ApiProperty()
  @IsInt()
  planId!: number;

  @ApiProperty()
  @IsString()
  documentType!: string;

  @ApiProperty()
  @IsAllowedFileUrl()
  fileUrl!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}

export class ValidateDocumentDto {
  @ApiProperty()
  @IsInt()
  documentId!: number;

  @ApiProperty({ enum: DocumentStatus })
  @IsEnum(DocumentStatus)
  status!: DocumentStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  rejectionReason?: string;
}

// ─── Survey ───────────────────────────────────────────────────────────────────

export class SubmitOnboardingSurveyDto {
  @ApiProperty()
  @IsInt()
  planId!: number;

  @ApiProperty({ enum: SurveyMilestone })
  @IsEnum(SurveyMilestone)
  milestone!: SurveyMilestone;

  @ApiProperty({ description: 'Nota 1-5' })
  @IsInt()
  @Min(1)
  @Max(5)
  score!: number;

  @ApiPropertyOptional({ description: 'eNPS (-10 a 10)' })
  @IsOptional()
  @IsInt()
  @Min(-10)
  @Max(10)
  enps?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  comment?: string;
}

// ─── Avaliação de Integração (onboarding.md ponto 9) ───────────────────────
// Reaproveita EvaluationRequest do módulo Evaluation (purpose=ONBOARDING) em
// vez de duplicar um sistema de avaliação — só o "gatilho" fica aqui.

export class TriggerIntegrationEvaluationDto {
  @ApiPropertyOptional({
    description:
      'ID do avaliador (gestor/RH). Por omissão usa o managerId do plano, ' +
      'ou o hrResponsibleId se não houver gestor.',
  })
  @IsOptional()
  @IsInt()
  evaluatorId?: number;
}

// ─── Filters ──────────────────────────────────────────────────────────────────

export class OnboardingFilterDto extends BaseFilterDto {
  @ApiPropertyOptional({ enum: OnboardingStatus })
  @IsOptional()
  @IsEnum(OnboardingStatus)
  status?: OnboardingStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  departmentId?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  templateId?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  unitId?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  positionId?: number;

  /** Filtra por gestor, RH responsável ou buddy do plano (qualquer um). */
  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  responsibleId?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  to?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  @Type(() => Number)
  minProgress?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  @Type(() => Number)
  maxProgress?: number;
}

// ─── Fase B (docs/onboarding.md pontos 5-7) ────────────────────────────────

export class OnboardingTaskFilterDto extends BaseFilterDto {
  @ApiPropertyOptional({ enum: TaskStatus })
  @IsOptional()
  @IsEnum(TaskStatus)
  status?: TaskStatus;

  @ApiPropertyOptional({ enum: TaskPhase })
  @IsOptional()
  @IsEnum(TaskPhase)
  phase?: TaskPhase;

  @ApiPropertyOptional({ enum: TaskCategory })
  @IsOptional()
  @IsEnum(TaskCategory)
  category?: TaskCategory;

  @ApiPropertyOptional({ enum: ResponsibleRole })
  @IsOptional()
  @IsEnum(ResponsibleRole)
  responsible?: ResponsibleRole;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  planId?: number;

  @ApiPropertyOptional({
    description: 'Só tarefas em atraso (prazo passado, ainda não concluídas)',
  })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  overdue?: boolean;
}

export class OnboardingDocumentFilterDto {
  @ApiPropertyOptional({ enum: DocumentStatus })
  @IsOptional()
  @IsEnum(DocumentStatus)
  status?: DocumentStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  planId?: number;
}

export class OnboardingTrainingFilterDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  planId?: number;
}

// ─── Fase C (docs/onboarding.md pontos 8-10) ───────────────────────────────

export class CreateOnboardingCheckinDto {
  @ApiProperty()
  @IsInt()
  @Type(() => Number)
  planId!: number;

  @ApiPropertyOptional({ enum: OnboardingCheckinType, default: 'CUSTOM' })
  @IsOptional()
  @IsEnum(OnboardingCheckinType)
  type?: OnboardingCheckinType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  responsibleId?: number;
}

// Preenchido pelo gestor/mentor responsável (ou ADMIN/RH).
export class RegisterOnboardingCheckinDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  difficulties?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  positives?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  supportNeeds?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  managerFeedback?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  nextActions?: string;

  @ApiPropertyOptional({
    enum: OnboardingCheckinStatus,
    description: 'Default COMPLETED ao registar',
  })
  @IsOptional()
  @IsEnum(OnboardingCheckinStatus)
  status?: OnboardingCheckinStatus;
}

// Preenchido pelo próprio colaborador (dono do plano).
export class SubmitCheckinEmployeeFeedbackDto {
  @ApiProperty()
  @IsString()
  @MaxLength(2000)
  employeeFeedback!: string;
}

export class OnboardingCheckinFilterDto extends BaseFilterDto {
  @ApiPropertyOptional({ enum: OnboardingCheckinStatus })
  @IsOptional()
  @IsEnum(OnboardingCheckinStatus)
  status?: OnboardingCheckinStatus;

  @ApiPropertyOptional({ enum: OnboardingCheckinType })
  @IsOptional()
  @IsEnum(OnboardingCheckinType)
  type?: OnboardingCheckinType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  planId?: number;

  @ApiPropertyOptional({ description: 'Só check-ins em atraso (prazo passado, ainda pendentes)' })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  overdue?: boolean;
}

export class OnboardingReportFilterDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  to?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  departmentId?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  unitId?: number;
}
