#!/usr/bin/env bash
# ============================================================
# INNOVA — Restore do PostgreSQL a partir de AWS S3
#
# Uso:
#   ./restore-postgres.sh latest                     # último backup registado em latest.txt
#   ./restore-postgres.sh s3://BUCKET/PREFIX/FILE    # backup específico
#   ./restore-postgres.sh --list                     # listar últimos 20 backups disponíveis
#
# ⚠️  ATENÇÃO: Este script sobrescreve a base de dados de destino.
#     Só usar em cenário de disaster recovery ou em ambiente de staging/testes.
#     Em produção, confirmar que a app está OFFLINE antes de restaurar.
#
# Variáveis obrigatórias:
#   DATABASE_URL, BACKUP_S3_BUCKET, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_DEFAULT_REGION
# Variáveis opcionais:
#   BACKUP_S3_PREFIX, BACKUP_ENCRYPT_PASSPHRASE
# ============================================================
set -euo pipefail

RESTORE_TMP="/tmp/innova-restore-$$"
S3_BUCKET="${BACKUP_S3_BUCKET:?BACKUP_S3_BUCKET não definida}"
S3_PREFIX="${BACKUP_S3_PREFIX:-innova/postgres}"
PASSPHRASE="${BACKUP_ENCRYPT_PASSPHRASE:-}"

log()  { echo "[$(date -Iseconds)] INFO  $*"; }
warn() { echo "[$(date -Iseconds)] WARN  $*" >&2; }
fail() { echo "[$(date -Iseconds)] ERROR $*" >&2; exit 1; }

_parse_db_url() {
  local url="${DATABASE_URL:?DATABASE_URL não definida}"
  url="${url#postgresql://}"; url="${url#postgres://}"
  local userinfo="${url%%@*}"; local hostinfo="${url#*@}"
  DB_USER="${userinfo%%:*}"; DB_PASS="${userinfo#*:}"
  local hostport="${hostinfo%%/*}"; local rest="${hostinfo#*/}"
  DB_HOST="${hostport%%:*}"; DB_PORT="${hostport##*:}"
  DB_NAME="${rest%%\?*}"
  export PGPASSWORD="$DB_PASS"
}

_list_backups() {
  log "Últimos 20 backups disponíveis em s3://${S3_BUCKET}/${S3_PREFIX}/"
  aws s3 ls "s3://${S3_BUCKET}/${S3_PREFIX}/" --recursive \
    | grep -E '\.(dump|dump\.gpg)$' \
    | sort -r \
    | head -20 \
    | awk '{printf "  %s %s  %s MB  s3://'"${S3_BUCKET}"'/%s\n", $1, $2, int($3/1048576), $4}'
}

_resolve_source() {
  local arg="${1:-latest}"
  if [ "$arg" = "latest" ]; then
    log "A obter caminho do último backup (latest.txt)..."
    local latest
    latest=$(aws s3 cp "s3://${S3_BUCKET}/${S3_PREFIX}/latest.txt" - 2>/dev/null \
             || fail "latest.txt não encontrado. Use --list para ver backups disponíveis.")
    echo "$latest"
  else
    echo "$arg"
  fi
}

_download() {
  local s3_path="$1"
  mkdir -p "$RESTORE_TMP"
  local filename
  filename=$(basename "$s3_path")
  local local_file="${RESTORE_TMP}/${filename}"

  log "A descarregar: $s3_path"
  aws s3 cp "$s3_path" "$local_file" \
    || fail "Download S3 falhou"
  echo "$local_file"
}

_decrypt_if_needed() {
  local file="$1"
  if [[ "$file" != *.gpg ]]; then
    echo "$file"
    return
  fi
  [ -n "$PASSPHRASE" ] \
    || fail "Ficheiro encriptado (.gpg) mas BACKUP_ENCRYPT_PASSPHRASE não definida"
  log "A desencriptar backup GPG..."
  local decrypted="${file%.gpg}"
  gpg --batch --yes \
    --passphrase "$PASSPHRASE" \
    --decrypt \
    --output "$decrypted" \
    "$file" \
    || fail "Desencriptação GPG falhou"
  rm -f "$file"
  echo "$decrypted"
}

_confirm_or_abort() {
  echo ""
  echo "╔══════════════════════════════════════════════════════╗"
  echo "║  ⚠️   AVISO — OPERAÇÃO DESTRUTIVA                   ║"
  echo "╠══════════════════════════════════════════════════════╣"
  echo "║  Base de dados alvo: ${DB_NAME}@${DB_HOST}:${DB_PORT}"
  echo "║  Esta operação APAGA e SUBSTITUI os dados actuais.  ║"
  echo "║  Certifique-se que a app está OFFLINE.              ║"
  echo "╚══════════════════════════════════════════════════════╝"
  echo ""
  printf "  Escreva 'yes' para confirmar o restore: "
  read -r CONFIRM
  [ "$CONFIRM" = "yes" ] \
    || { log "Restore cancelado pelo utilizador."; exit 0; }
}

_terminate_connections() {
  log "A terminar conexões activas à BD (necessário antes do restore)..."
  psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" postgres \
    -c "SELECT pg_terminate_backend(pid)
        FROM pg_stat_activity
        WHERE datname = '${DB_NAME}'
          AND pid <> pg_backend_pid();" \
    > /dev/null \
    || warn "Não foi possível terminar conexões — a continuar assim mesmo"
}

_restore() {
  local dump_file="$1"
  log "A restaurar '${DB_NAME}' a partir de $(basename "$dump_file")..."

  pg_restore \
    -h "$DB_HOST" \
    -p "$DB_PORT" \
    -U "$DB_USER" \
    -d "$DB_NAME" \
    --clean \
    --if-exists \
    --no-owner \
    --no-privileges \
    --exit-on-error \
    "$dump_file" \
    || fail "pg_restore falhou (ver erros acima)"

  log "pg_restore concluído"
}

_verify() {
  log "A verificar integridade pós-restore..."

  local table_count row_count_users
  table_count=$(psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" \
    -tAc "SELECT count(*) FROM information_schema.tables WHERE table_schema='public';" \
    || fail "Não foi possível conectar após restore")

  row_count_users=$(psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" \
    -tAc 'SELECT count(*) FROM "User";' 2>/dev/null || echo "N/A")

  log "  Tabelas encontradas : $table_count"
  log "  Utilizadores (User) : $row_count_users"

  [ "$table_count" -gt 0 ] \
    || fail "Restore parece incompleto: nenhuma tabela encontrada"

  log "✅ Verificação pós-restore OK"
}

_cleanup() { rm -rf "$RESTORE_TMP"; }

main() {
  trap _cleanup EXIT

  local arg="${1:-latest}"

  if [ "$arg" = "--list" ]; then
    _list_backups
    exit 0
  fi

  log "=========================================="
  log " INNOVA PostgreSQL Restore"
  log "=========================================="

  _parse_db_url
  _confirm_or_abort

  local s3_path local_file dump_file
  s3_path=$(_resolve_source "$arg")
  local_file=$(_download "$s3_path")
  dump_file=$(_decrypt_if_needed "$local_file")

  _terminate_connections
  _restore "$dump_file"
  _verify

  log "=========================================="
  log " Restore concluído com sucesso"
  log "=========================================="
  log ""
  log " PASSOS SEGUINTES:"
  log "  1. Reiniciar a app: docker compose -f /opt/innova/docker-compose.prod.yml restart app"
  log "  2. Validar smoke test: curl https://\$DOMAIN/api/health/ready"
  log "  3. Verificar logs da app: docker logs -f innova-app"
}

main "$@"
