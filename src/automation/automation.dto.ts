// src/automation/automation.dto.ts
import {
  IsString,
  IsOptional,
  IsEnum,
  IsBoolean,
  IsInt,
  IsArray,
  IsDateString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { AutomationCategory, ExecutionStatus } from '@prisma/client';
import { BaseFilterDto } from '../common/dtos/pagination.dto';

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
  LOG = 'log',
  WAIT = 'wait',
  OTHER = 'other',
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

  @ApiProperty({ enum: ActionType })
  @IsEnum(ActionType)
  action!: ActionType;

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
