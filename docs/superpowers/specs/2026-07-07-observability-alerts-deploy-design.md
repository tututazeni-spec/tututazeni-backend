# Spec — Alertas configuráveis (regra 9) + Deploy com monitorização e rollback automático (regra 10)

> Data: 2026-07-07
> Repo: backend innova (NestJS 11 + Prisma 7)
> Branches: `feat/observability-deploy-rollback` (PR 1, regra 10) → `feat/observability-alerts` (PR 2, regra 9)
> Origem: requisitos DevOps de monitorização — últimos 2 dos 10 sub-projetos de observabilidade (regras 1–8 já em `main`).

## Contexto

Já em `main`: logging JSON com request-id (regras 1–3), health detalhado `/health` +
`/health/ready` via terminus (regra 4), query logging (regra 5), métricas Prometheus
em `GET /metrics` com guard fail-closed por `METRICS_TOKEN` (regras 6–7), e a suite
de regressão de fluxos críticos com modo pós-deploy via `SMOKE_BASE_URL` +
`SMOKE_SEED=false` + `SMOKE_ALLOW_WRITES=false` (regra 8).

Não existe pipeline de deploy (só o CI `quality.yml`), nem Dockerfile, nem stack
Prometheus/Alertmanager. A regra 10 cria o mecanismo de deploy de raiz, já com
monitorização e rollback; a regra 9 acrescenta o stack de alertas por cima.

## Decisões (brainstorming)

- **Ambiente de produção:** VPS com Docker (docker compose). O VPS **ainda não
  existe** — tudo é preparado pronto-a-ligar: testável localmente com Docker, e o
  workflow de deploy fica em no-op até os secrets serem configurados (mesmo padrão
  do `SONAR_TOKEN` no `quality.yml`).
- **Postgres fica fora do compose** — é gerido/externo (decisão em
  `docs/db-architecture/`).
- **Alertas (regra 9):** Prometheus + Alertmanager como código no repo. Rejeitado
  alertar de dentro da app (não apanha a app morta) e Grafana alerting (mais pesado;
  dashboards podem juntar-se depois).
- **Canais de notificação:** email (SMTP) + Telegram (receivers nativos do
  Alertmanager).
- **Deploy (regra 10):** GitHub Actions → GHCR → SSH → script no VPS, com smoke gate
  e rollback automático por tag de imagem. Rejeitado blue-green (YAGNI para app
  interna) e pull-based/Watchtower (rollback e smoke gate fracos).
- **Dois PRs sequenciais:** PR 1 = regra 10 (fundação: Dockerfile, compose de
  produção, workflow de deploy); PR 2 = regra 9 (junta Prometheus + Alertmanager ao
  mesmo compose).
- **Dead-man's switch externo incluído no PR 2** (pedido do utilizador): alerta
  `Watchdog` sempre-a-disparar → ping periódico a healthchecks.io → se os pings
  pararem (VPS/stack de monitorização morto), o healthchecks.io notifica de fora.

## Objetivo

1. **Regra 10:** um push a `main` (ou dispatch manual) constrói a imagem, faz deploy
   no VPS, verifica saúde (`/health/ready`) e corre a suite de regressão contra
   produção; se qualquer verificação falhar, o workflow repõe automaticamente a
   imagem anterior e notifica. Sem intervenção humana em nenhum passo.
2. **Regra 9:** anomalias (app em baixo, erros 5xx, latência, queries lentas, event
   loop, memória, cache) disparam alertas definidos em ficheiro versionado —
   thresholds configuráveis sem redeploy da app — entregues por email + Telegram,
   com dead-man's switch externo para o cenário "morreu tudo".

---

## Design — PR 1 (regra 10)

### Estrutura de ficheiros

```
Dockerfile                          # multi-stage, node:20-slim
.dockerignore
ops/
  docker-compose.prod.yml           # app + redis (PR 2 acrescenta monitorização)
  .env.production.example           # template das env vars de produção
  deploy/
    deploy.sh                       # corre no VPS: pull da tag nova + health gate
    rollback.sh                     # corre no VPS: volta à tag anterior
.github/workflows/deploy.yml        # build → GHCR → deploy SSH → smoke → rollback
docs/deploy/runbook.md              # provisionamento do VPS, activação, operação
```

### Dockerfile

- Base **`node:20-slim`** (Debian) — módulos nativos (`bcrypt`, `better-sqlite3`)
  usam prebuilds glibc; evita recompilações/incompatibilidades musl do Alpine.
- Stage *build*: `npm ci` → `prisma generate` → `npm run build`.
- Stage *runtime*: `dist/`, `prisma/` (schema + migrations), `node_modules` de
  produção (`npm ci --omit=dev` + `prisma generate`), user não-root.
