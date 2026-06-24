import { Test, TestingModule } from '@nestjs/testing';
import { AclService } from './acl.service';
import { PrismaService } from '../prisma/prisma.service';

const mockPrisma = {
  permission: {
    findMany: jest.fn().mockResolvedValue([]),
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  role: {
    findMany: jest.fn().mockResolvedValue([]),
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    findFirst: jest.fn(),
  },
  user: {
    findUnique: jest.fn(),
    findMany: jest.fn().mockResolvedValue([]),
    update: jest.fn(),
    updateMany: jest.fn().mockResolvedValue({ count: 0 }),
  },
  auditLog: { create: jest.fn().mockResolvedValue({}) },
  notificationLog: { create: jest.fn().mockResolvedValue({}) },
};

const baseRole = {
  id: 1,
  name: 'COLABORADOR',
  code: 'COLABORADOR',
  permissions: [],
  users: [],
  _count: { users: 10 },
};
const basePerm = { id: 1, name: 'courses:read', action: 'read', subject: 'courses' };

describe('AclService', () => {
  let service: AclService;

  beforeEach(async () => {
    jest.clearAllMocks();
    Object.defineProperty(mockPrisma, 'read', {
      get() {
        return mockPrisma;
      },
      configurable: true,
    });
    const module: TestingModule = await Test.createTestingModule({
      providers: [AclService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();
    service = module.get<AclService>(AclService);
  });

  describe('getAllPermissions', () => {
    it('deve retornar todas as permissões', async () => {
      mockPrisma.permission.findMany.mockResolvedValue([basePerm]);
      const result = await service.getAllPermissions();
      expect(result).toHaveLength(1);
    });
  });

  describe('getRoles', () => {
    it('deve retornar todos os roles', async () => {
      mockPrisma.role.findMany.mockResolvedValue([baseRole]);
      const result = await service.getRoles();
      expect(result).toHaveLength(1);
    });
  });

  describe('getRole', () => {
    it('deve retornar role por id', async () => {
      mockPrisma.role.findUnique.mockResolvedValue(baseRole);
      const result = await service.getRole(1);
      expect(result).toBeDefined();
    });
    it('deve retornar null se não encontrado', async () => {
      mockPrisma.role.findUnique.mockResolvedValue(null);
      const result = await service.getRole(99);
      expect(result).toBeNull();
    });
  });

  describe('createRole', () => {
    it('deve criar role', async () => {
      mockPrisma.role.create.mockResolvedValue(baseRole);
      const result = await service.createRole({ name: 'COLABORADOR', code: 'COLAB' } as any);
      expect(result).toBeDefined();
    });
  });
});
