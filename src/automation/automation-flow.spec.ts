import {
  compileFlow,
  firstActionOf,
  parseFlow,
  validateFlow,
  FlowDefinition,
} from './automation-flow';
import { ActionType, ConditionOperator } from './automation.dto';

const flow: FlowDefinition = {
  steps: [
    {
      type: 'condition',
      rows: [{ field: 'active', operator: ConditionOperator.EQUALS, value: 'true' }],
      then: [{ type: 'action', action: ActionType.SEND_NOTIFICATION }],
      else: [
        { type: 'delay', minutes: 10 },
        { type: 'action', action: ActionType.CREATE_TASK },
      ],
    },
    { type: 'action', action: ActionType.LOG },
  ],
};

describe('automation-flow', () => {
  it('valida um fluxo correcto', () => {
    const r = validateFlow(flow);
    expect(r.valid).toBe(true);
    expect(r.stats).toMatchObject({ steps: 6, actions: 3, conditions: 1, delays: 1 });
  });

  it('rejeita fluxo vazio, acção desconhecida, atraso inválido e condição sem valor', () => {
    expect(validateFlow({ steps: [] }).valid).toBe(false);
    const r = validateFlow({
      steps: [
        { type: 'action', action: 'inexistente' },
        { type: 'delay', minutes: 0 },
        { type: 'condition', rows: [{ field: 'x', operator: ConditionOperator.EQUALS }] },
      ],
    });
    expect(r.valid).toBe(false);
    expect(r.errors).toHaveLength(3);
  });

  it('compila condições para saltos: ramo "não" começa em elsePc e "sim" salta o resto', () => {
    const program = compileFlow(flow);
    expect(program.map(i => i.kind)).toEqual([
      'branch', // 0
      'action', // 1 (sim)
      'jump', // 2 → fim do if
      'delay', // 3 (não)
      'action', // 4 (não)
      'action', // 5 (depois do if)
    ]);
    const branch = program[0];
    if (branch.kind !== 'branch') throw new Error('esperado branch');
    expect(branch.elsePc).toBe(3);
    const jump = program[2];
    if (jump.kind !== 'jump') throw new Error('esperado jump');
    expect(jump.to).toBe(5);
  });

  it('firstActionOf e parseFlow', () => {
    expect(firstActionOf(flow)).toBe(ActionType.SEND_NOTIFICATION);
    expect(parseFlow(JSON.stringify(flow))?.steps).toHaveLength(2);
    expect(parseFlow('{lixo')).toBeNull();
    expect(parseFlow(null)).toBeNull();
  });
});
