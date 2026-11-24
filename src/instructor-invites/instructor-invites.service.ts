import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { AuditService } from '../common/services/audit.service';
import { SessionRevocationService } from '../auth/session-revocation.service';
import { SecuritySettingsService } from '../settings/security-settings.service';
import { hashPassword } from '../common/security/password-hasher';
import { CreateInstructorInviteDto } from './instructor-invites.dto';
import { INSTRUCTOR_EXTERNO_ROLE } from './constants';
import { ExternalLoginSecurityService, type LoginCtx } from './external-login-security.service';

export { INSTRUCTOR_EXTERNO_ROLE };
export const INVITE_TTL_MS = 72 * 3_600_000;
const DAY_MS = 86_400_000;
const DEFAULT_ACCESS_DAYS = 30;

export type InviteStatus = 'PENDING' | 'ACCEPTED' | 'REVOKED' | 'EXPIRED';

export interface InviteListItem {
  id: string;
  userId: number;
  email: string;
  fullName: string;
  status: InviteStatus;
  expiresAt: Date;
  accessExpiresAt: Date | null;
  createdAt: Date;
}

export const sha256 = (v: string): string => crypto.createHash('sha256').update(v).digest('hex');

@Injectable()
export class InstructorInvitesService {
  private readonly logger = new Logger(InstructorInvitesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly audit: AuditService,
    @Optional() private readonly revocation?: SessionRevocationService,
    private readonly security?: SecuritySettingsService,
    private readonly externalLogin?: ExternalLoginSecurityService,
  ) {}

  private newToken(): { token: string; tokenHash: string; expiresAt: Date } {
    const token = crypto.randomBytes(32).toString('hex');
    return { token, tokenHash: sha256(token), expiresAt: new Date(Date.now() + INVITE_TTL_MS) };
  }

  async create(dto: CreateInstructorInviteDto, actorId: number) {
    const email = dto.email.trim().toLowerCase();
    const accessDays = dto.accessDays ?? DEFAULT_ACCESS_DAYS;
    // Mensagem neutra: não revela dados do utilizador existente.
    if (await this.prisma.user.findUnique({ where: { email } })) {
      throw new ConflictException('Já existe uma conta com este e-mail');
    }
    const role = await this.prisma.role.findUnique({
      where: { name: INSTRUCTOR_EXTERNO_ROLE },
      select: { id: true },
    });
    if (!role) throw new NotFoundException('Perfil INSTRUCTOR_EXTERNO não está configurado');

    const { token, tokenHash, expiresAt } = this.newToken();
    const accessExpiresAt = new Date(Date.now() + accessDays * DAY_MS);
    const { userId, inviteId } = await this.prisma.$transaction(async tx => {
      const user = await tx.user.create({
        data: {
          email,
          fullName: dto.fullName.trim(),
          roleId: role.id,
          password: null,
          accountStatus: 'PENDING',
          active: true,
          accessExpiresAt,
        },
        select: { id: true },
      });
      const invite = await tx.instructorInvite.create({
        data: { userId: user.id, email, tokenHash, expiresAt, createdById: actorId },
        select: { id: true },
      });
      return { userId: user.id, inviteId: invite.id };
    });

    // Auditar antes de enviar: a conta e o convite já estão gravados, o e-mail pode falhar.
    await this.audit.log({
      action: 'INSTRUCTOR_INVITE_CREATED',
      entity: 'User',
      entityId: userId,
      userId: actorId,
      metadata: { email, accessDays },
    });
    // Falha de SMTP não pode deixar o admin sem resposta nem esconder o convite criado:
    // devolve emailSent=false e o admin usa "Reenviar".
    let emailSent = true;
    try {
      await this.mail.sendInstructorInvite(email, dto.fullName.trim(), token, accessDays);
    } catch (e) {
      emailSent = false;
      this.logger.warn({
        userId,
        err: { message: e instanceof Error ? e.message : String(e) },
        msg: 'Falha ao enviar e-mail de convite de instrutor',
      });
    }
    return { inviteId, userId, expiresAt, accessExpiresAt, emailSent };
  }

