// src/process-standard/process-states.ts
// Estados padronizados (docs/Modulo_Processes.md §18). Processo, tarefa e
// aprovação têm vocabulários separados. Os valores persistidos mantêm-se (enums
// Prisma / strings já usadas pelo motor); esta camada traduz para o vocabulário
// canónico exposto pela API, de modo a haver uma única fonte de verdade.

export const PROCESS_STATES = [
  'DRAFT',
  'ACTIVE',
  'SUSPENDED',
  'COMPLETED',
  'CANCELLED',
  'FAILED',
] as const;
export const TASK_STATES = [
  'PENDING',
  'IN_PROGRESS',
  'BLOCKED',
  'COMPLETED',
  'CANCELLED',
  'OVERDUE',
] as const;
export const APPROVAL_STATES = [
  'PENDING',
  'APPROVED',
  'REJECTED',
  'RETURNED',
  'DELEGATED',
  'CANCELLED',
] as const;

export type ProcessState = (typeof PROCESS_STATES)[number];
export type TaskState = (typeof TASK_STATES)[number];
export type ApprovalState = (typeof APPROVAL_STATES)[number];

/** Prefixo com que o motor marca o bloqueio de uma etapa automática que falhou. */
export const AUTO_FAILURE_PREFIX = 'Falha automática';

interface InstanceLike {
  status: string;
  stepProgress?: Array<{ status: string; blockedReason?: string | null }>;
}

/**
 * Estado canónico de uma instância. `FAILED` é derivado: a instância continua
 * em execução (para permitir intervenção/repetição), mas tem uma etapa
 * automática bloqueada por falha. `DRAFT` só existe se alguma vez for persistido.
 */
export function processState(inst: InstanceLike): ProcessState {
  switch (inst.status) {
    case 'COMPLETED':
      return 'COMPLETED';
    case 'CANCELLED':
      return 'CANCELLED';
    case 'ON_HOLD':
      return 'SUSPENDED';
    case 'DRAFT':
      return 'DRAFT';
    case 'FAILED':
      return 'FAILED';
    default:
      return inst.stepProgress?.some(
        s => s.status === 'BLOCKED' && s.blockedReason?.startsWith(AUTO_FAILURE_PREFIX),
      )
        ? 'FAILED'
        : 'ACTIVE';
  }
}

interface TaskLike {
  status: string;
  slaDeadline?: Date | string | null;
}

/** `OVERDUE` é uma condição calculada a partir do prazo — nunca persistida. */
export function isOverdue(t: TaskLike, now = new Date()): boolean {
  if (!t.slaDeadline) return false;
  if (!['PENDING', 'IN_PROGRESS', 'BLOCKED', 'ESCALATED'].includes(t.status)) return false;
  return new Date(t.slaDeadline).getTime() < now.getTime();
}

/** Estado canónico de uma tarefa (etapa activa de uma instância). */
export function taskState(
  t: TaskLike,
  now = new Date(),
): TaskState | 'WAITING' | 'REJECTED' | 'SKIPPED' {
  if (isOverdue(t, now)) return 'OVERDUE';
  switch (t.status) {
    case 'PENDING':
      return 'PENDING';
    case 'IN_PROGRESS':
    case 'ESCALATED':
      return 'IN_PROGRESS';
    case 'BLOCKED':
      return 'BLOCKED';
    case 'COMPLETED':
      return 'COMPLETED';
    case 'CANCELLED':
      return 'CANCELLED';
    default:
      // WAITING / REJECTED / SKIPPED não têm equivalente no vocabulário padrão
      return t.status as 'WAITING' | 'REJECTED' | 'SKIPPED';
  }
}

interface ApprovalLike {
  status: string;
  previousApproverId?: number | null;
}

/**
 * Estado canónico de uma aprovação. A delegação não altera a decisão: o pedido
 * delegado continua `PENDING`; `delegated` informa à parte (§18, última nota).
 */
export function approvalState(a: ApprovalLike): {
  state: ApprovalState;
  delegated: boolean;
} {
  const delegated = a.previousApproverId != null;
  switch (a.status) {
    case 'APPROVED':
    case 'REJECTED':
    case 'RETURNED':
    case 'CANCELLED':
      return { state: a.status, delegated };
    // WAITING / PENDING / INFO_REQUESTED / ESCALATED: decisão ainda por tomar
    default:
      return { state: 'PENDING', delegated };
  }
}

/** Transições de processo permitidas (estado canónico → estados seguintes). */
export const PROCESS_TRANSITIONS: Record<ProcessState, readonly ProcessState[]> = {
  DRAFT: ['ACTIVE', 'CANCELLED'],
  ACTIVE: ['SUSPENDED', 'COMPLETED', 'CANCELLED', 'FAILED'],
  SUSPENDED: ['ACTIVE', 'CANCELLED'],
  FAILED: ['ACTIVE', 'CANCELLED'],
  COMPLETED: [],
  CANCELLED: [],
};

export const canTransitionProcess = (from: ProcessState, to: ProcessState) =>
  PROCESS_TRANSITIONS[from].includes(to);

/** Tipo de agente do evento, a partir da origem (§17 ProcessEvent.actorType). */
export function actorTypeFor(source: string): 'USER' | 'SYSTEM' | 'AUTOMATION' | 'INTEGRATION' {
  if (source === 'AUTOMATION') return 'AUTOMATION';
  if (source === 'API') return 'INTEGRATION';
  if (source === 'SYSTEM') return 'SYSTEM';
  return 'USER';
}
