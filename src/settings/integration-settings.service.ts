// src/settings/integration-settings.service.ts
// Módulo Definições §6 (Integrações): SMTP, WhatsApp (só envio), Ísis (IA) e
// resumo das integrações/chaves de API/webhooks já geridas por api-integration.
import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import { Twilio } from 'twilio';
import { PrismaService } from '../prisma/prisma.service';
import { writeChainedAuditLog } from '../common/helpers/audit-chain';
import { resolveDefaultTenantId } from '../common/helpers/tenant.helper';
import { decryptSecret, encryptSecret } from '../automation/automation-connections.service';
import { UpdateIntegrationSettingsDto } from './settings.dto';
import {
  IntegrationSettings,
  ISIS_MODULE_OPTIONS,
  parseIntegrationSettings,
  publicIntegrationSettings,
} from './integration-settings';

const TTL_MS = 30_000;
const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;

export interface ResolvedSmtp {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  from: string;
}

export interface ResolvedWhatsApp {
  accountSid: string;
  authToken: string;
  from: string;
}

@Injectable()
export class IntegrationSettingsService {
  private readonly logger = new Logger(IntegrationSettingsService.name);
  private cache: { at: number; settings: IntegrationSettings } | null = null;
  // Contadores em memória (por processo) — o limite é por instância da API.
  private waSent: number[] = [];

  constructor(private readonly prisma: PrismaService) {}

  private async load(): Promise<IntegrationSettings> {
    if (this.cache && Date.now() - this.cache.at < TTL_MS) return this.cache.settings;
    const id = await resolveDefaultTenantId(this.prisma);
    const row = await this.prisma.tenantConfig.findUnique({
      where: { id },
      select: { integrationSettingsJson: true },
    });
    const settings = parseIntegrationSettings(row?.integrationSettingsJson);
    this.cache = { at: Date.now(), settings };
    return settings;
  }

  // ─── Leitura / escrita ────────────────────────────────────────────────────

  async get() {
    const s = await this.load();
    return { ...publicIntegrationSettings(s), isisModuleOptions: ISIS_MODULE_OPTIONS };
  }

  async update(dto: UpdateIntegrationSettingsDto, actorId?: number) {
    const id = await resolveDefaultTenantId(this.prisma);
    const row = await this.prisma.tenantConfig.findUniqueOrThrow({
      where: { id },
      select: { integrationSettingsJson: true },
    });
    const cur = parseIntegrationSettings(row.integrationSettingsJson);
    const strip = <T extends object>(o?: T) =>
      Object.fromEntries(Object.entries(o ?? {}).filter(([, v]) => v !== undefined));

    const { password, ...smtpRest } = dto.smtp ?? {};
    const { authToken, ...waRest } = dto.whatsapp ?? {};
    const next: IntegrationSettings = {
      smtp: {
        ...cur.smtp,
        ...strip(smtpRest),
        // "" limpa o segredo; ausente mantém o actual.
        passEnc:
          password === undefined ? cur.smtp.passEnc : password ? encryptSecret(password) : null,
      },
      whatsapp: {
        ...cur.whatsapp,
        ...strip(waRest),
        authTokenEnc:
          authToken === undefined
            ? cur.whatsapp.authTokenEnc
            : authToken
              ? encryptSecret(authToken)
              : null,
      },
      isis: { ...cur.isis, ...strip(dto.isis) },
    };
    if (
      next.whatsapp.enabled &&
      (!next.whatsapp.number || !next.whatsapp.accountSid || !next.whatsapp.authTokenEnc)
    ) {
      throw new BadRequestException(
        'Para activar o WhatsApp indique número, Account SID e token de autenticação',
      );
    }

    await this.prisma.tenantConfig.update({
      where: { id },
      data: { integrationSettingsJson: JSON.stringify(next) },
    });
    this.cache = null;
    // Auditoria nunca inclui segredos — só o que mudou e se um segredo foi alterado.
    await writeChainedAuditLog(this.prisma, {
      userId: actorId,
      action: 'SETTINGS_INTEGRATIONS_UPDATE',
      entity: 'Settings',
      severity: 'HIGH',
      metadata: JSON.stringify({
        smtp: strip(smtpRest),
        smtpPasswordChanged: password !== undefined,
        whatsapp: strip(waRest),
        whatsappTokenChanged: authToken !== undefined,
        isis: strip(dto.isis),
      }),
    }).catch(() => undefined);
    return this.get();
  }

  // ─── SMTP ─────────────────────────────────────────────────────────────────

  /** SMTP guardado nas definições; `null` = usar as variáveis de ambiente. */
  async getSmtp(): Promise<ResolvedSmtp | null> {
    const { smtp } = await this.load();
    if (!smtp.host) return null;
    return {
      host: smtp.host,
      port: smtp.port,
      secure: smtp.secure || smtp.port === 465,
      user: smtp.user,
      pass: smtp.passEnc ? decryptSecret(smtp.passEnc) : '',
      from: smtp.from || process.env.SMTP_FROM || 'INNOVA <noreply@innova.ao>',
    };
  }

