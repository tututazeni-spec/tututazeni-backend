// Integrações do módulo Leave (docs/Modulo_Leave.md §11): assiduidade sem
// duplicados, eventos para Automations e feed validado para o Payroll.
import { ForbiddenException } from '@nestjs/common';
import { LeaveEffectsService, leaveWorkingDays } from './leave-effects.service';
import { DEFAULT_LEAVE_SETTINGS, LeaveSettings } from './leave-settings.dto';
import { configureLeaveCalendar, resetLeaveCalendar } from './leave-calendar.helper';

type Mocks = Record<string, Record<string, jest.Mock>>;

function harness(settings: Partial<LeaveSettings> = {}) {
  const cfg = { ...DEFAULT_LEAVE_SETTINGS, ...settings };
  const prisma: Mocks = {
    user: {
      findUnique: jest.fn().mockResolvedValue({ workLocation: null }),
      findMany: jest.fn().mockResolvedValue([{ id: 40 }]),
    },
    attendanceRecord: {
      findMany: jest.fn().mockResolvedValue([]),
      createMany: jest.fn().mockImplementation(async ({ data }) => ({ count: data.length })),
      deleteMany: jest.fn().mockResolvedValue({ count: 3 }),
    },
    leaveRequest: { findMany: jest.fn().mockResolvedValue([]) },
    absenceRecord: { findMany: jest.fn().mockResolvedValue([]) },
    leaveTypeConfig: { findMany: jest.fn().mockResolvedValue([]) },
    notificationLog: { create: jest.fn().mockResolvedValue({}) },
  };
  Object.defineProperty(prisma, 'read', { get: () => prisma });
  const audit = { log: jest.fn().mockResolvedValue(undefined) };
  const automation = { triggerEvent: jest.fn().mockResolvedValue(undefined) };
  const settingsSvc = { current: jest.fn().mockResolvedValue(cfg) };
  const svc = new LeaveEffectsService(
    prisma as never,
    audit as never,
    automation as never,
    settingsSvc as never,
  );
  return { svc, prisma, audit, automation };
}

// Quarta 4 → Sexta 13 Nov 2026 (inclui fim de semana)
const request = {
  id: 7,
  userId: 10,
  leaveTypeCode: 'VACATION',
  startDate: new Date('2026-11-04T00:00:00.000Z'),
  endDate: new Date('2026-11-13T00:00:00.000Z'),
  workDays: 8,
};

afterEach(() => resetLeaveCalendar());

describe('leaveWorkingDays', () => {
  it('exclui fins de semana e feriados', () => {
    // 11/11 (Independência) cai numa quarta-feira em 2026
    const days = leaveWorkingDays(request.startDate, request.endDate).map(d =>
      d.toISOString().slice(0, 10),
    );
    expect(days).toEqual([
      '2026-11-04',
      '2026-11-05',
      '2026-11-06',
      '2026-11-09',
      '2026-11-10',
      '2026-11-12',
      '2026-11-13',
    ]);
  });

  it('respeita a semana de trabalho configurada', () => {
    configureLeaveCalendar({ workWeekDays: [1, 2, 3, 4, 5, 6] });
    const days = leaveWorkingDays(request.startDate, request.endDate);
    expect(days.some(d => d.toISOString().slice(0, 10) === '2026-11-07')).toBe(true); // sábado
  });

  it('respeita feriados da localização do colaborador', () => {
    configureLeaveCalendar({
      holidays: [
        { date: '2026-11-05', name: 'Local', location: 'Huambo', recurring: false, active: true },
      ],
    });
    const huambo = leaveWorkingDays(request.startDate, request.endDate, 'Huambo');
    const luanda = leaveWorkingDays(request.startDate, request.endDate, 'Luanda');
    expect(huambo).toHaveLength(luanda.length - 1);
  });
});

describe('syncAttendanceOnApproval', () => {
  it('cria ON_LEAVE só nos dias úteis, ligado ao pedido', async () => {
    const { svc, prisma } = harness();
    const r = await svc.syncAttendanceOnApproval(request);
    expect(r.created).toBe(7);
    const data = prisma.attendanceRecord.createMany.mock.calls[0][0].data;
    expect(data).toHaveLength(7);
    expect(data.every((d: { leaveRequestId: number; status: string }) => d.leaveRequestId === 7)).toBe(
      true,
    );
    expect(data[0].status).toBe('ON_LEAVE');
    expect(prisma.attendanceRecord.createMany.mock.calls[0][0].skipDuplicates).toBe(true);
  });

  it('não duplica dias que já têm registo de assiduidade (meia-noite local ou UTC)', async () => {
    const { svc, prisma } = harness();
    prisma.attendanceRecord.findMany.mockResolvedValue([
      { date: new Date('2026-11-04T00:00:00.000Z') }, // UTC
      { date: new Date('2026-11-04T23:00:00.000Z') }, // 05/11 à meia-noite local (UTC+1)
    ]);
    const r = await svc.syncAttendanceOnApproval(request);
    expect(r.created).toBe(5);
    const days = prisma.attendanceRecord.createMany.mock.calls[0][0].data.map(
      (d: { date: Date }) => d.date.toISOString().slice(0, 10),
    );
    expect(days).not.toContain('2026-11-04');
    expect(days).not.toContain('2026-11-05');
  });

  it('syncAttendance desligado nas Configurações → não toca na assiduidade', async () => {
    const { svc, prisma } = harness({ syncAttendance: false });
    expect(await svc.syncAttendanceOnApproval(request)).toEqual({ created: 0 });
    expect(prisma.attendanceRecord.createMany).not.toHaveBeenCalled();
  });

  it('falha da assiduidade não rebenta a aprovação', async () => {
    const { svc, prisma } = harness();
    prisma.attendanceRecord.findMany.mockRejectedValue(new Error('db'));
    await expect(svc.syncAttendanceOnApproval(request)).resolves.toEqual({ created: 0 });
  });

  it('cancelar remove só registos ON_LEAVE do pedido', async () => {
    const { svc, prisma } = harness();
    await svc.removeAttendanceOnCancel(7);
    expect(prisma.attendanceRecord.deleteMany).toHaveBeenCalledWith({
      where: { leaveRequestId: 7, status: 'ON_LEAVE' },
    });
  });
});

