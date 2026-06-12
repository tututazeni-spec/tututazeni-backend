import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

const TEST_DB_URL = 'postgresql://postgres:Placido*7@127.0.0.1:5432/innova_test';

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = TEST_DB_URL;

function createPrisma() {
  const pool = new Pool({ connectionString: TEST_DB_URL });
  const adapter = new PrismaPg(pool);
  return new PrismaClient({ adapter } as any);
}

export default async function globalTeardown() {
  console.log('\n🧹 Teardown — a limpar BD de teste...');

  const prisma = createPrisma();

  const testEmails = [
    'int.employee@innova-test.com',
    'int.manager@innova-test.com',
    'int.rh@innova-test.com',
    'int.admin@innova-test.com',
  ];

  const users = await prisma.user.findMany({
    where: { email: { in: testEmails } },
    select: { id: true },
  });
  const ids = users.map((u) => u.id);

  // Ordem respeita FKs RESTRICT (filhos antes de User). Cada passo é
  // best-effort: o teardown nunca deve mascarar testes verdes com exit 1 —
  // o setup usa upserts, por isso restos de dados não partem a próxima run.
  const steps: Array<[string, () => Promise<unknown>]> = [
    ['developmentPlan', () => prisma.developmentPlan.deleteMany({ where: { userId: { in: ids } } })],
    [
      'leaveRequest',
      () => (prisma as any).leaveRequest.deleteMany({ where: { userId: { in: ids } } }),
    ],
    [
      'notificationPreference',
      () => prisma.notificationPreference.deleteMany({ where: { userId: { in: ids } } }),
    ],
    ['notificationLog', () => prisma.notificationLog.deleteMany({ where: { userId: { in: ids } } })],
    ['enrollment', () => prisma.enrollment.deleteMany({ where: { userId: { in: ids } } })],
    ['badgeAward', () => prisma.badgeAward.deleteMany({ where: { userId: { in: ids } } })],
    [
      'attendanceRecord',
      () => prisma.attendanceRecord.deleteMany({ where: { userId: { in: ids } } }),
    ],
    ['user', () => prisma.user.deleteMany({ where: { email: { in: testEmails } } })],
    ['course', () => prisma.course.deleteMany({ where: { internalCode: 'INT-TEST-001' } })],
  ];

  for (const [name, run] of steps) {
    try {
      await run();
    } catch (e: any) {
      console.warn(`⚠️  Teardown: falha ao limpar ${name}: ${String(e.message).split('\n')[0]}`);
    }
  }

  await prisma.$disconnect();
  console.log('✅ BD de teste limpa\n');
}
