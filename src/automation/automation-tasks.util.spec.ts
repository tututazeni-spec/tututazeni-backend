import {
  appendHistory,
  canDecide,
  nextEscalationAction,
  parseHistory,
} from './automation-tasks.util';
import { redactSensitive } from './automation-redact.util';
import { validateFlow } from './automation-flow';

describe('automation-tasks.util', () => {
  const H = 3_600_000;
  const base = new Date('2026-10-01T10:00:00Z');
  const task = (over: Partial<Parameters<typeof nextEscalationAction>[0]> = {}) => ({
    createdAt: base,
    dueAt: null,
    escalateToId: null,
    escalateAfterHours: null,
    escalatedAt: null,
    ...over,
  });

  it('só o aprovador, o substituto ou a administração decidem', () => {
    const t = { approverId: 1, substituteId: 2 };
    expect(canDecide(t, 1, false)).toBe(true);
    expect(canDecide(t, 2, false)).toBe(true);
    expect(canDecide(t, 3, false)).toBe(false);
    expect(canDecide(t, 3, true)).toBe(true);
  });

  it('escalona depois do prazo de escalonamento, uma só vez', () => {
    const t = task({ escalateToId: 9, escalateAfterHours: 4 });
    expect(nextEscalationAction(t, new Date(base.getTime() + 3 * H))).toBe('NONE');
    expect(nextEscalationAction(t, new Date(base.getTime() + 5 * H))).toBe('ESCALATE');
    expect(
      nextEscalationAction({ ...t, escalatedAt: new Date() }, new Date(base.getTime() + 5 * H)),
    ).toBe('NONE');
  });

  it('expira só depois do prazo e sem escalonamento possível', () => {
    const due = new Date(base.getTime() + 2 * H);
    expect(nextEscalationAction(task({ dueAt: due }), new Date(base.getTime() + H))).toBe('NONE');
    expect(nextEscalationAction(task({ dueAt: due }), new Date(base.getTime() + 3 * H))).toBe(
      'EXPIRE',
    );
    // com escalonamento por fazer, o escalonamento ganha ao prazo
    expect(
      nextEscalationAction(
        task({ dueAt: due, escalateToId: 9, escalateAfterHours: 1 }),
        new Date(base.getTime() + 3 * H),
      ),
    ).toBe('ESCALATE');
  });

  it('o histórico acumula entradas', () => {
    const a = appendHistory(null, { by: 1, action: 'CREATED' });
    const b = appendHistory(a, { by: null, action: 'ESCALATED', from: 1, to: 9 });
    expect(parseHistory(b).map(h => h.action)).toEqual(['CREATED', 'ESCALATED']);
    expect(parseHistory('{lixo')).toEqual([]);
  });
});

describe('redactSensitive', () => {
  it('oculta palavras-passe, tokens e cabeçalhos de autorização em profundidade', () => {
    const out = redactSensitive({
      url: 'https://x.test',
      headers: { Authorization: 'Bearer abcdefghijkl', 'X-Api-Key': 'k' },
      body: { password: 'p', nested: [{ token: 't', ok: 1 }] },
      note: 'usa Bearer abcdefghijkl123',
    }) as Record<string, any>;
    expect(out.headers.Authorization).toBe('***');
    expect(out.headers['X-Api-Key']).toBe('***');
    expect(out.body.password).toBe('***');
    expect(out.body.nested[0]).toEqual({ token: '***', ok: 1 });
    expect(out.note).not.toContain('abcdefghijkl123');
    expect(out.url).toBe('https://x.test');
  });
});

describe('validateFlow — etapa de aprovação', () => {
  it('exige título e aprovador; escalonamento exige prazo', () => {
    const bad = validateFlow({
      steps: [{ type: 'approval', title: '', escalateToId: 5 } as never],
    });
    expect(bad.valid).toBe(false);
    expect(bad.errors.length).toBeGreaterThanOrEqual(3);
    const ok = validateFlow({
      steps: [{ type: 'approval', title: 'Aprovar', approverId: 3, dueHours: 24 }],
    });
    expect(ok.errors).toEqual([]);
  });
});
