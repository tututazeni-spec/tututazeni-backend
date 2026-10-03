// src/automation/automation-flow.ts
// Construtor de Fluxos (docs/modulo_automation.md §4): definição, validação e
// compilação de um fluxo de acções / condições (sim-não) / atrasos para uma
// lista linear de instruções — o ponteiro (`pc`) é o que permite retomar um
// fluxo depois de um atraso ou repetir só a partir da etapa que falhou.

import { ActionType, ConditionOperator, ConditionsLogic } from './automation.dto';

export interface FlowConditionRow {
  field: string;
  operator: ConditionOperator;
  value?: string;
}

export interface FlowActionStep {
  id?: string;
  type: 'action';
  label?: string;
  action: ActionType | string;
  params?: Record<string, unknown>;
  /** stop (omissão): o fluxo falha na etapa; continue: regista o erro e segue. */
  onError?: 'stop' | 'continue';
}

export interface FlowDelayStep {
  id?: string;
  type: 'delay';
  label?: string;
  minutes: number;
}

export interface FlowConditionStep {
  id?: string;
  type: 'condition';
  label?: string;
  logic?: ConditionsLogic;
  rows: FlowConditionRow[];
  then?: FlowStep[];
  else?: FlowStep[];
}

/**
 * §8 — pede uma aprovação (ou tarefa) a uma pessoa e suspende o fluxo até haver
 * decisão. A automação nunca decide por si: só a decisão humana retoma o fluxo.
 */
export interface FlowApprovalStep {
  id?: string;
  type: 'approval';
  label?: string;
  /** APPROVAL (omissão): aprovar/recusar. TASK: apenas concluir. */
  kind?: 'APPROVAL' | 'TASK';
  title: string;
  description?: string;
  /** Utilizador aprovador; omitido → resolve-se de `approverField` no payload. */
  approverId?: number;
  approverField?: string;
  substituteId?: number;
  escalateToId?: number;
  escalateAfterHours?: number;
  dueHours?: number;
  priority?: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
}

export type FlowStep = FlowActionStep | FlowDelayStep | FlowConditionStep | FlowApprovalStep;

export interface FlowDefinition {
  steps: FlowStep[];
}

export type FlowInstruction =
  | { kind: 'action'; step: FlowActionStep; ref: string }
  | { kind: 'delay'; step: FlowDelayStep; ref: string }
  | { kind: 'approval'; step: FlowApprovalStep; ref: string }
  | {
      kind: 'branch';
      step: FlowConditionStep;
      ref: string;
      elsePc: number;
    }
  | { kind: 'jump'; to: number; ref: string };

export const FLOW_LIMITS = {
  maxSteps: 50,
  maxDepth: 5,
  maxDelayMinutes: 60 * 24 * 30, // 30 dias
} as const;

const ACTION_VALUES = new Set<string>(Object.values(ActionType));
const OPERATOR_VALUES = new Set<string>(Object.values(ConditionOperator));
const NO_VALUE_OPERATORS = new Set<string>([
  ConditionOperator.IS_EMPTY,
  ConditionOperator.IS_NOT_EMPTY,
]);

export interface FlowValidation {
  valid: boolean;
  errors: string[];
  warnings: string[];
  stats: { steps: number; actions: number; conditions: number; delays: number; maxDepth: number };
}

/** Lê o JSON gravado em AutomationRule.flowJson; devolve null se não houver fluxo utilizável. */
export function parseFlow(flowJson?: string | null): FlowDefinition | null {
  if (!flowJson) return null;
  try {
    const parsed = JSON.parse(flowJson) as Partial<FlowDefinition>;
    return Array.isArray(parsed.steps) && parsed.steps.length
      ? { steps: parsed.steps as FlowStep[] }
      : null;
  } catch {
    return null;
  }
}

