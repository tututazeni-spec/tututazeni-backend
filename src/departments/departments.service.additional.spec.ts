import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { DepartmentsService } from './departments.service';
import { PrismaService } from '../prisma/prisma.service';

const makeFind = (val: any = null) => jest.fn().mockResolvedValue(val);
const makeFindMany = (data: any[] = []) => jest.fn().mockResolvedValue(data);
const makeCount = (n = 0) => jest.fn().mockResolvedValue(n);

const baseDept = {
  id: 1,
  name: 'TI',
  code: 'TI',
  active: true,
  parentId: null,
  headId: null,
  head: null,
  parent: null,
  children: [],
  users: [],
  headHistory: [],
  _count: { users: 0, children: 0 },
};

const mockPrisma = {
  department: {
    findUnique: makeFind(baseDept),
    findFirst: makeFind(null),
    findMany: makeFindMany([baseDept]),
    create: makeFind(baseDept),
    update: makeFind(baseDept),
    count: makeCount(1),
    delete: makeFind({}),
    updateMany: makeFind({ count: 0 }),
  },
  user: {
    findMany: makeFindMany([]),
    update: makeFind({}),
    updateMany: makeFind({ count: 0 }),
    findUnique: makeFind({ id: 1, departmentId: 2, fullName: 'Test', active: true }),
    count: makeCount(0),
  },
  unit: {
    findUnique: makeFind(null),
    findFirst: makeFind(null),
    findMany: makeFindMany([]),
    create: makeFind({ id: 1, name: 'Unit A' }),
    update: makeFind({}),
    count: makeCount(0),
    delete: makeFind({}),
  },
  role: {
    findUnique: makeFind(null),
    findFirst: makeFind(null),
    findMany: makeFindMany([]),
    create: makeFind({ id: 1, code: 'ROLE_TEST', name: 'Test Role' }),
    update: makeFind({}),
    delete: makeFind({}),
  },
  permission: {
    findMany: makeFindMany([]),
    findFirst: makeFind(null),
    create: makeFind({ id: 1 }),
    delete: makeFind({}),
  },
  rolePermission: { create: makeFind({}), deleteMany: makeFind({ count: 0 }) },
  position: {
    findUnique: makeFind(null),
    findFirst: makeFind(null),
    findMany: makeFindMany([]),
    create: makeFind({ id: 1 }),
    update: makeFind({}),
    delete: makeFind({}),
    count: makeCount(0),
  },
  careerPosition: { create: makeFind({}), findMany: makeFindMany([]) },
  auditLog: { create: makeFind({}) },
  departmentTransferLog: {
    create: makeFind({}),
    findMany: makeFindMany([]),
    count: makeCount(0),
  },
  departmentHeadHistory: { create: makeFind({}), updateMany: makeFind({ count: 0 }) },
};

describe('DepartmentsService — additional coverage', () => {
  let service: DepartmentsService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [DepartmentsService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();
    service = module.get<DepartmentsService>(DepartmentsService);
  });

  // ─── update ───────────────────────────────────────────────────────────────

  describe('update', () => {
    it('deve actualizar departamento com sucesso', async () => {
      mockPrisma.department.findUnique.mockResolvedValue(baseDept);
      mockPrisma.department.findFirst.mockResolvedValue(null);
      mockPrisma.department.update.mockResolvedValue({ ...baseDept, name: 'Updated' });

      const result = await service.update(1, { name: 'Updated' } as any);
      expect(result).toBeDefined();
    });

    it('deve lançar ConflictException se código duplicado', async () => {
      mockPrisma.department.findUnique.mockResolvedValue(baseDept);
      mockPrisma.department.findFirst.mockResolvedValue({ id: 2, code: 'RH' });

      await expect(service.update(1, { code: 'RH' } as any)).rejects.toThrow(ConflictException);
    });

    it('deve lançar NotFoundException se não encontrado', async () => {
      mockPrisma.department.findUnique.mockResolvedValue(null);
      await expect(service.update(99, {} as any)).rejects.toThrow(NotFoundException);
    });

    it('deve registar histórico ao mudar headId', async () => {
      mockPrisma.department.findUnique.mockResolvedValue({ ...baseDept, headId: null });
      mockPrisma.department.findFirst.mockResolvedValue(null);
      mockPrisma.department.update.mockResolvedValue({ ...baseDept, headId: 5 });

      await service.update(1, { headId: 5 } as any);

      expect(mockPrisma.departmentHeadHistory.create).toHaveBeenCalled();
    });
  });

  // ─── deactivate ───────────────────────────────────────────────────────────

  describe('deactivate', () => {
    it('deve desactivar departamento sem colaboradores', async () => {
      mockPrisma.department.findUnique.mockResolvedValue({
        ...baseDept,
        _count: { users: 0, children: 0 },
      });
      mockPrisma.department.update.mockResolvedValue({ ...baseDept, active: false });

      const result = await service.deactivate(1);
      expect(result).toBeDefined();
    });

    it('deve lançar BadRequestException se tem colaboradores activos', async () => {
      mockPrisma.department.findUnique.mockResolvedValue({
        ...baseDept,
        _count: { users: 5, children: 0 },
      });

      await expect(service.deactivate(1)).rejects.toThrow(BadRequestException);
    });
  });

  // ─── activate ─────────────────────────────────────────────────────────────

  describe('activate', () => {
    it('deve activar departamento', async () => {
      mockPrisma.department.findUnique.mockResolvedValue({ ...baseDept, active: false });
      mockPrisma.department.update.mockResolvedValue({ ...baseDept, active: true });

      const result = await service.activate(1);
      expect(result).toBeDefined();
    });
  });

  // ─── transferMember ───────────────────────────────────────────────────────

  describe('transferMember', () => {
    it('deve transferir membro entre departamentos', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ id: 1, departmentId: 1, fullName: 'User' });
      mockPrisma.department.findUnique.mockResolvedValue({ id: 2, active: true, name: 'RH' });
      mockPrisma.user.update.mockResolvedValue({});
      mockPrisma.departmentTransferLog.create.mockResolvedValue({});

      const result = await service.transferMember({
        userId: 1,
        targetDepartmentId: 2,
        reason: 'Reorganização',
      } as any);

      expect(result).toHaveProperty('message');
    });

    it('deve lançar NotFoundException se utilizador não encontrado', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      await expect(
        service.transferMember({ userId: 99, targetDepartmentId: 2 } as any),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ─── getComparativeDashboard ──────────────────────────────────────────────

  describe('getComparativeDashboard', () => {
    it('deve retornar dashboard comparativo de departamentos', async () => {
      mockPrisma.department.findMany.mockResolvedValue([
        { id: 1, name: 'TI', code: 'TI', active: true, head: { fullName: 'Gestor' }, _count: { users: 10 } },
      ]);

      const result = await service.getComparativeDashboard();

      expect(Array.isArray(result)).toBe(true);
      expect(result[0]).toHaveProperty('totalMembers');
    });
  });

  // ─── getTransferHistory ───────────────────────────────────────────────────

  describe('getTransferHistory', () => {
    it('deve retornar histórico de transferências', async () => {
      mockPrisma.departmentTransferLog.findMany.mockResolvedValue([]);
      mockPrisma.departmentTransferLog.count.mockResolvedValue(0);

      const result = await service.getTransferHistory(1);

      expect(result).toHaveProperty('data');
      expect(result).toHaveProperty('total');
    });
  });
});
