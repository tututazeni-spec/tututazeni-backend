-- ════════════════════════════════════════════════════════════════════
-- INNOVA — Monitorização de Performance e Saúde da Replicação (PostgreSQL)
-- Uso: psql "$DATABASE_URL" -f docs/db-architecture/04-monitoring.sql
-- Aplica-se a Postgres gerido OU self-managed.
-- ════════════════════════════════════════════════════════════════════

-- Pré-requisito (uma vez, no primary): extensão de estatísticas de queries
-- CREATE EXTENSION IF NOT EXISTS pg_stat_statements;
-- (no postgresql.conf: shared_preload_libraries = 'pg_stat_statements')

-- ────────────────────────────────────────────────────────────────────
-- 1. LAG DE REPLICAÇÃO  (correr NO PRIMARY)  — o KPI nº1 do master-slave
--    sync_state, e atraso em bytes e em tempo por réplica.
-- ────────────────────────────────────────────────────────────────────
SELECT
  application_name,
  client_addr,
  state,
  sync_state,
  pg_size_pretty(pg_wal_lsn_diff(pg_current_wal_lsn(), sent_lsn))   AS pending_send,
  pg_size_pretty(pg_wal_lsn_diff(sent_lsn, replay_lsn))            AS apply_lag,
  write_lag, flush_lag, replay_lag
FROM pg_stat_replication;

-- ────────────────────────────────────────────────────────────────────
-- 2. LAG visto DA RÉPLICA (correr NA RÉPLICA) — segundos de atraso real
-- ────────────────────────────────────────────────────────────────────
SELECT
  pg_is_in_recovery()                                              AS is_replica,
  now() - pg_last_xact_replay_timestamp()                         AS replication_delay,
  pg_last_wal_receive_lsn() = pg_last_wal_replay_lsn()            AS fully_caught_up;

-- ────────────────────────────────────────────────────────────────────
-- 3. SLOTS DE REPLICAÇÃO — slot inactivo retém WAL e enche o disco!
-- ────────────────────────────────────────────────────────────────────
SELECT slot_name, slot_type, active,
       pg_size_pretty(pg_wal_lsn_diff(pg_current_wal_lsn(), restart_lsn)) AS retained_wal
FROM pg_replication_slots;

-- ────────────────────────────────────────────────────────────────────
-- 4. TOP 20 QUERIES MAIS LENTAS (pg_stat_statements)
--    Candidatas a optimização / índice. Alinhado com o slow query log da app.
-- ────────────────────────────────────────────────────────────────────
SELECT
  round(mean_exec_time::numeric, 1)  AS avg_ms,
  calls,
  round(total_exec_time::numeric, 1) AS total_ms,
  round((100 * total_exec_time / NULLIF(sum(total_exec_time) OVER (), 0))::numeric, 1) AS pct_total,
  left(query, 120)                   AS query
FROM pg_stat_statements
WHERE query NOT ILIKE '%pg_stat%'
ORDER BY total_exec_time DESC
LIMIT 20;
-- Reset do acumulado quando quiser recomeçar a medir:  SELECT pg_stat_statements_reset();

-- ────────────────────────────────────────────────────────────────────
-- 5. CACHE HIT RATIO — deve ser > 99%. Abaixo disso → falta RAM/shared_buffers.
-- ────────────────────────────────────────────────────────────────────
SELECT round(100.0 * sum(heap_blks_hit) / NULLIF(sum(heap_blks_hit + heap_blks_read), 0), 2)
       AS cache_hit_pct
FROM pg_statio_user_tables;

-- ────────────────────────────────────────────────────────────────────
-- 6. ÍNDICES NÃO USADOS — candidatos a remover (custam em cada escrita).
--    Avaliar só depois de o sistema correr em produção uns dias.
-- ────────────────────────────────────────────────────────────────────
SELECT schemaname, relname AS table, indexrelname AS index,
       idx_scan AS scans, pg_size_pretty(pg_relation_size(indexrelid)) AS size
FROM pg_stat_user_indexes
WHERE idx_scan = 0
  AND indexrelname NOT LIKE '%_pkey'
ORDER BY pg_relation_size(indexrelid) DESC
LIMIT 30;

-- ────────────────────────────────────────────────────────────────────
-- 7. SCANS SEQUENCIAIS em tabelas grandes — possível índice em falta.
-- ────────────────────────────────────────────────────────────────────
SELECT relname AS table, seq_scan, idx_scan,
       n_live_tup AS rows,
       round(100.0 * seq_scan / NULLIF(seq_scan + idx_scan, 0), 1) AS seq_pct
FROM pg_stat_user_tables
WHERE n_live_tup > 10000
ORDER BY seq_scan DESC
LIMIT 20;

-- ────────────────────────────────────────────────────────────────────
-- 8. CONEXÕES ACTIVAS por estado — detectar saturação de pool.
-- ────────────────────────────────────────────────────────────────────
SELECT state, count(*)
FROM pg_stat_activity
WHERE datname = current_database()
GROUP BY state
ORDER BY count(*) DESC;

-- ────────────────────────────────────────────────────────────────────
-- 9. QUERIES PRESAS há mais de 30s — candidatas a cancelar/investigar.
-- ────────────────────────────────────────────────────────────────────
SELECT pid, now() - query_start AS running_for, state, left(query, 100) AS query
FROM pg_stat_activity
WHERE state = 'active'
  AND now() - query_start > interval '30 seconds'
  AND query NOT ILIKE '%pg_stat_activity%'
ORDER BY running_for DESC;

-- ────────────────────────────────────────────────────────────────────
-- 10. TAMANHO DAS 20 MAIORES TABELAS — planeamento de capacidade.
-- ────────────────────────────────────────────────────────────────────
SELECT relname AS table,
       pg_size_pretty(pg_total_relation_size(relid)) AS total_size,
       n_live_tup AS rows
FROM pg_stat_user_tables
ORDER BY pg_total_relation_size(relid) DESC
LIMIT 20;
