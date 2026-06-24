import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy, JwtFromRequestFunction } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import { PrismaService } from '../prisma/prisma.service';

// Extrai o JWT do cookie httpOnly 'token' (definido pelo backend no login).
// Mantém-se o fallback para o header Authorization: Bearer (compatibilidade).
const cookieExtractor: JwtFromRequestFunction = (req: Request) => {
  const cookies = (req?.cookies ?? {}) as Record<string, string | undefined>;
  return cookies.token ?? null;
};

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  // Cache por utilizador para evitar ~6 queries (user + 4 relações) em cada
  // pedido autenticado. Staleness máximo = TTL (inferior ao tempo de vida do JWT).
  private readonly userCache = new Map<number, { user: any; expiresAt: number }>();
  private readonly cacheTtlMs = parseInt(process.env.JWT_USER_CACHE_TTL_MS || '60000', 10);

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
      // Cookie httpOnly tem prioridade; header Bearer mantém-se como fallback
      // (compatibilidade com Swagger e clientes que ainda enviam o header).
      jwtFromRequest: ExtractJwt.fromExtractors([
        cookieExtractor,
        ExtractJwt.fromAuthHeaderAsBearerToken(),
      ]),
      ignoreExpiration: false,
      secretOrKey: jwtSecret,
    });
  }

  async validate(payload: { sub: number; email: string }) {
    const cached = this.userCache.get(payload.sub);
    if (cached && cached.expiresAt > Date.now()) return cached.user;

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      include: {
        role: { include: { permissions: true } },
        unit: true,
        department: true,
        position: true,
      },
    });
    if (!user || !user.active) {
      this.userCache.delete(payload.sub);
      throw new UnauthorizedException('Utilizador inativo ou não encontrado');
    }
    this.userCache.set(payload.sub, { user, expiresAt: Date.now() + this.cacheTtlMs });
    return user;
  }
}
