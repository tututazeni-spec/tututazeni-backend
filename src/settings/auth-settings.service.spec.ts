import { BadRequestException } from '@nestjs/common';
import { Client } from 'ldapts';
import { AuthSettingsService } from './auth-settings.service';
import { DEFAULT_AUTH_SETTINGS, AuthSettings } from './auth-settings';
import { writeChainedAuditLog } from '../common/helpers/audit-chain';

jest.mock('ldapts', () => ({ Client: jest.fn() }));
jest.mock('../common/helpers/audit-chain', () => ({
  writeChainedAuditLog: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../common/helpers/tenant.helper', () => ({
  resolveDefaultTenantId: jest.fn().mockResolvedValue(1),
}));
jest.mock('../automation/automation-connections.service', () => ({
  encryptSecret: (s: string) => `enc:${s}`,
  decryptSecret: (s: string) => s.replace(/^enc:/, ''),
}));

const audit = writeChainedAuditLog as jest.Mock;
const ClientMock = Client as unknown as jest.Mock;

const settings = (over: Partial<AuthSettings> = {}): AuthSettings => ({
  ...structuredClone(DEFAULT_AUTH_SETTINGS),
  ...over,
});
const row = (
  s: Partial<AuthSettings> = {},
  cols: { ssoEnabled?: boolean; ssoProvider?: string | null } = {},
) => ({
  ssoEnabled: cols.ssoEnabled ?? false,
  ssoProvider: cols.ssoProvider ?? null,
  ssoConfigJson: JSON.stringify(s),
});

const okResponse = (doc: unknown) => ({ ok: true, status: 200, json: async () => doc }) as Response;
const DISCOVERY = {
  issuer: 'https://accounts.google.com',
  authorization_endpoint: 'https://accounts.google.com/auth',
  token_endpoint: 'https://accounts.google.com/token',
  userinfo_endpoint: 'https://accounts.google.com/userinfo',
};

