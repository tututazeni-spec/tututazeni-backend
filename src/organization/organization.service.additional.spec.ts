import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { OrganizationService } from './organization.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  DepartmentsService,
  PositionsService,
  UnitsService,
} from '../departments/departments.service';

const mockDepartments = { create: jest.fn(), update: jest.fn(), remove: jest.fn() };
const mockPositions = { create: jest.fn(), update: jest.fn(), remove: jest.fn() };
const mockUnits = { create: jest.fn(), update: jest.fn() };

const makeCount = (n = 0) => jest.fn().mockResolvedValue(n);
const makeFindMany = (data: any[] = []) => jest.fn().mockResolvedValue(data);

const mockPrisma = {
  unit: {
    count: makeCount(5),
    findMany: makeFindMany([]),
    findFirst: jest.fn().mockResolvedValue(null),
    findUnique: jest.fn().mockResolvedValue(null),
    create: jest.fn().mockResolvedValue({ id: 1, name: 'Unit A', code: 'UA001' }),
    update: jest.fn().mockResolvedValue({}),
    delete: jest.fn().mockResolvedValue({}),
  },
  department: {
    count: makeCount(10),
    findMany: makeFindMany([]),
    findFirst: jest.fn().mockResolvedValue(null),
    findUnique: jest.fn().mockResolvedValue(null),
    create: jest.fn().mockResolvedValue({ id: 1, name: 'Dept A' }),
    update: jest.fn().mockResolvedValue({}),
    delete: jest.fn().mockResolvedValue({}),
    status: 'ACTIVE',
  },
  position: {
    count: makeCount(20),
    findMany: makeFindMany([]),
    findFirst: jest.fn().mockResolvedValue(null),
    findUnique: jest.fn().mockResolvedValue(null),
    create: jest.fn().mockResolvedValue({ id: 1, name: 'Position A', level: 1 }),
    update: jest.fn().mockResolvedValue({}),
    delete: jest.fn().mockResolvedValue({}),
  },
  user: {
    count: makeCount(100),
    findMany: makeFindMany([]),
    findUnique: jest.fn().mockResolvedValue(null),
    groupBy: jest.fn().mockResolvedValue([]),
    aggregate: jest.fn().mockResolvedValue({ _avg: {} }),
  },
  orgChangeLog: {
    create: jest.fn().mockResolvedValue({}),
    findMany: makeFindMany([]),
    count: makeCount(0),
  },
  notificationLog: { create: jest.fn().mockResolvedValue({}) },
};

