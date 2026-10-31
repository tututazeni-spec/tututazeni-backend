// ============================================================
// INNOVA PLATFORM — AVALIAÇÃO — CÁLCULO DE PONTUAÇÃO
// Funções puras partilhadas pelo EvaluationService e pelos seus colaboradores.
// ============================================================

import { EvalType } from './evaluation.dto';

/** Weighted average: { type → score } + weights config */
export function weightedScore(
  scores: Record<string, number>,
  weights: { type: string; weight: number; selfEvalIncluded: boolean }[],
): number {
  let total = 0,
    totalWeight = 0;
  for (const w of weights) {
    if (w.type === EvalType.SELF && !w.selfEvalIncluded) continue;
    if (scores[w.type] !== undefined) {
      total += scores[w.type] * w.weight;
      totalWeight += w.weight;
    }
  }
  return totalWeight > 0 ? +(total / totalWeight).toFixed(2) : 0;
}

/** Remove statistical outliers (values > 2 SD from mean) */
export function removeOutliers(values: number[]): number[] {
  if (values.length < 4) return values;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const sd = Math.sqrt(values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length);
  return values.filter(v => Math.abs(v - mean) <= 2 * sd);
}

/** Compute percentile rank of value in array */
export function percentile(value: number, allValues: number[]): number {
  if (!allValues.length) return 50;
  const below = allValues.filter(v => v < value).length;
  return Math.round((below / allValues.length) * 100);
}

// ─── Avaliação de desempenho robusta (docs/avaliacao_desempenho_robusta_claude_code.md) ───
// Regras de cálculo centralizadas no backend; o frontend só apresenta o que
// o servidor devolve, para que o valor mostrado seja o valor persistido.

export interface RatingLevel {
  value: number;
  label: string;
  description: string;
}

/** Escala de desempenho 1–5 (não existe zero). */
export const RATING_SCALE: readonly RatingLevel[] = [
  {
    value: 1,
    label: 'Muito fraco',
    description: 'Não demonstra a competência ou apresenta desempenho muito abaixo do esperado.',
  },
  {
    value: 2,
    label: 'Insuficiente',
    description: 'Demonstra a competência de forma limitada e abaixo do esperado.',
  },
  { value: 3, label: 'Bom', description: 'Cumpre o nível de desempenho esperado.' },
  {
    value: 4,
    label: 'Muito bom',
    description: 'Demonstra desempenho acima do esperado com consistência.',
  },
  {
    value: 5,
    label: 'Excelente',
    description: 'Demonstra domínio elevado e supera consistentemente as expectativas.',
  },
];

export interface RatingBand {
  min: number;
  max: number;
  label: string;
}

/** Faixas de referência (configuráveis); intervalos contíguos em passos de 0,01. */
export const DEFAULT_RATING_BANDS: readonly RatingBand[] = [
  { min: 1, max: 1.49, label: 'Muito fraco' },
  { min: 1.5, max: 2.49, label: 'Insuficiente' },
  { min: 2.5, max: 3.49, label: 'Bom' },
  { min: 3.5, max: 4.49, label: 'Muito bom' },
  { min: 4.5, max: 5, label: 'Excelente' },
];

const BAND_STEP = 0.01;
const EPS = 1e-9;

/** Devolve a lista de problemas das faixas (vazia = válidas): cobertura 1–5, sem lacunas nem sobreposições. */
export function validateRatingBands(bands: readonly RatingBand[]): string[] {
  const errors: string[] = [];
  if (!bands.length) return ['É necessário pelo menos uma faixa de classificação'];
  const sorted = [...bands].sort((a, b) => a.min - b.min);
  for (const b of sorted) {
    if (!b.label?.trim()) errors.push('Todas as faixas precisam de designação');
    if (b.min > b.max + EPS) errors.push(`Faixa "${b.label}" tem mínimo superior ao máximo`);
  }
  if (Math.abs(sorted[0].min - 1) > EPS) errors.push('A primeira faixa deve começar em 1,00');
  if (Math.abs(sorted[sorted.length - 1].max - 5) > EPS)
    errors.push('A última faixa deve terminar em 5,00');
  for (let i = 1; i < sorted.length; i++) {
    const gap = sorted[i].min - sorted[i - 1].max;
    if (gap < BAND_STEP - EPS) {
      errors.push(
        `As faixas "${sorted[i - 1].label}" e "${sorted[i].label}" sobrepõem-se ou não estão separadas`,
      );
    } else if (gap > BAND_STEP + EPS) {
      errors.push(
        `Existe uma lacuna entre as faixas "${sorted[i - 1].label}" e "${sorted[i].label}"`,
      );
    }
  }
  return errors;
}

