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
echo "▶ rollback para a tag anterior: $PREV"
exec "$SCRIPT_DIR/deploy.sh" "$PREV"
