// src/executive-reports/executive-reports.builder.service.ts
// Monta o conteúdo dos relatórios (docs/Executive_Reports.md §7 e §8). Cada
// secção é uma tabela normalizada (colunas + linhas) calculada a partir dos
// serviços de KPI/gráficos já existentes — nunca com fórmulas próprias — para
// que PDF/Excel/CSV e a pré-visualização partilhem exactamente os mesmos dados.
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  ExecutiveReportsMetricsService,
  type ResolvedFilters,
} from './executive-reports.metrics.service';
import { ExecutiveReportsChartsService } from './executive-reports.charts.service';
import { ExecutiveReportsAlertsService } from './executive-reports.alerts.service';
import { PRIMARY_KPI_CODES, type KpiCode } from './executive-reports.kpi-catalog';
import { SECTION_CATALOG, type SectionKey } from './executive-reports.templates';
import type { CurrentUserData } from '../common/decorators';

export interface ReportColumn {
  key: string;
  label: string;
}

export interface ReportSection {
  key: SectionKey;
  title: string;
  sourceModules: string[];
  columns: ReportColumn[];
  rows: Record<string, string | number | null>[];
  note?: string;
}

export interface BuildOptions {
  sections: SectionKey[];
  kpiCodes?: KpiCode[];
  /** ADMIN/DIRECTOR: pode ver secções sensíveis (custos, integrações). */
  canSeeRestricted: boolean;
  /** GESTOR/LIDER: âmbito limitado ao departamento; secções de toda a organização são omitidas. */
  scoped: boolean;
  user: CurrentUserData | null;
  /** Ordenação e agrupamento do relatório personalizado (§8.6). */
  sortBy?: string;
  sortDir?: 'asc' | 'desc';
}

const NO_DATA = 'Sem dados';
const round1 = (n: number) => Math.round(n * 10) / 10;
const fmt = (v: number | null | undefined) => (v === null || v === undefined ? NO_DATA : v);

const STATE_LABEL: Record<string, string> = {
  ON_TARGET: 'Dentro da meta',
  WARNING: 'Em alerta',
  CRITICAL: 'Crítico',
  NO_TARGET: 'Sem meta',
  NO_DATA: 'Sem dados',
};

const col = (key: string, label: string): ReportColumn => ({ key, label });
const METRIC_COLS = [
  col('indicator', 'Indicador'),
  col('value', 'Valor'),
  col('detail', 'Detalhe'),
];

