#!/usr/bin/env bash
# origin-firewall.sh — tranca 80/443 do VPS aos ranges da Cloudflare (ponto 4).
#
# Com a Cloudflare à frente (WAF + CDN), o origin só deve aceitar tráfego HTTP(S)
# que venha da Cloudflare. Sem isto, um atacante que descubra o IP do VPS fala
# directamente com o Caddy e contorna a WAF por completo.
#
# Idempotente. Correr como root. Instalar num cron semanal (a Cloudflare
# publica novos ranges de vez em quando):
#   10 4 * * 1 root /opt/innova/deploy/origin-firewall.sh >> /var/log/innova-origin-fw.log 2>&1
#
# Mantém em sincronia a lista `trusted_proxies` do ops/caddy/Caddyfile.
set -euo pipefail

V4_URL="https://www.cloudflare.com/ips-v4"
V6_URL="https://www.cloudflare.com/ips-v6"
COMMENT="cloudflare-origin"

command -v ufw >/dev/null || { echo "ufw não instalado"; exit 1; }

echo "▶ a obter ranges da Cloudflare"
v4="$(curl -fsS "$V4_URL")"
v6="$(curl -fsS "$V6_URL")"
[ -n "$v4" ] || { echo "lista v4 vazia — abortar (mantém regras actuais)"; exit 1; }

# Remover regras Cloudflare anteriores (por comentário) — da mais alta para a
# mais baixa, senão os números deslocam-se.
mapfile -t nums < <(ufw status numbered | grep -F "# $COMMENT" | sed -E 's/^\[[[:space:]]*([0-9]+)\].*/\1/' | sort -rn)
for n in "${nums[@]:-}"; do
  [ -n "$n" ] && ufw --force delete "$n" || true
done

echo "▶ a permitir 80,443 apenas da Cloudflare"
while read -r cidr; do
  [ -n "$cidr" ] || continue
  ufw allow proto tcp from "$cidr" to any port 80,443 comment "$COMMENT"
done <<< "$v4"$'\n'"$v6"

# Fechar 80/443 a toda a gente que não seja Cloudflare. SSH continua aberto
# pela regra OpenSSH pré-existente (ver runbook secção 1).
ufw deny 80/tcp   comment "$COMMENT" || true
ufw deny 443/tcp  comment "$COMMENT" || true

ufw --force enable
echo "✅ firewall de origem actualizada"
ufw status | grep -E "80|443" || true
