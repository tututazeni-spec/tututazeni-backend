import { Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job } from 'bull';
import { MailService } from '../../mail/mail.service';

export interface UserInviteEmailJob {
  email: string;
  fullName: string;
  tempPassword: string;
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

  constructor(private readonly mail: MailService) {}

  @Process('userInvite')
  async userInvite(job: Job<UserInviteEmailJob>): Promise<void> {
    const { email, fullName, tempPassword } = job.data;
    await this.mail.sendUserInvite(email, fullName, tempPassword);
    this.logger.log({
      email,
      attempt: job.attemptsMade + 1,
      msg: 'Email de convite de utilizador enviado',
    });
  }
}
