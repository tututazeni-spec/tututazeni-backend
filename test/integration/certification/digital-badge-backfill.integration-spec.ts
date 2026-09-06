import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { backfillDigitalBadges } from '../../../prisma/backfill-digital-badges';
import { INT_CREDENTIALS } from '../helpers/auth.helper';

const TEST_DB_URL = 'postgresql://postgres:postgres@127.0.0.1:5432/innova_test';

const rnd = () => Math.random().toString(36).slice(2, 10);

describe('Fase F3 — backfill DigitalBadge/BadgeIssuance -> Badge/BadgeAward', () => {
  const pool = new Pool({ connectionString: TEST_DB_URL });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter } as any);

  let userId: number;
  let issuerId: number;
  const tag = rnd();

  // DigitalBadge ids
  const dbPlain = `dbid-plain-${tag}`;
  const dbCollide = `dbid-collide-${tag}`;
  const dbSoftDel = `dbid-softdel-${tag}`;
  const dbSuffixA = `dbid-suffixA-${tag}`;
  const dbSuffixB = `dbid-suffixB-${tag}`;
  const sharedName = `F3 Nome Partilhado ${tag}`;
  // BadgeIssuance ids
  const biActive = `biid-active-${tag}`;
  const biRevoked = `biid-revoked-${tag}`;

  const nativeName = `F3 Nativo ${tag}`;
  let nativeBadgeId: number;

  beforeAll(async () => {
    const emp = await prisma.user.findUnique({ where: { email: INT_CREDENTIALS.employee.email } });
    const rh = await prisma.user.findUnique({ where: { email: INT_CREDENTIALS.rh.email } });
    userId = emp!.id;
    issuerId = rh!.id;

    // Badge nativo pré-existente cujo `name` colide com um DigitalBadge -> deve ser reutilizado.
    const native = await prisma.badge.create({ data: { name: nativeName, description: 'nativo' } });
    nativeBadgeId = native.id;

    const mkBadge = (over: Record<string, unknown>) =>
      prisma.digitalBadge.create({
        data: {
          code: `F3-BDG-${rnd()}`,
          name: `F3 Badge ${rnd()}`,
          description: 'badge de teste F3',
          imageUrl: 'https://x/img.png',
          criteria: 'critério',
          skills: ['a', 'b'],
          level: 'ADVANCED',
          createdById: issuerId,
          ...over,
        } as never,
      });

    await mkBadge({ id: dbPlain, level: 'EXPERT' });
    await mkBadge({ id: dbCollide, name: nativeName }); // colide com o Badge nativo
    await mkBadge({ id: dbSoftDel, deletedAt: new Date('2026-05-01') });
    // dois DigitalBadge com o mesmo `name` (nenhum nativo) -> 2º sufixado " (2)"
    await mkBadge({ id: dbSuffixA, name: sharedName });
    await mkBadge({ id: dbSuffixB, name: sharedName });

    const mkIssuance = (over: Record<string, unknown>) =>
      prisma.badgeIssuance.create({
        data: {
          badgeId: dbPlain,
          userId,
          verifyCode: `F3-VER-${rnd()}`,
          issuedById: issuerId,
          issuedAt: new Date('2026-03-15T10:00:00Z'),
          ...over,
        } as never,
      });

    await mkIssuance({ id: biActive });
    await mkIssuance({
      id: biRevoked,
      badgeId: dbCollide,
      verifyCode: `F3-VER-${rnd()}`,
      isRevoked: true,
      revokedAt: new Date('2026-04-10'),
      revokeReason: 'engano',
    });
  });

  afterAll(async () => {
    await prisma.badgeAward
      .deleteMany({ where: { legacyBadgeIssuanceId: { in: [biActive, biRevoked] } } })
      .catch(() => undefined);
    await prisma.badgeIssuance
      .deleteMany({ where: { id: { in: [biActive, biRevoked] } } })
      .catch(() => undefined);
    await prisma.badge
      .deleteMany({
        where: { legacyDigitalBadgeId: { in: [dbPlain, dbSoftDel, dbSuffixA, dbSuffixB] } },
      })
      .catch(() => undefined);
    await prisma.digitalBadge
      .deleteMany({
        where: { id: { in: [dbPlain, dbCollide, dbSoftDel, dbSuffixA, dbSuffixB] } },
      })
      .catch(() => undefined);
    await prisma.badge.delete({ where: { id: nativeBadgeId } }).catch(() => undefined);
    await prisma.$disconnect();
    await pool.end();
  });

  it('cria Badge por DigitalBadge, reutiliza o nativo em colisão de name, e copia os campos ricos', async () => {
    const r1 = await backfillDigitalBadges(prisma);
    expect(r1.badgesCreated).toBeGreaterThanOrEqual(2); // dbPlain + dbSoftDel
    expect(r1.badgesLinked).toBeGreaterThanOrEqual(1); // dbCollide -> Badge nativo

    const plain = await prisma.badge.findUnique({ where: { legacyDigitalBadgeId: dbPlain } });
    expect(plain).toBeTruthy();
    expect(plain!.level).toBe('EXPERT');
    expect(plain!.imageUrl).toBe('https://x/img.png');
    expect(plain!.skills).toEqual(['a', 'b']);
    expect(plain!.createdById).toBe(issuerId);

    // colisão de name -> o DigitalBadge liga-se ao Badge nativo, não cria duplicado
    const collideLink = await prisma.badge.findUnique({
      where: { legacyDigitalBadgeId: dbCollide },
    });
    expect(collideLink!.id).toBe(nativeBadgeId);
    expect(await prisma.badge.count({ where: { name: nativeName } })).toBe(1);

    const softDel = await prisma.badge.findUnique({ where: { legacyDigitalBadgeId: dbSoftDel } });
    expect(softDel!.deletedAt).not.toBeNull();
  });

  it('dois DigitalBadge com o mesmo name -> o segundo é sufixado " (2)"', async () => {
    const a = await prisma.badge.findUnique({ where: { legacyDigitalBadgeId: dbSuffixA } });
    const b = await prisma.badge.findUnique({ where: { legacyDigitalBadgeId: dbSuffixB } });
    const names = [a!.name, b!.name].sort();
    expect(names).toEqual([sharedName, `${sharedName} (2)`]);
    expect(a!.id).not.toBe(b!.id);
  });

  it('cria BadgeAward por BadgeIssuance com verifyCode/isRevoked e awardedAt = issuedAt', async () => {
    const active = await prisma.badgeAward.findUnique({
      where: { legacyBadgeIssuanceId: biActive },
    });
    expect(active).toBeTruthy();
    expect(active!.isRevoked).toBe(false);
    expect(active!.awardedAt.toISOString()).toBe('2026-03-15T10:00:00.000Z');
    const plain = await prisma.badge.findUnique({ where: { legacyDigitalBadgeId: dbPlain } });
    expect(active!.badgeId).toBe(plain!.id);

    const revoked = await prisma.badgeAward.findUnique({
      where: { legacyBadgeIssuanceId: biRevoked },
    });
    expect(revoked!.isRevoked).toBe(true);
    expect(revoked!.revokeReason).toBe('engano');
    expect(revoked!.badgeId).toBe(nativeBadgeId); // via dbCollide -> nativo
  });

  it('é idempotente — segunda passagem devolve tudo a zero e não duplica', async () => {
    const r2 = await backfillDigitalBadges(prisma);
    expect(r2.badgesCreated).toBe(0);
    expect(r2.badgesLinked).toBe(0);
    expect(r2.issuancesCreated).toBe(0);
    for (const id of [dbPlain, dbCollide, dbSoftDel, dbSuffixA, dbSuffixB]) {
      expect(await prisma.badge.count({ where: { legacyDigitalBadgeId: id } })).toBe(1);
    }
    for (const id of [biActive, biRevoked]) {
      expect(await prisma.badgeAward.count({ where: { legacyBadgeIssuanceId: id } })).toBe(1);
    }
  });
});
