# Frontend Next.js no VPS + endurecimento da borda Caddy — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Servir o frontend Next.js em produção no mesmo VPS, atrás do Caddy existente, e endurecer o container Caddy contra crash/OOM até ao nível de redundância do resto da pilha.

**Architecture:** Novo serviço `frontend` (imagem própria no GHCR, construída pelo repo `tututazeni-frontend`, ×2 réplicas) no compose de produção. O Caddy passa a encaminhar `/` → `frontend:3000` e mantém `/api/*` → `app:4000`. O rollout do frontend entra no pipeline health-gated + rollback do backend via `repository_dispatch`. O Caddy ganha `restart: always`, healthcheck de container e mais memória.

**Tech Stack:** Next.js 15 (App Router, `output: 'standalone'`), Node 20, Docker Compose v2, Caddy 2, GitHub Actions, GHCR.

**Spec:** `docs/superpowers/specs/2026-09-07-frontend-deploy-lb-hardening-design.md`

## Global Constraints

- **Dois repositórios git independentes.** `tututazeni-backend` = raiz do workspace (`C:\Users\PLÁCIDO COSTA\innova`). `tututazeni-frontend` = `frontend/` (repo próprio, gitignorado pelo backend, remote `https://github.com/tututazeni-spec/tututazeni-frontend.git`). Tasks 1–3 correm **dentro de `frontend/`** com branch/commits/PR próprios. Tasks 4–10 correm na raiz do backend.
- **Imagens:** `ghcr.io/tututazeni-spec/tututazeni-frontend` e `ghcr.io/tututazeni-spec/tututazeni-backend`. Tags: `sha-<git-sha>` + `latest`.
- **Node 20** em ambas as imagens. Containers correm como utilizador **não-root (uid 1001)**.
- **Caddyfile:** o bloco `handle_path /api/*` fica **sempre primeiro** (mais específico). O routing `/api/*` → backend **não muda**.
- **Frontend precisa de servidor Node** (`node server.js` do standalone) — **nunca** `output: 'export'`.
- **Sem `NEXT_PUBLIC_*` em build-time** (confirmado: `frontend/lib/api.ts` — "Zero dependência de NEXT_PUBLIC_API_URL"). Única env de runtime relevante: `API_INTERNAL_URL=http://app:4000` e `PORT=3000`.
- **`main` protegido nos dois repos.** Branch + PR + check obrigatório verde antes de merge: `quality` (backend, workflow `Code Quality`) / `Frontend Quality` (frontend). Regra 15 do `CLAUDE.md` — nunca contornar branch protection.
- **Prettier:** correr `npx prettier --write` nos ficheiros `ops/**` e `docs/**` tocados no backend antes do PR (o CI `quality` só verifica `src/**`, mas mantém-se a consistência). Frontend: `npm run lint` não é bloqueante; `npm test` e `npm run build` são.
- **Trailer de commit (todos os commits, ambos os repos):**
  ```
  Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01LrrSbJgtspjxBiziihtrWk
  ```
- **Trailer de descrição de PR:** `🤖 Generated with [Claude Code](https://claude.com/claude-code)`

---

## File Structure

### Repo `tututazeni-frontend` (`frontend/`)
| Ficheiro | Estado | Responsabilidade |
|---|---|---|
| `next.config.ts` | modificar | Acrescentar `output: 'standalone'`. |
| `app/health/route.ts` | criar | Liveness probe `GET /health` → `{status:'ok'}`. |
| `Dockerfile` | criar | Build multi-stage → runtime standalone Node 20 non-root. |
| `.dockerignore` | criar | Excluir `node_modules`, `.next`, `.git`, etc. do contexto. |
| `.github/workflows/deploy.yml` | criar | Build+push da imagem para GHCR; `repository_dispatch` ao backend. |
| `docs/deploy.md` | criar | Nota curta do fluxo de deploy do frontend. |

### Repo `tututazeni-backend` (raiz)
| Ficheiro | Estado | Responsabilidade |
|---|---|---|
| `ops/docker-compose.prod.yml` | modificar | Serviço `frontend` (×2); endurecer serviço `caddy`. |
| `ops/caddy/Caddyfile` | modificar | Activar `handle { }` → `frontend:3000`. |
| `ops/deploy/deploy.sh` | modificar | Resolver/persistir tag do frontend; health gate cobre `app` + `frontend`. |
| `ops/deploy/rollback.sh` | modificar | Repor também `previous_frontend_tag`. |
| `ops/.env.production.example` | modificar | `FRONTEND_IMAGE_TAG`, `API_INTERNAL_URL`. |
| `.github/workflows/deploy.yml` | modificar | Trigger `repository_dispatch`; passar `FRONTEND_TAG`; `verify` checa `GET /`. |
| `docs/deploy/ha-and-spof.md` | modificar | Nova topologia; SPOF refrescados; gatilho 2-VPS cumprido. |
| `docs/deploy/cloudflare.md` | modificar | `/` + estáticos têm origem real; Cache Rule + Always Online. |
| `docs/deploy/runbook.md` | modificar | Frontend no rollout; `repository_dispatch`; ensaio local §8 estendido. |

---

## FASE 1 — Repo `tututazeni-frontend`

> Todos os comandos desta fase correm a partir de `frontend/`. Primeiro passo da fase:
> ```bash
> cd frontend
> git checkout main && git pull
> git checkout -b feat/deploy-vps
> ```

### Task 1: `output: 'standalone'` + rota `/health`

**Files:**
- Modify: `frontend/next.config.ts`
- Create: `frontend/app/health/route.ts`

**Interfaces:**
- Consumes: nada.
- Produces: `GET /health` → `200 {"status":"ok"}` (usado pelo `HEALTHCHECK` do Dockerfile na Task 2 e pelo Caddy na Task 5). Directório de build `.next/standalone` (consumido pelo Dockerfile na Task 2).

- [ ] **Step 1: Criar a rota de health**

Criar `frontend/app/health/route.ts`:

```ts
// Liveness probe do container frontend. Fora de /api → o Caddy serve-a a
// partir do Next em produção; não colide com /api/health/ready do backend.
export const dynamic = "force-dynamic";

export function GET() {
  return Response.json({ status: "ok" });
}
```

- [ ] **Step 2: Activar o output standalone**

Em `frontend/next.config.ts`, dentro do objecto `const nextConfig: NextConfig = { ... }`, acrescentar a chave `output` como primeira propriedade:

```ts
const nextConfig: NextConfig = {
  output: "standalone",
  experimental: {
    reactCompiler: true,
  },
```

- [ ] **Step 3: Build — verificar que o standalone é produzido**

Run: `npm run build`
Expected: build termina sem erro e cria `frontend/.next/standalone/server.js`. Confirmar:

```bash
ls .next/standalone/server.js && ls .next/static
```

Expected: os dois caminhos existem.

- [ ] **Step 4: Verificar a rota /health em dev**

Run (num terminal): `npm run build && node .next/standalone/server.js`
Depois, noutro terminal: `curl -fsS http://localhost:3000/health`
Expected: `{"status":"ok"}` com HTTP 200. Parar o servidor (Ctrl+C).

