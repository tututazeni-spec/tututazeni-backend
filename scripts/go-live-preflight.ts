// Verificação só de leitura antes do go-live. Aponta para a BD de produção:
//   DATABASE_URL=... PII_ENCRYPTION_KEY=... RLS_ENABLED=true DATABASE_APP_URL=... \
//     npx ts-node scripts/go-live-preflight.ts
// Sai com código 1 se algum ponto BLOQUEANTE falhar. Não altera nada.
import { Pool } from 'pg';

type Level = 'OK' | 'AVISO' | 'FALHA';
const results: { level: Level; check: string; detail: string }[] = [];
const add = (level: Level, check: string, detail = '') => results.push({ level, check, detail });

async function scalar(pool: Pool, sql: string): Promise<number | null> {
  try {
    const r = await pool.query(sql);
    return Number(Object.values(r.rows[0] ?? {})[0]);
  } catch {
    return null; // tabela/coluna inexistente: o check reporta "não verificável"
  }
}

async function countCheck(
  pool: Pool,
  check: string,
  sql: string,
  expectZero: boolean,
  hint: string,
) {
  const n = await scalar(pool, sql);
  if (n === null) return add('AVISO', check, 'não verificável (tabela/coluna não encontrada)');
  if (expectZero) return n === 0 ? add('OK', check) : add('FALHA', check, `${n} — ${hint}`);
  return n > 0 ? add('OK', check, String(n)) : add('FALHA', check, `0 — ${hint}`);
}

async function main() {
  const env = process.env;

  // ── Configuração ────────────────────────────────────────────────────────────
  env.PII_ENCRYPTION_KEY
    ? add('OK', 'PII_ENCRYPTION_KEY definida')
    : add('FALHA', 'PII_ENCRYPTION_KEY definida', 'sem ela a cifra deriva de JWT_SECRET');
  env.RLS_ENABLED === 'true' && env.DATABASE_APP_URL
    ? add('OK', 'RLS_ENABLED=true com DATABASE_APP_URL')
    : add('FALHA', 'RLS_ENABLED=true com DATABASE_APP_URL', 'ver ops/db/rls/README.md');

  const pool = new Pool({
    connectionString: env.DATABASE_URL,
    ssl: env.DB_SSL_CA ? { ca: env.DB_SSL_CA.replace(/\n/g, '\n') } : undefined,
  });

  try {
    // ── Menor privilégio ──────────────────────────────────────────────────────
    const me = await pool.query(
      'SELECT current_user, rolsuper FROM pg_roles WHERE rolname = current_user',
    );
    add(
      'OK',
      'Ligação de migração/owner',
      `${me.rows[0]?.current_user}${me.rows[0]?.rolsuper ? ' (SUPERUSER)' : ''}`,
    );
    const app = await pool.query(
      "SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = 'innova_app'",
    );
    if (!app.rows[0]) add('FALHA', 'Role innova_app existe', 'correr ops/db/rls/01_rls_harden.sql');
    else if (app.rows[0].rolsuper || app.rows[0].rolbypassrls) {
      add('FALHA', 'innova_app sem SUPERUSER/BYPASSRLS', 'a role ignora o RLS');
    } else add('OK', 'innova_app sem SUPERUSER/BYPASSRLS');
    await countCheck(
      pool,
      'Todas as tabelas com RLS',
      `SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'public' AND c.relkind = 'r' AND NOT c.relrowsecurity
         AND c.relname <> '_prisma_migrations'`,
      true,
      'correr 01_rls_harden.sql e 02_rls_verify.sql',
    );

    // ── Migrações ─────────────────────────────────────────────────────────────
    await countCheck(
      pool,
      'Migrações sem falhas pendentes',
      'SELECT count(*) FROM _prisma_migrations WHERE finished_at IS NULL AND rolled_back_at IS NULL',
      true,
      'migração falhada/incompleta (prisma migrate resolve)',
    );

    // ── Dados de teste / iniciais ─────────────────────────────────────────────
    await countCheck(
      pool,
      'Sem utilizadores de teste',
      `SELECT count(*) FROM "User" WHERE email ILIKE '%@innova-test.com' OR email ILIKE 'load.test.%'`,
      true,
      'remover (prisma/cleanup-load-test.ts ou limpeza manual)',
    );
    await countCheck(
      pool,
      'Roles carregadas',
      'SELECT count(*) FROM "Role"',
      false,
      'correr o seed',
    );
    await countCheck(
      pool,
      'Planos de faturação',
      'SELECT count(*) FROM billing_plans',
      false,
      'arrancar a app uma vez (seed automático)',
    );
    await countCheck(
      pool,
      'Tipos de licença',
      'SELECT count(*) FROM leave_type_configs',
      false,
      'correr o seed',
    );
    await countCheck(
      pool,
      'Configuração de país (IRT)',
      'SELECT count(*) FROM "CountryConfig"',
      false,
      'correr o seed',
    );

    // ── Dados sensíveis em claro ──────────────────────────────────────────────
    const plain = (col: string, table: string) =>
      `SELECT count(*) FROM "${table}" WHERE "${col}" IS NOT NULL AND "${col}" <> '' AND "${col}" NOT LIKE 'pii:v1:%'`;
    const fix = 'correr prisma/backfill-encrypt-user-pii.ts e backfill-encrypt-secrets.ts';
    await countCheck(pool, 'User.nif cifrado', plain('nif', 'User'), true, fix);
    await countCheck(pool, 'User.nib cifrado', plain('nib', 'User'), true, fix);
    await countCheck(
      pool,
      'EmployeeCompensation.iban cifrado',
      plain('iban', 'EmployeeCompensation'),
      true,
      fix,
    );
    await countCheck(
      pool,
      'EmployeeCompensation.accountNumber cifrado',
      plain('accountNumber', 'EmployeeCompensation'),
      true,
      fix,
    );
    await countCheck(pool, 'Webhook.secret cifrado', plain('secret', 'Webhook'), true, fix);
  } finally {
    await pool.end();
  }

  for (const r of results) {
    const icon = r.level === 'OK' ? '✅' : r.level === 'AVISO' ? '⚠️ ' : '❌';
    console.log(`${icon} ${r.check}${r.detail ? ` — ${r.detail}` : ''}`);
  }
  const failed = results.filter(r => r.level === 'FALHA').length;
  console.log(`\n${failed ? `${failed} ponto(s) bloqueante(s)` : 'Sem pontos bloqueantes'}`);
  process.exit(failed ? 1 : 0);
}

main().catch(e => {
  console.error(e);
  process.exit(2);
});
