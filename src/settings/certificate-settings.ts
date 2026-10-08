// src/settings/certificate-settings.ts
// Definições de certificados (docs/modulo_settings.md §7) — guardadas em
// TenantConfig.certificateSettingsJson. Lógica pura: sem acesso à BD.
// A biblioteca de templates em si é o modelo CertificateTemplate (CRUD próprio
// no serviço) — aqui só ficam os valores globais que a sobrepõem.

export interface CertificateSettings {
  /** Logo da academia — substitui o logo de cada template quando definida. */
  academyLogoUrl: string | null;
  /** Assinatura electrónica — carregada uma vez, aplicada a todos os certificados. */
  signatureUrl: string | null;
  signatoryName: string | null;
  signatoryTitle: string | null;
  /** Texto padrão (rodapé/condições) acrescentado a todos os certificados emitidos. */
  defaultText: string | null;
  /** Prefixo da numeração (ex.: "CERT-"). */
  numberingPrefix: string;
  /** Próximo número de sequência a atribuir. */
  numberingNextSeq: number;
  /** Zeros à esquerda no número de sequência. */
  numberingPadding: number;
  /** Comprimento do código de verificação gerado por certificado. */
  verificationCodeLength: number;
}

export const DEFAULT_CERTIFICATE_SETTINGS: CertificateSettings = {
  academyLogoUrl: null,
  signatureUrl: null,
  signatoryName: null,
  signatoryTitle: null,
  defaultText: null,
  numberingPrefix: 'CERT-',
  numberingNextSeq: 1,
  numberingPadding: 6,
  verificationCodeLength: 10,
};

export function parseCertificateSettings(raw: string | null | undefined): CertificateSettings {
  const d = DEFAULT_CERTIFICATE_SETTINGS;
  if (!raw) return { ...d };
  try {
    const p = JSON.parse(raw) as Partial<CertificateSettings>;
    return { ...d, ...p };
  } catch {
    return { ...d };
  }
}

/** Pré-visualização do próximo número formatado — não consome a sequência. */
export function formatCertificateNumber(settings: CertificateSettings): string {
  return `${settings.numberingPrefix}${String(settings.numberingNextSeq).padStart(
    settings.numberingPadding,
    '0',
  )}`;
}