describe('emitApproved', () => {
  it('emite leave.approved com eventId idempotente', async () => {
    const { svc, automation } = harness();
    await svc.emitApproved({ ...request, requestNumber: 'LV-2026-000007' });
    expect(automation.triggerEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'leave.approved',
        userId: 10,
        eventId: 'leave.approved:7',
        recordType: 'LeaveRequest',
      }),
    );
  });

  it('Automations em baixo não impede a aprovação', async () => {
    const { svc, automation } = harness();
    automation.triggerEvent.mockRejectedValue(new Error('down'));
    await expect(svc.emitApproved(request)).resolves.toBeUndefined();
  });

  it('notifica o RH só se a opção estiver ligada', async () => {
    const off = harness();
    await off.svc.emitApproved(request);
    expect(off.prisma.notificationLog.create).not.toHaveBeenCalled();

    const on = harness({ notifyHrOnApproval: true });
    await on.svc.emitApproved(request);
    expect(on.prisma.notificationLog.create).toHaveBeenCalledTimes(1);
  });
});

describe('payrollFeed', () => {
  it('integração desligada → 403', async () => {
    const { svc } = harness({ payrollFeedEnabled: false });
    await expect(svc.payrollFeed('2026-11', 1)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('devolve só licenças aprovadas, dias úteis do mês e ausências já decididas', async () => {
    const { svc, prisma, audit } = harness();
    prisma.leaveRequest.findMany.mockResolvedValue([
      {
        id: 7,
        requestNumber: 'LV-2026-000007',
        userId: 10,
        leaveTypeCode: 'UNPAID',
        startDate: new Date('2026-10-28T00:00:00.000Z'),
        endDate: new Date('2026-11-04T00:00:00.000Z'),
        user: { fullName: 'Ana', employeeNumber: 'E10', workLocation: null },
      },
    ]);
    prisma.leaveTypeConfig.findMany.mockResolvedValue([
      { code: 'UNPAID', name: 'Sem vencimento', isPaid: false, isSensitive: false, requiresPayrollValidation: true },
    ]);
    prisma.absenceRecord.findMany.mockResolvedValue([
      {
        id: 1,
        userId: 11,
        date: new Date('2026-11-09T00:00:00.000Z'),
        durationDays: 1,
        durationHours: null,
        occurrenceType: 'HEALTH_ABSENCE',
        justificationStatus: 'VALIDATED',
        user: { fullName: 'Rui', employeeNumber: 'E11' },
      },
    ]);

    const feed = await svc.payrollFeed('2026-11', 1);

    // 1–4 Nov: domingo, 2 (Finados, feriado), terça 3 e quarta 4 → 2 dias úteis
    expect(feed.leaves[0]).toMatchObject({
      isPaid: false,
      from: '2026-11-01',
      to: '2026-11-04',
      workDaysInPeriod: 2,
    });
    // Saúde sai genérica — nunca o tipo sensível
    expect(feed.absences[0]).toMatchObject({ occurrence: 'ABSENCE', justified: true });
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'LEAVE_PAYROLL_FEED_READ' }),
    );
  });

  it('licenças sensíveis não expõem nome nem código do tipo', async () => {
    const { svc, prisma } = harness();
    prisma.leaveRequest.findMany.mockResolvedValue([
      {
        id: 8,
        requestNumber: null,
        userId: 10,
        leaveTypeCode: 'SICK',
        startDate: new Date('2026-11-09T00:00:00.000Z'),
        endDate: new Date('2026-11-10T00:00:00.000Z'),
        user: { fullName: 'Ana', employeeNumber: null, workLocation: null },
      },
    ]);
    prisma.leaveTypeConfig.findMany.mockResolvedValue([
      { code: 'SICK', name: 'Baixa médica', isPaid: true, isSensitive: true, requiresPayrollValidation: true },
    ]);
    const feed = await svc.payrollFeed('2026-11', 1);
    expect(feed.leaves[0].typeCode).toBe('SENSITIVE');
    expect(JSON.stringify(feed)).not.toContain('Baixa médica');
  });
});
