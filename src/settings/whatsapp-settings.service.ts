// src/settings/whatsapp-settings.service.ts
// Definições de WhatsApp (docs/modulo_settings.md §13): fornecedor (Twilio ou
// Meta Cloud API), credenciais Meta, templates, eventos autorizados e estado da
// integração. Activar/desactivar, número e limites vivem em IntegrationSettings (§6).
import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { writeChainedAuditLog } from '../common/helpers/audit-chain';
import { resolveDefaultTenantId } from '../common/helpers/tenant.helper';
import { decryptSecret, encryptSecret } from '../automation/automation-connections.service';
import { IntegrationSettingsService } from './integration-settings.service';
import { UpdateWhatsAppSettingsDto } from './settings.dto';
import {
  WHATSAPP_EVENT_KEYS,
  WhatsAppEventKey,
  WhatsAppExtraSettings,
  WhatsAppProvider,
  parseWhatsAppExtra,
  publicWhatsAppExtra,
} from './whatsapp-settings';

const TTL_MS = 30_000;
const GRAPH = 'https://graph.facebook.com';

const strip = <T extends object>(o?: T) =>
  Object.fromEntries(Object.entries(o ?? {}).filter(([, v]) => v !== undefined));

@Injectable()
export class WhatsAppSettingsService {
  private readonly logger = new Logger(WhatsAppSettingsService.name);
  private cache: { at: number; settings: WhatsAppExtraSettings } | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly integrations: IntegrationSettingsService,
  ) {}

  private async load(): Promise<WhatsAppExtraSettings> {
    if (this.cache && Date.now() - this.cache.at < TTL_MS) return this.cache.settings;
    const id = await resolveDefaultTenantId(this.prisma);
    const row = await this.prisma.tenantConfig.findUnique({
      where: { id },
      select: { whatsappSettingsJson: true },
    });
    const settings = parseWhatsAppExtra(row?.whatsappSettingsJson);
    this.cache = { at: Date.now(), settings };
    return settings;
  }

  async get() {
    const [{ authTokenEnc, ...base }, extra] = await Promise.all([
      this.integrations.getWhatsAppBase(),
      this.load(),
    ]);
    return {
      ...base,
      hasAuthToken: !!authTokenEnc,
      ...publicWhatsAppExtra(extra),
      eventOptions: WHATSAPP_EVENT_KEYS,
      status: await this.status(),
    };
  }

  async update(dto: UpdateWhatsAppSettingsDto, actorId?: number) {
    const id = await resolveDefaultTenantId(this.prisma);
    const cur = await this.load();
    const { accessToken, ...metaRest } = dto.meta ?? {};

    const next: WhatsAppExtraSettings = {
      provider: dto.provider ?? cur.provider,
      meta: {
        ...cur.meta,
        ...strip(metaRest),
        accessTokenEnc:
          accessToken === undefined
            ? cur.meta.accessTokenEnc
            : accessToken
              ? encryptSecret(accessToken)
              : null,
      },
      authorizedEvents: dto.authorizedEvents ?? cur.authorizedEvents,
      templates: { ...cur.templates },
    };
    for (const k of WHATSAPP_EVENT_KEYS) {
      if (dto.templates?.[k]) {
        next.templates[k] = { ...cur.templates[k], ...strip(dto.templates[k]) };
      }
    }

    const base = await this.integrations.getWhatsAppBase();
    const willBeEnabled = dto.enabled ?? base.enabled;
    if (
      willBeEnabled &&
      next.provider === 'META' &&
      (!next.meta.phoneNumberId || !next.meta.accessTokenEnc)
    ) {
      throw new BadRequestException(
        'Para activar o WhatsApp via Meta indique o Phone Number ID e o token de acesso',
      );
    }

    // Base (§6) primeiro: valida credenciais Twilio antes de gravar a parte Meta.
    await this.integrations.update(
      {
        whatsapp: {
          enabled: dto.enabled,
          provider: next.provider,
          number: dto.number,
          hourlyLimit: dto.hourlyLimit,
          dailyLimit: dto.dailyLimit,
          accountSid: dto.accountSid,
          authToken: dto.authToken,
        },
      },
      actorId,
    );
    await this.prisma.tenantConfig.update({
      where: { id },
      data: { whatsappSettingsJson: JSON.stringify(next) },
    });
    this.cache = null;

    await writeChainedAuditLog(this.prisma, {
      userId: actorId,
      action: 'SETTINGS_WHATSAPP_UPDATE',
      entity: 'Settings',
      severity: 'HIGH',
      metadata: JSON.stringify({
        provider: next.provider,
        meta: strip(metaRest),
        metaTokenChanged: accessToken !== undefined,
        authorizedEvents: next.authorizedEvents,
        templates: dto.templates,
        enabled: dto.enabled,
        number: dto.number,
        hourlyLimit: dto.hourlyLimit,
        dailyLimit: dto.dailyLimit,
      }),
    }).catch(() => undefined);
    return this.get();
  }

  // ─── Consumido por SmsService ─────────────────────────────────────────────

  async getProvider(): Promise<WhatsAppProvider> {
    return (await this.load()).provider;
  }

  /** Sem evento = chamada genérica, sempre permitida. */
  async isEventAuthorized(event?: string): Promise<boolean> {
    if (!event) return true;
    return (await this.load()).authorizedEvents.includes(event as WhatsAppEventKey);
  }

  private async metaCreds() {
    const { meta } = await this.load();
    if (!meta.phoneNumberId || !meta.accessTokenEnc) return null;
    return {
      phoneNumberId: meta.phoneNumberId,
      businessAccountId: meta.businessAccountId,
      token: decryptSecret(meta.accessTokenEnc),
      version: meta.apiVersion || 'v21.0',
    };
  }

  private async graph<T>(
    creds: { token: string; version: string },
    path: string,
    post?: unknown,
  ): Promise<T> {
    const res = await fetch(`${GRAPH}/${creds.version}/${path}`, {
      method: post ? 'POST' : 'GET',
      headers: {
        Authorization: `Bearer ${creds.token}`,
        ...(post ? { 'Content-Type': 'application/json' } : {}),
      },
      body: post ? JSON.stringify(post) : undefined,
      signal: AbortSignal.timeout(10_000),
    });
    const json = (await res.json().catch(() => ({}))) as T & { error?: { message?: string } };
    if (!res.ok) throw new Error(json.error?.message ?? `Meta Graph API respondeu ${res.status}`);
    return json;
  }

  /** Envia via Meta Cloud API: template aprovado do evento, ou texto livre se não houver. */
  async sendMeta(to: string, body: string, event?: string): Promise<void> {
    const creds = await this.metaCreds();
    if (!creds) throw new Error('WhatsApp (Meta) sem credenciais configuradas');
    const tpl = event ? (await this.load()).templates[event as WhatsAppEventKey] : undefined;
    const recipient = to.replace(/^\+/, '');
    const payload = tpl?.name
      ? {
          messaging_product: 'whatsapp',
          to: recipient,
          type: 'template',
          template: {
            name: tpl.name,
            language: { code: tpl.language },
            components: [{ type: 'body', parameters: [{ type: 'text', text: body }] }],
          },
        }
      : { messaging_product: 'whatsapp', to: recipient, type: 'text', text: { body } };
    await this.graph(creds, `${creds.phoneNumberId}/messages`, payload);
  }

  // ─── Estado, templates e teste ────────────────────────────────────────────

  private async status() {
    if ((await this.getProvider()) !== 'META') return this.integrations.whatsAppStatus();
    const [{ usage }, base, creds] = await Promise.all([
      this.integrations.whatsAppStatus(),
      this.integrations.getWhatsAppBase(),
      this.metaCreds(),
    ]);
    if (!creds) return { enabled: base.enabled, connected: false, usage };
    try {
      const info = await this.graph<{
        display_phone_number?: string;
        verified_name?: string;
        quality_rating?: string;
      }>(creds, `${creds.phoneNumberId}?fields=display_phone_number,verified_name,quality_rating`);
      return {
        enabled: base.enabled,
        connected: true,
        displayPhoneNumber: info.display_phone_number,
        verifiedName: info.verified_name,
        qualityRating: info.quality_rating,
        usage,
      };
    } catch (err: unknown) {
      this.logger.warn({
        err: { message: err instanceof Error ? err.message : String(err) },
        msg: 'Falha ao verificar a ligação ao WhatsApp (Meta)',
      });
      return {
        enabled: base.enabled,
        connected: false,
        error: 'Credenciais rejeitadas ou serviço indisponível',
        usage,
      };
    }
  }

  async listMetaTemplates() {
    const creds = await this.metaCreds();
    if (!creds?.businessAccountId) {
      throw new BadRequestException('Indique o Business Account ID e o token de acesso Meta');
    }
    try {
      const r = await this.graph<{
        data: { name: string; language: string; status: string; category: string }[];
      }>(
        creds,
        `${creds.businessAccountId}/message_templates?fields=name,language,status,category&limit=100`,
      );
      return r.data;
    } catch (err: unknown) {
      throw new BadRequestException(
        err instanceof Error ? err.message : 'Falha ao listar templates',
      );
    }
  }

  async sendTest(to: string, adminId: number) {
    const base = await this.integrations.getWhatsAppBase();
    if (!base.enabled) throw new BadRequestException('O WhatsApp está desactivado');
    const provider = await this.getProvider();
    const text = 'INNOVA — mensagem de teste da integração WhatsApp.';
    try {
      if (provider === 'META') {
        await this.sendMeta(to, text);
      } else {
        const cfg = await this.integrations.getWhatsApp();
        if (!cfg) throw new Error('Credenciais Twilio em falta');
        const { Twilio } = await import('twilio');
        await new Twilio(cfg.accountSid, cfg.authToken).messages.create({
          to: `whatsapp:${to}`,
          from: `whatsapp:${cfg.from.replace(/^whatsapp:/, '')}`,
          body: text,
        });
      }
      await writeChainedAuditLog(this.prisma, {
        userId: adminId,
        action: 'SETTINGS_WHATSAPP_TEST',
        entity: 'Settings',
        severity: 'LOW',
        metadata: JSON.stringify({ provider }),
      }).catch(() => undefined);
      return { ok: true };
    } catch (err: unknown) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }
}