/** Designação da faixa a que a nota pertence (nota arredondada a 2 casas); null se fora de 1–5. */
export function classifyRating(
  score: number | null | undefined,
  bands: readonly RatingBand[] = DEFAULT_RATING_BANDS,
): string | null {
  if (score === null || score === undefined || Number.isNaN(score)) return null;
  const s = Math.round(score * 100) / 100;
  if (s < 1 || s > 5) return null;
  return bands.find(b => s >= b.min - EPS && s <= b.max + EPS)?.label ?? null;
}

export interface RatedQuestion {
  id: number;
  type: string;
  required: boolean;
  weight: number | null;
  scaleMax: number | null;
}

export interface RatedAnswer {
  questionId: number;
  score?: number;
  notApplicable?: boolean;
}

export interface WeightedRating {
  /** Média ponderada em 1–5 (2 casas); null enquanto a avaliação estiver incompleta. */
  weightedScore: number | null;
  /** Percentagem (0–100) de perguntas avaliáveis respondidas (nota ou "Não aplicável"). */
  completionPct: number;
  complete: boolean;
  /** Perguntas obrigatórias sem resposta. */
  missingRequired: number[];
  /** Respostas inválidas (nota fora da escala, N/A não permitido). */
  invalid: { questionId: number; reason: string }[];
}

const RATEABLE_TYPES = new Set(['SCALE', 'NA_ALLOWED']);

export function isRateableQuestion(q: Pick<RatedQuestion, 'type'>): boolean {
  return RATEABLE_TYPES.has(q.type);
}

/**
 * Classificação ponderada = Σ(nota × peso) / Σ(pesos aplicáveis).
 * - "Não aplicável" sai do denominador; pergunta sem resposta nunca vale zero.
 * - Escalas com máximo diferente de 5 são normalizadas para 1–5.
 * - Peso ausente conta 1. Só perguntas SCALE/NA_ALLOWED entram no cálculo.
 */
export function computeWeightedRating(
  questions: readonly RatedQuestion[],
  answers: readonly RatedAnswer[],
): WeightedRating {
  const rateable = questions.filter(isRateableQuestion);
  const byId = new Map(answers.map(a => [a.questionId, a]));
  const invalid: WeightedRating['invalid'] = [];
  const missingRequired: number[] = [];
  let answered = 0;
  let sum = 0;
  let sumWeights = 0;

  for (const q of rateable) {
    const a = byId.get(q.id);
    const hasScore = a?.score !== undefined && a.score !== null;
    if (a?.notApplicable) {
      if (q.type !== 'NA_ALLOWED') {
        invalid.push({ questionId: q.id, reason: 'Esta pergunta não admite "Não aplicável"' });
      } else {
        answered++;
      }
      continue;
    }
    if (!hasScore) {
      if (q.required) missingRequired.push(q.id);
      continue;
    }
    const max = q.scaleMax && q.scaleMax >= 2 ? q.scaleMax : 5;
    const score = a.score;
    if (!Number.isInteger(score) || score < 1 || score > max) {
      invalid.push({ questionId: q.id, reason: `A nota deve ser um inteiro entre 1 e ${max}` });
      continue;
    }
    answered++;
    const score5 = max === 5 ? score : 1 + ((score - 1) * 4) / (max - 1);
    const weight = q.weight === null || q.weight === undefined ? 1 : Math.max(0, q.weight);
    sum += score5 * weight;
    sumWeights += weight;
  }

  const completionPct = rateable.length ? Math.round((answered / rateable.length) * 100) : 0;
  const complete =
    rateable.length > 0 && missingRequired.length === 0 && invalid.length === 0 && sumWeights > 0;
  return {
    weightedScore: complete ? +(sum / sumWeights).toFixed(2) : null,
    completionPct,
    complete,
    missingRequired,
    invalid,
  };
}

/** Pesos configurados mas que não somam 100 (tolerância 0,01); null se coerentes ou não configurados. */
export function weightsSumIssue(
  questions: readonly Pick<RatedQuestion, 'type' | 'weight'>[],
): string | null {
  const weighted = questions
    .filter(isRateableQuestion)
    .filter(q => q.weight !== null && q.weight !== undefined);
  if (!weighted.length) return null;
  const total = weighted.reduce((s, q) => s + q.weight, 0);
  return Math.abs(total - 100) > 0.01
    ? `A soma dos pesos dos critérios é ${+total.toFixed(2)}%, deve ser 100%`
    : null;
}
