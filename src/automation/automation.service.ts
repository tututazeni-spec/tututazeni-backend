// src/automation/automation.service.ts
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import {
  EnrollmentStatus,
  EnrollmentOrigin,
  Prisma,
  AutomationTrigger,
  PlanStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { EnrollmentsService } from '../enrollments/enrollments.service';
import { DevelopmentPlansService } from '../development-plans/development-plans.service';
import { GamificationService } from '../gamification/gamification.service';
import { MailService } from '../mail/mail.service';
import { SmsService } from '../sms/sms.service';
import {
  CreateRuleDto,
  UpdateRuleDto,
  TriggerEventDto,
  ExecutionFilterDto,
  TriggerType,
  ActionType,
  AutomationCategory,
  ConditionRuleDto,
  ConditionsLogic,
  CommunicationChannel,
  RuleFilterDto,
  RuleListStatus,
  OverviewFilterDto,
  OverviewGranularity,
  EventFilterDto,
} from './automation.dto';
import { calculatePagination, buildPaginatedResponse } from '../common/helpers/pagination.helper';
import {
  FlowInstruction,
  FlowActionStep,
  FlowApprovalStep,
  FlowDefinition,
  compileFlow,
  firstActionOf,
  parseFlow,
  validateFlow,
} from './automation-flow';
import { EVENT_CATALOG, moduleOfTrigger } from './automation-events.catalog';
import { appendHistory } from './automation-tasks.util';
import { failureCode, classifyFailure } from './automation-failure.util';
import {
  AutomationSettingsService,
  AutomationLimits,
  DEFAULT_LIMITS,
} from './automation-settings.service';
import { AutomationAuditService, diffFields } from './automation-audit.service';
import { AutomationFailuresService } from './automation-failures.service';
import { AutomationConnectionsService } from './automation-connections.service';
import { createNotificationSafe } from '../common/helpers/notification.helper';
import { resolveDefaultTenantId } from '../common/helpers/tenant.helper';

// ─── Helpers ─────────────────────────────────────────────────────

const helpersLogger = new Logger('AutomationHelpers');

export type AutomationRuleRecord = Prisma.AutomationRuleGetPayload<object>;

// Condição/parâmetros de acção são JSON livre por regra (parseCondition()/
// parseParams() acima devolvem Record<string, unknown>) — este shape
// cobre apenas os campos realmente lidos em executeAction() abaixo, sem
// fingir conhecer o contrato completo de todas as regras possíveis.
interface AutomationActionParams {
  type?: string;
  message?: string;
  courseId?: number;
  name?: string;
  status?: PlanStatus;
  goal?: string;
  points?: number;
  badgeCode?: string;
  url?: string;
  connectionId?: string;
  path?: string;
  method?: string;
  headers?: Record<string, string>;
  recipient?: string;
  channel?: string;
  messageTemplate?: string;
  subject?: string;
  dynamicData?: Record<string, unknown>;
  deadlineMinutes?: number;
}

export interface ActionResult {
  affected: number;
  message?: string;
  points?: number;
  logged?: boolean;
  httpStatus?: number;
  error?: string;
}

/** Contexto entregue às acções registadas por outros módulos (ex.: Processos). */
export interface RegisteredActionContext {
  rule: AutomationRuleRecord;
  params: Record<string, unknown>;
  payload: Record<string, unknown>;
  userId?: number;
}
export type RegisteredActionHandler = (ctx: RegisteredActionContext) => Promise<ActionResult>;

interface ExecutionMeta {
  dedupeKey?: string;
  attempt?: number;
  /** §5 — envelope do evento que originou a execução. */
  eventId?: string;
  correlationId?: string;
  depth?: number;
  /** Regras já percorridas na cadeia (prevenção de ciclos). */
  chain?: number[];
  scheduleId?: string;
  /** §4 — retoma o fluxo desta instrução (nova tentativa / depois de um atraso). */
  startPc?: number;
  priorSteps?: FlowStepLog[];
  /** Execução existente a continuar (retoma depois de um atraso). */
  resumeExecId?: string;
  /** §7 — utilizador (id) que iniciou a execução; omitido = SYSTEM. */
  triggeredBy?: string;
}

/** Resultado de uma etapa de um fluxo — gravado em AutomationExecution.actionsLog. */
export interface FlowStepLog {
  ref: string;
  type: 'action' | 'condition' | 'delay' | 'approval';
  label?: string;
  action?: string;
  status: 'SUCCESS' | 'FAILED' | 'SKIPPED' | 'WAITING';
  decision?: 'yes' | 'no';
  /** §8 — desfecho do pedido de aprovação/tarefa e tarefa criada. */
  outcome?: string;
  taskId?: string;
  result?: ActionResult;
  error?: string;
  durationMs?: number;
  at: string;
}

/** Limite de profundidade de uma cadeia evento → regra → evento (prevenção de ciclos). */
export const MAX_EVENT_DEPTH = 5;
/** Execuções por minuto e por regra acima das quais novos eventos são ignorados. */
export const MAX_RULE_EXECUTIONS_PER_MINUTE = 120;

export interface AutomationChainMeta {
  correlationId: string;
  depth: number;
  chain: number[];
}

function readChainMeta(payload: Record<string, unknown>): AutomationChainMeta {
  const raw = payload._automation as Partial<AutomationChainMeta> | undefined;
  return {
    correlationId: typeof raw?.correlationId === 'string' ? raw.correlationId : randomUUID(),
    depth: typeof raw?.depth === 'number' ? raw.depth : 0,
    chain: Array.isArray(raw?.chain) ? raw.chain.filter(n => typeof n === 'number') : [],
  };
}

const retryDelayMs = (rule: AutomationRuleRecord, attempt: number): number | null => {
  const base = (rule.retryDelayMinutes ?? 5) * 60_000;
  if (rule.retryPolicy === 'FIXED') return base;
  if (rule.retryPolicy === 'EXPONENTIAL') return base * 2 ** Math.max(0, attempt - 1);
  return null;
};

const inActiveWindow = (rule: AutomationRuleRecord, now: Date) =>
  (!rule.activeFrom || rule.activeFrom <= now) && (!rule.activeUntil || rule.activeUntil >= now);

// Condição/parâmetros de acção são JSON livre por regra — o shape varia
// consoante o tipo de trigger/acção, sem um contrato único possível.
function parseCondition(condition?: string | null): Record<string, unknown> {
  if (!condition) return {};
  try {
    return JSON.parse(condition);
  } catch (e: unknown) {
    helpersLogger.warn({
      condition,
      action: 'PARSE_AUTOMATION_CONDITION',
      err: { message: e instanceof Error ? e.message : String(e) },
      msg: 'Falha ao fazer parse da condição da regra de automação — JSON inválido',
    });
    return {};
  }
}

// Formato estruturado gravado em AutomationRule.conditionsJson pelo condition
// builder do form (linhas field/operator/value + lógica E/OU entre elas).
// Ver ConditionRuleDto/ConditionsLogic em automation.dto.ts.
interface StructuredConditions {
  logic: ConditionsLogic;
  rows: ConditionRuleDto[];
}

function parseConditionsList(conditionsJson?: string | null): StructuredConditions | null {
  if (!conditionsJson) return null;
  try {
    const parsed = JSON.parse(conditionsJson) as Partial<StructuredConditions>;
    if (!Array.isArray(parsed.rows) || !parsed.rows.length) return null;
    return {
      logic: parsed.logic === ConditionsLogic.OR ? ConditionsLogic.OR : ConditionsLogic.AND,
      rows: parsed.rows,
    };
  } catch (e: unknown) {
    helpersLogger.warn({
      conditionsJson,
      action: 'PARSE_AUTOMATION_CONDITIONS_JSON',
      err: { message: e instanceof Error ? e.message : String(e) },
      msg: 'Falha ao fazer parse de conditionsJson — JSON inválido',
    });
    return null;
  }
}

function evaluateConditionRow(row: ConditionRuleDto, payload: Record<string, unknown>): boolean {
  const actual = payload[row.field];
  const expected = row.value;
  switch (row.operator) {
    case 'not_equals':
      return String(actual ?? '') !== String(expected ?? '');
    case 'greater_than':
      return Number(actual) > Number(expected);
    case 'less_than':
      return Number(actual) < Number(expected);
    case 'contains':
      return typeof actual === 'string' && actual.includes(String(expected ?? ''));
    case 'not_contains':
      return !(typeof actual === 'string' && actual.includes(String(expected ?? '')));
    case 'is_empty':
      return actual === undefined || actual === null || actual === '';
    case 'is_not_empty':
      return !(actual === undefined || actual === null || actual === '');
    case 'equals':
    default:
      return String(actual ?? '') === String(expected ?? '');
  }
}

// Substitui placeholders {{campo}} pelo valor em dynamicData, com fallback
// para o payload do evento — usado em messageTemplate/subject.
function interpolate(
  template: string | undefined,
  dynamicData: Record<string, unknown> | undefined,
  payload: Record<string, unknown>,
): string | undefined {
  if (!template) return template;
  return template.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_match, key: string) => {
    const value = dynamicData?.[key] ?? payload[key];
    return value === undefined || value === null ? '' : String(value);
  });
}

function parseJsonArray(json?: string | null): string[] {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json) as unknown;
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

function parseParams(params?: string | null): Record<string, unknown> {
  if (!params) return {};
  try {
    return JSON.parse(params);
  } catch (e: unknown) {
    helpersLogger.warn({
      params,
      action: 'PARSE_AUTOMATION_ACTION_PARAMS',
      err: { message: e instanceof Error ? e.message : String(e) },
      msg: 'Falha ao fazer parse dos actionParams da regra de automação — JSON inválido',
    });
    return {};
  }
}

// ─── Built-in default rules ──────────────────────────────────────

const DEFAULT_RULES: Omit<CreateRuleDto, never>[] = [
  {
    name: 'Parabéns de Aniversário',
    description: 'Envia notificação de aniversário no dia do aniversário',
    trigger: TriggerType.BIRTHDAY_TODAY,
    action: ActionType.SEND_NOTIFICATION,
    category: AutomationCategory.ENGAGEMENT,
    condition: '',
    actionParams: JSON.stringify({
      type: 'BIRTHDAY',
      message: 'Parabéns pelo teu aniversário! 🎂',
    }),
    active: true,
    priority: 10,
  },
  {
    name: 'Lembrete de Formação em Atraso',
    description: 'Notifica colaboradores com formações em progresso há mais de 14 dias',
    trigger: TriggerType.ENROLLMENT_EXPIRING,
    action: ActionType.SEND_NOTIFICATION,
    category: AutomationCategory.LMS,
    condition: '',
    actionParams: JSON.stringify({
      type: 'ENROLLMENT_REMINDER',
      message: 'Tens formações por concluir!',
    }),
    active: true,
    priority: 20,
  },
  {
    name: 'Verificação de Recibos Pendentes',
    description: 'Alerta RH no dia 25 sobre recibos por emitir',
    trigger: TriggerType.PAYSLIP_DUE,
    action: ActionType.NOTIFY_HR,
    category: AutomationCategory.OPERATIONAL,
    condition: '',
    actionParams: JSON.stringify({ type: 'PAYSLIP_REMINDER', notifyRole: 'RH' }),
    active: true,
    priority: 30,
  },
  {
    name: 'PDI automático pós-avaliação excelente',
    description: 'Cria PDI sugerido quando score de avaliação ≥ 4.5',
    trigger: TriggerType.EVALUATION_SUBMITTED,
    action: ActionType.CREATE_PDI,
    category: AutomationCategory.PERFORMANCE,
    condition: JSON.stringify({ minScore: 4.5 }),
    actionParams: JSON.stringify({ name: 'PDI Aceleração — High Performer', status: 'DRAFT' }),
    active: true,
    priority: 40,
  },
  {
    name: 'Badge por conclusão de curso',
    description: 'Atribui badge ao concluir um curso com score ≥ 80',
    trigger: TriggerType.COURSE_COMPLETED,
    action: ActionType.AWARD_BADGE,
    category: AutomationCategory.GAMIFICATION,
    condition: JSON.stringify({ minScore: 80 }),
    actionParams: JSON.stringify({ badgeCode: 'COURSE_COMPLETE' }),
    active: true,
    priority: 50,
  },
  {
    name: 'Pontos por conclusão de curso',
    description: 'Atribui 50 XP ao concluir qualquer curso',
    trigger: TriggerType.COURSE_COMPLETED,
    action: ActionType.AWARD_POINTS,
    category: AutomationCategory.GAMIFICATION,
    condition: '',
    actionParams: JSON.stringify({ points: 50 }),
    active: true,
    priority: 55,
  },
  {
    name: 'Notificação de novo colaborador',
    description: 'Envia boas-vindas e atribui curso de integração ao criar utilizador',
    trigger: TriggerType.EMPLOYEE_CREATED,
    action: ActionType.SEND_NOTIFICATION,
    category: AutomationCategory.HR,
    condition: '',
    actionParams: JSON.stringify({ type: 'WELCOME', message: 'Bem-vindo à INNOVA!' }),
    active: true,
    priority: 60,
  },
];

// ─────────────────────────────────────────────────────────────────
// SERVICE
// ─────────────────────────────────────────────────────────────────

/** Estado derivado para a listagem (não há coluna): pausada > erro > activa. */
function deriveRuleStatus(r: {
  active: boolean;
  draft?: boolean;
  lastRunStatus: string | null;
}): RuleListStatus {
  if (r.draft) return RuleListStatus.DRAFT;
  if (!r.active) return RuleListStatus.PAUSED;
  return r.lastRunStatus === 'FAILED' ? RuleListStatus.ERROR : RuleListStatus.ACTIVE;
}

/** Minutos de trabalho manual assumidos por execução bem-sucedida — apenas uma estimativa. */
export const MANUAL_MINUTES_PER_EXECUTION = 5;

export function bucketKey(d: Date, g: OverviewGranularity): string {
  const iso = d.toISOString();
  if (g === OverviewGranularity.MONTH) return iso.slice(0, 7);
  if (g === OverviewGranularity.WEEK) {
    const day = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
    day.setUTCDate(day.getUTCDate() - ((day.getUTCDay() + 6) % 7)); // segunda-feira
    return day.toISOString().slice(0, 10);
  }
  return iso.slice(0, 10);
}

