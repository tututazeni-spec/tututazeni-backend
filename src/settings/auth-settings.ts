// src/settings/auth-settings.ts
// Definições de Autenticação / SSO (docs/modulo_settings.md §11) — guardadas
// nas colunas já existentes TenantConfig.ssoEnabled/ssoProvider/ssoConfigJson
// (schema.prisma, comentário "JSON com configuração SSO"). O LDAP/AD não é um
// `SsoProvider` (enum não tem esse valor) — vive dentro do mesmo JSON como
// método de login independente, activado pela sua própria flag `enabled`.
// Lógica pura: sem acesso à BD.

export const OIDC_PROVIDERS = ['GOOGLE', 'MICROSOFT', 'OIDC'] as const;
export type OidcProviderKey = (typeof OIDC_PROVIDERS)[number];

/** Emissores OIDC conhecidos (Google e Microsoft expõem descoberta OIDC padrão). */
export function oidcIssuerFor(provider: OidcProviderKey, tenantId: string): string | null {
  if (provider === 'GOOGLE') return 'https://accounts.google.com';
  if (provider === 'MICROSOFT') return `https://login.microsoftonline.com/${tenantId || 'common'}/v2.0`;
  return null; // OIDC genérico — o emissor vem sempre do admin
}

export interface OidcSettings {
  clientId: string;
  clientSecretEnc: string | null;
  /** Só MICROSOFT: tenant do Azure AD ('common' = qualquer conta). */
  tenantId: string;
  /** Só OIDC genérico: emissor do fornecedor (ex.: https://idp.empresa.ao). */
  issuer: string;
}

export interface LdapSettings {
  enabled: boolean;
  /** ldap:// ou ldaps://host:porto */
  url: string;
  bindDn: string;
  bindPasswordEnc: string | null;
  baseDn: string;
  /** Filtro de busca; {{email}} é substituído pelo email introduzido no login. */
  userFilter: string;
  emailAttribute: string;
  nameAttribute: string;
  startTls: boolean;
}

export interface AuthSettings {
  ssoEnabled: boolean;
  ssoProvider: OidcProviderKey | null;
  oidc: OidcSettings;
  ldap: LdapSettings;
  /** Autenticação por password bloqueada para quem não seja ADMIN (break-glass). */
  enforceSsoOnly: boolean;
}

export const DEFAULT_AUTH_SETTINGS: AuthSettings = {
  ssoEnabled: false,
  ssoProvider: null,
  oidc: { clientId: '', clientSecretEnc: null, tenantId: 'common', issuer: '' },
  ldap: {
    enabled: false,
    url: '',
    bindDn: '',
    bindPasswordEnc: null,
    baseDn: '',
    userFilter: '(mail={{email}})',
    emailAttribute: 'mail',
    nameAttribute: 'cn',
    startTls: false,
  },
  enforceSsoOnly: false,
};

export function parseAuthSettings(raw: string | null | undefined): AuthSettings {
  const d = DEFAULT_AUTH_SETTINGS;
  if (!raw) return structuredClone(d);
  try {
    const p = JSON.parse(raw) as Partial<AuthSettings>;
    return {
      ssoEnabled: p.ssoEnabled ?? d.ssoEnabled,
      ssoProvider: p.ssoProvider ?? d.ssoProvider,
      oidc: { ...d.oidc, ...p.oidc },
      ldap: { ...d.ldap, ...p.ldap },
      enforceSsoOnly: p.enforceSsoOnly ?? d.enforceSsoOnly,
    };
  } catch {
    return structuredClone(d);
  }
}

/** Vista pública (admin): sem segredos cifrados, só indicadores `has*`. */
export function publicAuthSettings(s: AuthSettings) {
  const { clientSecretEnc, ...oidc } = s.oidc;
  const { bindPasswordEnc, ...ldap } = s.ldap;
  return {
    ssoEnabled: s.ssoEnabled,
    ssoProvider: s.ssoProvider,
    oidc: { ...oidc, hasClientSecret: !!clientSecretEnc },
    ldap: { ...ldap, hasBindPassword: !!bindPasswordEnc },
    enforceSsoOnly: s.enforceSsoOnly,
  };
}

/** Vista pública NÃO autenticada (página de login): zero segredos, zero config interna. */
export function publicLoginOptions(s: AuthSettings) {
  return {
    ssoEnabled: s.ssoEnabled && !!s.ssoProvider && !!s.oidc.clientId,
    ssoProvider: s.ssoProvider,
    ldapEnabled: s.ldap.enabled,
    passwordLoginDisabled: s.enforceSsoOnly,
  };
}

export function resolveOidcIssuer(settings: AuthSettings): string | null {
  if (!settings.ssoProvider) return null;
  if (settings.ssoProvider === 'OIDC') return settings.oidc.issuer || null;
  return oidcIssuerFor(settings.ssoProvider, settings.oidc.tenantId);
}

/** Substitui {{email}} no filtro LDAP — escapa caracteres especiais de filtro LDAP (RFC 4515). */
export function renderLdapFilter(template: string, email: string): string {
  const escaped = email.replace(/[\\*()\0]/g, c => `\\${c.charCodeAt(0).toString(16).padStart(2, '0')}`);
  return template.replace(/\{\{email\}\}/g, escaped);
}
