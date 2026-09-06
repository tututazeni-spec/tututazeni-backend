// src/certification/badge-legacy-adapter.ts
//
// Fase F3 — traduz `Badge`/`BadgeAward` para a forma histórica de
// `DigitalBadge`/`BadgeIssuance` que `/certification/badges*` devolvia
// (contrato do frontend, arquitetura-modular §12).
// Mapa: docs/superpowers/plans/notes/fase-f3-badge-map.md §6.
// Chaves legadas SEMPRE presentes; `null` quando sem origem.

import type { Badge, BadgeAward, BadgeLevel } from '@prisma/client';

export type BadgeForLegacy = Badge & { _count?: { awards: number } };
export type BadgeAwardForLegacy = BadgeAward & { badge?: BadgeForLegacy | null };

export interface DigitalShape {
  id: string;
  code: string | null;
  name: string;
  description: string | null;
  imageUrl: string | null;
  criteria: string | null;
  skills: string[];
  level: BadgeLevel;
  issuerName: string;
  courseId: null;
  programId: null;
  isActive: boolean;
  createdById: number | null;
  createdAt: Date | null;
  updatedAt: Date | null;
  deletedAt: Date | null;
  _count?: { issuances: number };
}

export interface IssuanceShape {
  id: string;
  badgeId: string;
  userId: number;
  assertionId: string | null;
  verifyCode: string | null;
  evidenceUrl: string | null;
  shareUrl: string | null;
  isRevoked: boolean;
  revokedAt: Date | null;
  revokeReason: string | null;
  issuedAt: Date;
  expiresAt: Date | null;
  issuedById: number | null;
  createdAt: Date;
  deletedAt: Date | null;
  badge?: DigitalShape;
}

/** `code` de badges migrados pode ter prefixo `LEG-` (colisão no backfill). Remove-o à saída. */
function stripLegPrefix(value: string | null): string | null {
  if (!value) return null;
  return value.startsWith('LEG-') ? value.slice(4) : value;
}

export function badgeToDigitalShape(
  badge: BadgeForLegacy,
  opts?: { issuancesCount?: number },
): DigitalShape {
  const shape: DigitalShape = {
    id: badge.legacyDigitalBadgeId ?? String(badge.id),
    code: stripLegPrefix(badge.code),
    name: badge.name,
    description: badge.description ?? null,
    imageUrl: badge.imageUrl ?? null,
    criteria: badge.criteria ?? null,
    skills: badge.skills ?? [],
    level: badge.level,
    issuerName: badge.issuerName ?? 'INNOVA',
    courseId: null,
    programId: null,
    isActive: badge.isActive,
    createdById: badge.createdById ?? null,
    createdAt: null,
    updatedAt: null,
    deletedAt: badge.deletedAt ?? null,
  };
  const count = opts?.issuancesCount ?? badge._count?.awards;
  if (count != null) shape._count = { issuances: count };
  return shape;
}

export function badgeAwardToIssuanceShape(
  award: BadgeAwardForLegacy,
  opts?: { badgeLegacyId?: string | null },
): IssuanceShape {
  const badgeId = award.badge?.legacyDigitalBadgeId ?? opts?.badgeLegacyId ?? String(award.badgeId);
  const shape: IssuanceShape = {
    id: award.legacyBadgeIssuanceId ?? String(award.id),
    badgeId,
    userId: award.userId,
    assertionId: award.assertionId ?? null,
    verifyCode: award.verifyCode ?? null,
    evidenceUrl: award.evidenceUrl ?? null,
    shareUrl: award.shareUrl ?? null,
    isRevoked: award.isRevoked,
    revokedAt: award.revokedAt ?? null,
    revokeReason: award.revokeReason ?? null,
    issuedAt: award.awardedAt,
    expiresAt: award.expiresAt ?? null,
    issuedById: award.issuedById ?? null,
    createdAt: award.awardedAt,
    deletedAt: award.deletedAt ?? null,
  };
  if (award.badge) shape.badge = badgeToDigitalShape(award.badge);
  return shape;
}
