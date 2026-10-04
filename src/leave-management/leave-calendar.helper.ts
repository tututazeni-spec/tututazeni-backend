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

// ── Configuração em runtime (docs/Modulo_Leave.md §10) ──────────────────────
// Feriados por localização e semana de trabalho são mantidos pelo RH na BD
// (LeaveSettingsService). Estas funções são síncronas e usadas em dezenas de
// sítios, por isso lêem de um registo em memória que o serviço actualiza ao
// arrancar, a cada gravação e — para outras instâncias — por refresco em
// segundo plano quando o registo fica mais velho que REFRESH_MS.

export interface CustomHoliday {
  /** YYYY-MM-DD; com `recurring` só conta o mês/dia. */
  date: string;
  name: string;
  /** null = nacional. */
  location: string | null;
  recurring: boolean;
  /** false = suprime o feriado de base nessa data (ex.: tolerância de ponto). */
  active: boolean;
}

const DEFAULT_WORK_WEEK = [1, 2, 3, 4, 5];
const REFRESH_MS = 60_000;

let customHolidays: CustomHoliday[] = [];
let workWeek = new Set<number>(DEFAULT_WORK_WEEK);
let registryLoadedAt = 0;
let registryLoader: (() => Promise<void>) | null = null;
let registryLoading = false;

export function configureLeaveCalendar(cfg: {
  holidays?: CustomHoliday[];
  workWeekDays?: number[];
}): void {
  if (cfg.holidays) customHolidays = cfg.holidays;
  if (cfg.workWeekDays?.length) workWeek = new Set(cfg.workWeekDays);
  registryLoadedAt = Date.now();
  holidayCache.clear();
}

export function resetLeaveCalendar(): void {
  customHolidays = [];
  workWeek = new Set(DEFAULT_WORK_WEEK);
  registryLoadedAt = 0;
  registryLoader = null;
  holidayCache.clear();
}

export function setLeaveCalendarLoader(loader: (() => Promise<void>) | null): void {
  registryLoader = loader;
}

function refreshIfStale(): void {
  if (!registryLoader || registryLoading || Date.now() - registryLoadedAt < REFRESH_MS) return;
  registryLoading = true;
  registryLoadedAt = Date.now(); // evita rajadas se o loader falhar
  void registryLoader()
    .catch(() => undefined)
    .finally(() => {
      registryLoading = false;
    });
}

/** Dia da semana (0 = domingo) é dia útil na semana de trabalho configurada. */
export function isWorkWeekday(date: Date): boolean {
  return workWeek.has(date.getDay());
}

export function getWorkWeekDays(): number[] {
  return [...workWeek].sort((x, y) => x - y);
}

const holidayCache = new Map<string, Map<string, string>>();

/** Mapa data ISO (YYYY-MM-DD) → nome do feriado, para o ano (e localização) indicados. */
export function holidaysForYear(year: number, location?: string | null): Map<string, string> {
  refreshIfStale();
  const loc = location?.trim().toLowerCase() || '';
  const cacheKey = `${year}|${loc}`;
  const cached = holidayCache.get(cacheKey);
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

  // Personalizados: nacionais (location null) e os da localização pedida.
  for (const h of customHolidays) {
    const hLoc = h.location?.trim().toLowerCase() || '';
    if (hLoc && hLoc !== loc) continue;
    const key = h.recurring ? `${year}-${h.date.slice(5, 10)}` : h.date.slice(0, 10);
    if (!key.startsWith(`${year}-`)) continue;
    if (h.active) map.set(key, h.name);
    else map.delete(key);
  }
  holidayCache.set(cacheKey, map);
  return map;
}

export function holidayName(date: Date, location?: string | null): string | undefined {
  return holidaysForYear(date.getFullYear(), location).get(localDay(date));
}

export function isHoliday(date: Date, location?: string | null): boolean {
  return holidayName(date, location) !== undefined;
}

export function countWorkDays(start: Date, end: Date, location?: string | null): number {
  let days = 0;
  const cur = new Date(start);
  while (cur <= end) {
    if (isWorkWeekday(cur) && !isHoliday(cur, location)) days++;
    cur.setDate(cur.getDate() + 1);
  }
  return days;
}

export function countCalendarDays(start: Date, end: Date): number {
  return Math.max(1, Math.round((end.getTime() - start.getTime()) / 86400000) + 1);
}

/** Feriados (em dias úteis) que caem dentro do intervalo. */
export function holidaysInRange(
  start: Date,
  end: Date,
  location?: string | null,
): Array<{ date: string; name: string }> {
  const out: Array<{ date: string; name: string }> = [];
  const cur = new Date(start);
  while (cur <= end) {
    const name = holidayName(cur, location);
    if (name && isWorkWeekday(cur)) out.push({ date: localDay(cur), name });
    cur.setDate(cur.getDate() + 1);
  }
  return out;
}
