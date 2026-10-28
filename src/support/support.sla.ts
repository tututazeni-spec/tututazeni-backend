// Tempos de primeira resposta do suporte, contados em HORAS ÚTEIS (seg–sex, 08:00–18:00,
// hora de Luanda = UTC+1, sem DST). Alinhado com docs/deploy/sla-contratual.md (crítico: 1 h útil).

export const SUPPORT_PRIORITIES = ['CRITICAL', 'HIGH', 'NORMAL', 'LOW'] as const;
export type SupportPriority = (typeof SUPPORT_PRIORITIES)[number];

export const SUPPORT_CATEGORIES = [
  'ACCESS',
  'BUG',
  'QUESTION',
  'REQUEST',
  'BILLING',
  'OTHER',
] as const;
export type SupportCategory = (typeof SUPPORT_CATEGORIES)[number];

export const SUPPORT_STATUSES = [
  'OPEN',
  'IN_PROGRESS',
  'WAITING_CUSTOMER',
  'RESOLVED',
  'CLOSED',
] as const;
export type SupportStatus = (typeof SUPPORT_STATUSES)[number];

/** Primeira resposta, em horas úteis. */
export const FIRST_RESPONSE_BUSINESS_HOURS: Record<SupportPriority, number> = {
  CRITICAL: 1,
  HIGH: 4,
  NORMAL: 8,
  LOW: 24,
};

export const BUSINESS_DAY_START = 8;
export const BUSINESS_DAY_END = 18;
const UTC_OFFSET_MS = 60 * 60 * 1000; // Luanda

/** Soma `hours` horas úteis a `from`. Fora do horário, a contagem começa na próxima abertura. */
export function addBusinessHours(from: Date, hours: number): Date {
  // "relógio de parede" de Luanda representado em campos UTC
  const t = new Date(from.getTime() + UTC_OFFSET_MS);
  let remainingMin = Math.round(hours * 60);

  const isWeekend = (d: Date) => d.getUTCDay() === 0 || d.getUTCDay() === 6;
  const nextOpening = (d: Date) => {
    do {
      d.setUTCDate(d.getUTCDate() + 1);
    } while (isWeekend(d));
    d.setUTCHours(BUSINESS_DAY_START, 0, 0, 0);
  };

  if (isWeekend(t)) {
    t.setUTCDate(t.getUTCDate() - 1); // para o nextOpening avançar a partir de um dia anterior
    nextOpening(t);
  } else if (t.getUTCHours() >= BUSINESS_DAY_END) {
    nextOpening(t);
  } else if (t.getUTCHours() < BUSINESS_DAY_START) {
    t.setUTCHours(BUSINESS_DAY_START, 0, 0, 0);
  }

  for (;;) {
    const minutesOfDay = t.getUTCHours() * 60 + t.getUTCMinutes();
    const availableToday = BUSINESS_DAY_END * 60 - minutesOfDay;
    if (remainingMin <= availableToday) {
      t.setUTCMinutes(t.getUTCMinutes() + remainingMin);
      break;
    }
    remainingMin -= availableToday;
    nextOpening(t);
  }
  return new Date(t.getTime() - UTC_OFFSET_MS);
}

export function firstResponseDueAt(priority: SupportPriority, createdAt: Date): Date {
  return addBusinessHours(createdAt, FIRST_RESPONSE_BUSINESS_HOURS[priority]);
}

/** Pedido em atraso: sem primeira resposta e prazo ultrapassado. */
export function isOverdue(
  t: { firstRespondedAt: Date | null; firstResponseDueAt: Date; status: string },
  now = new Date(),
): boolean {
  if (t.firstRespondedAt) return false;
  if (t.status === 'RESOLVED' || t.status === 'CLOSED') return false;
  return t.firstResponseDueAt.getTime() < now.getTime();
}
