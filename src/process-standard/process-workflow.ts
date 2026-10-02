// src/process-standard/process-workflow.ts
// Lógica pura do motor de processos (docs/Modulo_Processes.md §4, §5, §6):
// dependências entre etapas, validação/simulação de modelos, activação de
// etapas e métricas derivadas de uma instância. Sem acesso à BD, para ser
// testável e partilhada entre os serviços.
import {
  actionIssue,
  buildConditionContext,
  conditionsPass,
  parseConditionSet,
  parseStepActions,
  parseStepConfig,
  referencedOrders,
  type ConditionContext,
} from './process-conditions';

export interface WorkflowStep {
  id?: number;
  order: number;
  title: string;
  type?: string;
  parallel?: boolean | null;
  dependsOnOrders?: number[] | null;
  responsibleId?: number | null;
  responsibleRole?: string | null;
  // §7/§8
  reviewerId?: number | null;
  approverIds?: number[] | null;
  approvalMode?: string | null;
  onReject?: string | null;
  config?: unknown;
  entryConditions?: unknown;
  exitConditions?: unknown;
  successActions?: unknown;
  failureActions?: unknown;
}

/** Etapas executadas por pessoas (precisam de responsável). */
export const HUMAN_STEP_TYPES = ['TASK', 'DECISION', 'FORM', 'DOCUMENT'] as const;
/** Etapas que o motor executa sozinho assim que ficam activas. */
export const AUTOMATIC_STEP_TYPES = [
  'START',
  'END',
  'GATEWAY',
  'PARALLEL',
  'NOTIFICATION',
  'AUTO_ACTION',
  'INTEGRATION',
  'TIMER',
] as const;
export const isAutomaticType = (type: string | null | undefined) =>
  (AUTOMATIC_STEP_TYPES as readonly string[]).includes(type ?? '');
export const isApprovalType = (type: string | null | undefined) => type === 'REVIEW';

/** Soma horas a uma data; em modo BUSINESS_DAYS salta sábados e domingos. */
export function addHours(from: Date, hours: number, mode: string | null | undefined): Date {
  if (mode !== 'BUSINESS_DAYS') return new Date(from.getTime() + hours * 3_600_000);
  let remaining = hours * 3_600_000;
  const cursor = new Date(from.getTime());
  const isWeekend = (d: Date) => d.getDay() === 0 || d.getDay() === 6;
  while (remaining > 0) {
    if (isWeekend(cursor)) {
      cursor.setHours(0, 0, 0, 0);
      cursor.setDate(cursor.getDate() + 1);
      continue;
    }
    const endOfDay = new Date(cursor);
    endOfDay.setHours(24, 0, 0, 0);
    const chunk = Math.min(remaining, endOfDay.getTime() - cursor.getTime());
    cursor.setTime(cursor.getTime() + chunk);
    remaining -= chunk;
  }
  return cursor;
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
      (HUMAN_STEP_TYPES as readonly string[]).includes(type) &&
      !s.responsibleId &&
      !s.responsibleRole
    ) {
      errors.push(`A etapa "${s.title}" não tem responsável nem função atribuída.`);
    }
    if (
      isApprovalType(type) &&
      !s.approverIds?.length &&
      !s.reviewerId &&
      !s.responsibleId &&
      !s.responsibleRole
    ) {
      errors.push(`A etapa de aprovação "${s.title}" não tem aprovador nem função de aprovação.`);
    }
    errors.push(...stepConfigIssues(s));
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

  const refs = conditionReferenceIssues(steps, deps);
  structural.push(...refs.errors);
  warnings.push(...refs.warnings);

  // Ramificações: uma decisão/ramificação deve ter saídas; uma rejeição que segue o
  // ramo (BRANCH) precisa de, pelo menos, uma etapa seguinte condicionada ao resultado.
  const successors = new Map<number, WorkflowStep[]>();
  for (const s of steps) {
    for (const d of deps.get(s.order) ?? []) {
      successors.set(d, [...(successors.get(d) ?? []), s]);
    }
  }
  for (const s of steps) {
    const next = successors.get(s.order) ?? [];
    if ((s.type === 'DECISION' || s.type === 'GATEWAY') && next.length === 0) {
      warnings.push(
        `A etapa "${s.title}" (${s.type}) não tem nenhuma etapa seguinte — condição sem saída.`,
      );
    }
    if (s.type === 'REVIEW' && s.onReject === 'BRANCH') {
      const handled = next.some(n => {
        const set = parseConditionSet(n.entryConditions);
        return set && set !== 'invalid' && referencedOrders(set).includes(s.order);
      });
      if (!handled) {
        warnings.push(
          `A aprovação "${s.title}" segue o ramo em caso de rejeição, mas nenhuma etapa seguinte tem condição sobre o seu resultado.`,
        );
      }
    }
  }

  const types = steps.map(s => s.type ?? 'TASK');
  if (!types.includes('END')) warnings.push('O modelo não tem uma etapa de fim (END).');
  else if (structural.length === 0) {
    if (!simulateScenario(steps).reachedEnd) {
      warnings.push('No cenário de aprovação, o fluxo não chega à etapa de fim.');
    }
    const branching = steps.filter(s => s.type === 'REVIEW' && s.onReject === 'BRANCH');
    if (branching.length > 0) {
      const results = Object.fromEntries(branching.map(s => [s.order, 'REJECTED']));
      if (!simulateScenario(steps, { results }).reachedEnd) {
        warnings.push('No cenário de rejeição, o fluxo não chega à etapa de fim.');
      }
    }
  }
  if (new Set(steps.map(s => s.order)).size !== steps.length) {
    warnings.push('Existem etapas com a mesma ordem — serão tratadas como paralelas.');
  }

  errors.unshift(...structural);
  return { valid: errors.length === 0, errors, structural, warnings, simulation };
}