- [ ] **Step 5: Testes unitários (regressão)**

Run: `npm test`
Expected: PASS (sem regressões — a rota nova não tem teste próprio; é validada por curl no Step 4 e no Dockerfile).

- [ ] **Step 6: Commit**

```bash
git add next.config.ts app/health/route.ts
git commit -m "$(printf 'feat(deploy): output standalone + rota /health para o container\n\nCo-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>\nClaude-Session: https://claude.ai/code/session_01LrrSbJgtspjxBiziihtrWk')"
```

---

### Task 2: Dockerfile + .dockerignore

**Files:**
- Create: `frontend/Dockerfile`
- Create: `frontend/.dockerignore`

**Interfaces:**
- Consumes: `.next/standalone` + `.next/static` + `public/` do `npm run build` (Task 1). `GET /health` (Task 1).
- Produces: imagem que expõe `:3000`, corre `node server.js`, com `HEALTHCHECK` a bater em `/health`. Consumida pelo serviço `frontend` do compose (Task 4) e pela CI (Task 3).

- [ ] **Step 1: Criar o `.dockerignore`**

Criar `frontend/.dockerignore`:

```
node_modules
.next
.git
.github
coverage
npm-debug.log*
.env*.local
Dockerfile
.dockerignore
```

- [ ] **Step 2: Criar o `Dockerfile`**

Criar `frontend/Dockerfile`:

```dockerfile
# syntax=docker/dockerfile:1
# ─── Stage 1: deps — node_modules completo (precisa de dev deps p/ o build) ──
FROM node:20-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

# ─── Stage 2: build — next build com output:'standalone' ─────────────────────
FROM node:20-slim AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# ─── Stage 3: runtime — servidor standalone mínimo ──────────────────────────
FROM node:20-slim AS runtime
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
WORKDIR /app

RUN useradd -r -m -u 1001 nextjs

# O servidor standalone traz o seu próprio node_modules podado.
COPY --from=build --chown=nextjs:nextjs /app/.next/standalone ./
COPY --from=build --chown=nextjs:nextjs /app/.next/static ./.next/static
COPY --from=build --chown=nextjs:nextjs /app/public ./public

USER nextjs
EXPOSE 3000

HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=5 \
  CMD ["node", "-e", "require('http').get('http://localhost:'+(process.env.PORT||3000)+'/health',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"]

CMD ["node", "server.js"]
```

- [ ] **Step 3: Build da imagem**

Run: `docker build -t tututazeni-frontend:local .`
Expected: build OK. (Se `COPY /app/public` falhar por o directório não existir — não é o caso, `frontend/public/` existe — criar `public/.gitkeep`.)

- [ ] **Step 4: Correr e verificar health + página**

```bash
docker run --rm -d --name fe-local -p 3000:3000 -e API_INTERNAL_URL=http://host.docker.internal:4000 tututazeni-frontend:local
sleep 5
curl -fsS http://localhost:3000/health
curl -s -o /dev/null -w '%{http_code}\n' -L http://localhost:3000/
docker inspect -f '{{.State.Health.Status}}' fe-local
docker rm -f fe-local
```

Expected: `/health` → `{"status":"ok"}`; `/` → `200` ou `3xx` (redirect de login), **não** `5xx`; health status `healthy` (aguardar até ~25 s se sair `starting`).

- [ ] **Step 5: Commit**

```bash
git add Dockerfile .dockerignore
git commit -m "$(printf 'feat(deploy): Dockerfile standalone (Node 20, non-root, healthcheck /health)\n\nCo-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>\nClaude-Session: https://claude.ai/code/session_01LrrSbJgtspjxBiziihtrWk')"
```

---

### Task 3: Workflow de deploy do frontend + docs + PR

**Files:**
- Create: `frontend/.github/workflows/deploy.yml`
- Create: `frontend/docs/deploy.md`

**Interfaces:**
- Consumes: `Dockerfile` (Task 2).
- Produces: em `push` a `main` → imagem `ghcr.io/tututazeni-spec/tututazeni-frontend:{sha-<sha>,latest}` no GHCR + evento `repository_dispatch` `frontend-updated` com `client_payload.tag = "sha-<sha>"` no repo do backend (consumido pela Task 7).

- [ ] **Step 1: Criar o workflow**

Criar `frontend/.github/workflows/deploy.yml`:

```yaml
name: Frontend Deploy

# Espelha o deploy.yml do backend. Em push a main: build + push da imagem para
# o GHCR e disparo de repository_dispatch no repo do backend (que faz o rollout
# health-gated). Em PR: só valida o build da imagem (sem push).

on:
  push:
    branches: [main]
  pull_request:
    paths:
      - "Dockerfile"
      - ".dockerignore"
      - "next.config.ts"
      - ".github/workflows/deploy.yml"
  workflow_dispatch:

env:
  IMAGE: ghcr.io/${{ github.repository }}

jobs:
  build:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write
    steps:
      - uses: actions/checkout@v4

      - uses: docker/setup-buildx-action@v3

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

  notify-backend:
    runs-on: ubuntu-latest
    needs: build
    if: ${{ github.event_name == 'push' }}
    steps:
      - name: Disparar rollout no repo do backend
        uses: peter-evans/repository-dispatch@v3
        with:
          token: ${{ secrets.BACKEND_DISPATCH_TOKEN }}
          repository: tututazeni-spec/tututazeni-backend
          event-type: frontend-updated
          client-payload: '{"tag": "sha-${{ github.sha }}"}'
```

- [ ] **Step 2: Criar `frontend/docs/deploy.md`**

