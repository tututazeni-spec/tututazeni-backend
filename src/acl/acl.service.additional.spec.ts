import { Test, TestingModule } from '@nestjs/testing';
import { AclService } from './acl.service';
import { PrismaService } from '../prisma/prisma.service';

const mockPrisma = {
  permission: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  role: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  user: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
    count: jest.fn(),
    groupBy: jest.fn(),
  },
  auditLog: {
    create: jest.fn().mockResolvedValue({}),
    findMany: jest.fn().mockResolvedValue([]),
    count: jest.fn().mockResolvedValue(0),
  },
  notificationLog: { create: jest.fn().mockResolvedValue({}) },
};

const basePerm = { id: 1, name: 'dashboard:view', action: 'VIEW', subject: 'DASHBOARD' };
const baseRole = {
  id: 1,
  name: 'COLABORADOR',
  code: 'COLABORADOR',
  permissions: [],
  _count: { users: 5 },
};
const baseUser = {
  id: 1,
  fullName: 'Test User',
  email: 'test@test.com',
  active: true,
  roleId: 1,
  role: { ...baseRole, permissions: [basePerm] },
};

describe('AclService (additional)', () => {
  let service: AclService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [AclService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();
    service = module.get<AclService>(AclService);
  });

  // ─── createPermission ───────────────────────────────────────────

  describe('createPermission', () => {
    it('deve criar permissão com sucesso', async () => {
      mockPrisma.permission.create.mockResolvedValue(basePerm);
      const result = await service.createPermission({
        name: 'dashboard:view',
        action: 'VIEW' as any,
        subject: 'DASHBOARD' as any,
      });
      expect(result).toBeDefined();
      expect(mockPrisma.permission.create).toHaveBeenCalled();
    });

    it('deve criar permissão com sensitive flag', async () => {
      mockPrisma.permission.create.mockResolvedValue({ ...basePerm, sensitive: true });
      const result = await service.createPermission({
        name: 'payroll:view',
        action: 'VIEW' as any,
        subject: 'PAYROLL' as any,
        sensitive: true,
      });
      expect(result).toBeDefined();
    });
  });

  // ─── updateRole ────────────────────────────────────────────────

  describe('updateRole', () => {
    it('deve actualizar role', async () => {
      mockPrisma.role.update.mockResolvedValue({ ...baseRole, name: 'COLABORADOR_UPDATED' });
      const result = await service.updateRole(1, { name: 'COLABORADOR_UPDATED' });
      expect(result.name).toBe('COLABORADOR_UPDATED');
    });
  });

  // ─── cloneRole ────────────────────────────────────────────────

  describe('cloneRole', () => {
    it('deve clonar role com permissões', async () => {
      const roleWithPerms = { ...baseRole, permissions: [basePerm] };
      mockPrisma.role.findUnique
        .mockResolvedValueOnce(roleWithPerms)
        .mockResolvedValueOnce({ ...baseRole, id: 2, name: 'COLABORADOR_CLONE' });
      mockPrisma.role.create.mockResolvedValue({ ...baseRole, id: 2, name: 'COLABORADOR_CLONE' });
      mockPrisma.role.update.mockResolvedValue({ ...baseRole, id: 2 });

      const result = await service.cloneRole(1, { newName: 'COLABORADOR_CLONE' });
      expect(result).toBeDefined();
      expect(mockPrisma.role.create).toHaveBeenCalled();
    });

    it('deve lançar erro se role não encontrado', async () => {
      mockPrisma.role.findUnique.mockResolvedValue(null);
      await expect(service.cloneRole(99, { newName: 'CLONE' })).rejects.toThrow(
        'Role não encontrado',
      );
    });

    it('deve clonar role sem permissões', async () => {
      const roleNoPerms = { ...baseRole, permissions: [] };
      mockPrisma.role.findUnique
        .mockResolvedValueOnce(roleNoPerms)
        .mockResolvedValueOnce({ ...baseRole, id: 2 });
      mockPrisma.role.create.mockResolvedValue({ ...baseRole, id: 2 });

      const result = await service.cloneRole(1, { newName: 'EMPTY_CLONE' });
      expect(result).toBeDefined();
      expect(mockPrisma.role.update).not.toHaveBeenCalled();
    });
  });

  // ─── getRolePermissions ────────────────────────────────────────

  describe('getRolePermissions', () => {
    it('deve retornar permissões do role', async () => {
      mockPrisma.role.findUnique.mockResolvedValue({ ...baseRole, permissions: [basePerm] });
      const result = await service.getRolePermissions(1);
      expect(result).toBeDefined();
    });
  });

  // ─── assignPermissionToRole ────────────────────────────────────

  describe('assignPermissionToRole', () => {
    it('deve atribuir permissão a role', async () => {
      mockPrisma.role.update.mockResolvedValue({ ...baseRole, permissions: [basePerm] });
      const result = await service.assignPermissionToRole(1, 1);
      expect(result).toBeDefined();
      expect(mockPrisma.role.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 1 } }),
      );
    });
  });

  // ─── revokePermissionFromRole ──────────────────────────────────

  describe('revokePermissionFromRole', () => {
    it('deve revogar permissão do role', async () => {
      mockPrisma.role.update.mockResolvedValue({ ...baseRole, permissions: [] });
      const result = await service.revokePermissionFromRole(1, 1);
      expect(result).toBeDefined();
    });
  });

  // ─── bulkAssignPermissions ─────────────────────────────────────

  describe('bulkAssignPermissions', () => {
    it('deve atribuir múltiplas permissões', async () => {
      mockPrisma.role.update.mockResolvedValue({ ...baseRole, permissions: [basePerm] });
      const result = await service.bulkAssignPermissions({ roleId: 1, permissionIds: [1, 2, 3] });
      expect(result).toBeDefined();
    });
  });

  // ─── assignRoleToUser ──────────────────────────────────────────

  describe('assignRoleToUser', () => {
    it('deve atribuir role a utilizador', async () => {
      mockPrisma.user.update.mockResolvedValue(baseUser);
      mockPrisma.auditLog.create.mockResolvedValue({});
      mockPrisma.notificationLog.create.mockResolvedValue({});

      const result = await service.assignRoleToUser({ userId: 1, roleId: 2 });
      expect(result).toMatchObject({ userId: 1, roleId: 2 });
      expect(mockPrisma.user.update).toHaveBeenCalled();
    });
  });

  // ─── getUserPermissions ────────────────────────────────────────

  describe('getUserPermissions', () => {
    it('deve retornar permissões do utilizador sem cache', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(baseUser);
      const result = await service.getUserPermissions(1);
      expect(result.userId).toBe(1);
      expect(result.permissions).toContain('dashboard:view');
      expect(result.cached).toBe(false);
    });

    it('deve retornar cache na segunda chamada', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(baseUser);
      await service.getUserPermissions(2);
      const result = await service.getUserPermissions(2);
      expect(result.cached).toBe(true);
    });

    it('deve retornar wildcard para ADMIN', async () => {
      const adminUser = {
        ...baseUser,
        id: 10,
        role: { ...baseRole, code: 'ADMIN', permissions: [basePerm] },
      };
      mockPrisma.user.findUnique.mockResolvedValue(adminUser);
      const result = await service.getUserPermissions(10);
      expect(result.permissions).toContain('*');
    });

    it('deve retornar COLABORADOR se sem role', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ ...baseUser, id: 20, role: null });
      const result = await service.getUserPermissions(20);
      expect(result.roleCode).toBe('COLABORADOR');
    });
  });

  // ─── hasPermission ────────────────────────────────────────────

  describe('hasPermission', () => {
    it('deve retornar true para permissão existente', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(baseUser);
      const result = await service.hasPermission(1, 'dashboard:view');
      expect(result).toBe(true);
    });

    it('deve retornar false para permissão inexistente', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ ...baseUser, id: 30 });
      const result = await service.hasPermission(30, 'payroll:export');
      expect(result).toBe(false);
    });
  });

  // ─── checkPermission ──────────────────────────────────────────

  describe('checkPermission', () => {
    it('deve retornar allowed=true para permissão directa', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(baseUser);
      (mockPrisma as any).accessPolicy = { findMany: jest.fn().mockResolvedValue([]) };
      const result = await service.checkPermission({
        userId: 1,
        action: 'VIEW' as any,
        subject: 'DASHBOARD' as any,
      });
      expect(result.allowed).toBe(true);
    });

    it('deve retornar allowed=false para permissão não concedida', async () => {
      const userNoPerms = { ...baseUser, id: 40, role: { ...baseRole, permissions: [] } };
      mockPrisma.user.findUnique.mockResolvedValue(userNoPerms);
      mockPrisma.auditLog.create.mockResolvedValue({});
      const result = await service.checkPermission({
        userId: 40,
        action: 'EXPORT' as any,
        subject: 'PAYROLL' as any,
      });
      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('Permission not granted');
    });

    it('deve retornar allowed=true para ADMIN wildcard', async () => {
      const adminUser = {
        ...baseUser,
        id: 50,
        role: { ...baseRole, code: 'ADMIN', permissions: [] },
      };
      mockPrisma.user.findUnique.mockResolvedValue(adminUser);
      const result = await service.checkPermission({
        userId: 50,
        action: 'DELETE' as any,
        subject: 'USERS' as any,
      });
      expect(result.allowed).toBe(true);
      expect(result.reason).toBe('ADMIN wildcard');
    });
  });

  // ─── getAuditLog ──────────────────────────────────────────────

  describe('getAuditLog', () => {
    it('deve retornar log de auditoria paginado', async () => {
      mockPrisma.auditLog.findMany.mockResolvedValue([]);
      mockPrisma.auditLog.count.mockResolvedValue(0);
      const result = await service.getAuditLog({ page: 1, limit: 10 });
      expect(result).toHaveProperty('data');
      expect(result).toHaveProperty('meta');
      expect(result.meta.page).toBe(1);
    });

    it('deve filtrar por userId', async () => {
      mockPrisma.auditLog.findMany.mockResolvedValue([]);
      mockPrisma.auditLog.count.mockResolvedValue(0);
      await service.getAuditLog({ userId: 1, page: 1, limit: 10 });
      expect(mockPrisma.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ userId: 1 }) }),
      );
    });

    it('deve filtrar por action e datas', async () => {
      mockPrisma.auditLog.findMany.mockResolvedValue([]);
      mockPrisma.auditLog.count.mockResolvedValue(0);
      await service.getAuditLog({ action: 'ROLE_ASSIGNED', from: '2026-01-01', to: '2026-12-31' });
      expect(mockPrisma.auditLog.findMany).toHaveBeenCalled();
    });
  });

  // ─── getDeniedLog ─────────────────────────────────────────────

  describe('getDeniedLog', () => {
    it('deve retornar log de acessos negados', async () => {
      mockPrisma.auditLog.findMany.mockResolvedValue([]);
      mockPrisma.auditLog.count.mockResolvedValue(0);
      const result = await service.getDeniedLog({ page: 1, limit: 10 });
      expect(result).toHaveProperty('data');
      expect(result.meta.totalPages).toBe(0);
    });

    it('deve filtrar por userId nos acessos negados', async () => {
      mockPrisma.auditLog.findMany.mockResolvedValue([]);
      mockPrisma.auditLog.count.mockResolvedValue(0);
      await service.getDeniedLog({ userId: 5, page: 1, limit: 10 });
      expect(mockPrisma.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ userId: 5 }) }),
      );
    });
  });

  // ─── getPermissionMatrix ──────────────────────────────────────

  describe('getPermissionMatrix', () => {
    it('deve retornar matriz de permissões por role', async () => {
      mockPrisma.role.findMany.mockResolvedValue([{ ...baseRole, permissions: [basePerm] }]);
      mockPrisma.permission.findMany.mockResolvedValue([basePerm]);
      const result = await service.getPermissionMatrix();
      expect(result).toHaveProperty('roles');
      expect(result).toHaveProperty('permissions');
      expect(result).toHaveProperty('matrix');
    });

    it('deve retornar matriz vazia quando sem dados', async () => {
      mockPrisma.role.findMany.mockResolvedValue([]);
      mockPrisma.permission.findMany.mockResolvedValue([]);
      const result = await service.getPermissionMatrix();
      expect(result.matrix).toHaveLength(0);
    });
  });

  // ─── seedBuiltinPermissions ───────────────────────────────────

  describe('seedBuiltinPermissions', () => {
    it('deve criar permissões que não existem', async () => {
      mockPrisma.permission.findFirst.mockResolvedValue(null);
      (mockPrisma as any).permission.create = jest.fn().mockResolvedValue(basePerm);
      const result = await service.seedBuiltinPermissions();
      expect(result).toHaveProperty('created');
      expect(result.created.length).toBeGreaterThan(0);
    });

    it('deve ignorar permissões já existentes', async () => {
      mockPrisma.permission.findFirst.mockResolvedValue(basePerm);
      const result = await service.seedBuiltinPermissions();
      expect(result.created).toHaveLength(0);
    });
  });

  // ─── seedDefaultPermissionsForRole ────────────────────────────

  describe('seedDefaultPermissionsForRole', () => {
    it('deve atribuir permissões wildcard ao ADMIN', async () => {
      mockPrisma.permission.findMany.mockResolvedValue([basePerm]);
      mockPrisma.role.update.mockResolvedValue(baseRole);
      await service.seedDefaultPermissionsForRole(1, 'ADMIN', ['*']);
      expect(mockPrisma.role.update).toHaveBeenCalled();
    });

    it('deve atribuir permissões nomeadas a role não-ADMIN', async () => {
      mockPrisma.permission.findMany.mockResolvedValue([basePerm]);
      mockPrisma.role.update.mockResolvedValue(baseRole);
      await service.seedDefaultPermissionsForRole(1, 'COLABORADOR', ['dashboard:view']);
      expect(mockPrisma.role.update).toHaveBeenCalled();
    });

    it('deve ignorar se nenhuma permissão encontrada', async () => {
      mockPrisma.permission.findMany.mockResolvedValue([]);
      mockPrisma.role.update.mockClear();
      await service.seedDefaultPermissionsForRole(1, 'COLABORADOR', ['dashboard:view']);
      expect(mockPrisma.role.update).not.toHaveBeenCalled();
    });
  });

  // ─── getStats ────────────────────────────────────────────────

  describe('getStats', () => {
    it('deve retornar estatísticas do ACL', async () => {
      mockPrisma.user.count.mockResolvedValue(100);
      (mockPrisma.role as any).count = jest.fn().mockResolvedValue(5);
      (mockPrisma.permission as any).count = jest.fn().mockResolvedValue(30);
      mockPrisma.auditLog.count.mockResolvedValue(10);
      mockPrisma.auditLog.findMany.mockResolvedValue([]);
      (mockPrisma.user as any).groupBy = jest
        .fn()
        .mockResolvedValue([{ roleId: 1, _count: { id: 50 } }]);
      mockPrisma.role.findMany.mockResolvedValue([baseRole]);

      const result = await service.getStats();
      expect(result).toHaveProperty('totalUsers');
      expect(result).toHaveProperty('totalRoles');
      expect(result).toHaveProperty('totalPermissions');
      expect(result).toHaveProperty('deniedCount');
      expect(result).toHaveProperty('roleBreakdown');
    });
  });
});
