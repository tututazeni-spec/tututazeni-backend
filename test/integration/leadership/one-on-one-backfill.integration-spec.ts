import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { backfillOneOnOnes } from '../../../prisma/backfill-one-on-ones';
import { INT_CREDENTIALS } from '../helpers/auth.helper';

const TEST_DB_URL = 'postgresql://postgres:postgres@127.0.0.1:5432/innova_test';

describe('Fase G4 — backfill OneOnOne -> OneOnOneMeeting', () => {
  const pool = new Pool({ connectionString: TEST_DB_URL });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter } as any);

  let managerId: number;
  let subordinateId: number;
  const legacyIds: number[] = [];

  beforeAll(async () => {
    const rh = await prisma.user.findUnique({ where: { email: INT_CREDENTIALS.rh.email } });
    const emp = await prisma.user.findUnique({ where: { email: INT_CREDENTIALS.employee.email } });
    managerId = rh!.id;
    subordinateId = emp!.id;

    const mk = (over: Record<string, unknown>) =>
      prisma.oneOnOne.create({
        data: {
          managerId,
          subordinateId,
          scheduledAt: new Date('2026-01-10T09:00:00Z'),
          durationMinutes: 45,
          status: 'SCHEDULED',
          agenda: 'Ponto de situação',
          ...over,
        } as never,
      });

    const scheduled = await mk({});
    const completed = await mk({
      status: 'COMPLETED',
      completedAt: new Date('2026-01-10T09:45:00Z'),
      minutes: 'Acta da reunião',
      actionItems: 'Fazer X',
      nextMeetingDate: new Date('2026-02-10T09:00:00Z'),
    });
    const cancelled = await mk({ status: 'CANCELLED' });
    legacyIds.push(scheduled.id, completed.id, cancelled.id);
  });

  afterAll(async () => {
    await prisma.oneOnOneMeeting
      .deleteMany({ where: { legacyOneOnOneId: { in: legacyIds } } })
      .catch(() => undefined);
    await prisma.oneOnOne.deleteMany({ where: { id: { in: legacyIds } } }).catch(() => undefined);
    await prisma.$disconnect();
    await pool.end();
  });

  it('cria um OneOnOneMeeting por OneOnOne, com o field map correcto', async () => {
    const r1 = await backfillOneOnOnes(prisma);
    expect(r1.created).toBeGreaterThanOrEqual(3);

    const [scheduledId, completedId] = legacyIds;

    const s = await prisma.oneOnOneMeeting.findUnique({
      where: { legacyOneOnOneId: scheduledId },
    });
    expect(s).toBeTruthy();
    expect(s!.hostId).toBe(managerId);
    expect(s!.participantId).toBe(subordinateId);
    expect(s!.durationMinutes).toBe(45);
    expect(s!.recurring).toBe(false);
    expect(s!.status).toBe('SCHEDULED');

    const c = await prisma.oneOnOneMeeting.findUnique({
      where: { legacyOneOnOneId: completedId },
    });
    expect(c!.status).toBe('COMPLETED');
    expect(c!.minutes).toBe('Acta da reunião');
    expect(c!.actionItems).toBe('Fazer X');
    expect(c!.completedAt).not.toBeNull();
    expect(c!.nextMeetingDate).not.toBeNull();
  });

  it('é idempotente — segunda passagem cria 0 e não duplica', async () => {
    const r2 = await backfillOneOnOnes(prisma);
    expect(r2.created).toBe(0);
    for (const id of legacyIds) {
      expect(await prisma.oneOnOneMeeting.count({ where: { legacyOneOnOneId: id } })).toBe(1);
    }
  });
});
