// src/process-standard/process-overview.ts
// Agregação da "Visão Geral" do módulo Processes (docs/Modulo_Processes.md §3).
// Funções puras sobre linhas já filtradas — sem acesso à BD — para o
// service só ter de as ir buscar e para a lógica de métricas ser testável.
//
// "Processo" na especificação = instância em execução (ProcessInstance);
// ProcessStandard é o modelo/definição. Definições das métricas:
//  - total        → instâncias iniciadas no período (todas, se sem período)
//  - running      → IN_PROGRESS
//  - overdue      → IN_PROGRESS com slaDeadline ultrapassado
//  - completed    → COMPLETED
//  - avgDuration  → média (startedAt→completedAt) só de COMPLETED; exclui
//                   cancelados e suspensos
//  - onTimeRate   → COMPLETED com completedAt ≤ slaDeadline, sobre os
//                   COMPLETED que têm slaDeadline

export interface OverviewInstanceRow {
  status: string;
  startedAt: Date;
  completedAt: Date | null;
  slaDeadline: Date | null;
  sourceModule: string | null;
  process: {
    category: string | null;
    department: { id: number; name: string } | null;
  };
}

export interface OverviewStepRow {
  status: string;
  slaDeadline: Date | null;
  completedAt: Date | null;
  step: {
    id: number;
    title: string;
    type: string;
    responsible: { id: number; fullName: string } | null;
  };
}

export const OVERVIEW_DEFINITIONS = {
  total: 'Instâncias iniciadas no período seleccionado.',
  running: 'Instâncias com estado IN_PROGRESS.',
  overdue: 'Instâncias em execução cujo prazo (SLA) já foi ultrapassado.',
  completed: 'Instâncias concluídas.',
  pendingApprovals: 'Modelos em revisão + etapas de revisão (REVIEW) pendentes de decisão.',
  avgDurationHours:
    'Média de duração (início → conclusão) das instâncias concluídas; exclui canceladas e suspensas.',
  onTimeRate: 'Concluídas dentro do prazo / concluídas com prazo definido.',
} as const;

const HOUR_MS = 3_600_000;
const MAX_MONTHS = 12;
const DUE_SOON_HOURS = 48;

