import { ConflictException, NotFoundException } from '@nestjs/common';
import { PayslipsService } from './payslips.service';
import { CurrentUserData } from '../../common/decorators';

/**
 * Lacunas dos specs existentes: listagens (isolamento por dono, rascunhos),
 * ciclo de vida das disputas e geração do código de recibo.
 */
describe('PayslipsService — listagens, disputas e código de recibo', () => {
  const owner = { id: 10, role: { name: 'COLABORADOR' } } as unknown as CurrentUserData;
  const rh = { id: 1, role: { name: 'RH' } } as unknown as CurrentUserData;

  let prisma: any;
  let service: PayslipsService;

  beforeEach(() => {
    prisma = {
      payslip: {
        findUnique: jest.fn(),
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
        create: jest.fn().mockImplementation(async ({ data }) => data),
        update: jest.fn().mockResolvedValue({}),
      },
      payslipDispute: {
        create: jest.fn().mockResolvedValue({ id: 1 }),
        findUnique: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
        update: jest.fn().mockImplementation(async ({ data }) => ({ id: 1, ...data })),
      },
      employeeCompensation: { findFirst: jest.fn().mockResolvedValue(null) },
      notificationLog: { create: jest.fn().mockResolvedValue({}) },
    };
    prisma.read = prisma;
    service = new PayslipsService(prisma);
  });

  describe('getMyPayslips', () => {
    it('só devolve recibos do próprio utilizador e nunca rascunhos', async () => {
      await service.getMyPayslips(10, {} as never);
      expect(prisma.payslip.findMany.mock.calls[0][0].where).toEqual({
        userId: 10,
        status: { not: 'DRAFT' },
      });
    });

    it('filtra por ano sem perder o isolamento por utilizador', async () => {
      await service.getMyPayslips(10, { year: '2026' } as never);
      expect(prisma.payslip.count.mock.calls[0][0].where).toEqual({
        userId: 10,
        status: { not: 'DRAFT' },
        period: { startsWith: '2026' },
      });
    });

    it('limite por omissão é 12 e pagina com skip/take', async () => {
      await service.getMyPayslips(10, { page: 3 } as never);
      const q = prisma.payslip.findMany.mock.calls[0][0];
      expect(q.take).toBe(12);
      expect(q.skip).toBe(24);
    });

    it('não expõe campos fiscais sensíveis na lista (só o resumo)', async () => {
      await service.getMyPayslips(10, {} as never);
      const select = prisma.payslip.findMany.mock.calls[0][0].select;
      expect(select).not.toHaveProperty('user');
      expect(select).not.toHaveProperty('irtFormula');
    });
  });

  describe('findAll (RH)', () => {
    it('o ano é ignorado quando o período exacto é indicado', async () => {
      await service.findAll({ period: '2026-03', year: '2025' } as never);
      expect(prisma.payslip.findMany.mock.calls[0][0].where.period).toBe('2026-03');
    });

    it('o ano filtra por prefixo quando não há período', async () => {
      await service.findAll({ year: '2025' } as never);
      expect(prisma.payslip.findMany.mock.calls[0][0].where.period).toEqual({
        startsWith: '2025',
      });
    });

    it('combina userId e status', async () => {
      await service.findAll({ userId: 7, status: 'ISSUED' } as never);
      expect(prisma.payslip.findMany.mock.calls[0][0].where).toEqual({
        userId: 7,
        status: 'ISSUED',
      });
    });
  });

  describe('findOne — visibilidade de rascunhos ao dono', () => {
    const draft = { id: 5, userId: 10, status: 'DRAFT', receiptCode: 'REC-X' };

    it('RH vê rascunhos (necessário para rever antes de emitir)', async () => {
      prisma.payslip.findUnique.mockResolvedValue(draft);
      await expect(service.findOne(5, rh)).resolves.toMatchObject({ status: 'DRAFT' });
    });

    // /my/:id, /my/:id/pdf, acknowledge e createDispute passam todos por findOne;
    // getMyPayslips já escondia DRAFT, por isso findOne tem de ser coerente.
    it('o dono NÃO lê o próprio recibo em rascunho (404)', async () => {
      prisma.payslip.findUnique.mockResolvedValue(draft);
      await expect(service.findOne(5, owner)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('o dono lê o recibo assim que é emitido', async () => {
      prisma.payslip.findUnique.mockResolvedValue({ ...draft, status: 'ISSUED' });
      await expect(service.findOne(5, owner)).resolves.toMatchObject({ status: 'ISSUED' });
    });

    it('o dono não consegue disputar nem confirmar um rascunho', async () => {
      prisma.payslip.findUnique.mockResolvedValue(draft);
      await expect(service.createDispute(5, owner, { reason: 'x' } as never)).rejects.toThrow(
        NotFoundException,
      );
      await expect(service.acknowledge(5, owner)).rejects.toThrow(NotFoundException);
      expect(prisma.payslipDispute.create).not.toHaveBeenCalled();
      expect(prisma.payslip.update).not.toHaveBeenCalled();
    });

    it('chamada interna sem utilizador continua a ver rascunhos (ex.: geração de PDF)', async () => {
      prisma.payslip.findUnique.mockResolvedValue(draft);
      await expect(service.findOne(5)).resolves.toMatchObject({ status: 'DRAFT' });
    });
  });

  describe('create — código de recibo', () => {
    it('gera REC-<AAAAMM>-<userId com 4 dígitos>-<8 hex>, único por chamada', async () => {
      const dto = { userId: 42, period: '2026-03', baseSalary: 300000 } as never;
      const a: any = await service.create(dto);
      const b: any = await service.create(dto);
      expect(a.receiptCode).toMatch(/^REC-202603-0042-[0-9A-F]{8}$/);
      expect(a.receiptCode).not.toBe(b.receiptCode);
    });

    it('nasce sempre em DRAFT, mesmo que o dto traga outro estado', async () => {
      const created: any = await service.create({
        userId: 1,
        period: '2026-03',
        status: 'ISSUED',
      } as never);
      expect(created.status).toBe('DRAFT');
    });
  });

  describe('createDispute', () => {
    it('regista a disputa com o utilizador autenticado, e não com um id vindo do corpo', async () => {
      prisma.payslip.findUnique.mockResolvedValue({
        id: 5,
        userId: 10,
        status: 'ISSUED',
        receiptCode: 'REC-1',
      });
      await service.createDispute(5, owner, {
        reason: 'Valor errado',
        details: 'x',
        userId: 999,
      } as never);
      expect(prisma.payslipDispute.create.mock.calls[0][0].data).toMatchObject({
        payslipId: 5,
        userId: 10,
        status: 'OPEN',
      });
    });

    it('recibo inexistente → 404 e nada é escrito', async () => {
      prisma.payslip.findUnique.mockResolvedValue(null);
      await expect(service.createDispute(5, owner, { reason: 'x' } as never)).rejects.toThrow(
        NotFoundException,
      );
      expect(prisma.payslipDispute.create).not.toHaveBeenCalled();
      expect(prisma.payslip.update).not.toHaveBeenCalled();
    });
  });

  describe('listDisputes', () => {
    it('aplica filtros de estado e utilizador e pagina', async () => {
      await service.listDisputes({ status: 'OPEN', userId: 3, page: 2, limit: 5 } as never);
      const q = prisma.payslipDispute.findMany.mock.calls[0][0];
      expect(q.where).toEqual({ status: 'OPEN', userId: 3 });
      expect(q.skip).toBe(5);
      expect(q.take).toBe(5);
    });

    it('sem filtros lista todas, mais recentes primeiro', async () => {
      await service.listDisputes({} as never);
      const q = prisma.payslipDispute.findMany.mock.calls[0][0];
      expect(q.where).toEqual({});
      expect(q.orderBy).toEqual({ createdAt: 'desc' });
    });
  });

  describe('resolveDispute', () => {
    const open = { id: 1, payslipId: 5, userId: 10, status: 'OPEN' };

    it('disputa inexistente → 404', async () => {
      prisma.payslipDispute.findUnique.mockResolvedValue(null);
      await expect(service.resolveDispute(1, { resolution: 'ok' } as never)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('disputa já resolvida → 409 e não reescreve a resolução anterior', async () => {
      prisma.payslipDispute.findUnique.mockResolvedValue({ ...open, status: 'RESOLVED' });
      await expect(service.resolveDispute(1, { resolution: 'ok' } as never)).rejects.toThrow(
        ConflictException,
      );
      expect(prisma.payslipDispute.update).not.toHaveBeenCalled();
    });

    it('sem reissue: resolve a disputa e deixa o recibo como está', async () => {
      prisma.payslipDispute.findUnique.mockResolvedValue(open);
      const res = await service.resolveDispute(1, { resolution: 'Valor correcto' } as never);
      expect(res).toMatchObject({ status: 'RESOLVED', resolution: 'Valor correcto' });
      expect(prisma.payslip.update).not.toHaveBeenCalled();
      expect(prisma.notificationLog.create.mock.calls[0][0].data.message).toBe(
        'A sua disputa foi resolvida.',
      );
    });

    it('com reissue: devolve o recibo a ISSUED e avisa o colaborador da reemissão', async () => {
      prisma.payslipDispute.findUnique.mockResolvedValue(open);
      await service.resolveDispute(1, { resolution: 'Corrigido', reissue: true } as never);
      expect(prisma.payslip.update).toHaveBeenCalledWith({
        where: { id: 5 },
        data: { status: 'ISSUED', issuedAt: expect.any(Date) },
      });
      expect(prisma.notificationLog.create.mock.calls[0][0].data).toMatchObject({
        userId: 10,
        message: expect.stringContaining('reemitido'),
      });
    });

    it('falha ao notificar não impede a resolução', async () => {
      prisma.payslipDispute.findUnique.mockResolvedValue(open);
      prisma.notificationLog.create.mockRejectedValue(new Error('smtp'));
      await expect(service.resolveDispute(1, { resolution: 'ok' } as never)).resolves.toMatchObject(
        { status: 'RESOLVED' },
      );
    });
  });
});
