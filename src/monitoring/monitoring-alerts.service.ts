// modulo_monitoring.md §7 — Alertas.
//
// Vista única sobre `SystemAlert` (a mesma tabela que o Scalability e os SLAs já
// alimentam), com o ciclo de vida que o documento pede: Aberto → Reconhecido →
// Em tratamento (responsável atribuído) → Resolvido, mais o registo de «ação
// tomada». Não há migração: reconhecimento, responsável e ações ficam em
// `metadataJson`, preservando as chaves de quem criou o alerta.
//
// Também levanta alertas a partir do estado real (processos em atraso/bloqueados,
// integrações em falha, automações a falhar, incidentes de segurança graves e
// componentes do Health Check). Cada regra tem no máximo um alerta aberto e
// resolve-o sozinha quando deixa de se verificar — mesmo padrão do Scalability.

import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Cron, CronExpression } from '@nestjs/schedule';
import { AlertCategory, AlertSeverity, Prisma, SystemAlert } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/services/audit.service';
import { ScalabilityIncidentsService } from '../scalability/scalability-incidents.service';
import { AlertArea, AlertState, ALERT_AREAS, ListAlertsQueryDto } from './monitoring-alerts.dto';
import { MonitoringHealthService } from './monitoring-health.service';
import { MonitoringStatus, STATUS_RANK } from './monitoring-status';

const H = 3_600_000;
const RULE_SOURCE = 'monitoring-rule';
const DEFAULT_LIMIT = 100;
const SCAN_CAP = 500; // alertas lidos para filtrar por estado em memória
const AUTOMATION_FAILURES_PER_HOUR = 5;
const PROCESSES_MARKER = '"area":"PROCESSOS"';

const AREA_BY_CATEGORY: Record<AlertCategory, AlertArea> = {
  PERFORMANCE: 'SISTEMA',
  STORAGE: 'SISTEMA',
  SECURITY: 'SEGURANCA',
  COMPLIANCE: 'SEGURANCA',
  INTEGRATION: 'INTEGRACAO',
  AUTOMATION: 'AUTOMACAO',
  SLA_BREACH: 'SLA',
};

export const AREA_LABEL: Record<AlertArea, string> = {
  SISTEMA: 'Sistema',
  PROCESSOS: 'Processos',
  INTEGRACAO: 'Integração',
  AUTOMACAO: 'Automação',
  SLA: 'SLA',
  SEGURANCA: 'Segurança',
};

const COMPONENT_BY_AREA: Record<AlertArea, string> = {
  SISTEMA: 'INFRASTRUCTURE',
  PROCESSOS: 'INFRASTRUCTURE',
  INTEGRACAO: 'INTEGRATIONS',
  AUTOMACAO: 'INFRASTRUCTURE',
  SLA: 'API',
  SEGURANCA: 'INFRASTRUCTURE',
};

const COMPONENT_BY_HEALTH_KEY: Record<string, string> = {
  api: 'API',
  backend: 'INFRASTRUCTURE',
  frontend: 'FRONTEND',
  postgres: 'DATABASE',
  redis: 'QUEUE',
  storage: 'STORAGE',
  external: 'INTEGRATIONS',
  workers: 'QUEUE',
  queues: 'QUEUE',
  cron: 'INFRASTRUCTURE',
};

interface ActionEntry {
  at: string;
  by: number | null;
  kind: 'ACK' | 'ASSIGN' | 'NOTE' | 'RESOLVE' | 'INCIDENT';
  note: string;
}

interface AlertMeta {
  source?: string;
  ruleKey?: string;
  area?: AlertArea;
  assigneeId?: number;
  acknowledgedAt?: string;
  acknowledgedBy?: number;
  actions?: ActionEntry[];
  [k: string]: unknown;
}

interface RuleResult {
  key: string;
  active: boolean;
  area: AlertArea;
  category: AlertCategory;
  severity: AlertSeverity;
  title: string;
  message: string;
  value?: number;
  threshold?: number;
}

export function parseMeta(raw: string | null): AlertMeta {
  if (!raw) return {};
  try {
    const v: unknown = JSON.parse(raw);
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as AlertMeta) : {};
  } catch {
    return {};
  }
}

export function alertArea(category: AlertCategory, meta: AlertMeta): AlertArea {
  return meta.area && ALERT_AREAS.includes(meta.area) ? meta.area : AREA_BY_CATEGORY[category];
}