const monthKey = (d: Date) =>
  `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;

const round1 = (n: number) => Math.round(n * 10) / 10;

function avg(values: number[]): number | null {
  if (values.length === 0) return null;
  return round1(values.reduce((a, b) => a + b, 0) / values.length);
}

function countBy<T>(rows: T[], key: (r: T) => string): Array<{ label: string; count: number }> {
  const map = new Map<string, number>();
  for (const r of rows) map.set(key(r), (map.get(key(r)) ?? 0) + 1);
  return [...map.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count);
}

export function buildOverview(
  instances: OverviewInstanceRow[],
  steps: OverviewStepRow[],
  pendingTemplateReviews: number,
  now: Date = new Date(),
) {
  const completed = instances.filter(i => i.status === 'COMPLETED');
  const running = instances.filter(i => i.status === 'IN_PROGRESS');
  const overdue = running.filter(i => i.slaDeadline && i.slaDeadline < now);

  const durationOf = (i: OverviewInstanceRow) =>
    i.completedAt ? (i.completedAt.getTime() - i.startedAt.getTime()) / HOUR_MS : null;

  const durations = completed.map(durationOf).filter((n): n is number => n !== null);

  const withSla = completed.filter(i => i.slaDeadline && i.completedAt);
  const onTime = withSla.filter(i => i.completedAt! <= i.slaDeadline!);

  // ── Séries mensais (criados × concluídos, cumprimento de prazo) ────────
  const months = new Set<string>();
  const created = new Map<string, number>();
  const done = new Map<string, number>();
  const doneWithSla = new Map<string, number>();
  const doneOnTime = new Map<string, number>();
  for (const i of instances) {
    const k = monthKey(i.startedAt);
    months.add(k);
    created.set(k, (created.get(k) ?? 0) + 1);
  }
  for (const i of completed) {
    if (!i.completedAt) continue;
    const k = monthKey(i.completedAt);
    months.add(k);
    done.set(k, (done.get(k) ?? 0) + 1);
    if (i.slaDeadline) {
      doneWithSla.set(k, (doneWithSla.get(k) ?? 0) + 1);
      if (i.completedAt <= i.slaDeadline) doneOnTime.set(k, (doneOnTime.get(k) ?? 0) + 1);
    }
  }
  const monthList = [...months].sort().slice(-MAX_MONTHS);

  // ── Duração média por tipo (categoria) ─────────────────────────────────
  const byTypeDur = new Map<string, number[]>();
  for (const i of completed) {
    const d = durationOf(i);
    if (d === null) continue;
    const k = i.process.category ?? 'Sem categoria';
    byTypeDur.set(k, [...(byTypeDur.get(k) ?? []), d]);
  }

  // ── Etapas com mais atrasos ────────────────────────────────────────────
  // Atrasada = pendente fora do prazo, ou concluída depois do prazo.
  const lateByStep = new Map<number, { title: string; count: number }>();
  for (const s of steps) {
    if (!s.slaDeadline) continue;
    const late =
      s.status === 'PENDING'
        ? s.slaDeadline < now
        : s.status === 'COMPLETED' && !!s.completedAt && s.completedAt > s.slaDeadline;
    if (!late) continue;
    const prev = lateByStep.get(s.step.id);
    lateByStep.set(s.step.id, { title: s.step.title, count: (prev?.count ?? 0) + 1 });
  }

  // ── Carga por responsável (etapas pendentes) ───────────────────────────
  const workload = new Map<number, { label: string; count: number }>();
  for (const s of steps) {
    if (s.status !== 'PENDING' || !s.step.responsible) continue;
    const r = s.step.responsible;
    workload.set(r.id, { label: r.fullName, count: (workload.get(r.id)?.count ?? 0) + 1 });
  }

  const pendingReviewSteps = steps.filter(
    s => s.status === 'PENDING' && s.step.type === 'REVIEW',
  ).length;

  // ── Alertas (aba "Visão Geral": indicadores, alertas e resumo) ─────────
  const soonLimit = new Date(now.getTime() + DUE_SOON_HOURS * HOUR_MS);
  const dueSoonSteps = steps.filter(
    s =>
      s.status === 'PENDING' && s.slaDeadline && s.slaDeadline >= now && s.slaDeadline <= soonLimit,
  ).length;
  const overdueSteps = steps.filter(
    s => s.status === 'PENDING' && s.slaDeadline && s.slaDeadline < now,
  ).length;
  const alerts: Array<{ level: 'danger' | 'warning' | 'info'; message: string; count: number }> =
    [];
  if (overdue.length) {
    alerts.push({ level: 'danger', message: 'Processos em atraso', count: overdue.length });
  }
  if (overdueSteps) {
    alerts.push({
      level: 'danger',
      message: 'Etapas pendentes fora do prazo',
      count: overdueSteps,
    });
  }
  if (dueSoonSteps) {
    alerts.push({
      level: 'warning',
      message: `Etapas a vencer nas próximas ${DUE_SOON_HOURS}h`,
      count: dueSoonSteps,
    });
  }
  const pendingApprovals = pendingTemplateReviews + pendingReviewSteps;
  if (pendingApprovals) {
    alerts.push({
      level: 'info',
      message: 'Aprovações pendentes de decisão',
      count: pendingApprovals,
    });
  }

  return {
    alerts,
    kpis: {
      total: instances.length,
      running: running.length,
      overdue: overdue.length,
      completed: completed.length,
      pendingApprovals,
      avgDurationHours: avg(durations),
      onTimeRate: withSla.length ? round1((onTime.length / withSla.length) * 100) : null,
    },
    charts: {
      byStatus: countBy(instances, i => i.status),
      createdVsCompleted: monthList.map(m => ({
        month: m,
        created: created.get(m) ?? 0,
        completed: done.get(m) ?? 0,
      })),
      bySourceModule: countBy(instances, i => i.sourceModule ?? 'Não indicado'),
      byDepartment: countBy(instances, i => i.process.department?.name ?? 'Sem departamento'),
      avgDurationByType: [...byTypeDur.entries()]
        .map(([label, v]) => ({ label, hours: avg(v) ?? 0 }))
        .sort((a, b) => b.hours - a.hours),
      onTimeRateByMonth: monthList.map(m => ({
        month: m,
        rate: doneWithSla.get(m)
          ? round1(((doneOnTime.get(m) ?? 0) / doneWithSla.get(m)!) * 100)
          : null,
      })),
      mostDelayedSteps: [...lateByStep.values()].sort((a, b) => b.count - a.count).slice(0, 8),
      workloadByResponsible: [...workload.values()].sort((a, b) => b.count - a.count).slice(0, 8),
    },
    definitions: OVERVIEW_DEFINITIONS,
  };
}
