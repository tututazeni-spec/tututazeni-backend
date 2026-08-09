import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException, ConflictException, BadRequestException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AuthService, sessionIdleTimeoutMs } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';

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

jest.mock('bcrypt', () => ({
  compare: jest.fn(),
  hash: jest.fn().mockResolvedValue('hashed-password'),
}));

import * as bcrypt from 'bcrypt';

const mockPrisma = {
  user: {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  role: { findFirst: jest.fn() },
  auditLog: { create: jest.fn().mockResolvedValue({}) },
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
      ],
    }).compile();
    service = module.get<AuthService>(AuthService);
  });

  // ─── login ────────────────────────────────────────────────────────────────

  describe('login', () => {
    it('deve retornar user e tokens com credenciais válidas', async () => {
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      mockPrisma.user.findUnique.mockResolvedValue(baseUser);

      const result = await service.login({ email: 'test@innova.com', password: 'pass' });

      expect(result).toHaveProperty('accessToken');
      expect(result).toHaveProperty('refreshToken');
      expect(result.user).not.toHaveProperty('password');
      // A10-1: password é omitido por omissão (PrismaService) — login precisa
      // do hash para o bcrypt.compare, por isso tem de pedir a excepção.
      expect(mockPrisma.user.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ omit: { password: false } }),
      );
    });

    it('deve lançar UnauthorizedException se utilizador não existe', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      await expect(service.login({ email: 'x@x.com', password: 'pass' })).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('deve lançar UnauthorizedException se conta inactiva', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ ...baseUser, active: false });
      await expect(service.login({ email: 'test@innova.com', password: 'pass' })).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('deve lançar UnauthorizedException se password inválida', async () => {
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);
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
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
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
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);
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
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
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
