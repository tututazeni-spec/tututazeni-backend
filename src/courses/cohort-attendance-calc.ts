// Cálculo da assiduidade de uma turma. Funções puras (sem BD) para se testarem à parte.
//
// Regras adoptadas (documentadas em docs/innova-gestao-presencas-claude-code.md §6):
//  - só contam sessões CONCLUÍDAS (as canceladas, agendadas ou em curso ficam de fora);
//  - Presente e Atrasado contam como presença; Ausente não conta;
//  - Justificado não conta como presença; sai do denominador se a turma o definir
//    (excludeExcusedFromTotal) e, caso contrário, conta como falta;
//  - sessão concluída sem registo conta como falta (nunca se assume presença) e é
//    apresentada à parte em `unmarked`;
//  - sem sessões elegíveis a taxa é `null` ("Ainda sem dados"), nunca divisão por zero.

export type AttendanceState = 'PRESENT' | 'ABSENT' | 'LATE' | 'JUSTIFIED';

export interface AttendancePolicy {
  minAttendancePercent: number;
  excludeExcusedFromTotal: boolean;
}

export interface AttendanceSummary {
  eligibleSessions: number;
  present: number;
  late: number;
  absent: number;
  justified: number;
  unmarked: number;
  /** Presente + Atrasado. */
  attended: number;
  /** Denominador efectivamente usado. */
  counted: number;
  /** 0–100 com uma casa decimal; null = ainda sem dados. */
  rate: number | null;
  /** null quando não há dados; true/false face ao mínimo. */
  meetsMinimum: boolean | null;
}

/**
 * @param completedSessionIds sessões concluídas e elegíveis da turma
 * @param marks estado registado por sessão (sessões em falta = sem registo)
 */
export function summarizeAttendance(
  completedSessionIds: number[],
  marks: Map<number, AttendanceState>,
  policy: AttendancePolicy,
): AttendanceSummary {
  const s = { present: 0, late: 0, absent: 0, justified: 0, unmarked: 0 };
  for (const id of completedSessionIds) {
    const m = marks.get(id);
    if (m === 'PRESENT') s.present++;
    else if (m === 'LATE') s.late++;
    else if (m === 'JUSTIFIED') s.justified++;
    else if (m === 'ABSENT') s.absent++;
    else s.unmarked++;
  }
  const eligibleSessions = completedSessionIds.length;
  const attended = s.present + s.late;
  const counted = policy.excludeExcusedFromTotal
    ? eligibleSessions - s.justified
    : eligibleSessions;
  const rate = counted > 0 ? Math.min(100, Math.max(0, round1((attended / counted) * 100))) : null;
  return {
    eligibleSessions,
    ...s,
    attended,
    counted,
    rate,
    meetsMinimum: rate === null ? null : rate >= policy.minAttendancePercent,
  };
}

export function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/** Valida "HH:mm" (00:00–23:59). */
export function isValidTime(t: string | null | undefined): t is string {
  return typeof t === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(t);
}

export function minutesOf(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

/** Duas janelas horárias do mesmo dia sobrepõem-se (encostadas não contam). */
export function timesOverlap(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  return minutesOf(aStart) < minutesOf(bEnd) && minutesOf(bStart) < minutesOf(aEnd);
}

export type EffectiveSessionStatus = 'SCHEDULED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';

/**
 * Estado apresentado: o guardado (agendada/concluída/cancelada) refinado pela hora —
 * uma sessão agendada passa a "em curso" durante o horário e a "concluída" depois dele.
 */
export function effectiveSessionStatus(
  stored: 'SCHEDULED' | 'COMPLETED' | 'CANCELLED',
  date: Date,
  startTime: string,
  endTime: string,
  now: Date = new Date(),
): EffectiveSessionStatus {
  if (stored === 'CANCELLED' || stored === 'COMPLETED') return stored;
  const day = date.toISOString().slice(0, 10);
  const start = new Date(`${day}T${startTime}:00`);
  const end = new Date(`${day}T${endTime}:00`);
  if (now >= end) return 'COMPLETED';
  if (now >= start) return 'IN_PROGRESS';
  return 'SCHEDULED';
}
