// src/common/files/verdict-cache.ts
// Cache dos veredictos da verificação de ficheiros remotos. Evita descarregar e re-analisar de
// cada vez que um registo é editado com o mesmo `fileUrl`, e torna barato o job periódico:
// a revalidação é um GET condicional (If-None-Match / If-Modified-Since) e o storage responde
// 304 sem corpo se o ficheiro não mudou.
//
// Guarda-se o veredicto DEFINITIVO (limpo ou rejeitado), nunca falhas de rede nem verificações
// que o antivírus não concluiu. A chave é o hash de host+caminho (sem a query: URLs assinados
// mudam a cada pedido); o ETag/Last-Modified garante que um ficheiro substituído é revisto.
//
// Backend: Redis (partilhado pelas instâncias da aplicação) quando disponível; senão memória.
// Qualquer erro do Redis degrada para "sem cache": nunca falha um upload.
import { createHash } from 'crypto';
import Redis from 'ioredis';

/** Tabelas com id inteiro (autoincrement) e com id de texto (cuid/uuid) convivem no catálogo. */
export type CursorValue = string | number | null;

export interface FileValidators {
  etag?: string;
  lastModified?: string;
  length?: number;
}

export interface CachedVerdict {
  validators: FileValidators;
  /** null = ficheiro limpo; texto = motivo da rejeição. */
  rejection: string | null;
  /** O antivírus estava ligado e concluiu: um "limpo" sem scan não vale com o antivírus ligado. */
  scanned: boolean;
  checkedAt: number;
}

export interface VerdictCache {
  get(key: string): Promise<CachedVerdict | null>;
  set(key: string, verdict: CachedVerdict, ttlSeconds: number): Promise<void>;
  /** Marca a chave se ainda não estava marcada (SET NX). Devolve true se foi esta chamada. */
  markOnce(key: string, ttlSeconds: number): Promise<boolean>;
  /** Cursor persistido do job periódico: o último `id` visto (número ou texto), null = do início. */
  getCursor(key: string): Promise<CursorValue>;
  setCursor(key: string, value: CursorValue): Promise<void>;
  /** Trava de exclusão entre instâncias. Devolve a função que a liberta, ou null se está tomada. */
  lock(key: string, ttlSeconds: number): Promise<(() => Promise<void>) | null>;
}

/** hash de host+caminho: a query pode ser uma assinatura temporária. */
export function verdictKey(rawUrl: string): string {
  const u = new URL(rawUrl);
  return createHash('sha256').update(`${u.hostname.toLowerCase()}${u.pathname}`).digest('hex');
}

// ─── Memória ─────────────────────────────────────────────────────────────────

export class MemoryVerdictCache implements VerdictCache {
  private readonly store = new Map<string, { value: unknown; expires: number }>();

  constructor(
    private readonly maxEntries = 5000,
    private readonly now: () => number = Date.now,
  ) {}

  private read<T>(key: string): T | null {
    const hit = this.store.get(key);
    if (!hit) return null;
    if (hit.expires <= this.now()) {
      this.store.delete(key);
      return null;
    }
    return hit.value as T;
  }

  private write(key: string, value: unknown, ttlSeconds: number): void {
    this.store.delete(key); // reinsere no fim: Map mantém a ordem de inserção (LRU simples)
    this.store.set(key, { value, expires: this.now() + ttlSeconds * 1000 });
    while (this.store.size > this.maxEntries) {
      const oldest = this.store.keys().next().value as string;
      this.store.delete(oldest);
    }
  }

  get(key: string): Promise<CachedVerdict | null> {
    return Promise.resolve(this.read<CachedVerdict>(`v:${key}`));
  }
  set(key: string, verdict: CachedVerdict, ttlSeconds: number): Promise<void> {
    this.write(`v:${key}`, verdict, ttlSeconds);
    return Promise.resolve();
  }
  markOnce(key: string, ttlSeconds: number): Promise<boolean> {
    if (this.read(`m:${key}`) !== null) return Promise.resolve(false);
    this.write(`m:${key}`, 1, ttlSeconds);
    return Promise.resolve(true);
  }
  getCursor(key: string): Promise<CursorValue> {
    return Promise.resolve(this.read<{ v: CursorValue }>(`c:${key}`)?.v ?? null);
  }
  setCursor(key: string, value: CursorValue): Promise<void> {
    this.write(`c:${key}`, { v: value }, 30 * 24 * 3600);
    return Promise.resolve();
  }
  lock(key: string, ttlSeconds: number): Promise<(() => Promise<void>) | null> {
    if (this.read(`l:${key}`) !== null) return Promise.resolve(null);
    this.write(`l:${key}`, 1, ttlSeconds);
    return Promise.resolve(() => {
      this.store.delete(`l:${key}`);
      return Promise.resolve();
    });
  }
}

