import {
  effectiveSessionStatus,
  isValidTime,
  summarizeAttendance,
  timesOverlap,
  AttendanceState,
} from './cohort-attendance-calc';

const policy = { minAttendancePercent: 75, excludeExcusedFromTotal: true };
const marks = (entries: Array<[number, AttendanceState]>) => new Map(entries);

describe('summarizeAttendance', () => {
  it('sem sessões elegíveis devolve "sem dados" e não divide por zero', () => {
    const r = summarizeAttendance([], new Map(), policy);
    expect(r.rate).toBeNull();
    expect(r.meetsMinimum).toBeNull();
  });

  it('Presente e Atrasado contam como presença; Ausente não', () => {
    const r = summarizeAttendance(
      [1, 2, 3, 4],
      marks([
        [1, 'PRESENT'],
        [2, 'LATE'],
        [3, 'ABSENT'],
        [4, 'PRESENT'],
      ]),
      policy,
    );
    expect(r).toMatchObject({ present: 2, late: 1, absent: 1, attended: 3, rate: 75 });
    expect(r.meetsMinimum).toBe(true);
  });

  it('Justificado sai do denominador quando a política o define', () => {
    const r = summarizeAttendance(
      [1, 2, 3],
      marks([
        [1, 'PRESENT'],
        [2, 'JUSTIFIED'],
        [3, 'ABSENT'],
      ]),
      policy,
    );
    expect(r.counted).toBe(2);
    expect(r.rate).toBe(50);
    expect(r.meetsMinimum).toBe(false);
  });

  it('Justificado conta como falta quando a política não o exclui', () => {
    const r = summarizeAttendance(
      [1, 2],
      marks([
        [1, 'PRESENT'],
        [2, 'JUSTIFIED'],
      ]),
      { ...policy, excludeExcusedFromTotal: false },
    );
    expect(r.counted).toBe(2);
    expect(r.rate).toBe(50);
  });

  it('só justificadas com exclusão: denominador 0 → sem dados', () => {
    const r = summarizeAttendance([1], marks([[1, 'JUSTIFIED']]), policy);
    expect(r.rate).toBeNull();
  });

  it('sessão concluída sem registo conta como falta e aparece em unmarked', () => {
    const r = summarizeAttendance([1, 2], marks([[1, 'PRESENT']]), policy);
    expect(r.unmarked).toBe(1);
    expect(r.rate).toBe(50);
  });

  it('a taxa fica sempre entre 0 e 100', () => {
    const all = summarizeAttendance(
      [1, 2],
      marks([
        [1, 'PRESENT'],
        [2, 'PRESENT'],
      ]),
      policy,
    );
    const none = summarizeAttendance(
      [1, 2],
      marks([
        [1, 'ABSENT'],
        [2, 'ABSENT'],
      ]),
      policy,
    );
    expect(all.rate).toBe(100);
    expect(none.rate).toBe(0);
  });

  it('o mínimo é configurável (não fixo em 75%)', () => {
    const m = marks([
      [1, 'PRESENT'],
      [2, 'ABSENT'],
    ]);
    expect(
      summarizeAttendance([1, 2], m, { ...policy, minAttendancePercent: 50 }).meetsMinimum,
    ).toBe(true);
    expect(
      summarizeAttendance([1, 2], m, { ...policy, minAttendancePercent: 80 }).meetsMinimum,
    ).toBe(false);
  });
});

describe('horas e sobreposição', () => {
  it('valida HH:mm', () => {
    expect(isValidTime('09:30')).toBe(true);
    expect(isValidTime('24:00')).toBe(false);
    expect(isValidTime('9:30')).toBe(false);
  });

  it('horários distintos no mesmo dia não colidem; sobrepostos colidem', () => {
    expect(timesOverlap('09:00', '12:00', '14:00', '17:00')).toBe(false);
    expect(timesOverlap('09:00', '12:00', '12:00', '13:00')).toBe(false);
    expect(timesOverlap('09:00', '12:00', '11:00', '13:00')).toBe(true);
  });
});

describe('effectiveSessionStatus', () => {
  const date = new Date('2026-11-02T00:00:00.000Z');
  it('cancelada fica cancelada', () => {
    expect(
      effectiveSessionStatus('CANCELLED', date, '09:00', '12:00', new Date('2027-01-01')),
    ).toBe('CANCELLED');
  });
  it('agendada → em curso → concluída consoante a hora', () => {
    expect(
      effectiveSessionStatus('SCHEDULED', date, '09:00', '12:00', new Date('2026-11-01T10:00:00')),
    ).toBe('SCHEDULED');
    expect(
      effectiveSessionStatus('SCHEDULED', date, '09:00', '12:00', new Date('2026-11-02T10:00:00')),
    ).toBe('IN_PROGRESS');
    expect(
      effectiveSessionStatus('SCHEDULED', date, '09:00', '12:00', new Date('2026-11-02T13:00:00')),
    ).toBe('COMPLETED');
  });
});
