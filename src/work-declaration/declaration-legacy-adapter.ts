// src/work-declaration/declaration-legacy-adapter.ts
//
// Fase E — traduz uma `Declaration` para a forma histórica que
// /declarations/documents/* devolvia (contrato do frontend, arquitetura-modular §12).
// Regras: docs/superpowers/plans/notes/fase-e-declaration-field-map.md §5.
// Chaves legadas SEMPRE presentes; `null` quando sem equivalente (nunca omitir a chave).

import type { Declaration, DocumentRequestStatus } from '@prisma/client';

/** DeclarationStatus -> DocumentRequestStatus (fallback; só quando legacyStatus == null). */
const NATIVE_TO_LEGACY: Record<string, DocumentRequestStatus> = {
  DRAFT: 'DRAFT',
  PENDING_SIGNATURE: 'PENDING',
  SIGNED: 'GENERATED',
  ISSUED: 'ISSUED',
  EXPIRED: 'EXPIRED',
  REVOKED: 'REJECTED',
};

export interface LegacyRequestShape {
  id: number | null;
  userId: number | null;
  templateId: number;
  purposeId: number | null;
  language: string;
  addressedTo: string | null;
  observations: string | null;
  extraVariables: Record<string, unknown> | null;
  status: DocumentRequestStatus;
  generatedContent: string | null;
  referenceNumber: string | null;
  verificationCode: string | null;
  generatedAt: Date | null;
  issuedAt: Date | null;
  expiresAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  template?: unknown;
  purpose?: { id: number | null; name: string | null; category: string | null } | null;
  user?: { id: number; fullName: string; email: string } | null;
  approval?: {
    approved: boolean;
    reviewerId: number | null;
    notes: string | null;
    reviewedAt: Date | null;
    reviewer: { id: number; fullName: string } | null;
  } | null;
}

type UserLite = { id: number; fullName: string; email: string } | null | undefined;

export type DeclarationForLegacy = Declaration & {
  template?: unknown;
  employee?: UserLite;
  assignedTo?: UserLite;
};

/** Remove um único prefixo `LEG-` (usado nos registos migrados por backfill). */
function stripLegPrefix(value: string | null): string | null {
  if (!value) return null;
  return value.startsWith('LEG-') ? value.slice(4) : value;
}

const ADDRESSED_PREFIX = 'Destinatário: ';

function splitRequestNotes(requestNotes: string | null): {
  observations: string | null;
  addressedTo: string | null;
} {
  if (!requestNotes) return { observations: null, addressedTo: null };
  const parts = requestNotes.split(' | ');
  const addressedPart = parts.find(p => p.startsWith(ADDRESSED_PREFIX));
  const rest = parts.filter(p => !p.startsWith(ADDRESSED_PREFIX));
  return {
    observations: rest.length ? rest.join(' | ') : null,
    addressedTo: addressedPart ? addressedPart.slice(ADDRESSED_PREFIX.length) : null,
  };
}

export function declarationToLegacyRequestShape(decl: DeclarationForLegacy): LegacyRequestShape {
  const snapshot = (decl.employeeSnapshot ?? {}) as Record<string, unknown>;
  const fromNotes = splitRequestNotes(decl.requestNotes);

  const addressedTo =
    (typeof snapshot.addressedTo === 'string' ? snapshot.addressedTo : null) ??
    fromNotes.addressedTo;
  const extraVariables =
    snapshot.extraVariables && typeof snapshot.extraVariables === 'object'
      ? (snapshot.extraVariables as Record<string, unknown>)
      : null;

  const status: DocumentRequestStatus =
    decl.legacyStatus ?? NATIVE_TO_LEGACY[decl.status] ?? 'DRAFT';

  // approval sintetizado a partir do estado (Declaration não tem modelo de aprovação legado)
  let approval: LegacyRequestShape['approval'] = null;
  const reviewer = decl.assignedTo
    ? { id: decl.assignedTo.id, fullName: decl.assignedTo.fullName }
    : null;
  if (status === 'REJECTED') {
    approval = {
      approved: false,
      reviewerId: decl.assignedToId ?? null,
      notes: decl.rejectedReason ?? null,
      reviewedAt: decl.updatedAt,
      reviewer,
    };
  } else if (
    decl.assignedToId != null &&
    (status === 'APPROVED' || status === 'GENERATED' || status === 'ISSUED')
  ) {
    approval = {
      approved: true,
      reviewerId: decl.assignedToId,
      notes: null,
      reviewedAt: decl.updatedAt,
      reviewer,
    };
  }

  return {
    id: decl.legacyRequestId ?? null,
    userId: decl.employeeId ?? null,
    templateId: decl.templateId,
    purposeId: decl.legacyPurposeId ?? null,
    language: decl.locale,
    addressedTo: addressedTo ?? null,
    observations: fromNotes.observations,
    extraVariables,
    status,
    generatedContent: decl.renderedContent ?? null,
    referenceNumber: stripLegPrefix(decl.code),
    verificationCode: stripLegPrefix(decl.verificationHash),
    generatedAt: decl.legacyGeneratedAt ?? null,
    issuedAt: decl.issuedAt ?? null,
    expiresAt: decl.expiresAt ?? null,
    createdAt: decl.createdAt,
    updatedAt: decl.updatedAt,
    template: decl.template,
    purpose:
      decl.legacyPurposeId != null || decl.purpose
        ? { id: decl.legacyPurposeId ?? null, name: decl.purpose ?? null, category: null }
        : null,
    user: decl.employee
      ? { id: decl.employee.id, fullName: decl.employee.fullName, email: decl.employee.email }
      : null,
    approval,
  };
}
