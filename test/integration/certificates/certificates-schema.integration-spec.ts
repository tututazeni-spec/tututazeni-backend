import { PrismaClient, Prisma } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

const TEST_DB_URL = 'postgresql://postgres:postgres@127.0.0.1:5432/innova_test';

describe('Certificates schema', () => {
  const pool = new Pool({ connectionString: TEST_DB_URL });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) } as any);
  const dedupKey = `schema-test:${Date.now()}`;

  afterAll(async () => {
    await prisma.certificate.deleteMany({ where: { dedupKey } });
    await prisma.certificateRule.deleteMany({
      where: { activityKind: 'COURSE', activityId: 999999 },
    });
    await prisma.$disconnect();
    await pool.end();
  });

  it('persiste regra e impede dedupKey duplicada', async () => {
    const rule = await prisma.certificateRule.create({
      data: {
        activityKind: 'COURSE',
        activityId: 999999,
        mode: 'AUTOMATIC',
        criteria: JSON.stringify({ requireFullCompletion: true }),
      },
    });
    expect(rule.active).toBe(true);

    const base = { type: 'COURSE' as const, validationCode: `V-${dedupKey}-1`, dedupKey };
    await prisma.certificate.create({ data: base });
    await expect(
      prisma.certificate.create({ data: { ...base, validationCode: `V-${dedupKey}-2` } }),
    ).rejects.toMatchObject({
      code: 'P2002',
    } satisfies Partial<Prisma.PrismaClientKnownRequestError>);
  });
});