  /**
   * Aceita o convite: define a palavra-passe e inutiliza o link. Qualquer falha de
   * token (inexistente, usado, revogado, expirado) devolve a mesma mensagem.
   */
  async acceptInvite(
    token: string,
    password: string,
    deviceId?: string,
    ctx: LoginCtx = {},
  ): Promise<{ message: string }> {
    const invalid = () => new BadRequestException('Convite inválido ou expirado');
    const now = new Date();
    const invite = await this.prisma.instructorInvite.findUnique({
      where: { tokenHash: sha256(token) },
      include: { user: { select: { accessExpiresAt: true } } },
    });
    if (
      !invite ||
      invite.usedAt ||
      invite.revokedAt ||
      invite.expiresAt < now ||
      (invite.user.accessExpiresAt && invite.user.accessExpiresAt < now)
    ) {
      throw invalid();
    }

    await this.security?.assertPasswordAllowed(password);
    const hashed = await hashPassword(password);

    await this.prisma.$transaction(async tx => {
      // Reclamação atómica: só uma de várias aceitações simultâneas vence.
      const claim = await tx.instructorInvite.updateMany({
        where: { id: invite.id, usedAt: null, revokedAt: null, expiresAt: { gt: now } },
        data: { usedAt: now },
      });
      if (claim.count !== 1) throw invalid();
      await tx.user.update({
        where: { id: invite.userId },
        data: { password: hashed, passwordChangedAt: now, accountStatus: 'ACTIVE', active: true },
      });
      await tx.refreshToken.updateMany({
        where: { userId: invite.userId, revokedAt: null },
        data: { revokedAt: now },
      });
    });

    await this.revocation?.revokeAllUserSessions(invite.userId);
    // O link provou a posse do e-mail: este dispositivo já nasce confiável (sem alerta).
    // A senha já está definida e o link gasto: uma falha aqui não pode devolver erro ao
    // instrutor. Sem registo, o primeiro login pede o código de dispositivo novo.
    try {
      await this.externalLogin?.registerDevice(invite.userId, deviceId, ctx, false);
    } catch (e) {
      this.logger.warn({
        userId: invite.userId,
        err: { message: e instanceof Error ? e.message : String(e) },
        msg: 'Falha ao registar o dispositivo no convite',
      });
    }
    await this.audit.log({
      action: 'INSTRUCTOR_INVITE_ACCEPTED',
      entity: 'User',
      entityId: invite.userId,
      userId: invite.userId,
      metadata: { inviteId: invite.id },
    });
    return { message: 'Palavra-passe definida. Já pode iniciar sessão.' };
  }

  async list(): Promise<InviteListItem[]> {
    const rows = await this.prisma.instructorInvite.findMany({
      orderBy: { createdAt: 'desc' },
      take: 500,
      include: { user: { select: { fullName: true, accessExpiresAt: true } } },
    });
    const now = Date.now();
    return rows.map(r => ({
      id: r.id,
      userId: r.userId,
      email: r.email,
      fullName: r.user.fullName,
      status: r.usedAt
        ? 'ACCEPTED'
        : r.revokedAt
          ? 'REVOKED'
          : r.expiresAt.getTime() < now
            ? 'EXPIRED'
            : 'PENDING',
      expiresAt: r.expiresAt,
      accessExpiresAt: r.user.accessExpiresAt,
      createdAt: r.createdAt,
    }));
  }

