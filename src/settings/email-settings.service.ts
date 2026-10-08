// src/settings/email-settings.service.ts
// Definições de Email (docs/modulo_settings.md §12): templates por evento e
// assinatura global. SMTP/servidor/porta/SSL-TLS/remetente continuam geridos
// em IntegrationSettingsService (§6) — ver email-settings.ts para o porquê.
import { BadRequestException, Injectable } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import { PrismaService } from '../prisma/prisma.service';
import { writeChainedAuditLog } from '../common/helpers/audit-chain';
import { resolveDefaultTenantId } from '../common/helpers/tenant.helper';
import { IntegrationSettingsService } from './integration-settings.service';
import { UpdateEmailSettingsDto } from './settings.dto';
import {
  EMAIL_TEMPLATE_KEYS,
  EMAIL_TEMPLATE_PLACEHOLDERS,
  EmailSettings,
  EmailTemplateKey,
  parseEmailSettings,
  renderEmailTemplate,
} from './email-settings';

@Injectable()
export class EmailSettingsService {
  private cache: { at: number; settings: EmailSettings } | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly integrations: IntegrationSettingsService,
  ) {}

  private async load(): Promise<EmailSettings> {
    if (this.cache && Date.now() - this.cache.at < 30_000) return this.cache.settings;
    const id = await resolveDefaultTenantId(this.prisma);
    const row = await this.prisma.tenantConfig.findUnique({
      where: { id },
      select: { emailSettingsJson: true },
    });
    const settings = parseEmailSettings(row?.emailSettingsJson);
    this.cache = { at: Date.now(), settings };
    return settings;
  }

  async get() {
    const [smtp, email] = await Promise.all([this.integrations.get(), this.load()]);
    return {
      smtp: smtp.smtp,
      signature: email.signature,
      templates: email.templates,
      templateKeys: EMAIL_TEMPLATE_KEYS,
      placeholders: EMAIL_TEMPLATE_PLACEHOLDERS,
    };
  }

  async update(dto: UpdateEmailSettingsDto, actorId?: number) {
    const id = await resolveDefaultTenantId(this.prisma);
    const cur = await this.load();
    const next: EmailSettings = {
      signature: dto.signature ?? cur.signature,
      templates: {
        PASSWORD_RESET: { ...cur.templates.PASSWORD_RESET, ...dto.templates?.PASSWORD_RESET },
        USER_INVITE: { ...cur.templates.USER_INVITE, ...dto.templates?.USER_INVITE },
      },
    };

    await this.prisma.tenantConfig.update({
      where: { id },
      data: { emailSettingsJson: JSON.stringify(next) },
    });
    this.cache = null;
    await writeChainedAuditLog(this.prisma, {
      userId: actorId,
      action: 'SETTINGS_EMAIL_UPDATE',
      entity: 'Settings',
      severity: 'MEDIUM',
      metadata: JSON.stringify({ before: cur, after: next }),
    }).catch(() => undefined);

    if (dto.smtp) await this.integrations.update({ smtp: dto.smtp }, actorId);
    return this.get();
  }

  /** Consumido por MailService — nunca chamado directamente por um controller. */
  async render(key: EmailTemplateKey, vars: Record<string, string | number>) {
    return renderEmailTemplate(await this.load(), key, vars);
  }

  async testTemplate(key: EmailTemplateKey, to: string | undefined, adminId: number) {
    const sampleVars: Record<EmailTemplateKey, Record<string, string | number>> = {
      PASSWORD_RESET: {
        resetLink: `${process.env.APP_URL ?? ''}/auth/reset-password?token=EXEMPLO`,
      },
      USER_INVITE: {
        fullName: 'Utilizador de Teste',
        email: to ?? 'teste@innova.ao',
        tempPassword: 'Exemplo@123',
        expiryDays: 7,
      },
    };
    const { subject, text } = await this.render(key, sampleVars[key]);
    const recipient =
      to ??
      (await this.prisma.read.user.findUnique({ where: { id: adminId }, select: { email: true } }))
        ?.email;
    if (!recipient) return { ok: false, error: 'Sem destinatário para o email de teste' };

    const cfg = await this.integrations.getSmtp();
    if (!cfg) throw new BadRequestException('SMTP não configurado nas definições');
    const transporter = nodemailer.createTransport({
      host: cfg.host,
      port: cfg.port,
      secure: cfg.secure,
      auth: cfg.user ? { user: cfg.user, pass: cfg.pass } : undefined,
      connectionTimeout: 10_000,
    });
    try {
      await transporter.sendMail({ from: cfg.from, to: recipient, subject, text });
      return { ok: true, to: recipient, subject, preview: text };
    } catch (err: unknown) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }
}
