import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ConflictException } from '@nestjs/common';
import { UsersService } from './users.service';
import { PrismaService } from '../prisma/prisma.service';

const userMock = {
  findUnique: jest.fn(),
  findFirst: jest.fn(),
  findMany: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
  count: jest.fn(),
  delete: jest.fn(),
};

const mockPrismaBase = {
  user: userMock,
  userPoints: {
    create: jest.fn().mockResolvedValue({}),
    findUnique: jest.fn().mockResolvedValue({ points: 100 }),
    upsert: jest.fn().mockResolvedValue({}),
    update: jest.fn().mockResolvedValue({}),
  },
  notificationLog: { create: jest.fn().mockResolvedValue({}) },
  auditLog: {
    create: jest.fn().mockResolvedValue({}),
    findMany: jest.fn().mockResolvedValue([]),
    count: jest.fn().mockResolvedValue(0),
  },
  badgeAward: {
    findMany: jest.fn().mockResolvedValue([]),
    count: jest.fn().mockResolvedValue(0),
  },
  enrollment: {
    count: jest.fn().mockResolvedValue(0),
    findMany: jest.fn().mockResolvedValue([]),
  },
  userCompetency: { count: jest.fn().mockResolvedValue(0) },
};

const mockPrisma = new Proxy(mockPrismaBase, {
  get(target, prop) {
    if (prop === 'db') return mockPrisma; // read-replica client → mesmo mock
    return (
      (target as any)[prop] ?? {
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn().mockResolvedValue(null),
        count: jest.fn().mockResolvedValue(0),
        create: jest.fn().mockResolvedValue({}),
        update: jest.fn().mockResolvedValue({}),
      }
    );
  },
});

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
    Object.defineProperty(mockPrisma, 'read', {
      get() {
        return mockPrisma;
      },
      configurable: true,
    });
    const module: TestingModule = await Test.createTestingModule({
      providers: [UsersService, { provide: PrismaService, useValue: mockPrisma }],
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
      await expect(service.create({ ...createDto, employeeNumber: 'EMP001' })).rejects.toThrow(
        ConflictException,
      );
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

  // ─── activate / deactivate / suspend ──────────────────────────────────────

  describe('activate', () => {
    it('deve activar utilizador', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ ...baseUser, active: false });
      mockPrisma.user.update.mockResolvedValue({ ...baseUser, active: true });
      const result = await service.activate(1);
      expect(result).toBeDefined();
    });
  });

  describe('deactivate', () => {
    it('deve desactivar utilizador', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(baseUser);
      mockPrisma.user.update.mockResolvedValue({ ...baseUser, active: false });
      const result = await service.deactivate(1, 'Saída da empresa');
      expect(result).toBeDefined();
    });
  });

  describe('suspend', () => {
    it('deve suspender utilizador', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(baseUser);
      mockPrisma.user.update.mockResolvedValue({ ...baseUser, active: false });
      const result = await service.suspend(1, 'Disciplinar');
      expect(result).toBeDefined();
    });
  });

  // ─── changePassword ───────────────────────────────────────────────────────

  describe('changePassword', () => {
    it('deve lançar BadRequestException se password actual errada', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        ...baseUser,
        password: '$2b$10$wronghash',
      });
      await expect(
        service.changePassword(1, { currentPassword: 'wrong', newPassword: 'NewPass@123' } as any),
      ).rejects.toThrow();
    });
  });

  // ─── getTeam ──────────────────────────────────────────────────────────────

  describe('getTeam', () => {
    it('deve retornar equipa do gestor', async () => {
      mockPrisma.user.findMany.mockResolvedValue([]);
      const result = await service.getTeam(1);
      expect(result).toBeDefined();
    });
  });

  // ─── getUserStats ─────────────────────────────────────────────────────────

  describe('getUserStats', () => {
    it('deve retornar estatísticas do utilizador', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(baseUser);
      const result = await service.getUserStats(1);
      expect(result).toBeDefined();
    });

    it('deve lançar NotFoundException se não encontrado', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      await expect(service.getUserStats(99)).rejects.toThrow(NotFoundException);
    });
  });

  // ─── getDirectory ─────────────────────────────────────────────────────────

  describe('getDirectory', () => {
    it('deve retornar directório de utilizadores', async () => {
      mockPrisma.user.findMany.mockResolvedValue([baseUser]);
      const result = await service.getDirectory();
      expect(result).toBeDefined();
    });
  });

  // ─── getAdminDashboard ────────────────────────────────────────────────────

  describe('getAdminDashboard', () => {
    it('deve retornar dashboard admin', async () => {
      mockPrisma.user.count.mockResolvedValue(100);
      const result = await service.getAdminDashboard();
      expect(result).toBeDefined();
    });
  });

  // ─── getAuditLogs ─────────────────────────────────────────────────────────

  describe('getAuditLogs', () => {
    it('deve retornar logs de auditoria do utilizador', async () => {
      mockPrisma.auditLog.findMany.mockResolvedValue([]);
      mockPrisma.auditLog.count.mockResolvedValue(0);
      const result = await service.getAuditLogs(1);
      expect(result).toBeDefined();
    });
  });
});
