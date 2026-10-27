import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { readReplicas } from '@prisma/extension-read-replicas';
import { Pool } from 'pg';
import { PinoLogger } from 'nestjs-pino';
import { InjectMetric } from '@willsoto/nestjs-prometheus';
import { Histogram } from 'prom-client';
import { RlsPool } from './rls-pool';
import { logQueryEvent, observeQueryDuration, PrismaQueryEvent } from './query-logging';
import { evaluatePoolBudget } from './pool-budget';

/**
 * RLS_ENABLED=true: a app liga-se com a role innova_app (sem BYPASSRLS) e cada transacção
 * recebe app.user_id/app.privileged (ver ops/db/rls/README.md). Desligado = comportamento antigo.
 */
const rlsEnabled = (): boolean => process.env.RLS_ENABLED === 'true';

/**
 * Com DB_SSL_CA (PEM do CA do Postgres gerido) o certificado do servidor é validado.
 * Sem ele mantém-se o comportamento antigo (cifra sem validar a identidade) — definir DB_SSL_CA em produção.
 */
function sslOptions(): { ca?: string; rejectUnauthorized: boolean } {
  const ca = process.env.DB_SSL_CA?.replace(/\\n/g, '\n');
  return ca ? { ca, rejectUnauthorized: true } : { rejectUnauthorized: false };
}

