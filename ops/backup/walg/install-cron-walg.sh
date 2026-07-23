#!/usr/bin/env bash
# ============================================================
# INNOVA — Instalar cron jobs do WAL-G
#
# Corre no servidor PostgreSQL como utilizador 'postgres' (ou root).
# Instala:
#   • Full backup    : Domingos às 01:00
#   • Delta backup   : Seg–Sáb às 01:00
#   • Limpeza WAL    : Domingos às 03:00 (após o full)
#
# O WAL archiving contínuo é gerido automaticamente pelo PostgreSQL
# via archive_command — não precisa de cron.
# ============================================================
set -euo pipefail

SCRIPTS_DIR="${SCRIPTS_DIR:-/opt/innova/backup/walg}"
LOG_FILE="/var/log/innova-walg.log"
CRON_MARKER="# INNOVA-WALG"

fail() { echo "❌ $*" >&2; exit 1; }
log()  { echo "✔  $*"; }

[ -f "${SCRIPTS_DIR}/walg-backup.sh" ] \
  || fail "walg-backup.sh não encontrado em ${SCRIPTS_DIR}. Correr install-walg.sh primeiro."

chmod +x "${SCRIPTS_DIR}/walg-backup.sh"
chmod +x "${SCRIPTS_DIR}/walg-pitr-restore.sh"

# Criar log se não existir
if [ ! -f "$LOG_FILE" ]; then
  touch "$LOG_FILE"
  chown postgres:postgres "$LOG_FILE" 2>/dev/null || true
fi

# ── Instalar crontab do utilizador 'postgres' ─────────────────
CRON_FULL="0 1 * * 0   ${SCRIPTS_DIR}/walg-backup.sh full  >> ${LOG_FILE} 2>&1 ${CRON_MARKER}"
CRON_DELTA="0 1 * * 1-6 ${SCRIPTS_DIR}/walg-backup.sh delta >> ${LOG_FILE} 2>&1 ${CRON_MARKER}"
CRON_WAL_CLEAN="0 3 * * 0   wal-g wal-push-full-to-wal-archive >> ${LOG_FILE} 2>&1 ${CRON_MARKER}"

(crontab -l 2>/dev/null | grep -v "$CRON_MARKER" || true
 echo "$CRON_FULL"
 echo "$CRON_DELTA"
) | crontab -

log "Cron jobs do WAL-G instalados para o utilizador $(whoami):"
log "  Full backup  : todos os Domingos às 01:00"
log "  Delta backup : Seg–Sáb às 01:00 (incremental)"
log "  WAL archiving: contínuo via archive_command do PostgreSQL"
log ""
log "Logs em: $LOG_FILE"
echo ""
echo "Para verificar:"
echo "  crontab -l | grep WALG"
