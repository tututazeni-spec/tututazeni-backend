#!/usr/bin/env bash
# ============================================================
# INNOVA — Backup diário do PostgreSQL para AWS S3
#
# Estratégia:
#   • Full dump diário comprimido (pg_dump --format=custom --compress=9)
#   • Encriptação GPG opcional antes do upload
#   • Upload para S3 com storage-class STANDARD_IA (baixo custo)
#   • Política de retenção: apaga dumps com mais de BACKUP_RETENTION_DAYS dias
#   • Notificação Telegram no final (sucesso ou falha)
#
# Cron recomendado (VPS, como utilizador deploy):
#   0 2 * * * /opt/innova/backup/backup-postgres.sh >> /var/log/innova-backup.log 2>&1
#
# Variáveis obrigatórias (carregar de .env.production antes de correr):
#   DATABASE_URL, BACKUP_S3_BUCKET, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_DEFAULT_REGION
#
# Variáveis opcionais:
#   BACKUP_S3_PREFIX (padrão: innova/postgres)
#   BACKUP_RETENTION_DAYS (padrão: 30)
#   BACKUP_ENCRYPT_PASSPHRASE (sem valor = sem encriptação)
#   TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID
# ============================================================
set -euo pipefail

# ── Configuração ─────────────────────────────────────────────
BACKUP_TMP="/tmp/innova-backup-$$"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
DATE_PATH=$(date +%Y/%m/%d)
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-30}"
S3_BUCKET="${BACKUP_S3_BUCKET:?BACKUP_S3_BUCKET não definida}"
S3_PREFIX="${BACKUP_S3_PREFIX:-innova/postgres}"
PASSPHRASE="${BACKUP_ENCRYPT_PASSPHRASE:-}"

# ── Logging ──────────────────────────────────────────────────
log()  { echo "[$(date -Iseconds)] INFO  $*"; }
warn() { echo "[$(date -Iseconds)] WARN  $*" >&2; }
fail() {
  echo "[$(date -Iseconds)] ERROR $*" >&2
  _notify "❌ INNOVA Backup FALHOU: $*"
  exit 1
}

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

# ── Parse DATABASE_URL → variáveis pg* ───────────────────────
_parse_db_url() {
  local url="${DATABASE_URL:?DATABASE_URL não definida}"
  # Remove prefixo postgresql:// ou postgres://
  url="${url#postgresql://}"; url="${url#postgres://}"
  local userinfo="${url%%@*}"
  local hostinfo="${url#*@}"
  DB_USER="${userinfo%%:*}"
  DB_PASS="${userinfo#*:}"
  local hostport="${hostinfo%%/*}"
  local rest="${hostinfo#*/}"
  DB_HOST="${hostport%%:*}"
  DB_PORT="${hostport##*:}"
  DB_NAME="${rest%%\?*}"
  export PGPASSWORD="$DB_PASS"
}

# ── Verificar dependências ────────────────────────────────────
_check_deps() {
  for cmd in pg_dump aws gzip; do
    command -v "$cmd" >/dev/null 2>&1 \
      || fail "Dependência em falta: '$cmd'. Instalar antes de correr backup."
  done
  if [ -n "$PASSPHRASE" ]; then
    command -v gpg >/dev/null 2>&1 \
      || fail "BACKUP_ENCRYPT_PASSPHRASE definida mas 'gpg' não está instalado."
  fi
}

# ── Criar dump + comprimir ────────────────────────────────────
_create_dump() {
  mkdir -p "$BACKUP_TMP"
  local dump_file="${BACKUP_TMP}/innova_${TIMESTAMP}.dump"

  log "A criar dump de '${DB_NAME}' @ ${DB_HOST}:${DB_PORT} ..."
  pg_dump \
    -h "$DB_HOST" \
    -p "$DB_PORT" \
    -U "$DB_USER" \
    -d "$DB_NAME" \
    --format=custom \
    --compress=9 \
    --no-owner \
    --no-privileges \
    --file="$dump_file" \
    || fail "pg_dump falhou (código: $?)"

  log "Dump criado: $(du -sh "$dump_file" | cut -f1)"
  echo "$dump_file"
}

