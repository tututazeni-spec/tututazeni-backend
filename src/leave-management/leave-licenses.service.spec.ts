import { LeaveLicensesService, licensePhase, payRegimeOf } from './leave-licenses.service';
import { LicensePhase } from './leave-management.dto';
import { calendarRange } from './leave-absence-calendar.service';
import { CalendarView } from './leave-management.dto';
import { canSeeSensitive, leaveScopeOf, leaveScopeWhere } from './leave-scope.helper';

const today = new Date('2026-10-05T00:00:00.000Z');

describe('licensePhase', () => {
  it('deriva "em curso" e "concluída" das datas de um pedido aprovado', () => {
    const d = (s: string) => new Date(`${s}T00:00:00.000Z`);
    expect(licensePhase('APPROVED', d('2026-10-01'), d('2026-10-10'), today)).toBe(
      LicensePhase.IN_PROGRESS,
    );
    expect(licensePhase('APPROVED', d('2026-09-01'), d('2026-09-10'), today)).toBe(
      LicensePhase.COMPLETED,
    );
    expect(licensePhase('APPROVED', d('2026-11-01'), d('2026-11-10'), today)).toBe(
      LicensePhase.APPROVED,
    );
  });

  it('mantém o estado dos pedidos não aprovados', () => {
    expect(licensePhase('PENDING', today, today, today)).toBe(LicensePhase.PENDING);
    expect(licensePhase('REJECTED', today, today, today)).toBe(LicensePhase.REJECTED);
  });
});

describe('payRegimeOf', () => {
  it('distingue remunerada, não remunerada e sujeita a validação', () => {
    expect(payRegimeOf({ isPaid: true, requiresPayrollValidation: false })).toBe('PAID');
    expect(payRegimeOf({ isPaid: false, requiresPayrollValidation: false })).toBe('UNPAID');
    expect(payRegimeOf({ isPaid: true, requiresPayrollValidation: true })).toBe('TO_VALIDATE');
  });
});

describe('LeaveLicensesService.list — privacidade', () => {
  const row = (over: Record<string, unknown> = {}) => ({
    id: 1,
    userId: 1,
    user: { id: 1, fullName: 'Ana', employeeNumber: 'E1', department: null },
    leaveTypeCode: 'SICK',
    startDate: new Date('2026-10-01T00:00:00.000Z'),
    endDate: new Date('2026-10-02T00:00:00.000Z'),
    startTime: null,
    endTime: null,
    durationMode: 'FULL_DAY',
    workDays: 2,
    hours: null,
    calendarDays: 2,
    reason: 'Diagnóstico X',
    status: 'PENDING',
    createdAt: new Date('2026-09-30T10:00:00.000Z'),
    createdById: 1,
    approvals: [],
    documents: [
      { id: 1, name: 'Atestado', mimeType: null, fileUrl: 'https://x/y', isSensitive: true },
    ],
    ...over,
  });

  function build() {
    const prisma: any = {
      read: {
        leaveRequest: {
          findMany: jest.fn().mockResolvedValue([row()]),
          count: jest.fn().mockResolvedValue(1),
        },
        leaveTypeConfig: {
          findMany: jest.fn().mockResolvedValue([
            {
              code: 'SICK',
              name: 'Baixa',
              color: null,
              isPaid: true,
              isSensitive: true,
              requiresDocument: true,
              requiresPayrollValidation: true,
            },
          ]),
        },
        user: { findMany: jest.fn().mockResolvedValue([]) },
      },
    };
    return new LeaveLicensesService(prisma, {} as never);
  }

  const manager = { id: 2, role: { name: 'GESTOR' } } as never;
  const owner = { id: 1, role: { name: 'COLABORADOR' } } as never;
  const hr = { id: 3, role: { name: 'RH' } } as never;

  it('esconde motivo e documentos sensíveis ao gestor', async () => {
    const { data } = await build().list({}, manager);
    expect(data[0].reason).toBeNull();
    expect(data[0].documents).toEqual([]);
    expect(data[0].hasDocument).toBe(true);
    expect(data[0].payrollImpact).toBeUndefined();
  });

  it('o titular vê tudo mas não o impacto salarial', async () => {
    const { data } = await build().list({}, owner);
    expect(data[0].reason).toBe('Diagnóstico X');
    expect(data[0].documents).toHaveLength(1);
    expect(data[0].payrollImpact).toBeUndefined();
  });

  it('o RH vê tudo, incluindo o impacto salarial', async () => {
    const { data } = await build().list({}, hr);
    expect(data[0].reason).toBe('Diagnóstico X');
    expect(data[0].payrollImpact).toBe('VALIDATION_REQUIRED');
  });
});

describe('calendarRange', () => {
  const anchor = new Date('2026-10-14T00:00:00.000Z'); // quarta-feira

  it('semana de segunda a domingo', () => {
    const { from, to } = calendarRange(CalendarView.WEEK, anchor);
    expect(from.toISOString().slice(0, 10)).toBe('2026-10-12');
    expect(to.toISOString().slice(0, 10)).toBe('2026-10-18');
  });

  it('mês e ano completos', () => {
    const month = calendarRange(CalendarView.MONTH, anchor);
    expect(month.from.toISOString().slice(0, 10)).toBe('2026-10-01');
    expect(month.to.toISOString().slice(0, 10)).toBe('2026-10-31');
    const year = calendarRange(CalendarView.YEAR, anchor);
    expect(year.from.toISOString().slice(0, 10)).toBe('2026-01-01');
    expect(year.to.toISOString().slice(0, 10)).toBe('2026-12-31');
  });

  it('dia único', () => {
    const { from, to } = calendarRange(CalendarView.DAY, anchor);
    expect(from).toEqual(to);
  });
});

describe('leave-scope.helper', () => {
  it('classifica o âmbito por perfil', () => {
    expect(leaveScopeOf({ id: 1, role: { name: 'RH' } } as never)).toBe('ORGANIZATION');
    expect(leaveScopeOf({ id: 1, role: { name: 'GESTOR' } } as never)).toBe('TEAM');
    expect(leaveScopeOf({ id: 1, role: { name: 'COLABORADOR' } } as never)).toBe('SELF');
  });

  it('o colaborador só vê a si próprio', () => {
    expect(leaveScopeWhere({ id: 9, role: { name: 'COLABORADOR' } } as never)).toEqual({ id: 9 });
  });

  it('só o titular e o RH vêem dados sensíveis', () => {
    expect(canSeeSensitive({ id: 1, role: { name: 'COLABORADOR' } } as never, 1)).toBe(true);
    expect(canSeeSensitive({ id: 3, role: { name: 'ADMIN' } } as never, 1)).toBe(true);
    expect(canSeeSensitive({ id: 2, role: { name: 'GESTOR' } } as never, 1)).toBe(false);
  });
});
