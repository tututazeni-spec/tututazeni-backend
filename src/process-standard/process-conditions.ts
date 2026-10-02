// src/process-standard/process-conditions.ts
// Condições e acções de etapa (docs/Modulo_Processes.md §8): condições de
// entrada ("só executa se…"), condições para avançar, e as acções de
// sucesso/falha. Lógica pura — sem BD — para ser partilhada pelo motor, pela
// validação/simulação do modelo e pelos testes.
//
// Formato das condições (o mesmo do construtor de regras de Automações):
//   { "logic": "AND" | "OR", "rows": [{ "field": "...", "operator": "...", "value": "..." }] }
//
// Campos disponíveis no contexto de uma instância:
//   priority, sourceModule, status, target.departmentId
//   step:<ordem>.result | .action | .status   (resultado de outra etapa)
//   form.<campo>                              (dados de formulários já submetidos)

export const CONDITION_OPERATORS = [
  'equals',
  'not_equals',
  'greater_than',
  'less_than',
  'contains',
  'not_contains',
  'is_empty',
  'is_not_empty',
] as const;
export type ConditionOperator = (typeof CONDITION_OPERATORS)[number];

export interface ConditionRow {
  field: string;
  operator: ConditionOperator;
  value?: string;
}

export interface ConditionSet {
  logic: 'AND' | 'OR';
  rows: ConditionRow[];
}

export type ConditionContext = Record<string, unknown>;

/** Interpreta o JSON guardado; devolve null se vazio e `'invalid'` se estiver mal formado. */
export function parseConditionSet(raw: unknown): ConditionSet | null | 'invalid' {
  if (raw === null || raw === undefined || raw === '') return null;
  let value: unknown = raw;
  if (typeof raw === 'string') {
    try {
      value = JSON.parse(raw);
    } catch {
      return 'invalid';
    }
  }
  if (typeof value !== 'object' || value === null) return 'invalid';
  const obj = value as { logic?: unknown; rows?: unknown };
  if (!Array.isArray(obj.rows)) {
    // Objectos legados de exitConditions (formato livre) não são condições avaliáveis.
    return Object.keys(value as object).length === 0 ? null : 'invalid';
  }
  if (obj.rows.length === 0) return null;
  const rows: ConditionRow[] = [];
  for (const r of obj.rows as Array<Partial<ConditionRow>>) {
    if (
      !r ||
      typeof r.field !== 'string' ||
      !r.field.trim() ||
      !(CONDITION_OPERATORS as readonly string[]).includes(r.operator as string)
    ) {
      return 'invalid';
    }
    rows.push({
      field: r.field.trim(),
      operator: r.operator as ConditionOperator,
      value: r.value === undefined || r.value === null ? undefined : String(r.value),
    });
  }
  return { logic: obj.logic === 'OR' ? 'OR' : 'AND', rows };
}

const isEmpty = (v: unknown) => v === undefined || v === null || v === '';

function evaluateRow(row: ConditionRow, ctx: ConditionContext): boolean {
  const actual = ctx[row.field];
  const expected = row.value;
  switch (row.operator) {
    case 'not_equals':
      return String(actual ?? '') !== String(expected ?? '');
    case 'greater_than':
      return Number(actual) > Number(expected);
    case 'less_than':
      return Number(actual) < Number(expected);
    case 'contains':
      return typeof actual === 'string' && actual.includes(String(expected ?? ''));
    case 'not_contains':
      return !(typeof actual === 'string' && actual.includes(String(expected ?? '')));
    case 'is_empty':
      return isEmpty(actual);
    case 'is_not_empty':
      return !isEmpty(actual);
    case 'equals':
    default:
      return String(actual ?? '') === String(expected ?? '');
  }
}

export function evaluateConditionSet(set: ConditionSet, ctx: ConditionContext): boolean {
  const results = set.rows.map(r => evaluateRow(r, ctx));
  return set.logic === 'OR' ? results.some(Boolean) : results.every(Boolean);
}

/** Atalho: condições ausentes/ilegíveis contam como satisfeitas (não bloqueiam o fluxo). */
export function conditionsPass(raw: unknown, ctx: ConditionContext): boolean {
  const set = parseConditionSet(raw);
  if (!set || set === 'invalid') return true;
  return evaluateConditionSet(set, ctx);
}

export interface ContextProgress {
  stepOrder: number;
  status: string;
  result?: string | null;
  action?: string | null;
  formData?: string | null;
}

