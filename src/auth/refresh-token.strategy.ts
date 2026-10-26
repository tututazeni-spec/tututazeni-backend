// src/auth/refresh-token.strategy.ts
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy, JwtFromRequestFunction } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import { toSecretKeyObject } from './jwt-key';

export const refreshCookieExtractor: JwtFromRequestFunction = (req: Request) => {
  const cookies = (req?.cookies ?? {}) as Record<string, string | undefined>;
  return cookies.refresh_token ?? null;
};

@Injectable()
export class RefreshTokenStrategy extends PassportStrategy(Strategy, 'jwt-refresh') {
  constructor(config: ConfigService) {
    const secret = config.get<string>('JWT_REFRESH_SECRET');
    if (!secret) {
      throw new Error(
        'JWT_REFRESH_SECRET não está definido — recusado por segurança. Configure a variável de ambiente.',
      );
    }
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([refreshCookieExtractor]),
      ignoreExpiration: false,
      // KeyObject pré-criado (ver jwt-key.ts); os tipos do passport-jwt só declaram string | Buffer.
      secretOrKey: toSecretKeyObject(secret) as unknown as Buffer,
      passReqToCallback: true,
    });
  }

  async validate(req: Request, payload: { sub: number; email: string }) {
    const token = refreshCookieExtractor(req);
    if (!token) throw new UnauthorizedException('Refresh token ausente');
    return { id: payload.sub, email: payload.email, refreshToken: token };
  }
}
