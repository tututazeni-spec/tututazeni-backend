import {
  configureLeaveCalendar,
  countWorkDays,
  getWorkWeekDays,
  holidaysForYear,
  holidaysInRange,
  isWorkWeekday,
  resetLeaveCalendar,
  setLeaveCalendarLoader,
} from './leave-calendar.helper';

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

  describe('configuração em runtime (§10)', () => {
    afterEach(() => resetLeaveCalendar());

    it('feriado por localização só conta para essa localização', () => {
      configureLeaveCalendar({
        holidays: [
          {
            date: '2026-08-12',
            name: 'Dia da Cidade',
            location: 'Benguela',
            recurring: false,
            active: true,
          },
        ],
      });
      // 12/08/2026 é quarta-feira
      const day = new Date(2026, 7, 12);
      expect(countWorkDays(day, day, 'Benguela')).toBe(0);
      expect(countWorkDays(day, day, 'Luanda')).toBe(1);
      expect(countWorkDays(day, day)).toBe(1);
    });

    it('feriado recorrente repete-se em todos os anos', () => {
      configureLeaveCalendar({
        holidays: [
          { date: '2026-08-12', name: 'Aniversário', location: null, recurring: true, active: true },
        ],
      });
      expect(holidaysForYear(2029).get('2029-08-12')).toBe('Aniversário');
    });

    it('active=false suprime o feriado de base', () => {
      configureLeaveCalendar({
        holidays: [
          { date: '2026-03-08', name: 'x', location: null, recurring: false, active: false },
        ],
      });
      expect(holidaysForYear(2026).has('2026-03-08')).toBe(false);
      expect(holidaysForYear(2026).has('2026-05-01')).toBe(true);
    });

    it('semana de trabalho configurada altera a contagem de dias úteis', () => {
      // semana de 6 dias (seg-sáb): 5-10 Out 2026 → seg..sáb
      configureLeaveCalendar({ workWeekDays: [1, 2, 3, 4, 5, 6] });
      expect(getWorkWeekDays()).toEqual([1, 2, 3, 4, 5, 6]);
      expect(isWorkWeekday(new Date(2026, 9, 10))).toBe(true); // sábado
      expect(countWorkDays(new Date(2026, 9, 5), new Date(2026, 9, 11))).toBe(6);
    });

    it('configurar invalida a cache de feriados', () => {
      expect(holidaysForYear(2026).has('2026-08-12')).toBe(false);
      configureLeaveCalendar({
        holidays: [{ date: '2026-08-12', name: 'N', location: null, recurring: false, active: true }],
      });
      expect(holidaysForYear(2026).has('2026-08-12')).toBe(true);
    });

    it('registo desactualizado dispara refresco em segundo plano (outras instâncias)', async () => {
      const loader = jest.fn().mockResolvedValue(undefined);
      setLeaveCalendarLoader(loader);
      jest.useFakeTimers().setSystemTime(Date.now());
      configureLeaveCalendar({ holidays: [] });
      holidaysForYear(2026); // fresco: não recarrega
      expect(loader).not.toHaveBeenCalled();
      jest.setSystemTime(Date.now() + 61_000);
      holidaysForYear(2027);
      expect(loader).toHaveBeenCalledTimes(1);
      jest.useRealTimers();
    });
  });
});
