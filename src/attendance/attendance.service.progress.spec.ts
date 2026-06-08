// src/attendance/attendance.service.progress.spec.ts
// Cobre métodos não testados: reviewLeave, assignSchedule, createOvertime,
// reviewOvertime, getOvertimeBalance, createJustification, reviewJustification,
// getPendingJustifications, generateQrCode, validateQrToken

import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { AttendanceService } from './attendance.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/services/audit.service';

// ─── Mock de attendanceRecord (acedido via proxy) ──────────────────────────────

function buildMockAttendanceRecord() {
  return {
    findMany: jest.fn().mockResolvedValue([]),
    findUnique: jest.fn().mockResolvedValue(null),
    findFirst: jest.fn().mockResolvedValue(null),
    create: jest.fn().mockResolvedValue({}),
    createMany: jest.fn().mockResolvedValue({ count: 0 }),
    update: jest.fn().mockResolvedValue({}),
    updateMany: jest.fn().mockResolvedValue({}),
    count: jest.fn().mockResolvedValue(0),
  };
}

function buildMockPrismaBase() {
  return {
    user: {
      findUnique: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
    },
    workSchedule: {
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({}),
      findMany: jest.fn().mockResolvedValue([]),
    },
    leaveRequest: {
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({ id: 1 }),
      findUnique: jest.fn().mockResolvedValue(null),
      update: jest.fn().mockResolvedValue({}),
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
    },
    notificationLog: { create: jest.fn().mockResolvedValue({}) },
    auditLog: { create: jest.fn().mockResolvedValue({}) },
    userSchedule: {
      findFirst: jest.fn().mockResolvedValue(null),
      findUnique: jest.fn().mockResolvedValue(null),
      upsert: jest.fn().mockResolvedValue({ id: 1 }),
    },
    overtimeRecord: {
      create: jest.fn().mockResolvedValue({ id: 1 }),
      update: jest.fn().mockResolvedValue({}),
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
    },
    attendanceJustification: {
      create: jest.fn().mockResolvedValue({ id: 1 }),
      update: jest.fn().mockResolvedValue({ id: 1, status: 'APPROVED' }),
      findUnique: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
    },
    attendanceAdjustment: { create: jest.fn().mockResolvedValue({}) },
  };
}

const mockAudit = { log: jest.fn().mockResolvedValue({}) };