  async testSmtp(to: string | undefined, adminId: number) {
    const cfg = await this.getSmtp();
    if (!cfg) throw new BadRequestException('SMTP não configurado nas definições');
    const recipient =
      to ??
      (await this.prisma.user.findUnique({ where: { id: adminId }, select: { email: true } }))
        ?.email;
    if (!recipient) throw new BadRequestException('Sem destinatário para o email de teste');
    const transporter = nodemailer.createTransport({
      host: cfg.host,
      port: cfg.port,
      secure: cfg.secure,
      auth: cfg.user ? { user: cfg.user, pass: cfg.pass } : undefined,
      connectionTimeout: 10_000,
    });
    try {
      await transporter.verify();
      await transporter.sendMail({
        from: cfg.from,
        to: recipient,
        subject: 'INNOVA — teste de configuração SMTP',
        text: 'Este email confirma que as definições de SMTP da INNOVA estão correctas.',
      });
      return { ok: true, to: recipient };
    } catch (err: unknown) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  // ─── WhatsApp (só envio) ──────────────────────────────────────────────────

  /** Credenciais guardadas; `null` = desligado/incompleto → usar variáveis de ambiente. */
  async getWhatsApp(): Promise<ResolvedWhatsApp | null> {
    const { whatsapp } = await this.load();
    if (!whatsapp.enabled || !whatsapp.authTokenEnc) return null;
    return {
      accountSid: whatsapp.accountSid,
      authToken: decryptSecret(whatsapp.authTokenEnc),
      from: whatsapp.number,
    };
  }

  async isWhatsAppEnabledInSettings(): Promise<boolean | null> {
    const { whatsapp } = await this.load();
    // `null` = nunca configurado nas definições (mantém o comportamento por env).
    return whatsapp.accountSid || whatsapp.number ? whatsapp.enabled : null;
  }

  /** Aplica os limites hora/dia; devolve false (sem consumir quota) se excedido. */
  async consumeWhatsAppQuota(): Promise<boolean> {
    const { whatsapp } = await this.load();
    const now = Date.now();
    this.waSent = this.waSent.filter(t => now - t < DAY_MS);
    if (whatsapp.dailyLimit > 0 && this.waSent.length >= whatsapp.dailyLimit) return false;
    if (
      whatsapp.hourlyLimit > 0 &&
      this.waSent.filter(t => now - t < HOUR_MS).length >= whatsapp.hourlyLimit
    ) {
      return false;
    }
    this.waSent.push(now);
    return true;
  }

  async whatsAppStatus() {
    const { whatsapp } = await this.load();
    const now = Date.now();
    const usage = {
      lastHour: this.waSent.filter(t => now - t < HOUR_MS).length,
      lastDay: this.waSent.filter(t => now - t < DAY_MS).length,
      hourlyLimit: whatsapp.hourlyLimit,
      dailyLimit: whatsapp.dailyLimit,
    };
    const cfg = await this.getWhatsApp();
    if (!cfg) return { enabled: whatsapp.enabled, connected: false, usage };
    try {
      const account = await new Twilio(cfg.accountSid, cfg.authToken).api
        .accounts(cfg.accountSid)
        .fetch();
      return {
        enabled: true,
        connected: account.status === 'active',
        providerStatus: account.status,
        usage,
      };
    } catch (err: unknown) {
      this.logger.warn({
        err: { message: err instanceof Error ? err.message : String(err) },
        msg: 'Falha ao verificar a ligação ao WhatsApp (Twilio)',
      });
      return {
        enabled: true,
        connected: false,
        error: 'Credenciais rejeitadas ou serviço indisponível',
        usage,
      };
    }
  }

  // ─── Ísis (IA) ────────────────────────────────────────────────────────────

  async getIsis() {
    return (await this.load()).isis;
  }

  /** Lança 403-equivalente (BadRequest) se a Ísis estiver desligada ou fora do módulo. */
  async assertIsisAllowed(module?: string): Promise<void> {
    const isis = await this.getIsis();
    if (!isis.enabled) throw new BadRequestException('A Ísis está desactivada pela organização');
    if (module && isis.enabledModules.length > 0 && !isis.enabledModules.includes(module)) {
      throw new BadRequestException(`A Ísis não está activa no módulo ${module}`);
    }
  }

  // ─── Resumo ───────────────────────────────────────────────────────────────

  async overview() {
    const [integrations, apiKeys, webhooks, settings] = await Promise.all([
      this.prisma.read.integrationConfig.groupBy({ by: ['status'], _count: { _all: true } }),
      this.prisma.read.apiKey.count({ where: { active: true } }),
      this.prisma.read.webhook.count({ where: { active: true } }),
      this.get(),
    ]);
    return {
      smtp: {
        configured: !!settings.smtp.host || !!process.env.SMTP_HOST,
        source: settings.smtp.host ? 'settings' : 'env',
      },
      whatsapp: { enabled: settings.whatsapp.enabled },
      isis: { enabled: settings.isis.enabled, modules: settings.isis.enabledModules },
      integrationsByStatus: Object.fromEntries(integrations.map(i => [i.status, i._count._all])),
      activeApiKeys: apiKeys,
      activeWebhooks: webhooks,
    };
  }
}
