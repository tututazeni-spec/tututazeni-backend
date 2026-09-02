import { Test } from '@nestjs/testing';
import { EmployeeCompensationService } from './employee-compensation.service';
import { PrismaService } from '../prisma/prisma.service';

describe('EmployeeCompensationService', () => {
  let svc: EmployeeCompensationService;
  let prisma: any;

  beforeEach(async () => {
    prisma = {
      $transaction: jest.fn(),
      employeeCompensation: {
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        create: jest.fn().mockResolvedValue({ id: 1 }),
        update: jest.fn().mockResolvedValue({ id: 1 }),
      },
      employeeCompensationComponent: {
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
        createMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      read: {
        employeeCompensation: {
          findFirst: jest.fn().mockResolvedValue(null),
          findMany: jest.fn().mockResolvedValue([]),
        },
      },
    };
    const mod = await Test.createTestingModule({
      providers: [EmployeeCompensationService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    svc = mod.get(EmployeeCompensationService);
  });

  it('closes the previous open compensation and creates the new one in a transaction', async () => {
    prisma.read.employeeCompensation.findFirst.mockResolvedValue({ id: 5, effectiveTo: null });
    prisma.$transaction.mockImplementation(async (cb: any) => cb(prisma));
    prisma.employeeCompensation.updateMany = jest.fn().mockResolvedValue({ count: 1 });
    prisma.employeeCompensation.create = jest.fn().mockResolvedValue({ id: 6 });
    await svc.create({ userId: 1, baseSalary: 130000, effectiveFrom: '2026-10-01' });
    expect(prisma.employeeCompensation.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ userId: 1, effectiveTo: null }),
      }),
    );
    expect(prisma.employeeCompensation.create).toHaveBeenCalled();
  });

  it('myCompensation masks the IBAN', async () => {
    prisma.read.employeeCompensation.findFirst.mockResolvedValue({
      baseSalary: 100,
      foodAllowance: 10,
      transportAllowance: 5,
      bankName: 'BAI',
      iban: 'AO06004400006729503010102',
      effectiveFrom: new Date('2026-01-01'),
    });
    const r = await svc.myCompensation(1);
    expect(r!.ibanMasked.endsWith('0102')).toBe(true);
    expect(r!.ibanMasked).toMatch(/^•+0102$/);
  });
});
