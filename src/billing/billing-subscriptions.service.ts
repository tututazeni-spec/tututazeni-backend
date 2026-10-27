import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { BillingPlan, BillingSubscription, TenantPlan } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { resolveDefaultTenantId } from '../common/helpers/tenant.helper';
import { writeChainedAuditLog } from '../common/helpers/audit-chain';
import { swallow } from '../common/logging/swallow';
import { BillingInvoicesService } from './billing-invoices.service';
import { BillingLimitsService } from './billing-limits.service';
import { BillingPlansService } from './billing-plans.service';
import { addInterval, Interval } from './billing.math';

const DAY = 864e5;
const INVOICE_DUE_DAYS = Number(process.env.BILLING_DUE_DAYS) || 7;

@Injectable()
export class BillingSubscriptionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly plans: BillingPlansService,
    private readonly invoices: BillingInvoicesService,
    private readonly limits: BillingLimitsService,
  ) {}

  private audit(action: string, entityId: string, actorId: number | undefined, extra: object) {
    return writeChainedAuditLog(this.prisma, {
      userId: actorId,
      action,
      entity: 'BillingSubscription',
      entityId,
      severity: 'HIGH',
      metadata: JSON.stringify(extra),
    }).catch(
      swallow('billing-subscriptions.service', 'falha ao gravar auditoria', undefined, 'error'),
    );
  }

  private priceFor(plan: BillingPlan, interval: Interval) {
    return Number(interval === 'YEARLY' ? plan.priceYearly : plan.priceMonthly);
  }

  /** Mantém TenantConfig (lido por scalability/settings) coerente com o plano contratado. */
  private async syncTenant(sub: BillingSubscription, plan: BillingPlan) {
    const known: TenantPlan[] = ['STARTER', 'GROWTH', 'ENTERPRISE'];
    await this.prisma.tenantConfig.update({
      where: { id: sub.tenantId },
      data: {
        plan: known.includes(plan.code as TenantPlan) ? (plan.code as TenantPlan) : 'CUSTOM',
        maxUsers: plan.maxUsers,
        maxStorageGb: plan.maxStorageGb,
        trialEndsAt: sub.trialEndsAt,
        billingCycleStart: sub.currentPeriodStart,
        contractEndDate: sub.currentPeriodEnd,
      },
    });
    this.limits.invalidate();
  }

  private async latest(tenantId: string) {
    return this.prisma.billingSubscription.findFirst({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
      include: { plan: true },
    });
  }

  async current() {
    const tenantId = await resolveDefaultTenantId(this.prisma);
    const sub = await this.latest(tenantId);
    return { subscription: sub, usage: await this.limits.usage() };
  }

  async startTrial(planCode: string, actorId?: number) {
    const tenantId = await resolveDefaultTenantId(this.prisma);
    const plan = await this.plans.byCode(planCode);
    const existing = await this.latest(tenantId);
    if (existing) {
      throw new ConflictException(
        'Este cliente já teve uma subscrição; o período de teste só é concedido uma vez',
      );
    }
    const now = new Date();
    const trialEndsAt = new Date(now.getTime() + plan.trialDays * DAY);
    const sub = await this.prisma.billingSubscription.create({
      data: {
        tenantId,
        planId: plan.id,
        status: 'TRIALING',
        interval: 'MONTHLY',
        priceAmount: plan.priceMonthly,
        currency: plan.currency,
        trialEndsAt,
        currentPeriodStart: now,
        currentPeriodEnd: trialEndsAt,
      },
    });
    await this.syncTenant(sub, plan);
    await this.audit('BILLING_TRIAL_STARTED', sub.id, actorId, { planCode, trialEndsAt });
    return sub;
  }

  /** Contrata um plano: emite a fatura do primeiro período; o acesso pago começa quando for paga. */
  async subscribe(planCode: string, interval: Interval, actorId?: number) {
    const tenantId = await resolveDefaultTenantId(this.prisma);
    const plan = await this.plans.byCode(planCode);
    let sub = await this.latest(tenantId);
    if (sub && ['ACTIVE', 'PAST_DUE'].includes(sub.status)) {
      throw new ConflictException('Já existe uma subscrição activa: use a mudança de plano');
    }
    const now = new Date();
    // Durante o teste, o 1.º período pago começa quando o teste acaba.
    const start =
      sub?.status === 'TRIALING' && sub.trialEndsAt && sub.trialEndsAt > now
        ? sub.trialEndsAt
        : now;
    const end = addInterval(start, interval);
    const price = this.priceFor(plan, interval);

    if (sub && sub.status !== 'CANCELED' && sub.status !== 'EXPIRED') {
      sub = await this.prisma.billingSubscription.update({
        where: { id: sub.id },
        data: { planId: plan.id, interval, priceAmount: price, currency: plan.currency },
        include: { plan: true },
      });
    } else {
      // Sem subscrição (ou terminada): nova, a aguardar o 1.º pagamento.
      sub = await this.prisma.billingSubscription.create({
        data: {
          tenantId,
          planId: plan.id,
          status: 'PENDING',
          interval,
          priceAmount: price,
          currency: plan.currency,
          currentPeriodStart: start,
          currentPeriodEnd: end,
        },
        include: { plan: true },
      });
    }
    await this.syncTenant(sub, plan);
    const invoice = await this.invoices.issue({
      subscriptionId: sub.id,
      periodStart: start,
      periodEnd: end,
      dueDate: new Date(Math.max(now.getTime(), start.getTime()) + INVOICE_DUE_DAYS * DAY),
      actorId,
    });
    await this.audit('BILLING_SUBSCRIBED', sub.id, actorId, {
      planCode,
      interval,
      invoice: invoice.fullNumber,
    });
    return { subscription: sub, invoice };
  }

  /** Mudança de plano imediata nos limites; o novo preço aplica-se a partir da próxima fatura (sem proporcional). */
  async changePlan(planCode: string, actorId?: number) {
    const tenantId = await resolveDefaultTenantId(this.prisma);
    const plan = await this.plans.byCode(planCode);
    const sub = await this.latest(tenantId);
    if (!sub || ['CANCELED', 'EXPIRED'].includes(sub.status)) {
      throw new NotFoundException('Sem subscrição activa para alterar');
    }
    const users = await this.prisma.user.count();
    if (users > plan.maxUsers) {
      throw new BadRequestException(
        `O plano ${plan.name} permite ${plan.maxUsers} utilizadores e existem ${users}. Reduza utilizadores primeiro.`,
      );
    }
    const updated = await this.prisma.billingSubscription.update({
      where: { id: sub.id },
      data: {
        planId: plan.id,
        priceAmount: this.priceFor(plan, sub.interval),
        currency: plan.currency,
      },
    });
    await this.syncTenant(updated, plan);
    await this.audit('BILLING_PLAN_CHANGED', sub.id, actorId, {
      from: sub.plan.code,
      to: plan.code,
    });
    return updated;
  }

  async cancel(reason?: string, atPeriodEnd = true, actorId?: number) {
    const tenantId = await resolveDefaultTenantId(this.prisma);
    const sub = await this.latest(tenantId);
    if (!sub || ['CANCELED', 'EXPIRED'].includes(sub.status)) {
      throw new NotFoundException('Sem subscrição activa para cancelar');
    }
    const now = new Date();
    const updated = await this.prisma.billingSubscription.update({
      where: { id: sub.id },
      data: atPeriodEnd
        ? { cancelAtPeriodEnd: true, cancelReason: reason }
        : { status: 'CANCELED', canceledAt: now, cancelReason: reason, currentPeriodEnd: now },
    });
    this.limits.invalidate();
    await this.audit('BILLING_CANCELED', sub.id, actorId, { reason, atPeriodEnd });
    return updated;
  }
}
