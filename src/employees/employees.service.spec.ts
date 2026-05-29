import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ConflictException } from '@nestjs/common';
import { EmployeesService } from './employees.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/services/audit.service';

const mockPrisma = {
  employee: {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    count: jest.fn(),
    delete: jest.fn(),
  },
  contract: { create: jest.fn(), findMany: jest.fn(), findUnique: jest.fn() },
  employeeSkill: { upsert: jest.fn(), findMany: jest.fn() },
  feedback360: { create: jest.fn(), findMany: jest.fn() },
  employeeCareerPlan: { create: jest.fn(), findMany: jest.fn() },
  employeePdi: { create: jest.fn(), findUnique: jest.fn(), update: jest.fn(), findMany: jest.fn() },
  pdiAction: { updateMany: jest.fn() },
  employeeDocument: { create: jest.fn(), findMany: jest.fn() },
  employeeTimeline: { create: jest.fn() },
  selfServiceRequest: {
    create: jest.fn(),
    findMany: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
  },
  notificationLog: { create: jest.fn().mockResolvedValue({}) },
  auditLog: { create: jest.fn().mockResolvedValue({}) },
};

const mockAudit = { log: jest.fn().mockResolvedValue({}) };

const baseEmployee = {
  id: 1,
  name: 'João Silva',
  email: 'joao@innova.com',
  matricula: 'EMP001',
  status: 'ACTIVE',
  role: 'Developer',
  department: 'TI',
  manager: null,
  subordinates: [],
  contracts: [],
  evaluations: [],
  feedbacks: [],
  careerPlans: [],
  pdis: [],
  attendances: [],
  documents: [],
  employeeSkills: [],
  timeline: [],
  _count: { contracts: 0, feedbacks: 0, careerPlans: 0, pdis: 0, documents: 0, employeeSkills: 0 },
};

describe('EmployeesService', () => {
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

  describe('findAll', () => {
    it('deve retornar colaboradores paginados', async () => {
      mockPrisma.employee.findMany.mockResolvedValue([baseEmployee]);
      mockPrisma.employee.count.mockResolvedValue(1);

      const result = await service.findAll({ page: 1, limit: 20 });

      expect(result.data).toHaveLength(1);
      expect(result.meta.total).toBe(1);
    });

    it('deve filtrar por search', async () => {
      mockPrisma.employee.findMany.mockResolvedValue([]);
      mockPrisma.employee.count.mockResolvedValue(0);

      await service.findAll({ search: 'João' });

      expect(mockPrisma.employee.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ OR: expect.any(Array) }),
        }),
      );
    });
  });

  describe('findOne', () => {
    it('deve retornar colaborador por id', async () => {
      mockPrisma.employee.findUnique.mockResolvedValue(baseEmployee);
      const result = await service.findOne(1);
      expect(result.name).toBe('João Silva');
    });

    it('deve registar acesso se requesterId diferente', async () => {
      mockPrisma.employee.findUnique.mockResolvedValue(baseEmployee);
      await service.findOne(1, 2);
      expect(mockAudit.log).toHaveBeenCalled();
    });

    it('deve lançar NotFoundException se não encontrado', async () => {
      mockPrisma.employee.findUnique.mockResolvedValue(null);
      await expect(service.findOne(99)).rejects.toThrow(NotFoundException);
    });
  });

  describe('create', () => {
    it('deve criar colaborador', async () => {
      mockPrisma.employee.findUnique.mockResolvedValue(null);
      mockPrisma.employee.findFirst.mockResolvedValue({ matricula: 'EMP010' });
      mockPrisma.employee.count.mockResolvedValue(10);
      mockPrisma.employee.create.mockResolvedValue(baseEmployee);

      const result = await service.create(
        {
          name: 'João',
          email: 'joao@innova.com',
          joinedAt: '2024-01-01',
          role: 'Dev',
          department: 'TI',
        } as any,
        1,
      );

      expect(result.name).toBe('João Silva');
    });

    it('deve lançar ConflictException se email duplicado', async () => {
      mockPrisma.employee.findUnique.mockResolvedValue(baseEmployee);
      await expect(
        service.create({ name: 'X', email: 'joao@innova.com', joinedAt: '2024-01-01' } as any, 1),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('update', () => {
    it('deve actualizar colaborador', async () => {
      mockPrisma.employee.findUnique.mockResolvedValue(baseEmployee);
      mockPrisma.employee.update.mockResolvedValue({ ...baseEmployee, name: 'Actualizado' });

      const result = await service.update(1, { name: 'Actualizado' } as any, 1);
      expect((result as any).name).toBe('Actualizado');
    });

    it('deve lançar NotFoundException se não encontrado', async () => {
      mockPrisma.employee.findUnique.mockResolvedValue(null);
      await expect(service.update(99, {} as any, 1)).rejects.toThrow(NotFoundException);
    });
  });
});
