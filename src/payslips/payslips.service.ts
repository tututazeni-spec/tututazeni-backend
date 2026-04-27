// ─── src/payslips/payslips.service.ts ────────────────────────────────────────
import {
  Injectable, NotFoundException, ConflictException,
  BadRequestException, ForbiddenException,
} from '@nestjs/common';
import { PrismaService }       from '../prisma/prisma.service';
import { AuditService }        from '../common/services/audit.service';
import { PayrollEngineService } from './payroll-engine.service';
import {
  PayslipFilterDto, PayrollRunFilterDto,
  CreatePayslipDto, UpdatePayslipDto,
  CreatePayrollRunDto, ProcessPayrollDto, SimulatePayrollDto,
  CreateEmployeeCompensationDto,
  CreateCountryConfigDto, CreateSalaryComponentDto,
  PayslipStatus, PayrollRunStatus,
} from './payslips.dto';

// ─────────────────────────────────────────────────────────────────────────────

@Injectable()
export class PayslipsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly engine: PayrollEngineService,
  ) {}

  // ══════════════════════════════════════════════════════════════════
  // PAYSLIPS — LIST / DETAIL
  // ══════════════════════════════════════════════════════════════════

  async findAll(filters: PayslipFilterDto) {
    const { page = 1, limit = 20, userId, period, status, department, countryCode, runId } = filters;
    const skip = (page - 1) * limit;
    const where: any = {};

    if (userId)      where.userId      = userId;
    if (period)      where.period      = { contains: period };
    if (status)      where.status      = status;
    if (countryCode) where.countryCode = countryCode;
    if (runId)       where.runId       = runId;
    if (department)  where.user = { employee: { department: { contains: department, mode: 'insensitive' } } };

    const [data, total] = await Promise.all([
     this.prisma.payslip.findMany({
      where, skip, take: limit,
      include: {
        user: { select: { id: true, fullName: true } },
        items: { orderBy: { order: 'asc' } },
        run: { select: { id: true, period: true, status: true } },
      },
        orderBy: [{ period: 'desc' }, { userId: 'asc' }],
      }),
      this.prisma.payslip.count({ where }),
    ]);

    return { data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  async findOne(id: number, requesterId?: number) {
    const p = await this.prisma.payslip.findUnique({
      where: { id },
      include: {
        user: { select: { id: true, fullName: true } },
        items: { orderBy: { order: 'asc' } },
        run: { select: { id: true, period: true, status: true } },
        accessLogs: { orderBy: { createdAt: 'desc' }, take: 10 },
      },
    });
    if (!p) throw new NotFoundException('Recibo não encontrado');

    // Registar acesso
    if (requesterId) {
      await this.prisma.payslipAccessLog.create({
        data: { payslipId: id, userId: requesterId, action: 'VIEW' },
      });
    }

    return p;
  }

  async getMyPayslips(userId: number) {
    const payslips = await this.prisma.payslip.findMany({
      where: { userId, status: { in: [PayslipStatus.ISSUED, PayslipStatus.ACKNOWLEDGED] } },
      include: { items: { orderBy: { order: 'asc' } } },
      orderBy: { period: 'desc' },
      take: 36, // 3 anos de histórico
    });

    // Resumo anual
    const currentYear = new Date().getFullYear().toString();
    const thisYear    = payslips.filter(p => p.period.startsWith(currentYear));
    const annualSummary = {
      year: currentYear,
      totalNet:    +thisYear.reduce((a, p) => a + (p.netSalary ?? 0), 0).toFixed(2),
      totalGross:  +thisYear.reduce((a, p) => a + (p.grossSalary ?? 0), 0).toFixed(2),
      totalIRT:    +thisYear.reduce((a, p) => a + (p.incomeTax ?? 0), 0).toFixed(2),
      totalINSS:   +thisYear.reduce((a, p) => a + (p.socialSecurity ?? 0), 0).toFixed(2),
      months:      thisYear.length,
    };

    return { payslips, annualSummary };
  }

  async getAnnualStatement(userId: number, year: number) {
    const payslips = await this.prisma.payslip.findMany({
      where: {
        userId,
        period: { startsWith: year.toString() },
        status: { in: [PayslipStatus.ISSUED, PayslipStatus.ACKNOWLEDGED] },
      },
      include: { items: true },
      orderBy: { period: 'asc' },
    });

    const totals = payslips.reduce((acc, p) => ({
      totalGross:   acc.totalGross + (p.grossSalary ?? 0),
      totalNet:     acc.totalNet   + (p.netSalary ?? 0),
      totalIRT:     acc.totalIRT   + (p.incomeTax ?? 0),
      totalINSS:    acc.totalINSS  + (p.socialSecurity ?? 0),
      totalEarnings:acc.totalEarnings + (p.totalEarnings ?? 0),
    }), { totalGross: 0, totalNet: 0, totalIRT: 0, totalINSS: 0, totalEarnings: 0 });

    // Rendimentos por categoria
    const allItems = payslips.flatMap(p => p.items ?? []);
    const byComponent: Record<string, number> = {};
    for (const item of allItems) {
      byComponent[item.code] = (byComponent[item.code] ?? 0) + item.value;
    }

    return {
      userId, year,
      months: payslips.length,
      payslips: payslips.map(p => ({ period: p.period, gross: p.grossSalary, net: p.netSalary, irt: p.incomeTax })),
      totals: Object.fromEntries(Object.entries(totals).map(([k, v]) => [k, +v.toFixed(2)])),
      byComponent,
    };
  }

  // ══════════════════════════════════════════════════════════════════
  // PAYROLL RUNS
  // ══════════════════════════════════════════════════════════════════

  async createRun(dto: CreatePayrollRunDto, createdById: number) {
    const exists = await this.prisma.payrollRun.findFirst({
      where: { period: dto.period, status: { not: PayrollRunStatus.CANCELLED } },
    });
    if (exists) throw new ConflictException(`Já existe uma folha para o período ${dto.period}`);

    const run = await this.prisma.payrollRun.create({
      data: {
        period: dto.period,
        countryCode: dto.countryCode ?? 'AO',
        status: PayrollRunStatus.DRAFT,
        notes: dto.notes,
        createdById,
      },
    });

    await this.audit.log({ action: 'PAYROLL_RUN_CREATED', entityType: 'PayrollRun', entityId: run.id, userId: createdById, metadata: { period: dto.period } });

    return run;
  }

  async getRuns(filters: PayrollRunFilterDto) {
    const { page = 1, limit = 12, period, status, countryCode } = filters;
    const skip = (page - 1) * limit;
    const where: any = {};
    if (period)      where.period      = { contains: period };
    if (status)      where.status      = status;
    if (countryCode) where.countryCode = countryCode;

    const [data, total] = await Promise.all([
      this.prisma.payrollRun.findMany({
        where, skip, take: limit,
        orderBy: { period: 'desc' },
        include: {
          _count: { select: { payslips: true } },
          createdBy: { select: { id: true, fullName: true } },
        },
      }),
      this.prisma.payrollRun.count({ where }),
    ]);

    return { data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  async processRun(dto: ProcessPayrollDto, processedById: number) {
    const run = await this.prisma.payrollRun.findUnique({ where: { id: dto.runId } });
    if (!run) throw new NotFoundException('Folha de processamento não encontrada');
    if (![PayrollRunStatus.DRAFT, PayrollRunStatus.CALCULATED].includes(run.status as any)) {
      throw new BadRequestException('Esta folha não pode ser reprocessada no estado actual');
    }

    await this.prisma.payrollRun.update({
      where: { id: dto.runId },
      data: { status: PayrollRunStatus.PROCESSING },
    });

    // Buscar colaboradores activos com compensação definida
    const compensations = await this.prisma.employeeCompensation.findMany({
      where: {
        OR: [{ effectiveTo: null }, { effectiveTo: { gte: new Date() } }],
      },
      include: { user: { select: { id: true, fullName: true } } },
    });

    const inputMap = new Map(dto.inputs?.map(i => [i.userId, i]) ?? []);
    const config   = await this.engine.loadCountryConfig(run.countryCode, new Date().getFullYear());
    const results  = [];
    const errors   = [];

    for (const comp of compensations) {
      try {
        const input   = inputMap.get(comp.userId);
        const context = {
          userId:              comp.userId,
          baseSalary:          comp.baseSalary,
          countryCode:         run.countryCode,
          taxYear:             new Date().getFullYear(),
          overtimeHours:       input?.overtimeHours,
          bonusAmount:         input?.bonusAmount,
          absenceDays:         input?.absenceDays,
          advanceDeduction:    input?.advanceDeduction,
        };

        const result = await this.engine.calculate(context, run.period);

        // Upsert payslip
        const payslip = await this.upsertCalculatedPayslip(result, run.id, run.period);
        results.push({ userId: comp.userId, payslipId: payslip.id, net: result.netSalary });
      } catch (e: any) {
        errors.push({ userId: comp.userId, error: e.message });
      }
    }

    await this.prisma.payrollRun.update({
      where: { id: dto.runId },
      data: {
        status: errors.length > 0 ? PayrollRunStatus.CALCULATED : PayrollRunStatus.CALCULATED,
        processedAt: new Date(),
        processedById,
        totalGross: results.reduce((a: number, r: any) => a + r.net, 0),
      },
    });

    await this.audit.log({ action: 'PAYROLL_RUN_PROCESSED', entityType: 'PayrollRun', entityId: dto.runId, userId: processedById, metadata: { count: results.length, errors: errors.length } });

    return {
      runId: dto.runId,
      period: run.period,
      processed: results.length,
      errors: errors.length,
      errorDetails: errors,
    };
  }

  async approveRun(runId: number, approvedById: number) {
    const run = await this.prisma.payrollRun.findUnique({ where: { id: runId } });
    if (!run) throw new NotFoundException('Folha não encontrada');
    if (run.status !== PayrollRunStatus.CALCULATED) throw new BadRequestException('Folha não está calculada');

    await this.prisma.payrollRun.update({
      where: { id: runId },
      data: { status: PayrollRunStatus.APPROVED, approvedById, approvedAt: new Date() },
    });

    await this.audit.log({ action: 'PAYROLL_RUN_APPROVED', entityType: 'PayrollRun', entityId: runId, userId: approvedById });

    return { message: 'Folha aprovada com sucesso' };
  }

  async publishRun(runId: number, publishedById: number) {
    const run = await this.prisma.payrollRun.findUnique({
      where: { id: runId },
      include: { payslips: { select: { id: true, userId: true, period: true } } },
    });
    if (!run) throw new NotFoundException('Folha não encontrada');
    if (run.status !== PayrollRunStatus.APPROVED) throw new BadRequestException('Folha não está aprovada');

    // Publicar todos os recibos
    await this.prisma.payslip.updateMany({
      where: { runId },
      data: { status: PayslipStatus.ISSUED, issuedAt: new Date() },
    });

    // Notificar colaboradores
    for (const ps of run.payslips) {
      await this.prisma.notificationLog.create({
        data: { userId: ps.userId, type: 'PAYSLIP_ISSUED', message: `O seu recibo de ${ps.period} está disponível`, success: true },
      });
    }

    await this.prisma.payrollRun.update({
      where: { id: runId },
      data: { status: PayrollRunStatus.PUBLISHED },
    });

    await this.audit.log({ action: 'PAYROLL_RUN_PUBLISHED', entityType: 'PayrollRun', entityId: runId, userId: publishedById, metadata: { payslips: run.payslips.length } });

    return { published: run.payslips.length };
  }

  // ══════════════════════════════════════════════════════════════════
  // PAYSLIPS — CRUD & WORKFLOW
  // ══════════════════════════════════════════════════════════════════

  async create(dto: CreatePayslipDto, createdById: number) {
    const exists = await this.prisma.payslip.findFirst({ where: { userId: dto.userId, period: dto.period } });
    if (exists) throw new ConflictException(`Recibo de ${dto.period} já existe para este colaborador`);

    const gross       = (dto.grossSalary ?? dto.baseSalary) + 0;
    const deductions  = dto.totalDeductions ?? ((dto.incomeTax ?? 0) + (dto.socialSecurity ?? 0) + (dto.otherDeductions ?? 0));
    const net         = dto.netSalary ?? (gross - deductions);

    return this.prisma.payslip.create({
      data: {
        userId: dto.userId,
        period: dto.period,
        runId: dto.runId,
        baseSalary: dto.baseSalary,
        grossSalary: gross,
        netSalary: net,
        totalEarnings: dto.totalEarnings ?? gross,
        totalDeductions: deductions,
        incomeTax: dto.incomeTax ?? 0,
        socialSecurity: dto.socialSecurity ?? 0,
        employerSocialSecurity: dto.employerSocialSecurity ?? 0,
        otherDeductions: dto.otherDeductions ?? 0,
        countryCode: dto.countryCode ?? 'AO',
        status: PayslipStatus.DRAFT,
        notes: dto.notes,
        createdById,
      },
    });
  }

  async update(id: number, dto: UpdatePayslipDto, updatedById: number) {
    const p = await this.findOne(id);
    if ([PayslipStatus.ISSUED, PayslipStatus.ACKNOWLEDGED].includes(p.status as any)) {
      throw new BadRequestException('Não é possível editar um recibo já emitido');
    }
    await this.audit.log({ action: 'PAYSLIP_UPDATED', entityType: 'Payslip', entityId: id, userId: updatedById });
    return this.prisma.payslip.update({ where: { id }, data: dto as any });
  }

  async issue(id: number, issuedById: number) {
    const p = await this.findOne(id);
    if (p.status !== PayslipStatus.APPROVED && p.status !== PayslipStatus.DRAFT) {
      throw new BadRequestException('Recibo deve estar aprovado para ser emitido');
    }

    const updated = await this.prisma.payslip.update({
      where: { id },
      data: { status: PayslipStatus.ISSUED, issuedAt: new Date() },
    });

    await this.prisma.notificationLog.create({
      data: { userId: updated.userId, type: 'PAYSLIP_ISSUED', message: `O seu recibo de ${updated.period} está disponível`, success: true },
    });

    await this.audit.log({ action: 'PAYSLIP_ISSUED', entityType: 'Payslip', entityId: id, userId: issuedById });

    return updated;
  }

  async acknowledge(id: number, userId: number) {
    const p = await this.findOne(id);
    if (p.userId !== userId) throw new ForbiddenException('Sem permissão');
    if (p.status !== PayslipStatus.ISSUED) throw new BadRequestException('Recibo não está emitido');

    const updated = await this.prisma.payslip.update({
      where: { id },
      data: { status: PayslipStatus.ACKNOWLEDGED, acknowledgedAt: new Date() },
    });

    await this.prisma.payslipAccessLog.create({
      data: { payslipId: id, userId, action: 'ACKNOWLEDGE' },
    });

    return updated;
  }

  // ══════════════════════════════════════════════════════════════════
  // SIMULATION
  // ══════════════════════════════════════════════════════════════════

  async simulate(dto: SimulatePayrollDto) {
    const countryCode = dto.countryCode ?? 'AO';
    const taxYear     = dto.taxYear ?? new Date().getFullYear();

    const result = await this.engine.calculate(
      {
        userId: 0, // simulação sem utilizador real
        baseSalary: dto.baseSalary,
        countryCode, taxYear,
        bonusAmount: dto.bonusAmount,
        foodAllowance: dto.foodAllowance,
        transportAllowance: dto.transportAllowance,
        overtimeHours: dto.overtimeHours,
        advanceDeduction: dto.advanceDeduction,
      },
      `SIMULATION`,
    );

    // Não persistir — apenas retornar o breakdown
    return {
      simulation: true,
      ...result,
      lines: result.lines.map(l => ({
        code: l.code, name: l.name, type: l.type,
        value: l.value, isTaxable: l.isTaxable,
      })),
    };
  }

  // ══════════════════════════════════════════════════════════════════
  // ANALYTICS / DASHBOARD
  // ══════════════════════════════════════════════════════════════════

  async getDashboard(period?: string, department?: string) {
    const targetPeriod = period ?? new Date().toISOString().slice(0, 7);
    const where: any   = { period: { contains: targetPeriod.slice(0, 7) } };
    if (department) where.user = { employee: { department: { contains: department, mode: 'insensitive' } } };

    const payslips = await this.prisma.payslip.findMany({
      where: { ...where, status: { in: [PayslipStatus.ISSUED, PayslipStatus.ACKNOWLEDGED, PayslipStatus.APPROVED] } },
      include: { user: { select: { id: true, fullName: true } } },
    });

    const totalGross      = payslips.reduce((a, p) => a + (p.grossSalary ?? 0), 0);
    const totalNet        = payslips.reduce((a, p) => a + (p.netSalary ?? 0), 0);
    const totalIRT        = payslips.reduce((a, p) => a + (p.incomeTax ?? 0), 0);
    const totalINSS       = payslips.reduce((a, p) => a + (p.socialSecurity ?? 0), 0);
    const totalEmpCost    = payslips.reduce((a, p) => a + (p.grossSalary ?? 0) + (p.employerSocialSecurity ?? 0), 0);
    const avgSalary       = payslips.length ? totalGross / payslips.length : 0;

    const byDept = payslips.reduce((acc: any, p) => {
      const dept = (p as any).user?.employee?.department ?? 'N/A';
      if (!acc[dept]) acc[dept] = { department: dept, count: 0, totalGross: 0, totalNet: 0 };
      acc[dept].count++;
      acc[dept].totalGross += p.grossSalary ?? 0;
      acc[dept].totalNet   += p.netSalary ?? 0;
      return acc;
    }, {});

    return {
      period: targetPeriod,
      kpis: {
        headcount:    payslips.length,
        totalGross:   +totalGross.toFixed(2),
        totalNet:     +totalNet.toFixed(2),
        totalIRT:     +totalIRT.toFixed(2),
        totalINSS:    +totalINSS.toFixed(2),
        totalEmployerCost: +totalEmpCost.toFixed(2),
        avgSalary:    +avgSalary.toFixed(2),
      },
      byDepartment: Object.values(byDept).map((d: any) => ({
        ...d,
        totalGross: +d.totalGross.toFixed(2),
        totalNet:   +d.totalNet.toFixed(2),
      })),
    };
  }

  async getMonthlyTrend(months = 12) {
    const records = await this.prisma.payslip.groupBy({
      by: ['period'],
      where: { status: { in: [PayslipStatus.ISSUED, PayslipStatus.ACKNOWLEDGED] } },
      _sum: { grossSalary: true, netSalary: true, incomeTax: true },
      _count: true,
      orderBy: { period: 'desc' },
      take: months,
    });

    return records.reverse().map(r => ({
      period:    r.period,
      gross:     r._sum.grossSalary ?? 0,
      net:       r._sum.netSalary ?? 0,
      irt:       r._sum.incomeTax ?? 0,
      headcount: r._count,
    }));
  }

  // ══════════════════════════════════════════════════════════════════
  // COUNTRY CONFIG & COMPONENTS
  // ══════════════════════════════════════════════════════════════════

  async createCountryConfig(dto: CreateCountryConfigDto, createdById: number) {
    const { irtBrackets, socialSecurity, ...rest } = dto;

    return this.prisma.countryConfig.create({
      data: {
        ...rest,
        socialSecurity: socialSecurity as any,
        active: dto.active ?? true,
        irtBrackets: { create: irtBrackets.map((b, i) => ({ ...b, order: i })) },
      },
      include: { irtBrackets: true },
    });
  }

  async getCountryConfigs() {
    return this.prisma.countryConfig.findMany({
      where: { active: true },
      include: { irtBrackets: { orderBy: { min: 'asc' } } },
    });
  }

  async createSalaryComponent(dto: CreateSalaryComponentDto) {
    return this.prisma.salaryComponent.create({ data: dto as any });
  }

  async getSalaryComponents(countryCode?: string) {
    return this.prisma.salaryComponent.findMany({
      where: {
        active: true,
        OR: countryCode ? [{ countryCode }, { countryCode: null }] : undefined,
      },
      orderBy: [{ type: 'asc' }, { order: 'asc' }],
    });
  }

  async createEmployeeCompensation(dto: CreateEmployeeCompensationDto, createdById: number) {
    // Encerrar compensação anterior
    await this.prisma.employeeCompensation.updateMany({
      where: { userId: dto.userId, effectiveTo: null },
      data: { effectiveTo: dto.effectiveFrom ? new Date(dto.effectiveFrom) : new Date() },
    });

    const { components, ...rest } = dto;

    return this.prisma.employeeCompensation.create({
      data: {
        ...rest,
        effectiveFrom: dto.effectiveFrom ? new Date(dto.effectiveFrom) : new Date(),
        effectiveTo: dto.effectiveTo ? new Date(dto.effectiveTo) : null,
        components: components ? {
          create: components.map(c => ({
            componentCode: c.componentCode,
            value: c.value,
            override: c.override ?? false,
          })),
        } : undefined,
      },
      include: { components: true },
    });
  }

  async getEmployeeCompensation(userId: number) {
    return this.engine.loadEmployeeCompensation(userId);
  }

  // ══════════════════════════════════════════════════════════════════
  // INTERNAL HELPERS
  // ══════════════════════════════════════════════════════════════════

  private async upsertCalculatedPayslip(result: any, runId: number, period: string) {
    const existing = await this.prisma.payslip.findFirst({
      where: { userId: result.userId, period },
    });

    const data = {
      userId:              result.userId,
      period,
      runId,
      countryCode:         result.countryCode,
      baseSalary:          result.lines.find((l: any) => l.code === 'BASE_SALARY')?.value ?? 0,
      grossSalary:         result.grossSalary,
      netSalary:           result.netSalary,
      totalEarnings:       result.totalEarnings,
      totalDeductions:     result.totalDeductions,
      incomeTax:           result.incomeTax,
      socialSecurity:      result.employeeSocialSecurity,
      employerSocialSecurity: result.employerSocialSecurity,
      totalEmployerCost:   result.totalEmployerCost,
      taxBracket:          result.taxBracketApplied,
      status:              PayslipStatus.DRAFT,
    };

    let payslip: any;
    if (existing) {
      // Cancelar versão anterior e criar nova
      await this.prisma.payslip.update({ where: { id: existing.id }, data: { status: PayslipStatus.CANCELLED } });
    }

    payslip = await this.prisma.payslip.create({ data });

    // Criar itens de detalhe
    await this.prisma.payslipItem.createMany({
      data: result.lines.map((l: any, idx: number) => ({
        payslipId:  payslip.id,
        code:       l.code,
        name:       l.name,
        type:       l.type,
        value:      l.value,
        isTaxable:  l.isTaxable,
        calcType:   l.calcType,
        order:      idx,
      })),
    });

    return payslip;
  }
}