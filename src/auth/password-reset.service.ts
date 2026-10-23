// src/auth/password-reset.service.ts
import { Injectable, BadRequestException, Optional } from '@nestjs/common';
import { SecuritySettingsService } from '../settings/security-settings.service';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { hashPassword } from '../common/security/password-hasher';

const RESET_TTL_MS = 30 * 60 * 1000; // 30 min
const GENERIC_MESSAGE = 'Se o email existir, receberás instruções de recuperação';

function sha256(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

@Injectable()
export class PasswordResetService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    @Optional() private readonly security?: SecuritySettingsService,
  ) {}

  async forgotPassword(email: string): Promise<{ message: string }> {
    const user = await this.prisma.user.findUnique({ where: { email } });
    // Resposta genérica sempre — não revela se a conta existe (anti-enumeração).
    // F2: executa um hash dummy para nivelar o tempo de resposta com o
    // ramo real . Sem isto, a diferença de latência
    // permite distinguir contas existentes de inexistentes por timing.
    if (!user || !user.active) {
      await hashPassword('dummy-timing-equalizer');
      return { message: GENERIC_MESSAGE };
    }

    const token = crypto.randomBytes(32).toString('hex');
    await this.prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash: sha256(token),
        expiresAt: new Date(Date.now() + RESET_TTL_MS),
      },
    });
    await this.mail.sendPasswordReset(email, token);
    return { message: GENERIC_MESSAGE };
  }

  /** Token de uso único para o utilizador convidado definir a sua própria senha. */
  async issueSetupToken(userId: number, expiryDays = 7): Promise<string> {
    const token = crypto.randomBytes(32).toString('hex');
    await this.prisma.passwordResetToken.create({
      data: {
        userId,
        tokenHash: sha256(token),
        expiresAt: new Date(Date.now() + expiryDays * 86_400_000),
      },
    });
    return token;
  }

  async resetPassword(token: string, newPassword: string): Promise<{ message: string }> {
    const record = await this.prisma.passwordResetToken.findUnique({
      where: { tokenHash: sha256(token) },
      include: { user: { select: { accountStatus: true } } },
    });
    if (!record || record.usedAt || record.expiresAt < new Date()) {
      throw new BadRequestException('Token inválido ou expirado');
    }

    await this.security?.assertPasswordAllowed(newPassword);
    const hashed = await hashPassword(newPassword);
    const now = new Date();
    // F1: as três escritas correm de forma atómica — um crash a meio não deixa
    // a senha alterada mas o token reutilizável (ou as sessões activas).
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: record.userId },
        // Redefinir a palavra-passe por email também levanta um bloqueio por tentativas falhadas.
        data: {
          password: hashed,
          passwordChangedAt: now,
          failedLoginAttempts: 0,
          lockedUntil: null,
          // Definir a senha pelo link de convite é a primeira troca: activa a conta.
          ...(record.user?.accountStatus === 'PENDING' && { accountStatus: 'ACTIVE' as const }),
        },
      }),
      this.prisma.passwordResetToken.update({
        where: { id: record.id },
        data: { usedAt: now },
      }),
      // Reset invalida sessões: revoga refresh tokens activos do utilizador.
      this.prisma.refreshToken.updateMany({
        where: { userId: record.userId, revokedAt: null },
        data: { revokedAt: now },
      }),
    ]);

    return { message: 'Senha redefinida com sucesso' };
  }
}