export function alertState(a: Pick<SystemAlert, 'isResolved'>, meta: AlertMeta): AlertState {
  if (a.isResolved) return 'RESOLVIDO';
  if (meta.assigneeId) return 'EM_TRATAMENTO';
  if (meta.acknowledgedAt) return 'RECONHECIDO';
  return 'ABERTO';
}

@Injectable()
export class MonitoringAlertsService {
  private readonly logger = new Logger(MonitoringAlertsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly health: MonitoringHealthService,
    private readonly events: EventEmitter2,
    private readonly audit: AuditService,
    private readonly incidents: ScalabilityIncidentsService,
  ) {}

  private async log(actorId: number, action: string, id: string, meta: object) {
    await this.audit
      .logEntity(actorId, action, 'SystemAlert', id, meta)
      .catch(err =>
        this.logger.warn(`Auditoria falhou: ${err instanceof Error ? err.message : err}`),
      );
  }

  private async userNames(ids: (number | string | null | undefined)[]) {
    const nums = [
      ...new Set(
        ids
          .map(i => (typeof i === 'string' ? (/^\d+$/.test(i) ? Number(i) : NaN) : i))
          .filter((i): i is number => typeof i === 'number' && Number.isInteger(i) && i > 0),
      ),
    ];
    if (!nums.length) return new Map<number, string>();
    const users = await this.prisma.read.user.findMany({
      where: { id: { in: nums } },
      select: { id: true, fullName: true },
    });
    return new Map(users.map(u => [u.id, u.fullName]));
  }

  private view(a: SystemAlert, names: Map<number, string>) {
    const meta = parseMeta(a.metadataJson);
    const area = alertArea(a.category, meta);
    const resolvedById = a.resolvedBy && /^\d+$/.test(a.resolvedBy) ? Number(a.resolvedBy) : null;
    const end = a.resolvedAt ?? new Date();
    return {
      id: a.id,
      area,
      areaLabel: AREA_LABEL[area],
      category: a.category,
      severity: a.severity,
      title: a.title,
      message: a.message,
      origin: meta.ruleKey ?? meta.source ?? a.category,
      automatic: meta.source === RULE_SOURCE || meta.source === 'scalability-rule',
      metricValue: a.metricValue,
      threshold: a.threshold,
      createdAt: a.createdAt.toISOString(),
      ageMinutes: Math.max(0, Math.round((end.getTime() - a.createdAt.getTime()) / 60_000)),
      state: alertState(a, meta),
      assigneeId: meta.assigneeId ?? null,
      assigneeName: meta.assigneeId ? (names.get(meta.assigneeId) ?? null) : null,
      acknowledgedAt: meta.acknowledgedAt ?? null,
      resolvedAt: a.resolvedAt?.toISOString() ?? null,
      resolvedBy: a.resolvedBy
        ? resolvedById
          ? (names.get(resolvedById) ?? `Utilizador ${resolvedById}`)
          : a.resolvedBy === 'SYSTEM'
            ? 'Sistema'
            : a.resolvedBy
        : null,
      actions: (meta.actions ?? []).map(x => ({
        ...x,
        byName: x.by ? (names.get(x.by) ?? null) : null,
      })),
    };
  }

  private namesFor(rows: SystemAlert[]) {
    const ids: (number | string | null | undefined)[] = [];
    for (const r of rows) {
      const m = parseMeta(r.metadataJson);
      ids.push(m.assigneeId, m.acknowledgedBy, r.resolvedBy, ...(m.actions ?? []).map(a => a.by));
    }
    return this.userNames(ids);
  }

  // ── Leitura ───────────────────────────────────────────────────────────────

  private areaWhere(area: AlertArea): Prisma.SystemAlertWhereInput {
    if (area === 'PROCESSOS') return { metadataJson: { contains: PROCESSES_MARKER } };
    const categories = (Object.keys(AREA_BY_CATEGORY) as AlertCategory[]).filter(
      c => AREA_BY_CATEGORY[c] === area,
    );
    return {
      category: { in: categories },
      // Alertas de Processos têm categoria SLA_BREACH mas pertencem à área própria.
      OR: [{ metadataJson: null }, { NOT: { metadataJson: { contains: PROCESSES_MARKER } } }],
    };
  }

