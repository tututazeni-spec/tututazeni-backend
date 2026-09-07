# Deploy do frontend Next.js no VPS + endurecimento da borda Caddy

> Data: 2026-09-07
> Estado: aprovado (design) — pendente de plano de implementação
> Repositórios afectados: `tututazeni-backend` (este) e `tututazeni-frontend`
> Contexto: auditoria de arquitectura de referência
> (`Internet → WAF/CDN → LB → Next.js / NestJS → Redis/Queue/Storage → PostgreSQL → Backups/Read Replica`).
> Duas lacunas: (a) camada **Next.js** não deployada; (b) camada **Load Balancer**
> é um único container Caddy (SPOF).

---

## 1. Objectivo e âmbito

### 1.1 O que este trabalho resolve

1. **Camada Next.js — passa de "não deployada" a servida em produção.** O
   frontend (`tututazeni-frontend`, repo separado) passa a correr no **mesmo
   VPS** que o backend, como serviço `frontend` no compose de produção, atrás
   do mesmo Caddy. Rota `/` → `frontend`, `/api/*` → `app` (já existe).
   Escolha do cliente: **Opção A — mesmo VPS** (as alternativas "2º VPS" e
   "host externo" foram apresentadas e rejeitadas).

2. **Camada Load Balancer — sobe ao mesmo nível de redundância do resto da
   pilha.** Numa topologia de 1 VPS não é possível tornar o LB verdadeiramente
   redundante (o host é SPOF partilhado por *todas* as camadas). O Caddy é
   endurecido contra os dois modos de falha que o `docs/deploy/ha-and-spof.md`
   lhe atribui — **crash** e **OOM** — ficando ao nível dos tiers `app` e
   `redis` (tolerantes a falha de processo, presos ao SPOF do host). O caminho
   para "verde" real (HA) fica documentado como o próximo passo recomendado
   (topologia de 2 VPS), com o gatilho agora **cumprido** por haver frontend
   no mesmo host.

### 1.2 O que está explicitamente fora de âmbito

- Migração para topologia de 2 VPS / Docker Swarm / LB gerido (documentada como
  próximo passo, não implementada aqui).
- Cloudflare Load Balancing pago (Free plan mantém-se; só a documentação
  refere a opção).
- Deploy do frontend em Vercel / Cloudflare Pages.
- Alterações de CSP para nonces (já registado como iteração futura no
  `next.config.ts` do frontend).
- Qualquer alteração ao routing `/api` da app ou ao comportamento do backend.
- `output: 'export'` estático — o frontend tem SSR, `rewrites()` e `headers()`,
  portanto precisa do servidor Node (`next start` / `node server.js`).

### 1.3 Critérios de sucesso

- `curl -k https://<DOMAIN>/` devolve a aplicação Next (200 ou redirect de
  autenticação), servida a partir de uma das 2 réplicas `frontend`.
- `curl -k https://<DOMAIN>/api/health/ready` continua a devolver 200 do backend
  (rota `/api/*` intocada).
- `curl -sI https://<DOMAIN>/ | grep -i cf-ray` — o tráfego do frontend passa
  pela Cloudflare (WAF/CDN).
- Um merge para `main` no repo do frontend dispara **um único** rollout no VPS,
  health-gated, com rollback automático se qualquer réplica (`app` **ou**
  `frontend`) não ficar saudável.
- Matando uma réplica `frontend` (`docker kill`) o site continua a servir pela
  outra; o Caddy tira a réplica morta da rotação em segundos.
- Matando o container `caddy`, o Docker reinicia-o automaticamente (`restart:
  always`); um Caddy *pendurado* (não morto) é reiniciado pelo novo
  `healthcheck` do container.
- `docs/deploy/ha-and-spof.md` reflecte a nova topologia e marca o gatilho de
  2 VPS como cumprido.

---

## 2. Topologia resultante

