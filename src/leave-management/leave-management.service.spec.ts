import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ConflictException } from '@nestjs/common';
import { LeaveManagementService } from './leave-management.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/services/audit.service';
import { LeaveStatus } from './leave-management.dto';

const leaveTypeConfig = {
  findUnique: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
  findMany: jest.fn(),
};
const leavePolicy = {
  create: jest.fn(),
  findMany: jest.fn(),
  findFirst: jest.fn(),
};
const leaveBalance = {
  findFirst: jest.fn(),
  upsert: jest.fn(),
  findMany: jest.fn(),
  update: jest.fn(),
  create: jest.fn(),
};
const leaveApproval = {
  create: jest.fn(),
  findFirst: jest.fn(),
  update: jest.fn(),
  updateMany: jest.fn(),
  findMany: jest.fn(),
};

const mockPrisma = {
  leaveRequest: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    count: jest.fn(),
    updateMany: jest.fn(),
  },
  user: { findUnique: jest.fn(), findMany: jest.fn() },
  notificationLog: { create: jest.fn().mockResolvedValue({}) },
  auditLog: { create: jest.fn().mockResolvedValue({}) },
};

const mockPrismaProxy = new Proxy(mockPrisma, {
  get(target, prop) {
    if (prop === 'leaveTypeConfig') return leaveTypeConfig;
    if (prop === 'leavePolicy') return leavePolicy;
    if (prop === 'leaveBalance') return leaveBalance;
    if (prop === 'leaveApproval') return leaveApproval;
    return (target as any)[prop];
  },
});

const mockAudit = { log: jest.fn().mockResolvedValue({}) };

const baseLeaveRequest = {
  id: 1,
  userId: 1,
  leaveTypeCode: 'ANNUAL',
  startDate: new Date('2024-07-01'),
  endDate: new Date('2024-07-05'),
  totalDays: 5,
  status: LeaveStatus.PENDING,
  user: { id: 1, fullName: 'Test User', email: 'test@innova.com' },
  approvals: [],
  documents: [],
  impactPreview: null,
};

describe('LeaveManagementService', () => {
  let service: LeaveManagementService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LeaveManagementService,
        { provide: PrismaService, useValue: mockPrismaProxy },
        { provide: AuditService, useValue: mockAudit },
      ],
    }).compile();
    service = module.get<LeaveManagementService>(LeaveManagementService);
  });

  // ─── createLeaveType ──────────────────────────────────────────────────────

  describe('createLeaveType', () => {
    it('deve criar tipo de licença', async () => {
      leaveTypeConfig.findUnique.mockResolvedValue(null);
      leaveTypeConfig.create.mockResolvedValue({ code: 'ANNUAL', name: 'Férias Anuais' });

      const result = await service.createLeaveType({
        code: 'ANNUAL',
        name: 'Férias Anuais',
      } as any);
      expect((result as any).code).toBe('ANNUAL');
    });

    it('deve lançar ConflictException se código duplicado', async () => {
      leaveTypeConfig.findUnique.mockResolvedValue({ code: 'ANNUAL' });
      await expect(service.createLeaveType({ code: 'ANNUAL' } as any)).rejects.toThrow(
        ConflictException,
      );
    });
  });

  // ─── getLeaveTypes ────────────────────────────────────────────────────────

  describe('getLeaveTypes', () => {
    it('deve retornar tipos activos por defeito', async () => {
      leaveTypeConfig.findMany.mockResolvedValue([{ code: 'ANNUAL', name: 'Férias' }]);
      const result = await service.getLeaveTypes();
      expect(result).toHaveLength(1);
    });
  });

  // ─── updateLeaveType ──────────────────────────────────────────────────────

  describe('updateLeaveType', () => {
    it('deve actualizar tipo de licença', async () => {
      leaveTypeConfig.findUnique.mockResolvedValue({ code: 'ANNUAL' });
      leaveTypeConfig.update.mockResolvedValue({ code: 'ANNUAL', name: 'Actualizado' });
      const result = await service.updateLeaveType('ANNUAL', { name: 'Actualizado' } as any);
      expect((result as any).name).toBe('Actualizado');
    });

    it('deve lançar NotFoundException se não encontrado', async () => {
      leaveTypeConfig.findUnique.mockResolvedValue(null);
      await expect(service.updateLeaveType('INVALID', {} as any)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ─── findAll ──────────────────────────────────────────────────────────────

  describe('findAll', () => {
    it('deve retornar pedidos paginados', async () => {
      mockPrisma.leaveRequest.findMany.mockResolvedValue([baseLeaveRequest]);
      mockPrisma.leaveRequest.count.mockResolvedValue(1);

      const result = await service.findAll({ page: 1, limit: 20 });

      expect(result.data).toHaveLength(1);
      expect(result.meta.total).toBe(1);
    });

    it('deve filtrar por status', async () => {
      mockPrisma.leaveRequest.findMany.mockResolvedValue([]);
      mockPrisma.leaveRequest.count.mockResolvedValue(0);

      await service.findAll({ status: LeaveStatus.PENDING });

      expect(mockPrisma.leaveRequest.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ status: LeaveStatus.PENDING }),
        }),
      );
    });
  });

  // ─── findOne ──────────────────────────────────────────────────────────────

  describe('findOne', () => {
    it('deve retornar pedido por id', async () => {
      mockPrisma.leaveRequest.findUnique.mockResolvedValue(baseLeaveRequest);
      const result = await service.findOne(1);
      expect(result.id).toBe(1);
    });

    it('deve lançar NotFoundException se não encontrado', async () => {
      mockPrisma.leaveRequest.findUnique.mockResolvedValue(null);
      await expect(service.findOne(99)).rejects.toThrow(NotFoundException);
    });
  });

  // ─── getPendingApprovals ──────────────────────────────────────────────────

  describe('getPendingApprovals', () => {
    it('deve retornar pedidos pendentes', async () => {
      mockPrisma.leaveRequest.findMany.mockResolvedValue([baseLeaveRequest]);
      const result = await service.getPendingApprovals(1);
      expect(result).toHaveLength(1);
    });
  });
});
