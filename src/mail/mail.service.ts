import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import type Mail from 'nodemailer/lib/mailer';
import { sanitizeForLog } from '../common/logging/sanitize';

@Injectable()
export class MailService implements OnModuleInit {
  private readonly logger = new Logger(MailService.name);
  private transporter: nodemailer.Transporter | null = null;

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
    await this.send({
      to: email,
      subject: 'INNOVA — Recuperação de password',
      text: [
        'Recebemos um pedido de recuperação de password.',
        '',
        `Use este link para redefinir a sua password: ${process.env.APP_URL ?? ''}/auth/reset-password?token=${token}`,
        '',
        'Se não solicitou este pedido, ignore este email.',
        '',
        '-- Sistema INNOVA',
      ].join('\n'),
    });
  }

  async sendUserInvite(email: string, fullName: string, tempPassword: string): Promise<void> {
    await this.send({
      to: email,
      subject: 'Bem-vindo ao INNOVA — acesso à sua conta',
      text: [
        `Olá ${fullName},`,
        '',
        'A sua conta foi criada no sistema INNOVA.',
        `Email: ${email}`,
        `Password temporária: ${tempPassword}`,
        '',
        'Por favor aceda e altere a sua password no primeiro login.',
        '',
        '-- Sistema INNOVA',
      ].join('\n'),
    });
  }

  private async send(options: Mail.Options): Promise<void> {
    if (!this.transporter) {
      this.logger.warn({
        to: sanitizeForLog(options.to),
        subject: sanitizeForLog(options.subject),
        msg: 'Email não enviado — SMTP não configurado',
      });
      return;
    }
    try {
      await this.transporter.sendMail({
        from: process.env.SMTP_FROM ?? 'INNOVA <noreply@innova.ao>',
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
