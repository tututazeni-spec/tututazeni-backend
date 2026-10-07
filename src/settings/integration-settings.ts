// src/settings/integration-settings.ts
// Definições de integrações (docs/modulo_settings.md §6) — guardadas em
// TenantConfig.integrationSettingsJson. Segredos (SMTP pass, token Twilio) vão
// cifrados (`*Enc`) e nunca são devolvidos — só `has*`. Lógica pura.

export const ISIS_MODULE_OPTIONS = [
  'LEARNING',
  'CAREER',
  'PDI',
  'PERFORMANCE',
  'ONBOARDING',
  'HR',
] as const;

export interface SmtpSettings {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  passEnc: string | null;
  from: string;
}

export interface WhatsAppSettings {
  enabled: boolean;
  /** Fornecedor activo (§13) — as credenciais Meta vivem em whatsapp-settings.ts. */
  provider: 'TWILIO' | 'META';
  /** Número remetente em E.164. */
  number: string;
  accountSid: string;
  authTokenEnc: string | null;
  /** Limite de mensagens por hora (0 = sem limite). */
  hourlyLimit: number;
  /** Limite de mensagens por dia (0 = sem limite). */
  dailyLimit: number;
}

export interface IsisSettings {
  enabled: boolean;
  /** Módulos onde a Ísis está activa (vazio = todos). */
  enabledModules: string[];
  /** Limite diário de perguntas por utilizador, aplicado sobre o de AiTutorSettings (0 = usa o do AiTutor). */
  dailyLimitPerUser: number;
}

export interface IntegrationSettings {
  smtp: SmtpSettings;
  whatsapp: WhatsAppSettings;
  isis: IsisSettings;
}

export const DEFAULT_INTEGRATION_SETTINGS: IntegrationSettings = {
  smtp: { host: '', port: 587, secure: false, user: '', passEnc: null, from: '' },
  whatsapp: {
    enabled: false,
    provider: 'TWILIO',
    number: '',
    accountSid: '',
    authTokenEnc: null,
    hourlyLimit: 0,
    dailyLimit: 0,
  },
  isis: { enabled: true, enabledModules: [], dailyLimitPerUser: 0 },
};

export function parseIntegrationSettings(raw: string | null | undefined): IntegrationSettings {
  const d = DEFAULT_INTEGRATION_SETTINGS;
  if (!raw) return structuredClone(d);
  try {
    const p = JSON.parse(raw) as Partial<IntegrationSettings>;
    return {
      smtp: { ...d.smtp, ...p.smtp },
      whatsapp: { ...d.whatsapp, ...p.whatsapp },
      isis: { ...d.isis, ...p.isis },
    };
  } catch {
    return structuredClone(d);
  }
}

/** Vista pública: sem segredos cifrados, só indicadores `has*`. */
export function publicIntegrationSettings(s: IntegrationSettings) {
  const { passEnc, ...smtp } = s.smtp;
  const { authTokenEnc, ...whatsapp } = s.whatsapp;
  return {
    smtp: { ...smtp, hasPassword: !!passEnc },
    whatsapp: { ...whatsapp, hasAuthToken: !!authTokenEnc },
    isis: s.isis,
  };
}
