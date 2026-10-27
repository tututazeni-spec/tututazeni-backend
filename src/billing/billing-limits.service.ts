import { ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { resolveDefaultTenantId } from '../common/helpers/tenant.helper';

export interface PlanLimits {
  maxUsers: number;
  maxStorageGb: number;
  modules: string[] | null; // null = todos
}

const TTL_MS = 30_000;

/**
 * Limites efectivos do plano. Sem subscrição valem os limites de TenantConfig (comportamento
 * anterior à faturação), por isso instalações sem subscrição não ficam bloqueadas.
 */
@Injectable()
export class BillingLimitsService {
  private cache: { at: number; value: Awaited<ReturnType<BillingLimitsService['load']>> } | null =
    null;

  constructor(private readonly prisma: PrismaService) {}

  invalidate() {
    this.cache = null;
  }

  private async load() {
    const tenantId = await resolveDefaultTenantId(this.prisma);
    const [tenant, sub] = await Promise.all([
      this.prisma.tenantConfig.findUniqueOrThrow({ where: { id: tenantId } }),
      this.prisma.billingSubscription.findFirst({
        where: { tenantId },
        orderBy: { createdAt: 'desc' },
        include: { plan: true },
      }),
    ]);
    const now = new Date();
    const readOnly =
      !!sub &&
      (sub.status === 'EXPIRED' ||
        (sub.status === 'CANCELED' && sub.currentPeriodEnd < now) ||
        (sub.status === 'TRIALING' && !!sub.trialEndsAt && sub.trialEndsAt < now));
    const limits: PlanLimits = sub
      ? {
          maxUsers: sub.plan.maxUsers,
          maxStorageGb: sub.plan.maxStorageGb,
          modules: sub.plan.modulesJson ? (JSON.parse(sub.plan.modulesJson) as string[]) : null,
        }
      : { maxUsers: tenant.maxUsers, maxStorageGb: tenant.maxStorageGb, modules: null };
    return { tenantId, subscription: sub, limits, readOnly };
  }

  async current() {
    if (this.cache && Date.now() - this.cache.at < TTL_MS) return this.cache.value;
    const value = await this.load();
    this.cache = { at: Date.now(), value };
    return value;
  }

  async assertCanAddUser(adding = 1) {
    const { limits, subscription } = await this.load();
    const users = await this.prisma.user.count();
    if (users + adding > limits.maxUsers) {
      throw new ForbiddenException(
        `Limite do plano${subscription ? ` ${subscription.plan.name}` : ''} atingido: ${users}/${limits.maxUsers} utilizadores. Mude de plano para adicionar mais.`,
      );
    }
  }

  async assertModuleIncluded(subject: string) {
    const { limits } = await this.current();
    if (limits.modules && !limits.modules.includes(subject)) {
      throw new ForbiddenException(`O módulo ${subject} não está incluído no seu plano.`);
    }
  }

  async usage() {
    const { limits, subscription, readOnly } = await this.load();
    const users = await this.prisma.user.count();
    return {
      users: { used: users, max: limits.maxUsers },
      // o uso real de disco ainda não é medido
      storageGb: { max: limits.maxStorageGb, used: null as number | null },
      modules: limits.modules,
      readOnly,
      subscriptionStatus: subscription?.status ?? null,
    };
  }
}
