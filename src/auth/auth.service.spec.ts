import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException, ConflictException, BadRequestException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AuthService, sessionIdleTimeoutMs } from './auth.service';
import { SessionRevocationService } from './session-revocation.service';
import { ExternalLoginSecurityService } from '../instructor-invites/external-login-security.service';
import { PrismaService } from '../prisma/prisma.service';
import { SecuritySettingsService } from '../settings/security-settings.service';

// A escrita encadeada (SHA-256 + advisory lock) é testada em audit-chain; aqui só
// interessa o que cada serviço regista, por isso delega no mock de prisma.auditLog.
jest.mock('../common/helpers/audit-chain', () => ({
  writeChainedAuditLog: (
    prisma: { auditLog: { create: (a: unknown) => unknown } },
    data: unknown,
  ) => prisma.auditLog.create({ data }),
}));

describe('sessionIdleTimeoutMs', () => {
  it('devolve 30 minutos por omissão quando a env var não está definida', () => {
    expect(sessionIdleTimeoutMs(undefined)).toBe(1_800_000);
  });

  it('usa o valor da env var quando é um número válido', () => {
    expect(sessionIdleTimeoutMs('60000')).toBe(60_000);
  });

  it('cai no valor por omissão para valores inválidos ou não positivos', () => {
    expect(sessionIdleTimeoutMs('não-é-um-número')).toBe(1_800_000);
    expect(sessionIdleTimeoutMs('0')).toBe(1_800_000);
    expect(sessionIdleTimeoutMs('-5')).toBe(1_800_000);
  });
});

jest.mock('../common/security/password-hasher', () => ({
  verifyPassword: jest.fn(),
  hashPassword: jest.fn().mockResolvedValue('hashed-password'),
  burnPasswordCheck: jest.fn().mockResolvedValue(undefined),
}));

import { verifyPassword } from '../common/security/password-hasher';

