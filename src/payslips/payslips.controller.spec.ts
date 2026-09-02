import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { PayslipsController } from './payslips.controller';
import { PayslipsService } from './payslips.service';
import { EmployeeCompensationService } from './employee-compensation.service';
import { PdfService } from '../pdf/pdf.service';
import { PayslipPdfService } from './payslip-pdf.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';

const annualExportFixture = {
  year: '2026',
  userId: 1,
  months: 1,
  rows: [
    {
      period: '2026-01',
      baseSalary: 100,
      mealAllowance: 0,
      vacationAllowance: 0,
      christmasAllowance: 0,
      bonuses: 0,
      overtime: 0,
      otherAllowances: 0,
      grossSalary: 100,
      incomeTax: 10,
      socialSecurity: 3,
      totalDeductions: 13,
      netSalary: 87,
    },
  ],
  totals: {
    baseSalary: 100,
    mealAllowance: 0,
    vacationAllowance: 0,
    christmasAllowance: 0,
    bonuses: 0,
    overtime: 0,
    otherAllowances: 0,
    grossSalary: 100,
    incomeTax: 10,
    socialSecurity: 3,
    totalDeductions: 13,
    netSalary: 87,
  },
};

const mockSvc = {
  getMyPayslips: jest.fn().mockResolvedValue([]),
  annualSummary: jest.fn().mockResolvedValue({}),
  buildAnnualExport: jest.fn().mockResolvedValue(annualExportFixture),
  compare: jest.fn().mockResolvedValue({}),
  findOne: jest.fn().mockResolvedValue({ id: 1 }),
  logAccess: jest.fn().mockResolvedValue({}),
  acknowledge: jest.fn().mockResolvedValue({}),
  createDispute: jest.fn().mockResolvedValue({ id: 1 }),
  simulate: jest.fn().mockResolvedValue({}),
  findAll: jest.fn().mockResolvedValue({ data: [], total: 0 }),
  hrDashboard: jest.fn().mockResolvedValue({}),
  getAccessLogs: jest.fn().mockResolvedValue([]),
  create: jest.fn().mockResolvedValue({ id: 2 }),
  bulkCreate: jest.fn().mockResolvedValue({ created: 0 }),
  issue: jest.fn().mockResolvedValue({}),
  update: jest.fn().mockResolvedValue({ id: 1 }),
};

const mockPdf = {
  generatePayslip: jest.fn().mockResolvedValue(Buffer.from('%PDF-1.4 recibo')),
  generateExecutiveReport: jest.fn().mockResolvedValue(Buffer.from('%PDF-1.4 resumo')),
};

const mockPayslipPdf = {
  render: jest.fn().mockResolvedValue(Buffer.from('%PDF-1.4 recibo')),
};

const mockCompensation = {
  myCompensation: jest.fn().mockResolvedValue({
    baseSalary: 120000,
    foodAllowance: null,
    transportAllowance: null,
    bankName: 'BAI',
    ibanMasked: '•••••••••••••••••••••3010',
    effectiveFrom: new Date('2026-01-01'),
  }),
};

const mockUser = { id: 1, email: 'test@innova.com', role: { name: 'ADMIN' } };
const mockReq = { ip: '127.0.0.1' } as any;
const mockRes = () => {
  const res: any = {};
  res.set = jest.fn().mockReturnValue(res);
  res.end = jest.fn().mockReturnValue(res);
  return res;
};

