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
  },
  user: {
    findMany: jest.fn().mockResolvedValue([]),
    findUnique: jest.fn().mockResolvedValue(null),
    update: jest.fn(),
    updateMany: jest.fn().mockResolvedValue({ count: 0 }),
  },
  auditLog: { create: jest.fn().mockResolvedValue({}) },
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

    it('deve lançar BadRequestException se role tem utilizadores', async () => {
      mockPrisma.role.findUnique.mockResolvedValue({
        ...baseRole,
        _count: { users: 5 },
        isSystem: false,
      });
      await expect(service.remove(1)).rejects.toThrow(BadRequestException);
    });
  });

  // ─── setPermissions ───────────────────────────────────────────

  describe('setPermissions', () => {
    it('deve definir permissões do role', async () => {
      mockPrisma.role.findUnique.mockResolvedValue(baseRole);
      mockPrisma.role.update.mockResolvedValue(baseRole);
      const result = await service.setPermissions(1, { permissionIds: [1, 2] } as any);
      expect(result).toBeDefined();
    });
  });

  // ─── getPermissions ───────────────────────────────────────────

  describe('getPermissions', () => {
    it('deve retornar lista de permissões', async () => {
      mockPrisma.permission.findMany.mockResolvedValue([{ id: 1, name: 'READ_USERS' }]);
      const result = await service.getPermissions({});
      expect(result).toBeDefined();
    });
  });

  // ─── createPermission ─────────────────────────────────────────

  describe('createPermission', () => {
    it('deve criar permissão', async () => {
      mockPrisma.permission.create.mockResolvedValue({ id: 1, name: 'READ_USERS' });
      const result = await service.createPermission({
        name: 'READ_USERS',
        action: 'read',
        subject: 'User',
      } as any);
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
        subject: 'User',
      } as any);
      expect(result).toBeDefined();
    });
  });

  // ─── cloneRole ────────────────────────────────────────────────

  describe('cloneRole', () => {
    it('deve clonar role existente', async () => {
      mockPrisma.role.findUnique.mockResolvedValue(baseRole);
      mockPrisma.role.create.mockResolvedValue({ ...baseRole, id: 2, name: 'MANAGER_COPY' });
      const result = await service.cloneRole(1, { name: 'MANAGER_COPY' } as any);
      expect(result).toBeDefined();
    });
  });

  // ─── getAuditLog ──────────────────────────────────────────────

  describe('getAuditLog', () => {
    it('deve retornar auditoria de permissões', async () => {
      mockPrisma.auditLog.create = jest.fn();
      const module: TestingModule = await Test.createTestingModule({
        providers: [RolesPermissionsService, { provide: PrismaService, useValue: mockPrisma }],
      }).compile();
      const svc = module.get<RolesPermissionsService>(RolesPermissionsService);
      const result = await svc.getAuditLog({});
      expect(result).toBeDefined();
    });
  });

  // ─── getTemplates / applyTemplate ─────────────────────────────

  describe('getTemplates', () => {
    it('deve retornar templates de roles', async () => {
      const result = await service.getTemplates();
      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe('applyTemplate', () => {
    it('deve aplicar template a role existente', async () => {
      mockPrisma.role.findUnique.mockResolvedValue(baseRole);
      mockPrisma.role.update.mockResolvedValue(baseRole);
      const result = await service.applyTemplate(1, { templateKey: 'MANAGER' } as any);
      expect(result).toBeDefined();
    });
  });
});
