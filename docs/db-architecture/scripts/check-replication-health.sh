#!/usr/bin/env bash
# ════════════════════════════════════════════════════════════════════
# INNOVA — Health-check de replicação (alerta simples por lag)
# Uso:  PRIMARY_URL=... REPLICA_URL=... ./check-replication-health.sh
# Pode correr via cron a cada minuto. Sai com código != 0 se algo estiver mal.
# ════════════════════════════════════════════════════════════════════
set -euo pipefail

PRIMARY_URL="${PRIMARY_URL:-$DATABASE_URL}"
REPLICA_URL="${REPLICA_URL:-$DATABASE_REPLICA_URL}"
MAX_LAG_SECONDS="${MAX_LAG_SECONDS:-5}"

fail() { echo "❌ $1"; exit 1; }

# 1. Primary aceita escrita?
psql "$PRIMARY_URL" -tAc "SELECT 1" >/dev/null 2>&1 || fail "Primary inacessível"
IS_PRIMARY=$(psql "$PRIMARY_URL" -tAc "SELECT pg_is_in_recovery();")
[ "$IS_PRIMARY" = "f" ] || fail "Primary está em recovery (não é primary!)"

# 2. Réplica está a replicar?
psql "$REPLICA_URL" -tAc "SELECT 1" >/dev/null 2>&1 || fail "Réplica inacessível"
IS_REPLICA=$(psql "$REPLICA_URL" -tAc "SELECT pg_is_in_recovery();")
[ "$IS_REPLICA" = "t" ] || fail "Réplica NÃO está em recovery (replicação parada?)"

# 3. Lag em segundos
LAG=$(psql "$REPLICA_URL" -tAc \
  "SELECT COALESCE(EXTRACT(EPOCH FROM (now() - pg_last_xact_replay_timestamp())), 0)::int;")
echo "ℹ️  Lag de replicação: ${LAG}s (limite: ${MAX_LAG_SECONDS}s)"
[ "$LAG" -le "$MAX_LAG_SECONDS" ] || fail "Lag de replicação ${LAG}s acima do limite!"

echo "✅ Replicação saudável (primary OK, réplica OK, lag ${LAG}s)"
