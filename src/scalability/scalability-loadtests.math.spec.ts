import { suggestVerdict } from './scalability-loadtests.math';

describe('suggestVerdict', () => {
  it('devolve null sem resultados completos', () => {
    expect(suggestVerdict({ p95Ms: 100, p99Ms: null, errorRate: 0 })).toBeNull();
  });
  it('aprova quando todos os limiares são cumpridos', () => {
    expect(suggestVerdict({ p95Ms: 900, p99Ms: 2000, errorRate: 0.2 })).toBe('APPROVED');
  });
  it('aprova com observações quando um limiar é excedido até 25%', () => {
    expect(suggestVerdict({ p95Ms: 3500, p99Ms: 2000, errorRate: 0.2 })).toBe(
      'APPROVED_WITH_NOTES',
    );
  });
  it('reprova com excesso grande ou vários limiares excedidos', () => {
    expect(suggestVerdict({ p95Ms: 9000, p99Ms: 2000, errorRate: 0.2 })).toBe('FAILED');
    expect(suggestVerdict({ p95Ms: 3100, p99Ms: 8100, errorRate: 0.2 })).toBe('FAILED');
  });
});