@Injectable()
export class ExecutiveReportsBuilderService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly metrics: ExecutiveReportsMetricsService,
    private readonly charts: ExecutiveReportsChartsService,
    private readonly alerts: ExecutiveReportsAlertsService,
  ) {}

  async build(f: ResolvedFilters, opts: BuildOptions) {
    const memo = new Map<string, Promise<unknown>>();
    const once = <T>(key: string, fn: () => Promise<T>): Promise<T> => {
      if (!memo.has(key)) memo.set(key, fn());
      return memo.get(key) as Promise<T>;
    };
    const ctx = {
      f,
      supp: () => once('supp', () => this.metrics.computeSupplementary(f)),
      depts: () => once('depts', () => this.charts.departments(f)),
      goals: () => once('goals', () => this.charts.goals(f)),
      kpis: (codes: KpiCode[]) =>
        once(`kpis:${codes.join(',')}`, () => this.metrics.computeKpis(f, codes)),
    };

    const sections: ReportSection[] = [];
    const omitted: { key: SectionKey; reason: string }[] = [];

    for (const key of [...new Set(opts.sections)]) {
      const def = SECTION_CATALOG[key];
      if (!def) continue;
      if (def.restricted && !opts.canSeeRestricted) {
        omitted.push({ key, reason: 'Dados restritos (ADMIN/DIRECTOR)' });
        continue;
      }
      if (def.organizationWide && opts.scoped) {
        omitted.push({ key, reason: 'Dados de toda a organização — fora do seu âmbito' });
        continue;
      }
      const built = await this.section(key, ctx, opts);
      sections.push(this.sort(built, opts));
    }

    const sourceModules = [...new Set(sections.flatMap(s => s.sourceModules))].sort();
    return { sections, omitted, sourceModules };
  }

  private sort(s: ReportSection, opts: BuildOptions): ReportSection {
    if (!opts.sortBy || !s.columns.some(c => c.key === opts.sortBy)) return s;
    const dir = opts.sortDir === 'desc' ? -1 : 1;
    const key = opts.sortBy;
    const rows = [...s.rows].sort((a, b) => {
      const x = a[key];
      const y = b[key];
      if (typeof x === 'number' && typeof y === 'number') return (x - y) * dir;
      return String(x ?? '').localeCompare(String(y ?? ''), 'pt') * dir;
    });
    return { ...s, rows };
  }

  private async section(
    key: SectionKey,
    ctx: {
      f: ResolvedFilters;
      supp: () => Promise<
        Awaited<ReturnType<ExecutiveReportsMetricsService['computeSupplementary']>>
      >;
      depts: () => Promise<Awaited<ReturnType<ExecutiveReportsChartsService['departments']>>>;
      goals: () => Promise<Awaited<ReturnType<ExecutiveReportsChartsService['goals']>>>;
      kpis: (
        codes: KpiCode[],
      ) => Promise<Awaited<ReturnType<ExecutiveReportsMetricsService['computeKpis']>>>;
    },
    opts: BuildOptions,
  ): Promise<ReportSection> {
    const def = SECTION_CATALOG[key];
    const base = { key, title: def.title, sourceModules: def.sourceModules };
    const empty = (columns: ReportColumn[], note = NO_DATA): ReportSection => ({
      ...base,
      columns,
      rows: [],
      note,
    });
    const metricRows = (rows: [string, string | number | null, string?][]): ReportSection => ({
      ...base,
      columns: METRIC_COLS,
      rows: rows.map(([indicator, value, detail]) => ({
        indicator,
        value: fmt(value as number | null),
        detail: detail ?? '',
      })),
    });

    switch (key) {
      case 'kpis': {
        const codes = opts.kpiCodes?.length ? opts.kpiCodes : PRIMARY_KPI_CODES;
        const kpis = await ctx.kpis(codes);
        return {
          ...base,
          columns: [
            col('indicator', 'Indicador'),
            col('value', 'Valor'),
            col('unit', 'Unidade'),
            col('previous', 'Período anterior'),
            col('change', 'Variação'),
            col('target', 'Meta'),
            col('state', 'Estado'),
            col('source', 'Origem'),
          ],
          rows: kpis.map(k => ({
            indicator: k.name,
            value: fmt(k.value),
            unit: k.unit,
            previous: fmt(k.previousValue),
            change: fmt(k.change),
            target: k.target ?? 'Sem meta',
            state: STATE_LABEL[k.state] ?? k.state,
            source: k.sourceModules.join(', '),
          })),
        };
      }

      case 'goals': {
        const g = await ctx.goals();
        return {
          ...base,
          columns: [
            col('indicator', 'Indicador'),
            col('actual', 'Realizado'),
            col('target', 'Meta'),
            col('deviation', 'Desvio'),
          ],
          rows: [
            ...g.vsTarget.map(v => ({
              indicator: v.label,
              actual: `${v.actual}${v.unit === '%' ? '%' : ''}`,
              target: `${v.target}${v.unit === '%' ? '%' : ''}`,
              deviation: fmt(v.deviation),
            })),
            ...g.execution.map(e => ({
              indicator: e.label,
              actual: `${e.done} / ${e.total}`,
              target: 'Execução',
              deviation: e.pct === null ? NO_DATA : `${e.pct}%`,
            })),
          ],
        };
      }

      case 'workforce': {
        const { workforce: w } = await ctx.supp();
        return {
          ...base,
          columns: [
            col('dimension', 'Dimensão'),
            col('category', 'Categoria'),
            col('total', 'Colaboradores'),
          ],
          rows: [
            { dimension: 'Total', category: 'Colaboradores activos', total: w.total },
            ...w.byDepartment.map(d => ({
              dimension: 'Departamento',
              category: d.label,
              total: d.value,
            })),
            ...w.byPosition.map(d => ({ dimension: 'Cargo', category: d.label, total: d.value })),
            ...w.byContractType.map(d => ({
              dimension: 'Vínculo',
              category: d.label,
              total: d.value,
            })),
          ],
        };
      }

      case 'movements': {
        const { workforce: w } = await ctx.supp();
        return metricRows([
          ['Admissões', w.hires, 'No período'],
          ['Saídas', w.exits, 'No período'],
          ['Saldo líquido', w.netBalance, 'Admissões − saídas'],
          ['Rotatividade (12 meses)', w.turnoverLast12Months, '%'],
        ]);
      }

      case 'training': {
        const { training: t } = await ctx.supp();
        const [k] = await ctx.kpis(['TRAINING_COMPLETION']);
        return metricRows([
          ['Taxa de conclusão', k?.value ?? null, '% de inscrições elegíveis concluídas'],
          ['Inscrições elegíveis', t.enrollmentsEligible, 'Criadas no período'],
          ['Inscrições concluídas', t.enrollmentsCompleted, ''],
          ['Participantes', t.participants, 'Colaboradores distintos'],
          ['Horas de formação', t.hours, 'Carga horária dos cursos concluídos'],
        ]);
      }

      case 'performance': {
        const { performance: p } = await ctx.supp();
        const [k] = await ctx.kpis(['PERFORMANCE']);
        return metricRows([
          ['Metas alcançadas', k?.value ?? null, '% de progresso médio das metas'],
          ['Avaliações previstas', p.reviewsTotal, ''],
          ['Avaliações concluídas', p.reviewsCompleted, ''],
          ['Avaliações concluídas (%)', p.completionPct, ''],
        ]);
      }

      case 'competencies': {
        const { competencies: c } = await ctx.supp();
        return metricRows([
          ['Colaboradores com competências avaliadas', c.collaboratorsEvaluated, ''],
          ['Competências avaliadas (%)', c.evaluatedPct, '% dos colaboradores activos'],
          ['Lacunas identificadas', c.gapsIdentified, 'Nível actual abaixo do nível alvo'],
        ]);
      }

      case 'pdi': {
        const { development: d } = await ctx.supp();
        return metricRows([
          ['Planos activos', d.activePlans, ''],
          ['Acções atrasadas', d.overdueActions, 'Prazo ultrapassado e não concluídas'],
        ]);
      }

      case 'onboarding': {
        const { onboarding: o } = await ctx.supp();
        return metricRows([
          ['Planos em curso', o.inProgress, ''],
          ['Planos concluídos', o.completed, ''],
        ]);
      }

      case 'attendance': {
        const [k] = await ctx.kpis(['ATTENDANCE']);
        const { departments } = await ctx.depts();
        return {
          ...base,
          columns: [
            col('scope', 'Âmbito'),
            col('presence', 'Presença (%)'),
            col('absenteeism', 'Absentismo (%)'),
          ],
          rows: [
            {
              scope: 'Global',
              presence: fmt(k?.value),
              absenteeism: k?.value == null ? NO_DATA : round1(100 - k.value),
            },
            ...departments.map(d => ({
              scope: d.name,
              presence: d.absenteeism === null ? NO_DATA : round1(100 - d.absenteeism),
              absenteeism: fmt(d.absenteeism),
            })),
          ],
        };
      }

      case 'leave': {
        const { leave: l, pending } = await ctx.supp();
        return metricRows([
          ['Ausências em curso', l.inCourse, 'Aprovadas, a decorrer'],
          ['Pedidos pendentes', l.pending, ''],
          ['Aprovações pendentes', pending.pendingLeaveApprovals, ''],
        ]);
      }

      case 'costs':
        return this.costs(base, ctx.f);

      case 'departments': {
        const { departments } = await ctx.depts();
        return {
          ...base,
          columns: [
            col('department', 'Departamento'),
            col('headcount', 'Colaboradores'),
            col('performance', 'Desempenho (%)'),
            col('training', 'Formação (%)'),
            col('absenteeism', 'Absentismo (%)'),
            col('turnover', 'Rotatividade (%)'),
            col('overduePdi', 'Acções PDI atrasadas'),
          ],
          rows: departments.map(d => ({
            department: d.name,
            headcount: d.headcount,
            performance: fmt(d.performance),
            training: fmt(d.trainingCompletion),
            absenteeism: fmt(d.absenteeism),
            turnover: fmt(d.turnover),
            overduePdi: d.overduePdi,
          })),
        };
      }

      case 'processes':
        return this.processes(base, ctx.f);

      case 'compliance':
        return this.compliance(base, ctx);

      case 'integrations':
        return this.integrations(base);

      case 'alerts': {
        const rows = await this.alerts.topActive(opts.user);
        if (rows.length === 0) {
          return empty([col('severity', 'Gravidade')], 'Sem alertas em aberto');
        }
        return {
          ...base,
          columns: [
            col('severity', 'Gravidade'),
            col('title', 'Alerta'),
            col('source', 'Origem'),
            col('owner', 'Responsável'),
            col('dueDate', 'Prazo'),
            col('status', 'Estado'),
          ],
          rows: rows.map(a => ({
            severity: a.severity,
            title: a.title,
            source: a.sourceModule,
            owner: a.owner?.fullName ?? 'Por atribuir',
            dueDate: a.dueDate ? a.dueDate.toISOString().slice(0, 10) : '',
            status: a.status,
          })),
        };
      }
    }
  }

  // ─── Secções com consultas próprias ───────────────────────────────────────

  /** Custos de pessoal: soma das folhas emitidas dos meses do período (acesso restrito). */
  private async costs(
    base: Pick<ReportSection, 'key' | 'title' | 'sourceModules'>,
    f: ResolvedFilters,
  ): Promise<ReportSection> {
    const months = this.monthsBetween(f.current.start, f.current.end);
    const scope = this.metrics.userScope(f);
    const payslips = await this.prisma.read.payslip.findMany({
      where: { period: { in: months }, status: { not: 'DRAFT' }, user: scope },
      select: {
        period: true,
        userId: true,
        grossSalary: true,
        netSalary: true,
        totalEmployerCost: true,
      },
    });
    const columns = [
      col('period', 'Mês'),
      col('employees', 'Colaboradores'),
      col('gross', 'Salário bruto'),
      col('net', 'Salário líquido'),
      col('employerCost', 'Custo total do empregador'),
    ];
    if (payslips.length === 0) {
      return {
        ...base,
        columns,
        rows: [],
        note: 'Sem dados: não existem recibos emitidos no período',
      };
    }
    const byMonth = new Map<string, typeof payslips>();
    for (const p of payslips) byMonth.set(p.period, [...(byMonth.get(p.period) ?? []), p]);
    const sum = (rows: typeof payslips, k: 'grossSalary' | 'netSalary' | 'totalEmployerCost') =>
      round1(rows.reduce((s, r) => s + r[k], 0));
    const rows = [...byMonth.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([period, rs]) => ({
        period,
        employees: new Set(rs.map(r => r.userId)).size,
        gross: sum(rs, 'grossSalary'),
        net: sum(rs, 'netSalary'),
        employerCost: sum(rs, 'totalEmployerCost'),
      }));
    const people = new Set(payslips.map(p => p.userId)).size;
    const totalCost = sum(payslips, 'totalEmployerCost');
    rows.push({
      period: 'Total',
      employees: people,
      gross: sum(payslips, 'grossSalary'),
      net: sum(payslips, 'netSalary'),
      employerCost: totalCost,
    });
    return {
      ...base,
      columns,
      rows,
      note: `Custo médio por colaborador no período: ${people > 0 ? round1(totalCost / people) : NO_DATA}`,
    };
  }

  private monthsBetween(start: Date, end: Date): string[] {
    const out: string[] = [];
    const limit = end > new Date() ? new Date() : end;
    const d = new Date(start.getFullYear(), start.getMonth(), 1);
    while (d <= limit && out.length < 60) {
      out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
      d.setMonth(d.getMonth() + 1);
    }
    return out;
  }

  private async processes(
    base: Pick<ReportSection, 'key' | 'title' | 'sourceModules'>,
    f: ResolvedFilters,
  ): Promise<ReportSection> {
    const now = new Date();
    const range = { gte: f.current.start, lte: f.current.end };
    const [started, completed, inProgress, overdue, completedRows] = await Promise.all([
      this.prisma.read.processInstance.count({ where: { startedAt: range } }),
      this.prisma.read.processInstance.count({
        where: { status: 'COMPLETED', completedAt: range },
      }),
      this.prisma.read.processInstance.count({ where: { status: 'IN_PROGRESS' } }),
      this.prisma.read.processInstance.count({
        where: { status: 'IN_PROGRESS', slaDeadline: { lt: now } },
      }),
      this.prisma.read.processInstance.findMany({
        where: { status: 'COMPLETED', completedAt: range },
        select: { startedAt: true, completedAt: true },
        take: 5000,
      }),
    ]);
    const days = completedRows
      .filter(r => r.completedAt)
      .map(r => ((r.completedAt as Date).getTime() - r.startedAt.getTime()) / 86_400_000);
    const avg = days.length ? round1(days.reduce((s, d) => s + d, 0) / days.length) : null;
    return {
      ...base,
      columns: METRIC_COLS,
      rows: [
        ['Processos iniciados', started, 'No período'],
        ['Processos concluídos', completed, 'No período'],
        [
          'Taxa de conclusão (%)',
          started > 0 ? round1((completed / started) * 100) : null,
          'Concluídos ÷ iniciados',
        ],
        ['Processos em curso', inProgress, 'Estado actual'],
        ['Processos com SLA ultrapassado', overdue, 'Em curso com prazo vencido'],
        ['Duração média (dias)', avg, 'Dos concluídos no período'],
      ].map(([indicator, value, detail]) => ({
        indicator: indicator as string,
        value: fmt(value as number | null),
        detail: detail as string,
      })),
    };
  }

  private async compliance(
    base: Pick<ReportSection, 'key' | 'title' | 'sourceModules'>,
    ctx: {
      f: ResolvedFilters;
      supp: () => Promise<
        Awaited<ReturnType<ExecutiveReportsMetricsService['computeSupplementary']>>
      >;
    },
  ): Promise<ReportSection> {
    const now = new Date();
    const in30 = new Date(now.getTime() + 30 * 86_400_000);
    const docWhere = { status: 'ACTIVE' as const, deletedAt: null };
    const [expiring, expired, supp] = await Promise.all([
      this.prisma.read.employeeDocument.count({
        where: { ...docWhere, expiresAt: { gte: now, lte: in30 } },
      }),
      this.prisma.read.employeeDocument.count({ where: { ...docWhere, expiresAt: { lt: now } } }),
      ctx.supp(),
    ]);
    return {
      ...base,
      columns: METRIC_COLS,
      rows: [
        ['Documentos a vencer (30 dias)', expiring, 'Documentos de colaboradores'],
        ['Documentos vencidos', expired, 'Ainda activos'],
        [
          'Formações obrigatórias em atraso',
          supp.pending.overdueMandatoryTraining,
          'Prazo ultrapassado',
        ],
        ['Aprovações de ausência pendentes', supp.pending.pendingLeaveApprovals, ''],
        ['Acções de PDI atrasadas', supp.pending.overdueActions, ''],
      ].map(([indicator, value, detail]) => ({
        indicator: indicator as string,
        value: value as number,
        detail: detail as string,
      })),
    };
  }

  private async integrations(
    base: Pick<ReportSection, 'key' | 'title' | 'sourceModules'>,
  ): Promise<ReportSection> {
    const rows = await this.prisma.read.integrationConfig.findMany({
      orderBy: { name: 'asc' },
      take: 200,
      select: {
        name: true,
        status: true,
        isActive: true,
        lastSyncAt: true,
        lastSyncStatus: true,
        lastSyncError: true,
      },
    });
    return {
      ...base,
      columns: [
        col('name', 'Integração'),
        col('status', 'Estado'),
        col('lastSync', 'Última sincronização'),
        col('lastResult', 'Resultado'),
        col('error', 'Erro'),
      ],
      rows: rows.map(r => ({
        name: r.name,
        status: r.isActive ? r.status : 'INACTIVE',
        lastSync: r.lastSyncAt ? r.lastSyncAt.toISOString() : 'Nunca',
        lastResult: r.lastSyncStatus ?? NO_DATA,
        error: r.lastSyncError ?? '',
      })),
      note: rows.length === 0 ? 'Sem integrações configuradas' : undefined,
    };
  }
}
