// src/automation/automation-tasks.util.ts
// §8 — constantes e helpers puros das aprovações/tarefas de automação.

export const TASK_STATUSES = [
  'PENDING',
  'APPROVED',
  'REJECTED',
  'COMPLETED',
  'CANCELLED',
  'EXPIRED',
] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const TASK_PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] as const;
export type TaskPriority = (typeof TASK_PRIORITIES)[number];

export interface TaskHistoryEntry {
  at: string;
  by: number | null; // null = sistema
  action: string; // CREATED | APPROVED | REJECTED | COMPLETED | CANCELLED | EXPIRED | ESCALATED | REASSIGNED | COMMENTED
  from?: number | null;
  to?: number | null;
  comment?: string;
}

export function parseHistory(json?: string | null): TaskHistoryEntry[] {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json) as unknown;
    return Array.isArray(parsed) ? (parsed as TaskHistoryEntry[]) : [];
  } catch {
    return [];
  }
}

export function appendHistory(
  json: string | null | undefined,
  entry: Omit<TaskHistoryEntry, 'at'>,
  now = new Date(),
): string {
  return JSON.stringify([...parseHistory(json), { at: now.toISOString(), ...entry }]);
}

/** Quem pode decidir: aprovador, substituto ou (via `privileged`) ADMIN/RH. */
export function canDecide(
  task: { approverId: number; substituteId: number | null },
  userId: number,
  privileged: boolean,
): boolean {
  return privileged || task.approverId === userId || task.substituteId === userId;
}

export type EscalationAction = 'NONE' | 'ESCALATE' | 'EXPIRE';

/**
 * Decide o que fazer a uma tarefa pendente (§8 — regras de escalonamento):
 *  - o escalonamento (se configurado e ainda não feito) dispara `escalateAfterHours`
 *    depois da criação, e ganha ao prazo se este já tiver passado;
 *  - passado o prazo sem escalonamento possível, expira.
 */
export function nextEscalationAction(
  task: {
    createdAt: Date;
    dueAt: Date | null;
    escalateToId: number | null;
    escalateAfterHours: number | null;
    escalatedAt: Date | null;
  },
  now: Date,
): EscalationAction {
  const canEscalate = !!task.escalateToId && !!task.escalateAfterHours && !task.escalatedAt;
  if (canEscalate) {
    const at = task.createdAt.getTime() + (task.escalateAfterHours as number) * 3_600_000;
    if (at <= now.getTime()) return 'ESCALATE';
  }
  if (task.dueAt && task.dueAt <= now && !canEscalate) return 'EXPIRE';
  return 'NONE';
}
