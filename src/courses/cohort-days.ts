// Dias de aula de uma turma: do início ao fim, só nos dias da semana do horário
// ("Seg/Qua 18:00-20:00"). Sem dias da semana no horário contam todos os dias.

const WEEKDAYS: Array<[string, number]> = [
  ['Dom', 0],
  ['Seg', 1],
  ['Ter', 2],
  ['Qua', 3],
  ['Qui', 4],
  ['Sex', 5],
  ['Sáb', 6],
];

const MAX_DAYS = 366;
const DAY_MS = 24 * 60 * 60 * 1000;

export function scheduleWeekdays(schedule: string | null | undefined): Set<number> {
  const found = new Set<number>();
  for (const [key, n] of WEEKDAYS) if (schedule?.includes(key)) found.add(n);
  return found;
}

/** Datas ISO (YYYY-MM-DD, UTC) em que há aula. Sem fim, a turma tem um único dia. */
export function cohortDays(
  schedule: string | null | undefined,
  startDate: Date,
  endDate: Date | null | undefined,
): string[] {
  const start = Date.UTC(
    startDate.getUTCFullYear(),
    startDate.getUTCMonth(),
    startDate.getUTCDate(),
  );
  const last = endDate
    ? Date.UTC(endDate.getUTCFullYear(), endDate.getUTCMonth(), endDate.getUTCDate())
    : start;
  const weekdays = scheduleWeekdays(schedule);
  const days: string[] = [];
  for (let t = start; t <= last && days.length < MAX_DAYS; t += DAY_MS) {
    const d = new Date(t);
    if (weekdays.size === 0 || weekdays.has(d.getUTCDay())) {
      days.push(d.toISOString().slice(0, 10));
    }
  }
  return days;
}
