# Runbook — Deploy do INNOVA no VPS (regra 10)

> Pipeline: GitHub Actions → GHCR → SSH → `deploy.sh` (health gate) → smoke
> pós-deploy → rollback automático em falha. Workflow: `.github/workflows/deploy.yml`.
> Enquanto os secrets `DEPLOY_*` não existirem no repo, o workflow é um no-op.
> Alertas e monitorização (regra 9): ver `docs/deploy/alerting.md`.
> Borda WAF/CDN (Cloudflare): ver `docs/deploy/cloudflare.md`.
> Réplicas, load balancing e SPOF residuais: ver `docs/deploy/ha-and-spof.md`.

> **Topologia:** Cloudflare (WAF+CDN) → Caddy (TLS origin + load balancer) →
> serviço `app` com **2 réplicas** (round-robin). As migrations correm num job
> `migrate` one-shot antes das réplicas, não no arranque de cada container.

## 1. Provisionar o VPS (uma vez)

Requisitos: Ubuntu 22.04+ (ou equivalente), **4 vCPU / 8 GB RAM recomendado**
(2 réplicas da app + borda Caddy + stack de monitorização; ver o dimensionamento
detalhado em `docs/deploy/ha-and-spof.md`). Num host de 4 GB funciona com os
limites de memória do compose, mas sem folga. Docker Engine com o plugin compose.

Pré-requisitos de rede:
- Domínio adicionado à **Cloudflare**, registo DNS **Proxied** a apontar ao IP
  do VPS, certificado **Origin CA** colocado em `/opt/innova/caddy/origin/`
  (`cert.pem` + `key.pem`). Ver `docs/deploy/cloudflare.md`. Não há emissão
  Let's Encrypt — o Caddy usa o Origin CA.

```bash
# como root ou sudoer
curl -fsSL https://get.docker.com | sh
useradd -m -s /bin/bash deploy && usermod -aG docker deploy
mkdir -p /opt/innova/caddy/origin && chown -R deploy:deploy /opt/innova

# firewall mínimo (ufw): só SSH à mão aqui.
ufw allow OpenSSH && ufw enable
# 80/443 são abertos APENAS aos ranges da Cloudflare pelo origin-firewall.sh
# (ver secção 4). A porta 4000 nunca se abre e já nem é publicada no host —
# as 2 réplicas partilhariam a mesma porta. Debug: `docker compose exec app sh`.
```

O certificado Cloudflare Origin CA (`/opt/innova/caddy/origin/cert.pem` +
`key.pem`, `chmod 600`) tem de estar no sítio antes do primeiro `deploy.sh` —
senão o container `caddy` não arranca. Ver `ops/caddy/origin/README.md`.

Chave SSH dedicada ao deploy (no teu PC):

```bash
ssh-keygen -t ed25519 -C "github-deploy-innova" -f innova_deploy_key -N ""
# a pública vai para o VPS:
ssh-copy-id -i innova_deploy_key.pub deploy@<HOST>
# a privada vai para o secret DEPLOY_SSH_KEY (conteúdo completo do ficheiro)
```

## 2. Configurar o ambiente da app no VPS

```bash
# como deploy@<HOST>
cp /opt/innova/.env.production.example /opt/innova/.env.production   # ou criar à mão
chmod 600 /opt/innova/.env.production
```

Preencher `/opt/innova/.env.production` a partir de `ops/.env.production.example`
(DATABASE_URL do Postgres gerido, segredos JWT, METRICS_TOKEN, etc.).
O compose e os scripts são copiados/actualizados pelo próprio workflow em cada
deploy (`ops/` → `/opt/innova/`).

## 3. Secrets no GitHub (Settings → Secrets and variables → Actions)

| Secret | Conteúdo |
|---|---|
| `DEPLOY_HOST` | IP/hostname do VPS |
| `DEPLOY_USER` | `deploy` |
| `DEPLOY_SSH_KEY` | chave privada ed25519 (bloco completo) |
| `SMOKE_BASE_URL` | URL pública da app, ex. `https://<DOMAIN>/api` |
| `SMOKE_EMPLOYEE_EMAIL` / `SMOKE_EMPLOYEE_PASSWORD` | utilizador COLABORADOR real de smoke em produção |
| `SMOKE_RH_EMAIL` / `SMOKE_RH_PASSWORD` | utilizador RH real de smoke em produção |
| `SMOKE_COURSE_ID` | id de um curso publicado usado pela suite |
| `TELEGRAM_BOT_TOKEN` / `TELEGRAM_CHAT_ID` | (opcional) notificações de deploy |

Criar os utilizadores/curso de smoke na BD de produção antes do primeiro deploy
(a suite corre com `SMOKE_SEED=false` e `SMOKE_ALLOW_WRITES=false` — só leituras;
não cria nada).

