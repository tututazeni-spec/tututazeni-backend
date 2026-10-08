import {
  EXECUTIVE_TABS,
  KPI_CATALOG,
  PRIMARY_KPI_CODES,
  evaluateKpiState,
} from './executive-reports.kpi-catalog';

describe('executive-reports KPI catalog', () => {
  describe('evaluateKpiState — HIGHER_IS_BETTER (formação: meta 70, alerta 60, crítico 30)', () => {
    const def = KPI_CATALOG.TRAINING_COMPLETION;

    it.each([
      [null, 'NO_DATA'],
      [85, 'ON_TARGET'],
      [60, 'ON_TARGET'], // no limiar de alerta ainda não é alerta (valor < warning)
      [59.9, 'WARNING'],
      [30, 'WARNING'], // no limiar crítico ainda não é crítico
      [29.9, 'CRITICAL'],
      [0, 'CRITICAL'],
    ])('valor %p → %s', (value, expected) => {
      expect(evaluateKpiState(def, value as number | null)).toBe(expected);
    });
  });

  describe('evaluateKpiState — LOWER_IS_BETTER (rotatividade: alerta 5, crítico 10)', () => {
    const def = KPI_CATALOG.TURNOVER;

    it.each([
      [0, 'ON_TARGET'],
      [5, 'ON_TARGET'],
      [5.1, 'WARNING'],
      [10, 'WARNING'],
      [10.1, 'CRITICAL'],
    ])('valor %p → %s', (value, expected) => {
      expect(evaluateKpiState(def, value)).toBe(expected);
    });

    it('PDI atrasado: meta 0 ⇒ 0 acções está na meta, 6 está em alerta, 21 crítico', () => {
      const pdi = KPI_CATALOG.PDI_OVERDUE;
      expect(evaluateKpiState(pdi, 0)).toBe('ON_TARGET');
      expect(evaluateKpiState(pdi, 6)).toBe('WARNING');
      expect(evaluateKpiState(pdi, 21)).toBe('CRITICAL');
    });
  });

  it('KPI neutro (quadro de pessoal) nunca gera estado de alerta', () => {
    expect(evaluateKpiState(KPI_CATALOG.HEADCOUNT, 12)).toBe('NO_TARGET');
    expect(evaluateKpiState(KPI_CATALOG.HEADCOUNT, null)).toBe('NO_DATA');
  });

  it('KPI com meta mas sem limiares fica ON_TARGET', () => {
    const def = { ...KPI_CATALOG.ATTENDANCE, warningThreshold: null, criticalThreshold: null };
    expect(evaluateKpiState(def, 10)).toBe('ON_TARGET');
  });

  describe('documentação dos KPIs (fórmula, fonte, meta, período)', () => {
    it.each(PRIMARY_KPI_CODES)('%s tem fórmula, descrição e módulos de origem', code => {
      const def = KPI_CATALOG[code];
      expect(def.code).toBe(code);
      expect(def.formula.length).toBeGreaterThan(10);
      expect(def.description.length).toBeGreaterThan(5);
      expect(def.sourceModules.length).toBeGreaterThan(0);
    });

    it.each(PRIMARY_KPI_CODES)('%s tem limiares coerentes com o sentido do KPI', code => {
      const { direction, target, warningThreshold: w, criticalThreshold: c } = KPI_CATALOG[code];
      if (direction === 'NEUTRAL' || target === null) return;
      const seq = direction === 'HIGHER_IS_BETTER' ? [c, w, target] : [target, w, c];
      const nums = seq.filter((v): v is number => v !== null);
      nums.forEach((v, i) => {
        if (i > 0) expect(v).toBeGreaterThanOrEqual(nums[i - 1]);
      });
    });
  });

  describe('separadores e permissões', () => {
    it('Custos & Orçamento é restrito a ADMIN/DIRECTOR', () => {
      expect(EXECUTIVE_TABS.find(t => t.id === 'costs')?.roles).toEqual(['ADMIN', 'DIRECTOR']);
    });

    it('separadores de configuração/arquivo não são visíveis a GESTOR/LIDER', () => {
      for (const id of ['custom', 'scheduled', 'history']) {
        const roles = EXECUTIVE_TABS.find(t => t.id === id)?.roles ?? [];
        expect(roles).not.toContain('GESTOR');
        expect(roles).not.toContain('LIDER');
      }
    });

    it('COLABORADOR não vê nenhum separador', () => {
      expect(EXECUTIVE_TABS.some(t => t.roles.includes('COLABORADOR'))).toBe(false);
    });
  });
});
