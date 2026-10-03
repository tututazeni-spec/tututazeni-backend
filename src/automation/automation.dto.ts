// src/automation/automation.dto.ts
import {
  IsString,
  IsOptional,
  IsEnum,
  IsBoolean,
  IsInt,
  IsArray,
  IsDateString,
  IsObject,
  IsIn,
  ValidateIf,
  MaxLength,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { AutomationCategory, ExecutionStatus } from '@prisma/client';
import { BaseFilterDto } from '../common/dtos/pagination.dto';
import type { FlowDefinition } from './automation-flow';

// ─── Enums ────────────────────────────────────────────────────────

export enum TriggerType {
  // Event-based
  EMPLOYEE_CREATED = 'employee.created',
  EMPLOYEE_UPDATED = 'employee.updated',
  EMPLOYEE_DEACTIVATED = 'employee.deactivated',
  ROLE_CHANGED = 'role.changed',
  DEPARTMENT_CHANGED = 'department.changed',
  COURSE_COMPLETED = 'course.completed',
  COURSE_NOT_COMPLETED = 'course.not_completed',
  COURSE_ENROLLED = 'course.enrolled',
  AVATAR_SESSION_COMPLETED = 'avatar_training.session_completed',
  AVATAR_SESSION_FAILED = 'avatar_training.session_failed',
  PDI_CREATED = 'pdi.created',
  PDI_APPROVED = 'pdi.approved',
  PDI_AT_RISK = 'pdi.at_risk',
  PDI_COMPLETED = 'pdi.completed',
  EVALUATION_SUBMITTED = 'evaluation.submitted',
  BADGE_AWARDED = 'badge.awarded',
  CERTIFICATION_EXPIRING = 'certification.expiring',
  LEAVE_APPROVED = 'leave.approved',
  ABSENCE_REGISTERED = 'absence.registered',
  HIRE_DATE_REACHED = 'hire_date.reached',
  DEADLINE_REACHED = 'deadline.reached',
  COMPETENCY_BELOW_EXPECTED = 'competency.below_expected',
  OBJECTIVE_OVERDUE = 'objective.overdue',
  // Processos (docs/Modulo_Processes.md §9) — emitidos pelo motor de processos
  PROCESS_CREATED = 'process.created',
  PROCESS_COMPLETED = 'process.completed',
  PROCESS_CANCELLED = 'process.cancelled',
  PROCESS_OVERDUE = 'process.overdue',
  TASK_ASSIGNED = 'task.assigned',
  TASK_COMPLETED = 'task.completed',
  TASK_NEAR_DEADLINE = 'task.near_deadline',
  TASK_OVERDUE = 'task.overdue',
  APPROVAL_REQUESTED = 'approval.requested',
  APPROVAL_DECIDED = 'approval.decided',
  PROCESS_INTEGRATION_REQUESTED = 'process.integration_requested',
  PROCESS_INTEGRATION_FAILED = 'process.integration_failed',
  // Scheduled
  CRON_DAILY = 'cron.daily',
  CRON_WEEKLY = 'cron.weekly',
  CRON_MONTHLY = 'cron.monthly',
  // Legacy (from original)
  BIRTHDAY_TODAY = 'BIRTHDAY_TODAY',
  PENDING_LEAVE_3_DAYS = 'PENDING_LEAVE_3_DAYS',
  ENROLLMENT_EXPIRING = 'ENROLLMENT_EXPIRING',
  PAYSLIP_DUE = 'PAYSLIP_DUE',
  // Manual / catch-all
  MANUAL = 'manual',
  OTHER = 'other',
}

export enum ActionType {
  SEND_EMAIL = 'send_email',
  SEND_NOTIFICATION = 'send_notification',
  SEND_SMS = 'send_sms',
  SEND_WHATSAPP = 'send_whatsapp',
  CREATE_TASK = 'create_task',
  ASSIGN_COURSE = 'assign_course',
  ENROLL_TRAINING = 'enroll_training',
  CREATE_PDI = 'create_pdi',
  APPROVE_PDI = 'approve_pdi',
  UPDATE_STATUS = 'update_status',
  ASSIGN_OWNER = 'assign_owner',
  REQUEST_APPROVAL = 'request_approval',
  CREATE_ALERT = 'create_alert',
  AWARD_BADGE = 'award_badge',
  AWARD_POINTS = 'award_points',
  UPDATE_EMPLOYEE = 'update_employee',
  WEBHOOK = 'webhook',
  HTTP_REQUEST = 'http_request',
  INTEGRATE_EXTERNAL = 'integrate_external',
  GENERATE_REPORT = 'generate_report',
  RUN_AUTOMATION = 'run_automation',
  LOG = 'log',
  WAIT = 'wait',
  OTHER = 'other',
  // Processos (docs/Modulo_Processes.md §9) — registadas pelo módulo de processos
  PROCESS_START = 'process_start',
  PROCESS_ASSIGN_RESPONSIBLE = 'process_assign_responsible',
  PROCESS_SET_PRIORITY = 'process_set_priority',
  PROCESS_ESCALATE_TASK = 'process_escalate_task',
  PROCESS_RETRY_STEP = 'process_retry_step',
  // Legacy
  SEND_BIRTHDAY_NOTIFICATION = 'SEND_BIRTHDAY_NOTIFICATION',
  NOTIFY_MANAGER = 'NOTIFY_MANAGER',
  NOTIFY_LEARNER = 'NOTIFY_LEARNER',
  NOTIFY_HR = 'NOTIFY_HR',
}

export { AutomationCategory, ExecutionStatus };

// Operador de uma linha de condição do form builder — avaliado por
// evaluateConditionRow() em automation.service.ts.
export enum ConditionOperator {
  EQUALS = 'equals',
  NOT_EQUALS = 'not_equals',
  GREATER_THAN = 'greater_than',
  LESS_THAN = 'less_than',
  CONTAINS = 'contains',
  NOT_CONTAINS = 'not_contains',
  IS_EMPTY = 'is_empty',
  IS_NOT_EMPTY = 'is_not_empty',
}

export enum ConditionsLogic {
  AND = 'AND',
  OR = 'OR',
}

export enum CommunicationChannel {
  INTERNAL = 'internal',
  EMAIL = 'email',
  SMS = 'sms',
  WHATSAPP = 'whatsapp',
  PUSH = 'push',
  WEBHOOK = 'webhook',
}

// Frequência de agendamento capturada no form — ver comentário em
// createRule() sobre não haver (ainda) um scheduler que a consuma.
export enum RuleFrequency {
  ONCE = 'once',
  HOURLY = 'hourly',
  DAILY = 'daily',
  WEEKLY = 'weekly',
  MONTHLY = 'monthly',
  CUSTOM = 'custom',
}

export enum RuleEnvironment {
  DEVELOPMENT = 'development',
  STAGING = 'staging',
  PRODUCTION = 'production',
}

export class ConditionRuleDto {
  @ApiProperty({ description: 'Campo do payload do evento a avaliar (ex: departmentId)' })
  @IsString()
  @MaxLength(100)
  field!: string;

  @ApiProperty({ enum: ConditionOperator })
  @IsEnum(ConditionOperator)
  operator!: ConditionOperator;

  @ApiPropertyOptional({ description: 'Não aplicável a is_empty / is_not_empty' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  value?: string;
}

// ─── Rule DTOs ────────────────────────────────────────────────────

export class CreateRuleDto {
  @ApiProperty()
  @IsString()
  @MaxLength(200)
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ enum: TriggerType })
  @IsEnum(TriggerType)
  trigger!: TriggerType;

  @ApiPropertyOptional({
    enum: ActionType,
    description: 'Acção única (regras simples). Dispensável quando `flow` define as acções.',
  })
  @ValidateIf(o => !o.flow)
  @IsEnum(ActionType)
  action!: ActionType;

  // ── Construtor de Fluxos (§4) ────────────────────────────────
  @ApiPropertyOptional({
    description:
      'Fluxo { steps: [...] } com acções, condições Sim/Não e atrasos — substitui a acção única',
  })
  @IsOptional()
  @IsObject()
  flow?: FlowDefinition;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @MaxLength(40, { each: true })
  tags?: string[];

  @ApiPropertyOptional({ type: [String], description: 'Departamentos abrangidos' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  departmentIds?: string[];

  @ApiPropertyOptional({
    description: 'Guardar como rascunho: fica inactiva e nunca dispara até ser publicada',
  })
  @IsOptional()
  @IsBoolean()
  draft?: boolean;

  @ApiPropertyOptional({ description: 'Condição JSON — ex: {"minScore": 4, "departmentId": 1}' })
  @IsOptional()
  @IsString()
  condition?: string;

  @ApiPropertyOptional({ description: 'Parâmetros da acção em JSON — ex: {"courseId": 5}' })
  @IsOptional()
  @IsString()
  actionParams?: string;

  @ApiPropertyOptional({ enum: AutomationCategory })
  @IsOptional()
  @IsEnum(AutomationCategory)
  category?: AutomationCategory;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  priority?: number;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @ApiPropertyOptional({ description: 'Cron expression (para triggers agendados)' })
  @IsOptional()
  @IsString()
  cronExpression?: string;

  @ApiPropertyOptional({ default: 3, description: 'Nº máximo de retries em caso de falha' })
  @IsOptional()
  @IsInt()
  @Min(0)
  maxRetries?: number;

  // ── Entidade / condições avançadas ────────────────────────────
  @ApiPropertyOptional({
    description: 'Entidade alvo do gatilho — ex: "User", "Course", "Enrollment"',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  entity?: string;

  @ApiPropertyOptional({
    type: [ConditionRuleDto],
    description: 'Condições adicionais (campo/operador/valor)',
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ConditionRuleDto)
  conditions?: ConditionRuleDto[];

  @ApiPropertyOptional({
    enum: ConditionsLogic,
    default: ConditionsLogic.AND,
    description: 'Como combinar as linhas de `conditions` entre si',
  })
  @IsOptional()
  @IsEnum(ConditionsLogic)
  conditionsLogic?: ConditionsLogic;

  // ── Configuração da acção ─────────────────────────────────────
  @ApiPropertyOptional({ description: 'userId, roleCode ou departmentId destinatário da acção' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  recipient?: string;

  @ApiPropertyOptional({ enum: CommunicationChannel })
  @IsOptional()
  @IsEnum(CommunicationChannel)
  channel?: CommunicationChannel;

  @ApiPropertyOptional({
    description:
      'Corpo da mensagem/notificação — suporta placeholders {{campo}} resolvidos a partir de dynamicData',
  })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  messageTemplate?: string;

  @ApiPropertyOptional({ description: 'Assunto — usado quando channel é email' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  subject?: string;

  @ApiPropertyOptional({
    description:
      'JSON com dados dinâmicos para interpolar no messageTemplate — ex: {"nomeCurso": "..."}',
  })
  @IsOptional()
  @IsString()
  dynamicData?: string;

  @ApiPropertyOptional({ description: 'Prazo para execução da acção, em minutos após o gatilho' })
  @IsOptional()
  @IsInt()
  @Min(0)
  deadlineMinutes?: number;

  // ── Agendamento ────────────────────────────────────────────────
  @ApiPropertyOptional({ enum: RuleFrequency })
  @IsOptional()
  @IsEnum(RuleFrequency)
  frequency?: RuleFrequency;

  @ApiPropertyOptional({ description: 'Horário de execução, formato HH:mm' })
  @IsOptional()
  @IsString()
  @MaxLength(5)
  executionTime?: string;

  @ApiPropertyOptional({ type: [Number], description: '0=Domingo … 6=Sábado' })
  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  daysOfWeek?: number[];

  @ApiPropertyOptional() @IsOptional() @IsDateString() startDate?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() endDate?: string;

  @ApiPropertyOptional({
    description: 'Nº máximo de execuções — a regra não corre mais além deste limite',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  maxExecutions?: number;

  // ── Gestão ───────────────────────────────────────────────────
  @ApiPropertyOptional({ description: 'userId do responsável pela regra — default: quem a cria' })
  @IsOptional()
  @IsString()
  ownerId?: string;

  @ApiPropertyOptional({ enum: RuleEnvironment, default: RuleEnvironment.PRODUCTION })
  @IsOptional()
  @IsEnum(RuleEnvironment)
  environment?: RuleEnvironment;

  @ApiPropertyOptional({
    default: true,
    description: 'Notificar o responsável quando uma execução falha',
  })
  @IsOptional()
  @IsBoolean()
  notifyOnError?: boolean;

  @ApiPropertyOptional({ description: 'Observações livres' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;

  // ── Módulo de origem, vigência e tratamento de erros (§9 Processos) ──
  @ApiPropertyOptional({ description: 'Código da regra (único) — gerado se omitido nos Processos' })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  code?: string;

  @ApiPropertyOptional({ description: 'Módulo de origem — ex: PROCESSES' })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  module?: string;

  @ApiPropertyOptional({ description: 'A regra só dispara a partir desta data' })
  @IsOptional()
  @IsDateString()
  activeFrom?: string;

  @ApiPropertyOptional({ description: 'A regra expira nesta data' })
  @IsOptional()
  @IsDateString()
  activeUntil?: string;

  @ApiPropertyOptional({ enum: ['NONE', 'FIXED', 'EXPONENTIAL'] })
  @IsOptional()
  @IsEnum(['NONE', 'FIXED', 'EXPONENTIAL'])
  retryPolicy?: 'NONE' | 'FIXED' | 'EXPONENTIAL';

  @ApiPropertyOptional({ description: 'Intervalo base entre tentativas, em minutos' })
  @IsOptional()
  @IsInt()
  @Min(1)
  retryDelayMinutes?: number;

  @ApiPropertyOptional({ enum: ['LOG', 'NOTIFY_OWNER', 'DISABLE_RULE'] })
  @IsOptional()
  @IsEnum(['LOG', 'NOTIFY_OWNER', 'DISABLE_RULE'])
  errorHandling?: 'LOG' | 'NOTIFY_OWNER' | 'DISABLE_RULE';
}

export class UpdateRuleDto {
  @ApiPropertyOptional() @IsOptional() @IsString() name?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() condition?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() actionParams?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() active?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) priority?: number;
}

// ─── Execution DTOs ───────────────────────────────────────────────

export class TriggerEventDto {
  @ApiProperty({ enum: TriggerType }) @IsEnum(TriggerType) event!: TriggerType;
  @ApiPropertyOptional() @IsOptional() payload?: Record<string, unknown>;
  @ApiPropertyOptional() @IsOptional() @IsInt() userId?: number;

  // ── Envelope do evento (§5) ─────────────────────────────────
  @ApiPropertyOptional({
    description: 'Identificador único do evento — o mesmo eventId nunca é processado duas vezes',
  })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  eventId?: string;
  @ApiPropertyOptional({ description: 'Módulo de origem (ex: PDI)' })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  module?: string;
  @ApiPropertyOptional({ description: 'Tipo do registo afectado (ex: Enrollment)' })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  recordType?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(120) recordId?: string;
  @ApiPropertyOptional({ description: 'Liga eventos/execuções encadeadas entre módulos' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  correlationId?: string;
}

export class FlowTestDto {
  @ApiPropertyOptional({ description: 'Dados de exemplo do evento' })
  @IsOptional()
  @IsObject()
  payload?: Record<string, unknown>;
}

export class PublishRuleDto {
  @ApiPropertyOptional({ description: 'Nota da versão (o que mudou)' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class EventFilterDto extends BaseFilterDto {
  @ApiPropertyOptional() @IsOptional() @IsString() module?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() type?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() correlationId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() from?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() to?: string;
}

// ─── Agendamentos (§6) ────────────────────────────────────────────

export const SCHEDULE_TYPES = ['ONCE', 'DAILY', 'WEEKLY', 'MONTHLY', 'CUSTOM'] as const;
export const SCHEDULE_STATUSES = ['ACTIVE', 'PAUSED', 'COMPLETED', 'ERROR'] as const;
export const MISSED_POLICIES = ['RUN_ONCE', 'RUN_ALL', 'SKIP'] as const;

export class CreateScheduleDto {
  @ApiProperty() @IsString() @MaxLength(200) name!: string;
  @ApiProperty({ description: 'Automação (regra) a executar' })
  @IsInt()
  @Type(() => Number)
  ruleId!: number;
  @ApiProperty({ enum: SCHEDULE_TYPES }) @IsIn(SCHEDULE_TYPES as readonly string[]) type!: string;
  @ApiProperty({ description: 'Data de início (ISO)' }) @IsDateString() startDate!: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() endDate?: string;
  @ApiProperty({ description: 'HH:mm no fuso configurado' })
  @IsString()
  @MaxLength(5)
  time!: string;
  @ApiPropertyOptional({ default: 'Africa/Luanda' })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  timezone?: string;
  @ApiPropertyOptional({ type: [Number], description: '0=Domingo … 6=Sábado (WEEKLY)' })
  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  @Min(0, { each: true })
  @Max(6, { each: true })
  daysOfWeek?: number[];
  @ApiPropertyOptional({ description: 'Dia do mês 1-31 (MONTHLY)' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(31)
  dayOfMonth?: number;
  @ApiPropertyOptional({ description: 'Cron de 5 campos (CUSTOM)' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  cronExpression?: string;
  @ApiPropertyOptional({ enum: MISSED_POLICIES, default: 'RUN_ONCE' })
  @IsOptional()
  @IsIn(MISSED_POLICIES as readonly string[])
  missedPolicy?: string;
  @ApiPropertyOptional({ description: 'userId do responsável — default: quem cria' })
  @IsOptional()
  @IsString()
  ownerId?: string;
}

export class UpdateScheduleDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) name?: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Type(() => Number) ruleId?: number;
  @ApiPropertyOptional({ enum: SCHEDULE_TYPES })
  @IsOptional()
  @IsIn(SCHEDULE_TYPES as readonly string[])
  type?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() startDate?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() endDate?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(5) time?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(60) timezone?: string;
  @ApiPropertyOptional({ type: [Number] })
  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  @Min(0, { each: true })
  @Max(6, { each: true })
  daysOfWeek?: number[];
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) @Max(31) dayOfMonth?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(100) cronExpression?: string;
  @ApiPropertyOptional({ enum: MISSED_POLICIES })
  @IsOptional()
  @IsIn(MISSED_POLICIES as readonly string[])
  missedPolicy?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() ownerId?: string;
}

export class ScheduleFilterDto extends BaseFilterDto {
  @ApiPropertyOptional({ enum: SCHEDULE_STATUSES })
  @IsOptional()
  @IsIn(SCHEDULE_STATUSES as readonly string[])
  status?: string;
  @ApiPropertyOptional({ enum: SCHEDULE_TYPES })
  @IsOptional()
  @IsIn(SCHEDULE_TYPES as readonly string[])
  type?: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Type(() => Number) ruleId?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(120) search?: string;
}

export class ExecutionFilterDto extends BaseFilterDto {
  @ApiPropertyOptional({ enum: ExecutionStatus })
  @IsOptional()
  @IsEnum(ExecutionStatus)
  status?: ExecutionStatus;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Type(() => Number) ruleId?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() from?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() to?: string;
}

// ─── Listagem "Todas as Automações" (docs/modulo_automation.md §3) ─

/** Estado derivado da regra — não há coluna dedicada; vem de active + lastRunStatus. */
export enum RuleListStatus {
  DRAFT = 'DRAFT',
  ACTIVE = 'ACTIVE',
  PAUSED = 'PAUSED',
  ERROR = 'ERROR',
}

const toBool = ({ value }: { value: unknown }) =>
  value === 'true' || value === true
    ? true
    : value === 'false' || value === false
      ? false
      : undefined;

export class RuleFilterDto {
  @ApiPropertyOptional({ description: 'Pesquisa por nome ou código' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  search?: string;

  @ApiPropertyOptional() @IsOptional() @IsString() module?: string;
  @ApiPropertyOptional({ enum: AutomationCategory })
  @IsOptional()
  @IsEnum(AutomationCategory)
  category?: AutomationCategory;
  @ApiPropertyOptional({ enum: RuleListStatus })
  @IsOptional()
  @IsEnum(RuleListStatus)
  status?: RuleListStatus;
  @ApiPropertyOptional({ description: 'userId do responsável' })
  @IsOptional()
  @IsString()
  ownerId?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() createdFrom?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() createdTo?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() lastRunFrom?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() lastRunTo?: string;
  @ApiPropertyOptional({ description: 'Só regras com pelo menos uma execução falhada' })
  @IsOptional()
  @Transform(toBool)
  @IsBoolean()
  withFailures?: boolean;
}

// ─── Visão Geral (docs/modulo_automation.md §2) ───────────────────

export enum OverviewGranularity {
  DAY = 'day',
  WEEK = 'week',
  MONTH = 'month',
}

export class OverviewFilterDto {
  @ApiPropertyOptional({ description: 'Início do período (ISO). Omissão: últimos 30 dias' })
  @IsOptional()
  @IsDateString()
  from?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() to?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() module?: string;
  @ApiPropertyOptional({ enum: AutomationCategory })
  @IsOptional()
  @IsEnum(AutomationCategory)
  category?: AutomationCategory;
  @ApiPropertyOptional({ enum: ExecutionStatus })
  @IsOptional()
  @IsEnum(ExecutionStatus)
  status?: ExecutionStatus;
  @ApiPropertyOptional({ enum: OverviewGranularity })
  @IsOptional()
  @IsEnum(OverviewGranularity)
  granularity?: OverviewGranularity;
}