```markdown
# Deploy do frontend

O frontend corre no **mesmo VPS** do backend, como serviço `frontend` (×2
réplicas) atrás do Caddy. Rota `/` → frontend; `/api/*` → backend.

## Fluxo

1. PR → `Frontend Quality` verde → merge para `main`.
2. `.github/workflows/deploy.yml`:
   - `build`: `docker build` → push `ghcr.io/tututazeni-spec/tututazeni-frontend:sha-<sha>` + `:latest`.
   - `notify-backend`: `repository_dispatch` (`frontend-updated`, `client_payload.tag`)
     para `tututazeni-spec/tututazeni-backend`.
3. O workflow **Deploy** do backend faz o rollout health-gated (pull das duas
   imagens, `up -d`, espera todas as réplicas `app` + `frontend` saudáveis,
   rollback automático em falha).

## Secret necessário (repo do frontend)

`BACKEND_DISPATCH_TOKEN` — PAT fine-grained com `contents: write` **apenas** no
repo `tututazeni-spec/tututazeni-backend`. Sem ele, a imagem é publicada mas o
rollout não arranca (recuperável com *Run workflow* manual no backend).

## Env de runtime

- `PORT=3000`
- `API_INTERNAL_URL=http://app:4000` — usado por SSR / route handlers e pelo
  `rewrites()` do `next.config.ts` (inerte em produção, o Caddy interseta `/api`).

Detalhe completo do rollout: `docs/deploy/runbook.md` no repo do backend.
```

- [ ] **Step 3: Validar a sintaxe do workflow**

Run: `npx --yes @action-validator/cli@latest .github/workflows/deploy.yml` (ou, se indisponível offline, `node -e "require('js-yaml')" ` não aplicável — usar `python -c "import yaml,sys; yaml.safe_load(open('.github/workflows/deploy.yml'))"`).
Expected: sem erros de parsing.

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/deploy.yml docs/deploy.md
git commit -m "$(printf 'feat(deploy): workflow build+push GHCR + repository_dispatch ao backend\n\nCo-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>\nClaude-Session: https://claude.ai/code/session_01LrrSbJgtspjxBiziihtrWk')"
```

- [ ] **Step 5: Push + abrir PR do frontend**

```bash
git push -u origin feat/deploy-vps
gh pr create --repo tututazeni-spec/tututazeni-frontend --base main \
  --title "feat(deploy): frontend servido no VPS (imagem standalone + CI)" \
  --body "$(printf 'Deploy do frontend Next.js no mesmo VPS do backend, atrás do Caddy.\n\n- output: standalone + rota /health\n- Dockerfile Node 20 non-root com healthcheck\n- workflow: build+push GHCR + repository_dispatch ao backend\n\nSpec: tututazeni-backend/docs/superpowers/specs/2026-09-07-frontend-deploy-lb-hardening-design.md\n\n🤖 Generated with [Claude Code](https://claude.com/claude-code)')"
```

- [ ] **Step 6: Aguardar CI**

Run: `gh pr checks --repo tututazeni-spec/tututazeni-frontend --watch`
Expected: `Frontend Quality` verde. **Não fazer merge ainda** — o merge do frontend faz-se depois de o backend aceitar o `repository_dispatch` (Task 7), senão o primeiro `notify-backend` não tem efeito. Registar o número do PR e prosseguir para a Fase 2.

> Nota: se `notify-backend` correr antes de a Task 7 estar em `main` do backend, o passo falha silenciosamente (evento ignorado). Sem impacto — a imagem fica no GHCR e o próximo dispatch (ou *Run workflow* manual) faz o rollout.

---

## FASE 2 — Repo `tututazeni-backend` (raiz do workspace)

> Branch já criada: `feat/frontend-deploy-lb-hardening`. Confirmar:
> ```bash
> git branch --show-current   # feat/frontend-deploy-lb-hardening
> ```

### Task 4: Serviço `frontend` + endurecimento do Caddy no compose

**Files:**
- Modify: `ops/docker-compose.prod.yml`
- Modify: `ops/.env.production.example`

**Interfaces:**
- Consumes: imagem `ghcr.io/tututazeni-spec/tututazeni-frontend` (Fase 1); vars `FRONTEND_IMAGE_TAG`, `API_INTERNAL_URL` do `.env.production`.
- Produces: serviço Docker Compose `frontend` (2 réplicas, sem porta publicada, healthcheck da imagem) e serviço `caddy` endurecido. Consumido por `deploy.sh` (Task 6) e pelo Caddyfile (Task 5).

- [ ] **Step 1: Adicionar o serviço `frontend`**

Em `ops/docker-compose.prod.yml`, imediatamente **a seguir** ao bloco do serviço `app` (antes do comentário `# ─── Borda TLS + Load Balancer ...` do `caddy`), inserir:

```yaml
  # ─── Frontend Next.js (ponto 3 — camada Next.js) ─────────────────────────
  # Imagem própria, construída pelo repo tututazeni-frontend e publicada no
  # GHCR. 2 réplicas pelo mesmo motivo do `app`: falha de processo não derruba
  # o site. Sem porta publicada (as réplicas partilhariam a :3000). O Caddy
  # encaminha `/` para aqui e `/api/*` para o `app`.
  frontend:
    image: ghcr.io/tututazeni-spec/tututazeni-frontend:${FRONTEND_IMAGE_TAG:-latest}
    env_file: .env.production # API_INTERNAL_URL
    environment:
      PORT: '3000'
    depends_on:
      app:
        condition: service_started
    restart: unless-stopped
    deploy:
      replicas: 2
      resources:
        limits:
          cpus: '0.75'
          memory: 384M
    # healthcheck herdado do HEALTHCHECK da imagem (GET /health).
```

- [ ] **Step 2: Endurecer o serviço `caddy`**

No bloco do serviço `caddy`, aplicar estas quatro alterações:

1. `depends_on:` — passar de:
   ```yaml
   depends_on:
     - app
   ```
   para:
   ```yaml
   depends_on:
     - app
     - frontend
   ```

2. `restart:` — passar `restart: unless-stopped` para `restart: always`.

3. Acrescentar `stop_grace_period` e `healthcheck` logo a seguir a `restart: always`:
   ```yaml
   restart: always
   stop_grace_period: 15s
   healthcheck:
     # A admin API do Caddy escuta em localhost:2019. Se o Caddy pendurar (não
     # morrer), o Docker reinicia-o em vez de esperar pelo exit do processo.
     test: ['CMD', 'wget', '-q', '-O', '-', 'http://127.0.0.1:2019/config/']
     interval: 10s
     timeout: 5s
     retries: 3
     start_period: 10s
   ```

4. `deploy.resources.limits.memory` — passar de `128M` para `256M`.

- [ ] **Step 3: Validar o compose**

Run:
```bash
FRONTEND_IMAGE_TAG=latest IMAGE_TAG=latest docker compose -f ops/docker-compose.prod.yml --env-file ops/.env.production.example config >/dev/null && echo OK
```
Expected: `OK` (sem erros de sintaxe/interpolação). Ignorar avisos sobre variáveis não definidas.

- [ ] **Step 4: Acrescentar as vars ao `.env.production.example`**

No fim de `ops/.env.production.example`, acrescentar:

```dotenv

# ─── Frontend (Next.js) — servido pelo mesmo Caddy em / ──────────────────────
# Tag da imagem do frontend no GHCR. O deploy.sh sobrepõe-na a partir do
# repository_dispatch; este valor é o fallback da primeira vez.
FRONTEND_IMAGE_TAG=latest
# URL interna da API para SSR / route handlers do Next (rede Docker do compose).
API_INTERNAL_URL=http://app:4000
```

- [ ] **Step 5: Commit**

```bash
npx prettier --write ops/docker-compose.prod.yml
git add ops/docker-compose.prod.yml ops/.env.production.example
git commit -m "$(printf 'feat(infra): servico frontend x2 + Caddy endurecido (restart always, healthcheck, 256M)\n\nCo-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>\nClaude-Session: https://claude.ai/code/session_01LrrSbJgtspjxBiziihtrWk')"
```

> Nota: se o `prettier` reformatar YAML de forma indesejada, reverter só esse ficheiro (`git checkout -- ops/docker-compose.prod.yml`) e commitar sem prettier — YAML de compose não é verificado pelo CI.

---

### Task 5: Activar a rota do frontend no Caddyfile

**Files:**
- Modify: `ops/caddy/Caddyfile`

**Interfaces:**
- Consumes: serviço `frontend` na porta 3000 (Task 4).
- Produces: Caddy encaminha tudo o que não é `/api/*` para `frontend`. Consumido em runtime pelo ensaio da Task 9.

- [ ] **Step 1: Substituir o bloco comentado + o catch-all 404**

Em `ops/caddy/Caddyfile`, localizar este trecho:

```caddy
	# Frontend ainda não deployado (Faixa H). Quando existir:
	# handle {
	# 	reverse_proxy {
	# 		dynamic a { name frontend port 3000 refresh 5s }
	# 	}
	# }
	handle {
		respond "Not Found" 404
	}
```

e substituí-lo por:

```caddy
	# Frontend Next.js (catch-all: tudo o que não é /api/*). `dynamic a` resolve
	# o serviço `frontend` para todos os IPs das réplicas (refresh 5s).
	# round-robin + failover passivo, igual ao bloco /api acima. Os headers de
	# conteúdo (CSP, X-Frame-Options, …) são emitidos pelo Next; o HSTS global
	# deste site aplica-se também aqui.
	handle {
		reverse_proxy {
			dynamic a {
				name frontend
				port 3000
				refresh 5s
			}
			lb_policy round_robin
			lb_try_duration 5s
			lb_try_interval 250ms
			fail_duration 30s
			unhealthy_status 5xx
		}
	}
```

- [ ] **Step 2: Validar a estrutura do Caddyfile**

Run:
```bash
cat ops/caddy/Caddyfile | docker run --rm -i caddy:2-alpine sh -c 'cat > /tmp/Caddyfile && DOMAIN=example.com caddy adapt --config /tmp/Caddyfile --adapter caddyfile >/dev/null && echo CADDYFILE_OK'
```
Expected: `CADDYFILE_OK`. (`caddy adapt` valida directivas sem provisionar TLS.)

- [ ] **Step 3: Confirmar a ordem dos blocos**

Run: `grep -n 'handle_path /api\|handle {' ops/caddy/Caddyfile`
Expected: a linha `handle_path /api/*` aparece **antes** de `handle {`.

- [ ] **Step 4: Commit**

```bash
npx prettier --write ops/caddy/Caddyfile 2>/dev/null || true
git add ops/caddy/Caddyfile
git commit -m "$(printf 'feat(infra): Caddy encaminha / para o frontend (catch-all, round-robin, failover passivo)\n\nCo-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>\nClaude-Session: https://claude.ai/code/session_01LrrSbJgtspjxBiziihtrWk')"
```

> Nota: o prettier não conhece a sintaxe Caddyfile — o `|| true` evita que falhe o passo. Verificar `git diff --cached` antes de commitar; se o prettier corrompeu o ficheiro, `git checkout -- ops/caddy/Caddyfile` e refazer a edição sem prettier.

---

### Task 6: `deploy.sh` + `rollback.sh` — tag e health gate do frontend

**Files:**
- Modify: `ops/deploy/deploy.sh`
- Modify: `ops/deploy/rollback.sh`

**Interfaces:**
- Consumes: serviço `frontend` do compose (Task 4); env `FRONTEND_TAG` (opcional, vem da Task 7).
- Produces: ficheiros de estado `current_frontend_tag` / `previous_frontend_tag` a par de `current_tag` / `previous_tag`; health gate que só passa com **todas** as réplicas `app` **e** `frontend` `healthy`.

- [ ] **Step 1: Resolver e persistir a tag do frontend em `deploy.sh`**

Em `ops/deploy/deploy.sh`, logo a seguir à linha `COMPOSE_FILE="docker-compose.prod.yml"`, inserir:

```bash

# ─── Tag do frontend (serviço replicado à parte, imagem própria no GHCR) ────
# Precedência: $FRONTEND_TAG do ambiente (repository_dispatch) > current_frontend_tag
# (deploy anterior) > "latest" (primeira vez).
FTAG="${FRONTEND_TAG:-}"
if [ -z "$FTAG" ] && [ -f current_frontend_tag ]; then
  FTAG="$(cat current_frontend_tag)"
fi
FTAG="${FTAG:-latest}"

if [ -f current_frontend_tag ] && [ "$(cat current_frontend_tag)" != "$FTAG" ]; then
  cp current_frontend_tag previous_frontend_tag
fi
echo "$FTAG" > current_frontend_tag
```

- [ ] **Step 2: Incluir `frontend` no pull e no up**

Em `deploy.sh`, na linha do `pull`:

```bash
IMAGE_TAG="$TAG" docker compose -f "$COMPOSE_FILE" pull app migrate \
  || echo "⚠ pull falhou — a usar imagem local se existir"
```

passar para:

```bash
IMAGE_TAG="$TAG" FRONTEND_IMAGE_TAG="$FTAG" docker compose -f "$COMPOSE_FILE" pull app migrate frontend \
  || echo "⚠ pull falhou — a usar imagem local se existir"
```

E na linha do `up -d`:

```bash
IMAGE_TAG="$TAG" docker compose -f "$COMPOSE_FILE" up -d
```

passar para:

```bash
IMAGE_TAG="$TAG" FRONTEND_IMAGE_TAG="$FTAG" docker compose -f "$COMPOSE_FILE" up -d
```

- [ ] **Step 3: Generalizar o health gate para `app` + `frontend`**

Em `deploy.sh`, substituir todo o bloco do health gate (de `echo "▶ à espera das réplicas de app (máx 120s)..."` até ao `exit 1` final do ficheiro) por:

```bash
echo "▶ à espera das réplicas de app + frontend (máx 120s)..."
deadline=$((SECONDS + 120))
summary="app 0/0 · frontend 0/0"

# Define SVC_HEALTHY / SVC_TOTAL para o serviço $1.
svc_health() {
  local svc="$1" cid st ids
  SVC_TOTAL=0
  SVC_HEALTHY=0
  ids="$(docker compose -f "$COMPOSE_FILE" ps -q "$svc" || true)"
  for cid in $ids; do
    SVC_TOTAL=$((SVC_TOTAL + 1))
    st="$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "$cid" 2>/dev/null || echo none)"
    [ "$st" = "healthy" ] && SVC_HEALTHY=$((SVC_HEALTHY + 1))
  done
}

while [ "$SECONDS" -lt "$deadline" ]; do
  svc_health app
  a_healthy=$SVC_HEALTHY
  a_total=$SVC_TOTAL
  svc_health frontend
  f_healthy=$SVC_HEALTHY
  f_total=$SVC_TOTAL
  summary="app $a_healthy/$a_total · frontend $f_healthy/$f_total"
  if [ "$a_total" -ge 1 ] && [ "$a_healthy" -eq "$a_total" ] &&
    [ "$f_total" -ge 1 ] && [ "$f_healthy" -eq "$f_total" ]; then
    echo "✅ $summary — todas saudáveis (app=$TAG frontend=$FTAG)"
    exit 0
  fi
  echo "  … $summary"
  sleep 3
done

echo "❌ réplicas não ficaram saudáveis em 120s (última contagem: $summary)"
docker compose -f "$COMPOSE_FILE" ps app frontend || true
docker compose -f "$COMPOSE_FILE" logs --tail 50 app frontend || true
exit 1
```

- [ ] **Step 4: `rollback.sh` — repor também a tag do frontend**

Em `ops/deploy/rollback.sh`, substituir as duas últimas linhas:

```bash
PREV="$(cat previous_tag)"
echo "▶ rollback para a tag anterior: $PREV"
exec "$SCRIPT_DIR/deploy.sh" "$PREV"
```

por:

```bash
PREV="$(cat previous_tag)"
if [ -f previous_frontend_tag ]; then
  FRONTEND_TAG="$(cat previous_frontend_tag)"
  export FRONTEND_TAG
  echo "▶ rollback para: app=$PREV · frontend=$FRONTEND_TAG"
else
  echo "▶ rollback para: app=$PREV · frontend=<inalterado>"
fi
exec "$SCRIPT_DIR/deploy.sh" "$PREV"
```

- [ ] **Step 5: Verificar a sintaxe dos scripts**

Run: `bash -n ops/deploy/deploy.sh && bash -n ops/deploy/rollback.sh && echo SYNTAX_OK`
Expected: `SYNTAX_OK`.

Run (se `shellcheck` disponível): `shellcheck ops/deploy/deploy.sh ops/deploy/rollback.sh`
Expected: sem erros novos (avisos pré-existentes toleráveis). Se `shellcheck` não estiver instalado, saltar.

- [ ] **Step 6: Teste unitário da resolução de tag (sem Docker)**

Criar `ops/deploy/test-frontend-tag.sh`:

```bash
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
```

Run: `bash ops/deploy/test-frontend-tag.sh`
Expected: `ALL_OK`.

- [ ] **Step 7: Commit**

```bash
git add ops/deploy/deploy.sh ops/deploy/rollback.sh ops/deploy/test-frontend-tag.sh
git commit -m "$(printf 'feat(deploy): deploy.sh/rollback.sh gerem a tag do frontend + health gate cobre app e frontend\n\nCo-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>\nClaude-Session: https://claude.ai/code/session_01LrrSbJgtspjxBiziihtrWk')"
```

---

### Task 7: Workflow Deploy do backend — trigger `repository_dispatch`

**Files:**
- Modify: `.github/workflows/deploy.yml`

**Interfaces:**
- Consumes: evento `repository_dispatch` `frontend-updated` com `client_payload.tag` (Task 3).
- Produces: rollout que passa `FRONTEND_TAG` ao `deploy.sh` (Task 6) sem reconstruir a imagem do backend; `verify` valida `GET /`.

- [ ] **Step 1: Acrescentar o trigger**

Em `.github/workflows/deploy.yml`, no bloco `on:`, a seguir a `workflow_dispatch:` (e o seu bloco `inputs:`), acrescentar:

```yaml
  repository_dispatch:
    types: [frontend-updated]
```

- [ ] **Step 2: Não reconstruir o backend num dispatch do frontend**

No job `build`, a condição actual:

```yaml
    if: ${{ github.event.inputs.tag == '' }}
```

passar para:

```yaml
    if: ${{ github.event_name != 'repository_dispatch' && github.event.inputs.tag == '' }}
```

- [ ] **Step 3: Passar `FRONTEND_TAG` ao script de deploy**

No job `deploy`, no passo "Deploy no VPS (deploy.sh com health gate)":

1. Na linha `envs: DEPLOY_TAG,GHCR_TOKEN,GHCR_USER` acrescentar `FRONTEND_TAG`:
   ```yaml
             envs: DEPLOY_TAG,FRONTEND_TAG,GHCR_TOKEN,GHCR_USER
   ```

2. No bloco `env:` desse passo (que já tem `DEPLOY_TAG:`, `GHCR_TOKEN:`, `GHCR_USER:`), acrescentar:
   ```yaml
           FRONTEND_TAG: ${{ github.event_name == 'repository_dispatch' && github.event.client_payload.tag || '' }}
   ```

   (Fora de um `repository_dispatch`, `FRONTEND_TAG` vai vazio → o `deploy.sh` mantém `current_frontend_tag`.)

- [ ] **Step 4: `verify` — checar o frontend (`GET /`)**

No job `verify`, **antes** do passo "Smoke pós-deploy (suite da regra 8 contra produção)", inserir:

```yaml
      - name: Verificar frontend (GET /)
        run: |
          base="${SMOKE_BASE_URL%/api}"
          code=$(curl -s -o /dev/null -w '%{http_code}' -L --max-time 15 "$base/")
          echo "GET $base/ → $code"
          case "$code" in
            2??|3??) echo "frontend OK" ;;
            *) echo "frontend não respondeu OK"; exit 1 ;;
          esac
        env:
          SMOKE_BASE_URL: ${{ secrets.SMOKE_BASE_URL }}
```

- [ ] **Step 5: Validar a sintaxe do workflow**

Run: `python -c "import yaml; yaml.safe_load(open('.github/workflows/deploy.yml')); print('YAML_OK')"`
Expected: `YAML_OK`.

- [ ] **Step 6: Rever a condição do `preflight` e do `deploy`**

Ler os jobs `preflight` e `deploy` e confirmar (sem editar, salvo se falharem a análise):
- `preflight` calcula `can_deploy` como `secrets.DEPLOY_HOST != '' && github.event_name != 'pull_request'` — um `repository_dispatch` **não** é `pull_request`, logo `can_deploy=true`. OK.
- `deploy.if` aceita `needs.build.result == 'skipped'` — no dispatch o `build` é saltado. OK.

Se alguma destas condições não se verificar no ficheiro real, ajustar e anotar no commit.

- [ ] **Step 7: Commit**

```bash
npx prettier --write .github/workflows/deploy.yml 2>/dev/null || true
git add .github/workflows/deploy.yml
git commit -m "$(printf 'feat(deploy): workflow aceita repository_dispatch do frontend (rollout sem rebuild) + verify GET /\n\nCo-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>\nClaude-Session: https://claude.ai/code/session_01LrrSbJgtspjxBiziihtrWk')"
```

---

### Task 8: Documentação de deploy

**Files:**
- Modify: `docs/deploy/ha-and-spof.md`
- Modify: `docs/deploy/cloudflare.md`
- Modify: `docs/deploy/runbook.md`

**Interfaces:**
- Consumes: a topologia resultante das Tasks 4–7.
- Produces: docs alinhadas. Sem consumidores de código.

- [ ] **Step 1: `ha-and-spof.md`**

1. Na tabela "## O que mudou", acrescentar linha no fim:
   | `Sem frontend deployado` | Serviço `frontend` com **2 réplicas** no mesmo VPS, atrás do Caddy (`/` → `frontend`, `/api/*` → `app`) |
   | `Caddy: 1 container, sem healthcheck, 128 MB` | `restart: always` + healthcheck da admin API (reinício em *hang*, não só em *exit*) + limite 256 MB + `stop_grace_period` |

2. Na secção "## O que passou a ser redundante (deixou de ser SPOF)", acrescentar bullet:
   > - **Processo do frontend.** Uma réplica `frontend` que crashe ou entre em OOM
   >   (limite 384 MB) sai da rotação do Caddy em segundos; a outra continua a
   >   servir. Mesmo mecanismo do `app`.

3. Na tabela "## O que CONTINUA a ser SPOF", alterar a linha do **Container Caddy** — coluna "Mitigação actual" passa a:
   > `restart: always`; **healthcheck de container** (reinicia um Caddy pendurado, não só um que saiu); config validada em CI; limite de memória 256 MB isola de OOM do vizinho
   E acrescentar uma linha nova:
   | **Frontend (mesma caixa)** | Partilha os SPOF do host / Caddy / Redis | 2 réplicas (falha de processo), `restart: unless-stopped` | 2º VPS (topologia "Médio") |

4. Na secção "## Dimensionamento do VPS", substituir o parágrafo dos limites por:
   > Com 2 réplicas `app` + 2 réplicas `frontend` + borda + monitorização, os
   > limites de memória somam **≈ 3,4 GB** (app 2×768, frontend 2×384,
   > prometheus 400, caddy 256, redis 192, alertmanager 128, node-exporter 96).
   > **Recomendado 4 vCPU / 8 GB.** Num host de 4 GB fica sem folga para picos —
   > subir para 8 GB antes de aumentar qualquer `replicas`.

5. Na secção "## Gatilho para subir a Médio — 2 VPS + LB", transformar o item
   "Passa a haver frontend deployado no mesmo VPS" em **estado cumprido** e
   promover a recomendação. Substituir a frase final da secção por:
   > **O item "frontend no mesmo VPS" está agora cumprido** — a topologia "Médio"
   > passa de gatilho futuro a **recomendação activa**. Plano concreto:
   > - 2 VPS idênticos (`docker compose -f docker-compose.prod.yml` em cada);
   > - Redis gerido (ou Sentinel) — deixa de ser SPOF local;
   > - LB à frente dos dois: **Cloudflare Load Balancing** (add-on pago) sobre os
   >   dois IPs de origem com health checks activos, **ou** Caddy/HAProxy num 3º
   >   nó pequeno;
   > - o `Caddyfile` já usa `dynamic a` — passa a resolver um nome DNS que aponta
   >   aos dois nós; sem mudança estrutural na config.

- [ ] **Step 2: `cloudflare.md`**

Na secção "## 5. Cache / CDN":

1. Substituir o bullet do frontend futuro:
   > - `/` e estáticos do futuro frontend (Faixa H) → **Cache Everything**, `Edge TTL` conforme.

   por:
   > - `/` e estáticos do frontend (agora deployado) → **Cache Everything** com
   >   `Edge TTL` conservador (ex. 5 min); manter `/api/*` → **Bypass cache**.
   >   Páginas autenticadas do Next não devem ser cacheadas — se o frontend
   >   servir HTML específico do utilizador em `/`, restringir a regra aos
   >   caminhos de estáticos (`/_next/static/*`, `/*.svg`, etc.) e deixar `/`
   >   como *Standard*.

2. No bullet do **Always Online**, acrescentar ao fim: "Agora cobre também as páginas GET do frontend (antes só existia a API)."

- [ ] **Step 3: `runbook.md`**

1. No bloco "> **Topologia:**" do topo, substituir por:
   > **Topologia:** Cloudflare (WAF+CDN) → Caddy (TLS origin + load balancer,
   > endurecido) → serviço `app` (**2 réplicas**) para `/api/*` e serviço
   > `frontend` (**2 réplicas**) para `/`. As migrations correm num job `migrate`
   > one-shot antes das réplicas.

2. A seguir à secção "## 3. Secrets no GitHub", acrescentar uma secção nova:

```markdown
## 3-A. Frontend — imagem e rollout cruzado

O frontend (`tututazeni-frontend`, repo separado) publica a sua própria imagem
no GHCR e dispara o rollout deste repo:

1. Merge em `main` do frontend → workflow `Frontend Deploy`:
   - `build`: push `ghcr.io/tututazeni-spec/tututazeni-frontend:{sha-<sha>,latest}`.
   - `notify-backend`: `repository_dispatch` (`frontend-updated`,
     `client_payload.tag`) para este repo.
2. Este workflow `Deploy` acorda no `repository_dispatch`: **não** reconstrói o
   backend; corre `deploy.sh` com `FRONTEND_TAG=<sha-…>` e a tag actual do
   backend (de `current_tag`). Health gate espera **todas** as réplicas `app` +
   `frontend`; falha → `rollback.sh` repõe as duas tags anteriores.

**Secret no repo do frontend:** `BACKEND_DISPATCH_TOKEN` — PAT fine-grained com
`contents: write` **apenas** neste repo. Sem ele a imagem publica mas o rollout
não arranca (recuperável: Actions → Deploy → *Run workflow*).

**Primeiro deploy:** o `Frontend Deploy` tem de ter corrido ao menos uma vez
(para existir `:latest` no GHCR) antes do primeiro `up -d` que inclua o serviço
`frontend`. `current_frontend_tag` ainda não existe → `deploy.sh` assume `latest`.
```

3. Na secção "## 2. Configurar o ambiente da app no VPS", acrescentar ao fim:
   > Acrescentar ao `/opt/innova/.env.production`: `FRONTEND_IMAGE_TAG=latest` e
   > `API_INTERNAL_URL=http://app:4000` (ver `ops/.env.production.example`).

4. Na secção "## 6. Operação corrente", acrescentar aos exemplos:
   ```bash
   $COMPOSE logs -f frontend           # ambas as réplicas do frontend
   cat /opt/innova/current_frontend_tag /opt/innova/previous_frontend_tag
   $COMPOSE up -d --scale frontend=3 frontend
   ```

5. Na secção "## 8. Ensaio local do ciclo completo (sem VPS)", substituir o
   bloco de comandos por (mantendo o texto explicativo à volta):

```bash
docker build -t innova-api:local .
docker tag innova-api:local ghcr.io/tututazeni-spec/tututazeni-backend:local-v1
docker tag innova-api:local ghcr.io/tututazeni-spec/tututazeni-backend:local-v2

# Frontend: build a partir de um checkout local do repo tututazeni-frontend
docker build -t innova-fe:local ../tututazeni-frontend   # ajustar o caminho
docker tag innova-fe:local ghcr.io/tututazeni-spec/tututazeni-frontend:local-v1
docker tag innova-fe:local ghcr.io/tututazeni-spec/tututazeni-frontend:local-v2

# ops/.env.production local: ver ops/.env.production.example
#   FRONTEND_IMAGE_TAG e API_INTERNAL_URL=http://app:4000 incluídos

openssl req -x509 -newkey rsa:2048 -nodes -days 365 \
  -keyout ops/caddy/origin/key.pem -out ops/caddy/origin/cert.pem -subj "/CN=localhost"

FRONTEND_TAG=local-v1 bash ops/deploy/deploy.sh local-v1
FRONTEND_TAG=local-v2 bash ops/deploy/deploy.sh local-v2
bash ops/deploy/rollback.sh          # volta a app+frontend local-v1

curl -k https://localhost/                 # HTML do Next
curl -k https://localhost/api/health/ready # 200 do backend
npm run test:regression                    # smoke contra http://localhost:4000

IMAGE_TAG=local-v1 FRONTEND_IMAGE_TAG=local-v1 docker compose -f ops/docker-compose.prod.yml down
rm -f ops/current_tag ops/previous_tag ops/current_frontend_tag ops/previous_frontend_tag ops/caddy/origin/*.pem
```

- [ ] **Step 4: Commit**

```bash
npx prettier --write docs/deploy/ha-and-spof.md docs/deploy/cloudflare.md docs/deploy/runbook.md
git add docs/deploy/ha-and-spof.md docs/deploy/cloudflare.md docs/deploy/runbook.md
git commit -m "$(printf 'docs(deploy): topologia com frontend no VPS + Caddy endurecido + gatilho 2-VPS cumprido\n\nCo-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>\nClaude-Session: https://claude.ai/code/session_01LrrSbJgtspjxBiziihtrWk')"
```

---

### Task 9: Ensaio local do stack completo

**Files:**
- Nenhum ficheiro novo. Executa `docs/deploy/runbook.md` §8 (actualizado na Task 8) e corrige o que falhar nas Tasks 4–8.

**Interfaces:**
- Consumes: tudo das Tasks 1–8. Requer Docker Desktop a correr, e um checkout do repo `tututazeni-frontend` acessível (o `frontend/` do workspace serve).
- Produces: prova de que o stack sobe e serve os dois lados; health gate e rollback exercitados.

- [ ] **Step 1: Preparar `.env.production` local**

```bash
cp ops/.env.production.example ops/.env.production
```
Editar `ops/.env.production`: garantir `DATABASE_URL` para uma BD Postgres local acessível (ex. `innova_test`), `FRONTEND_IMAGE_TAG` e `API_INTERNAL_URL=http://app:4000` presentes, e preencher `METRICS_TOKEN` + o mínimo do `alertmanager` para o `deploy.sh` não abortar no render (`SMTP_*`, `ALERT_EMAIL_TO`, `TELEGRAM_*`, `HEALTHCHECKS_PING_URL` podem ficar vazios mas **têm de existir** como chaves).

- [ ] **Step 2: Build das imagens locais**

```bash
docker build -t ghcr.io/tututazeni-spec/tututazeni-backend:local-v1 .
docker build -t ghcr.io/tututazeni-spec/tututazeni-frontend:local-v1 ./frontend
docker tag ghcr.io/tututazeni-spec/tututazeni-backend:local-v1  ghcr.io/tututazeni-spec/tututazeni-backend:local-v2
docker tag ghcr.io/tututazeni-spec/tututazeni-frontend:local-v1 ghcr.io/tututazeni-spec/tututazeni-frontend:local-v2
```

- [ ] **Step 3: Cert self-signed para o Caddy**

```bash
mkdir -p ops/caddy/origin
openssl req -x509 -newkey rsa:2048 -nodes -days 365 \
  -keyout ops/caddy/origin/key.pem -out ops/caddy/origin/cert.pem -subj "/CN=localhost"
```

- [ ] **Step 4: Deploy local v1 → v2 → rollback**

```bash
cd ops
FRONTEND_TAG=local-v1 bash deploy/deploy.sh local-v1
FRONTEND_TAG=local-v2 bash deploy/deploy.sh local-v2
bash deploy/rollback.sh
cd ..
```

Expected: cada invocação termina com `✅ app x/x · frontend x/x — todas saudáveis` e sai `0`. `cat ops/current_frontend_tag` → `local-v1` depois do rollback; `cat ops/previous_frontend_tag` → `local-v2`.

- [ ] **Step 5: Verificar o routing pela borda**

```bash
curl -k -s -o /dev/null -w 'frontend / → %{http_code}\n' https://localhost/
curl -k -s -w 'backend  /api/health/ready → %{http_code}\n' -o /dev/null https://localhost/api/health/ready
curl -k -s https://localhost/health   # rota do Next, não do backend
```

Expected: `/` → 200/3xx; `/api/health/ready` → 200; `/health` → `{"status":"ok"}`.

- [ ] **Step 6: Exercitar a redundância**

```bash
# matar 1 réplica do frontend — o site continua
fe_id=$(docker compose -f ops/docker-compose.prod.yml ps -q frontend | head -1)
docker kill "$fe_id"
curl -k -s -o /dev/null -w 'durante falha: %{http_code}\n' https://localhost/
docker compose -f ops/docker-compose.prod.yml ps frontend    # 1/2 up; Docker recria a morta

# matar o Caddy — restart:always repõe-no
docker kill innova-caddy
sleep 5
docker ps --filter name=innova-caddy --format '{{.Status}}'   # Up (restarted)
```

Expected: `curl` durante a falha da réplica → 200/3xx (servido pela outra); Caddy volta a `Up` sozinho.

- [ ] **Step 7: Simular health gate a falhar → rollback automático**

```bash
# imagem de frontend propositadamente doente (healthcheck nunca fica healthy)
printf 'FROM ghcr.io/tututazeni-spec/tututazeni-frontend:local-v1\nUSER root\nRUN rm -f server.js\n' | docker build -t ghcr.io/tututazeni-spec/tututazeni-frontend:local-bad -
cd ops
FRONTEND_TAG=local-bad bash deploy/deploy.sh local-v1 ; echo "exit=$?"
cd ..
```

Expected: `deploy.sh` termina com `❌ réplicas não ficaram saudáveis em 120s` e `exit=1`. (No CI seria o `rollback` job a disparar; aqui confirma-se só que o gate falha.) Repor o bom estado:

```bash
cd ops && FRONTEND_TAG=local-v1 bash deploy/deploy.sh local-v1 && cd ..
```

- [ ] **Step 8: Limpar**

```bash
IMAGE_TAG=local-v1 FRONTEND_IMAGE_TAG=local-v1 docker compose -f ops/docker-compose.prod.yml down -v
rm -f ops/current_tag ops/previous_tag ops/current_frontend_tag ops/previous_frontend_tag ops/caddy/origin/*.pem ops/.env.production ops/monitoring/metrics_token ops/monitoring/alertmanager.yml
docker rmi ghcr.io/tututazeni-spec/tututazeni-frontend:local-bad || true
```

- [ ] **Step 9: Corrigir e commitar (se o ensaio revelou defeitos)**

Se algum passo falhou por bug nas Tasks 4–8, corrigir o ficheiro em causa, repetir o ensaio, e commitar:

```bash
git add -A
git commit -m "$(printf 'fix(deploy): correcoes do ensaio local do stack completo\n\nCo-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>\nClaude-Session: https://claude.ai/code/session_01LrrSbJgtspjxBiziihtrWk')"
```

Se o ensaio passou todo à primeira, marcar o step como concluído sem commit.

---

### Task 10: PR do backend + fecho do PR do frontend

**Files:** nenhum.

- [ ] **Step 1: Confirmar árvore limpa e prettier**

```bash
npx prettier --write "ops/**/*.{yml,yaml}" "docs/deploy/*.md" "docs/superpowers/**/2026-09-07-frontend-deploy-lb-hardening*.md"
git status --porcelain
git diff --stat
```
Committar qualquer reformatação residual.

- [ ] **Step 2: Push da branch do backend**

```bash
git push -u origin feat/frontend-deploy-lb-hardening
```

- [ ] **Step 3: Abrir o PR do backend**

```bash
gh pr create --base main \
  --title "feat(infra): frontend Next.js no VPS + endurecimento da borda Caddy" \
  --body "$(printf 'Fecha as duas lacunas da auditoria de arquitectura de referência.\n\n## Camada Next.js — deployada\n- Serviço `frontend` (x2 réplicas) no compose de produção, atrás do Caddy: `/` -> frontend, `/api/*` -> app (intocado).\n- Imagem própria construída pelo repo tututazeni-frontend -> GHCR -> rollout via `repository_dispatch` no pipeline health-gated + rollback deste repo.\n\n## Camada Load Balancer — endurecida\n- Caddy: `restart: always`, healthcheck de container (reinício em hang), memória 128M->256M, `stop_grace_period`.\n- Numa topologia de 1 VPS o LB não fica HA (host é SPOF partilhado); fica ao nível de redundância dos tiers `app`/`redis`. `ha-and-spof.md` marca o gatilho de 2 VPS como cumprido e promove a topologia Médio a recomendação activa.\n\n## Docs\n- ha-and-spof.md, cloudflare.md, runbook.md actualizados.\n\nSpec: docs/superpowers/specs/2026-09-07-frontend-deploy-lb-hardening-design.md\nPlano: docs/superpowers/plans/2026-09-07-frontend-deploy-lb-hardening.md\nPR do frontend: tututazeni-spec/tututazeni-frontend#<N>\n\n🤖 Generated with [Claude Code](https://claude.com/claude-code)')"
