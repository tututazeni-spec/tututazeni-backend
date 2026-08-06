import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PayslipsService } from './payslips.service';
import { PrismaService } from '../prisma/prisma.service';

const mockPrisma = {
  payslip: {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn().mockResolvedValue([]),
    create: jest.fn(),
    update: jest.fn(),
    count: jest.fn().mockResolvedValue(0),
    aggregate: jest.fn(),
  },
  payslipAccessLog: {
    create: jest.fn().mockResolvedValue({}),
    findMany: jest.fn().mockResolvedValue([]),
  },
  payslipDispute: { create: jest.fn() },
  user: { findMany: jest.fn().mockResolvedValue([]) },
  employeeCompensation: { findFirst: jest.fn().mockResolvedValue(null) },
  notificationLog: { create: jest.fn().mockResolvedValue({}) },
};

describe('PayslipsService — cálculo IRT Angola 2026 (calcIRT)', () => {
  let service: PayslipsService;

  beforeEach(async () => {
    jest.clearAllMocks();
    Object.defineProperty(mockPrisma, 'read', { get: () => mockPrisma, configurable: true });
    const module: TestingModule = await Test.createTestingModule({
      providers: [PayslipsService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();
    service = module.get<PayslipsService>(PayslipsService);
  });

  it('isento até 150.000 Kz (escalão 0%)', () => {
    expect(service.calcIRT(150_000).tax).toBe(0);
    expect(service.calcIRT(0).tax).toBe(0);
  });

  it('escalão 10% (150.001–200.000): 180.000 → (180000*0.10)-15000 = 3000', () => {
    const { tax, bracket } = service.calcIRT(180_000);
    expect(bracket.rate).toBe(0.1);
    expect(tax).toBeCloseTo(3_000);
  });

  it('escalão 13% (200.001–300.000): 250.000 → (250000*0.13)-21000 = 11500', () => {
    const { tax, bracket } = service.calcIRT(250_000);
    expect(bracket.rate).toBe(0.13);
    expect(tax).toBeCloseTo(11_500);
  });

  it('escalão 16% (300.001–500.000): 400.000 → (400000*0.16)-30000 = 34000', () => {
    const { tax, bracket } = service.calcIRT(400_000);
    expect(bracket.rate).toBe(0.16);
    expect(tax).toBeCloseTo(34_000);
  });

  it('escalão 18% (500.001–1.000.000): 700.000 → (700000*0.18)-40000 = 86000', () => {
    const { tax, bracket } = service.calcIRT(700_000);
    expect(bracket.rate).toBe(0.18);
    expect(tax).toBeCloseTo(86_000);
  });

  it('escalão 19% (1.000.001–1.500.000): 1.200.000 → (1200000*0.19)-50000 = 178000', () => {
    const { tax, bracket } = service.calcIRT(1_200_000);
    expect(bracket.rate).toBe(0.19);
    expect(tax).toBeCloseTo(178_000);
  });

  it('escalão máximo 25% (>1.500.000, sem tecto): 2.000.000 → (2000000*0.25)-140000 = 360000', () => {
    const { tax, bracket } = service.calcIRT(2_000_000);
    expect(bracket.rate).toBe(0.25);
    expect(bracket.max).toBeNull();
    expect(tax).toBeCloseTo(360_000);
  });

  it('nunca devolve imposto negativo (Math.max com 0) mesmo em fronteira baixa do escalão', () => {
    // Extremo inferior do escalão de 10%: 150.001 * 0.10 - 15000 ≈ 0.1
    const { tax } = service.calcIRT(150_001);
    expect(tax).toBeGreaterThanOrEqual(0);
  });
});

describe('PayslipsService — totais, overrides e criação', () => {
  let service: PayslipsService;

  beforeEach(async () => {
    jest.clearAllMocks();
    Object.defineProperty(mockPrisma, 'read', { get: () => mockPrisma, configurable: true });
    const module: TestingModule = await Test.createTestingModule({
      providers: [PayslipsService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();
    service = module.get<PayslipsService>(PayslipsService);
  });

  it('simulate: aplica IRT automático e calcula netSalary/effectiveRate', () => {
    const out = service.simulate({ baseSalary: 250_000, bonuses: 10_000 } as any);
    expect(out.grossSalary).toBe(260_000);
    expect(out.incomeTax).toBeCloseTo(11_500);
    expect(out.socialSecurity).toBeCloseTo(250_000 * 0.03);
    expect(out.netSalary).toBeCloseTo(260_000 - 11_500 - 250_000 * 0.03);
    expect(out.irtDetails.effectiveRate).toBeGreaterThan(0);
  });

  it('simulate: effectiveRate é 0 quando grossSalary é 0', () => {
    const out = service.simulate({ baseSalary: 0 } as any);
    expect(out.irtDetails.effectiveRate).toBe(0);
  });

  it('create: irtOverride e inssOverride sobrepõem o cálculo automático', async () => {
    mockPrisma.payslip.findFirst.mockResolvedValue(null);
    mockPrisma.payslip.create.mockImplementation(({ data }: any) => Promise.resolve(data));

    const result = await service.create({
      userId: 1,
      period: '2026-04',
      paymentDate: '2026-04-25',
      baseSalary: 250_000,
      irtOverride: 5_000,
      inssOverride: 1_000,
    } as any);

    expect(result.incomeTax).toBe(5_000);
    expect(result.socialSecurity).toBe(1_000);
    expect(result.status).toBe('DRAFT');
    expect(result.receiptCode).toMatch(/^REC-202604-0001-[0-9A-F]{8}$/);
  });

  it('create: rejeita recibo duplicado (mesmo userId + period) com ConflictException', async () => {
    mockPrisma.payslip.findFirst.mockResolvedValue({ id: 1 });
    await expect(
      service.create({ userId: 1, period: '2026-04', baseSalary: 100_000 } as any),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(mockPrisma.payslip.create).not.toHaveBeenCalled();
  });
});

describe('PayslipsService — transições de estado', () => {
  let service: PayslipsService;

  beforeEach(async () => {
    jest.clearAllMocks();
    Object.defineProperty(mockPrisma, 'read', { get: () => mockPrisma, configurable: true });
    const module: TestingModule = await Test.createTestingModule({
      providers: [PayslipsService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();
    service = module.get<PayslipsService>(PayslipsService);
  });

  it('issue: emite recibo em DRAFT e notifica o colaborador', async () => {
    mockPrisma.payslip.findUnique.mockResolvedValue({
      id: 1,
      userId: 7,
      status: 'DRAFT',
      period: '2026-04',
    });
    mockPrisma.payslip.update.mockResolvedValue({
      id: 1,
      userId: 7,
      status: 'ISSUED',
      period: '2026-04',
    });

    const out = await service.issue(1);

    expect(out.status).toBe('ISSUED');
    expect(mockPrisma.notificationLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ userId: 7, type: 'PAYSLIP_ISSUED' }),
      }),
    );
  });

  it('issue: rejeita reemissão de recibo já ISSUED', async () => {
    mockPrisma.payslip.findUnique.mockResolvedValue({ id: 1, userId: 7, status: 'ISSUED' });
    await expect(service.issue(1)).rejects.toBeInstanceOf(ConflictException);
    expect(mockPrisma.payslip.update).not.toHaveBeenCalled();
  });

  it('issue: rejeita reemissão de recibo já ACKNOWLEDGED', async () => {
    mockPrisma.payslip.findUnique.mockResolvedValue({ id: 1, userId: 7, status: 'ACKNOWLEDGED' });
    await expect(service.issue(1)).rejects.toBeInstanceOf(ConflictException);
  });

  it('acknowledge: idempotente — recibo já ACKNOWLEDGED não é reescrito', async () => {
    mockPrisma.payslip.findUnique.mockResolvedValue({ id: 1, userId: 7, status: 'ACKNOWLEDGED' });
    const out = await service.acknowledge(1, { id: 7, role: { name: 'COLABORADOR' } } as any);
    expect(out.status).toBe('ACKNOWLEDGED');
    expect(mockPrisma.payslip.update).not.toHaveBeenCalled();
  });

  it('acknowledge: colaborador dono confirma recibo ISSUED', async () => {
    mockPrisma.payslip.findUnique.mockResolvedValue({ id: 1, userId: 7, status: 'ISSUED' });
    mockPrisma.payslip.update.mockResolvedValue({ id: 1, userId: 7, status: 'ACKNOWLEDGED' });
    const out = await service.acknowledge(1, { id: 7, role: { name: 'COLABORADOR' } } as any);
    expect(out.status).toBe('ACKNOWLEDGED');
    expect(mockPrisma.payslip.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'ACKNOWLEDGED' }) }),
    );
  });

  it('acknowledge: outro colaborador não pode confirmar recibo alheio', async () => {
    mockPrisma.payslip.findUnique.mockResolvedValue({ id: 1, userId: 7, status: 'ISSUED' });
    await expect(
      service.acknowledge(1, { id: 8, role: { name: 'COLABORADOR' } } as any),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('update: rejeita edição de recibo já ACKNOWLEDGED', async () => {
    mockPrisma.payslip.findUnique.mockResolvedValue({ id: 1, userId: 7, status: 'ACKNOWLEDGED' });
    await expect(service.update(1, { baseSalary: 999_999 } as any)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(mockPrisma.payslip.update).not.toHaveBeenCalled();
  });

  it('update: recalcula totais a partir dos campos existentes e volta a DRAFT', async () => {
    mockPrisma.payslip.findUnique.mockResolvedValue({
      id: 1,
      userId: 7,
      status: 'ISSUED',
      baseSalary: 200_000,
      mealAllowance: 0,
    });
    mockPrisma.payslip.update.mockImplementation(({ data }: any) => Promise.resolve(data));

    const out = await service.update(1, { baseSalary: 300_000 } as any);

    expect(out.status).toBe('DRAFT');
    expect(out.grossSalary).toBe(300_000);
  });
});

describe('PayslipsService — bulkCreate', () => {
  let service: PayslipsService;

  beforeEach(async () => {
    jest.clearAllMocks();
    Object.defineProperty(mockPrisma, 'read', { get: () => mockPrisma, configurable: true });
    const module: TestingModule = await Test.createTestingModule({
      providers: [PayslipsService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();
    service = module.get<PayslipsService>(PayslipsService);
  });

  it('cria recibos para utilizadores activos sem recibo existente no período', async () => {
    // Salário base real vem de EmployeeCompensation, não de Position (que
    // nunca teve coluna baseSalary — ver commit de correcção do any-cleanup).
    mockPrisma.user.findMany.mockResolvedValue([{ id: 1 }, { id: 2 }]);
    mockPrisma.employeeCompensation.findFirst
      .mockResolvedValueOnce({ baseSalary: 200_000 })
      .mockResolvedValueOnce({ baseSalary: 300_000 });
    mockPrisma.payslip.findFirst.mockResolvedValue(null);
    mockPrisma.payslip.create.mockResolvedValue({});

    const out = await service.bulkCreate({
      period: '2026-04',
      paymentDate: '2026-04-25',
    } as any);

    expect(out.created).toBe(2);
    expect(out.skipped).toBe(0);
    expect(out.errors).toEqual([]);
  });

  it('salta utilizadores que já têm recibo no período (sem duplicar)', async () => {
    mockPrisma.user.findMany.mockResolvedValue([{ id: 1 }]);
    mockPrisma.payslip.findFirst.mockResolvedValue({ id: 99 });

    const out = await service.bulkCreate({ period: '2026-04', paymentDate: '2026-04-25' } as any);

    expect(out.created).toBe(0);
    expect(out.skipped).toBe(1);
    expect(mockPrisma.payslip.create).not.toHaveBeenCalled();
  });

  it('issueImmediately: emite e notifica de imediato cada recibo criado', async () => {
    mockPrisma.user.findMany.mockResolvedValue([{ id: 1 }]);
    mockPrisma.employeeCompensation.findFirst.mockResolvedValue({ baseSalary: 200_000 });
    mockPrisma.payslip.findFirst.mockResolvedValue(null);
    mockPrisma.payslip.create.mockResolvedValue({});

    const out = await service.bulkCreate({
      period: '2026-04',
      paymentDate: '2026-04-25',
      issueImmediately: true,
    } as any);

    expect(out.created).toBe(1);
    expect(mockPrisma.notificationLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ userId: 1, type: 'PAYSLIP_ISSUED' }),
      }),
    );
  });

  it('erro ao criar recibo de um utilizador não interrompe o lote — é recolhido em errors', async () => {
    mockPrisma.user.findMany.mockResolvedValue([{ id: 1 }, { id: 2 }]);
    mockPrisma.employeeCompensation.findFirst.mockResolvedValue({ baseSalary: 200_000 });
    mockPrisma.payslip.findFirst.mockResolvedValue(null);
    mockPrisma.payslip.create
      .mockRejectedValueOnce(new Error('falha db'))
      .mockResolvedValueOnce({});

    const out = await service.bulkCreate({ period: '2026-04', paymentDate: '2026-04-25' } as any);

    expect(out.created).toBe(1);
    expect(out.errors).toEqual(['User 1: falha db']);
  });

  it('userIds filtra o universo de utilizadores considerados', async () => {
    mockPrisma.user.findMany.mockResolvedValue([{ id: 5 }]);
    mockPrisma.employeeCompensation.findFirst.mockResolvedValue({ baseSalary: 100_000 });
    mockPrisma.payslip.findFirst.mockResolvedValue(null);
    mockPrisma.payslip.create.mockResolvedValue({});

    await service.bulkCreate({ period: '2026-04', paymentDate: '2026-04-25', userIds: [5] } as any);

    expect(mockPrisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ id: { in: [5] } }) }),
    );
  });
});

describe('PayslipsService — resumo anual, comparação e disputa', () => {
  let service: PayslipsService;

  beforeEach(async () => {
    jest.clearAllMocks();
    Object.defineProperty(mockPrisma, 'read', { get: () => mockPrisma, configurable: true });
    const module: TestingModule = await Test.createTestingModule({
      providers: [PayslipsService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();
    service = module.get<PayslipsService>(PayslipsService);
  });

  it('annualSummary: lança 404 se não há recibos no ano', async () => {
    mockPrisma.payslip.findMany.mockResolvedValue([]);
    await expect(service.annualSummary(7, '2026')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('annualSummary: soma correctamente os totais do ano', async () => {
    mockPrisma.payslip.findMany.mockResolvedValue([
      {
        period: '2026-01',
        grossSalary: 100,
        netSalary: 80,
        incomeTax: 10,
        socialSecurity: 5,
        employerInss: 8,
      },
      {
        period: '2026-02',
        grossSalary: 200,
        netSalary: 160,
        incomeTax: 20,
        socialSecurity: 10,
        employerInss: 16,
      },
    ]);
    const out = await service.annualSummary(7, '2026');
    expect(out.months).toBe(2);
    expect(out.totalGross).toBe(300);
    expect(out.totalNet).toBe(240);
  });

  it('compare: lança 404 se o período A não existe', async () => {
    mockPrisma.payslip.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: 2 });
    await expect(service.compare(7, '2026-01', '2026-02')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('compare: lança 404 se o período B não existe', async () => {
    mockPrisma.payslip.findFirst.mockResolvedValueOnce({ id: 1 }).mockResolvedValueOnce(null);
    await expect(service.compare(7, '2026-01', '2026-02')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('compare: calcula delta e pct entre dois períodos', async () => {
    mockPrisma.payslip.findFirst
      .mockResolvedValueOnce({ baseSalary: 100, netSalary: 80 })
      .mockResolvedValueOnce({ baseSalary: 150, netSalary: 120 });

    const out = await service.compare(7, '2026-01', '2026-02');

    expect(out.baseSalary).toEqual({ a: 100, b: 150, delta: 50, pct: 50 });
  });

  it('compare: pct é null quando o valor de partida é 0 (evita divisão por zero)', async () => {
    mockPrisma.payslip.findFirst
      .mockResolvedValueOnce({ bonuses: 0 })
      .mockResolvedValueOnce({ bonuses: 500 });

    const out = await service.compare(7, '2026-01', '2026-02');

    expect(out.bonuses).toEqual({ a: 0, b: 500, delta: 500, pct: null });
  });

  it('createDispute: abre disputa, marca o recibo como DISPUTED e notifica', async () => {
    mockPrisma.payslip.findUnique.mockResolvedValue({ id: 3, userId: 7, receiptCode: 'REC-1' });
    mockPrisma.payslipDispute.create.mockResolvedValue({ id: 10, status: 'OPEN' });

    const out = await service.createDispute(
      3,
      { id: 7, role: { name: 'COLABORADOR' } } as any,
      { reason: 'valor incorrecto' } as any,
    );

    expect(out.status).toBe('OPEN');
    expect(mockPrisma.payslip.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 3 }, data: { status: 'DISPUTED' } }),
    );
    expect(mockPrisma.notificationLog.create).toHaveBeenCalled();
  });

  it('createDispute: colaborador não pode disputar recibo alheio', async () => {
    mockPrisma.payslip.findUnique.mockResolvedValue({ id: 3, userId: 999, receiptCode: 'REC-1' });
    await expect(
      service.createDispute(
        3,
        { id: 7, role: { name: 'COLABORADOR' } } as any,
        {
          reason: 'x',
        } as any,
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(mockPrisma.payslipDispute.create).not.toHaveBeenCalled();
  });
});

describe('PayslipsService — dashboard RH e logs de acesso', () => {
  let service: PayslipsService;

  beforeEach(async () => {
    jest.clearAllMocks();
    Object.defineProperty(mockPrisma, 'read', { get: () => mockPrisma, configurable: true });
    const module: TestingModule = await Test.createTestingModule({
      providers: [PayslipsService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();
    service = module.get<PayslipsService>(PayslipsService);
  });

  it('hrDashboard: usa o mês corrente quando nenhum período é indicado e calcula draft por subtracção', async () => {
    mockPrisma.payslip.count
      .mockResolvedValueOnce(10) // total
      .mockResolvedValueOnce(6) // issued
      .mockResolvedValueOnce(2) // acknowledged
      .mockResolvedValueOnce(1) // disputed
      .mockResolvedValueOnce(3); // notViewed
    mockPrisma.payslip.aggregate.mockResolvedValue({
      _sum: {
        grossSalary: 1000,
        netSalary: 800,
        incomeTax: 100,
        socialSecurity: 50,
        employerInss: 80,
      },
      _avg: { netSalary: 80 },
    });

    const out = await service.hrDashboard();

    expect(out.counts.draft).toBe(10 - 6 - 2 - 1);
    expect(out.compliance.viewRate).toBe('20.0%');
  });

  it('hrDashboard: viewRate é 0% quando não há recibos no período', async () => {
    mockPrisma.payslip.count.mockResolvedValue(0);
    mockPrisma.payslip.aggregate.mockResolvedValue({ _sum: {}, _avg: {} });

    const out = await service.hrDashboard('2026-04');

    expect(out.compliance.viewRate).toBe('0%');
    expect(out.financials.totalGross).toBe(0);
  });

  it('getAccessLogs: devolve os últimos 50 acessos ordenados por data', async () => {
    await service.getAccessLogs(3);
    expect(mockPrisma.payslipAccessLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { payslipId: 3 }, take: 50 }),
    );
  });

  it('logAccess: regista o acesso com sucesso', async () => {
    await service.logAccess(3, 7, 'VIEW', '10.0.0.1');
    expect(mockPrisma.payslipAccessLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          payslipId: 3,
          userId: 7,
          action: 'VIEW',
          ipAddress: '10.0.0.1',
        }),
      }),
    );
  });

  it('logAccess: falha ao gravar o log não propaga excepção (apenas regista aviso)', async () => {
    mockPrisma.payslipAccessLog.create.mockRejectedValueOnce(new Error('db down'));
    await expect(service.logAccess(3, 7, 'VIEW')).resolves.toBeUndefined();
  });
});
