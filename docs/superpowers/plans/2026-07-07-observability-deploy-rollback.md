# Deploy com monitorização e rollback automático (regra 10) — Plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pipeline de deploy completo — imagem Docker → GHCR → VPS via SSH — com health gate, smoke pós-deploy (suite da regra 8) e rollback automático para a imagem anterior, tudo pronto-a-ligar antes de o VPS existir.

**Architecture:** Dockerfile multi-stage (build TS + runtime só com deps de produção; migrations aplicadas no arranque do container). `ops/docker-compose.prod.yml` corre app + redis no VPS (Postgres é gerido/externo). O workflow `deploy.yml` constrói/publica a imagem, copia os artefactos de deploy para o VPS, corre `deploy.sh <tag>` (health gate), verifica com `npm run test:regression` em modo pós-deploy, e em caso de falha corre `rollback.sh` — sem intervenção humana. Sem secrets configurados, o workflow termina em no-op.

**Tech Stack:** Docker (node:20-slim), docker compose, GitHub Actions, GHCR, appleboy/ssh-action + scp-action, suite Jest de smoke existente (`test/jest-smoke.json`).

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-07-observability-alerts-deploy-design.md` (secção PR 1).
- Branch de trabalho: `feat/observability-deploy-rollback` (já criado; spec commitado).
- Imagem: `ghcr.io/tututazeni-spec/tututazeni-backend` — tags `sha-<commit>` e `latest`.
- Porta da app: `4000` (env `PORT`, default no `main.ts`). Health gate: `GET /health/ready`.
- Node `20.x` (package.json engines). Build = `npm run build` (tsc puro; `include` só `src/**`).
- O `postinstall` do package.json corre `prisma generate` — por isso o CLI `prisma`
  passa a dependency de produção (Task 1); sem isso `npm ci --omit=dev` falha.
- Generator Prisma: `prisma-client-js` (client gerado em `node_modules`); a app usa
  `@prisma/adapter-pg` com `DATABASE_URL` do ambiente.
- Nenhum segredo commitado: `ops/.env.production` fica no .gitignore; o repo só tem `ops/.env.production.example`.
- Copy/comentários em PT-PT; commits convencionais; `--no-verify` autorizado (hooks lentos nesta máquina); CI `quality` tem de ficar verde antes do merge.
- Máquina local: Windows + Docker Desktop; comandos de terminal correm em Git Bash (tool Bash) salvo indicação.

---

### Task 1: Dockerfile multi-stage + entrypoint + prisma CLI como dependency

**Files:**
- Create: `Dockerfile`
- Create: `.dockerignore`
- Create: `ops/deploy/docker-entrypoint.sh`
- Modify: `package.json` (mover `prisma` de devDependencies para dependencies)

**Interfaces:**
- Produces: imagem Docker que expõe a porta 4000, tem `HEALTHCHECK` ao `/health/ready`, e no arranque corre `npx prisma migrate deploy && node dist/main.js`. Tag local de teste: `innova-api:local`. As Tasks 2–4 consomem esta imagem.

- [ ] **Step 1: Mover `prisma` para dependencies**

```bash
node -e "
const fs = require('fs');
const pkg = JSON.parse(fs.readFileSync('./package.json', 'utf8'));
const ver = pkg.devDependencies.prisma;
delete pkg.devDependencies.prisma;
pkg.dependencies.prisma = ver;
// manter dependencies ordenadas alfabeticamente
pkg.dependencies = Object.fromEntries(Object.entries(pkg.dependencies).sort(([a],[b]) => a.localeCompare(b)));
fs.writeFileSync('./package.json', JSON.stringify(pkg, null, 2) + '\n');
console.log('prisma =>', pkg.dependencies.prisma);
"
npm install --package-lock-only --no-audit --no-fund
```

Expected: imprime `prisma => ^7.5.0` e o `package-lock.json` é actualizado sem erros.

Racional (para o PR): o entrypoint do container corre `prisma migrate deploy` e o `postinstall` (`prisma generate`) corre no `npm ci --omit=dev` do runtime — ambos precisam do CLI em produção.

- [ ] **Step 2: Criar `.dockerignore`**

```
# Build context mínimo — só o que o Dockerfile copia importa (src, prisma,
# tsconfig.json, package*.json, ops/deploy/docker-entrypoint.sh)
node_modules
dist
coverage
test-results
logs
load-tests
frontend
ad-innova-api
ad-innova-web
bruno
docs
test
types
scripts
.git
.github
.husky
.claude
.superpowers
.vscode
.idea
–Pathsrc
*.md
.env
.env.*
.eslintcache
```

- [ ] **Step 3: Criar `ops/deploy/docker-entrypoint.sh`**

```sh
#!/bin/sh
# Entrypoint de produção: aplica migrations e arranca a app.
# REGRA (runbook): migrations têm de ser compatíveis com a versão anterior do
# código (expand-contract) para o rollback de imagem ser seguro.
set -e

echo "A aplicar migrations (prisma migrate deploy)..."
npx prisma migrate deploy

exec node dist/main.js
```

Nota: gravar com line endings **LF** (o ficheiro corre dentro do container Linux). Confirmar com `file ops/deploy/docker-entrypoint.sh` ou forçar: `sed -i 's/\r$//' ops/deploy/docker-entrypoint.sh`.

- [ ] **Step 4: Criar `Dockerfile`**

```dockerfile
# syntax=docker/dockerfile:1
# ─── Stage 1: build — compila TypeScript (precisa das devDependencies) ───────
FROM node:20-slim AS build
WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
COPY prisma ./prisma
# postinstall corre prisma generate (o schema já está presente)
RUN npm ci --no-audit --no-fund

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# ─── Stage 2: runtime — só dependências de produção ──────────────────────────
FROM node:20-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
COPY prisma ./prisma
# prisma é dependency de produção → postinstall (prisma generate) funciona aqui;
# bcrypt/better-sqlite3/sqlite3 usam prebuilds linux-x64 glibc (sem toolchain).
RUN npm ci --omit=dev --no-audit --no-fund

COPY --from=build /app/dist ./dist
COPY ops/deploy/docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh

RUN chmod +x /usr/local/bin/docker-entrypoint.sh \
  && useradd -r -m -u 1001 innova \
  && chown -R innova:innova /app

USER innova
EXPOSE 4000

HEALTHCHECK --interval=15s --timeout=5s --start-period=45s --retries=5 \
  CMD ["node", "-e", "require('http').get('http://localhost:'+(process.env.PORT||4000)+'/health/ready',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"]

ENTRYPOINT ["docker-entrypoint.sh"]
```

Fallback documentado: se o `npm ci --omit=dev` falhar a compilar um módulo nativo (sem prebuild), acrescentar `python3 make g++` ao `apt-get install` do stage runtime e repetir o build.

- [ ] **Step 5: Construir a imagem (o "teste" desta task)**

Run: `docker build -t innova-api:local .`
Expected: build termina com sucesso nos dois stages (a primeira execução demora — download de imagens + npm ci).

- [ ] **Step 6: Sanity check do conteúdo da imagem**

```bash
docker run --rm --entrypoint node innova-api:local -e "const c=require('@prisma/client'); console.log('client ok:', !!c.PrismaClient)"
docker run --rm --entrypoint npx innova-api:local prisma --version
```

Expected: `client ok: true` e a versão do CLI prisma (7.x) — confirma client gerado e CLI presente no runtime.

- [ ] **Step 7: Verificar que a suite local não partiu com a mudança do package.json**

Run: `npm run build`
Expected: compila sem erros (o move do prisma não afecta o build).

- [ ] **Step 8: Commit**

```bash
git add Dockerfile .dockerignore ops/deploy/docker-entrypoint.sh package.json package-lock.json
git commit --no-verify -m "feat(deploy): Dockerfile multi-stage com migrations no arranque (regra 10)"
```

---

### Task 2: docker-compose de produção + .env.production.example + .gitignore

**Files:**
- Create: `ops/docker-compose.prod.yml`
- Create: `ops/.env.production.example`
- Modify: `.gitignore`

**Interfaces:**
- Consumes: imagem `innova-api:local` (Task 1) para o ensaio local.
- Produces: compose com serviços `app` (container `innova-app`, imagem `ghcr.io/tututazeni-spec/tututazeni-backend:${IMAGE_TAG}`) e `redis` (container `innova-redis-prod`). A Task 3 (`deploy.sh`) manipula `IMAGE_TAG` e inspecciona o health do container `innova-app`.

- [ ] **Step 1: Criar `ops/docker-compose.prod.yml`**

```yaml
# Compose de produção — corre no VPS em /opt/innova (ver docs/deploy/runbook.md).
# Postgres NÃO está aqui: é gerido/externo (decisão em docs/db-architecture/).
# IMAGE_TAG vem do ambiente (deploy.sh exporta-o a partir de current_tag).
name: innova

services:
  app:
    image: ghcr.io/tututazeni-spec/tututazeni-backend:${IMAGE_TAG:-latest}
    container_name: innova-app
    env_file: .env.production
    ports:
      - '4000:4000'
    depends_on:
      redis:
        condition: service_healthy
    restart: unless-stopped
    # healthcheck herdado do HEALTHCHECK da imagem (GET /health/ready)

  redis:
    image: redis:7-alpine
    container_name: innova-redis-prod
    command: ['redis-server', '--appendonly', 'yes']
    volumes:
      - redis-data:/data
    restart: unless-stopped
    healthcheck:
      test: ['CMD', 'redis-cli', 'ping']
      interval: 10s
      timeout: 5s
      retries: 5

volumes:
  redis-data:
```

- [ ] **Step 2: Criar `ops/.env.production.example`**

```bash
# Template do .env.production do VPS (/opt/innova/.env.production).
# Copiar para .env.production e preencher. NUNCA commitar o ficheiro preenchido.

NODE_ENV=production
PORT=4000

# ─── Base de dados (Postgres gerido/externo — ver docs/db-architecture/) ───
DATABASE_URL=postgresql://USER:PASSWORD@HOST:5432/innova
DB_POOL_MAX=50
USE_REPLICAS=false
# DATABASE_REPLICA_URL=
# DB_REPLICA_POOL_MAX=10

# ─── Auth ───
JWT_SECRET=CHANGE_ME
JWT_REFRESH_SECRET=CHANGE_ME
JWT_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d

# ─── CORS / frontend ───
ALLOWED_ORIGINS=https://app.example.com
FRONTEND_URL=https://app.example.com

# ─── Redis (serviço `redis` do compose) ───
REDIS_HOST=redis
REDIS_PORT=6379
QUEUE_ENABLED=true
CACHE_ENABLED=true

# ─── Observabilidade ───
# Token do guard fail-closed do GET /metrics (regras 6-7). Obrigatório.
METRICS_TOKEN=CHANGE_ME
```

- [ ] **Step 3: Acrescentar ao `.gitignore`**

Acrescentar no fim do `.gitignore` existente:

```
# Deploy (regra 10) — artefactos locais/do VPS, nunca commitados
ops/.env.production
ops/current_tag
ops/previous_tag
```

- [ ] **Step 4: Validar a sintaxe do compose**

Run: `docker compose -f ops/docker-compose.prod.yml config --quiet && echo OK`
Expected: `OK` (warning sobre `.env.production` ausente é aceitável se aparecer; criado no passo seguinte).

- [ ] **Step 5: Ensaio local — criar `ops/.env.production` (gitignored)**

Criar `ops/.env.production` com valores locais (BD `innova_test` do host, mesma password do CI/`.env.test`):

```bash
NODE_ENV=production
PORT=4000
DATABASE_URL=postgresql://postgres:postgres@host.docker.internal:5432/innova_test
DB_POOL_MAX=10
USE_REPLICAS=false
JWT_SECRET=test-secret-key-innova-2024
JWT_REFRESH_SECRET=test-refresh-secret-innova-2024
JWT_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d
ALLOWED_ORIGINS=http://localhost:5173
FRONTEND_URL=http://localhost:5173
REDIS_HOST=redis
REDIS_PORT=6379
QUEUE_ENABLED=true
CACHE_ENABLED=true
METRICS_TOKEN=local-metrics-token
```

- [ ] **Step 6: Ensaio local — subir o stack com a imagem da Task 1**

```bash
docker tag innova-api:local ghcr.io/tututazeni-spec/tututazeni-backend:local
cd ops && IMAGE_TAG=local docker compose -f docker-compose.prod.yml up -d && cd ..
```

Nota: se o Redis local (Memurai/compose de dev) estiver a ocupar a porta 6379, não há conflito — o redis do compose de produção não publica porta no host.

- [ ] **Step 7: Ensaio local — esperar pelo health**

```bash
for i in $(seq 1 30); do
  s=$(docker inspect -f '{{.State.Health.Status}}' innova-app 2>/dev/null || echo starting)
  [ "$s" = "healthy" ] && echo "✅ healthy" && break
  sleep 3
done
docker inspect -f '{{.State.Health.Status}}' innova-app
```

Expected: `healthy`. Se ficar `unhealthy`: `docker logs innova-app` (causa típica: `DATABASE_URL` errado ou migrations a falhar).

- [ ] **Step 8: Ensaio local — suite de regressão contra o container**

Run (PowerShell, na raiz do repo): `npm run test:regression`
Expected: 13 testes verdes (o setup faz seed na `innova_test` do host; a app no container usa a mesma BD; `SMOKE_BASE_URL` default = `http://localhost:4000` → bate no container).

- [ ] **Step 9: Deitar o stack abaixo**

Run: `cd ops && IMAGE_TAG=local docker compose -f docker-compose.prod.yml down && cd ..`
Expected: containers removidos (volume `redis-data` fica, é inofensivo).

- [ ] **Step 10: Commit**

```bash
git add ops/docker-compose.prod.yml ops/.env.production.example .gitignore
git commit --no-verify -m "feat(deploy): compose de producao (app+redis) e template de env"
```

---

### Task 3: deploy.sh + rollback.sh com health gate

**Files:**
- Create: `ops/deploy/deploy.sh`
- Create: `ops/deploy/rollback.sh`

**Interfaces:**
- Consumes: `ops/docker-compose.prod.yml` (Task 2); container `innova-app` com healthcheck da imagem (Task 1).
- Produces: `deploy.sh <tag>` (exit 0 = app saudável com a tag nova; exit ≠ 0 = falhou) e `rollback.sh` (repõe a tag de `previous_tag`). Estado em `current_tag`/`previous_tag` no directório do compose. A Task 4 (workflow) chama-os no VPS como `/opt/innova/deploy/deploy.sh` e `/opt/innova/deploy/rollback.sh`.

- [ ] **Step 1: Criar `ops/deploy/deploy.sh`**

```bash
#!/usr/bin/env bash
# deploy.sh <image-tag> — actualiza a app para a imagem <tag> com health gate.
# Corre no directório do compose (localmente: ops/; no VPS: /opt/innova).
# Estado: current_tag (tag a correr) e previous_tag (para rollback.sh).
set -euo pipefail

cd "$(dirname "$0")/.."

TAG="${1:?uso: deploy.sh <image-tag>}"
COMPOSE_FILE="docker-compose.prod.yml"

if [ -f current_tag ] && [ "$(cat current_tag)" != "$TAG" ]; then
  cp current_tag previous_tag
fi
echo "$TAG" > current_tag

echo "▶ deploy da tag: $TAG"
IMAGE_TAG="$TAG" docker compose -f "$COMPOSE_FILE" pull app
IMAGE_TAG="$TAG" docker compose -f "$COMPOSE_FILE" up -d

echo "▶ à espera do health de innova-app (máx 90s)..."
STATUS="starting"
for _ in $(seq 1 30); do
  STATUS="$(docker inspect -f '{{.State.Health.Status}}' innova-app 2>/dev/null || echo starting)"
  if [ "$STATUS" = "healthy" ]; then
    echo "✅ app saudável com a tag $TAG"
    exit 0
  fi
  sleep 3
done

echo "❌ app não ficou saudável em 90s (estado: $STATUS)"
docker logs --tail 50 innova-app || true
exit 1
```

- [ ] **Step 2: Criar `ops/deploy/rollback.sh`**

```bash
#!/usr/bin/env bash
# rollback.sh — repõe a imagem registada em previous_tag (health gate incluído).
# Nota: após um rollback, previous_tag passa a ser a tag má — um segundo
# rollback seguido voltaria a ela. Para repor uma tag arbitrária: deploy.sh <tag>.
set -euo pipefail

cd "$(dirname "$0")/.."

if [ ! -f previous_tag ]; then
  echo "❌ sem previous_tag — nada para repor"
  exit 1
fi

PREV="$(cat previous_tag)"
echo "▶ rollback para a tag anterior: $PREV"
exec "$(dirname "$0")/deploy.sh" "$PREV"
```

Atenção ao detalhe: dentro do `rollback.sh`, depois do `cd`, `$(dirname "$0")` já não aponta para o sítio certo se `$0` for relativo. Usar o caminho absoluto calculado **antes** do `cd`. Versão final correcta:

```bash
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
```

(Usar esta segunda versão; aplicar o mesmo padrão `SCRIPT_DIR` no `deploy.sh` por consistência: `SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"; cd "$SCRIPT_DIR/.."`.)

- [ ] **Step 3: Line endings LF + verificação de sintaxe**

```bash
sed -i 's/\r$//' ops/deploy/deploy.sh ops/deploy/rollback.sh
bash -n ops/deploy/deploy.sh && bash -n ops/deploy/rollback.sh && echo "sintaxe OK"
```

Expected: `sintaxe OK`.

- [ ] **Step 4: Ensaio local do ciclo deploy → deploy → rollback**

Pré-requisito: imagem e `ops/.env.production` da Task 2.

```bash
# duas "versões" locais (mesma imagem, tags diferentes — chega para testar o ciclo)
docker tag innova-api:local ghcr.io/tututazeni-spec/tututazeni-backend:local-v1
docker tag innova-api:local ghcr.io/tututazeni-spec/tututazeni-backend:local-v2

bash ops/deploy/deploy.sh local-v1     # deploy inicial
bash ops/deploy/deploy.sh local-v2     # upgrade → previous_tag=local-v1
bash ops/deploy/rollback.sh            # rollback → volta a local-v1

cat ops/current_tag                    # esperado: local-v1
docker inspect -f '{{.Config.Image}}' innova-app   # esperado: ...:local-v1
```

Expected: os três comandos terminam com `✅ app saudável`; `current_tag` = `local-v1`; container a correr a imagem `local-v1`.

Nota: o `pull` de tags locais falha (não existem no GHCR) — se o `docker compose pull app` abortar o script, ajustar o `deploy.sh` para tolerar pull falhado quando a imagem já existe localmente: substituir a linha do pull por `IMAGE_TAG="$TAG" docker compose -f "$COMPOSE_FILE" pull app || echo "⚠ pull falhou — a usar imagem local se existir"`. (Manter esta tolerância na versão final: também protege deploys re-tentados com a imagem já presente no VPS.)

- [ ] **Step 5: Limpar o ensaio**

```bash
cd ops && IMAGE_TAG=local-v1 docker compose -f docker-compose.prod.yml down && cd ..
rm -f ops/current_tag ops/previous_tag
```

- [ ] **Step 6: Commit**

```bash
git add ops/deploy/deploy.sh ops/deploy/rollback.sh
git commit --no-verify -m "feat(deploy): scripts de deploy e rollback com health gate"
```

---

### Task 4: Workflow deploy.yml (build → GHCR → deploy → verify → rollback → notify)

**Files:**
- Create: `.github/workflows/deploy.yml`

**Interfaces:**
- Consumes: `Dockerfile` (Task 1), `ops/docker-compose.prod.yml` (Task 2), `ops/deploy/*.sh` (Task 3), suite `npm run test:regression` com env `SMOKE_*` (regra 8).
- Produces: workflow "Deploy" que em `main` faz o ciclo completo; em PRs que toquem `Dockerfile`/`.dockerignore`/`ops/**`/o próprio workflow, só valida o build da imagem (sem push). Secrets consumidos: `DEPLOY_HOST`, `DEPLOY_USER`, `DEPLOY_SSH_KEY`, `SMOKE_BASE_URL`, `SMOKE_EMPLOYEE_EMAIL`, `SMOKE_EMPLOYEE_PASSWORD`, `SMOKE_RH_EMAIL`, `SMOKE_RH_PASSWORD`, `SMOKE_COURSE_ID`, opcionais `TELEGRAM_BOT_TOKEN`/`TELEGRAM_CHAT_ID`.

- [ ] **Step 1: Criar `.github/workflows/deploy.yml`**

```yaml
name: Deploy

# Regra 10: deploy com monitorização e rollback automático.
# Sem os secrets DEPLOY_* configurados, os jobs de deploy ficam em no-op
# (mesmo padrão do SONAR_TOKEN no quality.yml) — o workflow pode viver em
# main antes de o VPS existir. Em PRs só corre o build (validação, sem push).

on:
  push:
    branches: [main]
  pull_request:
    paths:
      - 'Dockerfile'
      - '.dockerignore'
      - 'ops/**'
      - '.github/workflows/deploy.yml'
  workflow_dispatch:
    inputs:
      tag:
        description: 'Tag existente no GHCR a fazer deploy (ex. sha-abc123). Vazio = build do commit actual.'
        required: false
        default: ''

concurrency:
  group: deploy-production
  cancel-in-progress: false

env:
  IMAGE: ghcr.io/${{ github.repository }}

jobs:
  preflight:
    runs-on: ubuntu-latest
    outputs:
      can_deploy: ${{ steps.check.outputs.can_deploy }}
    steps:
      - id: check
        run: echo "can_deploy=${{ secrets.DEPLOY_HOST != '' && github.event_name != 'pull_request' }}" >> "$GITHUB_OUTPUT"

  build:
    runs-on: ubuntu-latest
    # dispatch com tag explícita → não reconstrói, faz deploy dessa tag
    if: ${{ github.event.inputs.tag == '' }}
    permissions:
      contents: read
      packages: write
    steps:
      - name: Checkout
        uses: actions/checkout@v3

      - name: Setup Buildx
        uses: docker/setup-buildx-action@v3

      - name: Login no GHCR
        if: ${{ github.event_name != 'pull_request' }}
        uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      - name: Build (push fora de PRs)
        uses: docker/build-push-action@v6
        with:
          context: .
          push: ${{ github.event_name != 'pull_request' }}
          tags: |
            ${{ env.IMAGE }}:sha-${{ github.sha }}
            ${{ env.IMAGE }}:latest
          cache-from: type=gha
          cache-to: type=gha,mode=max

  deploy:
    runs-on: ubuntu-latest
    needs: [preflight, build]
    if: >-
      ${{ !cancelled() &&
          needs.preflight.outputs.can_deploy == 'true' &&
          (needs.build.result == 'success' || needs.build.result == 'skipped') }}
    permissions:
      contents: read
      packages: read
    steps:
      - name: Checkout
        uses: actions/checkout@v3

      - name: Copiar artefactos de deploy para o VPS
        uses: appleboy/scp-action@v0.1.7
        with:
          host: ${{ secrets.DEPLOY_HOST }}
          username: ${{ secrets.DEPLOY_USER }}
          key: ${{ secrets.DEPLOY_SSH_KEY }}
          source: 'ops/docker-compose.prod.yml,ops/deploy/deploy.sh,ops/deploy/rollback.sh'
          target: /opt/innova
          strip_components: 1
          overwrite: true

      - name: Deploy no VPS (deploy.sh com health gate)
        uses: appleboy/ssh-action@v1.0.3
        with:
          host: ${{ secrets.DEPLOY_HOST }}
          username: ${{ secrets.DEPLOY_USER }}
          key: ${{ secrets.DEPLOY_SSH_KEY }}
          script_stop: true
          script: |
            chmod +x /opt/innova/deploy/deploy.sh /opt/innova/deploy/rollback.sh
            echo "${{ secrets.GITHUB_TOKEN }}" | docker login ghcr.io -u ${{ github.actor }} --password-stdin
            /opt/innova/deploy/deploy.sh "${{ github.event.inputs.tag != '' && github.event.inputs.tag || format('sha-{0}', github.sha) }}"

  verify:
    runs-on: ubuntu-latest
    needs: [preflight, deploy]
    if: ${{ !cancelled() && needs.deploy.result == 'success' }}
    steps:
      - name: Checkout
        uses: actions/checkout@v3

      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '20'
          cache: 'npm'

      - name: Instalar dependências
        run: npm ci

      - name: Smoke pós-deploy (suite da regra 8 contra produção)
        run: npm run test:regression
        env:
          SMOKE_BASE_URL: ${{ secrets.SMOKE_BASE_URL }}
          SMOKE_SEED: 'false'
          SMOKE_ALLOW_WRITES: 'false'
          SMOKE_EMPLOYEE_EMAIL: ${{ secrets.SMOKE_EMPLOYEE_EMAIL }}
          SMOKE_EMPLOYEE_PASSWORD: ${{ secrets.SMOKE_EMPLOYEE_PASSWORD }}
          SMOKE_RH_EMAIL: ${{ secrets.SMOKE_RH_EMAIL }}
          SMOKE_RH_PASSWORD: ${{ secrets.SMOKE_RH_PASSWORD }}
          SMOKE_COURSE_ID: ${{ secrets.SMOKE_COURSE_ID }}

  rollback:
    runs-on: ubuntu-latest
    needs: [preflight, deploy, verify]
    if: >-
      ${{ !cancelled() &&
          needs.preflight.outputs.can_deploy == 'true' &&
          (needs.deploy.result == 'failure' || needs.verify.result == 'failure') }}
    steps:
      - name: Rollback automático para a tag anterior
        uses: appleboy/ssh-action@v1.0.3
        with:
          host: ${{ secrets.DEPLOY_HOST }}
          username: ${{ secrets.DEPLOY_USER }}
          key: ${{ secrets.DEPLOY_SSH_KEY }}
          script_stop: true
          script: /opt/innova/deploy/rollback.sh

  notify:
    runs-on: ubuntu-latest
    needs: [preflight, deploy, verify, rollback]
    if: ${{ always() && needs.preflight.outputs.can_deploy == 'true' }}
    steps:
      - name: Notificar resultado por Telegram (opcional)
        env:
          TELEGRAM_BOT_TOKEN: ${{ secrets.TELEGRAM_BOT_TOKEN }}
          TELEGRAM_CHAT_ID: ${{ secrets.TELEGRAM_CHAT_ID }}
          DEPLOY_RESULT: ${{ needs.deploy.result }}
          VERIFY_RESULT: ${{ needs.verify.result }}
          ROLLBACK_RESULT: ${{ needs.rollback.result }}
        run: |
          if [ -z "$TELEGRAM_BOT_TOKEN" ] || [ -z "$TELEGRAM_CHAT_ID" ]; then
            echo "Telegram não configurado — a saltar notificação"; exit 0
          fi
          if [ "$ROLLBACK_RESULT" = "success" ]; then
            MSG="⚠️ INNOVA: deploy de ${GITHUB_SHA::7} falhou — ROLLBACK automático executado com sucesso."
          elif [ "$ROLLBACK_RESULT" = "failure" ]; then
            MSG="🔥 INNOVA: deploy de ${GITHUB_SHA::7} falhou E o rollback automático FALHOU — intervenção manual necessária."
          elif [ "$DEPLOY_RESULT" = "success" ] && [ "$VERIFY_RESULT" = "success" ]; then
            MSG="✅ INNOVA: deploy de ${GITHUB_SHA::7} concluído e verificado (smoke verde)."
          else
            MSG="ℹ️ INNOVA: workflow de deploy terminou (deploy=$DEPLOY_RESULT, verify=$VERIFY_RESULT)."
          fi
          curl -s "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
            -d chat_id="${TELEGRAM_CHAT_ID}" -d text="$MSG" > /dev/null
          echo "notificação enviada"
```

- [ ] **Step 2: Validar o workflow com actionlint**

Run: `docker run --rm -v "$(pwd):/repo" -w /repo rhysd/actionlint:latest -color .github/workflows/deploy.yml`
Expected: sem erros (exit 0). Se o pull da imagem falhar por rede, alternativa mínima: `node -e "require('js-yaml')"` não existe no projecto — usar `npx --yes yaml-lint .github/workflows/deploy.yml` só para sintaxe YAML, e confiar na validação real do GitHub quando o PR subir (o build job corre no PR porque o path filter inclui o próprio workflow).

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/deploy.yml
git commit --no-verify -m "feat(deploy): workflow build->GHCR->deploy SSH com smoke gate e rollback automatico"
```

---

### Task 5: Runbook de deploy (provisionamento, activação, operação)

**Files:**
- Create: `docs/deploy/runbook.md`

**Interfaces:**
- Consumes: nomes exactos de secrets, caminhos e scripts das Tasks 1–4.
- Produces: documento único de operação; a spec da regra 9 (PR 2) vai acrescentar `docs/deploy/alerting.md` ao lado.

- [ ] **Step 1: Criar `docs/deploy/runbook.md`**

````markdown
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
````

- [ ] **Step 2: Commit**

```bash
git add docs/deploy/runbook.md
git commit --no-verify -m "docs(deploy): runbook de provisionamento, activacao e operacao"
```

---

### Task 6: Verificação final + ship

**Files:**
- Nenhum novo — verificação e PR.

- [ ] **Step 1: Verificações que replicam o CI**

```bash
npm run lint:check
npm run format:check
npm run build
```

Expected: os três verdes (o `quality.yml` corre isto + testes; os testes não foram tocados neste PR — só ficheiros de infra).

- [ ] **Step 2: Rever o diff completo do branch**

Run: `git log --oneline main..HEAD && git diff main --stat`
Expected: commits das Tasks 1–5 + spec; sem ficheiros inesperados (confirmar que `ops/.env.production`, `ops/current_tag`, `ops/previous_tag` NÃO aparecem).

- [ ] **Step 3: Ship (commit/push/PR/CI/auto-merge)**

Invocar o skill `ship` com título/corpo do PR:

- Título: `feat(deploy): pipeline de deploy com monitorizacao e rollback automatico (regra 10)`
- Corpo: resumo do pipeline (build→GHCR→SSH→health gate→smoke→rollback), nota de que o workflow é no-op sem secrets `DEPLOY_*` (VPS ainda não provisionado), ensaio local executado (build da imagem, compose up healthy, `test:regression` verde, ciclo deploy→rollback verificado), ponteiros para o runbook e para a spec. Footer standard do Claude Code.

Expected: CI `quality` verde (e o job `build` do `deploy.yml` corre no PR via path filter — valida o Dockerfile no GitHub); merge automático em `main`.

---

## Self-review (feito na escrita do plano)

- **Cobertura da spec (secção PR 1):** Dockerfile ✅ (Task 1), compose+env ✅ (Task 2), deploy/rollback scripts ✅ (Task 3), deploy.yml com os 6 passos da spec ✅ (Task 4), runbook com regra expand-contract e secrets ✅ (Task 5), verificação sem VPS ✅ (build em PR por path filter + ensaio local nas Tasks 2–3).
- **Placeholders:** nenhum — todos os ficheiros têm conteúdo completo.
- **Consistência de nomes:** container `innova-app` (compose, deploy.sh, runbook); imagem `ghcr.io/tututazeni-spec/tututazeni-backend`; estado `current_tag`/`previous_tag` em `/opt/innova` = `ops/` local; secrets com os mesmos nomes na Task 4 e no runbook; env `SMOKE_*` copiados de `test/smoke/*.ts` reais.
