import { countWorkDays, holidaysForYear, holidaysInRange } from './leave-calendar.helper';

describe('leave-calendar.helper', () => {
  it('deriva Sexta-feira Santa e Carnaval da Páscoa (2025: Páscoa 20/04)', () => {
    const h = holidaysForYear(2025);
    expect(h.get('2025-04-18')).toBe('Sexta-feira Santa');
    expect(h.get('2025-03-04')).toBe('Carnaval');
  });

  it('aplica feriados em anos diferentes de 2025 (2026: Páscoa 05/04)', () => {
    expect(holidaysForYear(2026).get('2026-04-03')).toBe('Sexta-feira Santa');
    // 1 a 5 de Janeiro de 2026 (qui-seg... ): 01/01 é feriado
    expect(countWorkDays(new Date(2026, 0, 1), new Date(2026, 0, 2))).toBe(1);
  });

  it('holidaysInRange ignora feriados em fim-de-semana', () => {
    // 04/04/2026 é sábado
    expect(holidaysInRange(new Date(2026, 3, 4), new Date(2026, 3, 4))).toEqual([]);
  });
});
