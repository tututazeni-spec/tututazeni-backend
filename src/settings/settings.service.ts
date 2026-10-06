// src/settings/settings.service.ts
// Módulo Definições — docs/modulo_settings.md §1 (Visão Geral) e §3 (Utilizadores).
// §2 (Permissões) reutiliza o módulo roles-permissions existente.
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { writeChainedAuditLog } from '../common/helpers/audit-chain';
import { resolveDefaultTenantId } from '../common/helpers/tenant.helper';
import { UpdateOrganizationSettingsDto, UpdateUserPolicyDto } from './settings.dto';
import {
  POLICY_REQUIRED_FIELD_OPTIONS,
  UserPolicy,
  parseUserPolicy,
  validateAgainstPolicy,
} from './user-policy';

const DAY_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class SettingsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Auditoria das alterações de definições (cadeia SHA-256 partilhada). */
  private async audit(
    userId: number | undefined,
    action: string,
    entityId: number | undefined,
    metadata: Record<string, unknown>,
  ) {
    await writeChainedAuditLog(this.prisma, {
      userId,
      action,
      entity: 'Settings',
      entityId,
      severity: 'MEDIUM',
      metadata: JSON.stringify(metadata),
    }).catch(() => undefined);
  }

  // ─── §1 Visão Geral ───────────────────────────────────────────────────────

  private async tenant() {
    const id = await resolveDefaultTenantId(this.prisma);
    return this.prisma.tenantConfig.findUniqueOrThrow({ where: { id } });
  }

  /** Subconjunto não sensível para qualquer utilizador autenticado (cabeçalho, formatos). */
  async getBranding() {
    const t = await this.tenant();
    return {
      tenantName: t.tenantName,
      platformName: t.platformName ?? t.tenantName,
      logoUrl: t.logoUrl,
      faviconUrl: t.faviconUrl,
      primaryColor: t.primaryColor,
      defaultLanguage: t.defaultLanguage,
      defaultTimezone: t.defaultTimezone,
      defaultCurrency: t.defaultCurrency,
      dateFormat: t.dateFormat,
      timeFormat: t.timeFormat,
      numberFormat: t.numberFormat,
    };
  }

  async getOrganization() {
    const t = await this.tenant();
    return {
      id: t.id,
      tenantCode: t.tenantCode,
      tenantName: t.tenantName,
      platformName: t.platformName,
      logoUrl: t.logoUrl,
      faviconUrl: t.faviconUrl,
      nif: t.nif,
      address: t.address,
      phone: t.phone,
      contactEmail: t.contactEmail,
      website: t.website,
      sector: t.sector,
      country: t.country,
      defaultTimezone: t.defaultTimezone,
      defaultLanguage: t.defaultLanguage,
      defaultCurrency: t.defaultCurrency,
      dateFormat: t.dateFormat,
      timeFormat: t.timeFormat,
      numberFormat: t.numberFormat,
      updatedAt: t.updatedAt,
    };
  }

  async updateOrganization(dto: UpdateOrganizationSettingsDto, actorId?: number) {
    const t = await this.tenant();
    // "" -> undefined já foi tratado pelo DTO; só se grava o que veio no payload.
    const data = Object.fromEntries(
      Object.entries(dto).filter(([, v]) => v !== undefined),
    ) as UpdateOrganizationSettingsDto;
    if (Object.keys(data).length > 0) {
      await this.prisma.tenantConfig.update({ where: { id: t.id }, data });
    }
    // Logo/favicon são data-URLs grandes — só se regista que mudaram.
    const { logoUrl, faviconUrl, ...rest } = data;
    await this.audit(actorId, 'SETTINGS_ORGANIZATION_UPDATE', undefined, {
      ...rest,
      ...(logoUrl !== undefined && { logoChanged: true }),
      ...(faviconUrl !== undefined && { faviconChanged: true }),
    });
    return this.getOrganization();
  }

  // ─── §3 Utilizadores ──────────────────────────────────────────────────────

  async getUserPolicy(): Promise<UserPolicy & { requiredFieldOptions: readonly string[] }> {
    const t = await this.tenant();
    return {
      ...parseUserPolicy(t.userPolicyJson),
      requiredFieldOptions: POLICY_REQUIRED_FIELD_OPTIONS,
    };
  }

  async updateUserPolicy(dto: UpdateUserPolicyDto, actorId?: number) {
    const t = await this.tenant();
    const current = parseUserPolicy(t.userPolicyJson);

    if (dto.defaultRoleId) {
      const role = await this.prisma.role.findUnique({ where: { id: dto.defaultRoleId } });
      if (!role) throw new BadRequestException('Função por omissão inexistente');
    }

    const next = {
      ...current,
      ...Object.fromEntries(Object.entries(dto).filter(([, v]) => v !== undefined)),
    } as UserPolicy;
    next.allowedEmailDomains = [
      ...new Set(
        next.allowedEmailDomains.map(d => d.trim().toLowerCase().replace(/^@/, '')).filter(Boolean),
      ),
    ];

    await this.prisma.tenantConfig.update({
      where: { id: t.id },
      data: { userPolicyJson: JSON.stringify(next) },
    });
    await this.audit(actorId, 'SETTINGS_USER_POLICY_UPDATE', undefined, {
      before: current,
      after: next,
    });
    return this.getUserPolicy();
  }

  // ─── §2 Âmbito por departamento ───────────────────────────────────────────

  async getDepartmentScopes() {
    const [roles, departments, scopes] = await Promise.all([
      this.prisma.read.role.findMany({
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
      }),
      this.prisma.read.department.findMany({
        where: { active: true },
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
      }),
      this.prisma.read.roleDepartmentScope.findMany(),
    ]);
    return {
      departments,
      roles: roles.map(r => ({
        ...r,
        departmentIds: scopes.filter(s => s.roleId === r.id).map(s => s.departmentId),
      })),
    };
  }

  async setDepartmentScope(roleId: number, departmentIds: number[], actorId?: number) {
    const role = await this.prisma.role.findUnique({ where: { id: roleId } });
    if (!role) throw new NotFoundException('Função não encontrada');
    const ids = [...new Set(departmentIds)];
    if (ids.length > 0) {
      const found = await this.prisma.department.count({ where: { id: { in: ids } } });
      if (found !== ids.length) throw new BadRequestException('Departamento inexistente');
    }
    await this.prisma.$transaction([
      this.prisma.roleDepartmentScope.deleteMany({ where: { roleId } }),
      this.prisma.roleDepartmentScope.createMany({
        data: ids.map(departmentId => ({ roleId, departmentId })),
      }),
    ]);
    await this.audit(actorId, 'SETTINGS_ROLE_DEPARTMENT_SCOPE', roleId, {
      role: role.name,
      departmentIds: ids,
    });
    return { roleId, departmentIds: ids };
  }

  /** `null` = sem restrição; caso contrário os departamentos visíveis ao perfil. */
  async getScopeForRole(roleId: number | null | undefined): Promise<number[] | null> {
    if (!roleId) return null;
    const rows = await this.prisma.read.roleDepartmentScope.findMany({
      where: { roleId },
      select: { departmentId: true },
    });
    return rows.length > 0 ? rows.map(r => r.departmentId) : null;
  }

  /**
   * Aplica a política à criação/convite de utilizadores. Devolve o payload
   * (com a função por omissão aplicada) ou lança 400 com todas as violações.
   */
  async applyUserPolicy<T extends { email?: string; roleId?: number }>(
    payload: T,
    opts: { invite?: boolean } = {},
  ): Promise<T> {
    const policy = parseUserPolicy((await this.tenant()).userPolicyJson);
    if (opts.invite && !policy.invitesEnabled) {
      throw new BadRequestException('Convites de utilizadores desactivados pela organização');
    }
    const withDefaults =
      payload.roleId == null && policy.defaultRoleId
        ? { ...payload, roleId: policy.defaultRoleId }
        : payload;
    // O convite só recolhe email/nome/função/departamento — os restantes campos
    // obrigatórios completam-se depois, por isso não se exigem aqui.
    const effective: UserPolicy = opts.invite
      ? {
          ...policy,
          requiredFields: policy.requiredFields.filter(f => f === 'roleId' || f === 'departmentId'),
        }
      : policy;
    const errors = validateAgainstPolicy(effective, withDefaults as Record<string, unknown>);
    if (errors.length > 0) throw new BadRequestException(errors);
    return withDefaults;
  }

  /** Utilizadores activos sem login há mais de `inactiveAfterDays` (ou nunca). */
  async listInactiveUsers(days?: number) {
    const policy = parseUserPolicy((await this.tenant()).userPolicyJson);
    const threshold = days ?? policy.inactiveAfterDays;
    const cutoff = new Date(Date.now() - threshold * DAY_MS);

    const users = await this.prisma.read.user.findMany({
      where: { active: true, accountStatus: 'ACTIVE', createdAt: { lt: cutoff } },
      select: {
        id: true,
        fullName: true,
        email: true,
        createdAt: true,
        department: { select: { id: true, name: true } },
        role: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'asc' },
      take: 500,
    });
    if (users.length === 0) return { thresholdDays: threshold, total: 0, items: [] };

    // Último login = token de refresh mais recente (mesma fonte que users.getAccessOverview).
    const lastTokens = await this.prisma.read.refreshToken.groupBy({
      by: ['userId'],
      where: { userId: { in: users.map(u => u.id) } },
      _max: { createdAt: true },
    });
    const lastByUser = new Map(lastTokens.map(l => [l.userId, l._max.createdAt]));

    const items = users
      .map(u => ({ ...u, lastLoginAt: lastByUser.get(u.id) ?? null }))
      .filter(u => !u.lastLoginAt || u.lastLoginAt < cutoff);
    return { thresholdDays: threshold, total: items.length, items };
  }

  /** Contadores para o cabeçalho do separador Utilizadores. */
  async getUsersOverview() {
    const [total, active, pending, inactive, suspended] = await Promise.all([
      this.prisma.read.user.count(),
      this.prisma.read.user.count({ where: { accountStatus: 'ACTIVE' } }),
      this.prisma.read.user.count({ where: { accountStatus: 'PENDING' } }),
      this.prisma.read.user.count({ where: { accountStatus: 'INACTIVE' } }),
      this.prisma.read.user.count({ where: { accountStatus: { in: ['SUSPENDED', 'BLOCKED'] } } }),
    ]);
    const t = await this.tenant();
    return { total, active, pending, inactive, suspended, maxUsers: t.maxUsers };
  }
}
