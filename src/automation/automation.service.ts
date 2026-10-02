// src/automation/automation.service.ts
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
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
} from './automation.dto';
import { calculatePagination, buildPaginatedResponse } from '../common/helpers/pagination.helper';
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
  ) {}

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

  async getRules(category?: AutomationCategory) {
    const where: Prisma.AutomationRuleWhereInput = {};
    if (category) where.category = category;

    const rules = await this.prisma.read.automationRule.findMany({
      where,
      orderBy: [{ active: 'desc' }, { priority: 'asc' }, { name: 'asc' }],
    });

    // Enrich with execution stats
    return Promise.all(
      rules.map(async r => {
        const [total, success, failed] = await Promise.all([
          this.prisma.automationExecution.count({ where: { ruleId: r.id } }),
          this.prisma.automationExecution.count({
            where: { ruleId: r.id, status: 'SUCCESS' },
          }),
          this.prisma.automationExecution.count({
            where: { ruleId: r.id, status: 'FAILED' },
          }),
        ]);
        return {
          ...r,
          condition: parseCondition(r.condition),
          actionParams: parseParams(r.actionParams),
          stats: {
            total,
            success,
            failed,
            successRate: total > 0 ? +((success / total) * 100).toFixed(1) : 0,
          },
        };
      }),
    );
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

    return {
      name: dto.name,
      trigger: dto.trigger,
      action: dto.action,
      condition: dto.condition ?? '',
      active: dto.active ?? true,
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
      actionsJson: JSON.stringify([{ type: dto.action, params: mergedActionParams }]),
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
          userId: 0,
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
    await this.getRule(id);
    const { createdBy: _createdBy, ...data } = this.buildRuleData(dto, userId);
    return this.prisma.automationRule.update({ where: { id }, data });
  }

  /** Executa uma regra concreta com um payload (teste manual / nova tentativa), sem disparar as restantes. */
  async runRule(ruleId: number, payload: Record<string, unknown>, userId?: number) {
    const rule = await this.getRule(ruleId);
    return this.executeAction(rule, payload, userId, {
      dedupeKey: typeof payload.dedupeKey === 'string' ? payload.dedupeKey : undefined,
    });
  }

  /** Avalia as condições da regra contra um payload (simulação, sem efeitos). */
  matchesConditions(rule: AutomationRuleRecord, payload: Record<string, unknown>) {
    return this.evaluateRuleConditions(rule, payload);
  }

  async updateRule(id: number, dto: UpdateRuleDto) {
    await this.getRule(id);
    return this.prisma.automationRule.update({ where: { id }, data: dto });
  }

  async toggleRule(id: number) {
    const r = await this.prisma.read.automationRule.findUnique({ where: { id } });
    if (!r) throw new NotFoundException('Regra não encontrada');
    return this.prisma.automationRule.update({ where: { id }, data: { active: !r.active } });
  }

  async deleteRule(id: number) {
    await this.getRule(id);
    await this.prisma.automationRule.delete({ where: { id } });
    return { message: 'Regra removida' };
  }

  async cloneRule(id: number) {
    const source = await this.getRule(id);
    return this.prisma.automationRule.create({
      data: {
        ...source,
        id: undefined,
        code: null,
        name: `Cópia de: ${source.name}`,
        active: false,
      },
    });
  }

  // ══════════════════════════════════════════════════════
  // EVENT TRIGGER — dispatch automations
  // ══════════════════════════════════════════════════════

  async triggerEvent(dto: TriggerEventDto) {
    // Find active rules matching this event trigger
    const now = new Date();
    const rules = (
      await this.prisma.read.automationRule.findMany({
        where: { active: true, trigger: dto.event },
        orderBy: { priority: 'asc' },
      })
    ).filter(r => inActiveWindow(r, now));

    if (!rules.length) return { triggered: 0, message: 'Sem automações para este evento' };

    const payload = dto.payload ?? {};
    const dedupeKey = typeof payload.dedupeKey === 'string' ? payload.dedupeKey : undefined;
    const results = [];
    for (const rule of rules) {
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
      const execResult = await this.executeAction(rule, payload, dto.userId, { dedupeKey });
      results.push({ ruleId: rule.id, name: rule.name, ...execResult });
    }

    return {
      triggered: results.filter(r => r.status !== 'SKIPPED').length,
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
      await this.executeAction(rule, payload, (payload.userId as number | undefined) ?? undefined, {
        dedupeKey: exec.dedupeKey ?? undefined,
        attempt: exec.attempt + 1,
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

    const execId = await this.prisma.automationExecution
      .create({
        data: {
          ruleId: rule.id,
          status: 'RUNNING',
          payload: JSON.stringify(payload),
          startedAt: new Date(),
          dedupeKey: meta.dedupeKey,
          attempt,
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
      });

    try {
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
          const recipientIds = await this.resolveRecipients(
            params.recipient,
            payload,
            targetUserId,
          );
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
                interpolate(params.subject, params.dynamicData, payload) ??
                  `Automação: ${rule.name}`,
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
          if (params.url) {
            const res = await fetch(params.url, {
              method: params.method ?? 'POST',
              headers: { 'Content-Type': 'application/json', ...(params.headers ?? {}) },
              body: JSON.stringify({ event: rule.trigger, payload, ruleId: rule.id }),
              signal: AbortSignal.timeout(10000),
            }).catch(e => {
              this.logger.warn({
                url: params.url,
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
      // Sem mais tentativas: aplica o tratamento de erros da regra.
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
    // leaveRequest model doesn't exist → fallback to HistoryRecord
    const pending = await this.prisma.historyRecord
      .count({
        where: { action: 'LEAVE_REQUEST', description: { contains: '"status":"PENDING"' } },
      })
      .catch(e => {
        this.logger.warn({
          action: 'SEND_LEAVE_REMINDERS_COUNT',
          err: { message: e instanceof Error ? e.message : String(e) },
          msg: 'Falha ao contar pedidos de ausência pendentes',
        });
        return 0;
      });
    return { pending, message: `${pending} pedido(s) de ausência pendentes` };
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

  async getExecutions(filters: ExecutionFilterDto = {}) {
    const { page = 1, limit = 30, status, ruleId, from, to } = filters;
    const { skip, take } = calculatePagination(page, limit);
    const where: Prisma.AutomationExecutionWhereInput = {};
    if (status) where.status = status;
    if (ruleId) where.ruleId = ruleId;
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
