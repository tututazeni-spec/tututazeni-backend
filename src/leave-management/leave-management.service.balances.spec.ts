// Saldos atribuídos / reservados / gozados, política de cancelamento, transição
// de fim de ano e regras das Configurações (docs/Modulo_Leave.md §10, §12, §13).
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { LeaveManagementService } from './leave-management.service';
import { DEFAULT_LEAVE_SETTINGS, LeaveSettings } from './leave-settings.dto';
import { resetLeaveCalendar } from './leave-calendar.helper';

type Mocks = Record<string, Record<string, jest.Mock>>;

const futureDay = (daysAhead: number) =>
  new Date(Date.now() + daysAhead * 86_400_000).toISOString().slice(0, 10);

interface Opts {
  settings?: Partial<LeaveSettings>;
  type?: Record<string, unknown>;
  balance?: { balance: number; reserved: number } | null;
  manager?: boolean;
  delegateOf?: number | null;
}

function harness(opts: Opts = {}) {
  const settings: LeaveSettings = { ...DEFAULT_LEAVE_SETTINGS, ...opts.settings };
  const type = {
    code: 'VACATION',
    name: 'Férias',
    annualLimit: 22,
    countWorkDaysOnly: true,
    autoApprove: false,
    requiresDocument: false,
    isSensitive: false,
    category: 'STATUTORY',
    ...opts.type,
  };
  const balance = opts.balance === undefined ? { balance: 22, reserved: 0 } : opts.balance;

  const created: Record<string, unknown> = {};
  const prisma: Mocks & { $transaction: jest.Mock; $queryRaw: jest.Mock } = {
    leaveTypeConfig: { findUnique: jest.fn().mockResolvedValue(type), findMany: jest.fn() },
    leavePolicy: { findFirst: jest.fn().mockResolvedValue(null) },
    leaveBalance: {
      findUnique: jest.fn().mockResolvedValue(balance),
      findMany: jest.fn().mockResolvedValue([]),
      update: jest.fn().mockResolvedValue({}),
      upsert: jest.fn().mockResolvedValue({}),
    },
    leaveBalanceHistory: {
      create: jest.fn().mockResolvedValue({}),
      findFirst: jest.fn().mockResolvedValue(null),
    },
    leaveRequest: {
      findUnique: jest.fn(),
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockImplementation(async ({ data }) => {
        Object.assign(created, { id: 77, createdAt: new Date('2026-10-04'), ...data });
        delete created.documents;
        delete created.impactPreview;
        return { ...created };
      }),
      update: jest.fn().mockImplementation(async ({ data }) => ({ ...created, ...data })),
    },
    leaveApproval: {
      create: jest.fn().mockResolvedValue({ id: 1 }),
      update: jest.fn().mockResolvedValue({}),
      updateMany: jest.fn().mockResolvedValue({}),
      findFirst: jest.fn().mockResolvedValue({ id: 5, level: 1 }),
      count: jest.fn().mockResolvedValue(0),
    },
    user: {
      findUnique: jest.fn().mockResolvedValue({
        id: 10,
        workLocation: null,
        managerId: opts.manager === false ? null : 2,
        manager: opts.manager === false ? null : { id: 2, fullName: 'Gestor' },
      }),
      findFirst: jest.fn().mockResolvedValue(null),
    },
    notificationLog: { create: jest.fn().mockResolvedValue({}) },
    $transaction: jest.fn(async (cb: (tx: unknown) => unknown) => cb(prisma)),
    $queryRaw: jest.fn().mockResolvedValue([]),
  };
  Object.defineProperty(prisma, 'read', { get: () => prisma });

  const audit = { log: jest.fn().mockResolvedValue(undefined) };
  const settingsSvc = {
    current: jest.fn().mockResolvedValue(settings),
    activeDelegateOf: jest.fn().mockResolvedValue(opts.delegateOf ?? null),
  };
  const effects = {
    syncAttendanceOnApproval: jest.fn().mockResolvedValue({ created: 2 }),
    emitApproved: jest.fn().mockResolvedValue(undefined),
    removeAttendanceOnCancel: jest.fn().mockResolvedValue({ removed: 2 }),
  };
  const svc = new LeaveManagementService(
    prisma as never,
    audit as never,
    settingsSvc as never,
    effects as never,
  );
  return { svc, prisma, audit, effects, settingsSvc };
}

// 5 dias úteis, bem no futuro (sem feriados de Out/Nov nas datas escolhidas abaixo).
const dto = (over: Record<string, unknown> = {}) =>
  ({
    userId: 10,
    leaveTypeCode: 'VACATION',
    startDate: '2031-03-10', // segunda
    endDate: '2031-03-14', // sexta
    ...over,
  }) as never;

afterEach(() => resetLeaveCalendar());

