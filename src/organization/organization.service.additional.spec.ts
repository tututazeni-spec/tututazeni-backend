import { Test, TestingModule } from '@nestjs/testing';
import { OrganizationService } from './organization.service';
import { PrismaService } from '../prisma/prisma.service';

const makeCount = (n = 0) => jest.fn().mockResolvedValue(n);
const makeFindMany = (data: any[] = []) => jest.fn().mockResolvedValue(data);

const mockPrisma = {
  unit: {
    count: makeCount(5),
    findMany: makeFindMany([]),
    findUnique: jest.fn().mockResolvedValue(null),
    create: jest.fn().mockResolvedValue({ id: 1, name: 'Unit A', code: 'UA001' }),
    update: jest.fn().mockResolvedValue({}),
    delete: jest.fn().mockResolvedValue({}),
  },
  department: {
    count: makeCount(10),
    findMany: makeFindMany([]),
    findUnique: jest.fn().mockResolvedValue(null),
    create: jest.fn().mockResolvedValue({ id: 1, name: 'Dept A' }),
    update: jest.fn().mockResolvedValue({}),
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

    const module: TestingModule = await Test.createTestingModule({
      providers: [OrganizationService, { provide: PrismaService, useValue: mockPrisma }],
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
});
