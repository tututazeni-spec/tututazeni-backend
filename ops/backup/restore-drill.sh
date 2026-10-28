#!/usr/bin/env bash
# ============================================================
# INNOVA — Teste de restauro (restore drill)
#
# Restaura o último backup S3 num Postgres DESCARTÁVEL (container efémero, sem
# portas publicadas, sem tocar na BD de produção) e confirma que as tabelas
# críticas têm linhas. É a única prova de que o backup realmente restaura —
# verify-backup.sh só valida o TOC do dump.
#
# Escreve a métrica innova_restore_drill_last_success_timestamp_seconds no
# textfile collector (alerta RestoreDrillTooOld) e notifica por Telegram.
#
# Cron (instalado por install-cron.sh): dia 1 de cada mês às 05:00.
# Requer: aws cli, docker, gpg (se cifrado), BACKUP_* no ambiente.
# ============================================================
set -euo pipefail

DRILL_TMP="$(mktemp -d /tmp/innova-drill-XXXXXX)"
CONTAINER="innova-restore-drill-$$"
PG_IMAGE="${DRILL_PG_IMAGE:-postgres:16}"
[ -z "${AWS_ENDPOINT:-}" ] || export AWS_ENDPOINT_URL="$AWS_ENDPOINT"
S3_BUCKET="${BACKUP_S3_BUCKET:?BACKUP_S3_BUCKET não definida}"
S3_PREFIX="${BACKUP_S3_PREFIX:-innova/postgres}"
PASSPHRASE="${BACKUP_ENCRYPT_PASSPHRASE:-}"
METRICS_DIR="/var/lib/node-exporter/textfile_collector"
METRICS_FILE="${METRICS_DIR}/innova_restore_drill.prom"
CRITICAL_TABLES=(User Course Enrollment Department Role AuditLog)

log() { echo "[$(date -Iseconds)] INFO  $*"; }
notify() {
  [ -n "${TELEGRAM_BOT_TOKEN:-}" ] && [ -n "${TELEGRAM_CHAT_ID:-}" ] || return 0
  curl -s --max-time 10 "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
    -d chat_id="${TELEGRAM_CHAT_ID}" -d text="$1" >/dev/null || true
}
fail() {
  echo "[$(date -Iseconds)] ERROR $*" >&2
  notify "❌ INNOVA restore drill FALHOU: $*"
  exit 1
}
cleanup() {
  docker rm -f "$CONTAINER" >/dev/null 2>&1 || true
  rm -rf "$DRILL_TMP"
}
trap cleanup EXIT

s3_path="$(aws s3 cp "s3://${S3_BUCKET}/${S3_PREFIX}/latest.txt" - 2>/dev/null)" \
  || fail "latest.txt não encontrado"
log "Backup a restaurar: $s3_path"

dump="${DRILL_TMP}/$(basename "$s3_path")"
aws s3 cp "$s3_path" "$dump" >/dev/null || fail "download falhou"

if [[ "$dump" == *.gpg ]]; then
  [ -n "$PASSPHRASE" ] || fail "dump cifrado mas BACKUP_ENCRYPT_PASSPHRASE não definida"
  printf '%s' "$PASSPHRASE" | gpg --batch --yes --pinentry-mode loopback --passphrase-fd 0 \
    --decrypt --output "${dump%.gpg}" "$dump" || fail "desencriptação falhou"
  dump="${dump%.gpg}"
fi

# Container efémero: rede própria desnecessária — sem -p, só acessível via docker exec.
pw="$(head -c 18 /dev/urandom | base64 | tr -dc 'A-Za-z0-9')"
docker run -d --name "$CONTAINER" --memory 1g -e POSTGRES_PASSWORD="$pw" "$PG_IMAGE" >/dev/null \
  || fail "não foi possível arrancar o Postgres descartável"

for _ in $(seq 1 30); do
  docker exec "$CONTAINER" pg_isready -U postgres >/dev/null 2>&1 && break
  sleep 2
