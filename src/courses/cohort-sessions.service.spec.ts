import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { CohortSessionsService } from './cohort-sessions.service';

const admin = { id: 1, role: { name: 'ADMIN' } } as any;
const owner = { id: 5, role: { name: 'INSTRUCTOR' } } as any;
const stranger = { id: 6, role: { name: 'INSTRUCTOR' } } as any;

const cohort = {
  id: 10,
  name: 'Turma A',
  instructorId: 5,
  startDate: new Date('2026-01-01T00:00:00Z'),
  endDate: new Date('2026-12-31T00:00:00Z'),
  status: 'ACTIVE',
  minAttendancePercent: 75,
  excludeExcusedFromTotal: true,
  course: { title: 'Liderança' },
};

const pastSession = {
  id: 20,
  cohortId: 10,
  title: 'Dia 1',
  date: new Date('2026-02-02T00:00:00Z'),
  startTime: '09:00',
  endTime: '12:00',
  instructorId: 5,
  status: 'SCHEDULED',
};

function build() {
  const db: any = {
    courseCohort: { findUnique: jest.fn().mockResolvedValue(cohort), update: jest.fn() },
    courseCohortSession: {
      findFirst: jest.fn().mockResolvedValue(pastSession),
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 99, ...data })),
      update: jest.fn().mockImplementation(({ data }) => Promise.resolve(data)),
    },
    courseCohortParticipant: {
      findMany: jest.fn().mockResolvedValue([{ userId: 100 }, { userId: 101 }]),
    },
    courseCohortAttendance: {
      findMany: jest.fn().mockResolvedValue([]),
      upsert: jest.fn().mockImplementation(args => ({ op: 'upsert', args })),
      deleteMany: jest.fn().mockReturnValue({ op: 'deleteMany' }),
    },
    courseCohortAttendanceLog: {
      create: jest.fn().mockImplementation(args => ({ op: 'log', args })),
    },
    $transaction: jest.fn().mockResolvedValue([]),
  };
  db.read = db;
  const audit = { log: jest.fn().mockResolvedValue(undefined) };
  return { db, audit, svc: new CohortSessionsService(db, audit as any) };
}

