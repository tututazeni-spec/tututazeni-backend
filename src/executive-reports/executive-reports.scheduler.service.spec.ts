import { BadRequestException, ForbiddenException } from '@nestjs/common';
import {
  ExecutiveReportsSchedulerService,
  computeNextRun,
  lastClosedPeriod,
} from './executive-reports.scheduler.service';

describe('computeNextRun', () => {
  const base = { hour: 8, dayOfWeek: null, dayOfMonth: null };

  it('semanal: próxima ocorrência do dia da semana, sempre depois de "from"', () => {
    // 2026-10-02 é sexta-feira (5); pedir segunda (1) às 08h → 2026-10-05
    const from = new Date(2026, 9, 2, 10, 0);
    const next = computeNextRun({ ...base, frequency: 'WEEKLY', dayOfWeek: 1 }, from);
    expect(next).toEqual(new Date(2026, 9, 5, 8, 0));
  });

  it('semanal: se hoje é o dia mas a hora já passou, salta 7 dias', () => {
    const from = new Date(2026, 9, 5, 9, 0); // segunda, depois das 08h
    const next = computeNextRun({ ...base, frequency: 'WEEKLY', dayOfWeek: 1 }, from);
    expect(next).toEqual(new Date(2026, 9, 12, 8, 0));
  });

  it('mensal: dia do mês ainda por vir neste mês', () => {
    const next = computeNextRun(
      { ...base, frequency: 'MONTHLY', dayOfMonth: 15 },
      new Date(2026, 9, 2, 10),
    );
    expect(next).toEqual(new Date(2026, 9, 15, 8));
  });

  it('mensal: dia já passado → mês seguinte (virada de ano incluída)', () => {
    const next = computeNextRun(
      { ...base, frequency: 'MONTHLY', dayOfMonth: 1 },
      new Date(2026, 11, 10),
    );
    expect(next).toEqual(new Date(2027, 0, 1, 8));
  });

  it('trimestral: avança para o início do trimestre seguinte', () => {
    const next = computeNextRun(
      { ...base, frequency: 'QUARTERLY', dayOfMonth: 1 },
      new Date(2026, 9, 2), // 1 Out 08h já passou → próximo trimestre
    );
    expect(next).toEqual(new Date(2027, 0, 1, 8));
  });

  it('anual: 1 de Janeiro do ano seguinte', () => {
    const next = computeNextRun(
      { ...base, frequency: 'ANNUAL', dayOfMonth: 1 },
      new Date(2026, 5, 1),
    );
    expect(next).toEqual(new Date(2027, 0, 1, 8));
  });

  it('o resultado é estritamente posterior a "from"', () => {
    const from = new Date(2026, 9, 1, 8, 0, 0, 0);
    const next = computeNextRun({ ...base, frequency: 'MONTHLY', dayOfMonth: 1 }, from);
    expect(next.getTime()).toBeGreaterThan(from.getTime());
  });
});

describe('lastClosedPeriod', () => {
  const day = (iso?: string) => (iso ? new Date(iso) : new Date(0));

  it('mensal: a 1 de Outubro cobre Setembro completo', () => {
    const f = lastClosedPeriod('MONTHLY', new Date(2026, 9, 1, 8));
    const from = day(f.dateFrom);
    const to = day(f.dateTo);
    expect(f.period).toBe('custom');
    expect(from).toEqual(new Date(2026, 8, 1));
    expect(to.getMonth()).toBe(8);
    expect(to.getDate()).toBe(30);
  });

  it('trimestral: em Outubro cobre Julho–Setembro', () => {
    const f = lastClosedPeriod('QUARTERLY', new Date(2026, 9, 1, 8));
    expect(day(f.dateFrom)).toEqual(new Date(2026, 6, 1));
    expect(day(f.dateTo).getMonth()).toBe(8);
    expect(day(f.dateTo).getDate()).toBe(30);
  });

  it('trimestral em Janeiro cobre o 4.º trimestre do ano anterior', () => {
    const f = lastClosedPeriod('QUARTERLY', new Date(2027, 0, 1, 8));
    expect(day(f.dateFrom)).toEqual(new Date(2026, 9, 1));
    expect(day(f.dateTo).getFullYear()).toBe(2026);
    expect(day(f.dateTo).getMonth()).toBe(11);
  });

  it('anual: cobre o ano civil anterior', () => {
    const f = lastClosedPeriod('ANNUAL', new Date(2027, 0, 1, 8));
    expect(day(f.dateFrom)).toEqual(new Date(2026, 0, 1));
    expect(day(f.dateTo).getMonth()).toBe(11);
    expect(day(f.dateTo).getDate()).toBe(31);
  });

  it('semanal: 7 dias terminando ontem', () => {
    const f = lastClosedPeriod('WEEKLY', new Date(2026, 9, 8, 8));
    expect(day(f.dateFrom)).toEqual(new Date(2026, 9, 1));
    expect(day(f.dateTo).getDate()).toBe(7);
  });

  it('compara sempre com o período anterior', () => {
    expect(lastClosedPeriod('MONTHLY').compareWith).toBe('previous');
  });
});

