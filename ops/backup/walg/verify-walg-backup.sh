#!/usr/bin/env bash
# ============================================================
# INNOVA — Verificação de integridade dos backups WAL-G
#
# 3 fases sequenciais — para no primeiro erro:
#   Fase 1: wal-g backup-list + verificação de idade
#   Fase 2: wal-g wal-verify timeline (gaps no arquivo WAL)
#   Fase 3: wal-g backup-verify (checksums)
#
# Cron (instalar via install-cron-walg.sh):
#   0 5 * * 0  /opt/innova/backup/walg/verify-walg-backup.sh >> /var/log/innova-walg.log 2>&1
# ============================================================
set -euo pipefail

WALG_ENV_FILE="/etc/walg/walg.env"
METRICS_FILE="/var/lib/node-exporter/textfile_collector/innova_walg_verify.prom"
MAX_AGE_DAYS="${WALG_VERIFY_MAX_AGE_DAYS:-8}"
VERIFY_BACKUP_NAME="${WALG_VERIFY_BACKUP_NAME:-LATEST}"
CURRENT_PHASE=""
START_TS=""
VERIFY_DURATION=0

log()  { echo "[$(date -Iseconds)] INFO  $*"; }
warn() { echo "[$(date -Iseconds)] WARN  $*" >&2; }
fail() {
  echo "[$(date -Iseconds)] ERROR $*" >&2
  _write_metrics "failure"
  _notify "❌ INNOVA WAL-G Verify FALHOU (${CURRENT_PHASE}): $*"
  exit 1
}

# ── Carregar variáveis ────────────────────────────────────────
[ -f "$WALG_ENV_FILE" ] \
  || fail "Ficheiro de configuração não encontrado: $WALG_ENV_FILE"
# shellcheck disable=SC1090
set -o allexport
source "$WALG_ENV_FILE"
set +o allexport

_notify() {
  local msg="$1"
  if [ -n "${TELEGRAM_BOT_TOKEN:-}" ] && [ -n "${TELEGRAM_CHAT_ID:-}" ]; then
    curl -s --max-time 10 \
      "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
      -d chat_id="${TELEGRAM_CHAT_ID}" \
      -d text="$msg" > /dev/null \
      || warn "Telegram: falha na notificação (não crítico)"
  fi
}

_write_metrics() {
  local status="$1"
  local ts
  ts=$(date +%s)
  local status_val=0
  [ "$status" = "success" ] && status_val=1
  mkdir -p "$(dirname "$METRICS_FILE")" 2>/dev/null || true

  cat > "${METRICS_FILE}.tmp" << PROM
# HELP innova_walg_verify_success Resultado da última verificação WAL-G (1=sucesso, 0=falha)
# TYPE innova_walg_verify_success gauge
innova_walg_verify_success ${status_val}
# HELP innova_walg_verify_last_timestamp_seconds Unix timestamp da última verificação WAL-G
# TYPE innova_walg_verify_last_timestamp_seconds gauge
innova_walg_verify_last_timestamp_seconds ${ts}
# HELP innova_walg_verify_duration_seconds Duração da última verificação WAL-G em segundos
# TYPE innova_walg_verify_duration_seconds gauge
innova_walg_verify_duration_seconds ${VERIFY_DURATION}
PROM
  mv "${METRICS_FILE}.tmp" "$METRICS_FILE" 2>/dev/null || true
}

START_TS=$(date +%s)

log "=========================================="
log " INNOVA WAL-G Verify — Início"
log " MAX_AGE_DAYS=${MAX_AGE_DAYS} | BACKUP=${VERIFY_BACKUP_NAME}"
log "=========================================="

command -v wal-g >/dev/null 2>&1 || fail "wal-g não encontrado em PATH"

# ── Fase 1: Inventário + idade ────────────────────────────────
CURRENT_PHASE="Fase 1 (inventário)"
log "--- ${CURRENT_PHASE} ---"

BACKUP_LIST=$(wal-g backup-list 2>&1) \
  || fail "wal-g backup-list falhou"

BACKUP_COUNT=$(echo "$BACKUP_LIST" | grep -c "base_" 2>/dev/null || echo 0)
[ "$BACKUP_COUNT" -gt 0 ] \
  || fail "Nenhum backup encontrado. Verificar WALG_S3_PREFIX e credenciais."

log "  Backups encontrados: ${BACKUP_COUNT}"
echo "$BACKUP_LIST" | tail -3 | sed 's/^/    /'

LATEST_LINE=$(echo "$BACKUP_LIST" | grep "base_" | tail -1)
LATEST_DATE=$(echo "$LATEST_LINE" | awk '{print $2, $3}' | cut -c1-19)

if [ -n "$LATEST_DATE" ]; then
  LATEST_EPOCH=$(date -d "$LATEST_DATE" +%s 2>/dev/null \
              || date -j -f "%Y-%m-%d %H:%M:%S" "$LATEST_DATE" +%s 2>/dev/null \
              || echo 0)
  NOW_EPOCH=$(date +%s)
  AGE_DAYS=$(( (NOW_EPOCH - LATEST_EPOCH) / 86400 ))
  log "  Idade do último full: ${AGE_DAYS} dias (limite: ${MAX_AGE_DAYS})"
  [ "$AGE_DAYS" -le "$MAX_AGE_DAYS" ] \
    || fail "Backup full desactualizado: ${AGE_DAYS} dias (limite: ${MAX_AGE_DAYS})"
else
  warn "  Não foi possível determinar a idade do backup"
fi

log "  Fase 1 OK"

# ── Fase 2: Continuidade WAL ──────────────────────────────────
CURRENT_PHASE="Fase 2 (wal-verify timeline)"
log "--- ${CURRENT_PHASE} ---"

WAL_VERIFY_OUT=$(wal-g wal-verify timeline 2>&1) \
  || fail "wal-g wal-verify timeline falhou"

echo "$WAL_VERIFY_OUT" | sed 's/^/    /'

echo "$WAL_VERIFY_OUT" | grep -qiE "FAILURE|gap detected|error" \
  && fail "wal-verify detectou gaps ou erros no arquivo WAL"

log "  Fase 2 OK — sem gaps detectados no arquivo WAL"

# ── Fase 3: Verificação de checksums ─────────────────────────
CURRENT_PHASE="Fase 3 (backup-verify)"
log "--- ${CURRENT_PHASE} ---"

VERIFY_OUT=$(wal-g backup-verify "$VERIFY_BACKUP_NAME" 2>&1) \
  || fail "wal-g backup-verify falhou"

echo "$VERIFY_OUT" | sed 's/^/    /'

echo "$VERIFY_OUT" | grep -qiE "FAILURE|mismatch|corrupt" \
  && fail "backup-verify detectou corrupção ou checksums inválidos"

log "  Fase 3 OK — checksums válidos"

# ── Métricas e notificação ────────────────────────────────────
END_TS=$(date +%s)
VERIFY_DURATION=$((END_TS - START_TS))

_write_metrics "success"

log "=========================================="
log " Verificação WAL-G concluída com sucesso"
log " Duração: ${VERIFY_DURATION}s | Backups: ${BACKUP_COUNT}"
log "=========================================="

_notify "✅ INNOVA WAL-G Verify OK (${VERIFY_DURATION}s) — ${BACKUP_COUNT} backup(s), sem gaps WAL, checksums válidos"
