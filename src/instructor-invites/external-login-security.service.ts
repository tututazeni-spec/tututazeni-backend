import { Injectable, Logger, Optional, UnauthorizedException } from '@nestjs/common';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { AuditService } from '../common/services/audit.service';
import { SessionRevocationService } from '../auth/session-revocation.service';
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
const UA_DB_MAX = 300;
const UA_MAIL_MAX = 120;

const sha256 = (v: string): string => crypto.createHash('sha256').update(v).digest('hex');
const codeHash = (userId: number, code: string): string => sha256(`${userId}:${code}`);

/** Sem caracteres de controlo (injeção de linhas) e com tamanho limitado. */
function cleanUa(ua: string | undefined, max: number): string | undefined {
  if (!ua) return undefined;
  return (
    ua
      // eslint-disable-next-line no-control-regex
      .replace(/[\u0000-\u001f\u007f]+/g, ' ')
      .trim()
      .slice(0, max)
  );
}

/** Para o corpo do e-mail: além do limite, sem URLs (evita links de phishing no alerta). */
function uaForMail(ua: string | undefined): string | undefined {
  const cleaned = cleanUa(ua, UA_DB_MAX);
  return cleaned?.replace(/https?:\/\/\S*/gi, '[link removido]').slice(0, UA_MAIL_MAX);
}

/**
 * Segundo factor por e-mail e dispositivo confiável do instrutor externo (spec 4.3).
 * O código vale 10 min, é de uso único e queima à 5.ª tentativa; só existe 1 dispositivo
 * confiável activo por utilizador. Os passos que leem-e-escrevem estado por utilizador
 * correm sob `pg_advisory_xact_lock(userId)` para não haver corridas (dois pedidos
 * simultâneos, dois registos de dispositivo).
 */