```
cliente ──HTTPS──► Cloudflare (WAF + CDN + anti-DDoS + rate limit)
                        │  HTTPS Full(strict), só ranges Cloudflare
                        ▼
                   VPS :443 ──► Caddy (TLS origin + load balancer, endurecido)
                                  ├── handle_path /api/*  ──► app       ×2 réplicas  (:4000)
                                  └── handle          /*  ──► frontend  ×2 réplicas  (:3000)
                                                                 │ SSR: API_INTERNAL_URL=http://app:4000
                   job one-shot: migrate (prisma migrate deploy) antes das réplicas app
                   redis ×1 · prometheus/alertmanager/node-exporter (sem portas públicas)
```

SPOF residuais após este trabalho (inalterados face a hoje, agora com o
frontend a partilhá-los): **host do VPS**, **container Caddy** (mitigado, não
eliminado), **container Redis**. Postgres é gerido/externo (já OK).

---

## 3. Alterações — repo `tututazeni-frontend`

### 3.1 `next.config.ts`

- Adicionar `output: 'standalone'` ao `nextConfig`. Produz `.next/standalone`
  (servidor Node mínimo + `node_modules` podados) → imagem pequena, arranque
  por `node server.js`.
- Sem outras alterações. O `rewrites()` de `/api/:path*` para
  `process.env.API_INTERNAL_URL ?? 'http://localhost:4000'` já está correcto:
  em produção o Caddy interseta `/api/*` **antes** de chegar ao Next, portanto
  o rewrite fica inerte; serve apenas SSR/route-handlers que chamem a API a
  partir do servidor.

### 3.2 `app/health/route.ts` (novo)

```ts
// Liveness probe do container frontend. Fora de /api → o Caddy serve-a a
// partir do Next (não colide com /api/health/ready do backend).
export const dynamic = 'force-dynamic';
export function GET() {
  return Response.json({ status: 'ok' });
}
```

### 3.3 `Dockerfile` (novo)

Multi-stage, alinhado com o `Dockerfile` do backend (Node 20, non-root, HEALTHCHECK):

- **Stage `deps`**: `npm ci` com lockfile.
- **Stage `build`**: `COPY` do código, `npm run build` (`NEXT_TELEMETRY_DISABLED=1`).
  Confirmar na implementação se algum `NEXT_PUBLIC_*` é lido em build-time; se
  sim, entra como `ARG`/`ENV` neste stage e é documentado no
  `ops/.env.production.example` + workflow. Expectativa actual: **nenhum** — o
  frontend fala com a API via mesma origem `/api`.
- **Stage `runtime`**: `node:20-slim`, `ENV NODE_ENV=production PORT=3000`,
  utilizador não-root (uid 1001), `COPY --from=build` de:
  - `/app/.next/standalone` → `./`
  - `/app/.next/static` → `./.next/static`
  - `/app/public` → `./public`
  - `EXPOSE 3000`, `HEALTHCHECK` (`GET http://localhost:3000/health` → 200),
    `CMD ["node", "server.js"]`.

### 3.4 `.dockerignore` (novo)

`node_modules`, `.next`, `.git`, `*.md` de docs, `coverage`, `.env*` locais,
artefactos de teste.

### 3.5 `.github/workflows/deploy.yml` (novo)

Espelha o `deploy.yml` do backend:

- **Triggers**: `push: [main]`; `pull_request` nos paths
  `Dockerfile`, `.dockerignore`, `next.config.ts`, `.github/workflows/deploy.yml`;
  `workflow_dispatch`.
- **Job `build`**:
  - `docker/build-push-action` com `context: .`.
  - Tags: `ghcr.io/tututazeni-spec/tututazeni-frontend:sha-<sha>` e `:latest`.
  - `push: ${{ github.event_name != 'pull_request' }}` (PR = valida o build,
    não faz push). Cache `type=gha`.
- **Job `notify-backend`** (só em `push: main`, `needs: build`):
  - `peter-evans/repository-dispatch` (ou `gh api`) → dispara
    `repository_dispatch` no repo `tututazeni-spec/tututazeni-backend` com
    `event_type: frontend-updated` e
    `client_payload: { tag: "sha-<sha>" }`.
  - Requer um secret no repo do frontend: `BACKEND_DISPATCH_TOKEN` — PAT
    fine-grained com permissão `contents: write` (ou `metadata` + `contents`)
    **apenas** no repo do backend. Documentar a criação no runbook.
