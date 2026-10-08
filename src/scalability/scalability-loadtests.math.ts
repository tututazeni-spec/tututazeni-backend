// modulo_scalability.md §20 — sugestão de veredicto a partir dos limiares do
// projecto (CLAUDE.md, ambiente local: p95 < 3000 ms, p99 < 8000 ms, erros < 1%).

export type Verdict = 'APPROVED' | 'APPROVED_WITH_NOTES' | 'FAILED';

export const LOAD_TEST_THRESHOLDS = { p95Ms: 3000, p99Ms: 8000, errorRatePercent: 1 } as const;

export interface LoadTestResults {
  p95Ms: number | null;
  p99Ms: number | null;
  errorRate: number | null;
}

export interface Breach {
  metric: 'p95Ms' | 'p99Ms' | 'errorRate';
  value: number;
  limit: number;
  /** quanto o valor excede o limite (0.25 = 25% acima) */
  excess: number;
}

export function findBreaches(r: LoadTestResults): Breach[] {
  const limits = [
    ['p95Ms', r.p95Ms, LOAD_TEST_THRESHOLDS.p95Ms],
    ['p99Ms', r.p99Ms, LOAD_TEST_THRESHOLDS.p99Ms],
    ['errorRate', r.errorRate, LOAD_TEST_THRESHOLDS.errorRatePercent],
  ] as const;
  const out: Breach[] = [];
  for (const [metric, value, limit] of limits) {
    if (value !== null && value > limit) {
      out.push({ metric, value, limit, excess: (value - limit) / limit });
    }
  }
  return out;
}

/**
 * Sem resultados suficientes não há sugestão. Todos os limiares cumpridos →
 * aprovado; um só excedido em até 25% → aprovado com observações; senão reprovado.
 */
export function suggestVerdict(r: LoadTestResults): Verdict | null {
  if (r.p95Ms === null || r.p99Ms === null || r.errorRate === null) return null;
  const breaches = findBreaches(r);
  if (!breaches.length) return 'APPROVED';
  if (breaches.length === 1 && breaches[0].excess <= 0.25) return 'APPROVED_WITH_NOTES';
  return 'FAILED';
}
