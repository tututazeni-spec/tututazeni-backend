// modulo_scalability.md §19 — aba Previsões.
//
// Extrapola séries mensais REAIS (utilizadores, tamanho da BD, storage, tráfego,
// sessões simultâneas, CPU, RAM) para 3/6/12 meses e diz quando cada recurso
// chega a 80% e 100% da sua capacidade. Nada é inventado: sem pelo menos 2
// meses de histórico o recurso devolve `available: false` com o motivo.
// Não persiste previsões — são recalculadas a cada pedido a partir do histórico.

import { SharedResult } from '../common/helpers/shared-result';
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/services/audit.service';
import { ScalabilityStorageService } from './scalability-storage.service';
import {
  Confidence,
  Projection,
  addMonths,
  monthLabelPt,
  monthsToReach,
  project,
} from './scalability-forecast.math';

const SETTINGS_ID = 'default';
const HORIZONS = [3, 6, 12] as const;
const MONTHS_BACK = 12;

interface MonthlyRow {
  month: string;
  avg_cpu: number | null;
  avg_mem: number | null;
  avg_rpm: number | null;
  max_conc: number | null;
}

@Injectable()
export class ScalabilityForecastService {
  private readonly logger = new Logger(ScalabilityForecastService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly storage: ScalabilityStorageService,
  ) {}

  private round(n: number, d = 1) {
    const f = 10 ** d;
    return Math.round(n * f) / f;
  }

