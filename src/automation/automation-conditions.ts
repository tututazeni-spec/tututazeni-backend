// ============================================================
// INNOVA PLATFORM — AUTOMAÇÃO — CONDIÇÕES E PARSING
// Funções puras (sem I/O): parse de condições/parâmetros JSON da regra e avaliação
// das condições sobre o payload do evento. Extraído do AutomationService.
// ============================================================

import { Logger } from '@nestjs/common';
import { ConditionRuleDto, ConditionsLogic } from './automation.dto';
import type { AutomationRuleRecord } from './automation.service';

const helpersLogger = new Logger('AutomationHelpers');

// Condição/parâmetros de acção são JSON livre por regra — o shape varia
// consoante o tipo de trigger/acção, sem um contrato único possível.
export function parseCondition(condition?: string | null): Record<string, unknown> {
  if (!condition) return {};
  try {
    return JSON.parse(condition);
  } catch (e: unknown) {
    helpersLogger.warn({
      condition,
      action: 'PARSE_AUTOMATION_CONDITION',
      err: { message: e instanceof Error ? e.message : String(e) },
      msg: 'Falha ao fazer parse da condição da regra de automação — JSON inválido',
    });
    return {};
  }
}

// Formato estruturado gravado em AutomationRule.conditionsJson pelo condition
// builder do form (linhas field/operator/value + lógica E/OU entre elas).
// Ver ConditionRuleDto/ConditionsLogic em automation.dto.ts.
export interface StructuredConditions {
  logic: ConditionsLogic;
  rows: ConditionRuleDto[];
}

export function parseConditionsList(conditionsJson?: string | null): StructuredConditions | null {
  if (!conditionsJson) return null;
  try {
    const parsed = JSON.parse(conditionsJson) as Partial<StructuredConditions>;
    if (!Array.isArray(parsed.rows) || !parsed.rows.length) return null;
    return {
      logic: parsed.logic === ConditionsLogic.OR ? ConditionsLogic.OR : ConditionsLogic.AND,
      rows: parsed.rows,
    };
  } catch (e: unknown) {
    helpersLogger.warn({
      conditionsJson,
      action: 'PARSE_AUTOMATION_CONDITIONS_JSON',
      err: { message: e instanceof Error ? e.message : String(e) },
      msg: 'Falha ao fazer parse de conditionsJson — JSON inválido',
    });
    return null;
  }
}

export function evaluateConditionRow(
  row: ConditionRuleDto,
  payload: Record<string, unknown>,
): boolean {
  const actual = payload[row.field];
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
      return actual === undefined || actual === null || actual === '';
    case 'is_not_empty':
      return !(actual === undefined || actual === null || actual === '');
    case 'equals':
    default:
      return String(actual ?? '') === String(expected ?? '');
  }
}

// Substitui placeholders {{campo}} pelo valor em dynamicData, com fallback
// para o payload do evento — usado em messageTemplate/subject.
export function interpolate(
  template: string | undefined,
  dynamicData: Record<string, unknown> | undefined,
  payload: Record<string, unknown>,
): string | undefined {
  if (!template) return template;
  return template.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_match, key: string) => {
    const value = dynamicData?.[key] ?? payload[key];
    return value === undefined || value === null ? '' : String(value);
  });
}

export function parseJsonArray(json?: string | null): string[] {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json) as unknown;
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

export function parseParams(params?: string | null): Record<string, unknown> {
  if (!params) return {};
  try {
    return JSON.parse(params);
  } catch (e: unknown) {
    helpersLogger.warn({
      params,
      action: 'PARSE_AUTOMATION_ACTION_PARAMS',
      err: { message: e instanceof Error ? e.message : String(e) },
      msg: 'Falha ao fazer parse dos actionParams da regra de automação — JSON inválido',
    });
    return {};
  }
}

export function evaluateCondition(
  condition: Record<string, unknown>,
  payload: Record<string, unknown>,
): boolean {
  if (!Object.keys(condition).length) return true;

  for (const [key, value] of Object.entries(condition)) {
    const payloadVal = payload[key];
    if (
      key === 'minScore' &&
      typeof payloadVal === 'number' &&
      typeof value === 'number' &&
      payloadVal < value
    )
      return false;
    if (
      key === 'maxScore' &&
      typeof payloadVal === 'number' &&
      typeof value === 'number' &&
      payloadVal > value
    )
      return false;
    if (key === 'departmentId' && payloadVal !== value) return false;
    if (key === 'roleCode' && payloadVal !== value) return false;
    if (key === 'equals' && payloadVal !== value) return false;
  }
  return true;
}

// Prefere o condition builder estruturado (conditionsJson, com lógica E/OU
// entre linhas field/operator/value); cai para o campo `condition` legado
// (JSON simples chave→valor, só AND) quando não há linhas estruturadas.
export function evaluateRuleConditions(
  rule: AutomationRuleRecord,
  payload: Record<string, unknown>,
): boolean {
  const structured = parseConditionsList(rule.conditionsJson);
  if (structured) {
    const results = structured.rows.map(row => evaluateConditionRow(row, payload));
    return structured.logic === ConditionsLogic.OR ? results.some(Boolean) : results.every(Boolean);
  }
  return evaluateCondition(parseCondition(rule.condition), payload);
}
