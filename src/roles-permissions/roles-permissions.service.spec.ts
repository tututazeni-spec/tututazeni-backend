import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ConflictException } from '@nestjs/common';
import { RolesPermissionsService } from './roles-permissions.service';
import { PrismaService } from '../prisma/prisma.service';
import { CacheService } from '../cache/cache.service';

const mockCache = {
  get: jest.fn().mockResolvedValue(null),
  set: jest.fn().mockResolvedValue(undefined),
  del: jest.fn().mockResolvedValue(undefined),
};

const mockPrisma = {
  role: {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    count: jest.fn(),
  },
  permission: {
    findMany: jest.fn().mockResolvedValue([]),
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    count: jest.fn().mockResolvedValue(0),
  },
  rolePermission: {
    findMany: jest.fn().mockResolvedValue([]),
    create: jest.fn().mockResolvedValue({}),
    createMany: jest.fn().mockResolvedValue({ count: 0 }),
    deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
  },
  user: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
    count: jest.fn().mockResolvedValue(0),
    groupBy: jest.fn().mockResolvedValue([]),
  },
  auditLog: {
    create: jest.fn().mockResolvedValue({}),
    findMany: jest.fn().mockResolvedValue([]),
    count: jest.fn().mockResolvedValue(0),
  },
  notificationLog: { create: jest.fn().mockResolvedValue({}) },
};

const baseRole = {
  id: 1,
  name: 'COLABORADOR',
  code: 'COLABORADOR',
  description: 'Role base',
  isSystem: false,
  priority: 0,
  rolePermissions: [
    { permission: { id: 1, name: 'courses:read', action: 'read', subject: 'courses' } },
  ],
  users: [],
  _count: { users: 10 },
};

