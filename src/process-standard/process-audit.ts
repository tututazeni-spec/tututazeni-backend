// src/process-standard/process-audit.ts
// Registo de auditoria dos processos (hash por entrada) partilhado pelo
// ProcessStandardService e pelo motor — evita dependências circulares entre eles.
import { Logger } from '@nestjs/common';
import { createHash } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';

export interface ProcessAuditEntry {
  processId?: number;
  instanceId?: number;
  userId: number;
  action: string;
  meta?: object;
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
