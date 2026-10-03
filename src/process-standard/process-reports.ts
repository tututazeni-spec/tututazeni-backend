// src/process-standard/process-reports.ts
// Agregação da aba "Indicadores e Relatórios" (docs/Modulo_Processes.md §12).
// Funções puras sobre linhas já carregadas — sem acesso à BD — para a lógica
// das métricas ser testável. Cada indicador tem uma definição explícita
// (INDICATOR_DEFINITIONS) que indica o que inclui e exclui.
//
// «Processo» = instância (ProcessInstance). O período (from/to) delimita a
// COORTE: as instâncias iniciadas nesse intervalo. Os indicadores de «estado
// actual» (backlog, atrasos, aprovações pendentes, carga) ignoram o período e
// medem o presente, dentro das mesmas dimensões (departamento, tipo, …).

const HOUR_MS = 3_600_000;
export const OPEN_TASK_STATUSES = ['PENDING', 'IN_PROGRESS', 'BLOCKED', 'ESCALATED'];

export const INDICATOR_DEFINITIONS = {
  completionRate:
    'Concluídos ÷ iniciados no período, excluindo cancelados e suspensos do denominador.',
  onTimeRate: 'Concluídos dentro do prazo (conclusão ≤ prazo) ÷ concluídos que têm prazo definido.',
  avgCompletionHours:
    'Média de horas entre início e conclusão dos processos concluídos; exclui cancelados e suspensos.',
  avgHoursByStep:
    'Média de horas entre o início e a conclusão de cada etapa concluída (por nome da etapa).',
  rejectionRate:
    'Aprovações rejeitadas ÷ aprovações decididas (aprovadas + rejeitadas + devolvidas) dos processos do período.',
  returnRate:
    'Processos do período com pelo menos uma devolução (de tarefa ou de aprovação) ÷ processos iniciados.',
  volume: 'Processos iniciados no período (todos os estados).',
  backlog:
    'Estado actual: processos em curso ou suspensos e tarefas por resolver (pendentes, em curso, bloqueadas, escaladas).',
  overdue: 'Estado actual: processos em curso com o prazo ultrapassado.',
  pendingApprovals: 'Estado actual: pedidos de aprovação ainda sem decisão.',
  reopenRate: 'Processos do período com pelo menos uma reabertura de tarefa ÷ processos iniciados.',
  workload: 'Estado actual: tarefas atribuídas por resolver, por responsável.',
  automationFailures:
    'Execuções de automações de processos que falharam no período ÷ execuções no período.',
} as const;

export type IndicatorKey = keyof typeof INDICATOR_DEFINITIONS;

export const GROUP_BY = [
  'department',
  'template',
  'category',
  'sourceModule',
  'responsible',
  'priority',
  'month',
] as const;
export type GroupBy = (typeof GROUP_BY)[number];

export interface ReportInstance {
  id: number;
  code: string | null;
  title: string | null;
  status: string;
  priority: string;
  startedAt: Date;
  completedAt: Date | null;
  slaDeadline: Date | null;
  sourceModule: string | null;
  currentResponsible: { id: number; fullName: string } | null;
  process: {
    id: number;
    code: string;
    title: string;
    category: string | null;
    department: { id: number; name: string } | null;
  };
}

export interface ReportStep {
  instanceId: number;
  status: string;
  startedAt: Date | null;
  completedAt: Date | null;
  returnCount: number;
  stepTitle: string;
}

export interface ReportApproval {
  instanceId: number;
  status: string;
}

export interface ReportInput {
  instances: ReportInstance[];
  steps: ReportStep[];
  approvals: ReportApproval[];
  /** Instâncias com pelo menos uma reabertura de tarefa. */
  reopenedInstanceIds: Set<number>;
}

