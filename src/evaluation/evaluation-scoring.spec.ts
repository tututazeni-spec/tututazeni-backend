import {
  classifyRating,
  computeWeightedRating,
  DEFAULT_RATING_BANDS,
  validateRatingBands,
  weightsSumIssue,
  RatedQuestion,
} from './evaluation-scoring';

const q = (
  id: number,
  weight: number | null,
  extra: Partial<RatedQuestion> = {},
): RatedQuestion => ({
  id,
  type: 'SCALE',
  required: true,
  weight,
  scaleMax: 5,
  ...extra,
});

describe('computeWeightedRating', () => {
  it('calcula a média ponderada Σ(nota×peso)/Σ pesos', () => {
    const r = computeWeightedRating(
      [q(1, 20), q(2, 80)],
      [
        { questionId: 1, score: 5 },
        { questionId: 2, score: 3 },
      ],
    );
    expect(r.weightedScore).toBe(3.4);
    expect(r.complete).toBe(true);
    expect(r.completionPct).toBe(100);
  });

  it('exclui "Não aplicável" do denominador', () => {
    const r = computeWeightedRating(
      [q(1, 50), q(2, 50, { type: 'NA_ALLOWED' })],
      [
        { questionId: 1, score: 4 },
        { questionId: 2, notApplicable: true },
      ],
    );
    expect(r.weightedScore).toBe(4);
    expect(r.completionPct).toBe(100);
  });

  it('avaliação incompleta não devolve classificação nem trata o vazio como zero', () => {
    const r = computeWeightedRating([q(1, 50), q(2, 50)], [{ questionId: 1, score: 5 }]);
    expect(r.weightedScore).toBeNull();
    expect(r.complete).toBe(false);
    expect(r.missingRequired).toEqual([2]);
    expect(r.completionPct).toBe(50);
  });

  it('sem respostas → 0% e sem nota', () => {
    const r = computeWeightedRating([q(1, 100)], []);
    expect(r).toMatchObject({ weightedScore: null, completionPct: 0, complete: false });
  });

  it('todos os critérios não aplicáveis → sem nota final', () => {
    const r = computeWeightedRating(
      [q(1, 50, { type: 'NA_ALLOWED' }), q(2, 50, { type: 'NA_ALLOWED' })],
      [
        { questionId: 1, notApplicable: true },
        { questionId: 2, notApplicable: true },
      ],
    );
    expect(r.weightedScore).toBeNull();
    expect(r.complete).toBe(false);
  });

  it.each([0, 6, 2.5, -1])('rejeita nota %p fora da escala 1–5', score => {
    const r = computeWeightedRating([q(1, 100)], [{ questionId: 1, score }]);
    expect(r.invalid).toHaveLength(1);
    expect(r.weightedScore).toBeNull();
  });

  it('rejeita N/A em pergunta que não o admite', () => {
    const r = computeWeightedRating([q(1, 100)], [{ questionId: 1, notApplicable: true }]);
    expect(r.invalid[0].reason).toMatch(/Não aplicável/);
  });

  it('perguntas opcionais por responder não bloqueiam e saem do denominador', () => {
    const r = computeWeightedRating(
      [q(1, 50), q(2, 50, { required: false })],
      [{ questionId: 1, score: 2 }],
    );
    expect(r.weightedScore).toBe(2);
    expect(r.complete).toBe(true);
    expect(r.completionPct).toBe(50);
  });

  it('normaliza escalas com máximo diferente de 5', () => {
    const r = computeWeightedRating([q(1, 100, { scaleMax: 10 })], [{ questionId: 1, score: 10 }]);
    expect(r.weightedScore).toBe(5);
  });

  it('ignora perguntas de texto/NPS/booleanas no cálculo', () => {
    const r = computeWeightedRating(
      [q(1, 100), q(2, null, { type: 'TEXT' }), q(3, null, { type: 'NPS' })],
      [{ questionId: 1, score: 4 }],
    );
    expect(r.weightedScore).toBe(4);
  });

  it('peso ausente conta 1', () => {
    const r = computeWeightedRating(
      [q(1, null), q(2, null)],
      [
        { questionId: 1, score: 5 },
        { questionId: 2, score: 4 },
      ],
    );
    expect(r.weightedScore).toBe(4.5);
  });
});

describe('classifyRating / validateRatingBands', () => {
  it.each([
    [1, 'Muito fraco'],
    [1.49, 'Muito fraco'],
    [1.5, 'Insuficiente'],
    [3.49, 'Bom'],
    [3.5, 'Muito bom'],
    [4.5, 'Excelente'],
    [5, 'Excelente'],
  ])('%p → %s', (score, label) => {
    expect(classifyRating(score)).toBe(label);
  });

  it('fora de 1–5 ou nulo → null', () => {
    expect(classifyRating(0.9)).toBeNull();
    expect(classifyRating(5.1)).toBeNull();
    expect(classifyRating(null)).toBeNull();
  });

  it('faixas por omissão são válidas', () => {
    expect(validateRatingBands(DEFAULT_RATING_BANDS)).toEqual([]);
  });

  it('detecta lacunas e sobreposições', () => {
    expect(
      validateRatingBands([
        { min: 1, max: 2, label: 'A' },
        { min: 2.5, max: 5, label: 'B' },
      ]).join(),
    ).toMatch(/lacuna/);
    expect(
      validateRatingBands([
        { min: 1, max: 3, label: 'A' },
        { min: 2.9, max: 5, label: 'B' },
      ]).join(),
    ).toMatch(/sobrepõem/);
    expect(validateRatingBands([{ min: 2, max: 5, label: 'A' }]).join()).toMatch(/começar em 1/);
  });
});

describe('weightsSumIssue', () => {
  it('aceita pesos que somam 100 e pesos não configurados', () => {
    expect(weightsSumIssue([q(1, 60), q(2, 40)])).toBeNull();
    expect(weightsSumIssue([q(1, null)])).toBeNull();
  });
  it('rejeita soma diferente de 100', () => {
    expect(weightsSumIssue([q(1, 60), q(2, 30)])).toMatch(/90%/);
  });
});
