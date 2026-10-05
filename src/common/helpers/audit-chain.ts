// modulo_audit.md §15.3 — escrita encadeada (SHA-256) partilhada por todos os caminhos de auditoria.
import * as crypto from 'crypto';
import { Prisma, PrismaClient } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { getRequestContext } from '../logging/request-context';
import { AUDIT_SCHEMA_VERSION, resolveAuditModule } from './audit-modules';

export const GENESIS_HASH = 'GENESIS';
// Chave arbitrária estável do advisory lock que serializa a cadeia entre processos/instâncias.
const CHAIN_LOCK_KEY = 7340001;

export function computeAuditHash(
  userId: number | null | undefined,
  action: string,
  entity: string,
  entityId: number | null | undefined,
  timestamp: Date,
  previousHash: string,
): string {
  const payload = `${userId ?? null}|${action}|${entity}|${entityId ?? ''}|${timestamp.toISOString()}|${previousHash}`;
  return crypto.createHash('sha256').update(payload).digest('hex');
}

/**
 * Grava um AuditLog como novo elo da cadeia. O lock transaccional garante que dois
 * escritores concorrentes não leem o mesmo `previousHash`. Só linhas com hash contam
 * para a cadeia (registos anteriores a esta migração ficam fora dela).
 */
export async function writeChainedAuditLog(
  prisma: PrismaService,
  data: Omit<Prisma.AuditLogUncheckedCreateInput, 'hash' | 'previousHash' | 'timestamp'>,
) {
  // Chamadores directos (auth, roles, integrações, automações…) não passam pelo
  // AuditService comum; completa aqui módulo/eventType/origem/correlação para que
  // todos os eventos apareçam classificados (modulo_audit.md §13, §15).
  const ctx = getRequestContext();
  const module = data.module ?? resolveAuditModule(data.entity);
  // `userId: 0` (placeholder antigo) viola a FK para User e perdia o evento em silêncio:
  // usa o autor do pedido em curso, ou nulo (evento de sistema) quando não há.
  const ctxUserId = ctx.userId == null ? null : Number(ctx.userId);
  const userId =
    data.userId === 0 || data.userId === undefined
      ? Number.isFinite(ctxUserId) && ctxUserId !== 0
        ? ctxUserId
        : null
      : data.userId;
  const enriched = {
    ...data,
    userId,
    module,
    eventType: data.eventType ?? `${module}.${data.action}`,
    actorType: data.actorType ?? (userId == null ? 'SYSTEM' : 'USER'),
    source: data.source ?? (ctx.reqId ? 'API' : 'JOB'),
    correlationId: data.correlationId ?? ctx.reqId,
    schemaVersion: data.schemaVersion ?? AUDIT_SCHEMA_VERSION,
  };
  return prisma.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${CHAIN_LOCK_KEY})`;
    const last = await tx.auditLog.findFirst({
      where: { hash: { not: null } },
      orderBy: { id: 'desc' },
      select: { hash: true },
    });
    const previousHash = last?.hash ?? GENESIS_HASH;
    const timestamp = new Date();
    const hash = computeAuditHash(
      enriched.userId,
      enriched.action,
      enriched.entity,
      enriched.entityId,
      timestamp,
      previousHash,
    );
    return tx.auditLog.create({ data: { ...enriched, hash, previousHash, timestamp } });
  });
}

/**
 * Única via autorizada para apagar AuditLog (purga de retenção aprovada pela política,
 * ou limpeza de dados de teste): o trigger append-only da BD só deixa passar com
 * `app.audit_purge='on'` na transacção. Nunca chamar a partir de fluxos de negócio.
 */
export async function purgeAuditLogs(prisma: PrismaClient, where: Prisma.AuditLogWhereInput) {
  const [, result] = await prisma.$transaction([
    prisma.$executeRaw`SELECT set_config('app.audit_purge', 'on', true)`,
    prisma.auditLog.deleteMany({ where }),
  ]);
  return result.count;
}
