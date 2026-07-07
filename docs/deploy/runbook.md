# Runbook — Deploy do INNOVA no VPS (regra 10)

> Pipeline: GitHub Actions → GHCR → SSH → `deploy.sh` (health gate) → smoke
> pós-deploy → rollback automático em falha. Workflow: `.github/workflows/deploy.yml`.
> Enquanto os secrets `DEPLOY_*` não existirem no repo, o workflow é um no-op.

## 1. Provisionar o VPS (uma vez)

Requisitos: Ubuntu 22.04+ (ou equivalente), 2 vCPU / 4 GB RAM (app + redis;
reservar ~400 MB extra para o stack de monitorização da regra 9), Docker Engine
com o plugin compose.

```bash
# como root ou sudoer
curl -fsSL https://get.docker.com | sh
useradd -m -s /bin/bash deploy && usermod -aG docker deploy
mkdir -p /opt/innova && chown deploy:deploy /opt/innova

# firewall mínimo (ufw): SSH + porta pública da app (ou 80/443 se houver proxy)
ufw allow OpenSSH && ufw allow 4000/tcp && ufw enable
```

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
| `SMOKE_BASE_URL` | URL pública da app, ex. `http://<HOST>:4000` |
| `SMOKE_EMPLOYEE_EMAIL` / `SMOKE_EMPLOYEE_PASSWORD` | utilizador COLABORADOR real de smoke em produção |
| `SMOKE_RH_EMAIL` / `SMOKE_RH_PASSWORD` | utilizador RH real de smoke em produção |
| `SMOKE_COURSE_ID` | id de um curso publicado usado pela suite |
| `TELEGRAM_BOT_TOKEN` / `TELEGRAM_CHAT_ID` | (opcional) notificações de deploy |

Criar os utilizadores/curso de smoke na BD de produção antes do primeiro deploy
(a suite corre com `SMOKE_SEED=false` e `SMOKE_ALLOW_WRITES=false` — só leituras;
não cria nada).

## 4. Primeiro deploy

1. Merge a `main` (ou Actions → Deploy → Run workflow).
2. Acompanhar os jobs: `build` → `deploy` → `verify` → (`rollback` só se falhar) → `notify`.
3. Confirmar: `curl http://<HOST>:4000/health/ready` → 200.

## 5. Operação corrente

```bash
# estado e logs
docker ps
docker logs -f innova-app

# tag a correr / anterior
cat /opt/innova/current_tag /opt/innova/previous_tag

# rollback manual (mesmo mecanismo do automático)
/opt/innova/deploy/rollback.sh

# deploy manual de uma tag específica (ex. voltar 3 versões atrás)
/opt/innova/deploy/deploy.sh sha-<commit>
```

Deploy de uma tag antiga via GitHub: Actions → Deploy → Run workflow → preencher
`tag` (ex. `sha-abc123`) — salta o build e faz deploy dessa imagem.

## 6. REGRA: migrations compatíveis com rollback (expand-contract)

As migrations correm no arranque do container (`prisma migrate deploy`). O
rollback repõe a **imagem** anterior mas NÃO desfaz migrations. Portanto toda a
migration tem de ser compatível com a versão anterior do código:

- ✅ adicionar coluna nullable/com default; adicionar tabela/índice.
- ❌ remover/renomear coluna ou tabela que o código anterior usa — só num deploy
  posterior àquele que deixou de a usar (expand → migrate → contract).
- Migrations destrutivas exigem plano manual (backup + janela) — fora do
  rollback automático.

## 7. Ensaio local do ciclo completo (sem VPS)

```bash
docker build -t innova-api:local .
docker tag innova-api:local ghcr.io/tututazeni-spec/tututazeni-backend:local-v1
docker tag innova-api:local ghcr.io/tututazeni-spec/tututazeni-backend:local-v2
# ops/.env.production local: ver ops/.env.production.example (BD innova_test do host)
bash ops/deploy/deploy.sh local-v1
bash ops/deploy/deploy.sh local-v2
bash ops/deploy/rollback.sh          # volta a local-v1
npm run test:regression              # smoke contra http://localhost:4000
IMAGE_TAG=local-v1 docker compose -f ops/docker-compose.prod.yml down
rm -f ops/current_tag ops/previous_tag
```
