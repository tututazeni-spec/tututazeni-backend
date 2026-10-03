// src/process-standard/process-audit.ts
// Registo de auditoria dos processos (hash por entrada) partilhado pelo
// ProcessStandardService e pelo motor — evita dependências circulares entre eles.
import { Logger } from '@nestjs/common';
import { createHash } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';

export type AuditSource = 'INTERFACE' | 'API' | 'AUTOMATION' | 'SYSTEM';

export interface ProcessAuditEntry {
  processId?: number;
  instanceId?: number;
  userId: number;
  action: string;
  meta?: object;
  // docs/Modulo_Processes.md §13 — campos opcionais; quando em falta, são
  // inferidos de `meta` (reason/justification, from/to) e da acção.
  source?: AuditSource;
  previousStatus?: string;
  newStatus?: string;
  reason?: string;
  result?: 'SUCCESS' | 'FAILED';
  errorMessage?: string;
  correlationId?: string;
}

const str = (v: unknown, max = 500): string | undefined =>
  typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : undefined;

/** Origem inferida da acção quando o chamador não a indica. */
export function inferAuditSource(action: string): AuditSource {
  if (/^(process_|AUTO|STEP_AUTO|APPROVAL_AUTO|AUTOMATION)/i.test(action)) return 'AUTOMATION';
  if (/^(INTEGRATION|EVENT_RECEIVED)/.test(action)) return 'API';
  return 'INTERFACE';
}

export function resolveAuditFields(opts: ProcessAuditEntry) {
  const m = (opts.meta ?? {}) as Record<string, unknown>;
  return {
    source: opts.source ?? inferAuditSource(opts.action),
    previousStatus: opts.previousStatus ?? str(m.previousStatus ?? m.from ?? m.fromStatus, 60),
    newStatus: opts.newStatus ?? str(m.newStatus ?? m.to ?? m.toStatus ?? m.status, 60),
    reason: opts.reason ?? str(m.reason ?? m.justification ?? m.comment ?? m.notes),
    result: opts.result ?? (opts.errorMessage || m.error ? 'FAILED' : 'SUCCESS'),
    errorMessage: opts.errorMessage ?? str(m.error),
    correlationId: opts.correlationId ?? str(m.correlationId, 80),
  };
}

export async function writeProcessAuditLog(
  prisma: PrismaService,
  logger: Logger,
  opts: ProcessAuditEntry,
) {
  const payload = { ...opts, ts: new Date().toISOString() };
  try {
    await prisma.processAuditLog.create({
      data: {
        processId: opts.processId,
        instanceId: opts.instanceId,
        userId: opts.userId,
        action: opts.action,
        meta: opts.meta ? JSON.stringify(opts.meta) : null,
        hash: createHash('sha256').update(JSON.stringify(payload)).digest('hex'),
        createdAt: new Date(),
        ...resolveAuditFields(opts),
      },
    });
  } catch (e: unknown) {
    logger.warn({
      userId: opts.userId,
      action: opts.action,
      processId: opts.processId,
      instanceId: opts.instanceId,
      err: { message: e instanceof Error ? e.message : String(e) },
      msg: 'Falha ao escrever audit log de processo',
    });
  }
}
