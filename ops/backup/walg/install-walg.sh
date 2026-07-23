#!/usr/bin/env bash
# ============================================================
# INNOVA — Instalação do WAL-G no servidor PostgreSQL
#
# Corre UMA VEZ como root no servidor Postgres (não no VPS da app).
# Instala o binário WAL-G e configura o PostgreSQL para WAL archiving.
#
# Pré-requisitos:
#   • Ubuntu 22.04+ com PostgreSQL 14/15/16
#   • Credenciais AWS com acesso ao bucket de backup
#   • Variáveis definidas em /etc/walg/walg.env (ver walg.env.example)
#
# Uso:
#   sudo bash install-walg.sh
# ============================================================
set -euo pipefail

WALG_VERSION="v3.0.3"
WALG_BINARY="/usr/local/bin/wal-g"
WALG_ENV_DIR="/etc/walg"
WALG_ENV_FILE="${WALG_ENV_DIR}/walg.env"
SCRIPTS_DIR="/opt/innova/backup/walg"
LOG_FILE="/var/log/innova-walg.log"

log()  { echo "✔  $*"; }
fail() { echo "❌ $*" >&2; exit 1; }

# ── Root check ────────────────────────────────────────────────
[ "$(id -u)" -eq 0 ] || fail "Correr como root (sudo bash $0)"

# ── Detectar versão do PostgreSQL ─────────────────────────────
PG_VERSION=$(psql --version 2>/dev/null | grep -oE '[0-9]+' | head -1 || echo "")
[ -n "$PG_VERSION" ] || fail "PostgreSQL não encontrado. Instalar primeiro."
log "PostgreSQL $PG_VERSION detectado"

PG_DATA_DIR=$(su - postgres -c "psql -tAc 'SHOW data_directory'" 2>/dev/null || echo "")
[ -n "$PG_DATA_DIR" ] || fail "Não foi possível determinar PGDATA. Verificar que o Postgres está a correr."
log "PGDATA: $PG_DATA_DIR"

# ── Instalar WAL-G ────────────────────────────────────────────
ARCH=$(uname -m)
case "$ARCH" in
  x86_64) WALG_ARCH="amd64" ;;
  aarch64|arm64) WALG_ARCH="aarch64" ;;
  *) fail "Arquitectura não suportada: $ARCH" ;;
esac

WALG_URL="https://github.com/wal-g/wal-g/releases/download/${WALG_VERSION}/wal-g-pg-ubuntu-20.04-${WALG_ARCH}.tar.gz"

log "A descarregar WAL-G ${WALG_VERSION} (${WALG_ARCH})..."
TMP_DIR=$(mktemp -d)
curl -fsSL "$WALG_URL" -o "${TMP_DIR}/walg.tar.gz" \
  || fail "Download do WAL-G falhou. Verificar URL: $WALG_URL"

tar -xzf "${TMP_DIR}/walg.tar.gz" -C "$TMP_DIR"
mv "${TMP_DIR}/wal-g-pg" "$WALG_BINARY" \
  || mv "${TMP_DIR}/wal-g" "$WALG_BINARY" \
  || fail "Binário WAL-G não encontrado no arquivo"
chmod +x "$WALG_BINARY"
rm -rf "$TMP_DIR"

"$WALG_BINARY" --version | head -1
log "WAL-G instalado em $WALG_BINARY"

# ── Criar directório de configuração ──────────────────────────
mkdir -p "$WALG_ENV_DIR"
chmod 750 "$WALG_ENV_DIR"

if [ ! -f "$WALG_ENV_FILE" ]; then
  cp "$(dirname "$0")/walg.env.example" "$WALG_ENV_FILE" 2>/dev/null || \
  cat > "$WALG_ENV_FILE" << 'ENVEOF'
# Preencher com os valores reais (ver walg.env.example)
WALG_S3_PREFIX=s3://innova-backups-prod/walg
AWS_ACCESS_KEY_ID=CHANGE_ME
AWS_SECRET_ACCESS_KEY=CHANGE_ME
AWS_REGION=eu-south-1
PGHOST=localhost
PGPORT=5432
PGUSER=postgres
PGDATABASE=innova
PGPASSWORD=CHANGE_ME
WALG_COMPRESSION_METHOD=brotli
WALG_DELTA_MAX_STEPS=6
ENVEOF
  chmod 600 "$WALG_ENV_FILE"
  log "Template criado em $WALG_ENV_FILE — PREENCHER antes de continuar"
else
  log "Configuração existente mantida: $WALG_ENV_FILE"
fi

chown root:postgres "$WALG_ENV_FILE"
chmod 640 "$WALG_ENV_FILE"

# ── Instalar scripts de backup ─────────────────────────────────
mkdir -p "$SCRIPTS_DIR"
cp "$(dirname "$0")"/*.sh "$SCRIPTS_DIR/" 2>/dev/null || true
chmod +x "${SCRIPTS_DIR}"/*.sh 2>/dev/null || true
log "Scripts copiados para $SCRIPTS_DIR"

# ── Configurar WAL archiving no PostgreSQL ────────────────────
PG_CONF="${PG_DATA_DIR}/postgresql.conf"
PG_CONF_BACKUP="${PG_DATA_DIR}/postgresql.conf.pre-walg.bak"

if grep -q "WALG_MANAGED" "$PG_CONF" 2>/dev/null; then
  log "WAL archiving já configurado — a saltar"
else
  cp "$PG_CONF" "$PG_CONF_BACKUP"
  log "Backup do postgresql.conf → $PG_CONF_BACKUP"

  cat >> "$PG_CONF" << PGEOF

# ── WAL-G WAL archiving (INNOVA) — WALG_MANAGED ──────────────
wal_level = replica
archive_mode = on
archive_command = 'set -a; source /etc/walg/walg.env; set +a; wal-g wal-push %p >> /var/log/innova-walg.log 2>&1'
archive_timeout = 60
restore_command = 'set -a; source /etc/walg/walg.env; set +a; wal-g wal-fetch %f %p'
# ─────────────────────────────────────────────────────────────
PGEOF

  log "postgresql.conf actualizado com WAL archiving"
  echo ""
  echo "⚠️  É necessário REINICIAR o PostgreSQL para activar o WAL archiving:"
  echo "    sudo systemctl restart postgresql"
  echo ""
fi

# ── Criar ficheiro de log ─────────────────────────────────────
if [ ! -f "$LOG_FILE" ]; then
  touch "$LOG_FILE"
  chown postgres:postgres "$LOG_FILE"
  log "Log criado: $LOG_FILE"
fi

# ── Instalar cron jobs ────────────────────────────────────────
bash "${SCRIPTS_DIR}/install-cron-walg.sh" 2>/dev/null || log "Cron não instalado automaticamente — correr install-cron-walg.sh manualmente"

echo ""
echo "══════════════════════════════════════════════"
echo " WAL-G instalado com sucesso!"
echo ""
echo " PASSOS SEGUINTES:"
echo "  1. Preencher /etc/walg/walg.env com valores reais"
echo "  2. sudo systemctl restart postgresql"
echo "  3. Validar WAL archiving:"
echo "     sudo -u postgres wal-g backup-push \$PGDATA  (primeiro full backup)"
echo "  4. Verificar S3: wal-g backup-list"
echo "══════════════════════════════════════════════"
