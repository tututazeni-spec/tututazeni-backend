#!/usr/bin/env bash
# rollback.sh — repõe a imagem registada em previous_tag (health gate incluído).
# Nota: após um rollback, previous_tag passa a ser a tag má — um segundo
# rollback seguido voltaria a ela. Para repor uma tag arbitrária: deploy.sh <tag>.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR/.."

if [ ! -f previous_tag ]; then
  echo "❌ sem previous_tag — nada para repor"
  exit 1
fi

PREV="$(cat previous_tag)"
if [ -f previous_frontend_tag ]; then
  FRONTEND_TAG="$(cat previous_frontend_tag)"
  export FRONTEND_TAG
  echo "▶ rollback para: app=$PREV · frontend=$FRONTEND_TAG"
else
  echo "▶ rollback para: app=$PREV · frontend=<inalterado>"
fi
exec "$SCRIPT_DIR/deploy.sh" "$PREV"
