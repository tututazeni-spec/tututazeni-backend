import { DEFAULT_CAREER_SETTINGS, parseCareerSettings } from './career-settings';

describe('parseCareerSettings', () => {
  it('devolve os valores por omissão sem JSON guardado', () => {
    expect(parseCareerSettings(null)).toEqual(DEFAULT_CAREER_SETTINGS);
    expect(parseCareerSettings('')).toEqual(DEFAULT_CAREER_SETTINGS);
  });

  it('lê valores guardados e completa os que faltam', () => {
    const r = parseCareerSettings(JSON.stringify({ minMonthsInRole: 6, minPerformanceScore: 4 }));
    expect(r.minMonthsInRole).toBe(6);
    expect(r.minPerformanceScore).toBe(4);
    expect(r.minCompetenciesPct).toBe(DEFAULT_CAREER_SETTINGS.minCompetenciesPct);
  });

  it('ignora valores fora do intervalo ou de tipo errado', () => {
    const r = parseCareerSettings(
      JSON.stringify({ minPerformanceScore: 9, minCompetenciesPct: '80', minMonthsInRole: -1 }),
    );
    expect(r).toEqual(DEFAULT_CAREER_SETTINGS);
  });

  it('JSON inválido volta aos valores por omissão', () => {
    expect(parseCareerSettings('{oops')).toEqual(DEFAULT_CAREER_SETTINGS);
  });
});
