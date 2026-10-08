import { Injectable, Logger, OnModuleInit, Optional } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import type Mail from 'nodemailer/lib/mailer';
import { sanitizeForLog } from '../common/logging/sanitize';
import { IntegrationSettingsService } from '../settings/integration-settings.service';
import { EmailSettingsService } from '../settings/email-settings.service';

@Injectable()
export class MailService implements OnModuleInit {
  private readonly logger = new Logger(MailService.name);
  private transporter: nodemailer.Transporter | null = null;
  private dbTransport: {
    at: number;
    key: string;
    transporter: nodemailer.Transporter | null;
    from?: string;
  } | null = null;

  // Definições §6: o SMTP guardado nas definições tem prioridade sobre as variáveis de ambiente.
  // Definições §12: templates e assinatura, com fallback para o texto fixo abaixo.
  constructor(
    @Optional() private readonly orgIntegrations?: IntegrationSettingsService,
    @Optional() private readonly emailSettings?: EmailSettingsService,
  ) {}

  private async resolveTransport(): Promise<{
    transporter: nodemailer.Transporter | null;
    from?: string;
  }> {
    if (this.orgIntegrations) {
      // Cache curto: evita reconstruir o transporter a cada email.
      if (this.dbTransport && Date.now() - this.dbTransport.at < 30_000) return this.dbTransport;
      const cfg = await this.orgIntegrations.getSmtp().catch(() => null);
      if (cfg) {
        const key = JSON.stringify(cfg);
        const reuse = this.dbTransport?.key === key ? this.dbTransport.transporter : null;
        this.dbTransport = {
          at: Date.now(),
          key,
          from: cfg.from,
          transporter:
            reuse ??
            nodemailer.createTransport({
              host: cfg.host,
              port: cfg.port,
              secure: cfg.secure,
              auth: cfg.user ? { user: cfg.user, pass: cfg.pass } : undefined,
            }),
        };
        return this.dbTransport;
      }
      this.dbTransport = null;
    }
    return { transporter: this.transporter };
  }

  onModuleInit(): void {
    const host = process.env.SMTP_HOST;
    if (!host) {
      this.logger.warn('SMTP_HOST não definido — emails não serão enviados');
      return;
    }
    this.transporter = nodemailer.createTransport({
      host,
      port: Number(process.env.SMTP_PORT ?? 587),
      secure: Number(process.env.SMTP_PORT) === 465,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
  }

  async sendPasswordReset(email: string, token: string): Promise<void> {
    const resetLink = `${process.env.APP_URL ?? ''}/auth/reset-password?token=${token}`;
    const rendered = await this.emailSettings
      ?.render('PASSWORD_RESET', { resetLink })
      .catch(() => null);
    await this.send({
      to: email,
      subject: rendered?.subject ?? 'INNOVA — Recuperação de password',
      text:
        rendered?.text ??
        [
          'Recebemos um pedido de recuperação de password.',
          '',
          `Use este link para redefinir a sua password: ${resetLink}`,
          '',
          'Se não solicitou este pedido, ignore este email.',
          '',
          '-- Sistema INNOVA',
        ].join('\n'),
    });
  }

  async sendUserInvite(
    email: string,
    fullName: string,
    tempPassword: string,
    expiryDays?: number,
  ): Promise<void> {
    const rendered = await this.emailSettings
      ?.render('USER_INVITE', { fullName, email, tempPassword, expiryDays: expiryDays ?? '' })
      .catch(() => null);
    await this.send({
      to: email,
      subject: rendered?.subject ?? 'Bem-vindo ao INNOVA — acesso à sua conta',
      text:
        rendered?.text ??
        [
          `Olá ${fullName},`,
          '',
          'A sua conta foi criada no sistema INNOVA.',
          `Email: ${email}`,
          `Password temporária: ${tempPassword}`,
          '',
          'Por favor aceda e altere a sua password no primeiro login.',
          ...(expiryDays ? [`Este convite é válido por ${expiryDays} dias.`] : []),
          '',
          '-- Sistema INNOVA',
        ].join('\n'),
    });
  }

  /** Envio genérico (ex: canal "email" de notificações/automação) — as duas
   *  acima ficam com o template próprio por já terem consumidores fixos. */
  async sendNotification(to: string, subject: string, text: string): Promise<void> {
    await this.send({ to, subject, text });
  }

  private async send(options: Mail.Options): Promise<void> {
    const { transporter, from } = await this.resolveTransport();
    if (!transporter) {
      this.logger.warn({
        to: sanitizeForLog(options.to),
        subject: sanitizeForLog(options.subject),
        msg: 'Email não enviado — SMTP não configurado',
      });
      return;
    }
    try {
      await transporter.sendMail({
        from: from ?? process.env.SMTP_FROM ?? 'INNOVA <noreply@innova.ao>',
        ...options,
      });
    } catch (err: unknown) {
      this.logger.error({
        to: sanitizeForLog(options.to),
        subject: sanitizeForLog(options.subject),
        err: { message: err instanceof Error ? err.message : String(err) },
        msg: 'Falha ao enviar email via SMTP',
      });
      throw err;
    }
  }
}
