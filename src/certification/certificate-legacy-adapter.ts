// src/certification/certificate-legacy-adapter.ts
//
// Fase F2 — traduz um `Certificate` para a forma histórica de `IssuedCertificate`
// que `/certification/*` devolvia (contrato do frontend, arquitetura-modular §12).
// Mapa: docs/superpowers/plans/notes/fase-f2-cert-map.md §3/§5.
// Chaves legadas SEMPRE presentes; `null` quando sem origem.

import type { Certificate, CertificateTemplateType, CertificateType } from '@prisma/client';

/** `CertificateTemplateType` (legado) -> `CertificateType` (canónico). Lossy. */
export const CERT_TYPE_LEGACY_TO_CANONICAL: Record<CertificateTemplateType, CertificateType> = {
  COURSE: 'COURSE',
  PROGRAM: 'LEADERSHIP',
  COMPETENCY: 'DEVELOPMENT',
  ATTENDANCE: 'TRAINING',
  PARTICIPATION: 'TRAINING',
  ACHIEVEMENT: 'TRAINING',
};

/** Inverso, só usado quando `legacyType` é null (Certificate nativo). */
const CANONICAL_TO_LEGACY: Record<CertificateType, CertificateTemplateType> = {
  COURSE: 'COURSE',
  LEADERSHIP: 'PROGRAM',
  DEVELOPMENT: 'COMPETENCY',
  TRAINING: 'PARTICIPATION',
};

type UserLite = { fullName: string; email?: string | null } | null | undefined;

export type CertificateForLegacy = Certificate & {
  user?: UserLite;
};

export interface IssuedShape {
  id: string;
  code: string | null;
  verificationCode: string;
  hashCode: string | null;
  userId: number | null;
  templateId: string | null;
  courseId: string | null;
  programId: string | null;
  title: string | null;
  recipientName: string | null;
  issuerName: string;
  type: CertificateTemplateType;
  score: number | null;
  pdfUrl: string | null;
  publicUrl: string | null;
  linkedInUrl: string | null;
  isRevoked: boolean;
  revokedAt: Date | null;
  revokeReason: string | null;
  revokedById: number | null;
  issuedAt: Date;
  expiresAt: Date | null;
  downloadCount: number;
  verifyCount: number;
  metadata: string | null;
  issuedById: number | null;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  user?: { fullName: string; email?: string | null } | null;
  issuedBy?: { fullName: string } | null;
  template?: { name: string; html?: string } | null;
}

function stripLegPrefix(value: string | null): string | null {
  if (!value) return null;
  return value.startsWith('LEG-') ? value.slice(4) : value;
}

/** Estado histórico do `type` (6 valores) — `legacyType` é autoritativo. */
export function issuedType(
  cert: Pick<Certificate, 'legacyType' | 'type'>,
): CertificateTemplateType {
  return cert.legacyType ?? CANONICAL_TO_LEGACY[cert.type] ?? 'COURSE';
}

export function certificateToIssuedShape(
  cert: CertificateForLegacy,
  enrich?: {
    issuedBy?: { fullName: string } | null;
    template?: { name: string; html?: string } | null;
  },
): IssuedShape {
  return {
    id: cert.legacyIssuedCertId ?? String(cert.id),
    code: stripLegPrefix(cert.code),
    verificationCode: stripLegPrefix(cert.validationCode) ?? cert.validationCode,
    hashCode: cert.hashCode ?? null,
    userId: cert.userId ?? null,
    templateId: cert.templateId ?? null,
    courseId: cert.courseId != null ? String(cert.courseId) : null,
    programId: cert.programId != null ? String(cert.programId) : null,
    title: cert.title ?? null,
    recipientName: cert.recipientName ?? null,
    issuerName: cert.issuerName ?? 'INNOVA',
    type: issuedType(cert),
    score: cert.score ?? null,
    pdfUrl: cert.pdfUrl ?? cert.fileUrl ?? null,
    publicUrl: cert.publicUrl ?? null,
    linkedInUrl: cert.linkedInUrl ?? null,
    isRevoked: cert.revoked,
    revokedAt: cert.revokedAt ?? null,
    revokeReason: cert.revokeReason ?? null,
    revokedById: cert.revokedById ?? null,
    issuedAt: cert.issuedAt,
    expiresAt: cert.expiresAt ?? null,
    downloadCount: cert.downloadCount ?? 0,
    verifyCount: cert.verifyCount ?? 0,
    metadata: cert.metadata ?? null,
    issuedById: cert.issuedById ?? null,
    deletedAt: cert.deletedAt ?? null,
    createdAt: cert.issuedAt,
    updatedAt: cert.issuedAt,
    user: cert.user ? { fullName: cert.user.fullName, email: cert.user.email ?? null } : null,
    issuedBy: enrich?.issuedBy ?? null,
    template: enrich?.template ?? null,
  };
}
