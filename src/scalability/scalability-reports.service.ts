// modulo_scalability.md §23 — aba Relatórios.
//
// 11 relatórios construídos a partir das MESMAS fontes das outras abas (nada é
// recalculado à parte): capacidade, performance, crescimento, infraestrutura,
// custos, incidentes, testes de carga, disponibilidade, utilização por módulo,
// Capacity Planning e previsão de infraestrutura. Exportação CSV / XLSX / PDF;
// cada exportação é registada no Audit com autor, relatório e formato.

import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import { AuditService } from '../common/services/audit.service';
import { ScalabilityCapacityService } from './scalability-capacity.service';
import { ScalabilityCostsService } from './scalability-costs.service';
import { ScalabilityForecastService } from './scalability-forecast.service';
import { ScalabilityIncidentsService } from './scalability-incidents.service';
import { ScalabilityInfraService } from './scalability-infra.service';
import { ScalabilityIntegrationsPerfService } from './scalability-integrations-perf.service';
import { ScalabilityLoadTestsService } from './scalability-loadtests.service';
import { ScalabilityStorageService } from './scalability-storage.service';

export const REPORT_TYPES = [
  'capacity-monthly',
  'performance',
  'growth',
  'infrastructure',
  'costs',
  'incidents',
  'load-tests',
  'availability',
  'module-usage',
  'capacity-planning',
  'infrastructure-forecast',
] as const;
export type ScalabilityReportType = (typeof REPORT_TYPES)[number];
export type ReportFormat = 'csv' | 'xlsx' | 'pdf';

type Cell = string | number | null;
type Row = Record<string, Cell>;

export interface ReportTable {
  title: string;
  columns: string[];
  rows: Row[];
}

export interface ScalabilityReport {
  type: ScalabilityReportType;
  title: string;
  generatedAt: string;
  summary: { label: string; value: Cell }[];
  tables: ReportTable[];
  notes: string[];
}

export const REPORT_CATALOG: Record<ScalabilityReportType, { title: string; description: string }> =
  {
    'capacity-monthly': {
      title: 'Relatório mensal de capacidade',
      description: 'Uso actual vs. capacidade por recurso e o recurso mais pressionado.',
    },
    performance: {
      title: 'Relatório de performance',
      description: 'KPIs transversais classificados, endpoints lentos e percentis da API.',
    },
    growth: {
      title: 'Relatório de crescimento',
      description: 'Crescimento mensal observado de utilizadores, dados e carga.',
    },
    infrastructure: {
      title: 'Relatório de infraestrutura',
      description: 'Política de auto scaling, factos declarados e verificações de resiliência.',
    },
    costs: {
      title: 'Relatório de custos',
      description: 'Custo actual, por utilizador, por categoria e histórico mensal.',
    },
    incidents: {
      title: 'Relatório de incidentes',
      description: 'Incidentes de capacidade, estado, duração e tempo médio de resolução.',
    },
    'load-tests': {
      title: 'Relatório de testes de carga',
      description: 'Testes executados, resultados, veredictos e taxa de aprovação.',
    },
    availability: {
      title: 'Relatório de disponibilidade',
      description: 'Disponibilidade derivada dos incidentes registados, RPO/RTO e backups.',
    },
    'module-usage': {
      title: 'Relatório de utilização por módulo',
      description: 'Tráfego da API e storage agrupados por módulo.',
    },
    'capacity-planning': {
      title: 'Capacity Planning Report',
      description: 'Folga actual, datas de esgotamento e instâncias necessárias a 12 meses.',
    },
    'infrastructure-forecast': {
      title: 'Previsão de infraestrutura',
      description: 'Projecções a 3/6/12/24… meses por recurso, com confiança.',
    },
  };