describe('ExecutiveReportsSchedulerService', () => {
  const prisma: any = {
    executiveReportSchedule: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      updateMany: jest.fn(),
      update: jest.fn().mockResolvedValue({}),
      create: jest.fn(),
    },
    executiveReportScheduleRun: {
      create: jest.fn().mockResolvedValue({ id: 99 }),
      update: jest.fn().mockResolvedValue({}),
    },
    user: { findMany: jest.fn() },
  };
  prisma.read = prisma;
  const generation: any = { run: jest.fn(), resolveSpec: jest.fn(), canUseTemplate: jest.fn() };
  const notifications: any = { sendToUser: jest.fn().mockResolvedValue(undefined) };

  const svc = new ExecutiveReportsSchedulerService(prisma, generation, notifications);

  const admin: any = { id: 1, role: { name: 'ADMIN' } };
  const schedule = (over: Record<string, unknown> = {}) => ({
    id: 5,
    name: 'Mensal RH',
    frequency: 'MONTHLY',
    hour: 8,
    dayOfWeek: null,
    dayOfMonth: 1,
    templateCode: 'MONTHLY_HR',
    templateId: null,
    format: 'PDF',
    filters: null,
    recipientIds: [10, 11],
    createdById: 1,
    createdBy: { id: 1, active: true, role: { name: 'ADMIN' } },
    nextRunAt: new Date(2026, 9, 1, 8),
    ...over,
  });

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.executiveReportScheduleRun.create.mockResolvedValue({ id: 99 });
    prisma.executiveReportScheduleRun.update.mockResolvedValue({});
    prisma.executiveReportSchedule.update.mockResolvedValue({});
    notifications.sendToUser.mockResolvedValue(undefined);
  });

  describe('create — destinatários e permissões', () => {
    beforeEach(() => {
      generation.resolveSpec.mockResolvedValue({ def: { code: 'X' }, spec: {} });
      generation.canUseTemplate.mockReturnValue(true);
    });

    it('rejeita destinatário sem perfil com acesso (GESTOR)', async () => {
      prisma.user.findMany.mockResolvedValue([
        { id: 10, active: true, fullName: 'Ana', role: { name: 'GESTOR' } },
      ]);
      await expect(
        svc.create(admin, {
          name: 'x',
          templateCode: 'X',
          frequency: 'MONTHLY',
          format: 'PDF',
          recipientIds: [10],
        } as any),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.executiveReportSchedule.create).not.toHaveBeenCalled();
    });

    it('rejeita destinatário inactivo ou inexistente', async () => {
      prisma.user.findMany.mockResolvedValue([
        { id: 10, active: false, fullName: 'Ana', role: { name: 'RH' } },
      ]);
      await expect(
        svc.create(admin, {
          name: 'x',
          templateCode: 'X',
          frequency: 'MONTHLY',
          format: 'PDF',
          recipientIds: [10, 77],
        } as any),
      ).rejects.toThrow(/inexistente ou inactivo/);
    });

    it('rejeita sem templateCode nem templateId', async () => {
      await expect(
        svc.create(admin, { name: 'x', frequency: 'MONTHLY', recipientIds: [1] } as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('proíbe usar um modelo sem permissão do perfil', async () => {
      generation.canUseTemplate.mockReturnValue(false);
      await expect(
        svc.create(
          { id: 2, role: { name: 'RH' } } as any,
          {
            name: 'x',
            templateCode: 'X',
            frequency: 'MONTHLY',
            format: 'PDF',
            recipientIds: [10],
          } as any,
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('cria com nextRunAt calculada e destinatários deduplicados', async () => {
      prisma.user.findMany.mockResolvedValue([
        { id: 10, active: true, fullName: 'Ana', role: { name: 'RH' } },
      ]);
      prisma.executiveReportSchedule.create.mockResolvedValue({ id: 1 });
      await svc.create(admin, {
        name: 'x',
        templateCode: 'X',
        frequency: 'MONTHLY',
        format: 'PDF',
        recipientIds: [10, 10],
      } as any);
      const data = prisma.executiveReportSchedule.create.mock.calls[0][0].data;
      expect(data.recipientIds).toEqual([10]);
      expect(data.nextRunAt).toBeInstanceOf(Date);
      expect(data.dayOfMonth).toBe(1);
      expect(data.dayOfWeek).toBeNull();
    });
  });

  describe('alterar/eliminar — só o autor ou ADMIN/DIRECTOR', () => {
    it('RH que não é o autor não elimina', async () => {
      prisma.executiveReportSchedule.findUnique.mockResolvedValue({ id: 5, createdById: 1 });
      await expect(svc.remove(5, { id: 2, role: { name: 'RH' } } as any)).rejects.toThrow(
        ForbiddenException,
      );
      expect(prisma.executiveReportSchedule.update).not.toHaveBeenCalled();
    });
  });

  describe('runDue — sem execuções duplicadas', () => {
    it('só executa quando a reclamação atómica avança nextRunAt (count 1)', async () => {
      prisma.executiveReportSchedule.findMany.mockResolvedValue([schedule()]);
      prisma.executiveReportSchedule.updateMany.mockResolvedValue({ count: 1 });
      const exec = jest.spyOn(svc as any, 'execute').mockResolvedValue({});
      await svc.runDue();
      expect(exec).toHaveBeenCalledWith(5);
      const claim = prisma.executiveReportSchedule.updateMany.mock.calls[0][0];
      expect(claim.where.nextRunAt).toEqual(new Date(2026, 9, 1, 8));
      expect(claim.data.nextRunAt.getTime()).toBeGreaterThan(Date.now() - 1000);
      exec.mockRestore();
    });

    it('outra instância já reclamou (count 0) → não executa', async () => {
      prisma.executiveReportSchedule.findMany.mockResolvedValue([schedule()]);
      prisma.executiveReportSchedule.updateMany.mockResolvedValue({ count: 0 });
      const exec = jest.spyOn(svc as any, 'execute').mockResolvedValue({});
      await svc.runDue();
      expect(exec).not.toHaveBeenCalled();
      exec.mockRestore();
    });

    it('um erro inesperado numa execução não impede as seguintes', async () => {
      prisma.executiveReportSchedule.findMany.mockResolvedValue([
        schedule({ id: 1 }),
        schedule({ id: 2 }),
      ]);
      prisma.executiveReportSchedule.updateMany.mockResolvedValue({ count: 1 });
      const exec = jest
        .spyOn(svc as any, 'execute')
        .mockRejectedValueOnce(new Error('boom'))
        .mockResolvedValueOnce({});
      await expect(svc.runDue()).resolves.toEqual({ processed: 2 });
      expect(exec).toHaveBeenCalledTimes(2);
      exec.mockRestore();
    });
  });

  describe('execute — registo de resultados e falhas de integração', () => {
    const spec = { sections: ['kpis'], reportType: 'MONTHLY' };

    beforeEach(() => {
      prisma.executiveReportSchedule.findUnique.mockResolvedValue(schedule());
      generation.resolveSpec.mockResolvedValue({ spec });
    });

    it('SUCCESS: entrega a todos e regista a execução', async () => {
      generation.run.mockResolvedValue({ id: 700, title: 'Relatório' });
      prisma.user.findMany.mockResolvedValue([
        { id: 10, active: true, role: { name: 'RH' } },
        { id: 11, active: true, role: { name: 'ADMIN' } },
      ]);
      const res = await (svc as any).execute(5);
      expect(res).toMatchObject({ status: 'SUCCESS', delivered: [10, 11], rejected: [] });
      expect(prisma.executiveReportScheduleRun.update.mock.calls[0][0].data).toMatchObject({
        status: 'SUCCESS',
        reportId: 700,
      });
      expect(prisma.executiveReportSchedule.update.mock.calls[0][0].data).toMatchObject({
        lastStatus: 'SUCCESS',
        lastError: null,
        lastReportId: 700,
      });
    });

    it('sem filtros guardados, usa o último período fechado (não "hoje")', async () => {
      generation.run.mockResolvedValue({ id: 1, title: 't' });
      prisma.user.findMany.mockResolvedValue([]);
      await (svc as any).execute(5);
      const opts = generation.run.mock.calls[0][2];
      expect(opts.filters.period).toBe('custom');
      expect(opts.filters.dateFrom).toBeDefined();
      expect(opts.scheduleId).toBe(5);
    });

    it('PARTIAL: destinatário perdeu o perfil → rejeitado, os restantes recebem', async () => {
      generation.run.mockResolvedValue({ id: 700, title: 'R' });
      prisma.user.findMany.mockResolvedValue([
        { id: 10, active: true, role: { name: 'RH' } },
        { id: 11, active: true, role: { name: 'COLABORADOR' } },
      ]);
      const res = await (svc as any).execute(5);
      expect(res).toMatchObject({ status: 'PARTIAL', delivered: [10], rejected: [11] });
    });

    it('secção restrita: RH deixa de receber, ADMIN recebe', async () => {
      generation.resolveSpec.mockResolvedValue({ spec: { sections: ['costs'] } });
      generation.run.mockResolvedValue({ id: 700, title: 'R' });
      prisma.user.findMany.mockResolvedValue([
        { id: 10, active: true, role: { name: 'RH' } },
        { id: 11, active: true, role: { name: 'ADMIN' } },
      ]);
      const res = await (svc as any).execute(5);
      expect(res).toMatchObject({ delivered: [11], rejected: [10] });
    });

    it('NO_RECIPIENTS quando ninguém pode receber', async () => {
      generation.run.mockResolvedValue({ id: 700, title: 'R' });
      prisma.user.findMany.mockResolvedValue([{ id: 10, active: false, role: { name: 'RH' } }]);
      const res = await (svc as any).execute(5);
      expect(res.status).toBe('NO_RECIPIENTS');
    });

    it('falha na notificação de um destinatário não aborta os outros', async () => {
      generation.run.mockResolvedValue({ id: 700, title: 'R' });
      prisma.user.findMany.mockResolvedValue([
        { id: 10, active: true, role: { name: 'RH' } },
        { id: 11, active: true, role: { name: 'RH' } },
      ]);
      notifications.sendToUser.mockRejectedValueOnce(new Error('smtp down'));
      const res = await (svc as any).execute(5);
      expect(res).toMatchObject({ status: 'PARTIAL', delivered: [11], rejected: [10] });
    });

    it('falha de geração: regista FAILED, guarda o erro e avisa o autor', async () => {
      generation.run.mockRejectedValue(new Error('módulo origem indisponível'));
      const res = await (svc as any).execute(5);
      expect(res).toMatchObject({ status: 'FAILED', error: 'módulo origem indisponível' });
      expect(prisma.executiveReportScheduleRun.update.mock.calls[0][0].data).toMatchObject({
        status: 'FAILED',
        errorMessage: 'módulo origem indisponível',
      });
      expect(prisma.executiveReportSchedule.update.mock.calls[0][0].data).toMatchObject({
        lastStatus: 'FAILED',
        lastError: 'módulo origem indisponível',
      });
      expect(notifications.sendToUser).toHaveBeenCalledWith(
        1,
        expect.objectContaining({ type: 'EXECUTIVE_REPORT_FAILED' }),
      );
    });

    it('autor sem permissão: não gera, regista FAILED', async () => {
      prisma.executiveReportSchedule.findUnique.mockResolvedValue(
        schedule({ createdBy: { id: 1, active: true, role: { name: 'COLABORADOR' } } }),
      );
      const res = await (svc as any).execute(5);
      expect(res.status).toBe('FAILED');
      expect(generation.run).not.toHaveBeenCalled();
    });

    it('autor inactivo: não gera', async () => {
      prisma.executiveReportSchedule.findUnique.mockResolvedValue(
        schedule({ createdBy: { id: 1, active: false, role: { name: 'ADMIN' } } }),
      );
      const res = await (svc as any).execute(5);
      expect(res.status).toBe('FAILED');
      expect(generation.run).not.toHaveBeenCalled();
    });

    it('falha ao notificar o autor da falha não rebenta a execução', async () => {
      generation.run.mockRejectedValue(new Error('x'));
      notifications.sendToUser.mockRejectedValue(new Error('notif down'));
      await expect((svc as any).execute(5)).resolves.toMatchObject({ status: 'FAILED' });
    });
  });
});
