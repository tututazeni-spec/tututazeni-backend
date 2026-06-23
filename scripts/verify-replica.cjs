#!/usr/bin/env node
// Verifica a saúde do par primary/réplica antes de activar USE_REPLICAS=true.
//
// Usa as mesmas env vars que a app (DATABASE_URL + DATABASE_REPLICA_URL).
// Não escreve nada por omissão. Com --probe-lag faz uma escrita+leitura numa
// tabela temporária própria para medir o lag prático ponta-a-ponta.
//
// Uso:
//   node scripts/verify-replica.cjs
//   node scripts/verify-replica.cjs --probe-lag
//
// Saída: exit 0 se a réplica é um standby a replicar com lag aceitável; !=0 caso contrário.

const { Pool } = require('pg');

const PRIMARY_URL = process.env.DATABASE_URL;
const REPLICA_URL = process.env.DATABASE_REPLICA_URL;
const MAX_LAG_MS = parseInt(process.env.REPLICA_MAX_LAG_MS || '2000', 10);
const PROBE = process.argv.includes('--probe-lag');

function ssl() {
  return process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false;
}

function fail(msg) {
  console.error(`❌ ${msg}`);
  process.exitCode = 1;
}

async function one(pool, sql) {
  const { rows } = await pool.query(sql);
  return rows[0];
}

async function main() {
  if (!PRIMARY_URL) return fail('DATABASE_URL não definido.');
  if (!REPLICA_URL) return fail('DATABASE_REPLICA_URL não definido — nada a verificar.');
  if (PRIMARY_URL === REPLICA_URL) {
    return fail('DATABASE_REPLICA_URL == DATABASE_URL — a réplica aponta para o primary.');
  }

  const primary = new Pool({ connectionString: PRIMARY_URL, ssl: ssl(), max: 2 });
  const replica = new Pool({ connectionString: REPLICA_URL, ssl: ssl(), max: 2 });

  try {
    // 1. Conectividade + papel de cada nó.
    const p = await one(primary, 'SELECT pg_is_in_recovery() AS rec, inet_server_addr() AS host');
    const r = await one(replica, 'SELECT pg_is_in_recovery() AS rec, inet_server_addr() AS host');
    console.log(`primary: host=${p.host} in_recovery=${p.rec}`);
    console.log(`replica: host=${r.host} in_recovery=${r.rec}`);

    if (p.rec === true) fail('O nó DATABASE_URL está em recovery — não é o primary.');
    if (r.rec !== true) {
      fail('O nó DATABASE_REPLICA_URL NÃO está em recovery — não é uma read replica / standby.');
    }

    // 2. Lag de replicação reportado pelo próprio standby.
    const lag = await one(
      replica,
      `SELECT EXTRACT(EPOCH FROM (now() - pg_last_xact_replay_timestamp())) * 1000 AS lag_ms`,
    );
    const lagMs = lag.lag_ms === null ? null : Math.round(Number(lag.lag_ms));
    if (lagMs === null) {
      console.log('replica lag: sem actividade recente para medir (pode estar idle).');
    } else {
      console.log(`replica lag: ${lagMs} ms (limite ${MAX_LAG_MS} ms)`);
      if (lagMs > MAX_LAG_MS) fail(`Lag de replicação ${lagMs}ms acima do limite ${MAX_LAG_MS}ms.`);
    }

    // 3. (opcional) Probe ponta-a-ponta: escreve no primary, lê na réplica.
    if (PROBE) {
      const token = `probe_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      await primary.query(
        `CREATE TABLE IF NOT EXISTS _replica_probe (id text PRIMARY KEY, at timestamptz DEFAULT now())`,
      );
      const t0 = Date.now();
      await primary.query(`INSERT INTO _replica_probe (id) VALUES ($1)`, [token]);

      let seen = false;
      while (Date.now() - t0 < 10000) {
        const { rows } = await replica.query(`SELECT 1 FROM _replica_probe WHERE id = $1`, [token]);
        if (rows.length) {
          seen = true;
          break;
        }
        await new Promise((res) => setTimeout(res, 50));
      }
      const elapsed = Date.now() - t0;
      await primary.query(`DELETE FROM _replica_probe WHERE id = $1`, [token]);

      if (seen) console.log(`probe ponta-a-ponta: escrita visível na réplica em ~${elapsed} ms`);
      else fail('probe ponta-a-ponta: escrita NÃO apareceu na réplica em 10s.');
    }

    if (!process.exitCode) console.log('\n✅ Réplica saudável — seguro activar USE_REPLICAS=true.');
  } catch (e) {
    fail(`Erro ao verificar réplica: ${e.message}`);
  } finally {
    await primary.end().catch(() => {});
    await replica.end().catch(() => {});
  }
}

main();
