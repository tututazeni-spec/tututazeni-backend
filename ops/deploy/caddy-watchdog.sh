#!/usr/bin/env bash
# Reinicia o Caddy se o healthcheck o marcar `unhealthy`.
# O Docker Compose só reinicia por exit do processo, nunca por health — um Caddy
# pendurado (vivo mas sem servir) deixava o site em baixo. Corre por cron a cada
# minuto no host, SEM montar docker.sock num container (um sidecar "autoheal"
# daria root no host a quem comprometesse esse container).
set -euo pipefail

NAME="${CADDY_CONTAINER:-innova-caddy}"
STATE_FILE="/tmp/innova-caddy-unhealthy.count"
LIMIT="${CADDY_UNHEALTHY_LIMIT:-2}" # leituras consecutivas antes de reiniciar (evita flapping)

status="$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "$NAME" 2>/dev/null || echo missing)"

if [ "$status" != "unhealthy" ]; then
  rm -f "$STATE_FILE"
  exit 0
fi

count=$(($(cat "$STATE_FILE" 2>/dev/null || echo 0) + 1))
echo "$count" >"$STATE_FILE"
echo "[$(date -Iseconds)] $NAME unhealthy ($count/$LIMIT)"

if [ "$count" -ge "$LIMIT" ]; then
  echo "[$(date -Iseconds)] a reiniciar $NAME"
  docker restart "$NAME" >/dev/null
  rm -f "$STATE_FILE"
  if [ -n "${TELEGRAM_BOT_TOKEN:-}" ] && [ -n "${TELEGRAM_CHAT_ID:-}" ]; then
    curl -s --max-time 10 "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
      -d chat_id="${TELEGRAM_CHAT_ID}" -d text="⚠️ INNOVA: Caddy estava unhealthy — reiniciado automaticamente." >/dev/null || true
  fi
fi
