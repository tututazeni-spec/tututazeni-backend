import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ConflictException } from '@nestjs/common';
import { DepartmentsService } from './departments.service';
import { PrismaService } from '../prisma/prisma.service';

const mockPrisma = {
  department: {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    count: jest.fn(),
    delete: jest.fn(),
  },
  departmentHeadHistory: { create: jest.fn().mockResolvedValue({}) },
  user: {
    findMany: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
    count: jest.fn(),
  },
  unit: {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    count: jest.fn(),
    delete: jest.fn(),
  },
  role: {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  permission: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
    delete: jest.fn(),
  },
  rolePermission: { create: jest.fn(), deleteMany: jest.fn() },
  position: {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    count: jest.fn(),
  },
  careerPosition: { create: jest.fn(), findMany: jest.fn() },
  auditLog: { create: jest.fn().mockResolvedValue({}) },
};

const baseDept = {
  id: 1,
  name: 'Tecnologia',
  code: 'TI',
  active: true,
  parentId: null,
  headId: null,
  head: null,
  parent: null,
  children: [],
  users: [],
  headHistory: [],
  _count: { users: 5, children: 2 },
};

describe('DepartmentsService', () => {
  let service: DepartmentsService;

  beforeEach(async () => {
    jest.clearAllMocks();
    Object.defineProperty(mockPrisma, 'read', {
      get() {
        return mockPrisma;
      },
      configurable: true,
    });
    const module: TestingModule = await Test.createTestingModule({
      providers: [DepartmentsService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();
    service = module.get<DepartmentsService>(DepartmentsService);
  });

  // ─── findAll ──────────────────────────────────────────────────────────────

  describe('findAll', () => {
    it('deve retornar lista paginada de departamentos', async () => {
      mockPrisma.department.findMany.mockResolvedValue([baseDept]);
      mockPrisma.department.count.mockResolvedValue(1);

      const result = await service.findAll({ page: 1, limit: 30 });

      expect(result.data).toHaveLength(1);
      expect(result.total).toBe(1);
    });

    it('deve filtrar por search', async () => {
      mockPrisma.department.findMany.mockResolvedValue([]);
      mockPrisma.department.count.mockResolvedValue(0);

      await service.findAll({ search: 'Tecnologia' });

      expect(mockPrisma.department.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ OR: expect.any(Array) }),
        }),
      );
    });

    it('deve filtrar rootOnly', async () => {
      mockPrisma.department.findMany.mockResolvedValue([baseDept]);
      mockPrisma.department.count.mockResolvedValue(1);

      await service.findAll({ rootOnly: true });

      expect(mockPrisma.department.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ parentId: null }),
        }),
      );
    });
  });

  // ─── getTree ──────────────────────────────────────────────────────────────

  describe('getTree', () => {
    it('deve construir árvore hierárquica', async () => {
      mockPrisma.department.findMany.mockResolvedValue([
        { ...baseDept, id: 1, parentId: null },
        { ...baseDept, id: 2, parentId: 1 },
      ]);

      const result = await service.getTree();

      expect(result).toHaveLength(1);
      expect(result[0].children).toHaveLength(1);
    });
  });

  // ─── findOne ──────────────────────────────────────────────────────────────

  describe('findOne', () => {
    it('deve retornar departamento por id', async () => {
      mockPrisma.department.findUnique.mockResolvedValue(baseDept);

      const result = await service.findOne(1);

      expect(result.name).toBe('Tecnologia');
    });

    it('deve lançar NotFoundException se não encontrado', async () => {
      mockPrisma.department.findUnique.mockResolvedValue(null);
      await expect(service.findOne(99)).rejects.toThrow(NotFoundException);
    });
  });

  // ─── create ───────────────────────────────────────────────────────────────

  describe('create', () => {
    const dto = { name: 'RH', code: 'RH001' };

    it('deve criar departamento com sucesso', async () => {
      mockPrisma.department.findFirst.mockResolvedValue(null);
      mockPrisma.department.create.mockResolvedValue({ ...baseDept, name: 'RH', code: 'RH001' });

      const result = await service.create(dto);

      expect(result.name).toBe('RH');
    });

    it('deve lançar ConflictException se código duplicado', async () => {
      mockPrisma.department.findFirst.mockResolvedValue(baseDept);
      await expect(service.create(dto)).rejects.toThrow(ConflictException);
    });

    it('deve lançar NotFoundException se parentId não existe', async () => {
      mockPrisma.department.findFirst.mockResolvedValue(null);
      mockPrisma.department.findUnique.mockResolvedValue(null);
      await expect(service.create({ ...dto, parentId: 99 })).rejects.toThrow(NotFoundException);
    });

    it('deve criar histórico de gestor se headId fornecido', async () => {
      mockPrisma.department.findFirst.mockResolvedValue(null);
      mockPrisma.department.create.mockResolvedValue({ ...baseDept, id: 2, headId: 1 });

      await service.create({ ...dto, headId: 1 });

      expect(mockPrisma.departmentHeadHistory.create).toHaveBeenCalled();
    });
  });
});
