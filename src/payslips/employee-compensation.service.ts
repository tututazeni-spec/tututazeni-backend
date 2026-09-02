// src/payslips/employee-compensation.service.ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { buildPaginatedResponse, calculatePagination } from '../common/helpers/pagination.helper';
import {
  CompensationListFilterDto,
  CreateEmployeeCompensationDto,
  UpdateEmployeeCompensationDto,
  UpsertCompensationComponentsDto,
} from './payroll.dto';

@Injectable()
export class EmployeeCompensationService {
  constructor(private readonly prisma: PrismaService) {}

  history(userId: number) {
    return this.prisma.read.employeeCompensation.findMany({
      where: { userId },
      orderBy: { effectiveFrom: 'desc' },
      include: {
        components: true,
        user: {
          select: {
            id: true,
            fullName: true,
            employeeNumber: true,
            department: { select: { id: true, name: true } },
          },
        },
      },
    });
  }

  async listAll(filter: CompensationListFilterDto) {
    const page = filter.page ?? 1;
    const limit = filter.limit ?? 20;
    const { skip, take } = calculatePagination(page, limit);

    const where: Prisma.EmployeeCompensationWhereInput = { effectiveTo: null };
    if (filter.countryCode) where.countryCode = filter.countryCode;

    const userWhere: Prisma.UserWhereInput = {};
    if (filter.departmentId) userWhere.departmentId = filter.departmentId;
    if (filter.search) {
      userWhere.OR = [
        { fullName: { contains: filter.search, mode: 'insensitive' } },
        { employeeNumber: { contains: filter.search, mode: 'insensitive' } },
      ];
    }
    if (Object.keys(userWhere).length > 0) where.user = userWhere;

    const [data, total] = await Promise.all([
      this.prisma.read.employeeCompensation.findMany({
        where,
        orderBy: { user: { fullName: 'asc' } },
        skip,
        take,
        omit: { bankName: true, iban: true },
        include: {
          user: {
            select: {
              id: true,
              fullName: true,
              employeeNumber: true,
              department: { select: { id: true, name: true } },
            },
          },
          _count: { select: { components: true } },
        },
      }),
      this.prisma.read.employeeCompensation.count({ where }),
    ]);

    return buildPaginatedResponse(data, total, page, limit);
  }

  current(userId: number) {
    return this.prisma.read.employeeCompensation.findFirst({
      where: { userId, effectiveTo: null },
      orderBy: { effectiveFrom: 'desc' },
      include: { components: true },
    });
  }

  create(dto: CreateEmployeeCompensationDto) {
    const effectiveFrom = dto.effectiveFrom ? new Date(dto.effectiveFrom) : new Date();
    return this.prisma.$transaction(async tx => {
      await (tx as unknown as PrismaService).employeeCompensation.updateMany({
        where: { userId: dto.userId, effectiveTo: null },
        data: { effectiveTo: new Date(effectiveFrom.getTime() - 1000) },
      });
      return (tx as unknown as PrismaService).employeeCompensation.create({
        data: {
          userId: dto.userId,
          baseSalary: dto.baseSalary,
          countryCode: dto.countryCode ?? 'AO',
          bankName: dto.bankName ?? null,
          iban: dto.iban ?? null,
          accountNumber: dto.accountNumber ?? null,
          effectiveFrom,
          foodAllowance: dto.foodAllowance ?? null,
          transportAllowance: dto.transportAllowance ?? null,
        },
      });
    });
  }

  async update(id: number, dto: UpdateEmployeeCompensationDto) {
    const existing = await this.prisma.read.employeeCompensation.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Compensação não encontrada');
    const data: Prisma.EmployeeCompensationUpdateInput = {};
    if (dto.baseSalary !== undefined) data.baseSalary = dto.baseSalary;
    if (dto.countryCode !== undefined) data.countryCode = dto.countryCode;
    if (dto.bankName !== undefined) data.bankName = dto.bankName;
    if (dto.iban !== undefined) data.iban = dto.iban;
    if (dto.accountNumber !== undefined) data.accountNumber = dto.accountNumber;
    if (dto.effectiveFrom !== undefined) data.effectiveFrom = new Date(dto.effectiveFrom);
    if (dto.foodAllowance !== undefined) data.foodAllowance = dto.foodAllowance;
    if (dto.transportAllowance !== undefined) data.transportAllowance = dto.transportAllowance;
    return this.prisma.employeeCompensation.update({ where: { id }, data });
  }

  async setComponents(id: number, dto: UpsertCompensationComponentsDto) {
    const existing = await this.prisma.read.employeeCompensation.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Compensação não encontrada');
    const items = dto.items ?? [];
    return this.prisma.$transaction(async tx => {
      await (tx as unknown as PrismaService).employeeCompensationComponent.deleteMany({
        where: { compensationId: id },
      });
      if (items.length > 0) {
        await (tx as unknown as PrismaService).employeeCompensationComponent.createMany({
          data: items.map(i => ({
            compensationId: id,
            componentCode: i.componentCode,
            value: i.value,
            override: i.override ?? false,
          })),
        });
      }
      return (tx as unknown as PrismaService).employeeCompensationComponent.findMany({
        where: { compensationId: id },
      });
    });
  }

  private maskIban(iban?: string | null): string | null {
    if (!iban) return null;
    const last4 = iban.slice(-4);
    return '•'.repeat(Math.max(0, iban.length - 4)) + last4;
  }

  async myCompensation(userId: number) {
    const c = await this.current(userId);
    if (!c) return null;
    return {
      baseSalary: c.baseSalary,
      foodAllowance: c.foodAllowance,
      transportAllowance: c.transportAllowance,
      bankName: c.bankName,
      ibanMasked: this.maskIban(c.iban),
      effectiveFrom: c.effectiveFrom,
    };
  }
}