/** Valida a estrutura do fluxo sem tocar na BD (campos, limites, tipos de acção/operador). */
export function validateFlow(flow: FlowDefinition | null | undefined): FlowValidation {
  const errors: string[] = [];
  const warnings: string[] = [];
  const stats = { steps: 0, actions: 0, conditions: 0, delays: 0, maxDepth: 0 };

  if (!flow || !Array.isArray(flow.steps) || flow.steps.length === 0) {
    return {
      valid: false,
      errors: ['O fluxo não tem nenhuma etapa.'],
      warnings,
      stats,
    };
  }

  const walk = (steps: FlowStep[], depth: number, path: string) => {
    stats.maxDepth = Math.max(stats.maxDepth, depth);
    if (depth > FLOW_LIMITS.maxDepth) {
      errors.push(`${path}: ramificações demasiado profundas (máximo ${FLOW_LIMITS.maxDepth}).`);
      return;
    }
    steps.forEach((step, i) => {
      const where = `${path}${i + 1}`;
      const label = step.label ? ` "${step.label}"` : '';
      stats.steps += 1;
      switch (step?.type) {
        case 'action': {
          stats.actions += 1;
          if (!step.action || !ACTION_VALUES.has(step.action)) {
            errors.push(`Etapa ${where}${label}: acção "${step.action ?? ''}" desconhecida.`);
          } else if (step.action === ActionType.WAIT) {
            warnings.push(`Etapa ${where}${label}: use um bloco de atraso em vez da acção "wait".`);
          }
          if (
            step.params !== undefined &&
            (typeof step.params !== 'object' || step.params === null)
          ) {
            errors.push(`Etapa ${where}${label}: os parâmetros têm de ser um objecto.`);
          }
          break;
        }
        case 'delay': {
          stats.delays += 1;
          if (
            !Number.isInteger(step.minutes) ||
            step.minutes < 1 ||
            step.minutes > FLOW_LIMITS.maxDelayMinutes
          ) {
            errors.push(
              `Etapa ${where}${label}: o atraso tem de estar entre 1 minuto e ${FLOW_LIMITS.maxDelayMinutes / 1440} dias.`,
            );
          }
          break;
        }
        case 'approval': {
          if (!step.title?.trim()) {
            errors.push(`Etapa ${where}${label}: o pedido de aprovação precisa de um título.`);
          }
          if (!step.approverId && !step.approverField) {
            errors.push(`Etapa ${where}${label}: indique o aprovador (utilizador ou campo).`);
          }
          if (step.approverId !== undefined && !Number.isInteger(step.approverId)) {
            errors.push(`Etapa ${where}${label}: aprovador inválido.`);
          }
          if (
            step.escalateToId !== undefined &&
            (!step.escalateAfterHours || step.escalateAfterHours < 1)
          ) {
            errors.push(`Etapa ${where}${label}: o escalonamento precisa de um prazo em horas.`);
          }
          if (
            step.dueHours !== undefined &&
            (!Number.isInteger(step.dueHours) || step.dueHours < 1)
          ) {
            errors.push(`Etapa ${where}${label}: o prazo tem de ser um número de horas ≥ 1.`);
          }
          break;
        }
        case 'condition': {
          stats.conditions += 1;
          if (!Array.isArray(step.rows) || step.rows.length === 0) {
            errors.push(`Etapa ${where}${label}: a condição não tem nenhuma linha.`);
          } else {
            step.rows.forEach((row, r) => {
              if (!row?.field) errors.push(`Etapa ${where}${label}: linha ${r + 1} sem campo.`);
              if (!OPERATOR_VALUES.has(row?.operator)) {
                errors.push(`Etapa ${where}${label}: linha ${r + 1} com operador inválido.`);
              } else if (
                !NO_VALUE_OPERATORS.has(row.operator) &&
                (row.value === undefined || row.value === '')
              ) {
                errors.push(`Etapa ${where}${label}: linha ${r + 1} sem valor esperado.`);
              }
            });
          }
          if (!step.then?.length && !step.else?.length) {
            warnings.push(`Etapa ${where}${label}: nenhum dos ramos (Sim / Não) tem etapas.`);
          }
          walk(step.then ?? [], depth + 1, `${where}.sim.`);
          walk(step.else ?? [], depth + 1, `${where}.não.`);
          break;
        }
        default:
          errors.push(
            `Etapa ${where}: tipo "${(step as { type?: string })?.type ?? ''}" desconhecido.`,
          );
      }
    });
  };

  walk(flow.steps, 0, '');
  if (stats.steps > FLOW_LIMITS.maxSteps) {
    errors.push(`O fluxo tem ${stats.steps} etapas (máximo ${FLOW_LIMITS.maxSteps}).`);
  }
  if (stats.actions === 0) warnings.push('O fluxo não tem nenhuma acção — não fará nada.');

  return { valid: errors.length === 0, errors, warnings, stats };
}

/** Achata o fluxo em instruções lineares (condição → ramo "não" por salto). */
export function compileFlow(flow: FlowDefinition): FlowInstruction[] {
  const out: FlowInstruction[] = [];
  const emit = (steps: FlowStep[], path: string) => {
    steps.forEach((step, i) => {
      const ref = step.id ?? `${path}${i + 1}`;
      if (step.type === 'action') out.push({ kind: 'action', step, ref });
      else if (step.type === 'delay') out.push({ kind: 'delay', step, ref });
      else if (step.type === 'approval') out.push({ kind: 'approval', step, ref });
      else if (step.type === 'condition') {
        const branch: FlowInstruction = { kind: 'branch', step, ref, elsePc: -1 };
        out.push(branch);
        emit(step.then ?? [], `${ref}.sim.`);
        const jump: FlowInstruction = { kind: 'jump', to: -1, ref };
        out.push(jump);
        branch.elsePc = out.length;
        emit(step.else ?? [], `${ref}.nao.`);
        jump.to = out.length;
      }
    });
  };
  emit(flow.steps, '');
  return out;
}

/** Primeira acção do fluxo — preenche AutomationRule.action (coluna legada obrigatória). */
export function firstActionOf(flow: FlowDefinition | null | undefined): string | undefined {
  const find = (steps: FlowStep[] = []): string | undefined => {
    for (const s of steps) {
      if (s.type === 'action') return s.action;
      if (s.type === 'condition') {
        const inner = find(s.then) ?? find(s.else);
        if (inner) return inner;
      }
    }
    return undefined;
  };
  return find(flow?.steps);
}