describe('CohortSessionsService', () => {
  describe('createSession', () => {
    const dto = { title: 'Dia 2', date: '2026-03-03', startTime: '09:00', endTime: '12:00' };

    it('cria a sessão e audita', async () => {
      const { svc, db, audit } = build();
      await svc.createSession(10, dto, admin);
      expect(db.courseCohortSession.create).toHaveBeenCalled();
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'COHORT_SESSION_CREATED' }),
      );
    });

    it('um formador de outra turma não cria sessões', async () => {
      const { svc } = build();
      await expect(svc.createSession(10, dto, stranger)).rejects.toThrow(ForbiddenException);
    });

    it('rejeita data fora do período da turma', async () => {
      const { svc } = build();
      await expect(svc.createSession(10, { ...dto, date: '2027-05-05' }, admin)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('rejeita fim antes do início', async () => {
      const { svc } = build();
      await expect(
        svc.createSession(10, { ...dto, startTime: '12:00', endTime: '09:00' }, admin),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejeita sobreposição de horário, mas aceita outro horário no mesmo dia', async () => {
      const { svc, db } = build();
      db.courseCohortSession.findMany.mockResolvedValue([{ startTime: '09:00', endTime: '12:00' }]);
      await expect(
        svc.createSession(10, { ...dto, startTime: '11:00', endTime: '13:00' }, admin),
      ).rejects.toThrow(ConflictException);
      await expect(
        svc.createSession(10, { ...dto, startTime: '14:00', endTime: '17:00' }, admin),
      ).resolves.toBeDefined();
    });
  });

  describe('saveSessionAttendance', () => {
    const rec = (userId: number, status: any = 'PRESENT') => ({ userId, status });

    it('guarda, regista o histórico e audita', async () => {
      const { svc, db, audit } = build();
      const r = await svc.saveSessionAttendance(
        10,
        20,
        { records: [rec(100), rec(101, 'LATE')], reason: 'x' },
        owner,
      );
      expect(r).toEqual({ saved: 2, changed: 2 });
      expect(db.courseCohortAttendanceLog.create).toHaveBeenCalledTimes(2);
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'COHORT_ATTENDANCE_SAVED' }),
      );
    });

    it('não duplica nem regista histórico quando nada mudou', async () => {
      const { svc, db } = build();
      db.courseCohortAttendance.findMany.mockResolvedValue([
        { userId: 100, status: 'PRESENT', checkInTime: null, checkOutTime: null, note: null },
      ]);
      const r = await svc.saveSessionAttendance(10, 20, { records: [rec(100)] }, owner);
      expect(r.changed).toBe(0);
      expect(db.courseCohortAttendanceLog.create).not.toHaveBeenCalled();
    });

    it('guarda o valor anterior no histórico ao alterar o estado', async () => {
      const { svc, db } = build();
      db.courseCohortAttendance.findMany.mockResolvedValue([
        { userId: 100, status: 'ABSENT', checkInTime: null, checkOutTime: null, note: null },
      ]);
      await svc.saveSessionAttendance(
        10,
        20,
        { records: [rec(100, 'JUSTIFIED')], reason: 'atestado' },
        owner,
      );
      expect(db.courseCohortAttendanceLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          previousStatus: 'ABSENT',
          newStatus: 'JUSTIFIED',
          reason: 'atestado',
          changedById: 5,
        }),
      });
    });

    it('rejeita quem não está inscrito', async () => {
      const { svc } = build();
      await expect(
        svc.saveSessionAttendance(10, 20, { records: [rec(999)] }, owner),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejeita participantes repetidos', async () => {
      const { svc } = build();
      await expect(
        svc.saveSessionAttendance(10, 20, { records: [rec(100), rec(100)] }, owner),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejeita sessão cancelada', async () => {
      const { svc, db } = build();
      db.courseCohortSession.findFirst.mockResolvedValue({ ...pastSession, status: 'CANCELLED' });
      await expect(
        svc.saveSessionAttendance(10, 20, { records: [rec(100)] }, owner),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejeita sessão futura', async () => {
      const { svc, db } = build();
      db.courseCohortSession.findFirst.mockResolvedValue({
        ...pastSession,
        date: new Date('2999-01-01T00:00:00Z'),
      });
      await expect(
        svc.saveSessionAttendance(10, 20, { records: [rec(100)] }, owner),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejeita saída anterior à entrada', async () => {
      const { svc } = build();
      await expect(
        svc.saveSessionAttendance(
          10,
          20,
          {
            records: [
              { userId: 100, status: 'PRESENT', checkInTime: '10:00', checkOutTime: '09:00' },
            ],
          },
          owner,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('um formador fora do âmbito é recusado no backend', async () => {
      const { svc } = build();
      await expect(
        svc.saveSessionAttendance(10, 20, { records: [rec(100)] }, stranger),
      ).rejects.toThrow(ForbiddenException);
    });

    it('o formador da própria sessão (não da turma) pode registar', async () => {
      const { svc, db } = build();
      db.courseCohort.findUnique.mockResolvedValue({ ...cohort, instructorId: 77 });
      await expect(
        svc.saveSessionAttendance(10, 20, { records: [rec(100)] }, owner),
      ).resolves.toBeDefined();
    });
  });

  describe('cancelSession', () => {
    it('cancela sem apagar presenças', async () => {
      const { svc, db } = build();
      await svc.cancelSession(10, 20, { reason: 'greve' }, admin);
      expect(db.courseCohortSession.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { status: 'CANCELLED', cancelReason: 'greve' } }),
      );
      expect(db.courseCohortAttendance.deleteMany).not.toHaveBeenCalled();
    });
  });

  describe('clearSessionAttendance', () => {
    it('só ADMIN/RH limpam', async () => {
      const { svc } = build();
      await expect(svc.clearSessionAttendance(10, 20, { reason: 'x' }, owner)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('regista no histórico cada marcação antes de a remover', async () => {
      const { svc, db } = build();
      db.courseCohortAttendance.findMany.mockResolvedValue([{ userId: 100, status: 'PRESENT' }]);
      const r = await svc.clearSessionAttendance(10, 20, { reason: 'engano' }, admin);
      expect(r).toEqual({ cleared: 1 });
      expect(db.courseCohortAttendanceLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          previousStatus: 'PRESENT',
          newStatus: null,
          reason: 'engano',
        }),
      });
    });
  });

  describe('getReport', () => {
    it('calcula só sobre sessões concluídas e ignora as canceladas', async () => {
      const { svc, db } = build();
      const done = (id: number, atts: any[], status = 'COMPLETED') => ({
        id,
        date: new Date('2026-02-0' + id + 'T00:00:00Z'),
        startTime: '09:00',
        endTime: '12:00',
        status,
        attendances: atts,
      });
      db.courseCohortSession.findMany.mockResolvedValue([
        done(1, [
          { userId: 100, status: 'PRESENT' },
          { userId: 101, status: 'ABSENT' },
        ]),
        done(2, [
          { userId: 100, status: 'PRESENT' },
          { userId: 101, status: 'ABSENT' },
        ]),
        done(3, [{ userId: 100, status: 'ABSENT' }], 'CANCELLED'),
      ]);
      db.courseCohortParticipant.findMany.mockResolvedValue([
        { userId: 100, user: { fullName: 'Ana', email: 'a@x.pt', employeeNumber: null } },
        { userId: 101, user: { fullName: 'Rui', email: 'r@x.pt', employeeNumber: '7' } },
      ]);
      const r = await svc.getReport(10, admin);
      expect(r.general).toMatchObject({
        sessionsCompleted: 2,
        sessionsCancelled: 1,
        averageRate: 50,
        belowMinimum: 1,
      });
      expect(r.participants.find(p => p.userId === 100)?.rate).toBe(100);
      expect(r.participants.find(p => p.userId === 101)?.meetsMinimum).toBe(false);
    });
  });

  describe('updatePolicy', () => {
    it('só ADMIN/RH', async () => {
      const { svc } = build();
      await expect(svc.updatePolicy(10, { minAttendancePercent: 80 }, owner)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });
});
