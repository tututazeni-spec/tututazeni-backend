# Observabilidade — logs, health, métricas e alertas

Resumo operacional das regras de monitorização (request id, stack trace, logs JSON,
health, queries, cache, métricas, alertas, deploy). Estado real na plataforma.

## Logs estruturados (JSON) em produção

- Biblioteca: `nestjs-pino` (`src/app.module.ts`). **Em produção e em teste** o transporte
  `pino-pretty` fica desligado → cada linha de log é **um objecto JSON** em stdout
  (`NODE_ENV=production`). Em desenvolvimento sai texto colorido legível.
- Nível: variável `LOG_LEVEL` (omissão `info`; `debug` mostra todas as queries com tempo).
- **Log de acesso:** uma linha `GET /rota 200` por pedido (`req.method`, `req.path` sem query, `res.statusCode`, `responseTime`, `route`, `reqId`, `userId`), emitida no fim da resposta — inclui 401/403/404. Nível `info` (2xx/3xx), `warn` (4xx), `error` (5xx). `/health` e `/metrics` ficam de fora.
- Campos sempre presentes: `level`, `time`, `msg`, `reqId` (+ `userId` quando autenticado e `action` = `Controller.handler` da rota, ex. `CoursesController.findAll`,
  injectados por `getRequestContext()` via AsyncLocalStorage — também nos `new Logger()`).
- Dados sensíveis removidos pelo `redact` (`authorization`, `cookie`, `password`, `token`, `nif`, `nib`…).
- Exemplo de pesquisa por pedido: `jq 'select(.reqId=="<id>")'`.

### Request ID
Cada pedido recebe `x-request-id` (reutiliza o do cliente/proxy ou gera UUID). Volta no header
da resposta e no campo `requestId` do corpo dos erros — é o fio condutor entre cliente, log e suporte.

### Stack trace
`AllExceptionsFilter` regista o `err.stack` completo em **todos** os erros (4xx em `warn`,
5xx em `error`). O stack **nunca** vai na resposta ao cliente.

## Health (`/health`, `/health/live`, `/health/ready`)

| Rota | Função |
|---|---|
| `/health`, `/health/live` | Liveness — sempre 200 enquanto o processo vive (`uptime`, `version`=`BUILD_SHA`) |
| `/health/ready` | Readiness detalhado. **Só o Postgres controla o 503.** |

`/health/ready` devolve em `details`: `postgres`, `redis`, `queues` (audit/email/notifications/webhooks
com waiting/active/failed), `disk` (% livre), `memory` (heap vs. limite) e `eventLoop` (p99).
Cada um tem `status` (`up`/`down`) e `level` (`up`/`degraded`/`down`). Limiares:
disco <15 % degraded, <5 % down; heap ≥85 % degraded, ≥95 % down; event loop p99 ≥200 ms;
≥50 jobs falhados acumulados nas filas.

## Métricas e alertas

- `GET /metrics` (Prometheus, exige `METRICS_TOKEN`): `http_request_duration_seconds`,
  `prisma_query_duration_seconds`, `cache_requests_total{result=hit|miss}` + métricas padrão de CPU/memória/event loop.
- Regras de alerta: `ops/monitoring/alert-rules.yml`; routing: `ops/monitoring/alertmanager.yml.tpl`.
- **Stack local** (Prometheus 9090 + Alertmanager 9093, sem email/Telegram):
  `docker compose -f ops/monitoring/local/docker-compose.monitoring.local.yml up -d`.
  O ficheiro `ops/monitoring/local/metrics_token` (gitignored) tem de ter o valor de `METRICS_TOKEN` do `.env`.

## Deploy e rollback

Destino de produção: **VPS com Docker Compose** (`ops/docker-compose.prod.yml`), decisão confirmada em 2026-10-27.
`.github/workflows/deploy.yml`:
`build → scan Trivy → [staging] → deploy (SSH + deploy.sh rolling) → health gate (/health/ready) → smoke (npm run test:regression) → tag stable`.
Falha em deploy/verify → `rollback.sh` repõe as tags anteriores.

- **Modo SSH (principal):** secrets `DEPLOY_HOST`, `DEPLOY_USER`, `DEPLOY_SSH_KEY`. O workflow copia `ops/` para `/opt/innova` e corre `deploy.sh`.
- **Modo webhook (alternativa, plataformas geridas):** `DEPLOY_WEBHOOK_URL` + `ROLLBACK_WEBHOOK_URL`; o receptor publica a tag e repõe `stable`. Só é usado se não houver `DEPLOY_HOST`.
- **Staging (opcional):** `STAGING_HOST`, `STAGING_USER`, `STAGING_SSH_KEY`, `STAGING_SMOKE_BASE_URL`, `STAGING_SMOKE_*`. Se existir, a produção só avança depois de o staging passar.
- Comuns: `SMOKE_BASE_URL`, `SMOKE_FRONTEND_URL` (opcional), `SMOKE_EMPLOYEE_*`, `SMOKE_RH_*`, `SMOKE_COURSE_ID`, `TELEGRAM_*` (opcional).

## Grafana, Loki e erros de aplicação (opcionais)

- `ENABLE_OBSERVABILITY=true` no `.env.production` → o `deploy.sh` sobe Grafana + Loki + Promtail (perfil `observability`, ≈ +640 MB).
  Grafana em `127.0.0.1:3001` (túnel SSH), datasources e o dashboard «INNOVA — API» já provisionados.
  O Promtail lê os ficheiros json-file do Docker (sem `docker.sock`); o serviço vem do label `com.docker.compose.service`.
- `SENTRY_DSN` definido → erros 5xx vão para o Sentry (`src/common/observability/sentry.ts`). Sem DSN é no-op.
  Cookies, cabeçalhos, corpos e query params estão desligados (dados pessoais de RH).
