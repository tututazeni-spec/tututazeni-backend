#!/usr/bin/env bash
# ============================================================
# INNOVA — Instalação dos cron jobs de backup no VPS
#
# Corre UMA VEZ no VPS como utilizador 'deploy' após o primeiro deploy.
# Instala:
#   • Backup diário às 02:00 (backup-postgres.sh)
#   • Verificação semanal aos domingos às 04:00 (verify-backup.sh)
#
# Pré-requisitos no VPS:
#   • aws cli instalado (apt install awscli ou snap install aws-cli)
#   • pg_dump instalado (apt install postgresql-client)
#   • gpg instalado (apt install gnupg) — só se usar encriptação
#   • Variáveis de ambiente em /opt/innova/.env.production
#
# Uso:
#   bash /opt/innova/backup/install-cron.sh
# ============================================================
set -euo pipefail

INNOVA_DIR="${INNOVA_DIR:-/opt/innova}"
BACKUP_DIR="${INNOVA_DIR}/backup"
ENV_FILE="${INNOVA_DIR}/.env.production"
LOG_FILE="/var/log/innova-backup.log"

fail() { echo "❌ $*" >&2; exit 1; }
log()  { echo "✔  $*"; }

# ── Verificações ──────────────────────────────────────────────
[ -f "$ENV_FILE" ] \
  || fail "Ficheiro de ambiente não encontrado: $ENV_FILE"

[ -f "${BACKUP_DIR}/backup-postgres.sh" ] \
  || fail "backup-postgres.sh não encontrado em ${BACKUP_DIR}. Correr deploy primeiro."

command -v aws >/dev/null 2>&1 \
  || fail "AWS CLI não instalado. Correr: sudo apt install awscli"

command -v pg_dump >/dev/null 2>&1 \
  || fail "pg_dump não instalado. Correr: sudo apt install postgresql-client"

# ── Permissões dos scripts ────────────────────────────────────
chmod +x "${BACKUP_DIR}/backup-postgres.sh"
chmod +x "${BACKUP_DIR}/restore-postgres.sh"
chmod +x "${BACKUP_DIR}/verify-backup.sh"
log "Permissões de execução definidas nos scripts de backup"

# ── Ficheiro de log ───────────────────────────────────────────
if [ ! -f "$LOG_FILE" ]; then
  sudo touch "$LOG_FILE"
  sudo chown "$(id -u):$(id -g)" "$LOG_FILE"
fi
log "Ficheiro de log: $LOG_FILE"

# ── Instalar cron entries ─────────────────────────────────────
# Usa um bloco delimitado para não duplicar em re-execuções

CRON_MARKER="# INNOVA-BACKUP"
CRON_DAILY="0 2 * * * . ${ENV_FILE} && ${BACKUP_DIR}/backup-postgres.sh >> ${LOG_FILE} 2>&1 ${CRON_MARKER}"
CRON_WEEKLY="0 4 * * 0 . ${ENV_FILE} && ${BACKUP_DIR}/verify-backup.sh >> ${LOG_FILE} 2>&1 ${CRON_MARKER}"
# Métricas de backup para Prometheus (textfile collector do node-exporter)
CRON_METRICS="*/15 * * * * . ${ENV_FILE} && ${BACKUP_DIR}/backup-metrics.sh >> ${LOG_FILE} 2>&1 ${CRON_MARKER}"

# Criar directório do textfile collector (lido pelo node-exporter dentro do Docker)
TEXTFILE_DIR="/var/lib/node-exporter/textfile_collector"
if [ ! -d "$TEXTFILE_DIR" ]; then
  mkdir -p "$TEXTFILE_DIR"
  log "Directório textfile collector criado: $TEXTFILE_DIR"
fi

# Lê crontab actual, remove entradas antigas do INNOVA e adiciona as novas
(crontab -l 2>/dev/null | grep -v "$CRON_MARKER" || true
 echo "$CRON_DAILY"
 echo "$CRON_WEEKLY"
 echo "$CRON_METRICS"
) | crontab -

log "Cron jobs instalados:"
log "  Backup diário  : todos os dias às 02:00"
log "  Verificação    : todos os domingos às 04:00"
log "  Métricas backup: a cada 15 minutos (Prometheus textfile)"

# ── Teste de conectividade ao S3 ──────────────────────────────
echo ""
echo "A verificar conectividade ao S3..."
# Carrega variáveis do .env.production para o teste
set -o allexport
# shellcheck disable=SC1090
source "$ENV_FILE"
set +o allexport

if aws s3 ls "s3://${BACKUP_S3_BUCKET}/" > /dev/null 2>&1; then
  log "Conectividade ao S3 OK: s3://${BACKUP_S3_BUCKET}/"
else
  echo "⚠️  Não foi possível aceder a s3://${BACKUP_S3_BUCKET}/"
  echo "    Verificar: AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_DEFAULT_REGION, BACKUP_S3_BUCKET"
fi

echo ""
echo "════════════════════════════════════════════"
echo " Instalação concluída!"
echo ""
echo " Para testar o backup imediatamente:"
echo "   . ${ENV_FILE} && ${BACKUP_DIR}/backup-postgres.sh"
echo ""
echo " Para ver os backups disponíveis:"
echo "   . ${ENV_FILE} && ${BACKUP_DIR}/restore-postgres.sh --list"
echo ""
echo " Logs:"
echo "   tail -f ${LOG_FILE}"
echo "════════════════════════════════════════════"
