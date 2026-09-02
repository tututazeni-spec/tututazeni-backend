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
          count: jest.fn().mockResolvedValue(0),
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

  describe('listAll', () => {
    it('filters to the active record only and paginates + shapes the where/include', async () => {
      prisma.read.employeeCompensation.findMany.mockResolvedValue([
        {
          id: 1,
          userId: 7,
          baseSalary: 150000,
          effectiveTo: null,
          user: { id: 7, fullName: 'Ana', employeeNumber: 'E7', department: { id: 2, name: 'RH' } },
          _count: { components: 2 },
        },
      ]);
      prisma.read.employeeCompensation.count.mockResolvedValue(1);

      const res = await svc.listAll({
        page: 1,
        limit: 20,
        search: 'ana',
        departmentId: 2,
        countryCode: 'AO',
      });

      expect(prisma.read.employeeCompensation.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            effectiveTo: null,
            countryCode: 'AO',
            user: expect.objectContaining({
              departmentId: 2,
              OR: [
                { fullName: { contains: 'ana', mode: 'insensitive' } },
                { employeeNumber: { contains: 'ana', mode: 'insensitive' } },
              ],
            }),
          }),
          orderBy: { user: { fullName: 'asc' } },
          skip: 0,
          take: 20,
          include: expect.objectContaining({ _count: { select: { components: true } } }),
        }),
      );
      // no bankName/iban leak: Prisma `include` returns all scalar columns,
      // so the query must explicitly omit the bank details
      const call = prisma.read.employeeCompensation.findMany.mock.calls[0][0];
      expect(call.omit).toEqual({ bankName: true, iban: true });

      expect(res).toEqual({
        data: expect.any(Array),
        meta: { total: 1, page: 1, limit: 20, totalPages: 1 },
      });
    });

    it('omits the user filter entirely when no search/departmentId given', async () => {
      prisma.read.employeeCompensation.findMany.mockResolvedValue([]);
      prisma.read.employeeCompensation.count.mockResolvedValue(0);
      await svc.listAll({});
      const call = prisma.read.employeeCompensation.findMany.mock.calls[0][0];
      expect(call.where).toEqual({ effectiveTo: null });
    });
  });

  it('history includes the user identity on every row', async () => {
    prisma.read.employeeCompensation.findMany.mockResolvedValue([]);
    await svc.history(7);
    expect(prisma.read.employeeCompensation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 7 },
        include: expect.objectContaining({
          components: true,
          user: {
            select: {
              id: true,
              fullName: true,
              employeeNumber: true,
              department: { select: { id: true, name: true } },
            },
          },
        }),
      }),
    );
  });
});
