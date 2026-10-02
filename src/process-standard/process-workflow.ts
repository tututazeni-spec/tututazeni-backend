// src/process-standard/process-workflow.ts
// Lógica pura do motor de processos (docs/Modulo_Processes.md §4, §5, §6):
// dependências entre etapas, validação/simulação de modelos, activação de
// etapas e métricas derivadas de uma instância. Sem acesso à BD, para ser
// testável e partilhada entre os serviços.

export interface WorkflowStep {
  id?: number;
  order: number;
  title: string;
  type?: string;
  parallel?: boolean | null;
  dependsOnOrders?: number[] | null;
  responsibleId?: number | null;
  responsibleRole?: string | null;
}

const DONE_STATUSES = ['COMPLETED', 'SKIPPED', 'CANCELLED'];
const ACTIVE_STATUSES = ['PENDING', 'IN_PROGRESS', 'BLOCKED', 'ESCALATED'];
const HOUR_MS = 3_600_000;

export const isDoneStatus = (status: string) => DONE_STATUSES.includes(status);
export const isActiveStatus = (status: string) => ACTIVE_STATUSES.includes(status);

/**
 * Ordens de que cada etapa depende:
 *  - `dependsOnOrders` explícito → esse conjunto;
 *  - senão, `parallel` → nenhuma (arranca logo);
 *  - senão → a etapa imediatamente anterior (sequencial).
 */
export function effectiveDependencies(steps: WorkflowStep[]): Map<number, number[]> {
  const orders = [...new Set(steps.map(s => s.order))].sort((a, b) => a - b);
  const result = new Map<number, number[]>();
  for (const s of steps) {
    const explicit = (s.dependsOnOrders ?? []).filter(o => o !== s.order);
    if (explicit.length > 0) {
      result.set(s.order, [...new Set(explicit)]);
    } else if (s.parallel) {
      result.set(s.order, []);
    } else {
      const idx = orders.indexOf(s.order);
      result.set(s.order, idx > 0 ? [orders[idx - 1]] : []);
    }
  }
  return result;
}

export interface WorkflowValidation {
  valid: boolean;
  errors: string[];
  /** Subconjunto de `errors` que impede mesmo guardar (dependências inválidas / ciclos). */
  structural: string[];
  warnings: string[];
  /** Ondas de execução simuladas: etapas que arrancam em simultâneo. */
  simulation: Array<{ wave: number; steps: string[] }>;
}

/** Valida o grafo de etapas de um modelo (ciclos, dependências inválidas, etapas sem responsável). */
export function validateWorkflow(steps: WorkflowStep[]): WorkflowValidation {
  const errors: string[] = [];
  const structural: string[] = [];
  const warnings: string[] = [];

  if (steps.length === 0) {
    return {
      valid: false,
      errors: ['O modelo não tem etapas.'],
      structural: [],
      warnings,
      simulation: [],
    };
  }

  const orders = new Set(steps.map(s => s.order));
  for (const s of steps) {
    for (const d of s.dependsOnOrders ?? []) {
      if (d === s.order) structural.push(`A etapa "${s.title}" depende de si própria.`);
      else if (!orders.has(d)) {
        structural.push(`A etapa "${s.title}" depende da ordem ${d}, que não existe.`);
      }
    }
    const type = s.type ?? 'TASK';
    if (
      (type === 'TASK' || type === 'REVIEW' || type === 'DECISION') &&
      !s.responsibleId &&
      !s.responsibleRole
    ) {
      errors.push(`A etapa "${s.title}" não tem responsável nem função atribuída.`);
    }
  }

  const deps = effectiveDependencies(steps);
  const titleByOrder = new Map<number, string>();
  for (const s of steps) titleByOrder.set(s.order, s.title);

  // Simulação por ondas (Kahn); o que sobra no fim está num ciclo.
  const remaining = new Set(orders);
  const done = new Set<number>();
  const simulation: WorkflowValidation['simulation'] = [];
  let wave = 1;
  while (remaining.size > 0) {
    const ready = [...remaining].filter(o =>
      (deps.get(o) ?? []).filter(d => orders.has(d)).every(d => done.has(d)),
    );
    if (ready.length === 0) break;
    simulation.push({
      wave,
      steps: ready.sort((a, b) => a - b).map(o => titleByOrder.get(o) ?? `#${o}`),
    });
    for (const o of ready) {
      remaining.delete(o);
      done.add(o);
    }
    wave++;
  }
  if (remaining.size > 0) {
    structural.push(
      `Ciclo infinito ou condição sem saída entre as etapas: ${[...remaining]
        .sort((a, b) => a - b)
        .map(o => `"${titleByOrder.get(o)}"`)
        .join(', ')}.`,
    );
  }

  const types = steps.map(s => s.type ?? 'TASK');
  if (!types.includes('END')) warnings.push('O modelo não tem uma etapa de fim (END).');
  if (new Set(steps.map(s => s.order)).size !== steps.length) {
    warnings.push('Existem etapas com a mesma ordem — serão tratadas como paralelas.');
  }

  errors.unshift(...structural);
  return { valid: errors.length === 0, errors, structural, warnings, simulation };
}

