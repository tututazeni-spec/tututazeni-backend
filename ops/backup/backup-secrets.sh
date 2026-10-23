#!/usr/bin/env bash
# ============================================================
# INNOVA — Backup cifrado dos segredos/configuração do VPS
#
# Sem isto, perder o VPS = perder .env.production (DATABASE_URL, JWT, chaves
# S3, SMTP...) e o certificado Origin CA da Cloudflare, e o restore da BD fica
# bloqueado à espera de reconstruir segredos de memória.
#
# Inclui (relativo a INNOVA_DIR, por omissão /opt/innova):
#   .env.production, caddy/origin/ (cert.pem + key.pem), current_tag, current_frontend_tag
#
# Uso:
#   backup-secrets.sh                      # cria e envia para o S3
#   backup-secrets.sh --restore latest DIR # descarrega, decifra e extrai em DIR
#
# Cron (instalado por install-cron.sh): domingos 03:00.
# Variáveis: BACKUP_S3_BUCKET, BACKUP_ENCRYPT_PASSPHRASE (+ AWS_*), opcional
#   BACKUP_SECRETS_PREFIX (padrão innova/secrets), AWS_ENDPOINT.
#
# IMPORTANTE: a passphrase está no próprio .env.production. Guarda uma cópia
# FORA do VPS (cofre de passwords) ou este backup não se consegue abrir.
# ============================================================
set -euo pipefail
umask 077

INNOVA_DIR="${INNOVA_DIR:-/opt/innova}"
[ -z "${AWS_ENDPOINT:-}" ] || export AWS_ENDPOINT_URL="$AWS_ENDPOINT"
S3_BUCKET="${BACKUP_S3_BUCKET:?BACKUP_S3_BUCKET não definida}"
S3_PREFIX="${BACKUP_SECRETS_PREFIX:-innova/secrets}"
PASSPHRASE="${BACKUP_ENCRYPT_PASSPHRASE:?BACKUP_ENCRYPT_PASSPHRASE obrigatória}"
TMP="$(mktemp -d /tmp/innova-secrets-XXXXXX)"

log()  { echo "[$(date -Iseconds)] INFO  $*" >&2; }
fail() {
  echo "[$(date -Iseconds)] ERROR $*" >&2
  if [ -n "${TELEGRAM_BOT_TOKEN:-}" ] && [ -n "${TELEGRAM_CHAT_ID:-}" ]; then
    curl -s --max-time 10 "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
      -d chat_id="${TELEGRAM_CHAT_ID}" -d text="❌ INNOVA Backup de segredos FALHOU: $*" >/dev/null || true
  fi
  exit 1
}
trap 'rm -rf "$TMP"' EXIT

for cmd in tar gpg aws; do
  command -v "$cmd" >/dev/null 2>&1 || fail "Dependência em falta: $cmd"
done

# stdin leva os dados (pipe do tar), por isso a passphrase vai pelo fd 3
_gpg() { gpg --batch --yes --pinentry-mode loopback --passphrase-fd 3 "$@" 3< <(printf '%s' "$PASSPHRASE"); }

backup() {
  [ -f "${INNOVA_DIR}/.env.production" ] || fail "${INNOVA_DIR}/.env.production não existe"

  local files=(.env.production)
  local f
  for f in caddy/origin current_tag current_frontend_tag; do
    [ -e "${INNOVA_DIR}/${f}" ] && files+=("$f")
  done

  local name
  name="innova_secrets_$(date +%Y%m%d_%H%M%S).tar.gz.gpg"
  log "A empacotar: ${files[*]}"
  tar -C "$INNOVA_DIR" -czf - "${files[@]}" \
    | _gpg --symmetric --cipher-algo AES256 --output "${TMP}/${name}" \
    || fail "tar/gpg falhou"

  local dest
  dest="s3://${S3_BUCKET}/${S3_PREFIX}/$(date +%Y/%m)/${name}"
  aws s3 cp "${TMP}/${name}" "$dest" --storage-class STANDARD_IA >&2 || fail "Upload S3 falhou"
  printf '%s' "$dest" | aws s3 cp - "s3://${S3_BUCKET}/${S3_PREFIX}/latest.txt" >&2 \
    || fail "Não foi possível actualizar latest.txt"
  log "Backup de segredos enviado: $dest"
}

restore() {
  local src="${1:?uso: --restore <latest|s3://...> <dir-destino>}" dest_dir="${2:?indica o directório de destino}"
  if [ "$src" = "latest" ]; then
    src="$(aws s3 cp "s3://${S3_BUCKET}/${S3_PREFIX}/latest.txt" - )" || fail "latest.txt não encontrado"
  fi
  mkdir -p "$dest_dir"
  aws s3 cp "$src" "${TMP}/s.gpg" >&2 || fail "Download falhou"
  _gpg --decrypt "${TMP}/s.gpg" | tar -C "$dest_dir" -xzf - || fail "Decifra/extracção falhou (passphrase errada?)"
  log "Segredos restaurados em $dest_dir (rever permissões: chmod 600 .env.production caddy/origin/*.pem)"
}

case "${1:-backup}" in
  backup)    backup ;;
  --restore) shift; restore "$@" ;;
  *)         fail "Uso: $0 [--restore <latest|s3://...> <dir>]" ;;
esac
