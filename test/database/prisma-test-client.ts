// Helper partilhado pelos testes de BD — Prisma 7 exige adapter (@prisma/adapter-pg);
// as opções datasources/datasourceUrl foram removidas do construtor do PrismaClient.
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

export const TEST_DB_URL =
  process.env.DATABASE_URL && process.env.DATABASE_URL.includes('innova_test')
    ? process.env.DATABASE_URL
    : 'postgresql://postgres:Placido*7@127.0.0.1:5432/innova_test';

export interface TestDb {
  prisma: PrismaClient;
  pool: Pool;
}

export function createTestDb(): TestDb {
  const pool = new Pool({ connectionString: TEST_DB_URL, max: 5 });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter } as any);
  return { prisma, pool };
}

export async function closeTestDb(db: TestDb): Promise<void> {
  await db.prisma.$disconnect();
  await db.pool.end().catch(() => undefined);
}
