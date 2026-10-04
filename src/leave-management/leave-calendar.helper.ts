// ─── src/leave-management/leave-calendar.helper.ts ───────────────────────────
// Feriados nacionais (Angola) e contagem de dias, partilhados pelo serviço de
// pedidos e pelo serviço de overview/férias. Os feriados móveis (Sexta-feira
// Santa e Carnaval) são derivados da Páscoa do ano pedido — antes só existia
// uma lista fixa de 2025, pelo que em qualquer outro ano nenhum feriado era
// descontado.

const FIXED_HOLIDAYS = [
  '01-01',
  '02-04',
  '03-08',
  '03-23',
  '04-04',
  '05-01',
  '09-17',
  '11-02',
  '11-11',
  '12-25',
];

function easterSunday(year: number): Date {
  // Algoritmo de Meeus/Jones/Butcher.
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(year, month - 1, day));
}

// Chave da Páscoa/feriados móveis (construídos em UTC).
function isoDay(d: Date): string {
  return d.toISOString().split('T')[0];
}

// Chave para datas "de calendário" locais. toISOString() converteria
// meia-noite local (UTC+1) para o dia anterior e falharia o feriado.
function localDay(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

const holidayCache = new Map<number, Map<string, string>>();

/** Mapa data ISO (YYYY-MM-DD) → nome do feriado, para o ano indicado. */
export function holidaysForYear(year: number): Map<string, string> {
  const cached = holidayCache.get(year);
  if (cached) return cached;
  const names: Record<string, string> = {
    '01-01': 'Ano Novo',
    '02-04': 'Início da Luta Armada',
    '03-08': 'Dia da Mulher',
    '03-23': 'Dia da Libertação da África Austral',
    '04-04': 'Dia da Paz',
    '05-01': 'Dia do Trabalhador',
    '09-17': 'Dia do Herói Nacional',
    '11-02': 'Dia dos Finados',
    '11-11': 'Dia da Independência',
    '12-25': 'Natal',
  };
  const map = new Map<string, string>();
  for (const md of FIXED_HOLIDAYS) map.set(`${year}-${md}`, names[md]);
  const easter = easterSunday(year);
  const shift = (days: number) => new Date(easter.getTime() + days * 86400000);
  map.set(isoDay(shift(-2)), 'Sexta-feira Santa');
  map.set(isoDay(shift(-47)), 'Carnaval');
  holidayCache.set(year, map);
  return map;
}

export function holidayName(date: Date): string | undefined {
  return holidaysForYear(date.getFullYear()).get(localDay(date));
}

export function isHoliday(date: Date): boolean {
  return holidayName(date) !== undefined;
}

export function countWorkDays(start: Date, end: Date): number {
  let days = 0;
  const cur = new Date(start);
  while (cur <= end) {
    const dow = cur.getDay();
    if (dow !== 0 && dow !== 6 && !isHoliday(cur)) days++;
    cur.setDate(cur.getDate() + 1);
  }
  return days;
}

export function countCalendarDays(start: Date, end: Date): number {
  return Math.max(1, Math.round((end.getTime() - start.getTime()) / 86400000) + 1);
}

/** Feriados (em dias úteis) que caem dentro do intervalo. */
export function holidaysInRange(start: Date, end: Date): Array<{ date: string; name: string }> {
  const out: Array<{ date: string; name: string }> = [];
  const cur = new Date(start);
  while (cur <= end) {
    const name = holidayName(cur);
    const dow = cur.getDay();
    if (name && dow !== 0 && dow !== 6) out.push({ date: localDay(cur), name });
    cur.setDate(cur.getDate() + 1);
  }
  return out;
}
