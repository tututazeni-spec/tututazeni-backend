// prisma/backfill-one-on-ones.ts
//
// Fase G4 — migração de dados idempotente OneOnOne -> OneOnOneMeeting.
// Corre UMA vez no deploy, DEPOIS de `prisma migrate deploy` e ANTES de o
// tráfego bater em /leadership/1on1. Pode correr N vezes sem duplicar
// (skip por legacyOneOnOneId). NÃO corre em test/integration/setup.ts — é
// testado por test/integration/leadership/one-on-one-backfill.integration-spec.ts.
//
// Mapa de campos: docs/superpowers/plans/notes/fase-g4-one-on-one-map.md
//   managerId -> hostId, subordinateId -> participantId; homónimos directos;
//   sem recurring/frequency na origem -> false/null.

import { PrismaClient } from '@prisma/client';

export interface BackfillResult {
  created: number;
  skipped: number;
}

export async function backfillOneOnOnes(prisma: PrismaClient): Promise<BackfillResult> {
  const result: BackfillResult = { created: 0, skipped: 0 };

  const legacy = await prisma.oneOnOne.findMany({ orderBy: { id: 'asc' } });

  for (const o of legacy) {
    const existing = await prisma.oneOnOneMeeting.findUnique({
      where: { legacyOneOnOneId: o.id },
      select: { id: true },
    });
    if (existing) {
      result.skipped++;
      continue;
    }

    await prisma.oneOnOneMeeting.create({
      data: {
        hostId: o.managerId,
        participantId: o.subordinateId,
        scheduledAt: o.scheduledAt,
        durationMinutes: o.durationMinutes,
        status: o.status,
        agenda: o.agenda ?? undefined,
        meetingUrl: o.meetingUrl ?? undefined,
        minutes: o.minutes ?? undefined,
        actionItems: o.actionItems ?? undefined,
        nextMeetingDate: o.nextMeetingDate ?? undefined,
        completedAt: o.completedAt ?? undefined,
        createdAt: o.createdAt,
        recurring: false,
        legacyOneOnOneId: o.id,
      },
    });
    result.created++;
  }

  return result;
}

if (require.main === module) {
  const prisma = new PrismaClient();
  backfillOneOnOnes(prisma)
    .then(r => console.log('backfill one-on-ones:', r))
    .catch(e => {
      console.error(e);
      process.exit(1);
    })
    .finally(() => void prisma.$disconnect());
}
