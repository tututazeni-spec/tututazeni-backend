# Alertas configuráveis com Prometheus + Alertmanager (regra 9) — Plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stack de alertas as-code (Prometheus + Alertmanager) em cima do compose de produção da regra 10: anomalias da app disparam alertas com thresholds versionados, entregues por email + Telegram, com dead-man's switch externo via healthchecks.io.

**Architecture:** Prometheus faz scrape do `GET /metrics` da app (bearer token do guard fail-closed) e avalia `alert-rules.yml`; o Alertmanager encaminha por severidade (critical → email+Telegram, warning → Telegram, info → só UI) e o alerta `Watchdog` sempre-a-disparar faz heartbeat a healthchecks.io — se o stack morrer, o alerta vem de fora. Segredos entram por template (`alertmanager.yml.tpl`) renderizado pelo `deploy.sh` a partir do `.env.production`; nenhum segredo commitado. Validação `promtool`/`amtool` no CI `quality`.

**Tech Stack:** prom/prometheus v2.53 (LTS), prom/alertmanager v0.27, docker compose, GitHub Actions, healthchecks.io (plano grátis).

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-07-observability-alerts-deploy-design.md` (secção PR 2).
- Branch de trabalho: `feat/observability-alerts`, criado a partir de `feat/observability-deploy-rollback` (a PR #16 da regra 10 tem auto-merge armado; se ao abrir a PR 2 a #16 já tiver merged, fazer rebase para `origin/main` antes do push).
- Métricas reais exportadas pela app (confirmadas em `src/metrics/metrics.module.ts`):
  `http_request_duration_seconds` (histograma; labels `method`, `route`, `status_code`),
  `prisma_query_duration_seconds` (histograma; label `target`),
  `cache_requests_total` (counter; label `result` = hit/miss),
  + default metrics do prom-client (`up` vem do próprio scrape; `nodejs_eventloop_lag_p90_seconds`, `nodejs_heap_size_used_bytes`, `nodejs_heap_size_total_bytes`).
- Job Prometheus: `innova-app`; scrape `app:4000/metrics` a cada 15s; retenção TSDB 15d.
- UIs sem porta pública: Prometheus e Alertmanager publicam só em `127.0.0.1` (túnel SSH).
- Ficheiros gerados no deploy (NUNCA commitados): `ops/monitoring/alertmanager.yml`, `ops/monitoring/metrics_token` → entram no `.gitignore`.
- Vars novas no `.env.production`: `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `ALERT_EMAIL_TO`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, `HEALTHCHECKS_PING_URL`.
- Copy/comentários em PT-PT; commits convencionais com `--no-verify` (autorizado).
- **Política de ship (2026-07-08):** SEM lint/format/build locais — validação é do CI; depois de `gh pr merge --auto --squash --delete-branch`, NÃO acompanhar o CI (`gh pr checks --watch` proibido) — o merge acontece sozinho.
- Máquina local: Windows + Docker Desktop. Scripts shell correm no tool Bash (Git Bash); comandos `docker run -v` correm em PowerShell (evita o path-mangling do MSYS). Ficheiros `.sh`/`.yml` de container com line endings LF (o `.gitattributes` já força `*.sh text eol=lf`).

---

### Task 1: Branch + regras de alerta + config do Prometheus

**Files:**
- Create: `ops/monitoring/alert-rules.yml`
- Create: `ops/monitoring/prometheus.yml`

**Interfaces:**
- Consumes: métricas da app listadas nas Global Constraints.
- Produces: `prometheus.yml` que monta `alert-rules.yml` em `/etc/prometheus/alert-rules.yml` e lê o token de `/etc/prometheus/secrets/metrics_token`; envia alertas para `alertmanager:9093`. A Task 3 (compose) monta estes caminhos; a Task 4 (CI) valida-os com `promtool`.

- [ ] **Step 1: Criar o branch**

```bash
git checkout -b feat/observability-alerts
```

- [ ] **Step 2: Criar `ops/monitoring/alert-rules.yml`**

