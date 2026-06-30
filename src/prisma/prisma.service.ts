import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { readReplicas } from '@prisma/extension-read-replicas';
import { Pool } from 'pg';
import { PinoLogger } from 'nestjs-pino';
import { logQueryEvent, PrismaQueryEvent } from './query-logging';

function makePool(connectionString: string | undefined, max: number): Pool {
  return new Pool({
    connectionString,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
    max,
    idleTimeoutMillis: 600000,
    connectionTimeoutMillis: 30000,
  });
}

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  /**
   * Cliente separado para a réplica de leitura (só existe se USE_REPLICAS=true).
   * Mantido para gerir o ciclo de vida (connect/disconnect) explicitamente.
   */
  private readonly replicaClient: PrismaClient | null;

  /**
   * Cliente a usar nos serviços/repositórios. Faz routing automático:
   *   - leituras (findMany, findUnique, count, ...) -> réplica (slave)
   *   - escritas (create, update, delete, transacções) -> primary (master)
   * Use `this.prisma.db.modelo.findMany()` para tirar partido da réplica.
   * Para read-after-write force o primary: `this.prisma.db.$primary().modelo.findFirst()`.
   *
   * Retrocompatível: `this.prisma.modelo.*` continua a funcionar (sempre no primary).
   */
  public readonly db: ReturnType<PrismaService['buildDbClient']>;

  /**
   * Cliente de leitura: réplica quando activa, senão o primary.
   * Centraliza o getter que estava duplicado em ~65 serviços
   * (`(this.prisma as any).db ?? this.prisma`). Usar `this.prisma.read.modelo.*`.
   */
  get read(): PrismaService {
    return ((this as unknown as { db?: PrismaService }).db ?? this) as PrismaService;
  }

  private readonly slowQueryMs = parseInt(process.env.SLOW_QUERY_MS || '500', 10);

  constructor(private readonly pino: PinoLogger) {
    // ─── Primary (escrita) — mantém o comportamento e o pool actuais ───
    const writePool = makePool(
      process.env.DATABASE_URL,
      parseInt(process.env.DB_POOL_MAX || '50', 10),
    );
    super({
      adapter: new PrismaPg(writePool),
      log: [{ emit: 'event', level: 'query' }],
    });

    // ─── Réplica (leitura) — opcional, controlada por feature flag ───
    const replicaUrl = process.env.DATABASE_REPLICA_URL;
    const useReplicas = process.env.USE_REPLICAS === 'true' && !!replicaUrl;

    if (useReplicas) {
      const readPool = makePool(replicaUrl, parseInt(process.env.DB_REPLICA_POOL_MAX || '10', 10));
      this.replicaClient = new PrismaClient({
        adapter: new PrismaPg(readPool),
        log: [{ emit: 'event', level: 'query' }],
      });
    } else {
      this.replicaClient = null;
    }

    this.db = this.buildDbClient();
    this.pino.setContext('PrismaService');
  }

  private buildDbClient() {
    if (!this.replicaClient) {
      this.logger.warn(
        'Read replicas DESLIGADAS (USE_REPLICAS!=true ou sem DATABASE_REPLICA_URL) — ' +
          'todas as queries vão para o primary.',
      );
      // Sem réplica: devolve o próprio cliente; API idêntica, tudo no primary.
      return this.$extends({}) as any;
    }

    this.logger.log('Read replicas ACTIVAS — leituras encaminhadas para a réplica.');
    return this.$extends(readReplicas({ replicas: [this.replicaClient as any] })) as any;
  }

  async onModuleInit() {
    await this.$connect();
    if (this.replicaClient) {
      await this.replicaClient.$connect();
    }

    (this as { $on: (e: 'query', cb: (e: PrismaQueryEvent) => void) => void }).$on('query', e =>
      logQueryEvent(this.pino, e, this.slowQueryMs),
    );
    if (this.replicaClient) {
      (
        this.replicaClient as unknown as {
          $on: (e: 'query', cb: (e: PrismaQueryEvent) => void) => void;
        }
      ).$on('query', e => logQueryEvent(this.pino, e, this.slowQueryMs));
    }
  }

  async onModuleDestroy() {
    await this.$disconnect();
    if (this.replicaClient) {
      await this.replicaClient.$disconnect();
    }
  }
}
