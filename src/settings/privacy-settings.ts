// src/settings/privacy-settings.ts
// Definições de privacidade / LPDP (docs/modulo_settings.md §8) — guardadas em
// TenantConfig.privacySettingsJson. Lógica pura: sem acesso à BD.
// Os pedidos de direitos dos titulares em si vivem no modelo DataSubjectRequest
// (CRUD próprio no serviço) — aqui só ficam os textos de consentimento e as
// políticas gerais.

export interface ConsentTextVersion {
  version: number;
  text: string;
  publishedAt: string; // ISO
}

export interface PrivacySettings {
  dpoName: string;
  dpoEmail: string;
  dpoPhone: string;
  /** Prazo de retenção geral de dados pessoais, em dias. */
  retentionDays: number;
  anonymizationEnabled: boolean;
  exportEnabled: boolean;
  /** Eliminar automaticamente os dados do titular ao aprovar um pedido de eliminação. */
  autoDeleteOnRequest: boolean;
  /** Histórico de versões do texto de consentimento — a última é a vigente. */
  consentVersions: ConsentTextVersion[];
}

export const DEFAULT_PRIVACY_SETTINGS: PrivacySettings = {
  dpoName: '',
  dpoEmail: '',
  dpoPhone: '',
  retentionDays: 1825,
  anonymizationEnabled: true,
  exportEnabled: true,
  autoDeleteOnRequest: false,
  consentVersions: [],
};

export function parsePrivacySettings(raw: string | null | undefined): PrivacySettings {
  const d = DEFAULT_PRIVACY_SETTINGS;
  if (!raw) return { ...d, consentVersions: [] };
  try {
    const p = JSON.parse(raw) as Partial<PrivacySettings>;
    return { ...d, ...p, consentVersions: p.consentVersions ?? [] };
  } catch {
    return { ...d, consentVersions: [] };
  }
}

export function currentConsentVersion(s: PrivacySettings): ConsentTextVersion | null {
  return s.consentVersions.length > 0 ? s.consentVersions[s.consentVersions.length - 1] : null;
}

/** Acrescenta uma nova versão do texto de consentimento (nunca substitui o histórico). */
export function publishConsentVersion(s: PrivacySettings, text: string): PrivacySettings {
  const nextVersion = (currentConsentVersion(s)?.version ?? 0) + 1;
  return {
    ...s,
    consentVersions: [
      ...s.consentVersions,
      { version: nextVersion, text, publishedAt: new Date().toISOString() },
    ],
  };
}
