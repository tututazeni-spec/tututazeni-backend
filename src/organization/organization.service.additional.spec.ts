import { Test, TestingModule } from '@nestjs/testing';
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

  // ─── Escrita consolidada (Fase C): delegação nos serviços canónicos ──────
  // As validações de erro (409/400/404) passaram a viver nos serviços de
  // `departments` e estão cobertas em departments.service.*.spec.ts. Aqui só
  // se verifica que OrganizationService encaminha a chamada tal e qual.

  describe('createDepartment', () => {
    it('delega em DepartmentsService.create com o DTO recebido', async () => {
      mockDepartments.create.mockResolvedValue({ id: 1, code: 'ENG' });
      const dto = { name: 'Eng', code: 'eng', unitId: 4, annualBudget: 1000, status: 'ACTIVE' };
      const res = await service.createDepartment(dto as any);
      expect(mockDepartments.create).toHaveBeenCalledWith(dto);
      expect(res).toEqual({ id: 1, code: 'ENG' });
    });
  });

  describe('updateDepartment', () => {
    it('delega em DepartmentsService.update(id, dto)', async () => {
      mockDepartments.update.mockResolvedValue({ id: 5 });
      const dto = { name: 'Novo Nome', status: 'INACTIVE' };
      await service.updateDepartment(5, dto as any);
      expect(mockDepartments.update).toHaveBeenCalledWith(5, dto);
    });
  });

  describe('deleteDepartment', () => {
    it('delega em DepartmentsService.remove(id)', async () => {
      mockDepartments.remove.mockResolvedValue({ message: 'Departamento eliminado' });
      const res = await service.deleteDepartment(5);
      expect(mockDepartments.remove).toHaveBeenCalledWith(5);
      expect(res).toEqual({ message: 'Departamento eliminado' });
    });
  });

  describe('createPosition', () => {
    it('delega em PositionsService.create', async () => {
      mockPositions.create.mockResolvedValue({ id: 2 });
      const dto = { name: 'Analista', departmentId: 3, headcountPlanned: 2 };
      await service.createPosition(dto as any);
      expect(mockPositions.create).toHaveBeenCalledWith(dto);
    });
  });

  describe('updatePosition', () => {
    it('delega em PositionsService.update(id, dto)', async () => {
      mockPositions.update.mockResolvedValue({ id: 1 });
      const dto = { name: 'X', competencyIds: [1, 2] };
      await service.updatePosition(1, dto as any);
      expect(mockPositions.update).toHaveBeenCalledWith(1, dto);
    });
  });

  describe('deletePosition', () => {
    it('delega em PositionsService.remove(id)', async () => {
      mockPositions.remove.mockResolvedValue({ message: 'Posição eliminada' });
      const res = await service.deletePosition(9);
      expect(mockPositions.remove).toHaveBeenCalledWith(9);
      expect(res).toEqual({ message: 'Posição eliminada' });
    });
  });

  describe('createUnit', () => {
    it('delega em UnitsService.create', async () => {
      mockUnits.create.mockResolvedValue({ id: 3, code: 'FN' });
      const dto = { name: 'Filial Norte', type: 'BRANCH', code: 'fn' };
      await service.createUnit(dto as any);
      expect(mockUnits.create).toHaveBeenCalledWith(dto);
    });
  });

  describe('updateUnit', () => {
    it('delega em UnitsService.update(id, dto)', async () => {
      mockUnits.update.mockResolvedValue({ id: 3 });
      const dto = { name: 'Filial Sul' };
      await service.updateUnit(3, dto as any);
      expect(mockUnits.update).toHaveBeenCalledWith(3, dto);
    });
  });
});