/** Problemas de configuração de uma etapa (condições, acções e dados do tipo). */
function stepConfigIssues(s: WorkflowStep): string[] {
  const issues: string[] = [];
  const name = `"${s.title}"`;
  if (parseConditionSet(s.entryConditions) === 'invalid') {
    issues.push(`A etapa ${name} tem condições de entrada inválidas.`);
  }
  // exitConditions legadas em formato livre não são avaliáveis — não contam como erro.
  for (const [label, raw] of [
    ['acções de sucesso', s.successActions],
    ['acções em caso de falha', s.failureActions],
  ] as const) {
    const parsed = parseStepActions(raw);
    if (parsed === 'invalid') issues.push(`A etapa ${name} tem ${label} inválidas.`);
    else {
      for (const a of parsed) {
        const issue = actionIssue(a);
        if (issue) issues.push(`A etapa ${name} (${label}): ${issue}.`);
      }
    }
  }
  const cfg = parseStepConfig(s.config);
  if (cfg === 'invalid') {
    issues.push(`A etapa ${name} tem a configuração inválida.`);
    return issues;
  }
  switch (s.type) {
    case 'TIMER':
      if (!(Number(cfg.delayHours) > 0)) {
        issues.push(`O temporizador ${name} precisa de uma duração (horas) superior a zero.`);
      }
      break;
    case 'WAIT_EVENT':
      if (!cfg.eventName?.trim()) issues.push(`A espera por evento ${name} não indica o evento.`);
      break;
    case 'NOTIFICATION':
      if (!cfg.recipients?.length || !cfg.message?.trim()) {
        issues.push(`A notificação ${name} precisa de destinatários e mensagem.`);
      }
      break;
    case 'INTEGRATION':
      if (!cfg.module?.trim()) issues.push(`A integração ${name} não indica o módulo de destino.`);
      break;
    case 'AUTO_ACTION': {
      const acts = cfg.actions ?? [];
      if (acts.length === 0) issues.push(`A acção automática ${name} não tem acções configuradas.`);
      for (const a of acts) {
        const issue = actionIssue(a);
        if (issue) issues.push(`A acção automática ${name}: ${issue}.`);
      }
      break;
    }
    default:
      break;
  }
  return issues;
}

