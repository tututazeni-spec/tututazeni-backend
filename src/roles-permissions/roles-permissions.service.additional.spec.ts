import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { RolesPermissionsService } from './roles-permissions.service';
import { PrismaService } from '../prisma/prisma.service';

const mockPrisma: any = {
  role: {
    findMany: jest.fn().mockResolvedValue([]),
    findUnique: jest.fn().mockResolvedValue(null),
    findFirst: jest.fn().mockResolvedValue(null),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    count: jest.fn().mockResolvedValue(0),
  },
  permission: {
    findMany: jest.fn().mockResolvedValue([]),
    findUnique: jest.fn().mockResolvedValue(null),
    findFirst: jest.fn().mockResolvedValue(null),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    createMany: jest.fn().mockResolvedValue({ count: 0 }),
    upsert: jest.fn(),
    count: jest.fn().mockResolvedValue(0),
  },
  roleTemplate: {
    findFirst: jest.fn().mockResolvedValue(null),
    findMany: jest.fn().mockResolvedValue([]),
  },
  user: {
    findMany: jest.fn().mockResolvedValue([]),
    findUnique: jest.fn().mockResolvedValue(null),
    update: jest.fn(),
    updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    count: jest.fn().mockResolvedValue(0),
    groupBy: jest.fn().mockResolvedValue([]),
  },
  auditLog: { create: jest.fn().mockResolvedValue({}), count: jest.fn().mockResolvedValue(0) },
};

const baseRole = {
  id: 1,
  name: 'MANAGER',
  code: 'MANAGER',
  description: 'Manager role',
  isSystem: false,
  priority: 10,
  permissions: [{ id: 1, name: 'READ_USERS', action: 'read', subject: 'User' }],
  users: [{ id: 1, fullName: 'João Silva', email: 'joao@innova.com', avatarUrl: null }],
  _count: { users: 5 },
};

