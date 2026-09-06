import {
  badgeToDigitalShape,
  badgeAwardToIssuanceShape,
  BadgeForLegacy,
  BadgeAwardForLegacy,
} from './badge-legacy-adapter';

const badge = {
  id: 5,
  name: 'Pioneiro',
  description: 'Primeiro a chegar',
  code: 'LEG-BDG-00001',
  imageUrl: 'https://x/p.png',
  criteria: 'Concluir a onboarding',
  skills: ['grit', 'speed'],
  level: 'ADVANCED',
  issuerName: 'INNOVA',
  isActive: true,
  createdById: 99,
  deletedAt: null,
  legacyDigitalBadgeId: 'clx-db-1',
} as unknown as BadgeForLegacy;

const award = {
  id: 1,
  userId: 10,
  badgeId: 5,
  awardedAt: new Date('2026-03-15T10:00:00Z'),
  userPointsId: null,
  verifyCode: 'BADGE-123-ABCDEF',
  assertionId: 'assert-1',
  evidenceUrl: null,
  shareUrl: 'https://innova.evos.co.ao/badge/BADGE-123-ABCDEF',
  isRevoked: false,
  revokedAt: null,
  revokeReason: null,
  expiresAt: null,
  issuedById: 99,
  deletedAt: null,
  legacyBadgeIssuanceId: 'clx-bi-1',
} as unknown as BadgeAwardForLegacy;

describe('badgeToDigitalShape', () => {
  it('id<-legacyDigitalBadgeId, code sem LEG-, courseId/programId sempre null, createdAt/updatedAt null', () => {
    const out = badgeToDigitalShape(badge);
    expect(out.id).toBe('clx-db-1');
    expect(out.code).toBe('BDG-00001');
    expect(out.level).toBe('ADVANCED');
    expect(out.skills).toEqual(['grit', 'speed']);
    expect(out.courseId).toBeNull();
    expect(out.programId).toBeNull();
    expect(out.createdAt).toBeNull();
    expect(out.updatedAt).toBeNull();
    expect(out._count).toBeUndefined();
  });

  it('legacyDigitalBadgeId ausente -> id = String(badge.id)', () => {
    const out = badgeToDigitalShape({ ...badge, legacyDigitalBadgeId: null } as BadgeForLegacy);
    expect(out.id).toBe('5');
  });

  it('_count.issuances vem de opts.issuancesCount ou de badge._count.awards', () => {
    expect(badgeToDigitalShape(badge, { issuancesCount: 7 })._count).toEqual({ issuances: 7 });
    expect(
      badgeToDigitalShape({ ...badge, _count: { awards: 3 } } as BadgeForLegacy)._count,
    ).toEqual({ issuances: 3 });
  });

  it('campos sem origem -> null, chave presente; issuerName default INNOVA', () => {
    const out = badgeToDigitalShape({
      ...badge,
      code: null,
      imageUrl: null,
      criteria: null,
      description: null,
      issuerName: null,
      createdById: null,
    } as unknown as BadgeForLegacy);
    for (const k of [
      'id',
      'code',
      'name',
      'description',
      'imageUrl',
      'criteria',
      'skills',
      'level',
      'issuerName',
      'courseId',
      'programId',
      'isActive',
      'createdById',
      'createdAt',
      'updatedAt',
      'deletedAt',
    ]) {
      expect(k in out).toBe(true);
    }
    expect(out.code).toBeNull();
    expect(out.description).toBeNull();
    expect(out.createdById).toBeNull();
    expect(out.issuerName).toBe('INNOVA');
  });
});

describe('badgeAwardToIssuanceShape', () => {
  it('id<-legacyBadgeIssuanceId, issuedAt/createdAt = awardedAt, isRevoked directo', () => {
    const out = badgeAwardToIssuanceShape(award);
    expect(out.id).toBe('clx-bi-1');
    expect(out.issuedAt).toEqual(new Date('2026-03-15T10:00:00Z'));
    expect(out.createdAt).toEqual(new Date('2026-03-15T10:00:00Z'));
    expect(out.isRevoked).toBe(false);
    expect(out.badge).toBeUndefined();
  });

  it('badgeId resolve por award.badge.legacyDigitalBadgeId, senão opts.badgeLegacyId, senão String(badgeId)', () => {
    expect(badgeAwardToIssuanceShape(award, { badgeLegacyId: 'from-opts' }).badgeId).toBe(
      'from-opts',
    );
    expect(
      badgeAwardToIssuanceShape({
        ...award,
        badge: { ...badge, legacyDigitalBadgeId: 'from-relation' },
      } as BadgeAwardForLegacy).badgeId,
    ).toBe('from-relation');
    expect(
      badgeAwardToIssuanceShape({ ...award, badge: null } as BadgeAwardForLegacy).badgeId,
    ).toBe('5');
  });

  it('award.badge presente -> inclui badge na forma DigitalShape', () => {
    const out = badgeAwardToIssuanceShape({ ...award, badge } as BadgeAwardForLegacy);
    expect(out.badge).toBeDefined();
    expect(out.badge!.id).toBe('clx-db-1');
    expect(out.badge!.code).toBe('BDG-00001');
  });

  it('legacyBadgeIssuanceId ausente -> id = String(award.id); revogado passa revokeReason', () => {
    const out = badgeAwardToIssuanceShape({
      ...award,
      legacyBadgeIssuanceId: null,
      isRevoked: true,
      revokedAt: new Date('2026-04-10'),
      revokeReason: 'engano',
    } as BadgeAwardForLegacy);
    expect(out.id).toBe('1');
    expect(out.isRevoked).toBe(true);
    expect(out.revokeReason).toBe('engano');
    for (const k of [
      'id',
      'badgeId',
      'userId',
      'assertionId',
      'verifyCode',
      'evidenceUrl',
      'shareUrl',
      'isRevoked',
      'revokedAt',
      'revokeReason',
      'issuedAt',
      'expiresAt',
      'issuedById',
      'createdAt',
      'deletedAt',
    ]) {
      expect(k in out).toBe(true);
    }
  });
});