// ─── Redis ───────────────────────────────────────────────────────────────────

/** O subconjunto do ioredis que usamos (permite um fake nos testes). */
export interface KeyValueClient {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ...args: Array<string | number>): Promise<unknown>;
  del(key: string): Promise<unknown>;
}

const PREFIX = 'innova:remote-file:';

export class RedisVerdictCache implements VerdictCache {
  constructor(private readonly client: KeyValueClient) {}

  private async safe<T>(fallback: T, fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch {
      return fallback; // Redis em baixo => sem cache, nunca um erro para o utilizador
    }
  }

  get(key: string): Promise<CachedVerdict | null> {
    return this.safe<CachedVerdict | null>(null, async () => {
      const raw = await this.client.get(`${PREFIX}v:${key}`);
      return raw ? (JSON.parse(raw) as CachedVerdict) : null;
    });
  }
  set(key: string, verdict: CachedVerdict, ttlSeconds: number): Promise<void> {
    return this.safe<void>(undefined, async () => {
      await this.client.set(`${PREFIX}v:${key}`, JSON.stringify(verdict), 'EX', ttlSeconds);
    });
  }
  markOnce(key: string, ttlSeconds: number): Promise<boolean> {
    // Redis em baixo => true: prefere-se um aviso repetido a perder um aviso.
    return this.safe(true, async () => {
      const r = await this.client.set(`${PREFIX}m:${key}`, '1', 'EX', ttlSeconds, 'NX');
      return r === 'OK';
    });
  }
  getCursor(key: string): Promise<CursorValue> {
    return this.safe<CursorValue>(null, async () => {
      const raw = await this.client.get(`${PREFIX}c:${key}`);
      return raw === null ? null : (JSON.parse(raw) as CursorValue);
    });
  }
  setCursor(key: string, value: CursorValue): Promise<void> {
    return this.safe<void>(undefined, async () => {
      await this.client.set(`${PREFIX}c:${key}`, JSON.stringify(value), 'EX', 30 * 24 * 3600);
    });
  }
  lock(key: string, ttlSeconds: number): Promise<(() => Promise<void>) | null> {
    // Redis em baixo => corre sem trava (melhor duplicar trabalho idempotente que não correr).
    return this.safe<(() => Promise<void>) | null>(
      async () => undefined,
      async () => {
        const k = `${PREFIX}l:${key}`;
        const r = await this.client.set(k, '1', 'EX', ttlSeconds, 'NX');
        if (r !== 'OK') return null;
        return async () => {
          await this.safe(undefined, () => this.client.del(k).then(() => undefined));
        };
      },
    );
  }
}

// ─── Instância partilhada ────────────────────────────────────────────────────

let shared: VerdictCache | undefined;

function createRedisClient(env: NodeJS.ProcessEnv): Redis {
  const client = new Redis({
    host: env.REDIS_HOST ?? '127.0.0.1',
    port: Number(env.REDIS_PORT) || 6379,
    password: env.REDIS_PASSWORD || undefined,
    lazyConnect: true,
    // Falhar depressa: o cache é uma optimização, não pode atrasar nem bloquear um pedido.
    enableOfflineQueue: false,
    maxRetriesPerRequest: 1,
    connectTimeout: 1000,
    commandTimeout: 1000,
    retryStrategy: times => Math.min(times * 500, 5000),
  });
  client.on('error', () => undefined); // erros chegam a cada comando; não rebentar o processo
  void client.connect().catch(() => undefined);
  return client;
}

export function getVerdictCache(env: NodeJS.ProcessEnv = process.env): VerdictCache {
  if (!shared) {
    // Em testes unitários não se liga ao Redis: memória, determinística e sem I/O.
    shared =
      env.NODE_ENV === 'test' && env.REMOTE_FILE_CACHE !== 'redis'
        ? new MemoryVerdictCache()
        : new RedisVerdictCache(createRedisClient(env) as unknown as KeyValueClient);
  }
  return shared;
}

/** Substitui a instância partilhada (testes) ou repõe o comportamento por omissão (`undefined`). */
export function setVerdictCache(cache: VerdictCache | undefined): void {
  shared = cache;
}
