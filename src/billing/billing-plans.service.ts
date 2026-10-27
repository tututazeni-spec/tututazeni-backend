import { Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpsertPlanDto } from './billing.dto';

// Valores de ARRANQUE (AOA). São exemplos: o negócio ajusta-os com PUT /billing/plans/:code.
const DEFAULT_PLANS = [
  {
    code: 'STARTER',
    name: 'Starter',
    priceMonthly: 150000,
    priceYearly: 1620000,
    maxUsers: 200,
    maxStorageGb: 50,
    trialDays: 14,
  },
  {
    code: 'GROWTH',
    name: 'Growth',
    priceMonthly: 600000,
    priceYearly: 6480000,
    maxUsers: 1500,
    maxStorageGb: 250,
    trialDays: 14,
  },
  {
    code: 'ENTERPRISE',
    name: 'Enterprise',
    priceMonthly: 2000000,
    priceYearly: 21600000,
    maxUsers: 6000,
    maxStorageGb: 1000,
    trialDays: 30,
  },
];

@Injectable()
export class BillingPlansService implements OnModuleInit {
  private readonly log = new Logger(BillingPlansService.name);
  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    try {
      if ((await this.prisma.billingPlan.count()) > 0) return;
      await this.prisma.billingPlan.createMany({ data: DEFAULT_PLANS, skipDuplicates: true });
      this.log.log('Planos de faturação por omissão criados (valores de exemplo: ajustar).');
    } catch (e) {
      this.log.warn(`Seed de planos ignorado: ${(e as Error).message}`);
    }
  }

  list(includeInactive = false) {
    return this.prisma.billingPlan.findMany({
      where: includeInactive ? {} : { isActive: true },
      orderBy: { priceMonthly: 'asc' },
    });
  }

  async byCode(code: string) {
    const p = await this.prisma.billingPlan.findUnique({ where: { code } });
    if (!p || !p.isActive) throw new NotFoundException(`Plano ${code} não existe ou está inactivo`);
    return p;
  }

  upsert(code: string, dto: UpsertPlanDto) {
    const data = {
      name: dto.name,
      priceMonthly: dto.priceMonthly,
      priceYearly: dto.priceYearly,
      currency: dto.currency ?? 'AOA',
      maxUsers: dto.maxUsers,
      maxStorageGb: dto.maxStorageGb,
      modulesJson: dto.modules ? JSON.stringify(dto.modules) : null,
      trialDays: dto.trialDays ?? 14,
      isActive: dto.isActive ?? true,
    };
    return this.prisma.billingPlan.upsert({
      where: { code },
      update: data,
      create: { code, ...data },
    });
  }
}
