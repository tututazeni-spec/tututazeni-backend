import { evaluatePoolBudget } from './pool-budget';

describe('evaluatePoolBudget', () => {
  it('ok: pool pequeno num servidor com folga', () => {
    const r = evaluatePoolBudget({ poolMax: 20, serverMax: 100, othersInUse: 10 });
    expect(r.level).toBe('ok');
    expect(r.available).toBe(87);
  });

  it('error: duas instâncias com o default de 50 esgotam max_connections=100', () => {
    // a 2ª instância arranca quando a 1ª já tem 50 ligações abertas
    const r = evaluatePoolBudget({ poolMax: 50, serverMax: 100, othersInUse: 50 });
    expect(r.level).toBe('error');
    expect(r.message).toContain('DB_POOL_MAX');
    expect(r.message).toContain('só há 47 livres');
  });

  it('warn: cabe, mas passa dos 80% em pico', () => {
    const r = evaluatePoolBudget({ poolMax: 30, serverMax: 100, othersInUse: 50 });
    expect(r.level).toBe('warn');
  });

  it('respeita as ligações reservadas a superutilizadores', () => {
    expect(evaluatePoolBudget({ poolMax: 10, serverMax: 12, othersInUse: 0 }).level).toBe('error');
    expect(
      evaluatePoolBudget({ poolMax: 9, serverMax: 12, othersInUse: 0, reserved: 3 }).available,
    ).toBe(9);
  });

  it('servidor mais pequeno que as reservas nunca dá disponibilidade negativa', () => {
    const r = evaluatePoolBudget({ poolMax: 1, serverMax: 2, othersInUse: 0 });
    expect(r.level).toBe('error');
    expect(r.available).toBe(0);
  });
});