/** Condições a apontar para etapas inexistentes (erro) ou que não a precedem (aviso). */
function conditionReferenceIssues(
  steps: WorkflowStep[],
  deps: Map<number, number[]>,
): { errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];
  const orders = new Set(steps.map(s => s.order));
  const ancestors = (order: number) => {
    const seen = new Set<number>();
    const stack = [...(deps.get(order) ?? [])];
    while (stack.length) {
      const o = stack.pop() as number;
      if (seen.has(o)) continue;
      seen.add(o);
      stack.push(...(deps.get(o) ?? []));
    }
    return seen;
  };
  for (const s of steps) {
    for (const raw of [s.entryConditions, s.exitConditions]) {
      const set = parseConditionSet(raw);
      if (!set || set === 'invalid') continue;
      for (const o of referencedOrders(set)) {
        if (!orders.has(o)) {
          errors.push(`A etapa "${s.title}" usa uma condição sobre a etapa ${o}, que não existe.`);
        } else if (o !== s.order && !ancestors(s.order).has(o)) {
          warnings.push(
            `A condição da etapa "${s.title}" usa a etapa ${o}, que pode ainda não estar concluída nesse momento.`,
          );
        }
      }
    }
  }
  return { errors, warnings };
}

export interface SimulationScenario {
  priority?: string;
  sourceModule?: string;
  /** Resultado por ordem de etapa (ex.: { 3: 'REJECTED' }). Aprovações assumem APPROVED. */
  results?: Record<number, string>;
  form?: Record<string, unknown>;
}

export interface SimulatedStep {
  order: number;
  title: string;
  type: string;
  outcome: 'EXECUTED' | 'AUTOMATIC' | 'SKIPPED';
  result: string | null;
}

export interface WorkflowTrace {
  wave: number;
  steps: SimulatedStep[];
}

/** Percorre o fluxo com um cenário e mostra o caminho tomado (testar antes de publicar). */
export function simulateScenario(
  steps: WorkflowStep[],
  scenario: SimulationScenario = {},
): { trace: WorkflowTrace[]; reachedEnd: boolean; executed: number; skipped: number } {
  const deps = effectiveDependencies(steps);
  const byOrder = new Map<number, WorkflowStep>();
  for (const s of steps) byOrder.set(s.order, s);
  const remaining = new Set(byOrder.keys());
  const done = new Set<number>();
  const progress: Array<{ stepOrder: number; status: string; result: string | null }> = [];
  const trace: WorkflowTrace[] = [];
  let executed = 0;
  let skipped = 0;
  let reachedEnd = false;
  let wave = 1;

  while (remaining.size > 0) {
    const ready = [...remaining]
      .filter(o => (deps.get(o) ?? []).filter(d => byOrder.has(d)).every(d => done.has(d)))
      .sort((a, b) => a - b);
    if (ready.length === 0) break;
    const ctx: ConditionContext = buildConditionContext({
      priority: scenario.priority ?? 'NORMAL',
      sourceModule: scenario.sourceModule,
      status: 'IN_PROGRESS',
      progress,
      extraForm: scenario.form,
    });
    const row: SimulatedStep[] = [];
    const finished: Array<{ stepOrder: number; status: string; result: string | null }> = [];
    for (const o of ready) {
      const s = byOrder.get(o) as WorkflowStep;
      const type = s.type ?? 'TASK';
      if (!conditionsPass(s.entryConditions, ctx)) {
        row.push({ order: o, title: s.title, type, outcome: 'SKIPPED', result: null });
        finished.push({ stepOrder: o, status: 'SKIPPED', result: null });
        skipped++;
      } else {
        const defaultResult = isApprovalType(type)
          ? 'APPROVED'
          : isAutomaticType(type)
            ? 'AUTO'
            : 'DONE';
        const result = scenario.results?.[o] ?? defaultResult;
        row.push({
          order: o,
          title: s.title,
          type,
          outcome: isAutomaticType(type) ? 'AUTOMATIC' : 'EXECUTED',
          result,
        });
        finished.push({ stepOrder: o, status: 'COMPLETED', result });
        executed++;
        if (type === 'END') reachedEnd = true;
      }
    }
    trace.push({ wave, steps: row });
    for (const f of finished) {
      progress.push(f);
      remaining.delete(f.stepOrder);
      done.add(f.stepOrder);
    }
    wave++;
  }
  return { trace, reachedEnd, executed, skipped };
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