describe('OrganizationService — additional coverage', () => {
  let service: OrganizationService;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockPrisma.unit.count.mockResolvedValue(5);
    mockPrisma.department.count.mockResolvedValue(10);
    mockPrisma.position.count.mockResolvedValue(20);
    mockPrisma.user.count.mockResolvedValue(100);
    mockPrisma.position.findMany.mockResolvedValue([]);
    mockPrisma.user.findMany.mockResolvedValue([]);
    mockPrisma.department.findMany.mockResolvedValue([]);

    Object.defineProperty(mockPrisma, 'read', {
      get() {
        return mockPrisma;
      },
      configurable: true,
    });
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrganizationService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: DepartmentsService, useValue: mockDepartments },
        { provide: PositionsService, useValue: mockPositions },
        { provide: UnitsService, useValue: mockUnits },
      ],
    }).compile();
    service = module.get<OrganizationService>(OrganizationService);
  });

  // ─── getDepartments ───────────────────────────────────────────────────────

  describe('getDepartments', () => {
    it('deve retornar departamentos paginados', async () => {
      mockPrisma.department.findMany.mockResolvedValue([{ id: 1, name: 'TI', code: 'TI' }]);
      mockPrisma.department.count.mockResolvedValue(1);

      const result = await service.getDepartments({ page: 1, limit: 20 });

      expect(result).toHaveProperty('data');
      expect(result).toHaveProperty('total');
    });

    it('deve filtrar por status e search', async () => {
      mockPrisma.department.findMany.mockResolvedValue([]);
      mockPrisma.department.count.mockResolvedValue(0);

      await service.getDepartments({ status: 'ACTIVE' as any, search: 'RH' });

      expect(mockPrisma.department.findMany).toHaveBeenCalled();
    });

    it('deve filtrar rootOnly', async () => {
      mockPrisma.department.findMany.mockResolvedValue([]);
      mockPrisma.department.count.mockResolvedValue(0);

      await service.getDepartments({ rootOnly: true });

      expect(mockPrisma.department.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ parentId: null }) }),
      );
    });
  });

  // ─── getPositions ─────────────────────────────────────────────────────────

  describe('getPositions', () => {
    it('deve retornar cargos paginados', async () => {
      mockPrisma.position.findMany.mockResolvedValue([
        { id: 1, name: 'Dev', headcountPlanned: 2, _count: { users: 1 } },
      ]);
      mockPrisma.position.count.mockResolvedValue(1);

      const result = await service.getPositions({});

      expect(result).toHaveProperty('data');
    });

    it('deve filtrar por departmentId e level', async () => {
      mockPrisma.position.findMany.mockResolvedValue([]);
      mockPrisma.position.count.mockResolvedValue(0);

      await service.getPositions({ departmentId: 1, level: 'MID' as any });

      expect(mockPrisma.position.findMany).toHaveBeenCalled();
    });
  });

  // ─── getUnits ─────────────────────────────────────────────────────────────

  describe('getUnits', () => {
    it('deve retornar unidades organizacionais', async () => {
      mockPrisma.unit.findMany.mockResolvedValue([{ id: 1, name: 'Unit A' }]);

      const result = await service.getUnits();
      expect(result).toBeDefined();
    });
  });

  // ─── createPosition ───────────────────────────────────────────────────────

  describe('createPosition', () => {
    it('deve criar cargo organizacional', async () => {
      mockPrisma.position.create.mockResolvedValue({ id: 1, name: 'Dev Senior', level: 3 });

      const result = await service.createPosition({
        name: 'Dev Senior',
        level: 3,
      } as any);
      expect(result).toBeDefined();
    });
  });

  // ─── getStats with empty data ─────────────────────────────────────────────

  describe('getStats edge cases', () => {
    it('deve calcular spanOfControl como 0 se sem gestores', async () => {
      mockPrisma.unit.count.mockResolvedValue(0);
      mockPrisma.department.count.mockResolvedValue(0);
      mockPrisma.position.count.mockResolvedValue(0);
      mockPrisma.user.count.mockResolvedValue(0);
      mockPrisma.position.findMany.mockResolvedValue([]);
      mockPrisma.user.findMany.mockResolvedValue([]); // no managers
      mockPrisma.department.findMany.mockResolvedValue([]);

      const result = await service.getStats();

      expect(result).toHaveProperty('kpis');
      expect(result.kpis.spanOfControl).toBe(0);
    });
  });

  // ─── Erros de CRUD — departamentos, posições e unidades ──────────────────
  // Cobertura anterior só exercitava os caminhos felizes; nenhum teste cobria
  // os ramos de excepção (409/400/404) das operações de escrita.

  describe('createDepartment — erros', () => {
    it('código duplicado (case-insensitive) → ConflictException', async () => {
      mockPrisma.department.findFirst = jest.fn().mockResolvedValue({ id: 1, code: 'TI' });
      await expect(
        service.createDepartment({ name: 'TI', code: 'ti' } as any),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(mockPrisma.department.create).not.toHaveBeenCalled();
    });

    it('parentId inexistente → NotFoundException', async () => {
      mockPrisma.department.findFirst = jest.fn().mockResolvedValue(null);
      mockPrisma.department.findUnique.mockResolvedValue(null);
      await expect(
        service.createDepartment({ name: 'TI', code: 'TI', parentId: 999 } as any),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(mockPrisma.department.create).not.toHaveBeenCalled();
    });
  });

  describe('updateDepartment — erros', () => {
    it('departamento inexistente → NotFoundException', async () => {
      mockPrisma.department.findUnique.mockResolvedValue(null);
      await expect(service.updateDepartment(1, {} as any)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('não pode ser pai de si próprio → BadRequestException', async () => {
      mockPrisma.department.findUnique.mockResolvedValue({ id: 1 });
      await expect(service.updateDepartment(1, { parentId: 1 } as any)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(mockPrisma.department.update).not.toHaveBeenCalled();
    });
  });

  describe('deleteDepartment — erros', () => {
    it('departamento inexistente → NotFoundException', async () => {
      mockPrisma.department.findUnique.mockResolvedValue(null);
      await expect(service.deleteDepartment(1)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('com colaboradores activos → BadRequestException (não elimina)', async () => {
      mockPrisma.department.findUnique.mockResolvedValue({
        id: 1,
        _count: { users: 3, children: 0 },
      });
      await expect(service.deleteDepartment(1)).rejects.toBeInstanceOf(BadRequestException);
      expect(mockPrisma.department.delete).not.toHaveBeenCalled();
    });

    it('com sub-departamentos → BadRequestException (não elimina)', async () => {
      mockPrisma.department.findUnique.mockResolvedValue({
        id: 1,
        _count: { users: 0, children: 2 },
      });
      await expect(service.deleteDepartment(1)).rejects.toBeInstanceOf(BadRequestException);
      expect(mockPrisma.department.delete).not.toHaveBeenCalled();
    });

    it('sem colaboradores nem sub-departamentos → elimina com sucesso', async () => {
      mockPrisma.department.findUnique.mockResolvedValue({
        id: 1,
        _count: { users: 0, children: 0 },
      });
      mockPrisma.department.delete = jest.fn().mockResolvedValue({});
      const result = await service.deleteDepartment(1);
      expect(mockPrisma.department.delete).toHaveBeenCalledWith({ where: { id: 1 } });
      expect(result).toHaveProperty('message');
    });
  });

  describe('createPosition — erros', () => {
    it('nome duplicado no mesmo departamento → ConflictException', async () => {
      mockPrisma.position.findFirst.mockResolvedValue({ id: 1 });
      await expect(
        service.createPosition({ name: 'Gestor', departmentId: 1 } as any),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(mockPrisma.position.create).not.toHaveBeenCalled();
    });

    it('mesmo nome em departamento diferente é permitido', async () => {
      mockPrisma.position.findFirst.mockResolvedValue(null);
      mockPrisma.position.create.mockResolvedValue({ id: 2 });
      await service.createPosition({ name: 'Gestor', departmentId: 2 } as any);
      expect(mockPrisma.position.create).toHaveBeenCalled();
    });
  });

  describe('updatePosition / deletePosition — erros', () => {
    it('actualizar posição inexistente → NotFoundException', async () => {
      mockPrisma.position.findUnique.mockResolvedValue(null);
      await expect(service.updatePosition(1, {} as any)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('eliminar posição inexistente → NotFoundException', async () => {
      mockPrisma.position.findUnique.mockResolvedValue(null);
      await expect(service.deletePosition(1)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('eliminar posição com colaboradores activos → BadRequestException', async () => {
      mockPrisma.position.findUnique.mockResolvedValue({ id: 1, _count: { users: 5 } });
      await expect(service.deletePosition(1)).rejects.toBeInstanceOf(BadRequestException);
      expect(mockPrisma.position.delete).not.toHaveBeenCalled();
    });

    it('eliminar posição sem colaboradores → elimina com sucesso', async () => {
      mockPrisma.position.findUnique.mockResolvedValue({ id: 1, _count: { users: 0 } });
      mockPrisma.position.delete.mockResolvedValue({});
      const result = await service.deletePosition(1);
      expect(result).toHaveProperty('message');
    });
  });

  describe('createUnit / updateUnit — erros', () => {
    it('código de unidade duplicado → ConflictException', async () => {
      mockPrisma.unit.findFirst = jest.fn().mockResolvedValue({ id: 1 });
      await expect(service.createUnit({ code: 'lda' } as any)).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(mockPrisma.unit.create).not.toHaveBeenCalled();
    });

    it('cria unidade com código normalizado para maiúsculas', async () => {
      mockPrisma.unit.findFirst = jest.fn().mockResolvedValue(null);
      mockPrisma.unit.create.mockResolvedValue({ id: 1 });
      await service.createUnit({ code: 'lda', name: 'Luanda' } as any);
      expect(mockPrisma.unit.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ code: 'LDA' }) }),
      );
    });

    it('actualizar unidade inexistente → NotFoundException', async () => {
      mockPrisma.unit.findUnique.mockResolvedValue(null);
      await expect(service.updateUnit(1, {} as any)).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
