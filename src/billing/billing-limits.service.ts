import { ForbiddenException, HttpException, Injectable, Logger, Optional } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { resolveDefaultTenantId } from '../common/helpers/tenant.helper';
import { ScalabilityStorageService } from '../scalability/scalability-storage.service';
import { parseModuleFlags } from '../settings/module-flags';

export interface PlanLimits {
  maxUsers: number;
  maxStorageGb: number;
  modules: string[] | null; // null = todos
}

const TTL_MS = 30_000;
const STORAGE_TTL_MS = 5 * 60_000; // medir o storage percorre ~20 tabelas: não em cada pedido

/**
 * Limites efectivos do plano. Sem subscrição valem os limites de TenantConfig (comportamento
 * anterior à faturação), por isso instalações sem subscrição não ficam bloqueadas.
 */
@Injectable()
export class BillingLimitsService {
  private readonly log = new Logger(BillingLimitsService.name);
  private cache: { at: number; value: Awaited<ReturnType<BillingLimitsService['load']>> } | null =
    null;
  private storageCache: { at: number; usedGb: number | null } | null = null;

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly storage?: ScalabilityStorageService,
  ) {}

  invalidate() {
    this.cache = null;
    this.storageCache = null;
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
    // Módulos desligados pelo administrador em Definições → Licença e Módulos.
    const flags = parseModuleFlags(tenant.moduleFlagsJson) as Record<string, boolean>;
    return { tenantId, subscription: sub, limits, readOnly, flags };
  }

  async current() {
    if (this.cache && Date.now() - this.cache.at < TTL_MS) return this.cache.value;
    const value = await this.load();
    this.cache = { at: Date.now(), value };
    return value;
  }

  /** Storage usado em GB (null se não for possível medir). */
  async usedStorageGb(): Promise<number | null> {
    if (this.storageCache && Date.now() - this.storageCache.at < STORAGE_TTL_MS) {
      return this.storageCache.usedGb;
    }
    let usedGb: number | null = null;
    try {
      usedGb = (await this.storage?.getStorageMetrics())?.usedGb ?? null;
    } catch (e) {
      this.log.warn(`Não foi possível medir o storage: ${(e as Error).message}`);
    }
    this.storageCache = { at: Date.now(), usedGb };
    return usedGb;
  }

  async storageExceeded(): Promise<boolean> {
    const [{ limits }, used] = await Promise.all([this.current(), this.usedStorageGb()]);
    return used !== null && used >= limits.maxStorageGb;
  }

  /** Falha aberta se a BD de faturação não estiver disponível (ex.: migration por aplicar). */
  async assertCanAddUser(adding = 1) {
    try {
      const { limits, subscription } = await this.load();
      const users = await this.prisma.user.count();
      if (users + adding > limits.maxUsers) {
        throw new ForbiddenException(
          `Limite do plano${subscription ? ` ${subscription.plan.name}` : ''} atingido: ${users}/${limits.maxUsers} utilizadores. Mude de plano para adicionar mais.`,
        );
      }
    } catch (e) {
      if (e instanceof HttpException) throw e;
      this.log.error(`Limite de utilizadores não verificado: ${(e as Error).message}`);
    }
  }

  /** Motivo de bloqueio de um módulo (plano ou desligado nas Definições), ou null se disponível. */
  async moduleBlockReason(subject: string): Promise<string | null> {
    const { limits, flags } = await this.current();
    if (limits.modules && !limits.modules.includes(subject)) {
      return `O módulo ${subject} não está incluído no seu plano.`;
    }
    if (flags[subject] === false) return `O módulo ${subject} está desactivado nas Definições.`;
    return null;
  }

  async assertModuleIncluded(subject: string) {
    const reason = await this.moduleBlockReason(subject);
    if (reason) throw new ForbiddenException(reason);
  }

  async usage() {
    const { limits, subscription, readOnly } = await this.load();
    const [users, usedGb] = await Promise.all([this.prisma.user.count(), this.usedStorageGb()]);
    return {
      users: { used: users, max: limits.maxUsers },
      storageGb: { used: usedGb, max: limits.maxStorageGb },
      modules: limits.modules,
      readOnly,
      subscriptionStatus: subscription?.status ?? null,
    };
  }
}
