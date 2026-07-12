import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { PayslipsService } from './payslips.service';
import { PrismaService } from '../prisma/prisma.service';

// ─── Ownership tests (A3-1) ────────────────────────────────────────────────

const employeeA = { id: 7, role: { name: 'COLABORADOR' } } as any;
const employeeB = { id: 8, role: { name: 'COLABORADOR' } } as any;
const rh = { id: 1, role: { name: 'RH' } } as any;

function makePrisma(payslip: any) {
  return {
    payslip: {
      findUnique: jest.fn().mockResolvedValue(payslip),
      update: jest.fn().mockResolvedValue(payslip),
    },
  } as any;
}

describe('PayslipsService.findOne ownership (A3-1)', () => {
  const payslipOfA = { id: 5, userId: 7, period: '2026-04' };

  it('o dono lê o próprio recibo', async () => {
    const svc = new PayslipsService(makePrisma(payslipOfA));
    await expect(svc.findOne(5, employeeA)).resolves.toMatchObject({ id: 5 });
  });

  it('outro colaborador recebe 404 (não revela existência)', async () => {
    const svc = new PayslipsService(makePrisma(payslipOfA));
    await expect(svc.findOne(5, employeeB)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('RH lê qualquer recibo (papel privilegiado)', async () => {
    const svc = new PayslipsService(makePrisma(payslipOfA));
    await expect(svc.findOne(5, rh)).resolves.toMatchObject({ id: 5 });
  });

  it('recibo inexistente → 404', async () => {
    const svc = new PayslipsService(makePrisma(null));
    await expect(svc.findOne(5, employeeA)).rejects.toBeInstanceOf(NotFoundException);
  });
});

const mockPrisma = {
  payslip: {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn().mockResolvedValue([]),
    create: jest.fn(),
    update: jest.fn(),
    count: jest.fn().mockResolvedValue(0),
    createMany: jest.fn().mockResolvedValue({ count: 0 }),
  },
  payslipAccessLog: {
    create: jest.fn().mockResolvedValue({}),
    findMany: jest.fn().mockResolvedValue([]),
  },
  payslipDispute: { create: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
  user: { findUnique: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
  notificationLog: { create: jest.fn().mockResolvedValue({}) },
};

const basePayslip = {
  id: 1,
  userId: 1,
  month: '2024-01',
  year: 2024,
  status: 'ISSUED',
  grossSalary: 5000,
  netSalary: 4000,
  user: { id: 1, fullName: 'Test User', email: 'test@innova.com' },
};

describe('PayslipsService', () => {
  let service: PayslipsService;

  beforeEach(async () => {
    jest.clearAllMocks();
    Object.defineProperty(mockPrisma, 'read', {
      get() {
        return mockPrisma;
      },
      configurable: true,
    });
    const module: TestingModule = await Test.createTestingModule({
      providers: [PayslipsService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();
    service = module.get<PayslipsService>(PayslipsService);
  });

  describe('findAll', () => {
    it('deve retornar holerites paginados', async () => {
      mockPrisma.payslip.findMany.mockResolvedValue([basePayslip]);
      mockPrisma.payslip.count.mockResolvedValue(1);
      const result = await service.findAll({});
      expect(result).toBeDefined();
    });
  });

  describe('findOne', () => {
    it('deve retornar holerite por id', async () => {
      mockPrisma.payslip.findUnique.mockResolvedValue(basePayslip);
      const result = await service.findOne(1, { id: 1, role: { name: 'RH' } } as any);
      expect(result).toBeDefined();
    });
    it('deve lançar NotFoundException', async () => {
      mockPrisma.payslip.findUnique.mockResolvedValue(null);
      await expect(service.findOne(99, { id: 1, role: { name: 'RH' } } as any)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('create', () => {
    it('deve criar holerite', async () => {
      mockPrisma.payslip.findFirst.mockResolvedValue(null);
      mockPrisma.payslip.create.mockResolvedValue(basePayslip);
      const result = await service.create({
        userId: 1,
        period: '2024-01',
        baseSalary: 5000,
        additions: [],
        deductions: [],
        paymentDate: '2024-01-31',
      } as any);
      expect(result).toBeDefined();
    });
  });
});
