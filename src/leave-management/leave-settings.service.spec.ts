// Configurações do módulo Leave (docs/Modulo_Leave.md §10): versões com data
// de entrada em vigor, validações entre campos, feriados e delegações.
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import {
  diffSettings,
  LeaveSettingsService,
  mergeSettings,
  validateSettings,
} from './leave-settings.service';
import { DEFAULT_LEAVE_SETTINGS, LeaveSettings } from './leave-settings.dto';
import { AbsenceOccurrenceType } from './leave-management.dto';
import { holidaysForYear, resetLeaveCalendar } from './leave-calendar.helper';

const rh = { id: 1, role: { name: 'RH' } } as never;
const gestor = { id: 5, role: { name: 'GESTOR' } } as never;

function makeService() {
  const prisma: Record<string, unknown> = {
    leaveSettingVersion: {
      findFirst: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockImplementation(async ({ data }) => ({ id: 9, ...data })),
    },
    leaveHoliday: {
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn().mockResolvedValue(null),
      findUnique: jest.fn(),
      create: jest.fn().mockImplementation(async ({ data }) => ({ id: 3, ...data })),
      update: jest.fn().mockImplementation(async ({ data }) => ({ id: 3, ...data })),
      delete: jest.fn().mockResolvedValue({}),
    },
    leaveDelegation: {
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn().mockResolvedValue(null),
      findUnique: jest.fn(),
      create: jest.fn().mockImplementation(async ({ data }) => ({ id: 4, ...data })),
      update: jest.fn().mockResolvedValue({}),
    },
    user: {
      findUnique: jest.fn().mockResolvedValue({ id: 8, hrStatus: 'ACTIVE' }),
      findMany: jest.fn().mockResolvedValue([]),
    },
  };
  Object.defineProperty(prisma, 'read', { get: () => prisma });
  const audit = { log: jest.fn().mockResolvedValue(undefined) };
  const svc = new LeaveSettingsService(prisma as never, audit as never);
  return { svc, prisma, audit } as {
    svc: LeaveSettingsService;
    prisma: Record<string, Record<string, jest.Mock>>;
    audit: { log: jest.Mock };
  };
}

afterEach(() => resetLeaveCalendar());

describe('mergeSettings / diffSettings / validateSettings', () => {
  it('sem versão guardada devolve os valores por omissão', () => {
    expect(mergeSettings(undefined)).toEqual(DEFAULT_LEAVE_SETTINGS);
  });

  it('ignora chaves desconhecidas e mantém por omissão as que faltam', () => {
    const s = mergeSettings({ hoursPerDay: 7, lixo: true });
    expect(s.hoursPerDay).toBe(7);
    expect(s.workWeekDays).toEqual([1, 2, 3, 4, 5]);
    expect((s as unknown as Record<string, unknown>).lixo).toBeUndefined();
  });

  it('diffSettings lista só as chaves alteradas', () => {
    const next: LeaveSettings = { ...DEFAULT_LEAVE_SETTINGS, hoursPerDay: 6, decisionSlaDays: 5 };
    expect(diffSettings(DEFAULT_LEAVE_SETTINGS, next).sort()).toEqual([
      'decisionSlaDays',
      'hoursPerDay',
    ]);
  });

  it('rejeita semana sem dias úteis', () => {
    expect(() => validateSettings({ ...DEFAULT_LEAVE_SETTINGS, workWeekDays: [] })).toThrow(
      BadRequestException,
    );
  });

  it('rejeita período de férias só com início', () => {
    expect(() =>
      validateSettings({ ...DEFAULT_LEAVE_SETTINGS, vacationWindowStart: '06-01' }),
    ).toThrow(/início e o fim/);
  });

  it('rejeita horário com fim antes do início', () => {
    expect(() =>
      validateSettings({ ...DEFAULT_LEAVE_SETTINGS, workdayStart: '17:00', workdayEnd: '08:00' }),
    ).toThrow(BadRequestException);
  });

  it('rejeita ocorrência simultaneamente justificada e injustificada', () => {
    expect(() =>
      validateSettings({
        ...DEFAULT_LEAVE_SETTINGS,
        justifiedOccurrenceTypes: [AbsenceOccurrenceType.NO_SHOW],
        unjustifiedOccurrenceTypes: [AbsenceOccurrenceType.NO_SHOW],
      }),
    ).toThrow(/ao mesmo tempo/);
  });
});