export { failureCode, classifyFailure } from './automation-failure.util';

@Injectable()
export class AutomationService {
  private readonly logger = new Logger(AutomationService.name);

  // Acções implementadas por outros módulos (sem dependência circular):
  // o módulo regista aqui o handler no arranque (ver ProcessAutomationActions).
  private readonly handlers = new Map<string, RegisteredActionHandler>();

  registerActionHandler(action: string, handler: RegisteredActionHandler) {
    this.handlers.set(action, handler);
  }

  constructor(
    private readonly prisma: PrismaService,
    private readonly enrollments: EnrollmentsService,
    private readonly developmentPlans: DevelopmentPlansService,
    private readonly gamification: GamificationService,
    private readonly mail: MailService,
    private readonly sms: SmsService,
    // §10 — governação. Opcionais para que módulos/testes que só precisam do motor
    // básico continuem a instanciá-lo; em produção o AutomationModule fornece-os.
    @Optional() private readonly settings?: AutomationSettingsService,
    @Optional() private readonly audit?: AutomationAuditService,
    @Optional() private readonly failures?: AutomationFailuresService,
    @Optional() private readonly connections?: AutomationConnectionsService,
  ) {}

  private limits(): Promise<AutomationLimits> {
    return this.settings ? this.settings.get() : Promise.resolve({ ...DEFAULT_LIMITS });
  }

  // Carrega email/telemóvel do destinatário — só chamado quando o canal
  // pedido precisa mesmo deles (evita uma query extra no caminho comum,
  // canal "internal").
  private async resolveRecipientContact(
    userId: number,
  ): Promise<{ email: string; phone: string | null } | null> {
    return this.prisma.read.user.findUnique({
      where: { id: userId },
      select: { email: true, phone: true },
    });
  }

  // Entrega best-effort por email/SMS/WhatsApp para o canal pedido no
  // SEND_NOTIFICATION/CREATE_ALERT — nunca lança: a notificação interna
  // (createNotificationSafe, já criada por quem chama) é o registo oficial;
  // isto é só o canal externo a melhor esforço. Push/Webhook continuam sem
  // integração nesta app (sem tokens de dispositivo / URL associado aqui).
  private async deliverViaChannel(opts: {
    channel?: string;
    userId: number;
    subject: string;
    message: string;
    ruleId: number;
  }): Promise<void> {
    const { channel, userId, subject, message, ruleId } = opts;
    if (!channel || channel === CommunicationChannel.INTERNAL) return;

    if (
      channel !== CommunicationChannel.EMAIL &&
      channel !== CommunicationChannel.SMS &&
      channel !== CommunicationChannel.WHATSAPP
    ) {
      this.logger.warn({
        ruleId,
        channel,
        action: 'AUTOMATION_CHANNEL_NOT_INTEGRATED',
        msg: 'Canal pedido sem integração de entrega real nesta app — registada apenas notificação interna',
      });
      return;
    }

    const contact = await this.resolveRecipientContact(userId);
    try {
      if (channel === CommunicationChannel.EMAIL) {
        if (!contact?.email) throw new Error('utilizador sem email registado');
        await this.mail.sendNotification(contact.email, subject, message);
      } else if (channel === CommunicationChannel.SMS) {
        if (!contact?.phone) throw new Error('utilizador sem telemóvel registado');
        await this.sms.sendSms(contact.phone, message);
      } else {
        if (!contact?.phone) throw new Error('utilizador sem telemóvel registado');
        await this.sms.sendWhatsApp(contact.phone, message);
      }
    } catch (e: unknown) {
      this.logger.warn({
        ruleId,
        userId,
        channel,
        action: 'AUTOMATION_CHANNEL_DELIVERY_FAILED',
        err: { message: e instanceof Error ? e.message : String(e) },
        msg: 'Falha ao entregar pelo canal pedido — notificação interna já registada',
      });
    }
  }

  // ══════════════════════════════════════════════════════
  // RULES — CRUD
  // ══════════════════════════════════════════════════════

  /**
   * Lista "Todas as Automações" (docs/modulo_automation.md §3). Aceita a
   * categoria solta (chamadores antigos) ou o conjunto completo de filtros.
   * O estado é derivado: não há coluna dedicada (ver RuleListStatus).
   */
  async getRules(
    filterOrCategory?: AutomationCategory | RuleFilterDto,
    scopeRuleIds?: number[] | null,
  ) {
    const f: RuleFilterDto =
      typeof filterOrCategory === 'string'
        ? { category: filterOrCategory }
        : (filterOrCategory ?? {});
    const where: Prisma.AutomationRuleWhereInput = {};
    const and: Prisma.AutomationRuleWhereInput[] = [];

    // §10 — âmbito por departamento: só as automações visíveis ao utilizador.
    if (scopeRuleIds) where.id = { in: scopeRuleIds };
    if (f.category) where.category = f.category;
    if (f.module) where.module = f.module;
    if (f.ownerId) where.ownerId = f.ownerId;
    if (f.search?.trim()) {
      const q = f.search.trim();
      and.push({
        OR: [
          { name: { contains: q, mode: 'insensitive' } },
          { code: { contains: q, mode: 'insensitive' } },
        ],
      });
    }
    if (f.status === RuleListStatus.DRAFT) where.draft = true;
    if (f.status === RuleListStatus.PAUSED) {
      where.active = false;
      where.draft = false;
    }
    if (f.status === RuleListStatus.ACTIVE) {
      where.active = true;
      and.push({ OR: [{ lastRunStatus: null }, { lastRunStatus: { not: 'FAILED' } }] });
    }
    if (f.status === RuleListStatus.ERROR) {
      where.active = true;
      where.lastRunStatus = 'FAILED';
    }
    if (f.createdFrom || f.createdTo) {
      where.createdAt = {
        ...(f.createdFrom ? { gte: new Date(f.createdFrom) } : {}),
        ...(f.createdTo ? { lte: new Date(f.createdTo) } : {}),
      };
    }
    if (f.lastRunFrom || f.lastRunTo) {
      where.lastRunAt = {
        ...(f.lastRunFrom ? { gte: new Date(f.lastRunFrom) } : {}),
        ...(f.lastRunTo ? { lte: new Date(f.lastRunTo) } : {}),
      };
    }
    if (f.withFailures) where.executions = { some: { status: 'FAILED' } };
    if (and.length) where.AND = and;

    const rules = await this.prisma.read.automationRule.findMany({
      where,
      orderBy: [{ active: 'desc' }, { priority: 'asc' }, { name: 'asc' }],
    });

    // Uma só query agregada em vez de 3 counts por regra.
    const ids = rules.map(r => r.id);
    const grouped = ids.length
      ? await this.prisma.automationExecution.groupBy({
          by: ['ruleId', 'status'],
          where: { ruleId: { in: ids } },
          _count: { _all: true },
        })
      : [];
    const counts = new Map<number, { total: number; success: number; failed: number }>();
    for (const g of grouped) {
      const c = counts.get(g.ruleId) ?? { total: 0, success: 0, failed: 0 };
      c.total += g._count._all;
      if (g.status === 'SUCCESS') c.success += g._count._all;
      if (g.status === 'FAILED') c.failed += g._count._all;
      counts.set(g.ruleId, c);
    }

    const ownerIds = [...new Set(rules.map(r => r.ownerId ?? r.createdBy))]
      .filter((v): v is string => !!v && /^\d+$/.test(v))
      .map(Number);
    const owners = ownerIds.length
      ? await this.prisma.read.user.findMany({
          where: { id: { in: ownerIds } },
          select: { id: true, fullName: true },
        })
      : [];
    const ownerName = new Map(owners.map(u => [String(u.id), u.fullName]));

    return rules.map(r => {
      const c = counts.get(r.id) ?? { total: 0, success: 0, failed: 0 };
      const ownerKey = r.ownerId ?? r.createdBy;
      return {
        ...r,
        condition: parseCondition(r.condition),
        actionParams: parseParams(r.actionParams),
        flow: parseFlow(r.flowJson),
        tags: parseJsonArray(r.tags),
        departmentIds: parseJsonArray(r.departmentIds),
        status: deriveRuleStatus(r),
        ownerName: ownerName.get(ownerKey) ?? null,
        stats: {
          total: c.total,
          success: c.success,
          failed: c.failed,
          successRate: c.total > 0 ? +((c.success / c.total) * 100).toFixed(1) : 0,
        },
      };
    });
  }

