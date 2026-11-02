import { ConflictException, Injectable, NotFoundException, Optional } from '@nestjs/common';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { AuditService } from '../common/services/audit.service';
import { SessionRevocationService } from '../auth/session-revocation.service';
import { CreateInstructorInviteDto } from './instructor-invites.dto';

export const INSTRUCTOR_EXTERNO_ROLE = 'INSTRUCTOR_EXTERNO';
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
  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly audit: AuditService,
    @Optional() private readonly revocation?: SessionRevocationService,
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

    await this.mail.sendInstructorInvite(email, dto.fullName.trim(), token, accessDays);
    await this.audit.log({
      action: 'INSTRUCTOR_INVITE_CREATED',
      entity: 'User',
      entityId: userId,
      userId: actorId,
      metadata: { email, accessDays },
    });
    return { inviteId, userId, expiresAt, accessExpiresAt };
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

  async resend(inviteId: string, actorId: number): Promise<{ inviteId: string }> {
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
    await this.mail.sendInstructorInvite(old.email, old.user.fullName, token, remaining);
    await this.audit.log({
      action: 'INSTRUCTOR_INVITE_RESENT',
      entity: 'InstructorInvite',
      userId: actorId,
      metadata: { previous: inviteId, inviteId: created.id },
    });
    return { inviteId: created.id };
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
        ...(accepted ? { active: true, accountStatus: 'ACTIVE' as const } : {}),
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
