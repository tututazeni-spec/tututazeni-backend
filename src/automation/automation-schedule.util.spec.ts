import { computeNextRun, parseCron, previewRuns, zonedToUtc } from './automation-schedule.util';

const base = {
  startDate: new Date('2026-01-01T00:00:00Z'),
  endDate: null,
  time: '09:00',
  timezone: 'Africa/Luanda', // UTC+1, sem DST
};

describe('automation-schedule.util', () => {
  it('converte hora local para UTC respeitando o fuso', () => {
    expect(new Date(zonedToUtc(2026, 3, 10, 9, 0, 'Africa/Luanda')).toISOString()).toBe(
      '2026-03-10T08:00:00.000Z',
    );
    // Lisboa em horário de verão (UTC+1) e de inverno (UTC+0)
    expect(new Date(zonedToUtc(2026, 7, 1, 9, 0, 'Europe/Lisbon')).toISOString()).toBe(
      '2026-07-01T08:00:00.000Z',
    );
    expect(new Date(zonedToUtc(2026, 1, 1, 9, 0, 'Europe/Lisbon')).toISOString()).toBe(
      '2026-01-01T09:00:00.000Z',
    );
  });

  it('DAILY: próxima às 09:00 locais, hoje se ainda não passou, senão amanhã', () => {
    const before = computeNextRun({ ...base, type: 'DAILY' }, new Date('2026-03-10T07:00:00Z'));
    expect(before?.toISOString()).toBe('2026-03-10T08:00:00.000Z');
    const after = computeNextRun({ ...base, type: 'DAILY' }, new Date('2026-03-10T08:00:00Z'));
    expect(after?.toISOString()).toBe('2026-03-11T08:00:00.000Z');
  });

  it('WEEKLY: só nos dias escolhidos (segunda=1)', () => {
    // 2026-03-10 é terça-feira → próxima segunda é 2026-03-16
    const next = computeNextRun(
      { ...base, type: 'WEEKLY', daysOfWeek: [1] },
      new Date('2026-03-10T10:00:00Z'),
    );
    expect(next?.toISOString()).toBe('2026-03-16T08:00:00.000Z');
  });

  it('MONTHLY: dia 31 recua para o último dia dos meses curtos', () => {
    const next = computeNextRun(
      { ...base, type: 'MONTHLY', dayOfMonth: 31 },
      new Date('2026-02-01T00:00:00Z'),
    );
    expect(next?.toISOString()).toBe('2026-02-28T08:00:00.000Z');
  });

  it('ONCE: só uma vez; depois de passar devolve null', () => {
    const spec = { ...base, type: 'ONCE', startDate: new Date('2026-05-01T00:00:00Z') };
    expect(computeNextRun(spec, new Date('2026-04-30T00:00:00Z'))?.toISOString()).toBe(
      '2026-05-01T08:00:00.000Z',
    );
    expect(computeNextRun(spec, new Date('2026-05-01T09:00:00Z'))).toBeNull();
  });

  it('respeita a data de fim', () => {
    const spec = { ...base, type: 'DAILY', endDate: new Date('2026-03-11T00:00:00Z') };
    expect(previewRuns(spec, 5, new Date('2026-03-09T00:00:00Z'))).toHaveLength(2);
  });

  it('CUSTOM: cron de 5 campos', () => {
    expect(parseCron('*/15 8-18 * * 1-5')).not.toBeNull();
    expect(parseCron('isto não é cron')).toBeNull();
    const next = computeNextRun(
      { ...base, type: 'CUSTOM', cronExpression: '30 14 * * *' },
      new Date('2026-03-10T00:00:00Z'),
    );
    expect(next?.toISOString()).toBe('2026-03-10T13:30:00.000Z');
  });
});
