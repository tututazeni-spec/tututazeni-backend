import { growthRatio } from './scalability-alerts.service';

describe('growthRatio', () => {
  it('devolve null com menos de 3 meses de histórico', () => {
    expect(growthRatio([10, 20])).toBeNull();
  });
  it('devolve null quando a média anterior não cresceu', () => {
    expect(growthRatio([10, 10, 10, 30])).toBeNull();
  });
  it('compara o último mês com a média dos anteriores', () => {
    // deltas: 10, 10, 40 → 40 / 10 = 4
    expect(growthRatio([100, 110, 120, 160])).toBe(4);
  });
});
