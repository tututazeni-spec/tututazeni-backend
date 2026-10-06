// src/settings/notification-settings.ts
// Definições de notificações (docs/modulo_settings.md §5) — guardadas em
// TenantConfig.notificationSettingsJson. Lógica pura: sem acesso à BD.

export const NOTIFICATION_EVENT_KEYS = [
  'ENROLLMENT',
  'COURSE_REMINDER',
  'CORPORATE_EVENT',
  'PENDING_EVALUATION',
] as const;
export type NotificationEventKey = (typeof NOTIFICATION_EVENT_KEYS)[number];

export interface NotificationSettings {
  /** Canais globais. WhatsApp é só envio (não há recepção). */
  channels: { inApp: boolean; email: boolean; whatsapp: boolean };
  /** Eventos que geram notificação. Tipos fora desta lista nunca são bloqueados. */
  events: Record<NotificationEventKey, boolean>;
  /** Horário permitido para canais externos (email/WhatsApp), hora local do tenant. */
  sendWindow: { enabled: boolean; startHour: number; endHour: number; weekdaysOnly: boolean };
  /** Notificações CRITICAL ignoram o horário permitido. */
  criticalBypassWindow: boolean;
}

export const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettings = {
  channels: { inApp: true, email: true, whatsapp: false },
  events: {
    ENROLLMENT: true,
    COURSE_REMINDER: true,
    CORPORATE_EVENT: true,
    PENDING_EVALUATION: true,
  },
  sendWindow: { enabled: false, startHour: 8, endHour: 20, weekdaysOnly: false },
  criticalBypassWindow: true,
};

export function parseNotificationSettings(raw: string | null | undefined): NotificationSettings {
  const d = DEFAULT_NOTIFICATION_SETTINGS;
  if (!raw) return structuredClone(d);
  try {
    const p = JSON.parse(raw) as Partial<NotificationSettings>;
    return {
      channels: { ...d.channels, ...p.channels },
      events: { ...d.events, ...p.events },
      sendWindow: { ...d.sendWindow, ...p.sendWindow },
      criticalBypassWindow: p.criticalBypassWindow ?? d.criticalBypassWindow,
    };
  } catch {
    return structuredClone(d);
  }
}

/**
 * Classifica o `type` livre de uma notificação num dos eventos configuráveis.
 * `null` = tipo transversal (segurança, convites, recibos...) que nunca é bloqueado.
 */
export function resolveNotificationEvent(type: string): NotificationEventKey | null {
  const t = type.toUpperCase();
  if (t.includes('REMINDER'))
    return t.includes('ENROLL') || t.includes('COURSE') ? 'COURSE_REMINDER' : null;
  if (t.includes('ENROLL') || t.includes('REGISTERED') || t.includes('REGISTRATION'))
    return 'ENROLLMENT';
  if (t.includes('EVENT')) return 'CORPORATE_EVENT';
  if (t.includes('EVALUATION') || t.includes('REVIEW') || t.includes('PENDING_ASSESSMENT')) {
    return 'PENDING_EVALUATION';
  }
  return null;
}

/** O evento está desligado pela organização? */
export function isEventDisabled(settings: NotificationSettings, type: string): boolean {
  const key = resolveNotificationEvent(type);
  return key !== null && settings.events[key] === false;
}

/** Hora/dia locais no fuso do tenant (IANA); cai para UTC se o fuso for inválido. */
export function localParts(now: Date, timeZone: string): { hour: number; weekday: number } {
  const fmt = (tz: string) =>
    new Intl.DateTimeFormat('en-GB', {
      timeZone: tz,
      hour: 'numeric',
      hour12: false,
      weekday: 'short',
    }).formatToParts(now);
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = fmt(timeZone);
  } catch {
    parts = fmt('UTC');
  }
  const hour = Number(parts.find(p => p.type === 'hour')?.value ?? 0) % 24;
  const wd = parts.find(p => p.type === 'weekday')?.value ?? 'Mon';
  return { hour, weekday: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(wd) };
}

/** Pode enviar agora por canais externos? (janela horária; início > fim = atravessa a meia-noite) */
export function isWithinSendWindow(
  settings: NotificationSettings,
  now: Date,
  timeZone: string,
  critical = false,
): boolean {
  const w = settings.sendWindow;
  if (!w.enabled) return true;
  if (critical && settings.criticalBypassWindow) return true;
  const { hour, weekday } = localParts(now, timeZone);
  if (w.weekdaysOnly && (weekday === 0 || weekday === 6)) return false;
  return w.startHour <= w.endHour
    ? hour >= w.startHour && hour < w.endHour
    : hour >= w.startHour || hour < w.endHour;
}

const STEP_MS = 15 * 60_000;
const MAX_LOOKAHEAD_MS = 8 * 24 * 3_600_000;

/**
 * Próximo instante (>= now) em que o horário permitido abre, com resolução de 15 min.
 * `now` se já está aberto; `null` se a janela nunca abre (ex.: início == fim com
 * `weekdaysOnly`, ou 8 dias sem abrir) — o chamador deve então descartar o envio.
 */
export function nextSendWindowOpen(
  settings: NotificationSettings,
  now: Date,
  timeZone: string,
  critical = false,
): Date | null {
  if (isWithinSendWindow(settings, now, timeZone, critical)) return now;
  // Alinha ao próximo múltiplo de 15 min (fusos com offset em quartos de hora ficam correctos).
  const start = Math.ceil(now.getTime() / STEP_MS) * STEP_MS;
  for (let t = start; t - now.getTime() <= MAX_LOOKAHEAD_MS; t += STEP_MS) {
    if (isWithinSendWindow(settings, new Date(t), timeZone, critical)) return new Date(t);
  }
  return null;
}
