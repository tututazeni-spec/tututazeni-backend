#!/usr/bin/env bash
# ============================================================
# INNOVA — Restore com Point-In-Time Recovery (PITR) via WAL-G
#
# Uso:
#   ./walg-pitr-restore.sh latest                         # restaura para o backup mais recente
#   ./walg-pitr-restore.sh "2026-07-23 14:30:00"          # PITR para timestamp exacto
#   ./walg-pitr-restore.sh BACKUP_NAME                    # backup específico (ver wal-g backup-list)
#   ./walg-pitr-restore.sh --list                         # listar backups disponíveis
#
# ⚠️  ATENÇÃO DESTRUTIVA:
#   • PostgreSQL DEVE estar parado antes de correr este script
#   • O PGDATA existente é movido para ${PGDATA}.bak.TIMESTAMP (não apagado)
#   • Corre como utilizador 'postgres' no servidor PostgreSQL
#
# Variáveis carregadas de /etc/walg/walg.env
# ============================================================
set -euo pipefail

WALG_ENV_FILE="/etc/walg/walg.env"

log()  { echo "[$(date -Iseconds)] INFO  $*"; }
warn() { echo "[$(date -Iseconds)] WARN  $*" >&2; }
fail() { echo "[$(date -Iseconds)] ERROR $*" >&2; exit 1; }

# ── Carregar variáveis ────────────────────────────────────────
[ -f "$WALG_ENV_FILE" ] || fail "Config não encontrada: $WALG_ENV_FILE"
# shellcheck disable=SC1090
set -o allexport
source "$WALG_ENV_FILE"
set +o allexport

[ -n "${PGDATA:-}" ] || fail "PGDATA não definida"

# ── Listar backups ────────────────────────────────────────────
if [ "${1:-}" = "--list" ]; then
  log "Backups disponíveis:"
  wal-g backup-list
  exit 0
fi

# ── Resolve argumento ─────────────────────────────────────────
RESTORE_TARGET="${1:-latest}"
PITR_TIME=""

# Se o argumento parece um timestamp, é PITR
if [[ "$RESTORE_TARGET" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}( |T)[0-9]{2}:[0-9]{2} ]]; then
  PITR_TIME="$RESTORE_TARGET"
  RESTORE_TARGET="LATEST"  # restaura o full/delta mais próximo antes do timestamp
fi

# ── Aviso obrigatório ─────────────────────────────────────────
echo ""
echo "╔═════════════════════════════════════════════════════════╗"
echo "║  ⚠️   RESTORE PITR — OPERAÇÃO DESTRUTIVA               ║"
echo "╠═════════════════════════════════════════════════════════╣"
echo "║  Servidor PostgreSQL : ${PGHOST:-localhost}:${PGPORT:-5432}          ║"
echo "║  Base de dados       : ${PGDATABASE:-innova}                      ║"
echo "║  Backup a restaurar  : ${RESTORE_TARGET}                   ║"
if [ -n "$PITR_TIME" ]; then
echo "║  PITR target time    : ${PITR_TIME}             ║"
fi
echo "║                                                         ║"
echo "║  ▸ O PGDATA existente será MOVIDO (não apagado)         ║"
echo "║  ▸ PostgreSQL deve estar PARADO                         ║"
echo "║  ▸ Duração estimada: vários minutos                     ║"
echo "╚═════════════════════════════════════════════════════════╝"
echo ""
printf "  Escreva 'CONFIRMO' para continuar: "
read -r CONFIRM
[ "$CONFIRM" = "CONFIRMO" ] \
  || { log "Restore cancelado."; exit 0; }

# ── Verificar que o PostgreSQL está parado ────────────────────
if pg_isready -q 2>/dev/null; then
  fail "PostgreSQL ainda está a correr! Parar antes do restore:
    sudo systemctl stop postgresql
  ou
    sudo -u postgres pg_ctl stop -D $PGDATA"
fi
log "PostgreSQL confirmado como parado"

# ── Mover PGDATA existente para backup ────────────────────────
PGDATA_BAK="${PGDATA}.bak.$(date +%Y%m%d_%H%M%S)"
if [ -d "$PGDATA" ]; then
  log "A mover PGDATA existente → $PGDATA_BAK"
  mv "$PGDATA" "$PGDATA_BAK"
fi
mkdir -p "$PGDATA"
chmod 700 "$PGDATA"

# ── Restaurar base do backup ──────────────────────────────────
log "A restaurar backup '${RESTORE_TARGET}' para $PGDATA..."
wal-g backup-fetch "$PGDATA" "$RESTORE_TARGET" \
  || fail "wal-g backup-fetch falhou"
log "Base do backup restaurada"

# ── Configurar recovery ───────────────────────────────────────
PG_CONF="${PGDATA}/postgresql.conf"

# PostgreSQL 12+: usar recovery.signal + recovery_target_* em postgresql.conf
touch "${PGDATA}/recovery.signal"
log "recovery.signal criado (PostgreSQL 12+ mode)"

# Remover configurações de recovery anteriores se existirem
sed -i '/^# WALG_RECOVERY/,/^# END_WALG_RECOVERY/d' "$PG_CONF" 2>/dev/null || true

# Configurar recovery
cat >> "$PG_CONF" << RECOVEOF

# WALG_RECOVERY — gerado por walg-pitr-restore.sh em $(date -Iseconds)
restore_command = 'set -a; source /etc/walg/walg.env; set +a; wal-g wal-fetch %f %p'
recovery_target_action = promote
RECOVEOF

if [ -n "$PITR_TIME" ]; then
  echo "recovery_target_time = '${PITR_TIME}'" >> "$PG_CONF"
  echo "recovery_target_inclusive = true" >> "$PG_CONF"
  log "PITR configurado para: $PITR_TIME"
else
  echo "recovery_target = 'immediate'" >> "$PG_CONF"
  log "Recovery configurado para: fim do backup (sem PITR)"
fi

cat >> "$PG_CONF" << RECOVEOF
# END_WALG_RECOVERY
RECOVEOF

# ── Permissões ────────────────────────────────────────────────
chown -R postgres:postgres "$PGDATA"
chmod 700 "$PGDATA"
log "Permissões ajustadas em $PGDATA"

# ── Instruções finais ─────────────────────────────────────────
echo ""
echo "══════════════════════════════════════════════════════════"
echo " Restore preparado com sucesso!"
echo ""
echo " PASSOS SEGUINTES:"
echo "  1. Iniciar PostgreSQL:"
echo "     sudo systemctl start postgresql"
echo ""
echo "  2. Monitorizar o recovery nos logs:"
echo "     sudo -u postgres tail -f ${PGDATA}/log/postgresql-*.log"
echo "     (procurar por 'database system is ready to accept connections')"
echo ""
if [ -n "$PITR_TIME" ]; then
echo "  3. PITR para '$PITR_TIME' — o Postgres aplicará WAL até esse ponto"
echo "     e promoverá automaticamente a primary."
echo ""
fi
echo "  4. Verificar integridade pós-recovery:"
echo "     psql -U postgres -d ${PGDATABASE:-innova} -c 'SELECT count(*) FROM \"User\";'"
echo ""
echo "  5. Reiniciar a app INNOVA:"
echo "     docker compose -f /opt/innova/docker-compose.prod.yml restart app"
echo ""
echo "  ⚠️  O backup antigo está em: $PGDATA_BAK"
echo "     Apagar manualmente após confirmar que o restore está OK."
echo "══════════════════════════════════════════════════════════"
