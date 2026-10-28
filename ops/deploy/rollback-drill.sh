#!/usr/bin/env bash
# rollback-drill.sh — ensaia o rollback e mede o tempo (alvo: minutos, nunca horas).
# Correr no VPS (staging!) como `deploy`, depois de pelo menos DOIS deploys (precisa de previous_tag):
#   /opt/innova/deploy/rollback-drill.sh
#
# 1. regista a tag actual → corre rollback.sh (health gate incluído) → mede segundos;
# 2. confirma que a tag em execução mudou para previous_tag;
# 3. volta à tag original com deploy.sh (o ensaio não deixa o ambiente na versão antiga);
# 4. grava o resultado em rollback-drill.log. Falha (exit 1) se algum passo falhar ou passar do alvo.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR/.."
TARGET_SECONDS="${ROLLBACK_TARGET_SECONDS:-300}"
LOG="rollback-drill.log"

[ -f current_tag ] && [ -f previous_tag ] || { echo "❌ faltam current_tag/previous_tag (precisa de 2 deploys)"; exit 1; }
ORIGINAL="$(cat current_tag)"
PREVIOUS="$(cat previous_tag)"
[ "$ORIGINAL" != "$PREVIOUS" ] || { echo "❌ current_tag == previous_tag, nada para ensaiar"; exit 1; }
if [ "${INNOVA_ENV:-}" = "production" ] && [ "${I_KNOW_THIS_IS_PRODUCTION:-}" != "yes" ]; then
  echo "❌ não ensaiar em produção sem I_KNOW_THIS_IS_PRODUCTION=yes"; exit 1
fi

log() { printf '%s %s\n' "$(date -u +%FT%TZ)" "$*" | tee -a "$LOG"; }
log "ensaio: $ORIGINAL → rollback para $PREVIOUS (alvo ${TARGET_SECONDS}s)"

start=$SECONDS
"$SCRIPT_DIR/rollback.sh"
elapsed=$((SECONDS - start))

[ "$(cat current_tag)" = "$PREVIOUS" ] || { log "❌ current_tag=$(cat current_tag), esperado $PREVIOUS"; exit 1; }
log "rollback concluído e saudável em ${elapsed}s"

log "a repor $ORIGINAL"
"$SCRIPT_DIR/deploy.sh" "$ORIGINAL"
[ "$(cat current_tag)" = "$ORIGINAL" ] || { log "❌ não voltou a $ORIGINAL"; exit 1; }

if [ "$elapsed" -gt "$TARGET_SECONDS" ]; then
  log "❌ rollback demorou ${elapsed}s (> ${TARGET_SECONDS}s) — rever imagem/pull/migrations"
  exit 1
fi
log "✅ ensaio OK: rollback em ${elapsed}s; ambiente de volta a $ORIGINAL"
