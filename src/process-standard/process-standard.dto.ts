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
export const APPROVAL_MODES = ['SEQUENTIAL', 'PARALLEL', 'ANY'] as const;
export const REJECTION_RULES = ['HOLD', 'CANCEL', 'RETURN', 'BRANCH'] as const;
export const APPROVAL_DECISIONS = [
  'APPROVE',
  'REJECT',
  'RETURN',
  'REQUEST_INFO',
  'DELEGATE',
  'ESCALATE',
] as const;

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

  // ── §7/§8 — construtor de fluxos e aprovações ──
  @ApiPropertyOptional({
    description: 'Configuração específica do tipo (temporizador, evento, notificação…)',
  })
  @IsOptional()
  config?: Record<string, unknown>;

  @ApiPropertyOptional({
    description: 'Condições de entrada {logic, rows}: se falsas, a etapa é ignorada',
  })
  @IsOptional()
  entryConditions?: Record<string, unknown>;

  @ApiPropertyOptional({ description: 'Dados obrigatórios (chaves do formulário) para concluir' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  requiredData?: string[];

  @ApiPropertyOptional({ description: 'Aprovadores da etapa de aprovação' })
  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  approverIds?: number[];

  @ApiPropertyOptional({ enum: APPROVAL_MODES })
  @IsOptional()
  @IsIn(APPROVAL_MODES)
  approvalMode?: (typeof APPROVAL_MODES)[number];

  @ApiPropertyOptional({ description: 'Os aprovadores podem delegar?' })
  @IsOptional()
  @IsBoolean()
  allowDelegation?: boolean;

  @ApiPropertyOptional({
    enum: REJECTION_RULES,
    description: 'Regra aplicada quando a aprovação é rejeitada',
  })
  @IsOptional()
  @IsIn(REJECTION_RULES)
  onReject?: (typeof REJECTION_RULES)[number];

  @ApiPropertyOptional({ description: 'Nº máximo de devoluções para correcção' })
  @IsOptional()
  @IsInt()
  @Min(0)
  maxReturns?: number;

  @ApiPropertyOptional({ description: 'Acções em caso de sucesso (JSON)' })
  @IsOptional()
  @IsArray()
  successActions?: Array<Record<string, unknown>>;

  @ApiPropertyOptional({ description: 'Acções em caso de falha (JSON)' })
  @IsOptional()
  @IsArray()
  failureActions?: Array<Record<string, unknown>>;

  @ApiPropertyOptional({ description: 'Escalar automaticamente X horas depois do prazo' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  escalationAfterHours?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  escalationToId?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  escalationToRole?: string;

  @ApiPropertyOptional({ enum: ['CALENDAR', 'BUSINESS_DAYS'] })
  @IsOptional()
  @IsIn(['CALENDAR', 'BUSINESS_DAYS'])
  calendarMode?: 'CALENDAR' | 'BUSINESS_DAYS';

  @ApiPropertyOptional({ description: 'Posição no canvas do construtor' })
  @IsOptional()
  @IsNumber()
  posX?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  posY?: number;
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

  @ApiPropertyOptional({ description: 'Identificador de correlação da operação de origem' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  correlationId?: string;
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

// ─── §7 Aprovações ───────────────────────────────────────────────────────────
export class ApprovalFilterDto {
  @ApiPropertyOptional({
    enum: ['mine', 'requested', 'all'],
    description:
      '`mine` = onde sou aprovador; `requested` = pedidos meus; `all` exige perfil de gestão',
  })
  @IsOptional()
  @IsIn(['mine', 'requested', 'all'])
  scope?: 'mine' | 'requested' | 'all';

  @ApiPropertyOptional({ description: 'open | decided | um estado concreto' })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  sourceModule?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  processId?: number;

  @ApiPropertyOptional({ description: 'Só aprovações desta instância de processo' })
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  instanceId?: number;

  @ApiPropertyOptional({ description: 'Só pedidos com o prazo ultrapassado' })
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

export class DecideApprovalDto {
  @ApiProperty({ enum: APPROVAL_DECISIONS })
  @IsIn(APPROVAL_DECISIONS)
  decision: (typeof APPROVAL_DECISIONS)[number];

  @ApiPropertyOptional({ description: 'Obrigatória, excepto ao aprovar' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  justification?: string;

  @ApiPropertyOptional({ description: 'DELEGATE: novo aprovador' })
  @IsOptional()
  @IsInt()
  delegateToId?: number;

  @ApiPropertyOptional({
    description: 'ESCALATE: nível superior (por defeito, o gestor do aprovador)',
  })
  @IsOptional()
  @IsInt()
  escalateToId?: number;
}

export class RespondApprovalDto {
  @ApiProperty({ description: 'Resposta ao pedido de informação adicional' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  message: string;
}

// ─── §8 Fluxos de Trabalho ───────────────────────────────────────────────────
export class SimulateFlowDto {
  @ApiPropertyOptional({ enum: ProcessPriority })
  @IsOptional()
  @IsEnum(ProcessPriority)
  priority?: ProcessPriority;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  sourceModule?: string;

  @ApiPropertyOptional({ description: 'Resultado por ordem de etapa, ex.: {"3":"REJECTED"}' })
  @IsOptional()
  results?: Record<string, string>;

  @ApiPropertyOptional({ description: 'Dados de formulário do cenário' })
  @IsOptional()
  form?: Record<string, unknown>;
}

export class DeliverEventDto {
  @ApiProperty({ description: 'Nome do evento esperado pela etapa de espera' })
  @IsString()
  @IsNotEmpty()
  event: string;
}

// ─── §9 Automações ───────────────────────────────────────────────────────────
export class ProcessAutomationDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ description: 'Código único; gerado (AUT-PROC-NNN) se omitido' })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  code?: string;

  @ApiProperty({ description: 'Evento desencadeador (ver /processes/automations/catalog)' })
  @IsString()
  @IsNotEmpty()
  trigger: string;

  @ApiPropertyOptional({ description: 'Módulo de origem do evento (filtra o catálogo)' })
  @IsOptional()
  @IsString()
  sourceModule?: string;

  @ApiPropertyOptional({ description: 'Entidade de origem (Processo, Tarefa, Aprovação…)' })
  @IsOptional()
  @IsString()
  entity?: string;

  @ApiPropertyOptional({ description: 'Condições {logic, rows} sobre o payload do evento' })
  @IsOptional()
  conditions?: {
    logic?: 'AND' | 'OR';
    rows?: Array<{ field: string; operator: string; value?: string }>;
  };

  @ApiProperty({ description: 'Acção a executar (ver catálogo)' })
  @IsString()
  @IsNotEmpty()
  action: string;

  @ApiPropertyOptional({ description: 'Parâmetros da acção (processCode, priority, message…)' })
  @IsOptional()
  actionParams?: Record<string, unknown>;

  @ApiPropertyOptional({
    description: 'Destinatários: ids ou ASSIGNEE, TARGET, REQUESTER, MANAGER, OWNER, ROLE:<código>',
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  recipients?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  priority?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  activeFrom?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  activeUntil?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @ApiPropertyOptional({ description: 'Frequência, para eventos agendados' })
  @IsOptional()
  @IsString()
  frequency?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10)
  maxRetries?: number;

  @ApiPropertyOptional({ enum: ['NONE', 'FIXED', 'EXPONENTIAL'] })
  @IsOptional()
  @IsIn(['NONE', 'FIXED', 'EXPONENTIAL'])
  retryPolicy?: 'NONE' | 'FIXED' | 'EXPONENTIAL';

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  retryDelayMinutes?: number;

  @ApiPropertyOptional({ enum: ['LOG', 'NOTIFY_OWNER', 'DISABLE_RULE'] })
  @IsOptional()
  @IsIn(['LOG', 'NOTIFY_OWNER', 'DISABLE_RULE'])
  errorHandling?: 'LOG' | 'NOTIFY_OWNER' | 'DISABLE_RULE';
}

export class AutomationRuleFilterDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ enum: ['active', 'inactive'] })
  @IsOptional()
  @IsIn(['active', 'inactive'])
  state?: 'active' | 'inactive';

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  trigger?: string;
}

export class TestAutomationDto {
  @ApiPropertyOptional({ description: 'Payload de exemplo do evento' })
  @IsOptional()
  payload?: Record<string, unknown>;

  @ApiPropertyOptional({ description: 'Executar mesmo (por defeito só simula)' })
  @IsOptional()
  @IsBoolean()
  execute?: boolean;
}

// ─── §10 Calendário e Prazos ─────────────────────────────────────────────────
export class CalendarFilterDto {
  @ApiPropertyOptional({ description: 'Início do intervalo (por defeito, o mês corrente − 1)' })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({ description: 'Fim do intervalo (inclusivo)' })
  @IsOptional()
  @IsDateString()
  to?: string;

  @ApiPropertyOptional({ enum: ['mine', 'all'], description: '`all` exige perfil de gestão' })
  @IsOptional()
  @IsIn(['mine', 'all'])
  scope?: 'mine' | 'all';

  @ApiPropertyOptional({ enum: ['ALL', 'TASK', 'PROCESS'] })
  @IsOptional()
  @IsIn(['ALL', 'TASK', 'PROCESS'])
  kind?: 'ALL' | 'TASK' | 'PROCESS';

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

  @ApiPropertyOptional({ description: 'Responsável pela tarefa / do processo' })
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  responsibleId?: number;

  @ApiPropertyOptional({ description: 'Estado da tarefa ou do processo' })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional({ enum: ProcessPriority })
  @IsOptional()
  @IsEnum(ProcessPriority)
  priority?: ProcessPriority;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  instanceId?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ description: 'Só itens em atraso' })
  @IsOptional()
  @Transform(toBool)
  @IsBoolean()
  overdue?: boolean;
}

export class RescheduleDto {
  @ApiProperty({ description: 'Novo prazo (ISO 8601)' })
  @IsDateString()
  dueAt: string;

  @ApiProperty({ description: 'Justificação (obrigatória)' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  reason: string;
}

// ─── §11 Documentos ──────────────────────────────────────────────────────────
export const DOC_VALIDATION_FILTERS = [
  'REQUESTED',
  'PENDING',
  'APPROVED',
  'REJECTED',
  'EXPIRED',
  'EXPIRING',
] as const;

export class ProcessDocumentFilterDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  instanceId?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  stepId?: number;

  @ApiPropertyOptional({ description: 'Modelo de processo' })
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  processId?: number;

  @ApiPropertyOptional({ enum: DOC_VALIDATION_FILTERS })
  @IsOptional()
  @IsIn(DOC_VALIDATION_FILTERS)
  status?: (typeof DOC_VALIDATION_FILTERS)[number];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  docType?: string;

  @ApiPropertyOptional({ enum: CONFIDENTIALITY_LEVELS })
  @IsOptional()
  @IsIn(CONFIDENTIALITY_LEVELS)
  confidentiality?: (typeof CONFIDENTIALITY_LEVELS)[number];

  @ApiPropertyOptional({ enum: ['approver', 'requested', 'mine'] })
  @IsOptional()
  @IsIn(['approver', 'requested', 'mine'])
  assigned?: 'approver' | 'requested' | 'mine';

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ description: 'Só obrigatórios' })
  @IsOptional()
  @Transform(toBool)
  @IsBoolean()
  required?: boolean;

  @ApiPropertyOptional({ description: 'Mostrar arquivados' })
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

class ProcessDocumentCommonDto {
  @ApiPropertyOptional({ description: 'Etapa (ProcessStep.id) a que o documento pertence' })
  @IsOptional()
  @IsInt()
  stepId?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  required?: boolean;

  @ApiPropertyOptional({ description: 'Data de emissão' })
  @IsOptional()
  @IsDateString()
  issuedAt?: string;

  @ApiPropertyOptional({ description: 'Data de validade' })
  @IsOptional()
  @IsDateString()
  validUntil?: string;

  @ApiPropertyOptional({ enum: CONFIDENTIALITY_LEVELS })
  @IsOptional()
  @IsIn(CONFIDENTIALITY_LEVELS)
  confidentiality?: (typeof CONFIDENTIALITY_LEVELS)[number];

  @ApiPropertyOptional({ type: [String], description: 'Perfis com acesso (CONFIDENTIAL)' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  viewRoles?: string[];

  @ApiPropertyOptional({ type: [Number], description: 'Utilizadores com acesso explícito' })
  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  viewerIds?: number[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(60)
  relatedEntityType?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  relatedEntityId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  signatureRequired?: boolean;

  @ApiPropertyOptional({ description: 'Aprovador (por defeito, o dono do modelo)' })
  @IsOptional()
  @IsInt()
  approverId?: number;
}

export class AttachProcessDocumentDto extends ProcessDocumentCommonDto {
  @ApiPropertyOptional({ description: 'Documento do repositório central' })
  @IsOptional()
  @IsInt()
  documentId?: number;

  @ApiPropertyOptional({ description: 'Conteúdo da Biblioteca' })
  @IsOptional()
  @IsString()
  libraryItemId?: string;

  @ApiPropertyOptional({ description: 'Pedido de documento (REQUESTED) que este anexo cumpre' })
  @IsOptional()
  @IsInt()
  requestId?: number;

  @ApiPropertyOptional({ description: 'Nome (por defeito, o título do documento)' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  name?: string;

  @ApiPropertyOptional({ description: 'Tipo documental' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  docType?: string;

  @ApiPropertyOptional({ description: 'Autor/emissor externo, se não for um utilizador' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  authorName?: string;
}

export class RequestProcessDocumentDto extends ProcessDocumentCommonDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name: string;

  @ApiProperty({ description: 'Tipo documental' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  docType: string;

  @ApiProperty({ description: 'Quem deve entregar o documento' })
  @IsInt()
  requestedFromId: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}

export class GenerateProcessDocumentDto extends ProcessDocumentCommonDto {
  @ApiProperty({ description: 'Modelo de documento (DeclarationTemplate)' })
  @IsInt()
  templateId: number;

  @ApiPropertyOptional({ description: 'Nome (por defeito, o do modelo)' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  name?: string;
}

export class SubmitDocumentDto {
  @ApiPropertyOptional({ description: 'Novo aprovador' })
  @IsOptional()
  @IsInt()
  approverId?: number;
}

export class DecideDocumentDto {
  @ApiProperty({ enum: ['APPROVE', 'REJECT'] })
  @IsIn(['APPROVE', 'REJECT'])
  decision: 'APPROVE' | 'REJECT';

  @ApiPropertyOptional({ description: 'Obrigatória ao rejeitar' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}

export class NewDocumentVersionDto {
  @ApiPropertyOptional({ description: 'Novo ficheiro no repositório (por defeito, o mesmo)' })
  @IsOptional()
  @IsInt()
  documentId?: number;

  @ApiPropertyOptional({ description: 'Nova validade (renovação)' })
  @IsOptional()
  @IsDateString()
  validUntil?: string;

  @ApiProperty({ description: 'O que mudou / motivo da renovação' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  note: string;
}

export class ArchiveDocumentDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  reason: string;
}

// ─── §12 Indicadores e Relatórios ────────────────────────────────────────────
export const REPORT_GROUP_BY = [
  'department',
  'template',
  'category',
  'sourceModule',
  'responsible',
  'priority',
  'month',
] as const;

export const REPORT_RECORD_INDICATORS = [
  'total',
  'completed',
  'onTime',
  'late',
  'returned',
  'rejected',
  'reopened',
  'overdue',
  'backlogInstances',
  'backlogTasks',
  'pendingApprovals',
  'workload',
  'automationFailures',
] as const;

export class ProcessReportFilterDto {
  @ApiPropertyOptional({ description: 'Início do período (data de início do processo)' })
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

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  unitId?: number;

  @ApiPropertyOptional({ description: 'Modelo de processo' })
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  templateId?: number;

  @ApiPropertyOptional({ description: 'Tipo de processo (categoria do modelo)' })
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  sourceModule?: string;

  @ApiPropertyOptional({ enum: ProcessPriority })
  @IsOptional()
  @IsEnum(ProcessPriority)
  priority?: ProcessPriority;

  @ApiPropertyOptional({ description: 'Responsável actual do processo' })
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  responsibleId?: number;

  @ApiPropertyOptional({ enum: REPORT_GROUP_BY, default: 'department' })
  @IsOptional()
  @IsIn(REPORT_GROUP_BY)
  groupBy?: (typeof REPORT_GROUP_BY)[number];
}

export class ProcessReportRecordsDto extends ProcessReportFilterDto {
  @ApiProperty({ enum: REPORT_RECORD_INDICATORS })
  @IsIn(REPORT_RECORD_INDICATORS)
  indicator: (typeof REPORT_RECORD_INDICATORS)[number];

  @ApiPropertyOptional({ description: 'Responsável (indicador `workload`)' })
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  assigneeId?: number;

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

export class ProcessReportExportDto extends ProcessReportFilterDto {
  @ApiProperty({ enum: ['csv', 'xlsx', 'pdf'] })
  @IsIn(['csv', 'xlsx', 'pdf'])
  format: 'csv' | 'xlsx' | 'pdf';
}

// ─── §13 Histórico e Auditoria ───────────────────────────────────────────────
export const AUDIT_SOURCES = ['INTERFACE', 'API', 'AUTOMATION', 'SYSTEM'] as const;

export class ProcessAuditFilterDto {
  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  page?: number;

  @ApiPropertyOptional({ default: 25 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  @Type(() => Number)
  limit?: number;

  @ApiPropertyOptional({ description: 'Utilizador que executou a acção' })
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  userId?: number;

  @ApiPropertyOptional({ description: 'Tipo de evento (acção)' })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  action?: string;

  @ApiPropertyOptional({ enum: AUDIT_SOURCES })
  @IsOptional()
  @IsIn(AUDIT_SOURCES)
  source?: (typeof AUDIT_SOURCES)[number];

  @ApiPropertyOptional({ enum: ['SUCCESS', 'FAILED'] })
  @IsOptional()
  @IsIn(['SUCCESS', 'FAILED'])
  result?: 'SUCCESS' | 'FAILED';

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  processId?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  instanceId?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  to?: string;

  @ApiPropertyOptional({ description: 'Procura no código/nome do processo, justificação e erro' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;
}

export class ProcessAuditAttemptsDto {
  @ApiPropertyOptional({ enum: ['ALL', 'INTEGRATION', 'AUTOMATION'] })
  @IsOptional()
  @IsIn(['ALL', 'INTEGRATION', 'AUTOMATION'])
  kind?: 'ALL' | 'INTEGRATION' | 'AUTOMATION';

  @ApiPropertyOptional({ enum: ['SUCCESS', 'FAILED'] })
  @IsOptional()
  @IsIn(['SUCCESS', 'FAILED'])
  status?: 'SUCCESS' | 'FAILED';

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  page?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  @Type(() => Number)
  limit?: number;
}

export class ProcessAuditExportDto extends ProcessAuditFilterDto {
  @ApiProperty({ description: 'Justificação da exportação (fica registada na auditoria)' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(300)
  reason: string;
}

// ─── §14 Configurações ───────────────────────────────────────────────────────
export class UpdateProcessSettingDto {
  @ApiProperty({ description: 'Novo valor completo da secção (JSON)' })
  @IsNotEmpty()
  value: unknown;

  @ApiPropertyOptional({
    description: 'Versão que o utilizador viu (detecta edições concorrentes)',
  })
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  expectedVersion?: number;

  @ApiPropertyOptional({ description: 'Motivo da alteração' })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  reason?: string;
}

export class RestoreProcessSettingDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(300)
  reason?: string;
}

// ─── §15 Integração com os módulos ───────────────────────────────────────────
export class IntegrationEventDto {
  @ApiProperty({ description: 'Módulo emissor (ex.: Onboarding, Leave, Trainings)' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  module: string;

  @ApiProperty({ description: 'Evento que originou o pedido (ex.: employee.hired)' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  event: string;

  @ApiProperty({ description: 'Código do modelo de processo a iniciar' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  processCode: string;

  @ApiProperty({ description: 'Chave de idempotência: o mesmo evento nunca cria dois processos' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  idempotencyKey: string;

  @ApiProperty({ description: 'Tipo do registo de origem (ex.: LeaveRequest)' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  sourceEntityType: string;

  @ApiProperty({ description: 'ID do registo de origem' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  sourceEntityId: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  targetUserId?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @ApiPropertyOptional({ enum: ProcessPriority })
  @IsOptional()
  @IsEnum(ProcessPriority)
  priority?: ProcessPriority;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(80)
  correlationId?: string;

  @ApiPropertyOptional({ description: 'Dados adicionais (limitados, guardados no registo)' })
  @IsOptional()
  data?: Record<string, unknown>;
}

export class IntegrationLogFilterDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(60)
  module?: string;

  @ApiPropertyOptional({ enum: ['SUCCESS', 'FAILED', 'DUPLICATE', 'REJECTED'] })
  @IsOptional()
  @IsIn(['SUCCESS', 'FAILED', 'DUPLICATE', 'REJECTED'])
  status?: 'SUCCESS' | 'FAILED' | 'DUPLICATE' | 'REJECTED';

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  page?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  @Type(() => Number)
  limit?: number;
}