describe('RolesPermissionsService (additional)', () => {
  let service: RolesPermissionsService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [RolesPermissionsService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();
    service = module.get<RolesPermissionsService>(RolesPermissionsService);
  });

  // ─── findAll ──────────────────────────────────────────────────

  describe('findAll', () => {
    it('deve retornar roles com estatísticas', async () => {
      mockPrisma.role.findMany.mockResolvedValue([baseRole]);
      const result = await service.findAll();
      expect(result).toHaveLength(1);
      expect(result[0]).toHaveProperty('effectivePermissions');
      expect(result[0]).toHaveProperty('usersCount');
      expect(result[0].usersCount).toBe(5);
    });
  });

  // ─── findOne ──────────────────────────────────────────────────

  describe('findOne', () => {
    it('deve retornar role por id', async () => {
      mockPrisma.role.findUnique.mockResolvedValue(baseRole);
      const result = await service.findOne(1);
      expect(result).toBeDefined();
      expect(result.name).toBe('MANAGER');
    });

    it('deve lançar NotFoundException se não encontrado', async () => {
      mockPrisma.role.findUnique.mockResolvedValue(null);
      await expect(service.findOne(99)).rejects.toThrow(NotFoundException);
    });
  });

  // ─── create ───────────────────────────────────────────────────

  describe('create', () => {
    it('deve criar role', async () => {
      mockPrisma.role.findFirst.mockResolvedValue(null);
      mockPrisma.role.create.mockResolvedValue(baseRole);
      const result = await service.create({ name: 'MANAGER', code: 'MANAGER' } as any);
      expect(result).toBeDefined();
    });

    it('deve lançar ConflictException se code já existe', async () => {
      mockPrisma.role.findFirst.mockResolvedValue(baseRole);
      await expect(service.create({ name: 'MANAGER', code: 'MANAGER' } as any)).rejects.toThrow(
        ConflictException,
      );
    });
  });

  // ─── update ───────────────────────────────────────────────────

  describe('update', () => {
    it('deve actualizar role', async () => {
      mockPrisma.role.findUnique.mockResolvedValue(baseRole);
      mockPrisma.role.update.mockResolvedValue({ ...baseRole, description: 'Actualizado' });
      const result = await service.update(1, { description: 'Actualizado' } as any);
      expect(result).toBeDefined();
    });

    it('deve lançar NotFoundException se role não existe', async () => {
      mockPrisma.role.findUnique.mockResolvedValue(null);
      await expect(service.update(99, {} as any)).rejects.toThrow(NotFoundException);
    });

    it('deve lançar BadRequestException ao tentar modificar role de sistema', async () => {
      mockPrisma.role.findUnique.mockResolvedValue({ ...baseRole, isSystem: true });
      await expect(service.update(1, { name: 'Outro' } as any)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  // ─── remove ───────────────────────────────────────────────────

  describe('remove', () => {
    it('deve eliminar role sem utilizadores', async () => {
      mockPrisma.role.findUnique.mockResolvedValue({
        ...baseRole,
        _count: { users: 0 },
        isSystem: false,
      });
      mockPrisma.role.delete.mockResolvedValue(baseRole);
      await service.remove(1);
      expect(mockPrisma.role.delete).toHaveBeenCalled();
    });

    it('deve lançar ConflictException se role tem utilizadores', async () => {
      mockPrisma.role.findUnique.mockResolvedValue({
        ...baseRole,
        _count: { users: 5 },
        isSystem: false,
      });
      await expect(service.remove(1)).rejects.toThrow(ConflictException);
    });
  });

  // ─── setPermissions ───────────────────────────────────────────

  describe('setRolePermissions', () => {
    it('deve definir permissões do role', async () => {
      mockPrisma.role.findUnique.mockResolvedValue(baseRole);
      mockPrisma.role.update.mockResolvedValue(baseRole);
      const result = await service.setRolePermissions(1, [1, 2]);
      expect(result).toBeDefined();
    });
  });

  // ─── getPermissionMatrix ──────────────────────────────────────

  describe('getPermissionMatrix', () => {
    it('deve retornar matrix de permissões', async () => {
      mockPrisma.permission.findMany.mockResolvedValue([{ id: 1, name: 'READ_USERS' }]);
      const result = await service.getPermissionMatrix();
      expect(result).toBeDefined();
    });
  });

  // ─── addPermissionsToRole ─────────────────────────────────────

  describe('addPermissionsToRole', () => {
    it('deve adicionar permissões ao role', async () => {
      mockPrisma.role.findUnique.mockResolvedValue(baseRole);
      mockPrisma.role.update.mockResolvedValue(baseRole);
      const result = await service.addPermissionsToRole(1, [1, 2]);
      expect(result).toBeDefined();
    });
  });

  // ─── bulkAssignRole ───────────────────────────────────────────

  describe('bulkAssignRole', () => {
    it('deve atribuir role a múltiplos utilizadores', async () => {
      mockPrisma.role.findUnique.mockResolvedValue(baseRole);
      mockPrisma.user.updateMany.mockResolvedValue({ count: 3 });
      const result = await service.bulkAssignRole({ roleId: 1, userIds: [1, 2, 3] } as any);
      expect(result).toBeDefined();
    });
  });

  // ─── simulatePermission ───────────────────────────────────────

  describe('simulatePermission', () => {
    it('deve simular permissão para utilizador', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ id: 1, role: baseRole });
      const result = await service.simulatePermission({
        userId: 1,
        action: 'read',
        resource: 'User',
      } as any);
      expect(result).toBeDefined();
    });
  });

  // ─── cloneRole ────────────────────────────────────────────────

  describe('cloneRole', () => {
    it('deve clonar role existente', async () => {
      mockPrisma.role.findFirst.mockResolvedValue(null);
      mockPrisma.role.findUnique.mockResolvedValue(baseRole);
      mockPrisma.role.create.mockResolvedValue({ ...baseRole, id: 2, name: 'MANAGER_COPY' });
      const result = await service.cloneRole(1, 'MANAGER_COPY');
      expect(result).toBeDefined();
    });
  });

  // ─── getGovernanceStats ───────────────────────────────────────

  describe('getGovernanceStats', () => {
    it('deve retornar estatísticas de governance', async () => {
      mockPrisma.role.findMany.mockResolvedValue([baseRole]);
      mockPrisma.role.count.mockResolvedValue(1);
      const result = await service.getGovernanceStats();
      expect(result).toBeDefined();
    });
  });

  // ─── getPositionTemplates / applyPositionTemplate ─────────────

  describe('getPositionTemplates', () => {
    it('deve retornar templates de posições', async () => {
      const result = await service.getPositionTemplates();
      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe('applyPositionTemplate', () => {
    it('deve aplicar template a posição existente', async () => {
      mockPrisma.role.findUnique.mockResolvedValue(baseRole);
      mockPrisma.role.update.mockResolvedValue(baseRole);
      const result = await service.applyPositionTemplate(1);
      expect(result).toBeDefined();
    });
  });
});
