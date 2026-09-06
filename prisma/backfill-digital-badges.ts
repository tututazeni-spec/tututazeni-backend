// prisma/backfill-digital-badges.ts
//
// Fase F3 — migração de dados idempotente DigitalBadge/BadgeIssuance -> Badge/BadgeAward.
// Corre UMA vez no deploy, DEPOIS de `prisma migrate deploy` e ANTES de o tráfego
// bater em /certification/badges*. Idempotente (skip por legacyDigitalBadgeId /
// legacyBadgeIssuanceId). NÃO corre em test/integration/setup.ts — testado por
// test/integration/certification/digital-badge-backfill.integration-spec.ts.
//
// Mapa: docs/superpowers/plans/notes/fase-f3-badge-map.md §5.

import { PrismaClient } from '@prisma/client';

export interface BackfillDigitalBadgesResult {
  badgesCreated: number;
  badgesLinked: number;
  issuancesCreated: number;
  skipped: number;
}

/** `Badge.name` é `@unique`; `DigitalBadge.name` não. Acha um nome livre por sufixo. */
async function freeName(prisma: PrismaClient, base: string): Promise<string> {
  if (!(await prisma.badge.findFirst({ where: { name: base }, select: { id: true } }))) {
    return base;
  }
  for (let i = 2; i < 1000; i++) {
    const candidate = `${base} (${i})`;
    if (!(await prisma.badge.findFirst({ where: { name: candidate }, select: { id: true } }))) {
      return candidate;
    }
  }
  throw new Error(`backfill: sem nome livre para "${base}" após 1000 tentativas`);
}

export async function backfillDigitalBadges(
  prisma: PrismaClient,
): Promise<BackfillDigitalBadgesResult> {
  const result: BackfillDigitalBadgesResult = {
    badgesCreated: 0,
    badgesLinked: 0,
    issuancesCreated: 0,
    skipped: 0,
  };

  // ── 1. DigitalBadge -> Badge ──────────────────────────────────────────
  const digitalBadges = await prisma.digitalBadge.findMany({ orderBy: { createdAt: 'asc' } });

  for (const db of digitalBadges) {
    const already = await prisma.badge.findUnique({
      where: { legacyDigitalBadgeId: db.id },
      select: { id: true },
    });
    if (already) {
      result.skipped++;
      continue;
    }

    if (db.courseId || db.programId) {
      console.warn(
        `backfill: DigitalBadge ${db.id} tem courseId/programId ("${db.courseId ?? ''}"/"${
          db.programId ?? ''
        }") — descartados (sem coluna em Badge)`,
      );
    }

    // Colisão de `name`: se for com um Badge NATIVO (sem legacyDigitalBadgeId),
    // reutiliza-o (liga); se for com um Badge já ligado a outro DigitalBadge, sufixa.
    const sameName = await prisma.badge.findFirst({
      where: { name: db.name },
      select: { id: true, legacyDigitalBadgeId: true },
    });

    if (sameName && sameName.legacyDigitalBadgeId == null) {
      await prisma.badge.update({
        where: { id: sameName.id },
        data: { legacyDigitalBadgeId: db.id },
      });
      result.badgesLinked++;
      continue;
    }

    const name = sameName ? await freeName(prisma, db.name) : db.name;
    if (sameName) {
      console.warn(`backfill: DigitalBadge ${db.id} name "${db.name}" colide -> "${name}"`);
    }

    const codeClash = db.code
      ? await prisma.badge.findUnique({ where: { code: db.code }, select: { id: true } })
      : null;

    await prisma.badge.create({
      data: {
        name,
        description: db.description,
        code: codeClash ? `LEG-${db.code}` : db.code,
        imageUrl: db.imageUrl,
        criteria: db.criteria,
        skills: db.skills,
        level: db.level,
        issuerName: db.issuerName,
        isActive: db.isActive,
        createdById: db.createdById,
        deletedAt: db.deletedAt ?? undefined,
        legacyDigitalBadgeId: db.id,
      },
    });
    result.badgesCreated++;
  }

  // ── 2. BadgeIssuance -> BadgeAward ────────────────────────────────────
  const issuances = await prisma.badgeIssuance.findMany({ orderBy: { issuedAt: 'asc' } });

  for (const bi of issuances) {
    const already = await prisma.badgeAward.findUnique({
      where: { legacyBadgeIssuanceId: bi.id },
      select: { id: true },
    });
    if (already) {
      result.skipped++;
      continue;
    }

    const badge = await prisma.badge.findUnique({
      where: { legacyDigitalBadgeId: bi.badgeId },
      select: { id: true },
    });
    if (!badge) {
      console.warn(
        `backfill: BadgeIssuance ${bi.id} -> DigitalBadge ${bi.badgeId} sem Badge correspondente — skip`,
      );
      result.skipped++;
      continue;
    }

    // `BadgeAward` tem @@unique([badgeId, userId]); se já existir um award nativo
    // para o par, não se pode criar o histórico — regista e salta.
    const collision = await prisma.badgeAward.findUnique({
      where: { badgeId_userId: { badgeId: badge.id, userId: bi.userId } },
      select: { id: true },
    });
    if (collision) {
      console.warn(
        `backfill: BadgeIssuance ${bi.id} — já existe BadgeAward para (badge ${badge.id}, user ${bi.userId}) — skip`,
      );
      result.skipped++;
      continue;
    }

    await prisma.badgeAward.create({
      data: {
        badgeId: badge.id,
        userId: bi.userId,
        awardedAt: bi.issuedAt,
        verifyCode: bi.verifyCode,
        assertionId: bi.assertionId,
        evidenceUrl: bi.evidenceUrl ?? undefined,
        shareUrl: bi.shareUrl ?? undefined,
        isRevoked: bi.isRevoked,
        revokedAt: bi.revokedAt ?? undefined,
        revokeReason: bi.revokeReason ?? undefined,
        expiresAt: bi.expiresAt ?? undefined,
        issuedById: bi.issuedById,
        deletedAt: bi.deletedAt ?? undefined,
        legacyBadgeIssuanceId: bi.id,
      },
    });
    result.issuancesCreated++;
  }

  return result;
}

if (require.main === module) {
  const prisma = new PrismaClient();
  backfillDigitalBadges(prisma)
    .then(r => console.log('backfill digital-badges:', r))
    .catch(e => {
      console.error(e);
      process.exit(1);
    })
    .finally(() => void prisma.$disconnect());
}