```

- [ ] **Step 4: Aguardar o check `quality`**

```bash
gh pr checks --watch
```
Expected: check `quality` (workflow `Code Quality`) **verde**. Regra 15 do `CLAUDE.md`: nenhum merge sem isto. Se falhar, diagnosticar (`gh run view --log-failed`), corrigir, novo commit, repetir.

- [ ] **Step 5: Merge do backend**

Após `quality` verde e revisão humana aprovada:
```bash
gh pr merge --squash --delete-branch
```

- [ ] **Step 6: Fechar o PR do frontend**

Com o backend em `main` (já aceita o `repository_dispatch`), voltar ao PR do frontend:
```bash
cd frontend
gh pr checks --repo tututazeni-spec/tututazeni-frontend --watch   # Frontend Quality verde
gh pr merge --repo tututazeni-spec/tututazeni-frontend --squash --delete-branch
cd ..
```
O merge dispara `Frontend Deploy` → publica a imagem → `repository_dispatch` → workflow `Deploy` do backend faz o rollout (no-op efectivo se os secrets `DEPLOY_*` ainda não existirem no repo do backend).

- [ ] **Step 7: Actualizar o estado do spec**

Em `docs/superpowers/specs/2026-09-07-frontend-deploy-lb-hardening-design.md`, mudar `> Estado: aprovado (design) — pendente de plano de implementação` para `> Estado: implementado (PRs backend #<N> + frontend #<M>)`. Commit directo em `main` não é permitido — incluir esta alteração no PR do backend (Step 3) **ou** abrir um PR de follow-up trivial.

---

## Self-Review

**1. Spec coverage:**

| Requisito do spec | Task |
|---|---|
| §3.1 `output: 'standalone'` | Task 1 |
| §3.2 `app/health/route.ts` | Task 1 |
| §3.3 `Dockerfile` standalone Node 20 non-root + HEALTHCHECK | Task 2 |
| §3.4 `.dockerignore` | Task 2 |
| §3.5 workflow `deploy.yml` (build+push, PR sem push, `repository_dispatch`) | Task 3 |
| §3.5 secret `BACKEND_DISPATCH_TOKEN` | Task 3 (docs) + Task 8 (runbook) |
| §3.6 `docs/deploy.md` no frontend | Task 3 |
| §4.1 serviço `frontend` (×2, limites, sem porta) | Task 4 |
| §4.1 Caddy endurecido (restart always, healthcheck, 256M, stop_grace_period, depends_on) | Task 4 |
| §4.2 Caddyfile bloco `handle` → frontend | Task 5 |
| §4.3 `deploy.sh` tag do frontend + health gate app+frontend | Task 6 |
| §4.4 `rollback.sh` repõe `previous_frontend_tag` | Task 6 |
| §4.5 `deploy.yml` backend: trigger, condições dos jobs, `verify` GET / | Task 7 |
| §4.6 `.env.production.example` (`FRONTEND_IMAGE_TAG`, `API_INTERNAL_URL`) | Task 4 |
| §4.7 `ha-and-spof.md` | Task 8 |
| §4.7 `cloudflare.md` | Task 8 |
| §4.7 `runbook.md` (topologia, `repository_dispatch`, §8 estendido) | Task 8 |
| §5 fluxos de deploy | Task 7 + Task 8 (runbook §3-A) |
| §7 plano de testes (build FE, ensaio local, health gate, rollback) | Task 2, Task 6, Task 9 |
| §7.3 CI `quality` verde antes de merge | Task 10 |

Sem lacunas.

**2. Placeholder scan:** sem "TBD"/"TODO"/"handle edge cases". Os `<N>`/`<M>` em Task 10 são números de PR preenchidos em runtime (identificados como tal). `../tututazeni-frontend` no runbook §8 tem a nota "ajustar o caminho".

**3. Type consistency:**
- Ficheiros de estado: `current_frontend_tag` / `previous_frontend_tag` — nomes idênticos em Task 6, Task 8, Task 9, Task 10.
- Env var: `FRONTEND_TAG` (entrada, do CI/rollback) vs `FRONTEND_IMAGE_TAG` (consumida pelo compose) — distinção deliberada e consistente entre Task 4, 6, 7, 9.
- `svc_health()` / `SVC_HEALTHY` / `SVC_TOTAL` — definidos e usados só na Task 6.
- Evento `repository_dispatch` `frontend-updated` + `client_payload.tag` — idêntico em Task 3 (emissor) e Task 7 (receptor).
- Imagem `ghcr.io/tututazeni-spec/tututazeni-frontend` — idêntica em Task 3, 4, 9.
- Rota `/health` — Task 1 (define), Task 2 (HEALTHCHECK), Task 5 (Caddy serve), Task 9 (verifica).

Sem inconsistências.
