// modulo_scalability.md §29 P2 — recomendações de dimensionamento/infraestrutura baseadas no histórico.
//
// Regras determinísticas sobre o estado actual (capacidade, auto scaling, resiliência, filas)
// e a tendência das métricas agregadas por hora. Não executa nada: só aconselha.

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ScalabilityCapacityService } from './scalability-capacity.service';
import { ScalabilityQueuesService } from './scalability-queues.service';

export type RecommendationPriority = 'ALTA' | 'MEDIA' | 'BAIXA';

export interface Recommendation {
  key: string;
  area: 'CAPACIDADE' | 'AUTOSCALING' | 'RESILIENCIA' | 'FILAS' | 'PERFORMANCE';
  priority: RecommendationPriority;
  title: string;
  detail: string;
}

export interface RecommendationInput {
  resources: Array<{ key: string; label: string; percent: number | null }>;
  autoScaling: {
    enabled: boolean;
    decision: 'SCALE_UP' | 'SCALE_DOWN' | 'HOLD';
    recommendedInstances: number;
    currentInstances: number;
  };
  resilienceChecks: Array<{ key: string; label: string; status: string; detail: string }>;
  queues: { failed: number; pending: number; throughputPerMin: number } | null;
  /** Médias horárias, da mais antiga para a mais recente. */
  hourly: Array<{ avgCpu: number; maxCpu: number; maxP95Ms: number }>;
}

const avg = (xs: number[]) => (xs.length ? xs.reduce((s, v) => s + v, 0) / xs.length : 0);

/** Compara a metade recente com a anterior; null se houver poucos dados. */
export function trendPercent(values: number[]): number | null {
  if (values.length < 12) return null;
  const mid = Math.floor(values.length / 2);
  const before = avg(values.slice(0, mid));
  const after = avg(values.slice(mid));
  if (before <= 0) return null;
  return Math.round(((after - before) / before) * 100);
}

export function buildRecommendations(input: RecommendationInput): Recommendation[] {
  const out: Recommendation[] = [];

  for (const r of input.resources) {
    if (r.percent === null || r.percent < 70) continue;
    out.push({
      key: `capacity-${r.key}`,
      area: 'CAPACIDADE',
      priority: r.percent >= 90 ? 'ALTA' : 'MEDIA',
      title: `Aumentar a capacidade de ${r.label}`,
      detail: `Uso actual a ${r.percent}% do limite.`,
    });
  }

  const a = input.autoScaling;
  if (a.recommendedInstances > a.currentInstances) {
    out.push({
      key: 'autoscaling-instances',
      area: 'AUTOSCALING',
      priority: a.decision === 'SCALE_UP' ? 'ALTA' : 'MEDIA',
      title: `Subir para ${a.recommendedInstances} instâncias da API`,
      detail: `O débito actual justifica ${a.recommendedInstances} instâncias; há ${a.currentInstances}.`,
    });
  }
  if (!a.enabled && (a.decision === 'SCALE_UP' || a.recommendedInstances > 1)) {
    out.push({
      key: 'autoscaling-disabled',
      area: 'AUTOSCALING',
      priority: 'MEDIA',
      title: 'Ativar a política de auto scaling',
      detail: 'A carga já justifica mais de uma instância e a política está desativada.',
    });
  }

  for (const c of input.resilienceChecks) {
    if (c.status === 'OK') continue;
    out.push({
      key: `resilience-${c.key}`,
      area: 'RESILIENCIA',
      priority: c.status === 'CRITICO' ? 'ALTA' : 'BAIXA',
      title: `Resolver: ${c.label}`,
      detail: c.detail,
    });
  }

  if (input.queues) {
    if (input.queues.failed > 0) {
      out.push({
        key: 'queues-failed',
        area: 'FILAS',
        priority: input.queues.failed >= 50 ? 'ALTA' : 'MEDIA',
        title: 'Investigar jobs falhados nas filas',
        detail: `${input.queues.failed} job(s) falhado(s).`,
      });
    }
    if (input.queues.pending > 0 && input.queues.throughputPerMin > 0) {
      const minutes = Math.ceil(input.queues.pending / input.queues.throughputPerMin);
      if (minutes >= 30) {
        out.push({
          key: 'queues-backlog',
          area: 'FILAS',
          priority: minutes >= 120 ? 'ALTA' : 'MEDIA',
          title: 'Aumentar workers das filas',
          detail: `${input.queues.pending} pendentes levariam ~${minutes} min a esgotar ao ritmo actual.`,
        });
      }
    }
  }

  const cpuTrend = trendPercent(input.hourly.map(h => h.avgCpu));
  if (cpuTrend !== null && cpuTrend >= 25) {
    out.push({
      key: 'trend-cpu',
      area: 'PERFORMANCE',
      priority: 'MEDIA',
      title: 'CPU em crescimento sustentado',
      detail: `A média de CPU subiu ${cpuTrend}% entre a primeira e a segunda metade do período.`,
    });
  }
  const p95Trend = trendPercent(input.hourly.map(h => h.maxP95Ms));
  if (p95Trend !== null && p95Trend >= 25) {
    out.push({
      key: 'trend-p95',
      area: 'PERFORMANCE',
      priority: 'MEDIA',
      title: 'Latência p95 em degradação',
      detail: `O pico de p95 subiu ${p95Trend}% entre a primeira e a segunda metade do período.`,
    });
  }

  const order: Record<RecommendationPriority, number> = { ALTA: 0, MEDIA: 1, BAIXA: 2 };
  return out.sort((x, y) => order[x.priority] - order[y.priority]);
}

@Injectable()
export class ScalabilityRecommendationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly capacity: ScalabilityCapacityService,
    private readonly queues: ScalabilityQueuesService,
  ) {}

  async getRecommendations(days = 14) {
    const [cap, auto, res, q, hourly, s] = await Promise.all([
      this.capacity.getCapacityMetrics(),
      this.capacity.getAutoScaling(),
      this.capacity.getResilienceMetrics(),
      this.queues.getQueueMetrics().catch(() => null),
      this.prisma.scalabilityMetricHourly.findMany({
        where: { hour: { gte: new Date(Date.now() - days * 86_400_000) } },
        orderBy: { hour: 'asc' },
        select: { avgCpu: true, maxCpu: true, maxP95Ms: true },
      }),
      this.prisma.scalabilityInfraSettings.findUnique({
        where: { id: 'default' },
        select: { apiReplicas: true },
      }),
    ]);

    const recommendations = buildRecommendations({
      resources: cap.resources.map(r => ({ key: r.key, label: r.label, percent: r.percent })),
      autoScaling: {
        enabled: auto.policy.enabled,
        decision: auto.evaluation.decision as RecommendationInput['autoScaling']['decision'],
        recommendedInstances: auto.evaluation.recommendedInstances,
        currentInstances: s?.apiReplicas ?? 1,
      },
      resilienceChecks: res.checks,
      queues: q
        ? {
            failed: q.totals.failed,
            pending: q.totals.pending,
            throughputPerMin: q.totals.throughputPerMin,
          }
        : null,
      hourly,
    });

    return {
      generatedAt: new Date().toISOString(),
      basedOnHours: hourly.length,
      recommendations,
      note: 'Regras determinísticas sobre o estado actual e a tendência horária. A tendência só aparece com pelo menos 12 horas agregadas.',
    };
  }
}
