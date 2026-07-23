#!/usr/bin/env bash
# ============================================================
# INNOVA — Backup WAL-G (full semanal + delta diário)
#
# Estratégia:
#   • Domingo 01:00 → backup FULL  (base de referência)
#   • Seg–Sáb 01:00 → backup DELTA (incremental desde o último full/delta)
#   • WAL archiving contínuo      → permite PITR para qualquer segundo
#
# Cron (instalar via install-cron-walg.sh):
#   0 1 * * 0 /opt/innova/backup/walg/walg-backup.sh full  >> /var/log/innova-walg.log 2>&1
#   0 1 * * 1-6 /opt/innova/backup/walg/walg-backup.sh delta >> /var/log/innova-walg.log 2>&1
#
# Corre como utilizador 'postgres'.
# ============================================================
set -euo pipefail

WALG_ENV_FILE="/etc/walg/walg.env"
METRICS_FILE="/var/lib/node-exporter/textfile_collector/innova_walg.prom"
BACKUP_TYPE="${1:-auto}"  # full | delta | auto (auto decide pelo dia da semana)

log()  { echo "[$(date -Iseconds)] INFO  $*"; }
warn() { echo "[$(date -Iseconds)] WARN  $*" >&2; }
fail() {
  echo "[$(date -Iseconds)] ERROR $*" >&2
  _write_metrics "failure"
  _notify "❌ INNOVA WAL-G Backup FALHOU: $*"
  exit 1
}

# ── Carregar variáveis ────────────────────────────────────────
[ -f "$WALG_ENV_FILE" ] \
  || fail "Ficheiro de configuração não encontrado: $WALG_ENV_FILE"
# shellcheck disable=SC1090
set -o allexport
source "$WALG_ENV_FILE"
set +o allexport

# ── Notificação Telegram ──────────────────────────────────────
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

# ── Métricas Prometheus (textfile collector) ──────────────────
_write_metrics() {
  local status="$1"   # success | failure
  local ts
  ts=$(date +%s)
  mkdir -p "$(dirname "$METRICS_FILE")" 2>/dev/null || true

  local status_val=0
  [ "$status" = "success" ] && status_val=1

  cat > "${METRICS_FILE}.tmp" << PROM
# HELP innova_walg_backup_last_success_timestamp_seconds Unix timestamp do último backup WAL-G com sucesso
# TYPE innova_walg_backup_last_success_timestamp_seconds gauge
innova_walg_backup_last_success_timestamp_seconds{type="${ACTUAL_TYPE:-unknown}"} $([ "$status" = "success" ] && echo "$ts" || echo "0")
# HELP innova_walg_backup_success Resultado do último backup WAL-G (1=sucesso, 0=falha)
# TYPE innova_walg_backup_success gauge
innova_walg_backup_success{type="${ACTUAL_TYPE:-unknown}"} ${status_val}
# HELP innova_walg_backup_duration_seconds Duração do último backup WAL-G em segundos
# TYPE innova_walg_backup_duration_seconds gauge
innova_walg_backup_duration_seconds{type="${ACTUAL_TYPE:-unknown}"} ${BACKUP_DURATION:-0}
PROM
  mv "${METRICS_FILE}.tmp" "$METRICS_FILE" 2>/dev/null || true
}

# ── Determinar tipo de backup ─────────────────────────────────
if [ "$BACKUP_TYPE" = "auto" ]; then
  DOW=$(date +%u)  # 7 = domingo
  BACKUP_TYPE=$( [ "$DOW" -eq 7 ] && echo "full" || echo "delta" )
fi
ACTUAL_TYPE="$BACKUP_TYPE"

# ── Verificar dependências ────────────────────────────────────
command -v wal-g >/dev/null 2>&1 || fail "wal-g não encontrado em PATH"
[ -n "${PGDATA:-}" ] || fail "PGDATA não definida em $WALG_ENV_FILE"
[ -d "$PGDATA" ]     || fail "PGDATA não existe: $PGDATA"

# ── Executar backup ───────────────────────────────────────────
START_TS=$(date +%s)

log "=========================================="
log " INNOVA WAL-G Backup — Tipo: ${BACKUP_TYPE^^}"
log "=========================================="

case "$BACKUP_TYPE" in
  full)
    log "A iniciar backup FULL de $PGDATA..."
    wal-g backup-push "$PGDATA" \
      || fail "wal-g backup-push (full) falhou"
    ;;
  delta|incr)
    log "A iniciar backup DELTA de $PGDATA..."
    wal-g backup-push "$PGDATA" --delta-from-user-data LATEST \
      || {
           warn "Delta falhou — a tentar full como fallback..."
           ACTUAL_TYPE="full_fallback"
           wal-g backup-push "$PGDATA" \
             || fail "wal-g backup-push (full fallback) falhou"
         }
    ;;
  *)
    fail "Tipo desconhecido: $BACKUP_TYPE. Usar 'full', 'delta' ou 'auto'."
    ;;
esac

END_TS=$(date +%s)
BACKUP_DURATION=$((END_TS - START_TS))
log "Backup concluído em ${BACKUP_DURATION}s"

# ── Listar backups disponíveis ────────────────────────────────
log "Backups actuais no S3:"
wal-g backup-list 2>/dev/null | tail -5 || warn "Não foi possível listar backups"

# ── Aplicar política de retenção ──────────────────────────────
RETAIN="${WALG_RETAIN_FULL_BACKUPS:-4}"
log "A aplicar retenção: manter últimos ${RETAIN} backups full..."
wal-g delete retain FULL "$RETAIN" --confirm 2>/dev/null \
  || warn "Limpeza de backups antigos falhou (não crítico)"

# ── Métricas e notificação ────────────────────────────────────
_write_metrics "success"

log "=========================================="
log " Backup concluído com sucesso"
log " Tipo: ${ACTUAL_TYPE} | Duração: ${BACKUP_DURATION}s"
log "=========================================="

_notify "✅ INNOVA WAL-G ${ACTUAL_TYPE^^} OK (${BACKUP_DURATION}s) — PITR disponível até $(date -Iseconds)"