```yaml
# Regras de alerta (regra 9) — config-as-code.
# Mudar um threshold = editar este ficheiro + `docker compose restart prometheus`
# (sem redeploy da app). Ver docs/deploy/alerting.md.
groups:
  - name: innova-app
    rules:
      - alert: AppDown
        expr: up{job="innova-app"} == 0
        for: 1m
        labels:
          severity: critical
        annotations:
          summary: 'App INNOVA em baixo'
          description: 'O scrape de app:4000/metrics falha há mais de 1 minuto.'

      - alert: HighErrorRate
        expr: >
          sum(rate(http_request_duration_seconds_count{status_code=~"5.."}[5m]))
            / sum(rate(http_request_duration_seconds_count[5m])) > 0.05
        for: 5m
        labels:
          severity: critical
        annotations:
          summary: 'Taxa de erros 5xx acima de 5%'
          description: 'Rácio de respostas 5xx superior a 5% nos últimos 5 minutos.'

      - alert: HighLatencyP95
        expr: >
          histogram_quantile(0.95,
            sum by (le) (rate(http_request_duration_seconds_bucket[5m]))) > 1
        for: 10m
        labels:
          severity: warning
        annotations:
          summary: 'Latência HTTP p95 acima de 1s'
          description: 'p95 dos pedidos HTTP acima de 1s há 10 minutos.'

      - alert: SlowDbQueries
        expr: >
          histogram_quantile(0.95,
            sum by (le) (rate(prisma_query_duration_seconds_bucket[5m]))) > 0.5
        for: 10m
        labels:
          severity: warning
        annotations:
          summary: 'Queries Prisma lentas (p95 > 500ms)'
          description: 'p95 das queries Prisma acima de 500ms há 10 minutos.'

      - alert: EventLoopLag
        expr: nodejs_eventloop_lag_p90_seconds > 0.5
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: 'Event loop com lag elevado'
          description: 'Lag p90 do event loop acima de 0.5s há 5 minutos.'

      - alert: HighMemory
        expr: nodejs_heap_size_used_bytes / nodejs_heap_size_total_bytes > 0.9
        for: 10m
        labels:
          severity: warning
        annotations:
          summary: 'Heap acima de 90%'
          description: 'Heap V8 usado acima de 90% do total há 10 minutos.'

      - alert: LowCacheHitRate
        expr: >
          (
            sum(rate(cache_requests_total{result="hit"}[30m]))
              / sum(rate(cache_requests_total[30m])) < 0.5
          )
          and sum(rate(cache_requests_total[30m])) > 0.05
        for: 30m
        labels:
          severity: info
        annotations:
          summary: 'Hit rate do cache abaixo de 50%'
          description: 'Com tráfego mínimo, o hit rate do cache está abaixo de 50% há 30 minutos.'

      # Dead-man's switch: dispara SEMPRE. O Alertmanager encaminha-o como
      # heartbeat para o healthchecks.io — se os pings pararem, o alerta vem de fora.
      - alert: Watchdog
        expr: vector(1)
        labels:
          severity: none
        annotations:
          summary: 'Watchdog (dead-man) — deve estar sempre a disparar'
          description: 'Se o healthchecks.io deixar de receber isto, o stack de monitorização morreu.'
```

- [ ] **Step 3: Criar `ops/monitoring/prometheus.yml`**

```yaml
# Prometheus (regra 9) — scrape da app + avaliação das regras de alerta.
# O token do /metrics é gerado pelo deploy.sh a partir do .env.production
# (ficheiro monitoring/metrics_token, gitignored) — o guard fail-closed manda.
global:
  scrape_interval: 15s
  evaluation_interval: 15s

rule_files:
  - /etc/prometheus/alert-rules.yml

alerting:
  alertmanagers:
    - static_configs:
        - targets: ['alertmanager:9093']

scrape_configs:
  - job_name: 'innova-app'
    metrics_path: /metrics
    authorization:
      type: Bearer
      credentials_file: /etc/prometheus/secrets/metrics_token
    static_configs:
      - targets: ['app:4000']
```

- [ ] **Step 4: Validar com promtool (o "teste" desta task)**

Run (PowerShell):

```powershell
docker run --rm -v "${PWD}\ops\monitoring\alert-rules.yml:/cfg/alert-rules.yml:ro" --entrypoint promtool prom/prometheus:v2.53.0 check rules /cfg/alert-rules.yml
"dummy" | Out-File -Encoding ascii -NoNewline "$env:TEMP\metrics_token"
docker run --rm -v "${PWD}\ops\monitoring\prometheus.yml:/etc/prometheus/prometheus.yml:ro" -v "${PWD}\ops\monitoring\alert-rules.yml:/etc/prometheus/alert-rules.yml:ro" -v "$env:TEMP\metrics_token:/etc/prometheus/secrets/metrics_token:ro" --entrypoint promtool prom/prometheus:v2.53.0 check config /etc/prometheus/prometheus.yml
```

