#!/usr/bin/env bash
# Testa a lógica de precedência da tag do frontend do deploy.sh, isolada.
set -euo pipefail
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
cd "$tmp"

resolve() { # replica o bloco do deploy.sh
  FTAG="${FRONTEND_TAG:-}"
  if [ -z "$FTAG" ] && [ -f current_frontend_tag ]; then FTAG="$(cat current_frontend_tag)"; fi
  FTAG="${FTAG:-latest}"
  if [ -f current_frontend_tag ] && [ "$(cat current_frontend_tag)" != "$FTAG" ]; then
    cp current_frontend_tag previous_frontend_tag
  fi
  echo "$FTAG" > current_frontend_tag
}

# 1. primeira vez, sem env, sem ficheiro → latest
( unset FRONTEND_TAG; resolve ); [ "$(cat current_frontend_tag)" = "latest" ] || { echo "FAIL 1"; exit 1; }
# 2. env definido → usa o env e roda o anterior para previous
( FRONTEND_TAG=sha-aaa resolve ); [ "$(cat current_frontend_tag)" = "sha-aaa" ] || { echo "FAIL 2a"; exit 1; }
[ "$(cat previous_frontend_tag)" = "latest" ] || { echo "FAIL 2b"; exit 1; }
# 3. sem env, com current → mantém current, não toca previous
( unset FRONTEND_TAG; resolve ); [ "$(cat current_frontend_tag)" = "sha-aaa" ] || { echo "FAIL 3a"; exit 1; }
[ "$(cat previous_frontend_tag)" = "latest" ] || { echo "FAIL 3b"; exit 1; }
# 4. novo env → previous passa a ser o current antigo
( FRONTEND_TAG=sha-bbb resolve ); [ "$(cat previous_frontend_tag)" = "sha-aaa" ] || { echo "FAIL 4"; exit 1; }

echo "ALL_OK"
