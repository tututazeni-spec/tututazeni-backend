// modulo_scalability.md §19 — matemática pura das previsões (sem I/O, testável).

export type Confidence = 'ALTA' | 'MEDIA' | 'BAIXA';
export type ForecastMethod = 'compound' | 'linear';

export interface Projection {
  method: ForecastMethod;
  /** crescimento médio por mês: % composto (compound) ou unidades/mês (linear) */
  monthlyRate: number;
  monthlyGrowthPercent: number | null;
  confidence: Confidence;
  at: (monthsAhead: number) => number;
}

const round = (n: number, d = 1) => {
  const f = 10 ** d;
  return Math.round(n * f) / f;
};

/** Regressão linear por mínimos quadrados sobre índices 0..n-1; devolve declive, ordenada e R². */
export function linearFit(values: number[]) {
  const n = values.length;
  const meanX = (n - 1) / 2;
  const meanY = values.reduce((s, v) => s + v, 0) / n;
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  values.forEach((y, x) => {
    sxy += (x - meanX) * (y - meanY);
    sxx += (x - meanX) ** 2;
    syy += (y - meanY) ** 2;
  });
  const slope = sxx === 0 ? 0 : sxy / sxx;
  const intercept = meanY - slope * meanX;
  const r2 = syy === 0 ? 1 : (sxy * sxy) / (sxx * syy);
  return { slope, intercept, r2 };
}

function confidenceOf(points: number, r2: number): Confidence {
  if (points >= 6 && r2 >= 0.85) return 'ALTA';
  if (points >= 4 && r2 >= 0.6) return 'MEDIA';
  return 'BAIXA';
}

/**
 * Projecta uma série mensal (mais antiga → mais recente). Devolve null com
 * menos de 2 pontos — não há tendência para extrapolar.
 * - compound: taxa composta entre o primeiro e o último ponto (utilizadores);
 * - linear: declive dos mínimos quadrados (BD, storage, tráfego, CPU/RAM).
 */
export function project(series: number[], method: ForecastMethod): Projection | null {
  if (series.length < 2) return null;
  const last = series[series.length - 1];
  const first = series[0];
  const { slope, r2 } = linearFit(series);
  const confidence = confidenceOf(series.length, r2);

  if (method === 'compound' && first > 0 && last > 0) {
    const rate = (last / first) ** (1 / (series.length - 1)) - 1;
    return {
      method,
      monthlyRate: rate,
      monthlyGrowthPercent: round(rate * 100),
      confidence,
      at: m => last * (1 + rate) ** m,
    };
  }
  return {
    method: 'linear',
    monthlyRate: slope,
    monthlyGrowthPercent: last > 0 ? round((slope / last) * 100) : null,
    confidence,
    // um recurso nunca fica negativo
    at: m => Math.max(0, last + slope * m),
  };
}

/** Primeiro mês (1..maxMonths) em que a projecção atinge `target`; 0 se já atingiu; null se nunca. */
export function monthsToReach(p: Projection, current: number, target: number, maxMonths = 60) {
  if (current >= target) return 0;
  for (let m = 1; m <= maxMonths; m++) if (p.at(m) >= target) return m;
  return null;
}

export function addMonths(from: Date, months: number): Date {
  const d = new Date(from);
  d.setMonth(d.getMonth() + months);
  return d;
}

const MONTHS_PT = [
  'janeiro',
  'fevereiro',
  'março',
  'abril',
  'maio',
  'junho',
  'julho',
  'agosto',
  'setembro',
  'outubro',
  'novembro',
  'dezembro',
];

export function monthLabelPt(d: Date): string {
  return `${MONTHS_PT[d.getMonth()]} de ${d.getFullYear()}`;
}
