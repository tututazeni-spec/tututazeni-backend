import { Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job } from 'bull';
import { MailService } from '../../mail/mail.service';
import { PasswordResetService } from '../../auth/password-reset.service';

export interface UserInviteEmailJob {
  userId: number;
  email: string;
  fullName: string;
  expiryDays?: number;
}

/**
 * Processa a fila `email`. O envio síncrono via SMTP (que bloqueava o request
 * e, no caso do convite, impedia a criação do utilizador quando o SMTP estava
 * em baixo) passou para aqui — o Bull faz retry conforme as opções do job.
 * `MailService.sendUserInvite` degrada graciosamente quando o SMTP não está
 * configurado (não lança), por isso um job assim conclui sem retries.
 */
@Processor('email')
export class EmailProcessor {
  private readonly logger = new Logger(EmailProcessor.name);

  constructor(
    private readonly mail: MailService,
    private readonly passwordReset: PasswordResetService,
  ) {}

  @Process('userInvite')
  async userInvite(job: Job<UserInviteEmailJob>): Promise<void> {
    const { userId, email, fullName, expiryDays } = job.data;
    // O token é criado aqui (não no pedido HTTP) para nunca ficar guardado no Redis;
    // só o userId viaja na fila. Zero-knowledge: ninguém, nem o admin, vê a senha.
    const token = await this.passwordReset.issueSetupToken(userId, expiryDays);
    await this.mail.sendUserInvite(email, fullName, token, expiryDays);
    this.logger.log({
      email,
      attempt: job.attemptsMade + 1,
      msg: 'Email de convite de utilizador enviado',
    });
  }
}