- Entrypoint: `npx prisma migrate deploy && node dist/main.js` — migrations no
  arranque do container.
- **Regra de compatibilidade de migrations (runbook):** migrations têm de ser
  compatíveis com a versão anterior do código (expand-contract: adicionar primeiro,
  remover só num deploy seguinte) — senão o rollback de código pode correr contra
  schema já migrado.

### docker-compose.prod.yml

- `app`: `image: ghcr.io/<repo>:${IMAGE_TAG}`, `env_file: .env.production`, porta
  4000, `restart: unless-stopped`, healthcheck HTTP ao `/health/ready`.
- `redis`: `redis:7-alpine`, volume persistente, sem porta pública.

### deploy.sh / rollback.sh (no VPS, `/opt/innova`)

- `deploy.sh <tag>`: guarda a tag a correr em `previous_tag` → escreve
  `IMAGE_TAG=<tag>` no `.env` → `docker compose pull && up -d app` → espera até 90s
  pelo `/health/ready` → exit code ≠ 0 se não ficar saudável (o workflow decide o
  rollback).
- `rollback.sh`: lê `previous_tag`, repõe, mesmo health gate. Também utilizável à
  mão.

### deploy.yml (GitHub Actions)

1. **Triggers:** `workflow_dispatch` (com input de tag) + `push` a `main`. Jobs
   gated por env-check dos secrets de deploy (padrão `SONAR_TOKEN`): sem secrets →
   no-op. Em PRs que toquem `Dockerfile`/`ops/**` corre só o build da imagem (sem
   push) como validação.
2. **build:** constrói a imagem e publica no GHCR com tags `sha-<commit>` e
   `latest`.
3. **deploy:** SSH para o VPS → `deploy.sh sha-<commit>`.
4. **verify (monitorização do deploy):** o runner corre
   `SMOKE_BASE_URL=<prod> SMOKE_SEED=false SMOKE_ALLOW_WRITES=false npm run
   test:regression` — a suite da regra 8 no modo pós-deploy para que foi desenhada.
5. **rollback (`if: failure()`):** SSH → `rollback.sh` → re-verifica
   `/health/ready`. Automático.
6. **notify (sempre):** resultado (deploy OK / revertido / falhou) por Telegram
   (curl à API do bot; secrets opcionais — mesmo bot que a regra 9 usará).

### Secrets do PR 1 (documentados no runbook)

`DEPLOY_HOST`, `DEPLOY_USER`, `DEPLOY_SSH_KEY`, `SMOKE_BASE_URL`,
`SMOKE_EMPLOYEE_EMAIL`, `SMOKE_EMPLOYEE_PASSWORD`, `SMOKE_RH_EMAIL`,
`SMOKE_RH_PASSWORD`, `SMOKE_COURSE_ID`; opcionais: `TELEGRAM_BOT_TOKEN`,
`TELEGRAM_CHAT_ID`.

### Verificação sem VPS

- CI: build da imagem em PRs com path filter `Dockerfile`/`ops/**` (sem push).
- Local (documentado no runbook): construir imagem local → `docker compose -f
  ops/docker-compose.prod.yml up` → `npm run test:regression` contra ela → ensaiar
  `deploy.sh`/`rollback.sh` com duas tags locais.

---

## Design — PR 2 (regra 9)

### Estrutura de ficheiros (acrescenta à do PR 1)

```
ops/
  docker-compose.prod.yml           # + serviços prometheus e alertmanager
  monitoring/
    prometheus.yml                  # scrape do /metrics da app + watchdog
    alert-rules.yml                 # regras de alerta com thresholds (as-code)
    alertmanager.yml.tpl            # template — envsubst preenche segredos
docs/deploy/alerting.md             # mudar thresholds, testar alertas, silenciar
```

### Prometheus

- `prom/prometheus`, volume TSDB, retenção ~15 dias, scrape de `app:4000/metrics` a
  cada 15s pela rede interna do compose.
- Autenticação: `bearer_token_file` — ficheiro com o `METRICS_TOKEN` gerado pelo
  `deploy.sh` a partir do `.env` (o guard fail-closed continua a mandar).
- **Sem portas públicas**: UI do Prometheus/Alertmanager só via túnel SSH
  (documentado no `alerting.md`).

### Regras de alerta (`alert-rules.yml`)

Config-as-code: mudar threshold = editar YAML + `docker compose restart prometheus`,
sem redeploy da app. Todas baseadas em métricas já exportadas:

