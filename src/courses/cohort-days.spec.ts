import { cohortDays } from './cohort-days';

const d = (s: string) => new Date(`${s}T00:00:00.000Z`);

describe('cohortDays', () => {
  it('só inclui os dias da semana do horário', () => {
    // 2026-11-02 é segunda-feira
    expect(cohortDays('Seg/Qua 18:00-20:00', d('2026-11-02'), d('2026-11-11'))).toEqual([
      '2026-11-02',
      '2026-11-04',
      '2026-11-09',
      '2026-11-11',
    ]);
  });

  it('sem dias da semana no horário conta todos os dias', () => {
    expect(cohortDays('09:00-17:00', d('2026-11-02'), d('2026-11-04'))).toEqual([
      '2026-11-02',
      '2026-11-03',
      '2026-11-04',
    ]);
  });

  it('sem data de fim tem um único dia', () => {
    expect(cohortDays(null, d('2026-11-02'), null)).toEqual(['2026-11-02']);
  });
});
