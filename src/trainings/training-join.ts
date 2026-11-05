// src/trainings/training-join.ts
// Regras puras da "ponte" formação → execução (POST /trainings/sessions/:id/join).
// Sem acesso à BD: facilita testar a janela de entrada e o cálculo do atraso.

/** A entrada abre tantos minutos antes do início da sessão. Único sítio onde vive. */
export const TRAINING_JOIN_EARLY_MINUTES = 15;

const MINUTE_MS = 60_000;

export interface SessionTimes {
  sessionDate: Date;
  durationMinutes: number;
}

export interface JoinWindow {
  opensAt: Date;
  closesAt: Date;
}

/** Janela de entrada: [início − N min, início + durationMinutes]. */
export function sessionJoinWindow(session: SessionTimes): JoinWindow {
  const start = session.sessionDate.getTime();
  return {
    opensAt: new Date(start - TRAINING_JOIN_EARLY_MINUTES * MINUTE_MS),
    closesAt: new Date(start + session.durationMinutes * MINUTE_MS),
  };
}

/**
 * Percentagem da sessão que ainda restava quando o participante entrou
 * (entrar antes do início conta como 100%). Base do critério de
 * `minAttendancePercent` para quem entra com atraso.
 */
export function remainingSharePercent(session: SessionTimes, joinedAt: Date): number {
  const total = session.durationMinutes * MINUTE_MS;
  if (total <= 0) return 100;
  const start = session.sessionDate.getTime();
  const end = start + total;
  const effective = Math.max(joinedAt.getTime(), start);
  return Math.max(0, Math.min(100, ((end - effective) / total) * 100));
}

export type JoinDestination =
  { type: 'MEETING'; url: string } | { type: 'COURSE'; route: string } | { type: 'CHECKIN' };

export interface JoinSessionResult {
  sessionId: number;
  trainingId: number;
  /** Estado da participação depois da entrada (REGISTERED, ATTENDED, COMPLETED). */
  status: string;
  joinedAt: Date;
  /** Entrou depois do início da sessão. */
  late: boolean;
  destination: JoinDestination;
  /** Rota do curso associado, quando o destino principal é a reunião. */
  courseRoute?: string;
}

export function courseLearnRoute(courseId: number): string {
  return `/courses/${courseId}/learn`;
}
