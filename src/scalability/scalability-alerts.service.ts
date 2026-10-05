// modulo_scalability.md §22 — aba Alertas.
//
// Regras automáticas em 4 grupos (Capacidade, Performance, Crescimento,
// Resiliência) avaliadas contra as MESMAS fontes das outras abas. Cada regra que
// dispara cria um SystemAlert (um só aberto por regra — não repete enquanto não
// for resolvido) e é resolvido automaticamente quando a regra deixa de disparar.
// Regras cuja fonte não existe devolvem `UNAVAILABLE` com o motivo, nunca "OK".
// Os limiares são constantes para já; a edição fica para a aba Configurações.

import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Cron, CronExpression } from '@nestjs/schedule';
import { AlertCategory, AlertSeverity } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ScalabilityCapacityService } from './scalability-capacity.service';
import { ScalabilityForecastService } from './scalability-forecast.service';
import { ScalabilityInfraService } from './scalability-infra.service';
import { ScalabilityQueuesService } from './scalability-queues.service';
import {
  activeWindow,
  AlertThresholds,
  parseJson,
  parseWindows,
  resolveThresholds,
} from './scalability-settings.util';

export type AlertGroup = 'CAPACITY' | 'PERFORMANCE' | 'GROWTH' | 'RESILIENCE';
export type RuleState = 'OK' | 'TRIGGERED' | 'UNAVAILABLE' | 'DISABLED';

export interface RuleResult {
  /** valor medido (null se indisponível) */
  value: number | null;
  /** texto livre quando o valor não é um número simples */
  detail: string;
  triggered: boolean;
  unavailableReason?: string;
}

export interface RuleDef {
  key: string;
  group: AlertGroup;
  label: string;
  category: AlertCategory;
  severity: AlertSeverity;
  threshold: number | null;
  unit: string;
  /** descrição legível do limiar, ex.: "> 85%" */
  condition: string;
}

interface Snapshot {
  cpu: number | null;
  ram: number | null;
  resources: Map<string, { percent: number | null }>;
  queuePending: number | null;
  apiTotals: { p95Ms: number; p99Ms: number; errorRate5xx: number; slowEndpoints: number } | null;
  slowQueryShare: number | null;
  forecastResources: Map<
    string,
    { available: boolean; history?: number[]; reach80Months?: number | null }
  >;
  resilience: Map<string, { status: string; detail: string }> | null;
}

