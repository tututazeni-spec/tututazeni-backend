import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import { JwtStrategy, buildJwtExtractors, isBearerAllowed } from './jwt.strategy';
import { PrismaService } from '../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import { SessionRevocationService } from './session-revocation.service';
import { KeyObject } from 'crypto';
import * as jwt from 'jsonwebtoken';

// Corre a estratégia como o passport o faz (cópia por pedido) e devolve o desfecho.
function authenticate(strat: unknown, token: string) {
  return new Promise<{ kind: 'success' | 'fail' | 'error'; detail?: unknown }>(resolve => {
    const s = Object.create(strat as object);
    s.success = (user: unknown) => resolve({ kind: 'success', detail: user });
    s.fail = (info: unknown) => resolve({ kind: 'fail', detail: info });
    s.error = (err: unknown) => resolve({ kind: 'error', detail: err });
    s.authenticate({ headers: { authorization: `Bearer ${token}` }, cookies: {} });
  });
}

// C4: buildJwtExtractors respeita a flag AUTH_ALLOW_BEARER
describe('buildJwtExtractors', () => {
  it('inclui o fallback Bearer quando AUTH_ALLOW_BEARER != false', () => {
    expect(buildJwtExtractors(true)).toHaveLength(2);
  });
  it('só o cookie quando AUTH_ALLOW_BEARER=false', () => {
    expect(buildJwtExtractors(false)).toHaveLength(1);
  });
});

describe('isBearerAllowed', () => {
  it('produção: Bearer desligado por omissão (só cookie httpOnly)', () => {
    expect(isBearerAllowed({ NODE_ENV: 'production' })).toBe(false);
  });
  it('produção: AUTH_ALLOW_BEARER=true reactiva explicitamente', () => {
    expect(isBearerAllowed({ NODE_ENV: 'production', AUTH_ALLOW_BEARER: 'true' })).toBe(true);
  });
  it('fora de produção: ligado por omissão (Swagger/testes); =false desliga', () => {
    expect(isBearerAllowed({ NODE_ENV: 'development' })).toBe(true);
    expect(isBearerAllowed({ NODE_ENV: 'test' })).toBe(true);
    expect(isBearerAllowed({ NODE_ENV: 'development', AUTH_ALLOW_BEARER: 'false' })).toBe(false);
  });
});

const mockPrisma = {
  user: {
    findUnique: jest.fn(),
  },
};

const noMarks = { jtiRevoked: false, revokedBefore: null, staleSince: null };
const mockRevocation = {
  getMarks: jest.fn(),
};

const mockConfig = {
  get: jest.fn().mockReturnValue('test-secret'),
};

const baseUser = {
  id: 1,
  email: 'user@innova.com',
  fullName: 'User Test',
  active: true,
  role: { id: 1, name: 'COLABORADOR', rolePermissions: [] },
  unit: null,
  department: { id: 1, name: 'TI', code: 'TI' },
  position: { id: 1, name: 'Dev', level: 1 },
};

