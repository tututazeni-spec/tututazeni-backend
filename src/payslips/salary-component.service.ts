// src/payslips/salary-component.service.ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  SalaryComponentFilterDto,
  CreateSalaryComponentDto,
  UpdateSalaryComponentDto,
} from './payroll.dto';

@Injectable()
export class SalaryComponentService {
  constructor(private readonly prisma: PrismaService) {}

  list(filter: SalaryComponentFilterDto) {
    const where: Prisma.SalaryComponentWhereInput = {};
    if (filter.type) where.type = filter.type;
    if (filter.countryCode) where.countryCode = filter.countryCode;
    if (typeof filter.active === 'boolean') where.active = filter.active;
    return this.prisma.read.salaryComponent.findMany({ where, orderBy: { order: 'asc' } });
  }

  create(dto: CreateSalaryComponentDto) {
    return this.prisma.salaryComponent.create({ data: { ...dto } });
  }

  async get(code: string) {
    const c = await this.prisma.read.salaryComponent.findUnique({ where: { code } });
    if (!c) throw new NotFoundException('Componente não encontrado');
    return c;
  }

  async update(code: string, dto: UpdateSalaryComponentDto) {
    await this.get(code);
    return this.prisma.salaryComponent.update({ where: { code }, data: { ...dto } });
  }

  async remove(code: string) {
    const [inComp, inItems] = await Promise.all([
      this.prisma.read.employeeCompensationComponent.count({ where: { componentCode: code } }),
      this.prisma.read.payslipItem.count({ where: { code } }),
    ]);
    if (inComp + inItems > 0) {
      return this.prisma.salaryComponent.update({ where: { code }, data: { active: false } });
    }
    return this.prisma.salaryComponent.delete({ where: { code } });
  }
}