export function buildConditionContext(input: {
  priority?: string | null;
  sourceModule?: string | null;
  status?: string | null;
  targetDepartmentId?: number | null;
  progress: ContextProgress[];
  /** Dados ainda não gravados (ex.: o formulário que está a ser submetido). */
  extraForm?: Record<string, unknown>;
}): ConditionContext {
  const ctx: ConditionContext = {
    priority: input.priority ?? undefined,
    sourceModule: input.sourceModule ?? undefined,
    status: input.status ?? undefined,
    'target.departmentId': input.targetDepartmentId ?? undefined,
  };
  for (const p of [...input.progress].sort((a, b) => a.stepOrder - b.stepOrder)) {
    ctx[`step:${p.stepOrder}.status`] = p.status;
    if (p.result) ctx[`step:${p.stepOrder}.result`] = p.result;
    if (p.action) ctx[`step:${p.stepOrder}.action`] = p.action;
    if (p.formData) {
      try {
        const data = JSON.parse(p.formData) as Record<string, unknown>;
        for (const [k, v] of Object.entries(data ?? {})) ctx[`form.${k}`] = v;
      } catch {
        // formData ilegível não deve rebentar a avaliação
      }
    }
  }
  for (const [k, v] of Object.entries(input.extraForm ?? {})) ctx[`form.${k}`] = v;
  return ctx;
}

/** Ordens de etapas referenciadas por `step:N.…` num conjunto de condições. */
export function referencedOrders(set: ConditionSet): number[] {
  const orders = new Set<number>();
  for (const r of set.rows) {
    const m = /^step:(\d+)\./.exec(r.field);
    if (m) orders.add(parseInt(m[1], 10));
  }
  return [...orders];
}

// ─── Acções de sucesso / falha ───────────────────────────────────────────────

export const STEP_ACTION_TYPES = [
  'NOTIFY',
  'SET_PRIORITY',
  'ADD_COMMENT',
  'EMIT_EVENT',
  'SUSPEND_INSTANCE',
  'CANCEL_INSTANCE',
] as const;
export type StepActionType = (typeof STEP_ACTION_TYPES)[number];

export interface StepAction {
  type: StepActionType;
  /** NOTIFY: ASSIGNEE | TARGET | REQUESTER | MANAGER | OWNER | RESPONSIBLE | ROLE:<função> | <userId> */
  recipients?: string[];
  message?: string;
  priority?: string;
  event?: string;
  reason?: string;
}

export function parseStepActions(raw: unknown): StepAction[] | 'invalid' {
  if (raw === null || raw === undefined || raw === '') return [];
  let value: unknown = raw;
  if (typeof raw === 'string') {
    try {
      value = JSON.parse(raw);
    } catch {
      return 'invalid';
    }
  }
  if (!Array.isArray(value)) return 'invalid';
  const actions: StepAction[] = [];
  for (const a of value as Array<Partial<StepAction>>) {
    if (!a || !(STEP_ACTION_TYPES as readonly string[]).includes(a.type as string)) {
      return 'invalid';
    }
    actions.push({
      type: a.type as StepActionType,
      recipients: Array.isArray(a.recipients) ? a.recipients.map(String) : undefined,
      message: a.message ? String(a.message) : undefined,
      priority: a.priority ? String(a.priority) : undefined,
      event: a.event ? String(a.event) : undefined,
      reason: a.reason ? String(a.reason) : undefined,
    });
  }
  return actions;
}

/** Valida uma acção isolada; devolve a mensagem de erro ou null. */
export function actionIssue(a: StepAction): string | null {
  switch (a.type) {
    case 'NOTIFY':
      return !a.recipients?.length || !a.message ? 'NOTIFY exige destinatários e mensagem' : null;
    case 'SET_PRIORITY':
      return ['LOW', 'NORMAL', 'HIGH', 'URGENT'].includes(a.priority ?? '')
        ? null
        : 'SET_PRIORITY exige uma prioridade válida';
    case 'ADD_COMMENT':
      return a.message ? null : 'ADD_COMMENT exige a mensagem';
    case 'EMIT_EVENT':
      return a.event ? null : 'EMIT_EVENT exige o nome do evento';
    case 'CANCEL_INSTANCE':
    case 'SUSPEND_INSTANCE':
      return a.reason ? null : `${a.type} exige uma justificação`;
    default:
      return 'Acção desconhecida';
  }
}

/** Substitui `{{campo}}` no texto por valores do contexto (ex.: `{{form.motivo}}`). */
export function interpolateTemplate(text: string, ctx: ConditionContext): string {
  return text.replace(/\{\{\s*([\w.:]+)\s*\}\}/g, (_m, key: string) => {
    const v = ctx[key];
    return v === undefined || v === null ? '' : String(v);
  });
}

// ─── Configuração por tipo de etapa ──────────────────────────────────────────

export interface StepConfig {
  /** TIMER */
  delayHours?: number;
  /** WAIT_EVENT */
  eventName?: string;
  /** NOTIFICATION */
  recipients?: string[];
  message?: string;
  /** INTEGRATION */
  module?: string;
  event?: string;
  /** AUTO_ACTION */
  actions?: StepAction[];
  /** DOCUMENT / FORM */
  template?: string;
}

export function parseStepConfig(raw: unknown): StepConfig | 'invalid' {
  if (raw === null || raw === undefined || raw === '') return {};
  let value: unknown = raw;
  if (typeof raw === 'string') {
    try {
      value = JSON.parse(raw);
    } catch {
      return 'invalid';
    }
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return 'invalid';
  return value as StepConfig;
}
