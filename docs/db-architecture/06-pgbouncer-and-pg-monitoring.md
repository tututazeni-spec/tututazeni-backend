# PgBouncer + monitorização do Postgres (implementado no repo)

## O que já está no `ops/docker-compose.prod.yml`
- **`pgbouncer`** (modo `transaction`, 20 ligações reais, 400 clientes). A app liga-se via
  `DATABASE_POOLER_URL`; `prisma.service.ts` usa-o se definido (sem TLS, rede Docker).
  O job `migrate` continua a usar `DATABASE_URL` directo (migrations precisam de sessão).
  Compatível: o único advisory lock da app é `pg_advisory_xact_lock` (audit-chain).
- **`postgres-exporter`** → job `postgres` no Prometheus; alertas `innova-postgres` em
  `ops/monitoring/alert-rules.yml` (down, ligações >80%, lag 5s/30s, cache hit, deadlocks).

## Activar (acções tuas — requerem o servidor Postgres)
1. No Postgres: `CREATE USER pg_monitor_user LOGIN PASSWORD '...'; GRANT pg_monitor TO pg_monitor_user;`
   e `CREATE EXTENSION IF NOT EXISTS pg_stat_statements;`.
2. No `.env.production`: preencher `DATABASE_POOLER_URL` (mesmas credenciais, host `pgbouncer:6432`)
   e `DATA_SOURCE_NAME` (utilizador de monitorização).
3. `docker compose -f docker-compose.prod.yml up -d` e confirmar em Prometheus (túnel SSH :9090)
   que o target `postgres` está UP.
4. Se `DB_POOL_MAX=50` × 2 réplicas, o PgBouncer absorve; não é preciso baixar.

## Ainda depende de infra externa (não automatizável no repo)
Postgres gerido com Multi-AZ (failover), read replica e activação do `USE_REPLICAS` —
seguir `05-f2-activation-runbook.md`. Quando a réplica existir, adicionar um 2º target
do exporter (DSN da réplica) ao job `postgres`.