  private monthKey(d: Date) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }

  // Remove meses vazios no início e mantém a ordem cronológica.
  private trim(values: Array<number | null>): number[] {
    const first = values.findIndex(v => v !== null);
    if (first < 0) return [];
    return values.slice(first).map((v, i, arr) => v ?? (i > 0 ? (arr[i - 1] ?? 0) : 0));
  }

  private buildResource(args: {
    key: string;
    label: string;
    unit: string;
    method: 'compound' | 'linear';
    series: number[];
    capacity: number | null;
    capacityLabel: string;
    digits?: number;
    /** devolve a projecção já convertida (ex.: CPU escalada pelo crescimento de sessões) */
    projection?: Projection | null;
  }) {
    const { key, label, unit, series, capacity, capacityLabel } = args;
    const digits = args.digits ?? 1;
    const proj = args.projection !== undefined ? args.projection : project(series, args.method);
    if (!proj || series.length < 2) {
      return {
        key,
        label,
        unit,
        available: false as const,
        reason: 'Histórico insuficiente — são precisos pelo menos 2 meses de dados.',
      };
    }
    const current = series[series.length - 1];
    const now = new Date();
    const m80 = capacity ? monthsToReach(proj, current, capacity * 0.8) : null;
    const m100 = capacity ? monthsToReach(proj, current, capacity) : null;
    const when = (m: number | null) => (m === null ? null : addMonths(now, m));

    return {
      key,
      label,
      unit,
      available: true as const,
      method: proj.method,
      current: this.round(current, digits),
      capacity,
      capacityLabel,
      monthlyGrowthPercent: proj.monthlyGrowthPercent,
      monthlyGrowth: this.round(
        proj.method === 'compound' ? current * proj.monthlyRate : proj.monthlyRate,
        digits + 1,
      ),
      confidence: proj.confidence as Confidence,
      historyMonths: series.length,
      history: series.map(v => this.round(v, digits)),
      projections: HORIZONS.map(h => {
        const value = proj.at(h);
        return {
          months: h,
          value: this.round(value, digits),
          percentOfCapacity: capacity ? this.round((value / capacity) * 100) : null,
        };
      }),
      reach80: capacity
        ? {
            months: m80,
            date: when(m80)?.toISOString() ?? null,
            label: m80 === null ? null : m80 === 0 ? 'já atingido' : monthLabelPt(when(m80)!),
          }
        : null,
      reach100: capacity
        ? {
            months: m100,
            date: when(m100)?.toISOString() ?? null,
            label: m100 === null ? null : m100 === 0 ? 'já atingido' : monthLabelPt(when(m100)!),
          }
        : null,
    };
  }

  private readonly getForecastsShared = new SharedResult();

  getForecasts() {
    return this.getForecastsShared.get(() => this.computeGetForecasts());
  }

  private async computeGetForecasts() {
    const since = new Date();
    since.setDate(1);
    since.setHours(0, 0, 0, 0);
    since.setMonth(since.getMonth() - (MONTHS_BACK - 1));

    const [settings, tenant, userMonths, baseUsers, metricMonths, dbSamples, storage, totalUsers] =
      await Promise.all([
        this.prisma.scalabilityInfraSettings.upsert({
          where: { id: SETTINGS_ID },
          update: {},
          create: { id: SETTINGS_ID },
        }),
        this.prisma.tenantConfig.findFirst({
          orderBy: { createdAt: 'asc' },
          select: { maxUsers: true },
        }),
        this.prisma.$queryRaw<{ month: string; n: number }[]>`
          SELECT to_char(date_trunc('month', "createdAt"), 'YYYY-MM') AS month, count(*)::int AS n
          FROM users WHERE "createdAt" >= ${since} GROUP BY 1 ORDER BY 1`.catch(
          () => [] as { month: string; n: number }[],
        ),
        this.prisma.read.user.count({ where: { createdAt: { lt: since } } }),
        this.prisma.$queryRaw<MonthlyRow[]>`
          SELECT to_char(date_trunc('month', "capturedAt"), 'YYYY-MM') AS month,
                 avg("cpuUsagePercent")::float AS avg_cpu,
                 avg("memoryUsagePercent")::float AS avg_mem,
                 avg("requestsPerMinute")::float AS avg_rpm,
                 max("concurrentSessions")::float AS max_conc
          FROM scalability_metrics WHERE "capturedAt" >= ${since}
          GROUP BY 1 ORDER BY 1`.catch(() => [] as MonthlyRow[]),
        this.prisma.databaseSizeSample.findMany({
          where: { capturedAt: { gte: since } },
          orderBy: { capturedAt: 'asc' },
          select: { capturedAt: true, sizeBytes: true },
        }),
        this.storage.getStorageMetrics().catch(() => null),
        this.prisma.read.user.count(),
      ]);

    // Meses do calendário desde `since` (para alinhar séries com lacunas).
    const months: string[] = [];
    for (let i = 0; i < MONTHS_BACK; i++) {
      months.push(this.monthKey(new Date(since.getFullYear(), since.getMonth() + i, 1)));
    }

    // Utilizadores registados (acumulado).
    const created = new Map(userMonths.map(r => [r.month, r.n]));
    let run = baseUsers;
    const usersSeries = this.trim(
      months.map(m => {
        run += created.get(m) ?? 0;
        return run;
      }),
    ).filter(v => v > 0);

    // BD: último tamanho conhecido de cada mês (GB).
    const GB = 1024 ** 3;
    const dbByMonth = new Map<string, number>();
    for (const s of dbSamples) dbByMonth.set(this.monthKey(s.capturedAt), Number(s.sizeBytes) / GB);
    const dbSeries = this.trim(months.map(m => dbByMonth.get(m) ?? null));

    // Storage: cumulativeGb já mensal.
    const storageSeries = (storage?.growth ?? []).map(g => g.cumulativeGb);

    // Métricas de infra por mês.
    const metricByMonth = new Map(metricMonths.map(r => [r.month, r]));
    const pick = (f: (r: MonthlyRow) => number | null) =>
      this.trim(months.map(m => (metricByMonth.has(m) ? f(metricByMonth.get(m)!) : null)));
    const rpmSeries = pick(r => r.avg_rpm);
    const concSeries = pick(r => r.max_conc);
    const cpuSeries = pick(r => r.avg_cpu);
    const memSeries = pick(r => r.avg_mem);

    // CPU/RAM: a utilização não cresce sozinha — acompanha a carga. Se há histórico
    // de sessões, projecta-se a utilização pelo mesmo crescimento relativo; senão,
    // pela própria tendência da série.
    const concProj = project(concSeries, 'linear');
    const scaledByLoad = (series: number[]): Projection | null => {
      const own = project(series, 'linear');
      if (!own || !concProj || concSeries.length < 2) return own;
      const base = concSeries[concSeries.length - 1];
      const cur = series[series.length - 1];
      if (base <= 0) return own;
      return {
        ...own,
        method: 'linear',
        monthlyRate: (cur * (concProj.at(1) - base)) / base,
        monthlyGrowthPercent: this.round(((concProj.at(1) - base) / base) * 100),
        confidence: concProj.confidence,
        at: m => Math.min(1000, Math.max(0, (cur * concProj.at(m)) / base)),
      };
    };

    const maxUsers = tenant?.maxUsers ?? null;
    const resources = [
      this.buildResource({
        key: 'users',
        label: 'Utilizadores',
        unit: '',
        method: 'compound',
        series: usersSeries,
        capacity: maxUsers,
        capacityLabel: 'Limite do plano (maxUsers)',
        digits: 0,
      }),
      this.buildResource({
        key: 'database',
        label: 'Base de dados',
        unit: 'GB',
        method: 'linear',
        series: dbSeries,
        capacity: settings.dbCapacityGb ?? null,
        capacityLabel: 'Capacidade da BD definida',
        digits: 2,
      }),
      this.buildResource({
        key: 'storage',
        label: 'Storage',
        unit: 'GB',
        method: 'linear',
        series: storageSeries,
        capacity: storage?.totalGb ?? null,
        capacityLabel: 'Limite do plano (maxStorageGb)',
        digits: 2,
      }),
      this.buildResource({
        key: 'requests',
        label: 'Requests',
        unit: 'req/s',
        method: 'linear',
        series: rpmSeries.map(v => v / 60),
        capacity: settings.maxApiRps,
        capacityLabel: 'Limite de API RPS definido',
        digits: 2,
      }),
      this.buildResource({
        key: 'concurrent',
        label: 'Concurrent users',
        unit: '',
        method: 'linear',
        series: concSeries,
        capacity: settings.maxConcurrentUsers,
        capacityLabel: 'Limite de concurrent users definido',
        digits: 0,
      }),
      this.buildResource({
        key: 'cpu',
        label: 'CPU',
        unit: '%',
        method: 'linear',
        series: cpuSeries,
        capacity: 100,
        capacityLabel: '100% de CPU',
        projection: scaledByLoad(cpuSeries),
      }),
      this.buildResource({
        key: 'ram',
        label: 'RAM',
        unit: '%',
        method: 'linear',
        series: memSeries,
        capacity: 100,
        capacityLabel: '100% de RAM',
        projection: scaledByLoad(memSeries),
      }),
    ];

    // Necessidade de instâncias: utilização projectada a 12 meses vs. alvo da política.
    const cpuRes = resources.find(r => r.key === 'cpu');
    const ramRes = resources.find(r => r.key === 'ram');
    const replicas = settings.apiReplicas;
    const need = (r: typeof cpuRes, target: number) => {
      if (!r || !r.available) return null;
      const at12 = r.projections.find(p => p.months === 12)!.value;
      return Math.max(1, Math.ceil((at12 / target) * replicas));
    };
    const infraNeeds = {
      currentInstances: replicas,
      instancesForCpu12m: need(cpuRes, settings.asTargetCpu),
      instancesForRam12m: need(ramRes, settings.asTargetMemory),
    };

    // Manchete: o recurso que chega primeiro a 80%.
    const earliest = resources
      .flatMap(r =>
        r.available && r.reach80 && r.reach80.months !== null ? [{ r, m: r.reach80.months }] : [],
      )
      .sort((a, b) => a.m - b.m)[0];

    const usersRes = resources[0];
    const headline = earliest
      ? earliest.m === 0
        ? `${earliest.r.label} já ultrapassou 80% da capacidade.`
        : `A infraestrutura atual poderá atingir 80% da capacidade estimada em ${earliest.r.reach80!.label} (${earliest.r.label}).`
      : 'Nenhum recurso deverá atingir 80% da capacidade nos próximos 5 anos com a tendência actual.';

    return {
      generatedAt: new Date().toISOString(),
      headline,
      earliestBottleneck: earliest
        ? {
            key: earliest.r.key,
            label: earliest.r.label,
            months: earliest.m,
            date: earliest.r.reach80!.date,
          }
        : null,
      users: {
        current: totalUsers,
        monthlyGrowthPercent: usersRes.available ? usersRes.monthlyGrowthPercent : null,
        in12Months: usersRes.available ? usersRes.projections[2].value : null,
      },
      resources,
      infraNeeds,
      dbCapacityGb: settings.dbCapacityGb ?? null,
      note: 'Projecções por tendência do histórico real (composta para utilizadores, linear para o resto). A confiança desce com poucos meses de dados ou séries irregulares; CPU e RAM acompanham o crescimento de sessões simultâneas.',
    };
  }

  async updateForecastSettings(dbCapacityGb: number | null, actorId: number) {
    const before = await this.prisma.scalabilityInfraSettings.upsert({
      where: { id: SETTINGS_ID },
      update: {},
      create: { id: SETTINGS_ID },
    });
    await this.prisma.scalabilityInfraSettings.update({
      where: { id: SETTINGS_ID },
      data: { dbCapacityGb, updatedById: actorId },
    });
    if (before.dbCapacityGb !== dbCapacityGb) {
      await this.audit
        .logEntity(actorId, 'FORECAST_SETTINGS_UPDATE', 'ScalabilityInfraSettings', SETTINGS_ID, {
          changes: { dbCapacityGb: { from: before.dbCapacityGb, to: dbCapacityGb } },
        })
        .catch(err =>
          this.logger.warn(`Auditoria falhou: ${err instanceof Error ? err.message : err}`),
        );
    }
    return this.getForecasts();
  }
}
