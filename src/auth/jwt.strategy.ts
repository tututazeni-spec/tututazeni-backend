import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';

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
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get<string>('JWT_SECRET'),
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
