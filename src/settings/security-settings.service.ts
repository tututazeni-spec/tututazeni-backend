// src/settings/security-settings.service.ts
// Módulo Definições §4 (Segurança): política configurável, bloqueio de conta,
// 2FA (TOTP), sessões activas e histórico de logins.
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { writeChainedAuditLog } from '../common/helpers/audit-chain';
import { resolveDefaultTenantId } from '../common/helpers/tenant.helper';
import { buildPaginatedResponse, calculatePagination } from '../common/helpers/pagination.helper';
import { decryptSecret, encryptSecret } from '../automation/automation-connections.service';
import { UpdateSecurityPolicyDto } from './settings.dto';
import {
  SecurityPolicy,
  TWO_FACTOR_MODES,
  parseSecurityPolicy,
  validatePasswordAgainstPolicy,
} from './security-policy';
import { generateTotpSecret, otpauthUrl, verifyTotp } from './totp';

const POLICY_TTL_MS = 30_000;

@Injectable()
export class SecuritySettingsService {
  private cache: { at: number; policy: SecurityPolicy } | null = null;

  constructor(private readonly prisma: PrismaService) {}

  // ─── Política ─────────────────────────────────────────────────────────────

  /** Política efectiva, com cache curto (é lida em cada login/refresh). */
  async getPolicy(): Promise<SecurityPolicy> {
    if (this.cache && Date.now() - this.cache.at < POLICY_TTL_MS) return this.cache.policy;
    const id = await resolveDefaultTenantId(this.prisma);
    const row = await this.prisma.tenantConfig.findUnique({
      where: { id },
      select: { securityPolicyJson: true },
    });
    const policy = parseSecurityPolicy(row?.securityPolicyJson);
    // Sem valor guardado, SESSION_IDLE_TIMEOUT_MS (env) continua a mandar.
    const envIdle = Number(process.env.SESSION_IDLE_TIMEOUT_MS);
    if (!row?.securityPolicyJson?.includes('sessionIdleMinutes') && envIdle > 0) {
      policy.sessionIdleMinutes = Math.max(1, Math.round(envIdle / 60_000));
    }
    this.cache = { at: Date.now(), policy };
    return policy;
  }

  async getPolicyView() {
    return { ...(await this.getPolicy()), twoFactorModes: TWO_FACTOR_MODES };
  }

  async updatePolicy(dto: UpdateSecurityPolicyDto, actorId?: number) {
    const id = await resolveDefaultTenantId(this.prisma);
    const row = await this.prisma.tenantConfig.findUniqueOrThrow({
      where: { id },
      select: { securityPolicyJson: true },
    });
    const current = parseSecurityPolicy(row.securityPolicyJson);
    // Guarda só campos explícitos (mantém a distinção "nunca definido" p/ o fallback de env).
    const stored = row.securityPolicyJson ? (JSON.parse(row.securityPolicyJson) as object) : {};
    const patch = Object.fromEntries(Object.entries(dto).filter(([, v]) => v !== undefined));
    await this.prisma.tenantConfig.update({
      where: { id },
      data: { securityPolicyJson: JSON.stringify({ ...stored, ...patch }) },
    });
    this.cache = null;
    await writeChainedAuditLog(this.prisma, {
      userId: actorId,
      action: 'SETTINGS_SECURITY_POLICY_UPDATE',
      entity: 'Settings',
      severity: 'HIGH',
      metadata: JSON.stringify({ before: current, changes: patch }),
    }).catch(() => undefined);
    return this.getPolicyView();
  }

  /** Lança 400 com todas as violações da política (o piso dos DTOs continua a aplicar-se). */
  async assertPasswordAllowed(password: string): Promise<void> {
    const errors = validatePasswordAgainstPolicy(await this.getPolicy(), password);
    if (errors.length > 0) throw new BadRequestException(errors);
  }

  // ─── Bloqueio de conta ────────────────────────────────────────────────────