  async list(q: ListAlertsQueryDto) {
    const limit = q.limit ?? DEFAULT_LIMIT;
    const where: Prisma.SystemAlertWhereInput = {
      AND: [
        q.severity ? { severity: q.severity } : {},
        q.area ? this.areaWhere(q.area) : {},
        q.state ? { isResolved: q.state === 'RESOLVIDO' } : {},
      ],
    };

    const [rows, open] = await Promise.all([
      this.prisma.read.systemAlert.findMany({
        where,
        orderBy: [{ isResolved: 'asc' }, { createdAt: 'desc' }],
        take: q.state && q.state !== 'RESOLVIDO' ? SCAN_CAP : limit,
      }),
      this.prisma.read.systemAlert.findMany({
        where: { isResolved: false },
        select: { category: true, severity: true, metadataJson: true, isResolved: true },
        take: 1000,
      }),
    ]);

    const filtered = (
      q.state && q.state !== 'RESOLVIDO'
        ? rows.filter(r => alertState(r, parseMeta(r.metadataJson)) === q.state)
        : rows
    ).slice(0, limit);
    const names = await this.namesFor(filtered);

    const byArea = Object.fromEntries(ALERT_AREAS.map(a => [a, 0])) as Record<AlertArea, number>;
    const byState: Record<AlertState, number> = {
      ABERTO: 0,
      RECONHECIDO: 0,
      EM_TRATAMENTO: 0,
      RESOLVIDO: 0,
    };
    for (const o of open) {
      const m = parseMeta(o.metadataJson);
      byArea[alertArea(o.category, m)]++;
      byState[alertState(o, m)]++;
    }

    return {
      alerts: filtered.map(r => this.view(r, names)),
      summary: {
        open: open.length,
        openCritical: open.filter(o => o.severity === 'CRITICAL').length,
        unassigned: byState.ABERTO + byState.RECONHECIDO,
        byArea,
        byState,
      },
    };
  }

  // ── Escrita ───────────────────────────────────────────────────────────────

  private async load(id: string) {
    const alert = await this.prisma.systemAlert.findUnique({ where: { id } });
    if (!alert) throw new NotFoundException('Alerta não encontrado');
    return alert;
  }

  private assertOpen(a: SystemAlert) {
    if (a.isResolved) throw new BadRequestException('Alerta já resolvido');
  }

  private async save(a: SystemAlert, meta: AlertMeta, extra: Prisma.SystemAlertUpdateInput = {}) {
    const updated = await this.prisma.systemAlert.update({
      where: { id: a.id },
      data: { metadataJson: JSON.stringify(meta), ...extra },
    });
    return this.view(updated, await this.namesFor([updated]));
  }

  private push(meta: AlertMeta, kind: ActionEntry['kind'], by: number, note: string): AlertMeta {
    return {
      ...meta,
      actions: [...(meta.actions ?? []), { at: new Date().toISOString(), by, kind, note }],
    };
  }

  async acknowledge(id: string, actorId: number) {
    const a = await this.load(id);
    this.assertOpen(a);
    const meta = parseMeta(a.metadataJson);
    if (meta.acknowledgedAt) return this.view(a, await this.namesFor([a]));
    const next = this.push(
      { ...meta, acknowledgedAt: new Date().toISOString(), acknowledgedBy: actorId },
      'ACK',
      actorId,
      'Alerta reconhecido',
    );
    await this.log(actorId, 'MONITORING_ALERT_ACK', id, { title: a.title });
    return this.save(a, next);
  }

  async assign(id: string, assigneeId: number, actorId: number) {
    const a = await this.load(id);
    this.assertOpen(a);
    const user = await this.prisma.user.findUnique({
      where: { id: assigneeId },
      select: { id: true, fullName: true },
    });
    if (!user) throw new BadRequestException('Responsável inexistente');
    const meta = parseMeta(a.metadataJson);
    const next = this.push(
      {
        ...meta,
        assigneeId,
        acknowledgedAt: meta.acknowledgedAt ?? new Date().toISOString(),
        acknowledgedBy: meta.acknowledgedBy ?? actorId,
      },
      'ASSIGN',
      actorId,
      `Atribuído a ${user.fullName}`,
    );
    await this.log(actorId, 'MONITORING_ALERT_ASSIGN', id, { assigneeId });
    return this.save(a, next);
  }