@Injectable()
export class ExternalLoginSecurityService {
  private readonly logger = new Logger(ExternalLoginSecurityService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly audit: AuditService,
    @Optional() private readonly revocation?: SessionRevocationService,
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

    const requestingDevice = deviceId ? sha256(deviceId) : null;
    const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
    const created = await this.prisma.$transaction(async tx => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${user.id}::bigint)`;
      const now = new Date();
      // Anti-spam do endereço do instrutor: pedido repetido na janela reaproveita o código
      // vivo — mas só se for do mesmo propósito (senão o aviso de dispositivo novo perdia-se).
      const recent = await tx.loginChallenge.findFirst({
        where: {
          userId: user.id,
          consumedAt: null,
          expiresAt: { gt: now },
          createdAt: { gt: new Date(now.getTime() - RESEND_MIN_MS) },
        },
        orderBy: { createdAt: 'desc' },
        select: { id: true, purpose: true, deviceIdHash: true },
      });
      // Só se reaproveita um código do mesmo propósito E pedido pelo mesmo dispositivo.
      if (recent && recent.purpose === purpose && recent.deviceIdHash === requestingDevice) {
        return null;
      }

      await tx.loginChallenge.updateMany({
        where: { userId: user.id, consumedAt: null },
        data: { consumedAt: now },
      });
      return tx.loginChallenge.create({
        data: {
          userId: user.id,
          codeHash: codeHash(user.id, code),
          purpose,
          deviceIdHash: requestingDevice,
          expiresAt: new Date(now.getTime() + CODE_TTL_MS),
        },
      });
    });
    if (!created) return { purpose };

    try {
      await this.mail.sendLoginCode(user.email, user.fullName, code, purpose);
    } catch (e) {
      // Sem e-mail não há código: apagar o desafio evita um "código fantasma" que
      // o reenvio em <60 s reaproveitaria sem nunca ter chegado ao instrutor.
      await this.prisma.loginChallenge
        .delete({ where: { id: created.id } })
        .catch((): void => undefined);
      throw e;
    }
    this.logger.log({ userId: user.id, purpose, ip: ctx.ip, msg: 'Código de login enviado' });
    return { purpose };
  }

  async verify(
    user: LoginUser,
    code: string,
    deviceId: string | undefined,
    _ctx: LoginCtx,
  ): Promise<boolean> {
    const now = new Date();
    const latest = await this.prisma.loginChallenge.findFirst({
      where: { userId: user.id, consumedAt: null, expiresAt: { gt: now } },
      orderBy: { createdAt: 'desc' },
    });
    if (!latest) return false;

    // O código só serve no dispositivo que o pediu: um cliente sem cookies (cada pedido com um
    // id novo) ou um atacante com a senha noutro dispositivo não o conseguem resgatar. Não gasta
    // tentativa nem consome o desafio, e a mensagem diz o que fazer.
    if (latest.deviceIdHash && (!deviceId || sha256(deviceId) !== latest.deviceIdHash)) {
      throw new UnauthorizedException(
        'O código foi pedido por outro dispositivo. Repita o início de sessão no mesmo navegador, com os cookies ativos',
      );
    }

    // Cada tentativa é contada de forma atómica ANTES de comparar: palpites em paralelo
    // não conseguem passar das 5 (o contador não perde actualizações).
    const bumped = await this.prisma.loginChallenge.update({
      where: { id: latest.id },
      data: { attempts: { increment: 1 } },
      select: { attempts: true },
    });
    if (bumped.attempts > MAX_ATTEMPTS) return false;

    const a = Buffer.from(codeHash(user.id, code));
    const b = Buffer.from(latest.codeHash);
    const match = a.length === b.length && crypto.timingSafeEqual(a, b);
    if (!match) {
      if (bumped.attempts >= MAX_ATTEMPTS) {
        await this.prisma.loginChallenge.update({
          where: { id: latest.id },
          data: { consumedAt: now },
        });
      }
      return false;
    }

    // Reclamação atómica: duas verificações em paralelo com o mesmo código → só uma passa.
    const claim = await this.prisma.loginChallenge.updateMany({
      where: { id: latest.id, consumedAt: null },
      data: { consumedAt: now },
    });
    if (claim.count !== 1) return false;
    // Qualquer outro código ainda vivo deixa de servir.
    await this.prisma.loginChallenge.updateMany({
      where: { userId: user.id, consumedAt: null },
      data: { consumedAt: now },
    });
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
    const userAgent = cleanUa(ctx.userAgent, UA_DB_MAX);
    const ip = ctx.ip?.slice(0, 64);

    const replaced = await this.prisma.$transaction(async tx => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${userId}::bigint)`;
      const revoked = await tx.trustedDevice.updateMany({
        where: { userId, revokedAt: null, deviceIdHash: { not: hash } },
        data: { revokedAt: now },
      });
      await tx.trustedDevice.upsert({
        where: { userId_deviceIdHash: { userId, deviceIdHash: hash } },
        create: { userId, deviceIdHash: hash, userAgent, ip },
        update: { revokedAt: null, lastSeenAt: now, userAgent, ip },
      });
      if (revoked.count > 0) {
        // O dispositivo anterior deixa de poder renovar a sessão.
        await tx.refreshToken.updateMany({
          where: { userId, revokedAt: null },
          data: { revokedAt: now },
        });
      }
      return revoked.count;
    });

    if (replaced > 0 && alert) {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { email: true, fullName: true },
      });
      if (user) {
        await this.mail
          .sendNewDeviceAlert(user.email, user.fullName, uaForMail(ctx.userAgent))
          .catch((e: unknown) =>
            this.logger.warn({
              userId,
              err: { message: e instanceof Error ? e.message : String(e) },
              msg: 'Falha ao enviar alerta de novo dispositivo',
            }),
          );
      }
    }
    if (replaced > 0 || alert) {
      await this.audit.log({
        action: 'INSTRUCTOR_DEVICE_REGISTERED',
        entity: 'User',
        entityId: userId,
        userId,
        metadata: { replaced, ip, userAgent },
      });
    }
  }

  async resetDevices(userId: number, actorId: number): Promise<number> {
    const res = await this.prisma.trustedDevice.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    // Repor também termina as sessões abertas (o dispositivo antigo deixa de renovar).
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    await this.revocation?.revokeAllUserSessions(userId);
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
