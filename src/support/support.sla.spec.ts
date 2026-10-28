import { addBusinessHours, firstResponseDueAt, isOverdue } from './support.sla';

// Luanda = UTC+1: 10:00 UTC = 11:00 local.
const utc = (s: string) => new Date(`${s}Z`);

describe('support.sla', () => {
  it('dentro do horário soma directamente', () => {
    // seg 2026-10-26 11:00 local + 1 h = 12:00 local
    expect(addBusinessHours(utc('2026-10-26T10:00:00'), 1).toISOString()).toBe(
      '2026-10-26T11:00:00.000Z',
    );
  });

  it('passa para o dia útil seguinte quando o dia acaba', () => {
    // seg 17:00 local (16:00Z) + 2 h → 1 h hoje + 1 h na terça às 08:00 → 09:00 local = 08:00Z
    expect(addBusinessHours(utc('2026-10-26T16:00:00'), 2).toISOString()).toBe(
      '2026-10-27T08:00:00.000Z',
    );
  });

  it('fora do horário começa na próxima abertura (sexta à noite → segunda)', () => {
    // sex 2026-10-30 19:00 local (18:00Z) + 1 h → seg 09:00 local = 08:00Z
    expect(addBusinessHours(utc('2026-10-30T18:00:00'), 1).toISOString()).toBe(
      '2026-11-02T08:00:00.000Z',
    );
  });

  it('fim de semana começa na segunda às 08:00', () => {
    // sáb 2026-10-31 12:00 local + 1 h → seg 09:00 local
    expect(addBusinessHours(utc('2026-10-31T11:00:00'), 1).toISOString()).toBe(
      '2026-11-02T08:00:00.000Z',
    );
  });

  it('prazo por prioridade', () => {
    const created = utc('2026-10-26T07:00:00'); // seg 08:00 local
    expect(firstResponseDueAt('CRITICAL', created).toISOString()).toBe('2026-10-26T08:00:00.000Z');
    expect(firstResponseDueAt('NORMAL', created).toISOString()).toBe('2026-10-26T15:00:00.000Z');
  });

  it('em atraso só sem resposta, ainda aberto e prazo passado', () => {
    const due = utc('2026-10-26T08:00:00');
    const now = utc('2026-10-26T09:00:00');
    expect(
      isOverdue({ firstRespondedAt: null, firstResponseDueAt: due, status: 'OPEN' }, now),
    ).toBe(true);
    expect(isOverdue({ firstRespondedAt: now, firstResponseDueAt: due, status: 'OPEN' }, now)).toBe(
      false,
    );
    expect(
      isOverdue({ firstRespondedAt: null, firstResponseDueAt: due, status: 'CLOSED' }, now),
    ).toBe(false);
  });
});