Expected: `SUCCESS: 9 rules found` e `SUCCESS: /etc/prometheus/prometheus.yml is valid prometheus config file syntax`.

- [ ] **Step 5: Commit**

```bash
git add ops/monitoring/alert-rules.yml ops/monitoring/prometheus.yml
git commit --no-verify -m "feat(alerts): regras de alerta e config do Prometheus (regra 9)"
```

---

### Task 2: Template do Alertmanager (routing por severidade + dead-man)

**Files:**
- Create: `ops/monitoring/alertmanager.yml.tpl`

**Interfaces:**
- Consumes: placeholders `${SMTP_HOST}`, `${SMTP_PORT}`, `${SMTP_USER}`, `${SMTP_PASSWORD}`, `${ALERT_EMAIL_TO}`, `${TELEGRAM_BOT_TOKEN}`, `${TELEGRAM_CHAT_ID}`, `${HEALTHCHECKS_PING_URL}` — preenchidos pelo `deploy.sh` (Task 3) e pelo CI com valores dummy (Task 4).
- Produces: `ops/monitoring/alertmanager.yml` renderizado (gitignored), montado pelo compose em `/etc/alertmanager/alertmanager.yml`.

- [ ] **Step 1: Criar `ops/monitoring/alertmanager.yml.tpl`**

```yaml
# Template do Alertmanager (regra 9). O deploy.sh substitui os ${VAR} pelos
# valores do .env.production e escreve monitoring/alertmanager.yml (gitignored).
# Routing: critical -> email + Telegram; warning -> Telegram; info -> só UI;
# Watchdog -> heartbeat ao healthchecks.io (dead-man externo).
global:
  smtp_smarthost: '${SMTP_HOST}:${SMTP_PORT}'
  smtp_from: '${SMTP_USER}'
  smtp_auth_username: '${SMTP_USER}'
  smtp_auth_password: '${SMTP_PASSWORD}'
  smtp_require_tls: true

route:
  receiver: 'apenas-ui'
  group_by: ['alertname']
  group_wait: 30s
  group_interval: 5m
  repeat_interval: 4h
  routes:
    # dead-man primeiro: nunca pode cair nos receivers de notificação
    - matchers: ['alertname="Watchdog"']
      receiver: 'deadman'
      group_wait: 0s
      group_interval: 1m
      repeat_interval: 2m
    - matchers: ['severity="critical"']
      receiver: 'critico'
    - matchers: ['severity="warning"']
      receiver: 'aviso'

receivers:
  - name: 'critico'
    email_configs:
      - to: '${ALERT_EMAIL_TO}'
    telegram_configs:
      - bot_token: '${TELEGRAM_BOT_TOKEN}'
        chat_id: ${TELEGRAM_CHAT_ID}
        parse_mode: ''

  - name: 'aviso'
    telegram_configs:
      - bot_token: '${TELEGRAM_BOT_TOKEN}'
        chat_id: ${TELEGRAM_CHAT_ID}
        parse_mode: ''

  # info fica só na UI (sem canais)
  - name: 'apenas-ui'

  # heartbeat: POST ao healthchecks.io a cada ~2m enquanto o Watchdog dispara
  - name: 'deadman'
    webhook_configs:
      - url: '${HEALTHCHECKS_PING_URL}'
        send_resolved: false
```

- [ ] **Step 2: Render de teste com valores dummy + validação amtool**

Run (Bash — o render usa a mesma substituição sed que o `deploy.sh` fará):

```bash
cp ops/monitoring/alertmanager.yml.tpl /tmp/alertmanager-test.yml
for kv in \
  'SMTP_HOST=smtp.example.com' 'SMTP_PORT=587' 'SMTP_USER=alerts@example.com' \
  'SMTP_PASSWORD=dummy' 'ALERT_EMAIL_TO=ops@example.com' \
  'TELEGRAM_BOT_TOKEN=123456:dummy' 'TELEGRAM_CHAT_ID=123456' \
  'HEALTHCHECKS_PING_URL=https://hc-ping.com/dummy'
do
  var="${kv%%=*}"; val="${kv#*=}"
  esc="$(printf '%s' "$val" | sed -e 's/[\/&]/\\&/g')"
  sed -i "s/\${${var}}/${esc}/g" /tmp/alertmanager-test.yml
done
grep -c '\${' /tmp/alertmanager-test.yml || echo "0 placeholders por preencher ✅"
```

