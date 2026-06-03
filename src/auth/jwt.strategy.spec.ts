import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import { JwtStrategy } from './jwt.strategy';
import { PrismaService } from '../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';

const mockPrisma = {
  user: {
    findUnique: jest.fn(),
  },
};

const mockConfig = {
  get: jest.fn().mockReturnValue('test-secret'),
};

const baseUser = {
  id: 1,
  email: 'user@innova.com',
  fullName: 'User Test',
  active: true,
  role: { id: 1, name: 'COLABORADOR', permissions: [] },
  unit: null,
  department: { id: 1, name: 'TI', code: 'TI' },
  position: { id: 1, name: 'Dev', level: 1 },
};

describe('JwtStrategy', () => {
  let strategy: JwtStrategy;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        JwtStrategy,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: ConfigService, useValue: mockConfig },
      ],
    }).compile();
    strategy = module.get<JwtStrategy>(JwtStrategy);
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

      await expect(
        strategy.validate({ sub: 99, email: 'notfound@innova.com' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('deve lançar UnauthorizedException se utilizador inactivo', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ ...baseUser, active: false });

      await expect(
        strategy.validate({ sub: 1, email: 'user@innova.com' }),
      ).rejects.toThrow(UnauthorizedException);
    });
  });
});
