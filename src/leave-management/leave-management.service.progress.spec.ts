// src/leave-management/leave-management.service.progress.spec.ts
// Cobre métodos não testados: createPolicy, processApproval (APPROVE/REJECT),
// bulkApprove, updateBalance, accrueBalance, initializeUserBalances,
// processCarryOver, getBalanceHistory, getConflictCheck

import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { LeaveManagementService } from './leave-management.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/services/audit.service';

// ─── Proxy pattern (igual ao spec base) ────────────────────────────────────────

const leaveTypeConfig = {
  findUnique: jest.fn().mockResolvedValue(null),
  create: jest.fn().mockResolvedValue({}),
  update: jest.fn().mockResolvedValue({}),
  findMany: jest.fn().mockResolvedValue([]),
};
const leavePolicy = {
  create: jest.fn().mockResolvedValue({ id: 1 }),
  findMany: jest.fn().mockResolvedValue([]),
  findFirst: jest.fn().mockResolvedValue(null),
};
const leaveBalance = {
  findFirst: jest.fn().mockResolvedValue(null),
  findUnique: jest.fn().mockResolvedValue(null),
  upsert: jest.fn().mockResolvedValue({ id: 1, balance: 10 }),
  findMany: jest.fn().mockResolvedValue([]),
  update: jest.fn().mockResolvedValue({}),
  create: jest.fn().mockResolvedValue({}),
  createMany: jest.fn().mockResolvedValue({ count: 0 }),
};
const leaveApproval = {
  create: jest.fn().mockResolvedValue({ id: 1 }),
  findFirst: jest.fn().mockResolvedValue(null),
  update: jest.fn().mockResolvedValue({}),
  updateMany: jest.fn().mockResolvedValue({}),
  findMany: jest.fn().mockResolvedValue([]),
  count: jest.fn().mockResolvedValue(0),
};

const mockPrismaBase: any = {
  leaveRequest: {
    findUnique: jest.fn().mockResolvedValue(null),
    findMany: jest.fn().mockResolvedValue([]),
    findFirst: jest.fn().mockResolvedValue(null),
    create: jest.fn().mockResolvedValue({}),
    update: jest.fn().mockResolvedValue({}),
    count: jest.fn().mockResolvedValue(0),
    updateMany: jest.fn().mockResolvedValue({}),
  },
  user: {
    findUnique: jest.fn().mockResolvedValue(null),
    findMany: jest.fn().mockResolvedValue([]),
    count: jest.fn().mockResolvedValue(0),
  },
  notificationLog: {
    create: jest.fn().mockResolvedValue({}),
  },
  auditLog: {
    create: jest.fn().mockResolvedValue({}),
  },
  leaveBalanceHistory: {
    create: jest.fn().mockResolvedValue({}),
    findMany: jest.fn().mockResolvedValue([]),
  },
};

const mockPrismaProxy: any = new Proxy(mockPrismaBase, {
  get(target, prop) {
      if (prop === 'db') return mockPrismaProxy;
    if (prop === 'leaveTypeConfig') return leaveTypeConfig;
    if (prop === 'leavePolicy') return leavePolicy;
    if (prop === 'leaveBalance') return leaveBalance;
    if (prop === 'leaveApproval') return leaveApproval;
    return (target as any)[prop];
  },
});

const mockAudit = { log: jest.fn().mockResolvedValue({}) };

// ─── Helpers ──────────────────────────────────────────────────────────────────

const pendingRequest = {
  id: 1,
  userId: 10,
  status: 'PENDING',
  workDays: 3,
  leaveTypeCode: 'ANNUAL',
  durationMode: 'FULL_DAY',
  startDate: new Date('2026-07-01'),
  endDate: new Date('2026-07-03'),
  approvals: [],
};