function makePool(connectionString: string | undefined, max: number, tls = true): Pool {
  const PoolImpl = rlsEnabled() ? RlsPool : Pool;
  return new PoolImpl({
    connectionString,
    ssl: tls && process.env.NODE_ENV === 'production' ? sslOptions() : false,
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
    // Com PgBouncer (DATABASE_POOLER_URL) o tráfego da app passa pelo pooler, dentro
    // da rede Docker (sem TLS). O `migrate` continua a usar DATABASE_URL directo.
    // Com RLS a app usa DATABASE_APP_URL (role innova_app); migrate/backups continuam no owner.
    const appUrl = rlsEnabled() ? process.env.DATABASE_APP_URL : undefined;
    if (rlsEnabled() && !appUrl) {
      throw new Error('RLS_ENABLED=true exige DATABASE_APP_URL (role innova_app, sem BYPASSRLS).');
    }
    const poolerUrl = rlsEnabled() ? undefined : process.env.DATABASE_POOLER_URL;
    const writePoolMax = parseInt(process.env.DB_POOL_MAX || '50', 10);
    const writePool = makePool(
      appUrl || poolerUrl || process.env.DATABASE_URL,
      writePoolMax,
      !poolerUrl && !(appUrl && /@pgbouncer[:/]/.test(appUrl)),
    );
    super({
      adapter: new PrismaPg(writePool),
      log: [{ emit: 'event', level: 'query' }],
      // A10-1: hash da password nunca sai por omissão em nenhuma query (findUnique,
      // include, etc.). Os únicos pontos que precisam do hash (login, changePassword)
      // pedem-no explicitamente com `omit: { password: false }`.
      omit: { user: { password: true, twoFactorSecret: true } },
    });

    this.warmPools = [writePool];
    this.writePoolMax = writePoolMax;
    // Com PgBouncer as ligações ao Postgres são do pooler, não deste processo: nada a verificar aqui.
    this.behindPooler = !!poolerUrl || !!(appUrl && /@pgbouncer[:/]/.test(appUrl));

    // ─── Réplica (leitura) — opcional, controlada por feature flag ───
    const replicaUrl = rlsEnabled()
      ? process.env.DATABASE_REPLICA_APP_URL
      : process.env.DATABASE_REPLICA_URL;
    const useReplicas = process.env.USE_REPLICAS === 'true' && !!replicaUrl;

    if (useReplicas) {
      const readPool = makePool(replicaUrl, parseInt(process.env.DB_REPLICA_POOL_MAX || '10', 10));
      // `omit` muda o tipo de retorno genérico do client — o campo replicaClient
      // é tipado como PrismaClient "base" porque só é usado para o ciclo de vida
      // da ligação ($connect/$disconnect/$on); as queries passam por `this.db`,
      // que faz a ponte de tipos via `unknown` (readReplicas abaixo, em buildDbClient).
      this.warmPools.push(readPool);
      this.replicaClient = new PrismaClient({
        adapter: new PrismaPg(readPool),
        log: [{ emit: 'event', level: 'query' }],
        omit: { user: { password: true, twoFactorSecret: true } },
      }) as PrismaClient;
    } else {
      this.replicaClient = null;
    }

    this.db = this.buildDbClient();
    this.pino.setContext('PrismaService');
  }

  /** Pools a pré-aquecer no arranque (primary; a réplica junta-se se existir). */
  private readonly warmPools: Pool[];
  private readonly writePoolMax: number;
  private readonly behindPooler: boolean;

  /**
   * Compara o pool desta instância com o `max_connections` real do Postgres (ver pool-budget.ts).
   * Só regista: um orçamento mal dimensionado deve ser visível no arranque, nunca impedi-lo.
   */
  private async checkConnectionBudget() {
    if (this.behindPooler) return;
    try {
      const [row] = await this.$queryRaw<{ max: number; reserved: number; used: number }[]>`
        SELECT current_setting('max_connections')::int AS max,
               current_setting('superuser_reserved_connections')::int AS reserved,
               (SELECT count(*)::int FROM pg_stat_activity
                 WHERE backend_type = 'client backend' AND pid <> pg_backend_pid()) AS used`;
      if (!row) return;
      const budget = evaluatePoolBudget({
        poolMax: this.writePoolMax,
        serverMax: row.max,
        reserved: row.reserved,
        othersInUse: row.used,
      });
      if (budget.level === 'error') this.logger.error(budget.message);
      else if (budget.level === 'warn') this.logger.warn(budget.message);
      else this.logger.log(budget.message);
    } catch (err: unknown) {
      const reason = err instanceof Error ? err.message : 'erro desconhecido';
      this.logger.warn(`Não foi possível verificar o orçamento de ligações: ${reason}`);
    }
  }

  /**
   * Abre várias ligações em paralelo antes do primeiro tick de cron (o fan-out do
   * tick de alertas de scalability é ~40 queries, por isso 40 e não 10). Sem isto o
   * primeiro fan-out (~40 queries em simultâneo) paga o handshake TCP/SCRAM de
   * cada ligação nova e todas aparecem como "slow query" (700–1500 ms) mesmo
   * sendo triviais.
   */
  private async warmUpPools(size = 40) {
    await Promise.all(
      this.warmPools.map(async pool => {
        const n = Math.min(size, pool.options.max ?? size);
        const clients = await Promise.all(
          Array.from({ length: n }, () => pool.connect().catch((): null => null)),
        );
        await Promise.all(clients.map(c => c?.query('SELECT 1').catch((): undefined => undefined)));
        clients.forEach(c => c?.release());
      }),
    ).catch((): undefined => undefined);
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

  /**
   * Com RLS_ENABLED a ligação TEM de ser uma role sem superuser/BYPASSRLS — caso contrário o
   * Postgres ignora todas as policies e o RLS fica activo só no papel.
   */
  private async assertRlsRoleIsRestricted() {
    if (!rlsEnabled()) {
      await this.assertNotSuperuserInProduction();
      return;
    }
    const rows = await this.$queryRawUnsafe<{ current_user: string; bypass: boolean }[]>(
      'SELECT current_user, (rolsuper OR rolbypassrls) AS bypass FROM pg_roles WHERE rolname = current_user',
    );
    const row = rows[0];
    if (row?.bypass) {
      const msg = `RLS_ENABLED=true mas a role "${row.current_user}" ignora RLS (superuser/BYPASSRLS). Use innova_app em DATABASE_APP_URL.`;
      if (process.env.NODE_ENV === 'production') throw new Error(msg);
      this.logger.error(msg);
    } else {
      this.logger.log(`RLS activo: ligado como "${row?.current_user}" (sem BYPASSRLS).`);
    }
  }

  /**
   * Menor privilégio: em produção a app não pode correr como superuser (um SQL injection ou
   * credencial vazada daria acesso total ao servidor). `ALLOW_SUPERUSER_DB=true` é uma válvula
   * de emergência explícita, não uma configuração normal.
   */
  private async assertNotSuperuserInProduction() {
    if (process.env.NODE_ENV !== 'production') return;
    const rows = await this.$queryRawUnsafe<{ current_user: string; rolsuper: boolean }[]>(
      'SELECT current_user, rolsuper FROM pg_roles WHERE rolname = current_user',
    );
    const row = rows[0];
    if (!row?.rolsuper) return;
    const msg = `A app está ligada à BD como superuser "${row.current_user}" — usar uma role sem SUPERUSER (ver ops/db/rls/README.md).`;
    if (process.env.ALLOW_SUPERUSER_DB === 'true') {
      this.logger.error(`${msg} (ALLOW_SUPERUSER_DB=true: a continuar)`);
      return;
    }
    throw new Error(msg);
  }

  async onModuleInit() {
    await this.$connect();
    await this.assertRlsRoleIsRestricted();
    if (this.replicaClient) {
      await this.replicaClient.$connect();
    }
    // Antes do warm-up: depois dele as ligações que este processo abre contariam como "de outros".
    await this.checkConnectionBudget();
    await this.warmUpPools();

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