const round = (n: number, d = 1) => {
  const f = 10 ** d;
  return Math.round(n * f) / f;
};
const fmtDt = (d: Date) =>
  d.toLocaleString('pt-PT', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Europe/Lisbon' });

/** Primeiro segmento da rota → módulo (ex.: "GET /courses/:id" → "courses"). */
export function moduleOfRoute(endpoint: string): string {
  const route = endpoint.split(' ').slice(1).join(' ') || endpoint;
  const seg = route.split('/').filter(Boolean)[0];
  return seg && !seg.startsWith(':') ? seg : '(raiz)';
}

@Injectable()
export class ScalabilityReportsService {
  private readonly logger = new Logger(ScalabilityReportsService.name);

  constructor(
    private readonly audit: AuditService,
    private readonly capacity: ScalabilityCapacityService,
    private readonly infra: ScalabilityInfraService,
    private readonly perf: ScalabilityIntegrationsPerfService,
    private readonly forecasts: ScalabilityForecastService,
    private readonly incidents: ScalabilityIncidentsService,
    private readonly loadTests: ScalabilityLoadTestsService,
    private readonly costs: ScalabilityCostsService,
    private readonly storage: ScalabilityStorageService,
  ) {}

  catalog() {
    return {
      reports: REPORT_TYPES.map(type => ({ type, ...REPORT_CATALOG[type] })),
      formats: ['csv', 'xlsx', 'pdf'] as ReportFormat[],
    };
  }

  async build(type: ScalabilityReportType): Promise<ScalabilityReport> {
    if (!REPORT_TYPES.includes(type)) throw new BadRequestException('Relatório desconhecido');
    const base = { type, title: REPORT_CATALOG[type].title, generatedAt: new Date().toISOString() };
    const body = await this.body(type);
    return { ...base, ...body };
  }

  private async body(
    type: ScalabilityReportType,
  ): Promise<Pick<ScalabilityReport, 'summary' | 'tables' | 'notes'>> {
    switch (type) {
      case 'capacity-monthly': {
        const c = await this.capacity.getCapacityMetrics();
        return {
          summary: [
            { label: 'Recurso mais pressionado', value: c.bottleneck?.label ?? null },
            {
              label: 'Ocupação do recurso mais pressionado (%)',
              value: c.bottleneck?.percent ?? null,
            },
            {
              label: 'Pico de utilizadores concorrentes (24h)',
              value: c.current.concurrentPeak24h,
            },
          ],
          tables: [
            {
              title: 'Recursos',
              columns: [
                'Recurso',
                'Actual',
                'Capacidade',
                'Unidade',
                'Ocupação (%)',
                'Nível',
                'Fonte',
              ],
              rows: c.resources.map(r => ({
                Recurso: r.label,
                Actual: r.current,
                Capacidade: r.capacity,
                Unidade: r.unit,
                'Ocupação (%)': r.percent,
                Nível: r.level,
                Fonte: r.source,
              })),
            },
          ],
          notes: ['Valores sem fonte (— / vazio) significam que a capacidade não está definida.'],
        };
      }

      case 'performance': {
        const [p, api] = await Promise.all([
          this.perf.getPerformanceMetrics(),
          this.infra.getApiMetrics(),
        ]);
        return {
          summary: [
            { label: 'Classificação global', value: p.overall },
            { label: 'Pedidos medidos', value: api.totals.requests },
            { label: 'P95 (ms)', value: api.totals.p95Ms },
            { label: 'P99 (ms)', value: api.totals.p99Ms },
            { label: 'Taxa de erro (%)', value: api.totals.errorRate },
          ],
          tables: [
            {
              title: 'KPIs',
              columns: ['Indicador', 'Valor', 'Unidade', 'Classificação'],
              rows: p.kpis.map(k => ({
                Indicador: k.label,
                Valor: k.value,
                Unidade: k.unit,
                Classificação: k.classification,
              })),
            },
            {
              title: 'Endpoints a vigiar',
              columns: ['Endpoint', 'P95 (ms)', 'Erros (%)', 'Estado'],
              rows: p.slowEndpoints.map(e => ({
                Endpoint: e.endpoint,
                'P95 (ms)': e.p95Ms,
                'Erros (%)': e.errorRate,
                Estado: e.status,
              })),
            },
          ],
          notes: ['Métricas desde o último arranque do processo da API (contadores em memória).'],
        };
      }

      case 'growth': {
        const f = await this.forecasts.getForecasts();
        return {
          summary: [{ label: 'Conclusão', value: f.headline }],
          tables: [
            {
              title: 'Crescimento por recurso',
              columns: [
                'Recurso',
                'Actual',
                'Unidade',
                'Crescimento mensal',
                'Meses de histórico',
                'Confiança',
              ],
              rows: f.resources.map(r => ({
                Recurso: r.label,
                Actual: r.available ? r.current : null,
                Unidade: r.unit,
                'Crescimento mensal': r.available ? r.monthlyGrowth : null,
                'Meses de histórico': r.historyMonths ?? 0,
                Confiança: r.available ? r.confidence : 'sem dados',
              })),
            },
          ],
          notes: ['Recursos com "sem dados" ainda não têm histórico suficiente para tendência.'],
        };
      }

      case 'infrastructure': {
        const [a, r] = await Promise.all([
          this.capacity.getAutoScaling(),
          this.capacity.getResilienceMetrics(),
        ]);
        const pol = a.policy;
        return {
          summary: [
            { label: 'Resiliência global', value: r.overall },
            { label: 'Pontuação de resiliência (%)', value: r.score },
            { label: 'Auto scaling activo', value: pol.enabled ? 'Sim' : 'Não' },
            { label: 'Instâncias (mín–máx)', value: `${pol.minInstances}–${pol.maxInstances}` },
          ],
          tables: [
            {
              title: 'Política de auto scaling',
              columns: ['Parâmetro', 'Valor'],
              rows: [
                { Parâmetro: 'CPU alvo (%)', Valor: pol.targetCpu },
                { Parâmetro: 'Memória alvo (%)', Valor: pol.targetMemory },
                { Parâmetro: 'Pedidos por instância', Valor: pol.requestsPerInstance },
                { Parâmetro: 'Cooldown (min)', Valor: pol.cooldownMinutes },
                { Parâmetro: 'Escala de emergência', Valor: pol.emergencyEnabled ? 'Sim' : 'Não' },
              ],
            },
            {
              title: 'Verificações de resiliência',
              columns: ['Verificação', 'Estado', 'Detalhe'],
              rows: r.checks.map(c => ({
                Verificação: c.label,
                Estado: c.status,
                Detalhe: c.detail,
              })),
            },
          ],
          notes: [r.note],
        };
      }

      case 'costs': {
        const c = await this.costs.getCosts();
        return {
          summary: [
            { label: 'Mês', value: c.month },
            { label: `Custo total (${c.currency})`, value: c.current.total },
            { label: `Custo por utilizador (${c.currency})`, value: c.current.perUser },
            {
              label: `Custo por utilizador activo (${c.currency})`,
              value: c.current.perActiveUser,
            },
            { label: 'Variação vs. mês anterior (%)', value: c.current.changePercent },
          ],
          tables: [
            {
              title: 'Por categoria',
              columns: ['Categoria', `Valor (${c.currency})`, 'Peso (%)', 'Nota'],
              rows: c.categories.map(x => ({
                Categoria: x.category,
                [`Valor (${c.currency})`]: x.amount,
                'Peso (%)': x.percent,
                Nota: x.note,
              })),
            },
            {
              title: 'Histórico mensal',
              columns: ['Mês', `Total (${c.currency})`],
              rows: c.history.map(h => ({ Mês: h.month, [`Total (${c.currency})`]: h.total })),
            },
            {
              title: 'Previsão por escalão',
              columns: ['Utilizadores', `Custo estimado (${c.currency})`],
              rows: c.projection.map(p => ({
                Utilizadores: p.users,
                [`Custo estimado (${c.currency})`]: p.estimated,
              })),
            },
          ],
          notes: [c.note],
        };
      }

      case 'incidents': {
        const i = await this.incidents.list({} as never);
        return {
          summary: [
            { label: 'Total de incidentes', value: i.summary.total },
            { label: 'Em aberto', value: i.summary.open },
            { label: 'Críticos em aberto', value: i.summary.openCritical },
            { label: 'Últimos 30 dias', value: i.summary.last30d },
            { label: 'Tempo médio de resolução (min)', value: i.summary.meanTimeToResolveMinutes },
          ],
          tables: [
            {
              title: 'Incidentes (200 mais recentes)',
              columns: [
                'Data',
                'Título',
                'Componente',
                'Severidade',
                'Estado',
                'Duração (min)',
                'Utilizadores afectados',
                'Responsável',
                'Causa raiz',
              ],
              rows: i.incidents.map(x => ({
                Data: fmtDt(new Date(x.occurredAt)),
                Título: x.title,
                Componente: x.component,
                Severidade: x.severity,
                Estado: x.status,
                'Duração (min)': x.durationMinutes,
                'Utilizadores afectados': x.affectedUsers,
                Responsável: x.ownerName,
                'Causa raiz': x.rootCause,
              })),
            },
          ],
          notes: [],
        };
      }

      case 'load-tests': {
        const t = await this.loadTests.list({} as never);
        return {
          summary: [
            { label: 'Testes registados', value: t.summary.total },
            { label: 'Concluídos', value: t.summary.completed },
            { label: 'Planeados', value: t.summary.planned },
            { label: 'Taxa de aprovação (%)', value: t.summary.passRatePercent },
            { label: 'Último teste', value: t.summary.lastTest?.name ?? null },
          ],
          tables: [
            {
              title: 'Testes de carga',
              columns: [
                'Nome',
                'Tipo',
                'Ambiente',
                'Estado',
                'Utilizadores',
                'RPS alvo',
                'RPS obtido',
                'P95 (ms)',
                'P99 (ms)',
                'Erros (%)',
                'CPU pico (%)',
                'Veredicto',
              ],
              rows: t.tests.map(x => ({
                Nome: x.name,
                Tipo: x.type,
                Ambiente: x.environment,
                Estado: x.status,
                Utilizadores: x.simulatedUsers,
                'RPS alvo': x.targetRps,
                'RPS obtido': x.results.throughputRps,
                'P95 (ms)': x.results.p95Ms,
                'P99 (ms)': x.results.p99Ms,
                'Erros (%)': x.results.errorRate,
                'CPU pico (%)': x.results.cpuPeak,
                Veredicto: x.verdict,
              })),
            },
          ],
          notes: ['Os resultados são os registados na aba Testes de Carga.'],
        };
      }

      case 'availability': {
        const [r, i] = await Promise.all([
          this.capacity.getResilienceMetrics(),
          this.incidents.list({} as never),
        ]);
        const since = Date.now() - 30 * 86_400_000;
        const outages = i.incidents.filter(
          x => new Date(x.occurredAt).getTime() >= since && x.severity === 'CRITICAL',
        );
        const downMin = outages.reduce((s, x) => s + x.durationMinutes, 0);
        const availability = round(100 - (Math.min(downMin, 43_200) / 43_200) * 100, 3);
        return {
          summary: [
            { label: 'Disponibilidade 30d (derivada de incidentes) (%)', value: availability },
            { label: 'Indisponibilidade registada 30d (min)', value: downMin },
            { label: 'RPO objectivo (min)', value: r.indicators.rpoMinutes },
            { label: 'RTO objectivo (min)', value: r.indicators.rtoMinutes },
            {
              label: 'Último backup',
              value: r.indicators.lastBackupAt ? fmtDt(new Date(r.indicators.lastBackupAt)) : null,
            },
            {
              label: 'RPO cumprido',
              value: r.indicators.rpoMet === null ? null : r.indicators.rpoMet ? 'Sim' : 'Não',
            },
          ],
          tables: [
            {
              title: 'Incidentes críticos nos últimos 30 dias',
              columns: ['Data', 'Título', 'Componente', 'Severidade', 'Duração (min)'],
              rows: outages.map(x => ({
                Data: fmtDt(new Date(x.occurredAt)),
                Título: x.title,
                Componente: x.component,
                Severidade: x.severity,
                'Duração (min)': x.durationMinutes,
              })),
            },
            {
              title: 'Verificações de resiliência',
              columns: ['Verificação', 'Estado', 'Detalhe'],
              rows: r.checks.map(c => ({
                Verificação: c.label,
                Estado: c.status,
                Detalhe: c.detail,
              })),
            },
          ],
          notes: [
            'A aplicação não mede uptime externo: a disponibilidade é calculada a partir dos minutos de incidentes CRÍTICOS registados na aba Incidentes. Sem incidentes registados = 100%, o que não prova ausência de falhas.',
          ],
        };
      }

      case 'module-usage': {
        const [api, st] = await Promise.all([
          this.infra.getApiMetrics(),
          this.storage.getStorageMetrics(),
        ]);
        const mods = new Map<string, { requests: number; errors5xx: number; weighted: number }>();
        for (const e of api.endpoints) {
          const m = moduleOfRoute(e.endpoint);
          const cur = mods.get(m) ?? { requests: 0, errors5xx: 0, weighted: 0 };
          cur.requests += e.requests;
          cur.errors5xx += e.errors5xx;
          cur.weighted += e.avgMs * e.requests;
          mods.set(m, cur);
        }
        const total = [...mods.values()].reduce((s, m) => s + m.requests, 0);
        return {
          summary: [
            { label: 'Módulos com tráfego', value: mods.size },
            { label: 'Pedidos medidos', value: total },
            { label: 'Storage usado (GB)', value: st.usedGb },
          ],
          tables: [
            {
              title: 'Tráfego da API por módulo',
              columns: ['Módulo', 'Pedidos', 'Peso (%)', 'Latência média (ms)', 'Erros 5xx'],
              rows: [...mods.entries()]
                .sort((a, b) => b[1].requests - a[1].requests)
                .map(([m, v]) => ({
                  Módulo: m,
                  Pedidos: v.requests,
                  'Peso (%)': total ? round((v.requests / total) * 100) : 0,
                  'Latência média (ms)': v.requests ? round(v.weighted / v.requests) : 0,
                  'Erros 5xx': v.errors5xx,
                })),
            },
            {
              title: 'Storage por módulo',
              columns: ['Módulo', 'Ficheiros', 'MB', 'Peso (%)'],
              rows: st.byModule.map(m => ({
                Módulo: m.label,
                Ficheiros: m.files,
                MB: m.mb,
                'Peso (%)': m.percent,
              })),
            },
          ],
          notes: [
            'Tráfego agrupado pelo primeiro segmento da rota, desde o último arranque da API; só os 50 endpoints mais usados são medidos.',
            st.note,
          ],
        };
      }

      case 'capacity-planning': {
        const [c, f] = await Promise.all([
          this.capacity.getCapacityMetrics(),
          this.forecasts.getForecasts(),
        ]);
        return {
          summary: [
            { label: 'Conclusão', value: f.headline },
            { label: 'Instâncias actuais', value: f.infraNeeds.currentInstances },
            { label: 'Instâncias necessárias (CPU, 12m)', value: f.infraNeeds.instancesForCpu12m },
            { label: 'Instâncias necessárias (RAM, 12m)', value: f.infraNeeds.instancesForRam12m },
          ],
          tables: [
            {
              title: 'Folga actual',
              columns: ['Recurso', 'Ocupação (%)', 'Nível'],
              rows: c.resources.map(r => ({
                Recurso: r.label,
                'Ocupação (%)': r.percent,
                Nível: r.level,
              })),
            },
            {
              title: 'Esgotamento previsto',
              columns: ['Recurso', 'Atinge 80%', 'Atinge 100%', 'Confiança'],
              rows: f.resources.map(r => ({
                Recurso: r.label,
                'Atinge 80%': r.available ? (r.reach80?.label ?? 'fora do horizonte') : 'sem dados',
                'Atinge 100%': r.available
                  ? (r.reach100?.label ?? 'fora do horizonte')
                  : 'sem dados',
                Confiança: r.available ? r.confidence : null,
              })),
            },
          ],
          notes: ['Extrapolação do histórico real; confiança baixa com poucos meses de dados.'],
        };
      }

      case 'infrastructure-forecast': {
        const f = await this.forecasts.getForecasts();
        const horizons = f.resources.find(r => r.available)?.projections.map(p => p.months) ?? [];
        return {
          summary: [{ label: 'Conclusão', value: f.headline }],
          tables: [
            {
              title: 'Projecções',
              columns: [
                'Recurso',
                'Unidade',
                'Actual',
                ...horizons.map(h => `+${h} meses`),
                'Confiança',
              ],
              rows: f.resources.map(r => {
                const row: Row = {
                  Recurso: r.label,
                  Unidade: r.unit,
                  Actual: r.available ? r.current : null,
                  Confiança: r.available ? r.confidence : 'sem dados',
                };
                for (const h of horizons) {
                  row[`+${h} meses`] = r.available
                    ? (r.projections.find(p => p.months === h)?.value ?? null)
                    : null;
                }
                return row;
              }),
            },
          ],
          notes: [
            'Projecções lineares/compostas sobre o histórico mensal; não consideram eventos futuros.',
          ],
        };
      }
    }
  }

  // ─── exportação ───────────────────────────────────────────────────────────

  async export(
    type: ScalabilityReportType,
    format: ReportFormat,
    actorId: number,
  ): Promise<{ buffer: Buffer; mimeType: string; fileName: string }> {
    const report = await this.build(type);
    const stamp = new Date().toISOString().slice(0, 10);
    const fileName = `scalability-${type}-${stamp}.${format}`;
    const out = await this.render(report, format);

    await this.audit
      .logEntity(actorId, 'SCALABILITY_REPORT_EXPORT', 'ScalabilityReport', type, {
        report: type,
        title: report.title,
        format,
        fileName,
        sizeBytes: out.buffer.length,
        rows: report.tables.reduce((s, t) => s + t.rows.length, 0),
      })
      .catch(err =>
        this.logger.warn(`Auditoria falhou: ${err instanceof Error ? err.message : err}`),
      );
    return { ...out, fileName };
  }

  private async render(report: ScalabilityReport, format: ReportFormat) {
    const cell = (v: unknown) => (v === null || v === undefined ? '' : String(v));

    if (format === 'csv') {
      const esc = (v: unknown) => {
        let s = cell(v);
        // Neutraliza injecção de fórmulas em Excel/LibreOffice.
        if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
        return /[",\n\r;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
      };
      const lines: string[] = [
        esc(report.title),
        `${esc('Gerado em')},${esc(fmtDt(new Date(report.generatedAt)))}`,
        '',
        ...report.summary.map(s => `${esc(s.label)},${esc(s.value)}`),
      ];
      for (const t of report.tables) {
        lines.push('', esc(t.title), t.columns.map(esc).join(','));
        for (const r of t.rows) lines.push(t.columns.map(c => esc(r[c])).join(','));
      }
      if (report.notes.length) lines.push('', ...report.notes.map(n => esc(`Nota: ${n}`)));
      return {
        buffer: Buffer.from('﻿' + lines.join('\r\n'), 'utf8'),
        mimeType: 'text/csv; charset=utf-8',
      };
    }

    if (format === 'xlsx') {
      const wb = new ExcelJS.Workbook();
      const sum = wb.addWorksheet('Resumo');
      sum.columns = [{ width: 52 }, { width: 40 }];
      sum.addRow([report.title]).font = { bold: true, size: 14 };
      sum.addRow(['Gerado em', fmtDt(new Date(report.generatedAt))]);
      sum.addRow([]);
      for (const s of report.summary) sum.addRow([s.label, s.value ?? '']);
      if (report.notes.length) {
        sum.addRow([]);
        for (const n of report.notes) sum.addRow([`Nota: ${n}`]);
      }
      const used = new Set<string>(['Resumo']);
      for (const t of report.tables) {
        let name = t.title.replace(/[\\/?*[\]:]/g, ' ').slice(0, 31) || 'Dados';
        for (let n = 2; used.has(name); n++) name = `${name.slice(0, 28)} ${n}`;
        used.add(name);
        const ws = wb.addWorksheet(name);
        ws.columns = t.columns.map(h => ({ header: h, key: h, width: 22 }));
        ws.getRow(1).font = { bold: true };
        for (const r of t.rows) ws.addRow(t.columns.map(c => r[c] ?? ''));
      }
      return {
        buffer: Buffer.from(await wb.xlsx.writeBuffer()),
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      };
    }

    const buffer = await new Promise<Buffer>((resolve, reject) => {
      const doc = new PDFDocument({ margin: 36, size: 'A4', layout: 'landscape' });
      const chunks: Buffer[] = [];
      doc.on('data', (d: Buffer) => chunks.push(d));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);
      const left = doc.page.margins.left;
      const width = doc.page.width - left - doc.page.margins.right;

      doc.fontSize(16).font('Helvetica-Bold').text(report.title);
      doc
        .fontSize(8)
        .font('Helvetica')
        .fillColor('#666')
        .text(`Gerado em ${fmtDt(new Date(report.generatedAt))}`)
        .fillColor('#000')
        .moveDown(0.6);

      for (const s of report.summary) {
        doc.font('Helvetica-Bold').fontSize(9).text(`${s.label}: `, { continued: true });
        doc.font('Helvetica').text(cell(s.value));
      }

      for (const t of report.tables) {
        doc.moveDown(0.8).font('Helvetica-Bold').fontSize(11).text(t.title);
        doc.moveDown(0.2);
        const colW = width / Math.max(t.columns.length, 1);
        const drawRow = (values: string[], bold: boolean) => {
          doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(7);
          const h = Math.max(...values.map(v => doc.heightOfString(v, { width: colW - 4 })), 10);
          if (doc.y + h > doc.page.height - doc.page.margins.bottom) doc.addPage();
          const top = doc.y;
          values.forEach((v, i) => doc.text(v, left + i * colW, top, { width: colW - 4 }));
          doc.y = top + h + 3;
        };
        drawRow(t.columns, true);
        for (const r of t.rows)
          drawRow(
            t.columns.map(c => cell(r[c])),
            false,
          );
      }
      if (report.notes.length) {
        doc.moveDown(0.8).font('Helvetica-Oblique').fontSize(8).fillColor('#555');
        for (const n of report.notes) doc.text(`Nota: ${n}`, left, doc.y, { width });
      }
      doc.end();
    });
    return { buffer, mimeType: 'application/pdf' };
  }
}