# ── Encriptar (opcional) ──────────────────────────────────────
_encrypt_if_configured() {
  local file="$1"
  if [ -z "$PASSPHRASE" ]; then
    echo "$file"
    return
  fi
  log "A encriptar com GPG AES-256..."
  local enc_file="${file}.gpg"
  gpg --batch --yes \
    --passphrase "$PASSPHRASE" \
    --symmetric \
    --cipher-algo AES256 \
    --output "$enc_file" \
    "$file" \
    || fail "Encriptação GPG falhou"
  rm -f "$file"
  log "Encriptação concluída: $(basename "$enc_file")"
  echo "$enc_file"
}

# ── Upload para S3 ────────────────────────────────────────────
_upload_s3() {
  local local_file="$1"
  local filename
  filename=$(basename "$local_file")
  local s3_key="${S3_PREFIX}/${DATE_PATH}/${filename}"
  local s3_path="s3://${S3_BUCKET}/${s3_key}"

  log "A enviar para S3: $s3_path"
  aws s3 cp "$local_file" "$s3_path" \
    --storage-class STANDARD_IA \
    || fail "Upload S3 falhou"

  # Actualiza ponteiro 'latest' para facilitar restore rápido
  echo "$s3_path" \
    | aws s3 cp - "s3://${S3_BUCKET}/${S3_PREFIX}/latest.txt" \
    || warn "Não foi possível actualizar latest.txt (não crítico)"

  local file_size
  file_size=$(du -sh "$local_file" | cut -f1)
  log "Upload concluído: $s3_path ($file_size)"
  echo "$s3_path"
}

# ── Aplicar política de retenção no S3 ───────────────────────
_prune_old_backups() {
  log "A verificar backups com mais de ${RETENTION_DAYS} dias para remoção..."

  # Calcula data-limite em ISO-8601 (funciona em Linux e macOS)
  local cutoff
  cutoff=$(date -d "-${RETENTION_DAYS} days" +%Y-%m-%dT%H:%M:%S 2>/dev/null \
         || date -v -"${RETENTION_DAYS}"d +%Y-%m-%dT%H:%M:%S 2>/dev/null \
         || echo "")

  if [ -z "$cutoff" ]; then
    warn "Não foi possível calcular data de corte — a saltar limpeza"
    return
  fi

  local count=0
  while IFS= read -r key; do
    [ -z "$key" ] && continue
    log "  A apagar backup expirado: s3://${S3_BUCKET}/${key}"
    aws s3 rm "s3://${S3_BUCKET}/${key}" && count=$((count + 1)) \
      || warn "  Não foi possível apagar: $key"
  done < <(
    aws s3 ls "s3://${S3_BUCKET}/${S3_PREFIX}/" --recursive \
      | awk -v cutoff="$cutoff" '$1 " " $2 < cutoff {print $4}' \
      | grep -E '\.(dump|dump\.gpg)$' \
      || true
  )

  log "Limpeza concluída: $count backup(s) expirado(s) removido(s)"
}

# ── Limpeza de ficheiros temporários ─────────────────────────
_cleanup() {
  rm -rf "$BACKUP_TMP"
}

# ── Main ──────────────────────────────────────────────────────
main() {
  trap _cleanup EXIT

  log "=========================================="
  log " INNOVA PostgreSQL Backup — Início"
  log "=========================================="

  _check_deps
  _parse_db_url

  local dump_file encrypted_file s3_path
  dump_file=$(_create_dump)
  encrypted_file=$(_encrypt_if_configured "$dump_file")
  s3_path=$(_upload_s3 "$encrypted_file")
  _prune_old_backups

  local final_size
  final_size=$(du -sh "$encrypted_file" | cut -f1)

  _notify "✅ INNOVA Backup OK: ${DB_NAME} → ${s3_path} (${final_size})"
  log "=========================================="
  log " Backup concluído com sucesso"
  log "=========================================="
}

main "$@"