/** Definição das regras com os limiares efectivos (padrão + configuração §24). */
export function buildRules(T: AlertThresholds): RuleDef[] {
  return [
    {
      key: 'cap_cpu',
      group: 'CAPACITY',
      label: 'CPU acima do limite',
      category: 'PERFORMANCE',
      severity: 'CRITICAL',
      threshold: T.cpu,
      unit: '%',
      condition: `> ${T.cpu}%`,
    },
    {
      key: 'cap_ram',
      group: 'CAPACITY',
      label: 'RAM acima do limite',
      category: 'PERFORMANCE',
      severity: 'CRITICAL',
      threshold: T.ram,
      unit: '%',
      condition: `> ${T.ram}%`,
    },
    {
      key: 'cap_storage',
      group: 'CAPACITY',
      label: 'Storage acima do limite',
      category: 'STORAGE',
      severity: 'WARNING',
      threshold: T.storage,
      unit: '%',
      condition: `> ${T.storage}% do plano`,
    },
    {
      key: 'cap_db_conn',
      group: 'CAPACITY',
      label: 'Ligações à BD acima do limite',
      category: 'PERFORMANCE',
      severity: 'CRITICAL',
      threshold: T.dbConnections,
      unit: '%',
      condition: `> ${T.dbConnections}% de max_connections`,
    },
    {
      key: 'cap_queue',
      group: 'CAPACITY',
      label: 'Fila acima do limite',
      category: 'AUTOMATION',
      severity: 'WARNING',
      threshold: T.queuePending,
      unit: 'jobs',
      condition: `> ${T.queuePending} jobs pendentes`,
    },
    {
      key: 'perf_p95',
      group: 'PERFORMANCE',
      label: 'P95 elevado',
      category: 'PERFORMANCE',
      severity: 'WARNING',
      threshold: T.p95Ms,
      unit: 'ms',
      condition: `> ${T.p95Ms} ms`,
    },
    {
      key: 'perf_p99',
      group: 'PERFORMANCE',
      label: 'P99 elevado',
      category: 'PERFORMANCE',
      severity: 'WARNING',
      threshold: T.p99Ms,
      unit: 'ms',
      condition: `> ${T.p99Ms} ms`,
    },
    {
      key: 'perf_errors',
      group: 'PERFORMANCE',
      label: 'Error rate elevado',
      category: 'SLA_BREACH',
      severity: 'CRITICAL',
      threshold: T.errorRate,
      unit: '%',
      condition: `erros 5xx > ${T.errorRate}%`,
    },
    {
      key: 'perf_api_slow',
      group: 'PERFORMANCE',
      label: 'API lenta',
      category: 'PERFORMANCE',
      severity: 'WARNING',
      threshold: T.slowEndpoints,
      unit: 'endpoints',
      condition: 'endpoint(s) em estado crítico',
    },
    {
      key: 'perf_slow_queries',
      group: 'PERFORMANCE',
      label: 'Queries lentas',
      category: 'PERFORMANCE',
      severity: 'WARNING',
      threshold: T.slowQueryShare,
      unit: '%',
      condition: `> ${T.slowQueryShare}% das queries > 500 ms`,
    },
    {
      key: 'growth_users',
      group: 'GROWTH',
      label: 'Crescimento inesperado de utilizadores',
      category: 'PERFORMANCE',
      severity: 'WARNING',
      threshold: T.growthFactor,
      unit: '×',
      condition: `último mês > ${T.growthFactor}× a média anterior`,
    },
    {
      key: 'growth_storage',
      group: 'GROWTH',
      label: 'Storage a crescer acima do previsto',
      category: 'STORAGE',
      severity: 'WARNING',
      threshold: T.storageGrowthFactor,
      unit: '×',
      condition: `último mês > ${T.storageGrowthFactor}× a média anterior`,
    },
    {
      key: 'growth_users_limit',
      group: 'GROWTH',
      label: 'Utilizadores a aproximar-se do limite',
      category: 'PERFORMANCE',
      severity: 'WARNING',
      threshold: T.usersNearLimitMonths,
      unit: 'meses',
      condition: `80% do plano em ≤ ${T.usersNearLimitMonths} meses`,
    },
    {
      key: 'res_backup',
      group: 'RESILIENCE',
      label: 'Backup falhado / fora do RPO',
      category: 'SLA_BREACH',
      severity: 'CRITICAL',
      threshold: null,
      unit: '',
      condition: 'último backup mais antigo que o RPO',
    },
    {
      key: 'res_replication',
      group: 'RESILIENCE',
      label: 'Replicação interrompida',
      category: 'SLA_BREACH',
      severity: 'CRITICAL',
      threshold: null,
      unit: '',
      condition: 'replicação declarada sem réplicas ligadas',
    },
    {
      key: 'res_health',
      group: 'RESILIENCE',
      label: 'Health check falhado',
      category: 'SLA_BREACH',
      severity: 'CRITICAL',
      threshold: null,
      unit: '',
      condition: 'BD não responde',
    },
    {
      key: 'res_instance',
      group: 'RESILIENCE',
      label: 'Instância indisponível',
      category: 'SLA_BREACH',
      severity: 'CRITICAL',
      threshold: null,
      unit: '',
      condition: 'instância da API não responde',
    },
  ];
}

const na = (reason: string): RuleResult => ({
  value: null,
  detail: reason,
  triggered: false,
  unavailableReason: reason,
});
const pct = (n: number) => Math.round(n * 10) / 10;

/** Último mês vs. média dos anteriores numa série cumulativa mensal. */
export function growthRatio(history: number[]): number | null {
  if (history.length < 3) return null;
  const deltas = history.slice(1).map((v, i) => v - history[i]);
  const last = deltas[deltas.length - 1];
  const prev = deltas.slice(0, -1);
  const avg = prev.reduce((s, v) => s + v, 0) / prev.length;
  if (avg <= 0) return null;
  return last / avg;
}

