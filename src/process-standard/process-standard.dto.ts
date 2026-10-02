// src/process-standard/process-standard.dto.ts
import {
  IsString,
  IsOptional,
  IsInt,
  IsArray,
  IsEnum,
  IsNumber,
  IsDateString,
  ValidateNested,
  IsBoolean,
  Min,
  Max,
  MaxLength,
  ArrayMinSize,
  IsIn,
  IsNotEmpty,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ProcessStatus,
  RiskLevel,
  StepType,
  InstanceStatus,
  ProcessPriority,
  StepProgressStatus as TaskStatus,
} from '@prisma/client';

// ─── Enums ─────────────────────────────────────────────────────────────────
// NOTA: TaskStatus aqui é o `StepProgressStatus` do Prisma — nome local
// mantido por compatibilidade, distinto do `TaskStatus` (OnboardingTaskInstance)
// usado no módulo onboarding.

export { ProcessStatus, RiskLevel, StepType, InstanceStatus, ProcessPriority, TaskStatus };

export const CONFIDENTIALITY_LEVELS = ['PUBLIC', 'INTERNAL', 'CONFIDENTIAL', 'RESTRICTED'] as const;

// ─── Step DTO ─────────────────────────────────────────────────────────────
export class ProcessStepDto {
  @ApiProperty({ enum: StepType })
  @IsEnum(StepType)
  type: StepType;