Run (PowerShell):

```powershell
docker run --rm -v "$env:TEMP\..\..\..\..\tmp\alertmanager-test.yml:/etc/alertmanager/alertmanager.yml:ro" --entrypoint amtool prom/alertmanager:v0.27.0 check-config /etc/alertmanager/alertmanager.yml
```

Nota: no Git Bash `/tmp` é o tmp do MSYS — em PowerShell usar o caminho real: `docker run --rm -v "C:\Program Files\Git\tmp\alertmanager-test.yml:...`. Se o caminho variar, escrever o render directamente para `$env:TEMP` no passo Bash (`/c/Users/PLACID~1/AppData/Local/Temp/alertmanager-test.yml`) e montar `"$env:TEMP\alertmanager-test.yml"`.

Expected: `Checking '/etc/alertmanager/alertmanager.yml'  SUCCESS` com 4 receivers.

- [ ] **Step 3: Commit**

```bash
git add ops/monitoring/alertmanager.yml.tpl
git commit --no-verify -m "feat(alerts): template do Alertmanager com routing por severidade e dead-man"
```

---

### Task 3: Compose + deploy.sh (render de segredos) + gitignore + env example

**Files:**
- Modify: `ops/docker-compose.prod.yml` (acrescenta serviços `prometheus` e `alertmanager`)
- Modify: `ops/deploy/deploy.sh` (gera `metrics_token` e `alertmanager.yml` antes do `up`)
- Modify: `.gitignore`
- Modify: `ops/.env.production.example`

**Interfaces:**
- Consumes: `prometheus.yml`/`alert-rules.yml` (Task 1), `alertmanager.yml.tpl` (Task 2).
- Produces: serviços `innova-prometheus` (UI em `127.0.0.1:9090`) e `innova-alertmanager` (UI em `127.0.0.1:9093`); `deploy.sh` continua com a mesma assinatura `deploy.sh <tag>`.

- [ ] **Step 1: Acrescentar os serviços ao `ops/docker-compose.prod.yml`**

Acrescentar antes do bloco `volumes:` (e acrescentar os dois volumes novos):

```yaml
  # ─── Monitorização (regra 9) — sem portas públicas; UI só via túnel SSH ───
  prometheus:
    image: prom/prometheus:v2.53.0
    container_name: innova-prometheus
    command:
      - '--config.file=/etc/prometheus/prometheus.yml'
      - '--storage.tsdb.retention.time=15d'
    volumes:
      - ./monitoring/prometheus.yml:/etc/prometheus/prometheus.yml:ro
      - ./monitoring/alert-rules.yml:/etc/prometheus/alert-rules.yml:ro
      - ./monitoring/metrics_token:/etc/prometheus/secrets/metrics_token:ro
      - prometheus-data:/prometheus
    ports:
      - '127.0.0.1:9090:9090'
    depends_on:
      - app
    restart: unless-stopped

  alertmanager:
    image: prom/alertmanager:v0.27.0
    container_name: innova-alertmanager
    volumes:
      - ./monitoring/alertmanager.yml:/etc/alertmanager/alertmanager.yml:ro
      - alertmanager-data:/alertmanager
    ports:
      - '127.0.0.1:9093:9093'
    restart: unless-stopped
```

Bloco `volumes:` final do ficheiro passa a:

```yaml
volumes:
  redis-data:
  prometheus-data:
  alertmanager-data:
```

- [ ] **Step 2: Acrescentar o render de monitorização ao `ops/deploy/deploy.sh`**

Inserir depois da linha `echo "$TAG" > current_tag` e antes de `echo "▶ deploy da tag: $TAG"`:

```bash
# ─── Monitorização (regra 9): gerar segredos a partir do .env.production ─────
# Prometheus/Alertmanager não expandem env vars — renderizamos aqui.
env_val() { grep -E "^$1=" .env.production | head -1 | cut -d= -f2-; }

echo "▶ a renderizar configuração de monitorização"
printf '%s' "$(env_val METRICS_TOKEN)" > monitoring/metrics_token
chmod 600 monitoring/metrics_token

cp monitoring/alertmanager.yml.tpl monitoring/alertmanager.yml
for var in SMTP_HOST SMTP_PORT SMTP_USER SMTP_PASSWORD ALERT_EMAIL_TO \
           TELEGRAM_BOT_TOKEN TELEGRAM_CHAT_ID HEALTHCHECKS_PING_URL; do
  val="$(env_val "$var" | sed -e 's/[\/&]/\\&/g')"
  sed -i "s/\${${var}}/${val}/g" monitoring/alertmanager.yml
done
chmod 600 monitoring/alertmanager.yml

if grep -q '\${' monitoring/alertmanager.yml; then
  echo "❌ alertmanager.yml com placeholders por preencher — completar o .env.production"
  exit 1
fi
```