  async addAction(id: string, note: string, actorId: number) {
    const a = await this.load(id);
    this.assertOpen(a);
    const text = note.trim();
    if (!text) throw new BadRequestException('Indique a ação tomada');
    const next = this.push(parseMeta(a.metadataJson), 'NOTE', actorId, text);
    await this.log(actorId, 'MONITORING_ALERT_ACTION', id, { note: text });
    return this.save(a, next);
  }

  async resolve(id: string, note: string | undefined, actorId: number) {
    const a = await this.load(id);
    this.assertOpen(a);
    const text = note?.trim();
    const meta = parseMeta(a.metadataJson);
    const next = this.push(meta, 'RESOLVE', actorId, text || 'Alerta resolvido manualmente');
    await this.log(actorId, 'MONITORING_ALERT_RESOLVE', id, { note: text ?? null });
    return this.save(a, next, {
      isResolved: true,
      resolvedAt: new Date(),
      resolvedBy: String(actorId),
    });
  }

  /** «Novo incidente» a partir de um alerta: herda título, severidade e componente. */
  async createIncident(id: string, actorId: number) {
    const a = await this.load(id);
    this.assertOpen(a);
    const meta = parseMeta(a.metadataJson);
    const area = alertArea(a.category, meta);
    const healthKey = meta.ruleKey?.startsWith('health.') ? meta.ruleKey.slice(7) : null;
    const incident = await this.incidents.create(
      {
        title: a.title.slice(0, 200),
        category: 'DEGRADATION',
        component: (healthKey && COMPONENT_BY_HEALTH_KEY[healthKey]
          ? COMPONENT_BY_HEALTH_KEY[healthKey]
          : COMPONENT_BY_AREA[area]) as 'API',
        severity: a.severity,
        impact: a.message.slice(0, 4000),
        occurredAt: a.createdAt.toISOString(),
      },
      actorId,
    );
    const next = this.push(
      meta,
      'INCIDENT',
      actorId,
      `Incidente ${incident.id} aberto a partir deste alerta`,
    );
    await this.log(actorId, 'MONITORING_ALERT_INCIDENT', id, { incidentId: incident.id });
    return { alert: await this.save(a, next), incident };
  }

  // ── Regras automáticas ────────────────────────────────────────────────────

  private async buildRules(): Promise<RuleResult[]> {
    const r = this.prisma.read;
    const now = new Date();
    const lastHour = new Date(now.getTime() - H);

    const [overdue, blocked, intTotal, intBad, autoFailed, secOpen, health] = await Promise.all([
      r.processInstance.count({ where: { status: 'IN_PROGRESS', slaDeadline: { lt: now } } }),
      r.stepProgress.count({
        where: { status: { in: ['BLOCKED', 'ESCALATED'] }, instance: { status: 'IN_PROGRESS' } },
      }),
      r.integrationConfig.count({ where: { active: true } }),
      r.integrationConfig.count({
        where: { active: true, status: { in: ['ERROR', 'RATE_LIMITED', 'PENDING_AUTH'] } },
      }),
      r.automationExecution.count({ where: { startedAt: { gte: lastHour }, status: 'FAILED' } }),
      r.securityIncident.count({
        where: { status: { in: ['OPEN', 'IN_ANALYSIS'] }, severity: { in: ['HIGH', 'CRITICAL'] } },
      }),
      this.health.current().catch(() => null),
    ]);

    const rules: RuleResult[] = [
      {
        key: 'processes.overdue',
        active: overdue > 0,
        area: 'PROCESSOS',
        category: 'SLA_BREACH',
        severity: overdue >= 10 ? 'CRITICAL' : 'WARNING',
        title: 'Processos com SLA ultrapassado',
        message: `${overdue} processo(s) em curso passaram o prazo de SLA.`,
        value: overdue,
        threshold: 1,
      },
      {
        key: 'processes.blocked',
        active: blocked > 0,
        area: 'PROCESSOS',
        category: 'SLA_BREACH',
        severity: 'WARNING',
        title: 'Etapas de processo bloqueadas ou escaladas',
        message: `${blocked} etapa(s) bloqueada(s)/escalada(s) em processos em curso.`,
        value: blocked,
        threshold: 1,
      },
      {
        key: 'integrations.failing',
        active: intBad > 0,
        area: 'INTEGRACAO',
        category: 'INTEGRATION',
        severity: intTotal > 0 && intBad === intTotal ? 'CRITICAL' : 'WARNING',
        title: 'Integrações com falha',
        message: `${intBad} de ${intTotal} integração(ões) activa(s) em erro, limitadas ou sem autorização.`,
        value: intBad,
        threshold: 1,
      },
      {
        key: 'automations.failures',
        active: autoFailed >= AUTOMATION_FAILURES_PER_HOUR,
        area: 'AUTOMACAO',
        category: 'AUTOMATION',
        severity: 'WARNING',
        title: 'Automações a falhar',
        message: `${autoFailed} execução(ões) de automação falharam na última hora.`,
        value: autoFailed,
        threshold: AUTOMATION_FAILURES_PER_HOUR,
      },
      {
        key: 'security.incidents',
        active: secOpen > 0,
        area: 'SEGURANCA',
        category: 'SECURITY',
        severity: 'CRITICAL',
        title: 'Incidentes de segurança graves em aberto',
        message: `${secOpen} incidente(s) de segurança de severidade alta/crítica por tratar.`,
        value: secOpen,
        threshold: 1,
      },
    ];

    // Health Check: só componentes monitorizados; sem sondas não toca nos alertas.
    for (const c of health?.components ?? []) {
      if (!c.status) continue;
      const rank = STATUS_RANK[c.status as MonitoringStatus];
      rules.push({
        key: `health.${c.key}`,
        active: rank >= STATUS_RANK.DEGRADADO,
        area: 'SISTEMA',
        category: 'PERFORMANCE',
        severity: rank >= STATUS_RANK.CRITICO ? 'CRITICAL' : 'WARNING',
        title: `${c.label}: ${c.statusLabel.toLowerCase()}`,
        message: `Health Check — ${c.label} ${c.statusLabel.toLowerCase()}. ${c.detail}`,
      });
    }
    return rules;
  }