  @ApiProperty()
  @IsString()
  title: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ description: 'Ordem de execução' })
  @IsInt()
  @Min(0)
  order: number;

  @ApiPropertyOptional({ description: 'ID do responsável (user)' })
  @IsOptional()
  @IsInt()
  responsibleId?: number;

  @ApiPropertyOptional({ description: 'Role responsável (ex: GESTOR)' })
  @IsOptional()
  @IsString()
  responsibleRole?: string;

  @ApiPropertyOptional({ description: 'SLA em horas' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  slaHours?: number;

  @ApiPropertyOptional({ description: 'Tempo estimado em minutos' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  estimatedMinutes?: number;

  @ApiPropertyOptional({ description: 'Formulário em JSON (campos input)' })
  @IsOptional()
  formSchema?: Record<string, unknown>;

  @ApiPropertyOptional({ description: 'Condições de saída do nó (JSON)' })
  @IsOptional()
  exitConditions?: Record<string, unknown>;

  @ApiPropertyOptional({ description: 'IDs de documentos associados' })
  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  documentIds?: number[];

  @ApiPropertyOptional({ description: 'Upload obrigatório?' })
  @IsOptional()
  @IsBoolean()
  requiresUpload?: boolean;

  @ApiPropertyOptional({ description: 'Checklist de verificação (JSON)' })
  @IsOptional()
  checklist?: string[];

  @ApiPropertyOptional({
    description: 'Ordens das etapas de que esta depende (vazio = sequencial ou paralela)',
  })
  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  dependsOnOrders?: number[];

  @ApiPropertyOptional({ description: 'Etapa paralela: arranca logo com a instância' })
  @IsOptional()
  @IsBoolean()
  parallel?: boolean;

  @ApiPropertyOptional({ description: 'Revisor da execução da etapa' })
  @IsOptional()
  @IsInt()
  reviewerId?: number;
}

// ─── Create Process ────────────────────────────────────────────────────────
export class CreateProcessDto {
  @ApiProperty({ example: 'Admissão de Colaborador' })
  @IsString()
  title: string;

  @ApiProperty({ example: 'RH-ADM-001', description: 'Código único do processo' })
  @IsString()
  code: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ description: 'Objetivo do processo' })
  @IsOptional()
  @IsString()
  objective?: string;

  @ApiPropertyOptional({ description: 'Âmbito / Escopo' })
  @IsOptional()
  @IsString()
  scope?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  departmentId?: number;

  @ApiPropertyOptional({ enum: RiskLevel, default: RiskLevel.LOW })
  @IsOptional()
  @IsEnum(RiskLevel)
  riskLevel?: RiskLevel;

  @ApiPropertyOptional({ description: 'SLA padrão em horas' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  defaultSlaHours?: number;

  @ApiPropertyOptional({ description: 'Tempo estimado total em minutos' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  estimatedMinutes?: number;

  @ApiPropertyOptional({ description: 'Data da próxima revisão' })
  @IsOptional()
  @IsDateString()
  nextReviewDate?: string;

  @ApiPropertyOptional({ description: 'Tags' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @ApiPropertyOptional({ description: 'Categoria' })
  @IsOptional()
  @IsString()
  category?: string;

  // ── §5 Modelos de Processos ──
  @ApiPropertyOptional({ description: 'Responsável pelo modelo (por defeito, quem o cria)' })
  @IsOptional()
  @IsInt()
  ownerId?: number;

  @ApiPropertyOptional({ description: 'Módulos envolvidos' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  involvedModules?: string[];

  @ApiPropertyOptional({ description: 'Data de entrada em vigor' })
  @IsOptional()
  @IsDateString()
  effectiveFrom?: string;

  @ApiPropertyOptional({ description: 'Política de revisão' })
  @IsOptional()
  @IsString()
  reviewPolicy?: string;

  @ApiPropertyOptional({ enum: CONFIDENTIALITY_LEVELS })
  @IsOptional()
  @IsIn(CONFIDENTIALITY_LEVELS)
  confidentiality?: string;

  @ApiPropertyOptional({ description: 'Funções com acesso ao modelo (vazio = todas)' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  accessRoles?: string[];

  @ApiPropertyOptional({ description: 'Documentos e formulários necessários' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  requiredDocuments?: string[];

  @ApiPropertyOptional({ description: 'Regras de aprovação' })
  @IsOptional()
  @IsString()
  approvalRules?: string;

  @ApiPropertyOptional({ description: 'Condições para iniciar' })
  @IsOptional()
  @IsString()
  startConditions?: string;

  @ApiPropertyOptional({ description: 'Condições para concluir' })
  @IsOptional()
  @IsString()
  completionConditions?: string;

  @ApiProperty({ type: [ProcessStepDto], description: 'Etapas do processo' })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ProcessStepDto)
  steps: ProcessStepDto[];
}

export class UpdateProcessDto extends PartialType(CreateProcessDto) {}

// ─── Filter DTO ─────────────────────────────────────────────────────────────
export class ProcessFilterDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ enum: ProcessStatus })
  @IsOptional()
  @IsEnum(ProcessStatus)
  status?: ProcessStatus;

  @ApiPropertyOptional({ enum: RiskLevel })
  @IsOptional()
  @IsEnum(RiskLevel)
  riskLevel?: RiskLevel;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  departmentId?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional({ description: 'Módulo envolvido no modelo' })
  @IsOptional()
  @IsString()
  involvedModule?: string;

  @ApiPropertyOptional({ description: 'Responsável pelo modelo' })
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  ownerId?: number;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  page?: number;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  @Type(() => Number)
  limit?: number;
}

// ─── Dashboard (Visão Geral) ──────────────────────────────────────────────────
export class ProcessDashboardFilterDto {
  @ApiPropertyOptional({ description: 'Início do período (data de início da instância)' })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({ description: 'Fim do período (inclusivo)' })
  @IsOptional()
  @IsDateString()
  to?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  departmentId?: number;

  @ApiPropertyOptional({ description: 'Unidade organizacional (via departamento do modelo)' })
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  unitId?: number;

  @ApiPropertyOptional({ description: 'Responsável de etapa' })
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  responsibleId?: number;

  @ApiPropertyOptional({ description: 'Tipo de processo (categoria do modelo)' })
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional({ enum: InstanceStatus })
  @IsOptional()
  @IsEnum(InstanceStatus)
  status?: InstanceStatus;
}

// ─── Start Instance ──────────────────────────────────────────────────────────
export class StartInstanceDto {
  @ApiPropertyOptional({ description: 'ID do colaborador alvo (por defeito, o solicitante)' })
  @IsOptional()
  @IsInt()
  targetUserId?: number;

  @ApiPropertyOptional({ description: 'Nome do processo (por defeito, o título do modelo)' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @ApiPropertyOptional({ enum: ProcessPriority, default: ProcessPriority.NORMAL })
  @IsOptional()
  @IsEnum(ProcessPriority)
  priority?: ProcessPriority;

  @ApiPropertyOptional({ description: 'Descrição e finalidade' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({
    description: 'Tipo da entidade de origem (ex.: Colaborador, Curso, Pedido)',
  })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  sourceEntityType?: string;

  @ApiPropertyOptional({ description: 'ID da entidade de origem' })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  sourceEntityId?: string;

  @ApiPropertyOptional({ description: 'Prazo final (por defeito, SLA do modelo)' })
  @IsOptional()
  @IsDateString()
  dueAt?: string;

  @ApiPropertyOptional({ description: 'Notas de abertura' })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({ description: 'Módulo que originou o processo (ex.: Users, Onboarding)' })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  sourceModule?: string;
}

// ─── Complete Step ──────────────────────────────────────────────────────────
export class CompleteStepDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({ description: 'Dados do formulário preenchido (JSON)' })
  @IsOptional()
  formData?: Record<string, unknown>;

  @ApiPropertyOptional({ description: 'IDs de evidências/uploads' })
  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  evidenceIds?: number[];

  @ApiPropertyOptional({ description: 'Acção executada (approve/reject/etc.)' })
  @IsOptional()
  @IsString()
  action?: string;

  @ApiPropertyOptional({ description: 'Resultado do trabalho realizado' })
  @IsOptional()
  @IsString()
  result?: string;

  @ApiPropertyOptional({ description: 'Itens da checklist cumpridos' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  checklistDone?: string[];
}

// ─── Reject / Escalate Step ─────────────────────────────────────────────────
export class RejectStepDto {
  @ApiProperty({ description: 'Motivo da rejeição' })
  @IsString()
  reason: string;
}

// ─── Submit for Approval ─────────────────────────────────────────────────────
export class ApprovalActionDto {
  @ApiProperty({ enum: ['approve', 'reject'] })
  @IsString()
  action: 'approve' | 'reject';

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  comment?: string;
}

// ─── §4 Todos os Processos (instâncias) ──────────────────────────────────────
const toBool = ({ value }: { value: unknown }) =>
  value === 'true' || value === true ? true : value === 'false' || value === false ? false : value;

export class ProcessInstanceFilterDto {
  @ApiPropertyOptional({ description: 'Código, nome ou entidade/colaborador' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ enum: InstanceStatus })
  @IsOptional()
  @IsEnum(InstanceStatus)
  status?: InstanceStatus;

  @ApiPropertyOptional({ enum: ProcessPriority })
  @IsOptional()
  @IsEnum(ProcessPriority)
  priority?: ProcessPriority;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  sourceModule?: string;

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

  @ApiPropertyOptional({ description: 'Solicitante' })
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  requesterId?: number;

  @ApiPropertyOptional({ description: 'Responsável actual' })
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  responsibleId?: number;

  @ApiPropertyOptional({ description: 'Modelo utilizado' })
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  templateId?: number;

  @ApiPropertyOptional({ description: 'Tipo de processo (categoria do modelo)' })
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional({ description: 'Criado a partir de (YYYY-MM-DD)' })
  @IsOptional()
  @IsDateString()
  createdFrom?: string;

  @ApiPropertyOptional({ description: 'Criado até (inclusivo)' })
  @IsOptional()
  @IsDateString()
  createdTo?: string;

  @ApiPropertyOptional({ description: 'Prazo final a partir de' })
  @IsOptional()
  @IsDateString()
  dueFrom?: string;

  @ApiPropertyOptional({ description: 'Prazo final até (inclusivo)' })
  @IsOptional()
  @IsDateString()
  dueTo?: string;

  @ApiPropertyOptional({ enum: ['overdue', 'due_soon'] })
  @IsOptional()
  @IsIn(['overdue', 'due_soon'])
  deadline?: 'overdue' | 'due_soon';

  @ApiPropertyOptional({ description: 'Incluir arquivados (por defeito, não)' })
  @IsOptional()
  @Transform(toBool)
  @IsBoolean()
  archived?: boolean;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  page?: number;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  @Type(() => Number)
  limit?: number;
}

export class UpdateInstanceDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({ description: 'Novo prazo final — exige `reason`' })
  @IsOptional()
  @IsDateString()
  dueAt?: string;

  @ApiPropertyOptional({ description: 'Justificação da alteração de prazo' })
  @IsOptional()
  @IsString()
  reason?: string;
}

export class AssignInstanceDto {
  @ApiProperty({ description: 'Novo responsável' })
  @IsInt()
  responsibleId: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  reason?: string;
}

export class ChangePriorityDto {
  @ApiProperty({ enum: ProcessPriority })
  @IsEnum(ProcessPriority)
  priority: ProcessPriority;
}

export class ReasonDto {
  @ApiProperty({ description: 'Justificação' })
  @IsString()
  @IsNotEmpty()
  reason: string;
}

export class OptionalReasonDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  reason?: string;
}

export class DuplicateProcessDto {
  @ApiPropertyOptional({ description: 'Código do novo modelo (por defeito, gerado)' })
  @IsOptional()
  @IsString()
  code?: string;

  @ApiPropertyOptional({ description: 'Título do novo modelo' })
  @IsOptional()
  @IsString()
  title?: string;
}

// ─── §6 Tarefas e Etapas ─────────────────────────────────────────────────────
export class TaskFilterDto {
  @ApiPropertyOptional({ enum: ['mine', 'all'], description: '`all` exige perfil privilegiado' })
  @IsOptional()
  @IsIn(['mine', 'all'])
  scope?: 'mine' | 'all';

  @ApiPropertyOptional({ enum: TaskStatus })
  @IsOptional()
  @IsEnum(TaskStatus)
  status?: TaskStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  instanceId?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  assigneeId?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ description: 'Só tarefas com prazo ultrapassado' })
  @IsOptional()
  @Transform(toBool)
  @IsBoolean()
  overdue?: boolean;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  page?: number;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  @Type(() => Number)
  limit?: number;
}

export class ClarificationDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  message: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  mentionIds?: number[];
}

export class ReassignStepDto {
  @ApiPropertyOptional({ description: 'Novo responsável pela tarefa' })
  @IsOptional()
  @IsInt()
  assigneeId?: number;

  @ApiPropertyOptional({ description: 'Novo revisor' })
  @IsOptional()
  @IsInt()
  reviewerId?: number;
}

export class StepCommentDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  body: string;

  @ApiPropertyOptional({ description: 'Utilizadores mencionados (@)' })
  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  mentionIds?: number[];
}

export class ChecklistDto {
  @ApiProperty({ description: 'Itens da checklist já cumpridos' })
  @IsArray()
  @IsString({ each: true })
  done: string[];
}
