import { BadRequestException } from '@nestjs/common';
import { InstructorInvitesService, sha256 } from './instructor-invites.service';

const TOKEN = 'a'.repeat(64);
const future = () => new Date(Date.now() + 3_600_000);
const past = () => new Date(Date.now() - 3_600_000);

const externalLogin = { registerDevice: jest.fn().mockResolvedValue(undefined) };

function build(inviteOverride: Record<string, unknown> | null = {}, claimCount = 1) {
  const invite =
    inviteOverride === null
      ? null
      : {
          id: 'inv-1',
          userId: 7,
          usedAt: null,
          revokedAt: null,
          expiresAt: future(),
          user: { accessExpiresAt: future() },
          ...inviteOverride,
        };
  const tx = {
    instructorInvite: { updateMany: jest.fn().mockResolvedValue({ count: claimCount }) },
    user: { update: jest.fn().mockResolvedValue({}) },
    refreshToken: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
  };
  const prisma = {
    instructorInvite: { findUnique: jest.fn().mockResolvedValue(invite) },
    $transaction: jest.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
  };
  const audit = { log: jest.fn().mockResolvedValue(undefined) };
  const revocation = { revokeAllUserSessions: jest.fn().mockResolvedValue(undefined) };
  const svc = new InstructorInvitesService(
    prisma as never,
    {} as never,
    audit as never,
    revocation as never,
    undefined,
    externalLogin as never,
  );
  return { svc, prisma, tx, audit, revocation };
}

describe('InstructorInvitesService.acceptInvite', () => {
  it('token válido: define a palavra-passe, ativa a conta e inutiliza o convite', async () => {
    const { svc, prisma, tx, revocation } = build();
    await svc.acceptInvite(TOKEN, 'Segura@123');
    expect(prisma.instructorInvite.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tokenHash: sha256(TOKEN) } }),
    );
    expect(tx.instructorInvite.updateMany.mock.calls[0][0].where).toMatchObject({
      id: 'inv-1',
      usedAt: null,
      revokedAt: null,
    });
    const data = tx.user.update.mock.calls[0][0].data;
    expect(data.accountStatus).toBe('ACTIVE');
    expect(data.passwordChangedAt).toBeInstanceOf(Date);
    expect(data.password).toEqual(expect.any(String));
    expect(data.password).not.toBe('Segura@123');
    expect(revocation.revokeAllUserSessions).toHaveBeenCalledWith(7);
  });

  it.each([
    ['inexistente', null],
    ['já usado', { usedAt: past() }],
    ['revogado', { revokedAt: past() }],
    ['expirado', { expiresAt: past() }],
    ['conta já expirada', { user: { accessExpiresAt: past() } }],
  ])('convite %s → erro genérico, sem escrever nada', async (_n, override) => {
    const { svc, tx } = build(override as never);
    await expect(svc.acceptInvite(TOKEN, 'Segura@123')).rejects.toThrow(
      new BadRequestException('Convite inválido ou expirado'),
    );
    expect(tx.user.update).not.toHaveBeenCalled();
  });

  it('corrida: se outra aceitação reclamou o convite (count 0) → erro genérico e nada gravado', async () => {
    const { svc, tx } = build({}, 0);
    await expect(svc.acceptInvite(TOKEN, 'Segura@123')).rejects.toThrow(
      'Convite inválido ou expirado',
    );
    expect(tx.user.update).not.toHaveBeenCalled();
  });
});

describe('InstructorInvitesService.acceptInvite — dispositivo', () => {
  const DEVICE = '3f0c1b0e-6a5d-4a6e-9a47-2f1d6c1c0a11';
  beforeEach(() => externalLogin.registerDevice.mockClear());

  it('com deviceId regista o dispositivo como confiável, sem alerta', async () => {
    const { svc } = build();
    await svc.acceptInvite(TOKEN, 'Segura@123', DEVICE, { ip: '1.1.1.1', userAgent: 'UA' });
    expect(externalLogin.registerDevice).toHaveBeenCalledWith(
      7,
      DEVICE,
      { ip: '1.1.1.1', userAgent: 'UA' },
      false,
    );
  });

  it('convite inválido nunca regista dispositivo', async () => {
    const { svc } = build(null);
    await expect(svc.acceptInvite(TOKEN, 'Segura@123', DEVICE)).rejects.toThrow();
    expect(externalLogin.registerDevice).not.toHaveBeenCalled();
  });
});
