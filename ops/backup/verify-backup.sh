#!/usr/bin/env bash
# ============================================================
# INNOVA — Verificação de integridade do último backup S3
#
# Corre semanalmente para confirmar que o backup está legível e restaurável.
# NÃO faz restore completo: usa pg_restore --list para validar estrutura.
# Notifica via Telegram no final.
#
# Cron recomendado (todos os domingos às 04:00):
#   0 4 * * 0 /opt/innova/backup/verify-backup.sh >> /var/log/innova-backup.log 2>&1
# ============================================================
set -euo pipefail

VERIFY_TMP="/tmp/innova-verify-$$"
S3_BUCKET="${BACKUP_S3_BUCKET:?BACKUP_S3_BUCKET não definida}"
S3_PREFIX="${BACKUP_S3_PREFIX:-innova/postgres}"
PASSPHRASE="${BACKUP_ENCRYPT_PASSPHRASE:-}"
MAX_AGE_HOURS="${BACKUP_MAX_AGE_HOURS:-26}"  # Alerta se backup tiver mais de 26h

log()  { echo "[$(date -Iseconds)] INFO  $*"; }
warn() { echo "[$(date -Iseconds)] WARN  $*" >&2; }
fail() {
  echo "[$(date -Iseconds)] ERROR $*" >&2
  _notify "❌ INNOVA Verify-Backup FALHOU: $*"
  exit 1
}

_notify() {
  local msg="$1"
  if [ -n "${TELEGRAM_BOT_TOKEN:-}" ] && [ -n "${TELEGRAM_CHAT_ID:-}" ]; then
    curl -s --max-time 10 \
      "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
      -d chat_id="${TELEGRAM_CHAT_ID}" \
      -d text="$msg" > /dev/null \
      || warn "Telegram: falha (não crítico)"
  fi
}

_cleanup() { rm -rf "$VERIFY_TMP"; }

main() {
  trap _cleanup EXIT
  mkdir -p "$VERIFY_TMP"

  log "=========================================="
  log " INNOVA Verify-Backup — Início"
  log "=========================================="

  # 1. Verificar que latest.txt existe
  log "A verificar latest.txt..."
  local s3_path
  s3_path=$(aws s3 cp "s3://${S3_BUCKET}/${S3_PREFIX}/latest.txt" - 2>/dev/null \
            || fail "latest.txt não encontrado — backup pode não ter corrido")
  log "  Último backup: $s3_path"

  # 2. Verificar idade do backup
  log "A verificar idade do último backup..."
  local backup_date
  backup_date=$(aws s3 ls "$s3_path" | awk '{print $1 "T" $2}' | head -1)
  if [ -n "$backup_date" ]; then
    local backup_epoch now_epoch age_hours
    backup_epoch=$(date -d "$backup_date" +%s 2>/dev/null \
                || date -j -f "%Y-%m-%dT%H:%M:%S" "$backup_date" +%s 2>/dev/null \
                || echo 0)
    now_epoch=$(date +%s)
    age_hours=$(( (now_epoch - backup_epoch) / 3600 ))
    log "  Idade do backup: ${age_hours}h (limite: ${MAX_AGE_HOURS}h)"
    if [ "$age_hours" -gt "$MAX_AGE_HOURS" ]; then
      fail "Backup desactualizado: ${age_hours}h (limite: ${MAX_AGE_HOURS}h) — verificar cron de backup"
    fi
  else
    warn "Não foi possível determinar a idade do backup"
  fi

  # 3. Descarregar backup para verificação
  log "A descarregar backup para verificação..."
  local filename
  filename=$(basename "$s3_path")
  local local_file="${VERIFY_TMP}/${filename}"
  aws s3 cp "$s3_path" "$local_file" \
    || fail "Download do backup falhou"

  local file_size
  file_size=$(du -sh "$local_file" | cut -f1)
  log "  Tamanho: $file_size"

  # 4. Desencriptar se necessário
  if [[ "$local_file" == *.gpg ]]; then
    [ -n "$PASSPHRASE" ] \
      || fail "Ficheiro encriptado mas BACKUP_ENCRYPT_PASSPHRASE não definida"
    log "A desencriptar para verificação..."
    local decrypted="${local_file%.gpg}"
    gpg --batch --yes \
      --passphrase "$PASSPHRASE" \
      --decrypt \
      --output "$decrypted" \
      "$local_file" \
      || fail "Desencriptação GPG falhou — chave/passphrase incorrecta?"
    rm -f "$local_file"
    local_file="$decrypted"
  fi

  # 5. Validar estrutura do dump (sem restaurar na BD)
  log "A validar estrutura do dump (pg_restore --list)..."
  local toc_entries
  toc_entries=$(pg_restore --list "$local_file" 2>/dev/null | wc -l | tr -d ' ')
  log "  Entradas no TOC: $toc_entries"
  [ "$toc_entries" -gt 10 ] \
    || fail "Dump parece vazio ou corrompido: apenas $toc_entries entradas no TOC"

  # 6. Verificar que tabelas críticas estão presentes no dump
  log "A verificar tabelas críticas no dump..."
  local missing=0
  for table in User Course Enrollment Department Role AuditLog; do
    if pg_restore --list "$local_file" 2>/dev/null | grep -q "TABLE DATA public $table"; then
      log "  ✓ $table"
    else
      warn "  ✗ $table NÃO encontrada no dump"
      missing=$((missing + 1))
    fi
  done
  [ "$missing" -eq 0 ] \
    || fail "$missing tabela(s) crítica(s) em falta no dump — backup possivelmente incompleto"

  _notify "✅ INNOVA Verify-Backup OK: ${file_size}, ${toc_entries} entradas, todas as tabelas críticas presentes. Backup: $(basename "$s3_path")"
  log "=========================================="
  log " Verificação concluída com sucesso"
  log "=========================================="
}

main "$@"