@Injectable()
export class ScalabilityAlertsService {
  private readonly logger = new Logger(ScalabilityAlertsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventEmitter2,
    private readonly capacity: ScalabilityCapacityService,
    private readonly infra: ScalabilityInfraService,
    private readonly queues: ScalabilityQueuesService,
    private readonly forecasts: ScalabilityForecastService,
  ) {}

  private async loadConfig() {
    const row = await this.prisma.scalabilityInfraSettings.findUnique({ where: { id: 'default' } });
    const T = resolveThresholds(row?.thresholdsJson);
    return {
      T,
      rules: buildRules(T),
      disabled: new Set(parseJson<string[]>(row?.disabledRulesJson, [])),
      window: activeWindow(parseWindows(row?.maintenanceWindowsJson)),
    };
  }

  private async snapshot(): Promise<Snapshot> {
    const [latest, cap, queue, api, db, fc, res] = await Promise.all([
      this.prisma.scalabilityMetric.findFirst({
        where: { capturedAt: { gte: new Date(Date.now() - 15 * 60_000) } },
        orderBy: { capturedAt: 'desc' },
        select: { cpuUsagePercent: true, memoryUsagePercent: true },
      }),
      this.capacity.getCapacityMetrics().catch(() => null),
      this.queues.getQueueMetrics().catch(() => null),
      this.infra.getApiMetrics().catch(() => null),
      this.infra.getDatabaseMetrics().catch(() => null),
      this.forecasts.getForecasts().catch(() => null),
      this.capacity.getResilienceMetrics().catch(() => null),
    ]);

    const apiTotals =
      api && api.totals.requests > 0
        ? {
            p95Ms: api.totals.p95Ms,
            p99Ms: api.totals.p99Ms,
            errorRate5xx: pct((api.totals.http5xx / api.totals.requests) * 100),
            slowEndpoints: api.endpoints.filter(e => e.status === 'CRITICO').length,
          }
        : null;

    return {
      cpu: latest?.cpuUsagePercent ?? null,
      ram: latest?.memoryUsagePercent ?? null,
      resources: new Map((cap?.resources ?? []).map(r => [r.key, { percent: r.percent }])),
      queuePending: queue ? queue.totals.pending : null,
      apiTotals,
      slowQueryShare:
        db && db.queries.appTotal > 0
          ? pct((db.queries.slowCount / db.queries.appTotal) * 100)
          : null,
      forecastResources: new Map(
        (fc?.resources ?? []).map(r => [
          r.key,
          r.available
            ? {
                available: true,
                history: r.history,
                reach80Months: r.reach80?.months ?? null,
              }
            : { available: false },
        ]),
      ),
      resilience: res
        ? new Map(res.checks.map(c => [c.key, { status: c.status, detail: c.detail }]))
        : null,
    };
  }