describe('AuthSettingsService', () => {
  let prisma: any;
  let service: AuthSettingsService;
  let fetchMock: jest.Mock;
  let ldap: { startTLS: jest.Mock; bind: jest.Mock; search: jest.Mock; unbind: jest.Mock };
  const originalFetch = global.fetch;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma = {
      tenantConfig: {
        findUnique: jest.fn().mockResolvedValue(null),
        update: jest.fn().mockResolvedValue({}),
      },
    };
    service = new AuthSettingsService(prisma);
    fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
    ldap = {
      startTLS: jest.fn().mockResolvedValue(undefined),
      bind: jest.fn().mockResolvedValue(undefined),
      search: jest.fn().mockResolvedValue({ searchEntries: [] }),
      unbind: jest.fn().mockResolvedValue(undefined),
    };
    ClientMock.mockImplementation(() => ldap);
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  describe('load / getInternal', () => {
    it('sem configuração guardada devolve os defaults (SSO e LDAP desligados)', async () => {
      const s = await service.getInternal();
      expect(s.ssoEnabled).toBe(false);
      expect(s.ldap.enabled).toBe(false);
    });

    it('as colunas ssoEnabled/ssoProvider vencem o que estiver no JSON', async () => {
      prisma.tenantConfig.findUnique.mockResolvedValue(
        row(
          { ssoEnabled: false, ssoProvider: 'GOOGLE' },
          { ssoEnabled: true, ssoProvider: 'MICROSOFT' },
        ),
      );
      const s = await service.getInternal();
      expect(s).toMatchObject({ ssoEnabled: true, ssoProvider: 'MICROSOFT' });
    });

    it('usa cache durante 30s', async () => {
      await service.getInternal();
      await service.getInternal();
      expect(prisma.tenantConfig.findUnique).toHaveBeenCalledTimes(1);
    });
  });

  describe('get / getPublicLoginOptions — nunca expõem segredos', () => {
    beforeEach(() => {
      prisma.tenantConfig.findUnique.mockResolvedValue(
        row(
          {
            ssoProvider: 'GOOGLE',
            oidc: {
              clientId: 'cid',
              clientSecretEnc: 'enc:SEGREDO-OIDC',
              tenantId: 'common',
              issuer: '',
            },
            ldap: {
              ...DEFAULT_AUTH_SETTINGS.ldap,
              enabled: true,
              bindPasswordEnc: 'enc:SEGREDO-LDAP',
            },
          },
          { ssoEnabled: true, ssoProvider: 'GOOGLE' },
        ),
      );
    });

    it('a vista de admin só tem indicadores has*', async () => {
      const view = await service.get();
      const json = JSON.stringify(view);
      expect(json).not.toContain('SEGREDO');
      expect(json).not.toContain('clientSecretEnc');
      expect(json).not.toContain('bindPasswordEnc');
      expect(view.oidc.hasClientSecret).toBe(true);
      expect(view.ldap.hasBindPassword).toBe(true);
    });

    it('a vista pública (página de login) só diz o que está activo', async () => {
      const pub = await service.getPublicLoginOptions();
      expect(pub).toEqual({
        ssoEnabled: true,
        ssoProvider: 'GOOGLE',
        ldapEnabled: true,
        passwordLoginDisabled: false,
      });
    });
  });

  describe('update — validações', () => {
    const fullOidc = { clientId: 'cid', clientSecret: 'shh' };

    it('SSO activo exige fornecedor', async () => {
      await expect(service.update({ ssoEnabled: true } as never)).rejects.toThrow(/fornecedor/);
    });

    it('SSO activo exige Client ID e Client Secret', async () => {
      await expect(
        service.update({
          ssoEnabled: true,
          ssoProvider: 'GOOGLE',
          oidc: { clientId: 'x' },
        } as never),
      ).rejects.toThrow(/Client ID e Client Secret/);
    });

    it('OIDC genérico exige emissor', async () => {
      await expect(
        service.update({ ssoEnabled: true, ssoProvider: 'OIDC', oidc: fullOidc } as never),
      ).rejects.toThrow(/emissor/);
    });

    it('LDAP activo exige URL e Base DN', async () => {
      await expect(
        service.update({ ldap: { enabled: true, url: 'ldaps://x' } } as never),
      ).rejects.toThrow(/Base DN/);
    });

    it('enforceSsoOnly sem SSO nem LDAP activos é recusado (evita bloquear toda a gente)', async () => {
      await expect(service.update({ enforceSsoOnly: true } as never)).rejects.toThrow(
        /sem SSO ou LDAP/,
      );
      expect(prisma.tenantConfig.update).not.toHaveBeenCalled();
    });

    it('enforceSsoOnly com LDAP activo é aceite', async () => {
      await expect(
        service.update({
          enforceSsoOnly: true,
          ldap: { enabled: true, url: 'ldaps://x', baseDn: 'dc=x' },
        } as never),
      ).resolves.toBeDefined();
    });

    it('nenhuma validação falhada grava ou audita', async () => {
      await service.update({ ssoEnabled: true } as never).catch(() => undefined);
      expect(prisma.tenantConfig.update).not.toHaveBeenCalled();
      expect(audit).not.toHaveBeenCalled();
    });
  });

  describe('update — segredos', () => {
    const saved = () => JSON.parse(prisma.tenantConfig.update.mock.calls[0][0].data.ssoConfigJson);

    it('guarda só a versão cifrada: o campo em claro nunca é persistido', async () => {
      await service.update({
        ssoEnabled: true,
        ssoProvider: 'GOOGLE',
        oidc: { clientId: 'cid', clientSecret: 'super-secreto' },
      } as never);
      expect(saved().oidc).not.toHaveProperty('clientSecret');
      expect(saved().oidc.clientSecretEnc).toBe('enc:super-secreto');
    });

    it('omitir o segredo mantém o já guardado', async () => {
      prisma.tenantConfig.findUnique.mockResolvedValue(
        row({
          oidc: { clientId: 'cid', clientSecretEnc: 'enc:antigo', tenantId: 'common', issuer: '' },
          ldap: { ...DEFAULT_AUTH_SETTINGS.ldap, bindPasswordEnc: 'enc:ldap-antigo' },
        }),
      );
      await service.update({ oidc: { clientId: 'novo' } } as never);
      expect(saved().oidc).toMatchObject({ clientId: 'novo', clientSecretEnc: 'enc:antigo' });
      expect(saved().ldap.bindPasswordEnc).toBe('enc:ldap-antigo');
    });

    it('string vazia apaga o segredo', async () => {
      prisma.tenantConfig.findUnique.mockResolvedValue(
        row({
          oidc: { clientId: 'cid', clientSecretEnc: 'enc:antigo', tenantId: 'common', issuer: '' },
        }),
      );
      await service.update({ oidc: { clientSecret: '' }, ldap: { bindPassword: '' } } as never);
      expect(saved().oidc.clientSecretEnc).toBeNull();
      expect(saved().ldap.bindPasswordEnc).toBeNull();
    });

    it('a palavra-passe de serviço LDAP também é cifrada', async () => {
      await service.update({ ldap: { bindPassword: 'ldap-pw' } } as never);
      expect(saved().ldap.bindPasswordEnc).toBe('enc:ldap-pw');
    });

    it('a auditoria regista que o segredo mudou, mas nunca o seu valor', async () => {
      await service.update(
        { oidc: { clientSecret: 'super-secreto' }, ldap: { bindPassword: 'ldap-pw' } } as never,
        9,
      );
      const meta = audit.mock.calls[0][1];
      expect(meta).toMatchObject({ userId: 9, action: 'SETTINGS_AUTH_UPDATE', severity: 'HIGH' });
      expect(meta.metadata).not.toContain('super-secreto');
      expect(meta.metadata).not.toContain('ldap-pw');
      expect(JSON.parse(meta.metadata)).toMatchObject({
        oidcSecretChanged: true,
        ldapPasswordChanged: true,
      });
    });
  });

  describe('update — persistência', () => {
    it('grava as colunas ssoEnabled/ssoProvider e invalida a cache', async () => {
      await service.getInternal(); // aquece a cache
      await service.update({
        ssoEnabled: true,
        ssoProvider: 'GOOGLE',
        oidc: { clientId: 'cid', clientSecret: 's' },
      } as never);
      expect(prisma.tenantConfig.update.mock.calls[0][0].data).toMatchObject({
        ssoEnabled: true,
        ssoProvider: 'GOOGLE',
      });
      expect(prisma.tenantConfig.findUnique.mock.calls.length).toBeGreaterThan(1);
    });

    it('ssoProvider=null limpa o fornecedor; undefined mantém', async () => {
      prisma.tenantConfig.findUnique.mockResolvedValue(
        row({ ssoProvider: 'GOOGLE' }, { ssoProvider: 'GOOGLE' }),
      );
      await service.update({ ssoProvider: null } as never);
      expect(prisma.tenantConfig.update.mock.calls[0][0].data.ssoProvider).toBeNull();
    });

    it('falha ao auditar não impede a gravação', async () => {
      audit.mockRejectedValueOnce(new Error('x'));
      await expect(service.update({ enforceSsoOnly: false } as never)).resolves.toBeDefined();
    });
  });

  describe('resolveOidcDiscovery', () => {
    const google = () => settings({ ssoProvider: 'GOOGLE' });

    it('sem emissor → 400 (OIDC genérico por configurar)', async () => {
      await expect(service.resolveOidcDiscovery(settings({ ssoProvider: 'OIDC' }))).rejects.toThrow(
        /sem emissor/,
      );
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('Google usa o emissor fixo, e Microsoft o tenant configurado', async () => {
      fetchMock.mockResolvedValue(okResponse(DISCOVERY));
      await service.resolveOidcDiscovery(google());
      expect(fetchMock.mock.calls[0][0]).toBe(
        'https://accounts.google.com/.well-known/openid-configuration',
      );
      await service.resolveOidcDiscovery(
        settings({
          ssoProvider: 'MICROSOFT',
          oidc: { ...DEFAULT_AUTH_SETTINGS.oidc, tenantId: 'contoso' },
        }),
      );
      expect(fetchMock.mock.calls[1][0]).toBe(
        'https://login.microsoftonline.com/contoso/v2.0/.well-known/openid-configuration',
      );
    });

    it('OIDC genérico: remove a barra final do emissor', async () => {
      fetchMock.mockResolvedValue(okResponse(DISCOVERY));
      await service.resolveOidcDiscovery(
        settings({
          ssoProvider: 'OIDC',
          oidc: { ...DEFAULT_AUTH_SETTINGS.oidc, issuer: 'https://idp.test/' },
        }),
      );
      expect(fetchMock.mock.calls[0][0]).toBe('https://idp.test/.well-known/openid-configuration');
    });

    it('falha de rede → 400 com a causa', async () => {
      fetchMock.mockRejectedValue(new Error('ENOTFOUND'));
      await expect(service.resolveOidcDiscovery(google())).rejects.toThrow(
        /Não foi possível contactar o emissor OIDC: ENOTFOUND/,
      );
    });

    it('HTTP de erro → 400 com o código', async () => {
      fetchMock.mockResolvedValue({ ok: false, status: 503 } as Response);
      await expect(service.resolveOidcDiscovery(google())).rejects.toThrow(/HTTP 503/);
    });

    it.each([
      ['sem authorization_endpoint', { token_endpoint: 't' }],
      ['sem token_endpoint', { authorization_endpoint: 'a' }],
    ])('documento incompleto (%s) → 400', async (_n, doc) => {
      fetchMock.mockResolvedValue(okResponse(doc));
      await expect(service.resolveOidcDiscovery(google())).rejects.toThrow(/incompleto/);
    });

    it('guarda em cache (1h) apenas descobertas bem-sucedidas', async () => {
      fetchMock.mockResolvedValueOnce({ ok: false, status: 500 } as Response);
      await expect(service.resolveOidcDiscovery(google())).rejects.toThrow();
      fetchMock.mockResolvedValue(okResponse(DISCOVERY));
      await service.resolveOidcDiscovery(google());
      await service.resolveOidcDiscovery(google());
      expect(fetchMock).toHaveBeenCalledTimes(2); // 1 falha + 1 sucesso; 2.º sucesso veio da cache
    });

    it('a cache expira ao fim de 1 hora', async () => {
      fetchMock.mockResolvedValue(okResponse(DISCOVERY));
      const now = jest.spyOn(Date, 'now').mockReturnValue(1_000_000);
      await service.resolveOidcDiscovery(google());
      now.mockReturnValue(1_000_000 + 3_600_001);
      await service.resolveOidcDiscovery(google());
      expect(fetchMock).toHaveBeenCalledTimes(2);
      now.mockRestore();
    });
  });

  describe('resolveClientSecret', () => {
    it('sem segredo → 400', () => {
      expect(() => service.resolveClientSecret(settings())).toThrow(BadRequestException);
    });

    it('decifra o segredo guardado', () => {
      const s = settings({
        oidc: { ...DEFAULT_AUTH_SETTINGS.oidc, clientSecretEnc: 'enc:abc' },
      });
      expect(service.resolveClientSecret(s)).toBe('abc');
    });
  });

  describe('testOidc', () => {
    it('sem fornecedor → 400', async () => {
      await expect(service.testOidc()).rejects.toThrow(/fornecedor/);
    });

    it('sucesso devolve ok + emissor', async () => {
      prisma.tenantConfig.findUnique.mockResolvedValue(
        row({ ssoProvider: 'GOOGLE' }, { ssoProvider: 'GOOGLE' }),
      );
      fetchMock.mockResolvedValue(okResponse(DISCOVERY));
      await expect(service.testOidc()).resolves.toEqual({
        ok: true,
        issuer: DISCOVERY.issuer,
        authorizationEndpoint: DISCOVERY.authorization_endpoint,
      });
    });

    it('falha de ligação é devolvida como ok:false, não como excepção', async () => {
      prisma.tenantConfig.findUnique.mockResolvedValue(
        row({ ssoProvider: 'GOOGLE' }, { ssoProvider: 'GOOGLE' }),
      );
      fetchMock.mockRejectedValue(new Error('timeout'));
      const res = await service.testOidc();
      expect(res).toMatchObject({ ok: false });
      expect((res as { error: string }).error).toMatch(/timeout/);
    });
  });

  describe('LDAP', () => {
    const ldapCfg = (over: object = {}) =>
      settings({
        ldap: {
          ...DEFAULT_AUTH_SETTINGS.ldap,
          enabled: true,
          url: 'ldaps://ad.test:636',
          bindDn: 'cn=svc,dc=test',
          bindPasswordEnc: 'enc:svc-pw',
          baseDn: 'dc=test',
          ...over,
        },
      });

    describe('findLdapUser', () => {
      it('liga com a conta de serviço e pesquisa com o email escapado (sem injecção)', async () => {
        await service.findLdapUser(ldapCfg(), 'x*)(uid=*@a.com');

        expect(ClientMock).toHaveBeenCalledWith(
          expect.objectContaining({ url: 'ldaps://ad.test:636' }),
        );
        expect(ldap.bind).toHaveBeenCalledWith('cn=svc,dc=test', 'svc-pw');
        const [base, opts] = ldap.search.mock.calls[0];
        expect(base).toBe('dc=test');
        expect(opts.filter).toBe('(mail=x\\2a\\29\\28uid=\\2a@a.com)');
        expect(opts).toMatchObject({ scope: 'sub', sizeLimit: 1 });
      });

      it('só usa STARTTLS quando configurado', async () => {
        await service.findLdapUser(ldapCfg(), 'a@b.c');
        expect(ldap.startTLS).not.toHaveBeenCalled();
        await service.findLdapUser(ldapCfg({ startTls: true }), 'a@b.c');
        expect(ldap.startTLS).toHaveBeenCalledTimes(1);
      });

      it('sem resultados → null', async () => {
        await expect(service.findLdapUser(ldapCfg(), 'a@b.c')).resolves.toBeNull();
      });

      it('lê atributos configurados, aceitando valores em lista', async () => {
        ldap.search.mockResolvedValue({
          searchEntries: [{ dn: 'cn=ana,dc=test', mail: ['ana@test'], displayName: 'Ana Silva' }],
        });
        const user = await service.findLdapUser(
          ldapCfg({ emailAttribute: 'mail', nameAttribute: 'displayName' }),
          'ana@test',
        );
        expect(user).toEqual({ dn: 'cn=ana,dc=test', email: 'ana@test', name: 'Ana Silva' });
        expect(ldap.search.mock.calls[0][1].attributes).toEqual(['mail', 'displayName']);
      });

      it('atributos em falta caem no email introduzido', async () => {
        ldap.search.mockResolvedValue({ searchEntries: [{ dn: 'cn=x' }] });
        await expect(service.findLdapUser(ldapCfg(), 'a@b.c')).resolves.toEqual({
          dn: 'cn=x',
          email: 'a@b.c',
          name: 'a@b.c',
        });
      });

      it('fecha a ligação mesmo quando o bind falha', async () => {
        ldap.bind.mockRejectedValue(new Error('invalid credentials'));
        await expect(service.findLdapUser(ldapCfg(), 'a@b.c')).rejects.toThrow(
          'invalid credentials',
        );
        expect(ldap.unbind).toHaveBeenCalled();
      });

      it('falha ao fechar a ligação não esconde o resultado', async () => {
        ldap.unbind.mockRejectedValue(new Error('socket closed'));
        await expect(service.findLdapUser(ldapCfg(), 'a@b.c')).resolves.toBeNull();
      });

      it('sem palavra-passe de serviço configurada → 400 (não tenta bind anónimo)', async () => {
        await expect(
          service.findLdapUser(ldapCfg({ bindPasswordEnc: null }), 'a@b.c'),
        ).rejects.toThrow(/sem password de serviço/);
        expect(ldap.bind).not.toHaveBeenCalled();
        expect(ldap.unbind).toHaveBeenCalled();
      });
    });

    describe('verifyLdapCredentials', () => {
      it('true quando o bind com o DN do utilizador funciona', async () => {
        await expect(
          service.verifyLdapCredentials(ldapCfg(), 'cn=ana,dc=test', 'pw'),
        ).resolves.toBe(true);
        expect(ldap.bind).toHaveBeenCalledWith('cn=ana,dc=test', 'pw');
      });

      it('false quando o bind falha, sem lançar', async () => {
        ldap.bind.mockRejectedValue(new Error('49 invalid credentials'));
        await expect(service.verifyLdapCredentials(ldapCfg(), 'cn=ana', 'errada')).resolves.toBe(
          false,
        );
      });

      it('fecha sempre a ligação', async () => {
        ldap.bind.mockRejectedValue(new Error('x'));
        await service.verifyLdapCredentials(ldapCfg(), 'cn=ana', 'pw');
        expect(ldap.unbind).toHaveBeenCalled();
      });

      it('usa STARTTLS quando configurado, para a password não ir em claro', async () => {
        await service.verifyLdapCredentials(ldapCfg({ startTls: true }), 'cn=ana', 'pw');
        expect(ldap.startTLS).toHaveBeenCalled();
      });
    });

    describe('testLdap', () => {
      const load = (cfg: AuthSettings) =>
        prisma.tenantConfig.findUnique.mockResolvedValue(row(cfg));

      it('exige URL e Base DN', async () => {
        await expect(service.testLdap()).rejects.toThrow(/Configure o LDAP/);
      });

      it('sucesso → ok:true', async () => {
        load(ldapCfg());
        await expect(service.testLdap()).resolves.toEqual({ ok: true });
      });

      it('falha → ok:false com a mensagem, e liberta a ligação', async () => {
        load(ldapCfg());
        ldap.bind.mockRejectedValue(new Error('connect ECONNREFUSED'));
        await expect(service.testLdap()).resolves.toEqual({
          ok: false,
          error: 'connect ECONNREFUSED',
        });
        expect(ldap.unbind).toHaveBeenCalled();
      });
    });
  });
});
