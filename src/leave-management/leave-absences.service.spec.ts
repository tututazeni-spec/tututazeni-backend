import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { LeaveAbsencesService } from './leave-absences.service';
import {
  AbsenceJustificationStatus,
  AbsenceOccurrenceType,
  CreateAbsenceDto,
} from './leave-management.dto';

const employee = { id: 1, role: { name: 'COLABORADOR' } } as never;
const manager = { id: 2, role: { name: 'GESTOR' } } as never;
const hr = { id: 3, role: { name: 'RH' } } as never;

function absence(overrides: Record<string, unknown> = {}) {
  return {
    id: 10,
    userId: 1,
    user: { id: 1, fullName: 'Ana', employeeNumber: 'E1', department: null },
    date: new Date('2026-10-05T00:00:00.000Z'),
    startTime: null,
    endTime: null,
    durationDays: 1,
    durationHours: null,
    occurrenceType: AbsenceOccurrenceType.JUSTIFIED_ABSENCE,
    customCategory: null,
    justification: 'Consulta',
    source: 'MANUAL',
    justificationStatus: AbsenceJustificationStatus.SUBMITTED,
    validatorId: null,
    validatedAt: null,
    validationNotes: null,
    attendanceRecordId: null,
    forwardedToId: null,
    forwardedAt: null,
    sentToHrAt: null,
    createdById: 1,
    createdAt: new Date('2026-10-05T08:00:00.000Z'),
    attachments: [],
    ...overrides,
  };
}

describe('LeaveAbsencesService', () => {
  let prisma: any;
  let svc: LeaveAbsencesService;

  beforeEach(() => {
    prisma = {
      read: {
        user: { count: jest.fn().mockResolvedValue(1), findMany: jest.fn().mockResolvedValue([]) },
        attendanceRecord: { findMany: jest.fn().mockResolvedValue([]) },
      },
      absenceRecord: {
        findUnique: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn(),
        update: jest.fn(),
      },
      absenceRevision: { create: jest.fn() },
      leaveRequest: { findFirst: jest.fn().mockResolvedValue(null) },
      attendanceRecord: { findFirst: jest.fn().mockResolvedValue(null) },
      user: { findUnique: jest.fn().mockResolvedValue({ managerId: 2 }) },
      notificationLog: { create: jest.fn() },
      $transaction: jest.fn((ops: unknown[]) => Promise.all(ops)),
    };
    svc = new LeaveAbsencesService(
      prisma,
      { log: jest.fn() } as never,
      {
        current: jest.fn().mockResolvedValue({
          managerCanRegisterAbsences: true,
          managerCanValidateAbsences: true,
        }),
      } as never,
    );
  });

  describe('create', () => {
    const dto = (over: Partial<CreateAbsenceDto> = {}): CreateAbsenceDto => ({
      date: '2026-10-05',
      occurrenceType: AbsenceOccurrenceType.UNJUSTIFIED_ABSENCE,
      ...over,
    });

    it('recusa dia coberto por férias/licença aprovadas', async () => {
      prisma.leaveRequest.findFirst.mockResolvedValue({ id: 7, leaveTypeCode: 'VACATION' });
      await expect(svc.create(dto(), employee)).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.absenceRecord.create).not.toHaveBeenCalled();
    });

    it('exige horas para atrasos', async () => {
      await expect(
        svc.create(dto({ occurrenceType: AbsenceOccurrenceType.LATE }), employee),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('não duplica uma falta já associada à assiduidade', async () => {
      prisma.attendanceRecord.findFirst.mockResolvedValue({ id: 55 });
      prisma.absenceRecord.findUnique.mockResolvedValue({ id: 9 });
      await expect(svc.create(dto(), employee)).rejects.toBeInstanceOf(ConflictException);
    });

    it('um colaborador não regista ausências de outrem', async () => {
      await expect(svc.create(dto({ userId: 5 }), employee)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });
  });

  describe('validate', () => {
    it('ninguém valida a própria justificação', async () => {
      prisma.absenceRecord.findUnique.mockResolvedValue(absence({ userId: 2 }));
      await expect(svc.validate(10, { decision: 'VALIDATE' }, manager)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('ausências por saúde só o RH valida', async () => {
      prisma.absenceRecord.findUnique.mockResolvedValue(
        absence({ occurrenceType: AbsenceOccurrenceType.HEALTH_ABSENCE }),
      );
      await expect(svc.validate(10, { decision: 'VALIDATE' }, manager)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('a recusa exige justificação', async () => {
      prisma.absenceRecord.findUnique.mockResolvedValue(absence());
      await expect(
        svc.validate(10, { decision: 'REJECT', notes: '  ' }, hr),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('só valida justificações submetidas', async () => {
      prisma.absenceRecord.findUnique.mockResolvedValue(
        absence({ justificationStatus: AbsenceJustificationStatus.TO_JUSTIFY }),
      );
      await expect(svc.validate(10, { decision: 'VALIDATE' }, hr)).rejects.toBeInstanceOf(
        ConflictException,
      );
    });
  });

  describe('correct', () => {
    it('recusa correcções sem alterações', async () => {
      prisma.absenceRecord.findUnique.mockResolvedValue(absence());
      await expect(
        svc.correct(
          10,
          { reason: 'Revisão', occurrenceType: AbsenceOccurrenceType.JUSTIFIED_ABSENCE },
          hr,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('registos validados só o RH corrige', async () => {
      prisma.absenceRecord.findUnique.mockResolvedValue(
        absence({ justificationStatus: AbsenceJustificationStatus.VALIDATED }),
      );
      await expect(
        svc.correct(10, { reason: 'Erro', date: '2026-10-06' }, manager),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('grava o diff antes/depois como revisão', async () => {
      prisma.absenceRecord.findUnique.mockResolvedValue(absence());
      prisma.absenceRecord.update.mockResolvedValue(absence({ date: new Date('2026-10-06') }));
      await svc.correct(10, { reason: 'Data errada', date: '2026-10-06' }, hr);
      expect(prisma.absenceRevision.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          absenceId: 10,
          reason: 'Data errada',
          changes: { date: ['2026-10-05', '2026-10-06'] },
        }),
      });
    });
  });

  describe('privacidade', () => {
    it('o gestor não recebe justificação nem anexos de saúde', async () => {
      prisma.absenceRecord.findMany.mockResolvedValue([
        absence({
          occurrenceType: AbsenceOccurrenceType.HEALTH_ABSENCE,
          justification: 'Diagnóstico X',
          attachments: [{ id: 1, name: 'Atestado', fileUrl: 'https://x/y', mimeType: null }],
        }),
      ]);
      prisma.read.absenceRecord = {
        findMany: prisma.absenceRecord.findMany,
        count: jest.fn().mockResolvedValue(1),
      };
      const res = await svc.list({}, manager);
      expect(res.data[0].justification).toBeNull();
      expect(res.data[0].attachments).toEqual([]);
      expect(res.data[0].hasAttachment).toBe(true);
      expect(res.data[0].payrollReview).toBeUndefined();
    });
  });
});