describe('reserva de saldo (§13)', () => {
  it('submeter um pedido PENDING reserva os dias e numera o pedido', async () => {
    const { svc, prisma } = harness();
    const r = (await svc.create(dto(), 10)) as { requestNumber: string };

    expect(r.requestNumber).toBe('LV-2026-000077');
    expect(prisma.leaveBalance.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { reserved: { increment: 5 } } }),
    );
    expect(prisma.leaveBalanceHistory.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ kind: 'RESERVATION' }) }),
    );
    // o saldo atribuído ainda não mexe — só quando for aprovado
    expect(prisma.leaveBalance.upsert).not.toHaveBeenCalled();
  });

  it('o disponível desconta o que outros pedidos pendentes já reservaram', async () => {
    const { svc } = harness({ balance: { balance: 22, reserved: 20 } });
    await expect(svc.create(dto(), 10)).rejects.toThrow(/Saldo insuficiente: tem 2 dias/);
  });

  it('com o saldo bloqueado, uma reserva concorrente que já não cabe falha (sem sobre-reservar)', async () => {
    const { svc, prisma } = harness();
    // validação inicial vê 22 livres; sob lock, outro pedido já reservou 20
    prisma.leaveBalance.findUnique
      .mockResolvedValueOnce({ balance: 22, reserved: 0 })
      .mockResolvedValueOnce({ balance: 22, reserved: 20 });
    await expect(svc.create(dto(), 10)).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.leaveBalance.update).not.toHaveBeenCalled();
  });

  it('recusar liberta a reserva', async () => {
    const { svc, prisma } = harness({ balance: { balance: 22, reserved: 5 } });
    prisma.leaveRequest.findUnique.mockResolvedValue({
      id: 77,
      userId: 10,
      status: 'PENDING',
      workDays: 5,
      leaveTypeCode: 'VACATION',
      approvals: [],
      documents: [],
      impactPreview: null,
    });

    await svc.processApproval(77, 2, { action: 'REJECT', notes: 'Equipa sem cobertura' } as never);

    expect(prisma.leaveBalance.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { reserved: { decrement: 5 } } }),
    );
    expect(prisma.leaveBalanceHistory.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ kind: 'RELEASE' }) }),
    );
    // e as etapas seguintes deixam de aguardar decisão
    expect(prisma.leaveApproval.updateMany).toHaveBeenCalled();
  });

  it('aprovar passa os dias de reservados para gozados e sincroniza assiduidade/automação', async () => {
    const { svc, prisma, effects } = harness({ balance: { balance: 22, reserved: 5 } });
    prisma.leaveRequest.findUnique.mockResolvedValue({
      id: 77,
      userId: 10,
      status: 'PENDING',
      workDays: 5,
      leaveTypeCode: 'VACATION',
      startDate: new Date('2031-03-10'),
      endDate: new Date('2031-03-14'),
      approvals: [],
      documents: [],
      impactPreview: null,
    });

    await svc.processApproval(77, 2, { action: 'APPROVE' } as never);

    expect(prisma.leaveBalance.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: {
          balance: { decrement: 5 },
          used: { increment: 5 },
          reserved: { decrement: 5 },
        },
      }),
    );
    expect(prisma.leaveBalanceHistory.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ kind: 'USAGE', change: -5 }) }),
    );
    expect(effects.syncAttendanceOnApproval).toHaveBeenCalledTimes(1);
    expect(effects.emitApproved).toHaveBeenCalledTimes(1);
  });

  it('sem gestor o pedido é aprovado na hora (a reserva converte-se logo em gozo)', async () => {
    const { svc, prisma, effects } = harness({ manager: false });
    await svc.create(dto(), 10);
    expect(prisma.leaveBalance.upsert).toHaveBeenCalled();
    expect(effects.syncAttendanceOnApproval).toHaveBeenCalled();
  });
});