describe('LeaveManagementService (progress)', () => {
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

  // ─── createPolicy ──────────────────────────────────────────────────────────

  describe('createPolicy', () => {
    it('deve criar política de licença', async () => {
      leavePolicy.create.mockResolvedValue({ id: 5, name: 'Política ANNUAL' });
      const result = await service.createPolicy({
        name: 'Política ANNUAL',
        leaveTypeCode: 'ANNUAL',
        maxDaysPerYear: 22,
      } as any);
      expect(result).toBeDefined();
      expect(leavePolicy.create).toHaveBeenCalled();
    });
  });

  // ─── processApproval ───────────────────────────────────────────────────────

  describe('processApproval', () => {
    it('deve rejeitar pedido não pendente (BadRequestException)', async () => {
      mockPrismaBase.leaveRequest.findUnique.mockResolvedValue({
        ...pendingRequest,
        status: 'APPROVED',
      });
      await expect(service.processApproval(1, 99, { action: 'APPROVE' } as any)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('deve lançar ForbiddenException se aprovador não tem aprovação pendente', async () => {
      mockPrismaBase.leaveRequest.findUnique.mockResolvedValue(pendingRequest);
      leaveApproval.findFirst.mockResolvedValue(null);
      await expect(service.processApproval(1, 99, { action: 'APPROVE' } as any)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('deve processar REJECT — actualiza status e notifica', async () => {
      mockPrismaBase.leaveRequest.findUnique
        .mockResolvedValueOnce(pendingRequest) // primeira chamada findOne
        .mockResolvedValueOnce(pendingRequest); // segunda chamada findOne no return
      leaveApproval.findFirst.mockResolvedValue({ id: 7, level: 1 });
      leaveApproval.update.mockResolvedValue({});
      mockPrismaBase.leaveRequest.update.mockResolvedValue({});

      await service.processApproval(1, 5, { action: 'REJECT', notes: 'Sem fundos' } as any);

      expect(leaveApproval.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 7 } }),
      );
      expect(mockPrismaBase.leaveRequest.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 1 },
          data: expect.objectContaining({ status: 'REJECTED' }),
        }),
      );
      expect(mockAudit.log).toHaveBeenCalled();
    });

    it('deve processar APPROVE com todos os níveis aprovados — deduz saldo', async () => {
      mockPrismaBase.leaveRequest.findUnique
        .mockResolvedValueOnce(pendingRequest)
        .mockResolvedValueOnce(pendingRequest);
      leaveApproval.findFirst.mockResolvedValue({ id: 8, level: 1 });
      leaveApproval.update.mockResolvedValue({});
      leaveApproval.count.mockResolvedValue(0); // todos os níveis aprovaram
      leaveBalance.findUnique.mockResolvedValue({ balance: 20 });
      leaveBalance.upsert.mockResolvedValue({ balance: 17 });
      mockPrismaBase.leaveBalanceHistory.create.mockResolvedValue({});
      mockPrismaBase.leaveRequest.update.mockResolvedValue({});

      await service.processApproval(1, 5, { action: 'APPROVE' } as any);

      expect(leaveBalance.upsert).toHaveBeenCalled();
      expect(mockPrismaBase.leaveBalanceHistory.create).toHaveBeenCalled();
      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'LEAVE_APPROVED' }),
      );
    });

    it('deve processar APPROVE com aprovações restantes — não altera status final', async () => {
      mockPrismaBase.leaveRequest.findUnique
        .mockResolvedValueOnce(pendingRequest)
        .mockResolvedValueOnce(pendingRequest);
      leaveApproval.findFirst.mockResolvedValue({ id: 9, level: 1 });
      leaveApproval.update.mockResolvedValue({});
      leaveApproval.count.mockResolvedValue(2); // ainda há aprovações pendentes

      await service.processApproval(1, 5, { action: 'APPROVE' } as any);

      expect(leaveBalance.upsert).not.toHaveBeenCalled();
      expect(mockAudit.log).not.toHaveBeenCalled();
    });
  });

  // ─── bulkApprove ───────────────────────────────────────────────────────────

  describe('bulkApprove', () => {
    it('deve processar múltiplos pedidos em simultâneo', async () => {
      // All requests fail (not found) → all rejected
      mockPrismaBase.leaveRequest.findUnique.mockResolvedValue(null);

      const result = await service.bulkApprove(
        { requestIds: [1, 2, 3], action: 'APPROVE' } as any,
        5,
      );

      expect(result.total).toBe(3);
      expect(result.success + result.failed).toBe(3);
    });

    it('deve contabilizar sucessos e falhas', async () => {
      // Request 10 → PENDING → processApproval fails (no approval found)
      mockPrismaBase.leaveRequest.findUnique.mockResolvedValue({ ...pendingRequest, id: 10 });
      leaveApproval.findFirst.mockResolvedValue(null); // ForbiddenException

      const result = await service.bulkApprove(
        { requestIds: [10, 11], action: 'REJECT', notes: 'Bulk reject' } as any,
        9,
      );

      expect(result.failed).toBeGreaterThan(0);
      expect(result.total).toBe(2);
    });
  });

  // ─── updateBalance ─────────────────────────────────────────────────────────

  describe('updateBalance', () => {
    it('deve lançar NotFoundException se tipo de licença não existe', async () => {
      leaveTypeConfig.findUnique.mockResolvedValue(null);
      await expect(
        service.updateBalance(10, { leaveTypeCode: 'INVALID', balance: 5 } as any, 1),
      ).rejects.toThrow(NotFoundException);
    });

    it('deve actualizar saldo e criar histórico', async () => {
      leaveTypeConfig.findUnique.mockResolvedValue({ code: 'ANNUAL', name: 'Férias' });
      leaveBalance.upsert.mockResolvedValue({ id: 1, balance: 22 });
      mockPrismaBase.leaveBalanceHistory.create.mockResolvedValue({});

      const result = await service.updateBalance(
        10,
        { leaveTypeCode: 'ANNUAL', balance: 22, reason: 'Actualização anual' } as any,
        1,
      );

      expect(leaveBalance.upsert).toHaveBeenCalled();
      expect(mockPrismaBase.leaveBalanceHistory.create).toHaveBeenCalled();
      expect(result).toBeDefined();
    });
  });

  // ─── accrueBalance ─────────────────────────────────────────────────────────

  describe('accrueBalance', () => {
    it('deve acumular saldo para múltiplos utilizadores', async () => {
      leaveBalance.upsert.mockResolvedValue({});

      const result = await service.accrueBalance(
        { userIds: [1, 2, 3], leaveTypeCode: 'ANNUAL', days: 2 } as any,
        99,
      );

      expect(result.total).toBe(3);
      expect(leaveBalance.upsert).toHaveBeenCalledTimes(3);
    });

    it('deve retornar accrued=0 se lista vazia', async () => {
      const result = await service.accrueBalance(
        { userIds: [], leaveTypeCode: 'ANNUAL', days: 1 } as any,
        99,
      );
      expect(result.total).toBe(0);
      expect(result.accrued).toBe(0);
    });
  });

  // ─── initializeUserBalances ────────────────────────────────────────────────

  describe('initializeUserBalances', () => {
    it('deve inicializar saldos para todos os tipos activos', async () => {
      leaveTypeConfig.findMany.mockResolvedValue([
        { code: 'ANNUAL', annualLimit: 22 },
        { code: 'SICK', annualLimit: 10 },
      ]);
      leaveBalance.createMany.mockResolvedValue({ count: 2 });

      await service.initializeUserBalances(7);

      expect(leaveBalance.createMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skipDuplicates: true,
          data: expect.arrayContaining([
            expect.objectContaining({ userId: 7, leaveTypeCode: 'ANNUAL', balance: 22 }),
          ]),
        }),
      );
    });

    it('deve criar 0 saldos se nenhum tipo activo', async () => {
      leaveTypeConfig.findMany.mockResolvedValue([]);
      leaveBalance.createMany.mockResolvedValue({ count: 0 });

      await service.initializeUserBalances(8);

      expect(leaveBalance.createMany).toHaveBeenCalledWith(
        expect.objectContaining({ data: [], skipDuplicates: true }),
      );
    });
  });

  // ─── processCarryOver ──────────────────────────────────────────────────────

  describe('processCarryOver', () => {
    it('deve processar carry-over para tipos com allowCarryOver=true', async () => {
      leaveTypeConfig.findMany.mockResolvedValue([
        { code: 'ANNUAL', annualLimit: 22, carryOverLimit: 5, allowCarryOver: true },
      ]);
      leaveBalance.findMany.mockResolvedValue([
        { userId: 1, balance: 8, leaveType: 'ANNUAL' },
        { userId: 2, balance: 2, leaveType: 'ANNUAL' },
      ]);
      leaveBalance.update.mockResolvedValue({});

      const result = (await service.processCarryOver(2025)) as any;

      expect(leaveBalance.update).toHaveBeenCalledTimes(2);
      expect(result.processed).toBe(2);
      expect(result.results[0].carryOver).toBe(5); // min(8, 5) = 5
      expect(result.results[1].carryOver).toBe(2); // min(2, 5) = 2
    });

    it('deve retornar 0 resultados se nenhum tipo tem allowCarryOver', async () => {
      leaveTypeConfig.findMany.mockResolvedValue([]);

      const result = (await service.processCarryOver(2025)) as any;
      expect(result.processed).toBe(0);
    });
  });

  // ─── getBalanceHistory ─────────────────────────────────────────────────────

  describe('getBalanceHistory', () => {
    it('deve retornar histórico de saldo do utilizador', async () => {
      const history = [
        { id: 1, userId: 5, leaveType: 'ANNUAL', change: -3, createdAt: new Date() },
        { id: 2, userId: 5, leaveType: 'ANNUAL', change: 22, createdAt: new Date() },
      ];
      mockPrismaBase.leaveBalanceHistory.findMany.mockResolvedValue(history);

      const result = (await service.getBalanceHistory(5)) as any[];
      expect(result).toHaveLength(2);
      expect(mockPrismaBase.leaveBalanceHistory.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId: 5 } }),
      );
    });

    it('deve filtrar por tipo de licença se fornecido', async () => {
      mockPrismaBase.leaveBalanceHistory.findMany.mockResolvedValue([]);
      await service.getBalanceHistory(5, 'SICK');
      expect(mockPrismaBase.leaveBalanceHistory.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ userId: 5, leaveTypeCode: 'SICK' }),
        }),
      );
    });
  });

  // ─── getConflictCheck ──────────────────────────────────────────────────────

  describe('getConflictCheck', () => {
    it('deve verificar conflitos e retornar resultado sem conflitos', async () => {
      mockPrismaBase.user.findUnique.mockResolvedValue({ id: 3, departmentId: 10 });
      mockPrismaBase.leaveRequest.findMany.mockResolvedValue([]);
      leavePolicy.findFirst.mockResolvedValue(null);

      const result = (await service.getConflictCheck(3, '2026-08-01', '2026-08-05')) as any;

      expect(result.hasUserConflict).toBe(false);
      expect(result.teamConflictCount).toBe(0);
      expect(result.isAtRisk).toBe(false);
    });

    it('deve detectar conflito do próprio utilizador', async () => {
      mockPrismaBase.user.findUnique.mockResolvedValue({ id: 3, departmentId: 10 });
      mockPrismaBase.leaveRequest.findMany
        .mockResolvedValueOnce([]) // team conflicts
        .mockResolvedValueOnce([{ id: 99, userId: 3, status: 'APPROVED' }]); // user conflicts
      leavePolicy.findFirst.mockResolvedValue(null);

      const result = (await service.getConflictCheck(3, '2026-08-01', '2026-08-05')) as any;

      expect(result.hasUserConflict).toBe(true);
    });

    it('deve detectar conflito de equipa e aplicar maxAbsencePercent da política', async () => {
      mockPrismaBase.user.findUnique.mockResolvedValue({ id: 4, departmentId: 10 });
      // team conflicts
      mockPrismaBase.leaveRequest.findMany
        .mockResolvedValueOnce([
          { id: 10, user: { id: 1, fullName: 'Ana' } },
          { id: 11, user: { id: 2, fullName: 'João' } },
        ])
        .mockResolvedValueOnce([]); // user conflicts
      mockPrismaBase.user.findUnique.mockResolvedValueOnce({ id: 4, departmentId: 10 });
      leavePolicy.findFirst.mockResolvedValue({ maxAbsencePercent: 20 });

      const result = (await service.getConflictCheck(4, '2026-08-01', '2026-08-05')) as any;

      expect(result.teamConflictCount).toBe(2);
      expect(result.isAtRisk).toBe(true);
      expect(result.warningThreshold).toBe(20);
    });
  });
});
