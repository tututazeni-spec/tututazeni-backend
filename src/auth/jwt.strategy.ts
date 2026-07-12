import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy, JwtFromRequestFunction } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import { PrismaService } from '../prisma/prisma.service';

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

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  // Cache por utilizador para evitar ~6 queries (user + 4 relações) em cada
  // pedido autenticado. Staleness máximo = TTL (inferior ao tempo de vida do JWT).
  private readonly userCache = new Map<number, { user: any; expiresAt: number }>();
  private readonly cacheTtlMs = parseInt(process.env.JWT_USER_CACHE_TTL_MS || '30000', 10);

  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
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
      jwtFromRequest: ExtractJwt.fromExtractors(
        buildJwtExtractors(process.env.AUTH_ALLOW_BEARER !== 'false'),
      ),
      ignoreExpiration: false,
      secretOrKey: jwtSecret,
    });
  }

  async validate(payload: { sub: number; email: string; iat?: number }) {
    const cached = this.userCache.get(payload.sub);
    const user =
      cached && cached.expiresAt > Date.now() ? cached.user : await this.loadUser(payload.sub);

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

  private async loadUser(sub: number) {
    const user = await this.prisma.user.findUnique({
      where: { id: sub },
      include: {
        role: { include: { permissions: true } },
        unit: true,
        department: true,
        position: true,
      },
    });
    if (!user || !user.active) {
      this.userCache.delete(sub);
      throw new UnauthorizedException('Utilizador inativo ou não encontrado');
    }
    this.userCache.set(sub, { user, expiresAt: Date.now() + this.cacheTtlMs });
    return user;
  }
}
