#!/usr/bin/env bash
# bootstrap-vps.sh — prepara um VPS Ubuntu 22.04/24.04 limpo para o deploy.sh (staging ou produção).
# Idempotente. Correr como root, uma vez, ANTES do primeiro deploy do CI:
#   curl -fsSL <raw>/ops/deploy/bootstrap-vps.sh | sudo DEPLOY_PUBKEY="ssh-ed25519 AAAA… ci" bash
#   (ou copiar o ficheiro e: sudo DEPLOY_PUBKEY="…" bash bootstrap-vps.sh)
#
# Faz: Docker + compose, utilizador `deploy` (só chave, sem password), /opt/innova, ufw com SSH,
# fail2ban, actualizações de segurança automáticas, SSH sem root nem password, swap de 2 GB.
# NÃO faz: .env.production, certificados Origin CA, firewall da Cloudflare (origin-firewall.sh),
# crons de backup (install-cron.sh) — são passos seguintes em docs/deploy/staging-e-rollback.md.
set -euo pipefail

[ "$(id -u)" -eq 0 ] || { echo "❌ correr como root"; exit 1; }
: "${DEPLOY_PUBKEY:?defina DEPLOY_PUBKEY com a chave pública SSH do CI (par STAGING_SSH_KEY)}"
case "$DEPLOY_PUBKEY" in ssh-ed25519\ * | ssh-rsa\ * | ecdsa-sha2-*) ;; *) echo "❌ DEPLOY_PUBKEY não parece uma chave pública SSH"; exit 1 ;; esac

DEPLOY_USER="${DEPLOY_USER:-deploy}"
INNOVA_DIR="${INNOVA_DIR:-/opt/innova}"
export DEBIAN_FRONTEND=noninteractive

echo "▶ pacotes base"
apt-get update -qq
apt-get install -y -qq ca-certificates curl gnupg ufw fail2ban unattended-upgrades awscli postgresql-client cron >/dev/null

if ! command -v docker >/dev/null; then
  echo "▶ Docker (repositório oficial)"
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc
  # shellcheck disable=SC1091
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
    > /etc/apt/sources.list.d/docker.list
  apt-get update -qq
  apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-compose-plugin >/dev/null
fi
systemctl enable --now docker

echo "▶ utilizador $DEPLOY_USER"
id "$DEPLOY_USER" >/dev/null 2>&1 || adduser --disabled-password --gecos "" "$DEPLOY_USER"
usermod -aG docker "$DEPLOY_USER"
install -d -m 700 -o "$DEPLOY_USER" -g "$DEPLOY_USER" "/home/$DEPLOY_USER/.ssh"
auth="/home/$DEPLOY_USER/.ssh/authorized_keys"
touch "$auth"
grep -qxF "$DEPLOY_PUBKEY" "$auth" || echo "$DEPLOY_PUBKEY" >> "$auth"
chown "$DEPLOY_USER:$DEPLOY_USER" "$auth"
chmod 600 "$auth"

echo "▶ $INNOVA_DIR"
install -d -m 750 -o "$DEPLOY_USER" -g "$DEPLOY_USER" "$INNOVA_DIR" "$INNOVA_DIR/deploy" "$INNOVA_DIR/caddy/origin"
touch /var/log/innova-backup.log
chown "$DEPLOY_USER:$DEPLOY_USER" /var/log/innova-backup.log

echo "▶ SSH: sem root e sem password"
cat > /etc/ssh/sshd_config.d/99-innova.conf <<'CONF'
PermitRootLogin no
PasswordAuthentication no
KbdInteractiveAuthentication no
CONF
sshd -t && systemctl reload ssh

echo "▶ firewall (SSH agora; 80/443 só da Cloudflare via origin-firewall.sh)"
ufw allow OpenSSH >/dev/null
ufw default deny incoming >/dev/null
ufw default allow outgoing >/dev/null
ufw --force enable >/dev/null

echo "▶ fail2ban + actualizações de segurança"
systemctl enable --now fail2ban
dpkg-reconfigure -f noninteractive unattended-upgrades

if ! swapon --show | grep -q .; then
  echo "▶ swap 2 GB (rede de segurança contra OOM de picos)"
  fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile >/dev/null && swapon /swapfile
  grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

echo
echo "✅ VPS preparado. Seguintes passos (docs/deploy/staging-e-rollback.md):"
echo "   1. copiar .env.production e ops/caddy/origin/* para $INNOVA_DIR (chmod 600 no .env)"
echo "   2. configurar os secrets do GitHub (STAGING_HOST, STAGING_USER, STAGING_SSH_KEY, …)"
echo "   3. fazer o primeiro deploy pelo CI; depois: sudo $INNOVA_DIR/deploy/origin-firewall.sh"