describe('LeaveSettingsService.update', () => {
  it('exige o motivo da alteração', async () => {
    const { svc } = makeService();
    await expect(svc.update({ hoursPerDay: 7, changeNote: '  ' }, 1)).rejects.toThrow(
      /motivo/,
    );
  });

  it('cria uma nova versão imutável, regista na auditoria e invalida o cache', async () => {
    const { svc, prisma, audit } = makeService();
    await svc.current(); // aquece o cache com os valores por omissão
    prisma.leaveSettingVersion.findFirst
      .mockResolvedValueOnce(null) // versão-base à data
      .mockResolvedValue({
        id: 9,
        effectiveFrom: new Date(),
        values: { ...DEFAULT_LEAVE_SETTINGS, hoursPerDay: 7 },
      });

    await svc.update({ hoursPerDay: 7, changeNote: 'Horário reduzido' }, 1);

    const created = prisma.leaveSettingVersion.create.mock.calls[0][0].data;
    expect(created.values.hoursPerDay).toBe(7);
    expect(created.changeNote).toBe('Horário reduzido');
    expect(created.createdById).toBe(1);
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'LEAVE_SETTINGS_CHANGED',
        metadata: expect.objectContaining({ changedKeys: ['hoursPerDay'] }),
      }),
    );
    // cache invalidado: a leitura seguinte vê a nova versão
    expect((await svc.current()).hoursPerDay).toBe(7);
  });

  it('rejeita gravar sem alterar nada', async () => {
    const { svc } = makeService();
    await expect(
      svc.update({ hoursPerDay: DEFAULT_LEAVE_SETTINGS.hoursPerDay, changeNote: 'igual' }, 1),
    ).rejects.toThrow(/Nenhuma configuração/);
  });

  it('agendar para o futuro parte da versão que estará em vigor nessa data', async () => {
    const { svc, prisma } = makeService();
    const base = { ...DEFAULT_LEAVE_SETTINGS, decisionSlaDays: 5 };
    prisma.leaveSettingVersion.findFirst.mockResolvedValue({
      id: 2,
      effectiveFrom: new Date('2026-01-01'),
      values: base,
    });
    const future = new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10);

    await svc.update({ hoursPerDay: 6, effectiveFrom: future, changeNote: 'Nova jornada' }, 1);

    const created = prisma.leaveSettingVersion.create.mock.calls[0][0].data;
    expect(created.values.decisionSlaDays).toBe(5); // herdou
    expect(created.values.hoursPerDay).toBe(6);
    expect(created.effectiveFrom.toISOString().slice(0, 10)).toBe(future);
  });

  it('rejeita datas de vigência a mais de 2 anos', async () => {
    const { svc } = makeService();
    await expect(
      svc.update({ hoursPerDay: 6, effectiveFrom: '2099-01-01', changeNote: 'x' }, 1),
    ).rejects.toThrow(/demasiado longe/);
  });
});

