// src/automation/automation-schedule.util.ts
// Cálculo da próxima execução de um agendamento (docs/modulo_automation.md §6).
// Só usa Intl para o fuso horário — sem dependências extra.

export type ScheduleType = 'ONCE' | 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'CUSTOM';

export interface ScheduleSpec {
  type: ScheduleType | string;
  startDate: Date;
  endDate?: Date | null;
  time: string; // HH:mm
  timezone: string;
  daysOfWeek?: number[] | null; // 0=Domingo … 6=Sábado
  dayOfMonth?: number | null;
  cronExpression?: string | null;
}

const MAX_SCAN_DAYS = 400;

interface LocalParts {
  y: number;
  m: number; // 1-12
  d: number;
  hh: number;
  mm: number;
}

export function isValidTimezone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

function localParts(ts: number, timezone: string): LocalParts {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).formatToParts(new Date(ts));
  const get = (t: string) => Number(parts.find(p => p.type === t)?.value);
  return { y: get('year'), m: get('month'), d: get('day'), hh: get('hour'), mm: get('minute') };
}

/** Instante UTC correspondente a uma data/hora local no fuso indicado (resolve o DST em 2 passos). */
export function zonedToUtc(
  y: number,
  m: number,
  d: number,
  hh: number,
  mm: number,
  timezone: string,
): number {
  const wall = Date.UTC(y, m - 1, d, hh, mm);
  const offsetAt = (ts: number) => {
    const p = localParts(ts, timezone);
    return Date.UTC(p.y, p.m - 1, p.d, p.hh, p.mm) - Math.floor(ts / 60_000) * 60_000;
  };
  const first = wall - offsetAt(wall);
  return wall - offsetAt(first);
}

export function parseTime(time: string): { hh: number; mm: number } | null {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(time ?? '');
  return match ? { hh: Number(match[1]), mm: Number(match[2]) } : null;
}

const daysInMonth = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();

// ─── Cron de 5 campos (minuto hora dia-do-mês mês dia-da-semana) ───

function parseCronField(field: string, min: number, max: number): Set<number> | null {
  const out = new Set<number>();
  for (const part of field.split(',')) {
    const [range, stepRaw] = part.split('/');
    const step = stepRaw === undefined ? 1 : Number(stepRaw);
    if (!Number.isInteger(step) || step < 1) return null;
    let lo: number;
    let hi: number;
    if (range === '*') {
      lo = min;
      hi = max;
    } else if (/^\d+-\d+$/.test(range)) {
      [lo, hi] = range.split('-').map(Number);
    } else if (/^\d+$/.test(range)) {
      lo = Number(range);
      hi = stepRaw === undefined ? lo : max;
    } else return null;
    if (lo < min || hi > max || lo > hi) return null;
    for (let v = lo; v <= hi; v += step) out.add(v);
  }
  return out.size ? out : null;
}

export function parseCron(expr: string) {
  const f = expr.trim().split(/\s+/);
  if (f.length !== 5) return null;
  const minute = parseCronField(f[0], 0, 59);
  const hour = parseCronField(f[1], 0, 23);
  const dom = parseCronField(f[2], 1, 31);
  const month = parseCronField(f[3], 1, 12);
  const dowRaw = parseCronField(f[4].replace(/7/g, '0'), 0, 6);
  if (!minute || !hour || !dom || !month || !dowRaw) return null;
  return { minute, hour, dom, month, dow: dowRaw, domAny: f[2] === '*', dowAny: f[4] === '*' };
}

function nextCron(expr: string, after: number, timezone: string, endMs: number | null) {
  const cron = parseCron(expr);
  if (!cron) return null;
  const startLocal = localParts(after, timezone);
  for (let offset = 0; offset <= MAX_SCAN_DAYS; offset++) {
    const day = new Date(Date.UTC(startLocal.y, startLocal.m - 1, startLocal.d + offset));
    const y = day.getUTCFullYear();
    const m = day.getUTCMonth() + 1;
    const d = day.getUTCDate();
    if (!cron.month.has(m)) continue;
    const domOk = cron.dom.has(d);
    const dowOk = cron.dow.has(day.getUTCDay());
    // Semântica clássica do cron: se ambos os campos são restritos, basta um deles.
    const dayOk =
      !cron.domAny && !cron.dowAny
        ? domOk || dowOk
        : (cron.domAny || domOk) && (cron.dowAny || dowOk);
    if (!dayOk) continue;
    for (const hh of [...cron.hour].sort((a, b) => a - b)) {
      for (const mm of [...cron.minute].sort((a, b) => a - b)) {
        const ts = zonedToUtc(y, m, d, hh, mm, timezone);
        if (ts > after) return endMs !== null && ts > endMs ? null : ts;
      }
    }
  }
  return null;
}

/** Próxima execução estritamente posterior a `after`, ou null se o agendamento terminou. */
export function computeNextRun(spec: ScheduleSpec, after: Date = new Date()): Date | null {
  const t = parseTime(spec.time);
  if (!t) return null;
  const afterMs = after.getTime();
  const endMs = spec.endDate ? spec.endDate.getTime() : null;
  const startLocal = localParts(spec.startDate.getTime(), spec.timezone);
  const startDay = Date.UTC(startLocal.y, startLocal.m - 1, startLocal.d);
  const within = (ts: number) => (endMs === null || ts <= endMs ? new Date(ts) : null);

  if (spec.type === 'CUSTOM') {
    if (!spec.cronExpression) return null;
    const floor = Math.max(afterMs, spec.startDate.getTime() - 1);
    const ts = nextCron(spec.cronExpression, floor, spec.timezone, endMs);
    return ts === null ? null : new Date(ts);
  }

  if (spec.type === 'ONCE') {
    const ts = zonedToUtc(startLocal.y, startLocal.m, startLocal.d, t.hh, t.mm, spec.timezone);
    return ts > afterMs ? within(ts) : null;
  }

  const from = localParts(afterMs, spec.timezone);
  for (let offset = 0; offset <= MAX_SCAN_DAYS; offset++) {
    const day = new Date(Date.UTC(from.y, from.m - 1, from.d + offset));
    if (day.getTime() < startDay) continue;
    const y = day.getUTCFullYear();
    const m = day.getUTCMonth() + 1;
    const d = day.getUTCDate();
    if (spec.type === 'WEEKLY' && !(spec.daysOfWeek ?? []).includes(day.getUTCDay())) continue;
    if (spec.type === 'MONTHLY') {
      const target = Math.min(spec.dayOfMonth ?? startLocal.d, daysInMonth(y, m));
      if (d !== target) continue;
    }
    const ts = zonedToUtc(y, m, d, t.hh, t.mm, spec.timezone);
    if (ts > afterMs) return within(ts);
  }
  return null;
}

/** Próximas N ocorrências (pré-visualização no formulário). */
export function previewRuns(spec: ScheduleSpec, count: number, after: Date = new Date()): Date[] {
  const out: Date[] = [];
  let cursor = after;
  while (out.length < count) {
    const next = computeNextRun(spec, cursor);
    if (!next) break;
    out.push(next);
    cursor = next;
  }
  return out;
}
