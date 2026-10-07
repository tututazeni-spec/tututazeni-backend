// src/settings/auth-settings.service.ts
// Definições de Autenticação / SSO (docs/modulo_settings.md §11): configuração
// administrativa (CRUD) + testes de ligação (descoberta OIDC, bind LDAP). O
// fluxo de login em si (redirecionamento OAuth/OIDC e bind LDAP por utilizador)
// vive em src/auth/sso-auth.service.ts, que consome `get()`/`resolveOidcDiscovery`.
import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { Client } from 'ldapts';
import { SsoProvider } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { writeChainedAuditLog } from '../common/helpers/audit-chain';
import { resolveDefaultTenantId } from '../common/helpers/tenant.helper';
import { decryptSecret, encryptSecret } from '../automation/automation-connections.service';
import { UpdateAuthSettingsDto } from './settings.dto';
import {
  AuthSettings,
  OIDC_PROVIDERS,
  parseAuthSettings,
  publicAuthSettings,
  publicLoginOptions,
  renderLdapFilter,
  resolveOidcIssuer,
} from './auth-settings';

export interface OidcDiscovery {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  userinfo_endpoint: string;
}

const DISCOVERY_TTL_MS = 3_600_000;

@Injectable()
export class AuthSettingsService {
  private readonly logger = new Logger(AuthSettingsService.name);
  private cache: { at: number; settings: AuthSettings } | null = null;
  private discoveryCache = new Map<string, { at: number; doc: OidcDiscovery }>();

  constructor(private readonly prisma: PrismaService) {}

  private async load(): Promise<AuthSettings> {
    if (this.cache && Date.now() - this.cache.at < 30_000) return this.cache.settings;
    const id = await resolveDefaultTenantId(this.prisma);
    const row = await this.prisma.tenantConfig.findUnique({
      where: { id },
      select: { ssoEnabled: true, ssoProvider: true, ssoConfigJson: true },
    });
    const settings = parseAuthSettings(row?.ssoConfigJson);
    settings.ssoEnabled = row?.ssoEnabled ?? settings.ssoEnabled;
    settings.ssoProvider =
      (row?.ssoProvider as AuthSettings['ssoProvider']) ?? settings.ssoProvider;
    this.cache = { at: Date.now(), settings };
    return settings;
  }

  /** Para o fluxo de login (src/auth) — nunca expor directamente a um controller. */
  async getInternal(): Promise<AuthSettings> {
    return this.load();
  }

  async get() {
    return {
      ...publicAuthSettings(await this.load()),
      oidcProviderOptions: OIDC_PROVIDERS,
    };
  }

  async getPublicLoginOptions() {
    return publicLoginOptions(await this.load());
  }

  async update(dto: UpdateAuthSettingsDto, actorId?: number) {
    const id = await resolveDefaultTenantId(this.prisma);
    const cur = await this.load();
    const strip = <T extends object>(o?: T) =>
      Object.fromEntries(Object.entries(o ?? {}).filter(([, v]) => v !== undefined));

    const { clientSecret, ...oidcRest } = dto.oidc ?? {};
    const { bindPassword, ...ldapRest } = dto.ldap ?? {};
    const next: AuthSettings = {
      ssoEnabled: dto.ssoEnabled ?? cur.ssoEnabled,
      ssoProvider: dto.ssoProvider === undefined ? cur.ssoProvider : dto.ssoProvider,
      oidc: {
        ...cur.oidc,
        ...strip(oidcRest),
        clientSecretEnc:
          clientSecret === undefined
            ? cur.oidc.clientSecretEnc
            : clientSecret
              ? encryptSecret(clientSecret)
              : null,
      },
      ldap: {
        ...cur.ldap,
        ...strip(ldapRest),
        bindPasswordEnc:
          bindPassword === undefined
            ? cur.ldap.bindPasswordEnc
            : bindPassword
              ? encryptSecret(bindPassword)
              : null,
      },
      enforceSsoOnly: dto.enforceSsoOnly ?? cur.enforceSsoOnly,
    };

    if (next.ssoEnabled) {
      if (!next.ssoProvider) {
        throw new BadRequestException('Escolha um fornecedor de SSO para activar o login único');
      }
      if (!next.oidc.clientId || !next.oidc.clientSecretEnc) {
        throw new BadRequestException(
          'Indique Client ID e Client Secret para o fornecedor escolhido',
        );
      }
      if (next.ssoProvider === 'OIDC' && !next.oidc.issuer) {
        throw new BadRequestException('Indique o emissor (issuer) do fornecedor OIDC');
      }
    }
    if (next.ldap.enabled && (!next.ldap.url || !next.ldap.baseDn)) {
      throw new BadRequestException('Indique o URL e o Base DN do servidor LDAP/AD');
    }
    if (next.enforceSsoOnly && !next.ssoEnabled && !next.ldap.enabled) {
      throw new BadRequestException(
        'Não é possível obrigar autenticação externa sem SSO ou LDAP activos',
      );
    }

    await this.prisma.tenantConfig.update({
      where: { id },
      data: {
        ssoEnabled: next.ssoEnabled,
        ssoProvider: next.ssoProvider as SsoProvider | null,
        ssoConfigJson: JSON.stringify(next),
      },
    });
    this.cache = null;
    await writeChainedAuditLog(this.prisma, {
      userId: actorId,
      action: 'SETTINGS_AUTH_UPDATE',
      entity: 'Settings',
      severity: 'HIGH',
      metadata: JSON.stringify({
        ssoEnabled: next.ssoEnabled,
        ssoProvider: next.ssoProvider,
        oidc: strip(oidcRest),
        oidcSecretChanged: clientSecret !== undefined,
        ldap: strip(ldapRest),
        ldapPasswordChanged: bindPassword !== undefined,
        enforceSsoOnly: next.enforceSsoOnly,
      }),
    }).catch(() => undefined);
    return this.get();
  }