E inserir depois de `IMAGE_TAG="$TAG" docker compose -f "$COMPOSE_FILE" up -d`:

```bash
# configs de monitorização são bind-mounts — reiniciar para recarregar
IMAGE_TAG="$TAG" docker compose -f "$COMPOSE_FILE" restart prometheus alertmanager
```

- [ ] **Step 3: `.gitignore` — artefactos renderizados**

Acrescentar ao bloco de deploy existente no fim do `.gitignore`:

```
ops/monitoring/alertmanager.yml
ops/monitoring/metrics_token
```

- [ ] **Step 4: Acrescentar ao `ops/.env.production.example`**

Acrescentar no fim:

```bash
# ─── Alertas (regra 9) — Alertmanager: email + Telegram + dead-man ───
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=alerts@example.com
SMTP_PASSWORD=CHANGE_ME
ALERT_EMAIL_TO=ops@example.com
# mesmo bot das notificações de deploy (deploy.yml)
TELEGRAM_BOT_TOKEN=CHANGE_ME
TELEGRAM_CHAT_ID=CHANGE_ME
# URL de ping do check no healthchecks.io (dead-man externo — ver docs/deploy/alerting.md)
HEALTHCHECKS_PING_URL=https://hc-ping.com/CHANGE_ME
```

- [ ] **Step 5: Validar sintaxe (compose + bash)**

Run (Bash):

```bash
sed -i 's/\r$//' ops/deploy/deploy.sh
bash -n ops/deploy/deploy.sh && echo "sintaxe OK"
```

Run (PowerShell — o compose exige os ficheiros montados; criar os renderizados vazios se não existirem):

```powershell
if (-not (Test-Path ops\monitoring\metrics_token)) { "dummy" | Out-File -Encoding ascii ops\monitoring\metrics_token }
if (-not (Test-Path ops\monitoring\alertmanager.yml)) { Copy-Item ops\monitoring\alertmanager.yml.tpl ops\monitoring\alertmanager.yml }
docker compose -f ops/docker-compose.prod.yml config --quiet; if ($?) { "OK" }
```

Expected: `sintaxe OK` e `OK`.

- [ ] **Step 6: Commit**

```bash
git add ops/docker-compose.prod.yml ops/deploy/deploy.sh .gitignore ops/.env.production.example
git commit --no-verify -m "feat(alerts): prometheus+alertmanager no compose e render de segredos no deploy"
```

---

### Task 4: CI — validação promtool/amtool no quality.yml + monitoring no scp do deploy.yml

**Files:**
- Modify: `.github/workflows/quality.yml` (novo passo de validação)
- Modify: `.github/workflows/deploy.yml` (scp passa a copiar `ops/monitoring/*`)

**Interfaces:**
- Consumes: ficheiros de `ops/monitoring/` (Tasks 1–2).
- Produces: check `quality` chumba com YAML/PromQL inválido; o workflow de deploy passa a levar as configs de monitorização para `/opt/innova/monitoring/`.

- [ ] **Step 1: Novo passo no `quality.yml`**

Inserir depois do passo `Verificar formatação` (antes do `Build`):

```yaml
      - name: Validar configuração de monitorização (regra 9)
        # Barato (~segundos). promtool valida config+regras; amtool valida o
        # template renderizado com valores dummy (envsubst existe no runner).
        run: |
          docker run --rm -v "$PWD/ops/monitoring/alert-rules.yml:/cfg/alert-rules.yml:ro" \
            --entrypoint promtool prom/prometheus:v2.53.0 check rules /cfg/alert-rules.yml
          echo dummy > /tmp/metrics_token
          docker run --rm \
            -v "$PWD/ops/monitoring/prometheus.yml:/etc/prometheus/prometheus.yml:ro" \
            -v "$PWD/ops/monitoring/alert-rules.yml:/etc/prometheus/alert-rules.yml:ro" \
            -v /tmp/metrics_token:/etc/prometheus/secrets/metrics_token:ro \
            --entrypoint promtool prom/prometheus:v2.53.0 check config /etc/prometheus/prometheus.yml
          SMTP_HOST=smtp.example.com SMTP_PORT=587 SMTP_USER=alerts@example.com \
          SMTP_PASSWORD=dummy ALERT_EMAIL_TO=ops@example.com \
          TELEGRAM_BOT_TOKEN=123456:dummy TELEGRAM_CHAT_ID=123456 \
          HEALTHCHECKS_PING_URL=https://hc-ping.com/dummy \
            envsubst < ops/monitoring/alertmanager.yml.tpl > /tmp/alertmanager.yml
          docker run --rm -v /tmp/alertmanager.yml:/etc/alertmanager/alertmanager.yml:ro \
            --entrypoint amtool prom/alertmanager:v0.27.0 check-config /etc/alertmanager/alertmanager.yml
```

