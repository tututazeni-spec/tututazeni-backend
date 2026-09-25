// src/roi-impact/correlation-stats.util.ts
// Matemática pura para "Correlações" (docs/roi-impact.md §7): coeficiente de
// Pearson + significância estatística (teste-t bicaudal sobre a distribuição
// t-Student, via função beta incompleta regularizada — Lentz/Numerical
// Recipes). Sem dependência externa: o projecto não usa nenhuma lib de
// estatística/gráficos noutro sítio, e esta é a única fórmula necessária.

export interface CorrelationPoint {
  x: number;
  y: number;
  label?: string;
}

export interface CorrelationResult {
  coefficient: number;
  pValue: number;
  significant: boolean;
}

// Amostra mínima abaixo da qual o coeficiente não é apresentado como número
// definitivo (mesmo princípio de RoiAnalysisService: DADOS_INSUFICIENTES em
// vez de falsa precisão — ver "Princípio orientador" em docs/roi-impact.md).
export const MIN_CORRELATION_SAMPLE = 5;

function logGamma(x: number): number {
  const g = 7;
  const c = [
    0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313,
    -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6,
    1.5056327351493116e-7,
  ];
  if (x < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * x)) - logGamma(1 - x);
  x -= 1;
  let a = c[0];
  const t = x + g + 0.5;
  for (let i = 1; i < g + 2; i++) a += c[i] / (x + i);
  return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
}

function betacf(x: number, a: number, b: number): number {
  const MAXIT = 200;
  const EPS = 3e-9;
  const FPMIN = 1e-30;
  const qab = a + b;
  const qap = a + 1;
  const qam = a - 1;
  let c = 1;
  let d = 1 - (qab * x) / qap;
  if (Math.abs(d) < FPMIN) d = FPMIN;
  d = 1 / d;
  let h = d;
  for (let m = 1; m <= MAXIT; m++) {
    const m2 = 2 * m;
    let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c;
    if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    h *= d * c;
    aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c;
    if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < EPS) break;
  }
  return h;
}

function incompleteBeta(x: number, a: number, b: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const bt = Math.exp(
    logGamma(a + b) - logGamma(a) - logGamma(b) + a * Math.log(x) + b * Math.log(1 - x),
  );
  if (x < (a + 1) / (a + b + 2)) return (bt * betacf(x, a, b)) / a;
  return 1 - (bt * betacf(1 - x, b, a)) / b;
}

// P(|T| > |t|) para uma t-Student com `df` graus de liberdade (bicaudal).
function tTwoTailedP(t: number, df: number): number {
  const x = df / (df + t * t);
  return incompleteBeta(x, df / 2, 0.5);
}

/**
 * Coeficiente de correlação de Pearson + significância (teste-t bicaudal).
 * Devolve `null` quando a amostra é insuficiente (< MIN_CORRELATION_SAMPLE)
 * ou quando uma das variáveis não tem variância (correlação indefinida) —
 * nestes casos o chamador deve marcar o resultado como dados insuficientes,
 * nunca apresentar um coeficiente forçado (ex.: 0).
 */
export function computePearson(points: CorrelationPoint[]): CorrelationResult | null {
  const n = points.length;
  if (n < MIN_CORRELATION_SAMPLE) return null;

  const meanX = points.reduce((s, p) => s + p.x, 0) / n;
  const meanY = points.reduce((s, p) => s + p.y, 0) / n;
  let num = 0;
  let denX = 0;
  let denY = 0;
  for (const p of points) {
    const dx = p.x - meanX;
    const dy = p.y - meanY;
    num += dx * dy;
    denX += dx * dx;
    denY += dy * dy;
  }
  if (denX === 0 || denY === 0) return null;

  const r = num / Math.sqrt(denX * denY);
  const df = n - 2;
  if (df <= 0) return null;

  const t = (r * Math.sqrt(df)) / Math.sqrt(Math.max(1 - r * r, 1e-9));
  const pValue = Math.min(1, Math.max(0, tTwoTailedP(t, df)));

  return {
    coefficient: +r.toFixed(3),
    pValue: +pValue.toFixed(4),
    significant: pValue < 0.05,
  };
}
