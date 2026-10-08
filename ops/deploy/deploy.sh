#!/usr/bin/env bash
# deploy.sh <image-tag> — actualiza a app para a imagem <tag> com health gate.
# Corre no directório do compose (localmente: ops/; no VPS: /opt/innova).
# Estado: current_tag (tag a correr) e previous_tag (para rollback.sh).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR/.."

TAG="${1:?uso: deploy.sh <image-tag>}"
COMPOSE_FILE="docker-compose.prod.yml"

# ─── Tag do frontend (serviço replicado à parte, imagem própria no GHCR) ────
# Precedência: $FRONTEND_TAG do ambiente (repository_dispatch) > current_frontend_tag
# (deploy anterior) > "latest" (primeira vez).
FTAG="${FRONTEND_TAG:-}"
if [ -z "$FTAG" ] && [ -f current_frontend_tag ]; then
  FTAG="$(cat current_frontend_tag)"
fi
FTAG="${FTAG:-latest}"

if [ -f current_frontend_tag ] && [ "$(cat current_frontend_tag)" != "$FTAG" ]; then
  cp current_frontend_tag previous_frontend_tag
fi
echo "$FTAG" > current_frontend_tag

if [ -f current_tag ] && [ "$(cat current_tag)" != "$TAG" ]; then
  cp current_tag previous_tag
fi
echo "$TAG" > current_tag

# ─── Monitorização (regra 9): gerar segredos a partir do .env.production ─────
# Prometheus/Alertmanager não expandem env vars — renderizamos aqui.
env_val() { grep -E "^$1=" .env.production | head -1 | cut -d= -f2-; }

echo "▶ a renderizar configuração de monitorização"
printf '%s' "$(env_val METRICS_TOKEN)" > monitoring/metrics_token
chmod 600 monitoring/metrics_token

# substituição nativa do bash — sem armadilhas de escaping do sed com URLs
am_cfg="$(cat monitoring/alertmanager.yml.tpl)"
for var in SMTP_HOST SMTP_PORT SMTP_USER SMTP_PASSWORD ALERT_EMAIL_TO \
           TELEGRAM_BOT_TOKEN TELEGRAM_CHAT_ID HEALTHCHECKS_PING_URL; do
  am_cfg="${am_cfg//\$\{${var}\}/$(env_val "$var")}"
done
printf '%s\n' "$am_cfg" > monitoring/alertmanager.yml
chmod 600 monitoring/alertmanager.yml

if grep -q '\${' monitoring/alertmanager.yml; then
  echo "❌ alertmanager.yml com placeholders por preencher — completar o .env.production"
  exit 1
fi

echo "▶ deploy da tag: $TAG"
# Escreve o BUILD_SHA no .env.production para exposição no GET /health
# (a tag é sha-<commit> quando vem do CI; caso contrário mantém o valor existente)
BUILD_SHA="${TAG#sha-}"
if grep -q '^BUILD_SHA=' .env.production 2>/dev/null; then
  sed -i "s|^BUILD_SHA=.*|BUILD_SHA=${BUILD_SHA}|" .env.production
else
  echo "BUILD_SHA=${BUILD_SHA}" >> .env.production
fi

IMAGE_TAG="$TAG" FRONTEND_IMAGE_TAG="$FTAG" docker compose -f "$COMPOSE_FILE" pull app migrate frontend \
  || echo "⚠ pull falhou — a usar imagem local se existir"

# `up -d` corre o job `migrate` até terminar (as réplicas `app` dependem de
# `service_completed_successfully`) e sobe/recria tudo o resto. Se a migração
# falhar, o compose sai != 0 → `set -e` aborta → o job de deploy falha → o
# workflow dispara o rollback automático.
IMAGE_TAG="$TAG" FRONTEND_IMAGE_TAG="$FTAG" docker compose -f "$COMPOSE_FILE" up -d

# configs de monitorização são bind-mounts — reiniciar para recarregar
IMAGE_TAG="$TAG" docker compose -f "$COMPOSE_FILE" restart prometheus alertmanager

# ─── Health gate: TODAS as réplicas de `app` têm de ficar healthy ───────────
# (substitui a verificação antiga por nome de container, que já não existe —
#  o serviço `app` passou a ser replicado, sem container_name.)
echo "▶ à espera das réplicas de app + frontend (máx 120s)..."
deadline=$((SECONDS + 120))
summary="app 0/0 · frontend 0/0"

# Define SVC_HEALTHY / SVC_TOTAL para o serviço $1.
svc_health() {
  local svc="$1" cid st ids
  SVC_TOTAL=0
  SVC_HEALTHY=0
  ids="$(docker compose -f "$COMPOSE_FILE" ps -q "$svc" || true)"
  for cid in $ids; do
    SVC_TOTAL=$((SVC_TOTAL + 1))
    st="$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "$cid" 2>/dev/null || echo none)"
    [ "$st" = "healthy" ] && SVC_HEALTHY=$((SVC_HEALTHY + 1))
  done
}

while [ "$SECONDS" -lt "$deadline" ]; do
  # `|| true`: svc_health termina no `[ … ] && …` do loop, cujo estado é != 0
  # quando o último container ainda não está healthy — sem guarda, o `set -e`
  # abortaria o gate antes do timeout. SVC_TOTAL/SVC_HEALTHY já ficam calculados.
  svc_health app || true
  a_healthy=$SVC_HEALTHY
  a_total=$SVC_TOTAL
  svc_health frontend || true
  f_healthy=$SVC_HEALTHY
  f_total=$SVC_TOTAL
  summary="app $a_healthy/$a_total · frontend $f_healthy/$f_total"
  if [ "$a_total" -ge 1 ] && [ "$a_healthy" -eq "$a_total" ] &&
    [ "$f_total" -ge 1 ] && [ "$f_healthy" -eq "$f_total" ]; then
    echo "✅ $summary — todas saudáveis (app=$TAG frontend=$FTAG)"
    exit 0
  fi
  echo "  … $summary"
  sleep 3
done

echo "❌ réplicas não ficaram saudáveis em 120s (última contagem: $summary)"
docker compose -f "$COMPOSE_FILE" ps app frontend || true
docker compose -f "$COMPOSE_FILE" logs --tail 50 app frontend || true
exit 1