Nota (desvio consciente da spec): a spec pedia path filter `ops/monitoring/**`; como o passo custa segundos e o path filter num job único exigiria `dorny/paths-filter`, corre sempre — mais simples e valida sempre.

- [ ] **Step 2: Actualizar o scp do `deploy.yml`**

No passo `Copiar artefactos de deploy para o VPS`, substituir a linha `source:` por:

```yaml
          source: 'ops/docker-compose.prod.yml,ops/deploy/deploy.sh,ops/deploy/rollback.sh,ops/monitoring/prometheus.yml,ops/monitoring/alert-rules.yml,ops/monitoring/alertmanager.yml.tpl'
```

- [ ] **Step 3: Validar os workflows com actionlint**

Run (PowerShell):

```powershell
docker run --rm -v "${PWD}:/repo" -w /repo rhysd/actionlint:latest -color .github/workflows/quality.yml .github/workflows/deploy.yml
```

Expected: exit 0, sem erros.

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/quality.yml .github/workflows/deploy.yml
git commit --no-verify -m "ci(alerts): valida promtool/amtool no quality e copia monitoring no deploy"
```

---

### Task 5: Documentação — alerting.md + ponteiro no runbook

**Files:**
- Create: `docs/deploy/alerting.md`
- Modify: `docs/deploy/runbook.md` (link no topo)

- [ ] **Step 1: Criar `docs/deploy/alerting.md`**

````markdown
# Alertas — Prometheus + Alertmanager (regra 9)

> Stack no mesmo compose de produção (`ops/docker-compose.prod.yml`):
> Prometheus faz scrape de `app:4000/metrics` (bearer token) a cada 15s e avalia
> `ops/monitoring/alert-rules.yml`; o Alertmanager entrega por severidade.
> Deploy/segredos: o `deploy.sh` renderiza `alertmanager.yml` e `metrics_token`
> a partir do `.env.production` — nada disto é commitado.

## Routing

| Severidade | Canal |
|---|---|
| critical (`AppDown`, `HighErrorRate`) | email + Telegram |
| warning (`HighLatencyP95`, `SlowDbQueries`, `EventLoopLag`, `HighMemory`) | Telegram |
| info (`LowCacheHitRate`) | só UI do Alertmanager |
| `Watchdog` (dead-man) | heartbeat → healthchecks.io |

`repeat_interval: 4h`; agrupamento por `alertname`.

## Mudar um threshold (sem redeploy da app)

1. Editar `ops/monitoring/alert-rules.yml` (expr/`for:`) num PR normal — o CI
   valida com `promtool`.
2. Merge → o próximo deploy copia o ficheiro e reinicia o Prometheus.
   Urgente/no VPS: editar `/opt/innova/monitoring/alert-rules.yml` e
   `docker compose -f /opt/innova/docker-compose.prod.yml restart prometheus`
   (alinhar o repo a seguir, senão o próximo deploy reverte).

## UIs (sem porta pública — túnel SSH)

```bash
ssh -L 9090:127.0.0.1:9090 -L 9093:127.0.0.1:9093 deploy@<HOST>
# Prometheus: http://localhost:9090  |  Alertmanager: http://localhost:9093
```

## Dead-man's switch (healthchecks.io)

1. Criar conta grátis em https://healthchecks.io → novo check "innova-watchdog".
2. Configurar: Period = 5 min, Grace = 5 min; canais de notificação (email e/ou
   Telegram) do lado do healthchecks.io.
3. Copiar a URL de ping para `HEALTHCHECKS_PING_URL` no `/opt/innova/.env.production`.
4. Fluxo: o alerta `Watchdog` dispara sempre → o Alertmanager faz POST à URL a
   cada ~2m → se os pings pararem (VPS/stack morto), o healthchecks.io notifica
   de fora. Testar: suspender o Alertmanager (`docker pause innova-alertmanager`)
   → em ~10m chega a notificação externa → `docker unpause innova-alertmanager`.

## Silenciar um alerta

UI do Alertmanager (via túnel) → alerta → "Silence" (com comentário e duração),
ou por CLI:

```bash
docker exec innova-alertmanager amtool silence add alertname=HighLatencyP95 \
  --comment "deploy de migração pesada" --duration 2h --alertmanager.url http://localhost:9093