  private async openRuleAlerts() {
    const open = await this.prisma.systemAlert.findMany({
      where: { isResolved: false, metadataJson: { contains: `"source":"${RULE_SOURCE}"` } },
    });
    const map = new Map<string, SystemAlert>();
    for (const a of open) {
      const k = parseMeta(a.metadataJson).ruleKey;
      if (k) map.set(k, a);
    }
    return map;
  }

  async evaluateRules() {
    const [rules, open] = await Promise.all([this.buildRules(), this.openRuleAlerts()]);
    let raised = 0;
    let resolved = 0;
    for (const rule of rules) {
      const existing = open.get(rule.key);
      if (rule.active && !existing) {
        const alert = await this.prisma.systemAlert.create({
          data: {
            severity: rule.severity,
            category: rule.category,
            title: rule.title,
            message: rule.message,
            metricValue: rule.value,
            threshold: rule.threshold,
            notifiedVia: rule.severity === 'CRITICAL' ? ['EMAIL', 'PUSH'] : [],
            metadataJson: JSON.stringify({
              source: RULE_SOURCE,
              ruleKey: rule.key,
              area: rule.area,
            }),
          },
        });
        raised++;
        if (rule.severity === 'CRITICAL') {
          this.events.emit('alert.notify.email', { alert });
          this.events.emit('alert.notify.push', { alert });
        }
      } else if (!rule.active && existing) {
        const meta = parseMeta(existing.metadataJson);
        await this.prisma.systemAlert.update({
          where: { id: existing.id },
          data: {
            isResolved: true,
            resolvedAt: new Date(),
            resolvedBy: 'SYSTEM',
            metadataJson: JSON.stringify({
              ...meta,
              actions: [
                ...(meta.actions ?? []),
                {
                  at: new Date().toISOString(),
                  by: null,
                  kind: 'RESOLVE',
                  note: 'A condição deixou de se verificar — resolvido automaticamente',
                },
              ],
            }),
          },
        });
        resolved++;
      }
    }
    return { raised, resolved };
  }

  @Cron(CronExpression.EVERY_5_MINUTES)
  async scheduledEvaluation() {
    try {
      const r = await this.evaluateRules();
      if (r.raised || r.resolved) {
        this.logger.log(`Alertas do Monitoring: ${r.raised} criado(s), ${r.resolved} resolvido(s)`);
      }
    } catch (err) {
      this.logger.warn(`Avaliação de alertas falhou: ${err instanceof Error ? err.message : err}`);
    }
  }
}
