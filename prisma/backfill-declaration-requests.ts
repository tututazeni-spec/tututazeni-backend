// prisma/backfill-declaration-requests.ts
//
// Fase E — migração de dados idempotente DeclarationRequest -> Declaration.
// Corre UMA vez no deploy, DEPOIS de `prisma migrate deploy` e ANTES de o tráfego
// bater em /declarations/documents. Pode correr N vezes sem duplicar (skip por
// legacyRequestId). NÃO corre em test/integration/setup.ts — é testado por
// test/integration/declarations/declaration-backfill.integration-spec.ts.
//
// Mapa de campos/enums: docs/superpowers/plans/notes/fase-e-declaration-field-map.md

import { PrismaClient } from '@prisma/client';
import {
  buildEmployeeSnapshotData,
  generateDeclarationTitle,
} from '../src/work-declaration/declaration-render.helpers';
import { resolveDefaultTenantId } from '../src/common/helpers/tenant.helper';

// DocumentRequestStatus -> DeclarationStatus (best-effort; legacyStatus guarda o real)
const STATUS_MAP: Record<string, string> = {
  DRAFT: 'DRAFT',
  PENDING: 'PENDING_SIGNATURE',
  APPROVED: 'PENDING_SIGNATURE',
  GENERATED: 'SIGNED',
  ISSUED: 'ISSUED',
  REJECTED: 'REVOKED',
  EXPIRED: 'EXPIRED',
};

const LOCALE_MAP: Record<string, string> = { PT: 'PT', EN: 'EN', FR: 'FR' };

export interface BackfillResult {
  created: number;
  updated: number;
  skipped: number;
}

export async function backfillDeclarationRequests(prisma: PrismaClient): Promise<BackfillResult> {
  const result: BackfillResult = { created: 0, updated: 0, skipped: 0 };

  const tenantId = await resolveDefaultTenantId(
    prisma as unknown as Parameters<typeof resolveDefaultTenantId>[0],
  );

  const requests = await prisma.declarationRequest.findMany({
    include: { template: true, purpose: true, approval: true },
    orderBy: { id: 'asc' },
  });

  for (const req of requests) {
    const existing = await prisma.declaration.findUnique({
      where: { legacyRequestId: req.id },
      select: { id: true },
    });
    if (existing) {
      result.skipped++;
      continue;
    }

    const locale = LOCALE_MAP[req.language] ?? 'PT';
    const mappedStatus = STATUS_MAP[req.status] ?? 'DRAFT';
    const type = req.template.type; // DeclarationType real (o createTemplate legado põe CUSTOM)

    const snapshot = {
      ...(await buildEmployeeSnapshotData(
        prisma as unknown as Parameters<typeof buildEmployeeSnapshotData>[0],
        req.userId,
      )),
      extraVariables: (req.extraVariables as unknown) ?? null,
      addressedTo: req.addressedTo ?? null,
    };

    const rejected = req.approval ? req.approval.approved === false : false;
    const requestNotes =
      [req.observations || null, req.addressedTo ? `Destinatário: ${req.addressedTo}` : null]
        .filter(Boolean)
        .join(' | ') || null;

    await prisma.declaration.create({
      data: {
        tenantId,
        code: `LEG-${req.referenceNumber ?? req.id}`,
        templateId: req.templateId,
        requestedById: req.userId,
        employeeId: req.userId,
        assignedToId: req.approval?.reviewerId ?? null,
        type,
        status: mappedStatus as never,
        legacyStatus: req.status as never,
        locale: locale as never,
        title: generateDeclarationTitle(type, req.template.name, locale),
        purpose: req.purpose?.name ?? null,
        legacyPurposeId: req.purposeId ?? null,
        renderedContent: req.generatedContent ?? null,
        requestNotes,
        internalNotes: STATUS_MAP[req.status]
          ? rejected
            ? (req.approval?.notes ?? null)
            : null
          : `migrado de status ${req.status}`,
        rejectedReason: rejected ? (req.approval?.notes ?? null) : null,
        verificationHash: req.verificationCode ? `LEG-${req.verificationCode}` : null,
        employeeSnapshot: snapshot as never,
        legacyRequestId: req.id,
        legacyGeneratedAt: req.generatedAt ?? null,
        issuedAt: req.issuedAt ?? null,
        expiresAt: req.expiresAt ?? null,
      },
    });
    result.created++;
  }

  return result;
}

if (require.main === module) {
  const prisma = new PrismaClient();
  backfillDeclarationRequests(prisma)
    .then(r => console.log('backfill declaration-requests:', r))
    .catch(e => {
      console.error(e);
      process.exit(1);
    })
    .finally(() => void prisma.$disconnect());
}
