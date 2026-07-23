#!/usr/bin/env bash
# ============================================================
# INNOVA — Gerador de métricas de backup para Prometheus
#
# Corre a cada 15 minutos via cron (instalar via install-cron.sh).
# Escreve métricas no formato textfile do node-exporter em:
#   /var/lib/node-exporter/textfile_collector/innova_backup.prom
#
# O node-exporter lê este ficheiro e expõe as métricas no /metrics.
# O Prometheus scrape estas métricas e o Alertmanager dispara alertas
# se o backup estiver desactualizado ou tiver falhado.
#
# Cron:
#   */15 * * * * /opt/innova/backup/backup-metrics.sh >> /var/log/innova-backup.log 2>&1
# ============================================================
set -euo pipefail

# Carregar variáveis do backup
ENV_FILE="${INNOVA_DIR:-/opt/innova}/.env.production"
[ -f "$ENV_FILE" ] && { set -o allexport; source "$ENV_FILE"; set +o allexport; } || true

METRICS_DIR="/var/lib/node-exporter/textfile_collector"
METRICS_FILE="${METRICS_DIR}/innova_backup.prom"
S3_BUCKET="${BACKUP_S3_BUCKET:-}"
S3_PREFIX="${BACKUP_S3_PREFIX:-innova/postgres}"

warn() { echo "[$(date -Iseconds)] WARN  $*" >&2; }

mkdir -p "$METRICS_DIR"

# ── Métricas default (em caso de falha de leitura do S3) ─────
NOW=$(date +%s)
BACKUP_TS=0
BACKUP_AGE_HOURS=999
BACKUP_SIZE_BYTES=0
S3_OK=0

# ── Tentar ler latest.txt do S3 ───────────────────────────────
if [ -n "$S3_BUCKET" ] && command -v aws >/dev/null 2>&1; then
  LATEST_PATH=$(aws s3 cp "s3://${S3_BUCKET}/${S3_PREFIX}/latest.txt" - 2>/dev/null || echo "")

  if [ -n "$LATEST_PATH" ]; then
    S3_OK=1

    # Obter timestamp e tamanho do último backup
    S3_META=$(aws s3 ls "$LATEST_PATH" 2>/dev/null | head -1 || echo "")
    if [ -n "$S3_META" ]; then
      BACKUP_DATE=$(echo "$S3_META" | awk '{print $1 "T" $2}')
      BACKUP_TS=$(date -d "$BACKUP_DATE" +%s 2>/dev/null \
               || date -j -f "%Y-%m-%dT%H:%M:%S" "$BACKUP_DATE" +%s 2>/dev/null \
               || echo 0)
      BACKUP_SIZE_BYTES=$(echo "$S3_META" | awk '{print $3}')
      BACKUP_AGE_HOURS=$(( (NOW - BACKUP_TS) / 3600 ))
    fi
  fi
fi

# ── Verificar métricas WAL-G (se existirem) ───────────────────
WALG_METRICS_FILE="/var/lib/node-exporter/textfile_collector/innova_walg.prom"
WALG_LAST_SUCCESS=0
if [ -f "$WALG_METRICS_FILE" ]; then
  WALG_LAST_SUCCESS=$(grep 'innova_walg_backup_last_success_timestamp_seconds{type="full"' "$WALG_METRICS_FILE" 2>/dev/null \
                    | awk '{print $2}' || echo 0)
fi

# ── Escrever ficheiro de métricas ─────────────────────────────
TMP_FILE="${METRICS_FILE}.tmp"

cat > "$TMP_FILE" << PROM
# HELP innova_backup_last_success_timestamp_seconds Unix timestamp do último pg_dump com sucesso
# TYPE innova_backup_last_success_timestamp_seconds gauge
innova_backup_last_success_timestamp_seconds ${BACKUP_TS}

# HELP innova_backup_age_hours Idade do último backup pg_dump em horas
# TYPE innova_backup_age_hours gauge
innova_backup_age_hours ${BACKUP_AGE_HOURS}

# HELP innova_backup_size_bytes Tamanho do último backup pg_dump em bytes
# TYPE innova_backup_size_bytes gauge
innova_backup_size_bytes ${BACKUP_SIZE_BYTES}

# HELP innova_backup_s3_reachable Conectividade ao S3 de backup (1=OK, 0=falha)
# TYPE innova_backup_s3_reachable gauge
innova_backup_s3_reachable ${S3_OK}

# HELP innova_walg_last_full_backup_timestamp_seconds Unix timestamp do último backup WAL-G full
# TYPE innova_walg_last_full_backup_timestamp_seconds gauge
innova_walg_last_full_backup_timestamp_seconds ${WALG_LAST_SUCCESS}

# HELP innova_backup_metrics_generated_timestamp_seconds Quando estas métricas foram geradas
# TYPE innova_backup_metrics_generated_timestamp_seconds gauge
innova_backup_metrics_generated_timestamp_seconds ${NOW}
PROM

mv "$TMP_FILE" "$METRICS_FILE"
