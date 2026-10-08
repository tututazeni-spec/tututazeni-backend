// src/settings/license-settings.service.ts
// Módulo Definições §9 (Licença e Módulos): plano/utilizadores/validade são
// geridos no módulo scalability (PATCH /scalability/tenants/:id) — aqui só se
// lê esse estado para o separador de Definições. O que é novo são os módulos
// activos/inactivos (feature flags), guardados em TenantConfig.moduleFlagsJson.
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { writeChainedAuditLog } from '../common/helpers/audit-chain';
import { resolveDefaultTenantId } from '../common/helpers/tenant.helper';
import { UpdateModuleFlagsDto } from './settings.dto';
import { MODULE_FLAG_KEYS, ModuleFlags, parseModuleFlags } from './module-flags';

@Injectable()
export class LicenseSettingsService {
  constructor(private readonly prisma: PrismaService) {}

  private async tenant() {
    const id = await resolveDefaultTenantId(this.prisma);
    return this.prisma.tenantConfig.findUniqueOrThrow({ where: { id } });
  }

  async get() {
    const t = await this.tenant();
    const currentUsers = await this.prisma.read.user.count();
    const trialStatus: 'NONE' | 'ACTIVE' | 'EXPIRED' = !t.trialEndsAt
      ? 'NONE'
      : t.trialEndsAt.getTime() > Date.now()
        ? 'ACTIVE'
        : 'EXPIRED';
    return {
      plan: t.plan,
      isActive: t.isActive,
      maxUsers: t.maxUsers,
      currentUsers,
      trialEndsAt: t.trialEndsAt,
      trialStatus,
      contractStartDate: t.contractStartDate,
      contractEndDate: t.contractEndDate,
      modules: parseModuleFlags(t.moduleFlagsJson),
      moduleOptions: MODULE_FLAG_KEYS,
    };
  }

  async updateModules(dto: UpdateModuleFlagsDto, actorId?: number) {
    const t = await this.tenant();
    const current = parseModuleFlags(t.moduleFlagsJson);
    const next: ModuleFlags = { ...current };
    for (const key of MODULE_FLAG_KEYS) {
      if (typeof dto.modules[key] === 'boolean') next[key] = dto.modules[key] as boolean;
    }
    await this.prisma.tenantConfig.update({
      where: { id: t.id },
      data: { moduleFlagsJson: JSON.stringify(next) },
    });
    await writeChainedAuditLog(this.prisma, {
      userId: actorId,
      action: 'SETTINGS_LICENSE_MODULES_UPDATE',
      entity: 'Settings',
      severity: 'HIGH',
      metadata: JSON.stringify({ before: current, after: next }),
    }).catch(() => undefined);
    return this.get();
  }

  /** Para outros módulos consultarem se estão activos — ver nota de âmbito no DTO. */
  async isModuleEnabled(subject: keyof ModuleFlags): Promise<boolean> {
    const t = await this.tenant();
    return parseModuleFlags(t.moduleFlagsJson)[subject] ?? true;
  }
}
