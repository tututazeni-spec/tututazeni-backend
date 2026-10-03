// src/process-standard/process-calendar.ts
// Lógica pura da aba "Calendário e Prazos" (docs/Modulo_Processes.md §10):
// classificação de prazos, detecção de conflitos de atribuição e exportação
// iCalendar. Sem acesso à BD, para ser testável e partilhada com o serviço.

export const DAILY_CAPACITY_HOURS = 8;
/** Estimativa assumida para tarefas sem `estimatedMinutes` / `slaHours`. */
export const DEFAULT_TASK_HOURS = 1;
export const DUE_SOON_HOURS = 48;
const HOUR_MS = 3_600_000;

export type CalendarItemKind = 'TASK' | 'PROCESS';

export interface CalendarItem {
  key: string;
  kind: CalendarItemKind;
  instanceId: number;
  stepId: number | null;
  code: string;
  title: string;
  processTitle: string;
  processCode: string;
  assignee: { id: number; fullName: string } | null;
  department: { id: number; name: string } | null;
  startAt: Date | null;
  dueAt: Date | null;
  durationHours: number | null;
  status: string;
  priority: string;
  dependencies: Array<{ order: number; title: string; status: string; done: boolean }>;
  approvalDueAt: Date | null;
  completedAt: Date | null;
}

export interface CalendarFlags {
  isOverdue: boolean;
  isDueSoon: boolean;
}

const OPEN_TASK_STATUSES = ['WAITING', 'PENDING', 'IN_PROGRESS', 'BLOCKED', 'ESCALATED'];
const OPEN_PROCESS_STATUSES = ['IN_PROGRESS', 'ON_HOLD'];

export const isOpenItem = (kind: CalendarItemKind, status: string) =>
  (kind === 'TASK' ? OPEN_TASK_STATUSES : OPEN_PROCESS_STATUSES).includes(status);

/** Atrasado = ainda em aberto com o prazo ultrapassado; a vencer = nas próximas 48h. */
export function classifyDue(
  item: Pick<CalendarItem, 'kind' | 'status' | 'dueAt'>,
  now: Date = new Date(),
): CalendarFlags {
  if (!item.dueAt || !isOpenItem(item.kind, item.status)) {
    return { isOverdue: false, isDueSoon: false };
  }
  const left = item.dueAt.getTime() - now.getTime();
  return { isOverdue: left < 0, isDueSoon: left >= 0 && left <= DUE_SOON_HOURS * HOUR_MS };
}

/** Duração prevista em horas: estimativa da etapa, senão o intervalo início→prazo. */
export function plannedDurationHours(
  estimatedMinutes: number | null | undefined,
  slaHours: number | null | undefined,
  startAt: Date | null,
  dueAt: Date | null,
): number | null {
  if (estimatedMinutes && estimatedMinutes > 0) return round1(estimatedMinutes / 60);
  if (slaHours && slaHours > 0) return round1(slaHours);
  if (startAt && dueAt && dueAt > startAt) {
    return round1((dueAt.getTime() - startAt.getTime()) / HOUR_MS);
  }
  return null;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

export interface AssignmentConflict {
  assigneeId: number;
  assigneeName: string;
  /** Dia (UTC) a que a sobrecarga se refere, `YYYY-MM-DD`. */
  day: string;
  totalHours: number;
  capacityHours: number;
  itemKeys: string[];
}

const dayKey = (d: Date) => d.toISOString().slice(0, 10);

/**
 * Conflito de atribuição: o mesmo responsável tem, num único dia de prazo,
 * tarefas em aberto cuja estimativa somada excede a capacidade diária
 * (8h) — e pelo menos duas tarefas envolvidas. Tarefas sem estimativa
 * contam {@link DEFAULT_TASK_HOURS}h.
 */
export function detectAssignmentConflicts(
  items: CalendarItem[],
  capacityHours: number = DAILY_CAPACITY_HOURS,
): AssignmentConflict[] {
  const buckets = new Map<string, { name: string; id: number; hours: number; keys: string[] }>();
  for (const it of items) {
    if (it.kind !== 'TASK' || !it.assignee || !it.dueAt || !isOpenItem(it.kind, it.status))
      continue;
    const k = `${it.assignee.id}|${dayKey(it.dueAt)}`;
    const b = buckets.get(k) ?? {
      id: it.assignee.id,
      name: it.assignee.fullName,
      hours: 0,
      keys: [],
    };
    b.hours += it.durationHours ?? DEFAULT_TASK_HOURS;
    b.keys.push(it.key);
    buckets.set(k, b);
  }
  const out: AssignmentConflict[] = [];
  for (const [k, b] of buckets) {
    if (b.keys.length >= 2 && b.hours > capacityHours) {
      out.push({
        assigneeId: b.id,
        assigneeName: b.name,
        day: k.split('|')[1],
        totalHours: round1(b.hours),
        capacityHours,
        itemKeys: b.keys,
      });
    }
  }
  return out.sort((a, b) => a.day.localeCompare(b.day) || b.totalHours - a.totalHours);
}

// ─── iCalendar (RFC 5545) ───────────────────────────────────────────────────

const icsDate = (d: Date) =>
  d
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}/, '');
const icsEscape = (s: string) =>
  s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');

/** Linhas longas são dobradas a 75 octetos (aproximado em caracteres). */
function fold(line: string): string {
  if (line.length <= 75) return line;
  const parts: string[] = [line.slice(0, 75)];
  for (let i = 75; i < line.length; i += 74) parts.push(' ' + line.slice(i, i + 74));
  return parts.join('\r\n');
}

export function buildIcs(items: CalendarItem[], now: Date = new Date()): string {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//INNOVA//Processos//PT',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:INNOVA — Prazos de processos',
  ];
  for (const it of items) {
    if (!it.dueAt) continue;
    const end = it.dueAt;
    const start = it.startAt && it.startAt < end ? it.startAt : new Date(end.getTime() - HOUR_MS);
    lines.push(
      'BEGIN:VEVENT',
      `UID:${it.key}@innova-processos`,
      `DTSTAMP:${icsDate(now)}`,
      `DTSTART:${icsDate(start)}`,
      `DTEND:${icsDate(end)}`,
      `SUMMARY:${icsEscape(`${it.code} — ${it.title}`)}`,
      `DESCRIPTION:${icsEscape(
        [
          it.processTitle,
          it.assignee ? `Responsável: ${it.assignee.fullName}` : '',
          `Estado: ${it.status}`,
        ]
          .filter(Boolean)
          .join('\n'),
      )}`,
      `STATUS:${it.completedAt ? 'CONFIRMED' : 'TENTATIVE'}`,
      'END:VEVENT',
    );
  }
  lines.push('END:VCALENDAR');
  return lines.map(fold).join('\r\n') + '\r\n';
}

/** Intervalo por defeito (mês corrente ± margem) quando o cliente não envia datas. */
export function defaultRange(now: Date = new Date()): { from: Date; to: Date } {
  const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  const to = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 2, 0, 23, 59, 59, 999));
  return { from, to };
}