describe('PayslipsController', () => {
  let controller: PayslipsController;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PayslipsController],
      providers: [
        { provide: PayslipsService, useValue: mockSvc },
        { provide: PdfService, useValue: mockPdf },
        { provide: EmployeeCompensationService, useValue: mockCompensation },
        { provide: PayslipPdfService, useValue: mockPayslipPdf },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();
    controller = module.get<PayslipsController>(PayslipsController);
  });

  it('myPayslips → getMyPayslips(userId, filters)', async () => {
    const filters = {} as any;
    await controller.myPayslips(mockUser as any, filters);
    expect(mockSvc.getMyPayslips).toHaveBeenCalledWith(1, filters);
  });

  it('myAnnualSummary → annualSummary(userId, year)', async () => {
    await controller.myAnnualSummary(mockUser as any, '2024');
    expect(mockSvc.annualSummary).toHaveBeenCalledWith(1, '2024');
  });

  it('myAnnualSummaryExport (csv por omissão) → buildAnnualExport + text/csv', async () => {
    const res = mockRes();
    await controller.myAnnualSummaryExport(mockUser as any, '2026', undefined, res);
    expect(mockSvc.buildAnnualExport).toHaveBeenCalledWith(1, '2026');
    expect(res.set).toHaveBeenCalledWith(
      expect.objectContaining({ 'Content-Type': expect.stringContaining('text/csv') }),
    );
    const body = res.end.mock.calls[0][0] as string;
    expect(body).toContain('Período');
    expect(body).toContain('2026-01');
    expect(body).toContain('TOTAL');
    expect(mockPdf.generateExecutiveReport).not.toHaveBeenCalled();
  });

  it('myAnnualSummaryExport (format=pdf) → PdfService.generateExecutiveReport + application/pdf', async () => {
    const res = mockRes();
    await controller.myAnnualSummaryExport(mockUser as any, '2026', 'pdf', res);
    expect(mockPdf.generateExecutiveReport).toHaveBeenCalled();
    expect(res.set).toHaveBeenCalledWith(
      expect.objectContaining({ 'Content-Type': 'application/pdf' }),
    );
    expect(res.end).toHaveBeenCalled();
  });

  it('myAnnualSummaryExport sem year → usa o ano corrente', async () => {
    const res = mockRes();
    await controller.myAnnualSummaryExport(mockUser as any, undefined, undefined, res);
    expect(mockSvc.buildAnnualExport).toHaveBeenCalledWith(1, String(new Date().getFullYear()));
  });

  it('myPayslipPdf → findOne (ownership) + PayslipPdfService.render(id) + stream + logAccess(DOWNLOAD)', async () => {
    const res = mockRes();
    mockSvc.findOne.mockResolvedValueOnce({
      id: 3,
      userId: 1,
      period: '2026-04',
      receiptCode: 'REC-202604-0001-ABCD',
      netSalary: 87,
      user: { fullName: 'Ana Teste', employeeNumber: 'E-001' },
    });
    await controller.myPayslipPdf(3, mockUser as any, mockReq, res);
    expect(mockSvc.findOne).toHaveBeenCalledWith(3, mockUser);
    expect(mockPayslipPdf.render).toHaveBeenCalledWith(3);
    expect(mockPdf.generatePayslip).not.toHaveBeenCalled();
    expect(mockSvc.logAccess).toHaveBeenCalledWith(3, 1, 'DOWNLOAD', '127.0.0.1');
    expect(res.set).toHaveBeenCalledWith(
      expect.objectContaining({ 'Content-Type': 'application/pdf' }),
    );
    expect(res.end).toHaveBeenCalledWith(expect.any(Buffer));
  });

  it('myPayslipPdf → propaga o erro de ownership do findOne (não gera PDF)', async () => {
    const res = mockRes();
    mockSvc.findOne.mockRejectedValueOnce(new NotFoundException('Recibo não encontrado'));
    await expect(controller.myPayslipPdf(3, mockUser as any, mockReq, res)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(mockPayslipPdf.render).not.toHaveBeenCalled();
    expect(mockSvc.logAccess).not.toHaveBeenCalled();
    expect(res.end).not.toHaveBeenCalled();
  });

  it('myCompare → compare(userId, periodA, periodB)', async () => {
    await controller.myCompare(mockUser as any, '2024-01', '2024-02');
    expect(mockSvc.compare).toHaveBeenCalledWith(1, '2024-01', '2024-02');
  });

  it('myCompensation → compensation.myCompensation(user.id) e devolve o resultado', async () => {
    const result = await controller.myCompensation(mockUser as any);
    expect(mockCompensation.myCompensation).toHaveBeenCalledWith(1);
    expect(result).toEqual(
      expect.objectContaining({ baseSalary: 120000, ibanMasked: '•••••••••••••••••••••3010' }),
    );
    expect(result).not.toHaveProperty('iban');
    expect(result).not.toHaveProperty('accountNumber');
    expect(result).not.toHaveProperty('userId');
    expect(result).not.toHaveProperty('id');
  });

  it('myCompensation declarado antes de myPayslip (my/:id) — literal path vence o :id', () => {
    const proto = PayslipsController.prototype;
    const names = Object.getOwnPropertyNames(proto);
    expect(names.indexOf('myCompensation')).toBeLessThan(names.indexOf('myPayslip'));
  });

  it('myPayslip → findOne + logAccess', async () => {
    await controller.myPayslip(3, mockUser as any, mockReq);
    expect(mockSvc.findOne).toHaveBeenCalledWith(3, mockUser);
    expect(mockSvc.logAccess).toHaveBeenCalledWith(3, 1, 'VIEW', '127.0.0.1');
  });

  it('acknowledge → acknowledge(id, user)', async () => {
    await controller.acknowledge(5, mockUser as any);
    expect(mockSvc.acknowledge).toHaveBeenCalledWith(5, mockUser);
  });

  it('createDispute → createDispute(id, user, dto)', async () => {
    const dto = {} as any;
    await controller.createDispute(4, mockUser as any, dto);
    expect(mockSvc.createDispute).toHaveBeenCalledWith(4, mockUser, dto);
  });

  it('simulate → simulate(dto)', async () => {
    const dto = {} as any;
    await controller.simulate(dto);
    expect(mockSvc.simulate).toHaveBeenCalledWith(dto);
  });

  it('findAll → findAll(filters)', async () => {
    const filters = {} as any;
    await controller.findAll(filters);
    expect(mockSvc.findAll).toHaveBeenCalledWith(filters);
  });

  it('hrDashboard sem period → hrDashboard(undefined)', async () => {
    await controller.hrDashboard();
    expect(mockSvc.hrDashboard).toHaveBeenCalledWith(undefined);
  });

  it('findOne (admin) → findOne + logAccess(ADMIN_VIEW)', async () => {
    await controller.findOne(2, mockUser as any, mockReq);
    expect(mockSvc.findOne).toHaveBeenCalledWith(2, mockUser);
    expect(mockSvc.logAccess).toHaveBeenCalledWith(2, 1, 'ADMIN_VIEW', '127.0.0.1');
  });

  it('accessLogs → getAccessLogs(id)', async () => {
    await controller.accessLogs(3);
    expect(mockSvc.getAccessLogs).toHaveBeenCalledWith(3);
  });

  it('create → create(dto)', async () => {
    const dto = {} as any;
    await controller.create(dto);
    expect(mockSvc.create).toHaveBeenCalledWith(dto);
  });

  it('bulkCreate → bulkCreate(dto)', async () => {
    const dto = {} as any;
    await controller.bulkCreate(dto);
    expect(mockSvc.bulkCreate).toHaveBeenCalledWith(dto);
  });

  it('issue → issue(id)', async () => {
    await controller.issue(4);
    expect(mockSvc.issue).toHaveBeenCalledWith(4);
  });

  it('update → update(id, dto)', async () => {
    const dto = {} as any;
    await controller.update(1, dto);
    expect(mockSvc.update).toHaveBeenCalledWith(1, dto);
  });
});
