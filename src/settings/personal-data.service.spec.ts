import { BadRequestException } from '@nestjs/common';
import { PersonalDataService } from './personal-data.service';
import { PrivacyRetentionService } from './privacy-retention.service';

jest.mock('../common/helpers/tenant.helper', () => ({
  resolveDefaultTenantId: jest.fn().mockResolvedValue('t1'),
}));
jest.mock('../common/helpers/audit-chain', () => ({
  writeChainedAuditLog: jest.fn().mockResolvedValue(undefined),
}));

const prismaWith = (privacy: object) =>
  ({
    tenantConfig: {
      findUniqueOrThrow: jest.fn().mockResolvedValue({ privacySettingsJson: JSON.stringify(privacy) }),
    },
    user: {
      findUnique: jest.fn().mockResolvedValue({ id: 7, email: 'a@b.com' }),
      update: jest.fn().mockResolvedValue({}),
    },
    profile: { deleteMany: jest.fn() },
    refreshToken: { deleteMany: jest.fn().mockResolvedValue({ count: 2 }) },
    notificationLog: { deleteMany: jest.fn().mockResolvedValue({ count: 3 }) },
    $transaction: jest.fn().mockResolvedValue([]),
  }) as never;

const sessions = { revokeAllUserSessions: jest.fn(), invalidateUserCache: jest.fn() } as never;

describe('PersonalDataService', () => {
  it('recusa exportar e anonimizar quando desactivado nas definições', async () => {
    const svc = new PersonalDataService(
      prismaWith({ exportEnabled: false, anonymizationEnabled: false }),
      sessions,
    );
    await expect(svc.exportUserData(7)).rejects.toBeInstanceOf(BadRequestException);
    await expect(svc.anonymizeUser(7)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('anonimiza e revoga sessões', async () => {
    const prisma = prismaWith({ anonymizationEnabled: true });
    const svc = new PersonalDataService(prisma, sessions);
    await expect(svc.anonymizeUser(7, 1)).resolves.toEqual({ userId: 7, anonymized: true });
    expect((sessions as { revokeAllUserSessions: jest.Mock }).revokeAllUserSessions).toHaveBeenCalledWith(7);
  });

  it('não anonimiza duas vezes', async () => {
    const prisma = prismaWith({ anonymizationEnabled: true }) as { user: { findUnique: jest.Mock } };
    prisma.user.findUnique.mockResolvedValue({ id: 7, email: 'anonimizado-7@anonimizado.invalid' });
    await expect(new PersonalDataService(prisma as never, sessions).anonymizeUser(7)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});

describe('PrivacyRetentionService', () => {
  it('apaga notificações mais antigas que retentionDays', async () => {
    const prisma = prismaWith({ retentionDays: 100 }) as {
      notificationLog: { deleteMany: jest.Mock };
    };
    const now = new Date('2026-10-27T00:00:00Z');
    const out = await new PrivacyRetentionService(prisma as never).purge(now);
    expect(out).toEqual({ notifications: 3, refreshTokens: 2 });
    const cutoff = prisma.notificationLog.deleteMany.mock.calls[0][0].where.createdAt.lt as Date;
    expect(cutoff.toISOString()).toBe('2026-07-19T00:00:00.000Z');
  });
});
