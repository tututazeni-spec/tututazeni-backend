import type { PrismaService } from '../../prisma/prisma.service';

/**
 * `pg_database_size()` percorre os ficheiros da BD e demora segundos em alguns
 * ambientes (ex.: Postgres em Windows). O tamanho muda devagar, por isso é
 * partilhado entre chamadores (métricas de escalabilidade, estado do sistema)
 * e cacheado. O marcador `heavy-ok` evita que seja reportado como "slow query".
 */
const TTL_MS = 30 * 60 * 1000;
let cache: { at: number; value: Promise<bigint> } | null = null;

export function getDatabaseSizeBytes(prisma: PrismaService, maxAgeMs = TTL_MS): Promise<bigint> {
  if (!cache || Date.now() - cache.at > maxAgeMs) {
    const value = prisma.$queryRaw<{ size: bigint }[]>`
        /* heavy-ok */ SELECT pg_database_size(current_database()) AS size`.then(
      rows => rows[0]?.size ?? 0n,
    );
    const entry = { at: Date.now(), value };
    cache = entry;
    value.catch(() => {
      if (cache === entry) cache = null;
    });
  }
  return cache.value;
}
