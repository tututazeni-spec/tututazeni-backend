import { BadRequestException, NotFoundException } from '@nestjs/common';
import { SecuritySettingsService } from './security-settings.service';
import { DEFAULT_SECURITY_POLICY } from './security-policy';
import { totpAt } from './totp';
import { writeChainedAuditLog } from '../common/helpers/audit-chain';

jest.mock('../common/helpers/audit-chain', () => ({
  writeChainedAuditLog: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../common/helpers/tenant.helper', () => ({
  resolveDefaultTenantId: jest.fn().mockResolvedValue(1),
}));
// Cifra reversível e trivial: o que interessa aqui é que o segredo é cifrado ao guardar.
jest.mock('../automation/automation-connections.service', () => ({
  encryptSecret: (s: string) => `enc:${s}`,
  decryptSecret: (s: string) => s.replace(/^enc:/, ''),
}));

const SECRET = 'JBSWY3DPEHPK3PXP';
const audit = writeChainedAuditLog as jest.Mock;

describe('SecuritySettingsService', () => {
  let prisma: any;
  let service: SecuritySettingsService;
  const envIdle = process.env.SESSION_IDLE_TIMEOUT_MS;

  const policyRow = (json: object | null) => ({
    securityPolicyJson: json ? JSON.stringify(json) : null,
  });

  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.SESSION_IDLE_TIMEOUT_MS;
    prisma = {
      tenantConfig: {
        findUnique: jest.fn().mockResolvedValue(policyRow(null)),
        findUniqueOrThrow: jest.fn().mockResolvedValue(policyRow(null)),
        findFirst: jest.fn().mockResolvedValue({ platformName: 'Innova' }),
        update: jest.fn(),
      },
      user: {
        findUnique: jest.fn(),
        update: jest.fn().mockResolvedValue({}),
      },
      refreshToken: {
        findUnique: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
    };
    prisma.read = {
      user: { findMany: jest.fn().mockResolvedValue([]) },
      refreshToken: { findMany: jest.fn().mockResolvedValue([]) },
      auditLog: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
    };
    service = new SecuritySettingsService(prisma);
  });

  afterAll(() => {
    if (envIdle === undefined) delete process.env.SESSION_IDLE_TIMEOUT_MS;
    else process.env.SESSION_IDLE_TIMEOUT_MS = envIdle;
  });

  describe('getPolicy', () => {
    it('devolve os defaults quando nada está guardado', async () => {
      await expect(service.getPolicy()).resolves.toEqual(DEFAULT_SECURITY_POLICY);
    });

    it('usa cache: segunda leitura não vai à BD', async () => {
      await service.getPolicy();
      await service.getPolicy();
      expect(prisma.tenantConfig.findUnique).toHaveBeenCalledTimes(1);
    });

    it('a cache expira ao fim de 30s', async () => {
      const now = jest.spyOn(Date, 'now');
      now.mockReturnValue(1_000_000);
      await service.getPolicy();
      now.mockReturnValue(1_000_000 + 31_000);
      await service.getPolicy();
      expect(prisma.tenantConfig.findUnique).toHaveBeenCalledTimes(2);
      now.mockRestore();
    });

    it('SESSION_IDLE_TIMEOUT_MS manda quando sessionIdleMinutes nunca foi guardado', async () => {
      process.env.SESSION_IDLE_TIMEOUT_MS = String(45 * 60_000);
      expect((await service.getPolicy()).sessionIdleMinutes).toBe(45);
    });

    it('o valor guardado vence a variável de ambiente', async () => {
      process.env.SESSION_IDLE_TIMEOUT_MS = String(45 * 60_000);
      prisma.tenantConfig.findUnique.mockResolvedValue(policyRow({ sessionIdleMinutes: 10 }));
      expect((await service.getPolicy()).sessionIdleMinutes).toBe(10);
    });

    it('env inválida ou negativa é ignorada', async () => {
      process.env.SESSION_IDLE_TIMEOUT_MS = 'abc';
      expect((await service.getPolicy()).sessionIdleMinutes).toBe(
        DEFAULT_SECURITY_POLICY.sessionIdleMinutes,
      );
    });
  });

  describe('updatePolicy', () => {
    it('faz merge só com campos definidos, preserva os guardados e invalida a cache', async () => {
      prisma.tenantConfig.findUniqueOrThrow.mockResolvedValue(policyRow({ lockoutMinutes: 60 }));
      await service.getPolicy(); // aquece a cache

      await service.updatePolicy(
        { maxFailedAttempts: 3, passwordMinLength: undefined } as never,
        7,
      );

      const saved = JSON.parse(prisma.tenantConfig.update.mock.calls[0][0].data.securityPolicyJson);
      expect(saved).toEqual({ lockoutMinutes: 60, maxFailedAttempts: 3 });
      // cache invalidada → releitura na chamada de getPolicyView
      expect(prisma.tenantConfig.findUnique.mock.calls.length).toBeGreaterThan(1);
    });

    it('audita a alteração com severidade HIGH, antes e depois', async () => {
      await service.updatePolicy({ lockoutMinutes: 5 } as never, 7);
      expect(audit).toHaveBeenCalledWith(
        prisma,
        expect.objectContaining({
          userId: 7,
          action: 'SETTINGS_SECURITY_POLICY_UPDATE',
          severity: 'HIGH',
        }),
      );
      const meta = JSON.parse(audit.mock.calls[0][1].metadata);
      expect(meta.changes).toEqual({ lockoutMinutes: 5 });
      expect(meta.before.lockoutMinutes).toBe(DEFAULT_SECURITY_POLICY.lockoutMinutes);
    });

    it('falha na auditoria não impede a gravação da política', async () => {
      audit.mockRejectedValueOnce(new Error('audit down'));
      await expect(service.updatePolicy({ lockoutMinutes: 5 } as never)).resolves.toBeDefined();
      expect(prisma.tenantConfig.update).toHaveBeenCalled();
    });
  });

  describe('assertPasswordAllowed', () => {
    it('lança 400 com todas as violações', async () => {
      prisma.tenantConfig.findUnique.mockResolvedValue(
        policyRow({ passwordMinLength: 14, passwordRequireSymbol: true }),
      );
      const err = await service.assertPasswordAllowed('abc').catch(e => e);
      expect(err).toBeInstanceOf(BadRequestException);
      expect(err.getResponse().message).toHaveLength(2);
    });

    it('aceita palavra-passe conforme', async () => {
      await expect(service.assertPasswordAllowed('Abcdefgh12')).resolves.toBeUndefined();
    });
  });

  describe('registerFailedAttempt', () => {
    it('com maxFailedAttempts=0 não conta nem bloqueia', async () => {
      prisma.tenantConfig.findUnique.mockResolvedValue(policyRow({ maxFailedAttempts: 0 }));
      await expect(service.registerFailedAttempt(1)).resolves.toBeNull();
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('incrementa e não bloqueia abaixo do limite', async () => {
      prisma.user.update.mockResolvedValue({ failedLoginAttempts: 4 });
      await expect(service.registerFailedAttempt(1)).resolves.toBeNull();
      expect(prisma.user.update).toHaveBeenCalledTimes(1);
      expect(audit).not.toHaveBeenCalled();
    });

    it('ao atingir o limite bloqueia pelo tempo da política, repõe o contador e audita', async () => {
      prisma.tenantConfig.findUnique.mockResolvedValue(
        policyRow({ maxFailedAttempts: 3, lockoutMinutes: 20 }),
      );
      prisma.user.update.mockResolvedValueOnce({ failedLoginAttempts: 3 });
      const before = Date.now();

      const lockedUntil = await service.registerFailedAttempt(1);

      expect(lockedUntil!.getTime()).toBeGreaterThanOrEqual(before + 20 * 60_000);
      expect(prisma.user.update).toHaveBeenLastCalledWith({
        where: { id: 1 },
        data: { failedLoginAttempts: 0, lockedUntil },
      });
      expect(audit).toHaveBeenCalledWith(
        prisma,
        expect.objectContaining({ action: 'ACCOUNT_LOCKED', status: 'DENIED', userId: 1 }),
      );
    });

    it('o bloqueio mantém-se mesmo que a auditoria falhe', async () => {
      prisma.user.update.mockResolvedValueOnce({ failedLoginAttempts: 5 });
      audit.mockRejectedValueOnce(new Error('x'));
      await expect(service.registerFailedAttempt(1)).resolves.toBeInstanceOf(Date);
    });
  });

  describe('clearFailedAttempts / unlockUser', () => {
    it('só escreve na BD se havia tentativas falhadas', async () => {
      await service.clearFailedAttempts(1, 0);
      expect(prisma.user.update).not.toHaveBeenCalled();
      await service.clearFailedAttempts(1, 2);
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { failedLoginAttempts: 0 },
      });
    });

    it('unlockUser: 404 para utilizador inexistente', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      await expect(service.unlockUser(9)).rejects.toThrow(NotFoundException);
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('unlockUser: limpa bloqueio e contador e audita o actor', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 9 });
      await expect(service.unlockUser(9, 2)).resolves.toEqual({ userId: 9, unlocked: true });
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 9 },
        data: { lockedUntil: null, failedLoginAttempts: 0 },
      });
      expect(audit).toHaveBeenCalledWith(
        prisma,
        expect.objectContaining({ action: 'ACCOUNT_UNLOCKED', userId: 2, entityId: 9 }),
      );
    });
  });

  describe('2FA', () => {
    const now = Date.now();
    const goodCode = () => totpAt(SECRET, now);

    beforeEach(() => jest.spyOn(Date, 'now').mockReturnValue(now));
    afterEach(() => jest.restoreAllMocks());

    describe('setupTwoFactor', () => {
      it('404 se o utilizador não existe', async () => {
        prisma.user.findUnique.mockResolvedValue(null);
        await expect(service.setupTwoFactor(1)).rejects.toThrow(NotFoundException);
      });

      it('recusa se o 2FA já está activo (não troca o segredo em uso)', async () => {
        prisma.user.findUnique.mockResolvedValue({ email: 'a@b.c', twoFactorEnabled: true });
        await expect(service.setupTwoFactor(1)).rejects.toThrow('já está activo');
        expect(prisma.user.update).not.toHaveBeenCalled();
      });

      it('guarda o segredo cifrado e devolve o url com o nome da plataforma', async () => {
        prisma.user.findUnique.mockResolvedValue({ email: 'a@b.c', twoFactorEnabled: false });
        const res = await service.setupTwoFactor(1);
        const stored = prisma.user.update.mock.calls[0][0].data.twoFactorSecret;
        expect(stored).toBe(`enc:${res.secret}`);
        expect(res.otpauthUrl).toContain(`secret=${res.secret}`);
        expect(res.otpauthUrl).toContain('issuer=Innova');
      });
    });

    describe('enableTwoFactor', () => {
      it('exige setup prévio', async () => {
        prisma.user.findUnique.mockResolvedValue({
          twoFactorEnabled: false,
          twoFactorSecret: null,
        });
        await expect(service.enableTwoFactor(1, '123456')).rejects.toThrow('Inicie primeiro');
      });

      it('recusa se já activo', async () => {
        prisma.user.findUnique.mockResolvedValue({
          twoFactorEnabled: true,
          twoFactorSecret: `enc:${SECRET}`,
        });
        await expect(service.enableTwoFactor(1, goodCode())).rejects.toThrow('já está activo');
      });

      it('código errado não activa', async () => {
        prisma.user.findUnique.mockResolvedValue({
          twoFactorEnabled: false,
          twoFactorSecret: `enc:${SECRET}`,
        });
        const wrong = goodCode() === '000000' ? '000001' : '000000';
        await expect(service.enableTwoFactor(1, wrong)).rejects.toThrow('Código inválido');
        expect(prisma.user.update).not.toHaveBeenCalled();
      });

      it('código certo activa e audita', async () => {
        prisma.user.findUnique.mockResolvedValue({
          twoFactorEnabled: false,
          twoFactorSecret: `enc:${SECRET}`,
        });
        await expect(service.enableTwoFactor(1, goodCode())).resolves.toEqual({ enabled: true });
        expect(prisma.user.update).toHaveBeenCalledWith({
          where: { id: 1 },
          data: { twoFactorEnabled: true },
        });
        expect(audit).toHaveBeenCalledWith(
          prisma,
          expect.objectContaining({ action: 'TWO_FACTOR_ENABLED' }),
        );
      });
    });

    describe('disableTwoFactor', () => {
      const active = { twoFactorEnabled: true, twoFactorSecret: `enc:${SECRET}` };

      it('recusa se não está activo', async () => {
        prisma.user.findUnique.mockResolvedValue({
          twoFactorEnabled: false,
          twoFactorSecret: null,
        });
        await expect(service.disableTwoFactor(1, goodCode())).rejects.toThrow('não está activo');
      });

      it('exige código válido', async () => {
        prisma.user.findUnique.mockResolvedValue(active);
        await expect(service.disableTwoFactor(1, 'abcdef')).rejects.toThrow('Código inválido');
        expect(prisma.user.update).not.toHaveBeenCalled();
      });

      it('não deixa desactivar quando a organização exige 2FA a todos', async () => {
        prisma.user.findUnique.mockResolvedValue(active);
        prisma.tenantConfig.findUnique.mockResolvedValue(
          policyRow({ twoFactorMode: 'REQUIRED_ALL' }),
        );
        await expect(service.disableTwoFactor(1, goodCode())).rejects.toThrow(/exige 2FA/);
        expect(prisma.user.update).not.toHaveBeenCalled();
      });

      it('desactiva e apaga o segredo', async () => {
        prisma.user.findUnique.mockResolvedValue(active);
        await expect(service.disableTwoFactor(1, goodCode())).resolves.toEqual({ enabled: false });
        expect(prisma.user.update).toHaveBeenCalledWith({
          where: { id: 1 },
          data: { twoFactorEnabled: false, twoFactorSecret: null },
        });
      });
    });

    describe('resetTwoFactor', () => {
      it('404 se não existe', async () => {
        prisma.user.findUnique.mockResolvedValue(null);
        await expect(service.resetTwoFactor(1, 2)).rejects.toThrow(NotFoundException);
      });

      it('desactiva o 2FA e revoga todas as sessões activas do utilizador', async () => {
        prisma.user.findUnique.mockResolvedValue({ id: 1 });
        await service.resetTwoFactor(1, 2);
        expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
          where: { userId: 1, revokedAt: null },
          data: { revokedAt: expect.any(Date) },
        });
        expect(audit).toHaveBeenCalledWith(
          prisma,
          expect.objectContaining({ action: 'TWO_FACTOR_RESET', userId: 2, entityId: 1 }),
        );
      });
    });

    it('getTwoFactorStatus reflecte o utilizador e o modo da política', async () => {
      prisma.user.findUnique.mockResolvedValue({ twoFactorEnabled: true });
      prisma.tenantConfig.findUnique.mockResolvedValue(
        policyRow({ twoFactorMode: 'REQUIRED_PRIVILEGED' }),
      );
      await expect(service.getTwoFactorStatus(1)).resolves.toEqual({
        enabled: true,
        mode: 'REQUIRED_PRIVILEGED',
      });
    });
  });

  describe('sessões', () => {
    it('listSessions filtra revogadas, expiradas e inactivas; sem userId lista todas', async () => {
      await service.listSessions();
      const where = prisma.read.refreshToken.findMany.mock.calls[0][0].where;
      expect(where.revokedAt).toBeNull();
      expect(where.expiresAt.gt).toBeInstanceOf(Date);
      expect(where.createdAt.gt).toBeInstanceOf(Date);
      expect(where).not.toHaveProperty('userId');
    });

    it('listSessions com userId restringe a esse utilizador (incluindo 0 não é ignorado)', async () => {
      await service.listSessions(5);
      expect(prisma.read.refreshToken.findMany.mock.calls[0][0].where.userId).toBe(5);
    });

    it('revokeSession: 404 se a sessão não existe', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue(null);
      await expect(service.revokeSession(1, 2)).rejects.toThrow(NotFoundException);
    });

    it('revokeSession ownerOnly: não revela nem revoga sessões de outro utilizador', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue({ id: 1, userId: 99 });
      await expect(service.revokeSession(1, 2, true)).rejects.toThrow(NotFoundException);
      expect(prisma.refreshToken.updateMany).not.toHaveBeenCalled();
    });

    it('revokeSession por admin (ownerOnly=false) revoga sessão alheia e audita o dono', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue({ id: 1, userId: 99 });
      await expect(service.revokeSession(1, 2)).resolves.toEqual({ sessionId: 1, revoked: true });
      expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { id: 1, revokedAt: null },
        data: { revokedAt: expect.any(Date) },
      });
      expect(audit).toHaveBeenCalledWith(
        prisma,
        expect.objectContaining({ action: 'SESSION_REVOKED', userId: 2, entityId: 99 }),
      );
    });

    it('revokeAllUserSessions devolve quantas revogou', async () => {
      prisma.refreshToken.updateMany.mockResolvedValue({ count: 3 });
      await expect(service.revokeAllUserSessions(5, 2)).resolves.toEqual({ userId: 5, revoked: 3 });
    });
  });

  describe('loginHistory', () => {
    const run = (f: object) => {
      service.loginHistory(f);
      return prisma.read.auditLog.findMany.mock.calls.at(-1)[0];
    };

    it('FAILED só consulta falhas e bloqueios', () => {
      const q = run({ outcome: 'FAILED' });
      expect(q.where.OR).toEqual([
        { entity: 'Auth', action: { in: ['FAILED', 'ACCOUNT_LOCKED'] } },
      ]);
    });

    it('SUCCESS só consulta logins bem-sucedidos', () => {
      expect(run({ outcome: 'SUCCESS' }).where.OR).toEqual([{ entity: 'User', action: 'LOGIN' }]);
    });

    it('sem outcome inclui logout', () => {
      expect(run({}).where.OR).toHaveLength(3);
    });

    it('limita a página a 100 registos', () => {
      expect(run({ limit: 5000 }).take).toBe(100);
    });

    it('devolve apenas o motivo — nunca o metadata em bruto — e tolera JSON inválido', async () => {
      prisma.read.auditLog.findMany.mockResolvedValue([
        {
          id: 1,
          metadata: JSON.stringify({ reason: 'bad-password', email: 'x@y.z', password: 'p' }),
        },
        { id: 2, metadata: '{corrompido' },
        { id: 3, metadata: null },
      ]);
      prisma.read.auditLog.count.mockResolvedValue(3);

      const res = await service.loginHistory({});
      const rows = (res as any).data;

      expect(rows.map((r: any) => r.reason)).toEqual(['bad-password', undefined, undefined]);
      for (const r of rows) expect(r).not.toHaveProperty('metadata');
      expect(JSON.stringify(res)).not.toContain('"password"');
    });
  });
});