done
docker exec "$CONTAINER" pg_isready -U postgres >/dev/null 2>&1 || fail "Postgres descartável não ficou pronto"

docker exec "$CONTAINER" createdb -U postgres drill
log "A restaurar (pg_restore)..."
# --no-owner/--no-privileges: os roles de produção não existem aqui. Avisos de
# extensões/roles são esperados; o critério de sucesso é o conteúdo das tabelas.
docker exec -i "$CONTAINER" pg_restore -U postgres -d drill --no-owner --no-privileges <"$dump" \
  >"${DRILL_TMP}/restore.log" 2>&1 || log "pg_restore devolveu avisos (ver critério de linhas abaixo)"

empty=()
for t in "${CRITICAL_TABLES[@]}"; do
  n="$(docker exec "$CONTAINER" psql -U postgres -d drill -tA -c "SELECT count(*) FROM \"$t\"" 2>/dev/null || echo ERR)"
  log "  $t: $n linhas"
  if [ "$n" = "ERR" ] || [ "$n" = "0" ]; then empty+=("$t"); fi
done
[ "${#empty[@]}" -eq 0 ] || fail "tabelas vazias/ilegíveis após restauro: ${empty[*]}"

# Dados de teste não podem chegar a produção: contas @innova-test.com / load.test.* no backup real
# são um alerta (não falha o drill — o restauro em si está provado).
test_users="$(docker exec "$CONTAINER" psql -U postgres -d drill -tA -c   "SELECT count(*) FROM \"User\" WHERE email ILIKE '%@innova-test.com' OR email ILIKE 'load.test.%'" 2>/dev/null || echo ERR)"
if [ "$test_users" != "0" ] && [ "$test_users" != "ERR" ]; then
  log "AVISO: $test_users utilizadores de teste encontrados na BD restaurada"
  notify "⚠️ INNOVA restore drill: $test_users utilizadores de teste (@innova-test.com / load.test.*) na BD de produção — remover."
fi

# Migrações sobre uma cópia REAL dos dados: prova que `prisma migrate deploy` aplica o que está
# pendente em cima de dados de produção (e não só numa BD vazia, como no CI). Opcional: definir
# DRILL_MIGRATE_IMAGE com a imagem da app actual (ex.: a que está em produção ou a candidata).
if [ -n "${DRILL_MIGRATE_IMAGE:-}" ]; then
  log "A aplicar migrações pendentes sobre a cópia restaurada (${DRILL_MIGRATE_IMAGE})..."
  docker run --rm --network "container:${CONTAINER}"     -e DATABASE_URL="postgresql://postgres:${pw}@127.0.0.1:5432/drill"     --entrypoint npx "$DRILL_MIGRATE_IMAGE" prisma migrate deploy >"${DRILL_TMP}/migrate.log" 2>&1     || { tail -n 20 "${DRILL_TMP}/migrate.log" >&2; fail "prisma migrate deploy falhou sobre a cópia dos dados reais"; }
  log "Migrações aplicadas sem erros sobre dados reais"
fi

mkdir -p "$METRICS_DIR" 2>/dev/null || true
if [ -d "$METRICS_DIR" ]; then
  tmp="$(mktemp "${METRICS_DIR}/.drill.XXXXXX")"
  {
    echo "# HELP innova_restore_drill_last_success_timestamp_seconds Último restauro de teste bem-sucedido"
    echo "# TYPE innova_restore_drill_last_success_timestamp_seconds gauge"
    echo "innova_restore_drill_last_success_timestamp_seconds $(date +%s)"
  } >"$tmp"
  chmod 644 "$tmp"
  mv "$tmp" "$METRICS_FILE"
fi

notify "✅ INNOVA restore drill OK: $(basename "$s3_path") restaurado e tabelas críticas com dados."
log "Restore drill concluído com sucesso"
