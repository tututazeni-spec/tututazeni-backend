#!/usr/bin/env bash
# ============================================================
# INNOVA — Activação do sistema de backup (agnóstico de provedor)
#
# Compatível com qualquer S3-compatible via AWS_ENDPOINT:
#   AWS S3        → AWS_ENDPOINT vazio (comportamento nativo)
#   Cloudflare R2 → AWS_ENDPOINT=https://ACCOUNT.r2.cloudflarestorage.com
#   Backblaze B2  → AWS_ENDPOINT=https://s3.REGION.backblazeb2.com
#   MinIO         → AWS_ENDPOINT=http://MINIO_HOST:9000
#
# Uso (no VPS, após o primeiro deploy):
#   bash /opt/innova/backup/setup-backup.sh
# ============================================================
set -euo pipefail

INNOVA_DIR="${INNOVA_DIR:-/opt/innova}"
ENV_FILE="${INNOVA_DIR}/.env.production"
BACKUP_DIR="${INNOVA_DIR}/backup"

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'

log()    { echo -e "${GREEN}✔${NC}  $*"; }
warn()   { echo -e "${YELLOW}⚠${NC}  $*" >&2; }
fail()   { echo -e "${RED}❌${NC}  $*" >&2; exit 1; }

_section() {
  echo ""
  echo "════════════════════════════════════════════"
  printf "  Passo %s — %s\n" "$1" "$2"
  echo "════════════════════════════════════════════"
}

_prompt() {
  local label="$1"
  printf "  %s: " "$label" >&2
  local val
  read -r val
  printf '%s' "$val"
}

_aws() {
  if [ -n "${AWS_ENDPOINT:-}" ]; then
    aws --endpoint-url "$AWS_ENDPOINT" "$@"
  else
    aws "$@"
  fi
}

_upsert_env() {
  local key="$1" val="$2"
  local tmp
  tmp="${ENV_FILE}.tmp.$$"
  # Create owner-only BEFORE any secret lands in the file
  ( umask 077; : > "$tmp" )
  grep -v "^${key}=" "$ENV_FILE" 2>/dev/null >> "$tmp" || true
  printf '%s=%s\n' "$key" "$val" >> "$tmp"
  chmod 600 "$tmp"
  mv "$tmp" "$ENV_FILE"
}

# ── Passo 1: Dependências ─────────────────────────────────────
_section 1 "Verificar dependências"

MISSING=0
for cmd in aws pg_dump gpg; do
  if command -v "$cmd" >/dev/null 2>&1; then
    log "$cmd: $(command -v "$cmd")"
  else
    warn "$cmd NÃO encontrado"
    case "$cmd" in
      aws)     echo "     Instalar: sudo apt install awscli" ;;
      pg_dump) echo "     Instalar: sudo apt install postgresql-client" ;;
      gpg)     echo "     Instalar: sudo apt install gnupg" ;;
    esac
    MISSING=$((MISSING + 1))
  fi
done

WALG_AVAILABLE=false
if command -v wal-g >/dev/null 2>&1; then
  log "wal-g: $(command -v wal-g) — crons WAL-G serão configurados"
  WALG_AVAILABLE=true
else
  warn "wal-g não encontrado — só pg_dump será configurado agora"
  warn "Para instalar WAL-G depois: bash ${BACKUP_DIR}/walg/install-walg.sh"
fi

[ "$MISSING" -eq 0 ] \
  || fail "${MISSING} dependência(s) em falta. Instalar e correr de novo."

# ── Passo 2: Configurar provedor ──────────────────────────────
_section 2 "Configurar provedor S3-compatible"

[ -f "$ENV_FILE" ] && {
  # shellcheck disable=SC1090
  set -o allexport; source "$ENV_FILE"; set +o allexport
  log "Variáveis existentes carregadas de $ENV_FILE"
}

[ -z "${BACKUP_S3_BUCKET:-}" ] \
  && BACKUP_S3_BUCKET=$(_prompt "Nome do bucket S3 (ex: innova-backups-prod)")
[ -z "${AWS_ACCESS_KEY_ID:-}" ] \
  && AWS_ACCESS_KEY_ID=$(_prompt "AWS_ACCESS_KEY_ID")
[ -z "${AWS_SECRET_ACCESS_KEY:-}" ] \
  && AWS_SECRET_ACCESS_KEY=$(_prompt "AWS_SECRET_ACCESS_KEY")
[ -z "${AWS_DEFAULT_REGION:-}" ] \
  && AWS_DEFAULT_REGION=$(_prompt "Região (ex: eu-south-1 ou auto para R2)")

if [ -z "${AWS_ENDPOINT:-}" ]; then
  echo "  AWS_ENDPOINT — exemplos:"
  echo "    Cloudflare R2: https://ACCOUNT.r2.cloudflarestorage.com"
  echo "    Backblaze B2 : https://s3.REGION.backblazeb2.com"
  echo "    AWS nativo   : deixar vazio"
  AWS_ENDPOINT=$(_prompt "AWS_ENDPOINT (Enter para AWS nativo)")
