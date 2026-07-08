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

echo "▶ deploy da tag: $TAG"
IMAGE_TAG="$TAG" docker compose -f "$COMPOSE_FILE" pull app \
  || echo "⚠ pull falhou — a usar imagem local se existir"
IMAGE_TAG="$TAG" docker compose -f "$COMPOSE_FILE" up -d

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
