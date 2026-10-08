import { addMonths, linearFit, monthsToReach, project } from './scalability-forecast.math';

describe('scalability-forecast.math', () => {
  it('projecta crescimento composto (exemplo do spec: 5,8%/mês ≈ 1,96x em 12 meses)', () => {
    const series = [6000, 6348, 6716, 7106, 7518, 7954];
    const p = project(series, 'compound')!;
    expect(p.monthlyGrowthPercent).toBeCloseTo(5.8, 0);
    expect(p.at(12) / series[series.length - 1]).toBeCloseTo(1.96, 1);
  });

  it('projecta tendência linear e nunca devolve negativos', () => {
    const p = project([10, 8, 6, 4], 'linear')!;
    expect(p.at(1)).toBeCloseTo(2);
    expect(p.at(12)).toBe(0);
  });

  it('devolve null com menos de 2 pontos', () => {
    expect(project([5], 'linear')).toBeNull();
  });

  it('monthsToReach: 0 se já atingido, null se nunca', () => {
    const grow = project([1, 2, 3, 4], 'linear')!;
    expect(monthsToReach(grow, 4, 3)).toBe(0);
    expect(monthsToReach(grow, 4, 10)).toBe(6);
    const flat = project([5, 5, 5], 'linear')!;
    expect(monthsToReach(flat, 5, 10)).toBeNull();
  });

  it('R² 1 numa recta perfeita e confiança alta com histórico longo', () => {
    expect(linearFit([1, 2, 3, 4, 5, 6]).r2).toBeCloseTo(1);
    expect(project([1, 2, 3, 4, 5, 6], 'linear')!.confidence).toBe('ALTA');
    expect(project([1, 9], 'linear')!.confidence).toBe('BAIXA');
  });

  it('addMonths avança o calendário', () => {
    expect(addMonths(new Date(2026, 9, 5), 5).getMonth()).toBe(2);
  });
});
