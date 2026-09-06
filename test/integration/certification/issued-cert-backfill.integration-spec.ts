import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { backfillIssuedCertificates } from '../../../prisma/backfill-issued-certificates';
import { INT_CREDENTIALS } from '../helpers/auth.helper';

const TEST_DB_URL = 'postgresql://postgres:postgres@127.0.0.1:5432/innova_test';

describe('Fase F2 — backfill IssuedCertificate -> Certificate', () => {
  const pool = new Pool({ connectionString: TEST_DB_URL });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter } as any);

  let userId: number;
  let issuerId: number;
  let courseId: number;
  const icIds: string[] = [];

  beforeAll(async () => {
    const emp = await prisma.user.findUnique({ where: { email: INT_CREDENTIALS.employee.email } });
    const rh = await prisma.user.findUnique({ where: { email: INT_CREDENTIALS.rh.email } });
    userId = emp!.id;
    issuerId = rh!.id;

    const course = await prisma.course.create({
      data: { title: `BF Cert Course ${Date.now()}`, description: 'x' } as never,
    });
    courseId = course.id;

    const mk = (over: Record<string, unknown>) =>
      prisma.issuedCertificate.create({
        data: {
          code: `BF-CODE-${Math.random().toString(36).slice(2, 8)}`,
          verificationCode: `BF-VER-${Math.random().toString(36).slice(2, 10)}`,
          hashCode: 'h'.repeat(16),
          userId,
          issuedById: issuerId,
          title: 'Cert',
          recipientName: 'Empregado Int',
          type: 'COURSE',
          ...over,
        } as never,
      });

    icIds.push((await mk({ type: 'PROGRAM', courseId: String(courseId) })).id);
    icIds.push((await mk({ type: 'ACHIEVEMENT', courseId: 'nao-numerico' })).id);
    icIds.push((await mk({ type: 'ATTENDANCE', courseId: '999999999' })).id); // numérico mas inexistente
    const revoked = await mk({
      type: 'COMPETENCY',
      isRevoked: true,
      revokedAt: new Date('2026-04-01'),
      revokeReason: 'erro administrativo',
      revokedById: issuerId,
      downloadCount: 3,
      verifyCount: 7,
    });
    icIds.push(revoked.id);
  });

  afterAll(async () => {
    await prisma.certificate
      .deleteMany({ where: { legacyIssuedCertId: { in: icIds } } })
      .catch(() => undefined);
    await prisma.issuedCertificate
      .deleteMany({ where: { id: { in: icIds } } })
      .catch(() => undefined);
    await prisma.course.delete({ where: { id: courseId } }).catch(() => undefined);
    await prisma.$disconnect();
    await pool.end();
  });

  it('migra cada IssuedCertificate preservando legacyIssuedCertId, legacyType e o mapeamento de type', async () => {
    const r1 = await backfillIssuedCertificates(prisma);
    expect(r1.created).toBeGreaterThanOrEqual(4);

    const rows = await prisma.certificate.findMany({
      where: { legacyIssuedCertId: { in: icIds } },
      orderBy: { legacyIssuedCertId: 'asc' },
    });
    expect(rows).toHaveLength(4);
    const byLegacy = Object.fromEntries(rows.map(c => [c.legacyIssuedCertId, c]));

    const program = byLegacy[icIds[0]];
    expect(program.legacyType).toBe('PROGRAM');
    expect(program.type).toBe('LEADERSHIP');
    expect(program.userId).toBe(userId);
    expect(program.issuedById).toBe(issuerId);
    expect(program.courseId).toBe(courseId); // FK válida -> Int

    const achievement = byLegacy[icIds[1]];
    expect(achievement.legacyType).toBe('ACHIEVEMENT');
    expect(achievement.type).toBe('TRAINING');
    expect(achievement.courseId).toBeNull(); // "nao-numerico" -> null (skip + warn)

    expect(byLegacy[icIds[2]].courseId).toBeNull(); // numérico mas inexistente -> null

    const revoked = byLegacy[icIds[3]];
    expect(revoked.legacyType).toBe('COMPETENCY');
    expect(revoked.type).toBe('DEVELOPMENT');
    expect(revoked.revoked).toBe(true);
    expect(revoked.revokeReason).toBe('erro administrativo');
    expect(revoked.revokedById).toBe(issuerId);
    expect(revoked.downloadCount).toBe(3);
    expect(revoked.verifyCount).toBe(7);
  });

  it('é idempotente — segunda passagem não cria nem duplica', async () => {
    const r2 = await backfillIssuedCertificates(prisma);
    expect(r2.created).toBe(0);
    expect(r2.skipped).toBeGreaterThanOrEqual(4);
    for (const id of icIds) {
      expect(await prisma.certificate.count({ where: { legacyIssuedCertId: id } })).toBe(1);
    }
  });
});
