// src/payslips/employee-compensation.service.ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { decryptPii, encryptPii } from '../../common/security/pii-crypto';
import {
  buildPaginatedResponse,
  calculatePagination,
} from '../../common/helpers/pagination.helper';
import {
  CompensationListFilterDto,
  CreateEmployeeCompensationDto,
  UpdateEmployeeCompensationDto,
  UpsertCompensationComponentsDto,
} from '../payroll.dto';

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
              avatarUrl: true,
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

  /** IBAN/conta são gravados cifrados (AES-256-GCM); a API continua a devolvê-los em claro. */
  private plain<T extends { iban?: string | null; accountNumber?: string | null }>(c: T): T;
  private plain<T extends { iban?: string | null; accountNumber?: string | null }>(
    c: T | null,
  ): T | null;
  private plain<T extends { iban?: string | null; accountNumber?: string | null }>(c: T | null) {
    if (!c) return c;
    return { ...c, iban: decryptPii(c.iban), accountNumber: decryptPii(c.accountNumber) };
  }

  async current(userId: number) {
    const c = await this.prisma.read.employeeCompensation.findFirst({
      where: { userId, effectiveTo: null },
      orderBy: { effectiveFrom: 'desc' },
      include: { components: true },
    });
    return this.plain(c);
  }

  create(dto: CreateEmployeeCompensationDto) {
    const effectiveFrom = dto.effectiveFrom ? new Date(dto.effectiveFrom) : new Date();
    return this.prisma.$transaction(async tx => {
      await tx.employeeCompensation.updateMany({
        where: { userId: dto.userId, effectiveTo: null },
        data: { effectiveTo: new Date(effectiveFrom.getTime() - 1000) },
      });
      const created = await tx.employeeCompensation.create({
        data: {
          userId: dto.userId,
          baseSalary: dto.baseSalary,
          countryCode: dto.countryCode ?? 'AO',
          bankName: dto.bankName ?? null,
          iban: encryptPii(dto.iban),
          accountNumber: encryptPii(dto.accountNumber),
          effectiveFrom,
          foodAllowance: dto.foodAllowance ?? null,
          transportAllowance: dto.transportAllowance ?? null,
        },
      });
      return this.plain(created);
    });
  }

  async update(id: number, dto: UpdateEmployeeCompensationDto) {
    const existing = await this.prisma.read.employeeCompensation.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Compensação não encontrada');
    const data: Prisma.EmployeeCompensationUpdateInput = {};
    if (dto.baseSalary !== undefined) data.baseSalary = dto.baseSalary;
    if (dto.countryCode !== undefined) data.countryCode = dto.countryCode;
    if (dto.bankName !== undefined) data.bankName = dto.bankName;
    if (dto.iban !== undefined) data.iban = encryptPii(dto.iban);
    if (dto.accountNumber !== undefined) data.accountNumber = encryptPii(dto.accountNumber);
    if (dto.effectiveFrom !== undefined) data.effectiveFrom = new Date(dto.effectiveFrom);
    if (dto.foodAllowance !== undefined) data.foodAllowance = dto.foodAllowance;
    if (dto.transportAllowance !== undefined) data.transportAllowance = dto.transportAllowance;
    return this.plain(await this.prisma.employeeCompensation.update({ where: { id }, data }));
  }

  async setComponents(id: number, dto: UpsertCompensationComponentsDto) {
    const existing = await this.prisma.read.employeeCompensation.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Compensação não encontrada');
    const items = dto.items ?? [];
    return this.prisma.$transaction(async tx => {
      await tx.employeeCompensationComponent.deleteMany({
        where: { compensationId: id },
      });
      if (items.length > 0) {
        await tx.employeeCompensationComponent.createMany({
          data: items.map(i => ({
            compensationId: id,
            componentCode: i.componentCode,
            value: i.value,
            override: i.override ?? false,
          })),
        });
      }
      return tx.employeeCompensationComponent.findMany({
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
      ibanMasked: this.maskIban(decryptPii(c.iban)),
      effectiveFrom: c.effectiveFrom,
    };
  }
}
