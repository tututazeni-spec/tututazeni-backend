import { ConflictException } from '@nestjs/common';
import * as crypto from 'crypto';
import { InstructorInvitesService } from './instructor-invites.service';

const sha256 = (v: string) => crypto.createHash('sha256').update(v).digest('hex');

function build() {
  const tx = {
    user: { create: jest.fn().mockResolvedValue({ id: 77 }) },
    instructorInvite: { create: jest.fn().mockResolvedValue({ id: 'inv-1' }) },
  };
  const prisma = {
    user: { findUnique: jest.fn().mockResolvedValue(null) },
    role: { findUnique: jest.fn().mockResolvedValue({ id: 9 }) },
    $transaction: jest.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
  };
  const mail = { sendInstructorInvite: jest.fn().mockResolvedValue(undefined) };
  const audit = { log: jest.fn().mockResolvedValue(undefined) };
  const svc = new InstructorInvitesService(prisma as never, mail as never, audit as never);
  return { svc, prisma, tx, mail, audit };
}

describe('InstructorInvitesService.create', () => {
  it('rejeita e-mail já existente sem criar nada', async () => {
    const { svc, prisma, tx, mail } = build();
    prisma.user.findUnique.mockResolvedValue({ id: 1 });
    await expect(
      svc.create({ email: 'a@x.com', fullName: 'Ana Externa' }, 5),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(tx.user.create).not.toHaveBeenCalled();
    expect(mail.sendInstructorInvite).not.toHaveBeenCalled();
  });

  it('usa 30 dias por omissão e cria o utilizador PENDING com role INSTRUCTOR_EXTERNO', async () => {
    const { svc, prisma, tx } = build();
    const before = Date.now();
    const out = await svc.create({ email: 'a@x.com', fullName: 'Ana Externa' }, 5);
    expect(prisma.role.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { name: 'INSTRUCTOR_EXTERNO' } }),
    );
    const data = tx.user.create.mock.calls[0][0].data;
    expect(data).toMatchObject({ accountStatus: 'PENDING', roleId: 9, fullName: 'Ana Externa' });
    const days = (data.accessExpiresAt.getTime() - before) / 86_400_000;
    expect(days).toBeGreaterThan(29.99);
    expect(days).toBeLessThan(30.01);
    expect(out.userId).toBe(77);
  });

  it('persiste só o hash do token e envia o token em claro por e-mail', async () => {
    const { svc, tx, mail } = build();
    await svc.create({ email: 'a@x.com', fullName: 'Ana Externa', accessDays: 10 }, 5);
    const stored = tx.instructorInvite.create.mock.calls[0][0].data;
    const [, , token, days] = mail.sendInstructorInvite.mock.calls[0];
    expect(token).toMatch(/^[0-9a-f]{64}$/);
    expect(stored.tokenHash).toBe(sha256(token));
    expect(JSON.stringify(stored)).not.toContain(token);
    expect(days).toBe(10);
    const ttlH = (stored.expiresAt.getTime() - Date.now()) / 3_600_000;
    expect(ttlH).toBeGreaterThan(71.9);
    expect(ttlH).toBeLessThan(72.1);
  });
});

describe('InstructorInvitesService.deactivateUser', () => {
  function buildDeact(count: number) {
    const prisma = {
      user: { updateMany: jest.fn().mockResolvedValue({ count }) },
      refreshToken: { updateMany: jest.fn().mockResolvedValue({ count: 2 }) },
    };
    const audit = { log: jest.fn().mockResolvedValue(undefined) };
    const revocation = { revokeAllUserSessions: jest.fn().mockResolvedValue(undefined) };
    const svc = new InstructorInvitesService(
      prisma as never,
      {} as never,
      audit as never,
      revocation as never,
    );
    return { svc, prisma, audit, revocation };
  }

  it('conta ativa: desativa, revoga sessões e audita uma vez', async () => {
    const { svc, prisma, audit, revocation } = buildDeact(1);
    expect(await svc.deactivateUser(7, null, 'EXPIRED')).toBe(true);
    expect(prisma.user.updateMany.mock.calls[0][0]).toMatchObject({
      where: { id: 7, active: true },
      data: { active: false, accountStatus: 'INACTIVE' },
    });
    expect(revocation.revokeAllUserSessions).toHaveBeenCalledWith(7);
    expect(audit.log).toHaveBeenCalledTimes(1);
    expect(audit.log.mock.calls[0][0]).toMatchObject({ action: 'INSTRUCTOR_ACCESS_EXPIRED' });
  });

  it('conta já desativada (segunda execução): não revoga nem audita outra vez', async () => {
    const { svc, prisma, audit, revocation } = buildDeact(0);
    expect(await svc.deactivateUser(7, null, 'EXPIRED')).toBe(false);
    expect(prisma.refreshToken.updateMany).not.toHaveBeenCalled();
    expect(revocation.revokeAllUserSessions).not.toHaveBeenCalled();
    expect(audit.log).not.toHaveBeenCalled();
  });
});

describe('InstructorInvitesService.create — falha de e-mail (I4)', () => {
  it('se o e-mail falhar, não rebenta: audita e devolve emailSent=false', async () => {
    const { svc, mail, audit } = build();
    mail.sendInstructorInvite.mockRejectedValue(new Error('SMTP down'));
    const out = await svc.create({ email: 'a@x.com', fullName: 'Ana Externa' }, 5);
    expect(out.emailSent).toBe(false);
    expect(out.inviteId).toBe('inv-1');
    expect(audit.log).toHaveBeenCalledTimes(1);
  });

  it('com e-mail enviado devolve emailSent=true', async () => {
    const { svc } = build();
    const out = await svc.create({ email: 'a@x.com', fullName: 'Ana Externa' }, 5);
    expect(out.emailSent).toBe(true);
  });
});

describe('InstructorInvitesService.extendAccess (I3)', () => {
  function buildExt(passwordChangedAt: Date | null) {
    const prisma = {
      user: {
        findFirst: jest
          .fn()
          .mockResolvedValue({ id: 7, accountStatus: 'PENDING', passwordChangedAt }),
        update: jest.fn().mockResolvedValue({}),
      },
    };
    const audit = { log: jest.fn().mockResolvedValue(undefined) };
    const svc = new InstructorInvitesService(prisma as never, {} as never, audit as never);
    return { svc, prisma };
  }

  it('conta ainda não aceite: reativa (active) mas mantém PENDING', async () => {
    const { svc, prisma } = buildExt(null);
    await svc.extendAccess(7, 10, 5);
    const data = prisma.user.update.mock.calls[0][0].data;
    expect(data.active).toBe(true);
    expect(data.accountStatus).toBe('PENDING');
    expect(data.accessExpiresAt).toBeInstanceOf(Date);
  });

  it('conta já aceite: reativa e fica ACTIVE', async () => {
    const { svc, prisma } = buildExt(new Date());
    await svc.extendAccess(7, 10, 5);
    expect(prisma.user.update.mock.calls[0][0].data).toMatchObject({
      active: true,
      accountStatus: 'ACTIVE',
    });
  });
});
