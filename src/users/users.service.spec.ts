import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ConflictException } from '@nestjs/common';
import { UsersService } from './users.service';
import { PrismaService } from '../prisma/prisma.service';

const mockPrisma = {
  user: {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    count: jest.fn(),
    delete: jest.fn(),
  },
  userPoints: { create: jest.fn().mockResolvedValue({}) },
  notificationLog: { create: jest.fn().mockResolvedValue({}) },
  auditLog: { create: jest.fn().mockResolvedValue({}) },
  badgeAward: { findMany: jest.fn().mockResolvedValue([]) },
};

const baseUser = {
  id: 1,
  fullName: 'Placido Costa',
  email: 'placido@innova.com',
  password: 'hashed',
  active: true,
  employeeNumber: 'EMP001',
  role: { id: 1, name: 'COLABORADOR' },
  department: { id: 1, name: 'TI', code: 'TI' },
  position: { id: 1, name: 'Dev', level: 1 },
  unit: null,
  manager: null,
  profile: null,
  points: { points: 100 },
  subordinates: [],
  enrollments: [],
  certificates: [],
  badgeAwards: [],
  userCompetencies: [],
  _count: { enrollments: 0, certificates: 0, badgeAwards: 0, subordinates: 0, userCompetencies: 0 },
};

describe('UsersService', () => {
  let service: UsersService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();
    service = module.get<UsersService>(UsersService);
  });

  // ─── findAll ──────────────────────────────────────────────────────────────

  describe('findAll', () => {
    it('deve retornar lista paginada de utilizadores', async () => {
      mockPrisma.user.findMany.mockResolvedValue([baseUser]);
      mockPrisma.user.count.mockResolvedValue(1);

      const result = await service.findAll({ page: 1, limit: 20 });

      expect(result.data).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.totalPages).toBe(1);
    });

    it('deve filtrar por search', async () => {
      mockPrisma.user.findMany.mockResolvedValue([]);
      mockPrisma.user.count.mockResolvedValue(0);

      const result = await service.findAll({ search: 'inexistente' });

      expect(result.data).toHaveLength(0);
      expect(mockPrisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ OR: expect.any(Array) }) }),
      );
    });
  });

  // ─── findOne ──────────────────────────────────────────────────────────────

  describe('findOne', () => {
    it('deve retornar utilizador por id', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(baseUser);

      const result = await service.findOne(1);

      expect(result.fullName).toBe('Placido Costa');
    });

    it('deve lançar NotFoundException se não encontrado', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      await expect(service.findOne(99)).rejects.toThrow(NotFoundException);
    });
  });

  // ─── create ───────────────────────────────────────────────────────────────

  describe('create', () => {
    const createDto = {
      fullName: 'Novo User',
      email: 'novo@innova.com',
      password: 'pass',
    };

    it('deve criar utilizador com userPoints e notificationLog', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      mockPrisma.user.findFirst.mockResolvedValue(null);
      mockPrisma.user.create.mockResolvedValue({ ...baseUser, id: 2 });
      mockPrisma.auditLog.create.mockResolvedValue({});

      const result = await service.create(createDto);

      expect(result).not.toHaveProperty('password');
      expect(mockPrisma.userPoints.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ userId: 2, points: 0 }) }),
      );
    });

    it('deve lançar ConflictException se email duplicado', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(baseUser);
      await expect(service.create(createDto)).rejects.toThrow(ConflictException);
    });

    it('deve lançar ConflictException se employeeNumber duplicado', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      mockPrisma.user.findFirst.mockResolvedValue(baseUser);
      await expect(
        service.create({ ...createDto, employeeNumber: 'EMP001' }),
      ).rejects.toThrow(ConflictException);
    });
  });

  // ─── update ───────────────────────────────────────────────────────────────

  describe('update', () => {
    it('deve actualizar utilizador com sucesso', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(baseUser);
      mockPrisma.user.findFirst.mockResolvedValue(null);
      mockPrisma.user.update.mockResolvedValue({ ...baseUser, fullName: 'Updated' });
      mockPrisma.auditLog.create.mockResolvedValue({});

      const result = await service.update(1, { fullName: 'Updated' }, 1);

      expect((result as any).fullName).toBe('Updated');
    });

    it('deve lançar NotFoundException se utilizador não existe', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      await expect(service.update(99, { fullName: 'X' })).rejects.toThrow(NotFoundException);
    });

    it('deve lançar ConflictException se email já em uso', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(baseUser);
      mockPrisma.user.findFirst.mockResolvedValue({ ...baseUser, id: 2 });
      await expect(service.update(1, { email: 'outro@innova.com' })).rejects.toThrow(
        ConflictException,
      );
    });
  });
});