  /** Exportação CSV da listagem filtrada (mesmos filtros de getRules). */
  async exportRulesCsv(filters: RuleFilterDto = {}, scopeRuleIds?: number[] | null) {
    const rules = await this.getRules(filters, scopeRuleIds);
    const esc = (v: unknown) => {
      const t =
        v === null || v === undefined ? '' : v instanceof Date ? v.toISOString() : String(v);
      // Neutraliza injecção de fórmulas em Excel/Sheets.
      const safe = /^[=+\-@]/.test(t) ? `'${t}` : t;
      return /[",\n;]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
    };
    const header = [
      'Código',
      'Nome',
      'Descrição',
      'Módulo',
      'Categoria',
      'Gatilho',
      'Acção',
      'Responsável',
      'Estado',
      'Última execução',
      'Execuções',
      'Taxa de sucesso (%)',
      'Criada em',
      'Actualizada em',
    ];
    const rows = rules.map(r => [
      r.code,
      r.name,
      r.description,
      r.module,
      r.category,
      r.trigger,
      r.action,
      r.ownerName ?? r.ownerId,
      r.status,
      r.lastRunAt,
      r.stats.total,
      r.stats.successRate,
      r.createdAt,
      r.updatedAt,
    ]);
    return '﻿' + [header, ...rows].map(row => row.map(esc).join(';')).join('\r\n');
  }

  // ══════════════════════════════════════════════════════
  // VISÃO GERAL — dashboard (docs/modulo_automation.md §2)
  // ══════════════════════════════════════════════════════

  async getOverview(f: OverviewFilterDto = {}) {
    const to = f.to ? new Date(f.to) : new Date();
    const from = f.from ? new Date(f.from) : new Date(to.getTime() - 30 * 24 * 3600 * 1000);
    const granularity = f.granularity ?? OverviewGranularity.DAY;

    const ruleWhere: Prisma.AutomationRuleWhereInput = {
      ...(f.module ? { module: f.module } : {}),
      ...(f.category ? { category: f.category } : {}),
    };
    const execWhere: Prisma.AutomationExecutionWhereInput = {
      startedAt: { gte: from, lte: to },
      ...(f.status ? { status: f.status } : {}),
      ...(Object.keys(ruleWhere).length ? { rule: ruleWhere } : {}),
    };

    const EXEC_CAP = 50000;
    const [totalRules, activeRules, executions] = await Promise.all([
      this.prisma.read.automationRule.count({ where: ruleWhere }),
      this.prisma.read.automationRule.count({ where: { ...ruleWhere, active: true } }),
      this.prisma.automationExecution.findMany({
        where: execWhere,
        select: {
          status: true,
          startedAt: true,
          errorMessage: true,
          rule: { select: { module: true, category: true } },
        },
        orderBy: { startedAt: 'asc' },
        take: EXEC_CAP + 1,
      }),
    ]);
    const truncated = executions.length > EXEC_CAP;
    const rows = truncated ? executions.slice(0, EXEC_CAP) : executions;

    const byStatus: Record<string, number> = {
      SUCCESS: 0,
      FAILED: 0,
      PENDING: 0,
      RUNNING: 0,
      SKIPPED: 0,
      CANCELLED: 0,
      WAITING_APPROVAL: 0,
    };
    const timeline = new Map<string, { total: number; success: number; failed: number }>();
    const byModule = new Map<string, number>();
    const failureCauses = new Map<string, number>();

    for (const e of rows) {
      byStatus[e.status] = (byStatus[e.status] ?? 0) + 1;

      const key = bucketKey(e.startedAt, granularity);
      const b = timeline.get(key) ?? { total: 0, success: 0, failed: 0 };
      b.total++;
      if (e.status === 'SUCCESS') b.success++;
      if (e.status === 'FAILED') b.failed++;
      timeline.set(key, b);

      const mod = e.rule?.module ?? e.rule?.category ?? 'GERAL';
      byModule.set(mod, (byModule.get(mod) ?? 0) + 1);

      if (e.status === 'FAILED') {
        const cause = classifyFailure(e.errorMessage);
        failureCauses.set(cause, (failureCauses.get(cause) ?? 0) + 1);
      }
    }

    const finished = byStatus.SUCCESS + byStatus.FAILED;
    const savedMinutes = byStatus.SUCCESS * MANUAL_MINUTES_PER_EXECUTION;
    const sortDesc = (m: Map<string, number>) =>
      [...m.entries()]
        .map(([label, count]) => ({ label, count }))
        .sort((a, b) => b.count - a.count);

    return {
      period: { from, to, granularity },
      cards: {
        totalRules,
        activeRules,
        executions: rows.length,
        failedExecutions: byStatus.FAILED,
        waiting: byStatus.PENDING + byStatus.RUNNING + byStatus.WAITING_APPROVAL,
        timeSaved: {
          minutes: savedMinutes,
          hours: +(savedMinutes / 60).toFixed(1),
          estimate: true,
          basisMinutesPerExecution: MANUAL_MINUTES_PER_EXECUTION,
        },
      },
      byStatus,
      timeline: [...timeline.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, v]) => ({
          date,
          ...v,
          successRate:
            v.success + v.failed > 0
              ? +((v.success / (v.success + v.failed)) * 100).toFixed(1)
              : null,
        })),
      byModule: sortDesc(byModule),
      failureCauses: sortDesc(failureCauses),
      successRate: finished > 0 ? +((byStatus.SUCCESS / finished) * 100).toFixed(1) : null,
      truncated,
      generatedAt: new Date(),
    };
  }

  /** Módulos distintos com regras — alimenta o filtro "Módulo". */
  async getModules() {
    const rows = await this.prisma.read.automationRule.findMany({
      where: { module: { not: null } },
      select: { module: true },
      distinct: ['module'],
      orderBy: { module: 'asc' },
    });
    return rows.map(r => r.module as string);
  }

  /** Detalhe de uma regra com JSON já interpretado (editor de fluxos). */
  async getRuleDetail(id: number) {
    const r = await this.getRule(id);
    const structured = parseConditionsList(r.conditionsJson);
    return {
      ...r,
      condition: parseCondition(r.condition),
      actionParams: parseParams(r.actionParams),
      flow: parseFlow(r.flowJson),
      conditions: structured?.rows ?? [],
      conditionsLogic: structured?.logic ?? ConditionsLogic.AND,
      tags: parseJsonArray(r.tags),
      departmentIds: parseJsonArray(r.departmentIds),
      status: deriveRuleStatus(r),
    };
  }

  async getRule(id: number) {
    const r = await this.prisma.read.automationRule.findUnique({ where: { id } });
    if (!r) throw new NotFoundException('Regra não encontrada');
    return r;
  }

  // TriggerType (DTO) usa strings livres/legacy ("course.completed", "manual")
  // que não correspondem a nenhum valor do enum Prisma AutomationTrigger
  // ("COURSE_COMPLETED", "MANUAL", ...). Sem mapeamento, o create() rebentava
  // sempre com "Invalid value for argument triggerType". Mapeia os únicos casos
  // inequívocos e cai em MANUAL para o resto — ver memória sobre este gap.
  private mapTriggerType(trigger: string): AutomationTrigger {
    const known = [
      'USER_HIRED',
      'USER_PROMOTED',
      'USER_TRANSFERRED',
      'USER_OFFBOARDED',
      'COURSE_COMPLETED',
      'CERTIFICATE_EXPIRED',
      'TRAIL_COMPLETED',
      'SCHEDULED_CRON',
      'WEBHOOK_EVENT',
      'MANUAL',
    ];
    // Alguns dos novos gatilhos do form (automation.dto.ts#TriggerType) têm
    // um equivalente semântico óbvio no enum Prisma mas com grafia diferente
    // — mapeados aqui explicitamente; os restantes (ex: pdi.at_risk,
    // objective.overdue) não têm equivalente e caem em MANUAL, tal como já
    // acontecia com a maioria dos gatilhos "dotted" antes desta alteração.
    const explicit: Record<string, AutomationTrigger> = {
      'CERTIFICATION.EXPIRING': 'CERTIFICATE_EXPIRED',
      'HIRE_DATE.REACHED': 'USER_HIRED',
    };
    const upperTrigger = trigger.toUpperCase();
    if (upperTrigger in explicit) return explicit[upperTrigger];
    const upper = upperTrigger.replace(/\./g, '_');
    return (known.includes(upper) ? upper : 'MANUAL') as AutomationTrigger;
  }

  // Colunas da regra a partir do DTO do form — partilhado por createRule e updateRuleFull.
  private buildRuleData(dto: CreateRuleDto, createdById: number) {
    // actionParams é a única coluna que executeAction() de facto lê em tempo
    // de execução (ver AutomationActionParams) — os campos ricos do form
    // (destinatário/canal/modelo/assunto/dados dinâmicos/prazo) entram aqui,
    // não só em actionsJson (que fica só como metadado auxiliar/legado).
    const mergedActionParams = {
      ...(dto.actionParams ? parseParams(dto.actionParams) : {}),
      ...(dto.recipient ? { recipient: dto.recipient } : {}),
      ...(dto.channel ? { channel: dto.channel } : {}),
      ...(dto.messageTemplate ? { messageTemplate: dto.messageTemplate } : {}),
      ...(dto.subject ? { subject: dto.subject } : {}),
      ...(dto.dynamicData ? { dynamicData: parseParams(dto.dynamicData) } : {}),
      ...(dto.deadlineMinutes !== undefined ? { deadlineMinutes: dto.deadlineMinutes } : {}),
    };
    const actionParamsJson = Object.keys(mergedActionParams).length
      ? JSON.stringify(mergedActionParams)
      : dto.actionParams;

    // Fluxo (§4): uma regra com `flow` tem as acções no fluxo; a coluna `action`
    // (legada, obrigatória) guarda a primeira só para a listagem e os filtros.
    const flow = dto.flow ?? null;
    if (flow && !dto.draft) {
      const check = validateFlow(flow);
      if (!check.valid) throw new BadRequestException(check.errors.join(' '));
    }
    const action = flow ? (firstActionOf(flow) ?? dto.action ?? ActionType.OTHER) : dto.action;

    return {
      name: dto.name,
      trigger: dto.trigger,
      action,
      flowJson: flow ? JSON.stringify(flow) : null,
      tags: dto.tags ? JSON.stringify(dto.tags) : undefined,
      departmentIds: dto.departmentIds ? JSON.stringify(dto.departmentIds) : undefined,
      manualMinutesSaved: dto.manualMinutesSaved,
      draft: dto.draft ?? false,
      critical: dto.critical,
      condition: dto.condition ?? '',
      active: dto.draft ? false : (dto.active ?? true),
      triggerType: this.mapTriggerType(dto.trigger),
      // Frequência/horário/dias da semana/datas/nº máx. execuções ficam
      // guardados aqui para o form os poder reler, mas NÃO há (ainda) um
      // scheduler que os consuma — regras "cron.*" só correm via
      // runAllActiveRules() (botão "Executar Todas" / POST /automation/run
      // chamado externamente por um cron do SO), não por um timer interno.
      triggerConfigJson: JSON.stringify({
        cronExpression: dto.cronExpression ?? null,
        frequency: dto.frequency ?? null,
        executionTime: dto.executionTime ?? null,
        daysOfWeek: dto.daysOfWeek ?? null,
        startDate: dto.startDate ?? null,
        endDate: dto.endDate ?? null,
        maxExecutions: dto.maxExecutions ?? null,
      }),
      // Condições estruturadas do builder (field/operator/value + lógica
      // E/OU) — lidas por evaluateRuleConditions() em triggerEvent().
      conditionsJson: dto.conditions?.length
        ? JSON.stringify({
            logic: dto.conditionsLogic ?? ConditionsLogic.AND,
            rows: dto.conditions,
          })
        : null,
      actionsJson: JSON.stringify([{ type: action, params: mergedActionParams }]),
      createdBy: String(createdById),
      description: dto.description,
      category: dto.category,
      priority: dto.priority,
      actionParams: actionParamsJson,
      maxRetries: dto.maxRetries,
      entity: dto.entity,
      ownerId: dto.ownerId ?? String(createdById),
      environment: dto.environment,
      notifyOnError: dto.notifyOnError ?? true,
      notes: dto.notes,
      code: dto.code,
      module: dto.module,
      activeFrom: dto.activeFrom ? new Date(dto.activeFrom) : undefined,
      activeUntil: dto.activeUntil ? new Date(dto.activeUntil) : undefined,
      retryPolicy: dto.retryPolicy,
      retryDelayMinutes: dto.retryDelayMinutes,
      errorHandling: dto.errorHandling,
    };
  }

  async createRule(dto: CreateRuleDto, createdById = 0) {
    // AutomationRule.tenantId é FK obrigatória (multi-tenant) nunca populada aqui.
    const tenantId = await resolveDefaultTenantId(this.prisma);
    const rule = await this.prisma.automationRule.create({
      data: { ...this.buildRuleData(dto, createdById), tenantId },
    });

    await this.prisma.auditLog
      .create({
        data: {
          userId: createdById > 0 ? createdById : undefined,
          action: 'AUTOMATION_RULE_CREATED',
          entity: 'AutomationRule',
          entityId: rule.id,
          changes: JSON.stringify({ name: dto.name, trigger: dto.trigger, action: dto.action }),
        },
      })
      .catch(e => {
        this.logger.warn({
          ruleId: rule.id,
          action: 'AUDIT_LOG_AUTOMATION_RULE_CREATED',
          err: { message: e instanceof Error ? e.message : String(e) },
          msg: 'Falha ao registar audit log de criação de regra de automação',
        });
      });

    return rule;
  }

  /** Substitui a configuração completa de uma regra (usado pela aba Automações dos Processos). */
  async updateRuleFull(id: number, dto: CreateRuleDto, userId: number) {
    const before = await this.getRule(id);
    const { createdBy: _createdBy, ...data } = this.buildRuleData(dto, userId);
    const updated = await this.prisma.automationRule.update({ where: { id }, data });
    await this.auditRule(
      'AUTOMATION_RULE_UPDATED',
      id,
      { name: dto.name, userId },
      this.ruleDiff(before, updated),
    );
    return updated;
  }

  /** Executa uma regra concreta com um payload (teste manual / nova tentativa), sem disparar as restantes. */
  async runRule(
    ruleId: number,
    payload: Record<string, unknown>,
    userId?: number,
    meta: ExecutionMeta = {},
  ) {
    const rule = await this.getRule(ruleId);
    if (rule.draft) {
      throw new BadRequestException('Rascunho: publique a automação antes de a executar');
    }
    return this.executeAction(rule, payload, userId, {
      ...meta,
      dedupeKey: typeof payload.dedupeKey === 'string' ? payload.dedupeKey : undefined,
    });
  }

  /** Avalia as condições da regra contra um payload (simulação, sem efeitos). */
  matchesConditions(rule: AutomationRuleRecord, payload: Record<string, unknown>) {
    return this.evaluateRuleConditions(rule, payload);
  }

  async updateRule(id: number, dto: UpdateRuleDto, userId?: number) {
    const before = await this.getRule(id);
    const updated = await this.prisma.automationRule.update({ where: { id }, data: dto });
    await this.auditRule(
      'AUTOMATION_RULE_UPDATED',
      id,
      { name: updated.name, userId },
      this.ruleDiff(before, updated),
    );
    return updated;
  }

  /** Campos da regra que mudaram (sem colunas que mudam sozinhas a cada execução). */
  private ruleDiff(before: AutomationRuleRecord, after: AutomationRuleRecord) {
    const skip = new Set(['updatedAt', 'lastRunAt', 'lastRunStatus', 'runCount']);
    const strip = (r: AutomationRuleRecord) =>
      Object.fromEntries(Object.entries(r).filter(([k]) => !skip.has(k)));
    return diffFields(strip(before), strip(after));
  }

  async toggleRule(id: number, userId?: number) {
    const r = await this.prisma.read.automationRule.findUnique({ where: { id } });
    if (!r) throw new NotFoundException('Regra não encontrada');
    if (r.draft) {
      throw new BadRequestException('Rascunho: publique a automação em vez de a activar');
    }
    const updated = await this.prisma.automationRule.update({
      where: { id },
      data: { active: !r.active },
    });
    await this.auditRule(r.active ? 'AUTOMATION_RULE_PAUSED' : 'AUTOMATION_RULE_ACTIVATED', id, {
      name: r.name,
      userId,
    });
    return updated;
  }

  async deleteRule(id: number, userId?: number) {
    const rule = await this.getRule(id);
    await this.prisma.automationRule.delete({ where: { id } });
    await this.auditRule('AUTOMATION_RULE_DELETED', id, { name: rule.name, userId });
    return { message: 'Regra removida' };
  }

  async cloneRule(id: number, userId?: number) {
    const source = await this.getRule(id);
    const copy = await this.prisma.automationRule.create({
      data: {
        ...source,
        id: undefined,
        code: null,
        name: `Cópia de: ${source.name}`,
        active: false,
        draft: true,
        version: 0,
        publishedAt: null,
        publishedBy: null,
        publishStatus: null,
        publishRequestedBy: null,
        publishRequestedAt: null,
        publishDecisionNote: null,
        lastFailureAlertAt: null,
        lastRunAt: null,
        lastRunStatus: null,
        runCount: 0,
      },
    });
    await this.auditRule('AUTOMATION_RULE_CLONED', copy.id, { sourceId: id, userId });
    return copy;
  }

  // ══════════════════════════════════════════════════════
  // EVENT TRIGGER — dispatch automations
  // ══════════════════════════════════════════════════════

  async triggerEvent(dto: TriggerEventDto) {
    // Find active rules matching this event trigger
    const now = new Date();
    const payload = dto.payload ?? {};
    const incoming = readChainMeta(payload);
    const limits = await this.limits();
    const correlationId = dto.correlationId ?? incoming.correlationId;
    const eventId = dto.eventId ?? randomUUID();
    const envelope = {
      id: eventId,
      module: dto.module ?? moduleOfTrigger(dto.event),
      type: dto.event,
      recordType: dto.recordType,
      recordId: dto.recordId,
      correlationId,
      depth: incoming.depth,
    };

    // §5 — profundidade máxima (cadeias evento → regra → evento) e idempotência.
    if (incoming.depth > limits.maxEventDepth) {
      await this.registerEvent(envelope);
      await this.finishEvent(eventId, {
        matchedRules: 0,
        executed: 0,
        skipped: 0,
        status: 'REJECTED',
        note: `Profundidade máxima (${limits.maxEventDepth}) excedida — possível ciclo`,
      });
      return { triggered: 0, message: 'Cadeia de eventos demasiado profunda — evento ignorado' };
    }
    const registered = await this.registerEvent(envelope);
    if (registered === 'duplicate') {
      return { triggered: 0, message: 'Evento já processado', duplicate: true };
    }

    const rules = (
      await this.prisma.read.automationRule.findMany({
        where: { active: true, trigger: dto.event },
        orderBy: { priority: 'asc' },
      })
    ).filter(r => !r.draft && inActiveWindow(r, now));

    if (!rules.length) {
      await this.finishEvent(eventId, {
        matchedRules: 0,
        executed: 0,
        skipped: 0,
        status: 'NO_RULES',
      });
      return { triggered: 0, message: 'Sem automações para este evento' };
    }

    const dedupeKey = typeof payload.dedupeKey === 'string' ? payload.dedupeKey : undefined;
    const results = [];
    for (const rule of rules) {
      if (incoming.chain.includes(rule.id)) {
        results.push({
          ruleId: rule.id,
          name: rule.name,
          status: 'SKIPPED',
          reason: 'Ciclo evitado: a regra já faz parte desta cadeia',
        });
        continue;
      }
      if (!this.evaluateRuleConditions(rule, payload)) {
        results.push({
          ruleId: rule.id,
          name: rule.name,
          status: 'SKIPPED',
          reason: 'Condição não satisfeita',
        });
        continue;
      }
      // Evita execuções duplicadas: o mesmo evento (chave) já correu para esta regra.
      if (dedupeKey && (await this.alreadyExecuted(rule.id, dedupeKey))) {
        results.push({
          ruleId: rule.id,
          name: rule.name,
          status: 'SKIPPED',
          reason: 'Execução duplicada',
        });
        continue;
      }
      if ((await this.recentExecutionCount(rule.id)) >= limits.maxExecutionsPerMinute) {
        results.push({
          ruleId: rule.id,
          name: rule.name,
          status: 'SKIPPED',
          reason: 'Limite de frequência da regra atingido',
        });
        continue;
      }
      if ((await this.runningExecutionCount(rule.id)) >= limits.maxConcurrentPerRule) {
        results.push({
          ruleId: rule.id,
          name: rule.name,
          status: 'SKIPPED',
          reason: 'Limite de execuções simultâneas da regra atingido',
        });
        continue;
      }
      const execResult = await this.executeAction(rule, payload, dto.userId, {
        dedupeKey,
        eventId,
        correlationId,
        depth: incoming.depth,
        chain: incoming.chain,
      });
      results.push({ ruleId: rule.id, name: rule.name, ...execResult });
    }

    const executed = results.filter(r => r.status !== 'SKIPPED').length;
    await this.finishEvent(eventId, {
      matchedRules: rules.length,
      executed,
      skipped: results.length - executed,
      status: 'PROCESSED',
    });
    return {
      triggered: executed,
      total: rules.length,
      results,
    };
  }

  private async alreadyExecuted(ruleId: number, dedupeKey: string): Promise<boolean> {
    const found = await this.prisma.automationExecution
      .findFirst({
        where: { ruleId, dedupeKey, status: { in: ['RUNNING', 'SUCCESS'] } },
        select: { id: true },
      })
      .catch(() => null);
    return !!found;
  }

  /**
   * Repete as execuções falhadas cuja política de repetição agendou nova tentativa.
   * Chamado periodicamente (cron do módulo de processos); idempotente — a marca
   * `nextRetryAt` é limpa antes de reexecutar, por isso duas réplicas não repetem a mesma.
   */
  async retryDueExecutions(limit = 50) {
    const now = new Date();
    const due = await this.prisma.automationExecution.findMany({
      where: { status: 'FAILED', nextRetryAt: { lte: now } },
      orderBy: { nextRetryAt: 'asc' },
      take: limit,
    });
    let retried = 0;
    for (const exec of due) {
      const claimed = await this.prisma.automationExecution.updateMany({
        where: { id: exec.id, nextRetryAt: { not: null } },
        data: { nextRetryAt: null },
      });
      if (claimed.count === 0) continue; // outra réplica ficou com ela
      const rule = await this.prisma.automationRule.findUnique({ where: { id: exec.ruleId } });
      if (!rule || !rule.active || !inActiveWindow(rule, now)) continue;
      const payload = exec.payload ? (JSON.parse(exec.payload) as Record<string, unknown>) : {};
      // Fluxo: continua da etapa que falhou, sem repetir as acções já concluídas (§13).
      let prior: FlowStepLog[] | undefined;
      if (exec.resumePc !== null && exec.resumePc !== undefined && exec.actionsLog) {
        try {
          const log = JSON.parse(exec.actionsLog) as { steps?: FlowStepLog[] };
          prior = (log.steps ?? []).filter(s => s.status === 'SUCCESS');
        } catch {
          prior = undefined;
        }
      }
      await this.executeAction(rule, payload, (payload.userId as number | undefined) ?? undefined, {
        dedupeKey: exec.dedupeKey ?? undefined,
        attempt: exec.attempt + 1,
        ...(prior ? { startPc: exec.resumePc ?? 0, priorSteps: prior } : {}),
        ...(exec.eventId ? { eventId: exec.eventId } : {}),
        ...(exec.correlationId ? { correlationId: exec.correlationId } : {}),
        ...(exec.scheduleId ? { scheduleId: exec.scheduleId } : {}),
      });
      retried++;
    }
    return { retried };
  }

  // ══════════════════════════════════════════════════════
  // RUN ALL ACTIVE RULES (manual / scheduled)
  // ══════════════════════════════════════════════════════

  async runAllActiveRules() {
    const rules = await this.prisma.read.automationRule.findMany({ where: { active: true } });
    const results = [];

    for (const rule of rules) {
      try {
        const result = await this.executeRule(rule);
        results.push({ ruleId: rule.id, name: rule.name, success: true, ...result });
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : String(e);
        results.push({ ruleId: rule.id, name: rule.name, success: false, error: message });
        this.logger.error({
          ruleId: rule.id,
          ruleName: rule.name,
          action: 'RUN_ALL_ACTIVE_RULES',
          err: { message },
          msg: 'Falha ao executar regra de automação activa',
        });
      }
    }

    return { executed: rules.length, results };
  }

  private async executeRule(rule: AutomationRuleRecord): Promise<Record<string, unknown>> {
    switch (rule.trigger) {
      case TriggerType.BIRTHDAY_TODAY:
      case 'BIRTHDAY_TODAY':
        return this.processBirthdays();
      case TriggerType.ENROLLMENT_EXPIRING:
      case 'ENROLLMENT_EXPIRING':
        return this.sendEnrollmentReminders();
      case TriggerType.PAYSLIP_DUE:
      case 'PAYSLIP_DUE':
        return this.checkPayslipDue();
      case 'PENDING_LEAVE_3_DAYS':
        return this.sendLeaveReminders();
      default:
        return { message: `Trigger "${rule.trigger}" executado` };
    }
  }

  // ══════════════════════════════════════════════════════
  // CONSTRUTOR DE FLUXOS (§4) — validar, testar, publicar, executar
  // ══════════════════════════════════════════════════════

  /** Valida a definição (sem gravar): campos, limites do fluxo, tipos de acção/operador. */
  validateRuleDefinition(dto: Partial<CreateRuleDto>) {
    const errors: string[] = [];
    const warnings: string[] = [];
    if (!dto.name?.trim()) errors.push('O nome da automação é obrigatório.');
    if (!dto.trigger) errors.push('Indique o gatilho (quando deve começar).');
    let stats: ReturnType<typeof validateFlow>['stats'] | null = null;
    if (dto.flow) {
      const check = validateFlow(dto.flow);
      errors.push(...check.errors);
      warnings.push(...check.warnings);
      stats = check.stats;
    } else if (!dto.action) {
      errors.push('Defina pelo menos uma acção.');
    }
    if (dto.conditions?.length) {
      dto.conditions.forEach((row, i) => {
        if (!row.field?.trim()) errors.push(`Condição ${i + 1}: falta o campo.`);
      });
    }
    return { valid: errors.length === 0, errors, warnings, stats };
  }

  /**
   * Execução de teste: percorre o fluxo com dados de exemplo e diz o que
   * aconteceria — sem enviar nada, criar tarefas nem registar execuções.
   */
  async testRule(id: number, payload: Record<string, unknown> = {}) {
    const rule = await this.getRule(id);
    const conditionsMatched = this.evaluateRuleConditions(rule, payload);
    const flow = parseFlow(rule.flowJson);
    const steps: Array<Record<string, unknown>> = [];

    if (!conditionsMatched) {
      return {
        dryRun: true,
        ruleId: id,
        conditionsMatched,
        wouldRun: false,
        steps,
        message: 'As condições do gatilho não são satisfeitas por estes dados.',
      };
    }

    const preview = (params: Record<string, unknown>) =>
      interpolate(
        (params.messageTemplate as string | undefined) ?? (params.message as string | undefined),
        params.dynamicData as Record<string, unknown> | undefined,
        payload,
      );

    if (!flow) {
      const params = parseParams(rule.actionParams);
      steps.push({
        ref: '1',
        type: 'action',
        action: rule.action,
        wouldRun: true,
        message: preview(params),
      });
    } else {
      const program = compileFlow(flow);
      let pc = 0;
      let elapsed = 0;
      while (pc < program.length) {
        const ins = program[pc];
        if (ins.kind === 'jump') {
          pc = ins.to;
        } else if (ins.kind === 'branch') {
          const results = (ins.step.rows ?? []).map(r =>
            evaluateConditionRow(r as ConditionRuleDto, payload),
          );
          const yes =
            ins.step.logic === ConditionsLogic.OR ? results.some(Boolean) : results.every(Boolean);
          steps.push({
            ref: ins.ref,
            type: 'condition',
            label: ins.step.label,
            decision: yes ? 'yes' : 'no',
          });
          pc = yes ? pc + 1 : ins.elsePc;
        } else if (ins.kind === 'delay') {
          elapsed += ins.step.minutes;
          steps.push({
            ref: ins.ref,
            type: 'delay',
            label: ins.step.label,
            minutes: ins.step.minutes,
            atMinute: elapsed,
          });
          pc++;
        } else if (ins.kind === 'approval') {
          steps.push({
            ref: ins.ref,
            type: 'approval',
            label: ins.step.label,
            title: ins.step.title,
            approverId: ins.step.approverId ?? null,
            wouldRun: true,
            atMinute: elapsed,
            message: 'O fluxo ficaria suspenso até haver decisão humana.',
          });
          pc++;
        } else {
          steps.push({
            ref: ins.ref,
            type: 'action',
            label: ins.step.label,
            action: ins.step.action,
            wouldRun: true,
            atMinute: elapsed,
            message: preview(ins.step.params ?? {}),
          });
          pc++;
        }
      }
    }
    return { dryRun: true, ruleId: id, conditionsMatched, wouldRun: true, steps };
  }

  /** Publica: valida, regista a versão (snapshot + autor) e activa a regra. */
  /**
   * Publica a regra. Uma automação crítica só é publicada por um ADMIN; os restantes
   * perfis registam um pedido de publicação que um ADMIN diferente aprova ou recusa (§10).
   */
  async publishRule(id: number, userId: number, note?: string, opts: { isAdmin?: boolean } = {}) {
    const rule = await this.getRule(id);
    const limits = await this.limits();
    if (rule.critical && limits.requireApprovalCritical && !opts.isAdmin) {
      return this.requestPublication(rule, userId, note);
    }
    return this.doPublish(rule, userId, note);
  }

  private async requestPublication(rule: AutomationRuleRecord, userId: number, note?: string) {
    const flow = parseFlow(rule.flowJson);
    if (flow) {
      const check = validateFlow(flow);
      if (!check.valid) throw new BadRequestException(check.errors.join(' '));
    }
    if (rule.publishStatus === 'PENDING') {
      throw new BadRequestException('Já existe um pedido de publicação à espera de decisão');
    }
    const updated = await this.prisma.automationRule.update({
      where: { id: rule.id },
      data: {
        publishStatus: 'PENDING',
        publishRequestedBy: String(userId),
        publishRequestedAt: new Date(),
        publishDecisionNote: note ?? null,
      },
    });
    const admins = await this.prisma.read.user.findMany({
      where: { active: true, role: { name: 'ADMIN' }, id: { not: userId } },
      select: { id: true },
      take: 20,
    });
    for (const a of admins) {
      await createNotificationSafe(this.prisma, this.logger, {
        userId: a.id,
        type: 'AUTOMATION_PUBLISH_REQUEST',
        message: `Pedido de publicação da automação crítica "${rule.name}"`,
        metadata: { ruleId: rule.id, requestedBy: userId },
      });
    }
    await this.auditRule('AUTOMATION_PUBLISH_REQUESTED', rule.id, { userId, note });
    return { ...updated, pendingApproval: true };
  }

  /** ADMIN aprova o pedido (nunca o próprio pedido) e a regra é publicada. */
  async approvePublication(id: number, approverId: number, note?: string) {
    const rule = await this.getRule(id);
    if (rule.publishStatus !== 'PENDING') {
      throw new BadRequestException('Não há pedido de publicação pendente para esta automação');
    }
    if (rule.publishRequestedBy === String(approverId)) {
      throw new ForbiddenException('Quem pediu a publicação não pode aprová-la');
    }
    const requester = rule.publishRequestedBy;
    const published = await this.doPublish(
      rule,
      approverId,
      note ?? rule.publishDecisionNote ?? undefined,
      { requestedBy: requester },
    );
    await this.auditRule('AUTOMATION_PUBLISH_APPROVED', id, {
      userId: approverId,
      note,
      requestedBy: requester,
    });
    await this.notifyPublicationDecision(
      rule,
      requester,
      `A publicação de "${rule.name}" foi aprovada`,
    );
    return published;
  }

  async rejectPublication(id: number, approverId: number, note?: string) {
    const rule = await this.getRule(id);
    if (rule.publishStatus !== 'PENDING') {
      throw new BadRequestException('Não há pedido de publicação pendente para esta automação');
    }
    if (!note?.trim()) throw new BadRequestException('Indique o motivo da recusa');
    const updated = await this.prisma.automationRule.update({
      where: { id },
      data: { publishStatus: 'REJECTED', publishDecisionNote: note },
    });
    await this.auditRule('AUTOMATION_PUBLISH_REJECTED', id, {
      userId: approverId,
      note,
      requestedBy: rule.publishRequestedBy,
    });
    await this.notifyPublicationDecision(
      rule,
      rule.publishRequestedBy,
      `A publicação de "${rule.name}" foi recusada: ${note}`,
    );
    return updated;
  }

  async pendingPublications() {
    const rules = await this.prisma.read.automationRule.findMany({
      where: { publishStatus: 'PENDING' },
      orderBy: { publishRequestedAt: 'asc' },
      select: {
        id: true,
        name: true,
        module: true,
        trigger: true,
        version: true,
        publishRequestedBy: true,
        publishRequestedAt: true,
        publishDecisionNote: true,
      },
    });
    const ids = [...new Set(rules.map(r => r.publishRequestedBy))]
      .filter((v): v is string => !!v && /^\d+$/.test(v))
      .map(Number);
    const users = ids.length
      ? await this.prisma.read.user.findMany({
          where: { id: { in: ids } },
          select: { id: true, fullName: true },
        })
      : [];
    const name = new Map(users.map(u => [String(u.id), u.fullName]));
    return rules.map(r => ({
      ...r,
      requestedByName: (r.publishRequestedBy && name.get(r.publishRequestedBy)) || null,
    }));
  }

  private async notifyPublicationDecision(
    rule: AutomationRuleRecord,
    requester: string | null,
    message: string,
  ) {
    if (!requester || !/^\d+$/.test(requester)) return;
    await createNotificationSafe(this.prisma, this.logger, {
      userId: Number(requester),
      type: 'AUTOMATION_PUBLISH_DECISION',
      message,
      metadata: { ruleId: rule.id },
    });
  }

  private async doPublish(
    rule: AutomationRuleRecord,
    userId: number,
    note?: string,
    extra: { requestedBy?: string | null } = {},
  ) {
    const id = rule.id;
    const flow = parseFlow(rule.flowJson);
    if (flow) {
      const check = validateFlow(flow);
      if (!check.valid) throw new BadRequestException(check.errors.join(' '));
    }
    const version = (rule.version ?? 0) + 1;
    const snapshot = {
      name: rule.name,
      description: rule.description,
      trigger: rule.trigger,
      category: rule.category,
      module: rule.module,
      action: rule.action,
      actionParams: parseParams(rule.actionParams),
      condition: parseCondition(rule.condition),
      conditions: parseConditionsList(rule.conditionsJson),
      flow,
      priority: rule.priority,
      retryPolicy: rule.retryPolicy,
      maxRetries: rule.maxRetries,
      errorHandling: rule.errorHandling,
      critical: rule.critical,
      departmentIds: parseJsonArray(rule.departmentIds),
    };
    await this.prisma.automationVersion.create({
      data: {
        ruleId: id,
        version,
        snapshot: JSON.stringify(snapshot),
        note,
        publishedBy: String(userId),
      },
    });
    const updated = await this.prisma.automationRule.update({
      where: { id },
      data: {
        draft: false,
        active: true,
        isActive: true,
        version,
        publishedAt: new Date(),
        publishedBy: String(userId),
        publishStatus: null,
        publishRequestedBy: null,
        publishRequestedAt: null,
        publishDecisionNote: null,
      },
    });
    await this.auditRule('AUTOMATION_RULE_PUBLISHED', id, {
      version,
      note,
      userId,
      ...(extra.requestedBy ? { requestedBy: extra.requestedBy } : {}),
    });
    return updated;
  }

  async listVersions(id: number) {
    await this.getRule(id);
    const rows = await this.prisma.read.automationVersion.findMany({
      where: { ruleId: id },
      orderBy: { version: 'desc' },
    });
    const authorIds = [...new Set(rows.map(r => r.publishedBy))]
      .filter((v): v is string => !!v && /^\d+$/.test(v))
      .map(Number);
    const authors = authorIds.length
      ? await this.prisma.read.user.findMany({
          where: { id: { in: authorIds } },
          select: { id: true, fullName: true },
        })
      : [];
    const name = new Map(authors.map(u => [String(u.id), u.fullName]));
    return rows.map(r => ({
      ...r,
      snapshot: JSON.parse(r.snapshot) as unknown,
      publishedByName: (r.publishedBy && name.get(r.publishedBy)) || null,
    }));
  }

  /** Auditoria das operações sobre regras (best-effort — nunca bloqueia a operação). */
  private async auditRule(
    action: string,
    ruleId: number,
    changes: Record<string, unknown>,
    diff?: { before: Record<string, unknown>; after: Record<string, unknown> },
  ) {
    // Auditoria própria do módulo (§10): quem, quando e o que mudou (antes/depois).
    await this.audit?.record({
      entity: 'RULE',
      entityId: ruleId,
      ruleId,
      action,
      userId: typeof changes.userId === 'number' ? changes.userId : undefined,
      before: diff?.before,
      after: diff?.after ?? changes,
    });
    try {
      await this.prisma.auditLog.create({
        data: {
          userId: typeof changes.userId === 'number' ? changes.userId : undefined,
          action,
          entity: 'AutomationRule',
          entityId: ruleId,
          changes: JSON.stringify(changes),
        },
      });
    } catch (e: unknown) {
      this.logger.warn({
        ruleId,
        action,
        err: { message: e instanceof Error ? e.message : String(e) },
        msg: 'Falha ao registar auditoria da automação',
      });
    }
  }

  /** Auditoria de cada execução, identificando a automação responsável (§5, regra 4). */
  private async auditExecution(
    rule: AutomationRuleRecord,
    execId: string | null,
    status: string,
    meta: ExecutionMeta,
  ) {
    await this.auditRule('AUTOMATION_EXECUTED', rule.id, {
      executionId: execId,
      status,
      ruleName: rule.name,
      ruleVersion: rule.version || null,
      eventId: meta.eventId ?? null,
      scheduleId: meta.scheduleId ?? null,
      correlationId: meta.correlationId ?? null,
    });
  }

  /**
   * Percorre o fluxo compilado. Cada etapa fica registada em `actionsLog`; um
   * atraso suspende a execução (PENDING + resumeAt) e `resumeDueFlows()` retoma-a;
   * uma falha guarda a instrução (`resumePc`) para a nova tentativa continuar
   * dali, sem repetir as acções já concluídas.
   */
  private async runFlow(
    rule: AutomationRuleRecord,
    flow: FlowDefinition,
    payload: Record<string, unknown>,
    targetUserId: number | undefined,
    execId: string | null,
    attempt: number,
    meta: ExecutionMeta,
    auto: AutomationChainMeta,
  ): Promise<{ status: string; affected?: number; message?: string }> {
    const program: FlowInstruction[] = compileFlow(flow);
    const steps: FlowStepLog[] = [...(meta.priorSteps ?? [])];
    let pc = meta.startPc ?? 0;
    let affected = 0;
    let failure: string | undefined;
    let failedPc: number | undefined;
    let failedRef: string | undefined;

    const updateExec = (data: Prisma.AutomationExecutionUpdateInput) =>
      execId
        ? this.prisma.automationExecution.update({ where: { id: execId }, data }).catch(e =>
            this.logger.warn({
              execId,
              ruleId: rule.id,
              action: 'UPDATE_AUTOMATION_FLOW_EXECUTION',
              err: { message: e instanceof Error ? e.message : String(e) },
              msg: 'Falha ao actualizar a execução do fluxo',
            }),
          )
        : Promise.resolve();

    while (pc < program.length) {
      const ins = program[pc];
      const at = new Date().toISOString();

      if (ins.kind === 'jump') {
        pc = ins.to;
        continue;
      }

      if (ins.kind === 'branch') {
        const results = (ins.step.rows ?? []).map(r =>
          evaluateConditionRow(r as ConditionRuleDto, payload),
        );
        const yes =
          ins.step.logic === ConditionsLogic.OR ? results.some(Boolean) : results.every(Boolean);
        steps.push({
          ref: ins.ref,
          type: 'condition',
          label: ins.step.label,
          status: 'SUCCESS',
          decision: yes ? 'yes' : 'no',
          at,
        });
        pc = yes ? pc + 1 : ins.elsePc;
        continue;
      }

      if (ins.kind === 'delay') {
        steps.push({
          ref: ins.ref,
          type: 'delay',
          label: ins.step.label,
          status: 'WAITING',
          at,
        });
        await updateExec({
          status: 'PENDING',
          resumeAt: new Date(Date.now() + ins.step.minutes * 60_000),
          resumePc: pc + 1,
          actionsLog: JSON.stringify({ steps, affected }),
        });
        return {
          status: 'PENDING',
          affected,
          message: `A aguardar ${ins.step.minutes} min antes da etapa seguinte`,
        };
      }

      if (ins.kind === 'approval') {
        await updateExec({ currentStep: ins.step.label ?? ins.ref });
        const approverId = this.resolveApprover(ins.step, payload);
        if (!approverId) {
          steps.push({
            ref: ins.ref,
            type: 'approval',
            label: ins.step.label,
            status: 'FAILED',
            error: 'Aprovador não identificado (utilizador ou campo do evento em falta)',
            at,
          });
          failure = 'Aprovador não identificado (utilizador ou campo do evento em falta)';
          failedPc = pc;
          failedRef = ins.ref;
          break;
        }
        const taskId = await this.createApprovalTask(
          rule,
          ins.step,
          approverId,
          payload,
          execId,
          ins.ref,
          meta.triggeredBy,
        );
        steps.push({
          ref: ins.ref,
          type: 'approval',
          label: ins.step.label,
          status: 'WAITING',
          taskId,
          at,
        });
        await updateExec({
          status: 'WAITING_APPROVAL',
          resumePc: pc + 1,
          actionsLog: JSON.stringify({ steps, affected }),
        });
        return {
          status: 'WAITING_APPROVAL',
          affected,
          message: `A aguardar decisão de "${ins.step.title}"`,
        };
      }

      const step: FlowActionStep = ins.step;
      await updateExec({ currentStep: step.label ?? ins.ref });
      const started = Date.now();
      const stepRule = {
        ...rule,
        action: step.action,
        actionParams: JSON.stringify(step.params ?? {}),
      } as AutomationRuleRecord;
      let stepError: string | undefined;
      let stepResult: ActionResult | undefined;
      try {
        const out = await this.performAction(
          stepRule,
          (step.params ?? {}) as AutomationActionParams,
          payload,
          targetUserId,
        );
        stepResult = out.result;
        stepError = out.actionError;
        affected += out.result.affected ?? 0;
      } catch (e: unknown) {
        stepError = e instanceof Error ? e.message : String(e);
      }
      steps.push({
        ref: ins.ref,
        type: 'action',
        label: step.label,
        action: step.action,
        status: stepError ? 'FAILED' : 'SUCCESS',
        result: stepResult,
        error: stepError,
        durationMs: Date.now() - started,
        at,
      });
      if (stepError && step.onError !== 'continue') {
        failure = stepError;
        failedPc = pc;
        failedRef = step.label ? `${ins.ref} · ${step.label}` : ins.ref;
        break;
      }
      pc++;
    }

    // Etapas que ficaram por correr depois de uma falha.
    if (failure !== undefined && failedPc !== undefined) {
      for (let i = failedPc + 1; i < program.length; i++) {
        const rest = program[i];
        if (rest.kind === 'action' || rest.kind === 'delay' || rest.kind === 'approval') {
          steps.push({
            ref: rest.ref,
            type: rest.kind,
            label: rest.step.label,
            status: 'SKIPPED',
            at: new Date().toISOString(),
          });
        }
      }
    }

    const status = failure !== undefined ? 'FAILED' : 'SUCCESS';
    await updateExec({
      status,
      actionsLog: JSON.stringify({ steps, affected }),
      errorMessage: failure,
      errorCode: failure !== undefined ? failureCode(failure) : null,
      errorStep: failure !== undefined ? (failedRef ?? String(failedPc)) : null,
      currentStep: null,
      finishedAt: new Date(),
      resumeAt: null,
      resumePc: failedPc ?? null,
    });
    await this.recordRuleRun(rule, status, execId, attempt, failure);
    await this.auditExecution(rule, execId, status, { ...meta, correlationId: auto.correlationId });
    return { status, affected, ...(failure ? { message: failure } : {}) };
  }

  /** Retoma os fluxos cujo atraso já terminou. Idempotente entre réplicas (claim atómico). */
  async resumeDueFlows(limit = 50) {
    const now = new Date();
    const due = await this.prisma.automationExecution.findMany({
      where: { status: 'PENDING', resumeAt: { lte: now } },
      orderBy: { resumeAt: 'asc' },
      take: limit,
    });
    let resumed = 0;
    for (const exec of due) {
      const claimed = await this.prisma.automationExecution.updateMany({
        where: { id: exec.id, status: 'PENDING', resumeAt: { not: null } },
        data: { resumeAt: null, status: 'RUNNING' },
      });
      if (claimed.count === 0) continue;
      const rule = await this.prisma.automationRule.findUnique({ where: { id: exec.ruleId } });
      if (!rule || rule.draft || !rule.active || !inActiveWindow(rule, now)) {
        await this.prisma.automationExecution.update({
          where: { id: exec.id },
          data: {
            status: 'SKIPPED',
            finishedAt: new Date(),
            errorMessage: 'A automação foi pausada ou removida durante o atraso',
          },
        });
        continue;
      }
      let prior: FlowStepLog[] = [];
      try {
        const log = JSON.parse(exec.actionsLog ?? '{}') as { steps?: FlowStepLog[] };
        prior = (log.steps ?? []).map(s =>
          s.status === 'WAITING' ? { ...s, status: 'SUCCESS' } : s,
        );
      } catch {
        prior = [];
      }
      const payload = exec.payload ? (JSON.parse(exec.payload) as Record<string, unknown>) : {};
      await this.executeAction(rule, payload, undefined, {
        resumeExecId: exec.id,
        startPc: exec.resumePc ?? 0,
        priorSteps: prior,
        attempt: exec.attempt,
        eventId: exec.eventId ?? undefined,
        correlationId: exec.correlationId ?? undefined,
        dedupeKey: exec.dedupeKey ?? undefined,
      });
      resumed++;
    }
    return { resumed };
  }

  // ══════════════════════════════════════════════════════
  // APROVAÇÕES E TAREFAS (§8) — suspensão e retoma do fluxo
  // ══════════════════════════════════════════════════════

  private resolveApprover(
    step: FlowApprovalStep,
    payload: Record<string, unknown>,
  ): number | undefined {
    if (step.approverId) return step.approverId;
    const raw = step.approverField ? payload[step.approverField] : undefined;
    const n = Number(raw);
    return Number.isInteger(n) && n > 0 ? n : undefined;
  }

  private async createApprovalTask(
    rule: AutomationRuleRecord,
    step: FlowApprovalStep,
    approverId: number,
    payload: Record<string, unknown>,
    execId: string | null,
    ref: string,
    createdBy?: string,
  ): Promise<string> {
    const now = new Date();
    const creator = createdBy && /^\d+$/.test(createdBy) ? Number(createdBy) : null;
    const title = interpolate(step.title, undefined, payload) ?? step.title;
    const task = await this.prisma.automationTask.create({
      data: {
        kind: step.kind ?? 'APPROVAL',
        title,
        description: interpolate(step.description, undefined, payload),
        ruleId: rule.id,
        executionId: execId,
        stepRef: ref,
        module: rule.module ?? moduleOfTrigger(rule.trigger),
        recordType: typeof payload.recordType === 'string' ? payload.recordType : undefined,
        recordId: payload.recordId !== undefined ? String(payload.recordId) : undefined,
        approverId,
        substituteId: step.substituteId,
        escalateToId: step.escalateToId,
        escalateAfterHours: step.escalateAfterHours,
        priority: step.priority ?? 'MEDIUM',
        dueAt: step.dueHours ? new Date(now.getTime() + step.dueHours * 3_600_000) : null,
        createdBy: creator,
        historyJson: appendHistory(null, { by: creator, action: 'CREATED', to: approverId }, now),
      },
    });
    await createNotificationSafe(this.prisma, this.logger, {
      userId: approverId,
      type: 'AUTOMATION_TASK',
      message: `${step.kind === 'TASK' ? 'Nova tarefa' : 'Aprovação pendente'}: ${title}`,
    });
    return task.id;
  }

  /**
   * Retoma (ou termina) a execução que aguardava uma decisão humana. Só aprovada/
   * concluída continua o fluxo; recusada, cancelada ou expirada cancelam a execução.
   * Idempotente entre réplicas: o estado WAITING_APPROVAL é reclamado atomicamente.
   */
  async resumeAfterTask(
    executionId: string,
    outcome: 'APPROVED' | 'COMPLETED' | 'REJECTED' | 'CANCELLED' | 'EXPIRED',
    taskId: string,
    comment?: string,
  ): Promise<{ resumed: boolean; status?: string }> {
    const exec = await this.prisma.automationExecution.findUnique({ where: { id: executionId } });
    if (!exec || exec.status !== 'WAITING_APPROVAL') return { resumed: false };

    let steps: FlowStepLog[] = [];
    try {
      steps = (JSON.parse(exec.actionsLog ?? '{}') as { steps?: FlowStepLog[] }).steps ?? [];
    } catch {
      steps = [];
    }
    const proceed = outcome === 'APPROVED' || outcome === 'COMPLETED';
    const reasons: Record<string, string> = {
      REJECTED: 'Aprovação recusada',
      CANCELLED: 'Tarefa cancelada',
      EXPIRED: 'Prazo da aprovação expirado',
    };
    const closed: FlowStepLog[] = steps.map(st =>
      st.status === 'WAITING' && (st.taskId === taskId || !st.taskId)
        ? {
            ...st,
            outcome,
            status: proceed ? 'SUCCESS' : 'FAILED',
            ...(proceed ? {} : { error: reasons[outcome] }),
          }
        : st,
    );

    if (!proceed) {
      const claimed = await this.prisma.automationExecution.updateMany({
        where: { id: executionId, status: 'WAITING_APPROVAL' },
        data: {
          status: 'CANCELLED',
          finishedAt: new Date(),
          currentStep: null,
          cancelledBy: 'SYSTEM',
          cancelReason: `${reasons[outcome]}${comment ? `: ${comment}` : ''}`,
          actionsLog: JSON.stringify({ steps: closed, affected: 0 }),
        },
      });
      if (claimed.count === 0) return { resumed: false };
      const rule = await this.prisma.automationRule.findUnique({ where: { id: exec.ruleId } });
      if (rule) {
        await this.auditExecution(rule, executionId, 'CANCELLED', {
          eventId: exec.eventId ?? undefined,
          correlationId: exec.correlationId ?? undefined,
        });
      }
      return { resumed: false, status: 'CANCELLED' };
    }

    const claimed = await this.prisma.automationExecution.updateMany({
      where: { id: executionId, status: 'WAITING_APPROVAL' },
      data: { status: 'RUNNING' },
    });
    if (claimed.count === 0) return { resumed: false };
    const rule = await this.prisma.automationRule.findUnique({ where: { id: exec.ruleId } });
    if (!rule || rule.draft || !rule.active) {
      await this.prisma.automationExecution.update({
        where: { id: executionId },
        data: {
          status: 'SKIPPED',
          finishedAt: new Date(),
          errorMessage: 'A automação foi pausada ou removida durante a aprovação',
        },
      });
      return { resumed: false, status: 'SKIPPED' };
    }
    const payload = exec.payload ? (JSON.parse(exec.payload) as Record<string, unknown>) : {};
    const out = await this.executeAction(rule, payload, undefined, {
      resumeExecId: executionId,
      startPc: exec.resumePc ?? 0,
      priorSteps: closed,
      attempt: exec.attempt,
      eventId: exec.eventId ?? undefined,
      correlationId: exec.correlationId ?? undefined,
      dedupeKey: exec.dedupeKey ?? undefined,
      triggeredBy: exec.triggeredBy ?? undefined,
    });
    return { resumed: true, status: out.status };
  }

  // ══════════════════════════════════════════════════════
  // EVENTOS ENTRE MÓDULOS (§5)
  // ══════════════════════════════════════════════════════

  /** Regista o envelope do evento. 'duplicate' quando o mesmo eventId já foi processado. */
  private async registerEvent(data: {
    id: string;
    module: string;
    type: string;
    recordType?: string;
    recordId?: string;
    correlationId: string;
    depth: number;
  }): Promise<'created' | 'duplicate' | 'failed'> {
    try {
      await this.prisma.automationEvent.create({ data });
      return 'created';
    } catch (e: unknown) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        return 'duplicate';
      }
      this.logger.warn({
        eventId: data.id,
        action: 'REGISTER_AUTOMATION_EVENT',
        err: { message: e instanceof Error ? e.message : String(e) },
        msg: 'Falha ao registar o evento — o processamento prossegue',
      });
      return 'failed';
    }
  }

  private async finishEvent(
    id: string,
    data: {
      matchedRules: number;
      executed: number;
      skipped: number;
      status: string;
      note?: string;
    },
  ) {
    try {
      await this.prisma.automationEvent.update({ where: { id }, data });
    } catch (e: unknown) {
      this.logger.warn({
        eventId: id,
        action: 'FINISH_AUTOMATION_EVENT',
        err: { message: e instanceof Error ? e.message : String(e) },
        msg: 'Falha ao actualizar o resumo do evento',
      });
    }
  }

  /** Protecção contra tempestades: execuções recentes da mesma regra. */
  private async recentExecutionCount(ruleId: number): Promise<number> {
    try {
      return await this.prisma.automationExecution.count({
        where: { ruleId, startedAt: { gte: new Date(Date.now() - 60_000) } },
      });
    } catch {
      return 0;
    }
  }

  /** Limite de concorrência: execuções da regra ainda em curso (ignora as "presas" há mais de 1 h). */
  private async runningExecutionCount(ruleId: number): Promise<number> {
    try {
      return await this.prisma.automationExecution.count({
        where: {
          ruleId,
          status: 'RUNNING',
          startedAt: { gte: new Date(Date.now() - 3_600_000) },
        },
      });
    } catch {
      return 0;
    }
  }

  /** Catálogo de eventos por módulo, com regras activas e volume dos últimos 30 dias. */
  async getEventCatalog() {
    const since = new Date(Date.now() - 30 * 86_400_000);
    const ruleGroups = await this.prisma.read.automationRule.groupBy({
      by: ['trigger'],
      where: { active: true, draft: false },
      _count: { _all: true },
    });
    const eventGroups = await this.prisma.read.automationEvent.groupBy({
      by: ['type'],
      where: { occurredAt: { gte: since } },
      _count: { _all: true },
    });
    const rules = new Map<string, number>(ruleGroups.map(g => [g.trigger, g._count._all]));
    const events = new Map<string, number>(eventGroups.map(g => [g.type, g._count._all]));

    const modules = EVENT_CATALOG.map(m => ({
      module: m.module,
      label: m.label,
      actions: m.actions,
      events: m.events.map(e => {
        const key = e.trigger ?? e.key;
        return {
          key: e.key,
          label: e.label,
          trigger: e.trigger ?? null,
          implemented: !!e.trigger,
          activeRules: rules.get(key) ?? 0,
          events30d: events.get(key) ?? 0,
        };
      }),
    }));
    const all = modules.flatMap(m => m.events);
    return {
      modules,
      summary: {
        modules: modules.length,
        events: all.length,
        implemented: all.filter(e => e.implemented).length,
        proposed: all.filter(e => !e.implemented).length,
        listened: all.filter(e => e.activeRules > 0).length,
      },
    };
  }

  /** Registo dos eventos recebidos (filtrável por módulo, tipo, correlação e período). */
  async getEvents(filters: EventFilterDto = {}) {
    const { page = 1, limit = 30, module, type, correlationId, from, to } = filters;
    const where: Prisma.AutomationEventWhereInput = {
      ...(module ? { module } : {}),
      ...(type ? { type } : {}),
      ...(correlationId ? { correlationId } : {}),
      ...(from || to
        ? {
            occurredAt: {
              ...(from ? { gte: new Date(from) } : {}),
              ...(to ? { lte: new Date(to) } : {}),
            },
          }
        : {}),
    };
    const { skip, take } = calculatePagination(page, limit);
    const [data, total] = await Promise.all([
      this.prisma.read.automationEvent.findMany({
        where,
        orderBy: { occurredAt: 'desc' },
        skip,
        take,
      }),
      this.prisma.read.automationEvent.count({ where }),
    ]);
    return buildPaginatedResponse(data, total, page, limit);
  }

  // ══════════════════════════════════════════════════════
  // ACTION EXECUTOR
  // ══════════════════════════════════════════════════════

  private async executeAction(
    rule: AutomationRuleRecord,
    payload: Record<string, unknown>,
    userId?: number,
    meta: ExecutionMeta = {},
  ): Promise<{
    status: string;
    affected?: number;
    message?: string;
  }> {
    const params = parseParams(rule.actionParams) as AutomationActionParams;
    const targetUserId = userId ?? (payload.userId as number | undefined);
    const attempt = meta.attempt ?? 1;

    // §5 — o contexto de cadeia só é anexado ao payload das acções quando a
    // execução vem de um evento/agendamento/cadeia (nunca nas execuções manuais simples).
    const chained = !!(meta.correlationId || meta.chain || meta.eventId || meta.scheduleId);
    const auto: AutomationChainMeta = {
      correlationId: meta.correlationId ?? randomUUID(),
      depth: meta.depth ?? 0,
      chain: [...(meta.chain ?? []), rule.id],
    };
    const handlerPayload = chained ? { ...payload, _automation: auto } : payload;
    const flow = parseFlow(rule.flowJson);

    const execId =
      meta.resumeExecId ??
      (await this.prisma.automationExecution
        .create({
          data: {
            ruleId: rule.id,
            status: 'RUNNING',
            triggeredBy: meta.triggeredBy ?? 'SYSTEM',
            targetUserId: targetUserId !== undefined ? String(targetUserId) : undefined,
            payload: JSON.stringify(payload),
            startedAt: new Date(),
            dedupeKey: meta.dedupeKey,
            attempt,
            eventId: meta.eventId,
            scheduleId: meta.scheduleId,
            correlationId: chained ? auto.correlationId : undefined,
            ruleVersion: rule.version || undefined,
          },
        })
        .then(e => e.id)
        .catch(e => {
          this.logger.warn({
            ruleId: rule.id,
            action: 'CREATE_AUTOMATION_EXECUTION_RECORD',
            err: { message: e instanceof Error ? e.message : String(e) },
            msg: 'Falha ao registar execução da automação — a acção prossegue sem tracking',
          });
          return null;
        }));

    if (flow) {
      return this.runFlow(rule, flow, handlerPayload, targetUserId, execId, attempt, meta, auto);
    }

    try {
      const { result, actionError } = await this.performAction(
        rule,
        params,
        handlerPayload,
        targetUserId,
      );

      // Um erro de domínio numa acção delegada marca a execução como FAILED
      // (com a mensagem), mas nunca se propaga como 500 — a regra "correu",
      // a acção é que falhou.
      const execStatus = actionError ? 'FAILED' : 'SUCCESS';

      if (execId)
        await this.prisma.automationExecution
          .update({
            where: { id: execId },
            data: {
              status: execStatus,
              actionsLog: JSON.stringify(result),
              errorMessage: actionError,
              ...(actionError ? { errorCode: failureCode(actionError), errorStep: '1' } : {}),
              finishedAt: new Date(),
            },
          })
          .catch(e => {
            this.logger.warn({
              execId,
              ruleId: rule.id,
              action: 'UPDATE_AUTOMATION_EXECUTION_RESULT',
              err: { message: e instanceof Error ? e.message : String(e) },
              msg: `Falha ao actualizar execução da automação para ${execStatus}`,
            });
          });

      await this.recordRuleRun(rule, execStatus, execId, attempt, actionError);
      await this.auditExecution(rule, execId, execStatus, {
        ...meta,
        correlationId: chained ? auto.correlationId : undefined,
      });
      return { status: execStatus, ...result };
    } catch (err: unknown) {
      await this.recordRuleRun(
        rule,
        'FAILED',
        execId,
        attempt,
        err instanceof Error ? err.message : String(err),
      );
      if (execId)
        await this.prisma.automationExecution
          .update({
            where: { id: execId },
            data: {
              status: 'FAILED',
              errorMessage: err instanceof Error ? err.message : String(err),
              errorCode: 'EXCEPTION',
              errorStep: '1',
              finishedAt: new Date(),
            },
          })
          .catch(e => {
            this.logger.warn({
              execId,
              ruleId: rule.id,
              action: 'UPDATE_AUTOMATION_EXECUTION_FAILED',
              err: { message: e instanceof Error ? e.message : String(e) },
              msg: 'Falha ao actualizar execução da automação para FAILED',
            });
          });
      throw err;
    }
  }

  /**
   * Executa UMA acção (o switch por tipo) e devolve o resultado — partilhado pelo
   * modo de acção única e pelas etapas de um fluxo (Construtor de Fluxos, §4).
   * Um erro de domínio vem em `actionError`; só falhas inesperadas são lançadas.
   */
  private async performAction(
    rule: AutomationRuleRecord,
    params: AutomationActionParams,
    payload: Record<string, unknown>,
    targetUserId: number | undefined,
  ): Promise<{ result: ActionResult; actionError: string | undefined }> {
    let result: ActionResult;
    // Erro de domínio de uma acção delegada (matrícula duplicada, curso não
    // publicado, ...): a execução fica FAILED mas NÃO se propaga como 500.
    let actionError: string | undefined;

    switch (rule.action) {
      // CREATE_ALERT partilha a mesma mecânica de SEND_NOTIFICATION — é
      // "criar um alerta" no sentido em que o único canal com entrega real
      // nesta app é a notificação interna.
      case ActionType.CREATE_ALERT:
      case ActionType.SEND_NOTIFICATION: {
        // `recipient` (do form: userId, ou string livre não resolvida —
        // roleCode/departmentId não são suportados aqui) tem prioridade
        // sobre o utilizador que despoletou o evento.
        const recipientIds = await this.resolveRecipients(params.recipient, payload, targetUserId);
        const message =
          interpolate(params.messageTemplate, params.dynamicData, payload) ??
          params.message ??
          `Automação: ${rule.name}`;
        const subject =
          interpolate(params.subject, params.dynamicData, payload) ?? `Automação: ${rule.name}`;
        // A notificação interna (NotificationLog) é sempre criada — é o
        // registo oficial da execução. Email/SMS/WhatsApp são despachados
        // a seguir, a melhor esforço, via deliverViaChannel(); push/webhook
        // continuam sem integração real nesta app.
        for (const recipientUserId of recipientIds) {
          await createNotificationSafe(this.prisma, this.logger, {
            userId: recipientUserId,
            type: params.type ?? 'AUTOMATION',
            message,
            metadata: {
              ruleId: rule.id,
              ...params,
              channel: params.channel ?? CommunicationChannel.INTERNAL,
              subject,
            },
          });
          await this.deliverViaChannel({
            channel: params.channel,
            userId: recipientUserId,
            subject,
            message,
            ruleId: rule.id,
          });
        }
        result = { affected: recipientIds.length };
        break;
      }

      // Ao contrário de SEND_NOTIFICATION (que cria sempre o registo
      // interno e despacha o canal como efeito secundário best-effort),
      // aqui o email/SMS/WhatsApp É a acção — uma falha real de entrega
      // marca a execução como FAILED (actionError), como as outras acções
      // delegadas abaixo (ASSIGN_COURSE, CREATE_PDI).
      case ActionType.SEND_EMAIL: {
        const contact = targetUserId ? await this.resolveRecipientContact(targetUserId) : null;
        if (contact?.email) {
          try {
            await this.mail.sendNotification(
              contact.email,
              interpolate(params.subject, params.dynamicData, payload) ?? `Automação: ${rule.name}`,
              interpolate(params.messageTemplate, params.dynamicData, payload) ??
                params.message ??
                `Automação: ${rule.name}`,
            );
            result = { affected: 1 };
          } catch (e: unknown) {
            actionError = e instanceof Error ? e.message : String(e);
            result = { affected: 0, error: actionError };
          }
        } else result = { affected: 0, message: 'Email do destinatário indisponível' };
        break;
      }

      case ActionType.SEND_SMS:
      case ActionType.SEND_WHATSAPP: {
        const contact = targetUserId ? await this.resolveRecipientContact(targetUserId) : null;
        const message =
          interpolate(params.messageTemplate, params.dynamicData, payload) ??
          params.message ??
          `Automação: ${rule.name}`;
        if (contact?.phone) {
          try {
            if (rule.action === ActionType.SEND_WHATSAPP) {
              await this.sms.sendWhatsApp(contact.phone, message);
            } else {
              await this.sms.sendSms(contact.phone, message);
            }
            result = { affected: 1 };
          } catch (e: unknown) {
            actionError = e instanceof Error ? e.message : String(e);
            result = { affected: 0, error: actionError };
          }
        } else result = { affected: 0, message: 'Telemóvel do destinatário indisponível' };
        break;
      }

      // ENROLL_TRAINING é o mesmo fluxo de negócio que ASSIGN_COURSE
      // (inscrição via EnrollmentsService) — só o rótulo no form difere.
      case ActionType.ENROLL_TRAINING:
      case ActionType.ASSIGN_COURSE: {
        if (targetUserId && params.courseId) {
          try {
            // Delega no dono do domínio: recupera as guardas de matrícula
            // duplicada / curso PUBLISHED + analytics + notificação que a
            // escrita directa saltava.
            await this.enrollments.enroll({
              userId: targetUserId,
              courseId: params.courseId,
              origin: EnrollmentOrigin.RULE_ENGINE,
            });
            result = { affected: 1 };
          } catch (e: unknown) {
            actionError = e instanceof Error ? e.message : String(e);
            this.logger.warn({
              userId: targetUserId,
              courseId: params.courseId,
              ruleId: rule.id,
              action: 'AUTOMATION_ASSIGN_COURSE',
              err: { message: actionError },
              msg: 'Acção de automação ASSIGN_COURSE falhou (erro de domínio) — registada como falha',
            });
            result = { affected: 0, error: actionError };
          }
        } else result = { affected: 0, message: 'courseId ou userId em falta' };
        break;
      }

      case ActionType.CREATE_PDI: {
        if (targetUserId) {
          try {
            // Delega no dono do domínio: o PDI entra no fluxo de aprovação
            // (DevelopmentPlansService.create força status DRAFT) + notificação.
            await this.developmentPlans.create({
              userId: targetUserId,
              name: params.name ?? `PDI Automático — ${rule.name}`,
              goal: params.goal ?? 'Gerado automaticamente por automação',
            });
            result = { affected: 1 };
          } catch (e: unknown) {
            actionError = e instanceof Error ? e.message : String(e);
            this.logger.warn({
              userId: targetUserId,
              ruleId: rule.id,
              action: 'AUTOMATION_CREATE_PDI',
              err: { message: actionError },
              msg: 'Acção de automação CREATE_PDI falhou (erro de domínio) — registada como falha',
            });
            result = { affected: 0, error: actionError };
          }
        } else result = { affected: 0 };
        break;
      }

      case ActionType.AWARD_POINTS: {
        if (targetUserId && params.points) {
          await this.gamification.awardPoints(targetUserId, params.points, 'automation');
          result = { affected: 1, points: params.points };
        } else result = { affected: 0 };
        break;
      }

      case ActionType.AWARD_BADGE: {
        if (targetUserId && params.badgeCode) {
          await this.gamification.awardBadge(targetUserId, params.badgeCode);
          result = { affected: 1 };
        } else result = { affected: 0 };
        break;
      }

      case ActionType.LOG: {
        this.logger.log(
          `[AutomationLog] Rule ${rule.id}: ${params.message ?? JSON.stringify(payload)}`,
        );
        result = { affected: 0, logged: true };
        break;
      }

      // INTEGRATE_EXTERNAL é o mesmo mecanismo de pedido HTTP — só o
      // rótulo no form é mais genérico ("integrar com sistema externo").
      case ActionType.INTEGRATE_EXTERNAL:
      case ActionType.WEBHOOK:
      case ActionType.HTTP_REQUEST: {
        // §10 — credenciais vêm de uma ligação gerida (segredo cifrado), não da regra.
        let url = params.url;
        let authHeaders: Record<string, string> = {};
        if (params.connectionId) {
          if (!this.connections) {
            actionError = 'Gestão de ligações indisponível';
            result = { affected: 0, error: actionError };
            break;
          }
          try {
            const conn = await this.connections.authHeaders(params.connectionId);
            authHeaders = conn.headers;
            if (!url && conn.baseUrl)
              url = `${conn.baseUrl.replace(/\/$/, '')}${params.path ?? ''}`;
          } catch (e: unknown) {
            actionError = e instanceof Error ? e.message : String(e);
            result = { affected: 0, error: actionError };
            break;
          }
        }
        if (url) {
          const res = await fetch(url, {
            method: params.method ?? 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...(params.headers ?? {}),
              ...authHeaders,
            },
            body: JSON.stringify({ event: rule.trigger, payload, ruleId: rule.id }),
            signal: AbortSignal.timeout(10000),
          }).catch(e => {
            this.logger.warn({
              url,
              ruleId: rule.id,
              action: 'AUTOMATION_WEBHOOK_REQUEST',
              err: { message: e instanceof Error ? e.message : String(e) },
              msg: 'Falha ao chamar webhook/HTTP request da automação',
            });
            return null;
          });
          result = { affected: 0, httpStatus: res?.status };
        } else result = { affected: 0, error: 'URL em falta nos actionParams' };
        break;
      }

      case ActionType.NOTIFY_MANAGER:
      case ActionType.NOTIFY_HR: {
        const roleCode = rule.action === ActionType.NOTIFY_HR ? 'RH' : undefined;
        const managers: { id: number | null }[] = roleCode
          ? await this.prisma.read.user.findMany({
              where: { role: { code: roleCode } },
              select: { id: true },
              take: 20,
            })
          : targetUserId
            ? await this.prisma.user
                .findMany({ where: { id: targetUserId }, select: { managerId: true } })
                .then(us => us.map(u => ({ id: u.managerId })).filter(u => u.id))
            : [];
        for (const m of managers) {
          if (m.id)
            await this.prisma.notificationLog
              .create({
                data: {
                  userId: m.id,
                  type: 'AUTOMATION_ALERT',
                  message: params.message ?? rule.name,
                  metadata: JSON.stringify({}),
                },
              })
              .catch(e => {
                this.logger.warn({
                  userId: m.id,
                  ruleId: rule.id,
                  action: 'AUTOMATION_NOTIFY_MANAGER_HR',
                  err: { message: e instanceof Error ? e.message : String(e) },
                  msg: 'Falha ao notificar gestor/RH via automação',
                });
              });
        }
        result = { affected: managers.length };
        break;
      }

      case ActionType.RUN_AUTOMATION: {
        const targetId = Number((params as { ruleId?: unknown }).ruleId);
        const link = readChainMeta(payload);
        if (!Number.isInteger(targetId) || targetId < 1) {
          actionError = 'Automação a executar não indicada';
        } else if (targetId === rule.id || link.chain.includes(targetId)) {
          actionError = 'Ciclo detectado: a automação já faz parte desta cadeia';
        } else if (link.depth + 1 > (await this.limits()).maxEventDepth) {
          actionError = `Profundidade máxima de encadeamento (${(await this.limits()).maxEventDepth}) excedida`;
        }
        if (actionError) {
          result = { affected: 0, error: actionError };
          break;
        }
        const clean = { ...payload };
        delete clean._automation;
        const out = await this.runRule(targetId, clean, targetUserId, {
          correlationId: link.correlationId,
          depth: link.depth + 1,
          chain: link.chain,
        });
        if (out.status === 'FAILED') actionError = `A automação #${targetId} falhou`;
        result = {
          affected: out.status === 'SUCCESS' ? 1 : 0,
          message: `Automação #${targetId}: ${out.status}`,
          ...(actionError ? { error: actionError } : {}),
        };
        break;
      }

      default: {
        const handler = this.handlers.get(rule.action);
        if (handler) {
          try {
            result = await handler({
              rule,
              params: params as Record<string, unknown>,
              payload,
              userId: targetUserId,
            });
            if (result.error) actionError = result.error;
          } catch (e: unknown) {
            actionError = e instanceof Error ? e.message : String(e);
            result = { affected: 0, error: actionError };
          }
        } else {
          result = { affected: 0, message: `Acção "${rule.action}" não implementada` };
        }
      }
    }
    return { result, actionError };
  }

  // Destinatários: ids, ou marcadores resolvidos a partir do payload do evento
  // (ASSIGNEE, TARGET, REQUESTER, MANAGER, OWNER, RESPONSIBLE) e ROLE:<código>.
  private async resolveRecipients(
    recipient: string | undefined,
    payload: Record<string, unknown>,
    fallbackUserId?: number,
  ): Promise<number[]> {
    const ids = new Set<number>();
    const fromPayload = (key: string) => {
      const v = Number(payload[key]);
      if (Number.isInteger(v) && v > 0) ids.add(v);
    };
    for (const raw of (recipient ?? '').split(',')) {
      const token = raw.trim();
      if (!token) continue;
      if (/^\d+$/.test(token)) ids.add(Number(token));
      else if (token === 'ASSIGNEE') fromPayload('assigneeId');
      else if (token === 'TARGET') fromPayload('targetUserId');
      else if (token === 'REQUESTER') fromPayload('requesterId');
      else if (token === 'MANAGER') fromPayload('managerId');
      else if (token === 'OWNER') fromPayload('ownerId');
      else if (token === 'RESPONSIBLE') fromPayload('responsibleId');
      else if (token.startsWith('ROLE:')) {
        const users = await this.prisma.read.user.findMany({
          where: { active: true, role: { code: token.slice(5) } },
          select: { id: true },
          take: 20,
        });
        for (const u of users) ids.add(u.id);
      }
    }
    if (ids.size === 0 && fallbackUserId) ids.add(fallbackUserId);
    return [...ids];
  }

  // Resultado da última execução na regra + política de repetição e tratamento
  // de erros (§9): nova tentativa agendada, notificar o responsável, desactivar.
  private async recordRuleRun(
    rule: AutomationRuleRecord,
    status: 'SUCCESS' | 'FAILED',
    execId: string | null,
    attempt: number,
    error?: string,
  ) {
    try {
      await this.prisma.automationRule.update({
        where: { id: rule.id },
        data: { lastRunAt: new Date(), lastRunStatus: status, runCount: { increment: 1 } },
      });
      if (status !== 'FAILED') return;

      const delay = attempt <= (rule.maxRetries ?? 0) ? retryDelayMs(rule, attempt) : null;
      if (delay !== null && execId) {
        await this.prisma.automationExecution.update({
          where: { id: execId },
          data: { nextRetryAt: new Date(Date.now() + delay) },
        });
        return;
      }
      // Sem mais tentativas: dead letter (§10), alerta de falhas persistentes e
      // tratamento de erros da regra.
      await this.onDefinitiveFailure(rule, execId, attempt, error);
      const handling = rule.errorHandling ?? (rule.notifyOnError ? 'NOTIFY_OWNER' : 'LOG');
      if (handling === 'NOTIFY_OWNER' && rule.ownerId && /^\d+$/.test(rule.ownerId)) {
        await createNotificationSafe(this.prisma, this.logger, {
          userId: Number(rule.ownerId),
          type: 'AUTOMATION_FAILED',
          message: `A automação "${rule.name}" falhou${error ? `: ${error}` : ''}`,
        });
      } else if (handling === 'DISABLE_RULE') {
        await this.prisma.automationRule.update({
          where: { id: rule.id },
          data: { active: false, isActive: false },
        });
      }
    } catch (e: unknown) {
      this.logger.warn({
        ruleId: rule.id,
        action: 'AUTOMATION_RECORD_RULE_RUN',
        err: { message: e instanceof Error ? e.message : String(e) },
        msg: 'Falha ao registar o resultado da execução na regra',
      });
    }
  }

  /**
   * Falha definitiva (sem mais tentativas): guarda a execução na dead letter e, se a
   * automação acumulou falhas a mais, alerta e emite `automation.execution_failed`
   * (uma vez por janela) para que regras de administração possam reagir.
   */
  private async onDefinitiveFailure(
    rule: AutomationRuleRecord,
    execId: string | null,
    attempt: number,
    error?: string,
  ) {
    if (!this.failures) return;
    const exec = execId
      ? await this.prisma.automationExecution
          .findUnique({
            where: { id: execId },
            select: { payload: true, eventId: true, correlationId: true },
          })
          .catch(() => null)
      : null;
    let payload: Record<string, unknown> | undefined;
    try {
      payload = exec?.payload ? (JSON.parse(exec.payload) as Record<string, unknown>) : undefined;
    } catch {
      payload = undefined;
    }
    await this.failures.registerDeadLetter({
      ruleId: rule.id,
      executionId: execId,
      attempts: attempt,
      error,
      payload,
      eventId: exec?.eventId ?? undefined,
      correlationId: exec?.correlationId ?? undefined,
    });
    // Uma regra que reage ao próprio evento de falha nunca o volta a emitir (evita laços).
    if (rule.trigger === TriggerType.AUTOMATION_EXECUTION_FAILED) return;
    if (await this.failures.alertIfPersistent(rule)) {
      await this.triggerEvent({
        event: TriggerType.AUTOMATION_EXECUTION_FAILED,
        module: 'AUTOMATION',
        recordType: 'AutomationRule',
        recordId: String(rule.id),
        payload: { ruleId: rule.id, ruleName: rule.name, lastError: error?.slice(0, 300) },
      }).catch((e: unknown) =>
        this.logger.warn({
          ruleId: rule.id,
          err: { message: e instanceof Error ? e.message : String(e) },
          msg: 'Falha ao emitir automation.execution_failed',
        }),
      );
    }
  }

  // ══════════════════════════════════════════════════════
  // BUILT-IN RULE EXECUTORS
  // ══════════════════════════════════════════════════════

  private async processBirthdays(): Promise<Record<string, unknown>> {
    // dateOfBirth not in base schema — if added, filter here
    this.logger.warn(
      'processBirthdays: campo dateOfBirth não existe no modelo User — adiciona ao schema para activar',
    );
    return { birthdaysNotified: 0, message: 'Requer campo dateOfBirth no modelo User' };
  }

  private async sendLeaveReminders(): Promise<Record<string, unknown>> {
    // Aprovações de licenças pendentes há 3+ dias (LeaveApproval é a fonte real;
    // a leitura anterior de HistoryRecord 'LEAVE_REQUEST' nunca encontrava nada).
    const cutoff = new Date(Date.now() - 3 * 86400000);
    const stale = await this.prisma.read.leaveApproval
      .findMany({
        where: { decidedAt: null, createdAt: { lte: cutoff }, request: { status: 'PENDING' } },
        select: { approverId: true, requestId: true },
        take: 500,
      })
      .catch(e => {
        this.logger.warn({
          action: 'SEND_LEAVE_REMINDERS_COUNT',
          err: { message: e instanceof Error ? e.message : String(e) },
          msg: 'Falha ao contar pedidos de ausência pendentes',
        });
        return [] as Array<{ approverId: number; requestId: number }>;
      });

    const perApprover = new Map<number, number>();
    for (const a of stale) perApprover.set(a.approverId, (perApprover.get(a.approverId) ?? 0) + 1);
    let notified = 0;
    for (const [userId, n] of perApprover) {
      const ok = await this.prisma.notificationLog
        .create({
          data: {
            userId,
            type: 'LEAVE_PENDING_REMINDER',
            message: `Tem ${n} pedido(s) de licença à espera de decisão há mais de 3 dias`,
            metadata: JSON.stringify({ pending: n }),
          },
        })
        .then(() => true)
        .catch(() => false);
      if (ok) notified++;
    }
    return {
      pending: stale.length,
      notified,
      message: `${stale.length} pedido(s) de ausência pendentes há 3+ dias`,
    };
  }

  private async sendEnrollmentReminders(): Promise<Record<string, unknown>> {
    const cutoff = new Date(Date.now() - 14 * 86400000);
    const enrollments = await this.prisma.read.enrollment.findMany({
      where: { status: EnrollmentStatus.IN_PROGRESS, enrolledAt: { lte: cutoff } },
      include: {
        user: { select: { id: true, fullName: true } },
        course: { select: { title: true } },
      },
      take: 100,
    });

    let notified = 0;
    for (const e of enrollments) {
      await this.prisma.notificationLog
        .create({
          data: {
            userId: e.userId,
            type: 'ENROLLMENT_REMINDER',
            message: `O curso "${e.course.title}" está pendente há mais de 14 dias`,
            metadata: JSON.stringify({}),
          },
        })
        .catch(err => {
          this.logger.warn({
            userId: e.userId,
            enrollmentId: e.id,
            action: 'SEND_ENROLLMENT_REMINDER',
            err: { message: err instanceof Error ? err.message : String(err) },
            msg: 'Falha ao notificar lembrete de curso pendente',
          });
        });
      notified++;
    }
    return { notified };
  }

  private async checkPayslipDue(): Promise<Record<string, unknown>> {
    const today = new Date();
    if (today.getDate() !== 25) return { message: 'Não é dia 25 — verificação ignorada' };
    const period = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
    const drafted = await this.prisma.payslip
      .count({ where: { period, status: 'DRAFT' } })
      .catch(e => {
        this.logger.warn({
          period,
          action: 'CHECK_PAYSLIP_DUE_COUNT',
          err: { message: e instanceof Error ? e.message : String(e) },
          msg: 'Falha ao contar recibos de vencimento pendentes',
        });
        return 0;
      });
    if (drafted > 0) {
      const hrUsers = await this.prisma.read.user.findMany({
        where: { role: { code: 'RH' } },
        select: { id: true },
        take: 10,
      });
      for (const u of hrUsers) {
        await this.prisma.notificationLog
          .create({
            data: {
              userId: u.id,
              type: 'PAYSLIP_REMINDER',
              message: `${drafted} recibo(s) por emitir para o período ${period}`,
              metadata: JSON.stringify({}),
            },
          })
          .catch(e => {
            this.logger.warn({
              userId: u.id,
              period,
              action: 'NOTIFY_PAYSLIP_DUE',
              err: { message: e instanceof Error ? e.message : String(e) },
              msg: 'Falha ao notificar RH sobre recibos de vencimento por emitir',
            });
          });
      }
    }
    return { period, drafted, message: `${drafted} recibos por emitir` };
  }

  // ══════════════════════════════════════════════════════
  // CONDITION EVALUATOR
  // ══════════════════════════════════════════════════════

  private evaluateCondition(
    condition: Record<string, unknown>,
    payload: Record<string, unknown>,
  ): boolean {
    if (!Object.keys(condition).length) return true;

    for (const [key, value] of Object.entries(condition)) {
      const payloadVal = payload[key];
      if (
        key === 'minScore' &&
        typeof payloadVal === 'number' &&
        typeof value === 'number' &&
        payloadVal < value
      )
        return false;
      if (
        key === 'maxScore' &&
        typeof payloadVal === 'number' &&
        typeof value === 'number' &&
        payloadVal > value
      )
        return false;
      if (key === 'departmentId' && payloadVal !== value) return false;
      if (key === 'roleCode' && payloadVal !== value) return false;
      if (key === 'equals' && payloadVal !== value) return false;
    }
    return true;
  }

  // Prefere o condition builder estruturado (conditionsJson, com lógica E/OU
  // entre linhas field/operator/value); cai para o campo `condition` legado
  // (JSON simples chave→valor, só AND) quando não há linhas estruturadas.
  private evaluateRuleConditions(
    rule: AutomationRuleRecord,
    payload: Record<string, unknown>,
  ): boolean {
    const structured = parseConditionsList(rule.conditionsJson);
    if (structured) {
      const results = structured.rows.map(row => evaluateConditionRow(row, payload));
      return structured.logic === ConditionsLogic.OR
        ? results.some(Boolean)
        : results.every(Boolean);
    }
    return this.evaluateCondition(parseCondition(rule.condition), payload);
  }

  // ══════════════════════════════════════════════════════
  // EXECUTION LOGS
  // ══════════════════════════════════════════════════════

  async getExecutions(filters: ExecutionFilterDto = {}, scopeRuleIds?: number[] | null) {
    const { page = 1, limit = 30, status, ruleId, from, to } = filters;
    const { skip, take } = calculatePagination(page, limit);
    const where: Prisma.AutomationExecutionWhereInput = {};
    if (status) where.status = status;
    if (scopeRuleIds) {
      where.ruleId = ruleId ? (scopeRuleIds.includes(ruleId) ? ruleId : -1) : { in: scopeRuleIds };
    } else if (ruleId) where.ruleId = ruleId;
    if (from || to) {
      where.startedAt = {};
      if (from) where.startedAt.gte = new Date(from);
      if (to) where.startedAt.lte = new Date(to);
    }

    const executions: Prisma.AutomationExecutionGetPayload<object>[] =
      await this.prisma.automationExecution
        .findMany({
          where,
          skip,
          take,
          orderBy: { startedAt: 'desc' },
        })
        .catch((e: unknown) => {
          this.logger.warn({
            filters,
            action: 'GET_EXECUTIONS_LIST',
            err: { message: e instanceof Error ? e.message : String(e) },
            msg: 'Falha ao listar execuções de automação',
          });
          return [] as Prisma.AutomationExecutionGetPayload<object>[];
        });

    const total = await this.prisma.automationExecution.count({ where }).catch(e => {
      this.logger.warn({
        filters,
        action: 'GET_EXECUTIONS_COUNT',
        err: { message: e instanceof Error ? e.message : String(e) },
        msg: 'Falha ao contar execuções de automação',
      });
      return 0;
    });

    return buildPaginatedResponse(executions, total, page, limit);
  }

  async rerunExecution(executionId: string) {
    const exec = await this.prisma.automationExecution
      .findUnique({
        where: { id: executionId },
      })
      .catch(e => {
        this.logger.warn({
          executionId,
          action: 'RERUN_EXECUTION_FIND',
          err: { message: e instanceof Error ? e.message : String(e) },
          msg: 'Falha ao obter execução de automação para reexecutar',
        });
        return null;
      });

    if (!exec) return { message: 'Execução não encontrada' };
    if (exec.archivedAt) {
      return {
        message: 'Execução arquivada: os dados originais já não existem — não pode ser repetida',
      };
    }

    const rule = await this.prisma.automationRule
      .findUnique({ where: { id: exec.ruleId } })
      .catch(e => {
        this.logger.warn({
          executionId,
          ruleId: exec.ruleId,
          action: 'RERUN_EXECUTION_FIND_RULE',
          err: { message: e instanceof Error ? e.message : String(e) },
          msg: 'Falha ao obter regra associada à execução a reexecutar',
        });
        return null;
      });
    if (!rule) return { message: 'Regra não encontrada' };

    const payload = exec.payload ? JSON.parse(exec.payload) : {};
    return this.executeAction(rule, payload, payload.userId);
  }

  // ══════════════════════════════════════════════════════
  // STATS & DASHBOARD
  // ══════════════════════════════════════════════════════

  async getStats() {
    const [total, active, execTotal, execSuccess, execFailed] = await Promise.all([
      this.prisma.read.automationRule.count(),
      this.prisma.read.automationRule.count({ where: { active: true } }),
      this.prisma.automationExecution.count({}),
      this.prisma.automationExecution.count({ where: { status: 'SUCCESS' } }),
      this.prisma.automationExecution.count({ where: { status: 'FAILED' } }),
    ]);

    const successRate = execTotal > 0 ? +((execSuccess / execTotal) * 100).toFixed(1) : 0;

    const byCategory = await this.prisma.automationRule
      .groupBy({
        by: ['category'],
        _count: { id: true },
      })
      .catch((e: unknown) => {
        this.logger.warn({
          action: 'GET_STATS_BY_CATEGORY',
          err: { message: e instanceof Error ? e.message : String(e) },
          msg: 'Falha ao agrupar regras de automação por categoria',
        });
        return [] as { category: AutomationCategory | null; _count: { id: number } }[];
      });

    const recentFails: Prisma.AutomationExecutionGetPayload<object>[] =
      await this.prisma.automationExecution
        .findMany({
          where: { status: 'FAILED' },
          orderBy: { startedAt: 'desc' },
          take: 5,
        })
        .catch((e: unknown) => {
          this.logger.warn({
            action: 'GET_STATS_RECENT_FAILS',
            err: { message: e instanceof Error ? e.message : String(e) },
            msg: 'Falha ao listar execuções falhadas recentes',
          });
          return [] as Prisma.AutomationExecutionGetPayload<object>[];
        });

    return {
      rules: { total, active, inactive: total - active },
      executions: { total: execTotal, success: execSuccess, failed: execFailed, successRate },
      byCategory: byCategory.map(c => ({
        category: c.category,
        count: c._count.id,
      })),
      recentFails,
      generatedAt: new Date(),
    };
  }

  // ══════════════════════════════════════════════════════
  // TEMPLATES
  // ══════════════════════════════════════════════════════

  async getTemplates() {
    return DEFAULT_RULES.map((r, i) => ({ id: `TPL_${i}`, ...r }));
  }

  async applyTemplate(templateIndex: number) {
    const tpl = DEFAULT_RULES[templateIndex];
    if (!tpl) return { message: 'Template não encontrado' };

    const exists = await this.prisma.automationRule.findFirst({ where: { name: tpl.name } });
    if (exists) return { message: 'Automação com este nome já existe', rule: exists };

    return this.createRule(tpl);
  }

  // ══════════════════════════════════════════════════════
  // INIT DEFAULTS (legacy compat)
  // ══════════════════════════════════════════════════════

  async initDefaultRules() {
    const created = [];
    for (const r of DEFAULT_RULES) {
      const exists = await this.prisma.automationRule.findFirst({ where: { name: r.name } });
      if (!exists) created.push(await this.createRule(r));
    }
    return {
      created: created.length,
      message: `${created.length} regra(s) criadas de ${DEFAULT_RULES.length} templates`,
    };
  }
}