  async revoke(inviteId: string, actorId: number): Promise<void> {
    const res = await this.prisma.instructorInvite.updateMany({
      where: { id: inviteId, usedAt: null, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (res.count !== 1) throw new NotFoundException('Convite não encontrado ou já utilizado');
    await this.audit.log({
      action: 'INSTRUCTOR_INVITE_REVOKED',
      entity: 'InstructorInvite',
      userId: actorId,
      metadata: { inviteId },
    });
  }

  async resend(
    inviteId: string,
    actorId: number,
  ): Promise<{ inviteId: string; emailSent: boolean }> {
    const old = await this.prisma.instructorInvite.findUnique({
      where: { id: inviteId },
      include: { user: { select: { fullName: true, accessExpiresAt: true } } },
    });
    if (!old || old.usedAt) throw new NotFoundException('Convite não encontrado ou já utilizado');
    const { token, tokenHash, expiresAt } = this.newToken();
    const created = await this.prisma.$transaction(async tx => {
      await tx.instructorInvite.updateMany({
        where: { userId: old.userId, usedAt: null, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      return tx.instructorInvite.create({
        data: { userId: old.userId, email: old.email, tokenHash, expiresAt, createdById: actorId },
        select: { id: true },
      });
    });
    const remaining = old.user.accessExpiresAt
      ? Math.max(1, Math.ceil((old.user.accessExpiresAt.getTime() - Date.now()) / DAY_MS))
      : DEFAULT_ACCESS_DAYS;
    // Como em create(): o novo convite já está gravado; uma falha de SMTP não pode
    // rebentar com 500 — devolve emailSent=false para o admin tentar de novo.
    let emailSent = true;
    try {
      await this.mail.sendInstructorInvite(old.email, old.user.fullName, token, remaining);
    } catch (e) {
      emailSent = false;
      this.logger.warn({
        userId: old.userId,
        err: { message: e instanceof Error ? e.message : String(e) },
        msg: 'Falha ao reenviar e-mail de convite de instrutor',
      });
    }
    await this.audit.log({
      action: 'INSTRUCTOR_INVITE_RESENT',
      entity: 'InstructorInvite',
      userId: actorId,
      metadata: { previous: inviteId, inviteId: created.id, emailSent },
    });
    return { inviteId: created.id, emailSent };
  }

  private async findExternal(userId: number) {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, role: { name: INSTRUCTOR_EXTERNO_ROLE } },
      select: { id: true, accountStatus: true, passwordChangedAt: true },
    });
    if (!user) throw new NotFoundException('Instrutor externo não encontrado');
    return user;
  }

  async extendAccess(userId: number, accessDays: number, actorId: number) {
    const user = await this.findExternal(userId);
    const accessExpiresAt = new Date(Date.now() + accessDays * DAY_MS);
    // Só reativa quem já aceitou o convite; antes disso continua PENDING.
    const accepted = !!user.passwordChangedAt;
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        accessExpiresAt,
        // Reativa sempre (o cron desativa também contas por aceitar); só quem já
        // aceitou o convite fica ACTIVE, os restantes voltam a PENDING.
        active: true,
        accountStatus: accepted ? ('ACTIVE' as const) : ('PENDING' as const),
      },
    });
    await this.audit.log({
      action: 'INSTRUCTOR_ACCESS_EXTENDED',
      entity: 'User',
      entityId: userId,
      userId: actorId,
      metadata: { accessDays, accessExpiresAt },
    });
    return { accessExpiresAt };
  }

  async resetDevices(userId: number, actorId: number): Promise<{ revoked: number }> {
    await this.findExternal(userId);
    const revoked = (await this.externalLogin?.resetDevices(userId, actorId)) ?? 0;
    return { revoked };
  }

  async deactivate(userId: number, actorId: number): Promise<void> {
    await this.findExternal(userId);
    await this.deactivateUser(userId, actorId, 'MANUAL');
  }

  /** Desativa e revoga sessões. Idempotente: só actua (e audita) se a conta ainda está activa. */
  async deactivateUser(
    userId: number,
    actorId: number | null,
    reason: 'MANUAL' | 'EXPIRED',
  ): Promise<boolean> {
    const res = await this.prisma.user.updateMany({
      where: { id: userId, active: true },
      data: { active: false, accountStatus: 'INACTIVE' },
    });
    if (res.count !== 1) return false;
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    await this.revocation?.revokeAllUserSessions(userId);
    await this.audit.log({
      action: reason === 'EXPIRED' ? 'INSTRUCTOR_ACCESS_EXPIRED' : 'INSTRUCTOR_DEACTIVATED',
      entity: 'User',
      entityId: userId,
      userId: actorId ?? userId,
      metadata: { reason },
    });
    return true;
  }
}