const mockPrisma = {
  user: {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  role: { findFirst: jest.fn() },
  auditLog: { create: jest.fn().mockResolvedValue({}) },
  userAuditLog: { create: jest.fn().mockResolvedValue({}) },
  userPoints: { create: jest.fn().mockResolvedValue({}) },
  notificationLog: { create: jest.fn().mockResolvedValue({}) },
  refreshToken: {
    create: jest.fn().mockResolvedValue({}),
    findUnique: jest.fn(),
    update: jest.fn().mockResolvedValue({}),
    updateMany: jest.fn().mockResolvedValue({ count: 0 }),
  },
  // changePassword corre as escritas dentro de $transaction — mock executa-as
  // sequencialmente, tal como o Prisma real faz dentro da transacção.
  $transaction: jest.fn((ops: Promise<unknown>[]) => Promise.all(ops)),
};

const mockJwt = {
  signAsync: jest.fn().mockResolvedValue('mock-token'),
  verifyAsync: jest.fn(),
};

const mockRevocation = {
  revokeAccessToken: jest.fn().mockResolvedValue(undefined),
  revokeAllUserSessions: jest.fn().mockResolvedValue(undefined),
};

const baseUser = {
  id: 1,
  email: 'test@innova.com',
  fullName: 'Test User',
  password: 'hashed',
  active: true,
  role: { id: 1, name: 'COLABORADOR', rolePermissions: [] },
  unit: null,
  department: null,
  position: null,
};

describe('AuthService', () => {
  let service: AuthService;

  // generateTokens recusa-se a correr sem JWT_REFRESH_SECRET (sem fallback
  // inseguro), por isso definimos um valor de teste antes das suites.
  beforeAll(() => {
    process.env.JWT_REFRESH_SECRET = 'test-refresh-secret';
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    Object.defineProperty(mockPrisma, 'read', {
      get() {
        return mockPrisma;
      },
      configurable: true,
    });
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: JwtService, useValue: mockJwt },
        { provide: SessionRevocationService, useValue: mockRevocation },
      ],
    }).compile();
    service = module.get<AuthService>(AuthService);
  });

  describe('revogação do access token', () => {
    it('revokeAccessToken denylista o jti com o tempo de vida restante', async () => {
      const exp = Math.floor(Date.now() / 1000) + 600;
      mockJwt.verifyAsync.mockResolvedValue({ sub: 1, jti: 'j1', exp });
      await service.revokeAccessToken('tok');
      expect(mockRevocation.revokeAccessToken).toHaveBeenCalledWith('j1', expect.any(Number));
      const ttl = mockRevocation.revokeAccessToken.mock.calls[0][1] as number;
      expect(ttl).toBeGreaterThan(590);
      expect(ttl).toBeLessThanOrEqual(600);
    });

    it('token inválido/expirado ou sem jti não lança nem denylista', async () => {
      mockRevocation.revokeAccessToken.mockClear();
      mockJwt.verifyAsync.mockRejectedValueOnce(new Error('jwt expired'));
      await expect(service.revokeAccessToken('bad')).resolves.toBeUndefined();
      mockJwt.verifyAsync.mockResolvedValueOnce({ sub: 1, exp: 9999999999 });
      await expect(service.revokeAccessToken('nojti')).resolves.toBeUndefined();
      expect(mockRevocation.revokeAccessToken).not.toHaveBeenCalled();
    });

    it('o access token emitido no login leva jti único', async () => {
      mockJwt.signAsync.mockClear();
      mockPrisma.user.findUnique.mockResolvedValue({ ...baseUser, password: 'h' });
      (verifyPassword as jest.Mock).mockResolvedValue({ valid: true, needsRehash: false });
      await service.login({ email: baseUser.email, password: 'x' } as never).catch(() => undefined);
      const accessPayload = mockJwt.signAsync.mock.calls[0]?.[0] as { jti?: string } | undefined;
      expect(accessPayload?.jti).toEqual(expect.any(String));
    });
  });

  // ─── login ────────────────────────────────────────────────────────────────

  describe('login', () => {
    it('deve retornar user e tokens com credenciais válidas', async () => {
      (verifyPassword as jest.Mock).mockResolvedValue({ valid: true, needsRehash: false });
      mockPrisma.user.findUnique.mockResolvedValue(baseUser);

      const result = await service.login({ email: 'test@innova.com', password: 'pass' });

      expect(result).toHaveProperty('accessToken');
      expect(result).toHaveProperty('refreshToken');
      expect(result.user).not.toHaveProperty('password');
      // A10-1: password é omitido por omissão (PrismaService) — login precisa
      // do hash para o verifyPassword, por isso tem de pedir a excepção.
      // Definições §4: twoFactorSecret também pedido (verificação de 2FA no login),
      // via findUserWithRoleByEmail partilhado com o fluxo SSO/LDAP.
      expect(mockPrisma.user.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ omit: { password: false, twoFactorSecret: false } }),
      );
    });

    it('deve lançar UnauthorizedException se utilizador não existe', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      await expect(service.login({ email: 'x@x.com', password: 'pass' })).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('regista FAILED em AuditLog com IP/UA e sem palavra-passe (utilizador desconhecido)', async () => {
      mockPrisma.auditLog.create.mockClear();
      mockPrisma.user.findUnique.mockResolvedValue(null);
      await expect(
        service.login(
          { email: 'x@x.com', password: 'segredo' },
          { ip: '10.0.0.9', userAgent: 'jest' },
        ),
      ).rejects.toThrow(UnauthorizedException);
      await new Promise(r => setImmediate(r));
      const data = mockPrisma.auditLog.create.mock.calls[0][0].data;
      expect(data).toMatchObject({
        userId: null,
        action: 'FAILED',
        entity: 'Auth',
        status: 'FAILED',
        ip: '10.0.0.9',
      });
      expect(JSON.stringify(data)).not.toContain('segredo');
      expect(JSON.parse(data.metadata)).toEqual({ reason: 'UNKNOWN_USER', email: 'x@x.com' });
    });

    it('regista FAILED com o userId quando a palavra-passe está errada', async () => {
      mockPrisma.auditLog.create.mockClear();
      (verifyPassword as jest.Mock).mockResolvedValue({ valid: false, needsRehash: false });
      mockPrisma.user.findUnique.mockResolvedValue(baseUser);
      await expect(service.login({ email: 'test@innova.com', password: 'x' })).rejects.toThrow(
        UnauthorizedException,
      );
      await new Promise(r => setImmediate(r));
      const data = mockPrisma.auditLog.create.mock.calls[0][0].data;
      expect(data).toMatchObject({ userId: baseUser.id, action: 'FAILED' });
      expect(JSON.parse(data.metadata).reason).toBe('BAD_PASSWORD');
    });

    it('deve lançar UnauthorizedException se conta inactiva', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ ...baseUser, active: false });
      await expect(service.login({ email: 'test@innova.com', password: 'pass' })).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('conta com prazo de acesso expirado → 401 mesmo com a password certa', async () => {
      (verifyPassword as jest.Mock).mockResolvedValue({ valid: true, needsRehash: false });
      mockPrisma.user.findUnique.mockResolvedValue({
        ...baseUser,
        accessExpiresAt: new Date(Date.now() - 1000),
      });
      await expect(service.login({ email: 'test@innova.com', password: 'pass' })).rejects.toThrow(
        'Acesso expirado',
      );
    });

    it('deve lançar UnauthorizedException se password inválida', async () => {
      (verifyPassword as jest.Mock).mockResolvedValue({ valid: false, needsRehash: false });
      mockPrisma.user.findUnique.mockResolvedValue(baseUser);
      await expect(service.login({ email: 'test@innova.com', password: 'wrong' })).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('deve lançar UnauthorizedException se sem password', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ ...baseUser, password: null });
      await expect(service.login({ email: 'test@innova.com', password: 'pass' })).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  // ─── register ─────────────────────────────────────────────────────────────

  describe('register', () => {
    const registerDto = {
      fullName: 'Novo User',
      email: 'novo@innova.com',
      password: 'pass123',
      unitId: undefined,
      departmentId: undefined,
      positionId: undefined,
    };

    it('deve criar utilizador e retornar tokens', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      mockPrisma.role.findFirst.mockResolvedValue({ id: 2, name: 'COLABORADOR' });
      mockPrisma.user.create.mockResolvedValue({ ...baseUser, id: 2, password: 'hashed' });

      const result = await service.register(registerDto);

      expect(result).toHaveProperty('accessToken');
      expect(mockPrisma.userPoints.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ userId: 2, points: 0 }) }),
      );
      expect(result.user).not.toHaveProperty('password');
    });

    it('deve lançar ConflictException se email já existe', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(baseUser);
      await expect(service.register(registerDto)).rejects.toThrow(ConflictException);
    });
  });

  // ─── changePassword ───────────────────────────────────────────────────────

  describe('changePassword', () => {
    it('deve alterar password com sucesso', async () => {
      (verifyPassword as jest.Mock).mockResolvedValue({ valid: true, needsRehash: false });
      mockPrisma.user.findUnique.mockResolvedValue(baseUser);
      mockPrisma.user.update.mockResolvedValue(baseUser);

      const result = await service.changePassword(1, {
        currentPassword: 'old',
        newPassword: 'new123',
      });

      expect(result).toHaveProperty('message');
      expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ entity: 'User', action: 'CHANGE_PASSWORD' }),
        }),
      );
      // A10-1: idem — changePassword precisa do hash actual para comparar.
      expect(mockPrisma.user.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 1 }, omit: { password: false } }),
      );
    });

    it('deve lançar UnauthorizedException se utilizador não existe', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      await expect(
        service.changePassword(99, { currentPassword: 'old', newPassword: 'new' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('deve lançar BadRequestException se password actual errada', async () => {
      (verifyPassword as jest.Mock).mockResolvedValue({ valid: false, needsRehash: false });
      mockPrisma.user.findUnique.mockResolvedValue(baseUser);
      await expect(
        service.changePassword(1, { currentPassword: 'wrong', newPassword: 'new' }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ─── me ───────────────────────────────────────────────────────────────────

  describe('me', () => {
    it('deve retornar utilizador sem password', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        ...baseUser,
        profile: null,
        points: null,
        badgeAwards: [],
      });

      const result = await service.me(1);

      expect(result).not.toHaveProperty('password');
      expect(result).toHaveProperty('fullName');
    });

    it('deve lançar UnauthorizedException se não encontrado', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      await expect(service.me(99)).rejects.toThrow(UnauthorizedException);
    });
  });

  // ─── generateTokens — jti único por emissão ───────────────────────────────

  describe('generateTokens (via login)', () => {
    it('cada emissão de refresh token contém um jti único e distinto', async () => {
      (verifyPassword as jest.Mock).mockResolvedValue({ valid: true, needsRehash: false });
      mockPrisma.user.findUnique.mockResolvedValue(baseUser);

      const signCalls: Array<[unknown, unknown]> = [];
      mockJwt.signAsync.mockImplementation((payload: unknown, options: unknown) => {
        signCalls.push([payload, options]);
        return Promise.resolve('mock-token-' + signCalls.length);
      });

      // Dois logins do mesmo utilizador
      await service.login({ email: 'test@innova.com', password: 'pass' });
      await service.login({ email: 'test@innova.com', password: 'pass' });

      // Filtra apenas as chamadas de assinatura do refresh token (têm `secret`)
      const refreshCalls = signCalls.filter(
        ([, opts]) => (opts as Record<string, unknown>)?.secret !== undefined,
      );
      expect(refreshCalls.length).toBe(2);

      const jti1 = (refreshCalls[0][0] as Record<string, unknown>).jti;
      const jti2 = (refreshCalls[1][0] as Record<string, unknown>).jti;

      expect(jti1).toBeDefined();
      expect(jti2).toBeDefined();
      expect(jti1).not.toBe(jti2);
    });
  });

  // ─── rotateRefreshToken ───────────────────────────────────────────────────

  describe('rotateRefreshToken', () => {
    describe('ligação ao dispositivo (instrutor externo)', () => {
      const DEV = '3f0c1b0e-6a5d-4a6e-9a47-2f1d6c1c0a11';
      const hash = (v: string) => require('crypto').createHash('sha256').update(v).digest('hex');
      const record = (over: Record<string, unknown> = {}) => ({
        id: 3,
        userId: 1,
        revokedAt: null,
        expiresAt: new Date(Date.now() + 1e6),
        createdAt: new Date(),
        deviceIdHash: hash(DEV),
        ...over,
      });
      beforeEach(() => {
        mockPrisma.user.findUnique.mockResolvedValueOnce({ accessExpiresAt: null });
        mockPrisma.refreshToken.updateMany.mockResolvedValue({ count: 1 });
      });
      afterEach(() => {
        // não deixar estado nos mocks partilhados pelos testes seguintes
        mockPrisma.user.findUnique.mockReset();
        mockPrisma.refreshToken.updateMany.mockReset().mockResolvedValue({ count: 0 });
      });

      it('mesmo dispositivo: roda e o novo token mantém a ligação', async () => {
        mockPrisma.refreshToken.findUnique.mockResolvedValue(record());
        await service.rotateRefreshToken(1, 'e@i.com', 'tok', { deviceId: DEV });
        expect(mockPrisma.refreshToken.create.mock.calls.at(-1)![0].data.deviceIdHash).toBe(
          hash(DEV),
        );
      });

      it('outro dispositivo (cookie diferente) → 401, cadeia revogada e nenhum token novo', async () => {
        mockPrisma.refreshToken.findUnique.mockResolvedValue(record());
        mockPrisma.refreshToken.create.mockClear();
        await expect(
          service.rotateRefreshToken(1, 'e@i.com', 'tok', { deviceId: 'outro-dispositivo' }),
        ).rejects.toThrow('Refresh token inválido');
        expect(mockPrisma.refreshToken.create).not.toHaveBeenCalled();
        expect(mockPrisma.refreshToken.updateMany).toHaveBeenCalledWith(
          expect.objectContaining({ where: { userId: 1, revokedAt: null } }),
        );
      });

      it('sem cookie de dispositivo → 401', async () => {
        mockPrisma.refreshToken.findUnique.mockResolvedValue(record());
        await expect(service.rotateRefreshToken(1, 'e@i.com', 'tok')).rejects.toThrow(
          'Refresh token inválido',
        );
      });

      it('sessão sem ligação (utilizador normal): roda sem cookie e continua sem ligação', async () => {
        mockPrisma.refreshToken.findUnique.mockResolvedValue(record({ deviceIdHash: null }));
        mockPrisma.refreshToken.create.mockClear();
        await service.rotateRefreshToken(1, 'u@i.com', 'tok');
        expect(mockPrisma.refreshToken.create.mock.calls[0][0].data.deviceIdHash).toBeUndefined();
      });
    });

    it('refresh de conta com prazo expirado → 401 e não emite tokens', async () => {
      mockPrisma.refreshToken.findUnique.mockResolvedValue({
        id: 3,
        userId: 1,
        revokedAt: null,
        expiresAt: new Date(Date.now() + 1e6),
        createdAt: new Date(),
      });
      mockPrisma.user.findUnique.mockResolvedValueOnce({
        id: 1,
        accessExpiresAt: new Date(Date.now() - 1000),
      });
      await expect(service.rotateRefreshToken(1, 'test@innova.com', 'present')).rejects.toThrow(
        'Acesso expirado',
      );
    });

    it('roda: revoga o token apresentado de forma atómica e emite um novo par', async () => {
      mockPrisma.refreshToken.findUnique.mockResolvedValue({
        id: 3,
        userId: 1,
        revokedAt: null,
        expiresAt: new Date(Date.now() + 1e6),
        createdAt: new Date(),
      });
      // Simula revogação condicional bem-sucedida (count: 1)
      mockPrisma.refreshToken.updateMany.mockResolvedValueOnce({ count: 1 });

      const out = await service.rotateRefreshToken(1, 'test@innova.com', 'present');

      expect(mockPrisma.refreshToken.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 3, revokedAt: null },
          data: expect.objectContaining({ revokedAt: expect.any(Date) }),
        }),
      );
      expect(mockPrisma.refreshToken.create).toHaveBeenCalled();
      expect(out.accessToken).toBeDefined();
      expect(out.refreshToken).toBeDefined();
    });

    it('token desconhecido revoga a cadeia do utilizador (payload userId) e lança', async () => {
      mockPrisma.refreshToken.findUnique.mockResolvedValue(null);
      await expect(
        service.rotateRefreshToken(1, 'test@innova.com', 'roubado'),
      ).rejects.toBeDefined();
      expect(mockPrisma.refreshToken.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId: 1, revokedAt: null } }),
      );
    });

    it('token já revogado (reutilização explícita) revoga a cadeia e lança', async () => {
      mockPrisma.refreshToken.findUnique.mockResolvedValue({
        id: 4,
        userId: 1,
        revokedAt: new Date(),
        expiresAt: new Date(Date.now() + 1e6),
      });
      await expect(service.rotateRefreshToken(1, 'test@innova.com', 'reuse')).rejects.toBeDefined();
      expect(mockPrisma.refreshToken.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId: 1, revokedAt: null } }),
      );
    });

    it('corrida de reutilização (updateMany count 0) revoga a cadeia e lança', async () => {
      mockPrisma.refreshToken.findUnique.mockResolvedValue({
        id: 5,
        userId: 1,
        revokedAt: null,
        expiresAt: new Date(Date.now() + 1e6),
        createdAt: new Date(),
      });
      // Primeira chamada updateMany (revogação condicional do token apresentado) devolve count: 0
      mockPrisma.refreshToken.updateMany
        .mockResolvedValueOnce({ count: 0 }) // revogação condicional — outra req ganhou
        .mockResolvedValueOnce({ count: 2 }); // revogação da cadeia completa

      await expect(service.rotateRefreshToken(1, 'test@innova.com', 'race')).rejects.toThrow(
        UnauthorizedException,
      );
      // Deve ter tentado a revogação condicional do token apresentado
      expect(mockPrisma.refreshToken.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 5, revokedAt: null } }),
      );
      // Deve ter revogado a cadeia completa do userId do registo
      expect(mockPrisma.refreshToken.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId: 1, revokedAt: null } }),
      );
      // Não deve ter emitido novos tokens
      expect(mockPrisma.refreshToken.create).not.toHaveBeenCalled();
    });

    it('userId do registo difere do payload (adulteração) revoga a cadeia do dono real e lança', async () => {
      // Registo pertence ao userId 99, mas o payload afirma userId 1
      mockPrisma.refreshToken.findUnique.mockResolvedValue({
        id: 6,
        userId: 99,
        revokedAt: null,
        expiresAt: new Date(Date.now() + 1e6),
      });

      await expect(service.rotateRefreshToken(1, 'test@innova.com', 'tampered')).rejects.toThrow(
        UnauthorizedException,
      );
      // Deve revogar a cadeia do userId 99 (dono real do registo)
      expect(mockPrisma.refreshToken.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId: 99, revokedAt: null } }),
      );
      // Não deve ter emitido novos tokens
      expect(mockPrisma.refreshToken.create).not.toHaveBeenCalled();
    });

    // A10-24: sessão sem refresh há mais tempo que SESSION_IDLE_TIMEOUT_MS
    // é terminada — a cadeia é revogada mesmo com o token ainda válido.
    describe('invalidação por inactividade (A10-24)', () => {
      const originalEnv = process.env.SESSION_IDLE_TIMEOUT_MS;

      afterEach(() => {
        if (originalEnv === undefined) delete process.env.SESSION_IDLE_TIMEOUT_MS;
        else process.env.SESSION_IDLE_TIMEOUT_MS = originalEnv;
      });

      it('revoga a cadeia e lança se o token não é usado há mais tempo que o limite de inactividade', async () => {
        process.env.SESSION_IDLE_TIMEOUT_MS = '1000'; // 1s, para o teste ser rápido
        mockPrisma.refreshToken.findUnique.mockResolvedValue({
          id: 7,
          userId: 1,
          revokedAt: null,
          expiresAt: new Date(Date.now() + 1e6),
          createdAt: new Date(Date.now() - 5000), // 5s de inactividade > limite de 1s
        });

        await expect(service.rotateRefreshToken(1, 'test@innova.com', 'idle')).rejects.toThrow(
          'Sessão expirada por inactividade',
        );

        expect(mockPrisma.refreshToken.updateMany).toHaveBeenCalledWith(
          expect.objectContaining({ where: { userId: 1, revokedAt: null } }),
        );
        expect(mockPrisma.refreshToken.create).not.toHaveBeenCalled();
      });

      it('roda normalmente se ainda dentro da janela de inactividade', async () => {
        process.env.SESSION_IDLE_TIMEOUT_MS = '60000'; // 60s
        mockPrisma.refreshToken.findUnique.mockResolvedValue({
          id: 8,
          userId: 1,
          revokedAt: null,
          expiresAt: new Date(Date.now() + 1e6),
          createdAt: new Date(), // acabou de ser criado — bem dentro da janela
        });
        mockPrisma.refreshToken.updateMany.mockResolvedValueOnce({ count: 1 });

        const out = await service.rotateRefreshToken(1, 'test@innova.com', 'active');
        expect(out.accessToken).toBeDefined();
        expect(mockPrisma.refreshToken.create).toHaveBeenCalled();
      });
    });
  });
});
// forgotPassword / resetPassword foram movidos para PasswordResetService (password-reset.service.spec.ts)

