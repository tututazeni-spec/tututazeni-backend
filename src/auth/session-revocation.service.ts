import { Injectable } from '@nestjs/common';
import { CacheService } from '../cache/cache.service';

// Vida máxima de um access token (15 min) + folga: as marcas expiram sozinhas depois disto.
const MARK_TTL_SECONDS = 16 * 60;

/**
 * Revogação de sessões em Redis (partilhado entre instâncias), para que logout, desativação e
 * alteração de papel tenham efeito imediato mesmo com JWT stateless e cache de utilizador por
 * processo. Redis indisponível → CacheService devolve null (fail-open, registado em log).
 */
@Injectable()
export class SessionRevocationService {
  constructor(private readonly cache: CacheService) {}

  private jtiKey = (jti: string) => `auth:revoked-jti:${jti}`;
  private revokedKey = (userId: number) => `auth:revoked-before:${userId}`;
  private staleKey = (userId: number) => `auth:user-stale:${userId}`;

  async revokeAccessToken(jti: string, ttlSeconds: number): Promise<void> {
    if (ttlSeconds <= 0) return;
    await this.cache.set(this.jtiKey(jti), true, ttlSeconds);
  }

  async isAccessTokenRevoked(jti: string): Promise<boolean> {
    return (await this.cache.get<boolean>(this.jtiKey(jti))) === true;
  }

  /** Rejeita todos os access tokens do utilizador emitidos antes deste instante (segundos). */
  async revokeAllUserSessions(userId: number): Promise<void> {
    await this.cache.set(this.revokedKey(userId), Math.floor(Date.now() / 1000), MARK_TTL_SECONDS);
  }

  async revokedBefore(userId: number): Promise<number | null> {
    return this.cache.get<number>(this.revokedKey(userId));
  }

  /** Obriga todas as instâncias a recarregar o utilizador (papel/estado mudou). */
  async invalidateUserCache(userId: number): Promise<void> {
    await this.cache.set(this.staleKey(userId), Date.now(), MARK_TTL_SECONDS);
  }

  async staleSince(userId: number): Promise<number | null> {
    return this.cache.get<number>(this.staleKey(userId));
  }
}