export interface ProgressRow {
  id: number;
  stepId: number;
  stepOrder: number;
  status: string;
}

/**
 * Decide que etapas WAITING passam a PENDING (dependências satisfeitas) e que
 * etapas PENDING/IN_PROGRESS voltam a WAITING (dependência reaberta/devolvida).
 */
export function planActivation(
  steps: WorkflowStep[],
  progress: ProgressRow[],
): { activate: number[]; demote: number[] } {
  const deps = effectiveDependencies(steps);
  const statusesByOrder = new Map<number, string[]>();
  for (const p of progress) {
    const list = statusesByOrder.get(p.stepOrder) ?? [];
    list.push(p.status);
    statusesByOrder.set(p.stepOrder, list);
  }
  const satisfied = (order: number) =>
    (statusesByOrder.get(order) ?? []).every(st => isDoneStatus(st));

  const activate: number[] = [];
  const demote: number[] = [];
  for (const p of progress) {
    const needed = deps.get(p.stepOrder) ?? [];
    const ok = needed.every(satisfied);
    if (p.status === 'WAITING' && ok) activate.push(p.id);
    if ((p.status === 'PENDING' || p.status === 'IN_PROGRESS') && !ok) demote.push(p.id);
  }
  return { activate, demote };
}

// ─── Instâncias ──────────────────────────────────────────────────────────────

export const formatInstanceCode = (year: number, seq: number) =>
  `PROC-${year}-${String(seq).padStart(4, '0')}`;

/** Extrai a sequência de um código `PROC-AAAA-NNNN`; 0 se inválido/ausente. */
export function sequenceFromCode(code: string | null | undefined): number {
  const m = /^PROC-\d{4}-(\d+)$/.exec(code ?? '');
  return m ? parseInt(m[1], 10) : 0;
}

export const formatTaskCode = (instanceCode: string | null, instanceId: number, order: number) =>
  `${instanceCode ?? `PROC-${instanceId}`}-T${String(order).padStart(2, '0')}`;

export type DeadlineSituation = 'ON_TIME' | 'AT_RISK' | 'OVERDUE' | 'NONE';

export interface InstanceMetricsInput {
  status: string;
  startedAt: Date;
  completedAt: Date | null;
  cancelledAt: Date | null;
  suspendedAt: Date | null;
  slaDeadline: Date | null;
}

export function deriveInstanceMetrics(
  inst: InstanceMetricsInput,
  progress: Array<{ status: string }>,
  now: Date = new Date(),
) {
  const relevant = progress.filter(p => p.status !== 'CANCELLED');
  const done = relevant.filter(p => isDoneStatus(p.status)).length;
  const progressPct = relevant.length === 0 ? 0 : Math.round((done / relevant.length) * 100);

  const finished = inst.status === 'COMPLETED' || inst.status === 'CANCELLED';
  const end =
    inst.completedAt ??
    inst.cancelledAt ??
    (inst.status === 'ON_HOLD' && inst.suspendedAt ? inst.suspendedAt : now);
  const elapsedHours = Math.max(
    0,
    Math.round(((end.getTime() - inst.startedAt.getTime()) / HOUR_MS) * 10) / 10,
  );

  let remainingHours: number | null = null;
  let deadlineSituation: DeadlineSituation = 'NONE';
  if (inst.slaDeadline && inst.status !== 'CANCELLED') {
    if (inst.status === 'COMPLETED') {
      deadlineSituation =
        inst.completedAt && inst.completedAt.getTime() > inst.slaDeadline.getTime()
          ? 'OVERDUE'
          : 'ON_TIME';
    } else if (!finished) {
      const leftMs = inst.slaDeadline.getTime() - now.getTime();
      remainingHours = Math.round((leftMs / HOUR_MS) * 10) / 10;
      const windowMs = inst.slaDeadline.getTime() - inst.startedAt.getTime();
      if (leftMs < 0) deadlineSituation = 'OVERDUE';
      else if (leftMs <= 24 * HOUR_MS || (windowMs > 0 && leftMs <= windowMs * 0.2)) {
        deadlineSituation = 'AT_RISK';
      } else deadlineSituation = 'ON_TIME';
    }
  }

  return { progress: progressPct, elapsedHours, remainingHours, deadlineSituation };
}