```

## Teste de ponta a ponta (critério de aceitação)

Local (sem segredos reais — verifica disparo + routing + heartbeat):

```bash
# 1. Stack local (ver runbook §7 para o ops/.env.production local); no .env local:
#    HEALTHCHECKS_PING_URL=http://host.docker.internal:9099/ping
node -e "require('http').createServer((q,s)=>{console.log(new Date().toISOString(),q.method,q.url);s.end('ok')}).listen(9099)" &
bash ops/deploy/deploy.sh local-v1

# 2. Heartbeat: em <2m aparecem POSTs /ping no listener (Watchdog → webhook OK)
# 3. AppDown: docker stop innova-app → ~1m30 depois:
curl -s http://localhost:9093/api/v2/alerts | grep -o '"alertname":"AppDown"'
# 4. Recuperar: docker start innova-app
```

Em produção (com segredos reais): repetir o passo 3 — o email e a mensagem
Telegram têm de chegar; e o teste de suspensão do dead-man (secção acima).

## Custos de RAM

Prometheus + Alertmanager ≈ 200–400 MB — já contemplado no sizing do runbook.
````

- [ ] **Step 2: Link no `docs/deploy/runbook.md`**

Na blockquote do topo, acrescentar ao fim da última linha do parágrafo:

```markdown
> Alertas e monitorização (regra 9): ver `docs/deploy/alerting.md`.
```

- [ ] **Step 3: Commit**

```bash
git add docs/deploy/alerting.md docs/deploy/runbook.md
git commit --no-verify -m "docs(alerts): guia de operacao de alertas e dead-man switch"
```

---

### Task 6: Ensaio local ponta-a-ponta (critério de aceitação)

**Files:**
- Nenhum novo (correcções se o ensaio falhar).

Pré-requisitos: imagem `innova-api:local` (regra 10; reconstruir com `docker build -t innova-api:local .` se já não existir), `ops/.env.production` local (runbook §7) **acrescentando** as vars novas:

```bash
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=alerts@example.com
SMTP_PASSWORD=dummy
ALERT_EMAIL_TO=ops@example.com
TELEGRAM_BOT_TOKEN=123456:dummy
TELEGRAM_CHAT_ID=123456
HEALTHCHECKS_PING_URL=http://host.docker.internal:9099/ping
```

- [ ] **Step 1: Listener de heartbeat local (background)**

Run (PowerShell, em background): `node -e "require('http').createServer((q,s)=>{console.log(new Date().toISOString(),q.method,q.url);s.end('ok')}).listen(9099)"`

- [ ] **Step 2: Subir o stack via deploy.sh**

Run (Bash):

```bash
docker tag innova-api:local ghcr.io/tututazeni-spec/tututazeni-backend:local-v1
bash ops/deploy/deploy.sh local-v1
```

Expected: `✅ app saudável com a tag local-v1`; containers `innova-app`, `innova-redis-prod`, `innova-prometheus`, `innova-alertmanager` a correr; `ops/monitoring/alertmanager.yml` e `metrics_token` gerados.

- [ ] **Step 3: Scrape a funcionar (token aceite)**

Run (Bash): `curl -s http://localhost:9090/api/v1/targets | grep -o '"health":"[a-z]*"'`
Expected: `"health":"up"` (se `down` com 401/403: token mal gerado — ver `monitoring/metrics_token`).

- [ ] **Step 4: Métrica do event loop existe**

Run (Bash): `curl -s 'http://localhost:9090/api/v1/query?query=nodejs_eventloop_lag_p90_seconds' | grep -c '"__name__"'`
Expected: ≥ 1. Se 0: trocar a expr do `EventLoopLag` para `nodejs_eventloop_lag_seconds > 0.5` (mesma task, commit de correcção).

- [ ] **Step 5: Watchdog a disparar + heartbeat a chegar**