const round1 = (n: number) => Math.round(n * 10) / 10;
const pct = (num: number, den: number) => (den > 0 ? round1((num / den) * 100) : null);
const avg = (v: number[]) => (v.length ? round1(v.reduce((a, b) => a + b, 0) / v.length) : null);
const monthKey = (d: Date) =>
  `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;

export const isLate = (i: ReportInstance) =>
  i.status === 'COMPLETED' && !!i.slaDeadline && !!i.completedAt && i.completedAt > i.slaDeadline;
export const isOnTime = (i: ReportInstance) =>
  i.status === 'COMPLETED' && !!i.slaDeadline && !!i.completedAt && i.completedAt <= i.slaDeadline;
const hoursOf = (i: ReportInstance) =>
  i.completedAt ? (i.completedAt.getTime() - i.startedAt.getTime()) / HOUR_MS : null;

/** Conjuntos de ids por indicador — alimentam o detalhe («registos que originaram o indicador»). */
export function indicatorSets(input: ReportInput, now: Date = new Date()) {
  const { instances, steps, approvals, reopenedInstanceIds } = input;
  const returned = new Set<number>();
  for (const s of steps) if (s.returnCount > 0) returned.add(s.instanceId);
  for (const a of approvals) if (a.status === 'RETURNED') returned.add(a.instanceId);
  const rejected = new Set(approvals.filter(a => a.status === 'REJECTED').map(a => a.instanceId));
  return {
    total: new Set(instances.map(i => i.id)),
    completed: new Set(instances.filter(i => i.status === 'COMPLETED').map(i => i.id)),
    onTime: new Set(instances.filter(isOnTime).map(i => i.id)),
    late: new Set(instances.filter(isLate).map(i => i.id)),
    returned,
    rejected,
    reopened: new Set([...reopenedInstanceIds].filter(id => instances.some(i => i.id === id))),
    overdue: new Set(
      instances
        .filter(i => i.status === 'IN_PROGRESS' && i.slaDeadline && i.slaDeadline < now)
        .map(i => i.id),
    ),
  };
}

export function buildIndicators(input: ReportInput, now: Date = new Date()) {
  const { instances, steps, approvals } = input;
  const sets = indicatorSets(input, now);
  const completed = instances.filter(i => i.status === 'COMPLETED');
  const denominator = instances.filter(i => !['CANCELLED', 'ON_HOLD'].includes(i.status));
  const withSla = completed.filter(i => i.slaDeadline && i.completedAt);

  const decided = approvals.filter(a => ['APPROVED', 'REJECTED', 'RETURNED'].includes(a.status));
  const rejectedApprovals = decided.filter(a => a.status === 'REJECTED');

  const byStep = new Map<string, number[]>();
  for (const s of steps) {
    if (s.status !== 'COMPLETED' || !s.startedAt || !s.completedAt) continue;
    const h = (s.completedAt.getTime() - s.startedAt.getTime()) / HOUR_MS;
    if (h < 0) continue;
    byStep.set(s.stepTitle, [...(byStep.get(s.stepTitle) ?? []), h]);
  }

  const monthly = new Map<string, number>();
  for (const i of instances)
    monthly.set(monthKey(i.startedAt), (monthly.get(monthKey(i.startedAt)) ?? 0) + 1);

  return {
    completionRate: {
      value: pct(completed.length, denominator.length),
      numerator: completed.length,
      denominator: denominator.length,
    },
    onTimeRate: {
      value: pct(sets.onTime.size, withSla.length),
      numerator: sets.onTime.size,
      denominator: withSla.length,
    },
    avgCompletionHours: {
      value: avg(completed.map(hoursOf).filter((n): n is number => n !== null)),
      samples: completed.length,
    },
    avgHoursByStep: [...byStep.entries()]
      .map(([stepTitle, v]) => ({ stepTitle, hours: avg(v) ?? 0, samples: v.length }))
      .sort((a, b) => b.hours - a.hours)
      .slice(0, 10),
    rejectionRate: {
      value: pct(rejectedApprovals.length, decided.length),
      numerator: rejectedApprovals.length,
      denominator: decided.length,
    },
    returnRate: {
      value: pct(sets.returned.size, instances.length),
      numerator: sets.returned.size,
      denominator: instances.length,
    },
    volume: {
      value: instances.length,
      byMonth: [...monthly.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([month, count]) => ({ month, count })),
    },
    reopenRate: {
      value: pct(sets.reopened.size, instances.length),
      numerator: sets.reopened.size,
      denominator: instances.length,
    },
  };
}

export interface GroupRow {
  key: string;
  label: string;
  total: number;
  completed: number;
  overdue: number;
  cancelled: number;
  completionRate: number | null;
  onTimeRate: number | null;
  avgHours: number | null;
}

export function groupInstances(
  instances: ReportInstance[],
  by: GroupBy,
  now: Date = new Date(),
): GroupRow[] {
  const keyOf = (i: ReportInstance): { key: string; label: string } => {
    switch (by) {
      case 'department':
        return {
          key: String(i.process.department?.id ?? 0),
          label: i.process.department?.name ?? 'Sem departamento',
        };
      case 'template':
        return { key: String(i.process.id), label: `${i.process.code} — ${i.process.title}` };
      case 'category':
        return { key: i.process.category ?? '', label: i.process.category ?? 'Sem categoria' };
      case 'sourceModule':
        return { key: i.sourceModule ?? '', label: i.sourceModule ?? 'Não indicado' };
      case 'responsible':
        return {
          key: String(i.currentResponsible?.id ?? 0),
          label: i.currentResponsible?.fullName ?? 'Sem responsável',
        };
      case 'priority':
        return { key: i.priority, label: i.priority };
      case 'month':
        return { key: monthKey(i.startedAt), label: monthKey(i.startedAt) };
    }
  };
  const groups = new Map<string, { label: string; rows: ReportInstance[] }>();
  for (const i of instances) {
    const { key, label } = keyOf(i);
    const g = groups.get(key) ?? { label, rows: [] };
    g.rows.push(i);
    groups.set(key, g);
  }
  const out: GroupRow[] = [];
  for (const [key, g] of groups) {
    const done = g.rows.filter(r => r.status === 'COMPLETED');
    const denom = g.rows.filter(r => !['CANCELLED', 'ON_HOLD'].includes(r.status));
    const sla = done.filter(r => r.slaDeadline && r.completedAt);
    out.push({
      key,
      label: g.label,
      total: g.rows.length,
      completed: done.length,
      cancelled: g.rows.filter(r => r.status === 'CANCELLED').length,
      overdue: g.rows.filter(
        r => r.status === 'IN_PROGRESS' && r.slaDeadline && r.slaDeadline < now,
      ).length,
      completionRate: pct(done.length, denom.length),
      onTimeRate: pct(sla.filter(isOnTime).length, sla.length),
      avgHours: avg(done.map(hoursOf).filter((n): n is number => n !== null)),
    });
  }
  return out.sort((a, b) =>
    by === 'month'
      ? a.key.localeCompare(b.key)
      : b.total - a.total || a.label.localeCompare(b.label),
  );
}
