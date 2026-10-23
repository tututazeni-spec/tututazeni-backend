import { Pool } from 'pg';
import { runAsSystem, runWithRls, setRlsPrivileged, setRlsUser } from '../common/rls/rls-context';
import { RlsPool } from './rls-pool';

function fakeClient() {
  const calls: string[] = [];
  const client = {
    calls,
    query: jest.fn(async (arg: string | { text: string }) => {
      calls.push(typeof arg === 'string' ? arg : arg.text);
      return { rows: [], rowCount: 0 };
    }),
    release: jest.fn(),
  };
  return client;
}

describe('RlsPool', () => {
  let client: ReturnType<typeof fakeClient>;
  let pool: RlsPool;

  beforeEach(() => {
    client = fakeClient();
    jest
      .spyOn(Pool.prototype, 'connect')
      .mockImplementation((() => Promise.resolve(client)) as never);
    pool = new RlsPool({ connectionString: 'postgresql://x@localhost/x' });
  });
  afterEach(() => jest.restoreAllMocks());

  it('query solta corre em BEGIN + set_config + query + COMMIT com o utilizador do pedido', async () => {
    await runWithRls(async () => {
      setRlsUser(1008, 'COLABORADOR');
      await pool.query({ text: 'SELECT 1', values: [] });
    });
    expect(client.calls[0]).toContain('BEGIN;');
    expect(client.calls[0]).toContain("set_config('app.user_id','1008',true)");
    expect(client.calls[0]).toContain("set_config('app.privileged','off',true)");
    expect(client.calls[1]).toBe('SELECT 1');
    expect(client.calls[2]).toBe('COMMIT');
    expect(client.release).toHaveBeenCalledWith(undefined);
  });

  it('pedido sem utilizador fica sem uid e sem privilégios (deny-by-default)', async () => {
    await runWithRls(async () => {
      await pool.query('SELECT 1');
    });
    expect(client.calls[0]).toContain("set_config('app.user_id','',true)");
    expect(client.calls[0]).toContain("'app.privileged','off'");
  });

  it('role privilegiada e runAsSystem activam app.privileged', async () => {
    await runWithRls(async () => {
      setRlsUser(5, 'rh');
      await pool.query('SELECT 1');
    });
    expect(client.calls[0]).toContain("'app.privileged','on'");

    client.calls.length = 0;
    await runWithRls(() => runAsSystem(() => pool.query('SELECT 2')));
    expect(client.calls[0]).toContain("'app.privileged','on'");

    client.calls.length = 0;
    await runWithRls(async () => {
      setRlsPrivileged(true);
      await pool.query('SELECT 3');
    });
    expect(client.calls[0]).toContain("'app.privileged','on'");
  });

  it('fora de pedido HTTP (cron/filas) é código de confiança', async () => {
    await pool.query('SELECT 1');
    expect(client.calls[0]).toContain("'app.privileged','on'");
  });

  it('role COLABORADOR nunca é privilegiada, role desconhecida também não', async () => {
    await runWithRls(async () => {
      setRlsUser(7, 'COLABORADOR');
      await pool.query('SELECT 1');
    });
    expect(client.calls[0]).toContain("'app.privileged','off'");
    client.calls.length = 0;
    await runWithRls(async () => {
      setRlsUser(7, undefined);
      await pool.query('SELECT 1');
    });
    expect(client.calls[0]).toContain("'app.privileged','off'");
  });

  it('erro na query faz ROLLBACK, propaga o erro e devolve a ligação ao pool', async () => {
    client.query.mockImplementationOnce(async () => ({ rows: [] })); // BEGIN
    client.query.mockImplementationOnce(async () => {
      throw new Error('boom');
    });
    await expect(pool.query('SELECT 1')).rejects.toThrow('boom');
    expect(client.calls).toContain('ROLLBACK');
    expect(client.release).toHaveBeenCalledWith(undefined);
  });

  it('transacção interactiva: set_config depois do BEGIN e do SET TRANSACTION, antes da 1.ª query', async () => {
    await runWithRls(async () => {
      setRlsUser(42, 'COLABORADOR');
      const tx = await pool.connect();
      await tx.query('BEGIN');
      await tx.query('SET TRANSACTION ISOLATION LEVEL SERIALIZABLE');
      await tx.query({ text: 'SELECT 1' });
      await tx.query({ text: 'SELECT 2' });
      await tx.query('COMMIT');
    });
    expect(client.calls[0]).toBe('BEGIN');
    expect(client.calls[1]).toMatch(/^SET TRANSACTION/);
    expect(client.calls[2]).toContain("set_config('app.user_id','42',true)");
    expect(client.calls.slice(3)).toEqual(['SELECT 1', 'SELECT 2', 'COMMIT']);
  });

  it('o contexto é o do BEGIN, mesmo que as queries seguintes corram fora do store', async () => {
    let tx!: Awaited<ReturnType<RlsPool['connect']>>;
    await runWithRls(async () => {
      setRlsUser(42, 'COLABORADOR');
      tx = await pool.connect();
      await tx.query('BEGIN');
    });
    await tx.query('SELECT 1');
    expect(client.calls[1]).toContain("set_config('app.user_id','42',true)");
    expect(client.calls[1]).toContain("'app.privileged','off'");
  });

  it('ligação reutilizada não duplica o patch', async () => {
    await pool.connect();
    await pool.connect();
    await runWithRls(async () => {
      const tx = await pool.connect();
      await tx.query('BEGIN');
      await tx.query('SELECT 1');
    });
    expect(client.calls.filter(c => c.includes('set_config'))).toHaveLength(1);
  });
});
