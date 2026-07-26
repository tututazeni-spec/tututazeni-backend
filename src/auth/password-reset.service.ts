// src/auth/password-reset.service.ts
import { Injectable, BadRequestException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { BCRYPT_COST_FACTOR } from '../common/config/security.config';

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
  ) {}

  async forgotPassword(email: string): Promise<{ message: string }> {
    const user = await this.prisma.user.findUnique({ where: { email } });
    // Resposta genérica sempre — não revela se a conta existe (anti-enumeração).
    // F2: executa um bcrypt.hash dummy para nivelar o tempo de resposta com o
    // ramo real (que também chama bcrypt). Sem isto, a diferença de latência
    // permite distinguir contas existentes de inexistentes por timing.
    if (!user || !user.active) {
      await bcrypt.hash('dummy-timing-equalizer', BCRYPT_COST_FACTOR);
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

  async resetPassword(token: string, newPassword: string): Promise<{ message: string }> {
    const record = await this.prisma.passwordResetToken.findUnique({
      where: { tokenHash: sha256(token) },
    });
    if (!record || record.usedAt || record.expiresAt < new Date()) {
      throw new BadRequestException('Token inválido ou expirado');
    }

    const hashed = await bcrypt.hash(newPassword, BCRYPT_COST_FACTOR);
    const now = new Date();
    // F1: as três escritas correm de forma atómica — um crash a meio não deixa
    // a senha alterada mas o token reutilizável (ou as sessões activas).
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: record.userId },
        data: { password: hashed, passwordChangedAt: now },
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