fi

if [ -z "${BACKUP_ENCRYPT_PASSPHRASE:-}" ]; then
  SUGGESTED=$(openssl rand -base64 32 2>/dev/null || echo "GERAR_MANUALMENTE")
  echo "  Passphrase GPG para encriptação. Sugestão: ${SUGGESTED}"
  BACKUP_ENCRYPT_PASSPHRASE=$(_prompt "BACKUP_ENCRYPT_PASSPHRASE")
fi

export AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY AWS_DEFAULT_REGION \
       AWS_ENDPOINT BACKUP_S3_BUCKET BACKUP_ENCRYPT_PASSPHRASE

touch "$ENV_FILE"
_upsert_env "BACKUP_S3_BUCKET"          "$BACKUP_S3_BUCKET"
_upsert_env "AWS_ACCESS_KEY_ID"         "$AWS_ACCESS_KEY_ID"
_upsert_env "AWS_SECRET_ACCESS_KEY"     "$AWS_SECRET_ACCESS_KEY"
_upsert_env "AWS_DEFAULT_REGION"        "$AWS_DEFAULT_REGION"
_upsert_env "AWS_ENDPOINT"              "$AWS_ENDPOINT"
_upsert_env "BACKUP_ENCRYPT_PASSPHRASE" "$BACKUP_ENCRYPT_PASSPHRASE"
_upsert_env "BACKUP_RETENTION_DAYS"     "${BACKUP_RETENTION_DAYS:-30}"
chmod 600 "$ENV_FILE"
log "Variáveis guardadas em $ENV_FILE (permissões 600)"

# ── Passo 3: Testar conectividade ─────────────────────────────
_section 3 "Testar conectividade ao S3"

if _aws s3 ls "s3://${BACKUP_S3_BUCKET}/" > /dev/null 2>&1; then
  log "Conectividade OK: s3://${BACKUP_S3_BUCKET}/"
else
  warn "Bucket s3://${BACKUP_S3_BUCKET}/ não encontrado ou sem acesso"
  printf "  Criar o bucket agora? [s/N]: "
  read -r CREATE_BUCKET
  if [ "${CREATE_BUCKET}" = "s" ] || [ "${CREATE_BUCKET}" = "S" ]; then
    _aws s3 mb "s3://${BACKUP_S3_BUCKET}/" \
      && log "Bucket criado" \
      || fail "Não foi possível criar o bucket. Verificar permissões IAM."
  else
    fail "Sem acesso ao bucket. Verificar credenciais e nome do bucket."
  fi
fi

# ── Passo 4: Primeiro backup de teste ─────────────────────────
_section 4 "Primeiro backup de teste (pg_dump → S3)"

# shellcheck disable=SC1090
. "$ENV_FILE"
[ -n "${DATABASE_URL:-}" ] \
  || fail "DATABASE_URL não definida em ${ENV_FILE}. Preencher antes de continuar."

chmod +x "${BACKUP_DIR}/backup-postgres.sh"
"${BACKUP_DIR}/backup-postgres.sh" \
  && log "Primeiro backup concluído" \
  || fail "Backup falhou. Ver erros acima."

# ── Passo 5: Instalar crons ───────────────────────────────────
_section 5 "Instalar cron jobs"

chmod +x "${BACKUP_DIR}/install-cron.sh"
bash "${BACKUP_DIR}/install-cron.sh"

if [ "$WALG_AVAILABLE" = "true" ]; then
  chmod +x "${BACKUP_DIR}/walg/install-cron-walg.sh"
  bash "${BACKUP_DIR}/walg/install-cron-walg.sh" \
    || warn "Crons WAL-G: falha (instalar manualmente depois)"
fi

echo ""
log "Crontab INNOVA activo:"
crontab -l 2>/dev/null | grep "INNOVA" | sed 's/^/    /' || warn "Nenhum cron INNOVA encontrado"

# ── Passo 6: Smoke test final ─────────────────────────────────
_section 6 "Smoke test (verify-backup.sh)"

chmod +x "${BACKUP_DIR}/verify-backup.sh"
"${BACKUP_DIR}/verify-backup.sh" \
  && log "Smoke test OK — backup legível no S3" \
  || fail "Smoke test falhou. Ver logs acima."

echo ""
echo "════════════════════════════════════════════"
echo " Sistema de backup activado com sucesso!"
echo ""
echo " Próximos passos obrigatórios:"
echo "  1. Preencher contactos em ops/dr/DISASTER-RECOVERY.md"
echo "  2. Agendar DR drill (restore em staging)"
if [ "$WALG_AVAILABLE" = "false" ]; then
echo "  3. Instalar WAL-G (RPO ≤ 60s):"
echo "     bash ${BACKUP_DIR}/walg/install-walg.sh"
fi
echo ""
echo " Logs: tail -f /var/log/innova-backup.log"
echo "════════════════════════════════════════════"
