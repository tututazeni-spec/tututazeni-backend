#!/usr/bin/env bash
# deploy.sh <image-tag> — actualiza a app para a imagem <tag> com health gate.
# Corre no directório do compose (localmente: ops/; no VPS: /opt/innova).
# Estado: current_tag (tag a correr) e previous_tag (para rollback.sh).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR/.."

TAG="${1:?uso: deploy.sh <image-tag>}"
COMPOSE_FILE="docker-compose.prod.yml"

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

IMAGE_TAG="$TAG" docker compose -f "$COMPOSE_FILE" pull app \
  || echo "⚠ pull falhou — a usar imagem local se existir"
IMAGE_TAG="$TAG" docker compose -f "$COMPOSE_FILE" up -d

# configs de monitorização são bind-mounts — reiniciar para recarregar
IMAGE_TAG="$TAG" docker compose -f "$COMPOSE_FILE" restart prometheus alertmanager

echo "▶ à espera do health de innova-app (máx 90s)..."
STATUS="starting"
for _ in $(seq 1 30); do
  STATUS="$(docker inspect -f '{{.State.Health.Status}}' innova-app 2>/dev/null || echo starting)"
  if [ "$STATUS" = "healthy" ]; then
    echo "✅ app saudável com a tag $TAG"
    exit 0
  fi
  sleep 3
done

echo "❌ app não ficou saudável em 90s (estado: $STATUS)"
docker logs --tail 50 innova-app || true
exit 1