describe('cancelamento (§10 política de cancelamento)', () => {
  const approved = (startInDays: number) => ({
    id: 77,
    userId: 10,
    status: 'APPROVED',
    workDays: 5,
    leaveTypeCode: 'VACATION',
    startDate: new Date(futureDay(startInDays)),
    endDate: new Date(futureDay(startInDays + 4)),
    approvals: [],
    documents: [],
    impactPreview: null,
  });
  const owner = { id: 10, role: { name: 'COLABORADOR' } } as never;
  const rh = { id: 1, role: { name: 'RH' } } as never;

  it('cancelar pendente liberta a reserva e regista quem/quando/porquê', async () => {
    const { svc, prisma } = harness({ balance: { balance: 22, reserved: 5 } });
    prisma.leaveRequest.findUnique.mockResolvedValue({ ...approved(30), status: 'PENDING' });

    await svc.cancel(77, 10, { reason: 'Mudei de planos', actor: owner });

    const data = prisma.leaveRequest.update.mock.calls[0][0].data;
    expect(data.status).toBe('CANCELLED');
    expect(data.cancelledById).toBe(10);
    expect(data.cancelReason).toBe('Mudei de planos');
    expect(data.cancelledAt).toBeInstanceOf(Date);
    expect(prisma.leaveBalance.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { reserved: { decrement: 5 } } }),
    );
  });

  it('cancelar aprovado devolve saldo e remove os registos de assiduidade', async () => {
    const { svc, prisma, effects } = harness();
    prisma.leaveRequest.findUnique.mockResolvedValue(approved(30));
    await svc.cancel(77, 10, { actor: owner });
    expect(prisma.leaveBalanceHistory.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ kind: 'REVERSAL', change: 5 }) }),
    );
    expect(effects.removeAttendanceOnCancel).toHaveBeenCalledWith(77);
  });

  it('política que proíbe o colaborador de cancelar aprovados → 403', async () => {
    const { svc, prisma } = harness({ settings: { employeeCanCancelApproved: false } });
    prisma.leaveRequest.findUnique.mockResolvedValue(approved(30));
    await expect(svc.cancel(77, 10, { actor: owner })).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.leaveRequest.update).not.toHaveBeenCalled();
  });

  it('antecedência mínima de cancelamento é aplicada ao colaborador', async () => {
    const { svc, prisma } = harness({ settings: { cancelApprovedMinDaysBefore: 7 } });
    prisma.leaveRequest.findUnique.mockResolvedValue(approved(3));
    await expect(svc.cancel(77, 10, { actor: owner })).rejects.toThrow(/7 dia\(s\) de antecedência/);
  });

  it('ADMIN/RH cancelam fora da política e fica registado quem cancelou', async () => {
    const { svc, prisma, audit } = harness({
      settings: { employeeCanCancelApproved: false, cancelApprovedMinDaysBefore: 7 },
    });
    prisma.leaveRequest.findUnique.mockResolvedValue(approved(3));

    await svc.cancel(77, 10, { reason: 'Necessidade de serviço', actor: rh });

    expect(prisma.leaveRequest.update.mock.calls[0][0].data.cancelledById).toBe(1);
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'LEAVE_CANCELLED',
        userId: 1,
        metadata: { wasApproved: true, byOwner: false },
      }),
    );
  });

  it('outro colaborador não cancela pedidos alheios', async () => {
    const { svc, prisma } = harness();
    prisma.leaveRequest.findUnique.mockResolvedValue(approved(30));
    await expect(
      svc.cancel(77, 99, { actor: { id: 99, role: { name: 'COLABORADOR' } } as never }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});

describe('transição de saldos (§10)', () => {
  const type = { code: 'VACATION', annualLimit: 22, carryOverLimit: 10, allowCarryOver: true };
  const withBalances = (h: ReturnType<typeof harness>, rows: unknown[]) => {
    h.prisma.leaveTypeConfig.findMany.mockResolvedValue([type]);
    h.prisma.leaveBalance.findMany.mockResolvedValue(rows);
  };

  it('guarda o saldo novo = anual + transitado (antes guardava só o anual)', async () => {
    const h = harness();
    withBalances(h, [{ userId: 1, balance: 8, reserved: 0 }]);
    await h.svc.processCarryOver(2026, 99);
    expect(h.prisma.leaveBalance.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { balance: 30, used: 0 } }),
    );
    expect(h.prisma.leaveBalanceHistory.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ kind: 'CARRY_OVER', reason: 'Transição de saldo 2026' }),
      }),
    );
  });

  it('o tecto global das Configurações limita o do tipo', async () => {
    const h = harness({ settings: { carryOverMaxDays: 3 } });
    withBalances(h, [{ userId: 1, balance: 8, reserved: 0 }]);
    const r = await h.svc.processCarryOver(2026);
    expect(r.results[0].carryOver).toBe(3);
  });

  it('dias reservados por pedidos pendentes não transitam', async () => {
    const h = harness();
    withBalances(h, [{ userId: 1, balance: 8, reserved: 6 }]);
    const r = await h.svc.processCarryOver(2026);
    expect(r.results[0].carryOver).toBe(2);
  });

  it('com a transição desactivada ninguém transita', async () => {
    const h = harness({ settings: { carryOverEnabled: false } });
    withBalances(h, [{ userId: 1, balance: 8, reserved: 0 }]);
    const r = await h.svc.processCarryOver(2026);
    expect(r.processed).toBe(0);
    expect(h.prisma.leaveBalance.update).not.toHaveBeenCalled();
  });

  it('é idempotente: voltar a correr o mesmo ano não transita outra vez', async () => {
    const h = harness();
    withBalances(h, [{ userId: 1, balance: 8, reserved: 0 }]);
    h.prisma.leaveBalanceHistory.findFirst.mockResolvedValue({ id: 1 });
    const r = await h.svc.processCarryOver(2026);
    expect(r).toMatchObject({ processed: 0, skipped: 1 });
    expect(h.prisma.leaveBalance.update).not.toHaveBeenCalled();
  });
});

