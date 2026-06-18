-- ════════════════════════════════════════════════════════════════════
-- INNOVA — Setup de replicação no PRIMARY (self-managed / on-prem)
-- Correr UMA vez no servidor primary, ligado à BD innova como superuser.
-- Uso: sudo -u postgres psql -d innova -f 01-setup-replication.sql
-- ════════════════════════════════════════════════════════════════════

-- 1. Utilizador dedicado à replicação (apenas REPLICATION + LOGIN, sem dados)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'replicator') THEN
    CREATE ROLE replicator WITH REPLICATION LOGIN PASSWORD 'TROCAR_PASSWORD_FORTE';
  END IF;
END $$;

-- 2. Slots físicos de replicação — um por réplica.
--    Impede o primary de apagar WAL antes da réplica o consumir.
SELECT pg_create_physical_replication_slot('replica_1')
  WHERE NOT EXISTS (SELECT 1 FROM pg_replication_slots WHERE slot_name = 'replica_1');
SELECT pg_create_physical_replication_slot('replica_2')
  WHERE NOT EXISTS (SELECT 1 FROM pg_replication_slots WHERE slot_name = 'replica_2');

-- 3. Extensão de monitorização de queries (usada em 04-monitoring.sql)
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;

-- 4. Verificação
SELECT slot_name, slot_type, active FROM pg_replication_slots;
SELECT rolname, rolreplication FROM pg_roles WHERE rolname = 'replicator';
