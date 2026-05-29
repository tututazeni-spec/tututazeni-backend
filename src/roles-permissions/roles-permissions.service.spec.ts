import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
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
  permissions: [{ id: 1, name: 'courses:read', action: 'read', subject: 'courses' }],
  users: [],
  _count: { users: 10 },
};

describe('RolesPermissionsService', () => {
  let service: RolesPermissionsService;

  beforeEach(async () => {
    jest.clearAllMocks();
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

      const result = await service.create({ name: 'COLABORADOR', description: 'Base' });

      expect(result.name).toBe('COLABORADOR');
      expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ entity: 'Role', action: 'ROLE_CREATED' }),
        }),
      );
    });

    it('deve lançar ConflictException se nome duplicado', async () => {
      mockPrisma.role.findFirst.mockResolvedValue(baseRole);
      await expect(service.create({ name: 'COLABORADOR' })).rejects.toThrow(ConflictException);
    });
  });

  // ─── update ───────────────────────────────────────────────────────────────

  describe('update', () => {
    it('deve actualizar role com sucesso', async () => {
      mockPrisma.role.findUnique.mockResolvedValue({ ...baseRole, isSystem: false });
      mockPrisma.role.update.mockResolvedValue({ ...baseRole, name: 'COLABORADOR_V2' });

      const result = await service.update(1, { name: 'COLABORADOR_V2' });

      expect(result.name).toBe('COLABORADOR_V2');
    });

    it('deve lançar NotFoundException se não encontrado', async () => {
      mockPrisma.role.findUnique.mockResolvedValue(null);
      await expect(service.update(99, { name: 'X' })).rejects.toThrow(NotFoundException);
    });

    it('deve lançar BadRequestException ao renomear role de sistema', async () => {
      mockPrisma.role.findUnique.mockResolvedValue({ ...baseRole, isSystem: true });
      await expect(service.update(1, { name: 'NOVO_NOME' })).rejects.toThrow(BadRequestException);
    });
  });
});
