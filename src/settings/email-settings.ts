// src/settings/email-settings.ts
// Definições de Email (docs/modulo_settings.md §12) — guardadas em
// TenantConfig.emailSettingsJson. Servidor/porta/SSL-TLS/remetente continuam
// em IntegrationSettings.smtp (§6, integration-settings.ts) — não duplicados
// aqui; este ficheiro só acrescenta o que §6 não tinha: templates por evento
// e assinatura global. Lógica pura: sem acesso à BD.

export const EMAIL_TEMPLATE_KEYS = ['PASSWORD_RESET', 'USER_INVITE'] as const;
export type EmailTemplateKey = (typeof EMAIL_TEMPLATE_KEYS)[number];

export const EMAIL_TEMPLATE_PLACEHOLDERS: Record<EmailTemplateKey, readonly string[]> = {
  PASSWORD_RESET: ['resetLink'],
  USER_INVITE: ['fullName', 'email', 'tempPassword', 'expiryDays'],
};

export interface EmailTemplate {
  subject: string;
  body: string;
}

export interface EmailSettings {
  /** Acrescentada ao fim do corpo de todos os emails transaccionais. */
  signature: string;
  templates: Record<EmailTemplateKey, EmailTemplate>;
}

export const DEFAULT_EMAIL_TEMPLATES: Record<EmailTemplateKey, EmailTemplate> = {
  PASSWORD_RESET: {
    subject: 'INNOVA — Recuperação de password',
    body: [
      'Recebemos um pedido de recuperação de password.',
      '',
      'Use este link para redefinir a sua password: {{resetLink}}',
      '',
      'Se não solicitou este pedido, ignore este email.',
    ].join('\n'),
  },
  USER_INVITE: {
    subject: 'Bem-vindo ao INNOVA — acesso à sua conta',
    body: [
      'Olá {{fullName}},',
      '',
      'A sua conta foi criada no sistema INNOVA.',
      'Email: {{email}}',
      'Password temporária: {{tempPassword}}',
      '',
      'Por favor aceda e altere a sua password no primeiro login.',
      'Este convite é válido por {{expiryDays}} dias.',
    ].join('\n'),
  },
};

export const DEFAULT_EMAIL_SETTINGS: EmailSettings = {
  signature: '-- Sistema INNOVA',
  templates: DEFAULT_EMAIL_TEMPLATES,
};

export function parseEmailSettings(raw: string | null | undefined): EmailSettings {
  const d = DEFAULT_EMAIL_SETTINGS;
  if (!raw) return structuredClone(d);
  try {
    const p = JSON.parse(raw) as Partial<EmailSettings>;
    return {
      signature: p.signature ?? d.signature,
      templates: {
        PASSWORD_RESET: { ...d.templates.PASSWORD_RESET, ...p.templates?.PASSWORD_RESET },
        USER_INVITE: { ...d.templates.USER_INVITE, ...p.templates?.USER_INVITE },
      },
    };
  } catch {
    return structuredClone(d);
  }
}

/** Substitui {{placeholder}} e acrescenta a assinatura ao corpo (nunca ao assunto). */
export function renderEmailTemplate(
  settings: EmailSettings,
  key: EmailTemplateKey,
  vars: Record<string, string | number>,
): { subject: string; text: string } {
  const tpl = settings.templates[key];
  const fill = (s: string) =>
    s.replace(/\{\{(\w+)\}\}/g, (_, name: string) => String(vars[name] ?? ''));
  const text = settings.signature ? `${fill(tpl.body)}\n\n${settings.signature}` : fill(tpl.body);
  return { subject: fill(tpl.subject), text };
}
