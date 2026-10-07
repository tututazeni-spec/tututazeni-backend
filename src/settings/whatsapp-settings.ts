// src/settings/whatsapp-settings.ts
// Definições de WhatsApp (docs/modulo_settings.md §13) — guardadas em
// TenantConfig.whatsappSettingsJson. Ligar/desligar, número remetente e limites
// hora/dia continuam em IntegrationSettings.whatsapp (§6); aqui ficam o fornecedor
// (Twilio ou Meta Cloud API), as credenciais Meta, os templates e os eventos
// autorizados. Segredos cifrados (`*Enc`), nunca devolvidos. Lógica pura.

export const WHATSAPP_PROVIDERS = ['TWILIO', 'META'] as const;
export type WhatsAppProvider = (typeof WHATSAPP_PROVIDERS)[number];

/** Eventos que podem despoletar mensagens WhatsApp (ver chamadas a SmsService.sendWhatsApp). */
export const WHATSAPP_EVENT_KEYS = ['NOTIFICATION', 'AUTOMATION', 'CORPORATE_EVENT'] as const;
export type WhatsAppEventKey = (typeof WHATSAPP_EVENT_KEYS)[number];

export interface WhatsAppTemplateMapping {
  /** Nome do template aprovado na Meta; vazio = enviar texto livre. */
  name: string;
  language: string;
}

export interface MetaCloudSettings {
  phoneNumberId: string;
  businessAccountId: string;
  accessTokenEnc: string | null;
  apiVersion: string;
}

export interface WhatsAppExtraSettings {
  provider: WhatsAppProvider;
  meta: MetaCloudSettings;
  /** Eventos autorizados a enviar WhatsApp. */
  authorizedEvents: WhatsAppEventKey[];
  templates: Record<WhatsAppEventKey, WhatsAppTemplateMapping>;
}

export const DEFAULT_WHATSAPP_EXTRA: WhatsAppExtraSettings = {
  provider: 'TWILIO',
  meta: { phoneNumberId: '', businessAccountId: '', accessTokenEnc: null, apiVersion: 'v21.0' },
  authorizedEvents: [...WHATSAPP_EVENT_KEYS],
  templates: {
    NOTIFICATION: { name: '', language: 'pt_PT' },
    AUTOMATION: { name: '', language: 'pt_PT' },
    CORPORATE_EVENT: { name: '', language: 'pt_PT' },
  },
};

export function parseWhatsAppExtra(raw: string | null | undefined): WhatsAppExtraSettings {
  const d = DEFAULT_WHATSAPP_EXTRA;
  if (!raw) return structuredClone(d);
  try {
    const p = JSON.parse(raw) as Partial<WhatsAppExtraSettings>;
    return {
      provider: WHATSAPP_PROVIDERS.includes(p.provider as WhatsAppProvider)
        ? (p.provider as WhatsAppProvider)
        : d.provider,
      meta: { ...d.meta, ...p.meta },
      authorizedEvents: Array.isArray(p.authorizedEvents)
        ? p.authorizedEvents.filter((e): e is WhatsAppEventKey =>
            (WHATSAPP_EVENT_KEYS as readonly string[]).includes(e),
          )
        : [...d.authorizedEvents],
      templates: Object.fromEntries(
        WHATSAPP_EVENT_KEYS.map(k => [k, { ...d.templates[k], ...p.templates?.[k] }]),
      ) as Record<WhatsAppEventKey, WhatsAppTemplateMapping>,
    };
  } catch {
    return structuredClone(d);
  }
}

export function publicWhatsAppExtra(s: WhatsAppExtraSettings) {
  const { accessTokenEnc, ...meta } = s.meta;
  return { ...s, meta: { ...meta, hasAccessToken: !!accessTokenEnc } };
}