  private evaluateRule(r: RuleDef, s: Snapshot, T: AlertThresholds): RuleResult {
    const over = (value: number | null, limit: number, unit: string, src: string): RuleResult =>
      value === null
        ? na(`Sem dados: ${src}`)
        : { value, detail: `${value}${unit} (limite ${limit}${unit})`, triggered: value > limit };

    switch (r.key) {
      case 'cap_cpu':
        return over(s.cpu, T.cpu, '%', 'sem amostra de CPU nos últimos 15 min');
      case 'cap_ram':
        return over(s.ram, T.ram, '%', 'sem amostra de RAM nos últimos 15 min');
      case 'cap_storage':
        return over(
          s.resources.get('storage')?.percent ?? null,
          T.storage,
          '%',
          'storage do plano não definido',
        );
      case 'cap_db_conn':
        return over(
          s.resources.get('db')?.percent ?? null,
          T.dbConnections,
          '%',
          'max_connections não legível',
        );
      case 'cap_queue':
        return over(s.queuePending, T.queuePending, ' jobs', 'filas indisponíveis ou desactivadas');
      case 'perf_p95':
        return over(s.apiTotals?.p95Ms ?? null, T.p95Ms, ' ms', 'ainda sem pedidos medidos');
      case 'perf_p99':
        return over(s.apiTotals?.p99Ms ?? null, T.p99Ms, ' ms', 'ainda sem pedidos medidos');
      case 'perf_errors':
        return over(
          s.apiTotals?.errorRate5xx ?? null,
          T.errorRate,
          '%',
          'ainda sem pedidos medidos',
        );
      case 'perf_api_slow': {
        if (!s.apiTotals) return na('Sem dados: ainda sem pedidos medidos');
        const n = s.apiTotals.slowEndpoints;
        return {
          value: n,
          detail: `${n} endpoint(s) em estado crítico`,
          triggered: n >= T.slowEndpoints,
        };
      }
      case 'perf_slow_queries':
        return over(s.slowQueryShare, T.slowQueryShare, '%', 'ainda sem queries medidas');
      case 'growth_users':
      case 'growth_storage': {
        const f = s.forecastResources.get(r.key === 'growth_users' ? 'users' : 'storage');
        const ratio = f?.available && f.history ? growthRatio(f.history) : null;
        const limit = r.key === 'growth_users' ? T.growthFactor : T.storageGrowthFactor;
        if (ratio === null)
          return na('Sem dados: são precisos ≥ 3 meses de histórico com crescimento');
        const v = pct(ratio);
        return {
          value: v,
          detail: `${v}× a média mensal anterior (limite ${limit}×)`,
          triggered: ratio > limit,
        };
      }
      case 'growth_users_limit': {
        const f = s.forecastResources.get('users');
        if (!f?.available) return na('Sem dados: histórico de utilizadores insuficiente');
        const m = f.reach80Months;
        if (m === null || m === undefined) {
          return {
            value: null,
            detail: 'Não atinge 80% do plano na tendência actual',
            triggered: false,
          };
        }
        return {
          value: m,
          detail: m === 0 ? 'Já acima de 80% do plano' : `80% do plano em ~${m} mês(es)`,
          triggered: m <= T.usersNearLimitMonths,
        };
      }
      case 'res_backup':
      case 'res_replication':
      case 'res_health': {
        if (!s.resilience) return na('Sem dados: verificações de resiliência indisponíveis');
        const key = {
          res_backup: 'backups',
          res_replication: 'dbRedundancy',
          res_health: 'health',
        }[r.key]!;
        const c = s.resilience.get(key);
        if (!c) return na('Sem dados: verificação não encontrada');
        // Replicação só dispara se declarada mas sem réplicas ligadas (ATENCAO);
        // "sem replicação" (CRITICO) é uma lacuna de arquitectura, não uma interrupção.
        const triggered =
          r.key === 'res_replication' ? c.status === 'ATENCAO' : c.status === 'CRITICO';
        return { value: null, detail: c.detail, triggered };
      }
      case 'res_instance':
        return na(
          'Não observável pela aplicação — requer a orquestração (LB/Docker) a reportar instâncias',
        );
      default:
        return na('Regra desconhecida');
    }
  }

  /** Alertas abertos (não resolvidos) criados por regras, por ruleKey. */
  private async openByRule() {
    const open = await this.prisma.systemAlert.findMany({
      where: { isResolved: false, metadataJson: { contains: '"source":"scalability-rule"' } },
      select: { id: true, createdAt: true, metadataJson: true },
    });
    const map = new Map<string, { id: string; createdAt: Date }>();
    for (const a of open) {
      try {
        const k = (JSON.parse(a.metadataJson ?? '{}') as { ruleKey?: string }).ruleKey;
        if (k) map.set(k, { id: a.id, createdAt: a.createdAt });
      } catch {
        /* metadataJson alheio — ignora */
      }
    }
    return map;
  }

