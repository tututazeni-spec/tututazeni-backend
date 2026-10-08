import {
  actorTypeFor,
  approvalState,
  canTransitionProcess,
  isOverdue,
  processState,
  taskState,
} from './process-states';

describe('process-states (§18)', () => {
  describe('processState', () => {
    it('mapeia os estados persistidos para o vocabulário padrão', () => {
      expect(processState({ status: 'IN_PROGRESS' })).toBe('ACTIVE');
      expect(processState({ status: 'ON_HOLD' })).toBe('SUSPENDED');
      expect(processState({ status: 'COMPLETED' })).toBe('COMPLETED');
      expect(processState({ status: 'CANCELLED' })).toBe('CANCELLED');
    });

    it('deriva FAILED de uma etapa automática bloqueada por falha', () => {
      expect(
        processState({
          status: 'IN_PROGRESS',
          stepProgress: [{ status: 'BLOCKED', blockedReason: 'Falha automática: timeout' }],
        }),
      ).toBe('FAILED');
    });

    it('um bloqueio manual não é uma falha', () => {
      expect(
        processState({
          status: 'IN_PROGRESS',
          stepProgress: [{ status: 'BLOCKED', blockedReason: 'A aguardar documento' }],
        }),
      ).toBe('ACTIVE');
    });
  });

  describe('taskState / isOverdue', () => {
    const past = new Date(Date.now() - 3600_000);
    const future = new Date(Date.now() + 3600_000);

    it('OVERDUE é calculado a partir do prazo, só para tarefas abertas', () => {
      expect(taskState({ status: 'PENDING', slaDeadline: past })).toBe('OVERDUE');
      expect(taskState({ status: 'PENDING', slaDeadline: future })).toBe('PENDING');
      expect(taskState({ status: 'COMPLETED', slaDeadline: past })).toBe('COMPLETED');
      expect(isOverdue({ status: 'CANCELLED', slaDeadline: past })).toBe(false);
      expect(isOverdue({ status: 'IN_PROGRESS' })).toBe(false);
    });

    it('traduz os estados de tarefa', () => {
      expect(taskState({ status: 'IN_PROGRESS' })).toBe('IN_PROGRESS');
      expect(taskState({ status: 'ESCALATED' })).toBe('IN_PROGRESS');
      expect(taskState({ status: 'BLOCKED' })).toBe('BLOCKED');
    });
  });

  describe('approvalState', () => {
    it('mantém a decisão separada da delegação', () => {
      expect(approvalState({ status: 'PENDING', previousApproverId: 7 })).toEqual({
        state: 'PENDING',
        delegated: true,
      });
      expect(approvalState({ status: 'APPROVED' })).toEqual({
        state: 'APPROVED',
        delegated: false,
      });
    });

    it('estados intermédios contam como pendentes', () => {
      for (const status of ['WAITING', 'INFO_REQUESTED', 'ESCALATED']) {
        expect(approvalState({ status }).state).toBe('PENDING');
      }
    });
  });

  it('só permite transições de processo válidas', () => {
    expect(canTransitionProcess('ACTIVE', 'SUSPENDED')).toBe(true);
    expect(canTransitionProcess('SUSPENDED', 'ACTIVE')).toBe(true);
    expect(canTransitionProcess('COMPLETED', 'ACTIVE')).toBe(false);
    expect(canTransitionProcess('CANCELLED', 'ACTIVE')).toBe(false);
  });

  it('actorType deriva da origem', () => {
    expect(actorTypeFor('INTERFACE')).toBe('USER');
    expect(actorTypeFor('API')).toBe('INTEGRATION');
    expect(actorTypeFor('AUTOMATION')).toBe('AUTOMATION');
    expect(actorTypeFor('SYSTEM')).toBe('SYSTEM');
  });
});
