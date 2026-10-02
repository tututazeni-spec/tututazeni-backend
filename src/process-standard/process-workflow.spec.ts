import {
  deriveInstanceMetrics,
  effectiveDependencies,
  formatInstanceCode,
  formatTaskCode,
  planActivation,
  sequenceFromCode,
  validateWorkflow,
} from './process-workflow';

const step = (order: number, extra: Record<string, unknown> = {}) => ({
  order,
  title: `E${order}`,
  type: 'TASK',
  responsibleRole: 'RH',
  ...extra,
});

describe('process-workflow', () => {
  describe('effectiveDependencies', () => {
    it('sequencial por defeito: depende da etapa anterior', () => {
      const deps = effectiveDependencies([step(0), step(1), step(2)]);
      expect(deps.get(0)).toEqual([]);
      expect(deps.get(1)).toEqual([0]);
      expect(deps.get(2)).toEqual([1]);
    });

    it('paralela arranca logo; dependências explícitas têm prioridade', () => {
      const deps = effectiveDependencies([
        step(0),
        step(1, { parallel: true }),
        step(2, { dependsOnOrders: [0, 1] }),
      ]);
      expect(deps.get(1)).toEqual([]);
      expect(deps.get(2)).toEqual([0, 1]);
    });
  });

  describe('validateWorkflow', () => {
    it('sem etapas é inválido', () => {
      expect(validateWorkflow([]).valid).toBe(false);
    });

    it('simula ondas: paralelas na mesma onda, junção na seguinte', () => {
      const r = validateWorkflow([
        step(0),
        step(1, { parallel: true }),
        step(2, { dependsOnOrders: [0, 1] }),
      ]);
      expect(r.valid).toBe(true);
      expect(r.simulation).toEqual([
        { wave: 1, steps: ['E0', 'E1'] },
        { wave: 2, steps: ['E2'] },
      ]);
    });

    it('detecta ciclos como erro estrutural', () => {
      const r = validateWorkflow([
        step(0, { dependsOnOrders: [1] }),
        step(1, { dependsOnOrders: [0] }),
      ]);
      expect(r.valid).toBe(false);
      expect(r.structural.join(' ')).toMatch(/Ciclo/);
    });

    it('detecta dependência inexistente e auto-dependência', () => {
      const r = validateWorkflow([step(0, { dependsOnOrders: [0, 9] })]);
      expect(r.structural).toHaveLength(2);
    });

    it('etapa de tarefa sem responsável é erro, mas não estrutural', () => {
      const r = validateWorkflow([{ order: 0, title: 'X', type: 'TASK' }]);
      expect(r.valid).toBe(false);
      expect(r.structural).toHaveLength(0);
    });
  });

  describe('planActivation', () => {
    const steps = [step(0), step(1), step(2, { dependsOnOrders: [0, 1] })];
    const rows = (statuses: string[]) =>
      statuses.map((status, i) => ({ id: i + 1, stepId: i + 10, stepOrder: i, status }));

    it('activa a seguinte quando a anterior conclui', () => {
      const plan = planActivation(steps, rows(['COMPLETED', 'WAITING', 'WAITING']));
      expect(plan.activate).toEqual([2]);
      expect(plan.demote).toEqual([]);
    });

    it('a junção só activa com todas as dependências concluídas', () => {
      expect(planActivation(steps, rows(['COMPLETED', 'COMPLETED', 'WAITING'])).activate).toEqual([
        3,
      ]);
      expect(planActivation(steps, rows(['COMPLETED', 'PENDING', 'WAITING'])).activate).toEqual([]);
    });

    it('devolução recua as dependentes já activas', () => {
      const plan = planActivation(steps, rows(['PENDING', 'COMPLETED', 'PENDING']));
      expect(plan.demote).toEqual([3]);
    });
  });

  describe('códigos', () => {
    it('formata e extrai a sequência', () => {
      expect(formatInstanceCode(2026, 7)).toBe('PROC-2026-0007');
      expect(sequenceFromCode('PROC-2026-0042')).toBe(42);
      expect(sequenceFromCode(null)).toBe(0);
      expect(sequenceFromCode('xx')).toBe(0);
      expect(formatTaskCode('PROC-2026-0001', 1, 3)).toBe('PROC-2026-0001-T03');
    });
  });

  describe('deriveInstanceMetrics', () => {
    const now = new Date('2026-10-10T12:00:00Z');
    const base = {
      status: 'IN_PROGRESS',
      startedAt: new Date('2026-10-01T12:00:00Z'),
      completedAt: null,
      cancelledAt: null,
      suspendedAt: null,
      slaDeadline: new Date('2026-10-20T12:00:00Z'),
    };

    it('progresso ignora canceladas e conta ignoradas como feitas', () => {
      const m = deriveInstanceMetrics(
        base,
        [
          { status: 'COMPLETED' },
          { status: 'SKIPPED' },
          { status: 'PENDING' },
          { status: 'CANCELLED' },
        ],
        now,
      );
      expect(m.progress).toBe(67);
    });

    it('situação do prazo: dentro, em risco, atrasado', () => {
      expect(deriveInstanceMetrics(base, [], now).deadlineSituation).toBe('ON_TIME');
      expect(
        deriveInstanceMetrics({ ...base, slaDeadline: new Date('2026-10-10T20:00:00Z') }, [], now)
          .deadlineSituation,
      ).toBe('AT_RISK');
      expect(
        deriveInstanceMetrics({ ...base, slaDeadline: new Date('2026-10-09T12:00:00Z') }, [], now)
          .deadlineSituation,
      ).toBe('OVERDUE');
    });

    it('concluído fora de prazo fica atrasado; cancelado sem prazo', () => {
      const late = deriveInstanceMetrics(
        { ...base, status: 'COMPLETED', completedAt: new Date('2026-10-25T12:00:00Z') },
        [],
        now,
      );
      expect(late.deadlineSituation).toBe('OVERDUE');
      expect(late.remainingHours).toBeNull();
      expect(
        deriveInstanceMetrics({ ...base, status: 'CANCELLED' }, [], now).deadlineSituation,
      ).toBe('NONE');
    });
  });
});