describe('LeaveSettingsService — feriados por localização', () => {
  it('feriado personalizado fica activo no calendário após criar', async () => {
    const { svc, prisma } = makeService();
    prisma.leaveHoliday.findMany.mockResolvedValue([
      {
        id: 3,
        name: 'Dia da Cidade',
        date: new Date('2026-08-12'),
        location: 'Benguela',
        recurring: true,
        active: true,
      },
    ]);

    await svc.createHoliday(
      { name: 'Dia da Cidade', date: '2026-08-12', location: 'Benguela', recurring: true },
      1,
    );

    expect(holidaysForYear(2027, 'Benguela').get('2027-08-12')).toBe('Dia da Cidade');
    expect(holidaysForYear(2027, 'Luanda').has('2027-08-12')).toBe(false);
  });

  it('active=false suprime um feriado de base', async () => {
    const { svc, prisma } = makeService();
    prisma.leaveHoliday.findMany.mockResolvedValue([
      {
        id: 4,
        name: 'Carnaval',
        date: new Date('2026-03-08'),
        location: null,
        recurring: false,
        active: false,
      },
    ]);
    await svc.reloadCalendar();
    expect(holidaysForYear(2026).has('2026-03-08')).toBe(false);
  });

  it('rejeita feriado duplicado na mesma data e localização', async () => {
    const { svc, prisma } = makeService();
    prisma.leaveHoliday.findFirst.mockResolvedValue({ id: 1 });
    await expect(
      svc.createHoliday({ name: 'X', date: '2026-08-12' }, 1),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('remover feriado inexistente → 404', async () => {
    const { svc, prisma } = makeService();
    prisma.leaveHoliday.findUnique.mockResolvedValue(null);
    await expect(svc.deleteHoliday(77, 1)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('a semana de trabalho configurada chega ao calendário', async () => {
    const { svc, prisma } = makeService();
    prisma.leaveSettingVersion.findFirst.mockResolvedValue({
      id: 1,
      effectiveFrom: new Date('2026-01-01'),
      values: { ...DEFAULT_LEAVE_SETTINGS, workWeekDays: [0, 1, 2, 3, 4] },
    });
    await svc.reloadCalendar();
    const { getWorkWeekDays } = await import('./leave-calendar.helper');
    expect(getWorkWeekDays()).toEqual([0, 1, 2, 3, 4]);
  });
});

describe('LeaveSettingsService — delegações', () => {
  const dto = { delegateId: 8, startDate: '2026-11-01', endDate: '2026-11-10' };

  it('um aprovador delega em si mesmo → 400', async () => {
    const { svc } = makeService();
    await expect(svc.createDelegation({ ...dto, delegateId: 5 }, gestor)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('só ADMIN/RH delegam em nome de outro aprovador', async () => {
    const { svc } = makeService();
    await expect(svc.createDelegation({ ...dto, delegatorId: 99 }, gestor)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    await expect(svc.createDelegation({ ...dto, delegatorId: 99 }, rh)).resolves.toMatchObject({
      delegatorId: 99,
    });
  });

  it('fim antes do início → 400', async () => {
    const { svc } = makeService();
    await expect(
      svc.createDelegation({ ...dto, startDate: '2026-11-10', endDate: '2026-11-01' }, gestor),
    ).rejects.toThrow(/fim é anterior/);
  });

  it('períodos sobrepostos → 409', async () => {
    const { svc, prisma } = makeService();
    prisma.leaveDelegation.findFirst.mockResolvedValue({ id: 2 });
    await expect(svc.createDelegation(dto, gestor)).rejects.toBeInstanceOf(ConflictException);
  });

  it('substituto inexistente ou desligado → 404', async () => {
    const { svc, prisma } = makeService();
    prisma.user.findUnique.mockResolvedValue({ id: 8, hrStatus: 'TERMINATED' });
    await expect(svc.createDelegation(dto, gestor)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('só o delegante (ou ADMIN/RH) revoga', async () => {
    const { svc, prisma } = makeService();
    prisma.leaveDelegation.findUnique.mockResolvedValue({ id: 4, delegatorId: 6 });
    await expect(svc.revokeDelegation(4, gestor)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(svc.revokeDelegation(4, rh)).resolves.toBeDefined();
  });

  it('activeDelegateOf devolve o substituto em vigor, ou null', async () => {
    const { svc, prisma } = makeService();
    expect(await svc.activeDelegateOf(5)).toBeNull();
    prisma.leaveDelegation.findFirst.mockResolvedValue({ delegateId: 8 });
    expect(await svc.activeDelegateOf(5)).toBe(8);
  });
});
