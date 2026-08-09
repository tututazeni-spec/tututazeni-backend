import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ConflictException } from '@nestjs/common';
import { RolesPermissionsService } from './roles-permissions.service';
import { PrismaService } from '../prisma/prisma.service';

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
    findMany: jest.fn(),
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  rolePermission: {
    findMany: jest.fn().mockResolvedValue([]),
    createMany: jest.fn().mockResolvedValue({ count: 0 }),
    deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
  },
  user: {
    findMany: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
    count: jest.fn(),
  },
  auditLog: { create: jest.fn().mockResolvedValue({}) },
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
      providers: [RolesPermissionsService, { provide: PrismaService, useValue: mockPrisma }],
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
});
