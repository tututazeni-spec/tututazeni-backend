import {
  DEFAULT_AUTH_SETTINGS,
  OIDC_PROVIDERS,
  oidcIssuerFor,
  parseAuthSettings,
  publicAuthSettings,
  publicLoginOptions,
  resolveOidcIssuer,
} from './auth-settings';

describe('auth-settings (helpers puros)', () => {
  describe('oidcIssuerFor / resolveOidcIssuer', () => {
    it('Google tem emissor fixo', () => {
      expect(oidcIssuerFor('GOOGLE', '')).toBe('https://accounts.google.com');
    });

    it('Microsoft usa o tenant, ou "common" quando vazio', () => {
      expect(oidcIssuerFor('MICROSOFT', 'contoso')).toBe(
        'https://login.microsoftonline.com/contoso/v2.0',
      );
      expect(oidcIssuerFor('MICROSOFT', '')).toBe('https://login.microsoftonline.com/common/v2.0');
    });

    it('OIDC genérico não tem emissor por omissão', () => {
      expect(oidcIssuerFor('OIDC', 'x')).toBeNull();
    });

    it('resolveOidcIssuer: sem fornecedor → null; OIDC usa o emissor do admin (ou null se vazio)', () => {
      const base = parseAuthSettings(null);
      expect(resolveOidcIssuer(base)).toBeNull();
      expect(resolveOidcIssuer({ ...base, ssoProvider: 'OIDC' })).toBeNull();
      expect(
        resolveOidcIssuer({
          ...base,
          ssoProvider: 'OIDC',
          oidc: { ...base.oidc, issuer: 'https://idp.test' },
        }),
      ).toBe('https://idp.test');
    });

    it('a lista de fornecedores é a esperada', () => {
      expect([...OIDC_PROVIDERS]).toEqual(['GOOGLE', 'MICROSOFT', 'OIDC']);
    });
  });

  describe('parseAuthSettings', () => {
    it.each([null, undefined, ''])('defaults para %p', raw => {
      expect(parseAuthSettings(raw)).toEqual(DEFAULT_AUTH_SETTINGS);
    });

    it('JSON inválido cai nos defaults', () => {
      expect(parseAuthSettings('{nope')).toEqual(DEFAULT_AUTH_SETTINGS);
    });

    it('devolve cópia profunda: alterar o resultado não contamina os defaults', () => {
      const a = parseAuthSettings(null);
      a.ldap.userFilter = 'ALTERADO';
      a.oidc.clientId = 'x';
      expect(DEFAULT_AUTH_SETTINGS.ldap.userFilter).toBe('(mail={{email}})');
      expect(DEFAULT_AUTH_SETTINGS.oidc.clientId).toBe('');
    });

    it('faz merge parcial de oidc e ldap com os defaults', () => {
      const s = parseAuthSettings(
        JSON.stringify({ ldap: { enabled: true, url: 'ldaps://x' }, oidc: { clientId: 'c' } }),
      );
      expect(s.ldap).toMatchObject({ enabled: true, url: 'ldaps://x', emailAttribute: 'mail' });
      expect(s.oidc).toMatchObject({ clientId: 'c', tenantId: 'common' });
    });

    it('o filtro LDAP por omissão usa o placeholder {{email}}', () => {
      expect(DEFAULT_AUTH_SETTINGS.ldap.userFilter).toContain('{{email}}');
    });
  });

  describe('publicAuthSettings', () => {
    it('remove segredos cifrados e expõe apenas has*', () => {
      const s = parseAuthSettings(
        JSON.stringify({
          oidc: { clientId: 'c', clientSecretEnc: 'cifrado-1' },
          ldap: { bindPasswordEnc: 'cifrado-2' },
        }),
      );
      const pub = publicAuthSettings(s);
      expect(JSON.stringify(pub)).not.toMatch(/cifrado/);
      expect(pub.oidc.hasClientSecret).toBe(true);
      expect(pub.ldap.hasBindPassword).toBe(true);
    });

    it('has* é false quando não há segredo', () => {
      const pub = publicAuthSettings(parseAuthSettings(null));
      expect(pub.oidc.hasClientSecret).toBe(false);
      expect(pub.ldap.hasBindPassword).toBe(false);
    });
  });

  describe('publicLoginOptions (sem autenticação)', () => {
    const withSso = (over: object) =>
      ({ ...parseAuthSettings(null), ...over }) as ReturnType<typeof parseAuthSettings>;

    it('SSO só aparece activo se houver fornecedor E clientId', () => {
      const oidc = { ...DEFAULT_AUTH_SETTINGS.oidc, clientId: 'c' };
      expect(
        publicLoginOptions(withSso({ ssoEnabled: true, ssoProvider: 'GOOGLE', oidc })).ssoEnabled,
      ).toBe(true);
      expect(
        publicLoginOptions(withSso({ ssoEnabled: true, ssoProvider: null, oidc })).ssoEnabled,
      ).toBe(false);
      expect(
        publicLoginOptions(withSso({ ssoEnabled: true, ssoProvider: 'GOOGLE' })).ssoEnabled,
      ).toBe(false);
      expect(
        publicLoginOptions(withSso({ ssoEnabled: false, ssoProvider: 'GOOGLE', oidc })).ssoEnabled,
      ).toBe(false);
    });

    it('só devolve as quatro chaves públicas — nada de configuração interna', () => {
      const out = publicLoginOptions(
        parseAuthSettings(
          JSON.stringify({
            ssoEnabled: true,
            oidc: { clientId: 'c', clientSecretEnc: 'seg', issuer: 'https://interno' },
            ldap: { enabled: true, url: 'ldaps://interno', bindDn: 'cn=svc' },
          }),
        ),
      );
      expect(Object.keys(out).sort()).toEqual(
        ['ldapEnabled', 'passwordLoginDisabled', 'ssoEnabled', 'ssoProvider'].sort(),
      );
      expect(JSON.stringify(out)).not.toMatch(/interno|seg|svc/);
    });

    it('passwordLoginDisabled reflecte enforceSsoOnly', () => {
      expect(publicLoginOptions(withSso({ enforceSsoOnly: true })).passwordLoginDisabled).toBe(
        true,
      );
    });
  });
});
