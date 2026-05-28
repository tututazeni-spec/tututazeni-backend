import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException, ConflictException, BadRequestException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AuthService } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';

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
  role: { id: 1, name: 'COLABORADOR', permissions: [] },
  unit: null,
  department: null,
  position: null,
};

describe('AuthService', () => {
  let service: AuthService;

  beforeEach(async () => {
    jest.clearAllMocks();
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
      mockPrisma.user.findUnique.mockResolvedValue({ ...baseUser, profile: null, points: null, badgeAwards: [] });

      const result = await service.me(1);

      expect(result).not.toHaveProperty('password');
      expect(result).toHaveProperty('fullName');
    });

    it('deve lançar UnauthorizedException se não encontrado', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      await expect(service.me(99)).rejects.toThrow(UnauthorizedException);
    });
  });

  // ─── forgotPassword / resetPassword ───────────────────────────────────────

  describe('forgotPassword', () => {
    it('deve retornar mensagem genérica', () => {
      const result = service.forgotPassword({ email: 'test@innova.com' });
      expect(result).toHaveProperty('message');
    });
  });

  describe('resetPassword', () => {
    it('deve retornar mensagem de sucesso', () => {
      const result = service.resetPassword({ token: 'tok', newPassword: 'new' });
      expect(result).toHaveProperty('message');
    });
  });
});