- `quality.yml` do frontend mantém-se como gate de merge (inalterado).

### 3.6 `docs/deploy.md` (novo, no repo do frontend)

Página curta: como a imagem é construída, o fluxo `repository_dispatch`, as
variáveis de ambiente de runtime (`PORT`, `API_INTERNAL_URL`), e o ponteiro
para o runbook completo no repo do backend.

---

## 4. Alterações — repo `tututazeni-backend` (este)

### 4.1 `ops/docker-compose.prod.yml`

**Novo serviço `frontend`** (a seguir a `app`):

```yaml
  frontend:
    image: ghcr.io/tututazeni-spec/tututazeni-frontend:${FRONTEND_IMAGE_TAG:-latest}
    # SEM container_name (replicado), SEM porta publicada (2 réplicas na :3000).
    env_file: .env.production          # API_INTERNAL_URL, PORT
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

**Endurecimento do serviço `caddy`**:

| Campo | Antes | Depois | Porquê |
|---|---|---|---|
| `restart` | `unless-stopped` | `always` | Reinicia também após paragem manual / restart do daemon — correcto para o tier de borda. |
| `healthcheck` | (nenhum) | probe à admin API local (`:2019/config/` via `wget`/`caddy`), `interval: 10s` | Docker reinicia um Caddy *pendurado*, não só um que saiu. |
| `deploy.resources.limits.memory` | `128M` | `256M` | Folga para HTTP/3 + 2 upstreams + mais vhosts; OOM é o modo de falha nº2 apontado no `ha-and-spof.md`. |
| `stop_grace_period` | (default 10s) | `15s` | Drenar pedidos em curso num redeploy. |
| `depends_on` | `[app]` | `[app, frontend]` | A borda só sobe depois de haver upstreams dos dois lados. |

Sem alteração aos serviços `migrate`, `app`, `redis`, `prometheus`,
`alertmanager`, `node-exporter`.

### 4.2 `ops/caddy/Caddyfile`

- Descomentar e activar o bloco `handle { … }` do frontend:

```caddy
  handle_path /api/* {
    reverse_proxy {
      dynamic a { name app port 4000 refresh 5s }
      lb_policy round_robin
      lb_try_duration 5s
      lb_try_interval 250ms
      fail_duration 30s
      unhealthy_status 5xx
      unhealthy_latency 10s
    }
  }

  handle {
    reverse_proxy {
      dynamic a { name frontend port 3000 refresh 5s }
      lb_policy round_robin
      lb_try_duration 5s
      lb_try_interval 250ms
      fail_duration 30s
      unhealthy_status 5xx
    }
  }
```

- `handle_path /api/*` continua **primeiro** (mais específico). O `handle`
  final (catch-all) deixa de devolver `404` e passa a proxy para o frontend.
- Headers de conteúdo continuam a ser emitidos pelo Next (`next.config.ts`).
  O `header Strict-Transport-Security` global do Caddy aplica-se aos dois.
- `trusted_proxies` / `client_ip_headers` inalterados.

### 4.3 `ops/deploy/deploy.sh`

- **Tag do frontend**: novo argumento opcional / variável `FRONTEND_TAG`.
  Resolução: se vier do `repository_dispatch` usa `client_payload.tag`; senão
  mantém o valor em `current_frontend_tag` (ou `latest` na primeira vez).
  Persistir `current_frontend_tag` / `previous_frontend_tag` a par de
  `current_tag` / `previous_tag`.
- `docker compose pull` passa a incluir `frontend`.
- `docker compose up -d` com `FRONTEND_IMAGE_TAG` exportado além de `IMAGE_TAG`.
- **Health gate**: o loop actual conta réplicas `healthy` do serviço `app`.
  Generalizar para iterar sobre `app` **e** `frontend` — só sai `0` quando
  **todas** as réplicas dos **dois** serviços estão `healthy`. Mensagens de
  falha passam a despejar `ps` + `logs` dos dois.

### 4.4 `ops/deploy/rollback.sh`

- Repor `previous_tag` **e** `previous_frontend_tag`; `up -d` recria os dois
  serviços na versão anterior. Manter o mesmo health gate.

### 4.5 `.github/workflows/deploy.yml` (backend)

- Adicionar trigger:

```yaml
on:
  repository_dispatch:
    types: [frontend-updated]
```

- `preflight`: `can_deploy` também `true` para `github.event_name ==
  'repository_dispatch'`.
- `build`: acrescentar `github.event_name != 'repository_dispatch'` à condição
  `if` — um dispatch do frontend **não** reconstrói a imagem do backend.
- `deploy`:
  - Passar a tag do frontend ao script:
    `FRONTEND_TAG: ${{ github.event.client_payload.tag || '' }}`
    (vazio fora do dispatch → o `deploy.sh` mantém `current_frontend_tag`).
  - Acrescentar à lista `source:` do `scp-action` os ficheiros novos/alterados
    que vivem em `ops/`: já lá está o `Caddyfile`; garantir `deploy.sh` e
    `rollback.sh` (já lá estão). Nenhum ficheiro do frontend é copiado — a
    imagem vem do GHCR.
- `verify`: o smoke pós-deploy ganha uma verificação `GET /` (frontend) além
  do `GET /api/health/ready` já existente (via `SMOKE_BASE_URL`).

### 4.6 `ops/.env.production.example`

Acrescentar:

```dotenv
# ─── Frontend (Next.js) — servido pelo mesmo Caddy em / ───────────────────
FRONTEND_IMAGE_TAG=latest
# URL interna da API para SSR/route-handlers do Next (rede Docker do compose)
API_INTERNAL_URL=http://app:4000
```

### 4.7 Documentação

- **`docs/deploy/ha-and-spof.md`**:
  - Tabela "O que mudou": nova linha — frontend Next deployado no VPS com 2
    réplicas atrás do Caddy.
  - "O que passou a ser redundante": acrescentar o processo do frontend (uma
    réplica que crashe/OOM sai da rotação; a outra serve).
  - Tabela SPOF: o container Caddy passa a "mitigado" (`restart: always` +
    healthcheck de hang + limite de memória a dobrar); acrescentar nota de que
    o frontend partilha os SPOF do host/Caddy/Redis.
  - "Dimensionamento do VPS": recalcular o tecto de memória — somar
    `frontend 2×384M` e `caddy 128M→256M`. Novo total ≈ 3,4 GB de limites
    (app 2×768 + frontend 2×384 + prometheus 400 + caddy 256 + redis 192 +
    alertmanager 128 + node-exporter 96); **reforçar 8 GB**.
  - "Gatilho para subir a Médio — 2 VPS": marcar o item "frontend deployado no
    mesmo VPS" como **cumprido** → mover de "gatilho futuro" para
    "**recomendação activa**", com um sketch concreto: 2º VPS idêntico
    (`docker compose` em cada), Redis gerido, e LB à frente — Cloudflare Load
    Balancing (pago) sobre os dois IPs de origem com health checks, **ou**
    Caddy/HAProxy num 3º nó pequeno. O `Caddyfile` já usa `dynamic a` — passa
    a resolver um nome DNS que aponta aos dois nós, sem mudança estrutural.
- **`docs/deploy/cloudflare.md`**:
  - Secção 5 (Cache/CDN): `/` e estáticos deixam de ser hipótese futura — passam
    a ter origem real. Activar a Cache Rule `/` + estáticos → *Cache Everything*
    com `Edge TTL` conservador; manter `/api/*` → *Bypass*.
  - *Always Online* passa a servir páginas GET reais em cache durante um outage
    (antes só havia a API).
- **`docs/deploy/runbook.md`**:
  - Topologia no topo: acrescentar a camada frontend.
  - Nova subsecção: fluxo `repository_dispatch` (merge no repo do frontend →
    build/push GHCR → dispatch → este workflow → rollout health-gated).
  - Secção 2 (env no VPS): `FRONTEND_IMAGE_TAG`, `API_INTERNAL_URL` no
    `.env.production`.
  - Secção 3 (secrets): nota sobre o `BACKEND_DISPATCH_TOKEN` no repo do
    frontend (PAT fine-grained, `contents:write` só no repo do backend).
  - Secção 6 (operação): `docker compose logs -f frontend`,
    `cat current_frontend_tag previous_frontend_tag`, `--scale frontend=N`.
  - Secção 8 (ensaio local): estender — `docker build` do frontend a partir de
    um checkout local do repo `tututazeni-frontend`, `docker tag` para
    `ghcr.io/tututazeni-spec/tututazeni-frontend:local-v1`, subir o compose
    completo, `curl -k https://localhost/` (frontend) e
    `curl -k https://localhost/api/health/ready` (backend). Adicionar a
    limpeza da imagem/tags do frontend ao final.

---

## 5. Fluxo de deploy (resultante)

### 5.1 Alteração só no frontend

1. PR no repo `tututazeni-frontend` → `quality.yml` verde → merge para `main`.
2. `deploy.yml` (frontend): `build` → push `sha-<sha>` + `latest` para GHCR.
3. `notify-backend`: `repository_dispatch` → repo do backend, `frontend-updated`,
   `client_payload.tag = sha-<sha>`.
4. `deploy.yml` (backend) acorda: `build` do backend é **saltado**; `deploy`
   corre `deploy.sh` com `FRONTEND_TAG=sha-<sha>` e `IMAGE_TAG` = tag actual do
   backend (de `current_tag`).
5. `deploy.sh`: `pull` das duas imagens → `up -d` → health gate espera **todas**
   as réplicas `app` + `frontend` `healthy` → `verify` (smoke `GET /` +
   `GET /api/health/ready`).
6. Falha em qualquer passo → `rollback.sh` repõe as duas tags anteriores.

### 5.2 Alteração só no backend

Igual a hoje. `deploy.sh` corre com `FRONTEND_TAG` vazio → mantém
`current_frontend_tag`; o serviço `frontend` é recriado na **mesma** imagem
(sem alteração efectiva além de um restart no `up -d`).

### 5.3 Primeiro deploy

`current_frontend_tag` não existe → `deploy.sh` assume `latest`. O frontend tem
de ter corrido o seu `deploy.yml` ao menos uma vez (para existir
`:latest` no GHCR) antes do primeiro `up -d` que inclua o serviço `frontend`.
Documentar a ordem no runbook.

---

## 6. Riscos e mitigações

| Risco | Mitigação |
|---|---|
| Redeploy recria as 2 réplicas `frontend` quase em simultâneo → janela de ~5–15 s | Já aceite para o `app`; o Caddy faz retry (`lb_try_duration`) e a Cloudflare serve cache (*Always Online*). Deploy rolling real → topologia de 2 nós (documentada). |
| `NEXT_PUBLIC_*` afinal necessário em build-time | Confirmar na implementação (`grep NEXT_PUBLIC_ frontend/`); se existir, entra como `ARG` no Dockerfile + documentado. Não bloqueia o design. |
| Memória do host insuficiente com +2 réplicas | `ha-and-spof.md` recalculado para ~3,4 GB de limites → recomendação reforçada de 8 GB antes de aumentar `replicas`. |
| PAT `BACKEND_DISPATCH_TOKEN` expira / é revogado | Fine-grained com expiração longa; se falhar, o frontend fica construído no GHCR mas não deployado — recuperável com `workflow_dispatch` manual no backend. |
| `repository_dispatch` só funciona a partir de `main` do backend | É o comportamento desejado (deploy só de `main`). |
| Colisão de rota `/health` (frontend) vs `/api/health/ready` (backend) | Não há: o Caddy encaminha tudo o que **não** é `/api/*` para o frontend; `/api/health/ready` vai para o backend. |
| Caddy `restart: always` mascara um crash-loop | O novo `healthcheck` do container torna o estado visível em `docker compose ps` e nas métricas; alertas de `ha-and-spof.md` (`AppAllReplicasDown` etc.) cobrem o padrão análogo. |

---

## 7. Plano de testes

### 7.1 Repo `tututazeni-frontend`

- `docker build -t frontend:local .` conclui sem erro.
- `docker run --rm -p 3000:3000 -e API_INTERNAL_URL=http://host.docker.internal:4000 frontend:local`:
  - `curl -fsS localhost:3000/health` → `{"status":"ok"}`.
  - `curl -sI localhost:3000/` → 200 ou redirect de autenticação (não 5xx).
- `deploy.yml` em PR: job `build` verde sem push.

### 7.2 Repo `tututazeni-backend`

- **Ensaio local do ciclo completo** (runbook §8 estendido):
  - Build local das duas imagens, `up -d` do `ops/docker-compose.prod.yml`
    com cert self-signed no Caddy.
  - `curl -k https://localhost/` → HTML do Next.
  - `curl -k https://localhost/api/health/ready` → 200.
  - `docker kill` de uma réplica `frontend` → o site continua; `docker compose
    ps` mostra 1/2; o Caddy recupera a réplica reiniciada.
  - `docker kill` do `caddy` → reinicia sozinho; `curl` volta a responder.
  - Simular réplica `frontend` não-saudável (imagem que falha o healthcheck) →
    `deploy.sh` falha o health gate em 120 s → `rollback.sh` repõe a tag boa.
- `deploy.sh` / `rollback.sh`: assert de que `current_frontend_tag` e
  `previous_frontend_tag` são escritos/trocados correctamente.
- Lint/format: `npx prettier --write` nos ficheiros `ops/**` e `docs/**`
  tocados (nota: o CI de `quality` só verifica `src/**`, mas manter consistente).

### 7.3 CI obrigatório

- Check `quality` (workflow `Code Quality`) verde antes de qualquer merge para
  `main` — branch protection, sem excepção (regra 15 do CLAUDE.md).
- O `deploy.yml` do backend em PR corre só o `build` (validação do Dockerfile /
  compose), sem push nem deploy.

---

## 8. Ordem de implementação sugerida

1. **Frontend repo** — `next.config.ts` (`output: standalone`), `app/health/route.ts`,
   `Dockerfile`, `.dockerignore`. Validar `docker build` + run local.
2. **Frontend repo** — `.github/workflows/deploy.yml` + `docs/deploy.md`.
   Merge (constrói e publica `:latest` no GHCR; o `notify-backend` vai falhar
   silenciosamente enquanto o backend não aceitar o evento — aceitável, ou
   adicionar o trigger ao backend primeiro).
3. **Backend repo** — `docker-compose.prod.yml` (serviço `frontend` + Caddy
   endurecido), `Caddyfile` (bloco frontend), `deploy.sh` / `rollback.sh`
   (tag + health gate do frontend), `.env.production.example`.
4. **Backend repo** — `.github/workflows/deploy.yml` (trigger
   `repository_dispatch`, condições dos jobs, `verify` com `GET /`).
5. **Backend repo** — documentação (`ha-and-spof.md`, `cloudflare.md`,
   `runbook.md`).
6. Ensaio local completo (runbook §8) no backend.
7. PR do backend → CI `quality` verde → merge.

> O passo 2 e o passo 3–4 têm uma dependência circular suave (o dispatch do
> frontend só é útil depois do backend aceitar o evento). Resolver fazendo o
> backend primeiro a aceitar o trigger (passo 4 antes do passo 2), ou aceitar
> que o primeiro `notify-backend` do frontend não faz nada.

---

## 9. Ficheiros tocados (resumo)

### `tututazeni-frontend`
- `next.config.ts` (editar)
- `app/health/route.ts` (novo)
- `Dockerfile` (novo)
- `.dockerignore` (novo)
- `.github/workflows/deploy.yml` (novo)
- `docs/deploy.md` (novo)

### `tututazeni-backend`
- `ops/docker-compose.prod.yml` (editar)
- `ops/caddy/Caddyfile` (editar)
- `ops/deploy/deploy.sh` (editar)
- `ops/deploy/rollback.sh` (editar)
- `ops/.env.production.example` (editar)
- `.github/workflows/deploy.yml` (editar)
- `docs/deploy/ha-and-spof.md` (editar)
- `docs/deploy/cloudflare.md` (editar)
- `docs/deploy/runbook.md` (editar)
- `docs/superpowers/specs/2026-09-07-frontend-deploy-lb-hardening-design.md` (este)