describe('JwtStrategy', () => {
  let strategy: JwtStrategy;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockRevocation.getMarks.mockResolvedValue(noMarks);
    Object.defineProperty(mockPrisma, 'read', {
      get() {
        return mockPrisma;
      },
      configurable: true,
    });
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        JwtStrategy,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: ConfigService, useValue: mockConfig },
        { provide: SessionRevocationService, useValue: mockRevocation },
      ],
    }).compile();
    strategy = module.get<JwtStrategy>(JwtStrategy);
  });

  describe('revogação de sessão (Redis)', () => {
    it('access token com jti revogado (logout) → 401', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(baseUser);
      mockRevocation.getMarks.mockResolvedValue({ ...noMarks, jtiRevoked: true });
      await expect(
        strategy.validate({ sub: 1, email: 'user@innova.com', jti: 'j1', iat: 100 }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('consulta as marcas de revogação numa única chamada por pedido, com jti e sub', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(baseUser);
      await strategy.validate({ sub: 1, email: 'user@innova.com', jti: 'j1', iat: 100 });
      expect(mockRevocation.getMarks).toHaveBeenCalledTimes(1);
      expect(mockRevocation.getMarks).toHaveBeenCalledWith('j1', 1);
    });

    it('token emitido antes de revokedBefore → 401; emitido depois → ok', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(baseUser);
      mockRevocation.getMarks.mockResolvedValue({ ...noMarks, revokedBefore: 1000 });
      await expect(
        strategy.validate({ sub: 1, email: 'user@innova.com', jti: 'j', iat: 999 }),
      ).rejects.toThrow(UnauthorizedException);
      await expect(
        strategy.validate({ sub: 1, email: 'user@innova.com', jti: 'j', iat: 1000 }),
      ).resolves.toBeDefined();
    });

    it('utilizador marcado como stale recarrega da BD (mudança de papel/desativação imediata)', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(baseUser);
      await strategy.validate({ sub: 1, email: 'user@innova.com' });
      await strategy.validate({ sub: 1, email: 'user@innova.com' });
      expect(mockPrisma.user.findUnique).toHaveBeenCalledTimes(1); // cache hit

      mockRevocation.getMarks.mockResolvedValue({ ...noMarks, staleSince: Date.now() + 1000 });
      mockPrisma.user.findUnique.mockResolvedValue({ ...baseUser, active: false });
      await expect(strategy.validate({ sub: 1, email: 'user@innova.com' })).rejects.toThrow(
        UnauthorizedException,
      );
      expect(mockPrisma.user.findUnique).toHaveBeenCalledTimes(2);
    });
  });

  describe('chave de verificação do JWT', () => {
    it('entrega ao jsonwebtoken um KeyObject pré-criado, não o segredo em texto', () => {
      // Com o segredo em string, o jsonwebtoken 9 tenta createPublicKey() em CADA pedido,
      // falha e só depois cria a chave (≈750 µs vs ≈16 µs). Medido no perfil de carga.
      let key: unknown;
      (
        strategy as unknown as {
          _secretOrKeyProvider: (
            r: unknown,
            t: unknown,
            d: (e: unknown, k: unknown) => void,
          ) => void;
        }
      )._secretOrKeyProvider(null, null, (_e, k) => (key = k));
      expect(key).toBeInstanceOf(KeyObject);
      expect((key as KeyObject).type).toBe('secret');
    });

    it('aceita um token válido assinado com JWT_SECRET', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(baseUser);
      const token = jwt.sign({ sub: 1, email: 'user@innova.com' }, 'test-secret', {
        expiresIn: '15m',
      });
      const out = await authenticate(strategy, token);
      expect(out.kind).toBe('success');
    });

    it('rejeita um token assinado com outro segredo', async () => {
      const token = jwt.sign({ sub: 1, email: 'user@innova.com' }, 'outro-segredo', {
        expiresIn: '15m',
      });
      const out = await authenticate(strategy, token);
      expect(out.kind).toBe('fail');
    });

    it('rejeita um token expirado', async () => {
      const token = jwt.sign({ sub: 1, email: 'user@innova.com' }, 'test-secret', {
        expiresIn: -10,
      });
      const out = await authenticate(strategy, token);
      expect(out.kind).toBe('fail');
    });
  });

  describe('validate', () => {
    it('deve retornar utilizador activo com payload válido', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(baseUser);

      const result = await strategy.validate({ sub: 1, email: 'user@innova.com' });

      expect(result).toBeDefined();
      expect(result.id).toBe(1);
      expect(result.active).toBe(true);
    });

    it('deve lançar UnauthorizedException se utilizador não encontrado', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      await expect(strategy.validate({ sub: 99, email: 'notfound@innova.com' })).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('deve lançar UnauthorizedException se utilizador inactivo', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ ...baseUser, active: false });

      await expect(strategy.validate({ sub: 1, email: 'user@innova.com' })).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('deve usar a cache na segunda validação dentro do TTL (sem nova query)', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(baseUser);

      const first = await strategy.validate({ sub: 1, email: 'user@innova.com' });
      const second = await strategy.validate({ sub: 1, email: 'user@innova.com' });

      expect(first).toBe(second);
      expect(mockPrisma.user.findUnique).toHaveBeenCalledTimes(1);
    });

    it('não deve cachear validações falhadas', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      await expect(strategy.validate({ sub: 1, email: 'user@innova.com' })).rejects.toThrow(
        UnauthorizedException,
      );

      mockPrisma.user.findUnique.mockResolvedValue(baseUser);
      const result = await strategy.validate({ sub: 1, email: 'user@innova.com' });

      expect(result).toBeDefined();
      expect(mockPrisma.user.findUnique).toHaveBeenCalledTimes(2);
    });

    it('recusa access token emitido antes de passwordChangedAt', async () => {
      // arrange: mockar prisma.user.findUnique para devolver user activo com
      // passwordChangedAt no futuro face ao iat do token.
      const iatSeconds = Math.floor(Date.now() / 1000) - 100;
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 1,
        active: true,
        passwordChangedAt: new Date(Date.now()), // depois do iat
        role: { rolePermissions: [] },
        unit: null,
        department: null,
        position: null,
      });
      await expect(
        strategy.validate({ sub: 1, email: 'u@i.com', iat: iatSeconds } as any),
      ).rejects.toBeDefined();
    });

    it('aceita access token emitido depois de passwordChangedAt', async () => {
      const iatSeconds = Math.floor(Date.now() / 1000);
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 1,
        active: true,
        passwordChangedAt: new Date(Date.now() - 60000),
        role: { rolePermissions: [] },
        unit: null,
        department: null,
        position: null,
      });
      const out = await strategy.validate({ sub: 1, email: 'u@i.com', iat: iatSeconds } as any);
      expect(out).toBeDefined();
    });
  });
});
