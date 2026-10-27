/**
 * Orçamento de ligações ao Postgres: verifica no arranque se o(s) pool(s) desta instância cabem
 * no `max_connections` do servidor, tendo em conta as ligações que outros clientes já ocupam
 * (outras instâncias da app, migrações, psql, ...).
 *
 * Porquê: cada instância abre até DB_POOL_MAX ligações (50 por omissão). Com 2 instâncias atrás do
 * Caddy isso já são 100 = o `max_connections` por omissão do Postgres, e o sintoma ("too many
 * clients already") aparece em pedidos sem relação com a causa. Falhar cedo e de forma legível
 * é mais barato do que diagnosticá-lo em produção.
 */

export interface PoolBudgetInput {
  /** Soma dos `max` dos pools desta instância (primary + réplica se for o mesmo servidor). */
  poolMax: number;
  /** `SHOW max_connections` do servidor. */
  serverMax: number;
  /** Ligações já abertas ao servidor por OUTROS clientes (exclui esta instância). */
  othersInUse: number;
  /** Ligações reservadas a superutilizadores (`superuser_reserved_connections`, 3 por omissão). */
  reserved?: number;
}

export interface PoolBudgetResult {
  level: 'ok' | 'warn' | 'error';
  /** Ligações que esta instância ainda pode abrir sem exceder o servidor. */
  available: number;
  message: string;
}

/** Acima desta fracção do servidor ocupada em pico o aviso dispara (deixa folga para migrações/psql). */
const WARN_RATIO = 0.8;

export function evaluatePoolBudget(input: PoolBudgetInput): PoolBudgetResult {
  const { poolMax, serverMax, othersInUse, reserved = 3 } = input;
  const usable = Math.max(serverMax - reserved, 0);
  const available = usable - othersInUse;
  const peak = poolMax + othersInUse;

  if (poolMax > available) {
    return {
      level: 'error',
      available,
      message:
        `Pool de ${poolMax} ligações não cabe no Postgres: max_connections=${serverMax} ` +
        `(${reserved} reservadas), ${othersInUse} já em uso por outros clientes → só há ${available} ` +
        `livres. Reduza DB_POOL_MAX, ponha um PgBouncer à frente (DATABASE_POOLER_URL) ou suba ` +
        `max_connections.`,
    };
  }
  if (peak > usable * WARN_RATIO) {
    return {
      level: 'warn',
      available,
      message:
        `Pool de ${poolMax} + ${othersInUse} ligações de outros clientes = ${peak} de ` +
        `${usable} utilizáveis (>${Math.round(WARN_RATIO * 100)}%). Uma segunda instância ` +
        `com o mesmo DB_POOL_MAX esgotaria o servidor; considere reduzir DB_POOL_MAX.`,
    };
  }
  return {
    level: 'ok',
    available,
    message: `Pool de ${poolMax} ligações cabe no Postgres (${peak}/${usable} utilizáveis em pico).`,
  };
}
