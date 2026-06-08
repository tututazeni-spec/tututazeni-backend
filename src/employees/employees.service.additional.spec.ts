import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { EmployeesService } from './employees.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/services/audit.service';

const mockAudit = { log: jest.fn().mockResolvedValue({}) };

const mockPrisma: any = {
  employee: {
    findMany: jest.fn().mockResolvedValue([]),
    findUnique: jest.fn().mockResolvedValue(null),
    findFirst: jest.fn().mockResolvedValue(null),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    count: jest.fn().mockResolvedValue(0),
  },
  contract: { create: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
  feedback360: { create: jest.fn().mockResolvedValue({ id: 1 }) },
  employeeCareerPlan: { create: jest.fn().mockResolvedValue({ id: 1 }) },
  legacyPdi: {
    create: jest.fn().mockResolvedValue({ id: 1, actions: [] }),
    findMany: jest.fn().mockResolvedValue([]),
    findUnique: jest.fn().mockResolvedValue(null),
    update: jest.fn(),
  },
  employeeDocument: { create: jest.fn().mockResolvedValue({ id: 1 }) },
  employeeTimeline: {
    create: jest.fn().mockResolvedValue({ id: 1 }),
    findMany: jest.fn().mockResolvedValue([]),
  },
  selfServiceRequest: {
    create: jest.fn().mockResolvedValue({ id: 1, status: 'PENDING' }),
    findMany: jest.fn().mockResolvedValue([]),
    update: jest.fn(),
  },
  enrollment: { createMany: jest.fn().mockResolvedValue({ count: 0 }) },
  notificationLog: { create: jest.fn().mockResolvedValue({}) },
  auditLog: { create: jest.fn().mockResolvedValue({}) },
  user: { findMany: jest.fn().mockResolvedValue([]) },
};

const baseEmployee = {
  id: 1,
  name: 'João Silva',
  email: 'joao@innova.com',
  role: 'Developer',
  department: 'TI',
  status: 'ACTIVE',
  matricula: 'M001',
  joinedAt: new Date('2023-01-01'),
  manager: null,
  avatarUrl: null,
  _count: { contracts: 1, feedbacks: 0, careerPlans: 1, pdis: 1, documents: 2, employeeSkills: 3 },
};

describe('EmployeesService (additional)', () => {
  let service: EmployeesService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EmployeesService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AuditService, useValue: mockAudit },
      ],
    }).compile();
    service = module.get<EmployeesService>(EmployeesService);
  });

  // ─── findAll ──────────────────────────────────────────────────

  describe('findAll', () => {
    it('deve retornar colaboradores paginados', async () => {
      mockPrisma.employee.findMany.mockResolvedValue([baseEmployee]);
      mockPrisma.employee.count.mockResolvedValue(1);
      const result = await service.findAll({ page: 1, limit: 10 });
      expect(result.data).toHaveLength(1);
      expect(result.meta.total).toBe(1);
    });

    it('deve filtrar por search, role, department, status', async () => {
      mockPrisma.employee.findMany.mockResolvedValue([]);
      mockPrisma.employee.count.mockResolvedValue(0);
      await service.findAll({
        search: 'João',
        role: 'Developer',
        department: 'TI',
        status: 'ACTIVE' as any,
      });
      expect(mockPrisma.employee.findMany).toHaveBeenCalled();
    });

    it('deve filtrar por skillName e skillLevel', async () => {
      mockPrisma.employee.findMany.mockResolvedValue([]);
      mockPrisma.employee.count.mockResolvedValue(0);
      await service.findAll({ skillName: 'TypeScript', skillLevel: 3 });
      expect(mockPrisma.employee.findMany).toHaveBeenCalled();
    });
  });

  // ─── findOne ──────────────────────────────────────────────────

  describe('findOne', () => {
    it('deve retornar colaborador por id com detalhes completos', async () => {
      mockPrisma.employee.findUnique.mockResolvedValue(baseEmployee);
      const result = await service.findOne(1);
      expect(result).toBeDefined();
      expect(result.name).toBe('João Silva');
    });

    it('deve lançar NotFoundException se não encontrado', async () => {
      mockPrisma.employee.findUnique.mockResolvedValue(null);
      await expect(service.findOne(99)).rejects.toThrow(NotFoundException);
    });
  });

  // ─── create ───────────────────────────────────────────────────

  describe('create', () => {
    it('deve criar colaborador', async () => {
      mockPrisma.employee.findFirst.mockResolvedValue(null);
      mockPrisma.employee.create.mockResolvedValue(baseEmployee);
      const result = await service.create(
        { name: 'João', email: 'joao@innova.com', role: 'Developer', department: 'TI' } as any,
        1,
      );
      expect(result).toBeDefined();
      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'EMPLOYEE_CREATED' }),
      );
    });

    it('deve lançar ConflictException se email já existe', async () => {
      mockPrisma.employee.findUnique.mockResolvedValue(baseEmployee);
      await expect(service.create({ email: 'joao@innova.com' } as any, 1)).rejects.toThrow(
        ConflictException,
      );
    });
  });

  // ─── update ───────────────────────────────────────────────────

  describe('update', () => {
    it('deve actualizar colaborador', async () => {
      mockPrisma.employee.findUnique.mockResolvedValue(baseEmployee);
      mockPrisma.employee.update.mockResolvedValue({ ...baseEmployee, role: 'Senior Developer' });
      const result = await service.update(1, { role: 'Senior Developer' } as any, 1);
      expect(result).toBeDefined();
      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'EMPLOYEE_UPDATED' }),
      );
    });
  });

  // ─── createContract ───────────────────────────────────────────

  describe('createContract', () => {
    it('deve adicionar contrato ao colaborador', async () => {
      mockPrisma.employee.findUnique.mockResolvedValue(baseEmployee);
      mockPrisma.contract.create.mockResolvedValue({ id: 1, employeeId: 1 });
      const result = await service.createContract({
        employeeId: 1,
        type: 'PERMANENT' as any,
        startDate: '2023-01-01',
      } as any);
      expect(result).toBeDefined();
    });
  });

  // ─── addFeedback360 ───────────────────────────────────────────

  describe('addFeedback360', () => {
    it('deve adicionar feedback 360 ao colaborador', async () => {
      mockPrisma.employee.findUnique.mockResolvedValue(baseEmployee);
      const result = await service.addFeedback360({
        employeeId: 1,
        evaluatorId: 2,
        type: 'POSITIVE' as any,
        score: 8,
        evaluatedAt: '2026-01-01',
      } as any);
      expect(result).toBeDefined();
    });
  });

  // ─── createPdi ────────────────────────────────────────────────

  describe('createPdi', () => {
    it('deve criar PDI para colaborador', async () => {
      mockPrisma.employee.findUnique.mockResolvedValue(baseEmployee);
      const result = await service.createPdi(
        { employeeId: 1, name: 'PDI 2026', goal: 'Tornar-se Lead', status: 'ACTIVE' as any } as any,
        1,
      );
      expect(result).toBeDefined();
    });
  });

  // ─── createDocument ───────────────────────────────────────────

  describe('createDocument', () => {
    it('deve adicionar documento ao colaborador', async () => {
      mockPrisma.employee.findUnique.mockResolvedValue(baseEmployee);
      const result = await service.createDocument(
        {
          employeeId: 1,
          title: 'Contrato',
          type: 'CONTRACT' as any,
          fileUrl: '/docs/contrato.pdf',
        } as any,
        1,
      );
      expect(result).toBeDefined();
    });
  });

  // ─── addTimelineEvent ─────────────────────────────────────────

  describe('addTimelineEvent', () => {
    it('deve adicionar evento à timeline do colaborador', async () => {
      mockPrisma.employee.findUnique.mockResolvedValue(baseEmployee);
      const result = await service.addTimelineEvent({
        employeeId: 1,
        type: 'PROMOTION' as any,
        title: 'Promoção a Senior',
        date: '2026-01-01',
      } as any);
      expect(result).toBeDefined();
    });
  });

  // ─── bulkAssignCourses ─────────────────────────────────────────

  describe('bulkAssignCourses', () => {
    it('deve inscrever múltiplos colaboradores num curso', async () => {
      mockPrisma.user.findMany.mockResolvedValue([{ id: 1 }, { id: 2 }]);
      mockPrisma.enrollment.createMany.mockResolvedValue({ count: 2 });
      const result = await service.bulkAssignCourses(
        { courseIds: [1, 2], employeeIds: [1, 2] } as any,
        1,
      );
      expect(result).toBeDefined();
    });
  });
});
