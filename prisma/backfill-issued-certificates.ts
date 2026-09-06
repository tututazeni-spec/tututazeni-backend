// prisma/backfill-issued-certificates.ts
//
// Fase F2 — migração de dados idempotente IssuedCertificate -> Certificate.
// Corre UMA vez no deploy, DEPOIS de `prisma migrate deploy` e ANTES de o tráfego
// bater em /certification/*. Idempotente (skip por legacyIssuedCertId).
// NÃO corre em test/integration/setup.ts — testado por
// test/integration/certification/issued-cert-backfill.integration-spec.ts.
//
// Mapa: docs/superpowers/plans/notes/fase-f2-cert-map.md

import { PrismaClient } from '@prisma/client';
import { CERT_TYPE_LEGACY_TO_CANONICAL } from '../src/certification/certificate-legacy-adapter';

export interface BackfillResult {
  created: number;
  skipped: number;
}

/**
 * `IssuedCertificate.courseId`/`programId` são String livre; em `Certificate` são
 * `Int?` com FK. Converte e **confirma que a linha existe** — string não numérica
 * OU id inexistente → `null` + `console.warn` (não aborta).
 */
async function resolveFk(
  value: string | null,
  exists: (id: number) => Promise<boolean>,
  label: string,
  legacyId: string,
): Promise<number | null> {
  if (value == null || value === '') return null;
  const n = Number(value);
  if (!Number.isInteger(n)) {
    console.warn(
      `backfill: ${label}="${value}" não numérico (IssuedCertificate ${legacyId}) — null`,
    );
    return null;
  }
  if (!(await exists(n))) {
    console.warn(`backfill: ${label}=${n} inexistente (IssuedCertificate ${legacyId}) — null`);
    return null;
  }
  return n;
}

export async function backfillIssuedCertificates(prisma: PrismaClient): Promise<BackfillResult> {
  const result: BackfillResult = { created: 0, skipped: 0 };

  const issued = await prisma.issuedCertificate.findMany({ orderBy: { createdAt: 'asc' } });

  for (const ic of issued) {
    const existing = await prisma.certificate.findUnique({
      where: { legacyIssuedCertId: ic.id },
      select: { id: true },
    });
    if (existing) {
      result.skipped++;
      continue;
    }

    // Colisão de code/validationCode com um Certificate nativo → prefixar LEG-.
    const [codeClash, vcClash] = await Promise.all([
      ic.code
        ? prisma.certificate.findUnique({ where: { code: ic.code }, select: { id: true } })
        : null,
      prisma.certificate.findUnique({
        where: { validationCode: ic.verificationCode },
        select: { id: true },
      }),
    ]);

    const courseId = await resolveFk(
      ic.courseId,
      async id => !!(await prisma.course.findUnique({ where: { id }, select: { id: true } })),
      'courseId',
      ic.id,
    );
    const programId = await resolveFk(
      ic.programId,
      async id =>
        !!(await prisma.leadershipProgram.findUnique({ where: { id }, select: { id: true } })),
      'programId',
      ic.id,
    );

    await prisma.certificate.create({
      data: {
        type: CERT_TYPE_LEGACY_TO_CANONICAL[ic.type] ?? 'TRAINING',
        legacyType: ic.type,
        legacyIssuedCertId: ic.id,
        userId: ic.userId,
        courseId,
        programId,
        issuedAt: ic.issuedAt,
        expiresAt: ic.expiresAt ?? undefined,
        code: codeClash ? `LEG-${ic.code}` : ic.code,
        validationCode: vcClash ? `LEG-${ic.verificationCode}` : ic.verificationCode,
        hashCode: ic.hashCode,
        title: ic.title,
        recipientName: ic.recipientName,
        issuerName: ic.issuerName,
        score: ic.score ?? undefined,
        pdfUrl: ic.pdfUrl ?? undefined,
        publicUrl: ic.publicUrl ?? undefined,
        linkedInUrl: ic.linkedInUrl ?? undefined,
        revoked: ic.isRevoked,
        revokedAt: ic.revokedAt ?? undefined,
        revokeReason: ic.revokeReason ?? undefined,
        revokedById: ic.revokedById ?? undefined,
        downloadCount: ic.downloadCount,
        verifyCount: ic.verifyCount,
        issuedById: ic.issuedById,
        templateId: ic.templateId ?? undefined,
        metadata: ic.metadata ?? undefined,
        deletedAt: ic.deletedAt ?? undefined,
      },
    });
    result.created++;
  }

  return result;
}

if (require.main === module) {
  const prisma = new PrismaClient();
  backfillIssuedCertificates(prisma)
    .then(r => console.log('backfill issued-certificates:', r))
    .catch(e => {
      console.error(e);
      process.exit(1);
    })
    .finally(() => void prisma.$disconnect());
}
