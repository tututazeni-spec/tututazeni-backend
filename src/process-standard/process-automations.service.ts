// src/process-standard/process-automations.service.ts
// Aba «Automações» (docs/Modulo_Processes.md §9). Não é um motor novo: as regras
// são AutomationRule do módulo de Automações (module = 'PROCESSES'), executadas
// pelo AutomationService. Aqui só se gere a vista e a configuração dessas regras
// no contexto dos processos — catálogo de eventos/acções, criação com validação,
// histórico de execuções e teste (simulação ou execução única).
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CurrentUserData } from '../common/decorators';
import { isPrivileged } from '../common/authz/ownership';
import { Role } from '../auth/enums/role.enum';
import { AutomationService, type AutomationRuleRecord } from '../automation/automation.service';
import {
  ActionType,
  AutomationCategory,
  ConditionOperator,
  ConditionsLogic,
  CreateRuleDto,
  RuleFrequency,
  TriggerType,
} from '../automation/automation.dto';
import {
  CONDITION_OPERATOR_LABELS,
  EXTERNAL_EVENTS,
  PAYLOAD_FIELDS,
  PROCESS_ACTIONS,
  PROCESS_EVENTS,
  RECIPIENT_TOKENS,
  RULE_TEMPLATES,
} from './process-automation-catalog';
import {
  AutomationRuleFilterDto,
  ProcessAutomationDto,
  TestAutomationDto,
} from './process-standard.dto';

const PROCESS_MODULE = 'PROCESSES';
const ADMIN_ROLES = [Role.ADMIN, Role.RH];
const EVENT_LABEL = new Map([...PROCESS_EVENTS, ...EXTERNAL_EVENTS].map(e => [e.value, e.label]));
const ACTION_LABEL = new Map(PROCESS_ACTIONS.map(a => [a.value, a.label]));
const PROCESS_EVENT_VALUES = PROCESS_EVENTS.map(e => e.value);
const RECIPIENT_TOKEN_RE =
  /^(\d+|ASSIGNEE|TARGET|REQUESTER|MANAGER|OWNER|RESPONSIBLE|ROLE:[A-Z_]+)$/;
const CUSTOM_EVENT_RE = /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/;

const safeParse = (text: string | null | undefined): Record<string, unknown> => {
  if (!text) return {};
  try {
    const v = JSON.parse(text);
    return v && typeof v === 'object' ? (v as Record<string, unknown>) : {};
  } catch {
    return {};
  }
};

