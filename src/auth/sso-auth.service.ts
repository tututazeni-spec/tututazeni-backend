// src/auth/sso-auth.service.ts
// Fluxo de login para Definições §11 (Autenticação/SSO): OIDC genérico (cobre
// GOOGLE e MICROSOFT, que expõem descoberta OIDC padrão, e um fornecedor OIDC
// próprio) e LDAP/Active Directory. A configuração/validação admin vive em
// AuthSettingsService; este serviço só autentica utilizadores finais.
import { BadRequestException, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as crypto from 'crypto';
import { AuthService, AuthRequestContext } from './auth.service';
import { SettingsService } from '../settings/settings.service';
import { AuthSettingsService } from '../settings/auth-settings.service';
import { OidcProviderKey } from '../settings/auth-settings';

interface SsoStatePayload {
  typ: 'sso_state';
  provider: OidcProviderKey;
  codeVerifier: string;
  nonce: string;
}

const STATE_TTL = '10m';

function base64url(buf: Buffer): string {
  return buf.toString('base64url');
}

@Injectable()
export class SsoAuthService {
  constructor(
    private readonly jwt: JwtService,
    private readonly authService: AuthService,
    private readonly settings: SettingsService,
    private readonly authSettings: AuthSettingsService,
  ) {}

  private stateSecret(): string {
    const secret = process.env.JWT_REFRESH_SECRET;
    if (!secret) {
      throw new Error('JWT_REFRESH_SECRET não está definido — recusado por segurança.');
    }
    return secret;
  }

  private redirectUri(): string {
    const base = process.env.SSO_REDIRECT_BASE_URL ?? process.env.APP_URL ?? '';
    return `${base.replace(/\/$/, '')}/api/auth/sso/callback`;
  }

  // ─── Passo 1: redireccionar para o fornecedor ────────────────────────────

  async buildAuthorizationUrl(): Promise<string> {
    const settings = await this.authSettings.getInternal();
    if (!settings.ssoEnabled || !settings.ssoProvider) {
      throw new BadRequestException('SSO não está activo nesta organização');
    }
    const discovery = await this.authSettings.resolveOidcDiscovery(settings);

    const codeVerifier = base64url(crypto.randomBytes(32));
    const codeChallenge = base64url(crypto.createHash('sha256').update(codeVerifier).digest());
    const nonce = crypto.randomBytes(16).toString('hex');
    const state = await this.jwt.signAsync(
      { typ: 'sso_state', provider: settings.ssoProvider, codeVerifier, nonce } as SsoStatePayload,
      { secret: this.stateSecret(), expiresIn: STATE_TTL },
    );

    const params = new URLSearchParams({
      response_type: 'code',
      client_id: settings.oidc.clientId,
      redirect_uri: this.redirectUri(),
      scope: 'openid email profile',
      state,
      nonce,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
    });
    return `${discovery.authorization_endpoint}?${params.toString()}`;
  }

  // ─── Passo 2: troca do código + aprovisionamento ─────────────────────────

  async handleCallback(code: string, state: string, ctx?: AuthRequestContext) {
    let payload: SsoStatePayload;
    try {
      payload = await this.jwt.verifyAsync<SsoStatePayload>(state, { secret: this.stateSecret() });
    } catch {
      throw new UnauthorizedException('Pedido de SSO inválido ou expirado — tente iniciar sessão novamente');
    }
    if (payload.typ !== 'sso_state') throw new UnauthorizedException('Pedido de SSO inválido');

    const settings = await this.authSettings.getInternal();
    if (!settings.ssoEnabled || settings.ssoProvider !== payload.provider) {
      throw new BadRequestException('SSO foi alterado entretanto — tente iniciar sessão novamente');
    }
    const discovery = await this.authSettings.resolveOidcDiscovery(settings);
    const clientSecret = this.authSettings.resolveClientSecret(settings);

    const tokenRes = await fetch(discovery.token_endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: this.redirectUri(),
        client_id: settings.oidc.clientId,
        client_secret: clientSecret,
        code_verifier: payload.codeVerifier,
      }),
      signal: AbortSignal.timeout(10_000),
    }).catch((err: unknown) => {
      throw new BadRequestException(
        `Falha ao contactar o fornecedor de SSO: ${err instanceof Error ? err.message : String(err)}`,
      );
    });
    if (!tokenRes.ok) {
      throw new BadRequestException('O fornecedor de SSO rejeitou o pedido de autenticação');
    }
    const tokenBody = (await tokenRes.json()) as { access_token?: string };
    if (!tokenBody.access_token) throw new BadRequestException('Resposta de SSO sem access_token');

    const userInfoRes = await fetch(discovery.userinfo_endpoint, {
      headers: { Authorization: `Bearer ${tokenBody.access_token}` },
      signal: AbortSignal.timeout(10_000),
    });
    if (!userInfoRes.ok) throw new BadRequestException('Falha ao obter os dados do utilizador no fornecedor de SSO');
    const info = (await userInfoRes.json()) as {
      email?: string;
      email_verified?: boolean;
      name?: string;
    };
    if (!info.email || info.email_verified === false) {
      throw new BadRequestException('O fornecedor de SSO não devolveu um email verificado');
    }

    return this.findOrProvisionAndLogin(info.email, info.name ?? info.email, ctx, 'SSO');
  }

  // ─── LDAP/Active Directory ────────────────────────────────────────────────

  async ldapLogin(email: string, password: string, ctx?: AuthRequestContext) {
    const settings = await this.authSettings.getInternal();
    if (!settings.ldap.enabled) throw new BadRequestException('LDAP/AD não está activo nesta organização');

    const entry = await this.authSettings.findLdapUser(settings, email).catch(() => null);
    if (!entry) throw new UnauthorizedException('Credenciais inválidas');

    const ok = await this.authSettings.verifyLdapCredentials(settings, entry.dn, password);
    if (!ok) throw new UnauthorizedException('Credenciais inválidas');

    return this.findOrProvisionAndLogin(entry.email, entry.name, ctx, 'LDAP');
  }

  // ─── Encontrar/criar o utilizador local + emitir sessão ──────────────────

  private async findOrProvisionAndLogin(
    email: string,
    name: string,
    ctx: AuthRequestContext | undefined,
    method: 'SSO' | 'LDAP',
  ) {
    const policy = await this.settings.getUserPolicy();
    this.assertDomainAllowed(policy.allowedEmailDomains, email);

    let user = await this.authService.findUserWithRoleByEmail(email);
    if (user && !user.active) throw new UnauthorizedException('Conta desativada');

    if (!user) {
      if (!policy.invitesEnabled) {
        throw new ForbiddenException('A criação de contas está desactivada pela organização');
      }
      user = await this.authService.createUser({
        email,
        fullName: name,
        password: null,
        roleId: policy.defaultRoleId,
        accountStatus: 'ACTIVE',
        active: true,
        passwordChangedAt: new Date(),
      });
    }

    return this.authService.issueSessionForUser(user, ctx, { method });
  }

  private assertDomainAllowed(allowed: string[], email: string): void {
    if (allowed.length === 0) return;
    const domain = email.split('@')[1]?.toLowerCase() ?? '';
    if (!allowed.map(d => d.toLowerCase()).includes(domain)) {
      throw new ForbiddenException(`Domínio de email não autorizado: ${domain}`);
    }
  }
}