describe('RolesPermissionsService', () => {
  let service: RolesPermissionsService;

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
        RolesPermissionsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: CacheService, useValue: mockCache },
      ],
    }).compile();
    service = module.get<RolesPermissionsService>(RolesPermissionsService);
  });

  // ─── findAll ──────────────────────────────────────────────────────────────

  describe('findAll', () => {
    it('deve retornar roles com contagem de permissões e utilizadores', async () => {
      mockPrisma.role.findMany.mockResolvedValue([baseRole]);

      const result = await service.findAll();

      expect(result).toHaveLength(1);
      expect((result[0] as any).effectivePermissions).toBe(1);
      expect((result[0] as any).usersCount).toBe(10);
    });
  });

  // ─── findOne ──────────────────────────────────────────────────────────────

  describe('findOne', () => {
    it('deve retornar role por id', async () => {
      mockPrisma.role.findUnique.mockResolvedValue(baseRole);

      const result = await service.findOne(1);

      expect(result.name).toBe('COLABORADOR');
    });

    it('deve lançar NotFoundException se não encontrado', async () => {
      mockPrisma.role.findUnique.mockResolvedValue(null);
      await expect(service.findOne(99)).rejects.toThrow(NotFoundException);
    });
  });

  // ─── create ───────────────────────────────────────────────────────────────

  describe('create', () => {
    it('deve criar role com sucesso', async () => {
      mockPrisma.role.findFirst.mockResolvedValue(null);
      mockPrisma.role.create.mockResolvedValue(baseRole);
      mockPrisma.role.findUnique.mockResolvedValue(baseRole);

      const result = await service.create({ name: 'COLABORADOR', description: 'Base' });

      expect(result.name).toBe('COLABORADOR');
      expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ entity: 'Role', action: 'ROLE_CREATED' }),
        }),
      );
    });

    it('atribui as permissões pedidas via RolePermission ao criar', async () => {
      mockPrisma.role.findFirst.mockResolvedValue(null);
      mockPrisma.role.create.mockResolvedValue(baseRole);
      mockPrisma.role.findUnique.mockResolvedValue(baseRole);

      await service.create({ name: 'COLABORADOR', permissionIds: [1, 2] });

      expect(mockPrisma.rolePermission.createMany).toHaveBeenCalledWith({
        data: [
          { roleId: baseRole.id, permissionId: 1 },
          { roleId: baseRole.id, permissionId: 2 },
        ],
        skipDuplicates: true,
      });
    });

    it('deve lançar ConflictException se nome duplicado', async () => {
      mockPrisma.role.findFirst.mockResolvedValue(baseRole);
      await expect(service.create({ name: 'COLABORADOR' })).rejects.toThrow(ConflictException);
    });
  });

  // ─── update ───────────────────────────────────────────────────────────────

  describe('update', () => {
    it('deve actualizar role com sucesso', async () => {
      mockPrisma.role.findUnique
        .mockResolvedValueOnce({ ...baseRole, isSystem: false })
        .mockResolvedValueOnce({ ...baseRole, name: 'COLABORADOR_V2' });
      mockPrisma.role.update.mockResolvedValue({ ...baseRole, name: 'COLABORADOR_V2' });

      const result = await service.update(1, { name: 'COLABORADOR_V2' });

      expect(result.name).toBe('COLABORADOR_V2');
    });

    it('deve lançar NotFoundException se não encontrado', async () => {
      mockPrisma.role.findUnique.mockResolvedValue(null);
      await expect(service.update(99, { name: 'X' })).rejects.toThrow(NotFoundException);
    });

    it('actualiza mesmo quando o registo devolvido tem isSystem=true (campo nunca existiu no schema real — a "protecção" nunca funcionou em produção, ver findAll())', async () => {
      mockPrisma.role.findUnique
        .mockResolvedValueOnce({ ...baseRole, isSystem: true })
        .mockResolvedValueOnce({ ...baseRole, name: 'NOVO_NOME' });
      mockPrisma.role.update.mockResolvedValue({ ...baseRole, name: 'NOVO_NOME' });
      const result = await service.update(1, { name: 'NOVO_NOME' });
      expect(result.name).toBe('NOVO_NOME');
    });

    it('substitui as permissões via diff (remove as antigas, adiciona as novas) quando permissionIds é fornecido', async () => {
      mockPrisma.role.findUnique.mockResolvedValue({ ...baseRole, isSystem: false });
      mockPrisma.role.update.mockResolvedValue(baseRole);
      mockPrisma.rolePermission.findMany.mockResolvedValue([{ permissionId: 1 }]);

      await service.update(1, { permissionIds: [2, 3] });

      expect(mockPrisma.rolePermission.deleteMany).toHaveBeenCalledWith({
        where: { roleId: 1, permissionId: { in: [1] } },
      });
      expect(mockPrisma.rolePermission.createMany).toHaveBeenCalledWith({
        data: [
          { roleId: 1, permissionId: 2 },
          { roleId: 1, permissionId: 3 },
        ],
        skipDuplicates: true,
      });
    });

    it('não toca em RolePermission quando permissionIds não é fornecido', async () => {
      mockPrisma.role.findUnique.mockResolvedValue({ ...baseRole, isSystem: false });
      mockPrisma.role.update.mockResolvedValue(baseRole);

      await service.update(1, { name: 'X' });

      expect(mockPrisma.rolePermission.deleteMany).not.toHaveBeenCalled();
      expect(mockPrisma.rolePermission.createMany).not.toHaveBeenCalled();
    });
  });

  // ─── catálogo de permissões (absorvido do acl/departments) ────────────────

  describe('catálogo de permissões (absorvido do acl/departments)', () => {
    it('getAllPermissions ordena por subject, action', async () => {
      mockPrisma.permission.findMany.mockResolvedValue([]);
      await service.getAllPermissions();
      expect(mockPrisma.permission.findMany).toHaveBeenCalledWith({
        orderBy: [{ subject: 'asc' }, { action: 'asc' }],
      });
    });

    it('createPermission persiste só name/action/subject (schema não tem sensitive/description)', async () => {
      mockPrisma.permission.create.mockResolvedValue({ id: 1 });
      await service.createPermission({
        name: 'course.read',
        action: 'VIEW',
        subject: 'LMS',
        sensitive: true,
        description: 'x',
      } as never);
      expect(mockPrisma.permission.create).toHaveBeenCalledWith({
        data: { name: 'course.read', action: 'VIEW', subject: 'LMS' },
      });
    });

    it('createPermission com roleId → cria também a RolePermission', async () => {
      mockPrisma.permission.create.mockResolvedValue({ id: 5 });
      mockPrisma.rolePermission.create.mockResolvedValue({});
      await service.createPermission({
        name: 'x',
        action: 'VIEW',
        subject: 'LMS',
        roleId: 3,
      } as never);
      expect(mockPrisma.rolePermission.create).toHaveBeenCalledWith({
        data: { roleId: 3, permissionId: 5 },
      });
    });

    it('createPermission sem roleId → não toca em RolePermission', async () => {
      mockPrisma.permission.create.mockResolvedValue({ id: 7 });
      await service.createPermission({ name: 'x', action: 'VIEW', subject: 'LMS' } as never);
      expect(mockPrisma.rolePermission.create).not.toHaveBeenCalled();
    });

    it('deletePermission chama prisma.permission.delete', async () => {
      mockPrisma.permission.delete.mockResolvedValue({ id: 9 });
      await service.deletePermission(9);
      expect(mockPrisma.permission.delete).toHaveBeenCalledWith({ where: { id: 9 } });
    });
  });

  // ─── initDefaultRoles + auto-seed ROLE_DEFAULTS (absorvido do acl/departments) ──

  describe('initDefaultRoles', () => {
    it('cria só os roles em falta', async () => {
      mockPrisma.role.findFirst.mockImplementation(({ where }: any) =>
        Promise.resolve(where.name === 'ADMIN' ? { id: 1, name: 'ADMIN' } : null),
      );
      mockPrisma.role.create.mockImplementation(({ data }: any) =>
        Promise.resolve({ id: 99, ...data }),
      );

      const res = await service.initDefaultRoles();

      expect(res.created).toBe(4); // todas menos ADMIN, que já existia
      expect(res.roles).toHaveLength(4);
    });
  });

  describe('create com ROLE_DEFAULTS', () => {
    it('role cujo code está em ROLE_DEFAULTS → auto-atribui as permissões default', async () => {
      mockPrisma.role.findFirst.mockResolvedValue(null);
      mockPrisma.role.create.mockResolvedValue({ id: 7, code: 'RH', name: 'RH' });
      mockPrisma.role.findUnique.mockResolvedValue({ ...baseRole, id: 7, code: 'RH', name: 'RH' });
      mockPrisma.permission.findMany.mockResolvedValue([
        { id: 1, name: 'users:view' },
        { id: 2, name: 'users:create' },
      ]);

      await service.create({ name: 'RH', code: 'RH' } as never);

      expect(mockPrisma.rolePermission.createMany).toHaveBeenCalledWith({
        data: [
          { roleId: 7, permissionId: 1 },
          { roleId: 7, permissionId: 2 },
        ],
        skipDuplicates: true,
      });
    });

    it('role cujo code NÃO está em ROLE_DEFAULTS → não auto-atribui nada', async () => {
      mockPrisma.role.findFirst.mockResolvedValue(null);
      mockPrisma.role.create.mockResolvedValue({ id: 8, code: 'CUSTOM_X', name: 'Custom X' });
      mockPrisma.role.findUnique.mockResolvedValue({
        ...baseRole,
        id: 8,
        code: 'CUSTOM_X',
        name: 'Custom X',
      });

      await service.create({ name: 'Custom X' } as never);

      expect(mockPrisma.rolePermission.createMany).not.toHaveBeenCalled();
    });
  });

  // ─── métodos absorvidos do acl (sem ABAC) ────────────────────────────────

  describe('métodos absorvidos do acl', () => {
    it('getUserPermissions devolve as permissões do role do utilizador e guarda em cache', async () => {
      mockCache.get.mockResolvedValueOnce(null);
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 1,
        role: {
          code: 'COLABORADOR',
          rolePermissions: [{ permission: { id: 1, name: 'course.read' } }],
        },
      });

      const res = await service.getUserPermissions(1);

      expect(res.permissions).toEqual(expect.arrayContaining(['course.read']));
      expect(res.cached).toBe(false);
      expect(mockCache.set).toHaveBeenCalledWith(
        'acl:perm:1',
        expect.objectContaining({ roleCode: 'COLABORADOR' }),
        60,
      );
    });

    it('getUserPermissions — ADMIN recebe wildcard e permissões built-in', async () => {
      mockCache.get.mockResolvedValueOnce(null);
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 2,
        role: { code: 'ADMIN', rolePermissions: [] },
      });

      const res = await service.getUserPermissions(2);

      expect(res.permissions).toContain('*');
      expect(res.permissions.length).toBeGreaterThan(1);
    });

    it('getUserPermissions devolve o valor em cache quando existe', async () => {
      mockCache.get.mockResolvedValueOnce({ permissions: ['x'], roleCode: 'RH' });
      const res = await service.getUserPermissions(3);
      expect(res).toEqual({ userId: 3, roleCode: 'RH', permissions: ['x'], cached: true });
      expect(mockPrisma.user.findUnique).not.toHaveBeenCalled();
    });

    it('assignRoleToUser actualiza o role, invalida a cache e devolve a forma histórica', async () => {
      mockPrisma.user.update.mockResolvedValue({ id: 5, roleId: 9 });
      const res = await service.assignRoleToUser({ userId: 5, roleId: 9 });
      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: 5 },
        data: { roleId: 9 },
      });
      expect(mockCache.del).toHaveBeenCalledWith('acl:perm:5');
      expect(res).toEqual({ message: 'Role atribuído com sucesso', userId: 5, roleId: 9 });
    });

    it('getAuditLog filtra AuditLog e devolve resposta paginada', async () => {
      mockPrisma.auditLog.findMany.mockResolvedValue([]);
      mockPrisma.auditLog.count.mockResolvedValue(0);
      const res = await service.getAuditLog({ action: 'ROLE_CREATED' });
      expect(mockPrisma.auditLog.findMany).toHaveBeenCalled();
      expect(res).toHaveProperty('data');
    });

    it('getDeniedLog filtra por action ACCESS_DENIED', async () => {
      mockPrisma.auditLog.findMany.mockResolvedValue([]);
      mockPrisma.auditLog.count.mockResolvedValue(0);
      await service.getDeniedLog({});
      expect(mockPrisma.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { action: 'ACCESS_DENIED' } }),
      );
    });

    it('assignPermissionToRole delega em addPermissionsToRole com array de 1', async () => {
      const spy = jest.spyOn(service, 'addPermissionsToRole').mockResolvedValue({} as never);
      await service.assignPermissionToRole(3, 7);
      expect(spy).toHaveBeenCalledWith(3, [7]);
      spy.mockRestore();
    });

    it('revokePermissionFromRole delega em removePermissionsFromRole com array de 1', async () => {
      const spy = jest.spyOn(service, 'removePermissionsFromRole').mockResolvedValue({} as never);
      await service.revokePermissionFromRole(3, 7);
      expect(spy).toHaveBeenCalledWith(3, [7]);
      spy.mockRestore();
    });

    it('getStats devolve a forma histórica de GET /acl/stats', async () => {
      mockPrisma.user.count.mockResolvedValue(6000);
      mockPrisma.role.count.mockResolvedValue(7);
      mockPrisma.permission.count.mockResolvedValue(35);
      mockPrisma.auditLog.count.mockResolvedValue(3);
      mockPrisma.auditLog.findMany.mockResolvedValue([]);
      mockPrisma.user.groupBy.mockResolvedValue([]);

      const res = await service.getStats();

      expect(res).toEqual(
        expect.objectContaining({
          totalUsers: 6000,
          totalRoles: 7,
          totalPermissions: 35,
          deniedCount: 3,
          roleBreakdown: [],
          recentDenied: [],
        }),
      );
    });
  });
});
