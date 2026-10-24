import { BadRequestException, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { SsoAuthService } from './sso-auth.service';

const SECRET = 'refresh-secret-for-tests';
const DISCOVERY = {
  authorization_endpoint: 'https://idp.test/authorize',
  token_endpoint: 'https://idp.test/token',
  userinfo_endpoint: 'https://idp.test/userinfo',
};

const ssoSettings = (over: Record<string, unknown> = {}) => ({
  ssoEnabled: true,
  ssoProvider: 'GOOGLE',
  oidc: { clientId: 'client-123' },
  ldap: { enabled: false },
  ...over,
});

const policy = (over: Record<string, unknown> = {}) => ({
  allowedEmailDomains: [],
  invitesEnabled: true,
  defaultRoleId: 4,
  ...over,
});

const jsonResponse = (body: unknown, ok = true) =>
  ({ ok, json: async () => body }) as unknown as Response;

describe('SsoAuthService', () => {
  let jwt: JwtService;
  let authService: {
    findUserWithRoleByEmail: jest.Mock;
    createUser: jest.Mock;
    issueSessionForUser: jest.Mock;
  };
  let settings: { getUserPolicy: jest.Mock };
  let authSettings: {
    getInternal: jest.Mock;
    resolveOidcDiscovery: jest.Mock;
    resolveClientSecret: jest.Mock;
    findLdapUser: jest.Mock;
    verifyLdapCredentials: jest.Mock;
  };
  let service: SsoAuthService;
  let fetchMock: jest.Mock;
  const originalFetch = global.fetch;
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env.JWT_REFRESH_SECRET = SECRET;
    process.env.SSO_REDIRECT_BASE_URL = 'https://app.innova.test/';
    jwt = new JwtService({});
    authService = {
      findUserWithRoleByEmail: jest.fn(),
      createUser: jest.fn(),
      issueSessionForUser: jest.fn().mockResolvedValue({ access_token: 'session' }),
    };
    settings = { getUserPolicy: jest.fn().mockResolvedValue(policy()) };
    authSettings = {
      getInternal: jest.fn().mockResolvedValue(ssoSettings()),
      resolveOidcDiscovery: jest.fn().mockResolvedValue(DISCOVERY),
      resolveClientSecret: jest.fn().mockReturnValue('client-secret'),
      findLdapUser: jest.fn(),
      verifyLdapCredentials: jest.fn(),
    };
    fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
    service = new SsoAuthService(
      jwt,
      authService as never,
      settings as never,
      authSettings as never,
    );
  });

  afterEach(() => {
    global.fetch = originalFetch;
    process.env = { ...originalEnv };
  });

  describe('buildAuthorizationUrl', () => {
    it('recusa quando o SSO está desactivado', async () => {
      authSettings.getInternal.mockResolvedValue(ssoSettings({ ssoEnabled: false }));
      await expect(service.buildAuthorizationUrl()).rejects.toThrow(BadRequestException);
    });

    it('recusa quando não há fornecedor configurado', async () => {
      authSettings.getInternal.mockResolvedValue(ssoSettings({ ssoProvider: null }));
      await expect(service.buildAuthorizationUrl()).rejects.toThrow(BadRequestException);
    });

    it('recusa arrancar sem JWT_REFRESH_SECRET em vez de assinar com segredo vazio', async () => {
      delete process.env.JWT_REFRESH_SECRET;
      await expect(service.buildAuthorizationUrl()).rejects.toThrow(/JWT_REFRESH_SECRET/);
    });

    it('gera URL com PKCE S256, nonce, redirect_uri normalizado e state assinado', async () => {
      const url = new URL(await service.buildAuthorizationUrl());
      const q = url.searchParams;

      expect(`${url.origin}${url.pathname}`).toBe(DISCOVERY.authorization_endpoint);
      expect(q.get('response_type')).toBe('code');
      expect(q.get('client_id')).toBe('client-123');
      expect(q.get('scope')).toBe('openid email profile');
      expect(q.get('code_challenge_method')).toBe('S256');
      // sem barra dupla apesar de SSO_REDIRECT_BASE_URL acabar em "/"
      expect(q.get('redirect_uri')).toBe('https://app.innova.test/api/auth/sso/callback');

      const state = await jwt.verifyAsync(q.get('state')!, { secret: SECRET });
      expect(state).toMatchObject({ typ: 'sso_state', provider: 'GOOGLE', nonce: q.get('nonce') });
      // o desafio PKCE tem de corresponder ao verifier guardado no state
      const { createHash } = await import('crypto');
      const expected = createHash('sha256').update(state.codeVerifier).digest('base64url');
      expect(q.get('code_challenge')).toBe(expected);
    });

    it('cada pedido usa verifier e nonce novos', async () => {
      const a = new URL(await service.buildAuthorizationUrl()).searchParams;
      const b = new URL(await service.buildAuthorizationUrl()).searchParams;
      expect(a.get('nonce')).not.toBe(b.get('nonce'));
      expect(a.get('code_challenge')).not.toBe(b.get('code_challenge'));
    });
  });

  describe('handleCallback', () => {
    const validState = (over: Record<string, unknown> = {}) =>
      jwt.signAsync(
        { typ: 'sso_state', provider: 'GOOGLE', codeVerifier: 'verifier-abc', nonce: 'n', ...over },
        { secret: SECRET, expiresIn: '10m' },
      );

    const mockProvider = (
      userInfo: Record<string, unknown> = {
        email: 'ana@innova.test',
        email_verified: true,
        name: 'Ana',
      },
    ) => {
      fetchMock
        .mockResolvedValueOnce(jsonResponse({ access_token: 'idp-token' }))
        .mockResolvedValueOnce(jsonResponse(userInfo));
    };

    it('rejeita state adulterado', async () => {
      const state = await validState();
      await expect(service.handleCallback('code', state.slice(0, -2) + 'xx')).rejects.toThrow(
        UnauthorizedException,
      );
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('rejeita state assinado com outro segredo (CSRF/forja)', async () => {
      const forged = await jwt.signAsync(
        { typ: 'sso_state', provider: 'GOOGLE', codeVerifier: 'v', nonce: 'n' },
        { secret: 'outro-segredo' },
      );
      await expect(service.handleCallback('code', forged)).rejects.toThrow(UnauthorizedException);
    });

    it('rejeita state expirado', async () => {
      const expired = await jwt.signAsync(
        { typ: 'sso_state', provider: 'GOOGLE', codeVerifier: 'v', nonce: 'n' },
        { secret: SECRET, expiresIn: '-1s' },
      );
      await expect(service.handleCallback('code', expired)).rejects.toThrow(/inválido ou expirado/);
    });

    it('rejeita um JWT válido que não seja um state de SSO (ex.: outro token da app)', async () => {
      const other = await validState({ typ: 'refresh' });
      await expect(service.handleCallback('code', other)).rejects.toThrow(UnauthorizedException);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('rejeita quando o fornecedor foi alterado entre o início e o callback', async () => {
      authSettings.getInternal.mockResolvedValue(ssoSettings({ ssoProvider: 'MICROSOFT' }));
      await expect(service.handleCallback('code', await validState())).rejects.toThrow(
        /alterado entretanto/,
      );
    });

    it('rejeita quando o SSO foi desactivado entretanto', async () => {
      authSettings.getInternal.mockResolvedValue(ssoSettings({ ssoEnabled: false }));
      await expect(service.handleCallback('code', await validState())).rejects.toThrow(
        BadRequestException,
      );
    });

    it('troca o código enviando code_verifier e credenciais do cliente', async () => {
      mockProvider();
      authService.findUserWithRoleByEmail.mockResolvedValue({ id: 1, active: true });

      await service.handleCallback('auth-code', await validState());

      const [tokenUrl, init] = fetchMock.mock.calls[0];
      expect(tokenUrl).toBe(DISCOVERY.token_endpoint);
      const body = init.body as URLSearchParams;
      expect(body.get('grant_type')).toBe('authorization_code');
      expect(body.get('code')).toBe('auth-code');
      expect(body.get('code_verifier')).toBe('verifier-abc');
      expect(body.get('client_id')).toBe('client-123');
      expect(body.get('client_secret')).toBe('client-secret');
      expect(fetchMock.mock.calls[1][1].headers.Authorization).toBe('Bearer idp-token');
    });

    it('converte falha de rede no fornecedor em BadRequest legível', async () => {
      fetchMock.mockRejectedValueOnce(new Error('ECONNREFUSED'));
      await expect(service.handleCallback('code', await validState())).rejects.toThrow(
        /Falha ao contactar o fornecedor de SSO: ECONNREFUSED/,
      );
    });

    it('trata resposta não-OK do endpoint de token como rejeição do fornecedor', async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse({}, false));
      await expect(service.handleCallback('code', await validState())).rejects.toThrow(
        /rejeitou o pedido/,
      );
    });

    it('exige access_token na resposta do token', async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse({}));
      await expect(service.handleCallback('code', await validState())).rejects.toThrow(
        /sem access_token/,
      );
    });

    it('falha quando o userinfo não responde OK', async () => {
      fetchMock
        .mockResolvedValueOnce(jsonResponse({ access_token: 't' }))
        .mockResolvedValueOnce(jsonResponse({}, false));
      await expect(service.handleCallback('code', await validState())).rejects.toThrow(
        /dados do utilizador/,
      );
    });

    it.each([
      ['sem email', { name: 'Ana' }],
      ['email não verificado', { email: 'ana@innova.test', email_verified: false }],
    ])(
      'recusa utilizador %s (evita account takeover por email não verificado)',
      async (_n, info) => {
        mockProvider(info);
        await expect(service.handleCallback('code', await validState())).rejects.toThrow(
          /email verificado/,
        );
        expect(authService.issueSessionForUser).not.toHaveBeenCalled();
      },
    );

    it('aceita email_verified ausente (nem todos os IdPs o enviam)', async () => {
      mockProvider({ email: 'ana@innova.test' });
      authService.findUserWithRoleByEmail.mockResolvedValue({ id: 1, active: true });
      await expect(service.handleCallback('code', await validState())).resolves.toBeDefined();
    });

    it('emite sessão para utilizador existente com o método SSO e o contexto do pedido', async () => {
      mockProvider();
      const user = { id: 1, active: true };
      authService.findUserWithRoleByEmail.mockResolvedValue(user);
      const ctx = { ip: '10.0.0.1', userAgent: 'jest' };

      const result = await service.handleCallback('code', await validState(), ctx);

      expect(result).toEqual({ access_token: 'session' });
      expect(authService.createUser).not.toHaveBeenCalled();
      expect(authService.issueSessionForUser).toHaveBeenCalledWith(user, ctx, { method: 'SSO' });
    });
  });

  describe('ldapLogin', () => {
    const entry = { dn: 'cn=ana,dc=innova', email: 'ana@innova.test', name: 'Ana' };

    beforeEach(() => {
      authSettings.getInternal.mockResolvedValue(ssoSettings({ ldap: { enabled: true } }));
    });

    it('recusa quando o LDAP está desactivado', async () => {
      authSettings.getInternal.mockResolvedValue(ssoSettings());
      await expect(service.ldapLogin('ana@innova.test', 'pw')).rejects.toThrow(BadRequestException);
      expect(authSettings.findLdapUser).not.toHaveBeenCalled();
    });

    it('utilizador inexistente no directório → credenciais inválidas', async () => {
      authSettings.findLdapUser.mockResolvedValue(null);
      await expect(service.ldapLogin('x@innova.test', 'pw')).rejects.toThrow(UnauthorizedException);
      expect(authSettings.verifyLdapCredentials).not.toHaveBeenCalled();
    });

    it('erro de ligação ao directório é tratado como credenciais inválidas, sem vazar detalhe', async () => {
      authSettings.findLdapUser.mockRejectedValue(new Error('ldap://10.0.0.5 unreachable'));
      const err = await service.ldapLogin('ana@innova.test', 'pw').catch(e => e);
      expect(err).toBeInstanceOf(UnauthorizedException);
      expect(err.message).toBe('Credenciais inválidas');
    });

    it('palavra-passe errada → mesma mensagem genérica e nenhuma sessão', async () => {
      authSettings.findLdapUser.mockResolvedValue(entry);
      authSettings.verifyLdapCredentials.mockResolvedValue(false);
      await expect(service.ldapLogin('ana@innova.test', 'errada')).rejects.toThrow(
        'Credenciais inválidas',
      );
      expect(authService.issueSessionForUser).not.toHaveBeenCalled();
    });

    it('verifica as credenciais contra o DN encontrado e emite sessão LDAP', async () => {
      authSettings.findLdapUser.mockResolvedValue(entry);
      authSettings.verifyLdapCredentials.mockResolvedValue(true);
      const user = { id: 2, active: true };
      authService.findUserWithRoleByEmail.mockResolvedValue(user);

      await service.ldapLogin('ana@innova.test', 'certa', { ip: '1.1.1.1' });

      expect(authSettings.verifyLdapCredentials).toHaveBeenCalledWith(
        expect.anything(),
        entry.dn,
        'certa',
      );
      expect(authService.issueSessionForUser).toHaveBeenCalledWith(
        user,
        { ip: '1.1.1.1' },
        { method: 'LDAP' },
      );
    });
  });

  describe('aprovisionamento (via ldapLogin)', () => {
    const login = () => service.ldapLogin('ana@innova.test', 'pw');

    beforeEach(() => {
      authSettings.getInternal.mockResolvedValue(ssoSettings({ ldap: { enabled: true } }));
      authSettings.findLdapUser.mockResolvedValue({
        dn: 'cn=ana',
        email: 'ana@innova.test',
        name: 'Ana Silva',
      });
      authSettings.verifyLdapCredentials.mockResolvedValue(true);
    });

    it('recusa conta desactivada', async () => {
      authService.findUserWithRoleByEmail.mockResolvedValue({ id: 1, active: false });
      await expect(login()).rejects.toThrow('Conta desativada');
      expect(authService.issueSessionForUser).not.toHaveBeenCalled();
    });

    it('cria utilizador novo com fullName, role por omissão, sem password e activo', async () => {
      authService.findUserWithRoleByEmail.mockResolvedValue(null);
      authService.createUser.mockResolvedValue({ id: 9, active: true });

      await login();

      expect(authService.createUser).toHaveBeenCalledWith(
        expect.objectContaining({
          email: 'ana@innova.test',
          fullName: 'Ana Silva',
          password: null,
          roleId: 4,
          accountStatus: 'ACTIVE',
          active: true,
          passwordChangedAt: expect.any(Date),
        }),
      );
      expect(authService.issueSessionForUser).toHaveBeenCalledWith(
        { id: 9, active: true },
        undefined,
        { method: 'LDAP' },
      );
    });

    it('não cria contas quando a organização desactivou convites', async () => {
      settings.getUserPolicy.mockResolvedValue(policy({ invitesEnabled: false }));
      authService.findUserWithRoleByEmail.mockResolvedValue(null);
      await expect(login()).rejects.toThrow(ForbiddenException);
      expect(authService.createUser).not.toHaveBeenCalled();
    });

    it('convites desactivados não impedem o login de contas já existentes', async () => {
      settings.getUserPolicy.mockResolvedValue(policy({ invitesEnabled: false }));
      authService.findUserWithRoleByEmail.mockResolvedValue({ id: 1, active: true });
      await expect(login()).resolves.toBeDefined();
    });

    it('bloqueia domínios fora da lista, antes de tocar na base de dados', async () => {
      settings.getUserPolicy.mockResolvedValue(policy({ allowedEmailDomains: ['outra.com'] }));
      await expect(login()).rejects.toThrow(/Domínio de email não autorizado: innova.test/);
      expect(authService.findUserWithRoleByEmail).not.toHaveBeenCalled();
    });

    it('a lista de domínios não distingue maiúsculas', async () => {
      settings.getUserPolicy.mockResolvedValue(policy({ allowedEmailDomains: ['INNOVA.TEST'] }));
      authService.findUserWithRoleByEmail.mockResolvedValue({ id: 1, active: true });
      await expect(login()).resolves.toBeDefined();
    });
  });
});
