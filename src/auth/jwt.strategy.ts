import { Injectable, Optional, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy, JwtFromRequestFunction } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import { runAsSystem } from '../common/rls/rls-context';
import { withFlatPermissions } from '../common/utils/role-permissions';
import { SessionRevocationService } from './session-revocation.service';
import { toSecretKeyObject } from './jwt-key';

// Extrai o JWT do cookie httpOnly 'token' (definido pelo backend no login).
const cookieExtractor: JwtFromRequestFunction = (req: Request) => {
  const cookies = (req?.cookies ?? {}) as Record<string, string | undefined>;
  return cookies.token ?? null;
};

/**
 * Constrói a lista de extractors JWT conforme a flag AUTH_ALLOW_BEARER (C4/A2-7).
 * - allowBearer=true  → cookie + Bearer header (default: Swagger e clientes legados)
 * - allowBearer=false → só cookie httpOnly (modo estrito de produção)
 */
export function buildJwtExtractors(allowBearer: boolean): JwtFromRequestFunction[] {
  const extractors: JwtFromRequestFunction[] = [cookieExtractor];
  if (allowBearer) extractors.push(ExtractJwt.fromAuthHeaderAsBearerToken());
  return extractors;
}

/**
 * Bearer em header é superfície extra (token em logs/JS). Em produção só é aceite se
 * AUTH_ALLOW_BEARER=true; fora dela mantém-se ligado por omissão (Swagger, testes).
 */
export function isBearerAllowed(env: NodeJS.ProcessEnv = process.env): boolean {
  if (env.AUTH_ALLOW_BEARER === 'true') return true;
  if (env.AUTH_ALLOW_BEARER === 'false') return false;
  return env.NODE_ENV !== 'production';
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  // Cache por utilizador para evitar ~6 queries (user + 4 relações) em cada
  // pedido autenticado. Staleness máximo = TTL (inferior ao tempo de vida do JWT).
  // `user` derivado do próprio retorno de loadUser() — evita `any` e mantém-se
  // sincronizado se a query `include` mudar.
  private readonly userCache = new Map<
    number,
    { user: Awaited<ReturnType<JwtStrategy['loadUser']>>; expiresAt: number; loadedAt: number }
  >();
  private readonly loading = new Map<number, ReturnType<JwtStrategy['loadUser']>>();
  private readonly cacheTtlMs = parseInt(process.env.JWT_USER_CACHE_TTL_MS || '30000', 10);

  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
    // Optional: specs/módulos sem CacheModule continuam a montar a estratégia.
    @Optional() private readonly revocation?: SessionRevocationService,
  ) {
    // Sem JWT_SECRET não há forma segura de verificar tokens — falhar alto no
    // arranque em vez de aceitar/rejeitar tokens de forma imprevisível.
    const jwtSecret = config.get<string>('JWT_SECRET');
    if (!jwtSecret) {
      throw new Error(
        'JWT_SECRET não está definido — recusado por segurança. Configure a variável de ambiente.',
      );
    }

    super({
      // Cookie httpOnly tem prioridade; Bearer desligável via AUTH_ALLOW_BEARER=false (A2-7).
      jwtFromRequest: ExtractJwt.fromExtractors(buildJwtExtractors(isBearerAllowed())),
      ignoreExpiration: false,
      // KeyObject pré-criado (ver jwt-key.ts); os tipos do passport-jwt só declaram string | Buffer.
      secretOrKey: toSecretKeyObject(jwtSecret) as unknown as Buffer,
    });
  }

  async validate(payload: { sub: number; email: string; iat?: number; jti?: string }) {
    if (this.revocation) {
      // Uma só viagem ao Redis para as três marcas (jti revogado, revokedBefore, staleSince).
      const marks = await this.revocation.getMarks(payload.jti, payload.sub);
      if (marks.jtiRevoked) {
        throw new UnauthorizedException('Sessão terminada');
      }
      if (marks.revokedBefore && payload.iat !== undefined && payload.iat < marks.revokedBefore) {
        throw new UnauthorizedException('Sessão revogada');
      }
      const entry = this.userCache.get(payload.sub);
      if (marks.staleSince && entry && entry.loadedAt <= marks.staleSince) {
        this.userCache.delete(payload.sub);
      }
    }
    const cached = this.userCache.get(payload.sub);
    const user =
      cached && cached.expiresAt > Date.now() ? cached.user : await this.loadUserOnce(payload.sub);

    // Access token emitido antes de uma alteração de senha é inválido.
    if (
      user.passwordChangedAt &&
      payload.iat &&
      payload.iat * 1000 < new Date(user.passwordChangedAt).getTime()
    ) {
      this.userCache.delete(payload.sub);
      throw new UnauthorizedException('Sessão expirada por alteração de senha');
    }
    return user;
  }

  /**
   * Single-flight por utilizador: um cliente que dispara vários pedidos em paralelo (uma página
   * faz 5-10 chamadas) com a cache expirada faria 5-10 × ~6 queries idênticas; assim fazem-se 6.
   */
  private loadUserOnce(sub: number) {
    let pending = this.loading.get(sub);
    if (!pending) {
      pending = this.loadUser(sub).finally(() => this.loading.delete(sub));
      this.loading.set(sub, pending);
    }
    return pending;
  }

  private async loadUser(sub: number) {
    // Ainda não há utilizador resolvido (é isto que o resolve): lookup de confiança, fora do RLS.
    const raw = await runAsSystem(() =>
      this.prisma.user.findUnique({
        where: { id: sub },
        include: {
          role: { include: { rolePermissions: { include: { permission: true } } } },
          unit: true,
          department: true,
          position: true,
        },
      }),
    );
    if (!raw || !raw.active) {
      this.userCache.delete(sub);
      throw new UnauthorizedException('Utilizador inativo ou não encontrado');
    }
    const user = { ...raw, role: withFlatPermissions(raw.role) };
    const now = Date.now();
    this.userCache.set(sub, { user, expiresAt: now + this.cacheTtlMs, loadedAt: now });
    return user;
  }
}