  // ─── OIDC: descoberta e emissão da URL de autorização ─────────────────────

  async resolveOidcDiscovery(settings: AuthSettings): Promise<OidcDiscovery> {
    const issuer = resolveOidcIssuer(settings);
    if (!issuer) throw new BadRequestException('SSO sem emissor OIDC configurado');
    const cached = this.discoveryCache.get(issuer);
    if (cached && Date.now() - cached.at < DISCOVERY_TTL_MS) return cached.doc;

    const url = `${issuer.replace(/\/$/, '')}/.well-known/openid-configuration`;
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) }).catch((err: unknown) => {
      throw new BadRequestException(
        `Não foi possível contactar o emissor OIDC: ${err instanceof Error ? err.message : String(err)}`,
      );
    });
    if (!res.ok) throw new BadRequestException(`Emissor OIDC devolveu HTTP ${res.status}`);
    const doc = (await res.json()) as OidcDiscovery;
    if (!doc.authorization_endpoint || !doc.token_endpoint) {
      throw new BadRequestException('Documento de descoberta OIDC incompleto');
    }
    this.discoveryCache.set(issuer, { at: Date.now(), doc });
    return doc;
  }

  resolveClientSecret(settings: AuthSettings): string {
    if (!settings.oidc.clientSecretEnc)
      throw new BadRequestException('SSO sem Client Secret configurado');
    return decryptSecret(settings.oidc.clientSecretEnc);
  }

  async testOidc() {
    const settings = await this.load();
    if (!settings.ssoProvider)
      throw new BadRequestException('Escolha um fornecedor de SSO primeiro');
    try {
      const doc = await this.resolveOidcDiscovery(settings);
      return { ok: true, issuer: doc.issuer, authorizationEndpoint: doc.authorization_endpoint };
    } catch (err: unknown) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  // ─── LDAP/AD ────────────────────────────────────────────────────────────────

  resolveLdapBindPassword(settings: AuthSettings): string {
    if (!settings.ldap.bindPasswordEnc) {
      throw new BadRequestException('LDAP sem password de serviço configurada');
    }
    return decryptSecret(settings.ldap.bindPasswordEnc);
  }

  /** Procura o utilizador no directório com a conta de serviço (sem validar a password dele). */
  async findLdapUser(
    settings: AuthSettings,
    email: string,
  ): Promise<{ dn: string; email: string; name: string } | null> {
    const { ldap } = settings;
    const client = new Client({ url: ldap.url, timeout: 10_000, connectTimeout: 10_000 });
    try {
      if (ldap.startTls) await client.startTLS();
      await client.bind(ldap.bindDn, this.resolveLdapBindPassword(settings));
      const { searchEntries } = await client.search(ldap.baseDn, {
        scope: 'sub',
        filter: renderLdapFilter(ldap.userFilter, email),
        attributes: [ldap.emailAttribute, ldap.nameAttribute],
        sizeLimit: 1,
      });
      const entry = searchEntries[0] as Record<string, unknown> | undefined;
      if (!entry) return null;
      const attr = (v: unknown): string =>
        Array.isArray(v) ? String(v[0] ?? '') : String(v ?? '');
      return {
        dn: String(entry.dn ?? ''),
        email: attr(entry[ldap.emailAttribute]) || email,
        name: attr(entry[ldap.nameAttribute]) || email,
      };
    } finally {
      await client.unbind().catch(() => undefined);
    }
  }

  /** Confirma a password do utilizador fazendo bind com o DN encontrado. */
  async verifyLdapCredentials(
    settings: AuthSettings,
    dn: string,
    password: string,
  ): Promise<boolean> {
    const client = new Client({ url: settings.ldap.url, timeout: 10_000, connectTimeout: 10_000 });
    try {
      if (settings.ldap.startTls) await client.startTLS();
      await client.bind(dn, password);
      return true;
    } catch {
      return false;
    } finally {
      await client.unbind().catch(() => undefined);
    }
  }

  async testLdap() {
    const settings = await this.load();
    if (!settings.ldap.url || !settings.ldap.baseDn) {
      throw new BadRequestException('Configure o LDAP primeiro');
    }
    const client = new Client({ url: settings.ldap.url, timeout: 10_000, connectTimeout: 10_000 });
    try {
      if (settings.ldap.startTls) await client.startTLS();
      await client.bind(settings.ldap.bindDn, this.resolveLdapBindPassword(settings));
      return { ok: true };
    } catch (err: unknown) {
      this.logger.warn({
        err: { message: err instanceof Error ? err.message : String(err) },
        msg: 'Falha ao testar a ligação LDAP',
      });
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    } finally {
      await client.unbind().catch(() => undefined);
    }
  }
}
