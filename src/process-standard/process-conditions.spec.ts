// Condições, acções e simulação de fluxos (docs/Modulo_Processes.md §8).
import {
  buildConditionContext,
  conditionsPass,
  parseConditionSet,
  parseStepActions,
} from './process-conditions';
import { addHours, simulateScenario, validateWorkflow } from './process-workflow';

describe('conditions', () => {
  const rows = (field: string, value: string) => ({
    logic: 'AND',
    rows: [{ field, operator: 'equals', value }],
  });

  it('avalia resultados de outras etapas e dados de formulário', () => {
    const ctx = buildConditionContext({
      progress: [{ stepOrder: 2, status: 'COMPLETED', result: 'REJECTED', formData: '{"x":"1"}' }],
    });
    expect(conditionsPass(rows('step:2.result', 'REJECTED'), ctx)).toBe(true);
    expect(conditionsPass(rows('step:2.result', 'APPROVED'), ctx)).toBe(false);
    expect(conditionsPass(rows('form.x', '1'), ctx)).toBe(true);
  });

  it('condições ausentes passam; JSON inválido é detectado', () => {
    expect(conditionsPass(null, {})).toBe(true);
    expect(parseConditionSet('{{')).toBe('invalid');
    expect(parseStepActions('[{"type":"NOPE"}]')).toBe('invalid');
  });
});

describe('workflow', () => {
  const steps = [
    { order: 0, title: 'Início', type: 'START' },
    { order: 1, title: 'Aprovar', type: 'REVIEW', responsibleRole: 'RH', onReject: 'BRANCH' },
    {
      order: 2,
      title: 'Executar',
      type: 'TASK',
      responsibleRole: 'RH',
      dependsOnOrders: [1],
      entryConditions: { logic: 'AND', rows: [{ field: 'step:1.result', operator: 'equals', value: 'APPROVED' }] },
    },
    {
      order: 3,
      title: 'Encerrar rejeição',
      type: 'TASK',
      responsibleRole: 'RH',
      dependsOnOrders: [1],
      entryConditions: { logic: 'AND', rows: [{ field: 'step:1.result', operator: 'equals', value: 'REJECTED' }] },
    },
    { order: 4, title: 'Fim', type: 'END', dependsOnOrders: [2, 3] },
  ];

  it('segue o ramo certo consoante o resultado da aprovação', () => {
    const ok = simulateScenario(steps);
    expect(ok.reachedEnd).toBe(true);
    expect(ok.skipped).toBe(1);
    const rejected = simulateScenario(steps, { results: { 1: 'REJECTED' } });
    expect(rejected.reachedEnd).toBe(true);
    expect(rejected.trace.flatMap(w => w.steps).find(s => s.order === 2)?.outcome).toBe('SKIPPED');
  });

  it('valida: aprovação sem aprovador e condição para etapa inexistente', () => {
    const bad = validateWorkflow([
      { order: 0, title: 'A', type: 'REVIEW' },
      { order: 1, title: 'B', type: 'END', entryConditions: { rows: [{ field: 'step:9.result', operator: 'equals', value: 'x' }] } },
    ]);
    expect(bad.valid).toBe(false);
    expect(bad.errors.join(' ')).toMatch(/aprovador/);
    expect(bad.structural.join(' ')).toMatch(/não existe/);
  });

  it('dias úteis saltam o fim de semana', () => {
    const friday = new Date(2026, 9, 2, 17, 0, 0); // sexta-feira
    const due = addHours(friday, 10, 'BUSINESS_DAYS');
    expect(due.getDay()).toBe(1); // segunda-feira
  });
});
