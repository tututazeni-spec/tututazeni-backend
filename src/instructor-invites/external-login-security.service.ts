import { Injectable, Logger } from '@nestjs/common';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { AuditService } from '../common/services/audit.service';
import { INSTRUCTOR_EXTERNO_ROLE } from './constants';

export type LoginPurpose = 'LOGIN' | 'NEW_DEVICE';
export interface LoginUser {
  id: number;
  email: string;
  fullName: string;
}
export interface LoginCtx {
  ip?: string;
  userAgent?: string;
}

const CODE_TTL_MS = 10 * 60_000;
const RESEND_MIN_MS = 60_000;
const MAX_ATTEMPTS = 5;

const sha256 = (v: string): string => crypto.createHash('sha256').update(v).digest('hex');
const codeHash = (userId: number, code: string): string => sha256(`${userId}:${code}`);

/**
 * Segundo factor por e-mail e dispositivo confiável do instrutor externo (spec 4.3).
 * O código vale 10 min, é de uso único e queima à 5.ª tentativa errada; só existe
 * 1 dispositivo confiável activo por utilizador.
 */
@Injectable()
export class ExternalLoginSecurityService {
  private readonly logger = new Logger(ExternalLoginSecurityService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly audit: AuditService,
  ) {}

  isExternal(user: { role?: { name?: string | null } | null }): boolean {
    return user.role?.name === INSTRUCTOR_EXTERNO_ROLE;
  }

  async challenge(
    user: LoginUser,
    deviceId: string | undefined,
    ctx: LoginCtx,
  ): Promise<{ purpose: LoginPurpose }> {
    const known = deviceId
      ? await this.prisma.trustedDevice.findFirst({
          where: { userId: user.id, deviceIdHash: sha256(deviceId), revokedAt: null },
          select: { id: true },
        })
      : null;
    const purpose: LoginPurpose = known ? 'LOGIN' : 'NEW_DEVICE';

    const now = new Date();
    // Anti-spam do endereço do instrutor: pedido repetido na janela reaproveita o código vivo.
    const recent = await this.prisma.loginChallenge.findFirst({
      where: {
        userId: user.id,
        consumedAt: null,
        expiresAt: { gt: now },
        createdAt: { gt: new Date(now.getTime() - RESEND_MIN_MS) },
      },
      orderBy: { createdAt: 'desc' },
      select: { id: true, purpose: true },
    });
    if (recent) return { purpose };

    const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
    await this.prisma.loginChallenge.updateMany({
      where: { userId: user.id, consumedAt: null },
      data: { consumedAt: now },
    });
    await this.prisma.loginChallenge.create({
      data: {
        userId: user.id,
        codeHash: codeHash(user.id, code),
        purpose,
        expiresAt: new Date(now.getTime() + CODE_TTL_MS),
      },
    });
    await this.mail.sendLoginCode(user.email, user.fullName, code, purpose);
    this.logger.log({ userId: user.id, purpose, ip: ctx.ip, msg: 'Código de login enviado' });
    return { purpose };
  }

  async verify(
    user: LoginUser,
    code: string,
    deviceId: string | undefined,
    ctx: LoginCtx,
  ): Promise<boolean> {
    const now = new Date();
    const latest = await this.prisma.loginChallenge.findFirst({
      where: { userId: user.id, consumedAt: null, expiresAt: { gt: now } },
      orderBy: { createdAt: 'desc' },
    });
    if (!latest) return false;

    const a = Buffer.from(codeHash(user.id, code));
    const b = Buffer.from(latest.codeHash);
    const match = a.length === b.length && crypto.timingSafeEqual(a, b);
    if (!match) {
      const attempts = latest.attempts + 1;
      await this.prisma.loginChallenge.update({
        where: { id: latest.id },
        data: { attempts, consumedAt: attempts >= MAX_ATTEMPTS ? now : null },
      });
      return false;
    }

    // Reclamação atómica: duas verificações em paralelo com o mesmo código → só uma passa.
    const claim = await this.prisma.loginChallenge.updateMany({
      where: { id: latest.id, consumedAt: null },
      data: { consumedAt: now },
    });
    if (claim.count !== 1) return false;

    await this.registerDevice(user.id, deviceId, ctx);
    return true;
  }

  async registerDevice(
    userId: number,
    deviceId: string | undefined,
    ctx: LoginCtx,
    alert = true,
  ): Promise<void> {
    if (!deviceId) return;
    const hash = sha256(deviceId);
    const now = new Date();
    const revoked = await this.prisma.trustedDevice.updateMany({
      where: { userId, revokedAt: null, deviceIdHash: { not: hash } },
      data: { revokedAt: now },
    });
    await this.prisma.trustedDevice.upsert({
      where: { userId_deviceIdHash: { userId, deviceIdHash: hash } },
      create: {
        userId,
        deviceIdHash: hash,
        userAgent: ctx.userAgent,
        ip: ctx.ip,
      },
      update: { revokedAt: null, lastSeenAt: now, userAgent: ctx.userAgent, ip: ctx.ip },
    });
    if (revoked.count > 0 && alert) {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { email: true, fullName: true },
      });
      if (user) {
        await this.mail
          .sendNewDeviceAlert(user.email, user.fullName, ctx.userAgent)
          .catch((e: unknown) =>
            this.logger.warn({
              userId,
              err: { message: e instanceof Error ? e.message : String(e) },
              msg: 'Falha ao enviar alerta de novo dispositivo',
            }),
          );
      }
    }
    if (revoked.count > 0 || alert) {
      await this.audit.log({
        action: 'INSTRUCTOR_DEVICE_REGISTERED',
        entity: 'User',
        entityId: userId,
        userId,
        metadata: { replaced: revoked.count, ip: ctx.ip, userAgent: ctx.userAgent },
      });
    }
  }

  async resetDevices(userId: number, actorId: number): Promise<number> {
    const res = await this.prisma.trustedDevice.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    await this.audit.log({
      action: 'INSTRUCTOR_DEVICES_RESET',
      entity: 'User',
      entityId: userId,
      userId: actorId,
      metadata: { revoked: res.count },
    });
    return res.count;
  }
}
