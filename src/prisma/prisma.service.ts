import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { readReplicas } from '@prisma/extension-read-replicas';
import { Pool } from 'pg';
import { PinoLogger } from 'nestjs-pino';
import { InjectMetric } from '@willsoto/nestjs-prometheus';
import { Histogram } from 'prom-client';
import { logQueryEvent, observeQueryDuration, PrismaQueryEvent } from './query-logging';

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

  constructor(
    private readonly pino: PinoLogger,
    @InjectMetric('prisma_query_duration_seconds')
    private readonly queryHistogram: Histogram<string>,
  ) {
    // ─── Primary (escrita) — mantém o comportamento e o pool actuais ───
    const writePool = makePool(
      process.env.DATABASE_URL,
      parseInt(process.env.DB_POOL_MAX || '50', 10),
    );
    super({
      adapter: new PrismaPg(writePool),
      log: [{ emit: 'event', level: 'query' }],
      // A10-1: hash da password nunca sai por omissão em nenhuma query (findUnique,
      // include, etc.). Os únicos pontos que precisam do hash (login, changePassword)
      // pedem-no explicitamente com `omit: { password: false }`.
      omit: { user: { password: true } },
    });

    // ─── Réplica (leitura) — opcional, controlada por feature flag ───
    const replicaUrl = process.env.DATABASE_REPLICA_URL;
    const useReplicas = process.env.USE_REPLICAS === 'true' && !!replicaUrl;

    if (useReplicas) {
      const readPool = makePool(replicaUrl, parseInt(process.env.DB_REPLICA_POOL_MAX || '10', 10));
      // `omit` muda o tipo de retorno genérico do client — o campo replicaClient
      // é tipado como PrismaClient "base" porque só é usado para o ciclo de vida
      // da ligação ($connect/$disconnect/$on); as queries passam por `this.db`,
      // que faz a ponte de tipos via `unknown` (readReplicas abaixo, em buildDbClient).
      this.replicaClient = new PrismaClient({
        adapter: new PrismaPg(readPool),
        log: [{ emit: 'event', level: 'query' }],
        omit: { user: { password: true } },
      }) as PrismaClient;
    } else {
      this.replicaClient = null;
    }

    this.db = this.buildDbClient();
    this.pino.setContext('PrismaService');
  }

  // $extends()/readReplicas() devolvem um tipo de client estendido que não é
  // nominalmente PrismaService (nem o PrismaClient de @prisma/client —
  // readReplicas espera o PrismaClient de @prisma/client/extension, uma
  // declaração distinta) — daí o `unknown` intermédio em vez de um cast
  // directo. `db`/`read` continuam a expor a mesma API em runtime, só o
  // tipo estático é que precisa desta ponte.
  private buildDbClient(): PrismaService {
    if (!this.replicaClient) {
      this.logger.warn(
        'Read replicas DESLIGADAS (USE_REPLICAS!=true ou sem DATABASE_REPLICA_URL) — ' +
          'todas as queries vão para o primary.',
      );
      // Sem réplica: devolve o próprio cliente; API idêntica, tudo no primary.
      return this.$extends({}) as unknown as PrismaService;
    }

    this.logger.log('Read replicas ACTIVAS — leituras encaminhadas para a réplica.');
    type ReplicaClient = Parameters<typeof readReplicas>[0]['replicas'][number];
    return this.$extends(
      readReplicas({ replicas: [this.replicaClient as unknown as ReplicaClient] }),
    ) as unknown as PrismaService;
  }

  async onModuleInit() {
    await this.$connect();
    if (this.replicaClient) {
      await this.replicaClient.$connect();
    }

    (this as { $on: (e: 'query', cb: (e: PrismaQueryEvent) => void) => void }).$on('query', e => {
      logQueryEvent(this.pino, e, this.slowQueryMs);
      observeQueryDuration(this.queryHistogram, e);
    });
    if (this.replicaClient) {
      (
        this.replicaClient as unknown as {
          $on: (e: 'query', cb: (e: PrismaQueryEvent) => void) => void;
        }
      ).$on('query', e => {
        logQueryEvent(this.pino, e, this.slowQueryMs);
        observeQueryDuration(this.queryHistogram, e);
      });
    }
  }

  async onModuleDestroy() {
    await this.$disconnect();
    if (this.replicaClient) {
      await this.replicaClient.$disconnect();
    }
  }
}
