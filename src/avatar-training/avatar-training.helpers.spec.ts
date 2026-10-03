import {
  AVATAR_ADMIN_ROLES,
  AVATAR_ASSIGN_ROLES,
  AVATAR_AUTHOR_ROLES,
  AVATAR_PROGRESS_ROLES,
  failureReinforcement,
  stepReinforcement,
  isGradedStep,
  learnerLevelIndex,
  levelFit,
  normalizeAnswer,
  parseJson,
  parseSteps,
  serializeSteps,
  stripAnswers,
} from './avatar-training.helpers';
import { Role } from '../auth/enums/role.enum';

describe('avatar-training.helpers', () => {
  const steps: any[] = [
    { key: 'a', type: 'EXPLANATION', title: 'Intro' },
    {
      key: 'q',
      type: 'QUESTION',
      title: 'Pergunta',
      question: { prompt: '2+2?', correctAnswer: '4' },
    },
    { key: 'f', type: 'QUESTION', title: 'Livre', question: { prompt: 'Opinião?' } },
  ];

  it('serializa e lê etapas (ida e volta)', () => {
    expect(parseSteps(serializeSteps(steps))).toEqual(steps);
  });

  it('parseSteps tolera vazio, JSON inválido e forma inesperada', () => {
    expect(parseSteps(null)).toEqual([]);
    expect(parseSteps('{não é json')).toEqual([]);
    expect(parseSteps('{"steps":"x"}')).toEqual([]);
  });

  it('stripAnswers nunca expõe o gabarito ao formando', () => {
    const out = stripAnswers(steps);
    expect(JSON.stringify(out)).not.toContain('"correctAnswer":"4"');
    expect(out[1].question?.correctAnswer).toBeUndefined();
    expect(out[1].question?.prompt).toBe('2+2?');
    expect(steps[1].question.correctAnswer).toBe('4'); // não muta a origem
  });

  it('isGradedStep só é verdadeiro para perguntas com resposta correcta', () => {
    expect(isGradedStep(steps[0])).toBe(false);
    expect(isGradedStep(steps[1])).toBe(true);
    expect(isGradedStep(steps[2])).toBe(false);
  });

  it('normalizeAnswer ignora espaços e maiúsculas', () => {
    expect(normalizeAnswer('  Sim ')).toBe('sim');
  });

  it('parseJson devolve o fallback em vez de rebentar', () => {
    expect(parseJson('{"a":1}', {})).toEqual({ a: 1 });
    expect(parseJson('x', { ok: false })).toEqual({ ok: false });
    expect(parseJson(undefined, [])).toEqual([]);
  });

  it('hierarquia de papéis: admin ⊂ autor, AUDITOR só lê progresso', () => {
    AVATAR_ADMIN_ROLES.forEach(r => expect(AVATAR_AUTHOR_ROLES).toContain(r));
    expect(AVATAR_ADMIN_ROLES).not.toContain(Role.INSTRUCTOR);
    expect(AVATAR_PROGRESS_ROLES).toContain(Role.AUDITOR);
    expect(AVATAR_ASSIGN_ROLES).not.toContain(Role.AUDITOR);
    expect(AVATAR_AUTHOR_ROLES).not.toContain(Role.AUDITOR);
  });
});

describe('personalização por nível', () => {
  it('poucos resultados → iniciante', () => {
    expect(learnerLevelIndex([])).toBe(0);
    expect(learnerLevelIndex([99, 99])).toBe(0);
  });

  it('notas médias definem o nível', () => {
    expect(learnerLevelIndex([60, 70, 80])).toBe(0);
    expect(learnerLevelIndex([80, 80, 80])).toBe(1);
    expect(learnerLevelIndex([95, 90, 92])).toBe(2);
  });

  it('adequação da dificuldade ao nível', () => {
    expect(levelFit('BEGINNER', 1)).toBe('EASIER');
    expect(levelFit('INTERMEDIATE', 1)).toBe('MATCH');
    expect(levelFit('ADVANCED', 1)).toBe('MATCH');
    expect(levelFit('EXPERT', 1)).toBe('HARDER');
    expect(levelFit('ADVANCED', 0)).toBe('HARDER');
  });
});

describe('reforço e repetição (§7)', () => {
  const steps = [
    { key: 'a', title: 'Introdução', type: 'CONTENT' },
    {
      key: 'q',
      title: 'Pergunta',
      type: 'QUESTION',
      question: { kind: 'SINGLE', options: ['x', 'y'], correctAnswer: 'x' },
      reinforcement: {
        message: 'Reveja a introdução',
        reviewStepKey: 'a',
        resourceUrl: 'https://exemplo.test/doc',
        retryOnIncorrect: true,
        maxRetries: 2,
      },
    },
  ] as any[];

  it('sem regra de reforço não devolve nada', () => {
    expect(stepReinforcement(steps[0], steps, 0)).toBeNull();
  });

  it('manda repetir enquanto restam tentativas e deixa avançar depois', () => {
    expect(stepReinforcement(steps[1], steps, 0)).toMatchObject({
      retry: true,
      retriesLeft: 2,
      reviewStepTitle: 'Introdução',
    });
    expect(stepReinforcement(steps[1], steps, 2)).toMatchObject({ retry: false, retriesLeft: 0 });
  });

  it('o gabarito e o reforço nunca chegam ao formando', () => {
    const [, q] = stripAnswers(steps);
    expect(q.question?.correctAnswer).toBeUndefined();
    expect(q.reinforcement).toBeUndefined();
  });

  it('reprovação lista as etapas fracas e a regra da sessão', () => {
    const out = failureReinforcement(steps, [{ stepKey: 'q', correct: false, answered: true }], {
      onFail: { message: 'Volte a tentar', recommendSessionId: 9 },
    });
    expect(out).toMatchObject({
      message: 'Volte a tentar',
      recommendSessionId: 9,
      weakSteps: [{ stepKey: 'q', reviewStepKey: 'a' }],
    });
    expect(failureReinforcement(steps, [], {})).toBeNull();
  });
});