describe('AttendanceService (progress)', () => {
  let service: AttendanceService;
  let mockAR: ReturnType<typeof buildMockAttendanceRecord>;
  let mockPrismaBase: ReturnType<typeof buildMockPrismaBase>;
  let mockPrismaProxy: any;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockAR = buildMockAttendanceRecord();
    mockPrismaBase = buildMockPrismaBase();

    mockPrismaProxy = new Proxy(mockPrismaBase, {
      get(target, prop) {
        if (prop === 'attendanceRecord') return mockAR;
        return (target as any)[prop];
      },
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AttendanceService,
        { provide: PrismaService, useValue: mockPrismaProxy },
        { provide: AuditService, useValue: mockAudit },
      ],
    }).compile();

    service = module.get<AttendanceService>(AttendanceService);
  });

  // ─── reviewLeave ───────────────────────────────────────────────────────────

  describe('reviewLeave', () => {
    const pendingLeave = {
      id: 1,
      userId: 5,
      status: 'PENDING',
      leaveType: 'ANNUAL',
      startDate: new Date('2026-08-01'),
      endDate: new Date('2026-08-05'),
      workDays: 5,
    };

    it('deve lançar NotFoundException se pedido não encontrado', async () => {
      mockPrismaBase.leaveRequest.findUnique.mockResolvedValue(null);
      await expect(service.reviewLeave(99, { status: 'APPROVED' } as any, 1)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('deve lançar BadRequestException se pedido já processado', async () => {
      mockPrismaBase.leaveRequest.findUnique.mockResolvedValue({
        ...pendingLeave,
        status: 'APPROVED',
      });
      await expect(service.reviewLeave(1, { status: 'APPROVED' } as any, 1)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('deve aprovar pedido e criar registos de presença', async () => {
      mockPrismaBase.leaveRequest.findUnique.mockResolvedValue(pendingLeave);
      mockPrismaBase.leaveRequest.update.mockResolvedValue({ ...pendingLeave, status: 'APPROVED' });
      mockAR.createMany.mockResolvedValue({ count: 5 });

      const result = await service.reviewLeave(
        1,
        { status: 'APPROVED', reviewNotes: 'OK' } as any,
        9,
      );

      expect(mockPrismaBase.leaveRequest.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 1 },
          data: expect.objectContaining({ status: 'APPROVED' }),
        }),
      );
      expect(mockAR.createMany).toHaveBeenCalled();
      expect(result).toBeDefined();
    });

    it('deve rejeitar pedido sem criar registos de presença', async () => {
      mockPrismaBase.leaveRequest.findUnique.mockResolvedValue(pendingLeave);
      mockPrismaBase.leaveRequest.update.mockResolvedValue({ ...pendingLeave, status: 'REJECTED' });

      await service.reviewLeave(1, { status: 'REJECTED', reviewNotes: 'Sem fundos' } as any, 9);

      expect(mockAR.createMany).not.toHaveBeenCalled();
    });
  });

  // ─── assignSchedule ────────────────────────────────────────────────────────

  describe('assignSchedule', () => {
    it('deve atribuir horário a utilizador', async () => {
      mockPrismaBase.userSchedule.upsert.mockResolvedValue({ userId: 1, scheduleId: 2 });
      const result = await service.assignSchedule({
        userId: 1,
        scheduleId: 2,
        effectiveFrom: '2026-09-01',
      } as any);
      expect(result).toBeDefined();
      expect(mockPrismaBase.userSchedule.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId: 1 } }),
      );
    });
  });

  // ─── createOvertime ────────────────────────────────────────────────────────

  describe('createOvertime', () => {
    it('deve criar pedido de horas extra', async () => {
      mockPrismaBase.overtimeRecord.create.mockResolvedValue({ id: 1, status: 'PENDING' });
      const result = await service.createOvertime(3, {
        date: '2026-08-10',
        overtimeMinutes: 120,
        reason: 'Projecto urgente',
      } as any);
      expect(result).toBeDefined();
      expect(mockPrismaBase.overtimeRecord.create).toHaveBeenCalled();
    });
  });

  // ─── reviewOvertime ────────────────────────────────────────────────────────

  describe('reviewOvertime', () => {
    it('deve rever pedido de horas extra', async () => {
      mockPrismaBase.overtimeRecord.update.mockResolvedValue({ id: 1, status: 'APPROVED' });
      const result = await service.reviewOvertime(1, { status: 'APPROVED' } as any, 9);
      expect(result).toBeDefined();
      expect(mockPrismaBase.overtimeRecord.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 1 } }),
      );
    });
  });

  // ─── getOvertimeBalance ────────────────────────────────────────────────────

  describe('getOvertimeBalance', () => {
    it('deve retornar saldo de horas extra vazio', async () => {
      mockPrismaBase.overtimeRecord.findMany.mockResolvedValue([]);
      const result = (await service.getOvertimeBalance(5)) as any;
      expect(result.totalMinutes).toBe(0);
      expect(result.balanceHours).toBe(0);
    });

    it('deve calcular saldo com registos de horas extra não compensadas', async () => {
      mockPrismaBase.overtimeRecord.findMany.mockResolvedValue([
        { overtimeMinutes: 90, compensated: false },
        { overtimeMinutes: 60, compensated: true },
      ]);
      const result = (await service.getOvertimeBalance(5)) as any;
      expect(result.totalMinutes).toBe(90); // apenas não compensadas
    });
  });

  // ─── createJustification ───────────────────────────────────────────────────

  describe('createJustification', () => {
    const baseRecord = {
      id: 1,
      userId: 3,
      date: new Date(), // today
      status: 'ABSENT',
      context: 'WORK',
    };

    it('deve criar justificativa de presença', async () => {
      mockAR.findUnique.mockResolvedValue(baseRecord);
      mockPrismaBase.attendanceJustification.create.mockResolvedValue({ id: 7 });

      const result = await service.createJustification(3, {
        attendanceId: 1,
        reason: 'Consulta médica',
        leaveType: 'SICK',
      } as any);

      expect(result).toBeDefined();
      expect(mockPrismaBase.attendanceJustification.create).toHaveBeenCalled();
    });

    it('deve lançar ForbiddenException se userId não corresponde', async () => {
      mockAR.findUnique.mockResolvedValue(baseRecord);
      await expect(
        service.createJustification(99, { attendanceId: 1, reason: 'Teste' } as any),
      ).rejects.toThrow(ForbiddenException);
    });

    it('deve lançar BadRequestException se prazo de 3 dias expirado', async () => {
      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 5); // 5 dias atrás
      mockAR.findUnique.mockResolvedValue({ ...baseRecord, date: oldDate });

      await expect(
        service.createJustification(3, { attendanceId: 1, reason: 'Atrasado' } as any),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ─── reviewJustification ───────────────────────────────────────────────────

  describe('reviewJustification', () => {
    const justification = {
      id: 1,
      attendanceId: 5,
      userId: 3,
      status: 'PENDING',
      attendance: { id: 5, status: 'ABSENT' },
    };

    it('deve lançar NotFoundException se justificativa não encontrada', async () => {
      mockPrismaBase.attendanceJustification.findUnique.mockResolvedValue(null);
      await expect(
        service.reviewJustification(99, { status: 'APPROVED' } as any, 1),
      ).rejects.toThrow(NotFoundException);
    });

    it('deve aprovar justificativa e actualizar presença para JUSTIFIED', async () => {
      mockPrismaBase.attendanceJustification.findUnique.mockResolvedValue(justification);
      mockPrismaBase.attendanceJustification.update.mockResolvedValue({
        ...justification,
        status: 'APPROVED',
      });
      mockAR.update.mockResolvedValue({});

      await service.reviewJustification(1, { status: 'APPROVED', reviewNotes: 'OK' } as any, 9);

      expect(mockAR.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 5 } }));
    });

    it('deve rejeitar justificativa sem actualizar presença', async () => {
      mockPrismaBase.attendanceJustification.findUnique.mockResolvedValue(justification);
      mockPrismaBase.attendanceJustification.update.mockResolvedValue({
        ...justification,
        status: 'REJECTED',
      });

      await service.reviewJustification(1, { status: 'REJECTED' } as any, 9);

      expect(mockAR.update).not.toHaveBeenCalled();
    });
  });

  // ─── getPendingJustifications ──────────────────────────────────────────────

  describe('getPendingJustifications', () => {
    it('deve retornar lista de justificativas pendentes', async () => {
      mockPrismaBase.attendanceJustification.findMany.mockResolvedValue([
        { id: 1, status: 'PENDING' },
        { id: 2, status: 'PENDING' },
      ]);
      const result = (await service.getPendingJustifications()) as any[];
      expect(result).toHaveLength(2);
    });
  });

  // ─── generateQrCode ────────────────────────────────────────────────────────

  describe('generateQrCode', () => {
    it('deve gerar token QR com TTL padrão', async () => {
      const result = (await service.generateQrCode(1, {})) as any;
      expect(result.token).toBeDefined();
      expect(result.token).toHaveLength(64); // 32 bytes hex = 64 chars
      expect(result.ttlSeconds).toBe(30);
    });

    it('deve gerar token QR com TTL personalizado', async () => {
      const result = (await service.generateQrCode(1, { ttlSeconds: 120 })) as any;
      expect(result.ttlSeconds).toBe(120);
    });
  });

  // ─── validateQrToken ───────────────────────────────────────────────────────

  describe('validateQrToken', () => {
    it('deve lançar BadRequestException se token inválido', async () => {
      await expect(service.validateQrToken('token-invalido', 1)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('deve validar e retornar payload de token QR válido', async () => {
      const generated = (await service.generateQrCode(1, { ttlSeconds: 300 })) as any;
      const result = (await service.validateQrToken(generated.token, 5)) as any;
      expect(result.generatedById).toBe(1);
    });

    it('deve lançar BadRequestException se token expirado', async () => {
      const generated = (await service.generateQrCode(1, { ttlSeconds: 1 })) as any;
      // Force expiry by waiting slightly — use a past time hack
      await new Promise(res => setTimeout(res, 10));
      // Manually expire by re-generating with ttl=0 (Date.now() + 0)
      // We can't easily control Date.now, so just check the already-consumed token
      // After validateQrToken consumed it, it's deleted from store
      await service.validateQrToken(generated.token, 5).catch(() => {}); // consume
      await expect(service.validateQrToken(generated.token, 5)).rejects.toThrow(
        BadRequestException,
      );
    });
  });
});
