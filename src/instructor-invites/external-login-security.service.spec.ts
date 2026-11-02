import * as crypto from 'crypto';
import { ExternalLoginSecurityService } from './external-login-security.service';

const sha256 = (v: string) => crypto.createHash('sha256').update(v).digest('hex');
const USER = { id: 7, email: 'ana@x.com', fullName: 'Ana Externa' };
const CTX = { ip: '10.0.0.1', userAgent: 'UA-1' };
const DEVICE = '3f0c1b0e-6a5d-4a6e-9a47-2f1d6c1c0a11';

function build(opts: { device?: unknown; recent?: unknown; latest?: unknown } = {}) {
  const prisma = {
    trustedDevice: {
      findFirst: jest.fn().mockResolvedValue(opts.device ?? null),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      upsert: jest.fn().mockResolvedValue({}),
    },
    loginChallenge: {
      findFirst: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      create: jest.fn().mockResolvedValue({ id: 'c1' }),
      update: jest.fn().mockResolvedValue({}),
    },
    user: { findUnique: jest.fn().mockResolvedValue(USER) },
    refreshToken: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
  };
  prisma.loginChallenge.delete = jest.fn().mockResolvedValue({});
  // Em challenge() a pesquisa é "desafio vivo criado há <60 s"; em verify() é "último desafio vivo".
  prisma.loginChallenge.findFirst.mockResolvedValue(opts.latest ?? opts.recent ?? null);
  const mail = {
    sendLoginCode: jest.fn().mockResolvedValue(undefined),
    sendNewDeviceAlert: jest.fn().mockResolvedValue(undefined),
  };
  const audit = { log: jest.fn().mockResolvedValue(undefined) };
  const revocation = { revokeAllUserSessions: jest.fn().mockResolvedValue(undefined) };
  const svc = new ExternalLoginSecurityService(
    prisma as never,
    mail as never,
    audit as never,
    revocation as never,
  );
  return { svc, prisma, mail, audit, revocation };
}

describe('ExternalLoginSecurityService.isExternal', () => {
  const { svc } = build();
  it('só para o papel INSTRUCTOR_EXTERNO', () => {
    expect(svc.isExternal({ role: { name: 'INSTRUCTOR_EXTERNO' } })).toBe(true);
    expect(svc.isExternal({ role: { name: 'ADMIN' } })).toBe(false);
    expect(svc.isExternal({ role: null })).toBe(false);
    expect(svc.isExternal({})).toBe(false);
  });
});

describe('ExternalLoginSecurityService.challenge', () => {
  it('sem dispositivo registado → NEW_DEVICE; envia código de 6 dígitos e guarda só o hash', async () => {
    const { svc, prisma, mail } = build();
    const out = await svc.challenge(USER, DEVICE, CTX);
    expect(out.purpose).toBe('NEW_DEVICE');
    const [, , code, purpose] = mail.sendLoginCode.mock.calls[0];
    expect(code).toMatch(/^\d{6}$/);
    expect(purpose).toBe('NEW_DEVICE');
    const data = prisma.loginChallenge.create.mock.calls[0][0].data;
    expect(data.codeHash).toBe(sha256(`${USER.id}:${code}`));
    expect(JSON.stringify(data)).not.toContain(`"${code}"`);
    const ttlMin = (data.expiresAt.getTime() - Date.now()) / 60_000;
    expect(ttlMin).toBeGreaterThan(9.9);
    expect(ttlMin).toBeLessThan(10.1);
    expect(prisma.loginChallenge.updateMany).toHaveBeenCalled(); // invalida anteriores
  });

  it('a janela de 60 s filtra por createdAt recente', async () => {
    const { svc, prisma } = build();
    await svc.challenge(USER, DEVICE, CTX);
    const where = prisma.loginChallenge.findFirst.mock.calls[0][0].where;
    expect(where.createdAt.gt).toBeInstanceOf(Date);
    expect(Date.now() - where.createdAt.gt.getTime()).toBeGreaterThan(59_000);
    expect(Date.now() - where.createdAt.gt.getTime()).toBeLessThan(61_000);
  });

  it('se o e-mail falhar apaga o desafio criado e propaga o erro (sem código fantasma)', async () => {
    const { svc, prisma, mail } = build();
    mail.sendLoginCode.mockRejectedValue(new Error('SMTP down'));
    await expect(svc.challenge(USER, DEVICE, CTX)).rejects.toThrow('SMTP down');
    expect(prisma.loginChallenge.delete).toHaveBeenCalledWith({ where: { id: 'c1' } });
  });

  it('dispositivo conhecido → LOGIN', async () => {
    const { svc } = build({ device: { id: 'd1' } });
    expect((await svc.challenge(USER, DEVICE, CTX)).purpose).toBe('LOGIN');
  });

  it('sem deviceId → NEW_DEVICE', async () => {
    const { svc, prisma } = build();
    expect((await svc.challenge(USER, undefined, CTX)).purpose).toBe('NEW_DEVICE');
    expect(prisma.trustedDevice.findFirst).not.toHaveBeenCalled();
  });

  it('pedido repetido em <60 s não cria desafio nem envia outro e-mail', async () => {
    const { svc, prisma, mail } = build({ recent: { id: 'c0', purpose: 'NEW_DEVICE' } });
    const out = await svc.challenge(USER, DEVICE, CTX);
    expect(out.purpose).toBe('NEW_DEVICE');
    expect(prisma.loginChallenge.create).not.toHaveBeenCalled();
    expect(mail.sendLoginCode).not.toHaveBeenCalled();
  });
});