Run (Bash): `curl -s http://localhost:9093/api/v2/alerts | grep -o '"alertname":"Watchdog"'`
Expected: `"alertname":"Watchdog"`; e no listener do Step 1 aparecem POSTs `/ping` (primeiro em <1m, repetidos ~2m).

- [ ] **Step 6: AppDown dispara com a app parada**

Run (Bash):

```bash
docker stop innova-app
sleep 100
curl -s http://localhost:9093/api/v2/alerts | grep -o '"alertname":"AppDown"'
docker start innova-app
```

Expected: `"alertname":"AppDown"` (up==0 durante 1m + margem de scrape).

- [ ] **Step 7: Limpar o ensaio**

Run (Bash):

```bash
cd ops && IMAGE_TAG=local-v1 docker compose -f docker-compose.prod.yml down && cd ..
rm -f ops/current_tag ops/previous_tag ops/monitoring/alertmanager.yml ops/monitoring/metrics_token
```

Parar o listener node do Step 1 (TaskStop / fechar o processo).

- [ ] **Step 8: Commit de eventuais correcções**

```bash
git status --short   # só commitar se o ensaio tiver exigido ajustes
git add -u && git commit --no-verify -m "fix(alerts): ajustes do ensaio local do stack de alertas"
```

---

### Task 7: Ship

**Política (2026-07-08):** sem lint/format/build locais; depois de armar o auto-merge, NÃO acompanhar o CI.

- [ ] **Step 1: Rever o diff**

Run: `git log --oneline feat/observability-deploy-rollback..HEAD && git diff feat/observability-deploy-rollback --stat`
Expected: commits das Tasks 1–6 + plano; `ops/monitoring/alertmanager.yml` e `metrics_token` NÃO aparecem.

- [ ] **Step 2: Base do PR**

Run: `gh pr view 16 --json state,mergedAt`
- Se merged: `git fetch origin main && git rebase origin/main` (o rebase deve ser limpo — os commits da regra 10 desaparecem do branch).
- Se ainda aberto: push na mesma; o PR 2 mostra os commits do PR 1 até ao merge dele (empilhado). Base = `main` em ambos os casos.

- [ ] **Step 3: Push + PR + auto-merge (e parar aí)**

```bash
git push --no-verify -u origin feat/observability-alerts
gh pr create --title "feat(alerts): stack de alertas Prometheus+Alertmanager com dead-man switch (regra 9)" --body "<resumo: stack no compose de produção, 8 alertas as-code, routing critical→email+Telegram / warning→Telegram / info→UI, heartbeat healthchecks.io, validação promtool/amtool no CI, ensaio local executado. Spec secção PR 2. Footer standard.>"
gh pr merge --auto --squash --delete-branch
```

Terminar o fluxo aqui e reportar que o merge acontece sozinho com o CI verde.

---

## Self-review (feito na escrita do plano)

- **Cobertura da spec (secção PR 2):** prometheus.yml com bearer token+scrape 15s+retenção 15d ✅ (Task 1+3), as 8 regras da tabela ✅ (Task 1), alertmanager com routing por severidade+repeat 4h+receivers email/telegram/webhook ✅ (Task 2), template+render de segredos ✅ (Tasks 2–3), sem portas públicas (loopback+túnel) ✅ (Task 3), validação em CI ✅ (Task 4), alerting.md com thresholds/testes/silêncios/healthchecks.io ✅ (Task 5), teste E2E local ✅ (Task 6).
- **Desvios conscientes:** (1) validação no CI corre sempre em vez de path filter — passo barato, evita `dorny/paths-filter`; (2) render com `sed` no `deploy.sh` em vez de `envsubst` no entrypoint — a imagem `prom/alertmanager` (busybox) não tem `envsubst`, e o render no deploy é portátil (Git Bash + VPS); o CI usa `envsubst` real no runner; (3) entrega real por email/Telegram só verificável com segredos reais — o ensaio local prova disparo+routing+heartbeat, a entrega testa-se na activação do VPS (documentado no alerting.md).
- **Consistência de nomes:** job `innova-app` (prometheus.yml ↔ expr `up{job="innova-app"}`); containers `innova-prometheus`/`innova-alertmanager`; caminhos `/etc/prometheus/*` e `/etc/alertmanager/alertmanager.yml` iguais no compose, prometheus.yml e validações; as 8 vars do template iguais no tpl, deploy.sh, quality.yml e .env.production.example; métricas com os nomes reais de `src/metrics/metrics.module.ts`.
- **Placeholders:** nenhum — todos os ficheiros têm conteúdo completo.