  async getOverview() {
    const [snap, open, cfg] = await Promise.all([
      this.snapshot(),
      this.openByRule(),
      this.loadConfig(),
    ]);
    const rules = cfg.rules.map(r => {
      const res = this.evaluateRule(r, snap, cfg.T);
      const state: RuleState = cfg.disabled.has(r.key)
        ? 'DISABLED'
        : res.unavailableReason
          ? 'UNAVAILABLE'
          : res.triggered
            ? 'TRIGGERED'
            : 'OK';
      return {
        key: r.key,
        group: r.group,
        label: r.label,
        severity: r.severity,
        condition: r.condition,
        threshold: r.threshold,
        unit: r.unit,
        state,
        value: res.value,
        detail: res.detail,
        openAlertId: open.get(r.key)?.id ?? null,
        openSince: open.get(r.key)?.createdAt.toISOString() ?? null,
      };
    });
    const groups = (['CAPACITY', 'PERFORMANCE', 'GROWTH', 'RESILIENCE'] as AlertGroup[]).map(g => {
      const rs = rules.filter(r => r.group === g);
      return {
        group: g,
        triggered: rs.filter(r => r.state === 'TRIGGERED').length,
        unavailable: rs.filter(r => r.state === 'UNAVAILABLE').length,
        total: rs.length,
        rules: rs,
      };
    });
    return {
      evaluatedAt: new Date().toISOString(),
      summary: {
        triggered: rules.filter(r => r.state === 'TRIGGERED').length,
        critical: rules.filter(r => r.state === 'TRIGGERED' && r.severity === 'CRITICAL').length,
        unavailable: rules.filter(r => r.state === 'UNAVAILABLE').length,
        total: rules.length,
      },
      groups,
      note: 'As regras são avaliadas de 5 em 5 minutos; cada regra dispara no máximo um alerta aberto e resolve-o sozinha quando deixa de se verificar. Regras "sem dados" não são avaliadas — não significam saudável.',
    };
  }

  /** Cria alertas para regras disparadas e resolve os que deixaram de disparar. */
  async evaluateAndRaise() {
    const [snap, open, cfg] = await Promise.all([
      this.snapshot(),
      this.openByRule(),
      this.loadConfig(),
    ]);
    let raised = 0;
    let resolved = 0;
    for (const r of cfg.rules) {
      if (cfg.disabled.has(r.key)) continue; // regra desactivada em Configurações
      const res = this.evaluateRule(r, snap, cfg.T);
      if (res.unavailableReason) continue; // sem dados: não cria nem resolve
      const existing = open.get(r.key);
      // Janela de manutenção: não cria alertas novos (resolver continua permitido).
      if (res.triggered && !existing && !cfg.window) {
        const alert = await this.prisma.systemAlert.create({
          data: {
            severity: r.severity,
            category: r.category,
            title: r.label,
            message: `${r.label}: ${res.detail}. Regra: ${r.condition}.`,
            metricValue: res.value ?? undefined,
            threshold: r.threshold ?? undefined,
            notifiedVia: r.severity === 'CRITICAL' ? ['EMAIL', 'PUSH'] : ['EMAIL'],
            metadataJson: JSON.stringify({
              source: 'scalability-rule',
              ruleKey: r.key,
              group: r.group,
            }),
          },
        });
        raised++;
        this.events.emit('alert.notify.email', { alert });
        if (r.severity === 'CRITICAL') this.events.emit('alert.notify.push', { alert });
      } else if (!res.triggered && existing) {
        await this.prisma.systemAlert.update({
          where: { id: existing.id },
          data: { isResolved: true, resolvedAt: new Date(), resolvedBy: 'SYSTEM' },
        });
        resolved++;
      }
    }
    return { raised, resolved };
  }

  @Cron(CronExpression.EVERY_5_MINUTES)
  async scheduledEvaluation() {
    try {
      const r = await this.evaluateAndRaise();
      if (r.raised || r.resolved) {
        this.logger.log(`Regras de alerta: ${r.raised} criado(s), ${r.resolved} resolvido(s)`);
      }
    } catch (err) {
      this.logger.warn(`Avaliação de regras falhou: ${err instanceof Error ? err.message : err}`);
    }
  }
}
