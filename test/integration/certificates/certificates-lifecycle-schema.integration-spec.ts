import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

const TEST_DB_URL = 'postgresql://postgres:postgres@127.0.0.1:5432/innova_test';

describe('Certificates lifecycle schema', () => {
  const pool = new Pool({ connectionString: TEST_DB_URL });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) } as never) as PrismaClient;
  const stamp = `life-${Date.now()}`;

  afterAll(async () => {
    // filhos antes de pais: a reemissão aponta para o original
    await prisma.certificate.deleteMany({
      where: { replacesId: { not: null }, validationCode: { startsWith: stamp } },
    });
    await prisma.certificate.deleteMany({ where: { validationCode: { startsWith: stamp } } });
    await prisma.$disconnect();
    await pool.end();
  });

  it('liga a reemissão ao original e usa INTERNAL por omissão', async () => {
    const original = await prisma.certificate.create({
      data: { type: 'COURSE', validationCode: `${stamp}-1` },
    });
    expect(original.origin).toBe('INTERNAL');

    await prisma.certificate.create({
      data: {
        type: 'COURSE',
        validationCode: `${stamp}-2`,
        origin: 'EXTERNAL',
        replacesId: original.id,
        observations: 'nota',
        lastExpiryAlertDays: 30,
      },
    });

    const reloaded = await prisma.certificate.findUnique({
      where: { id: original.id },
      include: { replacedBy: true },
    });
    expect(reloaded!.replacedBy).toHaveLength(1);
    expect(reloaded!.replacedBy[0]).toMatchObject({ origin: 'EXTERNAL', lastExpiryAlertDays: 30 });
  });
});
