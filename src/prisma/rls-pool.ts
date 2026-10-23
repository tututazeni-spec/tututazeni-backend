import { Pool, PoolClient, PoolConfig } from 'pg';
import { currentRlsSettings } from '../common/rls/rls-context';

type QueryArg = string | { text?: string } | undefined;

const PATCHED = Symbol('rlsPatched');
const BEGIN_RE = /^\s*BEGIN\b/i;
const END_RE = /^\s*(COMMIT|ROLLBACK|END)\b/i;
const SET_TX_RE = /^\s*SET\s+TRANSACTION\b/i;

function queryText(arg: QueryArg): string {
  return typeof arg === 'string' ? arg : (arg?.text ?? '');
}

/**
 * SQL que fixa a identidade da transacção. set_config(..., true) é local à transacção,
 * por isso é seguro com PgBouncer em modo `transaction`. Os valores são inteiros ou
 * 'on'/'off' gerados aqui — nunca texto do utilizador.
 */
function settingsSql(): string {
  const { userId, privileged } = currentRlsSettings();
  return `SELECT set_config('app.user_id','${userId}',true), set_config('app.privileged','${privileged ? 'on' : 'off'}',true)`;
}

interface TxState {
  pendingSettings: string | null;
}

/**
 * Pool que aplica o contexto RLS a cada query. Queries soltas correm em
 * BEGIN + set_config + query + COMMIT; transacções interactivas do Prisma recebem o
 * set_config logo a seguir ao BEGIN (e ao SET TRANSACTION ISOLATION LEVEL, que tem de
 * ser a primeira instrução).
 */
export class RlsPool extends Pool {
  constructor(config: PoolConfig) {
    super(config);
  }

  // O adaptador pg do Prisma só usa a forma com promise.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  query(...args: any[]): any {
    const first = args[0] as QueryArg;
    if (typeof args[args.length - 1] === 'function') {
      return (super.query as (...a: unknown[]) => unknown)(...args);
    }
    return this.queryWithContext(first, args);
  }

  private async queryWithContext(_first: QueryArg, args: unknown[]) {
    const client: PoolClient = await super.connect();
    let broken: Error | undefined;
    try {
      await client.query(`BEGIN; ${settingsSql()}`);
      const result = await (client.query as (...a: unknown[]) => Promise<unknown>).apply(
        client,
        args,
      );
      await client.query('COMMIT');
      return result;
    } catch (err) {
      // só descarta a ligação se o ROLLBACK também falhar (ligação partida)
      await client.query('ROLLBACK').catch((e: Error) => {
        broken = e;
      });
      throw err;
    } finally {
      client.release(broken);
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  connect(...args: any[]): any {
    if (typeof args[0] === 'function') {
      return (super.connect as (...a: unknown[]) => unknown)(...args);
    }
    return (super.connect() as Promise<PoolClient>).then(client => this.patch(client));
  }

  private patch(client: PoolClient): PoolClient {
    const c = client as PoolClient & { [PATCHED]?: TxState };
    if (c[PATCHED]) return client;
    const state: TxState = { pendingSettings: null };
    c[PATCHED] = state;
    const original = client.query.bind(client) as (...a: unknown[]) => Promise<unknown>;

    (client as unknown as { query: (...a: unknown[]) => Promise<unknown> }).query = async (
      ...a: unknown[]
    ) => {
      const text = queryText(a[0] as QueryArg);
      if (BEGIN_RE.test(text)) {
        // contexto capturado aqui: ainda estamos na cadeia assíncrona do pedido
        state.pendingSettings = settingsSql();
        return original(...a);
      }
      if (END_RE.test(text)) state.pendingSettings = null;
      else if (state.pendingSettings && !SET_TX_RE.test(text)) {
        const sql = state.pendingSettings;
        state.pendingSettings = null;
        await original(sql);
      }
      return original(...a);
    };
    return client;
  }
}