describe('ExternalLoginSecurityService.verify', () => {
  const live = (over: Record<string, unknown> = {}) => ({
    id: 'c1',
    userId: 7,
    codeHash: sha256('7:123456'),
    purpose: 'NEW_DEVICE',
    attempts: 0,
    ...over,
  });

  it('código certo → true e desafio consumido (o dispositivo só se regista no fim do login)', async () => {
    const { svc, prisma } = build({ latest: live() });
    expect(await svc.verify(USER, '123456', DEVICE, CTX)).toBe(true);
    expect(prisma.loginChallenge.updateMany.mock.calls[0][0].where).toMatchObject({
      id: 'c1',
      consumedAt: null,
    });
    expect(prisma.trustedDevice.upsert).not.toHaveBeenCalled();
  });

  it('sem desafio vivo (expirado/consumido/inexistente) → false', async () => {
    const { svc, prisma } = build({ latest: null });
    expect(await svc.verify(USER, '123456', DEVICE, CTX)).toBe(false);
    expect(prisma.trustedDevice.upsert).not.toHaveBeenCalled();
  });

  it('código errado → false e incrementa tentativas sem consumir', async () => {
    const { svc, prisma } = build({ latest: live() });
    expect(await svc.verify(USER, '000000', DEVICE, CTX)).toBe(false);
    expect(prisma.loginChallenge.update.mock.calls[0][0].data).toMatchObject({
      attempts: 1,
      consumedAt: null,
    });
  });

  it('5.ª tentativa errada queima o desafio', async () => {
    const { svc, prisma } = build({ latest: live({ attempts: 4 }) });
    expect(await svc.verify(USER, '000000', DEVICE, CTX)).toBe(false);
    const data = prisma.loginChallenge.update.mock.calls[0][0].data;
    expect(data.attempts).toBe(5);
    expect(data.consumedAt).toBeInstanceOf(Date);
  });

  it('se outra verificação consumiu o desafio primeiro (corrida) → false', async () => {
    const { svc, prisma } = build({ latest: live() });
    prisma.loginChallenge.updateMany.mockResolvedValue({ count: 0 });
    expect(await svc.verify(USER, '123456', DEVICE, CTX)).toBe(false);
    expect(prisma.trustedDevice.upsert).not.toHaveBeenCalled();
  });
});

describe('ExternalLoginSecurityService.registerDevice', () => {
  it('revoga o dispositivo anterior, avisa por e-mail e audita', async () => {
    const { svc, prisma, mail, audit } = build();
    prisma.trustedDevice.updateMany.mockResolvedValue({ count: 1 });
    await svc.registerDevice(7, DEVICE, CTX);
    expect(prisma.trustedDevice.updateMany.mock.calls[0][0]).toMatchObject({
      where: { userId: 7, revokedAt: null, deviceIdHash: { not: sha256(DEVICE) } },
    });
    const up = prisma.trustedDevice.upsert.mock.calls[0][0];
    expect(up.where).toEqual({ userId_deviceIdHash: { userId: 7, deviceIdHash: sha256(DEVICE) } });
    expect(up.create).toMatchObject({ userAgent: 'UA-1', ip: '10.0.0.1' });
    expect(up.update.revokedAt).toBeNull();
    expect(mail.sendNewDeviceAlert).toHaveBeenCalledTimes(1);
    expect(audit.log.mock.calls[0][0]).toMatchObject({ action: 'INSTRUCTOR_DEVICE_REGISTERED' });
    // as sessões do dispositivo anterior deixam de se poder renovar
    expect(prisma.refreshToken.updateMany.mock.calls[0][0]).toMatchObject({
      where: { userId: 7, revokedAt: null },
    });
  });

  it('primeiro dispositivo (nada para revogar) não envia alerta nem toca nas sessões', async () => {
    const { svc, mail, prisma } = build();
    await svc.registerDevice(7, DEVICE, CTX);
    expect(mail.sendNewDeviceAlert).not.toHaveBeenCalled();
    expect(prisma.refreshToken.updateMany).not.toHaveBeenCalled();
  });

  it('com alert=false (registo no convite) nunca envia alerta', async () => {
    const { svc, prisma, mail } = build();
    prisma.trustedDevice.updateMany.mockResolvedValue({ count: 1 });
    await svc.registerDevice(7, DEVICE, CTX, false);
    expect(mail.sendNewDeviceAlert).not.toHaveBeenCalled();
  });

  it('sem deviceId não regista nada', async () => {
    const { svc, prisma } = build();
    await svc.registerDevice(7, undefined, CTX);
    expect(prisma.trustedDevice.upsert).not.toHaveBeenCalled();
  });
});

describe('ExternalLoginSecurityService.resetDevices', () => {
  it('revoga todos os dispositivos ativos e audita', async () => {
    const { svc, prisma, audit, revocation } = build();
    prisma.trustedDevice.updateMany.mockResolvedValue({ count: 2 });
    expect(await svc.resetDevices(7, 99)).toBe(2);
    expect(prisma.trustedDevice.updateMany.mock.calls[0][0].where).toEqual({
      userId: 7,
      revokedAt: null,
    });
    expect(audit.log.mock.calls[0][0]).toMatchObject({
      action: 'INSTRUCTOR_DEVICES_RESET',
      userId: 99,
    });
    // repor termina também as sessões abertas do instrutor
    expect(prisma.refreshToken.updateMany.mock.calls[0][0].where).toMatchObject({
      userId: 7,
      revokedAt: null,
    });
    expect(revocation.revokeAllUserSessions).toHaveBeenCalledWith(7);
  });
});
