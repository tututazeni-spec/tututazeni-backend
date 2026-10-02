import {
  AVATAR_ADMIN_ROLES,
  AVATAR_ASSIGN_ROLES,
  AVATAR_AUTHOR_ROLES,
  AVATAR_PROGRESS_ROLES,
  isGradedStep,
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