describe('regras das Configurações na submissão (§10)', () => {
  it('regra "dias de calendário" ignora fins de semana e feriados', async () => {
    const { svc, prisma } = harness({ settings: { dayCountRule: 'CALENDAR_DAYS' } });
    await svc.create(dto({ startDate: '2031-03-10', endDate: '2031-03-16' }), 10);
    expect(prisma.leaveRequest.create.mock.calls[0][0].data.workDays).toBe(7);
  });

  it('a regra da empresa manda sobre o tipo (dias úteis num tipo de calendário)', async () => {
    const { svc, prisma } = harness({
      settings: { dayCountRule: 'WORK_DAYS' },
      type: { countWorkDaysOnly: false },
    });
    await svc.create(dto({ startDate: '2031-03-10', endDate: '2031-03-16' }), 10);
    expect(prisma.leaveRequest.create.mock.calls[0][0].data.workDays).toBe(5);
  });

  it('horas por dia vêm das Configurações', async () => {
    const { svc, prisma } = harness({ settings: { hoursPerDay: 6 } });
    await svc.create(
      dto({ endDate: '2031-03-10', durationMode: 'HOURS', hours: 3 }),
      10,
    );
    expect(prisma.leaveRequest.create.mock.calls[0][0].data.workDays).toBe(0.5);
  });

  it('antecedência máxima de pedido', async () => {
    const { svc } = harness({ settings: { maxAdvanceDays: 90 } });
    await expect(svc.create(dto(), 10)).rejects.toThrow(/no máximo 90 dias/);
  });

  it('antecedência mínima da empresa vale para tipos sem a sua', async () => {
    const { svc } = harness({ settings: { minNoticeDays: 10 } });
    await expect(
      svc.create(dto({ startDate: futureDay(2), endDate: futureDay(2) }), 10),
    ).rejects.toThrow(/10 dias de antecedência/);
  });

  it('férias fora da janela do período de férias → 400', async () => {
    const { svc } = harness({
      settings: { vacationWindowStart: '06-01', vacationWindowEnd: '09-30' },
    });
    await expect(svc.create(dto(), 10)).rejects.toThrow(/período 06-01 a 09-30/);
  });

  it('janela de férias que atravessa o fim do ano é respeitada', async () => {
    const { svc } = harness({
      settings: { vacationWindowStart: '11-15', vacationWindowEnd: '02-15' },
    });
    await expect(
      svc.create(dto({ startDate: '2031-12-22', endDate: '2031-12-26' }), 10),
    ).resolves.toBeDefined();
  });

  it('substituto obrigatório acima do limite de dias', async () => {
    const { svc } = harness({ settings: { substituteRequiredOverDays: 3 } });
    await expect(svc.create(dto(), 10)).rejects.toThrow(/exigem um substituto/);
    await expect(svc.create(dto({ substituteId: 4 }), 10)).resolves.toBeDefined();
  });

  it('rascunhos ficam isentos das regras de submissão', async () => {
    const { svc } = harness({ settings: { substituteRequiredOverDays: 3, maxAdvanceDays: 10 } });
    await expect(svc.create(dto({ saveAsDraft: true }), 10)).resolves.toBeDefined();
  });

  it('documentos exigidos por categoria de tipo', async () => {
    const { svc } = harness({ settings: { documentRequiredCategories: ['STATUTORY'] } });
    await expect(svc.create(dto(), 10)).rejects.toThrow(/exige um documento comprovativo/);
  });
});

describe('substituição de aprovadores (§10)', () => {
  it('etapa vai para o substituto activo e a troca fica no histórico', async () => {
    const { svc, prisma } = harness({ delegateOf: 8 });
    await svc.create(dto(), 10);
    const data = prisma.leaveApproval.create.mock.calls[0][0].data;
    expect(data.approverId).toBe(8);
    expect(data.reassignments.create).toMatchObject({
      fromApproverId: 2,
      toApproverId: 8,
      kind: 'DELEGATE',
    });
  });

  it('nunca delega no próprio requerente', async () => {
    const { svc, prisma } = harness({ delegateOf: 10 });
    await svc.create(dto(), 10);
    expect(prisma.leaveApproval.create.mock.calls[0][0].data.approverId).toBe(2);
  });

  it('sem substituição a etapa fica com o gestor', async () => {
    const { svc, prisma } = harness();
    await svc.create(dto(), 10);
    const data = prisma.leaveApproval.create.mock.calls[0][0].data;
    expect(data.approverId).toBe(2);
    expect(data.reassignments).toBeUndefined();
  });
});