| Alerta | Condição | Severidade |
|---|---|---|
| `AppDown` | `up == 0` durante 1m | critical |
| `HighErrorRate` | rácio 5xx > 5% durante 5m | critical |
| `HighLatencyP95` | p95 HTTP > 1s durante 10m | warning |
| `SlowDbQueries` | p95 queries Prisma > 500ms durante 10m | warning |
| `EventLoopLag` | lag do event loop > 0.5s durante 5m | warning |
| `HighMemory` | heap usado > 90% do total durante 10m | warning |
| `LowCacheHitRate` | hit rate < 50% durante 30m (com tráfego mínimo) | info |
| `Watchdog` | `vector(1)` — sempre a disparar | none (dead-man) |

### Alertmanager

- Routing por severidade: **critical → email + Telegram; warning → Telegram; info →
  só UI**. Agrupamento por alertname; `repeat_interval: 4h`.
- Receivers nativos: `email_configs` (SMTP) e `telegram_configs` (bot token + chat
  id — o mesmo bot das notificações de deploy).
- Segredos: Prometheus/Alertmanager não expandem env vars → `alertmanager.yml.tpl`
  + entrypoint com `envsubst` no arranque (`SMTP_HOST/PORT/USER/PASSWORD`,
  `ALERT_EMAIL_TO`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`,
  `HEALTHCHECKS_PING_URL`), tudo do `.env.production`. Nenhum segredo commitado.

### Dead-man's switch externo (mitigação "morreu tudo")

- O alerta `Watchdog` está **sempre** a disparar; o Alertmanager encaminha-o para
  um receiver `webhook_configs` que faz POST ao `HEALTHCHECKS_PING_URL`
  (healthchecks.io, plano grátis) com `repeat_interval` curto (~2m) — um heartbeat.
- No healthchecks.io configura-se o check com período ~5m e grace ~5m, e canais de
  notificação (email e/ou Telegram) **do lado deles**. Se o VPS, o Prometheus ou o
  Alertmanager morrerem, os pings param e o healthchecks.io alerta de fora.
- Setup da conta/check documentado no `alerting.md`; a URL de ping entra no
  `.env.production`.

### Validação em CI

Passo barato no `quality.yml` com path filter `ops/monitoring/**`: `promtool check
config` + `promtool check rules` + `amtool check-config` via `docker run` — YAML
inválido ou PromQL partido chumbam antes do merge. (O `.tpl` é validado após um
`envsubst` com valores dummy.)

### Teste de ponta a ponta (local, documentado no alerting.md)

Subir o stack completo local → parar o container da app → em ~1m o `AppDown`
dispara e chega email + Telegram. Suspender o Alertmanager → em ~10m o
healthchecks.io alerta (dead-man). Procedimento repetível; é o critério de
aceitação da regra 9.

---

## Erros e riscos

- **Rollback com migration incompatível:** mitigado pela regra expand-contract no
  runbook; risco residual aceite (migrations destrutivas exigem plano manual).
- **Smoke flaky a causar rollback desnecessário:** a suite corre com timeouts
  generosos (30s/teste, desenhados para app remota); um rollback a mais é barato,
  um deploy partido em produção não.
- **VPS inteiro morto sem alerta:** coberto pelo dead-man's switch externo.
- **healthchecks.io indisponível:** falso alarme possível; aceite (serviço com SLA
  alto, plano grátis chega).
- **RAM do stack de monitorização:** Prometheus + Alertmanager ~200–400 MB — entra
  no sizing do VPS (runbook).

## Critérios de sucesso

**PR 1 (regra 10):**
1. Imagem constrói em CI; compose de produção sobe localmente e passa
   `test:regression` contra o container.
2. `deploy.yml` em `main` termina em no-op sem secrets; com secrets faz
   build→deploy→verify→(rollback se falhar)→notify sem intervenção.
3. Ensaio local documentado do ciclo deploy→verify→rollback com duas tags.
4. Runbook cobre provisionamento do VPS, secrets, operação manual e regra de
   migrations.

**PR 2 (regra 9):**
1. `promtool`/`amtool` verdes em CI.
2. Teste E2E local: app parada → alerta `AppDown` entregue por email + Telegram.
3. Dead-man: heartbeat a chegar ao healthchecks.io; pings parados → notificação
   externa.
4. Thresholds alteráveis por edição de `alert-rules.yml` + restart do Prometheus,
   sem tocar na app.

## Fora de âmbito

- Dashboards Grafana (podem juntar-se ao compose mais tarde).
- Blue-green / zero-downtime (o restart do compose demora segundos; app interna).
- Provisionamento automatizado do VPS (Terraform/Ansible) — o runbook manual chega
  para 1 VPS.
- Alertas de infra do VPS (disco/CPU do host via node_exporter) — melhoria futura
  natural do mesmo stack.
