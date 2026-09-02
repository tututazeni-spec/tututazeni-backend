import { Test } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { SalaryComponentService } from './salary-component.service';
import { PrismaService } from '../prisma/prisma.service';

describe('SalaryComponentService.remove', () => {
  let svc: SalaryComponentService;
  let prisma: any;
  beforeEach(async () => {
    prisma = {
      salaryComponent: {
        update: jest.fn().mockResolvedValue({ code: 'X', active: false }),
        delete: jest.fn().mockResolvedValue({ code: 'X' }),
      },
      read: {
        salaryComponent: { findUnique: jest.fn().mockResolvedValue({ code: 'X' }) },
        employeeCompensationComponent: { count: jest.fn().mockResolvedValue(0) },
        payslipItem: { count: jest.fn().mockResolvedValue(0) },
      },
    };
    const mod = await Test.createTestingModule({
      providers: [SalaryComponentService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    svc = mod.get(SalaryComponentService);
  });

  it('hard-deletes an unreferenced component', async () => {
    await svc.remove('X');
    expect(prisma.salaryComponent.delete).toHaveBeenCalledWith({ where: { code: 'X' } });
  });
  it('soft-deletes a referenced component', async () => {
    prisma.read.payslipItem.count.mockResolvedValue(4);
    await svc.remove('X');
    expect(prisma.salaryComponent.update).toHaveBeenCalledWith({
      where: { code: 'X' },
      data: { active: false },
    });
    expect(prisma.salaryComponent.delete).not.toHaveBeenCalled();
  });
  it('throws NotFoundException when the component does not exist', async () => {
    prisma.read.salaryComponent = { findUnique: jest.fn().mockResolvedValue(null) };
    await expect(svc.remove('NOPE')).rejects.toThrow(NotFoundException);
    expect(prisma.salaryComponent.delete).not.toHaveBeenCalled();
  });
});
