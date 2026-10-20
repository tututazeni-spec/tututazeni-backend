import { Injectable, Logger, OnModuleInit, Optional } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import type Mail from 'nodemailer/lib/mailer';
import { sanitizeForLog } from '../common/logging/sanitize';
import { IntegrationSettingsService } from '../settings/integration-settings.service';
import { EmailSettingsService } from '../settings/email-settings.service';

const escapeHtml = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const errMsg = (e: unknown) =>
  e instanceof Error ? e.message : typeof e === 'string' ? e : JSON.stringify(e);

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

  /** Há um transporte SMTP utilizável (variáveis de ambiente ou definições da organização)? */
  async isConfigured(): Promise<boolean> {
    const { transporter } = await this.resolveTransport();
    return transporter !== null;
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

  /**
   * E-mail de certificado: leva só a ligação de verificação (a página pública mostra
   * os dados e permite descarregar o PDF). Nunca anexa o PDF.
   */
  async sendCertificateLink(
    to: string,
    fullName: string,
    title: string,
    verifyUrl: string,
  ): Promise<void> {
    const text = [
      `Olá ${fullName},`,
      '',
      `O seu certificado "${title}" está disponível.`,
      'Para o ver e descarregar, abra esta ligação:',
      verifyUrl,
      '',
      '-- Sistema INNOVA',
    ].join('\n');
    const html = `<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#0F1F3D">
  <div style="background:#0F1F3D;padding:20px 24px;border-bottom:4px solid #D4A017">
    <span style="color:#fff;font-size:20px;font-weight:bold">INNOVA</span>
  </div>
  <div style="padding:24px">
    <p>Olá ${escapeHtml(fullName)},</p>
    <p>O seu certificado <strong>${escapeHtml(title)}</strong> está disponível.</p>
    <p style="margin:28px 0"><a href="${escapeHtml(verifyUrl)}" style="background:#0F1F3D;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:bold;border-bottom:3px solid #D4A017">Ver e descarregar o meu certificado</a></p>
    <p style="font-size:13px;color:#555">Se o botão não funcionar, copie esta ligação para o navegador:<br>${escapeHtml(verifyUrl)}</p>
  </div>
</div>`;
    await this.send({
      to,
      subject: `O seu certificado: ${title}`,
      text,
      html,
    });
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
        err: { message: errMsg(err) },
        msg: 'Falha ao enviar email via SMTP',
      });
      throw err;
    }
  }
}