## 4. Cloudflare + firewall de origem (ponto 4 — WAF/CDN)

Passo completo em `docs/deploy/cloudflare.md`. Resumo:

1. Site na Cloudflare, DNS **Proxied** → IP do VPS, SSL/TLS **Full (strict)**.
2. Certificado **Origin CA** → `/opt/innova/caddy/origin/{cert,key}.pem`.
3. WAF Managed Ruleset + Bot Fight Mode + rate limiting em `/api/auth/login`.
4. Cache Rule: `/api/*` → bypass; **Always Online: On**.
5. Trancar o origin aos ranges Cloudflare e agendar a actualização semanal:

   ```bash
   sudo chmod +x /opt/innova/deploy/origin-firewall.sh
   sudo /opt/innova/deploy/origin-firewall.sh
   echo '10 4 * * 1 root /opt/innova/deploy/origin-firewall.sh >> /var/log/innova-origin-fw.log 2>&1' \
     | sudo tee /etc/cron.d/innova-origin-fw
   ```

## 5. Primeiro deploy

1. Merge a `main` (ou Actions → Deploy → Run workflow).
2. Acompanhar os jobs: `build` → `deploy` → `verify` → (`rollback` só se falhar) → `notify`.
   No `deploy`: o job `migrate` corre primeiro (migrations), depois as 2 réplicas
   `app` — o health gate espera **ambas** `healthy`.
3. Confirmar:
   - `curl https://<DOMAIN>/api/health/ready` → 200
   - `curl -sI https://<DOMAIN>/api/health/ready | grep -i cf-ray` → há header (passa pela Cloudflare)
   - `curl -I http://<DOMAIN>` → 301/308 para https (redirecção da Cloudflare, "Always Use HTTPS")

## 6. Operação corrente

```bash
COMPOSE="docker compose -f /opt/innova/docker-compose.prod.yml"

# estado e logs (serviço replicado — sem nome de container fixo)
$COMPOSE ps
$COMPOSE logs -f app          # ambas as réplicas
$COMPOSE logs migrate         # última execução de migrations

# escalar réplicas à mão (temporário; o valor fixo está no compose)
$COMPOSE up -d --scale app=3 app

# tag a correr / anterior
cat /opt/innova/current_tag /opt/innova/previous_tag

# rollback manual (mesmo mecanismo do automático)
/opt/innova/deploy/rollback.sh

# deploy manual de uma tag específica (ex. voltar 3 versões atrás)
/opt/innova/deploy/deploy.sh sha-<commit>
```

Deploy de uma tag antiga via GitHub: Actions → Deploy → Run workflow → preencher
`tag` (ex. `sha-abc123`) — salta o build e faz deploy dessa imagem.

> **Janela de deploy:** um redeploy recria as 2 réplicas quase em simultâneo →
> ~5–15 s em que o Caddy faz retry e a Cloudflare pode servir cache. Deploy
> *rolling* sem downtime exige Swarm mode ou 2 nós — ver `docs/deploy/ha-and-spof.md`.

## 7. REGRA: migrations compatíveis com rollback (expand-contract)

As migrations correm no job `migrate` (one-shot, `prisma migrate deploy`), antes
das réplicas da app arrancarem. O rollback repõe a **imagem** anterior mas NÃO
desfaz migrations. Portanto toda a migration tem de ser compatível com a versão
anterior do código:

- ✅ adicionar coluna nullable/com default; adicionar tabela/índice.
- ❌ remover/renomear coluna ou tabela que o código anterior usa — só num deploy
  posterior àquele que deixou de a usar (expand → migrate → contract).
- Migrations destrutivas exigem plano manual (backup + janela) — fora do
  rollback automático.

## 8. Ensaio local do ciclo completo (sem VPS)

```bash
docker build -t innova-api:local .
docker tag innova-api:local ghcr.io/tututazeni-spec/tututazeni-backend:local-v1
docker tag innova-api:local ghcr.io/tututazeni-spec/tututazeni-backend:local-v2
# ops/.env.production local: ver ops/.env.production.example (BD innova_test do host)

# Caddy sem Cloudflare: gerar um par self-signed para o origin cert, senão o
# container `caddy` não arranca (não afecta o smoke, que bate em localhost:4000).
openssl req -x509 -newkey rsa:2048 -nodes -days 365 \
  -keyout ops/caddy/origin/key.pem -out ops/caddy/origin/cert.pem -subj "/CN=localhost"

bash ops/deploy/deploy.sh local-v1
bash ops/deploy/deploy.sh local-v2
bash ops/deploy/rollback.sh          # volta a local-v1
npm run test:regression              # smoke contra http://localhost:4000
IMAGE_TAG=local-v1 docker compose -f ops/docker-compose.prod.yml down
rm -f ops/current_tag ops/previous_tag ops/caddy/origin/*.pem
```
