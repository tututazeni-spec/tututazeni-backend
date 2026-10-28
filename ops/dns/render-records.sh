#!/usr/bin/env bash
# render-records.sh — imprime os registos DNS a criar (formato de zona) para app + e-mail.
# Só imprime: não altera DNS. Cria-os no painel do registrador/Cloudflare e valida com
#   npm run ops:dns-check
#
#   DOMAIN=innova.ao APP_HOST=app.innova.ao \
#   SPF_INCLUDE=spf.brevo.com DKIM_SELECTOR=brevo1 DKIM_TARGET=brevo1._domainkey.brevo.com \
#   DMARC_RUA=dmarc@innova.ao ./ops/dns/render-records.sh
#
# ORIGIN_IP = IPv4 do VPS (o registo é "proxied" na Cloudflare). SPF_INCLUDE/DKIM_* vêm do painel
# do fornecedor SMTP. Opcionais: DMARC_RUA, DMARC_POLICY (none), SPF_ALL (-all).
set -euo pipefail

: "${DOMAIN:?defina DOMAIN (ex.: innova.ao)}"
: "${APP_HOST:?defina APP_HOST (ex.: app.innova.ao)}"
: "${ORIGIN_IP:?defina ORIGIN_IP (IPv4 do VPS)}"
: "${SPF_INCLUDE:?defina SPF_INCLUDE (ex.: spf.brevo.com)}"
: "${DKIM_SELECTOR:?defina DKIM_SELECTOR}"
: "${DKIM_TARGET:?defina DKIM_TARGET (CNAME dado pelo fornecedor)}"
DMARC_RUA="${DMARC_RUA:-dmarc@${DOMAIN}}"
DMARC_POLICY="${DMARC_POLICY:-none}" # none → quarantine → reject (ver docs/deploy/dns-e-email.md)
SPF_ALL="${SPF_ALL:--all}"

case "$DMARC_POLICY" in none | quarantine | reject) ;; *) echo "DMARC_POLICY inválida: $DMARC_POLICY" >&2; exit 1 ;; esac
case "$SPF_ALL" in -all | '~all') ;; *) echo "SPF_ALL tem de ser -all ou ~all" >&2; exit 1 ;; esac

cat <<RECORDS
; ── Aplicação (proxied na Cloudflare) ─────────────────────────────
${APP_HOST}.                      300  IN  A      ${ORIGIN_IP}
; ── Emissão de certificados limitada ──────────────────────────────
${DOMAIN}.                        3600 IN  CAA    0 issue "letsencrypt.org"
${DOMAIN}.                        3600 IN  CAA    0 issue "pki.goog"
; ── E-mail: SPF (UM único registo v=spf1 por domínio) ─────────────
${DOMAIN}.                        3600 IN  TXT    "v=spf1 include:${SPF_INCLUDE} ${SPF_ALL}"
; ── E-mail: DKIM (activar também a assinatura no painel do fornecedor)
${DKIM_SELECTOR}._domainkey.${DOMAIN}.  3600 IN  CNAME  ${DKIM_TARGET}.
; ── E-mail: DMARC ─────────────────────────────────────────────────
_dmarc.${DOMAIN}.                 3600 IN  TXT    "v=DMARC1; p=${DMARC_POLICY}; rua=mailto:${DMARC_RUA}; adkim=s; aspf=s"
RECORDS
echo "; MX: apontar para a caixa real do domínio (não gerado aqui)." >&2