  /** Regista uma tentativa falhada; devolve `lockedUntil` se esta tentativa bloqueou a conta. */
  async registerFailedAttempt(userId: number): Promise<Date | null> {
    const policy = await this.getPolicy();
    if (policy.maxFailedAttempts <= 0) return null;
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: { failedLoginAttempts: { increment: 1 } },
      select: { failedLoginAttempts: true },
    });
    if (user.failedLoginAttempts < policy.maxFailedAttempts) return null;
    const lockedUntil = new Date(Date.now() + policy.lockoutMinutes * 60_000);
    await this.prisma.user.update({
      where: { id: userId },
      data: { failedLoginAttempts: 0, lockedUntil },
    });
    await writeChainedAuditLog(this.prisma, {
      userId,
      action: 'ACCOUNT_LOCKED',
      entity: 'Auth',
      entityId: userId,
      severity: 'HIGH',
      status: 'DENIED',
      metadata: JSON.stringify({ lockedUntil, attempts: policy.maxFailedAttempts }),
    }).catch(() => undefined);
    return lockedUntil;
  }

  async clearFailedAttempts(userId: number, current: number): Promise<void> {
    if (current > 0) {
      await this.prisma.user.update({ where: { id: userId }, data: { failedLoginAttempts: 0 } });
    }
  }

  async unlockUser(userId: number, actorId?: number) {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
    if (!user) throw new NotFoundException('Utilizador não encontrado');
    await this.prisma.user.update({
      where: { id: userId },
      data: { lockedUntil: null, failedLoginAttempts: 0 },
    });
    await writeChainedAuditLog(this.prisma, {
      userId: actorId,
      action: 'ACCOUNT_UNLOCKED',
      entity: 'User',
      entityId: userId,
      severity: 'MEDIUM',
    }).catch(() => undefined);
    return { userId, unlocked: true };
  }

  async listLockedUsers() {
    const items = await this.prisma.read.user.findMany({
      where: { lockedUntil: { gt: new Date() } },
      select: { id: true, fullName: true, email: true, lockedUntil: true },
      orderBy: { lockedUntil: 'desc' },
      take: 200,
    });
    return { total: items.length, items };
  }

  // ─── 2FA (TOTP) ───────────────────────────────────────────────────────────

  /** Gera um segredo pendente (ainda inactivo) e o URL para o QR code. */
  async setupTwoFactor(userId: number) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, twoFactorEnabled: true },
    });
    if (!user) throw new NotFoundException('Utilizador não encontrado');
    if (user.twoFactorEnabled) throw new BadRequestException('O 2FA já está activo');
    const secret = generateTotpSecret();
    await this.prisma.user.update({
      where: { id: userId },
      data: { twoFactorSecret: encryptSecret(secret) },
    });
    const t = await this.prisma.tenantConfig.findFirst({
      select: { platformName: true, tenantName: true },
    });
    const issuer = t?.platformName ?? t?.tenantName ?? 'INNOVA';
    return { secret, otpauthUrl: otpauthUrl(secret, user.email, issuer) };
  }

  async enableTwoFactor(userId: number, code: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { twoFactorEnabled: true, twoFactorSecret: true },
    });
    if (!user?.twoFactorSecret) {
      throw new BadRequestException('Inicie primeiro a configuração do 2FA');
    }
    if (user.twoFactorEnabled) throw new BadRequestException('O 2FA já está activo');
    if (!verifyTotp(decryptSecret(user.twoFactorSecret), code)) {
      throw new BadRequestException('Código inválido');
    }
    await this.prisma.user.update({ where: { id: userId }, data: { twoFactorEnabled: true } });
    await writeChainedAuditLog(this.prisma, {
      userId,
      action: 'TWO_FACTOR_ENABLED',
      entity: 'User',
      entityId: userId,
      severity: 'MEDIUM',
    }).catch(() => undefined);
    return { enabled: true };
  }

  async disableTwoFactor(userId: number, code: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { twoFactorEnabled: true, twoFactorSecret: true },
    });
    if (!user?.twoFactorEnabled || !user.twoFactorSecret) {
      throw new BadRequestException('O 2FA não está activo');
    }
    if (!verifyTotp(decryptSecret(user.twoFactorSecret), code)) {
      throw new BadRequestException('Código inválido');
    }
    const policy = await this.getPolicy();
    if (policy.twoFactorMode === 'REQUIRED_ALL') {
      throw new BadRequestException('A organização exige 2FA a todos os utilizadores');
    }
    await this.prisma.user.update({
      where: { id: userId },
      data: { twoFactorEnabled: false, twoFactorSecret: null },
    });
    await writeChainedAuditLog(this.prisma, {
      userId,
      action: 'TWO_FACTOR_DISABLED',
      entity: 'User',
      entityId: userId,
      severity: 'HIGH',
    }).catch(() => undefined);
    return { enabled: false };
  }

  /** Reposição pelo admin (telemóvel perdido): desactiva o 2FA e termina as sessões. */
  async resetTwoFactor(userId: number, actorId?: number) {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
    if (!user) throw new NotFoundException('Utilizador não encontrado');
    await this.prisma.user.update({
      where: { id: userId },
      data: { twoFactorEnabled: false, twoFactorSecret: null },
    });
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    await writeChainedAuditLog(this.prisma, {
      userId: actorId,
      action: 'TWO_FACTOR_RESET',
      entity: 'User',
      entityId: userId,
      severity: 'HIGH',
    }).catch(() => undefined);
    return { userId, reset: true };
  }

  async getTwoFactorStatus(userId: number) {
    const [user, policy] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: userId }, select: { twoFactorEnabled: true } }),
      this.getPolicy(),
    ]);
    return { enabled: !!user?.twoFactorEnabled, mode: policy.twoFactorMode };
  }

  // ─── Sessões activas ──────────────────────────────────────────────────────

  /** Cada rotação cria um token novo, por isso há uma linha activa por sessão. */
  async listSessions(userId?: number) {
    const policy = await this.getPolicy();
    const rows = await this.prisma.read.refreshToken.findMany({
      where: {
        ...(userId !== undefined && { userId }),
        revokedAt: null,
        expiresAt: { gt: new Date() },
        createdAt: { gt: new Date(Date.now() - policy.sessionIdleMinutes * 60_000) },
      },
      select: {
        id: true,
        userId: true,
        ip: true,
        userAgent: true,
        createdAt: true,
        expiresAt: true,
        user: { select: { fullName: true, email: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 500,
    });
    return { total: rows.length, items: rows };
  }

  async revokeSession(sessionId: number, actorId: number, ownerOnly = false) {
    const row = await this.prisma.refreshToken.findUnique({ where: { id: sessionId } });
    if (!row || (ownerOnly && row.userId !== actorId)) {
      throw new NotFoundException('Sessão não encontrada');
    }
    await this.prisma.refreshToken.updateMany({
      where: { id: sessionId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    await writeChainedAuditLog(this.prisma, {
      userId: actorId,
      action: 'SESSION_REVOKED',
      entity: 'User',
      entityId: row.userId,
      severity: 'MEDIUM',
      metadata: JSON.stringify({ sessionId }),
    }).catch(() => undefined);
    return { sessionId, revoked: true };
  }

  async revokeAllUserSessions(userId: number, actorId: number) {
    const { count } = await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    await writeChainedAuditLog(this.prisma, {
      userId: actorId,
      action: 'SESSIONS_REVOKED_ALL',
      entity: 'User',
      entityId: userId,
      severity: 'HIGH',
      metadata: JSON.stringify({ count }),
    }).catch(() => undefined);
    return { userId, revoked: count };
  }

  // ─── Histórico de logins ──────────────────────────────────────────────────

  async loginHistory(filters: {
    userId?: number;
    outcome?: 'SUCCESS' | 'FAILED';
    page?: number;
    limit?: number;
  }) {
    const page = filters.page && filters.page > 0 ? filters.page : 1;
    const limit = Math.min(filters.limit && filters.limit > 0 ? filters.limit : 20, 100);
    const success = { entity: 'User', action: 'LOGIN' };
    const failed = { entity: 'Auth', action: { in: ['FAILED', 'ACCOUNT_LOCKED'] } };
    const where = {
      ...(filters.userId !== undefined && { userId: filters.userId }),
      OR:
        filters.outcome === 'SUCCESS'
          ? [success]
          : filters.outcome === 'FAILED'
            ? [failed]
            : [success, failed, { entity: 'Auth', action: 'LOGOUT' }],
    };
    const [rows, total] = await Promise.all([
      this.prisma.read.auditLog.findMany({
        where,
        select: {
          id: true,
          userId: true,
          action: true,
          status: true,
          ip: true,
          userAgent: true,
          metadata: true,
          createdAt: true,
          user: { select: { fullName: true, email: true } },
        },
        orderBy: { createdAt: 'desc' },
        ...calculatePagination(page, limit),
      }),
      this.prisma.read.auditLog.count({ where }),
    ]);
    // `metadata` traz só o motivo/email tentado — nunca palavras-passe
    // (ver AuthService.recordAccessEvent). Devolve-se apenas o motivo.
    const data = rows.map(({ metadata, ...r }) => {
      let reason: string | undefined;
      try {
        reason = metadata ? (JSON.parse(metadata) as { reason?: string }).reason : undefined;
      } catch {
        reason = undefined;
      }
      return { ...r, reason };
    });
    return buildPaginatedResponse(data, total, page, limit);
  }
}