describe('AuthService.login — instrutor externo (código por e-mail)', () => {
  const external = {
    ...baseUser,
    id: 9,
    email: 'ext@innova.com',
    role: { id: 5, name: 'INSTRUCTOR_EXTERNO', rolePermissions: [] },
  };
  const DEVICE = '3f0c1b0e-6a5d-4a6e-9a47-2f1d6c1c0a11';
  const ext = {
    isExternal: jest.fn((u: { role?: { name?: string } }) => u.role?.name === 'INSTRUCTOR_EXTERNO'),
    challenge: jest.fn().mockResolvedValue({ purpose: 'NEW_DEVICE' }),
    verify: jest.fn(),
    registerDevice: jest.fn().mockResolvedValue(undefined),
  };
  const securityMock = {
    getPolicy: jest.fn().mockResolvedValue(null),
    registerFailedAttempt: jest.fn().mockResolvedValue(null),
    clearFailedAttempts: jest.fn().mockResolvedValue(undefined),
  };
  let svc: AuthService;
  // O deviceId viaja no contexto do pedido (cookie httpOnly), não no corpo do login.
  const login = (dto: Record<string, unknown>, ctx: Record<string, unknown> = {}) => {
    const { deviceId, ...rest } = dto;
    return svc.login(rest as never, {
      ...ctx,
      ...(deviceId ? { deviceId: deviceId as string } : {}),
    });
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    process.env.JWT_REFRESH_SECRET = 'test-refresh-secret';
    (verifyPassword as jest.Mock).mockResolvedValue({ valid: true, needsRehash: false });
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: JwtService, useValue: mockJwt },
        { provide: SessionRevocationService, useValue: mockRevocation },
        { provide: ExternalLoginSecurityService, useValue: ext },
        { provide: SecuritySettingsService, useValue: securityMock },
      ],
    }).compile();
    svc = module.get<AuthService>(AuthService);
  });

  it('sem emailCode → 401 EMAIL_CODE_REQUIRED e pede o desafio', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(external);
    const err = await login(
      { email: external.email, password: 'pass', deviceId: DEVICE } as never,
      {
        ip: '1.1.1.1',
      },
    ).catch((e: UnauthorizedException) => e);
    expect(err).toBeInstanceOf(UnauthorizedException);
    expect((err as UnauthorizedException).getResponse()).toMatchObject({
      code: 'EMAIL_CODE_REQUIRED',
      purpose: 'NEW_DEVICE',
    });
    expect(ext.challenge).toHaveBeenCalledWith(
      expect.objectContaining({ id: 9, email: external.email }),
      DEVICE,
      expect.objectContaining({ ip: '1.1.1.1' }),
    );
  });

  it('emailCode errado → 401 genérico e não emite sessão', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(external);
    ext.verify.mockResolvedValue(false);
    await expect(
      login({
        email: external.email,
        password: 'pass',
        emailCode: '000000',
        deviceId: DEVICE,
      } as never),
    ).rejects.toThrow('Código inválido ou expirado');
    expect(mockJwt.signAsync).not.toHaveBeenCalled();
  });

  it('emailCode certo → devolve a sessão', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(external);
    ext.verify.mockResolvedValue(true);
    const out = await login({
      email: external.email,
      password: 'pass',
      emailCode: '123456',
      deviceId: DEVICE,
    } as never);
    expect(out).toHaveProperty('accessToken');
    expect(ext.verify).toHaveBeenCalledWith(
      expect.objectContaining({ id: 9 }),
      '123456',
      DEVICE,
      expect.any(Object),
    );
  });

  it('emailCode errado conta como tentativa falhada (bloqueio de conta)', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(external);
    ext.verify.mockResolvedValue(false);
    await login({
      email: external.email,
      password: 'pass',
      emailCode: '000000',
      deviceId: DEVICE,
    } as never).catch(() => undefined);
    expect(securityMock.registerFailedAttempt).toHaveBeenCalledWith(9);
  });

  it('se o código errado bloqueia a conta, diz que a conta está bloqueada', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(external);
    ext.verify.mockResolvedValue(false);
    securityMock.registerFailedAttempt.mockResolvedValueOnce(new Date(Date.now() + 15 * 60_000));
    await expect(
      login({ email: external.email, password: 'pass', emailCode: '000000' }, { deviceId: DEVICE }),
    ).rejects.toThrow('Demasiadas tentativas falhadas');
  });

  it('sem deviceId o instrutor externo é recusado e não se envia código', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(external);
    await expect(login({ email: external.email, password: 'pass' } as never)).rejects.toThrow(
      'Dispositivo não identificado',
    );
    expect(ext.challenge).not.toHaveBeenCalled();
  });

  it('com TOTP ativo e sem totpCode pede o TOTP antes de gastar o código de e-mail', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      ...external,
      twoFactorEnabled: true,
      twoFactorSecret: 'segredo',
    });
    const err = await login({
      email: external.email,
      password: 'pass',
      emailCode: '123456',
      deviceId: DEVICE,
    } as never).catch((e: UnauthorizedException) => e);
    expect((err as UnauthorizedException).getResponse()).toMatchObject({
      code: 'TWO_FACTOR_REQUIRED',
    });
    expect(ext.verify).not.toHaveBeenCalled();
    expect(ext.registerDevice).not.toHaveBeenCalled();
  });

  it('o dispositivo só é registado quando o login está concluído', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(external);
    ext.verify.mockResolvedValue(true);
    await login(
      { email: external.email, password: 'pass', emailCode: '123456', deviceId: DEVICE } as never,
      { ip: '2.2.2.2' },
    );
    expect(ext.registerDevice).toHaveBeenCalledWith(
      9,
      DEVICE,
      expect.objectContaining({ ip: '2.2.2.2' }),
    );
  });

  it('a sessão do instrutor externo fica ligada ao dispositivo; a de um utilizador normal não', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(external);
    ext.verify.mockResolvedValue(true);
    mockPrisma.refreshToken.create.mockClear();
    await login({ email: external.email, password: 'pass', emailCode: '123456', deviceId: DEVICE });
    const bound = mockPrisma.refreshToken.create.mock.calls[0][0].data.deviceIdHash;
    expect(bound).toMatch(/^[0-9a-f]{64}$/);

    mockPrisma.user.findUnique.mockResolvedValue(baseUser);
    mockPrisma.refreshToken.create.mockClear();
    await login({ email: baseUser.email, password: 'pass' }, { deviceId: DEVICE });
    expect(mockPrisma.refreshToken.create.mock.calls[0][0].data.deviceIdHash).toBeUndefined();
  });

  it('utilizador que não é instrutor externo nunca recebe desafio', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(baseUser);
    const out = await login({ email: baseUser.email, password: 'pass' } as never);
    expect(out).toHaveProperty('accessToken');
    expect(ext.challenge).not.toHaveBeenCalled();
    expect(ext.verify).not.toHaveBeenCalled();
  });
});