@Injectable()
export class ProcessAutomationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly automation: AutomationService,
  ) {}

  // ─── Catálogo ─────────────────────────────────────────────────────────────

  catalog() {
    return {
      events: [...PROCESS_EVENTS, ...EXTERNAL_EVENTS],
      actions: PROCESS_ACTIONS,
      recipients: RECIPIENT_TOKENS,
      fields: PAYLOAD_FIELDS,
      operators: CONDITION_OPERATOR_LABELS,
      retryPolicies: [
        { value: 'NONE', label: 'Sem repetição' },
        { value: 'FIXED', label: 'Intervalo fixo' },
        { value: 'EXPONENTIAL', label: 'Intervalo crescente' },
      ],
      errorHandling: [
        { value: 'LOG', label: 'Apenas registar' },
        { value: 'NOTIFY_OWNER', label: 'Notificar o responsável pela regra' },
        { value: 'DISABLE_RULE', label: 'Desactivar a regra' },
      ],
      templates: RULE_TEMPLATES,
    };
  }

  // ─── Vista ────────────────────────────────────────────────────────────────

  private scopeWhere(): Prisma.AutomationRuleWhereInput {
    return { OR: [{ module: PROCESS_MODULE }, { trigger: { in: PROCESS_EVENT_VALUES } }] };
  }

  private toView(r: AutomationRuleRecord, stats?: { success: number; failed: number }) {
    const params = safeParse(r.actionParams);
    const trigger = safeParse(r.triggerConfigJson);
    const conditions = safeParse(r.conditionsJson) as {
      logic?: string;
      rows?: Array<{ field: string; operator: string; value?: string }>;
    };
    const { recipient, messageTemplate, ...extra } = params;
    return {
      id: r.id,
      code: r.code,
      name: r.name,
      description: r.description,
      trigger: r.trigger,
      triggerLabel: EVENT_LABEL.get(r.trigger) ?? r.trigger,
      action: r.action,
      actionLabel: ACTION_LABEL.get(r.action) ?? r.action,
      sourceModule: EVENT_LABEL.has(r.trigger)
        ? [...PROCESS_EVENTS, ...EXTERNAL_EVENTS].find(e => e.value === r.trigger)?.module
        : null,
      entity: r.entity,
      conditions: conditions.rows?.length
        ? { logic: conditions.logic === 'OR' ? 'OR' : 'AND', rows: conditions.rows }
        : null,
      recipients: typeof recipient === 'string' && recipient ? recipient.split(',') : [],
      actionParams: { ...extra, ...(messageTemplate ? { message: messageTemplate } : {}) },
      priority: r.priority,
      active: r.active,
      activeFrom: r.activeFrom,
      activeUntil: r.activeUntil,
      frequency: (trigger.frequency as string | null) ?? null,
      maxRetries: r.maxRetries,
      retryPolicy: r.retryPolicy,
      retryDelayMinutes: r.retryDelayMinutes,
      errorHandling: r.errorHandling,
      lastRunAt: r.lastRunAt,
      lastRunStatus: r.lastRunStatus,
      runCount: r.runCount,
      ownerId: r.ownerId,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      stats: stats ?? { success: 0, failed: 0 },
    };
  }

  async list(filters: AutomationRuleFilterDto) {
    const and: Prisma.AutomationRuleWhereInput[] = [this.scopeWhere()];
    if (filters.state) and.push({ active: filters.state === 'active' });
    if (filters.trigger) and.push({ trigger: filters.trigger });
    if (filters.search?.trim()) {
      const q = filters.search.trim();
      and.push({
        OR: [
          { name: { contains: q, mode: 'insensitive' } },
          { code: { contains: q, mode: 'insensitive' } },
          { description: { contains: q, mode: 'insensitive' } },
        ],
      });
    }
    const rules = await this.prisma.read.automationRule.findMany({
      where: { AND: and },
      orderBy: [{ active: 'desc' }, { priority: 'asc' }, { id: 'asc' }],
    });
    const ids = rules.map(r => r.id);
    const grouped = ids.length
      ? await this.prisma.read.automationExecution.groupBy({
          by: ['ruleId', 'status'],
          where: { ruleId: { in: ids } },
          _count: { _all: true },
        })
      : [];
    const statsOf = (id: number) => ({
      success: grouped.find(g => g.ruleId === id && g.status === 'SUCCESS')?._count._all ?? 0,
      failed: grouped.find(g => g.ruleId === id && g.status === 'FAILED')?._count._all ?? 0,
    });

    const since = new Date(Date.now() - 24 * 3600_000);
    const [exec24, failed24] = ids.length
      ? await Promise.all([
          this.prisma.read.automationExecution.count({
            where: { ruleId: { in: ids }, startedAt: { gte: since } },
          }),
          this.prisma.read.automationExecution.count({
            where: { ruleId: { in: ids }, startedAt: { gte: since }, status: 'FAILED' },
          }),
        ])
      : [0, 0];

    return {
      data: rules.map(r => this.toView(r, statsOf(r.id))),
      kpis: {
        total: rules.length,
        active: rules.filter(r => r.active).length,
        executions24h: exec24,
        failed24h: failed24,
      },
    };
  }

  private async load(id: number) {
    const rule = await this.prisma.automationRule.findFirst({
      where: { AND: [{ id }, this.scopeWhere()] },
    });
    if (!rule) throw new NotFoundException('Regra não encontrada');
    return rule;
  }

  async detail(id: number) {
    const rule = await this.load(id);
    const executions = await this.executions(id, 1, 15);
    return { ...this.toView(rule), executions: executions.data };
  }

  async executions(ruleId: number, page = 1, limit = 20) {
    await this.load(ruleId);
    const where = { ruleId };
    const [rows, total] = await Promise.all([
      this.prisma.read.automationExecution.findMany({
        where,
        orderBy: { startedAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.read.automationExecution.count({ where }),
    ]);
    return {
      data: rows.map(e => ({
        id: e.id,
        status: e.status,
        startedAt: e.startedAt,
        finishedAt: e.finishedAt,
        attempt: e.attempt,
        nextRetryAt: e.nextRetryAt,
        errorMessage: e.errorMessage,
        result: safeParse(e.actionsLog),
        payload: safeParse(e.payload),
      })),
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    };
  }

  // ─── Criar / editar ───────────────────────────────────────────────────────

  private isKnownTrigger(trigger: string) {
    return EVENT_LABEL.has(trigger) || CUSTOM_EVENT_RE.test(trigger);
  }

  private async validate(dto: ProcessAutomationDto) {
    if (!this.isKnownTrigger(dto.trigger)) {
      throw new BadRequestException(
        'Evento desconhecido — escolha um do catálogo ou use o formato "modulo.evento"',
      );
    }
    const action = PROCESS_ACTIONS.find(a => a.value === dto.action);
    if (!action) throw new BadRequestException(`Acção "${dto.action}" não disponível`);
    const params = dto.actionParams ?? {};
    for (const p of action.params.filter(p => p.required)) {
      const v = params[p.key];
      if (v === undefined || v === null || String(v).trim() === '') {
        throw new BadRequestException(`O parâmetro "${p.label}" é obrigatório para esta acção`);
      }
    }
    if (action.needsRecipients && !dto.recipients?.length) {
      throw new BadRequestException('Indique pelo menos um destinatário');
    }
    for (const r of dto.recipients ?? []) {
      if (!RECIPIENT_TOKEN_RE.test(r)) throw new BadRequestException(`Destinatário inválido: ${r}`);
    }
    if (dto.action === 'process_start') {
      const exists = await this.prisma.processStandard.findUnique({
        where: { code: String(params.processCode) },
        select: { status: true },
      });
      if (!exists) throw new BadRequestException(`O modelo "${params.processCode}" não existe`);
    }
    if (dto.action === 'process_assign_responsible' && !params.assigneeId && !params.roleCode) {
      throw new BadRequestException('Indique o utilizador ou a função a atribuir');
    }
    for (const row of dto.conditions?.rows ?? []) {
      if (!Object.values(ConditionOperator).includes(row.operator as ConditionOperator)) {
        throw new BadRequestException(`Operador de condição inválido: ${row.operator}`);
      }
    }
    if (dto.activeFrom && dto.activeUntil && new Date(dto.activeFrom) > new Date(dto.activeUntil)) {
      throw new BadRequestException('A data de expiração é anterior à de activação');
    }
  }

  private async nextCode() {
    const existing = await this.prisma.automationRule.findMany({
      where: { code: { startsWith: 'AUT-PROC-' } },
      select: { code: true },
    });
    const max = existing.reduce((m, r) => {
      const n = parseInt((r.code ?? '').replace('AUT-PROC-', ''), 10);
      return Number.isFinite(n) ? Math.max(m, n) : m;
    }, 0);
    return `AUT-PROC-${String(max + 1).padStart(3, '0')}`;
  }

  private toRuleDto(dto: ProcessAutomationDto, user: CurrentUserData): CreateRuleDto {
    const { message, subject, channel, ...params } = (dto.actionParams ?? {}) as Record<
      string,
      unknown
    >;
    const frequency = Object.values(RuleFrequency).includes(dto.frequency as RuleFrequency)
      ? (dto.frequency as RuleFrequency)
      : undefined;
    return {
      name: dto.name.trim(),
      description: dto.description,
      trigger: dto.trigger as TriggerType,
      action: dto.action as ActionType,
      category: AutomationCategory.OPERATIONAL,
      actionParams: Object.keys(params).length ? JSON.stringify(params) : undefined,
      recipient: dto.recipients?.length ? dto.recipients.join(',') : undefined,
      messageTemplate: message ? String(message) : undefined,
      subject: subject ? String(subject) : undefined,
      channel: channel as CreateRuleDto['channel'],
      conditions: dto.conditions?.rows?.map(r => ({
        field: r.field,
        operator: r.operator as ConditionOperator,
        value: r.value,
      })),
      conditionsLogic: dto.conditions?.logic === 'OR' ? ConditionsLogic.OR : ConditionsLogic.AND,
      priority: dto.priority ?? 10,
      active: dto.active ?? true,
      maxRetries: dto.maxRetries,
      entity: dto.entity,
      frequency,
      ownerId: String(user.id),
      notifyOnError: dto.errorHandling !== 'LOG',
      code: dto.code?.trim() || undefined,
      module: PROCESS_MODULE,
      activeFrom: dto.activeFrom,
      activeUntil: dto.activeUntil,
      retryPolicy: dto.retryPolicy,
      retryDelayMinutes: dto.retryDelayMinutes,
      errorHandling: dto.errorHandling,
    };
  }

  async create(dto: ProcessAutomationDto, user: CurrentUserData) {
    this.assertAdmin(user);
    await this.validate(dto);
    const ruleDto = this.toRuleDto(dto, user);
    for (let attempt = 0; attempt < 3; attempt++) {
      ruleDto.code = dto.code?.trim() || (await this.nextCode());
      try {
        const rule = await this.automation.createRule(ruleDto, user.id);
        return this.toView(rule);
      } catch (e: unknown) {
        const clash = (e as { code?: string })?.code === 'P2002';
        if (!clash) throw e;
        if (dto.code?.trim()) throw new ConflictException(`O código ${dto.code} já existe`);
      }
    }
    throw new ConflictException('Não foi possível gerar o código da regra');
  }

  async update(id: number, dto: ProcessAutomationDto, user: CurrentUserData) {
    this.assertAdmin(user);
    await this.load(id);
    await this.validate(dto);
    try {
      const rule = await this.automation.updateRuleFull(id, this.toRuleDto(dto, user), user.id);
      return this.toView(rule);
    } catch (e: unknown) {
      if ((e as { code?: string })?.code === 'P2002') {
        throw new ConflictException(`O código ${dto.code} já existe`);
      }
      throw e;
    }
  }

  async toggle(id: number, user: CurrentUserData) {
    this.assertAdmin(user);
    const rule = await this.load(id);
    const updated = await this.prisma.automationRule.update({
      where: { id },
      data: { active: !rule.active, isActive: !rule.active },
    });
    return this.toView(updated);
  }

  async clone(id: number, user: CurrentUserData) {
    this.assertAdmin(user);
    const src = await this.load(id);
    const {
      id: _id,
      code: _code,
      createdAt: _c,
      updatedAt: _u,
      lastRunAt: _l,
      lastRunStatus: _s,
      runCount: _r,
      ...data
    } = src;
    const copy = await this.prisma.automationRule.create({
      data: {
        ...data,
        code: await this.nextCode(),
        name: `Cópia de: ${src.name}`,
        active: false,
        isActive: false,
        module: PROCESS_MODULE,
        createdBy: String(user.id),
        ownerId: String(user.id),
      },
    });
    return this.toView(copy);
  }

  async remove(id: number, user: CurrentUserData) {
    this.assertAdmin(user);
    await this.load(id);
    const history = await this.prisma.automationExecution.count({ where: { ruleId: id } });
    if (history > 0) {
      throw new ConflictException(
        'A regra tem histórico de execuções — desactive-a em vez de a remover',
      );
    }
    await this.prisma.automationRule.delete({ where: { id } });
    return { message: 'Regra removida' };
  }

  // ─── Execuções ────────────────────────────────────────────────────────────

  async rerun(executionId: string, user: CurrentUserData) {
    this.assertAdmin(user);
    const exec = await this.prisma.automationExecution.findUnique({
      where: { id: executionId },
      select: { ruleId: true },
    });
    if (!exec) throw new NotFoundException('Execução não encontrada');
    await this.load(exec.ruleId);
    return this.automation.rerunExecution(executionId);
  }

  // ─── Teste ────────────────────────────────────────────────────────────────

  private async previewRecipients(rule: AutomationRuleRecord, payload: Record<string, unknown>) {
    const tokens = String(safeParse(rule.actionParams).recipient ?? '')
      .split(',')
      .map(t => t.trim())
      .filter(Boolean);
    const keyOf: Record<string, string> = {
      ASSIGNEE: 'assigneeId',
      TARGET: 'targetUserId',
      REQUESTER: 'requesterId',
      MANAGER: 'managerId',
      OWNER: 'ownerId',
      RESPONSIBLE: 'responsibleId',
    };
    const out: Array<{ token: string; userIds: number[] }> = [];
    for (const token of tokens) {
      if (/^\d+$/.test(token)) out.push({ token, userIds: [Number(token)] });
      else if (keyOf[token]) {
        const v = Number(payload[keyOf[token]]);
        out.push({ token, userIds: Number.isInteger(v) && v > 0 ? [v] : [] });
      } else if (token.startsWith('ROLE:')) {
        const users = await this.prisma.user.findMany({
          where: { active: true, role: { code: token.slice(5) } },
          select: { id: true },
          take: 20,
        });
        out.push({ token, userIds: users.map(u => u.id) });
      }
    }
    return out;
  }

  /** Simula (por defeito) ou executa uma vez a regra com um payload de exemplo. */
  async test(id: number, dto: TestAutomationDto, user: CurrentUserData) {
    this.assertAdmin(user);
    const rule = await this.load(id);
    const payload = dto.payload ?? {};
    const matches = this.automation.matchesConditions(rule, payload);
    const recipients = await this.previewRecipients(rule, payload);
    if (!dto.execute) {
      return {
        mode: 'SIMULATION' as const,
        matches,
        wouldRun: matches && rule.active,
        action: ACTION_LABEL.get(rule.action) ?? rule.action,
        recipients,
      };
    }
    if (!matches) {
      return {
        mode: 'EXECUTION' as const,
        matches,
        executed: false,
        reason: 'Condições não satisfeitas',
      };
    }
    const result = await this.automation.runRule(
      id,
      { ...payload, test: true, dedupeKey: `test:${id}:${Date.now()}` },
      Number(payload.targetUserId) || undefined,
    );
    return { mode: 'EXECUTION' as const, matches, executed: true, recipients, result };
  }

  private assertAdmin(user: CurrentUserData) {
    if (!isPrivileged(user, ADMIN_ROLES)) {
      throw new ForbiddenException('Só ADMIN e RH podem gerir automações de processos');
    }
  }
}
